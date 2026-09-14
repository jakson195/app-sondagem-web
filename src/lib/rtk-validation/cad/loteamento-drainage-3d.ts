import {
  DEFAULT_DRAINAGE_PARAMS,
  DRENAGEM_BOCAS_LAYER,
  DRENAGEM_EMISSARIO_LAYER,
  isDrainageAlertStatus,
  listDrainagePipes,
  listDrainagePvs,
  pipeLengthM,
} from "./loteamento-drainage";
import { formatDrainageCotaLine } from "./plan-annotation-labels";
import { LOTEAMENTO_VIAS_LAYER_ID } from "./reurb";
import type { CadPointEntity, CadPolylineEntity, CadProject } from "./types";

export const DRAINAGE_3D_DEFAULT_COVER_M = DEFAULT_DRAINAGE_PARAMS.minCoverM;
export const DRAINAGE_3D_DEFAULT_MIN_SLOPE_PCT = DEFAULT_DRAINAGE_PARAMS.minSlopePct;
export const DRAINAGE_3D_PV_SIZE_M = 1.2;
export const DRAINAGE_3D_INLET_WIDTH_M = 0.62;
export const DRAINAGE_3D_INLET_DEPTH_M = 0.42;
export const DRAINAGE_3D_MIN_SHAFT_M = 0.18;

export type Drainage3dKind = "pv" | "outfall" | "inlet";

export type Drainage3dVec3 = {
  x: number;
  y: number;
  z: number;
};

export type Drainage3dPipeMesh = {
  id: string;
  code: string;
  diameterMm: number;
  radiusM: number;
  lengthM: number;
  length3dM: number;
  start: Drainage3dVec3;
  end: Drainage3dVec3;
  midpoint: Drainage3dVec3;
  failed: boolean;
  label: string | null;
};

export type Drainage3dShaftMesh = {
  id: string;
  code: string;
  kind: Drainage3dKind;
  x: number;
  y: number;
  invertZ: number;
  groundZ: number;
  heightM: number;
  widthM: number;
  depthM: number;
  label: string | null;
  cfct: string | null;
};

export type Drainage3dStreetRing = {
  outer: [number, number][];
  holes: [number, number][][];
};

export type Drainage3dBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

export type DrainageNetwork3dScene = {
  origin: Drainage3dVec3;
  bounds: Drainage3dBounds;
  extentM: number;
  schematic: boolean;
  coverM: number;
  minSlopePct: number;
  medianGroundZ: number;
  pipes: Drainage3dPipeMesh[];
  shafts: Drainage3dShaftMesh[];
  streets: Drainage3dStreetRing[];
};

export type DrainageNetwork3dReadiness = {
  ok: boolean;
  pvCount: number;
  pipeCount: number;
  inletCount: number;
};

export type BuildDrainageNetwork3dOptions = {
  coverM?: number;
  minSlopePct?: number;
};

type NodeDraft = {
  id: string;
  code: string;
  kind: Drainage3dKind;
  x: number;
  y: number;
  invertZ: number | null;
  groundZ: number | null;
  assumed: boolean;
};

function finiteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

function nodeKind(pv: CadPointEntity): Drainage3dKind {
  if (pv.drainage?.kind === "outfall" || pv.layerId === DRENAGEM_EMISSARIO_LAYER.id) return "outfall";
  if (pv.drainage?.kind === "inlet" || pv.layerId === DRENAGEM_BOCAS_LAYER.id) return "inlet";
  return "pv";
}

function looksUnsetPair(invert: number | null, ground: number | null): boolean {
  return invert === 0 && ground === 0;
}

function readNodeElev(pv: CadPointEntity): { invertZ: number | null; groundZ: number | null } {
  const groundRaw = finiteNum(pv.drainage?.groundZ) ? pv.drainage.groundZ : finiteNum(pv.z) ? pv.z : null;
  const invertRaw = finiteNum(pv.drainage?.invertZ) ? pv.drainage.invertZ : null;
  let groundZ = groundRaw;
  let invertZ = invertRaw;
  if (looksUnsetPair(invertZ ?? 0, groundZ ?? 0) && (invertZ == null || invertZ === 0) && (groundZ == null || groundZ === 0)) {
    invertZ = null;
    groundZ = null;
  }
  return { invertZ, groundZ };
}

function nearestNode(x: number, y: number, nodes: NodeDraft[], snapM: number): NodeDraft | null {
  let best: NodeDraft | null = null;
  let bestD = snapM;
  for (const node of nodes) {
    const d = dist2(x, y, node.x, node.y);
    if (d <= bestD) {
      best = node;
      bestD = d;
    }
  }
  return best;
}

function pickOutfallId(nodes: NodeDraft[]): string | null {
  if (nodes.length === 0) return null;
  const marked = nodes.find((n) => n.kind === "outfall");
  if (marked) return marked.id;
  const ranked = [...nodes].sort((a, b) => {
    const az = a.groundZ ?? a.invertZ ?? Infinity;
    const bz = b.groundZ ?? b.invertZ ?? Infinity;
    return az - bz || a.y - b.y || a.x - b.x;
  });
  return ranked[0]?.id ?? null;
}

function propagateInverts(nodes: Map<string, NodeDraft>, pipes: CadPolylineEntity[], minS: number): boolean {
  let assumed = false;
  const maxIter = nodes.size + pipes.length + 4;
  for (let i = 0; i < maxIter; i++) {
    let changed = false;
    for (const pipe of pipes) {
      const fromId = pipe.drainage?.fromPvId;
      const toId = pipe.drainage?.toPvId;
      if (!fromId || !toId) continue;
      const from = nodes.get(fromId);
      const to = nodes.get(toId);
      if (!from || !to) continue;
      const a = pipe.vertices[0];
      const b = pipe.vertices[pipe.vertices.length - 1];
      const lengthM = pipe.drainage?.lengthM ?? (a && b ? pipeLengthM(a.x, a.y, b.x, b.y) : 0);
      if (lengthM <= 1e-9) continue;
      const drop = minS * lengthM;
      if (from.invertZ != null && to.invertZ == null) {
        to.invertZ = from.invertZ - drop;
        to.assumed = true;
        assumed = true;
        changed = true;
      } else if (to.invertZ != null && from.invertZ == null) {
        from.invertZ = to.invertZ + drop;
        from.assumed = true;
        assumed = true;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return assumed;
}

function fillRemainingInverts(nodes: NodeDraft[], coverM: number, minS: number, pipes: CadPolylineEntity[]): boolean {
  let assumed = false;
  const missing = nodes.filter((n) => n.invertZ == null);
  if (missing.length === 0) return false;
  const map = new Map(nodes.map((n) => [n.id, n]));
  const outfallId = pickOutfallId(nodes);
  const seed = (outfallId ? map.get(outfallId) : null) ?? missing[0];
  if (seed && seed.invertZ == null) {
    seed.invertZ = seed.groundZ != null ? seed.groundZ - coverM : 0;
    seed.assumed = true;
    assumed = true;
  }
  assumed = propagateInverts(map, pipes, minS) || assumed;
  for (const node of nodes) {
    if (node.invertZ == null) {
      node.invertZ = 0;
      node.assumed = true;
      assumed = true;
    }
    if (node.groundZ == null) {
      node.groundZ = node.invertZ + coverM;
      node.assumed = true;
      assumed = true;
    }
  }
  return assumed;
}

function formatPipeDiaLabel(diameterMm: number): string {
  return `Ø${Math.round(diameterMm)}`;
}

function streetRings(project: CadProject): Drainage3dStreetRing[] {
  const out: Drainage3dStreetRing[] = [];
  for (const e of project.entities) {
    if (e.type !== "polyline" || !e.closed || e.layerId !== LOTEAMENTO_VIAS_LAYER_ID) continue;
    if (e.vertices.length < 3) continue;
    const outer: [number, number][] = e.vertices.map((v) => [v.x, v.y]);
    out.push({ outer, holes: [] });
  }
  return out;
}

function expandBounds(bounds: Drainage3dBounds, x: number, y: number, z: number) {
  if (x < bounds.minX) bounds.minX = x;
  if (y < bounds.minY) bounds.minY = y;
  if (z < bounds.minZ) bounds.minZ = z;
  if (x > bounds.maxX) bounds.maxX = x;
  if (y > bounds.maxY) bounds.maxY = y;
  if (z > bounds.maxZ) bounds.maxZ = z;
}

function midpoint(a: Drainage3dVec3, b: Drainage3dVec3): Drainage3dVec3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function length3d(a: Drainage3dVec3, b: Drainage3dVec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function resolvePipeEnds(
  pipe: CadPolylineEntity,
  nodes: Map<string, NodeDraft>,
  minS: number,
): { start: Drainage3dVec3; end: Drainage3dVec3; lengthM: number } | null {
  const verts = pipe.vertices;
  if (verts.length < 2) return null;
  const a = verts[0]!;
  const b = verts[verts.length - 1]!;
  const from = pipe.drainage?.fromPvId ? nodes.get(pipe.drainage.fromPvId) : nearestNode(a.x, a.y, [...nodes.values()], 2.5);
  const to = pipe.drainage?.toPvId ? nodes.get(pipe.drainage.toPvId) : nearestNode(b.x, b.y, [...nodes.values()], 2.5);
  const lengthM = pipe.drainage?.lengthM ?? pipeLengthM(a.x, a.y, b.x, b.y);
  const trustedVertexZ = (z: number, nodeZ: number | null) =>
    finiteNum(z) && !(z === 0 && (nodeZ == null || nodeZ !== 0));

  let inZ =
    finiteNum(pipe.drainage?.invertInZ) ? pipe.drainage.invertInZ
    : from?.invertZ != null ? from.invertZ
    : trustedVertexZ(a.z, from?.invertZ ?? null) ? a.z
    : null;
  let outZ =
    finiteNum(pipe.drainage?.invertOutZ) ? pipe.drainage.invertOutZ
    : to?.invertZ != null ? to.invertZ
    : trustedVertexZ(b.z, to?.invertZ ?? null) ? b.z
    : null;

  if (inZ == null && outZ != null) inZ = outZ + minS * Math.max(lengthM, 0);
  if (outZ == null && inZ != null) outZ = inZ - minS * Math.max(lengthM, 0);
  if (inZ == null) inZ = 0;
  if (outZ == null) outZ = inZ - minS * Math.max(lengthM, 0);

  const start: Drainage3dVec3 = { x: from?.x ?? a.x, y: from?.y ?? a.y, z: inZ };
  const end: Drainage3dVec3 = { x: to?.x ?? b.x, y: to?.y ?? b.y, z: outZ };
  return { start, end, lengthM: lengthM > 0 ? lengthM : dist2(start.x, start.y, end.x, end.y) };
}

export function drainageNetwork3dReadiness(project: CadProject): DrainageNetwork3dReadiness {
  const pvs = listDrainagePvs(project);
  const pipes = listDrainagePipes(project);
  const inletCount = pvs.filter((p) => nodeKind(p) === "inlet").length;
  return {
    ok: pvs.length > 0 || pipes.length > 0,
    pvCount: pvs.length,
    pipeCount: pipes.length,
    inletCount,
  };
}

export function formatDrainage3dPipeLabel(diameterMm: number): string {
  return formatPipeDiaLabel(diameterMm);
}

/**
 * Constrói entradas de malha 3D da rede (tubos na invert, poços do CF ao CT).
 * Cotas ausentes viram esquema com recobrimento e declividade mínima — não lança.
 */
export function buildDrainageNetwork3d(
  project: CadProject,
  options: BuildDrainageNetwork3dOptions = {},
): DrainageNetwork3dScene | null {
  try {
    const coverM = options.coverM != null && options.coverM > 0 ? options.coverM : DRAINAGE_3D_DEFAULT_COVER_M;
    const minSlopePct =
      options.minSlopePct != null && options.minSlopePct > 0 ? options.minSlopePct : DRAINAGE_3D_DEFAULT_MIN_SLOPE_PCT;
    const minS = minSlopePct / 100;
    const pvs = listDrainagePvs(project);
    const pipes = listDrainagePipes(project);
    if (pvs.length === 0 && pipes.length === 0) return null;

    const nodes: NodeDraft[] = pvs.map((pv) => {
      const elev = readNodeElev(pv);
      return {
        id: pv.id,
        code: pv.drainage?.code ?? pv.label ?? pv.id,
        kind: nodeKind(pv),
        x: pv.x,
        y: pv.y,
        invertZ: elev.invertZ,
        groundZ: elev.groundZ,
        assumed: elev.invertZ == null || elev.groundZ == null,
      };
    });
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    let schematic = nodes.some((n) => n.assumed);
    for (const pipe of pipes) {
      const from = pipe.drainage?.fromPvId ? nodeMap.get(pipe.drainage.fromPvId) : null;
      const to = pipe.drainage?.toPvId ? nodeMap.get(pipe.drainage.toPvId) : null;
      if (from && finiteNum(pipe.drainage?.invertInZ) && from.invertZ == null) {
        from.invertZ = pipe.drainage.invertInZ;
      }
      if (to && finiteNum(pipe.drainage?.invertOutZ) && to.invertZ == null) {
        to.invertZ = pipe.drainage.invertOutZ;
      }
    }
    schematic = propagateInverts(nodeMap, pipes, minS) || schematic;
    schematic = fillRemainingInverts(nodes, coverM, minS, pipes) || schematic;

    for (const node of nodes) {
      if (node.invertZ == null) {
        node.invertZ = 0;
        schematic = true;
      }
      if (node.groundZ == null) {
        const extra = node.kind === "inlet" ? Math.min(coverM, 0.65) : coverM;
        node.groundZ = node.invertZ + extra;
        schematic = true;
      }
      if (node.groundZ < node.invertZ) {
        node.groundZ = node.invertZ + DRAINAGE_3D_MIN_SHAFT_M;
        schematic = true;
      }
    }

    const shaftCandidates: Drainage3dShaftMesh[] = nodes.map((node) => {
      const invertZ = node.invertZ ?? 0;
      const groundZ = node.groundZ ?? invertZ + coverM;
      const heightM = Math.max(groundZ - invertZ, DRAINAGE_3D_MIN_SHAFT_M);
      const isInlet = node.kind === "inlet";
      const widthM = isInlet ? DRAINAGE_3D_INLET_WIDTH_M : node.kind === "outfall" ? 1.35 : DRAINAGE_3D_PV_SIZE_M;
      const depthM = isInlet ? DRAINAGE_3D_INLET_DEPTH_M : widthM;
      return {
        id: node.id,
        code: node.code,
        kind: node.kind,
        x: node.x,
        y: node.y,
        invertZ,
        groundZ,
        heightM,
        widthM,
        depthM,
        label: node.code,
        cfct: `${formatDrainageCotaLine("CF", invertZ)}\n${formatDrainageCotaLine("CT", groundZ)}`,
      };
    });

    const pipeMeshes: Drainage3dPipeMesh[] = [];
    for (const pipe of pipes) {
      const ends = resolvePipeEnds(pipe, nodeMap, minS);
      if (!ends) continue;
      if (length3d(ends.start, ends.end) < 1e-4 && ends.lengthM < 1e-4) continue;
      const diameterMm = finiteNum(pipe.drainage?.diameterMm) && pipe.drainage.diameterMm > 0
        ? pipe.drainage.diameterMm
        : DEFAULT_DRAINAGE_PARAMS.minDiameterMm;
      const radiusM = Math.max(diameterMm / 2000, 0.04);
      const failed = isDrainageAlertStatus(pipe.drainage?.status);
      pipeMeshes.push({
        id: pipe.id,
        code: pipe.drainage?.code ?? pipe.name ?? pipe.id,
        diameterMm,
        radiusM,
        lengthM: ends.lengthM,
        length3dM: length3d(ends.start, ends.end),
        start: ends.start,
        end: ends.end,
        midpoint: midpoint(ends.start, ends.end),
        failed,
        label: formatPipeDiaLabel(diameterMm),
      });
    }

    const pvCount = shaftCandidates.filter((s) => s.kind !== "inlet").length;
    const inletCount = shaftCandidates.filter((s) => s.kind === "inlet").length;
    const shafts = shaftCandidates.map((s, i) => {
      const sparseInlets = inletCount > 10 && s.kind === "inlet";
      const sparsePvs = pvCount > 36 && s.kind === "pv" && i % 2 === 1;
      return {
        ...s,
        label: sparseInlets || sparsePvs ? null : s.label,
        cfct: sparseInlets ? null : s.cfct,
      };
    });
    const labeledPipes = pipeMeshes.map((p, i) => ({
      ...p,
      label: pipeMeshes.length > 40 && i % 2 === 1 && !p.failed ? null : p.label,
    }));

    const bounds: Drainage3dBounds = {
      minX: Infinity,
      minY: Infinity,
      minZ: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
      maxZ: -Infinity,
    };
    for (const s of shafts) {
      expandBounds(bounds, s.x, s.y, s.invertZ);
      expandBounds(bounds, s.x, s.y, s.groundZ);
    }
    for (const p of labeledPipes) {
      expandBounds(bounds, p.start.x, p.start.y, p.start.z);
      expandBounds(bounds, p.end.x, p.end.y, p.end.z);
    }
    if (!Number.isFinite(bounds.minX)) {
      bounds.minX = 0;
      bounds.minY = 0;
      bounds.minZ = 0;
      bounds.maxX = 1;
      bounds.maxY = 1;
      bounds.maxZ = 1;
    }

    const origin: Drainage3dVec3 = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
      z: bounds.minZ,
    };
    const extentM = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 12);
    const groundList = shafts.map((s) => s.groundZ);
    const medianGroundZ =
      groundList.length === 0
        ? origin.z + coverM
        : [...groundList].sort((a, b) => a - b)[Math.floor(groundList.length / 2)]!;

    return {
      origin,
      bounds,
      extentM,
      schematic,
      coverM,
      minSlopePct,
      medianGroundZ,
      pipes: labeledPipes,
      shafts,
      streets: streetRings(project),
    };
  } catch {
    return null;
  }
}
