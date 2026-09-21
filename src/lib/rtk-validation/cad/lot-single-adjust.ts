import { edgeAlongStreetRing, listLoteamentoStreetPolys } from "./lot-corner-classification";
import { measureLotFrontAndDepth, polygonAreaPlanarM2, polygonInteriorOverlapM2 } from "./lot-subdivision";
import { computePolygonMetrics, pointInPolygon } from "./polygon-utils";
import { listReurbLots } from "./reurb";
import type { CadPolylineEntity, CadProject, CadVertex } from "./types";

const AREA_TOL_M2 = 2;
const AREA_TOL_RATIO = 0.02;
const OVERLAP_EPS_M2 = 0.35;
const MIN_LOT_M2 = 20;
const MAX_EDGE_SHIFT_M = 80;

export const SINGLE_LOT_BLOCKED =
  "Não é possível ajustar o Lote {lote} para {area} m² mantendo as demais geometrias intactas. Deseja permitir a redistribuição dos lotes afetados?";
export const SINGLE_LOT_VALIDATION_FAILED =
  "Erro: a operação alterou lotes que não foram solicitados.";

export type LotGeometrySnapshot = {
  id: string;
  vertices: CadVertex[];
  areaM2: number;
  perimeterM: number;
  testadaM: number;
  confrontations?: string[];
};

export type SingleLotValidation = {
  ok: boolean;
  changedIds: string[];
  message?: string;
};

function dropClosing(ring: [number, number][]): [number, number][] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) {
    return ring.slice(0, -1);
  }
  return ring;
}

function verticesToRing(vertices: CadVertex[]): [number, number][] {
  return dropClosing(vertices.map((v) => [v.x, v.y] as [number, number]));
}

function ringToVertices(ring: [number, number][], z = 0): CadVertex[] {
  return dropClosing(ring).map(([x, y]) => ({ x, y, z }));
}

function centroid(ring: [number, number][]): { x: number; y: number } {
  const pts = dropClosing(ring);
  if (!pts.length) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return { x: x / pts.length, y: y / pts.length };
}

function areaClose(actual: number, target: number): boolean {
  return Math.abs(actual - target) <= Math.max(AREA_TOL_M2, target * AREA_TOL_RATIO);
}

function verticesEqual(a: CadVertex[], b: CadVertex[], eps = 1e-4): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => Math.hypot(v.x - b[i]!.x, v.y - b[i]!.y) <= eps);
}

function snapshotOf(lot: CadPolylineEntity, streets: [number, number][][]): LotGeometrySnapshot {
  const metrics = computePolygonMetrics(lot.vertices, true);
  const dims = measureLotFrontAndDepth(verticesToRing(lot.vertices), streets);
  return {
    id: lot.id,
    vertices: lot.vertices.map((v) => ({ x: v.x, y: v.y, z: v.z })),
    areaM2: metrics.areaM2,
    perimeterM: metrics.perimeterM,
    testadaM: dims.testadaM,
    confrontations: lot.confrontations ? [...lot.confrontations] : undefined,
  };
}

export function snapshotLotGeometries(project: CadProject): Map<string, LotGeometrySnapshot> {
  const streets = listLoteamentoStreetPolys(project).map((poly) => verticesToRing(poly.vertices));
  return new Map(listReurbLots(project).map((lot) => [lot.id, snapshotOf(lot, streets)]));
}

export function validateSingleLotModification(input: {
  targetEntityId: string;
  beforeState: CadProject;
  afterState: CadProject;
}): SingleLotValidation {
  const before = snapshotLotGeometries(input.beforeState);
  const after = snapshotLotGeometries(input.afterState);
  const changedIds: string[] = [];
  for (const [id, prev] of before) {
    if (id === input.targetEntityId) continue;
    const next = after.get(id);
    if (!next) {
      changedIds.push(id);
      continue;
    }
    const areaChanged = Math.abs(next.areaM2 - prev.areaM2) > 0.25;
    const periChanged = Math.abs(next.perimeterM - prev.perimeterM) > 0.25;
    const testadaChanged = Math.abs(next.testadaM - prev.testadaM) > 0.15;
    const vertsChanged = !verticesEqual(prev.vertices, next.vertices);
    const confrontChanged =
      Boolean(prev.confrontations || next.confrontations) &&
      JSON.stringify(prev.confrontations ?? []) !== JSON.stringify(next.confrontations ?? []);
    if (areaChanged || periChanged || testadaChanged || vertsChanged || confrontChanged) {
      changedIds.push(id);
    }
  }
  for (const id of after.keys()) {
    if (!before.has(id) && id !== input.targetEntityId) changedIds.push(id);
  }
  if (changedIds.length) {
    return { ok: false, changedIds, message: SINGLE_LOT_VALIDATION_FAILED };
  }
  return { ok: true, changedIds: [] };
}

function streetRingsOf(project: CadProject): [number, number][][] {
  return listLoteamentoStreetPolys(project).map((poly) => verticesToRing(poly.vertices));
}

function hostRingForLot(project: CadProject, lot: CadPolylineEntity): [number, number][] | null {
  const c = centroid(verticesToRing(lot.vertices));
  const quadras = project.entities.filter(
    (entity): entity is CadPolylineEntity =>
      entity.type === "polyline" &&
      Boolean(entity.closed) &&
      entity.vertices.length >= 3 &&
      entity.layerId === "loteamento_quadras",
  );
  for (const quadra of quadras) {
    if (pointInPolygon(c.x, c.y, quadra.vertices)) return verticesToRing(quadra.vertices);
  }
  return quadras[0] ? verticesToRing(quadras[0].vertices) : null;
}

function edgeAlongStreets(
  a: [number, number],
  b: [number, number],
  streets: [number, number][][],
): boolean {
  return streets.some((street) => edgeAlongStreetRing(a, b, street));
}

function offsetEdge(ring: [number, number][], edgeIndex: number, dist: number): [number, number][] {
  const pts = dropClosing(ring);
  const n = pts.length;
  if (n < 3) return pts;
  const a = pts[edgeIndex]!;
  const b = pts[(edgeIndex + 1) % n]!;
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const len = Math.hypot(ex, ey);
  if (len < 0.2) return pts;
  let nx = -ey / len;
  let ny = ex / len;
  const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const c = centroid(pts);
  if ((c.x - mid[0]) * nx + (c.y - mid[1]) * ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return pts.map((p, i) =>
    i === edgeIndex || i === (edgeIndex + 1) % n ? ([p[0] + nx * dist, p[1] + ny * dist] as [number, number]) : p,
  );
}

function ringValid(
  candidate: [number, number][],
  target: CadPolylineEntity,
  others: CadPolylineEntity[],
  streets: [number, number][][],
  host: [number, number][] | null,
): boolean {
  const pts = dropClosing(candidate);
  if (pts.length < 3) return false;
  const area = polygonAreaPlanarM2(pts);
  if (area < MIN_LOT_M2) return false;
  if (host && host.length >= 3) {
    const inside = polygonInteriorOverlapM2(pts, host);
    if (inside + 0.8 < area * 0.96) return false;
  }
  for (const other of others) {
    if (other.id === target.id) continue;
    if (polygonInteriorOverlapM2(pts, verticesToRing(other.vertices)) > OVERLAP_EPS_M2) return false;
  }
  for (const street of streets) {
    if (polygonInteriorOverlapM2(pts, street) > OVERLAP_EPS_M2) return false;
  }
  return true;
}

function searchEdge(
  ring: [number, number][],
  edgeIndex: number,
  targetArea: number,
  grow: boolean,
  target: CadPolylineEntity,
  others: CadPolylineEntity[],
  streets: [number, number][][],
  host: [number, number][] | null,
): [number, number][] | null {
  const sign = grow ? 1 : -1;
  let lo = 0;
  let hi = MAX_EDGE_SHIFT_M;
  let bestValid = 0;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    const cand = offsetEdge(ring, edgeIndex, sign * mid);
    if (ringValid(cand, target, others, streets, host)) {
      bestValid = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  if (bestValid < 1e-4) return null;
  const extreme = offsetEdge(ring, edgeIndex, sign * bestValid);
  const extremeArea = polygonAreaPlanarM2(extreme);
  if (grow && extremeArea + AREA_TOL_M2 < targetArea) return null;
  if (!grow && extremeArea - AREA_TOL_M2 > targetArea) return null;

  let a0 = 0;
  let a1 = bestValid;
  let found = extreme;
  for (let i = 0; i < 24; i++) {
    const mid = (a0 + a1) / 2;
    const cand = offsetEdge(ring, edgeIndex, sign * mid);
    if (!ringValid(cand, target, others, streets, host)) {
      a1 = mid;
      continue;
    }
    found = cand;
    const area = polygonAreaPlanarM2(cand);
    if (areaClose(area, targetArea)) return cand;
    if (grow ? area < targetArea : area > targetArea) a0 = mid;
    else a1 = mid;
  }
  return areaClose(polygonAreaPlanarM2(found), targetArea) ? found : null;
}

export function formatSingleLotBlocked(lote: string, area: number): string {
  return SINGLE_LOT_BLOCKED.replace("{lote}", lote).replace("{area}", String(area));
}

export type AdjustSingleLotResult =
  | { ok: true; project: CadProject; selectedId: string; areaM2: number }
  | { ok: false; reason: "impossible" | "validation"; message: string; project: CadProject };

export function tryAdjustSingleLot(
  project: CadProject,
  target: CadPolylineEntity,
  targetAreaM2: number,
): AdjustSingleLotResult {
  const streets = streetRingsOf(project);
  const lots = listReurbLots(project);
  const currentArea = polygonAreaPlanarM2(verticesToRing(target.vertices));
  if (areaClose(currentArea, targetAreaM2)) {
    return { ok: true, project, selectedId: target.id, areaM2: currentArea };
  }

  const host = hostRingForLot(project, target);
  const ring = verticesToRing(target.vertices);
  const grow = targetAreaM2 > currentArea;
  const movable = ring
    .map((p, i) => {
      const q = ring[(i + 1) % ring.length]!;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      return { i, len, street: edgeAlongStreets(p, q, streets) };
    })
    .filter((edge) => !edge.street && edge.len >= 0.8)
    .sort((a, b) => b.len - a.len);

  let best: [number, number][] | null = null;
  let bestDelta = Infinity;
  for (const edge of movable) {
    const cand = searchEdge(ring, edge.i, targetAreaM2, grow, target, lots, streets, host);
    if (!cand) continue;
    const delta = Math.abs(polygonAreaPlanarM2(cand) - targetAreaM2);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = cand;
    }
  }

  if (!best) {
    return {
      ok: false,
      reason: "impossible",
      message: formatSingleLotBlocked(target.name ?? target.id, targetAreaM2),
      project,
    };
  }

  const z0 = target.vertices[0]?.z ?? 0;
  const nextVertices = ringToVertices(best, z0);
  const metrics = computePolygonMetrics(nextVertices, true);
  const nextProject: CadProject = {
    ...project,
    entities: project.entities.map((entity) => {
      if (entity.id !== target.id || entity.type !== "polyline") return entity;
      return {
        ...entity,
        vertices: nextVertices,
        lote: entity.lote
          ? { ...entity.lote, areaM2: metrics.areaM2, atende: metrics.areaM2 + 1e-6 >= (entity.lote.areaMinimaM2 ?? 0) }
          : entity.lote,
      };
    }),
  };

  const check = validateSingleLotModification({
    targetEntityId: target.id,
    beforeState: project,
    afterState: nextProject,
  });
  if (!check.ok) {
    return { ok: false, reason: "validation", message: check.message ?? SINGLE_LOT_VALIDATION_FAILED, project };
  }
  return { ok: true, project: nextProject, selectedId: target.id, areaM2: metrics.areaM2 };
}
