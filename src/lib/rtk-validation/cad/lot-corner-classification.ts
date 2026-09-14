import { parseCadastralLotNumber } from "./plan-annotation-labels";
import { measureLotFrontAndDepth } from "./lot-subdivision";
import { computePolygonMetrics, formatAreaBr } from "./polygon-utils";
import { LOTEAMENTO_LOTES_LAYER_ID, LOTEAMENTO_VIAS_LAYER_ID } from "./reurb";
import type { CadLoteProps, CadLoteTipo, CadPolylineEntity, CadProject } from "./types";

/** Distância máxima (m) para considerar a aresta do lote junto à via. */
export const LOT_STREET_NEAR_M = 2.4;
export const DEFAULT_PERCENTUAL_ESQUINA = 20;
const MIN_FRONTAGE_M = 0.8;
const MIN_EDGE_M = 0.4;

export type LotStreetFrontage = {
  streetId: string;
  streetName: string;
  lengthM: number;
};

export type ClassifyLotInput = {
  lot: CadPolylineEntity;
  streets: CadPolylineEntity[];
  areaMinimaInterno: number;
  percentualEsquina?: number;
  index?: number;
};

function dropClosing(ring: [number, number][]): [number, number][] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
  return ring;
}

function polylineToRing(poly: CadPolylineEntity): [number, number][] {
  return poly.vertices.map((v) => [v.x, v.y] as [number, number]);
}

function distPointToSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-18) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

function minDistToRing(p: [number, number], ring: [number, number][]): number {
  const pts = dropClosing(ring);
  if (pts.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = distPointToSegment(p, pts[i], pts[(i + 1) % pts.length]);
    if (d < best) best = d;
  }
  return best;
}

/** Aresta do lote corre junto a um polígono de LOTEAMENTO_VIAS. */
export function edgeAlongStreetRing(
  a: [number, number],
  b: [number, number],
  streetRing: [number, number][],
  maxDistM = LOT_STREET_NEAR_M,
): boolean {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < MIN_EDGE_M) return false;
  let hits = 0;
  for (const t of [0.25, 0.5, 0.75]) {
    const p: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (minDistToRing(p, streetRing) <= maxDistM) hits += 1;
  }
  return hits >= 2;
}

export function listLoteamentoStreetPolys(project: CadProject): CadPolylineEntity[] {
  return project.entities.filter(
    (e): e is CadPolylineEntity =>
      e.type === "polyline" &&
      Boolean(e.closed) &&
      e.vertices.length >= 3 &&
      e.layerId === LOTEAMENTO_VIAS_LAYER_ID,
  );
}

export function listLoteamentoLotPolys(project: CadProject): CadPolylineEntity[] {
  return project.entities.filter(
    (e): e is CadPolylineEntity =>
      e.type === "polyline" &&
      Boolean(e.closed) &&
      e.vertices.length >= 3 &&
      e.layerId === LOTEAMENTO_LOTES_LAYER_ID,
  );
}

/**
 * Frentes do lote: arestas adjacentes a cada via distinta.
 * Uma via = uma frente (várias arestas na mesma rua somam).
 */
export function collectLotStreetFrontages(
  lot: CadPolylineEntity,
  streets: CadPolylineEntity[],
): LotStreetFrontage[] {
  const pts = dropClosing(polylineToRing(lot));
  if (pts.length < 3 || streets.length === 0) return [];
  const frontages: LotStreetFrontage[] = [];
  for (const street of streets) {
    const ring = polylineToRing(street);
    let lengthM = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (edgeAlongStreetRing(a, b, ring)) {
        lengthM += Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
    }
    if (lengthM >= MIN_FRONTAGE_M) {
      frontages.push({
        streetId: street.id,
        streetName: street.name?.trim() || street.id,
        lengthM,
      });
    }
  }
  return frontages;
}

/** Duas frentes em ruas distintas → ESQUINA; uma frente → INTERNO. */
export function classifyLotTipo(frontages: LotStreetFrontage[]): CadLoteTipo {
  return frontages.length >= 2 ? "ESQUINA" : "INTERNO";
}

/**
 * Área mínima do lote interno: min configurada, ou testada × profundidade
 * (a área mínima de lote foi removida da geração).
 */
export function resolveAreaMinimaInterno(input: {
  areaMinimaM2?: number | null;
  testadaM: number;
  profundidadeM: number;
}): number {
  if (input.areaMinimaM2 != null && Number.isFinite(input.areaMinimaM2) && input.areaMinimaM2 > 0) {
    return input.areaMinimaM2;
  }
  const testada = Number.isFinite(input.testadaM) ? Math.max(0, input.testadaM) : 0;
  const profundidade = Number.isFinite(input.profundidadeM) ? Math.max(0, input.profundidadeM) : 0;
  return testada * profundidade;
}

export function areaMinimaEsquina(
  areaMinimaInterno: number,
  percentualEsquina = DEFAULT_PERCENTUAL_ESQUINA,
): number {
  const pct = Number.isFinite(percentualEsquina) ? percentualEsquina : DEFAULT_PERCENTUAL_ESQUINA;
  return areaMinimaInterno * (1 + pct / 100);
}

export function formatLoteNumeroLabel(name: string | undefined, index = 0): string {
  const n = parseCadastralLotNumber(name, index);
  return `Lote ${String(n).padStart(2, "0")}`;
}

/** Tooltip de hover/seleção do lote de esquina (pt-BR). */
export function formatLoteEsquinaTooltip(info: {
  name?: string;
  index?: number;
  areaM2: number;
  areaMinimaM2: number;
  atende: boolean;
}): string {
  const status = info.atende ? "✓ ATENDE" : "✗ NÃO ATENDE";
  return [
    formatLoteNumeroLabel(info.name, info.index ?? 0),
    "Tipo: ESQUINA",
    `Área: ${formatAreaBr(info.areaM2)}`,
    `Área mínima: ${formatAreaBr(info.areaMinimaM2)}`,
    `Status: ${status}`,
  ].join("\n");
}

export function classifyLot(input: ClassifyLotInput): CadLoteProps {
  const frontages = collectLotStreetFrontages(input.lot, input.streets);
  const tipo = classifyLotTipo(frontages);
  const percentual =
    input.percentualEsquina != null && Number.isFinite(input.percentualEsquina)
      ? input.percentualEsquina
      : DEFAULT_PERCENTUAL_ESQUINA;
  const areaMinimaM2 =
    tipo === "ESQUINA"
      ? areaMinimaEsquina(input.areaMinimaInterno, percentual)
      : input.areaMinimaInterno;
  const areaM2 = computePolygonMetrics(input.lot.vertices, true).areaM2;
  const streetRings = input.streets.map((street) => street.vertices.map((v) => [v.x, v.y] as [number, number]));
  const dims = measureLotFrontAndDepth(
    input.lot.vertices.map((v) => [v.x, v.y] as [number, number]),
    streetRings,
  );
  const testadaM = frontages.reduce((sum, f) => sum + f.lengthM, 0) || dims.testadaM;
  const profundidadeM =
    dims.profundidadeM > 0.5 ? dims.profundidadeM : testadaM > 0.2 ? areaM2 / testadaM : 0;
  return {
    tipo,
    areaM2,
    areaMinimaM2,
    atende: areaM2 + 1e-6 >= areaMinimaM2,
    testadaM,
    profundidadeM,
    ruas: frontages.map((f) => f.streetName),
  };
}

export type ApplyLotClassificationParams = {
  percentualEsquina?: number;
  areaMinimaInterno: number;
};

/** Passada de classificação: não altera geometria, numeração nem geração dos INTERNO. */
export function applyLoteamentoLotClassification(
  project: CadProject,
  params: ApplyLotClassificationParams,
): CadProject {
  const streets = listLoteamentoStreetPolys(project);
  const lots = listLoteamentoLotPolys(project);
  if (lots.length === 0) return project;
  const byId = new Map(
    lots.map((lot, index) => [
      lot.id,
      classifyLot({
        lot,
        streets,
        areaMinimaInterno: params.areaMinimaInterno,
        percentualEsquina: params.percentualEsquina,
        index,
      }),
    ]),
  );
  return {
    ...project,
    entities: project.entities.map((entity) => {
      if (entity.type !== "polyline") return entity;
      const lote = byId.get(entity.id);
      return lote ? { ...entity, lote } : entity;
    }),
  };
}

export function lotEsquinaTooltipOf(
  lot: CadPolylineEntity,
  index = 0,
): string | null {
  const info = lot.lote;
  if (!info || info.tipo !== "ESQUINA") return null;
  return formatLoteEsquinaTooltip({
    name: lot.name,
    index,
    areaM2: info.areaM2,
    areaMinimaM2: info.areaMinimaM2,
    atende: info.atende,
  });
}
