import type { CadPolylineEntity } from "./types";

export type ProfileChartMetrics = {
  distances: number[];
  elevations: number[];
  minD: number;
  maxD: number;
  minZ: number;
  maxZ: number;
  spanD: number;
  zMin: number;
  zMax: number;
  spanZ: number;
};

/** Intervalo padrão dos eixos do gráfico de perfil (m). */
export const PROFILE_DISTANCE_TICK_M = 20;
export const PROFILE_ELEVATION_TICK_M = 2;

/** Valores de tick alinhados a um passo fixo (inclui extremos arredondados). */
export function buildProfileAxisTicks(min: number, max: number, step: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || step <= 0) return [];
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const start = Math.floor(lo / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= hi + step * 0.001; v += step) {
    ticks.push(Number(v.toFixed(4)));
  }
  return ticks;
}

export function profileChartAxisTicks(
  metrics: ProfileChartMetrics,
  distanceStep = PROFILE_DISTANCE_TICK_M,
  elevationStep = PROFILE_ELEVATION_TICK_M,
) {
  return {
    distanceTicks: buildProfileAxisTicks(metrics.minD, metrics.maxD, distanceStep),
    elevationTicks: buildProfileAxisTicks(metrics.minZ, metrics.maxZ, elevationStep),
  };
}

export function computeProfileChartMetrics(profile: CadPolylineEntity): ProfileChartMetrics | null {
  const pts = profile.vertices;
  if (pts.length < 2) return null;

  const distances = pts.map((p) => p.x);
  const elevations = pts.map((p) => p.z);
  const minD = Math.min(...distances);
  const maxD = Math.max(...distances);
  const minZ = Math.min(...elevations);
  const maxZ = Math.max(...elevations);
  const spanD = Math.max(maxD - minD, 1);
  const padZ = Math.max((maxZ - minZ) * 0.12, 0.5);
  const zMin = minZ - padZ;
  const zMax = maxZ + padZ;
  const spanZ = Math.max(zMax - zMin, 1);

  return { distances, elevations, minD, maxD, minZ, maxZ, spanD, zMin, zMax, spanZ };
}

export function profileChartPointCoords(
  metrics: ProfileChartMetrics,
  chartW: number,
  chartH: number,
  margin: { left: number; right: number; top: number; bottom: number },
) {
  const innerW = chartW - margin.left - margin.right;
  const innerH = chartH - margin.top - margin.bottom;
  const toX = (d: number) => margin.left + ((d - metrics.minD) / metrics.spanD) * innerW;
  const toY = (z: number) => margin.top + innerH - ((z - metrics.zMin) / metrics.spanZ) * innerH;
  return { innerW, innerH, toX, toY };
}
