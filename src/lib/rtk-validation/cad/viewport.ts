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
