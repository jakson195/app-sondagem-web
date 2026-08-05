import type { CadEntity, CadPolylineEntity, CadVertex } from "./types";

export interface PolygonSegment {
  from: number;
  to: number;
  fromLabel: string;
  toLabel: string;
  distance: number;
  azimuthDeg: number;
}

export interface PolygonMetrics {
  areaM2: number;
  areaHa: number;
  perimeterM: number;
  segments: PolygonSegment[];
}

export function segmentDistance(a: CadVertex, b: CadVertex): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Azimute geodésico a partir do Norte (0–360°). */
export function azimuthFromNorth(a: CadVertex, b: CadVertex): number {
  const dE = b.x - a.x;
  const dN = b.y - a.y;
  let az = (Math.atan2(dE, dN) * 180) / Math.PI;
  if (az < 0) az += 360;
  return az;
}

export function formatAzimuthDms(degrees: number): string {
  const d = Math.floor(degrees);
  const mFloat = (degrees - d) * 60;
  const m = Math.floor(mFloat);
  const s = (mFloat - m) * 60;
  return `${d}° ${m}' ${s.toFixed(2)}"`;
}

export function formatDistanceMeters(m: number): string {
  return `${m.toFixed(2).replace(".", ",")} m`;
}

/** Coordenada com separador de milhar brasileiro (ex.: 7.007.136,17). */
export function formatCoordBr(value: number, decimals = 2): string {
  const fixed = value.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const negative = intPart.startsWith("-");
  const absInt = negative ? intPart.slice(1) : intPart;
  const withThousands = absInt.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${withThousands},${decPart}`;
}

export function formatAreaBr(m2: number): string {
  return `${formatCoordBr(m2, 2)} m²`;
}

/** Azimute DMS com segundos inteiros (ex.: 99°28'13"). */
export function formatAzimuthDmsInt(degrees: number): string {
  let d = Math.floor(degrees);
  const mFloat = (degrees - d) * 60;
  let m = Math.floor(mFloat);
  let s = Math.round((mFloat - m) * 60);
  if (s >= 60) {
    s = 0;
    m += 1;
  }
  if (m >= 60) {
    m = 0;
    d += 1;
  }
  if (d >= 360) d -= 360;
  return `${d}°${String(m).padStart(2, "0")}'${String(s).padStart(2, "0")}"`;
}

export function formatDistanceBr(m: number): string {
  return formatCoordBr(m, 2);
}

/** Etiqueta E/N em duas linhas para melhor leitura no desenho. */
export function formatVertexCoordLabel(x: number, y: number): string {
  return `E ${formatCoordBr(x)}\nN ${formatCoordBr(y)}`;
}

/** Divide rótulo em linhas SVG (quebras explícitas ou padrão "E … N …" na mesma linha). */
export function splitSvgLabelLines(label: string): string[] {
  const trimmed = label.trim();
  if (!trimmed) return [];

  if (trimmed.includes("\n")) {
    return trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const coordMatch = trimmed.match(/^E\s+(.+?)\s+N\s+(.+)$/i);
  if (coordMatch) {
    return [`E ${coordMatch[1].trim()}`, `N ${coordMatch[2].trim()}`];
  }

  return [trimmed];
}

export function vertexLabelsPn(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `P${i + 1}`);
}

export interface MemorialNarrativePart {
  text: string;
  bold?: boolean;
}

export interface MemorialNarrativeInput {
  vertices: CadVertex[];
  vertexLabels?: string[];
  crsLabel: string;
  projectionNote: string;
  appNote: string;
}

function pushNarrativePart(parts: MemorialNarrativePart[], text: string, bold = false) {
  const last = parts[parts.length - 1];
  if (last && last.bold === bold) {
    last.text += text;
  } else {
    parts.push({ text, bold });
  }
}

/** Parágrafo narrativo único no formato REV3 (N antes de E, rótulos Pn). */
export function buildMemorialNarrative(input: MemorialNarrativeInput): MemorialNarrativePart[] {
  if (input.vertices.length < 3) {
    return [{ text: "Polígono deve estar fechado com pelo menos 3 vértices." }];
  }

  const labels = input.vertexLabels ?? vertexLabelsPn(input.vertices.length);
  const metrics = computePolygonMetrics(input.vertices, true, labels);
  const parts: MemorialNarrativePart[] = [];

  const v0 = input.vertices[0];
  const p0 = labels[0] ?? "P1";

  pushNarrativePart(parts, "Inicia-se a descrição deste perímetro no vértice ");
  pushNarrativePart(parts, p0, true);
  pushNarrativePart(parts, ", de coordenadas N ");
  pushNarrativePart(parts, formatCoordBr(v0.y), true);
  pushNarrativePart(parts, " m. e E ");
  pushNarrativePart(parts, formatCoordBr(v0.x), true);
  pushNarrativePart(parts, " m.;");

  for (const seg of metrics.segments) {
    const dest = input.vertices[seg.to];
    pushNarrativePart(parts, " deste, segue com azimute de ");
    pushNarrativePart(parts, formatAzimuthDmsInt(seg.azimuthDeg), true);
    pushNarrativePart(parts, " e distância de ");
    pushNarrativePart(parts, formatDistanceBr(seg.distance), true);
    pushNarrativePart(parts, " m., até o vértice ");
    pushNarrativePart(parts, seg.toLabel, true);
    pushNarrativePart(parts, ", de coordenadas N ");
    pushNarrativePart(parts, formatCoordBr(dest.y), true);
    pushNarrativePart(parts, " m. e E ");
    pushNarrativePart(parts, formatCoordBr(dest.x), true);
    pushNarrativePart(parts, " m.;");
  }

  pushNarrativePart(parts, " ponto inicial da descrição deste perímetro. Todas as coordenadas aqui descritas estão geo-referenciadas ao ");
  pushNarrativePart(parts, input.crsLabel);
  pushNarrativePart(parts, ". Todos os azimutes e distâncias, áreas e perímetros foram calculados no ");
  pushNarrativePart(parts, input.projectionNote);
  pushNarrativePart(parts, ". Obs.: ");
  pushNarrativePart(parts, input.appNote);

  return parts;
}

export function listClosedPolygons(entities: CadEntity[]): CadPolylineEntity[] {
  return entities.filter((e): e is CadPolylineEntity => e.type === "polyline" && Boolean(e.closed));
}

export function closedPolygonLabel(polygon: CadPolylineEntity, index: number): string {
  const name = polygon.name?.trim();
  if (name) return name;
  return `Polígono ${index + 1}`;
}

export function polygonAreaM2(vertices: CadVertex[], closed: boolean): number {
  if (vertices.length < 3) return 0;
  const pts = closed ? vertices : [...vertices];
  if (!closed && pts.length >= 3) {
    // Área parcial — exige fechamento
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(sum) / 2;
}

export function polygonPerimeterM(vertices: CadVertex[], closed: boolean): number {
  if (vertices.length < 2) return 0;
  let p = 0;
  for (let i = 0; i < vertices.length - 1; i++) {
    p += segmentDistance(vertices[i], vertices[i + 1]);
  }
  if (closed && vertices.length > 2) {
    p += segmentDistance(vertices[vertices.length - 1], vertices[0]);
  }
  return p;
}

export function computePolygonMetrics(
  vertices: CadVertex[],
  closed: boolean,
  vertexLabels?: string[],
): PolygonMetrics {
  const labels =
    vertexLabels ??
    vertices.map((_, i) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(i + 1) : ""));

  const segments: PolygonSegment[] = [];
  const count = closed ? vertices.length : vertices.length - 1;

  for (let i = 0; i < count; i++) {
    const j = (i + 1) % vertices.length;
    segments.push({
      from: i,
      to: j,
      fromLabel: labels[i] ?? `P${i + 1}`,
      toLabel: labels[j] ?? `P${j + 1}`,
      distance: segmentDistance(vertices[i], vertices[j]),
      azimuthDeg: azimuthFromNorth(vertices[i], vertices[j]),
    });
  }

  const areaM2 = closed ? polygonAreaM2(vertices, true) : 0;
  return {
    areaM2,
    areaHa: areaM2 / 10_000,
    perimeterM: polygonPerimeterM(vertices, closed),
    segments,
  };
}

/** Distância de ponto (px,py) ao segmento — para seleção. */
export function distancePointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function hitTestPolyline(
  sx: number,
  sy: number,
  vertices: CadVertex[],
  closed: boolean,
  worldToScreenFn: (x: number, y: number) => { sx: number; sy: number },
  thresholdPx = 8,
): boolean {
  const count = closed ? vertices.length : vertices.length - 1;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % vertices.length;
    const a = worldToScreenFn(vertices[i].x, vertices[i].y);
    const b = worldToScreenFn(vertices[j].x, vertices[j].y);
    if (distancePointToSegment(sx, sy, a.sx, a.sy, b.sx, b.sy) <= thresholdPx) return true;
  }
  return false;
}

/** Índice do vértice clicado (em coordenadas de tela). */
export function hitTestPolylineVertexIndex(
  sx: number,
  sy: number,
  vertices: CadVertex[],
  worldToScreenFn: (x: number, y: number) => { sx: number; sy: number },
  thresholdPx = 10,
): number | null {
  for (let i = 0; i < vertices.length; i++) {
    const p = worldToScreenFn(vertices[i].x, vertices[i].y);
    if (Math.hypot(p.sx - sx, p.sy - sy) <= thresholdPx) return i;
  }
  return null;
}

/** Ponto de inserção no segmento mais próximo ao clique. */
export function findPolylineEdgeInsert(
  sx: number,
  sy: number,
  vertices: CadVertex[],
  closed: boolean,
  worldToScreenFn: (x: number, y: number) => { sx: number; sy: number },
  screenToWorldFn: (sx: number, sy: number) => CadVertex,
  thresholdPx = 10,
): { afterIndex: number; vertex: CadVertex } | null {
  const count = closed ? vertices.length : vertices.length - 1;
  let bestDist = thresholdPx;
  let best: { afterIndex: number; vertex: CadVertex } | null = null;

  for (let i = 0; i < count; i++) {
    const j = (i + 1) % vertices.length;
    const a = worldToScreenFn(vertices[i].x, vertices[i].y);
    const b = worldToScreenFn(vertices[j].x, vertices[j].y);
    const dx = b.sx - a.sx;
    const dy = b.sy - a.sy;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    let t = ((sx - a.sx) * dx + (sy - a.sy) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const px = a.sx + t * dx;
    const py = a.sy + t * dy;
    const dist = Math.hypot(sx - px, sy - py);
    if (dist > bestDist) continue;

    const z = vertices[i].z + t * (vertices[j].z - vertices[i].z);
    const world = screenToWorldFn(px, py);
    bestDist = dist;
    best = { afterIndex: i, vertex: { x: world.x, y: world.y, z } };
  }

  return best;
}
