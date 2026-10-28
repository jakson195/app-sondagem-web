import type { Position } from "geojson";
import {
  closeHostWithLots,
  detectBlockFrontage,
  detectRowFrontage,
  geometryIsValid,
  getMainAxisAzimuth,
  measureLotFrontAndDepth,
  polygonAreaPlanarM2,
  polygonInteriorOverlapM2,
  sortLotsForNumbering,
  splitThroughBlock,
  subdivideRowByWidths,
  subtractObstaclesFromPolys,
  type LoteResult,
} from "./lot-subdivision";

export const DEFAULT_EQUITY_CONFIG = {
  toleranciaArea: 0.05,
  maxCoeficienteVariacao: 0.05,
  maxIterations: 100,
} as const;

export type EquityConfig = {
  areaTarget?: number;
  toleranciaArea?: number;
  maxCoeficienteVariacao?: number;
  maxIterations?: number;
};

export type EquityMetrics = {
  quantidade: number;
  media: number;
  menor: number;
  maior: number;
  erro: number;
  desvioPadrao: number;
  coeficienteVariacao: number;
};

export type EquityQuadraReport = EquityMetrics & {
  quadra: string;
  areaAlvo: number;
};

export type EquityOptimizeInput = {
  host: Position[];
  lotes: LoteResult[];
  streetRings?: Position[][];
  origin?: Position;
  testadaMinimaM: number;
  profundidadeM: number;
  areaMinimaM2?: number;
  percentualEsquina?: number;
  forbiddenRings?: Position[][];
  config?: EquityConfig;
};

export type EquityOptimizeResult = {
  lotes: LoteResult[];
  metrics: EquityMetrics;
  report: EquityQuadraReport;
  accepted: boolean;
};

const SLIVER_M2 = 4;
const PESO_VALIDADE = 1_000_000;
const PESO_ACESSO = 1_000_000;
const PESO_AREA_MIN = 1_000_000;
const PESO_TESTADA = 1_000_000;
const PESO_EQUIDADE = 100;
const PESO_GEOMETRIA = 10;
const MIN_WIDTH_M = 0.8;

function dropClosing(ring: Position[]): Position[] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
  return ring;
}

function closeRing(ring: Position[]): Position[] {
  const pts = dropClosing(ring);
  if (pts.length === 0) return [];
  const first = pts[0]!;
  return [...pts, [first[0], first[1]]];
}

function originOf(ring: Position[]): Position {
  const pts = dropClosing(ring);
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p[0];
    sy += p[1];
  }
  const n = Math.max(pts.length, 1);
  return [sx / n, sy / n];
}

function streetDirFromAz(azimuthDeg: number): { dirS: Position; dirD: Position } {
  const az = ((azimuthDeg % 360) + 360) % 360;
  const rad = (az * Math.PI) / 180;
  return {
    dirS: [Math.sin(rad), Math.cos(rad)],
    dirD: [Math.cos(rad), -Math.sin(rad)],
  };
}

function lotAlongKey(ring: Position[], dirS: Position): number {
  const c = originOf(ring);
  return c[0] * dirS[0] + c[1] * dirS[1];
}

function resolveConfig(config?: EquityConfig): Required<Omit<EquityConfig, "areaTarget">> & { areaTarget?: number } {
  return {
    areaTarget: config?.areaTarget,
    toleranciaArea: config?.toleranciaArea ?? DEFAULT_EQUITY_CONFIG.toleranciaArea,
    maxCoeficienteVariacao: config?.maxCoeficienteVariacao ?? DEFAULT_EQUITY_CONFIG.maxCoeficienteVariacao,
    maxIterations: config?.maxIterations ?? DEFAULT_EQUITY_CONFIG.maxIterations,
  };
}

/** SSE em relação à média, desvio-padrão (população) e coeficiente de variação. */
export function calcularErroDeEquidade(areas: number[]): EquityMetrics {
  const valid = areas.filter((a) => Number.isFinite(a) && a > 0);
  const quantidade = valid.length;
  if (quantidade === 0) {
    return {
      quantidade: 0,
      media: 0,
      menor: 0,
      maior: 0,
      erro: 0,
      desvioPadrao: 0,
      coeficienteVariacao: 0,
    };
  }
  const media = valid.reduce((s, a) => s + a, 0) / quantidade;
  let erro = 0;
  let menor = valid[0]!;
  let maior = valid[0]!;
  for (const area of valid) {
    const d = area - media;
    erro += d * d;
    if (area < menor) menor = area;
    if (area > maior) maior = area;
  }
  const desvioPadrao = Math.sqrt(erro / quantidade);
  const coeficienteVariacao = media > 1e-9 ? desvioPadrao / media : 0;
  return { quantidade, media, menor, maior, erro, desvioPadrao, coeficienteVariacao };
}

export function relatorioEquidadeQuadra(quadra: string, areas: number[], areaAlvo: number): EquityQuadraReport {
  return { quadra, areaAlvo, ...calcularErroDeEquidade(areas) };
}

function weightedResidual(areas: number[], targets: number[]): number {
  let err = 0;
  for (let i = 0; i < areas.length; i++) {
    const d = (areas[i] ?? 0) - (targets[i] ?? 0);
    err += d * d;
  }
  return err;
}

function weightedCv(areas: number[], targets: number[]): number {
  if (areas.length === 0) return 0;
  const ratios = areas.map((a, i) => {
    const t = targets[i] ?? 0;
    return t > 1e-9 ? a / t : 1;
  });
  return calcularErroDeEquidade(ratios).coeficienteVariacao;
}

export function isApproximatelyRectangular(ring: Position[]): boolean {
  const pts = dropClosing(ring);
  if (pts.length < 4) return false;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const bbox = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
  const area = polygonAreaPlanarM2(pts);
  if (!(bbox > 1) || !(area > 1)) return false;
  if (area / bbox < 0.9) return false;
  if (pts.length <= 6) return true;
  return pts.length <= 10 && area / bbox >= 0.95;
}

function minDistPointToRing(p: Position, ring: Position[]): number {
  const pts = dropClosing(ring);
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    if (len2 < 1e-18) {
      best = Math.min(best, Math.hypot(p[0] - a[0], p[1] - a[1]));
      continue;
    }
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy)));
  }
  return best;
}

function edgeAlongStreet(a: Position, b: Position, streetRings: Position[][]): boolean {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.4 || streetRings.length === 0) return false;
  let hits = 0;
  for (const t of [0.25, 0.5, 0.75]) {
    const p: Position = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    let near = false;
    for (const street of streetRings) {
      if (minDistPointToRing(p, street) <= 2.4) {
        near = true;
        break;
      }
    }
    if (near) hits += 1;
  }
  return hits >= 2;
}

function isCornerLot(ring: Position[], streetRings: Position[][]): boolean {
  if (streetRings.length === 0) return false;
  const pts = dropClosing(ring);
  const dirs: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    if (!edgeAlongStreet(a, b, streetRings)) continue;
    dirs.push(Math.atan2(b[1] - a[1], b[0] - a[0]));
  }
  for (let i = 0; i < dirs.length; i++) {
    for (let j = i + 1; j < dirs.length; j++) {
      let d = Math.abs(dirs[i]! - dirs[j]!);
      if (d > Math.PI) d = 2 * Math.PI - d;
      if (d > (40 * Math.PI) / 180) return true;
    }
  }
  return false;
}

function lotHasStreetAccess(ring: Position[], streetRings: Position[][], azimuthDeg: number, centroid?: Position): boolean {
  if (streetRings.length === 0) return true;
  const dims = measureLotFrontAndDepth(ring, streetRings, azimuthDeg, centroid);
  if (dims.testadaM >= 0.8) return true;
  const c = originOf(ring);
  for (const street of streetRings) {
    if (minDistPointToRing(c, street) <= 8) return true;
  }
  return false;
}

function geometryPenalty(ring: Position[]): number {
  const pts = dropClosing(ring);
  if (pts.length < 3) return 10;
  const area = polygonAreaPlanarM2(pts);
  let peri = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    peri += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  if (peri < 1e-6) return 10;
  const compact = (4 * Math.PI * area) / (peri * peri);
  return Math.max(0, 0.35 - compact);
}

function overlapsForbidden(ring: Position[], forbidden: Position[][]): boolean {
  const area = polygonAreaPlanarM2(ring);
  for (const obs of forbidden) {
    if (dropClosing(obs).length < 3) continue;
    if (polygonInteriorOverlapM2(ring, obs) > Math.max(1.5, area * 0.02)) return true;
  }
  return false;
}

export function scoreEquidadeSolucao(input: {
  areas: number[];
  targets: number[];
  rings: Position[][];
  streetRings: Position[][];
  host: Position[];
  azimuthDeg: number;
  centroid?: Position;
  minAreaM2: number;
  minTestadaM: number;
  forbiddenRings?: Position[][];
}): number {
  const { areas, targets, rings, streetRings, host, azimuthDeg, centroid, minAreaM2, minTestadaM, forbiddenRings } =
    input;
  let invalid = 0;
  let noAccess = 0;
  let belowArea = 0;
  let belowTestada = 0;
  let geom = 0;
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i] ?? [];
    const area = areas[i] ?? 0;
    if (!geometryIsValid(ring)) invalid += 1;
    if (polygonInteriorOverlapM2(ring, host) < area * 0.82) invalid += 1;
    if (forbiddenRings && overlapsForbidden(ring, forbiddenRings)) invalid += 1;
    if (minAreaM2 > 0 && area + 1e-6 < minAreaM2 * 0.95) belowArea += 1;
    const dims = measureLotFrontAndDepth(ring, streetRings, azimuthDeg, centroid);
    if (minTestadaM > 0 && dims.testadaM + 0.08 < minTestadaM * 0.88) belowTestada += 1;
    if (!lotHasStreetAccess(ring, streetRings, azimuthDeg, centroid)) noAccess += 1;
    geom += geometryPenalty(ring);
  }
  const metrics = calcularErroDeEquidade(areas);
  const targetsDiffer = targets.some((t, i) => Math.abs(t - (targets[0] ?? t)) > 1e-6);
  const equity = targetsDiffer ? weightedCv(areas, targets) : metrics.coeficienteVariacao;
  const sseNorm = weightedResidual(areas, targets) / Math.max(metrics.media * metrics.media, 1);
  return (
    invalid * PESO_VALIDADE +
    noAccess * PESO_ACESSO +
    belowArea * PESO_AREA_MIN +
    belowTestada * PESO_TESTADA +
    equity * PESO_EQUIDADE +
    sseNorm * 0.05 +
    geom * PESO_GEOMETRIA
  );
}

function assignLotToRow(lotRing: Position[], rows: Position[][]): number {
  if (rows.length <= 1) return 0;
  let best = 0;
  let bestOv = -1;
  for (let i = 0; i < rows.length; i++) {
    const ov = polygonInteriorOverlapM2(lotRing, rows[i] ?? []);
    if (ov > bestOv) {
      bestOv = ov;
      best = i;
    }
  }
  return best;
}

function measureRowAlong(row: Position[], azimuthDeg: number, streetRings: Position[][], centroid?: Position): number {
  const dims = measureLotFrontAndDepth(row, streetRings, azimuthDeg, centroid);
  if (dims.testadaM > 0.5) return dims.testadaM;
  const { dirS } = streetDirFromAz(azimuthDeg);
  const pts = dropClosing(row);
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const p of pts) {
    const t = p[0] * dirS[0] + p[1] * dirS[1];
    tMin = Math.min(tMin, t);
    tMax = Math.max(tMax, t);
  }
  return Number.isFinite(tMin) ? tMax - tMin : 0;
}

function packRow(
  row: Position[],
  azimuthDeg: number,
  widths: number[],
  streetRings: Position[][],
  origin: Position,
  centroid?: Position,
): Position[][][] {
  const cut = subdivideRowByWidths(row, azimuthDeg, widths, streetRings, origin, centroid, 0);
  return closeHostWithLots(row, cut, origin);
}

function lotPolysToResult(
  polys: Position[][][],
  azimuthDeg: number,
  streetRings: Position[][],
  centroid: Position | undefined,
  quadra: string,
  numeros: string[],
): LoteResult[] {
  const ordered = sortLotsForNumbering(polys, azimuthDeg, (poly) => poly[0] ?? []);
  return ordered.map((coords, i) => {
    const closed = coords.map(closeRing);
    const ring = closed[0] ?? [];
    return {
      coordinates: closed,
      area_m2: polygonAreaPlanarM2(ring),
      testada_m: measureLotFrontAndDepth(ring, streetRings, azimuthDeg, centroid).testadaM,
      quadra,
      numero: numeros[i] ?? `Lote ${String(i + 1).padStart(2, "0")}`,
      remainder: false,
    };
  });
}

function currentWidths(
  lots: LoteResult[],
  azimuthDeg: number,
  streetRings: Position[][],
  centroid: Position | undefined,
  along: number,
): number[] {
  const { dirS } = streetDirFromAz(azimuthDeg);
  const sorted = [...lots].sort((a, b) => {
    return lotAlongKey(a.coordinates[0] ?? [], dirS) - lotAlongKey(b.coordinates[0] ?? [], dirS);
  });
  const raw = sorted.map((lote) =>
    Math.max(MIN_WIDTH_M, measureLotFrontAndDepth(lote.coordinates[0] ?? [], streetRings, azimuthDeg, centroid).testadaM),
  );
  const sum = raw.reduce((s, w) => s + w, 0);
  if (sum <= 1e-6 || along <= 1e-6) return raw;
  return raw.map((w) => (w / sum) * along);
}

function equalWidths(along: number, n: number): number[] {
  if (n <= 0 || along <= 0) return [];
  return Array.from({ length: n }, () => along / n);
}

function areaOfPackedIndex(packed: Position[][][], index: number): number {
  return polygonAreaPlanarM2(packed[index]?.[0] ?? []);
}

/** Recorta a fileira para cada lote atingir a área-alvo (último recebe o resto). */
export function planTargetAreaWidths(
  row: Position[],
  targets: number[],
  azimuthDeg: number,
  minWidthM: number,
  streetRings: Position[][],
  origin: Position,
  centroid?: Position,
): number[] | null {
  const n = targets.length;
  if (n <= 0) return null;
  const along = measureRowAlong(row, azimuthDeg, streetRings, centroid);
  if (along < minWidthM * n - 0.05) return null;
  if (n === 1) return [along];

  const widths: number[] = [];
  let used = 0;
  for (let i = 0; i < n - 1; i++) {
    const remainingN = n - i;
    const remainingLen = along - used;
    const lo0 = minWidthM;
    const hi0 = remainingLen - minWidthM * (remainingN - 1);
    if (hi0 + 1e-6 < lo0) return null;
    let lo = lo0;
    let hi = hi0;
    const want = targets[i] ?? 0;
    for (let iter = 0; iter < 12; iter++) {
      const mid = (lo + hi) / 2;
      const trial = [...widths, mid, remainingLen - mid];
      const packed = subdivideRowByWidths(row, azimuthDeg, trial, streetRings, origin, centroid, 0);
      if (packed.length < widths.length + 1) {
        hi = mid;
        continue;
      }
      const area = areaOfPackedIndex(packed, widths.length);
      if (area < want) lo = mid;
      else hi = mid;
    }
    const chosen = Math.min(Math.max((lo + hi) / 2, lo0), hi0);
    widths.push(chosen);
    used += chosen;
  }
  widths.push(Math.max(minWidthM, along - used));
  const sum = widths.reduce((s, w) => s + w, 0);
  if (sum <= 1e-6) return null;
  return widths.map((w) => (w / sum) * along);
}

function buildTargets(
  n: number,
  hostArea: number,
  cornerFlags: boolean[],
  percentualEsquina: number,
  areaTarget?: number,
): number[] {
  const base = hostArea / Math.max(n, 1);
  const scale = percentualEsquina > 0 ? 1 + percentualEsquina / 100 : 1;
  const raw = Array.from({ length: n }, (_, i) => (cornerFlags[i] && scale > 1 ? base * scale : areaTarget && areaTarget > 0 ? Math.min(areaTarget, base * 1.15) : base));
  const sum = raw.reduce((s, v) => s + v, 0);
  if (sum <= 1e-9) return Array.from({ length: n }, () => base);
  return raw.map((v) => (v / sum) * hostArea);
}

function detectCornerFlags(
  lots: LoteResult[],
  azimuthDeg: number,
  streetRings: Position[][],
  percentualEsquina: number,
): boolean[] {
  const { dirS } = streetDirFromAz(azimuthDeg);
  const sorted = [...lots].sort(
    (a, b) => lotAlongKey(a.coordinates[0] ?? [], dirS) - lotAlongKey(b.coordinates[0] ?? [], dirS),
  );
  return sorted.map((lote, i) => {
    if (percentualEsquina <= 0) return false;
    if (isCornerLot(lote.coordinates[0] ?? [], streetRings)) return true;
    return i === 0 || i === sorted.length - 1;
  });
}

type Candidate = {
  widths: number[];
  packed: Position[][][];
  areas: number[];
  score: number;
};

function evaluateCandidate(
  packed: Position[][][],
  expectedN: number,
  targets: number[],
  row: Position[],
  azimuthDeg: number,
  streetRings: Position[][],
  centroid: Position | undefined,
  minAreaM2: number,
  minTestadaM: number,
  forbiddenRings?: Position[][],
): Omit<Candidate, "widths"> | null {
  if (packed.length !== expectedN) return null;
  const rings = packed.map((poly) => poly[0] ?? []);
  const areas = rings.map((ring) => polygonAreaPlanarM2(ring));
  if (areas.some((a) => !(a >= SLIVER_M2))) return null;
  const score = scoreEquidadeSolucao({
    areas,
    targets,
    rings,
    streetRings,
    host: row,
    azimuthDeg,
    centroid,
    minAreaM2,
    minTestadaM,
    forbiddenRings,
  });
  return { packed, areas, score };
}

function hillClimbWidths(
  row: Position[],
  start: number[],
  targets: number[],
  azimuthDeg: number,
  streetRings: Position[][],
  origin: Position,
  centroid: Position | undefined,
  minWidthM: number,
  minAreaM2: number,
  minTestadaM: number,
  maxIterations: number,
  maxCv: number,
  forbiddenRings?: Position[][],
): Candidate | null {
  const along = start.reduce((s, w) => s + w, 0);
  let widths = start.slice();
  let packed = packRow(row, azimuthDeg, widths, streetRings, origin, centroid);
  let evald = evaluateCandidate(
    packed,
    start.length,
    targets,
    row,
    azimuthDeg,
    streetRings,
    centroid,
    minAreaM2,
    minTestadaM,
    forbiddenRings,
  );
  if (!evald) return null;
  let best: Candidate = { widths: widths.slice(), ...evald };
  let step = Math.max(0.25, along * 0.02);
  const limit = Math.min(maxIterations, 32);
  for (let iter = 0; iter < limit; iter++) {
    const cv = calcularErroDeEquidade(best.areas).coeficienteVariacao;
    if (cv <= maxCv) break;
    let maxI = 0;
    let minI = 0;
    for (let i = 1; i < best.areas.length; i++) {
      if ((best.areas[i] ?? 0) > (best.areas[maxI] ?? 0)) maxI = i;
      if ((best.areas[i] ?? 0) < (best.areas[minI] ?? 0)) minI = i;
    }
    const lo = Math.min(maxI, minI);
    const hi = Math.max(maxI, minI);
    const cuts = new Set<number>();
    if (lo < widths.length - 1) cuts.add(lo);
    if (hi > 0) cuts.add(hi - 1);
    if (cuts.size === 0 && widths.length > 1) cuts.add(0);
    let improved = false;
    for (const i of cuts) {
      const growMin = maxI > minI ? 1 : -1;
      for (const dir of [growMin, -growMin]) {
        const trial = widths.slice();
        trial[i] = (trial[i] ?? 0) + dir * step;
        trial[i + 1] = (trial[i + 1] ?? 0) - dir * step;
        if (trial.some((w) => w < minWidthM - 1e-6)) continue;
        const packedTrial = packRow(row, azimuthDeg, trial, streetRings, origin, centroid);
        const next = evaluateCandidate(
          packedTrial,
          start.length,
          targets,
          row,
          azimuthDeg,
          streetRings,
          centroid,
          minAreaM2,
          minTestadaM,
          forbiddenRings,
        );
        if (next && next.score + 1e-9 < best.score) {
          best = { widths: trial, ...next };
          widths = trial;
          improved = true;
        }
      }
    }
    if (!improved) {
      step *= 0.5;
      if (step < 0.04) break;
    }
  }
  return best;
}

function optimizeRow(
  row: Position[],
  lots: LoteResult[],
  azimuthDeg: number,
  streetRings: Position[][],
  origin: Position,
  centroid: Position | undefined,
  minAreaM2: number,
  minTestadaM: number,
  percentualEsquina: number,
  config: ReturnType<typeof resolveConfig>,
  forbiddenRings?: Position[][],
): LoteResult[] {
  const n = lots.length;
  if (n === 0) return [];
  if (n === 1) return lots;
  const along = measureRowAlong(row, azimuthDeg, streetRings, centroid);
  if (!(along > 1)) return lots;
  const hostArea = polygonAreaPlanarM2(row);
  const minWidth = Math.max(MIN_WIDTH_M, minTestadaM > 0 ? minTestadaM * 0.88 : MIN_WIDTH_M);
  const cornerFlags = detectCornerFlags(lots, azimuthDeg, streetRings, percentualEsquina);
  const targets = buildTargets(n, hostArea, cornerFlags, percentualEsquina, config.areaTarget);
  const quadra = lots[0]?.quadra ?? "Quadra";
  const numeros = [...lots]
    .sort(
      (a, b) =>
        lotAlongKey(a.coordinates[0] ?? [], streetDirFromAz(azimuthDeg).dirS) -
        lotAlongKey(b.coordinates[0] ?? [], streetDirFromAz(azimuthDeg).dirS),
    )
    .map((lote) => lote.numero);

  const candidates: Candidate[] = [];
  const consider = (widths: number[] | null) => {
    if (!widths || widths.length !== n) return;
    const packed = packRow(row, azimuthDeg, widths, streetRings, origin, centroid);
    const evald = evaluateCandidate(
      packed,
      n,
      targets,
      row,
      azimuthDeg,
      streetRings,
      centroid,
      minAreaM2,
      minTestadaM,
      forbiddenRings,
    );
    if (evald) candidates.push({ widths, ...evald });
  };

  consider(currentWidths(lots, azimuthDeg, streetRings, centroid, along));
  if (minTestadaM <= 0 || along / n + 0.08 >= minTestadaM) {
    consider(equalWidths(along, n));
  }
  const rectangular = isApproximatelyRectangular(row);
  const equalCand = candidates.find((c) => calcularErroDeEquidade(c.areas).coeficienteVariacao <= config.maxCoeficienteVariacao);
  if (!rectangular && !equalCand) {
    consider(planTargetAreaWidths(row, targets, azimuthDeg, minWidth, streetRings, origin, centroid));
  }

  if (candidates.length === 0) return lots;
  candidates.sort((a, b) => a.score - b.score);
  const seed = candidates[0]!;
  const seedCv = calcularErroDeEquidade(seed.areas).coeficienteVariacao;
  if (seedCv <= config.maxCoeficienteVariacao) {
    return lotPolysToResult(seed.packed, azimuthDeg, streetRings, centroid, quadra, numeros);
  }
  const climbed = hillClimbWidths(
    row,
    seed.widths,
    targets,
    azimuthDeg,
    streetRings,
    origin,
    centroid,
    minWidth,
    minAreaM2,
    minTestadaM,
    config.maxIterations,
    config.maxCoeficienteVariacao,
    forbiddenRings,
  );
  const best = climbed && climbed.score <= seed.score + 1e-9 ? climbed : seed;
  return lotPolysToResult(best.packed, azimuthDeg, streetRings, centroid, quadra, numeros);
}

function punchForbiddenFromHost(host: Position[], forbidden: Position[][] | undefined, origin: Position): Position[] {
  if (!forbidden || forbidden.length === 0) return host;
  const obs = forbidden
    .map((ring) => closeRing(dropClosing(ring)))
    .filter((ring) => dropClosing(ring).length >= 3 && polygonAreaPlanarM2(ring) >= SLIVER_M2)
    .map((ring) => [ring]);
  if (obs.length === 0) return host;
  const leftover = subtractObstaclesFromPolys([[closeRing(host)]], obs, origin);
  let best: Position[] = host;
  let bestA = -1;
  for (const poly of leftover) {
    const ring = poly[0] ?? [];
    const area = polygonAreaPlanarM2(ring);
    if (area > bestA) {
      bestA = area;
      best = ring;
    }
  }
  return dropClosing(best).length >= 3 ? best : host;
}

function findHostForLots(lots: LoteResult[], hosts: Position[][][]): Position[] | null {
  let best: Position[] | null = null;
  let bestOv = 0;
  for (const host of hosts) {
    const ring = host[0];
    if (!ring || dropClosing(ring).length < 3) continue;
    let ov = 0;
    for (const lote of lots) {
      ov += polygonInteriorOverlapM2(lote.coordinates[0] ?? [], ring);
    }
    if (ov > bestOv) {
      bestOv = ov;
      best = ring;
    }
  }
  if (bestOv > 1) return best;
  if (lots.length === 0) return null;
  return lots[0]?.coordinates[0] ?? null;
}

/**
 * Recorta de novo a quadra para minimizar a variação de área.
 * Não altera outras quadras. Não deve ser chamado no ajuste de um lote só.
 */
export function otimizarEquidadeDosLotes(input: EquityOptimizeInput): EquityOptimizeResult {
  const cfg = resolveConfig(input.config);
  const streetRings = input.streetRings ?? [];
  const host = dropClosing(input.host);
  const initial = input.lotes.filter((lote) => dropClosing(lote.coordinates[0] ?? []).length >= 3);
  const initialMetrics = calcularErroDeEquidade(initial.map((lote) => lote.area_m2));
  const quadra = initial[0]?.quadra ?? "Quadra";
  const hostArea = polygonAreaPlanarM2(host);
  const areaAlvo = hostArea > 1 && initial.length > 0 ? hostArea / initial.length : initialMetrics.media;
  const emptyReport = relatorioEquidadeQuadra(quadra, initial.map((lote) => lote.area_m2), areaAlvo);
  if (initial.length < 2 || dropClosing(host).length < 3) {
    return { lotes: initial, metrics: initialMetrics, report: emptyReport, accepted: false };
  }
  if (
    initialMetrics.coeficienteVariacao <= cfg.maxCoeficienteVariacao &&
    initialMetrics.maior - initialMetrics.menor <= Math.max(8, initialMetrics.media * cfg.toleranciaArea * 2)
  ) {
    return { lotes: initial, metrics: initialMetrics, report: emptyReport, accepted: false };
  }

  const origin = input.origin ?? originOf(host);
  const usableHost = punchForbiddenFromHost(host, input.forbiddenRings, origin);
  const workHost = dropClosing(usableHost).length >= 3 ? usableHost : host;
  const usefulArea = polygonAreaPlanarM2(workHost);
  const minArea = input.areaMinimaM2 != null && input.areaMinimaM2 > 0 ? input.areaMinimaM2 : 0;
  const minTestada = input.testadaMinimaM > 0 ? input.testadaMinimaM : 0;
  const percentualEsquina = input.percentualEsquina != null && input.percentualEsquina > 0 ? input.percentualEsquina : 0;
  const frontage = detectBlockFrontage(workHost, streetRings, getMainAxisAzimuth(workHost));
  const rows = splitThroughBlock(workHost, frontage.azimuthDeg, streetRings, origin, input.profundidadeM);
  const rowRings = rows.length > 0 ? rows : [closeRing(workHost)];
  const assignments = initial.map((lote) => assignLotToRow(lote.coordinates[0] ?? [], rowRings));
  const optimized: LoteResult[] = [];

  for (let r = 0; r < rowRings.length; r++) {
    const row = rowRings[r] ?? [];
    const members = initial.filter((_, i) => assignments[i] === r);
    if (members.length === 0) continue;
    const rowFront =
      rowRings.length > 1 ? detectRowFrontage(row, streetRings, frontage.azimuthDeg, originOf(workHost)) : frontage;
    const rowCentroid = rowRings.length > 1 ? originOf(workHost) : undefined;
    optimized.push(
      ...optimizeRow(
        row,
        members,
        rowFront.azimuthDeg,
        streetRings,
        origin,
        rowCentroid,
        minArea,
        minTestada,
        percentualEsquina,
        cfg,
        input.forbiddenRings,
      ),
    );
  }

  if (optimized.length !== initial.length) {
    return { lotes: initial, metrics: initialMetrics, report: emptyReport, accepted: false };
  }

  const closed = closeHostWithLots(
    workHost,
    optimized.map((lote) => lote.coordinates),
    origin,
  );
  const usedPolys = closed.length === optimized.length ? closed : optimized.map((lote) => lote.coordinates);
  const next = lotPolysToResult(
    usedPolys,
    frontage.azimuthDeg,
    streetRings,
    rowRings.length > 1 ? originOf(workHost) : undefined,
    quadra,
    sortLotsForNumbering(optimized, frontage.azimuthDeg, (lote) => lote.coordinates[0] ?? []).map((lote) => lote.numero),
  );

  const nextMetrics = calcularErroDeEquidade(next.map((lote) => lote.area_m2));
  const targetArea = usefulArea > 1 ? usefulArea : hostArea;
  const initialScore = scoreEquidadeSolucao({
    areas: initial.map((lote) => lote.area_m2),
    targets: buildTargets(
      initial.length,
      targetArea,
      detectCornerFlags(initial, frontage.azimuthDeg, streetRings, percentualEsquina),
      percentualEsquina,
      cfg.areaTarget,
    ),
    rings: initial.map((lote) => lote.coordinates[0] ?? []),
    streetRings,
    host: workHost,
    azimuthDeg: frontage.azimuthDeg,
    centroid: rowRings.length > 1 ? originOf(workHost) : undefined,
    minAreaM2: minArea,
    minTestadaM: minTestada,
    forbiddenRings: input.forbiddenRings,
  });
  const nextScore = scoreEquidadeSolucao({
    areas: next.map((lote) => lote.area_m2),
    targets: buildTargets(
      next.length,
      targetArea,
      detectCornerFlags(next, frontage.azimuthDeg, streetRings, percentualEsquina),
      percentualEsquina,
      cfg.areaTarget,
    ),
    rings: next.map((lote) => lote.coordinates[0] ?? []),
    streetRings,
    host: workHost,
    azimuthDeg: frontage.azimuthDeg,
    centroid: rowRings.length > 1 ? originOf(workHost) : undefined,
    minAreaM2: minArea,
    minTestadaM: minTestada,
    forbiddenRings: input.forbiddenRings,
  });

  const accepted = nextScore <= initialScore + 1e-9 && next.length === initial.length;
  const lotes = accepted ? next : initial;
  const metrics = accepted ? nextMetrics : initialMetrics;
  return {
    lotes,
    metrics,
    report: relatorioEquidadeQuadra(
      quadra,
      lotes.map((lote) => lote.area_m2),
      areaAlvo,
    ),
    accepted,
  };
}

/** Otimiza cada quadra isoladamente (não mistura A com B). */
export function otimizarEquidadePorQuadras(input: {
  lotes: LoteResult[];
  hosts: Position[][][];
  streetRings?: Position[][];
  origin?: Position;
  testadaMinimaM: number;
  profundidadeM: number;
  areaMinimaM2?: number;
  percentualEsquina?: number;
  forbiddenRings?: Position[][];
  config?: EquityConfig;
}): { lotes: LoteResult[]; reports: EquityQuadraReport[] } {
  const byQuadra = new Map<string, LoteResult[]>();
  for (const lote of input.lotes) {
    const key = lote.quadra || "Quadra";
    const list = byQuadra.get(key) ?? [];
    list.push(lote);
    byQuadra.set(key, list);
  }
  const lotes: LoteResult[] = [];
  const reports: EquityQuadraReport[] = [];
  for (const group of byQuadra.values()) {
    const host = findHostForLots(group, input.hosts);
    if (!host || group.length < 2) {
      lotes.push(...group);
      reports.push(
        relatorioEquidadeQuadra(
          group[0]?.quadra ?? "Quadra",
          group.map((lote) => lote.area_m2),
          group.length ? group.reduce((s, lote) => s + lote.area_m2, 0) / group.length : 0,
        ),
      );
      continue;
    }
    const result = otimizarEquidadeDosLotes({
      host,
      lotes: group,
      streetRings: input.streetRings,
      origin: input.origin ?? originOf(host),
      testadaMinimaM: input.testadaMinimaM,
      profundidadeM: input.profundidadeM,
      areaMinimaM2: input.areaMinimaM2,
      percentualEsquina: input.percentualEsquina,
      forbiddenRings: input.forbiddenRings,
      config: input.config,
    });
    lotes.push(...result.lotes);
    reports.push(result.report);
  }
  return { lotes, reports };
}

/** Relatórios de equidade a partir dos lotes já gerados (painel / tabela). */
export function relatoriosEquidadePorQuadras(lotes: LoteResult[]): EquityQuadraReport[] {
  const byQuadra = new Map<string, number[]>();
  for (const lote of lotes) {
    const key = lote.quadra || "Quadra";
    const list = byQuadra.get(key) ?? [];
    list.push(lote.area_m2);
    byQuadra.set(key, list);
  }
  return [...byQuadra.entries()].map(([quadra, areas]) => {
    const media = areas.length ? areas.reduce((s, a) => s + a, 0) / areas.length : 0;
    return relatorioEquidadeQuadra(quadra, areas, media);
  });
}
