import type { CadEntity, CadVertex } from "./types";

export interface CadViewport {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  padding: number;
}

function entityVertices(entity: CadEntity): CadVertex[] {
  if (entity.type === "point") return [{ x: entity.x, y: entity.y, z: entity.z }];
  if (entity.type === "line") return [entity.start, entity.end];
  return entity.vertices;
}

export function computeViewportBounds(entities: CadEntity[], paddingRatio = 0.1): Omit<CadViewport, "width" | "height" | "padding"> {
  if (entities.length === 0) {
    return { minX: -50, maxX: 50, minY: -50, maxY: 50 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const entity of entities) {
    for (const v of entityVertices(entity)) {
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
  }

  const padX = (maxX - minX) * paddingRatio || 10;
  const padY = (maxY - minY) * paddingRatio || 10;

  return {
    minX: minX - padX,
    maxX: maxX + padX,
    minY: minY - padY,
    maxY: maxY + padY,
  };
}

/** Caixa de conteúdo do SVG com preserveAspectRatio="xMidYMid meet". */
export function svgMeetBox(cssW: number, cssH: number, viewW: number, viewH: number) {
  const scale = Math.min(cssW / Math.max(viewW, 1e-9), cssH / Math.max(viewH, 1e-9));
  return {
    scale,
    offsetX: (cssW - viewW * scale) / 2,
    offsetY: (cssH - viewH * scale) / 2,
  };
}

export function clientToViewBox(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  viewW: number,
  viewH: number,
): { sx: number; sy: number } {
  const meet = svgMeetBox(rect.width, rect.height, viewW, viewH);
  if (meet.scale < 1e-9) return { sx: viewW / 2, sy: viewH / 2 };
  return {
    sx: (clientX - rect.left - meet.offsetX) / meet.scale,
    sy: (clientY - rect.top - meet.offsetY) / meet.scale,
  };
}

export function viewBoxToCss(
  sx: number,
  sy: number,
  cssW: number,
  cssH: number,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  const meet = svgMeetBox(cssW, cssH, viewW, viewH);
  return {
    x: meet.offsetX + sx * meet.scale,
    y: meet.offsetY + sy * meet.scale,
  };
}

export function worldToScreen(
  x: number,
  y: number,
  viewport: CadViewport,
): { sx: number; sy: number } {
  const innerW = viewport.width - viewport.padding * 2;
  const innerH = viewport.height - viewport.padding * 2;
  const sx =
    viewport.padding + ((x - viewport.minX) / (viewport.maxX - viewport.minX)) * innerW;
  const sy =
    viewport.padding +
    innerH -
    ((y - viewport.minY) / (viewport.maxY - viewport.minY)) * innerH;
  return { sx, sy };
}

export function screenToWorld(
  sx: number,
  sy: number,
  viewport: CadViewport,
): { x: number; y: number } {
  const innerW = viewport.width - viewport.padding * 2;
  const innerH = viewport.height - viewport.padding * 2;
  const x = viewport.minX + ((sx - viewport.padding) / innerW) * (viewport.maxX - viewport.minX);
  const y =
    viewport.minY +
    ((viewport.padding + innerH - sy) / innerH) * (viewport.maxY - viewport.minY);
  return { x, y };
}

/** Altura padrão de anotação genérica (ruas/drenagem/tabelas), em metros de terreno. */
export const CAD_LOT_LABEL_HEIGHT_M = 0.8;

/** Altura em metros e teto em px: número circundado / área em destaque / testada-profundidade. */
export const CAD_CADASTRAL_TITLE_HEIGHT_M = 3.2;
export const CAD_CADASTRAL_AREA_HEIGHT_M = 4.2;
export const CAD_CADASTRAL_EDGE_HEIGHT_M = 2.4;
export const CAD_CADASTRAL_TITLE_MAX_PX = 28;
export const CAD_CADASTRAL_AREA_MAX_PX = 34;
export const CAD_CADASTRAL_EDGE_MAX_PX = 20;
export const CAD_CADASTRAL_TITLE_SPAN_FACTOR = 0.26;
export const CAD_CADASTRAL_AREA_SPAN_FACTOR = 0.32;
export const CAD_CADASTRAL_EDGE_SPAN_FACTOR = 0.18;

export function worldMetersPerPixel(viewport: CadViewport): number {
  const innerW = Math.max(1, viewport.width - viewport.padding * 2);
  const innerH = Math.max(1, viewport.height - viewport.padding * 2);
  const spanX = Math.max(1e-6, viewport.maxX - viewport.minX);
  const spanY = Math.max(1e-6, viewport.maxY - viewport.minY);
  return Math.max(spanX / innerW, spanY / innerH);
}

/**
 * Tamanho de anotação de loteamento/REURB em px do SVG, a partir da altura em metros.
 * `minSpanM` (lado menor do lote) limita o texto para caber na testada.
 */
export function annotationFontSizePx(
  viewport: CadViewport,
  heightM = CAD_LOT_LABEL_HEIGHT_M,
  minSpanM?: number,
  maxPx = 5.5,
  spanFactor = 0.12,
): number {
  const mpp = worldMetersPerPixel(viewport);
  let px = heightM / mpp;
  if (minSpanM != null && minSpanM > 0) {
    px = Math.min(px, (minSpanM * spanFactor) / mpp);
  }
  return Math.max(1.6, Math.min(maxPx, px));
}

/** Número / área / cotas de frente e lado — bem maiores que ruas e drenagem. */
export function cadastralLotFontSizePx(
  viewport: CadViewport,
  role: "lot-title" | "lot-area" | "lot-edge",
  minSpanM?: number,
): number {
  if (role === "lot-title") {
    return annotationFontSizePx(
      viewport,
      CAD_CADASTRAL_TITLE_HEIGHT_M,
      minSpanM,
      CAD_CADASTRAL_TITLE_MAX_PX,
      CAD_CADASTRAL_TITLE_SPAN_FACTOR,
    );
  }
  if (role === "lot-area") {
    return annotationFontSizePx(
      viewport,
      CAD_CADASTRAL_AREA_HEIGHT_M,
      minSpanM,
      CAD_CADASTRAL_AREA_MAX_PX,
      CAD_CADASTRAL_AREA_SPAN_FACTOR,
    );
  }
  return annotationFontSizePx(
    viewport,
    CAD_CADASTRAL_EDGE_HEIGHT_M,
    minSpanM,
    CAD_CADASTRAL_EDGE_MAX_PX,
    CAD_CADASTRAL_EDGE_SPAN_FACTOR,
  );
}

export function snapToPoint(
  x: number,
  y: number,
  entities: CadEntity[],
  thresholdM = 2,
): CadVertex | null {
  let best: CadVertex | null = null;
  let bestDist = thresholdM;

  for (const entity of entities) {
    if (entity.type !== "point") continue;
    const d = Math.hypot(entity.x - x, entity.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = { x: entity.x, y: entity.y, z: entity.z };
    }
  }

  return best;
}

export interface SnapPointHit {
  entityId: string;
  vertex: CadVertex;
  label?: string;
}

/** Seleção de ponto por proximidade na tela (melhor para zoom/pan). */
export function findPointAtScreen(
  sx: number,
  sy: number,
  entities: CadEntity[],
  viewport: CadViewport,
  thresholdPx = 14,
): SnapPointHit | null {
  let best: SnapPointHit | null = null;
  let bestDist = thresholdPx;

  for (const entity of entities) {
    if (entity.type !== "point") continue;
    const { sx: px, sy: py } = worldToScreen(entity.x, entity.y, viewport);
    const d = Math.hypot(px - sx, py - sy);
    if (d < bestDist) {
      bestDist = d;
      best = {
        entityId: entity.id,
        vertex: { x: entity.x, y: entity.y, z: entity.z },
        label: entity.label,
      };
    }
  }

  return best;
}

export function listPointEntities(entities: CadEntity[]): Array<{
  id: string;
  label: string;
  vertex: CadVertex;
  layerId: string;
}> {
  return entities
    .filter((e): e is Extract<CadEntity, { type: "point" }> => e.type === "point")
    .map((e) => ({
      id: e.id,
      label: e.label?.trim() || `Ponto ${e.x.toFixed(1)}, ${e.y.toFixed(1)}`,
      vertex: { x: e.x, y: e.y, z: e.z },
      layerId: e.layerId,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}
