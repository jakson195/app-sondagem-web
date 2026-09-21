import type { CadAiCommand, CadAiHistoryMessage, CadAiProjectContext } from "@/lib/rtk-validation/cad/ai-command-types";
import type { CadConversationState } from "./conversation-state";

export type CadEntityKind =
  | "lote"
  | "quadra"
  | "rua"
  | "area_verde"
  | "area_institucional"
  | "gleba"
  | "projeto"
  | "pontos"
  | "unknown";

export type CadOperationKind =
  | "renomear"
  | "consultar"
  | "alterar_area"
  | "ajustar"
  | "otimizar"
  | "reprojetar"
  | "selecionar"
  | "unknown";

export type CadStructuredIntent = {
  intent: string;
  entity: CadEntityKind;
  operation: CadOperationKind;
  lote?: string;
  quadra?: string;
  area?: number;
  nomes?: string[];
  mapeamentos?: Array<{ de: string; para: string }>;
  scope?: "single_lot" | "quad" | "local_redistribution";
  objetivo?: "maximizar_equidade";
  requiresClarification: boolean;
  confidence: "high" | "medium" | "low";
};

const LOTEAMENTO_WORD = /\bloteamentos?\b/i;
const EXPLICIT_LOTE =
  /\blote\s+(?:\d{1,3}|[A-Za-z](?:\s*[-–—]\s*)?\d{1,3})\b|\blotes\b|\b[aá]rea do lote\b|\btestada do lote\b/i;
const QUADRA_WORD = /\bquadr(?:a|as)\b|\bquarteir[oõ]es?\b/i;
const RENAME_OP =
  /\b(?:renomear|renomeie|nomear|nomeie|identificar|identifique)\b|\bdar nome|\bcoloc(?:ar|a|e|que) nomes?|\btrocar (?:os )?nomes?|\bchamar\b.+\bde\b|\bnomes? (?:nas|das|para as)\b/i;
const REPROJECT_OP = /\breprojet\w*|\breporjet\w*|\brefazer (?:o |todo )?(?:loteamento|projeto)\b/i;
const OPTIMIZE_LOTS =
  /\b(?:ajustar|alterar|redimensionar|redistribuir)\s+(?:os\s+|todos\s+(?:os\s+)?)?lotes\b|\blotes da quadra\b/i;
const EQUITY_LOTS =
  /\b(?:lotes?\s+(?:mais\s+)?iguais|mesma\s+[aá]rea|uniformizar\s+(?:as\s+)?[aá]reas?|igualar\s+(?:as\s+)?[aá]reas?|maximizar\s+(?:a\s+)?equidade)\b/i;
const NEIGHBOR_OK =
  /\b(?:pode ajustar os lotes vizinhos|permitir (?:a )?redistribui[cç][aã]o|ajustar os lotes vizinhos|vizinhos?\s+(?:tamb[eé]m|podem))\b/i;
const REDISTRIB_CONFIRM = /\bpermitir redistribui/i;
const AREA_QUERY = /\bqual\s+(?:[eé]\s+)?a\s+[aá]rea\b|\bmostrar\s+(?:a\s+)?[aá]rea\b/i;

function norm(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function parseArea(text: string): number | undefined {
  const match = text.match(/([\d]+(?:[.,]\d+)?)\s*m(?:²|2)?/i);
  if (!match) return undefined;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function extractLotRef(text: string): string | undefined {
  const match = text.match(/\blote\s+([A-Za-z0-9-–—]+)/i);
  if (!match) return undefined;
  const raw = match[1];
  const labeled = raw.match(/^([A-Za-z])[-–—]?0*(\d{1,3})$/);
  if (labeled) return `${labeled[1].toUpperCase()}-${labeled[2].padStart(2, "0")}`;
  return raw.replace(/^0+(\d)/, "$1").padStart(2, "0");
}

function extractQuadraRef(text: string): string | undefined {
  const match = text.match(/\bquadra\s+([A-Za-z0-9]+)\b/i);
  return match?.[1]?.toUpperCase();
}

function parseNameTokens(text: string): string[] {
  const cleaned = text
    .replace(/^(?:os\s+)?nomes?\s+(?:s[aã]o|ser[aã]o|fica(?:m)?|:)\s*/i, "")
    .trim();
  if (!cleaned || QUADRA_WORD.test(cleaned) && RENAME_OP.test(cleaned) && !/\bde\s+[A-Za-z]{1,8}\d{0,3}\b/i.test(cleaned)) {
    return [];
  }
  const mapped = [...cleaned.matchAll(/\bquadra\s+([A-Za-z0-9]+)\s+(?:para|pra|->|→|de)\s+([A-Za-z]{1,8}\d{0,3})\b/gi)];
  if (mapped.length) return mapped.map((item) => item[2].toUpperCase());
  const list = cleaned
    .split(/\s*(?:,|;| e | \/ )\s*/i)
    .map((part) => part.replace(/^(?:quadra\s+)?/i, "").trim())
    .filter((part) => /^[A-Za-z]{1,8}\d{0,3}$/.test(part));
  return list.map((item) => item.toUpperCase());
}

function parseRenameMappings(text: string): Array<{ de: string; para: string }> {
  const found: Array<{ de: string; para: string }> = [];
  const call = text.match(/chamar\s+(?:a\s+)?quadra\s+([A-Za-z0-9]+)\s+de\s+([A-Za-z0-9]+)/i);
  if (call) found.push({ de: call[1].toUpperCase(), para: call[2].toUpperCase() });
  const pairs = text.matchAll(/\bquadra\s+([A-Za-z0-9]+)\s+(?:para|pra|->|→)\s+([A-Za-z0-9]+)/gi);
  for (const pair of pairs) {
    found.push({ de: pair[1].toUpperCase(), para: pair[2].toUpperCase() });
  }
  return found;
}

function isNameOnlyFollowUp(text: string): boolean {
  return /^(?:[A-Za-z]{1,8}\d{0,3})(?:\s*(?:,|;| e |&|\/)\s*[A-Za-z]{1,8}\d{0,3}){0,20}$/i.test(text.trim());
}

function pendingRename(
  state?: CadConversationState | null,
  history?: CadAiHistoryMessage[],
): boolean {
  if (state?.pendingIntent === "renomear_quadra") return true;
  const last = [...(history ?? [])].reverse().find((item) => item.role === "assistant");
  return /quais nomes voc[eê] deseja|nome(?:s)? (?:para|das) (?:as )?quadras/i.test(last?.content ?? "");
}

export function detectCadEntity(text: string): CadEntityKind {
  const raw = norm(text);
  if (!raw) return "unknown";
  if (/\b[aá]rea(?:s)?\s+verde/i.test(raw) || /\breserva\s+legal\b/i.test(raw)) return "area_verde";
  if (/\binstitucion/i.test(raw)) return "area_institucional";
  if (/\b(?:ruas?|vias?|sistema vi[aá]rio)\b/i.test(raw) && !QUADRA_WORD.test(raw) && !EXPLICIT_LOTE.test(raw)) {
    return "rua";
  }
  if (/\bgleba\b/i.test(raw) && !QUADRA_WORD.test(raw) && !EXPLICIT_LOTE.test(raw)) return "gleba";
  if (LOTEAMENTO_WORD.test(raw) && !EXPLICIT_LOTE.test(raw)) return "projeto";
  if (/\bprojeto\b/i.test(raw) && REPROJECT_OP.test(raw)) return "projeto";
  if (EXPLICIT_LOTE.test(raw) && !LOTEAMENTO_WORD.test(raw)) return "lote";
  if (QUADRA_WORD.test(raw) && !EXPLICIT_LOTE.test(raw)) return "quadra";
  if (QUADRA_WORD.test(raw) && OPTIMIZE_LOTS.test(raw)) return "lote";
  if (/\bpontos?\b/i.test(raw)) return "pontos";
  return "unknown";
}

export function classifyCadIntent(
  command: string,
  context?: CadAiProjectContext,
  history?: CadAiHistoryMessage[],
  state?: CadConversationState | null,
): CadStructuredIntent {
  const raw = norm(command);
  const area = parseArea(raw);
  const lote = extractLotRef(raw);
  const quadra = extractQuadraRef(raw);
  const mapeamentos = parseRenameMappings(raw);
  const nomes = mapeamentos.length ? mapeamentos.map((item) => item.para) : parseNameTokens(raw);

  if (pendingRename(state, history) && (isNameOnlyFollowUp(raw) || nomes.length > 0 || mapeamentos.length > 0)) {
    const followNames = nomes.length ? nomes : parseNameTokens(raw);
    return {
      intent: "renomear_quadra",
      entity: "quadra",
      operation: "renomear",
      nomes: followNames,
      mapeamentos: mapeamentos.length ? mapeamentos : undefined,
      requiresClarification: followNames.length === 0 && mapeamentos.length === 0,
      confidence: "high",
    };
  }

  const entity = detectCadEntity(raw);

  if (entity === "quadra" && (RENAME_OP.test(raw) || /nome/i.test(raw))) {
    const hasNames = Boolean(mapeamentos.length || nomes.length || (quadra && / de [A-Za-z]{1,8}\d{0,3}/i.test(raw)));
    return {
      intent: "renomear_quadra",
      entity: "quadra",
      operation: "renomear",
      quadra,
      nomes: nomes.length ? nomes : undefined,
      mapeamentos: mapeamentos.length ? mapeamentos : undefined,
      requiresClarification: !hasNames,
      confidence: "high",
    };
  }

  if (entity === "projeto" && REPROJECT_OP.test(raw)) {
    return {
      intent: "reprojetar_loteamento",
      entity: "projeto",
      operation: "reprojetar",
      requiresClarification: false,
      confidence: "high",
    };
  }

  if (entity === "lote" && AREA_QUERY.test(raw) && lote) {
    return {
      intent: "consultar_lote",
      entity: "lote",
      operation: "consultar",
      lote,
      requiresClarification: false,
      confidence: "high",
    };
  }

  if (entity === "quadra" && AREA_QUERY.test(raw) && quadra) {
    return {
      intent: "consultar_quadra",
      entity: "quadra",
      operation: "consultar",
      quadra,
      requiresClarification: false,
      confidence: "high",
    };
  }

  if (REDISTRIB_CONFIRM.test(raw) && (state?.loteAtual || lote) && (state?.areaAlvo || area != null)) {
    return {
      intent: "ajustar_lote",
      entity: "lote",
      operation: "ajustar",
      lote: lote ?? state?.loteAtual ?? undefined,
      area: area ?? state?.areaAlvo ?? undefined,
      scope: "local_redistribution",
      requiresClarification: false,
      confidence: "high",
    };
  }

  if (entity === "lote" && lote && area != null && /alter|ajust|mudar|passar|deixar|aument/i.test(raw)) {
    return {
      intent: "ajustar_lote",
      entity: "lote",
      operation: "alterar_area",
      lote,
      area,
      scope: NEIGHBOR_OK.test(raw) ? "local_redistribution" : "single_lot",
      requiresClarification: false,
      confidence: "high",
    };
  }

  if (EQUITY_LOTS.test(raw) && !lote) {
    return {
      intent: "otimizar_quadra",
      entity: entity === "quadra" ? "quadra" : "lote",
      operation: "otimizar",
      quadra,
      area,
      scope: "quad",
      objetivo: "maximizar_equidade",
      requiresClarification: false,
      confidence: "high",
    };
  }

  if ((entity === "lote" || entity === "quadra") && OPTIMIZE_LOTS.test(raw)) {
    return {
      intent: "otimizar_quadra",
      entity: "lote",
      operation: "otimizar",
      quadra,
      area,
      scope: "quad",
      objetivo: EQUITY_LOTS.test(raw) ? "maximizar_equidade" : undefined,
      requiresClarification: false,
      confidence: "high",
    };
  }

  if (entity === "quadra" && /alterar\s+(?:a\s+)?[aá]rea da quadra/i.test(raw)) {
    return {
      intent: "consultar_quadra",
      entity: "quadra",
      operation: "alterar_area",
      quadra,
      area,
      requiresClarification: area == null,
      confidence: "medium",
    };
  }

  void context;
  return {
    intent: "unknown",
    entity,
    operation: "unknown",
    lote,
    quadra,
    area,
    requiresClarification: false,
    confidence: "low",
  };
}

const TOOL_BY_INTENT: Record<string, string[]> = {
  renomear_quadra: ["renomear_quadra"],
  ajustar_lote: ["ajustar_lote"],
  otimizar_quadra: ["otimizar_quadra", "ajustar_lotes", "redistribuir_lotes"],
  reprojetar_loteamento: ["reprojetar_loteamento", "otimizar_quadra", "redistribuir_lotes"],
  consultar_lote: ["consultar_lote", "medir_area", "calcular_area"],
  consultar_quadra: ["consultar_quadra", "consultar_quadras", "medir_area", "calcular_area"],
};

export function validateIntent(
  intent: CadStructuredIntent,
  command: CadAiCommand,
): { ok: true; command: CadAiCommand } | { ok: false; message: string; command: CadAiCommand } {
  const tool = command.acao;
  if (intent.entity === "quadra" && tool === "ajustar_lote") {
    return {
      ok: false,
      message: "Claro. Quais nomes você deseja atribuir às quadras?",
      command: {
        acao: "renomear_quadra",
        quadra: intent.quadra,
        resposta: "Claro. Quais nomes você deseja atribuir às quadras?",
      },
    };
  }
  if (intent.entity === "projeto" && tool === "ajustar_lote") {
    return {
      ok: false,
      message: "Esse pedido é sobre o loteamento, não sobre um lote. Vou tratar como reprojeto do loteamento.",
      command: {
        acao: "otimizar_quadra",
        preservar_ruas: true,
        minimizar_remanescente: true,
        resposta: "Entendi. Vou reprojetar o loteamento. Deseja aplicar?",
      },
    };
  }
  if (intent.intent === "ajustar_lote" && (tool === "otimizar_quadra" || tool === "redistribuir_lotes" || tool === "gerar_loteamento")) {
    return {
      ok: false,
      message: commandFromIntent(intent).resposta ?? "Vou ajustar somente o lote informado.",
      command: commandFromIntent(intent),
    };
  }
  if (intent.intent === "renomear_quadra" && tool !== "renomear_quadra") {
    return {
      ok: false,
      message: "Claro. Quais nomes você deseja atribuir às quadras?",
      command: {
        acao: "renomear_quadra",
        quadra: intent.quadra,
        nomes: intent.nomes,
        resposta: "Claro. Quais nomes você deseja atribuir às quadras?",
      },
    };
  }
  const allowed = TOOL_BY_INTENT[intent.intent];
  if (intent.confidence === "high" && allowed && !allowed.includes(tool) && tool !== "desconhecido") {
    const replacement = commandFromIntent(intent);
    return {
      ok: false,
      message: replacement.resposta ?? "A tool não corresponde à entidade do pedido.",
      command: replacement,
    };
  }
  if (intent.intent === "renomear_quadra" && intent.requiresClarification) {
    return {
      ok: true,
      command: {
        ...command,
        acao: "renomear_quadra",
        resposta: command.resposta ?? "Claro. Quais nomes você deseja atribuir às quadras?",
      },
    };
  }
  return { ok: true, command };
}

export function commandFromIntent(intent: CadStructuredIntent): CadAiCommand {
  if (intent.intent === "renomear_quadra") {
    return {
      acao: "renomear_quadra",
      quadra: intent.quadra ?? intent.mapeamentos?.[0]?.de,
      nomes: intent.nomes,
      novo_id: intent.mapeamentos?.[0]?.para ?? intent.nomes?.[0],
      mapeamentos: intent.mapeamentos,
      resposta: intent.requiresClarification
        ? "Claro. Quais nomes você deseja atribuir às quadras?"
        : intent.mapeamentos?.[0]
          ? `Renomear a quadra ${intent.mapeamentos[0].de} para ${intent.mapeamentos[0].para}.`
          : `Renomear quadras para ${intent.nomes?.join(", ")}.`,
    };
  }
  if (intent.intent === "consultar_lote") {
    return { acao: "consultar_lote", lote: intent.lote, resposta: `Consultar o lote ${intent.lote}.` };
  }
  if (intent.intent === "consultar_quadra") {
    return { acao: "consultar_quadra", quadra: intent.quadra, resposta: `Consultar a quadra ${intent.quadra}.` };
  }
  if (intent.intent === "ajustar_lote") {
    const scope = intent.scope ?? "single_lot";
    return {
      acao: "ajustar_lote",
      lote: intent.lote,
      area_alvo_m2: intent.area,
      scope,
      resposta:
        scope === "local_redistribution"
          ? `Entendi. Vou ajustar o lote ${intent.lote} para ${intent.area} m² e redistribuir apenas os lotes afetados. Deseja aplicar?`
          : `Vou ajustar somente o Lote ${intent.lote} para ${intent.area} m². Deseja aplicar?`,
    };
  }
  if (intent.intent === "otimizar_quadra") {
    return {
      acao: "otimizar_quadra",
      quadra: intent.quadra,
      area_alvo_m2: intent.area,
      scope: "quad",
      objetivo: intent.objetivo,
      preservar_ruas: true,
      resposta: intent.objetivo === "maximizar_equidade"
        ? intent.quadra
          ? `Entendi. Vou redistribuir os lotes da quadra ${intent.quadra} para ficarem com áreas o mais iguais possível. Deseja aplicar?`
          : "Entendi. Vou redistribuir os lotes para ficarem com áreas o mais iguais possível. Deseja aplicar?"
        : intent.quadra
          ? `Entendi. Vou ajustar os lotes da quadra ${intent.quadra}${intent.area ? ` para cerca de ${intent.area} m²` : ""}. Deseja aplicar?`
          : "Entendi. Vou ajustar os lotes da quadra. Deseja aplicar?",
    };
  }
  if (intent.intent === "reprojetar_loteamento") {
    return {
      acao: "otimizar_quadra",
      preservar_ruas: true,
      minimizar_remanescente: true,
      resposta: "Entendi. Vou reprojetar o loteamento nas quadras existentes, sem mexer nas ruas. Deseja aplicar?",
    };
  }
  return { acao: "desconhecido", resposta: "Não entendi o comando." };
}

export function logCadAiIntent(intent: CadStructuredIntent, tool: string): void {
  console.info(
    `[CAD AI] intent: ${intent.intent} scope: ${intent.scope ?? "—"} target: ${intent.lote ?? intent.quadra ?? "—"} targetArea: ${intent.area ?? "—"} tools: ["${tool || ""}"]`,
  );
}

const QUAD_TOOLS = new Set(["otimizar_quadra", "redistribuir_lotes", "gerar_loteamento", "subdividir_quadra"]);

export function normalizeCommandScope(command: CadAiCommand): CadAiCommand {
  if (command.acao === "ajustar_lote") {
    return { ...command, scope: command.scope ?? "single_lot" };
  }
  if (command.acao === "otimizar_quadra" || command.acao === "redistribuir_lotes") {
    return { ...command, scope: command.scope ?? "quad" };
  }
  return command;
}

/** Impede tools de quadra quando o pedido é ajuste individual. */
export function validateCadCommand(commands: CadAiCommand[]): CadAiCommand[] {
  const normalized = commands.map(normalizeCommandScope);
  const single = normalized.find((cmd) => cmd.acao === "ajustar_lote" && cmd.scope === "single_lot");
  if (!single) return normalized;
  const tools = normalized.map((cmd) => cmd.acao);
  if (tools.some((acao) => QUAD_TOOLS.has(acao))) {
    console.error(`[CAD AI] intent: ajustar_lote scope: single_lot target: ${single.lote} targetArea: ${single.area_alvo_m2} tools: ${JSON.stringify(tools)}`);
  } else {
    console.info(
      `[CAD AI] intent: ajustar_lote scope: single_lot target: ${single.lote} targetArea: ${single.area_alvo_m2} tools: ["ajustar_lote"]`,
    );
  }
  return [single];
}
