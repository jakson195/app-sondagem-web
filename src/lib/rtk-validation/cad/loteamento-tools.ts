import { detectCadGeorefFromProject, vertexToEn } from "./georef";
import {
  applyLoteamentoLotClassification,
  DEFAULT_PERCENTUAL_ESQUINA,
  resolveAreaMinimaInterno,
} from "./lot-corner-classification";
import {
  LoteamentoError,
  adjustLotInQuadra,
  bufferPolylineMeters,
  clipAxesOutsideObstacles,
  areaUtilFromStreetsM2,
  DEFAULT_PERCENT_AREA_UTIL,
  DEFAULT_PERCENT_RESERVA_LEGAL,
  generateLoteamento,
  measureLotFrontAndDepth,
  parseReservaCanto,
  placeAreaUtilBesideReserva,
  polygonAreaPlanarM2,
  polygonInteriorOverlapM2,
  rebuildQuadraLotes,
  resolveLotSizeSpec,
  reservarRetanguloNoCanto,
  ringsShareBoundary,
  subtractObstaclesFromPolys,
  unionClosedRings,
  type LotSizeSpec,
  type PolylineBufferSide,
  type ReservaCanto,
} from "./lot-subdivision";
import { applyLoteamentoLotesGrassStyle } from "./layer-styles";
import { formatStreetPlanName } from "./plan-annotation-labels";
import { appendPolygonCenterLabel, buildPolygonCenterLabelText, CAD_TEXT_LAYER } from "./polygon-labels";
import { computePolygonMetrics, formatCoordBr, formatVertexCoordLabel, pointInPolygon } from "./polygon-utils";
import { polygonCentroid } from "./ai-geometry-utils";
import {
  applyReurbLotLabels,
  LOTEAMENTO_CALCADAS_LAYER_ID,
  LOTEAMENTO_EIXOS_LAYER_ID,
  LOTEAMENTO_LOTES_LAYER_ID,
  LOTEAMENTO_VIAS_LAYER_ID,
  REURB_ANNOTATION_LAYER,
  listReurbLots,
} from "./reurb";
import type { CadEntity, CadLayer, CadPolylineEntity, CadProject, CadVertex } from "./types";
import { buildOdsBlob } from "../ods-writer";
import type { Position } from "geojson";

export const LOTEAMENTO_PONTOS_LAYER: CadLayer = {
  id: "loteamento_pontos",
  name: "LOTEAMENTO_PONTOS",
  color: "#16a34a",
  visible: true,
  locked: false,
};

export const LOTEAMENTO_TABELAS_LAYER: CadLayer = {
  id: "loteamento_tabelas",
  name: "LOTEAMENTO_TABELAS",
  color: "#0f2848",
  textColor: "#0f2848",
  visible: true,
  locked: false,
};

export const AREA_RESERVA_LEGAL_LAYER: CadLayer = {
  id: "area_reserva_legal",
  name: "AREA_RESERVA_LEGAL",
  color: "#15803d",
  fillColor: "#4ade80",
  fillAlpha: 0.42,
  textColor: "#14532d",
  lineWidth: 2.4,
  hatchPattern: "diagonal",
  visible: true,
  locked: false,
};

export const AREA_RESERVA_LEGAL_LAYER_ID = AREA_RESERVA_LEGAL_LAYER.id;

export const AREA_APP_LAYER: CadLayer = {
  id: "area_app",
  name: "AREA_APP",
  color: "#0f766e",
  fillColor: "#5eead4",
  fillAlpha: 0.38,
  textColor: "#115e59",
  lineWidth: 2.4,
  hatchPattern: "cross",
  visible: true,
  locked: false,
};

export const AREA_APP_LAYER_ID = AREA_APP_LAYER.id;

export const AREA_UTIL_LAYER: CadLayer = {
  id: "area_util",
  name: "AREA_UTIL",
  color: "#c2410c",
  fillColor: "#fdba74",
  fillAlpha: 0.4,
  textColor: "#9a3412",
  lineWidth: 2.4,
  hatchPattern: "diagonal",
  visible: true,
  locked: false,
};

export const AREA_UTIL_LAYER_ID = AREA_UTIL_LAYER.id;

export const LOTEAMENTO_QUADRAS_LAYER_ID = "loteamento_quadras";

const LOTEAMENTO_VIAS_LAYER: CadLayer = {
  id: LOTEAMENTO_VIAS_LAYER_ID,
  name: "LOTEAMENTO_VIAS",
  color: "#64748b",
  textColor: "#0000FF",
  visible: true,
  locked: false,
};

const LOTEAMENTO_LOTES_LAYER: CadLayer = {
  id: LOTEAMENTO_LOTES_LAYER_ID,
  name: "LOTEAMENTO_LOTES",
  color: "#111827",
  textColor: "#111827",
  textSize: 22,
  lineWidth: 1,
  fillColor: "#4ade80",
  fillAlpha: 0.52,
  hatchPattern: "grass",
  visible: true,
  locked: false,
};

const LOTEAMENTO_CALCADAS_LAYER: CadLayer = {
  id: LOTEAMENTO_CALCADAS_LAYER_ID,
  name: "LOTEAMENTO_CALCADAS",
  color: "#94a3b8",
  fillColor: "#cbd5e1",
  hatchPattern: "diagonal",
  visible: true,
  locked: false,
};

const LOTEAMENTO_QUADRAS_LAYER: CadLayer = {
  id: LOTEAMENTO_QUADRAS_LAYER_ID,
  name: "LOTEAMENTO_QUADRAS",
  color: "#b45309",
  fillColor: "#fde68a",
  visible: true,
  locked: false,
};

const LOTEAMENTO_REPLACE_LAYER_IDS = new Set([
  LOTEAMENTO_VIAS_LAYER_ID,
  LOTEAMENTO_LOTES_LAYER_ID,
  LOTEAMENTO_CALCADAS_LAYER_ID,
  LOTEAMENTO_QUADRAS_LAYER_ID,
]);

export const LOTEAMENTO_EXCLUSION_LAYER_IDS = new Set([
  AREA_RESERVA_LEGAL_LAYER_ID,
  AREA_APP_LAYER_ID,
  "area_institucional",
]);

export const EIXO_NEED_LOTEAMENTO =
  "Gere o loteamento com eixo da rua ou desenhe um eixo para editar.";

export function isLoteamentoEixoPolyline(entity: CadEntity): entity is CadPolylineEntity {
  return (
    entity.type === "polyline" &&
    !entity.closed &&
    entity.vertices.length >= 2 &&
    entity.layerId === LOTEAMENTO_EIXOS_LAYER_ID
  );
}

export function collectLoteamentoEixoRings(project: CadProject): [number, number][][] {
  return project.entities
    .filter(isLoteamentoEixoPolyline)
    .map((entity) => entity.vertices.map((v) => [v.x, v.y] as [number, number]));
}

export const EIXO_TWO_POINT_NEED_HIT =
  "Clique sobre o eixo da rua (vértice, face da quadra ou o traço).";
export const EIXO_TWO_POINT_NEED_DISTINCT =
  "Os dois pontos precisam ser distintos no mesmo eixo.";
export const EIXO_TWO_POINT_NEED_SAME =
  "Os dois pontos devem estar no mesmo eixo, de uma quadra até a outra.";

const EIXO_STATION_EPS_M = 1e-4;
const EIXO_POINT_EPS_M = 0.05;

export type EixoEditHitKind = "vertex" | "quadra_edge" | "segment";

export type EixoEditHit = {
  eixoId: string;
  point: CadVertex;
  stationM: number;
  kind: EixoEditHitKind;
  vertexIndex?: number;
  distanceM: number;
};

export type EixoPolylineStation = {
  stationM: number;
  point: CadVertex;
  segmentIndex: number;
  t: number;
  distanceM: number;
};

export function listLoteamentoEixoPolylines(project: CadProject): CadPolylineEntity[] {
  return project.entities.filter(isLoteamentoEixoPolyline);
}

export function listLoteamentoQuadraPolylines(project: CadProject): CadPolylineEntity[] {
  return project.entities.filter(
    (entity): entity is CadPolylineEntity =>
      entity.type === "polyline" &&
      Boolean(entity.closed) &&
      entity.vertices.length >= 3 &&
      entity.layerId === LOTEAMENTO_QUADRAS_LAYER_ID,
  );
}

export function eixoVertexStations(vertices: CadVertex[]): number[] {
  const stations: number[] = [0];
  let acc = 0;
  for (let i = 1; i < vertices.length; i++) {
    const prev = vertices[i - 1];
    const cur = vertices[i];
    acc += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    stations.push(acc);
  }
  return stations;
}

/** Projeta um ponto no eixo aberto e devolve estaca, ponto e distância. */
export function projectPointOntoEixoPolyline(
  vertices: CadVertex[],
  x: number,
  y: number,
): EixoPolylineStation | null {
  if (vertices.length < 2) return null;
  let best: EixoPolylineStation | null = null;
  let acc = 0;
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i];
    const b = vertices[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const len = Math.sqrt(lenSq);
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lenSq)) : 0;
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const pz = a.z + t * ((b.z ?? 0) - (a.z ?? 0));
    const distanceM = Math.hypot(x - px, y - py);
    if (!best || distanceM < best.distanceM) {
      best = {
        stationM: acc + t * len,
        point: { x: px, y: py, z: pz },
        segmentIndex: i,
        t,
        distanceM,
      };
    }
    acc += len;
  }
  return best;
}

function intersectOpenSegments(
  a: CadVertex,
  b: CadVertex,
  c: CadVertex,
  d: CadVertex,
): { x: number; y: number; t: number } | null {
  const dax = b.x - a.x;
  const day = b.y - a.y;
  const dbx = d.x - c.x;
  const dby = d.y - c.y;
  const den = dax * dby - day * dbx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * dby - (c.y - a.y) * dbx) / den;
  const u = ((c.x - a.x) * day - (c.y - a.y) * dax) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  const clamped = Math.max(0, Math.min(1, t));
  return { x: a.x + clamped * dax, y: a.y + clamped * day, t: clamped };
}

export function collectEixoQuadraFaceHits(
  eixo: CadPolylineEntity,
  quadras: CadPolylineEntity[],
): Array<{ point: CadVertex; stationM: number }> {
  const hits: Array<{ point: CadVertex; stationM: number }> = [];
  const stations = eixoVertexStations(eixo.vertices);
  for (let i = 0; i < eixo.vertices.length - 1; i++) {
    const a = eixo.vertices[i];
    const b = eixo.vertices[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    const z0 = a.z ?? 0;
    for (const quadra of quadras) {
      const n = quadra.vertices.length;
      for (let k = 0; k < n; k++) {
        const c = quadra.vertices[k];
        const d = quadra.vertices[(k + 1) % n];
        const hit = intersectOpenSegments(a, b, c, d);
        if (!hit) continue;
        hits.push({
          point: { x: hit.x, y: hit.y, z: z0 + hit.t * ((b.z ?? 0) - z0) },
          stationM: stations[i] + hit.t * segLen,
        });
      }
    }
  }
  return hits;
}

function eixoEditKindRank(kind: EixoEditHitKind): number {
  if (kind === "vertex") return 0;
  if (kind === "quadra_edge") return 1;
  return 2;
}

function betterEixoEditHit(current: EixoEditHit | null, next: EixoEditHit): boolean {
  if (!current) return true;
  const kindDelta = eixoEditKindRank(next.kind) - eixoEditKindRank(current.kind);
  if (Math.abs(next.distanceM - current.distanceM) <= EIXO_POINT_EPS_M) {
    return kindDelta < 0;
  }
  return next.distanceM < current.distanceM;
}

/** Snap: vértice do eixo, interseção com face de quadra, ou projeção no traço. */
export function hitTestEixoEditPoint(
  project: CadProject,
  x: number,
  y: number,
  maxDistM: number,
  preferEixoId?: string | null,
): EixoEditHit | null {
  const eixos = listLoteamentoEixoPolylines(project);
  if (eixos.length === 0) return null;
  const ordered =
    preferEixoId && eixos.some((item) => item.id === preferEixoId)
      ? [eixos.find((item) => item.id === preferEixoId)!, ...eixos.filter((item) => item.id !== preferEixoId)]
      : eixos;
  const quadras = listLoteamentoQuadraPolylines(project);
  let best: EixoEditHit | null = null;

  for (const eixo of ordered) {
    const stations = eixoVertexStations(eixo.vertices);
    for (let i = 0; i < eixo.vertices.length; i++) {
      const vertex = eixo.vertices[i];
      const distanceM = Math.hypot(x - vertex.x, y - vertex.y);
      if (distanceM > maxDistM) continue;
      const hit: EixoEditHit = {
        eixoId: eixo.id,
        point: { ...vertex },
        stationM: stations[i] ?? 0,
        kind: "vertex",
        vertexIndex: i,
        distanceM,
      };
      if (betterEixoEditHit(best, hit)) best = hit;
    }

    for (const face of collectEixoQuadraFaceHits(eixo, quadras)) {
      const distanceM = Math.hypot(x - face.point.x, y - face.point.y);
      if (distanceM > maxDistM) continue;
      const hit: EixoEditHit = {
        eixoId: eixo.id,
        point: face.point,
        stationM: face.stationM,
        kind: "quadra_edge",
        distanceM,
      };
      if (betterEixoEditHit(best, hit)) best = hit;
    }

    const projected = projectPointOntoEixoPolyline(eixo.vertices, x, y);
    if (projected && projected.distanceM <= maxDistM) {
      const hit: EixoEditHit = {
        eixoId: eixo.id,
        point: projected.point,
        stationM: projected.stationM,
        kind: "segment",
        distanceM: projected.distanceM,
      };
      if (betterEixoEditHit(best, hit)) best = hit;
    }
  }

  return best;
}

function appendEixoVertexIfDistinct(out: CadVertex[], vertex: CadVertex): void {
  const last = out[out.length - 1];
  if (last && Math.hypot(last.x - vertex.x, last.y - vertex.y) <= EIXO_POINT_EPS_M) return;
  out.push({ x: vertex.x, y: vertex.y, z: vertex.z ?? 0 });
}

/** Troca o trecho entre duas estacas pelo segmento A→B (remove o miolo). */
export function replaceEixoBetweenStations(
  vertices: CadVertex[],
  stationA: number,
  pointA: CadVertex,
  stationB: number,
  pointB: CadVertex,
): CadVertex[] {
  if (vertices.length < 2) return vertices.map((v) => ({ ...v }));
  const stations = eixoVertexStations(vertices);
  const s0 = Math.min(stationA, stationB);
  const s1 = Math.max(stationA, stationB);
  const first = stationA <= stationB ? pointA : pointB;
  const second = stationA <= stationB ? pointB : pointA;
  const out: CadVertex[] = [];
  for (let i = 0; i < vertices.length; i++) {
    if ((stations[i] ?? 0) < s0 - EIXO_STATION_EPS_M) {
      appendEixoVertexIfDistinct(out, vertices[i]);
    }
  }
  appendEixoVertexIfDistinct(out, first);
  appendEixoVertexIfDistinct(out, second);
  for (let i = 0; i < vertices.length; i++) {
    if ((stations[i] ?? 0) > s1 + EIXO_STATION_EPS_M) {
      appendEixoVertexIfDistinct(out, vertices[i]);
    }
  }
  return out.length >= 2 ? out : [first, second].map((v) => ({ x: v.x, y: v.y, z: v.z ?? 0 }));
}

export type ApplyEixoTwoPointEditInput = {
  eixoId: string;
  pointA: CadVertex;
  pointB: CadVertex;
  stationA?: number;
  stationB?: number;
};

export type ApplyEixoTwoPointEditResult = {
  project: CadProject;
  eixo: CadPolylineEntity;
  removedVertices: number;
};

function resolveEixoStation(vertices: CadVertex[], point: CadVertex, station?: number): number {
  if (station != null && Number.isFinite(station)) return station;
  return projectPointOntoEixoPolyline(vertices, point.x, point.y)?.stationM ?? 0;
}

/** Redefine o eixo entre dois pontos (faces de quadras ou vértices). */
export function applyEixoTwoPointEdit(
  project: CadProject,
  input: ApplyEixoTwoPointEditInput,
): ApplyEixoTwoPointEditResult {
  const eixo = project.entities.find((entity) => entity.id === input.eixoId);
  if (!eixo || !isLoteamentoEixoPolyline(eixo)) {
    throw new LoteamentoError(EIXO_NEED_LOTEAMENTO);
  }
  const stationA = resolveEixoStation(eixo.vertices, input.pointA, input.stationA);
  const stationB = resolveEixoStation(eixo.vertices, input.pointB, input.stationB);
  const apart =
    Math.abs(stationB - stationA) > EIXO_STATION_EPS_M ||
    Math.hypot(input.pointA.x - input.pointB.x, input.pointA.y - input.pointB.y) > EIXO_POINT_EPS_M;
  if (!apart) {
    throw new LoteamentoError(EIXO_TWO_POINT_NEED_DISTINCT);
  }
  const nextVertices = replaceEixoBetweenStations(
    eixo.vertices,
    stationA,
    input.pointA,
    stationB,
    input.pointB,
  );
  if (nextVertices.length < 2) {
    throw new LoteamentoError(EIXO_TWO_POINT_NEED_DISTINCT);
  }
  const nextEixo: CadPolylineEntity = { ...eixo, vertices: nextVertices };
  return {
    project: {
      ...project,
      entities: project.entities.map((entity) => (entity.id === eixo.id ? nextEixo : entity)),
    },
    eixo: nextEixo,
    removedVertices: Math.max(0, eixo.vertices.length - nextVertices.length),
  };
}

export const RESERVA_LEGAL_NEED_POLYGON =
  "Selecione um polígono fechado (gleba) para definir a reserva legal.";

export const AREA_UTIL_NEED_POLYGON =
  "Selecione um polígono fechado (gleba) para definir a área útil.";

export const AREA_UTIL_NEED_RESERVA =
  "Defina a reserva legal antes da área útil. A área útil fica colada na reserva, no canto escolhido.";

export const AREA_UTIL_NEED_AREA =
  "A área útil ficou 0 (as ruas já consomem o orçamento). Reduza as vias ou aumente o percentual.";

export const APP_NEED_LINE = "Selecione uma linha ou polilinha para definir a APP.";

export type AppBufferSide = PolylineBufferSide;

function isUsableGleba(entity: CadEntity): entity is CadPolylineEntity {
  return (
    entity.type === "polyline" &&
    Boolean(entity.closed) &&
    entity.vertices.length >= 3 &&
    entity.layerId !== AREA_RESERVA_LEGAL_LAYER_ID &&
    entity.layerId !== AREA_APP_LAYER_ID &&
    entity.layerId !== AREA_UTIL_LAYER_ID &&
    entity.layerId !== "area_institucional" &&
    !entity.layerId.startsWith("loteamento_")
  );
}

function resolveUsableGleba(project: CadProject, preferredId?: string | null): CadPolylineEntity | undefined {
  const preferred = preferredId?.trim();
  if (preferred) {
    const hit = project.entities.find(
      (entity): entity is CadPolylineEntity => entity.id === preferred && isUsableGleba(entity),
    );
    if (hit) return hit;
  }
  const glebas = project.entities.filter(isUsableGleba);
  if (glebas.length === 0) return undefined;
  const rl = project.entities.find(
    (entity): entity is CadPolylineEntity =>
      entity.type === "polyline" &&
      Boolean(entity.closed) &&
      entity.layerId === AREA_RESERVA_LEGAL_LAYER_ID &&
      entity.vertices.length >= 3,
  );
  if (rl) {
    const c = polygonCentroid(rl.vertices);
    const host = glebas.find((gleba) => pointInPolygon(c.x, c.y, gleba.vertices));
    if (host) return host;
  }
  return glebas[0];
}

function ensureReservaLegalLayer(project: CadProject): CadLayer[] {
  const idx = project.layers.findIndex((layer) => layer.id === AREA_RESERVA_LEGAL_LAYER.id);
  if (idx < 0) return [...project.layers, { ...AREA_RESERVA_LEGAL_LAYER }];
  return project.layers.map((layer, i) =>
    i === idx
      ? {
          ...AREA_RESERVA_LEGAL_LAYER,
          ...layer,
          visible: true,
          locked: false,
          fillColor: layer.fillColor ?? AREA_RESERVA_LEGAL_LAYER.fillColor,
          fillAlpha: layer.fillAlpha ?? AREA_RESERVA_LEGAL_LAYER.fillAlpha,
          hatchPattern: layer.hatchPattern ?? AREA_RESERVA_LEGAL_LAYER.hatchPattern,
          lineWidth: layer.lineWidth ?? AREA_RESERVA_LEGAL_LAYER.lineWidth,
          textColor: layer.textColor ?? AREA_RESERVA_LEGAL_LAYER.textColor,
        }
      : layer,
  );
}

function ensureAreaUtilLayer(project: CadProject): CadLayer[] {
  const idx = project.layers.findIndex((layer) => layer.id === AREA_UTIL_LAYER.id);
  if (idx < 0) return [...project.layers, { ...AREA_UTIL_LAYER }];
  return project.layers.map((layer, i) =>
    i === idx
      ? {
          ...AREA_UTIL_LAYER,
          ...layer,
          visible: true,
          locked: false,
          fillColor: layer.fillColor ?? AREA_UTIL_LAYER.fillColor,
          fillAlpha: layer.fillAlpha ?? AREA_UTIL_LAYER.fillAlpha,
          hatchPattern: layer.hatchPattern ?? AREA_UTIL_LAYER.hatchPattern,
          lineWidth: layer.lineWidth ?? AREA_UTIL_LAYER.lineWidth,
          textColor: layer.textColor ?? AREA_UTIL_LAYER.textColor,
        }
      : layer,
  );
}

export function isAreaUtilLabel(label: string | undefined): boolean {
  return (label ?? "").startsWith("Área útil");
}

export function collectClosedRingsOnLayer(project: CadProject, layerId: string): [number, number][][] {
  return project.entities
    .filter(
      (entity): entity is CadPolylineEntity =>
        entity.type === "polyline" &&
        Boolean(entity.closed) &&
        entity.vertices.length >= 3 &&
        entity.layerId === layerId,
    )
    .map((entity) => entity.vertices.map((v) => [v.x, v.y] as [number, number]));
}

export function collectReservaLegalRings(project: CadProject): [number, number][][] {
  return collectClosedRingsOnLayer(project, AREA_RESERVA_LEGAL_LAYER_ID);
}

export function collectAppRings(project: CadProject): [number, number][][] {
  return collectClosedRingsOnLayer(project, AREA_APP_LAYER_ID);
}

export function stripPreviousAreaUtil(project: CadProject): CadProject {
  return {
    ...project,
    entities: project.entities.filter((entity) => {
      if (entity.layerId === AREA_UTIL_LAYER_ID) return false;
      if (entity.type === "point" && entity.layerId === CAD_TEXT_LAYER.id && isAreaUtilLabel(entity.label)) {
        return false;
      }
      return true;
    }),
  };
}

export function appendAreaUtilToProject(
  project: CadProject,
  rings: [number, number][][] | number[][][],
  percent: number,
  z0 = 0,
): CadProject {
  let next: CadProject = {
    ...project,
    layers: ensureAreaUtilLayer(project),
  };
  const pctLabel = Number.isInteger(percent) ? String(percent) : percent.toFixed(0);
  for (const ring of rings) {
    const open = dropClosingXY(ring);
    if (open.length < 3) continue;
    const poly: CadPolylineEntity = {
      id: newId("au"),
      type: "polyline",
      layerId: AREA_UTIL_LAYER_ID,
      vertices: open.map(([x, y]) => ({ x, y, z: z0 })),
      closed: true,
      name: `Área útil ${pctLabel}%`,
    };
    next = { ...next, entities: [...next.entities, poly] };
    next = appendPolygonCenterLabel(next, poly);
  }
  return next;
}

function ensureAppLayer(project: CadProject): CadLayer[] {
  const idx = project.layers.findIndex((layer) => layer.id === AREA_APP_LAYER.id);
  if (idx < 0) return [...project.layers, { ...AREA_APP_LAYER }];
  return project.layers.map((layer, i) =>
    i === idx
      ? {
          ...AREA_APP_LAYER,
          ...layer,
          visible: true,
          locked: false,
          fillColor: layer.fillColor ?? AREA_APP_LAYER.fillColor,
          fillAlpha: layer.fillAlpha ?? AREA_APP_LAYER.fillAlpha,
          hatchPattern: layer.hatchPattern ?? AREA_APP_LAYER.hatchPattern,
          lineWidth: layer.lineWidth ?? AREA_APP_LAYER.lineWidth,
          textColor: layer.textColor ?? AREA_APP_LAYER.textColor,
        }
      : layer,
  );
}

function isReservaLegalEntity(entity: CadEntity): boolean {
  if (entity.type === "polyline" && entity.closed && entity.layerId === AREA_RESERVA_LEGAL_LAYER_ID) {
    return true;
  }
  if (
    entity.type === "point" &&
    entity.layerId === CAD_TEXT_LAYER.id &&
    (entity.label ?? "").startsWith("Reserva legal")
  ) {
    return true;
  }
  return false;
}

function isAppLabelText(label: string | undefined): boolean {
  return (label ?? "").startsWith("APP ");
}

export function isAppSourceEntity(entity: CadEntity): boolean {
  if (LOTEAMENTO_EXCLUSION_LAYER_IDS.has(entity.layerId)) return false;
  if (entity.layerId.startsWith("loteamento_")) return false;
  if (entity.type === "polyline") return entity.vertices.length >= 2;
  if (entity.type === "line") return true;
  return false;
}

export function appSourceVertices(entity: CadEntity): CadVertex[] | null {
  if (!isAppSourceEntity(entity)) return null;
  if (entity.type === "polyline") {
    const verts = entity.vertices;
    if (entity.closed && verts.length >= 3) {
      const first = verts[0];
      const last = verts[verts.length - 1];
      if (first && last && first.x === last.x && first.y === last.y) return verts;
      return [...verts, { ...first }];
    }
    return verts;
  }
  if (entity.type === "line") return [entity.start, entity.end];
  return null;
}

export function collectLoteamentoExclusionRings(project: CadProject): [number, number][][] {
  return project.entities
    .filter(
      (entity): entity is CadPolylineEntity =>
        entity.type === "polyline" &&
        Boolean(entity.closed) &&
        entity.vertices.length >= 3 &&
        LOTEAMENTO_EXCLUSION_LAYER_IDS.has(entity.layerId),
    )
    .map((entity) => entity.vertices.map((v) => [v.x, v.y] as [number, number]));
}

const LOTEAMENTO_PUNCH_CLOSED_LAYERS = new Set([
  LOTEAMENTO_LOTES_LAYER_ID,
  LOTEAMENTO_VIAS_LAYER_ID,
  LOTEAMENTO_CALCADAS_LAYER_ID,
  "loteamento_quadras",
]);

function closeXY(ring: [number, number][]): [number, number][] {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [first[0], first[1]]];
}

/** Recorta lotes, vias, calçadas e eixos que invadem obstáculos (reserva, APP, institucional). */
export function punchLoteamentoUnderObstacles(
  project: CadProject,
  obstacles: [number, number][][],
): CadProject {
  const rings = obstacles
    .map((reserved) => closeXY(reserved.map((p) => [p[0], p[1]] as [number, number])))
    .filter((ring) => ring.length >= 4);
  if (rings.length === 0) return project;
  const origin: [number, number] = [
    rings[0].reduce((s, p) => s + p[0], 0) / rings[0].length,
    rings[0].reduce((s, p) => s + p[1], 0) / rings[0].length,
  ];
  const reservaPoly = rings.map((ring) => [ring]);
  const next: CadEntity[] = [];
  for (const entity of project.entities) {
    if (entity.type === "polyline" && entity.closed && LOTEAMENTO_PUNCH_CLOSED_LAYERS.has(entity.layerId)) {
      const poly = [[entity.vertices.map((v) => [v.x, v.y] as [number, number])]];
      const leftover = subtractObstaclesFromPolys(poly, reservaPoly, origin);
      leftover.forEach((coords, i) => {
        const verts = coords[0];
        if (!verts || verts.length < 3) return;
        const first = verts[0];
        const last = verts[verts.length - 1];
        const open =
          first && last && first[0] === last[0] && first[1] === last[1] ? verts.slice(0, -1) : verts;
        next.push({
          ...entity,
          id: i === 0 ? entity.id : newId("clip"),
          vertices: open.map(([x, y]) => ({ x, y, z: entity.vertices[0]?.z ?? 0 })),
        });
      });
      continue;
    }
    if (entity.type === "polyline" && !entity.closed && entity.layerId === LOTEAMENTO_EIXOS_LAYER_ID) {
      const axes = [entity.vertices.map((v) => [v.x, v.y] as [number, number])];
      const clipped = clipAxesOutsideObstacles(axes, reservaPoly, origin);
      clipped.forEach((axis, i) => {
        if (axis.length < 2) return;
        next.push({
          ...entity,
          id: i === 0 ? entity.id : newId("eixo"),
          vertices: axis.map(([x, y]) => ({ x, y, z: entity.vertices[0]?.z ?? 0 })),
        });
      });
      continue;
    }
    next.push(entity);
  }
  return { ...project, entities: next };
}

/** Recorta lotes, vias, calçadas e eixos que invadem a reserva legal. */
export function punchLoteamentoUnderReserva(
  project: CadProject,
  reserved: [number, number][],
): CadProject {
  return punchLoteamentoUnderObstacles(project, [reserved]);
}

export type RebuildLoteamentoFromEixosInput = {
  glebaId?: string | null;
  larguraViaM: number;
  profundidadeQuadraM: number;
  testadaMinimaM: number;
  areaMinimaQuadraM2?: number;
  larguraQuadraM?: number;
  profundidadeBlocoM?: number;
  larguraCalcadaM?: number;
  eixoRua?: boolean;
  raioEsquinaM?: number;
  viasExistentesExtremidades?: boolean;
  ladosAresta?: number[];
  orientacao?: number;
  prefixoQuadra?: string;
  percentAreaUtil?: number;
  cantoAreaUtil?: ReservaCanto | string;
  /** Acréscimo % da área mínima do lote de esquina. Não altera geração dos INTERNO. */
  percentualEsquina?: number;
  /** Área mínima do lote interno (m²). Se omitida, usa testada × profundidade. */
  areaMinimaM2?: number;
};

export type RebuildLoteamentoFromEixosResult = {
  project: CadProject;
  lotCount: number;
  viaCount: number;
  eixoCount: number;
};

function toClosedPolyline(
  ring: number[][],
  layerId: string,
  name: string,
  idPrefix: string,
  z0: number,
): CadPolylineEntity {
  const raw = ring.map(([x, y]) => ({ x, y, z: z0 }));
  const first = raw[0];
  const last = raw[raw.length - 1];
  const vertices =
    first && last && first.x === last.x && first.y === last.y && first.z === last.z ? raw.slice(0, -1) : raw;
  return {
    id: newId(idPrefix),
    type: "polyline",
    layerId,
    vertices,
    closed: true,
    name,
  };
}

/** Regenera vias/lotes/calçadas a partir dos eixos atuais (sem malha automática). */
export function rebuildLoteamentoFromEixos(
  project: CadProject,
  input: RebuildLoteamentoFromEixosInput,
): RebuildLoteamentoFromEixosResult {
  const gleba = resolveUsableGleba(project, input.glebaId);
  if (!gleba) {
    throw new LoteamentoError(RESERVA_LEGAL_NEED_POLYGON);
  }
  const eixoRings = collectLoteamentoEixoRings(project);
  if (eixoRings.length === 0) {
    throw new LoteamentoError(EIXO_NEED_LOTEAMENTO);
  }
  const nVerts = gleba.vertices.length;
  const ladosViaExistente = (input.ladosAresta ?? [])
    .map((i) => Math.trunc(i))
    .filter((i) => i >= 0 && i < nVerts)
    .map((i) => {
      const a = gleba.vertices[i];
      const b = gleba.vertices[(i + 1) % nVerts];
      return [
        [a.x, a.y],
        [b.x, b.y],
      ] as [number, number][];
    });
  const percentAreaUtil =
    input.percentAreaUtil != null && Number.isFinite(input.percentAreaUtil)
      ? Math.max(0, Math.min(99.9, input.percentAreaUtil))
      : 15;
  const reservas = collectLoteamentoExclusionRings(project);
  const reservaLegal = collectReservaLegalRings(project);
  const apps = collectAppRings(project);
  const coords = gleba.vertices.map((v) => [v.x, v.y] as [number, number]);
  const z0 = gleba.vertices[0]?.z ?? 0;
  const result = generateLoteamento(coords, {
    larguraViaM: input.larguraViaM,
    profundidadeQuadraM: input.profundidadeQuadraM,
    testadaMinimaM: input.testadaMinimaM,
    areaMinimaQuadraM2: input.areaMinimaQuadraM2,
    larguraQuadraM: input.larguraQuadraM,
    profundidadeBlocoM: input.profundidadeBlocoM,
    larguraCalcadaM: input.larguraCalcadaM,
    eixoRua: input.eixoRua !== false,
    raioEsquinaM: input.raioEsquinaM,
    viasExistentesExtremidades: Boolean(input.viasExistentesExtremidades) || ladosViaExistente.length > 0,
    eixosExistentes: eixoRings,
    usarEixosComoRede: true,
    ladosViaExistente: ladosViaExistente.length > 0 ? ladosViaExistente : undefined,
    reservas: reservas.length > 0 ? reservas : undefined,
    reservaLegal: reservaLegal.length > 0 ? reservaLegal : undefined,
    apps: apps.length > 0 ? apps : undefined,
    percentAreaUtil,
    cantoAreaUtil: input.cantoAreaUtil,
    prefixoQuadra: input.prefixoQuadra?.trim() || "Quadra",
    orientacao: input.orientacao,
  });

  const viaEntities = result.vias.map((poly, i) =>
    toClosedPolyline(poly[0] ?? [], LOTEAMENTO_VIAS_LAYER.id, formatStreetPlanName(`Via ${i + 1}`, i), "via", z0),
  );
  const loteEntities = result.lotes.map((lote) =>
    toClosedPolyline(lote.coordinates[0] ?? [], LOTEAMENTO_LOTES_LAYER.id, `${lote.quadra} — ${lote.numero}`, "lote", z0),
  );
  const calcadaEntities = result.calcadas.map((poly, i) =>
    toClosedPolyline(poly[0] ?? [], LOTEAMENTO_CALCADAS_LAYER.id, `Calçada ${i + 1}`, "calcada", z0),
  );
  const quadraEntities = result.quadraPolys.map((poly, i) =>
    toClosedPolyline(poly[0] ?? [], LOTEAMENTO_QUADRAS_LAYER.id, `Quadra ${i + 1}`, "quadra", z0),
  );

  const kept = project.entities.filter((entity) => {
    if (LOTEAMENTO_REPLACE_LAYER_IDS.has(entity.layerId)) return false;
    if (entity.layerId === AREA_UTIL_LAYER_ID) return false;
    if (entity.type === "point" && entity.layerId === CAD_TEXT_LAYER.id && isAreaUtilLabel(entity.label)) {
      return false;
    }
    return true;
  });

  let layers = ensureLayer(project, LOTEAMENTO_VIAS_LAYER);
  layers = ensureLayer({ ...project, layers }, LOTEAMENTO_LOTES_LAYER);
  if (calcadaEntities.length > 0) layers = ensureLayer({ ...project, layers }, LOTEAMENTO_CALCADAS_LAYER);
  if (quadraEntities.length > 0) layers = ensureLayer({ ...project, layers }, LOTEAMENTO_QUADRAS_LAYER);

  let next: CadProject = {
    ...project,
    layers,
    entities: [...kept, ...viaEntities, ...calcadaEntities, ...quadraEntities, ...loteEntities],
  };
  next = stripPreviousAreaUtil(next);
  if (result.areaUtil.length > 0) {
    next = appendAreaUtilToProject(
      next,
      result.areaUtil.map((poly) => poly[0] ?? []),
      percentAreaUtil,
      z0,
    );
  }
  const labeled = applyReurbLotLabels(next, { includeCotas: true, includeArea: true });
  if (labeled.lotCount > 0) next = labeled.project;
  next = applyLoteamentoLotClassification(next, {
    percentualEsquina: input.percentualEsquina ?? DEFAULT_PERCENTUAL_ESQUINA,
    areaMinimaInterno: resolveAreaMinimaInterno({
      areaMinimaM2: input.areaMinimaM2,
      testadaM: input.testadaMinimaM,
      profundidadeM: input.profundidadeQuadraM,
    }),
  });
  next = applyLoteamentoTables(next, {
    percentualEsquina: input.percentualEsquina ?? DEFAULT_PERCENTUAL_ESQUINA,
    areaMinimaInterno: resolveAreaMinimaInterno({
      areaMinimaM2: input.areaMinimaM2,
      testadaM: input.testadaMinimaM,
      profundidadeM: input.profundidadeQuadraM,
    }),
  }).project;

  return {
    project: next,
    lotCount: result.lotes.length,
    viaCount: result.vias.length,
    eixoCount: eixoRings.length,
  };
}

export function syncReservaLegalLabel(project: CadProject, reservaId: string): CadProject {
  const reserva = project.entities.find(
    (e): e is CadPolylineEntity => e.id === reservaId && e.type === "polyline" && Boolean(e.closed),
  );
  if (!reserva || reserva.vertices.length < 3) return project;
  const metrics = computePolygonMetrics(reserva.vertices, true);
  const text = buildPolygonCenterLabelText(reserva.name ?? "Reserva legal", metrics.areaM2);
  const c = polygonCentroid(reserva.vertices);
  let found = false;
  return {
    ...project,
    entities: project.entities.map((entity) => {
      if (
        !found &&
        entity.type === "point" &&
        entity.layerId === CAD_TEXT_LAYER.id &&
        (entity.label ?? "").startsWith("Reserva legal")
      ) {
        found = true;
        return { ...entity, x: c.x, y: c.y, z: c.z, label: text };
      }
      return entity;
    }),
  };
}

export type ApplyReservaLegalInput = {
  glebaId?: string | null;
  percent: number;
  canto: ReservaCanto | string;
};

export type ApplyReservaLegalResult = {
  project: CadProject;
  reserved: CadPolylineEntity;
  reservedM2: number;
  percent: number;
  canto: ReservaCanto;
};

/** Cria/atualiza o polígono de reserva legal no canto da gleba (mesmo caminho da UI). */
export function applyReservaLegalToProject(
  project: CadProject,
  input: ApplyReservaLegalInput,
): ApplyReservaLegalResult {
  const preferred = input.glebaId?.trim();
  const gleba = preferred
    ? project.entities.find(
        (entity): entity is CadPolylineEntity => entity.id === preferred && isUsableGleba(entity),
      )
    : undefined;
  if (!gleba) {
    throw new LoteamentoError(RESERVA_LEGAL_NEED_POLYGON);
  }
  if (!(input.percent > 0) || input.percent >= 100) {
    throw new LoteamentoError("Informe um percentual entre 0 e 100.");
  }
  const canto = parseReservaCanto(String(input.canto)) ?? (input.canto as ReservaCanto);
  if (
    canto !== "superior_direita" &&
    canto !== "superior_esquerda" &&
    canto !== "inferior_direita" &&
    canto !== "inferior_esquerda"
  ) {
    throw new LoteamentoError("Informe o canto da reserva legal (superior/inferior × esquerda/direita).");
  }
  const areaTotal = computePolygonMetrics(gleba.vertices, true).areaM2;
  const placed = reservarRetanguloNoCanto(
    gleba.vertices.map((v) => [v.x, v.y] as [number, number]),
    canto,
    (input.percent / 100) * areaTotal,
  );
  const z0 = gleba.vertices[0]?.z ?? 0;
  const reserved: CadPolylineEntity = {
    id: newId("rl"),
    type: "polyline",
    layerId: AREA_RESERVA_LEGAL_LAYER_ID,
    vertices: placed.reserved.map(([x, y]) => ({ x, y, z: z0 })),
    closed: true,
    name: `Reserva legal ${input.percent.toFixed(0)}%`,
  };
  const next: CadProject = {
    ...project,
    layers: ensureReservaLegalLayer(project),
    entities: [...project.entities.filter((entity) => !isReservaLegalEntity(entity)), reserved],
  };
  const labeled = appendPolygonCenterLabel(next, reserved);
  return {
    project: punchLoteamentoUnderReserva(labeled, placed.reserved as [number, number][]),
    reserved,
    reservedM2: placed.reservedM2,
    percent: input.percent,
    canto,
  };
}

export function syncAreaUtilLabel(project: CadProject, utilId: string): CadProject {
  const util = project.entities.find(
    (e): e is CadPolylineEntity => e.id === utilId && e.type === "polyline" && Boolean(e.closed),
  );
  if (!util || util.vertices.length < 3) return project;
  const metrics = computePolygonMetrics(util.vertices, true);
  const text = buildPolygonCenterLabelText(util.name ?? "Área útil", metrics.areaM2);
  const c = polygonCentroid(util.vertices);
  let bestId: string | null = null;
  let bestD = Infinity;
  for (const entity of project.entities) {
    if (entity.type !== "point" || entity.layerId !== CAD_TEXT_LAYER.id || !isAreaUtilLabel(entity.label)) {
      continue;
    }
    const d = Math.hypot(entity.x - c.x, entity.y - c.y);
    if (d < bestD) {
      bestD = d;
      bestId = entity.id;
    }
  }
  if (!bestId || bestD > 80) return project;
  return {
    ...project,
    entities: project.entities.map((entity) =>
      entity.id === bestId && entity.type === "point"
        ? { ...entity, x: c.x, y: c.y, z: c.z, label: text }
        : entity,
    ),
  };
}

export type ApplyAreaUtilInput = {
  glebaId?: string | null;
  percent: number;
  canto: ReservaCanto | string;
};

export type ApplyAreaUtilResult = {
  project: CadProject;
  util: CadPolylineEntity;
  utilRings: CadPolylineEntity[];
  areaM2: number;
  alvoM2: number;
  percent: number;
  canto: ReservaCanto;
};

/** Cria/atualiza AREA_UTIL colada na reserva legal, no canto escolhido da RL. */
export function applyAreaUtilToProject(
  project: CadProject,
  input: ApplyAreaUtilInput,
): ApplyAreaUtilResult {
  const gleba = resolveUsableGleba(project, input.glebaId);
  if (!gleba) {
    throw new LoteamentoError(AREA_UTIL_NEED_POLYGON);
  }
  if (!(input.percent > 0) || input.percent >= 100) {
    throw new LoteamentoError("Informe um percentual de área útil entre 0 e 100.");
  }
  const canto = parseReservaCanto(String(input.canto)) ?? (input.canto as ReservaCanto);
  if (
    canto !== "superior_direita" &&
    canto !== "superior_esquerda" &&
    canto !== "inferior_direita" &&
    canto !== "inferior_esquerda"
  ) {
    throw new LoteamentoError("Informe o canto da área útil (superior/inferior × esquerda/direita).");
  }
  const glebaCoords = gleba.vertices.map((v) => [v.x, v.y] as [number, number]);
  const totalM2 = computePolygonMetrics(gleba.vertices, true).areaM2;
  const vias = collectClosedRingsOnLayer(project, LOTEAMENTO_VIAS_LAYER_ID);
  const apps = collectAppRings(project);
  const reservaLegal = collectReservaLegalRings(project);
  if (reservaLegal.length === 0) {
    throw new LoteamentoError(AREA_UTIL_NEED_RESERVA);
  }
  const viasM2 = vias.reduce((sum, ring) => sum + computePolygonMetrics(
    ring.map(([x, y]) => ({ x, y, z: 0 })),
    true,
  ).areaM2, 0);
  const alvoM2 = areaUtilFromStreetsM2(totalM2, viasM2, input.percent);
  if (!(alvoM2 > 4)) {
    throw new LoteamentoError(AREA_UTIL_NEED_AREA);
  }
  const placed = placeAreaUtilBesideReserva(glebaCoords, reservaLegal, alvoM2, canto, [...apps, ...vias]);
  if (placed.length === 0) {
    throw new LoteamentoError("Não foi possível colar a área útil na reserva legal nesse canto.");
  }
  if (reservaLegal.length > 0) {
    const shares = placed.some((poly) => reservaLegal.some((rl) => ringsShareBoundary(poly[0] ?? [], rl)));
    if (!shares) {
      throw new LoteamentoError("A área útil precisa compartilhar uma aresta com a reserva legal.");
    }
  }
  const z0 = gleba.vertices[0]?.z ?? 0;
  const stripped = stripPreviousAreaUtil(project);
  const labeled = appendAreaUtilToProject(
    stripped,
    placed.map((poly) => poly[0] ?? []),
    input.percent,
    z0,
  );
  const punched = punchLoteamentoUnderObstacles(
    labeled,
    placed.map((poly) => (poly[0] ?? []).map((p) => [p[0], p[1]] as [number, number])),
  );
  const utilRings = punched.entities.filter(
    (entity): entity is CadPolylineEntity =>
      entity.type === "polyline" && Boolean(entity.closed) && entity.layerId === AREA_UTIL_LAYER_ID,
  );
  const util = utilRings[0];
  if (!util) {
    throw new LoteamentoError("Não foi possível criar o polígono da área útil.");
  }
  const areaM2 = utilRings.reduce((sum, entity) => sum + computePolygonMetrics(entity.vertices, true).areaM2, 0);
  return {
    project: punched,
    util,
    utilRings,
    areaM2,
    alvoM2,
    percent: input.percent,
    canto,
  };
}

export type ApplyAppBufferInput = {
  sourceId?: string | null;
  widthM: number;
  side?: AppBufferSide;
};

export type ApplyAppBufferResult = {
  project: CadProject;
  app: CadPolylineEntity;
  areaM2: number;
  widthM: number;
  side: AppBufferSide;
};

export function syncAppLabel(project: CadProject, appId: string): CadProject {
  const app = project.entities.find(
    (e): e is CadPolylineEntity => e.id === appId && e.type === "polyline" && Boolean(e.closed),
  );
  if (!app || app.vertices.length < 3) return project;
  const metrics = computePolygonMetrics(app.vertices, true);
  const text = buildPolygonCenterLabelText(app.name ?? "APP", metrics.areaM2);
  const c = polygonCentroid(app.vertices);
  let found = false;
  return {
    ...project,
    entities: project.entities.map((entity) => {
      if (
        !found &&
        entity.type === "point" &&
        entity.layerId === CAD_TEXT_LAYER.id &&
        isAppLabelText(entity.label) &&
        Math.hypot(entity.x - c.x, entity.y - c.y) < 12
      ) {
        found = true;
        return { ...entity, x: c.x, y: c.y, z: c.z, label: text };
      }
      return entity;
    }),
  };
}

/** Cria um polígono de APP (buffer) em torno da linha selecionada. */
export function applyAppBufferToProject(
  project: CadProject,
  input: ApplyAppBufferInput,
): ApplyAppBufferResult {
  const preferred = input.sourceId?.trim();
  const source = preferred
    ? project.entities.find((entity) => entity.id === preferred && isAppSourceEntity(entity))
    : undefined;
  const verts = source ? appSourceVertices(source) : null;
  if (!source || !verts || verts.length < 2) {
    throw new LoteamentoError(APP_NEED_LINE);
  }
  if (!(input.widthM > 0) || input.widthM > 5000) {
    throw new LoteamentoError("Informe a largura da APP em metros (maior que zero).");
  }
  const side: AppBufferSide =
    input.side === "left" || input.side === "right" || input.side === "both" ? input.side : "both";
  const ring = bufferPolylineMeters(
    verts.map((v) => [v.x, v.y] as [number, number]),
    input.widthM,
    side,
  );
  if (ring.length < 4) {
    throw new LoteamentoError("Não foi possível gerar o buffer da APP nesta linha.");
  }
  const z0 = verts[0]?.z ?? 0;
  const widthLabel = Number.isInteger(input.widthM)
    ? String(input.widthM)
    : input.widthM.toFixed(1).replace(".", ",");
  const app: CadPolylineEntity = {
    id: newId("app"),
    type: "polyline",
    layerId: AREA_APP_LAYER_ID,
    vertices: dropClosingXY(ring).map(([x, y]) => ({ x, y, z: z0 })),
    closed: true,
    name: `APP ${widthLabel} m`,
  };
  const next: CadProject = {
    ...project,
    layers: ensureAppLayer(project),
    entities: [...project.entities, app],
  };
  const labeled = appendPolygonCenterLabel(next, app);
  const areaM2 = computePolygonMetrics(app.vertices, true).areaM2;
  return {
    project: punchLoteamentoUnderObstacles(labeled, [
      app.vertices.map((v) => [v.x, v.y] as [number, number]),
    ]),
    app,
    areaM2,
    widthM: input.widthM,
    side,
  };
}

export function dropClosingXY(ring: [number, number][] | number[][]): [number, number][] {
  if (ring.length < 2) return ring.map((p) => [p[0], p[1]]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    return ring.slice(0, -1).map((p) => [p[0], p[1]]);
  }
  return ring.map((p) => [p[0], p[1]]);
}

export const LOTEAMENTO_ANNOTATION_LAYER_IDS = new Set([
  REURB_ANNOTATION_LAYER.id,
  LOTEAMENTO_PONTOS_LAYER.id,
  LOTEAMENTO_TABELAS_LAYER.id,
]);

export type LoteamentoQuadraRow = {
  name: string;
  areaM2: number;
  lotCount: number;
  areaMediaM2: number;
  internoCount: number;
  esquinaCount: number;
};

export type LoteamentoLotRow = {
  name: string;
  numero: string;
  quadra: string;
  tipo: "INTERNO" | "ESQUINA";
  areaM2: number;
  testadaM: number;
  profundidadeM: number;
  ruas: string[];
};

export type LoteamentoAreaRow = {
  tipo: string;
  areaM2: number;
  perimeterM: number;
  percent: number;
};

export type LoteamentoStakePoint = {
  id: string;
  label: string;
  e: number;
  n: number;
  z: number;
  x: number;
  y: number;
};

export type LoteamentoSummary = {
  title: string;
  lots: CadPolylineEntity[];
  lotRows: LoteamentoLotRow[];
  quadras: LoteamentoQuadraRow[];
  areas: LoteamentoAreaRow[];
  lotAreaM2: number;
  viaAreaM2: number;
  calcadaAreaM2: number;
};

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureLayer(project: CadProject, layer: CadLayer): CadLayer[] {
  const idx = project.layers.findIndex((l) => l.id === layer.id);
  if (idx < 0) {
    return [...project.layers, layer.id === LOTEAMENTO_LOTES_LAYER_ID ? applyLoteamentoLotesGrassStyle(layer) : { ...layer }];
  }
  if (layer.id !== LOTEAMENTO_LOTES_LAYER_ID) return project.layers;
  return project.layers.map((existing, i) =>
    i === idx
      ? applyLoteamentoLotesGrassStyle({
          ...existing,
          ...layer,
          visible: existing.visible,
        })
      : existing,
  );
}

function closedOnLayer(project: CadProject, layerId: string): CadPolylineEntity[] {
  return project.entities.filter(
    (e): e is CadPolylineEntity =>
      e.type === "polyline" && Boolean(e.closed) && e.vertices.length >= 3 && e.layerId === layerId,
  );
}

export function parseLoteamentoLotName(name: string | undefined): { quadra: string; numero: string } {
  const raw = (name ?? "").trim();
  const match = raw.match(/^(.*?)\s+[—–-]\s+(.+)$/);
  if (match?.[1] && match[2]) {
    return { quadra: match[1].trim(), numero: match[2].trim() };
  }
  return { quadra: "Quadra", numero: raw || "01" };
}

function polygonAreaPerimeter(poly: CadPolylineEntity): { areaM2: number; perimeterM: number } {
  const metrics = computePolygonMetrics(poly.vertices, true);
  return { areaM2: metrics.areaM2, perimeterM: metrics.perimeterM };
}

export function summarizeLoteamento(project: CadProject): LoteamentoSummary {
  const lots = listReurbLots(project);
  const vias = closedOnLayer(project, LOTEAMENTO_VIAS_LAYER_ID);
  const calcadas = closedOnLayer(project, LOTEAMENTO_CALCADAS_LAYER_ID);
  const areaUtil = closedOnLayer(project, AREA_UTIL_LAYER_ID);
  const title = project.name?.trim() || "Loteamento";

  const streets = collectStreetRingsFromProject(project);
  const quadraMap = new Map<string, LoteamentoQuadraRow>();
  const lotRows: LoteamentoLotRow[] = [];
  let lotAreaM2 = 0;
  for (const lot of lots) {
    const { areaM2 } = polygonAreaPerimeter(lot);
    lotAreaM2 += areaM2;
    const { quadra, numero } = parseLoteamentoLotName(lot.name);
    const tipo = lot.lote?.tipo ?? "INTERNO";
    const dims =
      streets.length > 0 ? measureLotFrontAndDepth(polylineToRing(lot), streets) : { testadaM: 0, profundidadeM: 0 };
    const testadaM = lot.lote?.testadaM ?? dims.testadaM;
    const profundidadeM =
      lot.lote?.profundidadeM ??
      (dims.profundidadeM > 0.5 ? dims.profundidadeM : testadaM > 0.2 ? areaM2 / testadaM : 0);
    lotRows.push({
      name: lot.name?.trim() || numero,
      numero,
      quadra,
      tipo,
      areaM2,
      testadaM,
      profundidadeM,
      ruas: lot.lote?.ruas ?? [],
    });
    const prev = quadraMap.get(quadra);
    if (prev) {
      prev.areaM2 += areaM2;
      prev.lotCount += 1;
      prev.areaMediaM2 = prev.areaM2 / prev.lotCount;
      if (tipo === "ESQUINA") prev.esquinaCount += 1;
      else prev.internoCount += 1;
    } else {
      quadraMap.set(quadra, {
        name: quadra,
        areaM2,
        lotCount: 1,
        areaMediaM2: areaM2,
        internoCount: tipo === "INTERNO" ? 1 : 0,
        esquinaCount: tipo === "ESQUINA" ? 1 : 0,
      });
    }
  }

  const viaAreaM2 = vias.reduce((sum, poly) => sum + polygonAreaPerimeter(poly).areaM2, 0);
  const calcadaAreaM2 = calcadas.reduce((sum, poly) => sum + polygonAreaPerimeter(poly).areaM2, 0);
  const areaUtilM2 = areaUtil.reduce((sum, poly) => sum + polygonAreaPerimeter(poly).areaM2, 0);
  const viaPerimeterM = vias.reduce((sum, poly) => sum + polygonAreaPerimeter(poly).perimeterM, 0);
  const calcadaPerimeterM = calcadas.reduce((sum, poly) => sum + polygonAreaPerimeter(poly).perimeterM, 0);
  const areaUtilPerimeterM = areaUtil.reduce((sum, poly) => sum + polygonAreaPerimeter(poly).perimeterM, 0);
  const lotPerimeterM = lots.reduce((sum, poly) => sum + polygonAreaPerimeter(poly).perimeterM, 0);
  const total = lotAreaM2 + viaAreaM2 + calcadaAreaM2 + areaUtilM2;
  const pct = (area: number) => (total > 0 ? (area / total) * 100 : 0);

  const areas: LoteamentoAreaRow[] = [
    {
      tipo: `Quadras (${lots.length} lote${lots.length === 1 ? "" : "s"})`,
      areaM2: lotAreaM2,
      perimeterM: lotPerimeterM,
      percent: pct(lotAreaM2),
    },
  ];
  if (viaAreaM2 > 0) {
    areas.push({
      tipo: "Sistema viário",
      areaM2: viaAreaM2,
      perimeterM: viaPerimeterM,
      percent: pct(viaAreaM2),
    });
  }
  if (calcadaAreaM2 > 0) {
    areas.push({
      tipo: "Calçadas",
      areaM2: calcadaAreaM2,
      perimeterM: calcadaPerimeterM,
      percent: pct(calcadaAreaM2),
    });
  }
  if (areaUtilM2 > 0) {
    areas.push({
      tipo: "Área útil",
      areaM2: areaUtilM2,
      perimeterM: areaUtilPerimeterM,
      percent: pct(areaUtilM2),
    });
  }
  areas.push({
    tipo: "Total",
    areaM2: total,
    perimeterM: lotPerimeterM + viaPerimeterM + calcadaPerimeterM + areaUtilPerimeterM,
    percent: total > 0 ? 100 : 0,
  });

  return {
    title,
    lots,
    lotRows,
    quadras: [...quadraMap.values()],
    areas,
    lotAreaM2,
    viaAreaM2,
    calcadaAreaM2,
  };
}

export type AreaUtilBreakdown = {
  totalM2: number;
  reservaM2: number;
  reservaTargetM2: number;
  reservaPct: number;
  viasM2: number;
  viasPct: number;
  percent: number;
  orcamentoM2: number;
  alvoM2: number;
  areaUtilM2: number;
};

/** Conta: A = max(0, percent% × T − ruas). RL alvo = 20% de T. */
export function computeLoteamentoAreaUtilBreakdown(
  project: CadProject,
  glebaVertices: { x: number; y: number; z?: number }[],
  percent = DEFAULT_PERCENT_AREA_UTIL,
): AreaUtilBreakdown {
  const verts: CadVertex[] = glebaVertices.map((v) => ({ x: v.x, y: v.y, z: v.z ?? 0 }));
  const totalM2 = computePolygonMetrics(verts, true).areaM2;
  const reservaM2 = closedOnLayer(project, AREA_RESERVA_LEGAL_LAYER_ID).reduce(
    (s, p) => s + polygonAreaPerimeter(p).areaM2,
    0,
  );
  const viasM2 = closedOnLayer(project, LOTEAMENTO_VIAS_LAYER_ID).reduce(
    (s, p) => s + polygonAreaPerimeter(p).areaM2,
    0,
  );
  const areaUtilM2 = closedOnLayer(project, AREA_UTIL_LAYER_ID).reduce(
    (s, p) => s + polygonAreaPerimeter(p).areaM2,
    0,
  );
  const orcamentoM2 = totalM2 * (Math.max(0, percent) / 100);
  const alvoM2 = areaUtilFromStreetsM2(totalM2, viasM2, percent);
  const reservaTargetM2 = totalM2 * (DEFAULT_PERCENT_RESERVA_LEGAL / 100);
  const pct = (area: number) => (totalM2 > 0 ? (area / totalM2) * 100 : 0);
  return {
    totalM2,
    reservaM2: reservaM2 > 0 ? reservaM2 : reservaTargetM2,
    reservaTargetM2,
    reservaPct: DEFAULT_PERCENT_RESERVA_LEGAL,
    viasM2,
    viasPct: pct(viasM2),
    percent,
    orcamentoM2,
    alvoM2,
    areaUtilM2,
  };
}

function entityVertices(entity: CadEntity): CadVertex[] {
  if (entity.type === "point") return [{ x: entity.x, y: entity.y, z: entity.z }];
  if (entity.type === "line") return [entity.start, entity.end];
  return entity.vertices;
}

function uniqueVertices(vertices: CadVertex[], eps = 0.05): CadVertex[] {
  const out: CadVertex[] = [];
  for (const vertex of vertices) {
    if (out.some((prev) => Math.hypot(prev.x - vertex.x, prev.y - vertex.y) <= eps)) continue;
    out.push(vertex);
  }
  return out;
}

function collectLoteamentoVertices(project: CadProject): CadVertex[] {
  const lots = listReurbLots(project);
  const vias = closedOnLayer(project, LOTEAMENTO_VIAS_LAYER_ID);
  return uniqueVertices([...lots, ...vias].flatMap((poly) => poly.vertices));
}

function drawingExtent(project: CadProject): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const verts = project.entities
    .filter(
      (e) =>
        e.layerId === LOTEAMENTO_LOTES_LAYER_ID ||
        e.layerId === LOTEAMENTO_VIAS_LAYER_ID ||
        e.layerId === LOTEAMENTO_CALCADAS_LAYER_ID ||
        e.layerId === "loteamento_quadras" ||
        (e.type === "polyline" && Boolean(e.closed) && e.vertices.length >= 3),
    )
    .flatMap(entityVertices);
  if (verts.length === 0) return null;
  return {
    minX: Math.min(...verts.map((v) => v.x)),
    minY: Math.min(...verts.map((v) => v.y)),
    maxX: Math.max(...verts.map((v) => v.x)),
    maxY: Math.max(...verts.map((v) => v.y)),
  };
}

export function listLoteamentoStakePoints(project: CadProject): LoteamentoStakePoint[] {
  const georef = detectCadGeorefFromProject(project);
  return collectLoteamentoVertices(project).map((vertex, index) => {
    const { e, n } = vertexToEn(vertex, georef);
    const label = `P${String(index + 1).padStart(2, "0")}`;
    return {
      id: newId("loc"),
      label,
      e,
      n,
      z: vertex.z,
      x: vertex.x,
      y: vertex.y,
    };
  });
}

export function applyLoteamentoStakePoints(project: CadProject): {
  project: CadProject;
  pointCount: number;
} {
  const points = listLoteamentoStakePoints(project);
  if (points.length === 0) return { project, pointCount: 0 };

  const kept = project.entities.filter((e) => e.layerId !== LOTEAMENTO_PONTOS_LAYER.id);
  const entities: CadEntity[] = points.map((point) => ({
    id: point.id,
    type: "point",
    layerId: LOTEAMENTO_PONTOS_LAYER.id,
    x: point.x,
    y: point.y,
    z: point.z,
    label: `${point.label}\n${formatVertexCoordLabel(point.e, point.n)}`,
  }));

  return {
    project: {
      ...project,
      layers: ensureLayer(project, LOTEAMENTO_PONTOS_LAYER),
      entities: [...kept, ...entities],
    },
    pointCount: points.length,
  };
}

export function loteamentoStakePointsCsv(project: CadProject): string {
  const rows = ["Ponto;E;N;Z"];
  for (const point of listLoteamentoStakePoints(project)) {
    rows.push(
      `${point.label};${point.e.toFixed(3)};${point.n.toFixed(3)};${point.z.toFixed(3)}`,
    );
  }
  return `${rows.join("\n")}\n`;
}

export function loteamentoStakePointsFilename(project: CadProject): string {
  const base = (project.name || "loteamento").replace(/[^\w\-]+/g, "_").slice(0, 60);
  return `${base}_pontos_locacao.csv`;
}

function formatAreaCell(m2: number): string {
  return formatCoordBr(m2, 2);
}

function buildQuadraTableText(summary: LoteamentoSummary): string {
  const lines = [
    "Tabela de quadras",
    "Quadra          Área m²   Lotes  Área méd.",
    ...summary.quadras.map((row) => {
      const name = row.name.padEnd(14, " ");
      const area = formatAreaCell(row.areaM2).padStart(10, " ");
      const count = String(row.lotCount).padStart(6, " ");
      const media = formatAreaCell(row.areaMediaM2).padStart(10, " ");
      return `${name}${area}${count}${media}`;
    }),
    `${"Total".padEnd(14, " ")}${formatAreaCell(summary.lotAreaM2).padStart(10, " ")}${String(summary.lots.length).padStart(6, " ")}${formatAreaCell(summary.lots.length ? summary.lotAreaM2 / summary.lots.length : 0).padStart(10, " ")}`,
  ];
  return lines.join("\n");
}

function buildAreaTableText(summary: LoteamentoSummary): string {
  const lines = [
    "Tabela de Áreas",
    "Tipo                     Área m²      %",
    ...summary.areas.map((row) => {
      const tipo = row.tipo.slice(0, 22).padEnd(22, " ");
      const area = formatAreaCell(row.areaM2).padStart(10, " ");
      const pct = formatCoordBr(row.percent, 1).padStart(7, " ");
      return `${tipo}${area}${pct}`;
    }),
  ];
  return lines.join("\n");
}

function buildLotListText(summary: LoteamentoSummary): string {
  const limit = 40;
  const source = summary.lotRows.length > 0
    ? summary.lotRows
    : summary.lots.map((lot, index) => {
        const { quadra, numero } = parseLoteamentoLotName(lot.name);
        return {
          name: lot.name?.trim() || `Lote ${String(index + 1).padStart(2, "0")}`,
          numero,
          quadra,
          tipo: (lot.lote?.tipo ?? "INTERNO") as "INTERNO" | "ESQUINA",
          areaM2: polygonAreaPerimeter(lot).areaM2,
          testadaM: lot.lote?.testadaM ?? 0,
          profundidadeM: lot.lote?.profundidadeM ?? 0,
          ruas: lot.lote?.ruas ?? [],
        };
      });
  const rows = source.slice(0, limit).map((row) => {
    const numero = row.numero.slice(0, 6).padEnd(6, " ");
    const tipo = row.tipo.padEnd(8, " ");
    const area = formatAreaCell(row.areaM2).padStart(9, " ");
    const testada = formatAreaCell(row.testadaM).padStart(7, " ");
    const prof = formatAreaCell(row.profundidadeM).padStart(7, " ");
    const quadra = row.quadra.slice(0, 10).padEnd(10, " ");
    const rua = (row.ruas[0] ?? "—").slice(0, 10);
    return `${numero}${tipo}${area}${testada}${prof} ${quadra}${rua}`;
  });
  if (source.length > limit) {
    rows.push(`… +${source.length - limit} lotes`);
  }
  return ["Tabela de lotes", "Nº    Tipo      Área m² Testada   Prof. Quadra     Rua", ...rows].join("\n");
}

export type ApplyLoteamentoTablesInput = {
  percentualEsquina?: number;
  areaMinimaInterno?: number;
};

export function applyLoteamentoTables(
  project: CadProject,
  input?: ApplyLoteamentoTablesInput,
): {
  project: CadProject;
  lotCount: number;
} {
  const lots = listReurbLots(project);
  if (lots.length === 0) return { project, lotCount: 0 };
  const prevInterno = lots.find((lot) => lot.lote?.tipo === "INTERNO")?.lote?.areaMinimaM2;
  const classified = applyLoteamentoLotClassification(project, {
    percentualEsquina: input?.percentualEsquina ?? DEFAULT_PERCENTUAL_ESQUINA,
    areaMinimaInterno:
      input?.areaMinimaInterno ??
      prevInterno ??
      resolveAreaMinimaInterno({ testadaM: 10, profundidadeM: 25 }),
  });
  const summary = summarizeLoteamento(classified);
  if (summary.lots.length === 0) return { project: classified, lotCount: 0 };

  const extent = drawingExtent(project);
  const width = extent ? Math.max(extent.maxX - extent.minX, 40) : 80;
  const height = extent ? Math.max(extent.maxY - extent.minY, 40) : 80;
  const originX = (extent?.maxX ?? 0) + Math.max(width * 0.08, 12);
  const topY = extent?.maxY ?? 0;
  const midY = topY - height * 0.38;
  const botY = topY - height * 0.76;
  const z = 0;

  const kept = classified.entities.filter((e) => e.layerId !== LOTEAMENTO_TABELAS_LAYER.id);
  const tables: CadEntity[] = [
    {
      id: newId("tab_q"),
      type: "point",
      layerId: LOTEAMENTO_TABELAS_LAYER.id,
      x: originX,
      y: topY,
      z,
      label: buildQuadraTableText(summary),
    },
    {
      id: newId("tab_a"),
      type: "point",
      layerId: LOTEAMENTO_TABELAS_LAYER.id,
      x: originX,
      y: midY,
      z,
      label: buildAreaTableText(summary),
    },
    {
      id: newId("tab_l"),
      type: "point",
      layerId: LOTEAMENTO_TABELAS_LAYER.id,
      x: originX,
      y: botY,
      z,
      label: buildLotListText(summary),
    },
  ];

  return {
    project: {
      ...classified,
      layers: ensureLayer(classified, LOTEAMENTO_TABELAS_LAYER),
      entities: [...kept, ...tables],
    },
    lotCount: summary.lots.length,
  };
}

export function loteamentoTablesFilename(project: CadProject): string {
  const base = (project.name || "loteamento").replace(/[^\w\-]+/g, "_").slice(0, 60);
  return `${base}_tabelas_lotes_quadras.ods`;
}

export function buildLoteamentoTablesBlob(project: CadProject): Blob {
  const summary = summarizeLoteamento(project);
  const lotes: (string | number)[][] = [
    ["Número", "Tipo", "Área m²", "Testada m", "Profundidade m", "Quadra", "Rua"],
    ...summary.lotRows.map((row) => [
      row.numero,
      row.tipo,
      Number(row.areaM2.toFixed(2)),
      Number(row.testadaM.toFixed(2)),
      Number(row.profundidadeM.toFixed(2)),
      row.quadra,
      row.ruas.join(", ") || "—",
    ]),
  ];
  const quadras: (string | number)[][] = [
    ["Quadra", "Área m²", "Lotes", "Área média m²"],
    ...summary.quadras.map((row) => [
      row.name,
      Number(row.areaM2.toFixed(2)),
      row.lotCount,
      Number(row.areaMediaM2.toFixed(2)),
    ]),
  ];
  return buildOdsBlob(
    [
      { name: "Lotes", rows: lotes },
      { name: "Quadras", rows: quadras },
    ],
    summary.title,
  );
}

export function clearLoteamentoAnnotations(project: CadProject): {
  project: CadProject;
  removed: number;
} {
  const kept = project.entities.filter((e) => !LOTEAMENTO_ANNOTATION_LAYER_IDS.has(e.layerId));
  return {
    project: { ...project, entities: kept },
    removed: project.entities.length - kept.length,
  };
}

export function loteamentoKmlFilename(project: CadProject): string {
  const base = (project.name || "loteamento").replace(/[^\w\-]+/g, "_").slice(0, 60);
  return `${base}_loteamento.kml`;
}

export const AJUSTE_LOTES_NEED_SELECTION = "Selecione uma quadra ou um lote do loteamento.";
export const AJUSTE_LOTES_NEED_SIZE =
  "Informe testada e profundidade (ou área em m²) maiores que zero.";
export const AJUSTE_LOTES_NEED_LOTEAMENTO = "Gere o loteamento antes de ajustar os lotes.";
export const AJUSTE_LOTES_DONE = "Lotes da quadra ajustados para fechar a área.";

export function isLoteamentoLotEntity(
  entity: CadEntity,
): entity is CadPolylineEntity & { layerId: typeof LOTEAMENTO_LOTES_LAYER_ID } {
  return (
    entity.type === "polyline" &&
    Boolean(entity.closed) &&
    entity.vertices.length >= 3 &&
    entity.layerId === LOTEAMENTO_LOTES_LAYER_ID
  );
}

export function isLoteamentoQuadraEntity(
  entity: CadEntity,
): entity is CadPolylineEntity & { layerId: typeof LOTEAMENTO_QUADRAS_LAYER_ID } {
  return (
    entity.type === "polyline" &&
    Boolean(entity.closed) &&
    entity.vertices.length >= 3 &&
    entity.layerId === LOTEAMENTO_QUADRAS_LAYER_ID
  );
}

function polylineToRing(poly: CadPolylineEntity): [number, number][] {
  return poly.vertices.map((v) => [v.x, v.y] as [number, number]);
}

function collectStreetRingsFromProject(project: CadProject): [number, number][][] {
  return closedOnLayer(project, LOTEAMENTO_VIAS_LAYER_ID)
    .map((via) => polylineToRing(via))
    .filter((ring) => ring.length >= 3);
}

export function findLoteamentoLotAtPoint(
  project: CadProject,
  x: number,
  y: number,
): CadPolylineEntity | null {
  const lots = listReurbLots(project).filter(isLoteamentoLotEntity);
  for (let i = lots.length - 1; i >= 0; i--) {
    if (pointInPolygon(x, y, lots[i].vertices)) return lots[i];
  }
  return null;
}

function lotsOfQuadra(
  project: CadProject,
  quadraRing: Position[],
  quadraName: string | undefined,
): CadPolylineEntity[] {
  const lots = listReurbLots(project).filter(isLoteamentoLotEntity);
  const hostArea = Math.max(polygonAreaPlanarM2(quadraRing), 1);
  const matched: CadPolylineEntity[] = [];
  for (const lot of lots) {
    const { quadra } = parseLoteamentoLotName(lot.name);
    if (quadraName && namesLikelySameQuadra(quadra, quadraName)) {
      matched.push(lot);
      continue;
    }
    const c = polygonCentroid(lot.vertices);
    if (pointInPolygon(c.x, c.y, lotVerticesAsCad(quadraRing))) {
      matched.push(lot);
      continue;
    }
    const lotRing = polylineToRing(lot);
    const overlap = polygonInteriorOverlapM2(lotRing, quadraRing);
    if (overlap > polygonAreaPlanarM2(lotRing) * 0.45 && overlap > hostArea * 0.01) {
      matched.push(lot);
    }
  }
  return matched;
}

function namesLikelySameQuadra(a: string, b: string): boolean {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (!na || !nb) return false;
  if (na === nb) return true;
  const strip = (s: string) => s.replace(/^quadra\s+/i, "").trim();
  return strip(na) === strip(nb) && strip(na).length > 0;
}

function lotVerticesAsCad(ring: Position[]): CadVertex[] {
  return ring.map((p) => ({ x: p[0], y: p[1], z: 0 }));
}

function resolveQuadraHost(
  project: CadProject,
  entity: CadPolylineEntity,
): {
  kind: "quadra" | "lote";
  quadraRing: [number, number][];
  quadraName: string;
  lots: CadPolylineEntity[];
  lot: CadPolylineEntity | null;
  quadraEntity: CadPolylineEntity | null;
} {
  const quadras = listLoteamentoQuadraPolylines(project);
  if (isLoteamentoQuadraEntity(entity)) {
    const ring = polylineToRing(entity);
    const name = entity.name?.trim() || "Quadra";
    let lots = lotsOfQuadra(project, ring, name);
    if (lots.length === 0) lots = lotsOfQuadra(project, ring, undefined);
    return {
      kind: "quadra",
      quadraRing: ring,
      quadraName: lots[0] ? parseLoteamentoLotName(lots[0].name).quadra : name,
      lots,
      lot: null,
      quadraEntity: entity,
    };
  }
  if (!isLoteamentoLotEntity(entity)) {
    throw new LoteamentoError(AJUSTE_LOTES_NEED_SELECTION);
  }
  const lotRing = polylineToRing(entity);
  const { quadra: lotQuadraName } = parseLoteamentoLotName(entity.name);
  const c = polygonCentroid(entity.vertices);
  let host = quadras.find((q) => pointInPolygon(c.x, c.y, q.vertices)) ?? null;
  if (!host) {
    let best: CadPolylineEntity | null = null;
    let bestOv = 0;
    for (const q of quadras) {
      const ov = polygonInteriorOverlapM2(lotRing, polylineToRing(q));
      if (ov > bestOv) {
        bestOv = ov;
        best = q;
      }
    }
    if (best && bestOv > 1) host = best;
  }
  const siblingsByName = listReurbLots(project).filter(
    (lot) => isLoteamentoLotEntity(lot) && parseLoteamentoLotName(lot.name).quadra === lotQuadraName,
  );
  const quadraRing = host
    ? polylineToRing(host)
    : unionClosedRings(
        (siblingsByName.length > 0 ? siblingsByName : [entity]).map((lot) => polylineToRing(lot)),
      );
  if (dropClosingXY(quadraRing).length < 3) {
    throw new LoteamentoError(AJUSTE_LOTES_NEED_LOTEAMENTO);
  }
  let lots = host ? lotsOfQuadra(project, quadraRing, host.name) : siblingsByName;
  if (lots.length === 0) lots = siblingsByName.length > 0 ? siblingsByName : [entity];
  if (!lots.some((lot) => lot.id === entity.id)) lots = [...lots, entity];
  return {
    kind: "lote",
    quadraRing: quadraRing as [number, number][],
    quadraName: lotQuadraName,
    lots,
    lot: entity,
    quadraEntity: host,
  };
}

export type LoteamentoSizeTarget = {
  kind: "quadra" | "lote";
  entityId: string;
  quadraName: string;
  testadaM: number;
  profundidadeM: number;
  areaM2: number;
};

export function loteamentoSizeTarget(
  project: CadProject,
  entityId: string | null | undefined,
): LoteamentoSizeTarget | null {
  if (!entityId) return null;
  const entity = project.entities.find(
    (e): e is CadPolylineEntity => e.id === entityId && e.type === "polyline" && Boolean(e.closed),
  );
  if (!entity || (!isLoteamentoLotEntity(entity) && !isLoteamentoQuadraEntity(entity))) return null;
  try {
    const host = resolveQuadraHost(project, entity);
    const streets = collectStreetRingsFromProject(project);
    if (host.kind === "lote" && host.lot) {
      const dims = measureLotFrontAndDepth(polylineToRing(host.lot), streets);
      return {
        kind: "lote",
        entityId: host.lot.id,
        quadraName: host.quadraName,
        testadaM: dims.testadaM,
        profundidadeM: dims.profundidadeM,
        areaM2: dims.areaM2,
      };
    }
    const sample = host.lots[0];
    const dims = sample
      ? measureLotFrontAndDepth(polylineToRing(sample), streets)
      : { testadaM: 10, profundidadeM: 25, areaM2: 0 };
    return {
      kind: "quadra",
      entityId: entity.id,
      quadraName: host.quadraName,
      testadaM: dims.testadaM,
      profundidadeM: dims.profundidadeM,
      areaM2: polygonAreaPlanarM2(host.quadraRing),
    };
  } catch {
    return null;
  }
}

export type ApplyLoteamentoLotSizeInput = LotSizeSpec & {
  entityId: string;
  mode: "quadra" | "lote";
};

export type ApplyLoteamentoLotSizeResult = {
  project: CadProject;
  lotCount: number;
  selectedId: string;
};

function ringToVertices(ring: number[][], z0: number): CadVertex[] {
  const raw = ring.map(([x, y]) => ({ x, y, z: z0 }));
  const first = raw[0];
  const last = raw[raw.length - 1];
  if (first && last && first.x === last.x && first.y === last.y) return raw.slice(0, -1);
  return raw;
}

/** Ajusta lotes de uma quadra (toda ela ou um lote + irmãos) sem mexer em vias, APP, RL ou AREA_UTIL. */
export function applyLoteamentoLotSize(
  project: CadProject,
  input: ApplyLoteamentoLotSizeInput,
): ApplyLoteamentoLotSizeResult {
  const entity = project.entities.find(
    (e): e is CadPolylineEntity => e.id === input.entityId && e.type === "polyline" && Boolean(e.closed),
  );
  if (!entity || (!isLoteamentoLotEntity(entity) && !isLoteamentoQuadraEntity(entity))) {
    throw new LoteamentoError(AJUSTE_LOTES_NEED_SELECTION);
  }
  const host = resolveQuadraHost(project, entity);
  if (host.lots.length === 0 && input.mode === "lote") {
    throw new LoteamentoError(AJUSTE_LOTES_NEED_LOTEAMENTO);
  }
  const streets = collectStreetRingsFromProject(project);
  const z0 = (host.lot ?? host.lots[0] ?? host.quadraEntity ?? entity).vertices[0]?.z ?? 0;
  const origin: [number, number] = [
    host.quadraRing.reduce((s, p) => s + p[0], 0) / Math.max(host.quadraRing.length, 1),
    host.quadraRing.reduce((s, p) => s + p[1], 0) / Math.max(host.quadraRing.length, 1),
  ];

  let packed;
  if (input.mode === "lote") {
    const lot = host.lot ?? host.lots.find((item) => item.id === input.entityId) ?? host.lots[0];
    if (!lot) throw new LoteamentoError(AJUSTE_LOTES_NEED_SELECTION);
    const anchorIndex = Math.max(
      0,
      host.lots.findIndex((item) => item.id === lot.id),
    );
    packed = adjustLotInQuadra(
      host.quadraRing,
      host.lots.map((item) => ({
        coordinates: [polylineToRing(item)],
        id: item.id,
        numero: parseLoteamentoLotName(item.name).numero,
      })),
      anchorIndex,
      { testadaM: input.testadaM, profundidadeM: input.profundidadeM, areaM2: input.areaM2 },
      streets,
      origin,
      host.quadraName,
    );
  } else {
    const sample = host.lot ?? host.lots[0];
    const current = sample
      ? measureLotFrontAndDepth(polylineToRing(sample), streets)
      : { testadaM: 10, profundidadeM: 25 };
    const size = resolveLotSizeSpec(
      { testadaM: input.testadaM, profundidadeM: input.profundidadeM, areaM2: input.areaM2 },
      current,
    );
    packed = rebuildQuadraLotes(
      host.quadraRing,
      size.testadaM,
      size.profundidadeM,
      streets,
      origin,
      host.quadraName,
    );
  }
  if (packed.length === 0) {
    throw new LoteamentoError("Não foi possível reempacotar os lotes desta quadra com as medidas informadas.");
  }

  const oldIds = new Set(host.lots.map((lot) => lot.id));
  const newLots = packed.map((lote, i) => {
    const prev = host.lots[i];
    return {
      id: prev?.id ?? newId("lote"),
      type: "polyline" as const,
      layerId: LOTEAMENTO_LOTES_LAYER_ID,
      vertices: ringToVertices(lote.coordinates[0] ?? [], z0),
      closed: true,
      name: `${lote.quadra} — ${lote.numero}`,
    };
  });
  const unusedOld = host.lots.slice(newLots.length).map((lot) => lot.id);
  const unused = new Set(unusedOld);
  const nextEntities = project.entities.filter((e) => !oldIds.has(e.id) || !unused.has(e.id));
  const replaced = nextEntities.map((e) => {
    if (!oldIds.has(e.id)) return e;
    const idx = host.lots.findIndex((lot) => lot.id === e.id);
    return idx >= 0 && newLots[idx] ? newLots[idx] : e;
  });
  const extras = newLots.slice(host.lots.length);
  const withoutUnused = replaced.filter((e) => !unused.has(e.id));
  let next: CadProject = {
    ...project,
    entities: extras.length > 0 ? [...withoutUnused, ...extras] : withoutUnused,
  };
  const labeled = applyReurbLotLabels(next, { includeCotas: true, includeArea: true });
  if (labeled.lotCount > 0) next = labeled.project;
  const prevInterno = host.lots.find((lot) => lot.lote?.tipo === "INTERNO")?.lote?.areaMinimaM2;
  const prevAny = host.lots.find((lot) => lot.lote?.areaMinimaM2 != null)?.lote?.areaMinimaM2;
  next = applyLoteamentoLotClassification(next, {
    percentualEsquina: DEFAULT_PERCENTUAL_ESQUINA,
    areaMinimaInterno:
      prevInterno ??
      (prevAny != null && prevAny > 0 ? prevAny / 1.2 : resolveAreaMinimaInterno({
        testadaM: input.testadaM ?? 10,
        profundidadeM: input.profundidadeM ?? 25,
      })),
  });

  const selectedId =
    input.mode === "lote"
      ? (newLots[Math.min(host.lots.findIndex((lot) => lot.id === input.entityId), newLots.length - 1)]?.id ??
        newLots[0]?.id ??
        input.entityId)
      : (host.quadraEntity?.id ?? input.entityId);

  return { project: next, lotCount: packed.length, selectedId };
}
