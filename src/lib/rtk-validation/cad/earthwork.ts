import tin from "@turf/tin";
import type { FeatureCollection, Point } from "geojson";
import { extractSurveyElevationPoints, type ElevationSample } from "./contour";
import { buildOdsBlob, type OdsSheet } from "../ods-writer";
import { formatCoordBr, pointInPolygon } from "./polygon-utils";
import { sampleAlignmentStations, type AlignmentStation } from "./profile";
import type { CadEntity, CadPointEntity, CadPolylineEntity, CadProject, CadVertex } from "./types";

export const STAKEOUT_LAYER = {
  id: "locacao",
  name: "LOCACAO_PROJETO",
  color: "#f97316",
  visible: true,
  locked: false,
} as const;

export const EARTHWORK_METHOD_HINT =
  "Método prismóide sobre triângulos TIN: volume = área × média das alturas (Z terreno − Z projeto) nos 3 vértices. Coordenadas E/N planas em metros (não tratar UTM como lat/lon). Polígono recorta os triângulos (Sutherland–Hodgman).";

export const STREET_EARTHWORK_METHOD_HINT =
  "Notas de serviço: estacas no eixo; seção-tipo horizontal na cota de projeto da estaca; área por trapézios na transversal; volume parcial pela média das áreas consecutivas × Δs.";

export type TinTriangle = {
  a: ElevationSample;
  b: ElevationSample;
  c: ElevationSample;
};

/** Plano z = p·E + q·N + r (metros). */
export type DesignPlane = {
  kind: "plane";
  p: number;
  q: number;
  r: number;
};

export type DesignSurface =
  | DesignPlane
  | { kind: "tin"; triangles: TinTriangle[]; samples: ElevationSample[] };

export type EarthworkVolumeResult = {
  cutM3: number;
  fillM3: number;
  netM3: number;
  areaM2: number;
  triangleCount: number;
  usedTriangleCount: number;
  method: string;
  designLabel: string;
};

export type StakeoutRow = {
  id: string;
  e: number;
  n: number;
  zTerrain: number;
  zDesign: number;
  cutM: number;
  fillM: number;
};

export type ServiceNoteRow = {
  stationM: number;
  offsetM: number;
  e: number;
  n: number;
  zTerrain: number;
  zDesign: number;
  cutM: number;
  fillM: number;
  sectionAreaCutM2: number;
  sectionAreaFillM2: number;
  partialCutM3: number;
  partialFillM3: number;
};

export type StreetEarthworkResult = {
  rows: ServiceNoteRow[];
  cutM3: number;
  fillM3: number;
  stationCount: number;
  method: string;
};

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function idwZ(x: number, y: number, samples: ElevationSample[], power = 2): number {
  let num = 0;
  let den = 0;
  for (const p of samples) {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < 1e-9) return p.z;
    const w = 1 / d ** power;
    num += w * p.z;
    den += w;
  }
  return den > 0 ? num / den : NaN;
}

export function triangleArea2D(a: ElevationSample, b: ElevationSample, c: ElevationSample): number {
  return Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
}

function signedRingArea(ring: CadVertex[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    sum += ring[i].x * ring[j].y - ring[j].x * ring[i].y;
  }
  return sum / 2;
}

function ensureCcw(ring: CadVertex[]): CadVertex[] {
  return signedRingArea(ring) >= 0 ? ring : [...ring].reverse();
}

function isLeftOf(p: ElevationSample, a: CadVertex, b: CadVertex): boolean {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= -1e-12;
}

function edgeIntersection(p: ElevationSample, q: ElevationSample, a: CadVertex, b: CadVertex): ElevationSample {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const den = dx * ey - dy * ex;
  const t = Math.abs(den) < 1e-15 ? 0 : ((a.x - p.x) * ey - (a.y - p.y) * ex) / den;
  const u = Math.max(0, Math.min(1, t));
  return { x: p.x + dx * u, y: p.y + dy * u, z: p.z + (q.z - p.z) * u };
}

function clipRingToEdge(subject: ElevationSample[], a: CadVertex, b: CadVertex): ElevationSample[] {
  if (subject.length === 0) return [];
  const out: ElevationSample[] = [];
  let prev = subject[subject.length - 1];
  let prevInside = isLeftOf(prev, a, b);
  for (const cur of subject) {
    const curInside = isLeftOf(cur, a, b);
    if (curInside) {
      if (!prevInside) out.push(edgeIntersection(prev, cur, a, b));
      out.push(cur);
    } else if (prevInside) {
      out.push(edgeIntersection(prev, cur, a, b));
    }
    prev = cur;
    prevInside = curInside;
  }
  return out;
}

/** Recorta um triângulo pelo polígono (Sutherland–Hodgman) em E/N. */
export function clipTriangleToPolygon(
  tri: TinTriangle,
  clip: CadVertex[],
): ElevationSample[] {
  if (clip.length < 3) return [tri.a, tri.b, tri.c];
  const ring = ensureCcw(clip);
  let subject: ElevationSample[] = [tri.a, tri.b, tri.c];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    subject = clipRingToEdge(subject, a, b);
    if (subject.length === 0) return [];
  }
  return subject;
}

function barycentric(
  tri: TinTriangle,
  x: number,
  y: number,
): { u: number; v: number; w: number } {
  const { a, b, c } = tri;
  const den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(den) < 1e-18) return { u: 1 / 3, v: 1 / 3, w: 1 / 3 };
  const u = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / den;
  const v = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / den;
  const w = 1 - u - v;
  return { u, v, w };
}

export function interpolateTinZ(triangles: TinTriangle[], x: number, y: number, fallback?: ElevationSample[]): number {
  for (const tri of triangles) {
    const { u, v, w } = barycentric(tri, x, y);
    if (u >= -1e-8 && v >= -1e-8 && w >= -1e-8) {
      return u * tri.a.z + v * tri.b.z + w * tri.c.z;
    }
  }
  if (fallback && fallback.length > 0) return idwZ(x, y, fallback);
  return NaN;
}

export function planeZ(plane: DesignPlane, x: number, y: number): number {
  return plane.p * x + plane.q * y + plane.r;
}

export function designZAt(surface: DesignSurface, x: number, y: number): number {
  if (surface.kind === "plane") return planeZ(surface, x, y);
  return interpolateTinZ(surface.triangles, x, y, surface.samples);
}

export function planeFromHorizontalZ(z: number): DesignPlane {
  return { kind: "plane", p: 0, q: 0, r: z };
}

/** Platô inclinado definido por 3 pontos (E, N, Z). */
export function planeFromThreePoints(p1: ElevationSample, p2: ElevationSample, p3: ElevationSample): DesignPlane {
  const ux = p2.x - p1.x;
  const uy = p2.y - p1.y;
  const uz = p2.z - p1.z;
  const vx = p3.x - p1.x;
  const vy = p3.y - p1.y;
  const vz = p3.z - p1.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  if (Math.abs(nz) < 1e-12) {
    throw new Error("Os 3 pontos não definem um plano com cota única (alinhados ou plano vertical).");
  }
  return {
    kind: "plane",
    p: -nx / nz,
    q: -ny / nz,
    r: p1.z + (nx * p1.x + ny * p1.y) / nz,
  };
}

/**
 * Platô inclinado por rumo (azimute do strike, 0 = norte) e declive (dip, graus).
 * O declive desce na direção strike + 90°. Origem (x0,y0) tem cota z0.
 */
export function planeFromStrikeDip(
  origin: ElevationSample,
  strikeDeg: number,
  dipDeg: number,
): DesignPlane {
  const dipAz = ((strikeDeg + 90) * Math.PI) / 180;
  const slope = Math.tan((dipDeg * Math.PI) / 180);
  const ux = Math.sin(dipAz);
  const uy = Math.cos(dipAz);
  return {
    kind: "plane",
    p: -slope * ux,
    q: -slope * uy,
    r: origin.z + slope * ux * origin.x + slope * uy * origin.y,
  };
}

/** Duas cotas ao longo de um eixo: plano constante na perpendicular ao eixo. */
export function planeFromTwoElevations(a: ElevationSample, b: ElevationSample): DesignPlane {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) throw new Error("Os dois pontos do platô inclinado coincidem.");
  const azAb = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  const dipDeg = (Math.atan2(a.z - b.z, len) * 180) / Math.PI;
  return planeFromStrikeDip(a, azAb - 90, dipDeg);
}

export function buildTinTriangles(samples: ElevationSample[]): TinTriangle[] {
  if (samples.length < 3) {
    throw new Error("São necessários pelo menos 3 pontos com cota para o MDT/TIN.");
  }
  const fc: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: samples.map((p, i) => ({
      type: "Feature",
      properties: { z: p.z, name: `T${i + 1}` },
      geometry: { type: "Point", coordinates: [p.x, p.y] },
    })),
  };
  const tinFc = tin(fc, "z");
  const triangles: TinTriangle[] = [];
  for (const feature of tinFc.features) {
    const ring = feature.geometry.coordinates[0] as number[][];
    if (!ring || ring.length < 4) continue;
    const zs = [feature.properties?.a, feature.properties?.b, feature.properties?.c] as Array<
      number | undefined
    >;
    const a: ElevationSample = { x: ring[0][0], y: ring[0][1], z: zs[0] ?? 0 };
    const b: ElevationSample = { x: ring[1][0], y: ring[1][1], z: zs[1] ?? 0 };
    const c: ElevationSample = { x: ring[2][0], y: ring[2][1], z: zs[2] ?? 0 };
    if (triangleArea2D(a, b, c) < 1e-8) continue;
    triangles.push({ a, b, c });
  }
  if (triangles.length === 0) {
    throw new Error("Não foi possível triangular os pontos (verifique se não estão colineares).");
  }
  return triangles;
}

function fanTriangles(poly: ElevationSample[]): Array<[ElevationSample, ElevationSample, ElevationSample]> {
  if (poly.length < 3) return [];
  const out: Array<[ElevationSample, ElevationSample, ElevationSample]> = [];
  for (let i = 1; i < poly.length - 1; i++) {
    out.push([poly[0], poly[i], poly[i + 1]]);
  }
  return out;
}

function addPrismoid(
  acc: { cut: number; fill: number; area: number; used: number },
  a: ElevationSample,
  b: ElevationSample,
  c: ElevationSample,
  ha: number,
  hb: number,
  hc: number,
) {
  const area = triangleArea2D(a, b, c);
  if (area < 1e-10) return;
  const mean = (ha + hb + hc) / 3;
  const vol = area * mean;
  if (vol > 0) acc.cut += vol;
  else acc.fill += -vol;
  acc.area += area;
  acc.used += 1;
}

export function computeEarthworkVolume(input: {
  terrainSamples: ElevationSample[];
  design: DesignSurface;
  clipPolygon?: CadVertex[] | null;
  designLabel?: string;
}): EarthworkVolumeResult {
  const triangles = buildTinTriangles(input.terrainSamples);
  const acc = { cut: 0, fill: 0, area: 0, used: 0 };
  const clip = input.clipPolygon && input.clipPolygon.length >= 3 ? input.clipPolygon : null;

  for (const tri of triangles) {
    const pieces = clip ? fanTriangles(clipTriangleToPolygon(tri, clip)) : [[tri.a, tri.b, tri.c] as const];
    for (const [a, b, c] of pieces) {
      const ha = a.z - designZAt(input.design, a.x, a.y);
      const hb = b.z - designZAt(input.design, b.x, b.y);
      const hc = c.z - designZAt(input.design, c.x, c.y);
      if (![ha, hb, hc].every((h) => Number.isFinite(h))) continue;
      addPrismoid(acc, a, b, c, ha, hb, hc);
    }
  }

  return {
    cutM3: acc.cut,
    fillM3: acc.fill,
    netM3: acc.cut - acc.fill,
    areaM2: acc.area,
    triangleCount: triangles.length,
    usedTriangleCount: acc.used,
    method: EARTHWORK_METHOD_HINT,
    designLabel: input.designLabel ?? "projeto",
  };
}

export function extractElevationPointsFromLayer(entities: CadEntity[], layerId: string): ElevationSample[] {
  return entities
    .filter((e): e is CadPointEntity => e.type === "point" && e.layerId === layerId)
    .map((p) => ({ x: p.x, y: p.y, z: p.z }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
}

export function listElevationPointLayers(
  project: CadProject,
): Array<{ id: string; name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const e of project.entities) {
    if (e.type !== "point" || !Number.isFinite(e.z)) continue;
    counts.set(e.layerId, (counts.get(e.layerId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .map(([id, count]) => ({
      id,
      name: project.layers.find((l) => l.id === id)?.name ?? id,
      count,
    }));
}

export function designSurfaceFromLayer(project: CadProject, layerId: string): DesignSurface {
  const samples = extractElevationPointsFromLayer(project.entities, layerId);
  if (samples.length < 3) {
    throw new Error("A camada do MDT de projeto precisa de pelo menos 3 pontos com cota.");
  }
  return { kind: "tin", triangles: buildTinTriangles(samples), samples };
}

function zTerrainAt(triangles: TinTriangle[], samples: ElevationSample[], x: number, y: number): number {
  const z = interpolateTinZ(triangles, x, y, samples);
  return Number.isFinite(z) ? z : 0;
}

export function buildStakeoutRows(input: {
  terrainSamples: ElevationSample[];
  design: DesignSurface;
  clipPolygon?: CadVertex[] | null;
  gridStepM?: number;
}): StakeoutRow[] {
  const triangles = buildTinTriangles(input.terrainSamples);
  const rows: StakeoutRow[] = [];
  const seen = new Set<string>();
  const push = (x: number, y: number) => {
    const key = `${x.toFixed(3)}|${y.toFixed(3)}`;
    if (seen.has(key)) return;
    if (input.clipPolygon && input.clipPolygon.length >= 3 && !pointInPolygon(x, y, input.clipPolygon)) {
      return;
    }
    seen.add(key);
    const zT = zTerrainAt(triangles, input.terrainSamples, x, y);
    const zD = designZAt(input.design, x, y);
    if (!Number.isFinite(zD)) return;
    const dh = zT - zD;
    rows.push({
      id: `L${String(rows.length + 1).padStart(3, "0")}`,
      e: x,
      n: y,
      zTerrain: zT,
      zDesign: zD,
      cutM: dh > 0 ? dh : 0,
      fillM: dh < 0 ? -dh : 0,
    });
  };

  if (input.clipPolygon && input.clipPolygon.length >= 3) {
    for (const v of input.clipPolygon) push(v.x, v.y);
  } else {
    for (const p of input.terrainSamples) push(p.x, p.y);
  }

  const step = input.gridStepM ?? 0;
  if (step > 0) {
    const pts = input.clipPolygon && input.clipPolygon.length >= 3 ? input.clipPolygon : input.terrainSamples;
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    for (let x = minX; x <= maxX + 1e-9; x += step) {
      for (let y = minY; y <= maxY + 1e-9; y += step) {
        push(x, y);
      }
    }
  }

  return rows;
}

export function stakeoutEntities(rows: StakeoutRow[]): CadPointEntity[] {
  return rows.map((row) => ({
    id: newId("loc"),
    type: "point",
    layerId: STAKEOUT_LAYER.id,
    x: row.e,
    y: row.n,
    z: row.zDesign,
    label: `${row.id} C${row.cutM.toFixed(2)}/A${row.fillM.toFixed(2)}`,
  }));
}

export function removeStakeoutEntities(entities: CadEntity[]): CadEntity[] {
  return entities.filter((e) => e.layerId !== STAKEOUT_LAYER.id);
}

function sectionAreas(
  station: AlignmentStation,
  halfWidthM: number,
  sampleCount: number,
  zTerrain: (x: number, y: number) => number,
  zDesign: (stationM: number, x: number, y: number) => number,
): { cut: number; fill: number; samples: Array<{ offset: number; x: number; y: number; zT: number; zD: number }> } {
  const px = -station.dirY;
  const py = station.dirX;
  const samples: Array<{ offset: number; x: number; y: number; zT: number; zD: number }> = [];
  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount;
    const offset = -halfWidthM + 2 * halfWidthM * t;
    const x = station.x + px * offset;
    const y = station.y + py * offset;
    const zT = zTerrain(x, y);
    const zD = zDesign(station.stationM, x, y);
    samples.push({ offset, x, y, zT, zD });
  }
  let cut = 0;
  let fill = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const ds = b.offset - a.offset;
    const hA = a.zT - a.zD;
    const hB = b.zT - b.zD;
    const cutA = Math.max(0, hA);
    const cutB = Math.max(0, hB);
    const fillA = Math.max(0, -hA);
    const fillB = Math.max(0, -hB);
    cut += ((cutA + cutB) / 2) * ds;
    fill += ((fillA + fillB) / 2) * ds;
  }
  return { cut, fill, samples };
}

export function computeStreetEarthwork(input: {
  alignment: CadVertex[];
  terrainSamples: ElevationSample[];
  intervalM: number;
  halfWidthM: number;
  /** Cota de projeto no início do eixo. */
  zStart: number;
  /** Cota de projeto no fim do eixo. */
  zEnd: number;
  offsets?: number[];
}): StreetEarthworkResult {
  if (input.alignment.length < 2) {
    throw new Error("Selecione a polilinha do eixo (arruamento) com pelo menos 2 vértices.");
  }
  if (input.terrainSamples.length < 3) {
    throw new Error("São necessários pelo menos 3 pontos com cota para o terreno.");
  }
  const triangles = buildTinTriangles(input.terrainSamples);
  const length = Math.max(
    1e-6,
    input.alignment.reduce((acc, v, i, arr) => {
      if (i === 0) return 0;
      return acc + Math.hypot(v.x - arr[i - 1].x, v.y - arr[i - 1].y);
    }, 0),
  );
  const stations = sampleAlignmentStations(input.alignment, input.intervalM);
  const half = Math.max(0.1, input.halfWidthM);
  const zTerrain = (x: number, y: number) => zTerrainAt(triangles, input.terrainSamples, x, y);
  const zDesign = (stationM: number) => input.zStart + (input.zEnd - input.zStart) * (stationM / length);

  const sectionStats = stations.map((st) => {
    const areas = sectionAreas(st, half, 16, zTerrain, (s) => zDesign(s));
    return { station: st, ...areas, zD: zDesign(st.stationM) };
  });

  const offsets =
    input.offsets ??
    Array.from(new Set([-half, -half / 2, 0, half / 2, half].map((v) => Number(v.toFixed(4)))));

  const rows: ServiceNoteRow[] = [];
  let cutM3 = 0;
  let fillM3 = 0;

  for (let i = 0; i < sectionStats.length; i++) {
    const cur = sectionStats[i];
    let dCut = 0;
    let dFill = 0;
    if (i > 0) {
      const prev = sectionStats[i - 1];
      const ds = cur.station.stationM - prev.station.stationM;
      dCut = ((prev.cut + cur.cut) / 2) * ds;
      dFill = ((prev.fill + cur.fill) / 2) * ds;
      cutM3 += dCut;
      fillM3 += dFill;
    }
    for (const offset of offsets) {
      const px = -cur.station.dirY;
      const py = cur.station.dirX;
      const x = cur.station.x + px * offset;
      const y = cur.station.y + py * offset;
      const zT = zTerrain(x, y);
      const zD = cur.zD;
      const dh = zT - zD;
      rows.push({
        stationM: cur.station.stationM,
        offsetM: offset,
        e: x,
        n: y,
        zTerrain: zT,
        zDesign: zD,
        cutM: dh > 0 ? dh : 0,
        fillM: dh < 0 ? -dh : 0,
        sectionAreaCutM2: offset === 0 ? cur.cut : 0,
        sectionAreaFillM2: offset === 0 ? cur.fill : 0,
        partialCutM3: offset === 0 ? dCut : 0,
        partialFillM3: offset === 0 ? dFill : 0,
      });
    }
  }

  return {
    rows,
    cutM3,
    fillM3,
    stationCount: stations.length,
    method: STREET_EARTHWORK_METHOD_HINT,
  };
}

export function formatVolumeM3(m3: number): string {
  return `${formatCoordBr(m3, 2)} m³`;
}

function projectSlug(project: CadProject): string {
  return (project.name || "volumetria").replace(/[^\w\-]+/g, "_").slice(0, 60);
}

export function volumeOdsFilename(project: CadProject): string {
  return `${projectSlug(project)}_volume.ods`;
}

export function stakeoutOdsFilename(project: CadProject): string {
  return `${projectSlug(project)}_locacao.ods`;
}

export function serviceNotesOdsFilename(project: CadProject): string {
  return `${projectSlug(project)}_notas_servico.ods`;
}

export function volumeSummarySheets(result: EarthworkVolumeResult): OdsSheet[] {
  return [
    {
      name: "Volume",
      rows: [
        ["Corte (m³)", Number(result.cutM3.toFixed(4))],
        ["Aterro (m³)", Number(result.fillM3.toFixed(4))],
        ["Líquido corte−aterro (m³)", Number(result.netM3.toFixed(4))],
        ["Área (m²)", Number(result.areaM2.toFixed(4))],
        ["Triângulos TIN", result.triangleCount],
        ["Triângulos usados", result.usedTriangleCount],
        ["Superfície de projeto", result.designLabel],
        ["Método", result.method],
      ],
    },
  ];
}

export function stakeoutSheets(rows: StakeoutRow[]): OdsSheet[] {
  const body: (string | number)[][] = [
    ["Ponto", "E (m)", "N (m)", "Z terreno (m)", "Z projeto (m)", "Corte (m)", "Aterro (m)"],
  ];
  for (const row of rows) {
    body.push([
      row.id,
      Number(row.e.toFixed(4)),
      Number(row.n.toFixed(4)),
      Number(row.zTerrain.toFixed(4)),
      Number(row.zDesign.toFixed(4)),
      Number(row.cutM.toFixed(4)),
      Number(row.fillM.toFixed(4)),
    ]);
  }
  return [{ name: "Locacao", rows: body }];
}

export function serviceNotesSheets(result: StreetEarthworkResult): OdsSheet[] {
  const body: (string | number)[][] = [
    [
      "Estaca (m)",
      "Offset (m)",
      "E (m)",
      "N (m)",
      "Z terreno (m)",
      "Z projeto (m)",
      "Corte (m)",
      "Aterro (m)",
      "Área seção corte (m²)",
      "Área seção aterro (m²)",
      "Vol. parcial corte (m³)",
      "Vol. parcial aterro (m³)",
    ],
  ];
  for (const row of result.rows) {
    body.push([
      Number(row.stationM.toFixed(3)),
      Number(row.offsetM.toFixed(3)),
      Number(row.e.toFixed(4)),
      Number(row.n.toFixed(4)),
      Number(row.zTerrain.toFixed(4)),
      Number(row.zDesign.toFixed(4)),
      Number(row.cutM.toFixed(4)),
      Number(row.fillM.toFixed(4)),
      Number(row.sectionAreaCutM2.toFixed(4)),
      Number(row.sectionAreaFillM2.toFixed(4)),
      Number(row.partialCutM3.toFixed(4)),
      Number(row.partialFillM3.toFixed(4)),
    ]);
  }
  const resumo: (string | number)[][] = [
    ["Corte total (m³)", Number(result.cutM3.toFixed(4))],
    ["Aterro total (m³)", Number(result.fillM3.toFixed(4))],
    ["Estacas", result.stationCount],
    ["Método", result.method],
  ];
  return [
    { name: "Notas_servico", rows: body },
    { name: "Resumo", rows: resumo },
  ];
}

export function buildVolumeOdsBlob(result: EarthworkVolumeResult): Blob {
  return buildOdsBlob(volumeSummarySheets(result), "Volume terraplanagem");
}

export function buildStakeoutOdsBlob(rows: StakeoutRow[]): Blob {
  return buildOdsBlob(stakeoutSheets(rows), "Projeto de locação");
}

export function buildServiceNotesOdsBlob(result: StreetEarthworkResult): Blob {
  return buildOdsBlob(serviceNotesSheets(result), "Notas de serviço");
}

export function sheetsToCsv(sheets: OdsSheet[]): string {
  return sheets
    .map((sheet) => {
      const lines = sheet.rows.map((row) =>
        row
          .map((cell) => {
            const text = cell == null ? "" : String(cell);
            if (/[;"\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
            return text.replace(".", ",");
          })
          .join(";"),
      );
      return [sheet.name, ...lines].join("\n");
    })
    .join("\n\n");
}

export function findAlignmentPolyline(
  entities: CadEntity[],
  selectedId: string | null,
): CadPolylineEntity | null {
  if (selectedId) {
    const entity = entities.find((e) => e.id === selectedId);
    if (entity?.type === "polyline" && entity.vertices.length >= 2 && !entity.closed) {
      return entity;
    }
    if (entity?.type === "polyline" && entity.vertices.length >= 2) return entity;
  }
  return (
    entities.find(
      (e): e is CadPolylineEntity =>
        e.type === "polyline" && e.vertices.length >= 2 && !e.closed && e.layerId !== "contours",
    ) ?? null
  );
}

export function meanElevation(samples: ElevationSample[]): number {
  if (samples.length === 0) return 0;
  return samples.reduce((s, p) => s + p.z, 0) / samples.length;
}
