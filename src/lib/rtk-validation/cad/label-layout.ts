import { polygonCentroid } from "./ai-geometry-utils";
import { splitSvgLabelLines } from "./polygon-utils";
import type { CadEntity, CadPointEntity, CadVertex } from "./types";

/** Converte texto no formato brasileiro (665.458,58) para número. */
export function parseCoordBrValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const negative = trimmed.startsWith("-");
  const abs = negative ? trimmed.slice(1) : trimmed;
  const comma = abs.lastIndexOf(",");
  if (comma < 0) {
    const n = Number(abs.replace(/\./g, ""));
    return Number.isFinite(n) ? (negative ? -n : n) : null;
  }
  const intPart = abs.slice(0, comma).replace(/\./g, "");
  const decPart = abs.slice(comma + 1);
  const n = Number(`${negative ? "-" : ""}${intPart}.${decPart}`);
  return Number.isFinite(n) ? n : null;
}

export function isCoordLabelText(label: string | undefined): boolean {
  if (!label?.trim()) return false;
  const lines = splitSvgLabelLines(label);
  return lines.length >= 2 && /^E\s/i.test(lines[0]) && /^N\s/i.test(lines[1]);
}

export function isCoordLabelEntity(entity: CadPointEntity): boolean {
  return entity.id.startsWith("coord_") || isCoordLabelText(entity.label);
}

/** Vértice real descrito pela etiqueta E/N (ignora posição do ponto-texto). */
export function parseCoordLabelAnchor(label: string): CadVertex | null {
  const lines = splitSvgLabelLines(label);
  if (lines.length < 2) return null;
  const e = parseCoordBrValue(lines[0].replace(/^E\s+/i, ""));
  const n = parseCoordBrValue(lines[1].replace(/^N\s+/i, ""));
  if (e == null || n == null) return null;
  return { x: e, y: n, z: 0 };
}

function nearestClosedPolygonCentroid(
  entities: CadEntity[],
  anchor: CadVertex,
): CadVertex | null {
  let best: CadVertex | null = null;
  let bestDist = Infinity;
  for (const entity of entities) {
    if (entity.type !== "polyline" || !entity.closed || entity.vertices.length < 3) continue;
    const c = polygonCentroid(entity.vertices);
    const d = Math.hypot(anchor.x - c.x, anchor.y - c.y);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

type ScreenPoint = { sx: number; sy: number };

/** Posição da etiqueta E/N em pixels, afastada do marcador do vértice. */
export function computeCoordLabelScreenPosition(input: {
  anchorSx: number;
  anchorSy: number;
  viewWidth: number;
  viewHeight: number;
  lineCount: number;
  fontSize: number;
  centroidSx?: number;
  centroidSy?: number;
}): ScreenPoint {
  const { anchorSx, anchorSy, viewWidth, viewHeight, lineCount, fontSize, centroidSx, centroidSy } =
    input;
  const lineH = Math.max(fontSize * 1.15, fontSize + 2);
  const blockH = lineCount * lineH;
  const minDist = Math.max(26, blockH * 0.75);

  let dx = minDist * 0.85;
  let dy = -(minDist + blockH * 0.15);

  if (centroidSx != null && centroidSy != null) {
    const vx = anchorSx - centroidSx;
    const vy = anchorSy - centroidSy;
    const len = Math.hypot(vx, vy);
    if (len > 6) {
      dx = (vx / len) * minDist;
      dy = (vy / len) * minDist;
    }
  }

  let labelSx = anchorSx + dx;
  let labelSy = anchorSy + dy;

  const margin = 6;
  const estWidth = 92;
  if (labelSx + estWidth > viewWidth - margin) {
    labelSx = anchorSx - minDist - estWidth * 0.55;
  }
  if (labelSx < margin) labelSx = anchorSx + minDist * 0.6;
  if (labelSy < blockH + margin) labelSy = anchorSy + minDist * 0.75;
  if (labelSy > viewHeight - margin) labelSy = anchorSy - minDist - blockH;

  return { sx: labelSx, sy: labelSy };
}

export function resolveCoordLabelLayout(
  entity: CadPointEntity,
  entities: CadEntity[],
  worldToScreen: (x: number, y: number) => ScreenPoint,
  viewWidth: number,
  viewHeight: number,
  fontSize: number,
): { labelSx: number; labelSy: number; lineCount: number } | null {
  if (!entity.label || !isCoordLabelEntity(entity)) return null;

  const anchor = parseCoordLabelAnchor(entity.label) ?? { x: entity.x, y: entity.y, z: entity.z };
  const { sx: anchorSx, sy: anchorSy } = worldToScreen(anchor.x, anchor.y);
  const centroid = nearestClosedPolygonCentroid(entities, anchor);
  const centroidScreen = centroid ? worldToScreen(centroid.x, centroid.y) : undefined;
  const lineCount = splitSvgLabelLines(entity.label).length;
  const pos = computeCoordLabelScreenPosition({
    anchorSx,
    anchorSy,
    viewWidth,
    viewHeight,
    lineCount,
    fontSize,
    centroidSx: centroidScreen?.sx,
    centroidSy: centroidScreen?.sy,
  });

  return { labelSx: pos.sx, labelSy: pos.sy, lineCount };
}
