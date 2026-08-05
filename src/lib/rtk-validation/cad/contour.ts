import { contours as d3Contours } from "d3-contour";
import type { CadEntity, CadPolylineEntity, CadVertex } from "./types";

export interface ElevationSample {
  x: number;
  y: number;
  z: number;
}

export interface ContourGenerationOptions {
  /** Intervalo vertical entre curvas (m). */
  interval: number;
  /** Intervalo das curvas mestras (m). Padrão: interval × 5. */
  majorInterval?: number;
  gridCols?: number;
  gridRows?: number;
  idwPower?: number;
  paddingRatio?: number;
  maxSearchRadius?: number;
}

export interface ContourGenerationResult {
  polylines: CadPolylineEntity[];
  zMin: number;
  zMax: number;
  levels: number[];
  pointCount: number;
}

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Pontos RTK ajustados com cota Z para interpolação. */
export function extractSurveyElevationPoints(entities: CadEntity[]): ElevationSample[] {
  const fromRtk = entities.filter(
    (e): e is Extract<CadEntity, { type: "point" }> =>
      e.type === "point" && e.layerId === "rtk_points",
  );

  const points = fromRtk.length > 0 ? fromRtk : entities.filter((e) => e.type === "point");

  return points
    .map((p) => ({ x: p.x, y: p.y, z: p.z }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
}

function idwAt(
  x: number,
  y: number,
  samples: ElevationSample[],
  power: number,
  maxRadius: number,
): number {
  let num = 0;
  let den = 0;

  for (const p of samples) {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < 1e-6) return p.z;
    if (d > maxRadius) continue;
    const w = 1 / d ** power;
    num += w * p.z;
    den += w;
  }

  return den > 0 ? num / den : NaN;
}

function buildThresholds(zMin: number, zMax: number, interval: number): number[] {
  if (interval <= 0) return [];
  const start = Math.ceil(zMin / interval) * interval;
  const end = Math.floor(zMax / interval) * interval;
  const levels: number[] = [];
  for (let z = start; z <= end + 1e-9; z += interval) {
    levels.push(Number(z.toFixed(6)));
  }
  return levels;
}

function gridToWorld(
  gx: number,
  gy: number,
  cols: number,
  rows: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): CadVertex {
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  return {
    x: minX + (gx / cols) * spanX,
    y: minY + (gy / rows) * spanY,
    z: 0,
  };
}

function isMajorContourLevel(z: number, interval: number, majorInterval: number): boolean {
  if (majorInterval <= interval) return true;
  const step = Math.round(majorInterval / interval);
  if (step <= 1) return true;
  const index = Math.round(z / interval);
  return index % step === 0;
}

export function generateContoursFromPoints(
  samples: ElevationSample[],
  options: ContourGenerationOptions,
): ContourGenerationResult {
  if (samples.length < 3) {
    throw new Error("São necessários pelo menos 3 pontos com cota Z para gerar curvas de nível.");
  }

  const interval = options.interval;
  if (!Number.isFinite(interval) || interval <= 0) {
    throw new Error("Intervalo de curvas deve ser maior que zero.");
  }

  const majorInterval = options.majorInterval ?? interval * 5;

  const power = options.idwPower ?? 2;
  const padding = options.paddingRatio ?? 0.08;
  const cols = Math.min(Math.max(options.gridCols ?? 80, 40), 160);
  const rows = Math.min(Math.max(options.gridRows ?? 80, 40), 160);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;

  for (const p of samples) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    zMin = Math.min(zMin, p.z);
    zMax = Math.max(zMax, p.z);
  }

  const padX = (maxX - minX) * padding || interval;
  const padY = (maxY - minY) * padding || interval;
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const maxRadius =
    options.maxSearchRadius ?? Math.max(spanX, spanY) * 0.75;

  const values = new Float64Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = minX + (i / (cols - 1)) * spanX;
      const y = minY + (j / (rows - 1)) * spanY;
      values[i + j * cols] = idwAt(x, y, samples, power, maxRadius);
    }
  }

  const levels = buildThresholds(zMin, zMax, interval);
  if (levels.length === 0) {
    throw new Error("Intervalo de curvas muito grande para a variação de cotas dos pontos.");
  }

  const generator = d3Contours().size([cols, rows]).thresholds(levels);
  const polygons = generator(values);

  const polylines: CadPolylineEntity[] = [];

  for (const poly of polygons) {
    const elevation = poly.value;
    for (const polygon of poly.coordinates) {
      for (const ring of polygon) {
        if (ring.length < 2) continue;
        const vertices = ring.map(([gx, gy]) => {
          const w = gridToWorld(gx, gy, cols, rows, minX, maxX, minY, maxY);
          return { ...w, z: elevation };
        });
        polylines.push({
          id: newId("cn"),
          type: "polyline",
          layerId: "contours",
          vertices,
          closed: ring.length > 3,
          name: `CN ${elevation.toFixed(2)} m`,
          contourMajor: isMajorContourLevel(elevation, interval, majorInterval),
        });
      }
    }
  }

  return {
    polylines,
    zMin,
    zMax,
    levels,
    pointCount: samples.length,
  };
}

export const CONTOUR_LAYER = {
  id: "contours",
  name: "CURVAS_NIVEL",
  color: "#ef4444",
  visible: true,
  locked: true,
} as const;

export const CONTOUR_COLOR_MAJOR = "#ef4444";
export const CONTOUR_COLOR_MINOR = "#9ca3af";

export function contoursToEntities(result: ContourGenerationResult): CadPolylineEntity[] {
  return result.polylines;
}

export function removeContourEntities(entities: CadEntity[]): CadEntity[] {
  return entities.filter((e) => e.layerId !== CONTOUR_LAYER.id);
}

/** Extrai a cota (m) de uma curva de nível. */
export function parseContourElevation(poly: CadPolylineEntity): number | null {
  for (const v of poly.vertices) {
    if (Number.isFinite(v.z)) return v.z;
  }
  const match = poly.name?.match(/([\d.,]+)/);
  if (!match) return null;
  const n = Number(match[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Rótulo de cota para curvas mestras (ex.: 245,50 m). */
export function formatContourElevationLabel(elevation: number, decimals = 2): string {
  const value = elevation.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${value} m`;
}

/** Meio do maior segmento — melhor legibilidade que o vértice central do array. */
export function pickContourLabelVertex(vertices: CadVertex[]): CadVertex | null {
  if (vertices.length === 0) return null;
  if (vertices.length === 1) return vertices[0];

  let best: CadVertex | null = null;
  let bestLen = -1;

  const consider = (a: CadVertex, b: CadVertex) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > bestLen) {
      bestLen = len;
      best = {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        z: a.z ?? b.z,
      };
    }
  };

  for (let i = 0; i < vertices.length - 1; i++) {
    consider(vertices[i], vertices[i + 1]);
  }

  if (vertices.length >= 3) {
    consider(vertices[vertices.length - 1], vertices[0]);
  }

  return best ?? vertices[Math.floor(vertices.length / 2)];
}
