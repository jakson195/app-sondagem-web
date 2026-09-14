import type { CadHatchPattern, CadLayer } from "./types";

const LOTEAMENTO_LOTES_LAYER_ID = "loteamento_lotes";

export const DEFAULT_LINE_WIDTH = 1.5;
export const DEFAULT_TEXT_COLOR = "#e2e8f0";
export const DEFAULT_TEXT_SIZE = 10;
export const DEFAULT_LINE_COLOR = "#fbbf24";
export const DEFAULT_FILL_COLOR = "#fbbf24";
export const DEFAULT_FILL_ALPHA = 0.06;
export const DEFAULT_FILL_ALPHA_SELECTED = 0.15;

/** Plano 2D: lotes com gramado visível (não laranja/sólido). Contorno cadastral fino e preto. */
export const LOTEAMENTO_LOTES_GRASS_FILL = "#4ade80";
export const LOTEAMENTO_LOTES_GRASS_FILL_ALPHA = 0.52;
export const LOTEAMENTO_LOTES_LINE = "#111827";
/** @deprecated use LOTEAMENTO_LOTES_LINE — mantido para imports existentes. */
export const LOTEAMENTO_LOTES_CADASTRE_BLUE = LOTEAMENTO_LOTES_LINE;
export const LOTEAMENTO_LOTES_LINE_WIDTH = 1;
/** Default textSize da camada de lotes (antes: 10 via DEFAULT_TEXT_SIZE). */
export const LOTEAMENTO_LOTES_TEXT_SIZE = 22;

const SYSTEM_LAYER_IDS = new Set([
  "rtk_points",
  "ctrl_known",
  "ctrl_obs",
  "residuals",
  "contours",
  "contour_labels",
  "tin",
  "text",
  "orthophoto",
  "hypsometric",
  "cutfill",
  "contours_interpolated",
  "anm_processos",
  "anm_protecao_fonte",
  "anm_arrendamentos",
  "anm_bloqueio",
  "anm_reservas_garimpeiras",
  "sigef_particular",
  "sigef_publico",
]);

function newLayerId() {
  return `lyr_${Math.random().toString(36).slice(2, 10)}`;
}

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const rgba = color.trim().match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const parts = rgba[1].split(",").map((p) => p.trim());
    if (parts.length >= 3) {
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`;
    }
  }
  const hex = parseHexColor(color);
  if (hex) return `rgba(${hex.r}, ${hex.g}, ${hex.b}, ${a})`;
  return color;
}

export function isLoteamentoLotesLayer(layer: Pick<CadLayer, "id"> | undefined): boolean {
  return layer?.id === LOTEAMENTO_LOTES_LAYER_ID;
}

/** Estilo de gramado no plano 2D; traço cadastral fino e preto. */
export function applyLoteamentoLotesGrassStyle(layer: CadLayer): CadLayer {
  return {
    ...layer,
    color: LOTEAMENTO_LOTES_LINE,
    textColor: LOTEAMENTO_LOTES_LINE,
    lineWidth:
      layer.lineWidth != null && layer.lineWidth <= LOTEAMENTO_LOTES_LINE_WIDTH + 0.2
        ? layer.lineWidth
        : LOTEAMENTO_LOTES_LINE_WIDTH,
    fillColor: LOTEAMENTO_LOTES_GRASS_FILL,
    fillAlpha: layer.fillAlpha != null && layer.fillAlpha >= 0.35 ? layer.fillAlpha : LOTEAMENTO_LOTES_GRASS_FILL_ALPHA,
    hatchPattern: "grass",
    textSize: Math.max(layer.textSize ?? 0, LOTEAMENTO_LOTES_TEXT_SIZE),
  };
}

export function resolveLayerHatchPattern(layer: CadLayer | undefined): CadHatchPattern | undefined {
  if (!layer) return undefined;
  if (isLoteamentoLotesLayer(layer)) return "grass";
  if (layer.hatchPattern === "diagonal" || layer.hatchPattern === "cross" || layer.hatchPattern === "grass") {
    return layer.hatchPattern;
  }
  return undefined;
}

export function normalizeCadLayer(layer: CadLayer): CadLayer {
  const next = {
    ...layer,
    lineWidth: layer.lineWidth ?? DEFAULT_LINE_WIDTH,
    fillColor: layer.fillColor ?? layer.color,
    textColor: layer.textColor ?? DEFAULT_TEXT_COLOR,
    textSize: layer.textSize ?? DEFAULT_TEXT_SIZE,
  };
  return isLoteamentoLotesLayer(next) ? applyLoteamentoLotesGrassStyle(next) : next;
}

export function normalizeCadLayers(layers: CadLayer[]): CadLayer[] {
  return layers.map(normalizeCadLayer);
}

export function getLayerLineColor(layer: CadLayer | undefined, fallback = DEFAULT_LINE_COLOR): string {
  if (isLoteamentoLotesLayer(layer)) return LOTEAMENTO_LOTES_LINE;
  return layer?.color ?? fallback;
}

export function getLayerTextColor(layer: CadLayer | undefined, fallback = DEFAULT_TEXT_COLOR): string {
  if (isLoteamentoLotesLayer(layer)) return LOTEAMENTO_LOTES_LINE;
  return layer?.textColor ?? fallback;
}

export function getLayerTextSize(layer: CadLayer | undefined, fallback = DEFAULT_TEXT_SIZE): number {
  const size = layer?.textSize ?? (isLoteamentoLotesLayer(layer) ? LOTEAMENTO_LOTES_TEXT_SIZE : fallback);
  return Number.isFinite(size) ? Math.max(6, Math.min(48, size)) : fallback;
}

export function resolvePointTextStyle(
  entity: { textColor?: string; textSize?: number } | undefined,
  layer: CadLayer | undefined,
): { color: string; size: number } {
  return {
    color: entity?.textColor ?? getLayerTextColor(layer),
    size: getLayerTextSize(undefined, entity?.textSize ?? layer?.textSize ?? DEFAULT_TEXT_SIZE),
  };
}

export function getLayerLineWidth(layer: CadLayer | undefined, selected = false): number {
  const base = layer?.lineWidth ?? DEFAULT_LINE_WIDTH;
  return selected ? base + 1 : base;
}

export function getLayerFillColor(
  layer: CadLayer | undefined,
  selected = false,
  fallback = DEFAULT_FILL_COLOR,
): string {
  const styled = isLoteamentoLotesLayer(layer) && layer ? applyLoteamentoLotesGrassStyle(layer) : layer;
  const base = styled?.fillColor ?? styled?.color ?? fallback;
  const custom = styled?.fillAlpha;
  const idle = custom ?? DEFAULT_FILL_ALPHA;
  const sel = custom != null ? Math.min(1, custom + 0.12) : DEFAULT_FILL_ALPHA_SELECTED;
  return withAlpha(base, selected ? sel : idle);
}

export function cadHatchPatternId(layerId: string): string {
  return `cad-hatch-${layerId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/** Preenchimento SVG: hachura (url(#...)) ou sólido com alpha da camada. */
export function getLayerPolygonFill(
  layer: CadLayer | undefined,
  selected = false,
  fallback = DEFAULT_FILL_COLOR,
): string {
  const hatch = resolveLayerHatchPattern(layer);
  if (hatch && layer?.id) {
    return `url(#${cadHatchPatternId(layer.id)})`;
  }
  return getLayerFillColor(layer, selected, fallback);
}

export function getLayerStrokeDasharray(layer: CadLayer | undefined): string | undefined {
  if (layer?.lineType === "dashed" || layer?.id === "residuals") return "8 5";
  return undefined;
}

function colorLuminance(color: string): number {
  const hex = parseHexColor(color);
  if (!hex) return 0.5;
  return (0.299 * hex.r + 0.587 * hex.g + 0.114 * hex.b) / 255;
}

/** Cor de texto legível no fundo branco da prancha (usa estilo da camada). */
export function getLayerTextColorForPrint(layer: CadLayer | undefined, fallback = "#111827"): string {
  const line = getLayerLineColor(layer, fallback);
  const text = getLayerTextColor(layer, DEFAULT_TEXT_COLOR);
  if (text === DEFAULT_TEXT_COLOR || colorLuminance(text) > 0.72) {
    return colorLuminance(line) > 0.55 ? fallback : line;
  }
  return text;
}

/** Espessura de linha na prancha (mm SVG), proporcional ao estilo da camada. */
export function getLayerLineWidthForPrint(layer: CadLayer | undefined, unitsPerMm: number): number {
  return Math.max(0.35, getLayerLineWidth(layer, false) * unitsPerMm * 0.24);
}

export function createUserLayer(name: string, patch: Partial<CadLayer> = {}): CadLayer {
  const color = patch.color ?? DEFAULT_LINE_COLOR;
  return normalizeCadLayer({
    id: patch.id ?? newLayerId(),
    name: name.trim() || "CAMADA",
    color,
    visible: patch.visible ?? true,
    locked: false,
    fillColor: patch.fillColor ?? color,
    textColor: patch.textColor ?? DEFAULT_TEXT_COLOR,
    textSize: patch.textSize ?? DEFAULT_TEXT_SIZE,
    lineWidth: patch.lineWidth ?? DEFAULT_LINE_WIDTH,
    ...patch,
  });
}

export function isUserLayer(layer: CadLayer): boolean {
  return !layer.locked && !SYSTEM_LAYER_IDS.has(layer.id);
}

export function mergeLayerStyles(layer: CadLayer, patch: Partial<CadLayer>): CadLayer {
  return normalizeCadLayer({ ...layer, ...patch });
}

export function defaultDrawLayerStyles(): Pick<CadLayer, "lineWidth" | "fillColor" | "textColor" | "textSize"> {
  return {
    lineWidth: DEFAULT_LINE_WIDTH,
    fillColor: DEFAULT_FILL_COLOR,
    textColor: "#fde68a",
    textSize: DEFAULT_TEXT_SIZE,
  };
}
