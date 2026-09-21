import type { CadAiProjectContext } from "@/lib/rtk-validation/cad/ai-command-types";
import type { CadConversationState } from "./conversation-state";

export type CadContextLevel = 0 | 1 | 2 | 3 | 4;

export type MinimalCadContext = {
  projeto: string;
  objetoSelecionado: {
    tipo: string | null;
    id: string | null;
    quadra: string | null;
    area: number | null;
  } | null;
  quadraAtual: string | null;
  quantidadeLotes: number;
  quantidadeQuadras: number;
  parametros: {
    areaMinima: number | null;
    testadaMinima: number | null;
  };
  resumo?: Record<string, unknown>;
};

const COMPLEX_RE =
  /reprojet|reporjet|refazer|reorganiz|completar?|aproveit|um pouco|maiores?|menores?|pr[oó]ximos de|mantenha|sem mexer|acesso|redistribu|otimiz/i;

const PROJECT_RE = /loteamento|projeto|gleba|todas as quadras|o desenho inteiro/i;
const QUADRA_RE = /quadra|quarteir[aã]o|lotes dessa|todos os lotes|os lotes/i;
const LOTE_RE = /lote\s*[a-z0-9-]+|esse lote|o lote/i;
const GREET_RE =
  /^(?:ol[aá]|oi+|hey|hi|hello|e\s+a[ií]|bom\s+dia|boa\s+tarde|boa\s+noite|o que voc[eê] (?:consegue|pode) fazer|quais comandos?(?: posso usar)?|ajuda|help)(?:\s*[.!?,]*)?$/i;

export function detectCadContextLevel(command: string): CadContextLevel {
  const text = command.trim();
  if (!text || GREET_RE.test(text)) return 0;
  if (PROJECT_RE.test(text) && COMPLEX_RE.test(text)) return 3;
  if (/reprojet|reporjet|loteamento/.test(text.toLowerCase())) return 3;
  if (QUADRA_RE.test(text) && !/lote\s+\d/i.test(text)) return 2;
  if (LOTE_RE.test(text)) return 1;
  if (COMPLEX_RE.test(text)) return 2;
  return 1;
}

function lotByRef(context: CadAiProjectContext, ref?: string | null) {
  const lots = context.loteamento?.lotes ?? [];
  if (!ref) return undefined;
  const norm = ref.replace(/^lote\s+/i, "").trim().toLowerCase();
  return lots.find((lot) => {
    const id = lot.id.toLowerCase();
    const num = lot.id.split("-").pop()?.toLowerCase();
    return id === norm || id.endsWith(`-${norm.padStart(2, "0")}`) || num === norm.padStart(2, "0") || num === norm;
  });
}

function extractLotRef(command: string): string | null {
  const match = command.match(/lote\s+([A-Za-z0-9-–—]+)/i);
  return match?.[1] ?? null;
}

function extractQuadraRef(command: string, context: CadAiProjectContext, state?: CadConversationState | null): string | null {
  const match = command.match(/quadra\s+([A-Za-z0-9]+)/i);
  if (match) return match[1].toUpperCase();
  if (state?.quadraAtual) return state.quadraAtual;
  const lot = lotByRef(context, extractLotRef(command) ?? state?.loteAtual);
  if (lot?.quadra) return lot.quadra;
  const quadras = context.loteamento?.quadras ?? [];
  if (quadras.length === 1) return quadras[0].id;
  return null;
}

export function buildMinimalCadContext(
  context: CadAiProjectContext,
  command = "",
  level?: CadContextLevel,
  state?: CadConversationState | null,
): MinimalCadContext {
  const resolvedLevel = level ?? detectCadContextLevel(command);
  const loteamento = context.loteamento;
  const lotRef = extractLotRef(command) ?? state?.loteAtual;
  const lot = lotByRef(context, lotRef);
  const quadra = extractQuadraRef(command, context, state);
  const quadraRow = loteamento?.quadras.find((item) => item.id.toUpperCase() === (quadra ?? "").toUpperCase());

  const selectedTipo = lot ? "lote" : context.selecao.tipo;
  const selectedId = lot?.id ?? context.selectedEntityId;
  const base: MinimalCadContext = {
    projeto: loteamento?.projeto.nome || context.projectName,
    objetoSelecionado:
      selectedId || lot
        ? {
            tipo: selectedTipo,
            id: lot?.id ?? selectedId,
            quadra: lot?.quadra ?? quadra,
            area: lot?.area ?? null,
          }
        : null,
    quadraAtual: quadra,
    quantidadeLotes: loteamento?.lotes.length ?? 0,
    quantidadeQuadras: loteamento?.quadras.length ?? 0,
    parametros: {
      areaMinima: state?.areaAlvo ?? 250,
      testadaMinima: 10,
    },
  };

  if (resolvedLevel <= 0) {
    return {
      projeto: base.projeto,
      objetoSelecionado: null,
      quadraAtual: null,
      quantidadeLotes: 0,
      quantidadeQuadras: 0,
      parametros: { areaMinima: null, testadaMinima: null },
    };
  }

  if (resolvedLevel === 1) {
    return base;
  }

  if (resolvedLevel === 2) {
    const lots = (loteamento?.lotes ?? []).filter((item) => !quadra || item.quadra.toUpperCase() === quadra.toUpperCase());
    const areas = lots.map((item) => item.area);
    return {
      ...base,
      resumo: {
        quadra,
        quantidadeLotes: lots.length || quadraRow?.quantidadeLotes || 0,
        areaQuadra: quadraRow?.area ?? null,
        areaMedia: quadraRow?.areaMedia ?? (areas.length ? areas.reduce((a, b) => a + b, 0) / areas.length : null),
        areaMin: areas.length ? Math.min(...areas) : null,
        areaMax: areas.length ? Math.max(...areas) : null,
        lotes: lots.slice(0, 24).map((item) => ({ id: item.id, area: item.area, testada: item.testada })),
        restricoes: { preservarRuas: state?.preservarRuas ?? true, exigirAcesso: state?.exigirAcesso ?? true },
      },
    };
  }

  return {
    ...base,
    resumo: {
      quantidadeQuadras: loteamento?.quadras.length ?? 0,
      quantidadeLotes: loteamento?.lotes.length ?? 0,
      quadras: (loteamento?.quadras ?? []).map((item) => ({
        id: item.id,
        area: item.area,
        lotes: item.quantidadeLotes,
        areaMedia: item.areaMedia,
      })),
      ruas: loteamento?.ruas.length ?? 0,
      areasVerdes: (loteamento?.areasVerdes ?? []).map((item) => ({ nome: item.nome, area: item.area })),
      areasInstitucionais: (loteamento?.areasInstitucionais ?? []).map((item) => ({ nome: item.nome, area: item.area })),
      remanescenteM2: loteamento?.remanescenteM2 ?? 0,
      crs: context.crs,
      restricoes: { preservarRuas: true, exigirAcesso: true },
    },
  };
}

const GEOMETRY_KEYS = /^(x|y|z|vertices|coordinates|coordenadas|geojson|dxf|points|pontos|geometry|geometria)$/i;

export function contextContainsGeometry(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.some(contextContainsGeometry);
  if (typeof value !== "object") return false;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (GEOMETRY_KEYS.test(key)) {
      if (key === "pontos" && Array.isArray(item) && item.every((entry) => typeof entry === "string")) {
        continue;
      }
      if (Array.isArray(item) || (item && typeof item === "object")) return true;
      if (typeof item === "number") return true;
    }
    if (contextContainsGeometry(item)) return true;
  }
  return false;
}

export function compactCadContext(
  context: CadAiProjectContext,
  command: string,
  state?: CadConversationState | null,
): { level: CadContextLevel; payload: Record<string, unknown>; size: number; geometrySent: boolean } {
  const level = detectCadContextLevel(command);
  if (level === 0) {
    const payload = { level: 0 };
    return { level, payload, size: JSON.stringify(payload).length, geometrySent: false };
  }
  const minimal = buildMinimalCadContext(context, command, level, state);
  const payload: Record<string, unknown> = {
    level,
    projeto: minimal.projeto,
    objetoSelecionado: minimal.objetoSelecionado,
    quadraAtual: minimal.quadraAtual,
    quantidadeLotes: minimal.quantidadeLotes,
    parametros: minimal.parametros,
  };
  if (minimal.resumo) payload.resumo = minimal.resumo;
  const size = JSON.stringify(payload).length;
  return { level, payload, size, geometrySent: contextContainsGeometry(payload) };
}

export function isFollowUpCommand(command: string): boolean {
  return /^(mas|agora|e |também|tambem|sem |não |nao |preserve|mantenha|ok,)/i.test(command.trim());
}
