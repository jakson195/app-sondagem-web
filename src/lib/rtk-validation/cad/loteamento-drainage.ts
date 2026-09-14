import { extractSurveyElevationPoints, type ElevationSample } from "./contour";
import { AREA_APP_LAYER_ID, AREA_RESERVA_LEGAL_LAYER_ID, AREA_UTIL_LAYER_ID } from "./loteamento-tools";
import {
  CAD_PLAN_BLUE,
  extractDrainageCodeFromLabel,
  formatDrainageNodeCallout,
  formatPipePlanLabel,
} from "./plan-annotation-labels";
import { pointInPolygon, polygonAreaM2 } from "./polygon-utils";
import { polylineLengthM, sampleAlignmentStations } from "./profile";
import {
  LOTEAMENTO_EIXOS_LAYER_ID,
  LOTEAMENTO_LOTES_LAYER_ID,
  LOTEAMENTO_VIAS_LAYER_ID,
} from "./reurb";
import { buildStreetAlignments, listLoteamentoEixos } from "./street-profile";
import type {
  CadDrainageKind,
  CadDrainageProps,
  CadDrainageStatus,
  CadEntity,
  CadLayer,
  CadPointEntity,
  CadPolylineEntity,
  CadProject,
  CadVertex,
} from "./types";

export const DRENAGEM_PV_LAYER: CadLayer = {
  id: "drenagem_pv",
  name: "DRENAGEM_PV",
  color: CAD_PLAN_BLUE,
  textColor: CAD_PLAN_BLUE,
  textSize: 11,
  lineWidth: 2,
  visible: true,
  locked: false,
};

export const DRENAGEM_BOCAS_LAYER: CadLayer = {
  id: "drenagem_bocas",
  name: "DRENAGEM_BOCAS",
  color: CAD_PLAN_BLUE,
  textColor: CAD_PLAN_BLUE,
  textSize: 10,
  lineWidth: 2,
  visible: true,
  locked: false,
};

export const DRENAGEM_TUBOS_LAYER: CadLayer = {
  id: "drenagem_tubos",
  name: "DRENAGEM_TUBOS",
  color: CAD_PLAN_BLUE,
  textColor: CAD_PLAN_BLUE,
  textSize: 10,
  lineWidth: 3.2,
  visible: true,
  locked: false,
};

export const DRENAGEM_CONTRIB_LAYER: CadLayer = {
  id: "drenagem_contrib",
  name: "DRENAGEM_CONTRIB",
  color: "#38bdf8",
  fillColor: "#7dd3fc",
  fillAlpha: 0.16,
  textColor: "#075985",
  textSize: 9,
  lineWidth: 0.8,
  visible: true,
  locked: false,
};

export const DRENAGEM_EMISSARIO_LAYER: CadLayer = {
  id: "drenagem_emissario",
  name: "DRENAGEM_EMISSARIO",
  color: "#dc2626",
  textColor: "#991b1b",
  textSize: 12,
  lineWidth: 2.4,
  visible: true,
  locked: false,
};

export const DRAINAGE_LAYER_IDS = new Set([
  DRENAGEM_PV_LAYER.id,
  DRENAGEM_BOCAS_LAYER.id,
  DRENAGEM_TUBOS_LAYER.id,
  DRENAGEM_CONTRIB_LAYER.id,
  DRENAGEM_EMISSARIO_LAYER.id,
]);

export const DRAINAGE_PIPE_DIAMETERS_MM = [300, 400, 500, 600, 800, 1000, 1200, 1500] as const;

/** Autolimpeza / erosão (SWMM / manuais de microdrenagem BR). */
export const DRAINAGE_VELOCITY_MIN_MS = 0.6;
export const DRAINAGE_VELOCITY_MAX_MS = 5.0;
/** y/D máximo em escoamento livre — Qprojeto ≤ 0,85 · Qplena. */
export const DRAINAGE_LAMINA_RELATIVA_MAX = 0.85;

export const DRAINAGE_MATERIALS: Record<string, number> = {
  Concreto: 0.013,
  PVC: 0.011,
  PEAD: 0.009,
  Corrugado: 0.015,
};

/** Parâmetros IDF no formato Plúvio 2.1 / Pfafstetter: i = K·Tr^a / (t+b)^c. */
export type DrainageIdfParams = {
  K: number;
  a: number;
  b: number;
  c: number;
  fonte?: string;
};

export type DrainageParams = {
  /** Coeficiente de escoamento racional C (adimensional). */
  runoffC: number;
  /** Intensidade de projeto (mm/h). Usada se não houver IDF. */
  intensityMmH: number;
  /** Tempo de retorno (anos) — informativo e entrada da IDF. */
  returnPeriodYears: number;
  /** Espaçamento alvo entre PVs ao longo da via (m). */
  pvSpacingM: number;
  /** Inclinação mínima da tubulação (%). */
  minSlopePct: number;
  /** Recobrimento mínimo (m) = Z terreno − Z invert. */
  minCoverM: number;
  /** Coeficiente de Manning n. */
  nManning: number;
  /** Material da tubulação. */
  material: string;
  /** Diâmetro mínimo comercial (mm). */
  minDiameterMm: number;
  /** Identificador do PV emissário já escolhido (opcional). */
  outfallPvId?: string | null;
  /** Ativar geração automática de bocas de lobo (inlets). */
  enableAutoInlets?: boolean;
  /** Espaçamento alvo entre bocas de lobo ao longo do eixo (m). */
  inletSpacingM?: number;
  /** Colocar bocas de lobo nos cruzamentos/interseções do eixo. */
  inletAtIntersections?: boolean;
  /** Ligar cada boca à rede principal com ramal (PV mais próximo ou T no coletor). */
  connectInletsToMain?: boolean;
  /** Diâmetro comercial do ramal da boca de lobo (mm). */
  lateralDiameterMm?: number;
  /** IDF municipal (opcional). Se completa, i é calculada via Kirpich. */
  idf?: DrainageIdfParams | null;
  /** % impermeável (0–100). Se informado, estima C = 0,20 + 0,70·p. */
  imperviousPct?: number;
};

export const DEFAULT_DRAINAGE_PARAMS: DrainageParams = {
  runoffC: 0.7,
  intensityMmH: 150,
  returnPeriodYears: 10,
  pvSpacingM: 60,
  enableAutoInlets: true,
  inletSpacingM: 25,
  inletAtIntersections: true,
  connectInletsToMain: true,
  lateralDiameterMm: 300,
  minSlopePct: 0.5,
  minCoverM: 1.2,
  nManning: 0.013,
  material: "Concreto",
  minDiameterMm: 300,
};

export type DrainageStation = {
  x: number;
  y: number;
  z: number;
  stationM: number;
};

export type DrainageNeedError = { message: string };

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

function ensureLayers(project: CadProject): CadLayer[] {
  const extras = [
    DRENAGEM_PV_LAYER,
    DRENAGEM_BOCAS_LAYER,
    DRENAGEM_TUBOS_LAYER,
    DRENAGEM_CONTRIB_LAYER,
    DRENAGEM_EMISSARIO_LAYER,
  ];
  const layers = [...project.layers];
  for (const layer of extras) {
    const idx = layers.findIndex((item) => item.id === layer.id);
    if (idx < 0) layers.push({ ...layer });
    else layers[idx] = { ...layer, ...layers[idx], visible: true, locked: false };
  }
  return layers;
}

function padCode(prefix: string, index: number): string {
  return `${prefix}-${String(index + 1).padStart(2, "0")}`;
}

function idwZ(x: number, y: number, samples: ElevationSample[], power = 2): number | null {
  if (samples.length === 0) return null;
  let num = 0;
  let den = 0;
  for (const p of samples) {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < 1e-6) return p.z;
    const w = 1 / d ** power;
    num += w * p.z;
    den += w;
  }
  return den > 0 ? num / den : null;
}

export function isDrainageLayer(layerId: string): boolean {
  return DRAINAGE_LAYER_IDS.has(layerId);
}

export function isDrainagePvEntity(entity: CadEntity): entity is CadPointEntity {
  return (
    entity.type === "point" &&
    (entity.layerId === DRENAGEM_PV_LAYER.id ||
      entity.layerId === DRENAGEM_BOCAS_LAYER.id ||
      entity.layerId === DRENAGEM_EMISSARIO_LAYER.id) &&
    (entity.drainage?.kind === "pv" ||
      entity.drainage?.kind === "outfall" ||
      entity.drainage?.kind === "inlet" ||
      !entity.drainage)
  );
}

export function isDrainagePipeEntity(entity: CadEntity): entity is CadPolylineEntity {
  return (
    entity.type === "polyline" &&
    !entity.closed &&
    entity.layerId === DRENAGEM_TUBOS_LAYER.id &&
    entity.vertices.length >= 2
  );
}

export function listDrainagePvs(project: CadProject): CadPointEntity[] {
  return project.entities.filter(isDrainagePvEntity);
}

export function isDrainageInletEntity(entity: CadEntity): entity is CadPointEntity {
  return (
    entity.type === "point" &&
    (entity.layerId === DRENAGEM_BOCAS_LAYER.id || entity.drainage?.kind === "inlet") &&
    (entity.drainage?.kind === "inlet" || !entity.drainage)
  );
}

export function listDrainageInlets(project: CadProject): CadPointEntity[] {
  return listDrainagePvs(project).filter((p) => p.layerId === DRENAGEM_BOCAS_LAYER.id || p.drainage?.kind === "inlet");
}

export function listDrainagePipes(project: CadProject): CadPolylineEntity[] {
  return project.entities.filter(isDrainagePipeEntity);
}

export function listReservaRings(project: CadProject): CadVertex[][] {
  return project.entities
    .filter(
      (e): e is CadPolylineEntity =>
        e.type === "polyline" &&
        Boolean(e.closed) &&
        (e.layerId === AREA_RESERVA_LEGAL_LAYER_ID ||
          e.layerId === AREA_APP_LAYER_ID ||
          e.layerId === AREA_UTIL_LAYER_ID) &&
        e.vertices.length >= 3,
    )
    .map((e) => e.vertices);
}

function distPointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return dist2(px, py, ax, ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return dist2(px, py, ax + dx * t, ay + dy * t);
}

function distPointToRing(x: number, y: number, ring: CadVertex[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    best = Math.min(best, distPointToSegment(x, y, a.x, a.y, b.x, b.y));
  }
  return best;
}

export function pointInAnyReserva(x: number, y: number, rings: CadVertex[][], marginM = 0.8): boolean {
  return rings.some((ring) => pointInPolygon(x, y, ring) || distPointToRing(x, y, ring) <= marginM);
}

/** Amostra o segmento; se algum ponto cair na reserva, a tubulação atravessa área protegida. */
export function pipeIntersectsReserva(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rings: CadVertex[][],
  stepM = 2,
): boolean {
  if (rings.length === 0) return false;
  if (pointInAnyReserva(ax, ay, rings) || pointInAnyReserva(bx, by, rings)) return true;
  const length = dist2(ax, ay, bx, by);
  if (length < 1e-9) return false;
  const steps = Math.max(2, Math.ceil(length / Math.max(0.5, stepM)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (pointInAnyReserva(ax + (bx - ax) * t, ay + (by - ay) * t, rings)) return true;
  }
  return false;
}

/**
 * Estacas de PV ao longo de um eixo: sempre nas extremidades e âncoras (cruzamentos),
 * depois no espaçamento alvo, recusando pontos colados demais ou dentro da reserva.
 */
export function placePvsAlongVia(
  vertices: CadVertex[],
  spacingM: number,
  options: { snapM?: number; anchors?: DrainageStation[]; reservaRings?: CadVertex[][] } = {},
): DrainageStation[] {
  if (vertices.length < 2) return [];
  const spacing = Math.max(5, spacingM);
  const snapM = options.snapM ?? Math.max(1, spacing * 0.35);
  const reserva = options.reservaRings ?? [];
  const length = polylineLengthM(vertices);
  if (length < 1e-6) return [];

  const sampled = sampleAlignmentStations(vertices, Math.min(spacing, Math.max(1, length / 40)));
  const atStation = (stationM: number): DrainageStation => {
    const clamped = Math.max(0, Math.min(length, stationM));
    if (sampled.length === 0) {
      const a = vertices[0];
      return { x: a.x, y: a.y, z: a.z, stationM: clamped };
    }
    let best = sampled[0];
    let bestD = Math.abs(sampled[0].stationM - clamped);
    for (const st of sampled) {
      const d = Math.abs(st.stationM - clamped);
      if (d < bestD) {
        best = st;
        bestD = d;
      }
    }
    const t = length > 0 ? clamped / length : 0;
    const a = vertices[0];
    const b = vertices[vertices.length - 1];
    if (bestD > 0.6) {
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        stationM: clamped,
      };
    }
    return { x: best.x, y: best.y, z: best.z, stationM: clamped };
  };

  const placed: DrainageStation[] = [];
  const accept = (st: DrainageStation) => {
    if (pointInAnyReserva(st.x, st.y, reserva)) return false;
    if (placed.some((p) => dist2(p.x, p.y, st.x, st.y) < snapM)) return false;
    placed.push(st);
    return true;
  };

  accept(atStation(0));
  for (const anchor of options.anchors ?? []) {
    accept(atStation(anchor.stationM));
  }
  for (let s = spacing; s < length - snapM; s += spacing) {
    accept(atStation(s));
  }
  accept(atStation(length));
  return placed.sort((a, b) => a.stationM - b.stationM);
}

export type DrainageInletStation = DrainageStation & { side: -1 | 1 };

/** Triedro no eixo: tangente e normal esquerda (sentido crescente da estaca). */
export function frameAtStation(
  vertices: CadVertex[],
  stationM: number,
): { x: number; y: number; z: number; tx: number; ty: number; nx: number; ny: number; stationM: number } {
  const length = polylineLengthM(vertices);
  const s = Math.max(0, Math.min(length, stationM));
  let acc = 0;
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i];
    const b = vertices[i + 1];
    const len = dist2(a.x, a.y, b.x, b.y);
    if (len < 1e-9) continue;
    const last = i === vertices.length - 2;
    if (acc + len >= s - 1e-9 || last) {
      const t = len > 0 ? Math.max(0, Math.min(1, (s - acc) / len)) : 0;
      const tx = (b.x - a.x) / len;
      const ty = (b.y - a.y) / len;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        tx,
        ty,
        nx: -ty,
        ny: tx,
        stationM: s,
      };
    }
    acc += len;
  }
  const a = vertices[0];
  const b = vertices[vertices.length - 1] ?? a;
  const len = Math.max(dist2(a.x, a.y, b.x, b.y), 1e-9);
  const tx = (b.x - a.x) / len;
  const ty = (b.y - a.y) / len;
  return { x: a.x, y: a.y, z: a.z, tx, ty, nx: -ty, ny: tx, stationM: 0 };
}

/** Distância do eixo até o meio-fio (metade da via), limitada a 2,5–10 m. */
export function estimateCurbOffsetM(
  project: CadProject,
  vertices: CadVertex[],
  stationM?: number,
): number {
  const vias = closedPolysOn(project, LOTEAMENTO_VIAS_LAYER_ID);
  if (vias.length === 0 || vertices.length < 2) return 5.5;
  const length = polylineLengthM(vertices);
  const frame = frameAtStation(vertices, stationM ?? length / 2);
  let best = 5.5;
  for (const via of vias) {
    const inside = pointInPolygon(frame.x, frame.y, via.vertices);
    const dRing = distPointToRing(frame.x, frame.y, via.vertices);
    if (!inside && dRing > 12) continue;
    if (dRing > 1.8 && dRing < 14) {
      best = Math.min(Math.max(dRing * 0.88, 2.5), 10);
    }
  }
  return best;
}

function closestPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { x: number; y: number; t: number; dist: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return { x: ax, y: ay, t: 0, dist: dist2(px, py, ax, ay) };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { x, y, t, dist: dist2(px, py, x, y) };
}

/**
 * Bocas de lobo nos dois lados da via: espaçamento + interseções.
 * Nunca sobre APP, reserva legal ou AREA_UTIL.
 */
export function placeInletsAlongVia(
  vertices: CadVertex[],
  spacingM: number,
  options: {
    offsetM?: number;
    bothSides?: boolean;
    snapM?: number;
    anchors?: DrainageStation[];
    reservaRings?: CadVertex[][];
  } = {},
): DrainageInletStation[] {
  if (vertices.length < 2) return [];
  const spacing = Math.max(5, spacingM);
  const offsetM = Math.max(2.2, options.offsetM ?? 5.5);
  const bothSides = options.bothSides ?? true;
  const snapM = options.snapM ?? Math.max(1.5, spacing * 0.12);
  const reserva = options.reservaRings ?? [];
  const length = polylineLengthM(vertices);
  if (length < 1e-6) return [];

  const rawStations = [0, length];
  for (const anchor of options.anchors ?? []) rawStations.push(anchor.stationM);
  for (let s = spacing; s < length - 1e-6; s += spacing) rawStations.push(s);
  const uniqueStations: number[] = [];
  const stationSnap = Math.max(1, snapM);
  for (const s of rawStations.sort((a, b) => a - b)) {
    const clamped = Math.max(0, Math.min(length, s));
    if (uniqueStations.some((u) => Math.abs(u - clamped) < stationSnap)) continue;
    uniqueStations.push(clamped);
  }

  const sides: Array<-1 | 1> = bothSides ? [-1, 1] : [1];
  const placed: DrainageInletStation[] = [];
  for (const stationM of uniqueStations) {
    const fr = frameAtStation(vertices, stationM);
    for (const side of sides) {
      const st: DrainageInletStation = {
        x: fr.x + fr.nx * offsetM * side,
        y: fr.y + fr.ny * offsetM * side,
        z: fr.z,
        stationM: fr.stationM,
        side,
      };
      if (pointInAnyReserva(st.x, st.y, reserva)) continue;
      if (placed.some((p) => dist2(p.x, p.y, st.x, st.y) < snapM)) continue;
      placed.push(st);
    }
  }
  return placed.sort((a, b) => a.stationM - b.stationM || a.side - b.side);
}

export function pipeLengthM(ax: number, ay: number, bx: number, by: number): number {
  return dist2(ax, ay, bx, by);
}

/** Inclinação (%) de montante para jusante: (Zinv_up − Zinv_down) / L × 100. */
export function pipeSlopePct(invertUpZ: number, invertDownZ: number, lengthM: number): number {
  if (!(lengthM > 1e-9)) return 0;
  return Number((((invertUpZ - invertDownZ) / lengthM) * 100).toFixed(4));
}

/**
 * Vazão racional Q = C·i·A / 360  (m³/s) convertida para L/s.
 * C adimensional, i em mm/h, A em hectares.
 */
export function rationalRunoffLps(runoffC: number, intensityMmH: number, areaHa: number): number {
  const c = Math.max(0, runoffC);
  const i = Math.max(0, intensityMmH);
  const a = Math.max(0, areaHa);
  return (c * i * a * 1000) / 360;
}

/**
 * Tempo de concentração de Kirpich (min):
 * tc = 0,0195 · L^0,77 · S^-0,385  (L em m, S = i/100).
 */
export function kirpichTcMin(lengthM: number, slopePct: number): number {
  const S = Math.max(slopePct, 0.1) / 100;
  const L = Math.max(lengthM, 1);
  return 0.0195 * L ** 0.77 * S ** -0.385;
}

/** C racional estimado a partir do % impermeável (0,20 permeável → 0,90 impermeável). */
export function runoffCFromImpervious(percentImpermeavel: number): number {
  const p = Math.min(Math.max(percentImpermeavel, 0), 100) / 100;
  return 0.2 + p * 0.7;
}

/** Intensidade IDF (mm/h): i = K · Tr^a / (t + b)^c */
export function idfIntensityMmH(idf: DrainageIdfParams, returnPeriodYears: number, durationMin: number): number {
  const t = Math.max(durationMin, 1e-3);
  const tr = Math.max(returnPeriodYears, 1e-3);
  const den = (t + idf.b) ** idf.c;
  if (!(den > 0) || !Number.isFinite(den)) return 0;
  return (idf.K * tr ** idf.a) / den;
}

export function isUsableIdf(idf?: DrainageIdfParams | null): idf is DrainageIdfParams {
  return Boolean(idf && Number.isFinite(idf.K) && idf.K > 0 && Number.isFinite(idf.a) && Number.isFinite(idf.b) && Number.isFinite(idf.c));
}

/** Intensidade de projeto: IDF + Kirpich se cadastrada; senão o i informado. */
export function resolveDrainageIntensity(
  params: Pick<DrainageParams, "intensityMmH" | "returnPeriodYears" | "minSlopePct" | "idf">,
  flowPathM: number,
): { intensityMmH: number; tcMin: number } {
  const tcMin = Math.max(5, kirpichTcMin(flowPathM, Math.max(params.minSlopePct, 0.1)));
  if (isUsableIdf(params.idf)) {
    return { intensityMmH: idfIntensityMmH(params.idf, params.returnPeriodYears, tcMin), tcMin };
  }
  return { intensityMmH: params.intensityMmH, tcMin };
}

export function applyDesignRain(params: DrainageParams, flowPathM: number): DrainageParams & { tcMin: number } {
  const next: DrainageParams = { ...params };
  if (next.imperviousPct != null && Number.isFinite(next.imperviousPct)) {
    next.runoffC = runoffCFromImpervious(next.imperviousPct);
  }
  const rain = resolveDrainageIntensity(next, flowPathM);
  next.intensityMmH = rain.intensityMmH;
  return { ...next, tcMin: rain.tcMin };
}

/**
 * Capacidade de Manning em seção circular plena:
 * Q = (1/n) · A · R^(2/3) · S^(1/2), S = i/100.
 * Resultado em L/s.
 */
export function manningCapacityLps(diameterMm: number, slopePct: number, nManning: number): number {
  const d = diameterMm / 1000;
  if (!(d > 0) || !(nManning > 0)) return 0;
  const s = Math.max(1e-8, Math.abs(slopePct) / 100);
  const area = Math.PI * (d * d) / 4;
  const radius = d / 4;
  const qM3s = (1 / nManning) * area * radius ** (2 / 3) * Math.sqrt(s);
  return qM3s * 1000;
}

/** Velocidade a seção plena (m/s). */
export function manningVelocityMs(diameterMm: number, slopePct: number, nManning: number): number {
  const d = diameterMm / 1000;
  if (!(d > 0)) return 0;
  const area = Math.PI * (d * d) / 4;
  const qM3s = manningCapacityLps(diameterMm, slopePct, nManning) / 1000;
  return area > 0 ? qM3s / area : 0;
}

export function checkDrainageHydraulics(
  qContribLps: number,
  diameterMm: number,
  slopePct: number,
  nManning: number,
): {
  status: CadDrainageStatus;
  capacityLps: number;
  velocityMs: number;
  flowDepthRatio: number;
} {
  const capacityLps = manningCapacityLps(diameterMm, slopePct, nManning);
  const velocityMs = manningVelocityMs(diameterMm, slopePct, nManning);
  // y/D ≈ Q/Qplena (não é truncado) para permitir detectar “extrapolando” (y/D>1).
  const flowDepthRatio = capacityLps > 0 ? qContribLps / capacityLps : 1;
  let status: CadDrainageStatus = "ok";
  if (qContribLps > DRAINAGE_LAMINA_RELATIVA_MAX * capacityLps + 1e-6) {
    status = "insuficiente";
  } else if (velocityMs < DRAINAGE_VELOCITY_MIN_MS - 1e-6) {
    status = "velocidade_baixa";
  } else if (velocityMs > DRAINAGE_VELOCITY_MAX_MS + 1e-6) {
    status = "velocidade_alta";
  }
  return { status, capacityLps, velocityMs, flowDepthRatio };
}

export type DrainageFlowClass = "Parcial" | "Cheio" | "Extrapolando";

export function classifyDrainageFlowDepthRatio(
  yOverD: number,
  criterionMax = DRAINAGE_LAMINA_RELATIVA_MAX,
): {
  class: DrainageFlowClass;
  yOverD: number;
  label: string;
} {
  const r = Number.isFinite(yOverD) ? yOverD : 0;
  if (r >= 1) return { class: "Extrapolando", yOverD: r, label: "Extrapolando" };
  if (r >= criterionMax) return { class: "Cheio", yOverD: r, label: "Cheio" };
  return { class: "Parcial", yOverD: r, label: `Parcial (y/D=${r.toFixed(2)})` };
}

export function isDrainageAlertStatus(status?: CadDrainageStatus | null): boolean {
  return Boolean(status && status !== "ok");
}

export function autoCorrectDrainagePipeFlowDepthRatio(
  project: CadProject,
  pipeId: string,
  options: { targetYOverD: number; maxSlopePct?: number; maxIterations?: number },
): { project: CadProject; before: number; after: number; corrected: boolean; reason?: string } {
  const pipeEntity = listDrainagePipes(project).find((p) => p.id === pipeId);
  if (!pipeEntity) throw new Error("Tubo não encontrado.");

  const pipe = pipeEntity.drainage;
  const qContribLps = pipe?.qContribLps ?? 0;
  if (qContribLps <= 0) {
    return {
      project,
      before: pipe?.flowDepthRatio ?? 0,
      after: pipe?.flowDepthRatio ?? 0,
      corrected: false,
      reason: "Q contribuição = 0",
    };
  }

  const diameterMm = pipe?.diameterMm ?? DEFAULT_DRAINAGE_PARAMS.minDiameterMm;
  const nManning = pipe?.nManning ?? DEFAULT_DRAINAGE_PARAMS.nManning;
  const lengthM = pipe?.lengthM ?? pipeLengthM(pipeEntity.vertices[0].x, pipeEntity.vertices[0].y, pipeEntity.vertices.at(-1)!.x, pipeEntity.vertices.at(-1)!.y);
  const currentSlopePct = pipe?.slopePct ?? pipeSlopePct(pipeEntity.vertices[0].z, pipeEntity.vertices.at(-1)!.z, lengthM);
  const before = checkDrainageHydraulics(qContribLps, diameterMm, currentSlopePct, nManning).flowDepthRatio;

  if (before <= options.targetYOverD + 1e-6) {
    return { project, before, after: before, corrected: false };
  }

  const maxSlopePct = Math.max(0.1, options.maxSlopePct ?? 10);
  const target = Math.max(0.01, options.targetYOverD);
  const maxIter = Math.max(10, options.maxIterations ?? 30);

  const evalRatio = (slopePct: number) => checkDrainageHydraulics(qContribLps, diameterMm, slopePct, nManning).flowDepthRatio;

  let low = Math.max(0.01, Math.abs(currentSlopePct));
  let high = low;
  // Sobe até achar um declive que “caiba” no critério (ou estourar o limite).
  while (evalRatio(high) > target && high < maxSlopePct - 1e-9) {
    high = Math.min(maxSlopePct, Math.max(high * 1.3, high + 0.05));
  }

  const highRatio = evalRatio(high);
  if (highRatio > target + 1e-6) {
    return {
      project,
      before,
      after: highRatio,
      corrected: false,
      reason: `Não foi possível reduzir y/D até ${target.toFixed(2)} (limite i máx = ${maxSlopePct}%).`,
    };
  }

  // Busca binária para aproximar o menor i possível.
  for (let i = 0; i < maxIter; i++) {
    const mid = (low + high) / 2;
    const rMid = evalRatio(mid);
    if (rMid > target) low = mid;
    else high = mid;
  }

  const slopePct = high;
  const afterProject = updateDrainagePipe(project, pipeId, { slopePct });
  const afterPipe = listDrainagePipes(afterProject).find((p) => p.id === pipeId);
  const after = afterPipe?.drainage?.flowDepthRatio ?? evalRatio(slopePct);
  return { project: afterProject, before, after, corrected: true };
}

export function suggestDiameterMm(
  qContribLps: number,
  slopePct: number,
  nManning: number,
  minDiameterMm = 300,
): {
  diameterMm: number;
  capacityLps: number;
  status: CadDrainageStatus;
  velocityMs: number;
  flowDepthRatio: number;
} {
  const catalog = DRAINAGE_PIPE_DIAMETERS_MM.filter((d) => d >= minDiameterMm);
  const list = catalog.length > 0 ? catalog : [...DRAINAGE_PIPE_DIAMETERS_MM];
  let qOk: ReturnType<typeof suggestDiameterMm> | null = null;
  for (const diameterMm of list) {
    const check = checkDrainageHydraulics(qContribLps, diameterMm, slopePct, nManning);
    const sized = { diameterMm, ...check };
    if (check.status === "ok") return sized;
    if (!qOk && check.status !== "insuficiente") qOk = sized;
  }
  if (qOk) return qOk;
  const diameterMm = list[list.length - 1] ?? minDiameterMm;
  return { diameterMm, ...checkDrainageHydraulics(qContribLps, diameterMm, slopePct, nManning) };
}

export function formatPipeLabel(pipe: {
  code?: string;
  diameterMm: number;
  slopePct?: number;
  lengthM: number;
  pipeRole?: "collector" | "ramal";
}): string {
  return formatPipePlanLabel(pipe);
}

export function listDrainageRamais(project: CadProject): CadPolylineEntity[] {
  const inletIds = new Set(listDrainageInlets(project).map((p) => p.id));
  return listDrainagePipes(project).filter((p) => {
    if (p.drainage?.pipeRole === "ramal") return true;
    const from = p.drainage?.fromPvId ?? "";
    const to = p.drainage?.toPvId ?? "";
    return inletIds.has(from) || inletIds.has(to);
  });
}

export function isDrainageStructureLayer(layerId: string): boolean {
  return (
    layerId === DRENAGEM_PV_LAYER.id ||
    layerId === DRENAGEM_BOCAS_LAYER.id ||
    layerId === DRENAGEM_EMISSARIO_LAYER.id
  );
}

function drainageNodeLabel(
  kind: CadDrainageKind | "tap",
  code: string,
  invertZ: number,
  groundZ: number,
): string {
  return formatDrainageNodeCallout({ kind, code, invertZ, groundZ, outfall: kind === "outfall" });
}

function sampleGroundZ(
  x: number,
  y: number,
  fallbackZ: number,
  samples: ElevationSample[],
): number {
  const z = idwZ(x, y, samples);
  return z != null && Number.isFinite(z) ? z : fallbackZ;
}

function closedPolysOn(project: CadProject, layerId: string): CadPolylineEntity[] {
  return project.entities.filter(
    (e): e is CadPolylineEntity =>
      e.type === "polyline" && Boolean(e.closed) && e.layerId === layerId && e.vertices.length >= 3,
  );
}

function syntheticAxisFromVia(via: CadPolylineEntity): CadVertex[] {
  const pts = via.vertices;
  let bestA = 0;
  let bestB = 1;
  let best = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = dist2(pts[i].x, pts[i].y, pts[j].x, pts[j].y);
      if (d > best) {
        best = d;
        bestA = i;
        bestB = j;
      }
    }
  }
  const a = pts[bestA];
  const b = pts[bestB];
  const z = a.z;
  const samples: CadVertex[] = [];
  const n = Math.max(4, Math.ceil(best / 8));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (pointInPolygon(x, y, pts) || i === 0 || i === n) {
      samples.push({ x, y, z });
    }
  }
  return samples.length >= 2 ? samples : [a, b];
}

function streetAxes(project: CadProject): CadPolylineEntity[] {
  const eixos = listLoteamentoEixos(project);
  if (eixos.length > 0) return eixos;
  return closedPolysOn(project, LOTEAMENTO_VIAS_LAYER_ID)
    .map((via, i) => ({
      id: `via-axis-${via.id}`,
      type: "polyline" as const,
      layerId: LOTEAMENTO_EIXOS_LAYER_ID,
      vertices: syntheticAxisFromVia(via),
      closed: false,
      name: via.name ?? `Via ${i + 1}`,
    }))
    .filter((axis) => axis.vertices.length >= 2);
}

function stationOnAlignment(vertices: CadVertex[], x: number, y: number): number {
  let bestS = 0;
  let bestD = Infinity;
  let acc = 0;
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i];
    const b = vertices[i + 1];
    const len = dist2(a.x, a.y, b.x, b.y);
    if (len < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / (len * len)));
    const px = a.x + (b.x - a.x) * t;
    const py = a.y + (b.y - a.y) * t;
    const d = dist2(x, y, px, py);
    if (d < bestD) {
      bestD = d;
      bestS = acc + t * len;
    }
    acc += len;
  }
  return bestS;
}

type DraftPv = {
  id: string;
  code: string;
  x: number;
  y: number;
  groundZ: number;
  invertZ: number;
  coverDepthM: number;
  stationM: number;
  viaId: string;
  kind: "pv" | "outfall" | "inlet";
  origin: "auto" | "manual";
  tap?: boolean;
  side?: -1 | 1;
};

type NetworkEdge = {
  a: string;
  b: string;
  lengthM: number;
  role?: "collector" | "ramal";
};

type DraftPipe = {
  id: string;
  code?: string;
  fromId: string;
  toId: string;
  lengthM: number;
  slopePct: number;
  diameterMm: number;
  invertInZ: number;
  invertOutZ: number;
  material: string;
  nManning: number;
  contribAreaHa: number;
  qContribLps: number;
  qCapacityLps: number;
  velocityMs: number;
  flowDepthRatio: number;
  tcMin: number;
  status: CadDrainageStatus;
  origin: "auto" | "manual";
  pipeRole?: "collector" | "ramal";
};

function snapDraftPv(p: DraftPv, bag: DraftPv[], snapM: number): DraftPv {
  for (const other of bag) {
    if (p.kind !== other.kind) continue;
    if (Boolean(p.tap) !== Boolean(other.tap)) continue;
    if (dist2(other.x, other.y, p.x, p.y) <= snapM) return other;
  }
  bag.push(p);
  return p;
}

function nextPvCode(existing: CadPointEntity[]): string {
  let max = 0;
  for (const pv of existing) {
    const raw = pv.drainage?.code ?? pv.label ?? "";
    const m = raw.match(/(\d+)/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return padCode("PV", max);
}

function nextInletCode(existing: CadPointEntity[]): string {
  let max = 0;
  for (const inlet of existing) {
    const raw = inlet.drainage?.code ?? inlet.label ?? "";
    const m = raw.match(/(\d+)/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return padCode("BL", max);
}

function buildDraftFromProject(project: CadProject): { pvs: DraftPv[]; pipes: DraftPipe[] } {
  const pvs: DraftPv[] = listDrainagePvs(project).map((pv) => ({
    id: pv.id,
    code: pv.drainage?.code ?? pv.label ?? pv.id,
    x: pv.x,
    y: pv.y,
    groundZ: pv.drainage?.groundZ ?? pv.z,
    invertZ: pv.drainage?.invertZ ?? pv.z - DEFAULT_DRAINAGE_PARAMS.minCoverM,
    coverDepthM: pv.drainage?.coverDepthM ?? DEFAULT_DRAINAGE_PARAMS.minCoverM,
    stationM: pv.drainage?.stationM ?? 0,
    viaId: pv.sourceId ?? "",
    kind:
      pv.drainage?.kind === "outfall" || pv.layerId === DRENAGEM_EMISSARIO_LAYER.id
        ? "outfall"
        : pv.drainage?.kind === "inlet" || pv.layerId === DRENAGEM_BOCAS_LAYER.id
          ? "inlet"
          : "pv",
    origin: pv.drainage?.origin ?? "manual",
    tap: Boolean(pv.drainage?.tap) || /^T[-_\s]/i.test(pv.drainage?.code ?? ""),
  }));
  const pipes: DraftPipe[] = listDrainagePipes(project).map((pipe, i) => {
    const a = pipe.vertices[0];
    const b = pipe.vertices[pipe.vertices.length - 1];
    const lengthM = pipe.drainage?.lengthM ?? dist2(a.x, a.y, b.x, b.y);
    return {
      id: pipe.id,
      code: pipe.drainage?.code,
      fromId: pipe.drainage?.fromPvId ?? "",
      toId: pipe.drainage?.toPvId ?? "",
      lengthM,
      slopePct: pipe.drainage?.slopePct ?? 0,
      diameterMm: pipe.drainage?.diameterMm ?? DEFAULT_DRAINAGE_PARAMS.minDiameterMm,
      invertInZ: pipe.drainage?.invertInZ ?? a.z,
      invertOutZ: pipe.drainage?.invertOutZ ?? b.z,
      material: pipe.drainage?.material ?? DEFAULT_DRAINAGE_PARAMS.material,
      nManning: pipe.drainage?.nManning ?? DEFAULT_DRAINAGE_PARAMS.nManning,
      contribAreaHa: pipe.drainage?.contribAreaHa ?? 0,
      qContribLps: pipe.drainage?.qContribLps ?? 0,
      qCapacityLps: pipe.drainage?.qCapacityLps ?? 0,
      velocityMs: pipe.drainage?.velocityMs ?? 0,
      flowDepthRatio: pipe.drainage?.flowDepthRatio ?? 0,
      tcMin: pipe.drainage?.tcMin ?? 0,
      status: pipe.drainage?.status ?? "ok",
      origin: pipe.drainage?.origin ?? "manual",
      pipeRole:
        pipe.drainage?.pipeRole ??
        (pvs.find((n) => n.id === (pipe.drainage?.fromPvId ?? ""))?.kind === "inlet" ||
        pvs.find((n) => n.id === (pipe.drainage?.toPvId ?? ""))?.kind === "inlet"
          ? "ramal"
          : "collector"),
    };
  });
  return { pvs, pipes };
}

function pickOutfall(pvs: DraftPv[], degree: Map<string, number>, explicitId?: string | null): DraftPv | null {
  const mains = pvs.filter((p) => p.kind !== "inlet" && !p.tap);
  if (pvs.length === 0) return null;
  if (explicitId) {
    const hit = pvs.find((p) => p.id === explicitId && p.kind !== "inlet");
    if (hit) return hit;
  }
  const marked = mains.find((p) => p.kind === "outfall");
  if (marked) return marked;
  const leaves = mains.filter((p) => (degree.get(p.id) ?? 0) <= 1);
  const pool = leaves.length > 0 ? leaves : mains.length > 0 ? mains : pvs;
  return [...pool].sort((a, b) => a.groundZ - b.groundZ || a.y - b.y || a.x - b.x)[0] ?? null;
}

function edgeRole(undirected: NetworkEdge[], a: string, b: string): "collector" | "ramal" | undefined {
  const hit = undirected.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  return hit?.role;
}

function orientTowardOutfall(
  pvs: DraftPv[],
  undirected: NetworkEdge[],
  outfallId: string,
): Array<{ fromId: string; toId: string; lengthM: number; role?: "collector" | "ramal" }> {
  const adj = new Map<string, Array<{ other: string; lengthM: number }>>();
  for (const pv of pvs) adj.set(pv.id, []);
  for (const e of undirected) {
    adj.get(e.a)?.push({ other: e.b, lengthM: e.lengthM });
    adj.get(e.b)?.push({ other: e.a, lengthM: e.lengthM });
  }
  const parent = new Map<string, string | null>();
  const edgeLen = new Map<string, number>();
  const q = [outfallId];
  parent.set(outfallId, null);
  while (q.length > 0) {
    const cur = q.shift()!;
    for (const nb of adj.get(cur) ?? []) {
      if (parent.has(nb.other)) continue;
      parent.set(nb.other, cur);
      edgeLen.set(`${nb.other}->${cur}`, nb.lengthM);
      q.push(nb.other);
    }
  }
  const oriented: Array<{ fromId: string; toId: string; lengthM: number; role?: "collector" | "ramal" }> = [];
  for (const [id, par] of parent) {
    if (!par) continue;
    oriented.push({
      fromId: id,
      toId: par,
      lengthM: edgeLen.get(`${id}->${par}`) ?? 0,
      role: edgeRole(undirected, id, par),
    });
  }
  for (const e of undirected) {
    const used =
      oriented.some((o) => (o.fromId === e.a && o.toId === e.b) || (o.fromId === e.b && o.toId === e.a));
    if (used) continue;
    const a = pvs.find((p) => p.id === e.a);
    const b = pvs.find((p) => p.id === e.b);
    if (!a || !b) continue;
    if (a.groundZ >= b.groundZ) oriented.push({ fromId: a.id, toId: b.id, lengthM: e.lengthM, role: e.role });
    else oriented.push({ fromId: b.id, toId: a.id, lengthM: e.lengthM, role: e.role });
  }
  return oriented;
}

function assignHydraulics(
  pvs: DraftPv[],
  pipes: Array<{
    fromId: string;
    toId: string;
    lengthM: number;
    origin: "auto" | "manual";
    id?: string;
    diameterMm?: number;
    code?: string;
    pipeRole?: "collector" | "ramal";
  }>,
  params: DrainageParams,
  contribByPv: Map<string, number>,
  options: { keepDiameters?: boolean; tcMin?: number } = {},
): DraftPipe[] {
  const byId = new Map(pvs.map((p) => [p.id, p]));
  const children = new Map<string, string[]>();
  for (const pv of pvs) children.set(pv.id, []);
  for (const pipe of pipes) {
    children.get(pipe.toId)?.push(pipe.fromId);
  }

  const downstream = new Map<string, string>();
  for (const pipe of pipes) downstream.set(pipe.fromId, pipe.toId);

  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const child of children.get(id) ?? []) visit(child);
    order.push(id);
  };
  for (const pv of pvs) visit(pv.id);

  const accumHa = new Map<string, number>();
  for (const id of order) {
    let area = contribByPv.get(id) ?? 0;
    for (const child of children.get(id) ?? []) area += accumHa.get(child) ?? 0;
    accumHa.set(id, area);
  }

  const minS = Math.max(0.05, params.minSlopePct) / 100;
  const outfall = pvs.find((p) => p.kind === "outfall") ?? pvs[pvs.length - 1];
  if (outfall) {
    outfall.invertZ = outfall.groundZ - params.minCoverM;
    outfall.coverDepthM = params.minCoverM;
  }

  const topoFromOutfall: string[] = [];
  const seenUp = new Set<string>();
  const walkUp = (id: string) => {
    if (seenUp.has(id)) return;
    seenUp.add(id);
    topoFromOutfall.push(id);
    for (const child of children.get(id) ?? []) walkUp(child);
  };
  if (outfall) walkUp(outfall.id);
  for (const pv of pvs) walkUp(pv.id);

  for (const id of topoFromOutfall) {
    const downId = downstream.get(id);
    const node = byId.get(id);
    if (!node) continue;
    if (!downId) {
      node.invertZ = node.groundZ - params.minCoverM;
      node.coverDepthM = params.minCoverM;
      continue;
    }
    const down = byId.get(downId);
    const pipe = pipes.find((p) => p.fromId === id && p.toId === downId);
    const L = Math.max(pipe?.lengthM ?? 0, 0.01);
    if (!down) continue;
    const bySlope = down.invertZ + minS * L;
    const byCover = node.groundZ - params.minCoverM;
    node.invertZ = Math.min(bySlope, byCover);
    if (node.invertZ <= down.invertZ) node.invertZ = down.invertZ + minS * L;
    node.coverDepthM = node.groundZ - node.invertZ;
  }

  return pipes.map((pipe) => {
    const from = byId.get(pipe.fromId);
    const to = byId.get(pipe.toId);
    const lengthM = Math.max(pipe.lengthM, dist2(from?.x ?? 0, from?.y ?? 0, to?.x ?? 0, to?.y ?? 0));
    const invertInZ = from?.invertZ ?? 0;
    const invertOutZ = to?.invertZ ?? invertInZ - (params.minSlopePct / 100) * lengthM;
    const slopePct = pipeSlopePct(invertInZ, invertOutZ, lengthM);
    const designSlope = Math.max(slopePct, params.minSlopePct);
    const contribAreaHa = accumHa.get(pipe.fromId) ?? 0;
    const qContribLps = rationalRunoffLps(params.runoffC, params.intensityMmH, contribAreaHa);
    const fromKind = from?.kind;
    const pipeRole: "collector" | "ramal" =
      pipe.pipeRole ?? (fromKind === "inlet" ? "ramal" : "collector");
    const minDn =
      pipeRole === "ramal"
        ? Math.min(params.lateralDiameterMm ?? 300, params.minDiameterMm)
        : params.minDiameterMm;
    const sized = suggestDiameterMm(qContribLps, designSlope, params.nManning, minDn);
    const diameterMm =
      options.keepDiameters && pipe.diameterMm && pipe.diameterMm > 0 ? pipe.diameterMm : sized.diameterMm;
    const check = checkDrainageHydraulics(qContribLps, diameterMm, designSlope, params.nManning);
    return {
      id: pipe.id ?? newId("tb"),
      code: pipe.code,
      fromId: pipe.fromId,
      toId: pipe.toId,
      lengthM,
      slopePct: designSlope,
      diameterMm,
      invertInZ,
      invertOutZ,
      material: params.material,
      nManning: params.nManning,
      contribAreaHa,
      qContribLps,
      qCapacityLps: check.capacityLps,
      velocityMs: check.velocityMs,
      flowDepthRatio: check.flowDepthRatio,
      tcMin: options.tcMin ?? 0,
      status: check.status,
      origin: pipe.origin,
      pipeRole,
    };
  });
}

function contribAreas(
  project: CadProject,
  pvs: DraftPv[],
  reserva: CadVertex[][],
  options: { inletSpacingM?: number } = {},
): { byPv: Map<string, number>; polys: CadPolylineEntity[] } {
  const byPv = new Map<string, number>();
  for (const pv of pvs) byPv.set(pv.id, 0);
  const polys: CadPolylineEntity[] = [];
  if (pvs.length === 0) return { byPv, polys };

  const inlets = pvs.filter((p) => p.kind === "inlet");
  const lots = closedPolysOn(project, LOTEAMENTO_LOTES_LAYER_ID);
  const vias = closedPolysOn(project, LOTEAMENTO_VIAS_LAYER_ID);
  const targetsForLots = inlets.length > 0 ? inlets : pvs;

  const assignPoly = (poly: CadPolylineEntity, targets: DraftPv[]) => {
    if (targets.length === 0) return;
    const c = {
      x: poly.vertices.reduce((s, v) => s + v.x, 0) / poly.vertices.length,
      y: poly.vertices.reduce((s, v) => s + v.y, 0) / poly.vertices.length,
    };
    if (pointInAnyReserva(c.x, c.y, reserva)) return;
    if (poly.vertices.some((v) => pointInAnyReserva(v.x, v.y, reserva))) {
      const allInside = poly.vertices.every((v) => pointInAnyReserva(v.x, v.y, reserva));
      if (allInside) return;
    }
    let best = targets[0];
    let bestD = Infinity;
    for (const pv of targets) {
      const d = dist2(c.x, c.y, pv.x, pv.y);
      if (d < bestD) {
        best = pv;
        bestD = d;
      }
    }
    const areaHa = polygonAreaM2(poly.vertices, true) / 10_000;
    byPv.set(best.id, (byPv.get(best.id) ?? 0) + areaHa);
    polys.push({
      ...poly,
      id: newId("ct"),
      layerId: DRENAGEM_CONTRIB_LAYER.id,
      name: `→ ${best.code}`,
      drainage: { kind: "contrib", code: best.code, contribAreaHa: areaHa, origin: "auto" },
    });
  };

  for (const poly of lots) assignPoly(poly, targetsForLots);

  if (inlets.length > 0) {
    const spacing = Math.max(8, options.inletSpacingM ?? DEFAULT_DRAINAGE_PARAMS.inletSpacingM ?? 25);
    const stripHa = (spacing * 5.5) / 10_000;
    for (const bl of inlets) {
      byPv.set(bl.id, (byPv.get(bl.id) ?? 0) + stripHa);
    }
  } else {
    for (const poly of vias) assignPoly(poly, pvs);
  }
  return { byPv, polys };
}

function commitNetwork(
  project: CadProject,
  pvs: DraftPv[],
  pipes: DraftPipe[],
  contribPolys: CadPolylineEntity[],
): CadProject {
  const kept = project.entities.filter((e) => !isDrainageLayer(e.layerId));
  const pvEntities: CadPointEntity[] = pvs.map((pv) => ({
    id: pv.id,
    type: "point",
    layerId:
      pv.kind === "outfall" ? DRENAGEM_EMISSARIO_LAYER.id : pv.kind === "inlet" ? DRENAGEM_BOCAS_LAYER.id : DRENAGEM_PV_LAYER.id,
    x: pv.x,
    y: pv.y,
    z: pv.groundZ,
    label: drainageNodeLabel(pv.tap ? "tap" : pv.kind, pv.code, pv.invertZ, pv.groundZ),
    textColor: CAD_PLAN_BLUE,
    sourceId: pv.viaId || undefined,
    drainage: {
      kind: pv.kind,
      code: pv.code,
      origin: pv.origin,
      stationM: pv.stationM,
      groundZ: pv.groundZ,
      invertZ: pv.invertZ,
      coverDepthM: pv.coverDepthM,
      tap: pv.tap || undefined,
    },
  }));
  const byId = new Map(pvs.map((p) => [p.id, p]));
  const pipeEntities: CadPolylineEntity[] = pipes.map((pipe, i) => {
    const from = byId.get(pipe.fromId);
    const to = byId.get(pipe.toId);
    const a: CadVertex = { x: from?.x ?? 0, y: from?.y ?? 0, z: pipe.invertInZ };
    const b: CadVertex = { x: to?.x ?? 0, y: to?.y ?? 0, z: pipe.invertOutZ };
    const role = pipe.pipeRole ?? "collector";
    const code = pipe.code?.trim() || padCode(role === "ramal" ? "RM" : "TB", i);
    return {
      id: pipe.id,
      type: "polyline",
      layerId: DRENAGEM_TUBOS_LAYER.id,
      vertices: [a, b],
      closed: false,
      name: formatPipeLabel({ code, diameterMm: pipe.diameterMm, lengthM: pipe.lengthM, pipeRole: role }),
      drainage: {
        kind: "pipe",
        code,
        origin: pipe.origin,
        pipeRole: role,
        fromPvId: pipe.fromId,
        toPvId: pipe.toId,
        lengthM: pipe.lengthM,
        slopePct: pipe.slopePct,
        diameterMm: pipe.diameterMm,
        invertInZ: pipe.invertInZ,
        invertOutZ: pipe.invertOutZ,
        material: pipe.material,
        nManning: pipe.nManning,
        contribAreaHa: pipe.contribAreaHa,
        qContribLps: pipe.qContribLps,
        qCapacityLps: pipe.qCapacityLps,
        velocityMs: pipe.velocityMs,
        flowDepthRatio: pipe.flowDepthRatio,
        tcMin: pipe.tcMin,
        status: pipe.status,
      },
    };
  });
  return {
    ...project,
    layers: ensureLayers(project),
    entities: [...kept, ...contribPolys, ...pipeEntities, ...pvEntities],
  };
}

export type GenerateDrainageResult = {
  project: CadProject;
  pvCount: number;
  inletCount: number;
  pipeCount: number;
  ramalCount: number;
  outfallCode: string | null;
  message: string;
  intensityMmH: number;
  tcMin: number;
};

function pushUniqueEdge(edges: NetworkEdge[], edge: NetworkEdge) {
  const key = [edge.a, edge.b].sort().join("|");
  if (edges.some((e) => [e.a, e.b].sort().join("|") === key)) return;
  edges.push(edge);
}

/** Liga cada boca ao PV mais próximo ou insere um T no coletor e um ramal. */
function attachInletsToCollectors(
  bag: DraftPv[],
  edges: NetworkEdge[],
  reserva: CadVertex[][],
  cfg: DrainageParams,
): void {
  const tapMinFromPvM = 8;
  const snapTapM = 4;
  const inlets = bag.filter((p) => p.kind === "inlet");
  for (const inlet of inlets) {
    const mains = bag.filter((p) => p.kind !== "inlet");
    if (mains.length === 0) continue;
    let bestPv = mains[0];
    let bestPvD = Infinity;
    for (const m of mains) {
      const d = dist2(inlet.x, inlet.y, m.x, m.y);
      if (d < bestPvD) {
        bestPv = m;
        bestPvD = d;
      }
    }

    let bestSeg: {
      edge: NetworkEdge;
      a: DraftPv;
      b: DraftPv;
      x: number;
      y: number;
      dist: number;
    } | null = null;
    for (const edge of edges) {
      if (edge.role === "ramal") continue;
      const a = bag.find((p) => p.id === edge.a);
      const b = bag.find((p) => p.id === edge.b);
      if (!a || !b) continue;
      const hit = closestPointOnSegment(inlet.x, inlet.y, a.x, a.y, b.x, b.y);
      if (!bestSeg || hit.dist < bestSeg.dist) {
        bestSeg = { edge, a, b, x: hit.x, y: hit.y, dist: hit.dist };
      }
    }

    let target = bestPv;
    if (bestSeg && bestSeg.dist + 1.2 < bestPvD) {
      const dA = dist2(bestSeg.x, bestSeg.y, bestSeg.a.x, bestSeg.a.y);
      const dB = dist2(bestSeg.x, bestSeg.y, bestSeg.b.x, bestSeg.b.y);
      if (dA >= tapMinFromPvM && dB >= tapMinFromPvM) {
        const existingTap = bag.find(
          (p) => p.tap && dist2(p.x, p.y, bestSeg!.x, bestSeg!.y) <= snapTapM,
        );
        if (existingTap) {
          target = existingTap;
        } else {
          const t = bestSeg.edge.lengthM > 1e-9
            ? Math.max(0, Math.min(1, dA / bestSeg.edge.lengthM))
            : 0.5;
          const groundZ = bestSeg.a.groundZ + (bestSeg.b.groundZ - bestSeg.a.groundZ) * t;
          const tap: DraftPv = {
            id: newId("tap"),
            code: "T",
            x: bestSeg.x,
            y: bestSeg.y,
            groundZ,
            invertZ: groundZ - cfg.minCoverM,
            coverDepthM: cfg.minCoverM,
            stationM: bestSeg.a.stationM + (bestSeg.b.stationM - bestSeg.a.stationM) * t,
            viaId: bestSeg.a.viaId || bestSeg.b.viaId,
            kind: "pv",
            origin: "auto",
            tap: true,
          };
          bag.push(tap);
          const idx = edges.indexOf(bestSeg.edge);
          if (idx >= 0) edges.splice(idx, 1);
          pushUniqueEdge(edges, {
            a: bestSeg.a.id,
            b: tap.id,
            lengthM: pipeLengthM(bestSeg.a.x, bestSeg.a.y, tap.x, tap.y),
            role: "collector",
          });
          pushUniqueEdge(edges, {
            a: tap.id,
            b: bestSeg.b.id,
            lengthM: pipeLengthM(tap.x, tap.y, bestSeg.b.x, bestSeg.b.y),
            role: "collector",
          });
          target = tap;
        }
      }
    }

    if (pipeIntersectsReserva(inlet.x, inlet.y, target.x, target.y, reserva)) {
      const alt = [...mains]
        .filter((m) => m.id !== target.id && !pipeIntersectsReserva(inlet.x, inlet.y, m.x, m.y, reserva))
        .sort((a, b) => dist2(inlet.x, inlet.y, a.x, a.y) - dist2(inlet.x, inlet.y, b.x, b.y))[0];
      if (!alt) continue;
      target = alt;
    }
    const lengthM = pipeLengthM(inlet.x, inlet.y, target.x, target.y);
    if (lengthM < 0.3) continue;
    pushUniqueEdge(edges, { a: inlet.id, b: target.id, lengthM, role: "ramal" });
  }
}

export function generateLoteamentoDrainage(
  project: CadProject,
  params: Partial<DrainageParams> = {},
): GenerateDrainageResult {
  const axes = streetAxes(project);
  if (axes.length === 0) {
    throw new Error("Gere o loteamento com vias/eixos antes de criar a drenagem.");
  }
  const flowPathM = axes.reduce((max, axis) => Math.max(max, polylineLengthM(axis.vertices)), 0);
  const cfg = applyDesignRain({ ...DEFAULT_DRAINAGE_PARAMS, ...params }, flowPathM);
  const reserva = listReservaRings(project);
  const samples = extractSurveyElevationPoints(project.entities);
  const alignments = buildStreetAlignments(axes);
  const snapM = Math.max(1, cfg.pvSpacingM * 0.35);
  const bag: DraftPv[] = [];
  const undirected: NetworkEdge[] = [];
  const enableAutoInlets = cfg.enableAutoInlets ?? true;
  const connectInletsToMain = cfg.connectInletsToMain ?? true;
  const inletSpacingM = Math.max(5, cfg.inletSpacingM ?? 25);

  const axesForAlign =
    alignments.length > 0
      ? alignments.map((al) => ({
          id: al.id,
          name: al.name,
          vertices: al.vertices,
          intersections: al.intersections,
        }))
      : axes.map((axis) => ({
          id: axis.id,
          name: axis.name ?? axis.id,
          vertices: axis.vertices,
          intersections: [] as Array<{ x: number; y: number; stationM: number }>,
        }));

  for (const al of axesForAlign) {
    const anchors: DrainageStation[] = al.intersections.map((hit) => ({
      x: hit.x,
      y: hit.y,
      z: sampleGroundZ(hit.x, hit.y, 0, samples),
      stationM: hit.stationM ?? stationOnAlignment(al.vertices, hit.x, hit.y),
    }));
    const stations = placePvsAlongVia(al.vertices, cfg.pvSpacingM, {
      snapM,
      anchors,
      reservaRings: reserva,
    });
    const row: DraftPv[] = [];
    for (const st of stations) {
      const groundZ = sampleGroundZ(st.x, st.y, st.z, samples);
      const draft: DraftPv = {
        id: newId("pv"),
        code: padCode("PV", bag.length),
        x: st.x,
        y: st.y,
        groundZ,
        invertZ: groundZ - cfg.minCoverM,
        coverDepthM: cfg.minCoverM,
        stationM: st.stationM,
        viaId: al.id,
        kind: "pv",
        origin: "auto",
      };
      row.push(snapDraftPv(draft, bag, snapM));
    }
    const unique = row.filter((pv, i, arr) => arr.findIndex((o) => o.id === pv.id) === i);
    unique.sort((a, b) => a.stationM - b.stationM);
    for (let i = 0; i < unique.length - 1; i++) {
      const a = unique[i];
      const b = unique[i + 1];
      if (a.id === b.id) continue;
      if (pipeIntersectsReserva(a.x, a.y, b.x, b.y, reserva)) continue;
      const lengthM = pipeLengthM(a.x, a.y, b.x, b.y);
      if (lengthM < 0.4) continue;
      pushUniqueEdge(undirected, { a: a.id, b: b.id, lengthM, role: "collector" });
    }

    if (enableAutoInlets) {
      const offsetM = estimateCurbOffsetM(project, al.vertices);
      const inletSnapM = Math.max(1.5, inletSpacingM * 0.12);
      const inletStations = placeInletsAlongVia(al.vertices, inletSpacingM, {
        offsetM,
        bothSides: true,
        snapM: inletSnapM,
        anchors: (cfg.inletAtIntersections ?? true) ? anchors : [],
        reservaRings: reserva,
      });
      for (const st of inletStations) {
        const groundZ = sampleGroundZ(st.x, st.y, st.z, samples);
        snapDraftPv(
          {
            id: newId("inlet"),
            code: padCode("BL", bag.filter((p) => p.kind === "inlet").length),
            x: st.x,
            y: st.y,
            groundZ,
            invertZ: groundZ - cfg.minCoverM,
            coverDepthM: cfg.minCoverM,
            stationM: st.stationM,
            viaId: al.id,
            kind: "inlet",
            origin: "auto",
            side: st.side,
          },
          bag,
          inletSnapM,
        );
      }
    }
  }

  const keptIds = new Set(
    bag.filter((pv) => !pointInAnyReserva(pv.x, pv.y, reserva)).map((pv) => pv.id),
  );
  const cleanBag = bag.filter((pv) => keptIds.has(pv.id));
  const cleanEdges = undirected.filter(
    (e) =>
      keptIds.has(e.a) &&
      keptIds.has(e.b) &&
      (() => {
        const a = cleanBag.find((p) => p.id === e.a);
        const b = cleanBag.find((p) => p.id === e.b);
        if (!a || !b) return false;
        return !pipeIntersectsReserva(a.x, a.y, b.x, b.y, reserva);
      })(),
  );
  bag.length = 0;
  bag.push(...cleanBag);
  undirected.length = 0;
  undirected.push(...cleanEdges);

  if (connectInletsToMain) {
    attachInletsToCollectors(bag, undirected, reserva, cfg);
  }

  const mains = bag.filter((p) => p.kind !== "inlet");
  if (mains.length < 2) {
    throw new Error("Não foi possível posicionar PVs nas vias (verifique eixos, reserva legal e APP).");
  }

  const degree = new Map<string, number>();
  for (const pv of bag) degree.set(pv.id, 0);
  for (const e of undirected) {
    if (e.role === "ramal") continue;
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }
  const outfall = pickOutfall(bag, degree, cfg.outfallPvId);
  if (outfall) {
    for (const pv of bag) {
      if (pv.id === outfall.id) pv.kind = "outfall";
    }
  }

  let pvIndex = 0;
  let inletIndex = 0;
  let tapIndex = 0;
  for (const pv of bag) {
    if (pv.kind === "inlet") pv.code = padCode("BL", inletIndex++);
    else if (pv.tap) pv.code = padCode("T", tapIndex++);
    else pv.code = padCode("PV", pvIndex++);
  }

  const oriented = outfall
    ? orientTowardOutfall(bag, undirected, outfall.id)
    : undirected.map((e) => ({ fromId: e.a, toId: e.b, lengthM: e.lengthM, role: e.role }));
  const { byPv, polys } = contribAreas(project, bag, reserva, { inletSpacingM });
  const pipes = assignHydraulics(
    bag,
    oriented.map((e) => ({ ...e, origin: "auto" as const, pipeRole: e.role })),
    cfg,
    byPv,
    { tcMin: cfg.tcMin },
  );
  const next = commitNetwork(project, bag, pipes, polys);
  const ok = pipes.filter((p) => p.status === "ok").length;
  const bad = pipes.length - ok;
  const inletCount = bag.filter((p) => p.kind === "inlet").length;
  const ramalCount = pipes.filter((p) => p.pipeRole === "ramal").length;
  const pvCount = bag.filter((p) => p.kind !== "inlet").length;
  const idfNote = isUsableIdf(cfg.idf)
    ? ` IDF i=${cfg.intensityMmH.toFixed(1)} mm/h (tc=${cfg.tcMin.toFixed(1)} min).`
    : "";
  return {
    project: next,
    pvCount,
    inletCount,
    pipeCount: pipes.length,
    ramalCount,
    outfallCode: outfall?.code ?? null,
    intensityMmH: cfg.intensityMmH,
    tcMin: cfg.tcMin,
    message: `Drenagem: ${pvCount} PV(s), ${inletCount} boca(s) de lobo, ${ramalCount} ramal(is), ${pipes.length} tubulação(ões)${
      outfall ? `, emissário ${outfall.code}` : ""
    }. ${ok} trecho(s) OK${bad > 0 ? `, ${bad} fora do critério` : ""}.${idfNote}`,
  };
}

export function clearDrainageEntities(project: CadProject): CadProject {
  return {
    ...project,
    entities: project.entities.filter((e) => !isDrainageLayer(e.layerId)),
  };
}

export function recalculateDrainageHydraulics(
  project: CadProject,
  params: Partial<DrainageParams> = {},
  options: { keepDiameters?: boolean } = {},
): CadProject {
  const { pvs, pipes } = buildDraftFromProject(project);
  if (pvs.length === 0 || pipes.length === 0) return project;
  const flowPathM = Math.max(
    ...pipes.map((p) => p.lengthM),
    streetAxes(project).reduce((max, axis) => Math.max(max, polylineLengthM(axis.vertices)), 0),
    20,
  );
  const cfg = applyDesignRain({ ...DEFAULT_DRAINAGE_PARAMS, ...params }, flowPathM);
  const reserva = listReservaRings(project);
  const degree = new Map<string, number>();
  for (const pv of pvs) degree.set(pv.id, 0);
  const undirected: NetworkEdge[] = pipes
    .filter((p) => p.fromId && p.toId)
    .map((p) => {
      const role = p.pipeRole ?? (pvs.find((n) => n.id === p.fromId)?.kind === "inlet" ? "ramal" : "collector");
      if (role !== "ramal") {
        degree.set(p.fromId, (degree.get(p.fromId) ?? 0) + 1);
        degree.set(p.toId, (degree.get(p.toId) ?? 0) + 1);
      }
      return { a: p.fromId, b: p.toId, lengthM: p.lengthM, role };
    });
  const outfall = pickOutfall(pvs, degree, cfg.outfallPvId);
  if (outfall) {
    for (const pv of pvs) {
      if (pv.id === outfall.id) pv.kind = "outfall";
    }
  }
  const oriented = outfall
    ? orientTowardOutfall(pvs, undirected, outfall.id)
    : pipes.map((p) => ({ fromId: p.fromId, toId: p.toId, lengthM: p.lengthM, role: p.pipeRole }));
  const { byPv, polys } = contribAreas(project, pvs, reserva, { inletSpacingM: cfg.inletSpacingM });
  const nextPipes = assignHydraulics(
    pvs,
    oriented.map((e) => {
      const prev = pipes.find((p) => p.fromId === e.fromId && p.toId === e.toId);
      return {
        ...e,
        origin: prev?.origin ?? "manual",
        diameterMm: prev?.diameterMm,
        code: prev?.code,
        pipeRole: e.role ?? prev?.pipeRole,
      };
    }),
    cfg,
    byPv,
    { keepDiameters: options.keepDiameters, tcMin: cfg.tcMin },
  );
  return commitNetwork(project, pvs, nextPipes, polys);
}

export function insertDrainagePv(
  project: CadProject,
  x: number,
  y: number,
  params: Partial<DrainageParams> = {},
): CadProject {
  const cfg: DrainageParams = { ...DEFAULT_DRAINAGE_PARAMS, ...params };
  const reserva = listReservaRings(project);
  if (pointInAnyReserva(x, y, reserva)) {
    throw new Error("Não insira PV sobre a reserva legal ou a APP.");
  }
  const samples = extractSurveyElevationPoints(project.entities);
  const existing = listDrainagePvs(project);
  const groundZ = sampleGroundZ(x, y, 0, samples);
  const code = nextPvCode(existing);
  const pv: CadPointEntity = {
    id: newId("pv"),
    type: "point",
    layerId: DRENAGEM_PV_LAYER.id,
    x,
    y,
    z: groundZ,
    label: drainageNodeLabel("pv", code, groundZ - cfg.minCoverM, groundZ),
    textColor: CAD_PLAN_BLUE,
    drainage: {
      kind: "pv",
      code,
      origin: "manual",
      stationM: 0,
      groundZ,
      invertZ: groundZ - cfg.minCoverM,
      coverDepthM: cfg.minCoverM,
    },
  };
  return {
    ...project,
    layers: ensureLayers(project),
    entities: [...project.entities, pv],
  };
}

export function insertDrainageInlet(
  project: CadProject,
  x: number,
  y: number,
  params: Partial<DrainageParams> = {},
): CadProject {
  const cfg: DrainageParams = { ...DEFAULT_DRAINAGE_PARAMS, ...params };
  const reserva = listReservaRings(project);
  if (pointInAnyReserva(x, y, reserva)) {
    throw new Error("Não insira boca de lobo sobre a reserva legal ou a APP.");
  }
  const samples = extractSurveyElevationPoints(project.entities);
  const existing = listDrainageInlets(project);
  const groundZ = sampleGroundZ(x, y, 0, samples);
  const code = nextInletCode(existing);
  const inlet: CadPointEntity = {
    id: newId("inlet"),
    type: "point",
    layerId: DRENAGEM_BOCAS_LAYER.id,
    x,
    y,
    z: groundZ,
    label: drainageNodeLabel("inlet", code, groundZ - cfg.minCoverM, groundZ),
    textColor: CAD_PLAN_BLUE,
    drainage: {
      kind: "inlet",
      code,
      origin: "manual",
      stationM: 0,
      groundZ,
      invertZ: groundZ - cfg.minCoverM,
      coverDepthM: cfg.minCoverM,
    },
  };
  const withInlet: CadProject = {
    ...project,
    layers: ensureLayers(project),
    entities: [...project.entities, inlet],
  };
  if (cfg.connectInletsToMain === false) return withInlet;
  try {
    return connectInletToMainNetwork(withInlet, inlet.id, cfg);
  } catch {
    return withInlet;
  }
}

export function connectInletToMainNetwork(
  project: CadProject,
  inletId: string,
  params: Partial<DrainageParams> = {},
): CadProject {
  const inlet = listDrainageInlets(project).find((p) => p.id === inletId);
  if (!inlet) throw new Error("Boca de lobo não encontrada.");
  const mains = listDrainagePvs(project).filter(
    (p) => p.id !== inletId && p.drainage?.kind !== "inlet" && p.layerId !== DRENAGEM_BOCAS_LAYER.id,
  );
  if (mains.length === 0) return project;
  const already = listDrainagePipes(project).some(
    (pipe) => pipe.drainage?.fromPvId === inletId || pipe.drainage?.toPvId === inletId,
  );
  if (already) return project;
  const reserva = listReservaRings(project);
  const target = [...mains]
    .filter((m) => !pipeIntersectsReserva(inlet.x, inlet.y, m.x, m.y, reserva))
    .sort((a, b) => dist2(inlet.x, inlet.y, a.x, a.y) - dist2(inlet.x, inlet.y, b.x, b.y))[0];
  if (!target) throw new Error("Não há PV acessível para ligar a boca de lobo.");
  const withPipe = insertDrainagePipe(project, inlet.id, target.id, params);
  return recalculateDrainageHydraulics(withPipe, params);
}

export function insertDrainagePipe(
  project: CadProject,
  fromPvId: string,
  toPvId: string,
  params: Partial<DrainageParams> = {},
): CadProject {
  if (fromPvId === toPvId) throw new Error("Selecione dois PVs distintos.");
  const cfg: DrainageParams = { ...DEFAULT_DRAINAGE_PARAMS, ...params };
  const pvs = listDrainagePvs(project);
  const from = pvs.find((p) => p.id === fromPvId);
  const to = pvs.find((p) => p.id === toPvId);
  if (!from || !to) throw new Error("PV não encontrado.");
  const reserva = listReservaRings(project);
  if (pipeIntersectsReserva(from.x, from.y, to.x, to.y, reserva)) {
    throw new Error("A tubulação não pode atravessar a reserva legal ou a APP.");
  }
  const already = listDrainagePipes(project).some((pipe) => {
    const a = pipe.drainage?.fromPvId;
    const b = pipe.drainage?.toPvId;
    return (a === fromPvId && b === toPvId) || (a === toPvId && b === fromPvId);
  });
  if (already) throw new Error("Já existe tubulação entre esses PVs.");
  const lengthM = pipeLengthM(from.x, from.y, to.x, to.y);
  const invertIn = from.drainage?.invertZ ?? from.z - cfg.minCoverM;
  const invertOut = to.drainage?.invertZ ?? to.z - cfg.minCoverM;
  const slopePct = Math.max(cfg.minSlopePct, Math.abs(pipeSlopePct(invertIn, invertOut, lengthM)));
  const fromIsInlet = from.drainage?.kind === "inlet" || from.layerId === DRENAGEM_BOCAS_LAYER.id;
  const toIsInlet = to.drainage?.kind === "inlet" || to.layerId === DRENAGEM_BOCAS_LAYER.id;
  const pipeRole: "collector" | "ramal" = fromIsInlet || toIsInlet ? "ramal" : "collector";
  const minDn = pipeRole === "ramal" ? (cfg.lateralDiameterMm ?? 300) : cfg.minDiameterMm;
  const sized = suggestDiameterMm(0, slopePct, cfg.nManning, minDn);
  const index = listDrainagePipes(project).length;
  const code = padCode(pipeRole === "ramal" ? "RM" : "TB", index);
  const pipe: CadPolylineEntity = {
    id: newId("tb"),
    type: "polyline",
    layerId: DRENAGEM_TUBOS_LAYER.id,
    vertices: [
      { x: from.x, y: from.y, z: invertIn },
      { x: to.x, y: to.y, z: invertOut },
    ],
    closed: false,
    name: formatPipeLabel({ code, diameterMm: sized.diameterMm, lengthM, pipeRole }),
    drainage: {
      kind: "pipe",
      code,
      origin: "manual",
      pipeRole,
      fromPvId,
      toPvId,
      lengthM,
      slopePct,
      diameterMm: sized.diameterMm,
      invertInZ: invertIn,
      invertOutZ: invertOut,
      material: cfg.material,
      nManning: cfg.nManning,
      contribAreaHa: 0,
      qContribLps: 0,
      qCapacityLps: sized.capacityLps,
      velocityMs: sized.velocityMs,
      flowDepthRatio: sized.flowDepthRatio,
      status: sized.status,
    },
  };
  return {
    ...project,
    layers: ensureLayers(project),
    entities: [...project.entities, pipe],
  };
}

export function setDrainageOutfall(project: CadProject, pvId: string): CadProject {
  const pvs = listDrainagePvs(project);
  if (!pvs.some((p) => p.id === pvId)) throw new Error("Selecione um PV para o emissário.");
  return {
    ...project,
    layers: ensureLayers(project),
    entities: project.entities.map((e) => {
      if (!isDrainagePvEntity(e)) return e;
      const isOut = e.id === pvId;
      const prevKind = e.drainage?.kind ?? (e.layerId === DRENAGEM_BOCAS_LAYER.id ? "inlet" : "pv");
      const nextKind = isOut ? "outfall" : prevKind === "outfall" ? "pv" : prevKind;
      const code = e.drainage?.code ?? extractDrainageCodeFromLabel(e.label, "PV");
      const baseCode = extractDrainageCodeFromLabel(code, "PV");
      const invertZ = e.drainage?.invertZ ?? e.z - DEFAULT_DRAINAGE_PARAMS.minCoverM;
      const groundZ = e.drainage?.groundZ ?? e.z;
      return {
        ...e,
        layerId: isOut
          ? DRENAGEM_EMISSARIO_LAYER.id
          : nextKind === "inlet"
            ? DRENAGEM_BOCAS_LAYER.id
            : DRENAGEM_PV_LAYER.id,
        label: drainageNodeLabel(nextKind, baseCode, invertZ, groundZ),
        drainage: {
          ...(e.drainage ?? { kind: "pv" }),
          kind: nextKind,
          code: baseCode,
        },
      };
    }),
  };
}

export function deleteDrainagePv(project: CadProject, pvId: string): CadProject {
  return {
    ...project,
    entities: project.entities.filter((e) => {
      if (e.id === pvId) return false;
      if (e.type === "polyline" && e.layerId === DRENAGEM_TUBOS_LAYER.id && !e.closed) {
        return e.drainage?.fromPvId !== pvId && e.drainage?.toPvId !== pvId;
      }
      if (e.type === "polyline" && e.layerId === DRENAGEM_CONTRIB_LAYER.id) {
        const pv = listDrainagePvs(project).find((p) => p.id === pvId);
        const code = pv?.drainage?.code ?? pv?.label;
        if (code && (e.name ?? "").includes(code)) return false;
      }
      return true;
    }),
  };
}

export function deleteDrainagePipe(project: CadProject, pipeId: string): CadProject {
  return {
    ...project,
    entities: project.entities.filter((e) => e.id !== pipeId),
  };
}

export function moveDrainagePv(project: CadProject, pvId: string, x: number, y: number): CadProject {
  const reserva = listReservaRings(project);
  if (pointInAnyReserva(x, y, reserva)) return project;
  const samples = extractSurveyElevationPoints(project.entities);
  return {
    ...project,
    entities: project.entities.map((e) => {
      if (e.id === pvId && e.type === "point") {
        const groundZ = sampleGroundZ(x, y, e.z, samples);
        const invertZ = e.drainage?.invertZ ?? groundZ - DEFAULT_DRAINAGE_PARAMS.minCoverM;
        const kind = e.drainage?.kind === "outfall" ? "outfall" : e.drainage?.kind === "inlet" ? "inlet" : "pv";
        const code = e.drainage?.code ?? extractDrainageCodeFromLabel(e.label, "PV");
        return {
          ...e,
          x,
          y,
          z: groundZ,
          label: drainageNodeLabel(kind, code, invertZ, groundZ),
          drainage: {
            ...(e.drainage ?? { kind: "pv" }),
            groundZ,
            invertZ,
            coverDepthM: groundZ - invertZ,
          },
        };
      }
      if (isDrainagePipeEntity(e)) {
        const from = e.drainage?.fromPvId === pvId;
        const to = e.drainage?.toPvId === pvId;
        if (!from && !to) return e;
        const verts = e.vertices.map((v, i) => {
          const isEnd = i === e.vertices.length - 1;
          if ((from && i === 0) || (to && isEnd)) return { ...v, x, y };
          return v;
        });
        const a = verts[0];
        const b = verts[verts.length - 1];
        const lengthM = pipeLengthM(a.x, a.y, b.x, b.y);
        const slopePct = pipeSlopePct(
          e.drainage?.invertInZ ?? a.z,
          e.drainage?.invertOutZ ?? b.z,
          lengthM,
        );
        const drainage = {
          ...(e.drainage ?? { kind: "pipe" as const }),
          lengthM,
          slopePct,
        };
        return {
          ...e,
          vertices: verts,
          name: formatPipeLabel({
            code: drainage.code,
            diameterMm: drainage.diameterMm ?? 300,
            lengthM,
            pipeRole: drainage.pipeRole,
          }),
          drainage,
        };
      }
      return e;
    }),
  };
}

export function updateDrainagePipe(
  project: CadProject,
  pipeId: string,
  patch: Partial<{
    slopePct: number;
    diameterMm: number;
    invertInZ: number;
    invertOutZ: number;
    material: string;
    nManning: number;
    contribAreaHa: number;
    runoffC: number;
    intensityMmH: number;
    tcMin: number;
    existingPipe: boolean;
  }>,
): CadProject {
  return {
    ...project,
    entities: project.entities.map((e) => {
      if (e.id !== pipeId || !isDrainagePipeEntity(e)) return e;
      const a = e.vertices[0];
      const b = e.vertices[e.vertices.length - 1];
      const lengthM = pipeLengthM(a.x, a.y, b.x, b.y);
      const invertInZ = patch.invertInZ ?? e.drainage?.invertInZ ?? a.z;
      let invertOutZ = patch.invertOutZ ?? e.drainage?.invertOutZ ?? b.z;
      let slopePct = patch.slopePct ?? e.drainage?.slopePct ?? pipeSlopePct(invertInZ, invertOutZ, lengthM);
      if (patch.slopePct != null && lengthM > 1e-9) {
        invertOutZ = invertInZ - (patch.slopePct / 100) * lengthM;
        slopePct = patch.slopePct;
      }
      const material = patch.material ?? e.drainage?.material ?? DEFAULT_DRAINAGE_PARAMS.material;
      const nManning =
        patch.nManning ??
        DRAINAGE_MATERIALS[material] ??
        e.drainage?.nManning ??
        DEFAULT_DRAINAGE_PARAMS.nManning;
      const diameterMm = patch.diameterMm ?? e.drainage?.diameterMm ?? DEFAULT_DRAINAGE_PARAMS.minDiameterMm;
      const contribAreaHa = patch.contribAreaHa ?? e.drainage?.contribAreaHa ?? 0;
      const runoffC = patch.runoffC ?? e.drainage?.runoffC ?? DEFAULT_DRAINAGE_PARAMS.runoffC;
      const intensityMmH = patch.intensityMmH ?? e.drainage?.intensityMmH ?? DEFAULT_DRAINAGE_PARAMS.intensityMmH;
      const hydrologyChanged =
        patch.contribAreaHa != null || patch.runoffC != null || patch.intensityMmH != null;
      const qContribLps = hydrologyChanged
        ? rationalRunoffLps(runoffC, intensityMmH, contribAreaHa)
        : (e.drainage?.qContribLps ?? 0);
      const check = checkDrainageHydraulics(qContribLps, diameterMm, slopePct, nManning);
      const drainage: CadDrainageProps = {
        ...(e.drainage ?? { kind: "pipe" }),
        kind: "pipe",
        lengthM,
        slopePct,
        diameterMm,
        invertInZ,
        invertOutZ,
        material,
        nManning,
        contribAreaHa,
        runoffC,
        intensityMmH,
        qContribLps,
        qCapacityLps: check.capacityLps,
        velocityMs: check.velocityMs,
        flowDepthRatio: check.flowDepthRatio,
        tcMin: patch.tcMin ?? e.drainage?.tcMin,
        existingPipe: patch.existingPipe ?? e.drainage?.existingPipe,
        status: check.status,
      };
      return {
        ...e,
        vertices: [
          { ...a, z: invertInZ },
          { ...b, z: invertOutZ },
        ],
        name: formatPipeLabel({ code: drainage.code, diameterMm, lengthM, pipeRole: drainage.pipeRole }),
        drainage,
      };
    }),
  };
}

export function updateDrainagePv(
  project: CadProject,
  pvId: string,
  patch: Partial<{ invertZ: number; groundZ: number; label: string }>,
): CadProject {
  return {
    ...project,
    entities: project.entities.map((e) => {
      if (e.id !== pvId || e.type !== "point") return e;
      const groundZ = patch.groundZ ?? e.drainage?.groundZ ?? e.z;
      const invertZ = patch.invertZ ?? e.drainage?.invertZ ?? groundZ - DEFAULT_DRAINAGE_PARAMS.minCoverM;
      const code = extractDrainageCodeFromLabel(
        patch.label ?? e.drainage?.code ?? e.label ?? "PV",
        "PV",
      );
      const prevKind = e.drainage?.kind;
      const kind = prevKind === "outfall" ? "outfall" : prevKind === "inlet" ? "inlet" : "pv";
      return {
        ...e,
        z: groundZ,
        label: drainageNodeLabel(kind, code, invertZ, groundZ),
        drainage: {
          ...(e.drainage ?? { kind }),
          code,
          groundZ,
          invertZ,
          coverDepthM: groundZ - invertZ,
        },
      };
    }),
  };
}

function swmmLine(...campos: Array<string | number>): string {
  return campos.join("  ");
}

function swmmSections(conteudo: string): Map<string, string[]> {
  const secoes = new Map<string, string[]>();
  let atual = "";
  for (const linhaBruta of conteudo.split(/\r?\n/)) {
    const l = linhaBruta.trim();
    if (!l || l.startsWith(";")) continue;
    const m = l.match(/^\[(.+)\]$/);
    if (m) {
      atual = m[1].toUpperCase();
      secoes.set(atual, []);
      continue;
    }
    if (atual) secoes.get(atual)?.push(l);
  }
  return secoes;
}

function swmmFields(linha: string): string[] {
  return linha.split(/\s+/).filter(Boolean);
}

export function drainageSwmmFilename(project: CadProject): string {
  const base = (project.name || "drenagem").replace(/[^\w\-]+/g, "_");
  return `${base}_drenagem.inp`;
}

/** Exporta a rede CAD para .inp SWMM 5 (junções, condutos, sub-bacias, exutório). */
export function exportDrainageSwmmInp(
  project: CadProject,
  options: { titulo?: string; intensityMmH?: number; runoffC?: number } = {},
): string {
  const pvs = listDrainagePvs(project);
  const pipes = listDrainagePipes(project);
  if (pvs.length === 0) throw new Error("Não há PVs para exportar.");
  const outfalls = pvs.filter((pv) => pv.drainage?.kind === "outfall" || pv.layerId === DRENAGEM_EMISSARIO_LAYER.id);
  const junctions = pvs.filter((pv) => !outfalls.some((o) => o.id === pv.id));
  const fallbackOut = outfalls[0] ?? [...pvs].sort((a, b) => a.z - b.z)[0];
  const contribs = project.entities.filter(
    (e): e is CadPolylineEntity => e.type === "polyline" && e.layerId === DRENAGEM_CONTRIB_LAYER.id,
  );
  const intensity = options.intensityMmH ?? DEFAULT_DRAINAGE_PARAMS.intensityMmH;
  const runoffC = options.runoffC ?? DEFAULT_DRAINAGE_PARAMS.runoffC;
  const imperv = Math.round(((runoffC - 0.2) / 0.7) * 100);

  const partes: string[] = [];
  partes.push("[TITLE]");
  partes.push(options.titulo ?? `Rede de drenagem — ${project.name}`);
  partes.push("");
  partes.push("[OPTIONS]");
  partes.push(swmmLine("FLOW_UNITS", "CMS"));
  partes.push(swmmLine("INFILTRATION", "HORTON"));
  partes.push(swmmLine("ROUTING_MODEL", "KINWAVE"));
  partes.push("");
  partes.push("[RAINGAGES]");
  partes.push(";;Name  Format  Interval  SCF  Source");
  partes.push(swmmLine("RG1", "INTENSITY", "0:05", "1.0", "TIMESERIES", "TS_RG1"));
  partes.push("");
  partes.push("[SUBCATCHMENTS]");
  partes.push(";;Name  Raingage  Outlet  Area  %Imperv  Width  %Slope  CurbLen");
  if (contribs.length > 0) {
    for (const sb of contribs) {
      const areaHa = sb.drainage?.contribAreaHa ?? polygonAreaM2(sb.vertices, true) / 10_000;
      const outlet = sb.drainage?.code ?? fallbackOut.drainage?.code ?? fallbackOut.id;
      const width = Math.max(10, Math.sqrt(Math.max(areaHa, 0) * 10_000));
      partes.push(
        swmmLine(sb.id, "RG1", outlet, areaHa.toFixed(4), Math.max(0, Math.min(100, imperv)).toFixed(1), width.toFixed(1), "2.00", 0),
      );
    }
  } else {
    const areaHa = pipes.reduce((s, p) => s + (p.drainage?.contribAreaHa ?? 0), 0);
    partes.push(
      swmmLine("SB1", "RG1", fallbackOut.drainage?.code ?? fallbackOut.id, Math.max(areaHa, 0.01).toFixed(4), Math.max(0, Math.min(100, imperv)).toFixed(1), "50.0", "2.00", 0),
    );
  }
  partes.push("");
  partes.push("[SUBAREAS]");
  partes.push(";;Subcatchment  N-Imperv  N-Perv  S-Imperv  S-Perv  PctZero  RouteTo");
  const subIds = contribs.length > 0 ? contribs.map((c) => c.id) : ["SB1"];
  for (const id of subIds) partes.push(swmmLine(id, 0.013, 0.24, 1.27, 5.08, 25, "OUTLET"));
  partes.push("");
  partes.push("[INFILTRATION]");
  partes.push(";;Subcatchment  MaxRate  MinRate  Decay  DryTime  MaxInfil");
  for (const id of subIds) partes.push(swmmLine(id, 75, 13, 4, 7, 0));
  partes.push("");
  partes.push("[JUNCTIONS]");
  partes.push(";;Name  Elevation  MaxDepth  InitDepth  SurDepth  Aponded");
  const exportedOutfalls = outfalls.length > 0 ? outfalls : [fallbackOut];
  const junctionExport = junctions.filter((j) => !exportedOutfalls.some((o) => o.id === j.id));
  for (const j of junctionExport) {
    const code = (j.drainage?.code ?? j.label ?? j.id).replace(/\s*·\s*Emissário/, "").trim();
    const invert = j.drainage?.invertZ ?? j.z - DEFAULT_DRAINAGE_PARAMS.minCoverM;
    const maxDepth = Math.max(j.drainage?.coverDepthM ?? DEFAULT_DRAINAGE_PARAMS.minCoverM, 0.5) + 0.5;
    partes.push(swmmLine(code, invert.toFixed(3), maxDepth.toFixed(2), 0, 0, 0));
  }
  partes.push("");
  partes.push("[OUTFALLS]");
  partes.push(";;Name  Elevation  Type  StageData  Gated");
  for (const o of exportedOutfalls) {
    const code = (o.drainage?.code ?? o.label ?? o.id).replace(/\s*·\s*Emissário/, "").trim();
    const cota = o.drainage?.invertZ ?? o.z - DEFAULT_DRAINAGE_PARAMS.minCoverM;
    partes.push(swmmLine(code, cota.toFixed(3), "FREE", "", "NO"));
  }
  partes.push("");
  const codeOf = (id: string) => {
    const pv = pvs.find((p) => p.id === id);
    return (pv?.drainage?.code ?? pv?.label ?? id).replace(/\s*·\s*Emissário/, "").trim();
  };
  partes.push("[CONDUITS]");
  partes.push(";;Name  FromNode  ToNode  Length  Roughness  InOffset  OutOffset  InitFlow  MaxFlow");
  for (const c of pipes) {
    const code = c.drainage?.code ?? c.id;
    partes.push(
      swmmLine(
        code,
        codeOf(c.drainage?.fromPvId ?? ""),
        codeOf(c.drainage?.toPvId ?? ""),
        (c.drainage?.lengthM ?? pipeLengthM(c.vertices[0].x, c.vertices[0].y, c.vertices[c.vertices.length - 1].x, c.vertices[c.vertices.length - 1].y)).toFixed(2),
        (c.drainage?.nManning ?? DEFAULT_DRAINAGE_PARAMS.nManning).toFixed(4),
        0,
        0,
        0,
        0,
      ),
    );
  }
  partes.push("");
  partes.push("[XSECTIONS]");
  partes.push(";;Link  Shape  Geom1  Geom2  Geom3  Geom4");
  for (const c of pipes) {
    const dM = (c.drainage?.diameterMm ?? DEFAULT_DRAINAGE_PARAMS.minDiameterMm) / 1000;
    partes.push(swmmLine(c.drainage?.code ?? c.id, "CIRCULAR", dM.toFixed(3), 0, 0, 0));
  }
  partes.push("");
  partes.push("[COORDINATES]");
  partes.push(";;Node  X-Coord  Y-Coord");
  for (const pv of pvs) {
    const code = pv.drainage?.code ?? extractDrainageCodeFromLabel(pv.label, pv.id);
    partes.push(swmmLine(code, pv.x.toFixed(2), pv.y.toFixed(2)));
  }
  partes.push("");
  partes.push("[TIMESERIES]");
  partes.push(";;Name  Date  Time  Value");
  partes.push(swmmLine("TS_RG1", "0:00", intensity.toFixed(1)));
  partes.push(swmmLine("TS_RG1", "1:00", intensity.toFixed(1)));
  partes.push("");
  return partes.join("\n");
}

/** Importa .inp SWMM 5 como PVs/tubos manuais (não desenha sobre reserva legal nem APP). */
export function importDrainageSwmmInp(
  project: CadProject,
  conteudo: string,
  params: Partial<DrainageParams> = {},
): CadProject {
  const secoes = swmmSections(conteudo);
  if ((secoes.get("JUNCTIONS") ?? []).length === 0 && (secoes.get("OUTFALLS") ?? []).length === 0) {
    throw new Error("Arquivo .inp sem [JUNCTIONS] ou [OUTFALLS].");
  }
  const coordenadas = new Map<string, { x: number; y: number }>();
  for (const l of secoes.get("COORDINATES") ?? []) {
    const [id, x, y] = swmmFields(l);
    if (!id || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) continue;
    coordenadas.set(id, { x: Number(x), y: Number(y) });
  }
  if (coordenadas.size === 0) {
    throw new Error("Arquivo .inp sem [COORDINATES] — não é possível posicionar os PVs.");
  }

  const reserva = listReservaRings(project);
  const samples = extractSurveyElevationPoints(project.entities);
  const cfg: DrainageParams = { ...DEFAULT_DRAINAGE_PARAMS, ...params };

  const pvs: DraftPv[] = [];
  const addPv = (id: string, kind: "pv" | "outfall", invertZ: number, maxDepth: number) => {
    const xy = coordenadas.get(id);
    if (!xy) return;
    if (pointInAnyReserva(xy.x, xy.y, reserva)) return;
    const groundZ = sampleGroundZ(xy.x, xy.y, invertZ + (maxDepth || cfg.minCoverM), samples);
    pvs.push({
      id: newId("pv"),
      code: id,
      x: xy.x,
      y: xy.y,
      groundZ,
      invertZ,
      coverDepthM: groundZ - invertZ,
      stationM: 0,
      viaId: "",
      kind,
      origin: "manual",
    });
  };

  for (const l of secoes.get("JUNCTIONS") ?? []) {
    const [id, elev, maxDepth] = swmmFields(l);
    if (!id) continue;
    addPv(id, "pv", Number(elev) || 0, Number(maxDepth) || cfg.minCoverM);
  }
  for (const l of secoes.get("OUTFALLS") ?? []) {
    const [id, elev] = swmmFields(l);
    if (!id) continue;
    addPv(id, "outfall", Number(elev) || 0, cfg.minCoverM);
  }
  if (pvs.length < 1) {
    throw new Error("Nenhum nó do .inp pôde ser importado (coordenadas na reserva ou ausentes).");
  }

  const codeToId = new Map(pvs.map((p) => [p.code, p.id]));
  const diametros = new Map<string, number>();
  for (const l of secoes.get("XSECTIONS") ?? []) {
    const [link, , geom1] = swmmFields(l);
    if (link && Number.isFinite(Number(geom1))) diametros.set(link, Number(geom1) * 1000);
  }

  const undirected: Array<{ a: string; b: string; lengthM: number; diameterMm: number; nManning: number; code: string }> = [];
  for (const l of secoes.get("CONDUITS") ?? []) {
    const [id, from, to, length, roughness] = swmmFields(l);
    const fromId = codeToId.get(from);
    const toId = codeToId.get(to);
    if (!fromId || !toId || fromId === toId) continue;
    const a = pvs.find((p) => p.id === fromId);
    const b = pvs.find((p) => p.id === toId);
    if (!a || !b) continue;
    if (pipeIntersectsReserva(a.x, a.y, b.x, b.y, reserva)) continue;
    undirected.push({
      a: fromId,
      b: toId,
      lengthM: Number(length) || pipeLengthM(a.x, a.y, b.x, b.y),
      diameterMm: diametros.get(id) ?? cfg.minDiameterMm,
      nManning: Number(roughness) || cfg.nManning,
      code: id,
    });
  }

  const degree = new Map<string, number>();
  for (const pv of pvs) degree.set(pv.id, 0);
  for (const e of undirected) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }
  const outfall = pickOutfall(pvs, degree, pvs.find((p) => p.kind === "outfall")?.id);
  if (outfall) {
    for (const pv of pvs) pv.kind = pv.id === outfall.id ? "outfall" : "pv";
  }
  const oriented = outfall
    ? orientTowardOutfall(pvs, undirected, outfall.id)
    : undirected.map((e) => ({ fromId: e.a, toId: e.b, lengthM: e.lengthM }));
  const { byPv, polys } = contribAreas(project, pvs, reserva);
  const pipes = assignHydraulics(
    pvs,
    oriented.map((e) => {
      const raw = undirected.find((u) => (u.a === e.fromId && u.b === e.toId) || (u.a === e.toId && u.b === e.fromId));
      return { ...e, origin: "manual" as const, diameterMm: raw?.diameterMm, code: raw?.code };
    }),
    cfg,
    byPv,
    { keepDiameters: true },
  );
  const cleared: CadProject = { ...project, entities: project.entities.filter((e) => !isDrainageLayer(e.layerId)) };
  return commitNetwork(cleared, pvs, pipes, polys);
}

export function hitDrainagePvAtScreen(
  sx: number,
  sy: number,
  project: CadProject,
  worldToScreen: (x: number, y: number) => { sx: number; sy: number },
  tol = 12,
): CadPointEntity | null {
  let best: CadPointEntity | null = null;
  let bestD = tol;
  for (const pv of listDrainagePvs(project)) {
    const p = worldToScreen(pv.x, pv.y);
    const d = Math.hypot(p.sx - sx, p.sy - sy);
    if (d < bestD) {
      best = pv;
      bestD = d;
    }
  }
  return best;
}
