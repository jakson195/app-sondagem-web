import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";

/**
 * Loteamento de UMA quadra com cobertura total: a união dos lotes é exatamente a quadra.
 *
 * 1. Testadas = arestas da quadra junto a via. Com via nos dois lados, a quadra é cortada
 *    pelo eixo médio entre as testadas opostas (profundidade adaptativa, costas com costas).
 * 2. N = floor(testada / largura); largura real = testada / N (lotes de esquina com peso 1 + %).
 * 3. Divisas perpendiculares à testada; cada faixa é intersectada com a quadra real.
 *    Fiadas paralelas usam a mesma grade, então as divisas de fundo se encontram.
 * 4. Pedaços abaixo da área ou testada mínima são fundidos ao vizinho de maior divisa comum.
 * 5. Resíduo (quadra − ∪lotes) é anexado aos lotes; a soma das áreas fecha a quadra.
 */

type Ring = Position[];
/** Anel externo + furos, anéis fechados. */
export type QuadraPoly = Ring[];

export type LotearQuadraOpts = {
  /** Largura desejada da testada (m). */
  testadaM: number;
  /** Área mínima do lote (m²). 0 = só testada. */
  areaMinimaM2?: number;
  /** Acréscimo % na largura dos lotes de esquina (ponta da fileira junto a outra via). */
  percentualEsquina?: number;
  /** Anéis externos das vias; arestas da quadra junto a eles são testadas. */
  streetRings?: Position[][];
  /**
   * Profundidade do lote (testada → fundo). Se a quadra tiver cerca do dobro
   * disto e rua nos dois lados, corta em duas fileiras — uma para cada rua.
   */
  profundidadeLoteM?: number;
};

export type LotearQuadraResult = {
  lots: QuadraPoly[];
  areaQuadraM2: number;
  areaLotesM2: number;
  residuoM2: number;
};

export const RESIDUO_TOL_M2 = 0.01;

const STREET_NEAR_M = 2.4;
const PARALLEL_DEG = 35;
const MIN_PIECE_M2 = 1e-4;

export class CoberturaQuadraError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoberturaQuadraError";
  }
}

// ---------------------------------------------------------------- geometria plana

function closeRing(ring: Ring): Ring {
  if (ring.length === 0) return ring;
  const f = ring[0];
  const l = ring[ring.length - 1];
  const out = ring.map((p) => [p[0], p[1]] as Position);
  if (f[0] !== l[0] || f[1] !== l[1]) out.push([f[0], f[1]]);
  return out;
}

function openRing(ring: Ring): Ring {
  if (ring.length < 2) return ring;
  const f = ring[0];
  const l = ring[ring.length - 1];
  return f[0] === l[0] && f[1] === l[1] ? ring.slice(0, -1) : ring;
}

function ringArea(ring: Ring): number {
  const pts = openRing(ring);
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    s += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return Math.abs(s) / 2;
}

export function quadraPolyAreaM2(poly: QuadraPoly): number {
  if (poly.length === 0) return 0;
  return Math.max(0, ringArea(poly[0]) - poly.slice(1).reduce((s, h) => s + ringArea(h), 0));
}

function centroidOf(ring: Ring): Position {
  const pts = openRing(ring);
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p[0];
    sy += p[1];
  }
  const n = Math.max(pts.length, 1);
  return [sx / n, sy / n];
}

function shift(poly: QuadraPoly, dx: number, dy: number): QuadraPoly {
  return poly.map((ring) => ring.map((p) => [p[0] + dx, p[1] + dy] as Position));
}

function edgesOf(poly: QuadraPoly): Array<[Position, Position]> {
  const out: Array<[Position, Position]> = [];
  for (const ring of poly) {
    const pts = openRing(ring);
    for (let i = 0; i < pts.length; i++) out.push([pts[i], pts[(i + 1) % pts.length]]);
  }
  return out;
}

function segLen(a: Position, b: Position): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function distPointSeg(px: number, py: number, s: Float64Array, i: number): number {
  const ax = s[i];
  const ay = s[i + 1];
  const vx = s[i + 2] - ax;
  const vy = s[i + 3] - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/** Segmentos das vias em coordenadas locais, empacotados para consulta rápida. */
class StreetIndex {
  private readonly segs: Float64Array;
  readonly empty: boolean;

  constructor(streetRings: Position[][], dx: number, dy: number) {
    const flat: number[] = [];
    for (const ring of streetRings) {
      const pts = openRing(ring);
      if (pts.length < 2) continue;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        flat.push(a[0] + dx, a[1] + dy, b[0] + dx, b[1] + dy);
      }
    }
    this.segs = Float64Array.from(flat);
    this.empty = flat.length === 0;
  }

  near(px: number, py: number): boolean {
    const s = this.segs;
    for (let i = 0; i < s.length; i += 4) {
      const minx = Math.min(s[i], s[i + 2]) - STREET_NEAR_M;
      const maxx = Math.max(s[i], s[i + 2]) + STREET_NEAR_M;
      if (px < minx || px > maxx) continue;
      const miny = Math.min(s[i + 1], s[i + 3]) - STREET_NEAR_M;
      const maxy = Math.max(s[i + 1], s[i + 3]) + STREET_NEAR_M;
      if (py < miny || py > maxy) continue;
      if (distPointSeg(px, py, s, i) <= STREET_NEAR_M) return true;
    }
    return false;
  }

  /** Aresta confronta via quando a maioria das amostras está junto ao meio-fio. */
  isFront(a: Position, b: Position): boolean {
    if (this.empty || segLen(a, b) < 0.05) return false;
    let hits = 0;
    for (const t of [0.15, 0.5, 0.85]) {
      if (this.near(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) hits += 1;
    }
    return hits >= 2;
  }
}

type Edge = { a: Position; b: Position; len: number; ang: number };

function foldAngle(rad: number): number {
  let a = rad % Math.PI;
  if (a < 0) a += Math.PI;
  return a;
}

function angDiffDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return (d * 180) / Math.PI;
}

function frontEdges(poly: QuadraPoly, streets: StreetIndex): Edge[] {
  return edgesOf(poly)
    .filter(([a, b]) => streets.isFront(a, b))
    .map(([a, b]) => ({ a, b, len: segLen(a, b), ang: foldAngle(Math.atan2(b[1] - a[1], b[0] - a[0])) }));
}

function frontageLength(poly: QuadraPoly, streets: StreetIndex): number {
  return frontEdges(poly, streets).reduce((s, e) => s + e.len, 0);
}

/** Comprimento de testada por rumo. Cada rua (cada direção) tem de cumprir a testada mínima. */
function frontageByDirection(poly: QuadraPoly, streets: StreetIndex): number[] {
  const groups: Array<{ ang: number; len: number }> = [];
  for (const e of frontEdges(poly, streets)) {
    const group = groups.find((g) => angDiffDeg(g.ang, e.ang) <= 20);
    if (group) group.len += e.len;
    else groups.push({ ang: e.ang, len: e.len });
  }
  return groups.map((g) => g.len);
}

/** Direção com maior comprimento de aresta alinhada (±20°). */
function dominantAngle(edges: Edge[]): number | null {
  let best: number | null = null;
  let bestScore = -1;
  for (const cand of edges) {
    let score = 0;
    let sx = 0;
    let sy = 0;
    for (const e of edges) {
      if (angDiffDeg(cand.ang, e.ang) > 20) continue;
      score += e.len;
      let a = e.ang;
      if (Math.abs(a - cand.ang) > Math.PI / 2) a += a < cand.ang ? Math.PI : -Math.PI;
      sx += Math.cos(a) * e.len;
      sy += Math.sin(a) * e.len;
    }
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = foldAngle(Math.atan2(sy, sx));
    }
  }
  return best;
}

function longestEdgeAngle(poly: QuadraPoly): number {
  let best = 0;
  let bestLen = -1;
  for (const [a, b] of edgesOf([poly[0]])) {
    const len = segLen(a, b);
    if (len > bestLen) {
      bestLen = len;
      best = foldAngle(Math.atan2(b[1] - a[1], b[0] - a[0]));
    }
  }
  return best;
}

/** Comprimento comum entre as bordas de dois polígonos (divisa compartilhada). */
export function sharedBoundaryM(a: QuadraPoly, b: QuadraPoly, tol = 0.05): number {
  const ea = edgesOf(a);
  const eb = edgesOf(b);
  let total = 0;
  for (const [p, q] of ea) {
    const len = segLen(p, q);
    if (len < 1e-6) continue;
    const ux = (q[0] - p[0]) / len;
    const uy = (q[1] - p[1]) / len;
    const minx = Math.min(p[0], q[0]) - tol;
    const maxx = Math.max(p[0], q[0]) + tol;
    const miny = Math.min(p[1], q[1]) - tol;
    const maxy = Math.max(p[1], q[1]) + tol;
    for (const [r, s] of eb) {
      if (Math.max(r[0], s[0]) < minx || Math.min(r[0], s[0]) > maxx) continue;
      if (Math.max(r[1], s[1]) < miny || Math.min(r[1], s[1]) > maxy) continue;
      const dr = Math.abs((r[0] - p[0]) * uy - (r[1] - p[1]) * ux);
      const ds = Math.abs((s[0] - p[0]) * uy - (s[1] - p[1]) * ux);
      if (dr > tol || ds > tol) continue;
      const tr = (r[0] - p[0]) * ux + (r[1] - p[1]) * uy;
      const ts = (s[0] - p[0]) * ux + (s[1] - p[1]) * uy;
      const lo = Math.max(0, Math.min(tr, ts));
      const hi = Math.min(len, Math.max(tr, ts));
      if (hi > lo) total += hi - lo;
    }
  }
  return total;
}

// ---------------------------------------------------------------- turf (polyclip)

/**
 * Grades de arredondamento (1/m). O polyclip trava com resíduos como -2e-15 ao lado de
 * valores inteiros; arredondar a 1 µm resolve quase sempre, as grades seguintes são reserva.
 */
const GRIDS = [1e6, 1e5, 1e4];

function feat(poly: QuadraPoly, grid = GRIDS[0]): Feature<Polygon> {
  const q = (v: number) => Math.round(v * grid) / grid;
  return turf.polygon(poly.map((ring) => closeRing(dedupe(ring.map((p) => [q(p[0]), q(p[1])] as Position)))));
}

function dedupe(ring: Ring): Ring {
  const out: Ring = [];
  for (const p of openRing(ring)) {
    const last = out[out.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    out.push(p);
  }
  return out;
}

function clip<T>(op: (grid: number) => T): T | null {
  for (const grid of GRIDS) {
    try {
      return op(grid);
    } catch {
      /* polyclip não fechou o anel nesta grade */
    }
  }
  return null;
}

function polysOf(f: Feature<Polygon | MultiPolygon> | null | undefined): QuadraPoly[] {
  if (!f?.geometry) return [];
  const raw = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  return raw
    .map((poly) => poly.map((ring) => closeRing(ring as Ring)))
    .filter((poly) => poly.length > 0 && quadraPolyAreaM2(poly) > MIN_PIECE_M2);
}

function intersect(a: QuadraPoly, b: QuadraPoly): QuadraPoly[] {
  return clip((g) => polysOf(turf.intersect(turf.featureCollection([feat(a, g), feat(b, g)])))) ?? [];
}

/** a − ∪b. `null` quando o polyclip não consegue calcular em nenhuma grade. */
function differenceOrNull(a: QuadraPoly, b: QuadraPoly[]): QuadraPoly[] | null {
  if (b.length === 0) return [a];
  const once = clip((g) => {
    const fc = turf.featureCollection([feat(a, g), ...b.map((p) => feat(p, g))]);
    return polysOf(turf.difference(fc));
  });
  if (once) return once;
  let rest: QuadraPoly[] = [a];
  for (const cut of b) {
    const next: QuadraPoly[] = [];
    for (const r of rest) {
      const d = clip((g) => polysOf(turf.difference(turf.featureCollection([feat(r, g), feat(cut, g)]))));
      if (!d) return null;
      next.push(...d);
    }
    rest = next;
  }
  return rest;
}

function difference(a: QuadraPoly, b: QuadraPoly[]): QuadraPoly[] {
  return differenceOrNull(a, b) ?? [];
}

/**
 * Insere em `target` os vértices de `source` que caem sobre suas arestas (junção em T).
 * Sem isso o polyclip vê uma fresta de 1e-14 m e a união devolve dois polígonos.
 */
function insertTJunctions(target: QuadraPoly, source: QuadraPoly, tol = 1e-6): QuadraPoly {
  const verts = source.flatMap((ring) => openRing(ring));
  return target.map((ring) => {
    const pts = openRing(ring);
    const out: Ring = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      out.push(a);
      const len = segLen(a, b);
      if (len < 1e-9) continue;
      const ux = (b[0] - a[0]) / len;
      const uy = (b[1] - a[1]) / len;
      const onEdge: Array<[number, Position]> = [];
      for (const v of verts) {
        const t = (v[0] - a[0]) * ux + (v[1] - a[1]) * uy;
        if (t <= tol || t >= len - tol) continue;
        if (Math.abs((v[0] - a[0]) * uy - (v[1] - a[1]) * ux) > tol) continue;
        onEdge.push([t, v]);
      }
      onEdge.sort((x, y) => x[0] - y[0]);
      for (const [, v] of onEdge) out.push([v[0], v[1]]);
    }
    return closeRing(out);
  });
}

function unionTwo(a: QuadraPoly, b: QuadraPoly): QuadraPoly[] {
  const a2 = insertTJunctions(a, b);
  const b2 = insertTJunctions(b, a);
  return clip((g) => polysOf(turf.union(turf.featureCollection([feat(a2, g), feat(b2, g)])))) ?? [];
}

// ---------------------------------------------------------------- fileiras

type Frame = { ux: number; uy: number; nx: number; ny: number };

function frameOf(angle: number): Frame {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  return { ux, uy, nx: -uy, ny: ux };
}

function toXY(f: Frame, s: number, v: number): Position {
  return [s * f.ux + v * f.nx, s * f.uy + v * f.ny];
}

/** Extremos em v (perpendicular à testada) da quadra na abscissa s. */
function vRangeAt(outer: Ring, f: Frame, s: number): [number, number] | null {
  const pts = openRing(outer);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const sa = a[0] * f.ux + a[1] * f.uy;
    const sb = b[0] * f.ux + b[1] * f.uy;
    const va = a[0] * f.nx + a[1] * f.ny;
    const vb = b[0] * f.nx + b[1] * f.ny;
    if (s < Math.min(sa, sb) - 1e-9 || s > Math.max(sa, sb) + 1e-9) continue;
    if (Math.abs(sb - sa) < 1e-9) {
      lo = Math.min(lo, va, vb);
      hi = Math.max(hi, va, vb);
      continue;
    }
    const v = va + ((s - sa) / (sb - sa)) * (vb - va);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return Number.isFinite(lo) ? [lo, hi] : null;
}

/** Trechos ao longo da testada em que a largura da quadra (perpendicular) cabe `minWidth`. */
function widthIntervals(outer: Ring, f: Frame, minWidth: number): Array<[number, number]> {
  const pts = openRing(outer);
  const vertexS = pts.map((p) => p[0] * f.ux + p[1] * f.uy);
  const s0 = Math.min(...vertexS);
  const s1 = Math.max(...vertexS);
  if (!(s1 - s0 > 1e-6)) return [];
  const step = Math.min(0.25, (s1 - s0) / 400);
  const samples: number[] = [];
  for (let s = s0; s < s1; s += step) samples.push(s);
  samples.push(s1);
  const sVals = [...new Set([...samples, ...vertexS].map((s) => Math.round(s * 1000) / 1000))].sort(
    (a, b) => a - b,
  );
  const runs: Array<[number, number]> = [];
  let runStart: number | null = null;
  for (let i = 0; i < sVals.length - 1; i++) {
    const s0 = sVals[i];
    const s1 = sVals[i + 1];
    const range = vRangeAt(outer, f, (s0 + s1) / 2);
    const ok = range != null && range[1] - range[0] + 0.02 >= minWidth;
    if (ok && runStart == null) runStart = s0;
    if (!ok && runStart != null) {
      runs.push([runStart, s0]);
      runStart = null;
    }
  }
  if (runStart != null) runs.push([runStart, sVals[sVals.length - 1]]);
  return runs;
}

function sSlab(f: Frame, s0: number, s1: number, reach: number): QuadraPoly {
  return [
    closeRing([
      toXY(f, s0, -reach),
      toXY(f, s1, -reach),
      toXY(f, s1, reach),
      toXY(f, s0, reach),
    ]),
  ];
}

/**
 * Semiplano "abaixo" do eixo médio entre as duas testadas opostas.
 * O eixo é a média de v_min(s) e v_max(s) em cada vértice — segue a forma da quadra.
 */
function lowerHalfCutter(outer: Ring, f: Frame, reach: number): QuadraPoly | null {
  const pts = openRing(outer);
  const sVals = [...new Set(pts.map((p) => +(p[0] * f.ux + p[1] * f.uy).toFixed(6)))].sort((a, b) => a - b);
  if (sVals.length < 2) return null;
  let vMin = Infinity;
  for (const p of pts) vMin = Math.min(vMin, p[0] * f.nx + p[1] * f.ny);
  /** Limites à esquerda e à direita de cada vértice: o eixo acompanha degraus da quadra. */
  const eps = 1e-4;
  const samples: number[] = [];
  sVals.forEach((s, i) => {
    if (i > 0) samples.push(s - eps);
    if (i < sVals.length - 1) samples.push(s + eps);
  });
  const mid: Array<[number, number]> = [];
  for (const s of samples) {
    const r = vRangeAt(outer, f, s);
    if (r) mid.push([s, (r[0] + r[1]) / 2]);
  }
  if (mid.length < 2) return null;
  const bottom = vMin - reach;
  const ring: Ring = [
    toXY(f, mid[0][0] - reach, bottom),
    toXY(f, mid[0][0] - reach, mid[0][1]),
    ...mid.map(([s, v]) => toXY(f, s, v)),
    toXY(f, mid[mid.length - 1][0] + reach, mid[mid.length - 1][1]),
    toXY(f, mid[mid.length - 1][0] + reach, bottom),
  ];
  return [closeRing(ring)];
}

type Side = "low" | "high";

function edgeSide(outer: Ring, f: Frame, e: Edge): Side | null {
  const mx = (e.a[0] + e.b[0]) / 2;
  const my = (e.a[1] + e.b[1]) / 2;
  const r = vRangeAt(outer, f, mx * f.ux + my * f.uy);
  if (!r) return null;
  const v = mx * f.nx + my * f.ny;
  return v - r[0] <= r[1] - v ? "low" : "high";
}

/** Fiadas com testadas a menos disso (graus) usam a mesma grade de divisas. */
const ALIGN_ROWS_DEG = 3;

type RowFrame = {
  angle: number;
  tMin: number;
  tMax: number;
  cornerStart: boolean;
  cornerEnd: boolean;
};

/** Direção e extensão da testada de uma fileira, com as pontas que são esquina. */
function rowFrameOf(
  row: QuadraPoly,
  streets: StreetIndex,
  mainAngle: number,
  cornerExtra: number,
  forcedAngle?: number,
): RowFrame | null {
  const fronts = frontEdges(row, streets);
  const parallel = fronts.filter((e) => angDiffDeg(e.ang, mainAngle) <= PARALLEL_DEG);
  const chosen = parallel.length > 0 ? parallel : fronts;
  if (chosen.length === 0) return null;

  const angle = forcedAngle ?? dominantAngle(chosen) ?? mainAngle;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const tOf = (p: Position) => p[0] * dx + p[1] * dy;
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const e of chosen) {
    for (const p of [e.a, e.b]) {
      tMin = Math.min(tMin, tOf(p));
      tMax = Math.max(tMax, tOf(p));
    }
  }
  if (!(tMax - tMin > 0)) return null;
  const crossing = fronts.filter((e) => angDiffDeg(e.ang, angle) > PARALLEL_DEG);
  return {
    angle,
    tMin,
    tMax,
    cornerStart: cornerExtra > 0 && crossing.some((e) => Math.min(tOf(e.a), tOf(e.b)) <= tMin + 1),
    cornerEnd: cornerExtra > 0 && crossing.some((e) => Math.max(tOf(e.a), tOf(e.b)) >= tMax - 1),
  };
}

/** n − 1 divisas internas em [t0, t0 + L]; esquinas com peso 1 + cornerExtra. */
function gridCuts(t0: number, L: number, n: number, startExtra: number, endExtra: number): number[] {
  const weights = Array.from({ length: n }, () => 1);
  weights[0] += startExtra;
  weights[n - 1] += endExtra;
  const unit = L / weights.reduce((s, w) => s + w, 0);
  const cuts: number[] = [];
  let acc = t0;
  for (let i = 0; i < n - 1; i++) {
    acc += weights[i] * unit;
    cuts.push(acc);
  }
  return cuts;
}

/** Faixa t0 ≤ t ≤ t1 ao longo de `angle`. */
function slabOf(angle: number, t0: number, t1: number, reach: number): QuadraPoly {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const px = -dy;
  const py = dx;
  return [
    closeRing([
      [t0 * dx - reach * px, t0 * dy - reach * py],
      [t1 * dx - reach * px, t1 * dy - reach * py],
      [t1 * dx + reach * px, t1 * dy + reach * py],
      [t0 * dx + reach * px, t0 * dy + reach * py],
    ]),
  ];
}

/** Faixas entre as divisas (perpendiculares a `angle`), intersectadas com a fileira. */
function slabPieces(row: QuadraPoly, angle: number, cuts: number[], reach: number): QuadraPoly[] {
  const bounds = [-reach, ...cuts, reach];
  const pieces: QuadraPoly[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    pieces.push(...intersect(row, slabOf(angle, bounds[i], bounds[i + 1], reach)));
  }
  return pieces;
}

/**
 * Com profundidade variável, N máximo pode deixar faixas abaixo da área mínima que viram
 * lote duplo na fusão. Um lote a menos redistribui esse déficit pela fileira inteira.
 */
function pickBestN(
  nMax: number,
  build: (n: number) => QuadraPoly[],
  streets: StreetIndex,
  testadaM: number,
  areaMinimaM2: number,
): QuadraPoly[] | null {
  let best: { pieces: QuadraPoly[]; lots: number; maxArea: number } | null = null;
  for (let n = nMax; n >= Math.max(1, nMax - 3); n--) {
    const pieces = build(n);
    if (pieces.length === 0) continue;
    const merged = mergeSmallPieces(pieces, streets, testadaM, areaMinimaM2, true);
    const maxArea = Math.max(...merged.map(quadraPolyAreaM2));
    if (
      !best ||
      merged.length > best.lots ||
      (merged.length === best.lots && maxArea < best.maxArea - 1e-6)
    ) {
      best = { pieces, lots: merged.length, maxArea };
    }
    if (merged.length === pieces.length) break;
  }
  return best?.pieces ?? null;
}

function maxLots(L: number, areaM2: number, testadaM: number, areaMinimaM2: number, extra: number): number {
  const byWidth = Math.floor(L / testadaM - extra + 1e-6);
  const byArea = areaMinimaM2 > 0 ? Math.floor(areaM2 / areaMinimaM2 - extra + 1e-6) : byWidth;
  let n = Math.max(1, Math.min(byWidth, byArea));
  /** O lote interno (peso 1) não pode ficar abaixo da testada por causa do acréscimo da esquina. */
  while (n > 1 && L / (n + extra) + 1e-6 < testadaM) n -= 1;
  return n;
}

/**
 * Corta uma fileira em faixas perpendiculares à testada. A testada inteira é distribuída:
 * lotes internos com peso 1 e lotes de esquina com peso 1 + cornerExtra.
 */
function sliceRow(
  row: QuadraPoly,
  streets: StreetIndex,
  mainAngle: number,
  testadaM: number,
  areaMinimaM2: number,
  cornerExtra: number,
  reach: number,
): QuadraPoly[] {
  const rf = rowFrameOf(row, streets, mainAngle, cornerExtra);
  if (!rf) return [row];
  const L = rf.tMax - rf.tMin;
  const startExtra = rf.cornerStart ? cornerExtra : 0;
  const endExtra = rf.cornerEnd ? cornerExtra : 0;
  const nMax = maxLots(L, quadraPolyAreaM2(row), testadaM, areaMinimaM2, startExtra + endExtra);
  if (nMax === 1) return [row];
  const build = (n: number) =>
    n === 1 ? [row] : slabPieces(row, rf.angle, gridCuts(rf.tMin, L, n, startExtra, endExtra), reach);
  return pickBestN(nMax, build, streets, testadaM, areaMinimaM2) ?? [row];
}

/**
 * Duas fiadas costas com costas cortadas pela MESMA grade de divisas no trecho comum,
 * para que as divisas de fundo se encontrem. O que uma fiada tiver além do trecho comum
 * vira lotes próprios (≥ testada) ou é somado ao lote da ponta. `null` = fiadas não paralelas.
 */
function sliceRowsAligned(
  rows: [QuadraPoly, QuadraPoly],
  streets: StreetIndex,
  mainAngle: number,
  testadaM: number,
  areaMinimaM2: number,
  cornerExtra: number,
  reach: number,
): QuadraPoly[] | null {
  const own = rows.map((r) => rowFrameOf(r, streets, mainAngle, cornerExtra));
  if (!own[0] || !own[1] || angDiffDeg(own[0].angle, own[1].angle) > ALIGN_ROWS_DEG) return null;
  const a0 = own[0].angle;
  let a1 = own[1].angle;
  if (Math.abs(a1 - a0) > Math.PI / 2) a1 += a1 < a0 ? Math.PI : -Math.PI;
  const angle = foldAngle(Math.atan2(Math.sin(a0) + Math.sin(a1), Math.cos(a0) + Math.cos(a1)));
  const frames = rows.map((r) => rowFrameOf(r, streets, mainAngle, cornerExtra, angle));
  if (!frames[0] || !frames[1]) return null;
  const fs = frames as RowFrame[];

  const A = Math.max(fs[0].tMin, fs[1].tMin);
  const B = Math.min(fs[0].tMax, fs[1].tMax);
  const L = B - A;
  if (L + 0.05 < testadaM) return null;

  const startExtra = fs.some((f) => f.cornerStart && f.tMin >= A - 1) ? cornerExtra : 0;
  const endExtra = fs.some((f) => f.cornerEnd && f.tMax <= B + 1) ? cornerExtra : 0;
  const extra = startExtra + endExtra;
  const nMax = Math.min(
    ...rows.map((row, i) => {
      const share = L / (fs[i].tMax - fs[i].tMin);
      return maxLots(L, quadraPolyAreaM2(row) * share, testadaM, areaMinimaM2, extra);
    }),
  );

  /** Lotes que cabem na sobra: pela testada e, com fundo inclinado, também pela área. */
  const fits = (row: QuadraPoly, len: number, t0: number, t1: number) => {
    const byWidth = Math.floor(len / testadaM + 1e-6);
    if (byWidth === 0 || areaMinimaM2 <= 0) return byWidth;
    const area = intersect(row, slabOf(angle, t0, t1, reach)).reduce((s, p) => s + quadraPolyAreaM2(p), 0);
    return Math.min(byWidth, Math.floor(area / areaMinimaM2 + 1e-6));
  };
  const overhangCuts = fs.map((f, i) => {
    const before = A - f.tMin;
    const after = f.tMax - B;
    const kb = fits(rows[i], before, -reach, A);
    const ka = fits(rows[i], after, B, reach);
    return {
      start: Array.from({ length: kb }, (_, i) => f.tMin + (before * (i + 1)) / kb),
      end: Array.from({ length: ka }, (_, i) => B + (after * i) / ka),
    };
  });

  const build = (n: number) => {
    const grid = n === 1 ? [] : gridCuts(A, L, n, startExtra, endExtra);
    return rows.flatMap((row, i) =>
      slabPieces(row, angle, [...overhangCuts[i].start, ...grid, ...overhangCuts[i].end], reach),
    );
  };
  return pickBestN(nMax, build, streets, testadaM, areaMinimaM2);
}

// ---------------------------------------------------------------- fusão

/** Vizinhos ordenados pela divisa comum (maior primeiro). */
function neighborsBySharedBoundary(piece: QuadraPoly, others: QuadraPoly[], skip: number): number[] {
  const scored: Array<[number, number]> = [];
  for (let j = 0; j < others.length; j++) {
    if (j === skip) continue;
    const shared = sharedBoundaryM(piece, others[j]);
    if (shared > 1e-3) scored.push([shared, j]);
  }
  return scored.sort((x, y) => y[0] - x[0]).map(([, j]) => j);
}

function nearestByCentroid(piece: QuadraPoly, others: QuadraPoly[]): number {
  const c = centroidOf(piece[0]);
  let best = -1;
  let bestD = Infinity;
  for (let j = 0; j < others.length; j++) {
    const o = centroidOf(others[j][0]);
    const d = Math.hypot(o[0] - c[0], o[1] - c[1]);
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  }
  return best;
}

/** Funde pedaços abaixo da área/testada mínima ao vizinho de maior divisa comum. Nunca descarta. */
function mergeSmallPieces(
  pieces: QuadraPoly[],
  streets: StreetIndex,
  testadaM: number,
  areaMinimaM2: number,
  checkFrontage: boolean,
): QuadraPoly[] {
  const lots = [...pieces];
  const stuck = new Set<QuadraPoly>();
  const isBad = (p: QuadraPoly) => {
    if (areaMinimaM2 > 0 && quadraPolyAreaM2(p) + 1e-6 < areaMinimaM2) return true;
    if (checkFrontage) {
      const lens = frontageByDirection(p, streets);
      const main = lens.length > 0 ? Math.max(...lens) : frontageLength(p, streets);
      if (main + 0.05 < testadaM) return true;
    }
    return false;
  };
  for (let guard = 0; guard < pieces.length * 2 && lots.length > 1; guard++) {
    let idx = -1;
    let idxArea = Infinity;
    for (let i = 0; i < lots.length; i++) {
      if (stuck.has(lots[i]) || !isBad(lots[i])) continue;
      const a = quadraPolyAreaM2(lots[i]);
      if (a < idxArea) {
        idxArea = a;
        idx = i;
      }
    }
    if (idx < 0) break;
    let done = false;
    for (const j of neighborsBySharedBoundary(lots[idx], lots, idx)) {
      const merged = unionTwo(lots[idx], lots[j]);
      if (merged.length !== 1) continue;
      const keep = Math.min(idx, j);
      const drop = Math.max(idx, j);
      lots.splice(drop, 1);
      lots[keep] = merged[0];
      done = true;
      break;
    }
    if (!done) stuck.add(lots[idx]);
  }
  return lots;
}

// ---------------------------------------------------------------- validação

/**
 * resíduo = quadra − ∪lotes; cada parte > tolerância vai para o lote com maior divisa comum.
 * Garante soma(áreas) = área da quadra (± RESIDUO_TOL_M2) e ausência de sobreposição.
 */
export function fecharCoberturaQuadra(block: QuadraPoly, lots: QuadraPoly[]): QuadraPoly[] {
  const blockArea = quadraPolyAreaM2(block);
  let out = lots.filter((l) => quadraPolyAreaM2(l) > MIN_PIECE_M2);
  if (out.length === 0) return [block.map(closeRing)];

  const sum = () => out.reduce((s, l) => s + quadraPolyAreaM2(l), 0);
  const attachResidue = () => {
    const queue = difference(block, out).filter((r) => quadraPolyAreaM2(r) > RESIDUO_TOL_M2);
    for (let guard = 0; queue.length > 0 && guard < 64; guard++) {
      const part = queue.shift()!;
      const j = neighborsBySharedBoundary(part, out, -1)[0] ?? nearestByCentroid(part, out);
      const merged = unionTwo(out[j], part);
      if (merged.length === 0) continue;
      merged.sort((a, b) => quadraPolyAreaM2(b) - quadraPolyAreaM2(a));
      out[j] = merged[0];
      for (const extra of merged.slice(1)) {
        if (quadraPolyAreaM2(extra) > RESIDUO_TOL_M2) queue.push(extra);
      }
    }
  };

  attachResidue();
  if (Math.abs(sum() - blockArea) >= RESIDUO_TOL_M2) {
    const clipped: QuadraPoly[] = [];
    for (const lot of out) {
      const inside = intersect(block, lot).flatMap((p) => difference(p, clipped));
      if (inside.length === 0) continue;
      inside.sort((a, b) => quadraPolyAreaM2(b) - quadraPolyAreaM2(a));
      clipped.push(inside[0]);
    }
    out = clipped.length > 0 ? clipped : [block.map(closeRing)];
    attachResidue();
  }
  return out;
}

export function residuoQuadraM2(block: QuadraPoly, lots: QuadraPoly[]): number {
  const rest = differenceOrNull(block, lots);
  if (rest) return rest.reduce((s, p) => s + quadraPolyAreaM2(p), 0);
  return Math.max(0, quadraPolyAreaM2(block) - lots.reduce((s, l) => s + quadraPolyAreaM2(l), 0));
}

// ---------------------------------------------------------------- entrada

export function lotearQuadraCompleta(quadra: QuadraPoly, opts: LotearQuadraOpts): LotearQuadraResult {
  const outerWorld = openRing(quadra[0] ?? []);
  if (outerWorld.length < 3 || !(opts.testadaM > 0)) {
    return { lots: [], areaQuadraM2: 0, areaLotesM2: 0, residuoM2: 0 };
  }
  const [ox, oy] = centroidOf(outerWorld);
  const block = shift(
    quadra.filter((r) => openRing(r).length >= 3).map(closeRing),
    -ox,
    -oy,
  );
  const blockArea = quadraPolyAreaM2(block);
  const outer = block[0];
  const streets = new StreetIndex(opts.streetRings ?? [], -ox, -oy);
  const testadaM = opts.testadaM;
  const areaMin = opts.areaMinimaM2 && opts.areaMinimaM2 > 0 ? opts.areaMinimaM2 : 0;
  const cornerExtra =
    opts.percentualEsquina != null && Number.isFinite(opts.percentualEsquina)
      ? Math.max(0, opts.percentualEsquina) / 100
      : 0;

  const fronts = frontEdges(block, streets);
  const mainAngle = dominantAngle(fronts) ?? longestEdgeAngle(block);
  const f = frameOf(mainAngle);

  let lowLen = 0;
  let highLen = 0;
  for (const e of fronts) {
    if (angDiffDeg(e.ang, mainAngle) > PARALLEL_DEG) continue;
    const side = edgeSide(outer, f, e);
    if (side === "low") lowLen += e.len;
    else if (side === "high") highLen += e.len;
  }
  let sMin = Infinity;
  let sMax = -Infinity;
  let reach = 10;
  for (const p of openRing(outer)) {
    const s = p[0] * f.ux + p[1] * f.uy;
    sMin = Math.min(sMin, s);
    sMax = Math.max(sMax, s);
    reach = Math.max(reach, 2 * Math.hypot(p[0], p[1]) + 10);
  }
  const meanDepth = blockArea / Math.max(sMax - sMin, 1e-6);
  const lotDepth = opts.profundidadeLoteM != null && opts.profundidadeLoteM > 0 ? opts.profundidadeLoteM : 0;
  const bothStreets = lowLen >= 2 && highLen >= 2;
  /**
   * Duas fileiras só cabem quando cada uma fica com pelo menos a profundidade do lote.
   * Metade de uma quadra mais estreita que 2 × profundidade fica abaixo do mínimo.
   */
  const designedPair =
    lotDepth > 0 &&
    bothStreets &&
    meanDepth + 0.5 >= lotDepth * 2 &&
    meanDepth <= lotDepth * 2.4 + 2;
  const classicTwo =
    lowLen + 0.05 >= testadaM &&
    highLen + 0.05 >= testadaM &&
    meanDepth / 2 + 0.05 >= testadaM;
  const twoRows = designedPair || classicTwo;

  /**
   * Trecho mais estreito que 2 × profundidade não entra nas duas fileiras (a metade ficaria
   * abaixo da profundidade mínima): vira uma fileira só, com o lote atravessando a quadra.
   */
  let lotBlock = block;
  let lotOuter = outer;
  let narrowParts: QuadraPoly[] = [];
  if (designedPair) {
    const runs = widthIntervals(outer, f, lotDepth * 2 - 0.02);
    const covered = runs.reduce((sum, [a, b]) => sum + (b - a), 0);
    if (runs.length > 0 && covered + 0.2 < sMax - sMin) {
      const longest = runs.reduce((best, r) => (r[1] - r[0] > best[1] - best[0] ? r : best));
      const parts = intersect(block, sSlab(f, longest[0], longest[1], reach));
      if (parts.length === 1 && quadraPolyAreaM2(parts[0]) > Math.max(areaMin, testadaM)) {
        lotBlock = parts[0];
        lotOuter = lotBlock[0];
        narrowParts = difference(block, [lotBlock]).filter((p) => quadraPolyAreaM2(p) > MIN_PIECE_M2);
      }
    }
  }

  let rows: QuadraPoly[] = [lotBlock];
  if (twoRows) {
    const cutter = lowerHalfCutter(lotOuter, f, reach);
    if (cutter) {
      const low = intersect(lotBlock, cutter);
      const high = difference(lotBlock, [cutter]);
      if (low.length > 0 && high.length > 0) rows = [...low, ...high];
    }
  }
  if (designedPair && rows.length === 2) {
    const shallowerThanLot = (row: QuadraPoly) => {
      const ring = row[0] ?? [];
      const covered = widthIntervals(ring, f, lotDepth - 0.02).reduce((sum, [a, b]) => sum + (b - a), 0);
      let s0 = Infinity;
      let s1 = -Infinity;
      for (const p of openRing(ring)) {
        const s = p[0] * f.ux + p[1] * f.uy;
        s0 = Math.min(s0, s);
        s1 = Math.max(s1, s);
      }
      return covered + 0.15 < s1 - s0;
    };
    if (rows.some(shallowerThanLot)) rows = [lotBlock];
  }
  if (rows.length === 2 && rows.some((row) => frontageLength(row, streets) + 0.05 < testadaM)) {
    rows = [lotBlock];
  }

  const aligned =
    rows.length === 2
      ? sliceRowsAligned([rows[0], rows[1]], streets, mainAngle, testadaM, areaMin, cornerExtra, reach)
      : null;
  const pieces = [
    ...(aligned ?? rows.flatMap((row) => sliceRow(row, streets, mainAngle, testadaM, areaMin, cornerExtra, reach))),
    ...narrowParts.flatMap((part) => sliceRow(part, streets, mainAngle, testadaM, areaMin, cornerExtra, reach)),
  ];
  const merged = mergeSmallPieces(pieces, streets, testadaM, areaMin, fronts.length > 0);
  const closed = fecharCoberturaQuadra(block, merged);

  const areaLotes = closed.reduce((s, l) => s + quadraPolyAreaM2(l), 0);
  const residuo = residuoQuadraM2(block, closed);
  /** Ruído numérico cresce com a quadra: 0,01 m² fixo reprova quadras grandes e inclinadas. */
  const tol = Math.max(RESIDUO_TOL_M2, blockArea * 5e-6);
  if (Math.abs(areaLotes - blockArea) >= tol || residuo > tol) {
    throw new CoberturaQuadraError(
      `Quadra não fechou: área ${blockArea.toFixed(3)} m², lotes ${areaLotes.toFixed(3)} m², resíduo ${residuo.toFixed(3)} m².`,
    );
  }

  return {
    lots: closed.map((poly) => shift(poly, ox, oy)),
    areaQuadraM2: blockArea,
    areaLotesM2: areaLotes,
    residuoM2: residuo,
  };
}
