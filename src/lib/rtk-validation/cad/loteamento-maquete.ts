import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";
import { polygonCentroid } from "./ai-geometry-utils";
import { AREA_RESERVA_LEGAL_LAYER_ID } from "./loteamento-tools";
import { polygonAreaM2 } from "./polygon-utils";
import {
  LOTEAMENTO_CALCADAS_LAYER_ID,
  LOTEAMENTO_EIXOS_LAYER_ID,
  LOTEAMENTO_LOTES_LAYER_ID,
  LOTEAMENTO_VIAS_LAYER_ID,
} from "./reurb";
import type { CadPolylineEntity, CadProject } from "./types";

const M_TO_DEG = 1 / 111_320;
const SLIVER_M2 = 1.5;
const MAX_TREES = 320;
const MAX_HOUSES = 32;
const MAX_CURB_SEGMENTS = 2200;
const MAX_SIDEWALK_TREES = 22;
const MAX_PEOPLE = 28;
const MAX_CARS = 16;
const MAX_EIXO_DASHES = 720;
const MAX_PALMS = 36;
const DEFAULT_CALCADA_M = 2;
const DEFAULT_MEIO_FIO_M = 0.15;
const CURB_WIDTH_M = 0.18;
const SIDEWALK_TREE_SPACING_M = 32;
const PERSON_SPACING_M = 18;
const CAR_SPACING_M = 24;
const MIN_AVENUE_WIDTH_M = 12.8;
const MIN_AVENUE_LENGTH_M = 48;
const MEDIAN_WIDTH_M = 1.15;
const PALM_SPACING_M = 10.5;
const EIXO_DASH_M = 2.6;
const EIXO_GAP_M = 1.7;
const EIXO_WIDTH_M = 0.2;

/** Lots use a tiled procedural lawn (blades + patches), not a flat plastic green. */
export const MAQUETE_GRASS_MATERIAL = true;
/** Ground/sky beyond the gleba is a black void — no infinite lawn or satellite. */
export const MAQUETE_GLEBA_CLIP = true;
export const MAQUETE_GRASS_TILE_M = 2.4;
export const MAQUETE_GRASS_TEXTURE_SIZE = 256;

export type MaqueteRing = Position[];

export type MaquetePoly = {
  outer: MaqueteRing;
  holes: MaqueteRing[];
};

export type MaqueteHouseStyle = "pitched" | "modern";

export type MaqueteHouse = {
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  style: MaqueteHouseStyle;
  wallHue: number;
  roofHue: number;
};

export type MaqueteLot = {
  ring: MaqueteRing;
  name?: string;
  padHue: number;
  house: MaqueteHouse | null;
};

export type MaqueteCurb = {
  x: number;
  y: number;
  length: number;
  width: number;
  height: number;
  rotation: number;
};

export type MaqueteTree = {
  x: number;
  y: number;
  scale: number;
  kind: "broad" | "conifer" | "palm";
};

export type MaqueteStreetLabel = {
  x: number;
  y: number;
  text: string;
  rotation: number;
};

export type MaquetePerson = {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  hue: number;
  walking: boolean;
};

export type MaqueteCar = {
  x: number;
  y: number;
  rotation: number;
  hue: number;
  length: number;
  width: number;
};

export type MaqueteBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type LoteamentoMaqueteScene = {
  origin: { x: number; y: number };
  bounds: MaqueteBounds;
  extentM: number;
  asphalt: MaquetePoly[];
  sidewalks: MaquetePoly[];
  curbs: MaqueteCurb[];
  lots: MaqueteLot[];
  /** Union of vias + lots + reserva — interior of the loteamento. */
  gleba: MaquetePoly[];
  reserva: MaquetePoly[];
  eixos: MaqueteRing[];
  eixoDashes: MaqueteCurb[];
  medians: MaqueteCurb[];
  trees: MaqueteTree[];
  sidewalkTrees: MaqueteTree[];
  medianPalms: MaqueteTree[];
  people: MaquetePerson[];
  cars: MaqueteCar[];
  streetLabels: MaqueteStreetLabel[];
  hasVias: boolean;
  hasLotes: boolean;
  hasReserva: boolean;
  usedFallbackSidewalk: boolean;
};

export type LoteamentoMaqueteReadiness = {
  ok: boolean;
  hasVias: boolean;
  hasLotes: boolean;
  hasReserva: boolean;
};

export type BuildLoteamentoMaqueteOptions = {
  calcadaM?: number;
  meioFioM?: number;
  maxTrees?: number;
  maxSidewalkTrees?: number;
  maxPeople?: number;
  maxCars?: number;
};

function closedOnLayer(project: CadProject, layerId: string): CadPolylineEntity[] {
  return project.entities.filter(
    (e): e is CadPolylineEntity =>
      e.type === "polyline" && Boolean(e.closed) && e.vertices.length >= 3 && e.layerId === layerId,
  );
}

function polyToRing(entity: CadPolylineEntity): MaqueteRing {
  return entity.vertices.map((v) => [v.x, v.y] as Position);
}

function dropClosing(ring: Position[]): Position[] {
  if (ring.length < 2) return ring;
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
  return ring;
}

function closeRing(ring: Position[]): Position[] {
  const open = dropClosing(ring);
  if (open.length === 0) return open;
  const first = open[0]!;
  return [...open, [first[0], first[1]]];
}

function originOf(ring: Position[]): Position {
  const pts = dropClosing(ring);
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p[0]!;
    sy += p[1]!;
  }
  const n = Math.max(pts.length, 1);
  return [sx / n, sy / n];
}

function toGeo(p: Position, origin: Position): Position {
  return [(p[0]! - origin[0]!) * M_TO_DEG, (p[1]! - origin[1]!) * M_TO_DEG];
}

function fromGeo(p: Position, origin: Position): Position {
  return [p[0]! / M_TO_DEG + origin[0]!, p[1]! / M_TO_DEG + origin[1]!];
}

function planarAreaM2(ring: Position[]): number {
  const pts = dropClosing(ring);
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i]![0]! * pts[j]![1]! - pts[j]![0]! * pts[i]![1]!;
  }
  return Math.abs(sum) / 2;
}

function signedArea(ring: Position[]): number {
  const pts = dropClosing(ring);
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i]![0]! * pts[j]![1]! - pts[j]![0]! * pts[i]![1]!;
  }
  return sum / 2;
}

function expandBounds(bounds: MaqueteBounds, ring: Position[]): void {
  for (const p of ring) {
    const x = p[0]!;
    const y = p[1]!;
    if (x < bounds.minX) bounds.minX = x;
    if (y < bounds.minY) bounds.minY = y;
    if (x > bounds.maxX) bounds.maxX = x;
    if (y > bounds.maxY) bounds.maxY = y;
  }
}

function ringFromGeo(coords: Position[], origin: Position): Position[] {
  return dropClosing(coords.map((p) => fromGeo(p, origin)));
}

function flattenPoly(
  feat: Feature<Polygon | MultiPolygon> | null | undefined,
  origin: Position,
): Position[][] {
  return flattenPolyDetailed(feat, origin).map((p) => p.outer);
}

function flattenPolyDetailed(
  feat: Feature<Polygon | MultiPolygon> | null | undefined,
  origin: Position,
): MaquetePoly[] {
  if (!feat?.geometry) return [];
  const geom = feat.geometry;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const out: MaquetePoly[] = [];
  for (const poly of polys) {
    const outerRaw = poly[0];
    if (!outerRaw || outerRaw.length < 4) continue;
    const outer = ringFromGeo(outerRaw, origin);
    if (outer.length < 3 || planarAreaM2(outer) < SLIVER_M2) continue;
    const holes = poly
      .slice(1)
      .map((h) => ringFromGeo(h, origin))
      .filter((h) => h.length >= 3 && planarAreaM2(h) >= SLIVER_M2);
    out.push({ outer, holes });
  }
  return out;
}

function asPolys(rings: Position[][]): MaquetePoly[] {
  return rings.filter((r) => dropClosing(r).length >= 3).map((outer) => ({ outer, holes: [] }));
}

function asTurfPolygon(ring: Position[], origin: Position): Feature<Polygon> {
  return turf.polygon([closeRing(ring).map((p) => toGeo(p, origin))]);
}

function bufferRings(rings: Position[][], distanceM: number): Position[][] {
  const out: Position[][] = [];
  for (const ring of rings) {
    const pts = dropClosing(ring);
    if (pts.length < 3) continue;
    const origin = originOf(pts);
    try {
      const feat = asTurfPolygon(pts, origin);
      const buffered = turf.buffer(feat, distanceM, { units: "meters", steps: 12 });
      out.push(...flattenPoly(buffered as Feature<Polygon | MultiPolygon> | null, origin));
    } catch {
      /* keep going */
    }
  }
  return out;
}

function differencePolys(subjects: Position[][], obstacles: Position[][]): MaquetePoly[] {
  if (obstacles.length === 0) return asPolys(subjects);
  const out: MaquetePoly[] = [];
  for (const ring of subjects) {
    const pts = dropClosing(ring);
    if (pts.length < 3) continue;
    const origin = originOf(pts);
    try {
      let current: Feature<Polygon | MultiPolygon> | null = asTurfPolygon(pts, origin);
      for (const obs of obstacles) {
        const obsPts = dropClosing(obs);
        if (obsPts.length < 3 || !current) continue;
        const cut = asTurfPolygon(obsPts, origin);
        current = turf.difference(turf.featureCollection([current, cut])) as Feature<
          Polygon | MultiPolygon
        > | null;
      }
      if (current) out.push(...flattenPolyDetailed(current, origin));
    } catch {
      out.push({ outer: pts, holes: [] });
    }
  }
  return out;
}

function pointInRing(x: number, y: number, ring: Position[]): boolean {
  const pts = dropClosing(ring);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i]![0]!;
    const yi = pts[i]![1]!;
    const xj = pts[j]![0]!;
    const yj = pts[j]![1]!;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-18) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToRing(x: number, y: number, ring: Position[]): number {
  const pts = dropClosing(ring);
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const vx = b[0]! - a[0]!;
    const vy = b[1]! - a[1]!;
    const len2 = vx * vx + vy * vy;
    let t = 0;
    if (len2 > 1e-12) t = Math.max(0, Math.min(1, ((x - a[0]!) * vx + (y - a[1]!) * vy) / len2));
    const d = Math.hypot(x - (a[0]! + t * vx), y - (a[1]! + t * vy));
    if (d < best) best = d;
  }
  return best;
}

function hash01(x: number, y: number, salt = 0): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

function tileNoise(x: number, y: number, size: number, freq: number, salt: number): number {
  const u = (x / size) * Math.PI * 2 * freq;
  const v = (y / size) * Math.PI * 2 * freq;
  return 0.5 + 0.5 * Math.sin(u + salt) * Math.cos(v - salt * 0.7);
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Seamless RGB lawn tile: high-contrast blades and patches (reads as grass, not flat dirt). */
export function createMaqueteGrassTextureData(size = MAQUETE_GRASS_TEXTURE_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const patch =
        0.38 * tileNoise(x, y, size, 2, 0.2) +
        0.34 * tileNoise(x, y, size, 5, 1.1) +
        0.28 * tileNoise(x, y, size, 13, 2.4);
      const sway = Math.sin((y / size) * Math.PI * 2 * 7) * 3.4;
      const col = (x + sway + size) % size;
      const bladeA = Math.abs(Math.sin((col / size) * Math.PI * 68));
      const bladeB = Math.abs(Math.sin((col / size) * Math.PI * 118 + 1.15));
      const blade = Math.pow(bladeA * 0.62 + bladeB * 0.38, 1.55);
      const soil = hash01(x, y, 9) > 0.984 ? 0.55 : 1;
      const r = (32 + patch * 58 + blade * 95) * soil + (soil < 1 ? 42 : 0);
      const g = (82 + patch * 64 + blade * 145) * soil + (soil < 1 ? 38 : 0);
      const b = (20 + patch * 24 + blade * 38) * soil + (soil < 1 ? 18 : 0);
      const i = (y * size + x) * 4;
      data[i] = clampByte(r);
      data[i + 1] = clampByte(g);
      data[i + 2] = clampByte(b);
      data[i + 3] = 255;
    }
  }
  return data;
}

/** High roughness with slight blade variation so the lawn stays matte, not plastic. */
export function createMaqueteGrassRoughnessData(size = MAQUETE_GRASS_TEXTURE_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sway = Math.sin((y / size) * Math.PI * 2 * 4) * 2.1;
      const col = (x + sway + size) % size;
      const blade = Math.abs(Math.sin((col / size) * Math.PI * 52));
      const patch = tileNoise(x, y, size, 5, 1.1);
      const gray = clampByte(208 + blade * 32 + patch * 12);
      const i = (y * size + x) * 4;
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
      data[i + 3] = 255;
    }
  }
  return data;
}

export function maqueteGrassTextureHasVariation(data: Uint8Array): boolean {
  if (data.length < 16) return false;
  let minG = 255;
  let maxG = 0;
  let minR = 255;
  let maxR = 0;
  let sumG = 0;
  let pixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    if (g < minG) minG = g;
    if (g > maxG) maxG = g;
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    sumG += g;
    pixels += 1;
  }
  const avgG = pixels > 0 ? sumG / pixels : 0;
  return maxG - minG >= 48 && maxG > maxR && maxG >= 190 && avgG >= 100 && avgG <= 210;
}

function unionMaqueteRings(rings: Position[][]): MaquetePoly[] {
  const valid = rings
    .map(dropClosing)
    .filter((r) => r.length >= 3 && planarAreaM2(r) >= SLIVER_M2);
  if (valid.length === 0) return [];
  if (valid.length === 1) return asPolys(valid);

  const origin = originOf(valid[0]!);
  const feats: Feature<Polygon>[] = [];
  for (const ring of valid) {
    try {
      feats.push(asTurfPolygon(ring, origin));
    } catch {
      /* skip invalid ring */
    }
  }
  if (feats.length === 0) return asPolys(valid);
  if (feats.length === 1) return flattenPolyDetailed(feats[0], origin);

  try {
    const merged = turf.union(turf.featureCollection(feats));
    if (merged) {
      const out = flattenPolyDetailed(merged as Feature<Polygon | MultiPolygon>, origin);
      if (out.length > 0) return out;
    }
  } catch {
    /* pairwise fallback */
  }

  let acc: Feature<Polygon | MultiPolygon> | null = feats[0]!;
  for (let i = 1; i < feats.length; i++) {
    try {
      const next = turf.union(turf.featureCollection([acc, feats[i]!]));
      if (next) acc = next as Feature<Polygon | MultiPolygon>;
    } catch {
      /* keep accumulator */
    }
  }
  if (acc) {
    const out = flattenPolyDetailed(acc, origin);
    if (out.length > 0) return out;
  }
  return asPolys(valid);
}

function longestEdge(ring: Position[]): { angle: number; length: number } {
  const pts = dropClosing(ring);
  let bestLen = 0;
  let angle = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const dx = b[0]! - a[0]!;
    const dy = b[1]! - a[1]!;
    const len = Math.hypot(dx, dy);
    if (len > bestLen) {
      bestLen = len;
      angle = Math.atan2(dy, dx);
    }
  }
  return { angle, length: bestLen };
}

function ringCentroid(ring: Position[]): { x: number; y: number } {
  const c = polygonCentroid(dropClosing(ring).map((p) => ({ x: p[0]!, y: p[1]!, z: 0 })));
  return { x: c.x, y: c.y };
}

function boundsOfRings(rings: Position[][]): MaqueteBounds {
  const bounds: MaqueteBounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const ring of rings) expandBounds(bounds, ring);
  if (!Number.isFinite(bounds.minX)) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }
  return bounds;
}

function curbAlongRings(rings: Position[][], widthM: number, heightM: number): MaqueteCurb[] {
  const curbs: MaqueteCurb[] = [];
  for (const ring of rings) {
    const pts = dropClosing(ring);
    if (pts.length < 3) continue;
    const ccw = signedArea(pts) > 0;
    for (let i = 0; i < pts.length; i++) {
      if (curbs.length >= MAX_CURB_SEGMENTS) return curbs;
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const dx = b[0]! - a[0]!;
      const dy = b[1]! - a[1]!;
      const len = Math.hypot(dx, dy);
      if (len < 0.45) continue;
      const nx = ccw ? -dy / len : dy / len;
      const ny = ccw ? dx / len : -dx / len;
      curbs.push({
        x: (a[0]! + b[0]!) / 2 + nx * (widthM * 0.5),
        y: (a[1]! + b[1]!) / 2 + ny * (widthM * 0.5),
        length: len,
        width: widthM,
        height: heightM,
        rotation: Math.atan2(dy, dx),
      });
    }
  }
  return curbs;
}

export function targetMaqueteHouseCount(eligibleLots: number): number {
  if (eligibleLots <= 0) return 0;
  if (eligibleLots <= 6) return eligibleLots;
  return Math.min(MAX_HOUSES, Math.max(6, Math.round(eligibleLots * 0.12)));
}

function pickScatteredHouseIndices(
  candidates: { index: number; x: number; y: number }[],
): Set<number> {
  const target = targetMaqueteHouseCount(candidates.length);
  return new Set(
    [...candidates]
      .sort((a, b) => hash01(a.x, a.y, 19) - hash01(b.x, b.y, 19))
      .slice(0, target)
      .map((c) => c.index),
  );
}

function placeHouse(ring: Position[], areaM2: number, index: number): MaqueteHouse | null {
  if (areaM2 < 140) return null;
  const inset = bufferRings([ring], -4.5)[0];
  const source = inset ?? ring;
  const pts = dropClosing(source);
  if (pts.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p[0]!);
    minY = Math.min(minY, p[1]!);
    maxX = Math.max(maxX, p[0]!);
    maxY = Math.max(maxY, p[1]!);
  }
  const bw = maxX - minX;
  const bd = maxY - minY;
  if (bw < 6.5 || bd < 6.5) return null;
  const { angle } = longestEdge(ring);
  const c = ringCentroid(source);
  const style: MaqueteHouseStyle = hash01(c.x, c.y, 8) > 0.45 ? "modern" : "pitched";
  const width =
    style === "modern" ? Math.min(Math.max(bw * 0.48, 8), 18) : Math.min(Math.max(bw * 0.38, 6.5), 14);
  const depth =
    style === "modern" ? Math.min(Math.max(bd * 0.36, 6.5), 12) : Math.min(Math.max(bd * 0.3, 5.5), 10);
  return {
    x: c.x,
    y: c.y,
    width,
    depth,
    height: style === "modern" ? 3.15 + (index % 3) * 0.85 : 2.55 + (index % 2) * 0.22,
    rotation: angle,
    style,
    wallHue: index % 5,
    roofHue: index % 4,
  };
}

function plantTrees(rings: Position[][], maxTrees: number): MaqueteTree[] {
  const trees: MaqueteTree[] = [];
  if (rings.length === 0 || maxTrees <= 0) return trees;
  const totalArea = rings.reduce((s, r) => s + planarAreaM2(r), 0);
  const spacing = Math.max(6.2, Math.min(12.5, Math.sqrt(Math.max(totalArea, 1) / Math.max(maxTrees * 0.55, 8))));
  const margin = 1.7;

  const pushTree = (px: number, py: number, ring: Position[], minSep: number) => {
    if (trees.length >= maxTrees) return;
    if (!pointInRing(px, py, ring)) return;
    if (distToRing(px, py, ring) < margin) return;
    if (tooClose(px, py, trees, minSep)) return;
    trees.push({
      x: px,
      y: py,
      scale: 0.88 + hash01(px, py, 4) * 0.62,
      kind: hash01(px, py, 3) > 0.9 ? "conifer" : "broad",
    });
  };

  for (const ring of rings) {
    const b = boundsOfRings([ring]);
    for (let x = b.minX + margin; x <= b.maxX - margin; x += spacing) {
      for (let y = b.minY + margin; y <= b.maxY - margin; y += spacing) {
        if (trees.length >= maxTrees) return trees;
        const jx = (hash01(x, y, 1) - 0.5) * spacing * 0.62;
        const jy = (hash01(x, y, 2) - 0.5) * spacing * 0.62;
        pushTree(x + jx, y + jy, ring, spacing * 0.72);
      }
    }
    const edgePad = hash01(b.minX, b.minY, 7) * 2.1;
    const edge = sampleRingInset(ring, Math.max(4.4, spacing * 0.62), 3.1, edgePad);
    for (const s of edge) {
      if (trees.length >= maxTrees) return trees;
      const jx = (hash01(s.x, s.y, 5) - 0.5) * 2.2;
      const jy = (hash01(s.x, s.y, 6) - 0.5) * 2.2;
      pushTree(s.x + jx, s.y + jy, ring, 4.6);
    }
  }
  return trees;
}

export function pointInMaquetePoly(x: number, y: number, poly: MaquetePoly): boolean {
  if (!pointInRing(x, y, poly.outer)) return false;
  for (const hole of poly.holes) {
    if (pointInRing(x, y, hole)) return false;
  }
  return true;
}

export function pointInMaquetePolys(x: number, y: number, polys: MaquetePoly[]): boolean {
  return polys.some((poly) => pointInMaquetePoly(x, y, poly));
}

function pointInAnyRing(x: number, y: number, rings: Position[][]): boolean {
  return rings.some((ring) => pointInRing(x, y, ring));
}

function tooClose(
  x: number,
  y: number,
  items: { x: number; y: number }[],
  minDist: number,
): boolean {
  const min2 = minDist * minDist;
  for (const it of items) {
    const dx = it.x - x;
    const dy = it.y - y;
    if (dx * dx + dy * dy < min2) return true;
  }
  return false;
}

type PathSample = {
  x: number;
  y: number;
  rotation: number;
  nx: number;
  ny: number;
};

function inwardNormal(dx: number, dy: number, len: number, ccw: boolean): { nx: number; ny: number } {
  return ccw ? { nx: -dy / len, ny: dx / len } : { nx: dy / len, ny: -dx / len };
}

function sampleOpenPath(path: Position[], spacing: number, endMargin: number): PathSample[] {
  const pts = dropClosing(path);
  if (pts.length < 2 || spacing <= 0) return [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i + 1]![0]! - pts[i]![0]!, pts[i + 1]![1]! - pts[i]![1]!);
  }
  if (total < Math.max(spacing * 0.45, endMargin * 2 + 2)) return [];
  const start = Math.min(endMargin, total * 0.12);
  const end = Math.max(start + spacing * 0.4, total - endMargin);
  const out: PathSample[] = [];
  let acc = 0;
  let nextAt = start;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b[0]! - a[0]!;
    const dy = b[1]! - a[1]!;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const rotation = Math.atan2(dy, dx);
    const nx = -dy / len;
    const ny = dx / len;
    while (nextAt <= acc + len + 1e-9 && nextAt <= end + 1e-9) {
      const t = (nextAt - acc) / len;
      out.push({
        x: a[0]! + dx * t,
        y: a[1]! + dy * t,
        rotation,
        nx,
        ny,
      });
      nextAt += spacing;
    }
    acc += len;
  }
  return out;
}

function sampleRingInset(ring: Position[], spacing: number, insetM: number, startPad = 0): PathSample[] {
  const pts = dropClosing(ring);
  if (pts.length < 3 || spacing <= 0) return [];
  const ccw = signedArea(pts) > 0;
  const out: PathSample[] = [];
  let acc = 0;
  let nextAt = startPad;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const dx = b[0]! - a[0]!;
    const dy = b[1]! - a[1]!;
    const len = Math.hypot(dx, dy);
    if (len < 0.7) continue;
    const { nx, ny } = inwardNormal(dx, dy, len, ccw);
    const rotation = Math.atan2(dy, dx);
    while (nextAt <= acc + len + 1e-9) {
      const t = (nextAt - acc) / len;
      if (t >= 0 && t <= 1) {
        out.push({
          x: a[0]! + dx * t + nx * insetM,
          y: a[1]! + dy * t + ny * insetM,
          rotation,
          nx,
          ny,
        });
      }
      nextAt += spacing;
    }
    acc += len;
  }
  return out;
}

function centerlineFromRing(ring: Position[], stepM = 4): Position[] {
  const pts = dropClosing(ring);
  if (pts.length < 3) return [];
  const { angle, length } = longestEdge(ring);
  if (length < 8) return [];
  const c = ringCentroid(ring);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const vx = -uy;
  const vy = ux;
  let minU = Infinity;
  let maxU = -Infinity;
  let maxAbsV = 0;
  for (const p of pts) {
    const du = (p[0]! - c.x) * ux + (p[1]! - c.y) * uy;
    const dv = (p[0]! - c.x) * vx + (p[1]! - c.y) * vy;
    minU = Math.min(minU, du);
    maxU = Math.max(maxU, du);
    maxAbsV = Math.max(maxAbsV, Math.abs(dv));
  }
  const path: Position[] = [];
  const vReach = maxAbsV + 2;
  const lastU = maxU - 0.9;
  for (let u = minU + 0.9; u <= lastU + 1e-6; u += stepM) {
    let vMin = Infinity;
    let vMax = -Infinity;
    const samples = 20;
    for (let i = 0; i <= samples; i++) {
      const v = -vReach + (2 * vReach * i) / samples;
      const x = c.x + ux * u + vx * v;
      const y = c.y + uy * u + vy * v;
      if (pointInRing(x, y, ring)) {
        vMin = Math.min(vMin, v);
        vMax = Math.max(vMax, v);
      }
    }
    if (vMin < vMax) {
      const vMid = (vMin + vMax) / 2;
      path.push([c.x + ux * u + vx * vMid, c.y + uy * u + vy * vMid]);
    }
  }
  return path.length >= 2 ? path : [];
}

function sidewalkWalkSamples(sidewalks: MaquetePoly[], spacing: number, insetM: number): PathSample[] {
  const out: PathSample[] = [];
  for (const poly of sidewalks) {
    out.push(...sampleRingInset(poly.outer, spacing, insetM, hash01(poly.outer[0]?.[0] ?? 0, poly.outer[0]?.[1] ?? 0, 9) * spacing * 0.4));
    for (const hole of poly.holes) {
      out.push(...sampleRingInset(hole, spacing, -insetM, hash01(hole[0]?.[0] ?? 0, hole[0]?.[1] ?? 0, 11) * spacing * 0.35));
    }
  }
  return out;
}

function plantSidewalkTrees(
  sidewalks: MaquetePoly[],
  blocked: Position[][],
  maxTrees: number,
): MaqueteTree[] {
  const trees: MaqueteTree[] = [];
  if (sidewalks.length === 0 || maxTrees <= 0) return trees;
  const samples = sidewalkWalkSamples(sidewalks, SIDEWALK_TREE_SPACING_M, 0.85);
  for (const s of samples) {
    if (trees.length >= maxTrees) break;
    const jx = (hash01(s.x, s.y, 21) - 0.5) * 0.45;
    const jy = (hash01(s.x, s.y, 22) - 0.5) * 0.45;
    const x = s.x + jx;
    const y = s.y + jy;
    if (hash01(x, y, 23) < 0.38) continue;
    if (!pointInMaquetePolys(x, y, sidewalks)) continue;
    if (pointInAnyRing(x, y, blocked)) continue;
    if (tooClose(x, y, trees, 16)) continue;
    trees.push({
      x,
      y,
      scale: 0.52 + hash01(x, y, 24) * 0.22,
      kind: hash01(x, y, 25) > 0.82 ? "conifer" : "broad",
    });
  }
  return trees;
}

function placePeopleOnSidewalks(
  sidewalks: MaquetePoly[],
  blocked: Position[][],
  maxPeople: number,
): MaquetePerson[] {
  const people: MaquetePerson[] = [];
  if (sidewalks.length === 0 || maxPeople <= 0) return people;
  const samples = sidewalkWalkSamples(sidewalks, PERSON_SPACING_M, 0.72);
  for (const s of samples) {
    if (people.length >= maxPeople) break;
    if (hash01(s.x, s.y, 31) < 0.5) continue;
    const along = (hash01(s.x, s.y, 32) - 0.5) * 0.55;
    const across = (hash01(s.x, s.y, 33) - 0.5) * 0.35;
    const x = s.x + Math.cos(s.rotation) * along + s.nx * across;
    const y = s.y + Math.sin(s.rotation) * along + s.ny * across;
    if (!pointInMaquetePolys(x, y, sidewalks)) continue;
    if (pointInAnyRing(x, y, blocked)) continue;
    if (tooClose(x, y, people, 3.6)) continue;
    const walking = hash01(x, y, 34) > 0.32;
    people.push({
      x,
      y,
      rotation: walking ? s.rotation : s.rotation + (hash01(x, y, 35) - 0.5) * 1.4,
      scale: 0.9 + hash01(x, y, 36) * 0.18,
      hue: Math.floor(hash01(x, y, 37) * 6),
      walking,
    });
  }
  return people;
}

function placeCarsOnVias(
  paths: Position[][],
  asphalt: MaquetePoly[],
  blocked: Position[][],
  maxCars: number,
): MaqueteCar[] {
  const cars: MaqueteCar[] = [];
  if (paths.length === 0 || asphalt.length === 0 || maxCars <= 0) return cars;
  for (const path of paths) {
    const samples = sampleOpenPath(path, CAR_SPACING_M, 8);
    for (const s of samples) {
      if (cars.length >= maxCars) return cars;
      if (hash01(s.x, s.y, 41) < 0.32) continue;
      const lane = hash01(s.x, s.y, 42) > 0.5 ? 1.55 : -1.55;
      const along = (hash01(s.x, s.y, 43) - 0.5) * 3.2;
      const x = s.x + Math.cos(s.rotation) * along + s.nx * lane;
      const y = s.y + Math.sin(s.rotation) * along + s.ny * lane;
      if (!pointInMaquetePolys(x, y, asphalt)) continue;
      if (pointInAnyRing(x, y, blocked)) continue;
      if (tooClose(x, y, cars, 10)) continue;
      cars.push({
        x,
        y,
        rotation: s.rotation,
        hue: Math.floor(hash01(x, y, 44) * 6),
        length: 4.15 + hash01(x, y, 45) * 0.45,
        width: 1.68 + hash01(x, y, 46) * 0.12,
      });
    }
  }
  return cars;
}

function paintEixoDashes(paths: Position[][]): MaqueteCurb[] {
  const dashes: MaqueteCurb[] = [];
  const period = EIXO_DASH_M + EIXO_GAP_M;
  for (const path of paths) {
    const pts = dropClosing(path);
    if (pts.length < 2) continue;
    let acc = 0;
    let nextAt = EIXO_DASH_M * 0.5;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const dx = b[0]! - a[0]!;
      const dy = b[1]! - a[1]!;
      const len = Math.hypot(dx, dy);
      if (len < 0.4) continue;
      const rotation = Math.atan2(dy, dx);
      while (nextAt <= acc + len + 1e-9) {
        if (dashes.length >= MAX_EIXO_DASHES) return dashes;
        const t = (nextAt - acc) / len;
        dashes.push({
          x: a[0]! + dx * t,
          y: a[1]! + dy * t,
          length: EIXO_DASH_M,
          width: EIXO_WIDTH_M,
          height: 0.028,
          rotation,
        });
        nextAt += period;
      }
      acc += len;
    }
  }
  return dashes;
}

export function estimateRingWidthM(ring: Position[]): number {
  const pts = dropClosing(ring);
  if (pts.length < 3) return 0;
  const { angle } = longestEdge(ring);
  const c = ringCentroid(ring);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const vx = -uy;
  const vy = ux;
  let maxAbsV = 0;
  for (const p of pts) {
    const dv = (p[0]! - c.x) * vx + (p[1]! - c.y) * vy;
    maxAbsV = Math.max(maxAbsV, Math.abs(dv));
  }
  return maxAbsV * 2;
}

function pathLengthM(path: Position[]): number {
  const pts = dropClosing(path);
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i + 1]![0]! - pts[i]![0]!, pts[i + 1]![1]! - pts[i]![1]!);
  }
  return total;
}

function medianAlongPath(path: Position[], widthM: number): MaqueteCurb[] {
  const pts = dropClosing(path);
  const out: MaqueteCurb[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b[0]! - a[0]!;
    const dy = b[1]! - a[1]!;
    const len = Math.hypot(dx, dy);
    if (len < 1.2) continue;
    out.push({
      x: (a[0]! + b[0]!) / 2,
      y: (a[1]! + b[1]!) / 2,
      length: len,
      width: widthM,
      height: 0.045,
      rotation: Math.atan2(dy, dx),
    });
  }
  return out;
}

function plantMedianPalms(path: Position[], asphalt: MaquetePoly[], maxPalms: number): MaqueteTree[] {
  const trees: MaqueteTree[] = [];
  if (maxPalms <= 0) return trees;
  const samples = sampleOpenPath(path, PALM_SPACING_M, 12);
  for (const s of samples) {
    if (trees.length >= maxPalms) break;
    if (!pointInMaquetePolys(s.x, s.y, asphalt)) continue;
    trees.push({
      x: s.x,
      y: s.y,
      scale: 0.5 + hash01(s.x, s.y, 51) * 0.06,
      kind: "palm",
    });
  }
  return trees;
}

function buildMainAvenueDressing(
  vias: Position[][],
  streetAxes: Position[][],
  asphalt: MaquetePoly[],
): { medians: MaqueteCurb[]; medianPalms: MaqueteTree[] } {
  let best: { path: Position[]; length: number } | null = null;
  for (const via of vias) {
    if (estimateRingWidthM(via) < MIN_AVENUE_WIDTH_M) continue;
    const midAxis = streetAxes.find((ax) => {
      const mid = ax[Math.floor(ax.length / 2)];
      return mid != null && pointInRing(mid[0]!, mid[1]!, via);
    });
    const path = midAxis && midAxis.length >= 2 ? midAxis : centerlineFromRing(via, 5);
    const length = pathLengthM(path);
    if (length < MIN_AVENUE_LENGTH_M) continue;
    if (!best || length > best.length) best = { path, length };
  }
  if (!best) return { medians: [], medianPalms: [] };
  return {
    medians: medianAlongPath(best.path, MEDIAN_WIDTH_M),
    medianPalms: plantMedianPalms(best.path, asphalt, MAX_PALMS),
  };
}

function streetLabelsFromEixos(eixos: CadPolylineEntity[]): MaqueteStreetLabel[] {
  const labels: MaqueteStreetLabel[] = [];
  for (const eixo of eixos) {
    const pts = eixo.vertices;
    if (pts.length < 2) continue;
    let total = 0;
    const segs: { a: (typeof pts)[0]; b: (typeof pts)[0]; len: number }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 0.4) continue;
      segs.push({ a, b, len });
      total += len;
    }
    if (segs.length === 0 || total < 18) continue;
    const name = (eixo.name ?? "").trim();
    if (!name || /^eixo\s*\d*$/i.test(name)) continue;
    let acc = 0;
    const mid = total / 2;
    for (const seg of segs) {
      if (acc + seg.len >= mid) {
        const t = (mid - acc) / seg.len;
        const x = seg.a.x + (seg.b.x - seg.a.x) * t;
        const y = seg.a.y + (seg.b.y - seg.a.y) * t;
        labels.push({
          x,
          y,
          text: name,
          rotation: Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x),
        });
        break;
      }
      acc += seg.len;
    }
  }
  return labels;
}

export function loteamentoMaqueteReadiness(project: CadProject): LoteamentoMaqueteReadiness {
  const hasVias = closedOnLayer(project, LOTEAMENTO_VIAS_LAYER_ID).length > 0;
  const hasLotes = closedOnLayer(project, LOTEAMENTO_LOTES_LAYER_ID).length > 0;
  const hasReserva = closedOnLayer(project, AREA_RESERVA_LEGAL_LAYER_ID).length > 0;
  return { ok: hasVias && hasLotes, hasVias, hasLotes, hasReserva };
}

export function buildLoteamentoMaquete(
  project: CadProject,
  options: BuildLoteamentoMaqueteOptions = {},
): LoteamentoMaqueteScene | null {
  const vias = closedOnLayer(project, LOTEAMENTO_VIAS_LAYER_ID).map(polyToRing);
  const lotEntities = closedOnLayer(project, LOTEAMENTO_LOTES_LAYER_ID);
  const lotRings = lotEntities.map(polyToRing);
  const calcadas = closedOnLayer(project, LOTEAMENTO_CALCADAS_LAYER_ID).map(polyToRing);
  const reserva = closedOnLayer(project, AREA_RESERVA_LEGAL_LAYER_ID).map(polyToRing);
  const eixoEntities = project.entities.filter(
    (e): e is CadPolylineEntity =>
      e.type === "polyline" && !e.closed && e.vertices.length >= 2 && e.layerId === LOTEAMENTO_EIXOS_LAYER_ID,
  );
  const eixos = eixoEntities.map((e) => e.vertices.map((v) => [v.x, v.y] as Position));

  if (vias.length === 0 && lotRings.length === 0 && reserva.length === 0) return null;

  const calcadaM = Math.max(0, options.calcadaM ?? DEFAULT_CALCADA_M);
  const meioFioM = Math.max(0.08, options.meioFioM ?? DEFAULT_MEIO_FIO_M);
  const maxTrees = Math.min(MAX_TREES, Math.max(0, options.maxTrees ?? MAX_TREES));
  const maxSidewalkTrees = Math.min(
    MAX_SIDEWALK_TREES,
    Math.max(0, options.maxSidewalkTrees ?? MAX_SIDEWALK_TREES),
  );
  const maxPeople = Math.min(MAX_PEOPLE, Math.max(0, options.maxPeople ?? MAX_PEOPLE));
  const maxCars = Math.min(MAX_CARS, Math.max(0, options.maxCars ?? MAX_CARS));

  let asphalt: MaquetePoly[] = asPolys(vias);
  let sidewalks: MaquetePoly[] = [];
  let usedFallbackSidewalk = false;

  if (calcadas.length > 0) {
    sidewalks = asPolys(calcadas);
    const cut = differencePolys(vias, calcadas);
    asphalt = cut.length > 0 ? cut : asPolys(bufferRings(vias, -Math.max(0.6, calcadaM * 0.85)));
    if (asphalt.length === 0) asphalt = asPolys(vias);
  } else if (calcadaM > 0.2 && vias.length > 0) {
    const inset = bufferRings(vias, -calcadaM);
    if (inset.length > 0) {
      asphalt = asPolys(inset);
      const band = differencePolys(vias, inset);
      sidewalks = band;
      usedFallbackSidewalk = sidewalks.length > 0;
    }
  }

  const curbs = curbAlongRings(
    asphalt.map((p) => p.outer),
    Math.max(CURB_WIDTH_M, meioFioM * 0.85),
    Math.max(0.14, meioFioM),
  );

  const lotDrafts: MaqueteLot[] = lotEntities.map((entity, i) => {
    const ring = lotRings[i]!;
    const areaM2 = polygonAreaM2(entity.vertices, true);
    return {
      ring,
      name: entity.name,
      padHue: i % 5,
      house: placeHouse(ring, areaM2, i),
    };
  });
  const houseCandidates = lotDrafts.flatMap((lot, index) =>
    lot.house ? [{ index, x: lot.house.x, y: lot.house.y }] : [],
  );
  const selectedHouses = pickScatteredHouseIndices(houseCandidates);
  const lots: MaqueteLot[] = lotDrafts.map((lot, i) => ({
    ...lot,
    house: selectedHouses.has(i) ? lot.house : null,
  }));
  const occupied = lots.filter((lot) => lot.house);
  for (let i = 0; i < occupied.length; i++) {
    const house = occupied[i]!.house;
    if (house) house.style = i % 2 === 0 ? "pitched" : "modern";
  }

  const gleba = unionMaqueteRings([...vias, ...lotRings, ...reserva, ...calcadas]);
  const trees = plantTrees(reserva, maxTrees);
  const streetAxes = eixos.length > 0 ? eixos : vias.map((ring) => centerlineFromRing(ring)).filter((p) => p.length >= 2);
  const { medians, medianPalms } = buildMainAvenueDressing(vias, streetAxes, asphalt);
  const blockedRings = [...lotRings, ...reserva];
  const sidewalkTrees = plantSidewalkTrees(sidewalks, blockedRings, maxSidewalkTrees);
  const people = placePeopleOnSidewalks(sidewalks, blockedRings, maxPeople);
  const cars = placeCarsOnVias(streetAxes, asphalt, blockedRings, maxCars);
  const eixoDashes = paintEixoDashes(streetAxes);
  const allRings = [
    ...asphalt.map((p) => p.outer),
    ...sidewalks.map((p) => p.outer),
    ...lotRings,
    ...reserva,
    ...eixos,
  ];
  const bounds = boundsOfRings(allRings);
  const origin = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
  const extentM = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 24);

  return {
    origin,
    bounds,
    extentM,
    asphalt,
    sidewalks,
    curbs,
    lots,
    gleba,
    reserva: asPolys(reserva),
    eixos: streetAxes,
    eixoDashes,
    medians,
    trees,
    sidewalkTrees,
    medianPalms,
    people,
    cars,
    streetLabels: streetLabelsFromEixos(eixoEntities),
    hasVias: vias.length > 0,
    hasLotes: lotRings.length > 0,
    hasReserva: reserva.length > 0,
    usedFallbackSidewalk,
  };
}
