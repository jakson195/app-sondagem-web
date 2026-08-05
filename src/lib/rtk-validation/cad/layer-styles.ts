import type { CadLayer } from "./types";

export const DEFAULT_LINE_WIDTH = 1.5;
export const DEFAULT_TEXT_COLOR = "#e2e8f0";
export const DEFAULT_LINE_COLOR = "#fbbf24";
export const DEFAULT_FILL_COLOR = "#fbbf24";
export const DEFAULT_FILL_ALPHA = 0.06;
export const DEFAULT_FILL_ALPHA_SELECTED = 0.15;

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

export function normalizeCadLayer(layer: CadLayer): CadLayer {
  return {
    ...layer,
    lineWidth: layer.lineWidth ?? DEFAULT_LINE_WIDTH,
    fillColor: layer.fillColor ?? layer.color,
    textColor: layer.textColor ?? DEFAULT_TEXT_COLOR,
  };
}

export function normalizeCadLayers(layers: CadLayer[]): CadLayer[] {
  return layers.map(normalizeCadLayer);
}

export function getLayerLineColor(layer: CadLayer | undefined, fallback = DEFAULT_LINE_COLOR): string {
  return layer?.color ?? fallback;
}

export function getLayerTextColor(layer: CadLayer | undefined, fallback = DEFAULT_TEXT_COLOR): string {
  return layer?.textColor ?? fallback;
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
  const base = layer?.fillColor ?? layer?.color ?? fallback;
  return withAlpha(base, selected ? DEFAULT_FILL_ALPHA_SELECTED : DEFAULT_FILL_ALPHA);
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

export function defaultDrawLayerStyles(): Pick<CadLayer, "lineWidth" | "fillColor" | "textColor"> {
  return {
    lineWidth: DEFAULT_LINE_WIDTH,
    fillColor: DEFAULT_FILL_COLOR,
    textColor: "#fde68a",
  };
}
