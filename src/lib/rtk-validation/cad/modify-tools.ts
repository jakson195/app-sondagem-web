import { hitTestPolyline } from "./polygon-utils";
import type { CadEntity, CadLineEntity, CadPolylineEntity, CadTool, CadVertex } from "./types";

export const CAD_MODIFY_TOOLS = [
  "trim",
  "aparar",
  "offset",
  "scale",
  "extend",
  "mirror",
  "stretch",
  "break",
  "breakPoint",
] as const;

export type CadModifyTool = (typeof CAD_MODIFY_TOOLS)[number];

export function isCadModifyTool(tool: CadTool): tool is CadModifyTool {
  return (CAD_MODIFY_TOOLS as readonly string[]).includes(tool);
}

export function isTrimModifyTool(tool: CadTool): boolean {
  return tool === "trim" || tool === "aparar";
}

export type CadPath = {
  id: string;
  layerId: string;
  vertices: CadVertex[];
  closed: boolean;
  sourceType: "line" | "polyline";
};

export type ModifyResult = {
  removeIds: string[];
  add: Array<CadLineEntity | CadPolylineEntity>;
  message: string;
};

const EPS = 1e-8;
const MIN_LEN = 1e-6;

function hypot2(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(bx - ax, by - ay);
}

function lerpVertex(a: CadVertex, b: CadVertex, t: number): CadVertex {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

export function normalizePathVertices(vertices: CadVertex[], closed: boolean): CadVertex[] {
  if (vertices.length < 2) return vertices;
  if (!closed) return vertices;
  const a = vertices[0];
  const b = vertices[vertices.length - 1];
  if (hypot2(a.x, a.y, b.x, b.y) < 1e-6) return vertices.slice(0, -1);
  return vertices;
}

export function entityToPath(entity: CadEntity): CadPath | null {
  if (entity.type === "line") {
    return {
      id: entity.id,
      layerId: entity.layerId,
      vertices: [entity.start, entity.end],
      closed: false,
      sourceType: "line",
    };
  }
  if (entity.type === "polyline" && entity.vertices.length >= 2) {
    return {
      id: entity.id,
      layerId: entity.layerId,
      vertices: normalizePathVertices(entity.vertices, Boolean(entity.closed)),
      closed: Boolean(entity.closed),
      sourceType: "polyline",
    };
  }
  return null;
}

export function pathToEntity(
  path: CadPath,
  id: string,
  source?: CadEntity,
): CadLineEntity | CadPolylineEntity {
  const vertices = path.vertices;
  if (!path.closed && vertices.length === 2 && path.sourceType === "line") {
    return { id, type: "line", layerId: path.layerId, start: vertices[0], end: vertices[1] };
  }
  const poly: CadPolylineEntity = {
    id,
    type: "polyline",
    layerId: path.layerId,
    vertices,
    closed: path.closed && vertices.length >= 3,
  };
  if (source?.type === "polyline") {
    poly.name = source.name;
    if (poly.closed) poly.lote = source.lote;
    if (source.drainage) poly.drainage = source.drainage;
  }
  return poly;
}

function segmentCount(vertices: CadVertex[], closed: boolean): number {
  return closed ? vertices.length : Math.max(vertices.length - 1, 0);
}

function pathLength(vertices: CadVertex[], closed: boolean): number {
  let len = 0;
  const n = segmentCount(vertices, closed);
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    len += hypot2(a.x, a.y, b.x, b.y);
  }
  return len;
}

export function projectOnPath(
  vertices: CadVertex[],
  closed: boolean,
  point: CadVertex,
): { station: number; t: number; segmentIndex: number; point: CadVertex; dist: number } | null {
  const n = segmentCount(vertices, closed);
  if (n <= 0) return null;
  let best: {
    station: number;
    t: number;
    segmentIndex: number;
    point: CadVertex;
    dist: number;
  } | null = null;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const len = Math.sqrt(lenSq);
    const t = lenSq < EPS ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
    const proj = lerpVertex(a, b, t);
    const dist = hypot2(point.x, point.y, proj.x, proj.y);
    if (!best || dist < best.dist) {
      best = { station: acc + t * len, t, segmentIndex: i, point: proj, dist };
    }
    acc += len;
  }
  return best;
}

function pointAtStation(vertices: CadVertex[], closed: boolean, station: number): CadVertex {
  const total = pathLength(vertices, closed);
  let s = closed && total > EPS ? ((station % total) + total) % total : Math.max(0, Math.min(station, total));
  const n = segmentCount(vertices, closed);
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const len = hypot2(a.x, a.y, b.x, b.y);
    if (s <= len + EPS) {
      const t = len < EPS ? 0 : s / len;
      return lerpVertex(a, b, t);
    }
    s -= len;
  }
  return vertices[vertices.length - 1];
}

function sliceOpenPath(vertices: CadVertex[], start: number, end: number): CadVertex[] {
  const total = pathLength(vertices, false);
  const a = Math.max(0, Math.min(start, total));
  const b = Math.max(0, Math.min(end, total));
  if (b - a < MIN_LEN) return [];
  const out: CadVertex[] = [pointAtStation(vertices, false, a)];
  let acc = 0;
  const n = vertices.length - 1;
  for (let i = 0; i < n; i++) {
    const va = vertices[i];
    const vb = vertices[i + 1];
    const len = hypot2(va.x, va.y, vb.x, vb.y);
    const segStart = acc;
    const segEnd = acc + len;
    if (segEnd > a + EPS && segStart < b - EPS && segStart > a + EPS && segStart < b - EPS) {
      out.push(va);
    }
    acc = segEnd;
  }
  out.push(pointAtStation(vertices, false, b));
  return dedupeVertices(out);
}

function walkClosed(vertices: CadVertex[], start: number, end: number): CadVertex[] {
  const total = pathLength(vertices, true);
  if (total < MIN_LEN) return [];
  const a = ((start % total) + total) % total;
  let b = ((end % total) + total) % total;
  if (Math.abs(b - a) < MIN_LEN) return [];
  const out: CadVertex[] = [pointAtStation(vertices, true, a)];
  const n = vertices.length;
  let acc = 0;
  const stations: number[] = [];
  for (let i = 0; i < n; i++) {
    stations.push(acc);
    acc += hypot2(vertices[i].x, vertices[i].y, vertices[(i + 1) % n].x, vertices[(i + 1) % n].y);
  }
  const crosses = b < a;
  for (let i = 0; i < n; i++) {
    const st = stations[i];
    const include = crosses ? st > a + EPS || st < b - EPS : st > a + EPS && st < b - EPS;
    if (include) out.push(vertices[i]);
  }
  out.push(pointAtStation(vertices, true, b));
  return dedupeVertices(out);
}

function dedupeVertices(vertices: CadVertex[]): CadVertex[] {
  const out: CadVertex[] = [];
  for (const v of vertices) {
    const prev = out[out.length - 1];
    if (prev && hypot2(prev.x, prev.y, v.x, v.y) < MIN_LEN) continue;
    out.push(v);
  }
  return out;
}

function segmentIntersection(
  a1: CadVertex,
  a2: CadVertex,
  b1: CadVertex,
  b2: CadVertex,
): { point: CadVertex; tA: number; tB: number } | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < EPS) return null;
  const tA = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom;
  const tB = ((b1.x - a1.x) * day - (b1.y - a1.y) * dax) / denom;
  if (tA < -1e-6 || tA > 1 + 1e-6 || tB < -1e-6 || tB > 1 + 1e-6) return null;
  return { point: lerpVertex(a1, a2, tA), tA, tB };
}

function raySegmentIntersection(
  origin: CadVertex,
  dir: CadVertex,
  b1: CadVertex,
  b2: CadVertex,
  allowInfiniteCutter: boolean,
): { point: CadVertex; tRay: number } | null {
  const len = Math.hypot(dir.x, dir.y);
  if (len < EPS) return null;
  const a2 = { x: origin.x + dir.x, y: origin.y + dir.y, z: origin.z };
  const dax = dir.x;
  const day = dir.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < EPS) return null;
  const tRay = ((b1.x - origin.x) * dby - (b1.y - origin.y) * dbx) / denom;
  const tB = ((b1.x - origin.x) * day - (b1.y - origin.y) * dax) / denom;
  if (tRay < EPS) return null;
  if (!allowInfiniteCutter && (tB < -1e-6 || tB > 1 + 1e-6)) return null;
  return { point: lerpVertex(origin, a2, tRay), tRay };
}

function pathIntersections(target: CadPath, cutter: CadPath): number[] {
  const stations: number[] = [];
  const tn = segmentCount(target.vertices, target.closed);
  const cn = segmentCount(cutter.vertices, cutter.closed);
  let acc = 0;
  for (let i = 0; i < tn; i++) {
    const a1 = target.vertices[i];
    const a2 = target.vertices[(i + 1) % target.vertices.length];
    const segLen = hypot2(a1.x, a1.y, a2.x, a2.y);
    for (let j = 0; j < cn; j++) {
      const b1 = cutter.vertices[j];
      const b2 = cutter.vertices[(j + 1) % cutter.vertices.length];
      const hit = segmentIntersection(a1, a2, b1, b2);
      if (!hit) continue;
      stations.push(acc + hit.tA * segLen);
    }
    acc += segLen;
  }
  stations.sort((a, b) => a - b);
  const unique: number[] = [];
  for (const s of stations) {
    if (unique.length === 0 || Math.abs(unique[unique.length - 1] - s) > 1e-4) unique.push(s);
  }
  return unique;
}

function pathsFromSlices(
  source: CadPath,
  slices: CadVertex[][],
): CadPath[] {
  return slices
    .filter((verts) => verts.length >= 2)
    .map((vertices) => ({
      ...source,
      vertices,
      closed: false,
      sourceType: vertices.length === 2 ? source.sourceType : "polyline",
    }));
}

export function trimPath(target: CadPath, cutter: CadPath, click: CadVertex): CadPath[] {
  const proj = projectOnPath(target.vertices, target.closed, click);
  if (!proj) throw new Error("Clique sobre o trecho a aparar.");
  const cuts = pathIntersections(target, cutter);
  if (cuts.length === 0) throw new Error("Não há interseção com a aresta de corte.");
  const total = pathLength(target.vertices, target.closed);
  const sc = proj.station;

  if (!target.closed) {
    const marks = [0, ...cuts.filter((s) => s > MIN_LEN && s < total - MIN_LEN), total];
    let left = 0;
    let right = total;
    for (let i = 0; i < marks.length - 1; i++) {
      if (sc >= marks[i] - 1e-6 && sc <= marks[i + 1] + 1e-6) {
        left = marks[i];
        right = marks[i + 1];
        break;
      }
    }
    const kept: CadVertex[][] = [];
    if (left > MIN_LEN) kept.push(sliceOpenPath(target.vertices, 0, left));
    if (total - right > MIN_LEN) kept.push(sliceOpenPath(target.vertices, right, total));
    if (kept.length === 0) throw new Error("O trecho aparado elimina o objeto inteiro.");
    return pathsFromSlices(target, kept);
  }

  const marks = [...cuts];
  if (marks.length === 0) throw new Error("Não há interseção com a aresta de corte.");
  const ordered = [...marks].sort((a, b) => a - b);
  let idx = 0;
  for (let i = 0; i < ordered.length; i++) {
    const a = ordered[i];
    const b = ordered[(i + 1) % ordered.length];
    const inside = i === ordered.length - 1 ? sc >= a || sc <= b : sc >= a && sc <= b;
    if (inside) {
      idx = i;
      break;
    }
  }
  const removeStart = ordered[idx];
  const removeEnd = ordered[(idx + 1) % ordered.length];
  const keep = walkClosed(target.vertices, removeEnd, removeStart);
  if (keep.length < 2) throw new Error("O trecho aparado elimina o objeto inteiro.");
  return pathsFromSlices(target, [keep]);
}

export function extendPath(target: CadPath, cutter: CadPath, click: CadVertex): CadPath {
  if (target.closed) throw new Error("Não é possível estender um polígono fechado.");
  const verts = target.vertices;
  if (verts.length < 2) throw new Error("Objeto inválido para estender.");
  const start = verts[0];
  const end = verts[verts.length - 1];
  const useStart = hypot2(click.x, click.y, start.x, start.y) <= hypot2(click.x, click.y, end.x, end.y);
  const origin = useStart ? start : end;
  const next = useStart ? verts[1] : verts[verts.length - 2];
  const dir = {
    x: origin.x - next.x,
    y: origin.y - next.y,
    z: 0,
  };
  const cn = segmentCount(cutter.vertices, cutter.closed);
  let best: { point: CadVertex; tRay: number } | null = null;
  for (const allowInfinite of [false, true]) {
    for (let j = 0; j < cn; j++) {
      const b1 = cutter.vertices[j];
      const b2 = cutter.vertices[(j + 1) % cutter.vertices.length];
      const hit = raySegmentIntersection(origin, dir, b1, b2, allowInfinite);
      if (!hit) continue;
      if (!best || hit.tRay < best.tRay) best = hit;
    }
    if (best) break;
  }
  if (!best) throw new Error("Não foi possível estender até a aresta de limite.");
  const nextVerts = useStart ? [best.point, ...verts] : [...verts, best.point];
  return { ...target, vertices: dedupeVertices(nextVerts) };
}

function perpUnit(dx: number, dy: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len < EPS) return { x: 0, y: 0 };
  return { x: -dy / len, y: dx / len };
}

function lineIntersect(
  p: CadVertex,
  d1: { x: number; y: number },
  q: CadVertex,
  d2: { x: number; y: number },
): CadVertex | null {
  const denom = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denom) < EPS) return null;
  const t = ((q.x - p.x) * d2.y - (q.y - p.y) * d2.x) / denom;
  return { x: p.x + d1.x * t, y: p.y + d1.y * t, z: p.z };
}

function pointInRing(point: CadVertex, ring: CadVertex[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].y;
    const yj = ring[j].y;
    const xi = ring[i].x;
    const xj = ring[j].x;
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function offsetPath(path: CadPath, click: CadVertex, distance?: number | null): CadPath {
  const verts = path.vertices;
  const n = segmentCount(verts, path.closed);
  if (n < 1) throw new Error("Objeto inválido para offset.");
  const proj = projectOnPath(verts, path.closed, click);
  if (!proj) throw new Error("Clique o lado do offset.");
  const a = verts[proj.segmentIndex];
  const b = verts[(proj.segmentIndex + 1) % verts.length];
  const dir = { x: b.x - a.x, y: b.y - a.y };
  const cross = dir.x * (click.y - a.y) - dir.y * (click.x - a.x);
  const sign = cross >= 0 ? 1 : -1;
  const dist = distance != null && distance > 0 ? distance : Math.max(proj.dist, MIN_LEN);
  const signed = dist * sign;

  const offsets: CadVertex[] = [];
  if (!path.closed) {
    for (let i = 0; i < verts.length; i++) {
      const prev = verts[Math.max(0, i - 1)];
      const cur = verts[i];
      const next = verts[Math.min(verts.length - 1, i + 1)];
      const dIn = i === 0 ? { x: next.x - cur.x, y: next.y - cur.y } : { x: cur.x - prev.x, y: cur.y - prev.y };
      const dOut = i === verts.length - 1 ? dIn : { x: next.x - cur.x, y: next.y - cur.y };
      const n1 = perpUnit(dIn.x, dIn.y);
      const n2 = perpUnit(dOut.x, dOut.y);
      const p1 = { x: cur.x + n1.x * signed, y: cur.y + n1.y * signed, z: cur.z };
      const p2 = { x: cur.x + n2.x * signed, y: cur.y + n2.y * signed, z: cur.z };
      const hit = i === 0 || i === verts.length - 1 ? p1 : lineIntersect(p1, dIn, p2, dOut) ?? p1;
      const fromCur = hypot2(cur.x, cur.y, hit.x, hit.y);
      if (fromCur > dist * 8) {
        offsets.push(p1);
      } else {
        offsets.push(hit);
      }
    }
  } else {
    for (let i = 0; i < verts.length; i++) {
      const prev = verts[(i - 1 + verts.length) % verts.length];
      const cur = verts[i];
      const next = verts[(i + 1) % verts.length];
      const dIn = { x: cur.x - prev.x, y: cur.y - prev.y };
      const dOut = { x: next.x - cur.x, y: next.y - cur.y };
      const n1 = perpUnit(dIn.x, dIn.y);
      const n2 = perpUnit(dOut.x, dOut.y);
      const p1 = { x: cur.x + n1.x * signed, y: cur.y + n1.y * signed, z: cur.z };
      const p2 = { x: cur.x + n2.x * signed, y: cur.y + n2.y * signed, z: cur.z };
      const hit = lineIntersect(p1, dIn, p2, dOut) ?? p1;
      const fromCur = hypot2(cur.x, cur.y, hit.x, hit.y);
      offsets.push(fromCur > dist * 8 ? p1 : hit);
    }
    if (path.closed && pointInRing(click, verts) && signed > 0) {
      /* click inside with left-normal: already handled by sign */
    }
  }
  const next = dedupeVertices(offsets);
  if (next.length < 2) throw new Error("Offset inválido.");
  return { ...path, vertices: next, sourceType: "polyline" };
}

export function scalePath(path: CadPath, base: CadVertex, factor: number): CadPath {
  if (!(factor > 0) || !Number.isFinite(factor)) throw new Error("Informe um fator de escala maior que zero.");
  return {
    ...path,
    vertices: path.vertices.map((v) => ({
      x: base.x + (v.x - base.x) * factor,
      y: base.y + (v.y - base.y) * factor,
      z: v.z,
    })),
  };
}

export function scaleFactorFromClick(path: CadPath, base: CadVertex, click: CadVertex): number {
  let ref = 0;
  for (const v of path.vertices) {
    ref = Math.max(ref, hypot2(base.x, base.y, v.x, v.y));
  }
  const dest = hypot2(base.x, base.y, click.x, click.y);
  if (ref < MIN_LEN) throw new Error("Escolha um ponto base afastado do objeto.");
  return dest / ref;
}

export function mirrorPath(path: CadPath, a: CadVertex, b: CadVertex): CadPath {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < EPS) throw new Error("Clique dois pontos distintos para o eixo de espelhamento.");
  return {
    ...path,
    vertices: path.vertices.map((v) => {
      const t = ((v.x - a.x) * dx + (v.y - a.y) * dy) / lenSq;
      const px = a.x + t * dx;
      const py = a.y + t * dy;
      return { x: 2 * px - v.x, y: 2 * py - v.y, z: v.z };
    }),
  };
}

export function stretchPathVertex(path: CadPath, vertexIndex: number, to: CadVertex): CadPath {
  if (vertexIndex < 0 || vertexIndex >= path.vertices.length) {
    throw new Error("Vértice inválido para esticar.");
  }
  const vertices = path.vertices.map((v, i) => (i === vertexIndex ? { ...to, z: v.z } : v));
  return { ...path, vertices };
}

export function nearestVertexIndex(path: CadPath, point: CadVertex): number {
  let best = 0;
  let bestDist = Infinity;
  path.vertices.forEach((v, i) => {
    const d = hypot2(point.x, point.y, v.x, v.y);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

export function breakPathAtPoint(path: CadPath, click: CadVertex): CadPath[] {
  const proj = projectOnPath(path.vertices, path.closed, click);
  if (!proj) throw new Error("Clique sobre o objeto para quebrar.");
  const total = pathLength(path.vertices, path.closed);
  if (proj.station < MIN_LEN || total - proj.station < MIN_LEN) {
    if (path.closed) {
      const rotated = walkClosed(path.vertices, proj.station, proj.station + total);
      if (rotated.length < 2) throw new Error("Ponto inválido para quebrar.");
      return pathsFromSlices(path, [rotated]);
    }
    throw new Error("Clique no interior do objeto, não na extremidade.");
  }
  if (path.closed) {
    const opened = walkClosed(path.vertices, proj.station, proj.station + total);
    return pathsFromSlices(path, [opened]);
  }
  const a = sliceOpenPath(path.vertices, 0, proj.station);
  const b = sliceOpenPath(path.vertices, proj.station, total);
  return pathsFromSlices(path, [a, b]);
}

export function breakPathBetween(path: CadPath, clickA: CadVertex, clickB: CadVertex): CadPath[] {
  const pa = projectOnPath(path.vertices, path.closed, clickA);
  const pb = projectOnPath(path.vertices, path.closed, clickB);
  if (!pa || !pb) throw new Error("Clique dois pontos sobre o objeto.");
  if (Math.abs(pa.station - pb.station) < MIN_LEN) return breakPathAtPoint(path, clickA);
  const total = pathLength(path.vertices, path.closed);
  const s1 = Math.min(pa.station, pb.station);
  const s2 = Math.max(pa.station, pb.station);
  if (path.closed) {
    const keep = walkClosed(path.vertices, s2, s1);
    if (keep.length < 2) throw new Error("O intervalo eliminaria o objeto inteiro.");
    return pathsFromSlices(path, [keep]);
  }
  const kept: CadVertex[][] = [];
  if (s1 > MIN_LEN) kept.push(sliceOpenPath(path.vertices, 0, s1));
  if (total - s2 > MIN_LEN) kept.push(sliceOpenPath(path.vertices, s2, total));
  if (kept.length === 0) throw new Error("O intervalo eliminaria o objeto inteiro.");
  return pathsFromSlices(path, kept);
}

export function hitLinearEntity(
  entities: CadEntity[],
  sx: number,
  sy: number,
  worldToScreenFn: (x: number, y: number) => { sx: number; sy: number },
  allow: (entity: CadLineEntity | CadPolylineEntity) => boolean,
  thresholdPx = 10,
): CadLineEntity | CadPolylineEntity | null {
  for (const entity of [...entities].reverse()) {
    if (entity.type === "line") {
      if (!allow(entity)) continue;
      if (hitTestPolyline(sx, sy, [entity.start, entity.end], false, worldToScreenFn, thresholdPx)) {
        return entity;
      }
    }
    if (entity.type === "polyline") {
      if (!allow(entity)) continue;
      if (hitTestPolyline(sx, sy, entity.vertices, Boolean(entity.closed), worldToScreenFn, thresholdPx)) {
        return entity;
      }
    }
  }
  return null;
}

export function replacePaths(
  entities: CadEntity[],
  removeId: string,
  paths: CadPath[],
  newId: (prefix: string) => string,
): CadEntity[] {
  const source = entities.find((entity) => entity.id === removeId);
  const added = paths.map((path) =>
    pathToEntity(path, newId(path.sourceType === "line" ? "ln" : "pl"), source),
  );
  return [...entities.filter((e) => e.id !== removeId), ...added];
}

export function addPaths(
  entities: CadEntity[],
  paths: CadPath[],
  newId: (prefix: string) => string,
  source?: CadEntity,
): CadEntity[] {
  const added = paths.map((path) =>
    pathToEntity(path, newId(path.sourceType === "line" ? "ln" : "pl"), source),
  );
  return [...entities, ...added];
}
