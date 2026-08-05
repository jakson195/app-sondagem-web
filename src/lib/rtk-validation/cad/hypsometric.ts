import { buildIdwElevationGrid } from "./elevation-grid";
import type { ElevationSample } from "./contour";
import type { CadRasterOverlay } from "./types";

/** Paleta hipsométrica: azul (baixo) → verde → amarelo → vermelho (alto). */
export const HYPSOMETRIC_STOPS: Array<{ t: number; r: number; g: number; b: number }> = [
  { t: 0, r: 26, g: 51, b: 153 },
  { t: 0.25, r: 51, g: 136, b: 204 },
  { t: 0.5, r: 102, g: 187, b: 106 },
  { t: 0.75, r: 255, g: 213, b: 79 },
  { t: 1, r: 198, g: 40, b: 40 },
];

export function hypsometricColor(z: number, zMin: number, zMax: number): [number, number, number, number] {
  if (!Number.isFinite(z)) return [0, 0, 0, 0];
  const span = zMax - zMin;
  const t = span > 0 ? Math.max(0, Math.min(1, (z - zMin) / span)) : 0.5;

  for (let i = 0; i < HYPSOMETRIC_STOPS.length - 1; i++) {
    const a = HYPSOMETRIC_STOPS[i];
    const b = HYPSOMETRIC_STOPS[i + 1];
    if (t >= a.t && t <= b.t) {
      const u = (t - a.t) / (b.t - a.t || 1);
      return [
        Math.round(a.r + (b.r - a.r) * u),
        Math.round(a.g + (b.g - a.g) * u),
        Math.round(a.b + (b.b - a.b) * u),
        240,
      ];
    }
  }

  const last = HYPSOMETRIC_STOPS[HYPSOMETRIC_STOPS.length - 1];
  return [last.r, last.g, last.b, 255];
}

function newRasterId() {
  return `raster_${Math.random().toString(36).slice(2, 10)}`;
}

export interface HypsometricOptions {
  gridCols?: number;
  gridRows?: number;
  opacity?: number;
}

/** Gera mapa hipsométrico colorido (PNG data URL) a partir de pontos com cota. */
export function generateHypsometricRaster(
  samples: ElevationSample[],
  options: HypsometricOptions = {},
): CadRasterOverlay {
  const grid = buildIdwElevationGrid(samples, {
    gridCols: options.gridCols ?? 120,
    gridRows: options.gridRows ?? 120,
  });

  const canvas = document.createElement("canvas");
  canvas.width = grid.cols;
  canvas.height = grid.rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não disponível.");

  const imageData = ctx.createImageData(grid.cols, grid.rows);
  for (let j = 0; j < grid.rows; j++) {
    for (let i = 0; i < grid.cols; i++) {
      const z = grid.values[i + j * grid.cols];
      const [r, g, b, a] = hypsometricColor(z, grid.zMin, grid.zMax);
      const idx = (i + (grid.rows - 1 - j) * grid.cols) * 4;
      imageData.data[idx] = r;
      imageData.data[idx + 1] = g;
      imageData.data[idx + 2] = b;
      imageData.data[idx + 3] = a;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  return {
    id: newRasterId(),
    name: "Mapa hipsométrico",
    kind: "hypsometric",
    imageDataUrl: canvas.toDataURL("image/png"),
    minX: grid.minX,
    minY: grid.minY,
    maxX: grid.maxX,
    maxY: grid.maxY,
    opacity: options.opacity ?? 0.85,
    visible: true,
    zMin: grid.zMin,
    zMax: grid.zMax,
  };
}
