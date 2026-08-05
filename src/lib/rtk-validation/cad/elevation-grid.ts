import type { ElevationSample } from "./contour";

export interface ElevationGridOptions {
  gridCols?: number;
  gridRows?: number;
  idwPower?: number;
  paddingRatio?: number;
  maxSearchRadius?: number;
}

export interface ElevationGridResult {
  values: Float64Array;
  cols: number;
  rows: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  zMin: number;
  zMax: number;
  pointCount: number;
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

/** Grade IDW de cotas a partir de pontos de levantamento. */
export function buildIdwElevationGrid(
  samples: ElevationSample[],
  options: ElevationGridOptions = {},
): ElevationGridResult {
  if (samples.length < 3) {
    throw new Error("São necessários pelo menos 3 pontos com cota Z.");
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

  const padX = (maxX - minX) * padding || 1;
  const padY = (maxY - minY) * padding || 1;
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const maxRadius = options.maxSearchRadius ?? Math.max(spanX, spanY) * 0.75;

  const values = new Float64Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = minX + (i / (cols - 1)) * spanX;
      const y = minY + (j / (rows - 1)) * spanY;
      values[i + j * cols] = idwAt(x, y, samples, power, maxRadius);
    }
  }

  return { values, cols, rows, minX, maxX, minY, maxY, zMin, zMax, pointCount: samples.length };
}
