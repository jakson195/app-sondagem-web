import {
  isCancelPhrase,
  isConfirmPhrase,
  isGreetingPhrase,
  isUndoPhrase,
  parseLoteamentoAssistantCommand,
} from "./parse";
import { parseLocalCadCommand } from "@/lib/rtk-validation/cad/local-command-parser";
import type { CadAiCommand, CadAiHistoryMessage, CadAiProjectContext } from "@/lib/rtk-validation/cad/ai-command-types";
import { detectCadContextLevel, type CadContextLevel } from "./minimal-context";
import { classifyCadIntent, commandFromIntent, logCadAiIntent, validateCadCommand, type CadStructuredIntent } from "./intent";
import type { CadConversationState } from "./conversation-state";
import {
  cancelPendingMessage,
  createTopicSwitchPending,
  logPendingAction,
  pendingRedistributionOf,
  pendingStillOpenMessage,
  resolvePendingUserMessage,
  understoodRedistribution,
  topicSwitchQuestion,
  type CadPendingAction,
} from "./pending-action";

export type CadRouterDecision = {
  route: "local" | "openai";
  contextLevel: CadContextLevel;
  commands: CadAiCommand[];
  reason: string;
  resposta?: string;
  intent?: CadStructuredIntent;
  pendingAction?: CadPendingAction | null;
  applyImmediately?: boolean;
  incomingCommand?: string;
  openaiCalled?: false;
};

const HELP_RE =
  /^(?:o que voc[eê] (?:consegue|pode) fazer|quais comandos?(?: posso usar)?|ajuda|help|o que voc[eê] faz)(?:\s*[.?!]*)?$/i;

const SELECT_RE = /^(?:selecion(?:ar|e)|mostrar|mostre|exiba|ver|zoom(?:\s+no|\s+para)?)\s+(?:o\s+)?lote\s+([A-Za-z0-9-–—]+)(?:\s*[.!]*)?$/i;
const SHOW_AREA_RE = /^(?:mostrar|mostre|exiba)\s+(?:a\s+)?[aá]rea(?:\s*[.!]*)?$/i;
const CLOSE_RE = /^(?:fechar|fecha|sair|encerrar)(?:\s*[.!]*)?$/i;
const APPLY_RE = /^(?:aplicar|aplica)(?:\s*[.!]*)?$/i;

const COMPLEX_FORCE_OPENAI =
  /um pouco|aproveit|reorganiz|completar? essa|complete essa|manten(?:ha|do) acesso|pr[oó]ximos de|reprojet\w*.*(verde|institucional|rua)|deixa esse lote/i;

const LOCAL_QUERY_ACTIONS = new Set([
  "consultar_lote",
  "consultar_lotes",
  "consultar_quadra",
  "consultar_quadras",
  "consultar_projeto",
  "calcular_area_remanescente",
  "calcular_testada",
  "medir_area",
  "zoom_objeto",
  "selecionar",
  "aplicar_alteracao",
  "desfazer_alteracao",
]);

const HIGH_CONFIDENCE_MUTATE = new Set(["ajustar_lote"]);

function helpCommand(): CadAiCommand {
  return {
    acao: "desconhecido",
    resposta:
      "Posso consultar áreas, selecionar lotes, ajustar um lote com área explícita, desfazer/aplicar e, para pedidos em linguagem natural, chamar o motor CAD. Exemplos: qual a área do lote 01? · alterar lote 01 para 500m² · reprojete o loteamento.",
  };
}

function lookupLot(context: CadAiProjectContext, ref: string) {
  const lots = context.loteamento?.lotes ?? [];
  const norm = ref.replace(/^lote\s+/i, "").trim().toLowerCase();
  return lots.find((lot) => {
    const id = lot.id.toLowerCase();
    const num = lot.id.split("-").pop()?.toLowerCase();
    return id === norm || id.endsWith(`-${norm.padStart(2, "0")}`) || num === norm.padStart(2, "0") || num === norm;
  });
}

function fillQueryAnswer(command: CadAiCommand, context: CadAiProjectContext): CadAiCommand {
  if (command.acao === "consultar_lote" && command.lote) {
    const lot = lookupLot(context, command.lote);
    if (lot) {
      return {
        ...command,
        resposta: `Lote ${lot.id} (quadra ${lot.quadra}): ${lot.area} m², testada ${lot.testada} m.`,
      };
    }
  }
  if (command.acao === "consultar_quadra" && command.quadra) {
    const row = context.loteamento?.quadras.find((item) => item.id.toUpperCase() === command.quadra?.toUpperCase());
    if (row) {
      return {
        ...command,
        resposta: `Quadra ${row.id}: ${row.area} m², ${row.quantidadeLotes} lote(s), média ${row.areaMedia} m².`,
      };
    }
  }
  if (command.acao === "consultar_lotes" || command.acao === "consultar_projeto") {
    const n = context.loteamento?.lotes.length ?? 0;
    if (n && /quantos\s+lotes/i.test(command.resposta ?? "") === false) {
      return command;
    }
  }
  return command;
}

function selectedLotQuery(command: string, context: CadAiProjectContext): CadAiCommand[] | null {
  if (!/qual lote est[aá] selecionado/i.test(command)) return null;
  const selected = context.loteamento?.lotes.find((lot) => lot.id === context.selectedEntityId);
  const summary = selected
    ? `Lote selecionado: ${selected.id} (quadra ${selected.quadra}), ${selected.area} m².`
    : context.selectedEntitySummary
      ? `Seleção atual: ${context.selectedEntitySummary}.`
      : "Nenhum lote selecionado.";
  return [{ acao: "consultar_projeto", resposta: summary }];
}

function countLotsQuery(command: string, context: CadAiProjectContext): CadAiCommand[] | null {
  if (!/^quantos\s+lotes?\s+(?:existem|h[aá]|tem)(?:\s+no\s+projeto)?\??$/i.test(command.trim())) return null;
  const n = context.loteamento?.lotes.length ?? 0;
  return [{ acao: "consultar_lotes", resposta: n ? `Existem ${n} lote(s) no projeto.` : "Ainda não há lotes no desenho." }];
}

function redistributionCommand(action: NonNullable<ReturnType<typeof pendingRedistributionOf>>): CadAiCommand {
  return {
    acao: "ajustar_lote",
    lote: action.targetLot,
    area_alvo_m2: action.targetArea,
    scope: "local_redistribution",
    applyImmediately: true,
    resposta: understoodRedistribution(action),
  };
}

export function cadCommandRouter(
  command: string,
  context: CadAiProjectContext,
  history?: CadAiHistoryMessage[],
  state?: CadConversationState | null,
): CadRouterDecision {
  const text = command.trim();
  const contextLevel = detectCadContextLevel(text);
  const classified = classifyCadIntent(text, context, history, state);

  if (!text) {
    return { route: "local", contextLevel: 0, commands: [], reason: "empty" };
  }

  if (state?.pendingAction) {
    const resolution = resolvePendingUserMessage(text, state.pendingAction);
    if (resolution.kind === "complete_modify") {
      return {
        route: "local",
        contextLevel: 1,
        commands: [resolution.command],
        reason: "pending-modify-complete",
        pendingAction: null,
      };
    }
    if (resolution.kind === "update_modify") {
      return {
        route: "local",
        contextLevel: 1,
        commands: [],
        reason: "pending-modify-update",
        resposta: pendingStillOpenMessage(resolution.action),
        pendingAction: resolution.action,
      };
    }
    if (resolution.kind === "confirm" || resolution.kind === "continue_pending") {
      const action = resolution.action;
      logPendingAction("user response", text);
      logPendingAction("pendingAction resolved", action.type);
      logPendingAction("executing", "redistribute_lots");
      return {
        route: "local",
        contextLevel: 1,
        commands: [redistributionCommand(action)],
        reason: "pending-confirm",
        resposta: understoodRedistribution(action),
        pendingAction: null,
        applyImmediately: true,
      };
    }
    if (resolution.kind === "cancel") {
      logPendingAction("user response", text);
      logPendingAction("pendingAction cleared");
      return {
        route: "local",
        contextLevel: 0,
        commands: [],
        reason: "pending-cancel",
        resposta: cancelPendingMessage(),
        pendingAction: null,
      };
    }
    if (resolution.kind === "switch_confirmed") {
      logPendingAction("user response", text);
      logPendingAction("pendingAction cleared");
      return {
        route: "local",
        contextLevel: 0,
        commands: [],
        reason: "pending-switch-confirmed",
        resposta: cancelPendingMessage(),
        pendingAction: null,
        incomingCommand: resolution.action.incomingCommand,
      };
    }
    if (resolution.kind === "topic_switch") {
      const next = createTopicSwitchPending(resolution.action, resolution.incomingCommand);
      logPendingAction("pendingAction created", next.type);
      return {
        route: "local",
        contextLevel: 0,
        commands: [],
        reason: "pending-topic-switch",
        resposta: topicSwitchQuestion(next),
        pendingAction: next,
      };
    }
    if (resolution.kind === "remind") {
      return {
        route: "local",
        contextLevel: 0,
        commands: [],
        reason: "pending-remind",
        resposta: pendingStillOpenMessage(resolution.action),
        pendingAction: resolution.action,
      };
    }
  }

  if (isGreetingPhrase(text) || HELP_RE.test(text)) {
    const greeting = isGreetingPhrase(text);
    return {
      route: "local",
      contextLevel: 0,
      commands: [],
      reason: "greeting-or-help",
      resposta: greeting
        ? "Olá. Posso ajudar com o loteamento, os lotes e o desenho CAD. O que você precisa?"
        : helpCommand().resposta,
    };
  }
  if (isUndoPhrase(text)) {
    return { route: "local", contextLevel: 0, commands: [{ acao: "desfazer_alteracao", resposta: "Desfazer a última alteração." }], reason: "undo" };
  }
  if (isConfirmPhrase(text) || APPLY_RE.test(text)) {
    return { route: "local", contextLevel: 0, commands: [{ acao: "aplicar_alteracao", resposta: "Aplicar a alteração pendente." }], reason: "apply" };
  }
  if (isCancelPhrase(text) || CLOSE_RE.test(text)) {
    return {
      route: "local",
      contextLevel: 0,
      commands: [],
      reason: "cancel",
      resposta: "Operação cancelada.",
    };
  }

  const select = text.match(SELECT_RE);
  if (select) {
    const lote = select[1];
    const zoom = /zoom|mostrar|mostre|exiba|ver/i.test(text);
    return {
      route: "local",
      contextLevel: 1,
      commands: [
        zoom
          ? { acao: "zoom_objeto", lote, resposta: `Mostrar o lote ${lote}.` }
          : { acao: "selecionar", lote, usarSelecao: false, resposta: `Selecionar o lote ${lote}.` },
      ],
      reason: "select-or-zoom",
    };
  }
  if (SHOW_AREA_RE.test(text)) {
    const lote = context.loteamento?.lotes.find((item) => item.id === context.selectedEntityId);
    return {
      route: "local",
      contextLevel: 1,
      commands: [{ acao: "medir_area", usarSelecao: true, resposta: lote ? `Área do lote ${lote.id}: ${lote.area} m².` : "Calcular a área da seleção." }],
      reason: "show-area",
    };
  }

  const selected = selectedLotQuery(text, context);
  if (selected) return { route: "local", contextLevel: 1, commands: selected, reason: "selected-lot" };
  const counted = countLotsQuery(text, context);
  if (counted) return { route: "local", contextLevel: 1, commands: counted, reason: "count-lots" };

  if (
    classified.confidence === "high" &&
    (classified.intent === "renomear_quadra" ||
      classified.intent === "otimizar_quadra" ||
      classified.intent === "reprojetar_loteamento" ||
      classified.intent === "ajustar_lote" ||
      classified.intent === "consultar_lote" ||
      classified.intent === "consultar_quadra")
  ) {
    const cmd =
      classified.intent === "consultar_lote" || classified.intent === "consultar_quadra"
        ? fillQueryAnswer(commandFromIntent(classified), context)
        : commandFromIntent(classified);
    logCadAiIntent(classified, cmd.acao);
    return {
      route: "local",
      contextLevel: classified.entity === "projeto" ? 3 : classified.entity === "quadra" ? 2 : 1,
      commands: validateCadCommand([cmd]),
      reason: `intent-${classified.intent}`,
      resposta: cmd.resposta,
      intent: classified,
    };
  }

  if (COMPLEX_FORCE_OPENAI.test(text)) {
    return {
      route: "openai",
      contextLevel: Math.max(contextLevel, 1) as CadContextLevel,
      commands: [],
      reason: "complex-nl",
      intent: classified,
    };
  }

  const loteamento = parseLoteamentoAssistantCommand(text, context, history);
  if (loteamento?.length) {
    const first = loteamento[0];
    if (first.acao === "ajustar_lote" && classified.entity === "quadra") {
      const cmd = commandFromIntent({ ...classified, intent: "renomear_quadra", entity: "quadra", operation: "renomear" });
      logCadAiIntent(classified, "renomear_quadra");
      return {
        route: "local",
        contextLevel: 2,
        commands: [cmd],
        reason: "block-lote-on-quadra",
        resposta: cmd.resposta,
        intent: classified,
      };
    }
    if (LOCAL_QUERY_ACTIONS.has(first.acao)) {
      return {
        route: "local",
        contextLevel,
        commands: loteamento.map((cmd) => fillQueryAnswer(cmd, context)),
        reason: "local-query",
      };
    }
    if (first.acao === "ajustar_lote" && first.lote && first.area_alvo_m2 != null && loteamento.length === 1) {
      return { route: "local", contextLevel: 1, commands: validateCadCommand(loteamento), reason: "high-confidence-lot" };
    }
    return { route: "openai", contextLevel: Math.max(contextLevel, 2) as CadContextLevel, commands: [], reason: "complex-loteamento" };
  }

  const drawing = parseLocalCadCommand(text, context, history);
  if (drawing && HIGH_CONFIDENCE_MUTATE.has(drawing.acao)) {
    return { route: "local", contextLevel: 1, commands: [drawing], reason: "high-confidence-draw" };
  }
  if (drawing && LOCAL_QUERY_ACTIONS.has(drawing.acao)) {
    return { route: "local", contextLevel, commands: [fillQueryAnswer(drawing, context)], reason: "local-draw-query" };
  }

  return { route: "openai", contextLevel: Math.max(contextLevel, 1) as CadContextLevel, commands: [], reason: "openai-fallback" };
}
