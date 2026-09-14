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
  /** Passes de blur 3×3 na grelha antes das iso-linhas. Padrão: 1. */
  gridSmoothPasses?: number;
  /** Iterações Chaikin nas polilinhas. Padrão: 2. Use 0 para desligar. */
  lineSmoothIterations?: number;
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

/** Interpola posição UTM a partir de nós georreferenciados da grelha (DEM / WGS84). */
function gridToWorldFromNodes(
  gx: number,
  gy: number,
  cols: number,
  rows: number,
  nodeX: Float64Array,
  nodeY: Float64Array,
): CadVertex {
  const fx = Math.max(0, Math.min(cols - 1, gx));
  const fy = Math.max(0, Math.min(rows - 1, gy));
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const i1 = Math.min(cols - 1, i0 + 1);
  const j1 = Math.min(rows - 1, j0 + 1);
  const tx = fx - i0;
  const ty = fy - j0;

  const idx = (i: number, j: number) => i + j * cols;
  const x00 = nodeX[idx(i0, j0)]!;
  const x10 = nodeX[idx(i1, j0)]!;
  const x01 = nodeX[idx(i0, j1)]!;
  const x11 = nodeX[idx(i1, j1)]!;
  const y00 = nodeY[idx(i0, j0)]!;
  const y10 = nodeY[idx(i1, j0)]!;
  const y01 = nodeY[idx(i0, j1)]!;
  const y11 = nodeY[idx(i1, j1)]!;

  const x =
    (1 - tx) * (1 - ty) * x00 + tx * (1 - ty) * x10 + (1 - tx) * ty * x01 + tx * ty * x11;
  const y =
    (1 - tx) * (1 - ty) * y00 + tx * (1 - ty) * y10 + (1 - tx) * ty * y01 + tx * ty * y11;

  return { x, y, z: 0 };
}

function isMajorContourLevel(z: number, interval: number, majorInterval: number): boolean {
  if (majorInterval <= interval) return true;
  const step = Math.round(majorInterval / interval);
  if (step <= 1) return true;
  const index = Math.round(z / interval);
  return index % step === 0;
}

/** Blur 3×3 na grelha de cotas — reduz zigue-zague das iso-linhas. */
function smoothElevationGrid(
  values: Float64Array,
  cols: number,
  rows: number,
  passes: number,
): Float64Array {
  if (passes <= 0) return values;

  let src = values;
  for (let pass = 0; pass < passes; pass++) {
    const dst = new Float64Array(cols * rows);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        let sum = 0;
        let count = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ni = i + di;
            const nj = j + dj;
            if (ni < 0 || ni >= cols || nj < 0 || nj >= rows) continue;
            const v = src[ni + nj * cols];
            if (!Number.isFinite(v)) continue;
            sum += v;
            count += 1;
          }
        }
        const cur = src[i + j * cols];
        dst[i + j * cols] = count > 0 ? sum / count : cur;
      }
    }
    src = dst;
  }
  return src;
}

/** Chaikin corner-cutting — suaviza polilinhas mantendo a cota Z. */
export function smoothContourVertices(
  vertices: CadVertex[],
  closed: boolean,
  iterations = 2,
): CadVertex[] {
  if (vertices.length < 3 || iterations <= 0) return vertices;

  let pts = vertices.map((v) => ({ ...v }));
  for (let iter = 0; iter < iterations; iter++) {
    const next: CadVertex[] = [];
    const n = pts.length;
    const segCount = closed ? n : n - 1;
    if (segCount < 1) break;

    for (let i = 0; i < segCount; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % n]!;
      const z = a.z ?? b.z;
      next.push({
        x: a.x * 0.75 + b.x * 0.25,
        y: a.y * 0.75 + b.y * 0.25,
        z,
      });
      next.push({
        x: a.x * 0.25 + b.x * 0.75,
        y: a.y * 0.25 + b.y * 0.75,
        z,
      });
    }
    pts = next;
  }
  return pts;
}

function decimateVertices(vertices: CadVertex[], closed: boolean, minDistM: number): CadVertex[] {
  if (vertices.length <= 2 || minDistM <= 0) return vertices;

  const out: CadVertex[] = [vertices[0]!];
  for (let i = 1; i < vertices.length; i++) {
    const prev = out[out.length - 1]!;
    const cur = vertices[i]!;
    if (Math.hypot(cur.x - prev.x, cur.y - prev.y) >= minDistM) {
      out.push(cur);
    }
  }

  if (closed && out.length >= 3) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (Math.hypot(first.x - last.x, first.y - last.y) < minDistM) {
      out.pop();
    }
  }

  return out.length >= 2 ? out : vertices;
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

  return generateContoursFromGrid(values, cols, rows, minX, maxX, minY, maxY, interval, {
    majorInterval: options.majorInterval,
    zMin,
    zMax,
    pointCount: samples.length,
    gridSmoothPasses: options.gridSmoothPasses,
    lineSmoothIterations: options.lineSmoothIterations,
  });
}

/** Gera curvas a partir de uma grelha de cotas (ex.: DEM SRTM). */
export function generateContoursFromGrid(
  values: Float64Array,
  cols: number,
  rows: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  interval: number,
  options?: {
    majorInterval?: number;
    zMin?: number;
    zMax?: number;
    pointCount?: number;
    gridSmoothPasses?: number;
    lineSmoothIterations?: number;
    /** Nós UTM por célula — alinha curvas DEM com Mapbox/georef. */
    nodeX?: Float64Array;
    nodeY?: Float64Array;
  },
): ContourGenerationResult {
  if (!Number.isFinite(interval) || interval <= 0) {
    throw new Error("Intervalo de curvas deve ser maior que zero.");
  }

  const majorInterval = options?.majorInterval ?? interval * 5;
  const gridSmoothPasses = options?.gridSmoothPasses ?? 1;
  const lineSmoothIterations = options?.lineSmoothIterations ?? 2;
  const nodeX = options?.nodeX;
  const nodeY = options?.nodeY;
  const useGeorefNodes =
    nodeX != null &&
    nodeY != null &&
    nodeX.length === cols * rows &&
    nodeY.length === cols * rows;

  let zMin = options?.zMin ?? Infinity;
  let zMax = options?.zMax ?? -Infinity;
  if (options?.zMin == null || options?.zMax == null) {
    for (let i = 0; i < values.length; i++) {
      const z = values[i];
      if (!Number.isFinite(z)) continue;
      zMin = Math.min(zMin, z);
      zMax = Math.max(zMax, z);
    }
  }

  if (!Number.isFinite(zMin) || !Number.isFinite(zMax) || zMin >= zMax) {
    throw new Error("Grelha de cotas inválida — poucos dados de elevação na área.");
  }

  const spanX = Math.abs(maxX - minX);
  const spanY = Math.abs(maxY - minY);
  const minVertexSpacing = Math.max(spanX, spanY) / 400;

  const smoothedValues = smoothElevationGrid(values, cols, rows, gridSmoothPasses);

  const levels = buildThresholds(zMin, zMax, interval);
  if (levels.length === 0) {
    throw new Error("Intervalo de curvas muito grande para a variação de cotas da área.");
  }

  const generator = d3Contours().size([cols, rows]).thresholds(levels);
  const polygons = generator(smoothedValues);

  const polylines: CadPolylineEntity[] = [];

  for (const poly of polygons) {
    const elevation = poly.value;
    for (const polygon of poly.coordinates) {
      for (const ring of polygon) {
        if (ring.length < 2) continue;
        let vertices = ring.map(([gx, gy]) => {
          const w = useGeorefNodes
            ? gridToWorldFromNodes(gx, gy, cols, rows, nodeX, nodeY)
            : gridToWorld(gx, gy, cols, rows, minX, maxX, minY, maxY);
          return { ...w, z: elevation };
        });
        const closed = ring.length > 3;
        vertices = smoothContourVertices(vertices, closed, lineSmoothIterations);
        vertices = decimateVertices(vertices, closed, minVertexSpacing);
        if (vertices.length < 2) continue;
        polylines.push({
          id: newId("cn"),
          type: "polyline",
          layerId: "contours",
          vertices,
          closed,
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
    pointCount: options?.pointCount ?? values.length,
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
