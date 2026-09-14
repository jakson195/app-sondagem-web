import { polygonCentroid } from "./ai-geometry-utils";
import { formatCoordBr, polygonAreaM2 } from "./polygon-utils";
import type { CadDrainageKind, CadEntity, CadPointEntity, CadPolylineEntity, CadVertex } from "./types";

/** Azul de drenagem e chamadas técnicas. */
export const CAD_PLAN_BLUE = "#0000FF";

/** Tinta cadastral (número, cotas, nome de rua) — figura 2. */
export const CAD_PLAN_INK = "#111827";

/** Área do lote em destaque (laranja/marrom da planta de referência). */
export const CAD_PLAN_AREA = "#c2410c";

export const CAD_PLAN_FONT = "Arial, Helvetica, sans-serif";

export type CadPlanTextRole = "lot-title" | "lot-area" | "lot-edge" | "street" | "pipe" | "node";

/** textSize gravado nas entidades (número circundado / área / testada-profundidade). */
export const CADASTRAL_LOT_ENTITY_TEXT_SIZE = {
  "lot-title": 24,
  "lot-area": 30,
  "lot-edge": 18,
} as const;

export function cadastralLotEntityTextSize(role: CadPlanTextRole): number {
  if (role === "lot-title") return CADASTRAL_LOT_ENTITY_TEXT_SIZE["lot-title"];
  if (role === "lot-area") return CADASTRAL_LOT_ENTITY_TEXT_SIZE["lot-area"];
  if (role === "lot-edge") return CADASTRAL_LOT_ENTITY_TEXT_SIZE["lot-edge"];
  return 14;
}

export type CadPlanText = {
  x: number;
  y: number;
  z: number;
  label: string;
  rotationDeg: number;
  role: CadPlanTextRole;
};

export type BuildCadastralLotPlanTextsOptions = {
  includeCotas?: boolean;
  includeArea?: boolean;
  /** Polígonos de via — define a testada sem alterar a classificação de esquina. */
  streets?: CadPolylineEntity[];
};

/** Camadas cujo nome/área no centro do polígono tapa a planta cadastral. */
export const SKIP_POLYGON_CENTER_LABEL_LAYERS = new Set([
  "loteamento_lotes",
  "loteamento_vias",
  "loteamento_calcadas",
  "loteamento_quadras",
  "drenagem_contrib",
]);

const MIN_EDGE_DIM_M = 1.2;
/** Mesmo limiar de `LOT_STREET_NEAR_M` (esquina) — só para cotas, não para tipo do lote. */
const STREET_NEAR_M = 2.4;
const MERGE_HEADING_DEG = 14;

export function extractTrailingNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const matches = raw.match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  const n = Number(matches[matches.length - 1]);
  return Number.isFinite(n) ? n : null;
}

export function parseCadastralLotNumber(name: string | undefined, index: number): number {
  const raw = (name ?? "").trim();
  const lote = raw.match(/lote\s*0*(\d+)/i);
  if (lote) return Number(lote[1]);
  const dash = raw.match(/[—–-]\s*0*(\d+)\s*$/);
  if (dash) return Number(dash[1]);
  const any = extractTrailingNumber(raw);
  if (any != null && any > 0) return any;
  return index + 1;
}

/** Número sequencial do lote (46, 47…) — sem o prefixo "LOTE". */
export function formatCadastralLotTitle(n: number): string {
  return String(n);
}

/** Área no estilo da planta: "250,00 m²". */
export function formatCadastralLotArea(areaM2: number): string {
  return `${formatCoordBr(areaM2, 2)} m²`;
}

export function formatCadastralLotCenterLabel(name: string | undefined, areaM2: number, index = 0): string {
  return `${formatCadastralLotTitle(parseCadastralLotNumber(name, index))}\n${formatCadastralLotArea(areaM2)}`;
}

/** Cota de frente/lado: "10,00 m" / "25,00 m". */
export function formatCadastralEdgeDimension(lengthM: number): string {
  return `${formatCoordBr(lengthM, 2)} m`;
}

export function indexToStreetLetter(index: number): string {
  let n = Math.max(0, Math.floor(index));
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function prettyStreetTail(tail: string): string {
  const t = tail.trim();
  if (!t) return t;
  if (/^[A-Za-z]$/.test(t)) return t.toUpperCase();
  if (t === t.toUpperCase() && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(t)) {
    return t
      .toLocaleLowerCase("pt-BR")
      .replace(/(^|\s)([\p{L}])/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase("pt-BR"));
  }
  return t;
}

/** "Via 2" / "Rua B" → "Rua B". */
export function formatStreetPlanName(name: string | undefined, index = 0): string {
  const raw = (name ?? "").trim();
  if (!raw) return `Rua ${indexToStreetLetter(index)}`;
  const viaNum = raw.match(/^via\s+(\d+)\s*$/i);
  if (viaNum) return `Rua ${indexToStreetLetter(Number(viaNum[1]) - 1)}`;
  const rua = raw.match(/^(?:rua|r\.)\s*(.+)$/i);
  if (rua) return `Rua ${prettyStreetTail(rua[1])}`;
  const viaNamed = raw.match(/^via\s+(.+)$/i);
  if (viaNamed) return `Rua ${prettyStreetTail(viaNamed[1])}`;
  return prettyStreetTail(raw);
}

/** Ø em cm: 400 mm → 40 (convenção da planta T3-Ø40). */
export function diameterMmToPlanCm(diameterMm: number): number {
  return Math.round((Number.isFinite(diameterMm) ? diameterMm : 0) / 10);
}

export function formatPlanLengthM(lengthM: number): string {
  if (!Number.isFinite(lengthM)) return "0";
  const rounded = Math.round(lengthM);
  if (Math.abs(lengthM - rounded) < 0.05) return String(rounded);
  return formatCoordBr(lengthM, 1);
}

/** Rótulo no tubo: "T3-Ø40-L 53m" (coletor) ou "R1-Ø30-L 6m" (ramal). */
export function formatPipePlanLabel(pipe: {
  code?: string;
  diameterMm: number;
  lengthM: number;
  pipeRole?: string;
}): string {
  const n = extractTrailingNumber(pipe.code) ?? 1;
  const cm = diameterMmToPlanCm(pipe.diameterMm);
  const prefix = pipe.pipeRole === "ramal" || /^RM[-_\s]/i.test(String(pipe.code ?? "")) ? "R" : "T";
  return `${prefix}${n}-Ø${cm}-L ${formatPlanLengthM(pipe.lengthM)}m`;
}

export function formatDrainageNodePlanId(kind: CadDrainageKind | string | undefined, code?: string): string {
  const n = extractTrailingNumber(code) ?? 1;
  if (kind === "inlet") return `BL ${n}`;
  if (kind === "tap" || /^T[-_\s]/i.test(String(code ?? ""))) return `T ${n}`;
  if (kind === "outfall") return `PV ${n}`;
  return `PV ${n}`;
}

export function formatDrainageCotaLine(prefix: "CF" | "CT", valueM: number): string {
  const z = Number.isFinite(valueM) ? valueM : 0;
  return `${prefix}: ${formatCoordBr(z, 2)}`;
}

/** Chamada do nó: ID, CF (cota de fundo) e CT (cota de terreno). */
export function formatDrainageNodeCallout(input: {
  kind?: CadDrainageKind | string;
  code?: string;
  invertZ?: number;
  groundZ?: number;
  outfall?: boolean;
}): string {
  const kind = input.outfall ? "outfall" : input.kind;
  const id = formatDrainageNodePlanId(kind, input.code);
  const title = kind === "outfall" ? `${id} · Emissário` : id;
  return [
    title,
    formatDrainageCotaLine("CF", input.invertZ ?? 0),
    formatDrainageCotaLine("CT", input.groundZ ?? 0),
  ].join("\n");
}

export function extractDrainageCodeFromLabel(label: string | undefined, fallback = "PV"): string {
  if (!label) return fallback;
  const first = label
    .split("\n")[0]
    .replace(/\s*·\s*Emissário/i, "")
    .replace(/\s*·\s*Boca de lobo/i, "")
    .trim();
  return first || fallback;
}

/** Rotação SVG (Y para baixo) paralela ao segmento, texto sempre legível. */
export function readableLabelRotationDeg(dx: number, dy: number): number {
  let deg = (Math.atan2(-dy, dx) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  return deg === 0 ? 0 : deg;
}

export function lotMinSpanM(vertices: CadVertex[]): number {
  if (vertices.length === 0) return 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const v of vertices) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }
  return Math.min(maxX - minX, maxY - minY);
}

export function longestPolygonEdge(vertices: CadVertex[]): { a: CadVertex; b: CadVertex } | null {
  if (vertices.length < 2) return null;
  let bestA = vertices[0];
  let bestB = vertices[1];
  let best = 0;
  const n = vertices.length;
  const closed = n >= 3;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > best) {
      best = d;
      bestA = a;
      bestB = b;
    }
  }
  return { a: bestA, b: bestB };
}

function headingDeg(a: CadVertex, b: CadVertex): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function headingDeltaDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function distPointToSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-18) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

function minDistToRing(p: [number, number], ring: CadVertex[]): number {
  if (ring.length < 2) return Infinity;
  const n = ring.length;
  const closed = n >= 3;
  const last = closed ? n : n - 1;
  let best = Infinity;
  for (let i = 0; i < last; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const d = distPointToSegment(p, [a.x, a.y], [b.x, b.y]);
    if (d < best) best = d;
  }
  return best;
}

function edgeAlongStreets(a: CadVertex, b: CadVertex, streets: CadPolylineEntity[] | undefined): boolean {
  if (!streets || streets.length === 0) return false;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 0.4) return false;
  for (const street of streets) {
    if (!street.closed || street.vertices.length < 3) continue;
    let hits = 0;
    for (const t of [0.25, 0.5, 0.75]) {
      const p: [number, number] = [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t];
      if (minDistToRing(p, street.vertices) <= STREET_NEAR_M) hits += 1;
    }
    if (hits >= 2) return true;
  }
  return false;
}

type MergedLotEdge = {
  a: CadVertex;
  b: CadVertex;
  length: number;
  alongStreet: boolean;
};

function mergeCollinearLotEdges(verts: CadVertex[], streets?: CadPolylineEntity[]): MergedLotEdge[] {
  const n = verts.length;
  if (n < 2) return [];
  const segs: MergedLotEdge[] = [];
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1e-6) continue;
    segs.push({ a, b, length, alongStreet: edgeAlongStreets(a, b, streets) });
  }
  if (segs.length === 0) return [];

  const groups: MergedLotEdge[][] = [];
  let cur: MergedLotEdge[] = [segs[0]];
  for (let i = 1; i < segs.length; i++) {
    const prev = cur[cur.length - 1];
    const seg = segs[i];
    const sameClass = seg.alongStreet === prev.alongStreet;
    const aligned = headingDeltaDeg(headingDeg(prev.a, prev.b), headingDeg(seg.a, seg.b)) <= MERGE_HEADING_DEG;
    if (sameClass && aligned) cur.push(seg);
    else {
      groups.push(cur);
      cur = [seg];
    }
  }
  groups.push(cur);

  if (groups.length >= 2) {
    const first = groups[0];
    const last = groups[groups.length - 1];
    const a = last[last.length - 1];
    const b = first[0];
    const aligned = headingDeltaDeg(headingDeg(a.a, a.b), headingDeg(b.a, b.b)) <= MERGE_HEADING_DEG;
    if (a.alongStreet === b.alongStreet && aligned) {
      groups[0] = [...last, ...first];
      groups.pop();
    }
  }

  return groups.map((group) => ({
    a: group[0].a,
    b: group[group.length - 1].b,
    length: group.reduce((sum, item) => sum + item.length, 0),
    alongStreet: group[0].alongStreet,
  }));
}

type LotEdgeKind = "front" | "side" | "back";

function classifyMergedLotEdges(
  edges: MergedLotEdge[],
): { edge: MergedLotEdge; kind: LotEdgeKind }[] {
  if (edges.length === 0) return [];
  const hasStreet = edges.some((e) => e.alongStreet);
  if (hasStreet) {
    const fronts = edges.filter((e) => e.alongStreet);
    const primary = fronts.reduce((best, e) => (e.length > best.length ? e : best), fronts[0]);
    const frontHead = headingDeg(primary.a, primary.b);
    return edges.map((edge) => {
      if (edge.alongStreet) return { edge, kind: "front" as const };
      const d = headingDeltaDeg(headingDeg(edge.a, edge.b), frontHead);
      return { edge, kind: d > 55 && d < 125 ? ("side" as const) : ("back" as const) };
    });
  }

  const longest = edges.reduce((m, e) => Math.max(m, e.length), 0);
  const depthish = edges.filter((e) => e.length >= longest * 0.75);
  const widthish = edges.filter((e) => e.length < longest * 0.75);
  if (widthish.length >= 1 && depthish.length >= 1) {
    const front = widthish[0];
    return edges.map((edge) => {
      if (edge === front) return { edge, kind: "front" as const };
      if (depthish.includes(edge)) return { edge, kind: "side" as const };
      return { edge, kind: "back" as const };
    });
  }

  return edges.map((edge, i) => {
    if (i === 0) return { edge, kind: "front" as const };
    if (edges.length >= 4 && i === 2) return { edge, kind: "back" as const };
    return { edge, kind: "side" as const };
  });
}

function edgeLabelInside(a: CadVertex, b: CadVertex, centroid: CadVertex, offsetM: number): CadVertex {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  let nx = -(b.y - a.y);
  let ny = b.x - a.x;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;
  if (nx * (centroid.x - mx) + ny * (centroid.y - my) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: mx + nx * offsetM, y: my + ny * offsetM, z: (a.z + b.z) / 2 };
}

export function buildCadastralLotPlanTexts(
  lot: CadPolylineEntity,
  index: number,
  options: BuildCadastralLotPlanTextsOptions = {},
): CadPlanText[] {
  const includeCotas = options.includeCotas !== false;
  const includeArea = options.includeArea !== false;
  const verts = lot.vertices;
  if (verts.length < 3) return [];
  const n = parseCadastralLotNumber(lot.name, index);
  const c = polygonCentroid(verts);
  const span = lotMinSpanM(verts);
  const classified = classifyMergedLotEdges(mergeCollinearLotEdges(verts, options.streets));
  const rawFronts = classified.filter((item) => item.kind === "front" && item.edge.length >= MIN_EDGE_DIM_M);
  const rawSides = classified.filter((item) => item.kind === "side" && item.edge.length >= MIN_EDGE_DIM_M);
  const maxFront = rawFronts.reduce((m, item) => Math.max(m, item.edge.length), 0);
  const maxSide = rawSides.reduce((m, item) => Math.max(m, item.edge.length), 0);
  const fronts = rawFronts.filter((item) => item.edge.length >= Math.max(MIN_EDGE_DIM_M, Math.min(4, maxFront * 0.4)));
  const sides = rawSides.filter((item) => item.edge.length >= Math.max(MIN_EDGE_DIM_M, maxSide * 0.45));
  const primaryFront = fronts.reduce(
    (best, item) => (!best || item.edge.length > best.edge.length ? item : best),
    fronts[0] as (typeof fronts)[0] | undefined,
  );
  const depthDir = (sides[0] ?? classified.find((item) => item.kind !== "front") ?? classified[0])?.edge;
  const areaRot = depthDir
    ? readableLabelRotationDeg(depthDir.b.x - depthDir.a.x, depthDir.b.y - depthDir.a.y)
    : 0;
  const frontRot = primaryFront
    ? readableLabelRotationDeg(
        primaryFront.edge.b.x - primaryFront.edge.a.x,
        primaryFront.edge.b.y - primaryFront.edge.a.y,
      )
    : areaRot;

  const titleOff = Math.min(span * 0.34, Math.max(1.05, span * 0.14));
  const frontDimOff = Math.min(span * 0.48, Math.max(titleOff + 1.05, span * 0.28));
  const sideOff = Math.min(1.25, Math.max(0.55, span * 0.08));

  const texts: CadPlanText[] = [];
  if (primaryFront) {
    const pos = edgeLabelInside(primaryFront.edge.a, primaryFront.edge.b, c, titleOff);
    texts.push({
      x: pos.x,
      y: pos.y,
      z: pos.z,
      label: formatCadastralLotTitle(n),
      rotationDeg: frontRot,
      role: "lot-title",
    });
  } else {
    texts.push({
      x: c.x,
      y: c.y + Math.max(0.6, span * 0.12),
      z: c.z,
      label: formatCadastralLotTitle(n),
      rotationDeg: frontRot,
      role: "lot-title",
    });
  }

  if (includeArea) {
    texts.push({
      x: c.x,
      y: c.y,
      z: c.z,
      label: formatCadastralLotArea(polygonAreaM2(verts, true)),
      rotationDeg: areaRot,
      role: "lot-area",
    });
  }

  if (!includeCotas) return texts;

  for (const item of fronts) {
    const isPrimary = item === primaryFront;
    const pos = edgeLabelInside(item.edge.a, item.edge.b, c, isPrimary ? frontDimOff : Math.min(frontDimOff, titleOff + 0.85));
    texts.push({
      x: pos.x,
      y: pos.y,
      z: pos.z,
      label: formatCadastralEdgeDimension(item.edge.length),
      rotationDeg: readableLabelRotationDeg(item.edge.b.x - item.edge.a.x, item.edge.b.y - item.edge.a.y),
      role: "lot-edge",
    });
  }
  for (const item of sides) {
    const pos = edgeLabelInside(item.edge.a, item.edge.b, c, sideOff);
    texts.push({
      x: pos.x,
      y: pos.y,
      z: pos.z,
      label: formatCadastralEdgeDimension(item.edge.length),
      rotationDeg: readableLabelRotationDeg(item.edge.b.x - item.edge.a.x, item.edge.b.y - item.edge.a.y),
      role: "lot-edge",
    });
  }
  return texts;
}

export function buildStreetPlanText(via: CadPolylineEntity, index: number): CadPlanText | null {
  if (!via.closed || via.vertices.length < 3) return null;
  const edge = longestPolygonEdge(via.vertices);
  if (!edge) return null;
  const c = polygonCentroid(via.vertices);
  return {
    x: c.x,
    y: c.y,
    z: c.z,
    label: formatStreetPlanName(via.name, index),
    rotationDeg: readableLabelRotationDeg(edge.b.x - edge.a.x, edge.b.y - edge.a.y),
    role: "street",
  };
}

export function polylineLabelPose(vertices: CadVertex[]): { x: number; y: number; z: number; rotationDeg: number } | null {
  if (vertices.length < 2) return null;
  const a = vertices[0];
  const b = vertices[vertices.length - 1];
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    rotationDeg: readableLabelRotationDeg(b.x - a.x, b.y - a.y),
  };
}

export function isCadastralLotAnnotation(entity: CadEntity): entity is CadPointEntity {
  return entity.type === "point" && entity.layerId === "reurb_anotacoes" && Boolean(entity.label);
}

export function projectHasCadastralLotAnnotations(entities: CadEntity[]): boolean {
  return entities.some(isCadastralLotAnnotation);
}

/** Pontos que são só texto da planta (sem marcador circular). */
export function isPlanTextOnlyPoint(entity: CadPointEntity): boolean {
  return entity.layerId === "reurb_anotacoes";
}

export function isCadastralLotPlanRole(role: CadPlanTextRole | undefined): boolean {
  return role === "lot-title" || role === "lot-area" || role === "lot-edge";
}

/** Anotação persistida de lote — a planta desenha na hora a partir da geometria. */
export function isStoredLotPlanAnnotation(entity: CadEntity): boolean {
  if (!isCadastralLotAnnotation(entity)) return false;
  return isCadastralLotPlanRole(inferPlanTextRole(entity));
}

export function planTextFillColor(role: CadPlanTextRole | undefined, fallback = CAD_PLAN_INK): string {
  if (role === "lot-area") return CAD_PLAN_AREA;
  if (role === "lot-title" || role === "lot-edge" || role === "street") return CAD_PLAN_INK;
  if (role === "pipe" || role === "node") return CAD_PLAN_BLUE;
  return fallback;
}

export function planTextHaloWidth(fontSize: number, role?: CadPlanTextRole): number {
  const factor = role === "lot-area" ? 0.18 : role === "lot-title" ? 0.16 : 0.14;
  return Math.max(1.2, fontSize * factor);
}

export function planLotTitleCircleRadius(fontSize: number): number {
  return Math.max(7, fontSize * 0.92);
}

export function planTextFontWeight(role: CadPlanTextRole | undefined, label?: string): number {
  if (role === "lot-area") return 800;
  if (role === "lot-title" || role === "street") return 700;
  if (role === "lot-edge") return 600;
  const text = label ?? "";
  if (/m²/.test(text)) return 800;
  if (/^\d+$/.test(text) || /^LOTE\s/i.test(text) || /^RUA\s/i.test(text) || /^Rua\s/.test(text)) return 700;
  return 600;
}

export function inferPlanTextRole(entity: CadPointEntity): CadPlanTextRole | undefined {
  const label = entity.label ?? "";
  if (entity.layerId === "reurb_anotacoes") {
    if (/^LOTE\s+\d+$/i.test(label) || /^\d{1,4}$/.test(label)) return "lot-title";
    if (/m²/.test(label)) return "lot-area";
    if (/^\d+[.,]\d+\s*m$/i.test(label) || /^\d+[.,]\d+$/.test(label)) return "lot-edge";
  }
  if (/^T\d+-Ø/.test(label)) return "pipe";
  if (/^CF:/m.test(label) || /^BL\s/m.test(label) || /^PV\s/m.test(label)) return "node";
  if (/^RUA\s/i.test(label) || /^Rua\s/.test(label)) return "street";
  return undefined;
}
