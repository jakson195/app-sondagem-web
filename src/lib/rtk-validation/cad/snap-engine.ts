import type { CadEntity, CadProject, CadVertex } from "./types";
import { worldToScreen, worldMetersPerPixel, type CadViewport } from "./viewport";

export const OSNAP_TOLERANCE_PX = 12;
export const GEOMETRY_EPSILON = 0.001;

export type OsnapType =
  | "ENDPOINT"
  | "MIDPOINT"
  | "CENTER"
  | "INTERSECTION"
  | "NEAREST"
  | "PERPENDICULAR"
  | "TANGENT"
  | "QUADRANT"
  | "NODE"
  | "INSERTION"
  | "EXTENSION"
  | "APPARENT_INTERSECTION";

export const OSNAP_TYPES: OsnapType[] = [
  "ENDPOINT",
  "MIDPOINT",
  "CENTER",
  "INTERSECTION",
  "PERPENDICULAR",
  "TANGENT",
  "QUADRANT",
  "NODE",
  "NEAREST",
  "EXTENSION",
  "INSERTION",
  "APPARENT_INTERSECTION",
];

export const DEFAULT_OSNAP_PRIORITY: OsnapType[] = [
  "ENDPOINT",
  "NODE",
  "INTERSECTION",
  "MIDPOINT",
  "CENTER",
  "QUADRANT",
  "INSERTION",
  "PERPENDICULAR",
  "TANGENT",
  "NEAREST",
  "EXTENSION",
  "APPARENT_INTERSECTION",
];

export const OSNAP_LABELS: Record<OsnapType, string> = {
  ENDPOINT: "Endpoint",
  MIDPOINT: "Midpoint",
  CENTER: "Center",
  INTERSECTION: "Intersection",
  NEAREST: "Nearest",
  PERPENDICULAR: "Perpendicular",
  TANGENT: "Tangent",
  QUADRANT: "Quadrant",
  NODE: "Node",
  INSERTION: "Insertion",
  EXTENSION: "Extension",
  APPARENT_INTERSECTION: "Apparent",
};

const SKIP_LAYER = /^(tin|contours|contours_interpolated|contour_labels|hypsometric|profile|transversal)/i;

export type SnapHit = {
  type: OsnapType;
  entityId: string;
  entityId2?: string;
  point: CadVertex;
  distance: number;
  guide?: { from: CadVertex; to: CadVertex };
};

export type SnapResult =
  | ({ snapped: true } & SnapHit)
  | { snapped: false; point: CadVertex };

export type OsnapModes = Record<OsnapType, boolean>;

export type OsnapSettings = {
  enabled: boolean;
  tolerancePx: number;
  modes: OsnapModes;
  priority: OsnapType[];
};

export const DEFAULT_OSNAP_MODES: OsnapModes = {
  ENDPOINT: true,
  MIDPOINT: true,
  CENTER: true,
  INTERSECTION: true,
  PERPENDICULAR: true,
  TANGENT: true,
  QUADRANT: true,
  NODE: true,
  NEAREST: true,
  EXTENSION: true,
  INSERTION: true,
  APPARENT_INTERSECTION: true,
};

export const DEFAULT_OSNAP_SETTINGS: OsnapSettings = {
  enabled: true,
  tolerancePx: OSNAP_TOLERANCE_PX,
  modes: { ...DEFAULT_OSNAP_MODES },
  priority: [...DEFAULT_OSNAP_PRIORITY],
};

const OSNAP_STORAGE_KEY = "datageo:cad-osnap";

export function loadOsnapSettings(): OsnapSettings {
  if (typeof window === "undefined") return { ...DEFAULT_OSNAP_SETTINGS, modes: { ...DEFAULT_OSNAP_MODES } };
  try {
    const raw = window.localStorage.getItem(OSNAP_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_OSNAP_SETTINGS, modes: { ...DEFAULT_OSNAP_MODES } };
    const parsed = JSON.parse(raw) as Partial<OsnapSettings>;
    return {
      enabled: parsed.enabled !== false,
      tolerancePx: Number.isFinite(parsed.tolerancePx) ? Number(parsed.tolerancePx) : OSNAP_TOLERANCE_PX,
      modes: { ...DEFAULT_OSNAP_MODES, ...(parsed.modes ?? {}) },
      priority: Array.isArray(parsed.priority) && parsed.priority.length ? parsed.priority : [...DEFAULT_OSNAP_PRIORITY],
    };
  } catch {
    return { ...DEFAULT_OSNAP_SETTINGS, modes: { ...DEFAULT_OSNAP_MODES } };
  }
}

export function saveOsnapSettings(settings: OsnapSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OSNAP_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* quota */
  }
}

export function roundSnapCoord(n: number): number {
  return Math.round(n / GEOMETRY_EPSILON) * GEOMETRY_EPSILON;
}

export function roundSnapVertex(v: CadVertex): CadVertex {
  return { x: roundSnapCoord(v.x), y: roundSnapCoord(v.y), z: roundSnapCoord(v.z ?? 0) };
}

type Seg = { a: CadVertex; b: CadVertex; entityId: string };

type BBox = { minX: number; minY: number; maxX: number; maxY: number };

export class SpatialIndex {
  private cells = new Map<string, string[]>();
  private boxes = new Map<string, BBox>();
  private cellSize: number;

  constructor(entities: CadEntity[], cellSize?: number) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const entity of entities) {
      if (SKIP_LAYER.test(entity.layerId)) continue;
      const box = bboxOf(entity);
      this.boxes.set(entity.id, box);
      minX = Math.min(minX, box.minX);
      minY = Math.min(minY, box.minY);
      maxX = Math.max(maxX, box.maxX);
      maxY = Math.max(maxY, box.maxY);
    }
    const span = Math.max(maxX - minX, maxY - minY, 1);
    this.cellSize = cellSize ?? Math.max(span / 40, 1);
    for (const [id, box] of this.boxes) {
      const x0 = Math.floor(box.minX / this.cellSize);
      const x1 = Math.floor(box.maxX / this.cellSize);
      const y0 = Math.floor(box.minY / this.cellSize);
      const y1 = Math.floor(box.maxY / this.cellSize);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const key = `${x}:${y}`;
          const list = this.cells.get(key);
          if (list) list.push(id);
          else this.cells.set(key, [id]);
        }
      }
    }
  }

  query(x: number, y: number, radius: number): string[] {
    const ids = new Set<string>();
    const x0 = Math.floor((x - radius) / this.cellSize);
    const x1 = Math.floor((x + radius) / this.cellSize);
    const y0 = Math.floor((y - radius) / this.cellSize);
    const y1 = Math.floor((y + radius) / this.cellSize);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const list = this.cells.get(`${cx}:${cy}`);
        if (!list) continue;
        for (const id of list) ids.add(id);
      }
    }
    return [...ids];
  }
}

export type SnapQuery = {
  screen: { sx: number; sy: number };
  world: CadVertex;
  viewport: CadViewport;
  entities: CadEntity[];
  index?: SpatialIndex;
  settings: OsnapSettings;
  reference?: CadVertex | null;
  overrideType?: OsnapType | null;
  excludeIds?: string[];
};

function bboxOf(entity: CadEntity): BBox {
  const pts = entityPoints(entity);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

export function entityPoints(entity: CadEntity): CadVertex[] {
  if (entity.type === "point") return [{ x: entity.x, y: entity.y, z: entity.z }];
  if (entity.type === "line") return [entity.start, entity.end];
  return entity.vertices;
}

export function entitySegments(entity: CadEntity): Seg[] {
  if (entity.type === "point") return [];
  if (entity.type === "line") return [{ a: entity.start, b: entity.end, entityId: entity.id }];
  const pts = entity.vertices;
  const n = entity.closed ? pts.length : pts.length - 1;
  const out: Seg[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (Math.hypot(b.x - a.x, b.y - a.y) > GEOMETRY_EPSILON) out.push({ a, b, entityId: entity.id });
  }
  return out;
}

function screenDist(viewport: CadViewport, point: CadVertex, sx: number, sy: number): number {
  const p = worldToScreen(point.x, point.y, viewport);
  return Math.hypot(p.sx - sx, p.sy - sy);
}

function lineIntersect(a: CadVertex, b: CadVertex, c: CadVertex, d: CadVertex, infinite = false): CadVertex | null {
  const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(den) < 1e-12) return null;
  const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den;
  const u = ((a.x - c.x) * (a.y - b.y) - (a.y - c.y) * (a.x - b.x)) / den;
  if (!infinite && (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9)) return null;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), z: (a.z + b.z) / 2 };
}

function projectOnLine(p: CadVertex, a: CadVertex, b: CadVertex): { point: CadVertex; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < GEOMETRY_EPSILON * GEOMETRY_EPSILON) return { point: { ...a }, t: 0 };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  return { point: { x: a.x + t * dx, y: a.y + t * dy, z: a.z }, t };
}

function centroidOf(pts: CadVertex[]): CadVertex {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  const n = Math.max(1, pts.length);
  return { x: x / n, y: y / n, z: z / n };
}

export function fitCircle(pts: CadVertex[]): { center: CadVertex; radius: number } | null {
  if (pts.length < 5) return null;
  const c = centroidOf(pts);
  const rs = pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y));
  const mean = rs.reduce((s, v) => s + v, 0) / rs.length;
  if (mean < GEOMETRY_EPSILON) return null;
  const variance = rs.reduce((s, v) => s + (v - mean) ** 2, 0) / rs.length;
  if (Math.sqrt(variance) / mean > 0.08) return null;
  return { center: c, radius: mean };
}

function circleFrom3(a: CadVertex, b: CadVertex, c: CadVertex): { center: CadVertex; radius: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const ux =
    ((a.x ** 2 + a.y ** 2) * (b.y - c.y) + (b.x ** 2 + b.y ** 2) * (c.y - a.y) + (c.x ** 2 + c.y ** 2) * (a.y - b.y)) / d;
  const uy =
    ((a.x ** 2 + a.y ** 2) * (c.x - b.x) + (b.x ** 2 + b.y ** 2) * (a.x - c.x) + (c.x ** 2 + c.y ** 2) * (b.x - a.x)) / d;
  const center = { x: ux, y: uy, z: a.z };
  return { center, radius: Math.hypot(a.x - ux, a.y - uy) };
}

function entityCircle(entity: CadEntity): { center: CadVertex; radius: number } | null {
  if (entity.type === "point") return null;
  const pts = entity.type === "line" ? [entity.start, entity.end] : entity.vertices;
  if (entity.type === "polyline" && !entity.closed && pts.length >= 3) {
    return circleFrom3(pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]);
  }
  if (entity.type === "polyline" && entity.closed && pts.length >= 5) return fitCircle(pts);
  return null;
}

function tangentPoints(from: CadVertex, center: CadVertex, radius: number): CadVertex[] {
  const dx = from.x - center.x;
  const dy = from.y - center.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= radius + GEOMETRY_EPSILON) return [];
  const ang = Math.atan2(dy, dx);
  const alpha = Math.acos(radius / dist);
  return [ang + alpha, ang - alpha].map((a) => ({
    x: center.x + radius * Math.cos(a),
    y: center.y + radius * Math.sin(a),
    z: from.z,
  }));
}

function consider(
  list: SnapHit[],
  viewport: CadViewport,
  sx: number,
  sy: number,
  tolerance: number,
  type: OsnapType,
  entityId: string,
  point: CadVertex,
  extra?: Partial<SnapHit>,
) {
  const distance = screenDist(viewport, point, sx, sy);
  if (distance > tolerance) return;
  list.push({ type, entityId, point: roundSnapVertex(point), distance, ...extra });
}

export function findEndpoint(entity: CadEntity): CadVertex[] {
  if (entity.type === "point") return [];
  return entityPoints(entity);
}

export function findMidpoint(entity: CadEntity): CadVertex[] {
  return entitySegments(entity).map((s) => ({
    x: (s.a.x + s.b.x) / 2,
    y: (s.a.y + s.b.y) / 2,
    z: (s.a.z + s.b.z) / 2,
  }));
}

export function findCenter(entity: CadEntity): CadVertex[] {
  const circle = entityCircle(entity);
  if (circle) return [circle.center];
  if (entity.type === "polyline" && entity.closed && entity.vertices.length >= 3) {
    return [centroidOf(entity.vertices)];
  }
  return [];
}

export function findQuadrant(entity: CadEntity): CadVertex[] {
  const circle = entityCircle(entity);
  if (!circle) return [];
  const { center: c, radius: r } = circle;
  return [
    { x: c.x, y: c.y + r, z: c.z },
    { x: c.x, y: c.y - r, z: c.z },
    { x: c.x - r, y: c.y, z: c.z },
    { x: c.x + r, y: c.y, z: c.z },
  ];
}

export function findNode(entity: CadEntity): CadVertex[] {
  if (entity.type !== "point") return [];
  return [{ x: entity.x, y: entity.y, z: entity.z }];
}

export function findInsertion(entity: CadEntity): CadVertex[] {
  if (entity.type === "point") return [{ x: entity.x, y: entity.y, z: entity.z }];
  return [];
}

export function findNearest(entity: CadEntity, cursor: CadVertex): CadVertex | null {
  if (entity.type === "point") return { x: entity.x, y: entity.y, z: entity.z };
  let best: CadVertex | null = null;
  let bestD = Infinity;
  for (const s of entitySegments(entity)) {
    const proj = projectOnLine(cursor, s.a, s.b);
    const t = Math.max(0, Math.min(1, proj.t));
    const p = { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t, z: s.a.z };
    const d = Math.hypot(p.x - cursor.x, p.y - cursor.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export function findPerpendicular(entity: CadEntity, from: CadVertex): CadVertex | null {
  let best: CadVertex | null = null;
  let bestD = Infinity;
  for (const s of entitySegments(entity)) {
    const proj = projectOnLine(from, s.a, s.b);
    const d = Math.hypot(proj.point.x - from.x, proj.point.y - from.y);
    if (d < bestD) {
      bestD = d;
      best = proj.point;
    }
  }
  return best;
}

export function findTangent(entity: CadEntity, from: CadVertex): CadVertex[] {
  const circle = entityCircle(entity);
  if (!circle) return [];
  return tangentPoints(from, circle.center, circle.radius);
}

export function findExtension(entity: CadEntity, cursor: CadVertex): { point: CadVertex; guide: { from: CadVertex; to: CadVertex } } | null {
  let best: { point: CadVertex; guide: { from: CadVertex; to: CadVertex }; d: number } | null = null;
  for (const s of entitySegments(entity)) {
    const proj = projectOnLine(cursor, s.a, s.b);
    if (proj.t >= -0.02 && proj.t <= 1.02) continue;
    const d = Math.hypot(proj.point.x - cursor.x, proj.point.y - cursor.y);
    const end = proj.t < 0 ? s.a : s.b;
    if (!best || d < best.d) {
      best = { point: proj.point, guide: { from: end, to: proj.point }, d };
    }
  }
  return best ? { point: best.point, guide: best.guide } : null;
}

export function findIntersection(a: CadEntity, b: CadEntity, apparent = false): CadVertex[] {
  const sa = entitySegments(a);
  const sb = entitySegments(b);
  const out: CadVertex[] = [];
  for (const s1 of sa) {
    for (const s2 of sb) {
      const hit = lineIntersect(s1.a, s1.b, s2.a, s2.b, apparent);
      if (!hit) continue;
      if (apparent) {
        const real = lineIntersect(s1.a, s1.b, s2.a, s2.b, false);
        if (real) continue;
      }
      out.push(hit);
    }
  }
  return out;
}

export function getSnapPoint(query: SnapQuery): SnapResult {
  const { screen, world, viewport, entities, settings, reference, overrideType, excludeIds } = query;
  const rawPoint = { x: world.x, y: world.y, z: world.z ?? 0 };
  if (!settings.enabled && !overrideType) return { snapped: false, point: rawPoint };

  const tolerance = Math.max(4, settings.tolerancePx || OSNAP_TOLERANCE_PX);
  const mpp = worldMetersPerPixel(viewport);
  const radiusM = tolerance * mpp * 2;
  const skip = new Set(excludeIds ?? []);
  const byId = new Map(entities.map((e) => [e.id, e]));
  const nearbyIds = (query.index ?? new SpatialIndex(entities)).query(world.x, world.y, radiusM);
  const nearby = nearbyIds
    .map((id) => byId.get(id))
    .filter((e): e is CadEntity => {
      if (!e) return false;
      return !skip.has(e.id) && !SKIP_LAYER.test(e.layerId);
    });

  const enabled = new Set<OsnapType>();
  if (overrideType) enabled.add(overrideType);
  else {
    for (const type of OSNAP_TYPES) {
      if (settings.modes[type]) enabled.add(type);
    }
  }

  const hits: SnapHit[] = [];
  const push = (type: OsnapType, entityId: string, point: CadVertex, extra?: Partial<SnapHit>) =>
    consider(hits, viewport, screen.sx, screen.sy, tolerance, type, entityId, point, extra);

  for (const entity of nearby) {
    if (enabled.has("ENDPOINT")) for (const p of findEndpoint(entity)) push("ENDPOINT", entity.id, p);
    if (enabled.has("NODE")) for (const p of findNode(entity)) push("NODE", entity.id, p);
    if (enabled.has("INSERTION")) for (const p of findInsertion(entity)) push("INSERTION", entity.id, p);
    if (enabled.has("MIDPOINT")) for (const p of findMidpoint(entity)) push("MIDPOINT", entity.id, p);
    if (enabled.has("CENTER")) for (const p of findCenter(entity)) push("CENTER", entity.id, p);
    if (enabled.has("QUADRANT")) for (const p of findQuadrant(entity)) push("QUADRANT", entity.id, p);
    if (enabled.has("PERPENDICULAR") && reference) {
      const p = findPerpendicular(entity, reference);
      if (p) push("PERPENDICULAR", entity.id, p);
    }
    if (enabled.has("TANGENT") && reference) {
      for (const p of findTangent(entity, reference)) push("TANGENT", entity.id, p);
    }
    if (enabled.has("EXTENSION")) {
      const ext = findExtension(entity, world);
      if (ext) push("EXTENSION", entity.id, ext.point, { guide: ext.guide });
    }
  }

  if (enabled.has("INTERSECTION") || enabled.has("APPARENT_INTERSECTION")) {
    for (let i = 0; i < nearby.length; i++) {
      for (let j = i + 1; j < nearby.length; j++) {
        if (enabled.has("INTERSECTION")) {
          for (const p of findIntersection(nearby[i], nearby[j], false)) {
            push("INTERSECTION", nearby[i].id, p, { entityId2: nearby[j].id });
          }
        }
        if (enabled.has("APPARENT_INTERSECTION")) {
          for (const p of findIntersection(nearby[i], nearby[j], true)) {
            push("APPARENT_INTERSECTION", nearby[i].id, p, { entityId2: nearby[j].id });
          }
        }
      }
    }
  }

  const specific = hits.filter((h) => h.type !== "NEAREST");
  if (enabled.has("NEAREST") && specific.length === 0) {
    for (const entity of nearby) {
      const p = findNearest(entity, world);
      if (p) push("NEAREST", entity.id, p);
    }
  }

  if (hits.length === 0) return { snapped: false, point: rawPoint };

  const order = overrideType ? [overrideType] : settings.priority.length ? settings.priority : DEFAULT_OSNAP_PRIORITY;
  const rank = new Map(order.map((type, i) => [type, i]));
  hits.sort((a, b) => {
    const ra = rank.get(a.type) ?? 99;
    const rb = rank.get(b.type) ?? 99;
    if (ra !== rb) return ra - rb;
    return a.distance - b.distance;
  });
  const best = hits[0];
  return { snapped: true, ...best };
}

export type NamedSnapSpec = {
  type: OsnapType;
  lote?: string;
  quadra?: string;
  nome?: string;
  entidade_id?: string;
  from?: CadVertex;
};

export function snapOnEntity(entity: CadEntity, type: OsnapType, from?: CadVertex): CadVertex | null {
  switch (type) {
    case "ENDPOINT": {
      const pts = findEndpoint(entity);
      if (!pts.length) return null;
      if (!from) return pts[0];
      return pts.slice().sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
    }
    case "MIDPOINT": {
      const pts = findMidpoint(entity);
      if (!pts.length) return null;
      if (!from) return pts[0];
      return pts.slice().sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
    }
    case "CENTER":
      return findCenter(entity)[0] ?? null;
    case "QUADRANT": {
      const pts = findQuadrant(entity);
      if (!pts.length) return null;
      if (!from) return pts[0];
      return pts.slice().sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
    }
    case "NODE":
      return findNode(entity)[0] ?? null;
    case "INSERTION":
      return findInsertion(entity)[0] ?? null;
    case "NEAREST":
      return from ? findNearest(entity, from) : findNearest(entity, entityPoints(entity)[0] ?? { x: 0, y: 0, z: 0 });
    case "PERPENDICULAR":
      return from ? findPerpendicular(entity, from) : null;
    case "TANGENT": {
      if (!from) return null;
      const pts = findTangent(entity, from);
      return pts[0] ?? null;
    }
    case "EXTENSION":
      return from ? findExtension(entity, from)?.point ?? null : null;
    default:
      return findCenter(entity)[0] ?? findEndpoint(entity)[0] ?? null;
  }
}

export function effectiveOsnapSettings(
  settings: OsnapSettings,
  snapToRtkPoints: boolean,
  overrideType?: OsnapType | null,
): OsnapSettings {
  if (overrideType) {
    const modes = { ...DEFAULT_OSNAP_MODES };
    for (const type of OSNAP_TYPES) modes[type] = type === overrideType;
    return { ...settings, enabled: true, modes, priority: [overrideType] };
  }
  if (settings.enabled) return settings;
  if (snapToRtkPoints) {
    const modes = { ...DEFAULT_OSNAP_MODES };
    for (const type of OSNAP_TYPES) modes[type] = type === "NODE";
    return { ...settings, enabled: true, modes, priority: ["NODE"] };
  }
  return { ...settings, enabled: false };
}

export class SnapEngine {
  constructor(
    public settings: OsnapSettings,
    public index?: SpatialIndex,
  ) {}

  getSnapPoint(
    query: Omit<SnapQuery, "settings" | "index"> & { settings?: OsnapSettings; index?: SpatialIndex },
  ): SnapResult {
    return getSnapPoint({
      ...query,
      settings: query.settings ?? this.settings,
      index: query.index ?? this.index,
    });
  }

  findEndpoint = findEndpoint;
  findMidpoint = findMidpoint;
  findCenter = findCenter;
  findIntersection = findIntersection;
  findPerpendicular = findPerpendicular;
  findTangent = findTangent;
  findQuadrant = findQuadrant;
  findNearest = findNearest;
  findExtension = findExtension;
  findNode = findNode;
  findInsertion = findInsertion;
}

export function parseOsnapType(raw?: string | null): OsnapType | null {
  if (!raw) return null;
  const key = raw
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "_");
  const aliases: Record<string, OsnapType> = {
    END: "ENDPOINT",
    ENDPOINT: "ENDPOINT",
    CANTO: "ENDPOINT",
    VERTICE: "ENDPOINT",
    MID: "MIDPOINT",
    MIDPOINT: "MIDPOINT",
    MEDIO: "MIDPOINT",
    CENTRO: "CENTER",
    CENTER: "CENTER",
    INT: "INTERSECTION",
    INTERSECTION: "INTERSECTION",
    INTERSECAO: "INTERSECTION",
    NEA: "NEAREST",
    NEAREST: "NEAREST",
    PROXIMO: "NEAREST",
    PERP: "PERPENDICULAR",
    PERPENDICULAR: "PERPENDICULAR",
    PERPENDICULARIDADE: "PERPENDICULAR",
    TAN: "TANGENT",
    TANGENT: "TANGENT",
    TANGENTE: "TANGENT",
    QUA: "QUADRANT",
    QUADRANT: "QUADRANT",
    QUADRANTE: "QUADRANT",
    NOD: "NODE",
    NODE: "NODE",
    INS: "INSERTION",
    INSERTION: "INSERTION",
    INSERCAO: "INSERTION",
    EXT: "EXTENSION",
    EXTENSION: "EXTENSION",
    EXTENSAO: "EXTENSION",
    APP: "APPARENT_INTERSECTION",
    APPARENT: "APPARENT_INTERSECTION",
    APPARENT_INTERSECTION: "APPARENT_INTERSECTION",
  };
  return aliases[key] ?? (OSNAP_TYPES.includes(key as OsnapType) ? (key as OsnapType) : null);
}
