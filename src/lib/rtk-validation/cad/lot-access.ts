import type { Position } from "geojson";
import {
  lotHasRoadAccess,
  lotStreetFrontageM,
  polygonAreaPlanarM2,
  type LoteResult,
} from "./lot-subdivision";

export type ParcelAccessAnalysis = {
  widthM: number;
  heightM: number;
  areaM2: number;
  streetCount: number;
  accessSides: number;
  minStreetWidthM: number;
  minFrontageM: number;
  recommendedMaxDepthM: number;
  targetLotAreaM2: number;
  needsInternalStreets: boolean;
  proposedInternalStreetCount: number;
};

export type LotAccessInfo = {
  lot: string;
  hasRoadAccess: boolean;
  road: string | null;
  frontage: number;
  corner: boolean;
  tipo: "ESQUINA" | "INTERNO" | "MEIO";
};

export type SubdivisionValidation = {
  ok: boolean;
  invalidLots: string[];
  lotsWithoutRoadAccess: string[];
  lotsWithoutFrontage: string[];
  invalidLotsCount: number;
  lotsWithoutRoadAccessCount: number;
  lotsWithoutFrontageCount: number;
  message?: string;
  alternatives: string[];
};

function dropClosing(ring: Position[]): Position[] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
  return ring;
}

function bboxSize(ring: Position[]): { widthM: number; heightM: number } {
  const pts = dropClosing(ring);
  if (pts.length === 0) return { widthM: 0, heightM: 0 };
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
  return { widthM: maxX - minX, heightM: maxY - minY };
}

function countAccessSides(ring: Position[], streetRings: Position[][]): number {
  const pts = dropClosing(ring);
  if (pts.length < 3 || streetRings.length === 0) return 0;
  let sides = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dummy = [a, b, a];
    if (lotStreetFrontageM(dummy, streetRings) >= 2) sides += 1;
  }
  return sides;
}

export function analyzeParcelAccess(
  ring: Position[],
  streetRings: Position[][],
  opts: {
    minFrontageM: number;
    lotDepthM: number;
    streetWidthM?: number;
    targetLotAreaM2?: number;
  },
): ParcelAccessAnalysis {
  const { widthM, heightM } = bboxSize(ring);
  const depth = Math.min(widthM, heightM);
  const lotDepth = opts.lotDepthM > 0 ? opts.lotDepthM : 30;
  const streetW = opts.streetWidthM != null && opts.streetWidthM > 0 ? opts.streetWidthM : 10;
  const maxServed = lotDepth * 2 + streetW * 0.25;
  const needsInternalStreets = depth > maxServed + 0.5;
  const extra = Math.max(0, depth - lotDepth * 2);
  const proposedInternalStreetCount = needsInternalStreets
    ? Math.max(1, Math.floor(extra / (lotDepth * 2 + streetW) + 0.35))
    : 0;
  return {
    widthM,
    heightM,
    areaM2: polygonAreaPlanarM2(ring),
    streetCount: streetRings.length,
    accessSides: countAccessSides(ring, streetRings),
    minStreetWidthM: streetW,
    minFrontageM: opts.minFrontageM,
    recommendedMaxDepthM: lotDepth,
    targetLotAreaM2: opts.targetLotAreaM2 ?? opts.minFrontageM * lotDepth,
    needsInternalStreets,
    proposedInternalStreetCount,
  };
}

export function validateLotAccess(
  lot: LoteResult,
  streetRings: Position[][],
  minFrontageM = 0,
): LotAccessInfo {
  const ring = lot.coordinates[0] ?? [];
  const frontage = lotStreetFrontageM(ring, streetRings);
  const hasRoadAccess = lotHasRoadAccess(ring, streetRings, minFrontageM);
  const corner = lot.area_m2 > 0 && frontage >= Math.max(minFrontageM, 8) * 1.6;
  return {
    lot: `${lot.quadra} ${lot.numero}`.trim() || "lote",
    hasRoadAccess,
    road: hasRoadAccess ? "via confrontante" : null,
    frontage,
    corner,
    tipo: !hasRoadAccess ? "INTERNO" : corner ? "ESQUINA" : "MEIO",
  };
}

export const ACCESS_FAIL_MESSAGE =
  "Não foi possível preencher toda a quadra mantendo acesso viário para todos os lotes.";

export const ACCESS_ALTERNATIVES = [
  "Criar ruas internas",
  "Reduzir a quantidade de lotes",
  "Alterar a área alvo",
  "Alterar a testada mínima",
  "Alterar a largura das ruas",
  "Permitir cul-de-sac",
];

export function validateSubdivision(
  lotes: LoteResult[],
  streetRings: Position[][],
  minFrontageM = 0,
): SubdivisionValidation {
  const lotsWithoutRoadAccess: string[] = [];
  const lotsWithoutFrontage: string[] = [];
  const invalidLots: string[] = [];
  for (const lote of lotes) {
    const info = validateLotAccess(lote, streetRings, minFrontageM);
    if (!info.hasRoadAccess) {
      lotsWithoutRoadAccess.push(info.lot);
      invalidLots.push(info.lot);
    }
    if (info.frontage + 0.08 < Math.max(2, minFrontageM * 0.7)) {
      lotsWithoutFrontage.push(info.lot);
      if (!invalidLots.includes(info.lot)) invalidLots.push(info.lot);
    }
  }
  const ok = invalidLots.length === 0;
  return {
    ok,
    invalidLots,
    lotsWithoutRoadAccess,
    lotsWithoutFrontage,
    invalidLotsCount: invalidLots.length,
    lotsWithoutRoadAccessCount: lotsWithoutRoadAccess.length,
    lotsWithoutFrontageCount: lotsWithoutFrontage.length,
    message: ok ? undefined : ACCESS_FAIL_MESSAGE,
    alternatives: ok ? [] : ACCESS_ALTERNATIVES,
  };
}

export function keepLotsWithRoadAccess(
  lotes: LoteResult[],
  streetRings: Position[][],
  minFrontageM = 0,
): LoteResult[] {
  return lotes.filter((lote) => lotHasRoadAccess(lote.coordinates[0] ?? [], streetRings, minFrontageM));
}

export function formatLoteamentoAccessSummary(input: {
  widthM?: number;
  heightM?: number;
  lotCount: number;
  averageArea: number;
  internalStreetCount: number;
  lotsWithoutRoadAccess: number;
  lotsWithoutFrontage: number;
  residualArea: number;
}): string {
  const quadra =
    input.widthM != null && input.heightM != null
      ? `Quadra: ${Math.round(input.widthM)} × ${Math.round(input.heightM)} m`
      : null;
  return [
    "Loteamento gerado.",
    quadra,
    `Lotes: ${input.lotCount}`,
    `Área média: ${input.averageArea.toFixed(1)} m²`,
    `Ruas internas: ${input.internalStreetCount}`,
    `Lotes sem acesso: ${input.lotsWithoutRoadAccess}`,
    `Testadas inválidas: ${input.lotsWithoutFrontage}`,
    `Áreas remanescentes: ${input.residualArea.toFixed(1)} m²`,
  ]
    .filter(Boolean)
    .join("\n");
}
