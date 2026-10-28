import type { CadEntity, CadLineEntity, CadPointEntity, CadPolylineEntity, CadVertex } from "./types";
import { polygonCentroid, rotateVertex, translateVertex } from "./ai-geometry-utils";

export const CAD_EPSILON = 0.001;

export function roundCoord(n: number): number {
  return Math.round(n / CAD_EPSILON) * CAD_EPSILON;
}

export function roundVertex(v: CadVertex): CadVertex {
  return { x: roundCoord(v.x), y: roundCoord(v.y), z: roundCoord(v.z) };
}

export function newModifyId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function entityVertices(entity: CadEntity): CadVertex[] {
  if (entity.type === "point") return [{ x: entity.x, y: entity.y, z: entity.z }];
  if (entity.type === "line") return [entity.start, entity.end];
  return entity.vertices;
}

export function entityCentroid(entity: CadEntity): CadVertex {
  return polygonCentroid(entityVertices(entity));
}

export function transformEntity(entity: CadEntity, fn: (v: CadVertex) => CadVertex): CadEntity {
  if (entity.type === "point") {
    const v = roundVertex(fn({ x: entity.x, y: entity.y, z: entity.z }));
    return { ...entity, x: v.x, y: v.y, z: v.z };
  }
  if (entity.type === "line") {
    return { ...entity, start: roundVertex(fn(entity.start)), end: roundVertex(fn(entity.end)) };
  }
  return { ...entity, vertices: entity.vertices.map((v) => roundVertex(fn(v))) };
}

export function translateEntity(entity: CadEntity, dx: number, dy: number): CadEntity {
  return transformEntity(entity, (v) => ({ x: v.x + dx, y: v.y + dy, z: v.z }));
}

export function translateEntityPolar(entity: CadEntity, distM: number, azimuthDeg: number): CadEntity {
  return transformEntity(entity, (v) => translateVertex(v, distM, azimuthDeg));
}

export function rotateEntity(entity: CadEntity, center: CadVertex, angleDeg: number): CadEntity {
  return transformEntity(entity, (v) => rotateVertex(v, center, angleDeg));
}

export function scaleEntity(entity: CadEntity, base: CadVertex, factor: number): CadEntity {
  return transformEntity(entity, (v) => ({
    x: base.x + (v.x - base.x) * factor,
    y: base.y + (v.y - base.y) * factor,
    z: v.z,
  }));
}

export function entityLengthM(entity: CadEntity): number {
  if (entity.type === "point") return 0;
  const pts = entity.type === "line" ? [entity.start, entity.end] : entity.vertices;
  let sum = 0;
  const n = entity.type === "polyline" && entity.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

export function mirrorPoint(p: CadVertex, a: CadVertex, b: CadVertex): CadVertex {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < CAD_EPSILON * CAD_EPSILON) return { ...p };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const projx = a.x + t * dx;
  const projy = a.y + t * dy;
  return { x: 2 * projx - p.x, y: 2 * projy - p.y, z: p.z };
}

export function mirrorEntity(entity: CadEntity, a: CadVertex, b: CadVertex): CadEntity {
  return transformEntity(entity, (v) => mirrorPoint(v, a, b));
}

export function vertexInWindow(v: CadVertex, w0: CadVertex, w1: CadVertex): boolean {
  const minX = Math.min(w0.x, w1.x) - CAD_EPSILON;
  const maxX = Math.max(w0.x, w1.x) + CAD_EPSILON;
  const minY = Math.min(w0.y, w1.y) - CAD_EPSILON;
  const maxY = Math.max(w0.y, w1.y) + CAD_EPSILON;
  return v.x >= minX && v.x <= maxX && v.y >= minY && v.y <= maxY;
}

export function stretchEntity(
  entity: CadEntity,
  dx: number,
  dy: number,
  opts: { window?: [CadVertex, CadVertex]; indices?: number[] },
): CadEntity {
  const centroid = entityCentroid(entity);
  const move = (v: CadVertex, i: number) => {
    let selected = false;
    if (opts.indices != null) selected = opts.indices.includes(i);
    else if (opts.window) selected = vertexInWindow(v, opts.window[0], opts.window[1]);
    else if (Math.abs(dx) >= Math.abs(dy)) selected = dx >= 0 ? v.x >= centroid.x - CAD_EPSILON : v.x <= centroid.x + CAD_EPSILON;
    else selected = dy >= 0 ? v.y >= centroid.y - CAD_EPSILON : v.y <= centroid.y + CAD_EPSILON;
    return selected ? { x: v.x + dx, y: v.y + dy, z: v.z } : v;
  };
  if (entity.type === "point") {
    return move({ x: entity.x, y: entity.y, z: entity.z }, 0).x === entity.x &&
      move({ x: entity.x, y: entity.y, z: entity.z }, 0).y === entity.y
      ? entity
      : { ...entity, ...move({ x: entity.x, y: entity.y, z: entity.z }, 0) };
  }
  if (entity.type === "line") {
    return { ...entity, start: move(entity.start, 0), end: move(entity.end, 1) };
  }
  return { ...entity, vertices: entity.vertices.map((v, i) => move(v, i)) };
}

type Seg = { a: CadVertex; b: CadVertex };

function lineIntersection(s1: Seg, s2: Seg, infinite = false): CadVertex | null {
  const x1 = s1.a.x;
  const y1 = s1.a.y;
  const x2 = s1.b.x;
  const y2 = s1.b.y;
  const x3 = s2.a.x;
  const y3 = s2.a.y;
  const x4 = s2.b.x;
  const y4 = s2.b.y;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-12) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den;
  if (!infinite && (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9)) return null;
  return {
    x: x1 + t * (x2 - x1),
    y: y1 + t * (y2 - y1),
    z: (s1.a.z + s1.b.z) / 2,
  };
}

function entitySegments(entity: CadEntity): Seg[] {
  if (entity.type === "point") return [];
  if (entity.type === "line") return [{ a: entity.start, b: entity.end }];
  const pts = entity.vertices;
  const segs: Seg[] = [];
  const n = entity.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    segs.push({ a: pts[i], b: pts[(i + 1) % pts.length] });
  }
  return segs;
}

function offsetChain(pts: CadVertex[], dist: number): CadVertex[] {
  const segs: { a: CadVertex; b: CadVertex; nx: number; ny: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < CAD_EPSILON) continue;
    segs.push({ a, b, nx: -(b.y - a.y) / len, ny: (b.x - a.x) / len });
  }
  if (segs.length === 0) return [];
  const out: CadVertex[] = [
    {
      x: segs[0].a.x + segs[0].nx * dist,
      y: segs[0].a.y + segs[0].ny * dist,
      z: segs[0].a.z,
    },
  ];
  const miterLimit = Math.abs(dist) * 4;
  for (let i = 0; i < segs.length - 1; i++) {
    const s0 = segs[i];
    const s1 = segs[i + 1];
    const p1 = { x: s0.a.x + s0.nx * dist, y: s0.a.y + s0.ny * dist, z: s0.a.z };
    const p2 = { x: s0.b.x + s0.nx * dist, y: s0.b.y + s0.ny * dist, z: s0.b.z };
    const p3 = { x: s1.a.x + s1.nx * dist, y: s1.a.y + s1.ny * dist, z: s1.a.z };
    const p4 = { x: s1.b.x + s1.nx * dist, y: s1.b.y + s1.ny * dist, z: s1.b.z };
    const hit = lineIntersection({ a: p1, b: p2 }, { a: p3, b: p4 }, true);
    if (hit && Math.hypot(hit.x - s0.b.x, hit.y - s0.b.y) <= miterLimit) out.push(hit);
    else {
      out.push(p2);
      out.push(p3);
    }
  }
  const last = segs[segs.length - 1];
  out.push({ x: last.b.x + last.nx * dist, y: last.b.y + last.ny * dist, z: last.b.z });
  return out.map(roundVertex);
}

export function offsetSideFromPick(entity: CadEntity, pick: CadVertex): 1 | -1 {
  const pts = entityVertices(entity);
  if (pts.length < 2) return -1;
  const a = pts[0];
  const b = pts[1];
  const cross = (b.x - a.x) * (pick.y - a.y) - (b.y - a.y) * (pick.x - a.x);
  return cross >= 0 ? 1 : -1;
}

export function offsetEntity(entity: CadEntity, distance: number, side: 1 | -1): CadEntity | null {
  const dist = distance * side;
  if (entity.type === "point") return null;
  if (entity.type === "line") {
    const pts = offsetChain([entity.start, entity.end], dist);
    if (pts.length < 2) return null;
    return { ...entity, id: newModifyId("ln"), start: pts[0], end: pts[pts.length - 1] };
  }
  const closed = Boolean(entity.closed);
  const raw = entity.vertices;
  const chain = closed && raw.length >= 3 ? [...raw, raw[0]] : raw;
  const off = offsetChain(chain, dist);
  if (off.length < 2) return null;
  const vertices = closed && off.length >= 3 ? off.slice(0, -1) : off;
  return {
    ...entity,
    id: newModifyId("pl"),
    vertices,
    closed,
    name: entity.name ? `${entity.name} offset` : "Offset",
  };
}

function cloneAsPolyline(entity: CadEntity): CadPolylineEntity | null {
  if (entity.type === "point") return null;
  if (entity.type === "line") {
    return {
      id: entity.id,
      type: "polyline",
      layerId: entity.layerId,
      vertices: [entity.start, entity.end],
      closed: false,
    };
  }
  return entity;
}

export function trimEntity(target: CadEntity, boundary: CadEntity, click: CadVertex): CadEntity | null {
  const tSegs = entitySegments(target);
  const bSegs = entitySegments(boundary);
  let hit: { segIndex: number; point: CadVertex; t: number } | null = null;
  for (let i = 0; i < tSegs.length; i++) {
    for (const b of bSegs) {
      const p = lineIntersection(tSegs[i], b, false);
      if (!p) continue;
      const len = Math.hypot(tSegs[i].b.x - tSegs[i].a.x, tSegs[i].b.y - tSegs[i].a.y);
      const t = len < CAD_EPSILON ? 0 : Math.hypot(p.x - tSegs[i].a.x, p.y - tSegs[i].a.y) / len;
      if (!hit || Math.hypot(p.x - click.x, p.y - click.y) < Math.hypot(hit.point.x - click.x, hit.point.y - click.y)) {
        hit = { segIndex: i, point: p, t };
      }
    }
  }
  if (!hit) return null;
  const seg = tSegs[hit.segIndex];
  const dA = Math.hypot(click.x - seg.a.x, click.y - seg.a.y);
  const dB = Math.hypot(click.x - seg.b.x, click.y - seg.b.y);
  const keepStart = dA > dB;
  if (target.type === "line") {
    return keepStart
      ? { ...target, end: roundVertex(hit.point) }
      : { ...target, start: roundVertex(hit.point) };
  }
  if (target.type !== "polyline") return null;
  const pts = [...target.vertices];
  if (keepStart) {
    const next = pts.slice(0, hit.segIndex + 1);
    next.push(roundVertex(hit.point));
    return { ...target, vertices: next, closed: false };
  }
  const next = [roundVertex(hit.point), ...pts.slice(hit.segIndex + 1)];
  return { ...target, vertices: next, closed: false };
}

export function extendEntity(source: CadEntity, boundary: CadEntity, click: CadVertex): CadEntity | null {
  const segs = entitySegments(source);
  const bSegs = entitySegments(boundary);
  if (segs.length === 0) return null;
  const first = segs[0];
  const last = segs[segs.length - 1];
  const useStart = Math.hypot(click.x - first.a.x, click.y - first.a.y) <= Math.hypot(click.x - last.b.x, click.y - last.b.y);
  const ray: Seg = useStart
    ? { a: first.b, b: { x: first.a.x * 2 - first.b.x, y: first.a.y * 2 - first.b.y, z: first.a.z } }
    : { a: last.a, b: { x: last.b.x * 2 - last.a.x, y: last.b.y * 2 - last.a.y, z: last.b.z } };
  let best: CadVertex | null = null;
  let bestT = Infinity;
  for (const b of bSegs) {
    const p = lineIntersection({ a: useStart ? first.a : last.b, b: ray.b }, b, true);
    if (!p) continue;
    const origin = useStart ? first.a : last.b;
    const dirx = useStart ? first.a.x - first.b.x : last.b.x - last.a.x;
    const diry = useStart ? first.a.y - first.b.y : last.b.y - last.a.y;
    const t = (p.x - origin.x) * dirx + (p.y - origin.y) * diry;
    if (t <= CAD_EPSILON) continue;
    if (t < bestT) {
      bestT = t;
      best = p;
    }
  }
  if (!best) return null;
  if (source.type === "line") {
    return useStart ? { ...source, start: roundVertex(best) } : { ...source, end: roundVertex(best) };
  }
  if (source.type !== "polyline") return null;
  const pts = [...source.vertices];
  if (useStart) pts[0] = roundVertex(best);
  else pts[pts.length - 1] = roundVertex(best);
  return { ...source, vertices: pts };
}

function unit(a: CadVertex, b: CadVertex): { x: number; y: number; len: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  return len < CAD_EPSILON ? { x: 0, y: 0, len: 0 } : { x: dx / len, y: dy / len, len };
}

function tessellateArc(center: CadVertex, from: CadVertex, to: CadVertex, radius: number, steps = 8): CadVertex[] {
  const a0 = Math.atan2(from.y - center.y, from.x - center.x);
  const a1 = Math.atan2(to.y - center.y, to.x - center.x);
  let delta = a1 - a0;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const out: CadVertex[] = [];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const a = a0 + delta * t;
    out.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius, z: center.z });
  }
  return out;
}

export function filletTwoLines(
  a: CadLineEntity,
  b: CadLineEntity,
  radius: number,
): { a: CadLineEntity; b: CadLineEntity; arc: CadPolylineEntity } | null {
  if (!(radius > CAD_EPSILON)) return null;
  const hit = lineIntersection({ a: a.start, b: a.end }, { a: b.start, b: b.end }, true);
  if (!hit) return null;
  const ua = unit(hit, closerEnd(a, hit) === "start" ? a.end : a.start);
  const ub = unit(hit, closerEnd(b, hit) === "start" ? b.end : b.start);
  if (ua.len === 0 || ub.len === 0) return null;
  const cos = Math.max(-1, Math.min(1, ua.x * ub.x + ua.y * ub.y));
  const ang = Math.acos(cos);
  if (ang < 0.08 || ang > Math.PI - 0.08) return null;
  const trim = radius / Math.tan(ang / 2);
  const pa = { x: hit.x + ua.x * trim, y: hit.y + ua.y * trim, z: hit.z };
  const pb = { x: hit.x + ub.x * trim, y: hit.y + ub.y * trim, z: hit.z };
  const bisx = ua.x + ub.x;
  const bisy = ua.y + ub.y;
  const bisLen = Math.hypot(bisx, bisy);
  if (bisLen < 1e-9) return null;
  const centerDist = radius / Math.sin(ang / 2);
  const center = { x: hit.x + (bisx / bisLen) * centerDist, y: hit.y + (bisy / bisLen) * centerDist, z: hit.z };
  const nextA = replaceCloserEnd(a, hit, pa);
  const nextB = replaceCloserEnd(b, hit, pb);
  const arc: CadPolylineEntity = {
    id: newModifyId("arc"),
    type: "polyline",
    layerId: a.layerId,
    vertices: [roundVertex(pa), ...tessellateArc(center, pa, pb, radius), roundVertex(pb)],
    closed: false,
    name: "Concordância",
  };
  return { a: nextA, b: nextB, arc };
}

function closerEnd(line: CadLineEntity, p: CadVertex): "start" | "end" {
  const ds = Math.hypot(line.start.x - p.x, line.start.y - p.y);
  const de = Math.hypot(line.end.x - p.x, line.end.y - p.y);
  return ds <= de ? "start" : "end";
}

function replaceCloserEnd(line: CadLineEntity, p: CadVertex, next: CadVertex): CadLineEntity {
  return closerEnd(line, p) === "start" ? { ...line, start: roundVertex(next) } : { ...line, end: roundVertex(next) };
}

export function chamferTwoLines(
  a: CadLineEntity,
  b: CadLineEntity,
  d1: number,
  d2: number,
): { a: CadLineEntity; b: CadLineEntity; cut: CadLineEntity } | null {
  if (!(d1 > CAD_EPSILON) || !(d2 > CAD_EPSILON)) return null;
  const hit = lineIntersection({ a: a.start, b: a.end }, { a: b.start, b: b.end }, true);
  if (!hit) return null;
  const ua = unit(hit, closerEnd(a, hit) === "start" ? a.end : a.start);
  const ub = unit(hit, closerEnd(b, hit) === "start" ? b.end : b.start);
  if (ua.len === 0 || ub.len === 0) return null;
  const pa = { x: hit.x + ua.x * d1, y: hit.y + ua.y * d1, z: hit.z };
  const pb = { x: hit.x + ub.x * d2, y: hit.y + ub.y * d2, z: hit.z };
  return {
    a: replaceCloserEnd(a, hit, pa),
    b: replaceCloserEnd(b, hit, pb),
    cut: {
      id: newModifyId("ln"),
      type: "line",
      layerId: a.layerId,
      start: roundVertex(pa),
      end: roundVertex(pb),
    },
  };
}

export function filletPolylineCorner(entity: CadPolylineEntity, vertexIndex: number, radius: number): CadPolylineEntity | null {
  const pts = entity.vertices;
  if (pts.length < 3 || !(radius > CAD_EPSILON)) return null;
  const n = pts.length;
  const i = ((vertexIndex % n) + n) % n;
  const prev = pts[(i - 1 + n) % n];
  const curr = pts[i];
  const next = pts[(i + 1) % n];
  const dummyA: CadLineEntity = { id: "a", type: "line", layerId: entity.layerId, start: prev, end: curr };
  const dummyB: CadLineEntity = { id: "b", type: "line", layerId: entity.layerId, start: curr, end: next };
  const filleted = filletTwoLines(dummyA, dummyB, radius);
  if (!filleted) return null;
  const out = [...pts];
  out.splice(i, 1, filleted.arc.vertices[0], ...filleted.arc.vertices.slice(1));
  return { ...entity, vertices: out.map(roundVertex) };
}

export function explodeEntity(entity: CadEntity): CadLineEntity[] {
  const segs = entitySegments(entity);
  return segs
    .filter((s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > CAD_EPSILON)
    .map((s, i) => ({
      id: newModifyId("ln"),
      type: "line" as const,
      layerId: entity.layerId,
      start: roundVertex(s.a),
      end: roundVertex(s.b),
      name: `Linha ${i + 1}`,
    })) as CadLineEntity[];
}

function endpoints(entity: CadEntity): CadVertex[] {
  if (entity.type === "point") return [{ x: entity.x, y: entity.y, z: entity.z }];
  if (entity.type === "line") return [entity.start, entity.end];
  if (entity.closed) return [];
  const pts = entity.vertices;
  if (pts.length === 0) return [];
  return [pts[0], pts[pts.length - 1]];
}

function near(a: CadVertex, b: CadVertex): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= CAD_EPSILON * 8;
}

function asOpenChain(entity: CadEntity): CadVertex[] | null {
  if (entity.type === "point") return null;
  if (entity.type === "line") return [entity.start, entity.end];
  if (entity.closed) return null;
  return [...entity.vertices];
}

export function joinEntities(entities: CadEntity[]): CadPolylineEntity | null {
  const open = entities.filter((e) => asOpenChain(e));
  if (open.length < 2) return null;
  let chain = asOpenChain(open[0]);
  if (!chain) return null;
  const used = new Set<string>([open[0].id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const entity of open) {
      if (used.has(entity.id)) continue;
      const pts = asOpenChain(entity);
      if (!pts || pts.length < 2) continue;
      const head = chain[0];
      const tail = chain[chain.length - 1];
      const a0 = pts[0];
      const a1 = pts[pts.length - 1];
      if (near(tail, a0)) {
        chain = [...chain, ...pts.slice(1)];
        used.add(entity.id);
        grew = true;
      } else if (near(tail, a1)) {
        chain = [...chain, ...pts.slice(0, -1).reverse()];
        used.add(entity.id);
        grew = true;
      } else if (near(head, a1)) {
        chain = [...pts.slice(0, -1), ...chain];
        used.add(entity.id);
        grew = true;
      } else if (near(head, a0)) {
        chain = [...pts.slice(1).reverse(), ...chain];
        used.add(entity.id);
        grew = true;
      }
    }
  }
  if (used.size < 2) return null;
  return {
    id: newModifyId("pl"),
    type: "polyline",
    layerId: open[0].layerId,
    vertices: chain.map(roundVertex),
    closed: near(chain[0], chain[chain.length - 1]) && chain.length >= 4,
    name: "Polilinha unida",
  };
}

export function splitEntityEqual(entity: CadEntity, parts: number): CadEntity[] {
  const n = Math.max(2, Math.floor(parts));
  if (entity.type === "point") return [entity];
  if (entity.type === "line" || (entity.type === "polyline" && !entity.closed)) {
    const pts = entity.type === "line" ? [entity.start, entity.end] : entity.vertices;
    const total = entityLengthM(entity);
    if (total < CAD_EPSILON) return [entity];
    const step = total / n;
    const out: CadEntity[] = [];
    let acc = 0;
    let current: CadVertex[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      let a = pts[i];
      const b = pts[i + 1];
      let remain = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = remain < CAD_EPSILON ? 0 : (b.x - a.x) / remain;
      const uy = remain < CAD_EPSILON ? 0 : (b.y - a.y) / remain;
      while (remain > CAD_EPSILON && acc + remain >= step - CAD_EPSILON && out.length < n - 1) {
        const need = step - acc;
        const cut = { x: a.x + ux * need, y: a.y + uy * need, z: a.z };
        current.push(roundVertex(cut));
        out.push(chainToEntity(entity, current, out.length));
        current = [roundVertex(cut)];
        a = cut;
        remain -= need;
        acc = 0;
      }
      current.push(b);
      acc += remain;
    }
    if (current.length >= 2) out.push(chainToEntity(entity, current, out.length));
    return out.length >= 2 ? out : [entity];
  }
  const pts = entity.vertices;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const alongX = maxX - minX >= maxY - minY;
  const slices: CadEntity[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const ring = alongX
      ? [
          { x: minX + (maxX - minX) * t0, y: minY, z: 0 },
          { x: minX + (maxX - minX) * t1, y: minY, z: 0 },
          { x: minX + (maxX - minX) * t1, y: maxY, z: 0 },
          { x: minX + (maxX - minX) * t0, y: maxY, z: 0 },
        ]
      : [
          { x: minX, y: minY + (maxY - minY) * t0, z: 0 },
          { x: maxX, y: minY + (maxY - minY) * t0, z: 0 },
          { x: maxX, y: minY + (maxY - minY) * t1, z: 0 },
          { x: minX, y: minY + (maxY - minY) * t1, z: 0 },
        ];
    slices.push({
      ...(entity as CadPolylineEntity),
      id: newModifyId("pl"),
      vertices: ring.map(roundVertex),
      closed: true,
      name: entity.name ? `${entity.name} ${i + 1}` : `Parte ${i + 1}`,
    });
  }
  return slices;
}

function chainToEntity(source: CadEntity, chain: CadVertex[], index: number): CadEntity {
  if (source.type === "line" && chain.length === 2) {
    return { ...source, id: newModifyId("ln"), start: chain[0], end: chain[1] };
  }
  return {
    id: newModifyId("pl"),
    type: "polyline",
    layerId: source.layerId,
    vertices: chain.map(roundVertex),
    closed: false,
    name: `Trecho ${index + 1}`,
  };
}

export function arrayRectangular(entity: CadEntity, cols: number, rows: number, dx: number, dy: number): CadEntity[] {
  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));
  const out: CadEntity[] = [];
  for (let j = 0; j < r; j++) {
    for (let i = 0; i < c; i++) {
      if (i === 0 && j === 0) continue;
      const copy = translateEntity(entity, i * dx, j * dy);
      out.push({ ...copy, id: newModifyId(entity.type === "point" ? "pt" : entity.type === "line" ? "ln" : "pl") });
    }
  }
  return out;
}

export function arrayPolar(entity: CadEntity, center: CadVertex, count: number, sweepDeg = 360): CadEntity[] {
  const n = Math.max(2, Math.floor(count));
  const step = sweepDeg / n;
  const out: CadEntity[] = [];
  for (let i = 1; i < n; i++) {
    const copy = rotateEntity(entity, center, step * i);
    out.push({ ...copy, id: newModifyId(entity.type === "point" ? "pt" : entity.type === "line" ? "ln" : "pl") });
  }
  return out;
}

export function copyEntity(entity: CadEntity, dx: number, dy: number): CadEntity {
  const copy = translateEntity(entity, dx, dy);
  return { ...copy, id: newModifyId(entity.type === "point" ? "pt" : entity.type === "line" ? "ln" : "pl") };
}

export function azimuthFromDirection(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const t = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (/(leste|direita|east|right|\beste\b)/.test(t)) return 90;
  if (/(oeste|esquerda|west|left)/.test(t)) return 270;
  if (/(norte|cima|north|up)/.test(t)) return 0;
  if (/(sul|baixo|south|down)/.test(t)) return 180;
  return null;
}

export function displacementFromPolar(dist: number, azimuthDeg: number): { dx: number; dy: number } {
  const rad = (azimuthDeg * Math.PI) / 180;
  return { dx: dist * Math.sin(rad), dy: dist * Math.cos(rad) };
}

export function asLineEntity(entity: CadEntity): CadLineEntity | null {
  if (entity.type === "line") return entity;
  if (entity.type === "polyline" && entity.vertices.length === 2 && !entity.closed) {
    return {
      id: entity.id,
      type: "line",
      layerId: entity.layerId,
      start: entity.vertices[0],
      end: entity.vertices[1],
    };
  }
  return cloneAsPolyline(entity)
    ? entity.type === "polyline" && entity.vertices.length >= 2
      ? {
          id: entity.id,
          type: "line",
          layerId: entity.layerId,
          start: entity.vertices[0],
          end: entity.vertices[entity.vertices.length - 1],
        }
      : null
    : null;
}
