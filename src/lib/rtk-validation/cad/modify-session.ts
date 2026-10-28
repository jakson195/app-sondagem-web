import type { CadAiAction, CadAiCommand } from "./ai-command-types";
import type { CadEntity, CadTool, CadVertex } from "./types";
import { pickHintForTool } from "./modify-ops";

export type CadModifyTool =
  | "move"
  | "rotate"
  | "copy"
  | "mirror"
  | "stretch"
  | "scale"
  | "offset"
  | "trim"
  | "extend"
  | "fillet"
  | "chamfer"
  | "array"
  | "explode"
  | "join"
  | "split";

export type ModifyPhase =
  | "select"
  | "base"
  | "dest"
  | "axis2"
  | "window2"
  | "side"
  | "boundary"
  | "target"
  | "value"
  | "preview";

export type ModifySession = {
  tool: CadModifyTool;
  phase: ModifyPhase;
  entityIds: string[];
  picks: CadVertex[];
  vertexIndices: number[];
  value: number | null;
  value2: number | null;
  keepOriginal: boolean;
  cols: number;
  rows: number;
  arrayKind: "rectangular" | "polar";
  hint: string;
  previewEntities: CadEntity[];
};

export const CAD_MODIFY_TOOLS: CadModifyTool[] = [
  "move",
  "rotate",
  "copy",
  "mirror",
  "stretch",
  "scale",
  "offset",
  "trim",
  "extend",
  "fillet",
  "chamfer",
  "array",
  "explode",
  "join",
  "split",
];

export const CAD_MODIFY_TOOL_SET = new Set<string>([
  ...CAD_MODIFY_TOOLS,
  "aparar",
]);

export const MODIFY_TOOL_TO_ACTION: Record<CadModifyTool, CadAiAction> = {
  move: "mover",
  rotate: "rotacionar",
  copy: "copiar",
  mirror: "espelhar",
  stretch: "esticar",
  scale: "escala",
  offset: "deslocar",
  trim: "aparar",
  extend: "estender",
  fillet: "concordar",
  chamfer: "chanfrar",
  array: "matriz",
  explode: "explodir",
  join: "unir",
  split: "dividir",
};

export const CAD_TOOL_TO_MODIFY: Partial<Record<CadTool, CadModifyTool>> = {
  move: "move",
  rotate: "rotate",
  copy: "copy",
  mirror: "mirror",
  stretch: "stretch",
  scale: "scale",
  offset: "offset",
  trim: "trim",
  aparar: "trim",
  extend: "extend",
  fillet: "fillet",
  chamfer: "chamfer",
  array: "array",
  explode: "explode",
  join: "join",
  split: "split",
};

export const MODIFY_SHORTCUTS: Array<{ keys: string; tool: CadModifyTool }> = [
  { keys: "m", tool: "move" },
  { keys: "ro", tool: "rotate" },
  { keys: "co", tool: "copy" },
  { keys: "mi", tool: "mirror" },
  { keys: "s", tool: "stretch" },
  { keys: "sc", tool: "scale" },
  { keys: "o", tool: "offset" },
  { keys: "tr", tool: "trim" },
  { keys: "ex", tool: "extend" },
  { keys: "f", tool: "fillet" },
  { keys: "cha", tool: "chamfer" },
  { keys: "ar", tool: "array" },
  { keys: "x", tool: "explode" },
  { keys: "j", tool: "join" },
];

export function createModifySession(tool: CadModifyTool, entityIds: string[] = []): ModifySession {
  const phase: ModifyPhase =
    (tool === "fillet" || tool === "chamfer") && entityIds.length >= 2
      ? "preview"
      : tool === "explode" || tool === "join" || tool === "array" || tool === "split"
        ? entityIds.length > 0
          ? "value"
          : "select"
        : tool === "trim" || tool === "extend"
          ? "boundary"
          : entityIds.length > 0
            ? initialPhaseForTool(tool)
            : "select";
  return {
    tool,
    phase,
    entityIds,
    picks: [],
    vertexIndices: [],
    value: tool === "fillet" ? 5 : tool === "chamfer" ? 3 : tool === "offset" ? 5 : tool === "split" ? 2 : null,
    value2: null,
    keepOriginal: true,
    cols: 5,
    rows: 1,
    arrayKind: "rectangular",
    hint: pickHintForTool(tool, phase),
    previewEntities: [],
  };
}

function initialPhaseForTool(tool: CadModifyTool): ModifyPhase {
  if (tool === "trim" || tool === "extend") return "boundary";
  if (tool === "fillet" || tool === "chamfer") return "select";
  if (tool === "offset" || tool === "scale") return "value";
  return "base";
}

export function sessionWithHint(session: ModifySession, phase: ModifyPhase): ModifySession {
  return { ...session, phase, hint: pickHintForTool(session.tool, phase) };
}

export function commandFromSession(session: ModifySession, extra?: Partial<CadAiCommand>): CadAiCommand {
  const acao = MODIFY_TOOL_TO_ACTION[session.tool];
  const [p0, p1, p2] = session.picks;
  const cmd: CadAiCommand = {
    acao,
    entidade_ids: session.entityIds,
    entidade_id: session.entityIds[0],
    distancia: session.value ?? undefined,
    fator: session.tool === "scale" ? session.value ?? undefined : undefined,
    raio: session.tool === "fillet" ? session.value ?? undefined : undefined,
    distancia_1: session.tool === "chamfer" ? session.value ?? undefined : undefined,
    distancia_2: session.tool === "chamfer" ? session.value2 ?? session.value ?? undefined : undefined,
    angulo: session.tool === "rotate" || session.tool === "array" ? session.value ?? undefined : undefined,
    colunas: session.cols,
    linhas: session.rows,
    partes: session.tool === "split" ? session.value ?? 2 : undefined,
    tipo_matriz: session.tool === "array" ? session.arrayKind === "polar" ? "polar" : "retangular" : undefined,
    manter_original: session.keepOriginal,
    vertices_indices: session.vertexIndices.length ? session.vertexIndices : undefined,
    ...extra,
  };
  if (session.tool === "trim" || session.tool === "extend") {
    cmd.entidade_corte = session.entityIds[0];
    cmd.entidade_id = session.entityIds[1] ?? session.entityIds[0];
    if (session.entityIds[1]) cmd.entidade_ids = [session.entityIds[1], session.entityIds[0]];
  }
  if (p0) {
    cmd.x = p0.x;
    cmd.y = p0.y;
  }
  if (p1 && (session.tool === "mirror" || session.tool === "stretch" || session.tool === "move" || session.tool === "copy")) {
    if (session.tool === "move" || session.tool === "copy") {
      cmd.dx = p1.x - p0.x;
      cmd.dy = p1.y - p0.y;
    } else {
      cmd.x2 = p1.x;
      cmd.y2 = p1.y;
    }
  }
  if (p2 && session.tool === "stretch") {
    cmd.dx = p2.x - ((p0.x + (p1?.x ?? p0.x)) / 2);
    cmd.dy = p2.y - ((p0.y + (p1?.y ?? p0.y)) / 2);
    cmd.x2 = p1?.x;
    cmd.y2 = p1?.y;
  }
  return cmd;
}

export function resolveShortcutBuffer(buffer: string): CadModifyTool | "pending" | null {
  const key = buffer.toLowerCase();
  if (!key) return null;
  const exact = MODIFY_SHORTCUTS.find((item) => item.keys === key);
  if (exact) {
    const prefixOfLonger = MODIFY_SHORTCUTS.some((item) => item.keys !== key && item.keys.startsWith(key));
    return prefixOfLonger ? "pending" : exact.tool;
  }
  const matches = MODIFY_SHORTCUTS.filter((item) => item.keys.startsWith(key));
  if (matches.length === 1) return matches[0].tool;
  if (matches.length > 1) return "pending";
  return null;
}

export function commitShortcutBuffer(buffer: string): CadModifyTool | null {
  const key = buffer.toLowerCase();
  return MODIFY_SHORTCUTS.find((item) => item.keys === key)?.tool ?? null;
}
