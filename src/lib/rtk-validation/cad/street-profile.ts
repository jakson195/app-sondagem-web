import { extractSurveyElevationPoints, type ElevationSample } from "./contour";
import { polylineLengthM, sampleAlignmentStations, type AlignmentStation } from "./profile";
import { LOTEAMENTO_EIXOS_LAYER_ID } from "./reurb";
import type { CadEntity, CadLayer, CadPointEntity, CadPolylineEntity, CadProject, CadVertex } from "./types";

export const LOTEAMENTO_ENCONTROS_LAYER: CadLayer = {
  id: "loteamento_encontros",
  name: "LOTEAMENTO_ENCONTROS",
  color: "#dc2626",
  visible: true,
  locked: false,
};

export const LOTEAMENTO_PERFIL_LAYER: CadLayer = {
  id: "loteamento_perfil",
  name: "LOTEAMENTO_PERFIL",
  color: "#0891b2",
  visible: true,
  locked: false,
};

export const LOTEAMENTO_GREIDE_LAYER: CadLayer = {
  id: "loteamento_greide",
  name: "LOTEAMENTO_GREIDE",
  color: "#2563eb",
  visible: true,
  locked: false,
};

export const LOTEAMENTO_SECAO_LAYER: CadLayer = {
  id: "loteamento_secao",
  name: "LOTEAMENTO_SECAO_TIPO",
  color: "#7c3aed",
  visible: true,
  locked: false,
};

export const STREET_PROFILE_CHART_LAYER_IDS = new Set([
  LOTEAMENTO_PERFIL_LAYER.id,
  LOTEAMENTO_GREIDE_LAYER.id,
  LOTEAMENTO_SECAO_LAYER.id,
]);

export function isStreetProfileChartLayer(layerId: string): boolean {
  return STREET_PROFILE_CHART_LAYER_IDS.has(layerId);
}

export type StreetIntersection = {
  x: number;
  y: number;
  stationM: number;
  streetIds: string[];
  streetNames: string[];
};

export type StreetAlignment = {
  id: string;
  name: string;
  vertices: CadVertex[];
  intersections: StreetIntersection[];
};

export type GreidePiv = {
  id: string;
  stationM: number;
  z: number;
  kind: "start" | "end" | "intersection" | "piv";
  label?: string;
};

export type StreetProfileDraft = {
  streetId: string;
  streetName: string;
  alignment: CadVertex[];
  terrain: CadVertex[];
  greide: GreidePiv[];
  intersections: StreetIntersection[];
};

export type SecaoTipoParams = {
  larguraPistaM: number;
  larguraCalcadaM: number;
  declivePistaPct: number;
  decliveCalcadaPct?: number;
  taludeCorteH: number;
  taludeAterroH: number;
  meioFioM?: number;
  extensaoTaludeM?: number;
};

export type SecaoTipoSample = {
  offset: number;
  z: number;
  part: "pista" | "calcada" | "talude";
};

export type SecaoTipoGeometry = {
  platform: SecaoTipoSample[];
  aterroLeft: SecaoTipoSample[];
  aterroRight: SecaoTipoSample[];
  corteLeft: SecaoTipoSample[];
  corteRight: SecaoTipoSample[];
};

export type StreetProfileEarthwork = {
  cutAreaM2: number;
  fillAreaM2: number;
  lengthM: number;
};

const SNAP_M = 0.45;
const COLINEAR_DEG = 18;

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureLayer(project: CadProject, layer: CadLayer): CadLayer[] {
  return project.layers.some((l) => l.id === layer.id) ? project.layers : [...project.layers, { ...layer }];
}

type Point = { x: number; y: number; z: number };

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function azimuthDeg(a: Point, b: Point): number {
  let az = (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI;
  if (az < 0) az += 360;
  return az;
}

function angleDiffDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
}

function isColinear(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  return angleDiffDeg(azimuthDeg(a1, a2), azimuthDeg(b1, b2)) <= COLINEAR_DEG;
}

function segmentIntersect(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): { x: number; y: number; t: number; u: number } | null {
  const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), t, u };
}

export function listLoteamentoEixos(project: CadProject): CadPolylineEntity[] {
  return project.entities.filter(
    (e): e is CadPolylineEntity =>
      e.type === "polyline" &&
      !e.closed &&
      e.vertices.length >= 2 &&
      e.layerId === LOTEAMENTO_EIXOS_LAYER_ID,
  );
}

type RawSeg = { id: string; name: string; a: Point; b: Point };

function rawSegments(eixos: CadPolylineEntity[]): RawSeg[] {
  const segs: RawSeg[] = [];
  for (const eixo of eixos) {
    for (let i = 0; i < eixo.vertices.length - 1; i++) {
      const a = eixo.vertices[i];
      const b = eixo.vertices[i + 1];
      if (dist(a, b) < 1e-6) continue;
      segs.push({
        id: `${eixo.id}:${i}`,
        name: eixo.name?.trim() || `Eixo ${segs.length + 1}`,
        a,
        b,
      });
    }
  }
  return segs;
}

function snapPoint(p: Point, nodes: Point[]): Point {
  for (const node of nodes) {
    if (dist(p, node) <= SNAP_M) return node;
  }
  nodes.push({ ...p });
  return nodes[nodes.length - 1];
}

function splitSegmentsAtIntersections(segs: RawSeg[]): RawSeg[] {
  const cuts = new Map<string, number[]>();
  const mark = (id: string, t: number) => {
    const list = cuts.get(id) ?? [0, 1];
    if (!list.some((v) => Math.abs(v - t) < 1e-4)) list.push(t);
    cuts.set(id, list);
  };

  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const hit = segmentIntersect(segs[i].a, segs[i].b, segs[j].a, segs[j].b);
      if (!hit) continue;
      mark(segs[i].id, Math.min(1, Math.max(0, hit.t)));
      mark(segs[j].id, Math.min(1, Math.max(0, hit.u)));
    }
  }

  const out: RawSeg[] = [];
  for (const seg of segs) {
    const ts = [...(cuts.get(seg.id) ?? [0, 1])].sort((a, b) => a - b);
    for (let i = 0; i < ts.length - 1; i++) {
      const t0 = ts[i];
      const t1 = ts[i + 1];
      if (t1 - t0 < 1e-4) continue;
      const a = {
        x: seg.a.x + (seg.b.x - seg.a.x) * t0,
        y: seg.a.y + (seg.b.y - seg.a.y) * t0,
        z: seg.a.z + (seg.b.z - seg.a.z) * t0,
      };
      const b = {
        x: seg.a.x + (seg.b.x - seg.a.x) * t1,
        y: seg.a.y + (seg.b.y - seg.a.y) * t1,
        z: seg.a.z + (seg.b.z - seg.a.z) * t1,
      };
      out.push({ id: `${seg.id}@${t0.toFixed(3)}`, name: seg.name, a, b });
    }
  }
  return out;
}

function nodeKey(p: Point): string {
  return `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
}

export function buildStreetAlignments(eixos: CadPolylineEntity[]): StreetAlignment[] {
  const snapped: Point[] = [];
  const pieces = splitSegmentsAtIntersections(rawSegments(eixos)).map((seg) => ({
    ...seg,
    a: snapPoint(seg.a, snapped),
    b: snapPoint(seg.b, snapped),
  }));

  type Edge = { id: string; name: string; a: Point; b: Point; used: boolean };
  const edges: Edge[] = pieces
    .filter((seg) => dist(seg.a, seg.b) > SNAP_M * 0.5)
    .map((seg) => ({ ...seg, used: false }));

  const adj = new Map<string, Edge[]>();
  const addAdj = (p: Point, edge: Edge) => {
    const key = nodeKey(p);
    const list = adj.get(key) ?? [];
    list.push(edge);
    adj.set(key, list);
  };
  for (const edge of edges) {
    addAdj(edge.a, edge);
    addAdj(edge.b, edge);
  }

  const pickNext = (from: Point, prev: Point | null): Edge | null => {
    const incident = adj.get(nodeKey(from)) ?? [];
    const unused = incident.filter((e) => !e.used);
    if (unused.length === 0) return null;
    if (!prev) return unused[0] ?? null;
    const colinear = unused.filter((e) => {
      const other = nodeKey(e.a) === nodeKey(from) ? e.b : e.a;
      return isColinear(prev, from, from, other);
    });
    if (colinear[0]) return colinear[0];
    if (incident.length >= 3) return null;
    return unused[0] ?? null;
  };

  const walk = (startEdge: Edge): Point[] => {
    startEdge.used = true;
    const chain = [startEdge.a, startEdge.b];

    const extend = (forward: boolean) => {
      let tip = forward ? chain[chain.length - 1] : chain[0];
      let prev = forward ? chain[chain.length - 2] : chain[1];
      while (tip && prev) {
        const next = pickNext(tip, prev);
        if (!next) break;
        next.used = true;
        const other = nodeKey(next.a) === nodeKey(tip) ? next.b : next.a;
        if (forward) chain.push(other);
        else chain.unshift(other);
        prev = tip;
        tip = other;
        const degree = (adj.get(nodeKey(tip)) ?? []).length;
        if (degree >= 3 && !isColinear(prev, tip, tip, other)) break;
      }
    };

    extend(true);
    extend(false);
    return chain;
  };

  const streets: StreetAlignment[] = [];
  for (const edge of edges) {
    if (edge.used) continue;
    const vertices = walk(edge);
    if (vertices.length < 2) continue;
    streets.push({
      id: newId("rua"),
      name: `Rua ${streets.length + 1}`,
      vertices,
      intersections: [],
    });
  }

  const nodeStreets = new Map<string, Set<number>>();
  streets.forEach((street, index) => {
    for (const vertex of street.vertices) {
      const key = nodeKey(vertex);
      const set = nodeStreets.get(key) ?? new Set<number>();
      set.add(index);
      nodeStreets.set(key, set);
    }
  });

  streets.forEach((street) => {
    let station = 0;
    street.intersections = [];
    for (let i = 0; i < street.vertices.length; i++) {
      if (i > 0) station += dist(street.vertices[i - 1], street.vertices[i]);
      const others = [...(nodeStreets.get(nodeKey(street.vertices[i])) ?? [])].filter(
        (idx) => streets[idx]?.id !== street.id,
      );
      if (others.length === 0) continue;
      street.intersections.push({
        x: street.vertices[i].x,
        y: street.vertices[i].y,
        stationM: station,
        streetIds: others.map((idx) => streets[idx].id),
        streetNames: others.map((idx) => streets[idx].name),
      });
    }
  });

  return streets;
}

function sampleZ(x: number, y: number, samples: ElevationSample[], fallback: number): number {
  if (samples.length === 0) return fallback;
  if (samples.length < 3) {
    let best = samples[0];
    let bestD = Infinity;
    for (const s of samples) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best?.z ?? fallback;
  }
  let num = 0;
  let den = 0;
  for (const s of samples) {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < 1e-6) return s.z;
    const w = 1 / d ** 2;
    num += w * s.z;
    den += w;
  }
  return den > 0 ? num / den : fallback;
}

export function interpolateGreideZ(greide: GreidePiv[], stationM: number): number {
  if (greide.length === 0) return 0;
  const sorted = [...greide].sort((a, b) => a.stationM - b.stationM);
  if (stationM <= (sorted[0]?.stationM ?? 0)) return sorted[0]?.z ?? 0;
  const last = sorted[sorted.length - 1];
  if (stationM >= (last?.stationM ?? 0)) return last?.z ?? 0;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (stationM <= b.stationM) {
      const span = b.stationM - a.stationM || 1;
      const t = (stationM - a.stationM) / span;
      return a.z + (b.z - a.z) * t;
    }
  }
  return last?.z ?? 0;
}

export function greideVertices(greide: GreidePiv[]): CadVertex[] {
  return [...greide]
    .sort((a, b) => a.stationM - b.stationM)
    .map((p) => ({ x: p.stationM, y: 0, z: p.z }));
}

export function computeProfileEarthwork(terrain: CadVertex[], greide: GreidePiv[]): StreetProfileEarthwork {
  let cutAreaM2 = 0;
  let fillAreaM2 = 0;
  const lengthM = terrain[terrain.length - 1]?.x ?? 0;
  for (let i = 1; i < terrain.length; i++) {
    const a = terrain[i - 1];
    const b = terrain[i];
    const ds = b.x - a.x;
    if (ds <= 0) continue;
    const gA = interpolateGreideZ(greide, a.x);
    const gB = interpolateGreideZ(greide, b.x);
    const hA = a.z - gA;
    const hB = b.z - gB;
    cutAreaM2 += ((Math.max(0, hA) + Math.max(0, hB)) / 2) * ds;
    fillAreaM2 += ((Math.max(0, -hA) + Math.max(0, -hB)) / 2) * ds;
  }
  return { cutAreaM2, fillAreaM2, lengthM };
}

export function buildStreetProfiles(project: CadProject, intervalM = 5): StreetProfileDraft[] {
  const eixos = listLoteamentoEixos(project);
  const streets = buildStreetAlignments(eixos);
  const samples = extractSurveyElevationPoints(project.entities);
  const fallbackZ = eixos[0]?.vertices[0]?.z ?? 0;

  return streets.map((street) => {
    const stations = sampleAlignmentStations(street.vertices, intervalM);
    const terrain: CadVertex[] = stations.map((st) => ({
      x: st.stationM,
      y: 0,
      z: sampleZ(st.x, st.y, samples, fallbackZ),
    }));
    const greide: GreidePiv[] = [
      {
        id: newId("piv"),
        stationM: 0,
        z: terrain[0]?.z ?? fallbackZ,
        kind: "start",
      },
      ...street.intersections.map((hit) => ({
        id: newId("piv"),
        stationM: hit.stationM,
        z: interpolateAlong(terrain, hit.stationM),
        kind: "intersection" as const,
        label: `Encontro ${hit.streetNames.join(" × ")}`,
      })),
      {
        id: newId("piv"),
        stationM: terrain[terrain.length - 1]?.x ?? polylineLengthM(street.vertices),
        z: terrain[terrain.length - 1]?.z ?? fallbackZ,
        kind: "end",
      },
    ];
    return {
      streetId: street.id,
      streetName: street.name,
      alignment: street.vertices,
      terrain,
      greide,
      intersections: street.intersections,
    };
  });
}

function interpolateAlong(terrain: CadVertex[], stationM: number): number {
  if (terrain.length === 0) return 0;
  if (stationM <= (terrain[0]?.x ?? 0)) return terrain[0]?.z ?? 0;
  const last = terrain[terrain.length - 1];
  if (stationM >= (last?.x ?? 0)) return last?.z ?? 0;
  for (let i = 1; i < terrain.length; i++) {
    const a = terrain[i - 1];
    const b = terrain[i];
    if (stationM <= b.x) {
      const span = b.x - a.x || 1;
      return a.z + ((stationM - a.x) / span) * (b.z - a.z);
    }
  }
  return last?.z ?? 0;
}

export function updateGreidePiv(profile: StreetProfileDraft, pivId: string, z: number): StreetProfileDraft {
  return {
    ...profile,
    greide: profile.greide.map((p) => (p.id === pivId ? { ...p, z } : p)),
  };
}

export function addGreidePiv(profile: StreetProfileDraft, stationM: number, z?: number): StreetProfileDraft {
  const clamped = Math.max(0, Math.min(stationM, profile.terrain[profile.terrain.length - 1]?.x ?? stationM));
  if (profile.greide.some((p) => Math.abs(p.stationM - clamped) < 0.4)) return profile;
  return {
    ...profile,
    greide: [
      ...profile.greide,
      {
        id: newId("piv"),
        stationM: clamped,
        z: z ?? interpolateGreideZ(profile.greide, clamped),
        kind: "piv",
      },
    ],
  };
}

export function defaultSecaoTipo(larguraViaM: number, larguraCalcadaM: number): SecaoTipoParams {
  const calcada = Math.max(0, larguraCalcadaM);
  const pista = Math.max(3, larguraViaM - 2 * calcada);
  return secaoTipoFromInputs({ pistaM: pista, calcadaM: calcada });
}

export function secaoTipoFromInputs(input: {
  pistaM: number;
  calcadaM: number;
  declivePistaPct?: number;
  decliveCalcadaPct?: number;
  taludeCorteH?: number;
  taludeAterroH?: number;
  meioFioM?: number;
  extensaoTaludeM?: number;
}): SecaoTipoParams {
  return {
    larguraPistaM: Math.max(0.5, input.pistaM),
    larguraCalcadaM: Math.max(0, input.calcadaM),
    declivePistaPct: input.declivePistaPct ?? 2,
    decliveCalcadaPct: input.decliveCalcadaPct ?? 2,
    taludeCorteH: input.taludeCorteH ?? 1.5,
    taludeAterroH: input.taludeAterroH ?? 2,
    meioFioM: input.meioFioM ?? 0.15,
    extensaoTaludeM: input.extensaoTaludeM ?? 4,
  };
}

function resolvedSecao(params: SecaoTipoParams, halfExtraM?: number) {
  const halfPista = Math.max(0.5, params.larguraPistaM / 2);
  const calcada = Math.max(0, params.larguraCalcadaM);
  const meioFio = Math.max(0, params.meioFioM ?? 0.15);
  const declivePista = params.declivePistaPct;
  const decliveCalcada = params.decliveCalcadaPct ?? 2;
  const corteH = params.taludeCorteH > 0 ? params.taludeCorteH : 1.5;
  const aterroH = params.taludeAterroH > 0 ? params.taludeAterroH : 2;
  const extra = Math.max(0.5, halfExtraM ?? params.extensaoTaludeM ?? 4);
  return { halfPista, calcada, meioFio, declivePista, decliveCalcada, corteH, aterroH, extra };
}

export function secaoTipoElevations(params: SecaoTipoParams, greideZ: number, halfExtraM?: number) {
  const r = resolvedSecao(params, halfExtraM);
  const edgePistaZ = greideZ - (r.halfPista * r.declivePista) / 100;
  const calcadaInnerZ = edgePistaZ + r.meioFio;
  const calcadaOuterZ = calcadaInnerZ - (r.calcada * r.decliveCalcada) / 100;
  return { ...r, greideZ, edgePistaZ, calcadaInnerZ, calcadaOuterZ };
}

export function buildSecaoTipoGeometry(
  params: SecaoTipoParams,
  greideZ: number,
  halfExtraM?: number,
): SecaoTipoGeometry {
  const e = secaoTipoElevations(params, greideZ, halfExtraM);
  const sidewalk = e.halfPista + e.calcada;
  const tip = sidewalk + e.extra;
  const aterroTipZ = e.calcadaOuterZ - e.extra / e.aterroH;
  const corteTipZ = e.calcadaOuterZ + e.extra / e.corteH;

  const platform: SecaoTipoSample[] = [
    { offset: -sidewalk, z: e.calcadaOuterZ, part: "calcada" },
    { offset: -e.halfPista, z: e.calcadaInnerZ, part: "calcada" },
    { offset: -e.halfPista, z: e.edgePistaZ, part: "pista" },
    { offset: 0, z: e.greideZ, part: "pista" },
    { offset: e.halfPista, z: e.edgePistaZ, part: "pista" },
    { offset: e.halfPista, z: e.calcadaInnerZ, part: "calcada" },
    { offset: sidewalk, z: e.calcadaOuterZ, part: "calcada" },
  ];

  return {
    platform,
    aterroLeft: [
      { offset: -tip, z: aterroTipZ, part: "talude" },
      { offset: -sidewalk, z: e.calcadaOuterZ, part: "talude" },
    ],
    aterroRight: [
      { offset: sidewalk, z: e.calcadaOuterZ, part: "talude" },
      { offset: tip, z: aterroTipZ, part: "talude" },
    ],
    corteLeft: [
      { offset: -tip, z: corteTipZ, part: "talude" },
      { offset: -sidewalk, z: e.calcadaOuterZ, part: "talude" },
    ],
    corteRight: [
      { offset: sidewalk, z: e.calcadaOuterZ, part: "talude" },
      { offset: tip, z: corteTipZ, part: "talude" },
    ],
  };
}

export function sampleSecaoTipo(params: SecaoTipoParams, greideZ: number, halfExtraM = 4): SecaoTipoSample[] {
  const g = buildSecaoTipoGeometry(params, greideZ, halfExtraM);
  return [...g.aterroLeft, ...g.platform, ...g.aterroRight];
}

export function secaoTipoPolyline(
  params: SecaoTipoParams,
  greideZ: number,
  name: string,
): CadPolylineEntity {
  const samples = sampleSecaoTipo(params, greideZ, params.extensaoTaludeM);
  return {
    id: newId("st"),
    type: "polyline",
    layerId: LOTEAMENTO_SECAO_LAYER.id,
    closed: false,
    name,
    vertices: samples.map((s) => ({ x: s.offset, y: 0, z: s.z })),
  };
}

export function applyStreetProfilesToProject(
  project: CadProject,
  profiles: StreetProfileDraft[],
  secao?: { params: SecaoTipoParams; intervalM: number },
): CadProject {
  const strip = new Set([
    LOTEAMENTO_ENCONTROS_LAYER.id,
    LOTEAMENTO_PERFIL_LAYER.id,
    LOTEAMENTO_GREIDE_LAYER.id,
    LOTEAMENTO_SECAO_LAYER.id,
  ]);
  const kept = project.entities.filter((e) => !strip.has(e.layerId));
  const added: CadEntity[] = [];
  const seenHits = new Set<string>();

  for (const profile of profiles) {
    added.push({
      id: newId("perf"),
      type: "polyline",
      layerId: LOTEAMENTO_PERFIL_LAYER.id,
      closed: false,
      name: `Perfil ${profile.streetName}`,
      vertices: profile.terrain,
    });
    added.push({
      id: newId("grd"),
      type: "polyline",
      layerId: LOTEAMENTO_GREIDE_LAYER.id,
      closed: false,
      name: `Greide ${profile.streetName}`,
      vertices: greideVertices(profile.greide),
    });
    for (const hit of profile.intersections) {
      const key = `${hit.x.toFixed(2)},${hit.y.toFixed(2)}`;
      if (seenHits.has(key)) continue;
      seenHits.add(key);
      added.push({
        id: newId("enc"),
        type: "point",
        layerId: LOTEAMENTO_ENCONTROS_LAYER.id,
        x: hit.x,
        y: hit.y,
        z: hit.stationM,
        label: `Encontro ${[profile.streetName, ...hit.streetNames].join(" × ")}`,
      } satisfies CadPointEntity);
    }
    if (secao) {
      const stations = sampleAlignmentStations(profile.alignment, secao.intervalM);
      for (const st of stations) {
        added.push(
          secaoTipoPolyline(
            secao.params,
            interpolateGreideZ(profile.greide, st.stationM),
            `ST ${profile.streetName} · ${st.stationM.toFixed(1)} m`,
          ),
        );
      }
    }
  }

  let layers = project.layers;
  layers = ensureLayer({ ...project, layers }, LOTEAMENTO_ENCONTROS_LAYER);
  layers = ensureLayer({ ...project, layers }, LOTEAMENTO_PERFIL_LAYER);
  layers = ensureLayer({ ...project, layers }, LOTEAMENTO_GREIDE_LAYER);
  if (secao) layers = ensureLayer({ ...project, layers }, LOTEAMENTO_SECAO_LAYER);

  return { ...project, layers, entities: [...kept, ...added] };
}

/** Persiste o projeto da seção-tipo mesmo sem eixos de rua (visível no gráfico e na prancha). */
export function applyStandaloneSecaoTipo(project: CadProject, params: SecaoTipoParams, greideZ = 100): CadProject {
  const layers = ensureLayer(project, LOTEAMENTO_SECAO_LAYER);
  const kept = project.entities.filter((e) => e.layerId !== LOTEAMENTO_SECAO_LAYER.id);
  return {
    ...project,
    layers,
    entities: [...kept, secaoTipoPolyline(params, greideZ, "Seção-tipo do projeto")],
  };
}

export function streetStationsTable(profile: StreetProfileDraft, intervalM = 20): AlignmentStation[] {
  return sampleAlignmentStations(profile.alignment, intervalM);
}

/** Converte um perfil do terreno (estaca × cota) em rascunho reutilizável pelo gráfico/prancha. */
export function streetDraftFromTerrainProfile(
  profile: CadPolylineEntity,
  name?: string,
): StreetProfileDraft {
  const terrain = profile.vertices.length >= 2 ? profile.vertices : [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
  ];
  const first = terrain[0];
  const last = terrain[terrain.length - 1];
  return {
    streetId: profile.id,
    streetName: name?.trim() || profile.name?.trim() || "Perfil do terreno",
    alignment: terrain,
    terrain,
    greide: [
      { id: `${profile.id}-start`, stationM: first.x, z: first.z, kind: "start" },
      { id: `${profile.id}-end`, stationM: last.x, z: last.z, kind: "end" },
    ],
    intersections: [],
  };
}
