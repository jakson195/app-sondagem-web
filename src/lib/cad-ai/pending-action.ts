import { isGreetingPhrase, isUndoPhrase } from "./parse";
import type { CadAiAction, CadAiCommand } from "@/lib/rtk-validation/cad/ai-command-types";
import { mergeModifyPending, parseModifyFollowUp, stillMissing } from "@/lib/rtk-validation/cad/modify-ai";

export type CadPendingActionType = "confirm_redistribution" | "confirm_topic_switch" | "pending_modify";

export type CadPendingRedistribution = {
  type: "confirm_redistribution";
  status: "pending";
  originalCommand: string;
  intent: "ajustar_lote";
  scope: "single_lot";
  targetLot: string;
  targetArea: number;
  allowRedistribution: boolean;
  affectedLots: string[];
  createdAt: string;
};

export type CadPendingTopicSwitch = {
  type: "confirm_topic_switch";
  status: "pending";
  incomingCommand: string;
  incomingSummary: string;
  previous: CadPendingRedistribution;
  createdAt: string;
};

export type CadPendingModify = {
  type: "pending_modify";
  status: "pending";
  action: CadAiAction;
  originalCommand: string;
  lote?: string;
  quadra?: string;
  entidade_id?: string;
  entidade_ids?: string[];
  collected: CadAiCommand;
  missing: string[];
  createdAt: string;
};

export type CadPendingAction = CadPendingRedistribution | CadPendingTopicSwitch | CadPendingModify;

export type PendingResolution =
  | { kind: "confirm"; action: CadPendingRedistribution }
  | { kind: "cancel"; action: CadPendingAction }
  | { kind: "switch_confirmed"; action: CadPendingTopicSwitch }
  | { kind: "continue_pending"; action: CadPendingRedistribution }
  | { kind: "topic_switch"; action: CadPendingRedistribution; incomingCommand: string }
  | { kind: "remind"; action: CadPendingAction }
  | { kind: "complete_modify"; action: CadPendingModify; command: CadAiCommand }
  | { kind: "update_modify"; action: CadPendingModify }
  | { kind: "none" };

function fold(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[?!.,;:]+$/g, "")
    .trim();
}

const AFFIRMATIVE_EXACT = new Set([
  "sim",
  "si",
  "ok",
  "okay",
  "pode",
  "pode ser",
  "pode aplicar",
  "pode fazer",
  "pode redistribuir",
  "pode ajustar",
  "sim pode",
  "sim, pode",
  "autorizo",
  "confirmo",
  "confirma",
  "confirmar",
  "confirmado",
  "aplica",
  "aplicar",
  "feito",
  "vai",
  "isso",
  "yes",
  "sim continuar",
  "sim, continuar",
]);

const AFFIRMATIVE_RE =
  /^(?:sim(?:\s*,?\s*(?:pode|pode fazer|pode redistribuir|pode ajustar|continuar|autorizo|confirmo)?)?|pode(?:\s+(?:fazer|ser|aplicar|redistribuir|ajustar))?|autorizo|confirmo|confirmado|ok(?:ay)?)$/i;

const NEGATIVE_RE =
  /^(?:nao(?:\s+(?:pode|quero|autorizo|autorizar|aplica))?|nao quero(?:.*)?|cancela(?:r)?|desiste|para|deixa como (?:esta|ta|est[aá])|nao autorizar|nao,?\s*cancela)$/i;

const NEGATIVE_CONTAINS_RE =
  /\b(?:cancela(?:r)?|nao quero|deixa como (?:esta|ta)|nao autoriz)/i;

const CONTINUE_PENDING_RE =
  /^(?:continuar(?: a)?(?: opera[cç][aã]o)?(?: pendente)?|seguir(?: com)?(?: a)?(?: opera[cç][aã]o)?(?: pendente)?|mant[eé]m(?: a)?(?: opera[cç][aã]o)?)$/i;

const NEW_COMMAND_RE =
  /\b(?:renomear|dar nome|nomear|identificar|alterar\s+lote|ajustar os lotes|reprojet|gerar\s+loteamento|qual a [aá]rea|selecionar\s+lote|otimiz(?:ar|e)|consultar|rotacion|gir[ae]|copie|espelh|estic|escal|offset|apar[ae]|estend|concord|chanfr|matriz|explod|unir|divid)\b/i;

export function isAffirmativeResponse(message: string): boolean {
  const raw = fold(message);
  if (!raw) return false;
  if (AFFIRMATIVE_EXACT.has(raw)) return true;
  if (AFFIRMATIVE_EXACT.has(raw.replace(/,/g, ""))) return true;
  return AFFIRMATIVE_RE.test(raw);
}

export function isNegativeResponse(message: string): boolean {
  const raw = fold(message);
  if (!raw) return false;
  if (isAffirmativeResponse(raw)) return false;
  if (NEGATIVE_RE.test(raw)) return true;
  if (raw.length <= 80 && NEGATIVE_CONTAINS_RE.test(raw) && !NEW_COMMAND_RE.test(raw)) return true;
  return false;
}

export function isContinuePendingPhrase(message: string): boolean {
  return CONTINUE_PENDING_RE.test(fold(message));
}

export function looksLikeNewCadCommand(message: string): boolean {
  const raw = fold(message);
  if (!raw) return false;
  if (isAffirmativeResponse(raw) || isNegativeResponse(raw) || isUndoPhrase(raw) || isGreetingPhrase(raw)) {
    return false;
  }
  if (isContinuePendingPhrase(raw)) return false;
  return NEW_COMMAND_RE.test(raw);
}

export function createRedistributionPending(input: {
  originalCommand: string;
  targetLot: string;
  targetArea: number;
  affectedLots?: string[];
}): CadPendingRedistribution {
  return {
    type: "confirm_redistribution",
    status: "pending",
    originalCommand: input.originalCommand,
    intent: "ajustar_lote",
    scope: "single_lot",
    targetLot: input.targetLot,
    targetArea: input.targetArea,
    allowRedistribution: false,
    affectedLots: input.affectedLots ?? [],
    createdAt: new Date().toISOString(),
  };
}

export function createTopicSwitchPending(
  previous: CadPendingRedistribution,
  incomingCommand: string,
): CadPendingTopicSwitch {
  return {
    type: "confirm_topic_switch",
    status: "pending",
    incomingCommand,
    incomingSummary: summarizeIncomingCommand(incomingCommand),
    previous,
    createdAt: new Date().toISOString(),
  };
}

export function summarizeIncomingCommand(text: string): string {
  const raw = text.trim();
  if (/renomear|dar nome|nomear/i.test(raw)) return "renomear as quadras";
  return raw.replace(/[.?!]+$/g, "").toLowerCase();
}

export function redistributionQuestion(action: CadPendingRedistribution): string {
  return `Não é possível ajustar o Lote ${action.targetLot} para ${action.targetArea} m² mantendo as demais geometrias intactas. Deseja permitir a redistribuição dos lotes afetados?`;
}

export function understoodRedistribution(action: CadPendingRedistribution): string {
  return `Entendido. Vou redistribuir os lotes afetados para tentar ajustar o Lote ${action.targetLot} para ${action.targetArea} m².`;
}

export function redistributionDoneMessage(action: CadPendingRedistribution, changedCount: number): string {
  return `Lote ${action.targetLot} ajustado para aproximadamente ${action.targetArea} m². Foram redistribuídos ${changedCount} lote${changedCount === 1 ? "" : "s"}.`;
}

export function cancelPendingMessage(): string {
  return "Operação cancelada. Nenhuma alteração foi aplicada.";
}

export function topicSwitchQuestion(action: CadPendingTopicSwitch): string {
  return `Existe uma alteração pendente para o Lote ${action.previous.targetLot}. Deseja cancelar essa operação e ${action.incomingSummary}?`;
}

export function pendingStillOpenMessage(action: CadPendingAction): string {
  if (action.type === "pending_modify") {
    return `A operação ${action.action} continua pendente. Informe: ${action.missing.join(", ")}.`;
  }
  const lot = action.type === "confirm_redistribution" ? action.targetLot : action.previous.targetLot;
  return `A alteração do Lote ${lot} continua pendente. Responda sim para redistribuir ou não para cancelar.`;
}

export function isCadPendingAction(value: unknown): value is CadPendingAction {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return type === "confirm_redistribution" || type === "confirm_topic_switch" || type === "pending_modify";
}

export function pendingRedistributionOf(action: CadPendingAction | null | undefined): CadPendingRedistribution | null {
  if (!action) return null;
  if (action.type === "confirm_redistribution") return action;
  if (action.type === "pending_modify") return null;
  return action.previous;
}

/** Prioridade: pendingAction → confirmação → cancelamento → novo comando → conversa geral. */
export function resolvePendingUserMessage(
  message: string,
  pending: CadPendingAction | null | undefined,
): PendingResolution {
  if (!pending) return { kind: "none" };
  const text = message.trim();
  if (!text) return { kind: "remind", action: pending };
  if (isUndoPhrase(text)) return { kind: "none" };

  if (pending.type === "pending_modify") {
    if (isNegativeResponse(text)) return { kind: "cancel", action: pending };
    const follow = parseModifyFollowUp(text);
    if (follow) {
      const command = mergeModifyPending(pending, follow);
      const missing = stillMissing(command, pending.missing);
      if (missing.length === 0) return { kind: "complete_modify", action: pending, command };
      return {
        kind: "update_modify",
        action: { ...pending, collected: command, missing },
      };
    }
    if (looksLikeNewCadCommand(text)) {
      return { kind: "none" };
    }
    return { kind: "remind", action: pending };
  }

  if (pending.type === "confirm_topic_switch") {
    if (isContinuePendingPhrase(text)) {
      return { kind: "continue_pending", action: pending.previous };
    }
    if (isAffirmativeResponse(text)) {
      return { kind: "switch_confirmed", action: pending };
    }
    if (isNegativeResponse(text)) {
      return { kind: "remind", action: pending.previous };
    }
    if (looksLikeNewCadCommand(text)) {
      return { kind: "topic_switch", action: pending.previous, incomingCommand: text };
    }
    return { kind: "remind", action: pending };
  }

  if (isContinuePendingPhrase(text) || isAffirmativeResponse(text)) {
    return { kind: "confirm", action: pending };
  }
  if (isNegativeResponse(text)) {
    return { kind: "cancel", action: pending };
  }
  if (looksLikeNewCadCommand(text)) {
    return { kind: "topic_switch", action: pending, incomingCommand: text };
  }
  if (isGreetingPhrase(text) || isUndoPhrase(text)) {
    return { kind: "remind", action: pending };
  }
  return { kind: "remind", action: pending };
}

export function logPendingAction(event: string, detail?: string): void {
  if (detail) {
    console.info(`[CAD AI]\n${event}:\n${detail}`);
    return;
  }
  console.info(`[CAD AI]\n${event}`);
}
