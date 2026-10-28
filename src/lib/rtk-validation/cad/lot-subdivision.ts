import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";
import { otimizarEquidadeDosLotes, relatoriosEquidadePorQuadras } from "./lot-equity";
import { CoberturaQuadraError, lotearQuadraCompleta, quadraPolyAreaM2 } from "./quadra-lotting";

/** Anel externo [x, y] em metros (E/N do CAD). Primeiro ponto pode ou não repetir o último. */
export type PolygonCoords = Position[];

export type LoteamentoParams = {
  /** Corredor total da via (pista + 2 calçadas), em metros — o que se subtrai da gleba. */
  larguraViaM: number;
  /**
   * Profundidade do lote (testada → fundo), em metros.
   * A malha de vias espaça ruas paralelas em ~2× este valor (duas fileiras, frente e fundos).
   */
  profundidadeQuadraM: number;
  testadaMinimaM: number;
  /** Área mínima do lote interno (m²). Se omitida, usa testada × profundidade. */
  areaMinimaM2?: number;
  /** Acréscimo % da área mínima nos lotes de esquina (padrão 20). */
  percentualEsquina?: number;
  orientacao?: number;
  prefixoQuadra?: string;
  /** Calçada em cada lado, interna ao corredor da via (m). 0 = sem calçada. */
  larguraCalcadaM?: number;
  /** Eixo tracejado no centro da via. Padrão: true. */
  eixoRua?: boolean;
  /** Raio só em esquinas verdadeiras (lote que faz frente a duas vias que se cruzam). 0 = cantos vivos. */
  raioEsquinaM?: number;
  /**
   * Área alvo de cada quadra (m²). Ex.: 2000 divide a gleba em quadras de ~2000 m²
   * com vias entre elas. 0 / omitido = não divide por área (só malha por profundidade).
   * Ignorado quando larguraQuadraM e profundidadeBlocoM são ambos > 0.
   */
  areaMinimaQuadraM2?: number;
  /**
   * Largura da quadra entre as duas ruas que os lotes enfrentam (m).
   * É sempre 2 × a profundidade do lote: uma fileira para cada rua.
   */
  larguraQuadraM?: number;
  /** Comprimento da quadra ao longo da rua (m). Usado com larguraQuadraM. */
  profundidadeBlocoM?: number;
  /** Polígonos de reserva legal / institucional / APP — não gerar quadra/via por cima. */
  reservas?: Position[][];
  /** Reserva legal (para colar a área útil). Se omitido e só houver `reservas`, usa essas como âncora. */
  reservaLegal?: Position[][];
  /** Polígonos de APP — entram na base urbanizável (gleba − APP − RL). */
  apps?: Position[][];
  /**
   * @deprecated A área útil é a parte loteável (gleba − área verde − APP − vias).
   * Não cria polígono vazio; o restante vira lote.
   */
  percentAreaUtil?: number;
  /**
   * Canto da área útil em relação à reserva legal (mesmo vocabulário da RL).
   * A faixa cola na face da RL voltada a esse canto e sempre compartilha aresta.
   */
  cantoAreaUtil?: ReservaCanto | string;
  /**
   * Via pública já existente nas extremidades: o corredor fica **fora** da gleba
   * (largura `larguraViaExistenteM`) e as ruas do loteamento se unem a ele na borda.
   * Se `ladosViaExistente` estiver preenchido, aplica só nesses lados.
   */
  viasExistentesExtremidades?: boolean;
  /**
   * Largura (m) da via existente gerada fora da gleba. Omitida = mesma `larguraViaM`.
   */
  larguraViaExistenteM?: number;
  /** Eixos de via já desenhados (polilinhas) para inserir/bufferizar no loteamento. */
  eixosExistentes?: Position[][];
  /**
   * Usa `eixosExistentes` como rede viária (sem malha automática).
   * Editar um eixo e regenerar: vias = offset desses eixos.
   */
  usarEixosComoRede?: boolean;
  /** Arestas da gleba (cada uma [A, B]) onde já existe via pública — marcar no desenho. */
  ladosViaExistente?: Position[][];
  /**
   * Arestas da gleba voltadas à rodovia. A faixa de domínio entra **para dentro**
   * da gleba (`larguraFaixaDominioM`) e não recebe lote nem via.
   */
  ladosFaixaDominio?: Position[][];
  /** Largura (m) da faixa de domínio recuada para dentro da gleba. */
  larguraFaixaDominioM?: number;
  /**
   * Criar ruas internas conectadas quando a profundidade da quadra exigir.
   * Padrão: true. false = só fileiras com acesso às vias já existentes;
   * o miolo sem testada vira remanescente, nunca lote inválido.
   */
  allowInternalRoads?: boolean;
};

export type LoteResult = {
  coordinates: Position[][];
  area_m2: number;
  testada_m: number;
  quadra: string;
  numero: string;
  /** Lote de resto (não cabe 12×25); área = leftover. */
  remainder?: boolean;
};

/** Polígono de um lote: anel externo + furos. */
type LotPoly = Position[][];
type LotSlice = { coords: LotPoly; az: number; remainder?: boolean };

export type LoteamentoResult = {
  vias: Position[][][];
  lotes: LoteResult[];
  /** Polígonos de calçada (faixas internas à via, junto aos lotes). */
  calcadas: Position[][][];
  /** Eixos das vias (linhas antes do buffer), já recortados na gleba. */
  eixos: Position[][];
  /** Contorno de cada quadra (após vias e obstáculos). */
  quadraPolys: Position[][][];
  quadras: number;
  areaGlebaM2: number;
  /**
   * Polígonos de AREA_UTIL. Sempre vazio: a área útil é loteada, não reservada.
   */
  areaUtil: Position[][][];
  /** Área loteável alvo (gleba − RL − APP), informativa. */
  areaUtilAlvoM2: number;
  /** percent/100 × T (antes de descontar ruas). */
  areaUtilOrcamentoM2: number;
  areaUtilM2: number;
  /** Soma das vias (já recortadas da gleba, sem RL/APP). */
  areaViasM2: number;
  /** gleba − APP − reserva legal. */
  areaUrbanizavelM2: number;
  /** Faixa de domínio da rodovia (dentro da gleba). */
  faixaDominio: Position[][][];
  /**
   * Sobra real após complementar o loteamento. Nunca é institucional/área verde.
   * Vazio quando a área loteável fecha nos lotes.
   */
  remanescente: Position[][][];
  /** Diagnóstico da malha (área/testada/profundidade). Lotes inválidos não entram em `lotes`. */
  report: LoteamentoReport;
  /** Cobertura por quadra — nenhuma área laranja pode ficar de fora. */
  coverage?: LoteamentoCoverageSummary;
};

export const MAX_REMAINING_PERCENT = 2;
export const MAX_REMAINING_AREA_M2 = 80;

export type BlockLottingStatus = "PENDING" | "PROCESSING" | "SUCCESS" | "PARTIAL" | "FAILED";
export type BuildableBlockStatus = BlockLottingStatus | "OK" | "REPROCESSAR";

export type BuildableBlock = {
  id: string;
  polygon: Position[];
  area: number;
  accessEdges: Position[][];
  status: BuildableBlockStatus;
  existingLotCount: number;
  justification?: string;
};

export type BlockCoverageReport = {
  blockArea: number;
  lotsArea: number;
  roadsArea: number;
  excludedArea: number;
  remainingArea: number;
  coveragePercent: number;
  valid: boolean;
  problems: string[];
  lots: number;
  status: BuildableBlockStatus;
};

export type LoteamentoCoverageSummary = {
  blocksDetected: number;
  blocksProcessed: number;
  blocksOk: number;
  blocksRemaining: number;
  blocksWithLots: number;
  blocksEmpty: number;
  lots: number;
  lotsArea: number;
  remainingArea: number;
  coveragePercent: number;
  emptyWarning?: string;
  blocks: Array<{
    id: string;
    area: number;
    lots: number;
    lotsArea: number;
    remainingArea: number;
    coveragePercent: number;
    status: BuildableBlockStatus;
    justification?: string;
  }>;
};

export type LoteamentoReport = {
  totalLots: number;
  totalLotArea: number;
  residualArea: number;
  minArea: number;
  maxArea: number;
  averageArea: number;
  minDepth: number;
  maxDepth: number;
  averageDepth: number;
  minFrontage: number;
  maxFrontage: number;
  invalidLots: string[];
  lotsWithoutRoadAccess: number;
  lotsWithoutFrontage: number;
  internalStreetCount: number;
  accessWarning?: string;
  desvioPadraoArea: number;
  coeficienteVariacao: number;
  equityByQuadra: Array<{
    quadra: string;
    quantidade: number;
    media: number;
    menor: number;
    maior: number;
    desvioPadrao: number;
    coeficienteVariacao: number;
    areaAlvo: number;
  }>;
};

export const DEFAULT_PERCENT_AREA_UTIL = 15;
export const DEFAULT_PERCENT_RESERVA_LEGAL = 20;

const M_TO_DEG = 1 / 111_320;
const SLIVER_M2 = 4;
const REMAINDER_MIN_M2 = 8;
const ANGLE_EPS = 1e-9;

export class LoteamentoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoteamentoError";
  }
}

function closeRing(ring: Position[]): Position[] {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring.map((p) => [p[0], p[1]]);
  return [...ring.map((p) => [p[0], p[1]] as Position), [first[0], first[1]]];
}

function dropClosing(ring: Position[]): Position[] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
  return ring;
}

function originOf(ring: Position[]): Position {
  const pts = dropClosing(ring);
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p[0];
    sy += p[1];
  }
  const n = Math.max(pts.length, 1);
  return [sx / n, sy / n];
}

/** CAD metros → lon/lat aproximado no equador (turf.buffer/area/length em metros). */
function toGeo(p: Position, origin: Position): Position {
  return [(p[0] - origin[0]) * M_TO_DEG, (p[1] - origin[1]) * M_TO_DEG];
}

function fromGeo(p: Position, origin: Position): Position {
  return [p[0] / M_TO_DEG + origin[0], p[1] / M_TO_DEG + origin[1]];
}

function ringToGeo(ring: Position[], origin: Position): Position[] {
  return closeRing(ring).map((p) => toGeo(p, origin));
}

function ringFromGeo(ring: Position[], origin: Position): Position[] {
  return ring.map((p) => fromGeo(p, origin));
}

function asTurfPolygon(ring: Position[], origin: Position): Feature<Polygon> {
  return turf.polygon([ringToGeo(ring, origin)]);
}

function planarAreaM2(ring: Position[]): number {
  const pts = dropClosing(ring);
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return Math.abs(sum) / 2;
}

function planarLength(a: Position, b: Position): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function distPointToSegment(p: Position, a: Position, b: Position): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-18) return planarLength(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

function minDistToRings(p: Position, rings: Position[][]): number {
  let best = Infinity;
  for (const ring of rings) {
    const pts = dropClosing(ring);
    if (pts.length < 2) continue;
    for (let i = 0; i < pts.length; i++) {
      const d = distPointToSegment(p, pts[i], pts[(i + 1) % pts.length]);
      if (d < best) best = d;
    }
  }
  return best;
}

export function streetOuterRings(vias: Position[][][]): Position[][] {
  return vias.map((poly) => poly[0]).filter((r): r is Position[] => !!r && dropClosing(r).length >= 3);
}

/** Distância máxima (m) para considerar uma aresta junto ao meio-fio. */
const STREET_NEAR_M = 2.4;
/** Família de arestas “paralelas” (180°). 28° excluía a rodovia diagonal se o lado oposto fosse ~N-S. */
const FRONTAGE_FAMILY_DEG = 40;
const FRONTAGE_ALIGN_MIN = 0.5;

function midpoint(a: Position, b: Position): Position {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** Corredor retangular em metros (sem caps arredondados do buffer). */
function corridorPolygon(a: Position, b: Position, halfW: number): Position[] {
  const len = planarLength(a, b);
  if (len < 1e-9 || !(halfW > 0)) return [];
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  const px = -uy;
  const py = ux;
  return closeRing([
    [a[0] + px * halfW, a[1] + py * halfW],
    [b[0] + px * halfW, b[1] + py * halfW],
    [b[0] - px * halfW, b[1] - py * halfW],
    [a[0] - px * halfW, a[1] - py * halfW],
  ]);
}

function clipCorridorToGleba(
  a: Position,
  b: Position,
  halfW: number,
  gleba: Feature<Polygon>,
  origin: Position,
): Position[][][] {
  const ring = corridorPolygon(a, b, halfW);
  if (ring.length < 4) return [];
  try {
    const rect = asTurfPolygon(ring, origin);
    const clipped = turf.intersect(turf.featureCollection([gleba, rect]));
    return flattenPoly(clipped, origin).filter((poly) => planarAreaM2(poly[0]) >= SLIVER_M2);
  } catch {
    return [];
  }
}

/** Azimute CAD: 0 = norte, 90 = leste. */
export function planarAzimuthDeg(a: Position, b: Position): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

function angleDeltaDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

function foldAz180(az: number): number {
  return ((az % 180) + 180) % 180;
}

function azDelta180(a: number, b: number): number {
  const d = Math.abs(foldAz180(a) - foldAz180(b)) % 180;
  return Math.min(d, 180 - d);
}

function circularMeanAz180(items: { az: number; len: number }[]): number {
  let x = 0;
  let y = 0;
  for (const it of items) {
    if (!(it.len > 0)) continue;
    const a = (foldAz180(it.az) * 2 * Math.PI) / 180;
    x += Math.cos(a) * it.len;
    y += Math.sin(a) * it.len;
  }
  if (x * x + y * y < 1e-12) return foldAz180(items[0]?.az ?? 90);
  return foldAz180(((Math.atan2(y, x) * 180) / Math.PI) / 2);
}

function flattenPoly(feat: Feature<Polygon | MultiPolygon> | null | undefined, origin: Position): Position[][][] {
  if (!feat?.geometry) return [];
  if (feat.geometry.type === "Polygon") {
    return [feat.geometry.coordinates.map((ring) => ringFromGeo(ring, origin))];
  }
  return feat.geometry.coordinates.map((poly) => poly.map((ring) => ringFromGeo(ring, origin)));
}

function toTurfPolys(polygons: Position[][][], origin: Position): Feature<Polygon>[] {
  return polygons
    .map((coords) => {
      const outer = closeRing(coords[0] ?? []);
      if (outer.length < 4) return null;
      try {
        return turf.polygon([ringToGeo(outer, origin)]);
      } catch {
        return null;
      }
    })
    .filter((f): f is Feature<Polygon> => f != null);
}

function unionPolygons(polygons: Position[][][], origin: Position): Feature<Polygon | MultiPolygon> | null {
  const feats = toTurfPolys(polygons, origin);
  if (feats.length === 0) return null;
  let acc: Feature<Polygon | MultiPolygon> | null = feats[0];
  for (let i = 1; i < feats.length; i++) {
    if (!acc) {
      acc = feats[i];
      continue;
    }
    try {
      const next: Feature<Polygon | MultiPolygon> | null = turf.union(
        turf.featureCollection([acc, feats[i]]),
      );
      if (next) acc = next;
    } catch {
      /* união degenerada — ignora este pedaço */
    }
  }
  return acc;
}

/** Recorta o eixo retilíneo (antes do buffer) ao polígono da gleba, guardando só o trecho interno. */
function clipStraightAxisToPolygon(
  a: Position,
  b: Position,
  gleba: Feature<Polygon>,
  origin: Position,
): Position[][] {
  const len = planarLength(a, b);
  if (len < 1) return [];
  const step = Math.min(2, Math.max(0.5, len / 200));
  const n = Math.max(8, Math.ceil(len / step));
  const pts: Position[] = [];
  const inside: boolean[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p: Position = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    pts.push(p);
    inside.push(
      turf.booleanPointInPolygon(turf.point(toGeo(p, origin)), gleba, { ignoreBoundary: false }),
    );
  }
  const segs: Position[][] = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    if (inside[i]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if (i - 1 > start) segs.push([pts[start], pts[i - 1]]);
      start = -1;
    }
  }
  if (start >= 0 && n > start) segs.push([pts[start], pts[n]]);
  return segs.filter((s) => planarLength(s[0], s[1]) >= 1);
}

function quadraLabel(index: number, prefix: string): string {
  let n = index;
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${prefix} ${letters}`.trim();
}

function lotNumero(index: number): string {
  return `Lote ${String(index + 1).padStart(2, "0")}`;
}

export function getMainAxisAzimuth(polygonCoords: PolygonCoords): number {
  const ring = dropClosing(polygonCoords);
  if (ring.length < 2) return 90;

  const edges: { az: number; len: number }[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = planarLength(a, b);
    if (len < 2) continue;
    edges.push({ az: planarAzimuthDeg(a, b), len });
  }
  if (edges.length === 0) return 90;

  let longest = edges[0];
  for (const e of edges) {
    if (e.len > longest.len) longest = e;
  }
  const familyA = edges.filter((e) => azDelta180(e.az, longest.az) <= FRONTAGE_FAMILY_DEG);
  const familyB = edges.filter((e) => azDelta180(e.az, longest.az + 90) <= FRONTAGE_FAMILY_DEG);
  const lenA = familyA.reduce((s, e) => s + e.len, 0);
  const lenB = familyB.reduce((s, e) => s + e.len, 0);
  const use = lenA >= lenB ? familyA : familyB;
  return circularMeanAz180(use);
}

export type PerimeterSkip = {
  dMin?: boolean;
  dMax?: boolean;
  sMin?: boolean;
  sMax?: boolean;
};

function resolvePerimeterSkip(skipPerimeter: boolean | PerimeterSkip): PerimeterSkip {
  if (skipPerimeter === true) return { dMin: true, dMax: true, sMin: true, sMax: true };
  if (skipPerimeter && typeof skipPerimeter === "object") return skipPerimeter;
  return {};
}

function allPerimeterSkip(skip: PerimeterSkip): boolean {
  return Boolean(skip.dMin && skip.dMax && skip.sMin && skip.sMax);
}

function orPerimeterSkip(a: boolean | PerimeterSkip, b: boolean | PerimeterSkip): boolean | PerimeterSkip {
  const A = resolvePerimeterSkip(a);
  const B = resolvePerimeterSkip(b);
  const m: PerimeterSkip = {
    dMin: Boolean(A.dMin || B.dMin),
    dMax: Boolean(A.dMax || B.dMax),
    sMin: Boolean(A.sMin || B.sMin),
    sMax: Boolean(A.sMax || B.sMax),
  };
  if (!m.dMin && !m.dMax && !m.sMin && !m.sMax) return false;
  if (allPerimeterSkip(m)) return true;
  return m;
}

function ringEdges(ring: Position[]): Position[][] {
  const pts = dropClosing(ring);
  const edges: Position[][] = [];
  if (pts.length < 2) return edges;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a && b) edges.push([a, b]);
  }
  return edges;
}

/** Quais lados da malha coincidem com arestas marcadas (via já existente). */
export function perimeterSkipFromExistingSides(
  polygonCoords: PolygonCoords,
  azimuthDeg: number,
  existingSides: Position[][],
): PerimeterSkip {
  const ring = dropClosing(polygonCoords);
  const skip: PerimeterSkip = {};
  if (ring.length < 3 || existingSides.length === 0) return skip;

  const origin = originOf(ring);
  const { dirS, dirD } = streetDir(azimuthDeg);
  let sMin = Infinity;
  let sMax = -Infinity;
  let dMin = Infinity;
  let dMax = -Infinity;
  for (const p of ring) {
    const vx = p[0] - origin[0];
    const vy = p[1] - origin[1];
    const s = vx * dirS[0] + vy * dirS[1];
    const d = vx * dirD[0] + vy * dirD[1];
    sMin = Math.min(sMin, s);
    sMax = Math.max(sMax, s);
    dMin = Math.min(dMin, d);
    dMax = Math.max(dMax, d);
  }
  const dTol = Math.max(6, (dMax - dMin) * 0.16);
  const sTol = Math.max(6, (sMax - sMin) * 0.16);

  for (const edge of existingSides) {
    const a = edge[0];
    const b = edge[1];
    if (!a || !b || planarLength(a, b) < 1) continue;
    const az = planarAzimuthDeg(a, b);
    const mid = midpoint(a, b);
    const vx = mid[0] - origin[0];
    const vy = mid[1] - origin[1];
    const s = vx * dirS[0] + vy * dirS[1];
    const d = vx * dirD[0] + vy * dirD[1];
    if (azDelta180(az, azimuthDeg) <= FRONTAGE_FAMILY_DEG) {
      if (Math.abs(d - dMin) <= dTol) skip.dMin = true;
      if (Math.abs(d - dMax) <= dTol) skip.dMax = true;
    }
    if (azDelta180(az, azimuthDeg + 90) <= FRONTAGE_FAMILY_DEG) {
      if (Math.abs(s - sMin) <= sTol) skip.sMin = true;
      if (Math.abs(s - sMax) <= sTol) skip.sMax = true;
    }
  }
  return skip;
}

function markedEdgesAsStreetRings(edges: Position[][]): Position[][] {
  const rings: Position[][] = [];
  for (const edge of edges) {
    const a = edge[0];
    const b = edge[1];
    if (!a || !b || planarLength(a, b) < 0.5) continue;
    const ring = corridorPolygon(a, b, 1.2);
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

function resolveExistingViaWidthM(larguraViaM: number, larguraViaExistenteM?: number): number {
  if (larguraViaExistenteM != null && Number.isFinite(larguraViaExistenteM) && larguraViaExistenteM > 0) {
    return larguraViaExistenteM;
  }
  return larguraViaM;
}

/** Corredor da via existente **fora** da gleba, colado na aresta marcada. */
export function generateExistingEdgeStreets(
  glebaCoords: PolygonCoords,
  edges: Position[][],
  widthM: number,
): { vias: Position[][][]; eixos: Position[][] } {
  const ring = dropClosing(glebaCoords);
  if (ring.length < 3 || !(widthM > 0) || edges.length === 0) return { vias: [], eixos: [] };
  const origin = originOf(ring);
  const gleba = asTurfPolygon(ring, origin);
  const inwardRef = origin;
  const halfW = widthM / 2;
  const pad = Math.max(widthM, 4);
  const vias: Position[][][] = [];
  const eixos: Position[][] = [];
  for (const edge of edges) {
    const a = edge[0];
    const b = edge[1];
    if (!a || !b || planarLength(a, b) < 0.5) continue;
    const len = planarLength(a, b);
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    let px = -uy;
    let py = ux;
    const mid = midpoint(a, b);
    if ((inwardRef[0] - mid[0]) * px + (inwardRef[1] - mid[1]) * py > 0) {
      px = -px;
      py = -py;
    }
    const a0: Position = [a[0] - ux * pad + px * halfW, a[1] - uy * pad + py * halfW];
    const b0: Position = [b[0] + ux * pad + px * halfW, b[1] + uy * pad + py * halfW];
    const corr = corridorPolygon(a0, b0, halfW);
    if (corr.length < 4) continue;
    try {
      const feat = asTurfPolygon(corr, origin);
      const outside = turf.difference(turf.featureCollection([feat, gleba]));
      const clipped = flattenPoly(outside, origin).filter((poly) => planarAreaM2(poly[0]) >= SLIVER_M2);
      if (clipped.length > 0) vias.push(...clipped);
      else vias.push([corr]);
    } catch {
      vias.push([corr]);
    }
    eixos.push([a0, b0]);
  }
  return { vias, eixos };
}

/**
 * Faixa de domínio da rodovia: corredor de `widthM` **para dentro** da gleba,
 * colado nas arestas marcadas. Não é via — é área não loteável.
 */
export function generateFaixaDominioFromEdges(
  glebaCoords: PolygonCoords,
  edges: Position[][],
  widthM: number,
): Position[][][] {
  const ring = dropClosing(glebaCoords);
  if (ring.length < 3 || !(widthM > 0) || edges.length === 0) return [];
  const origin = originOf(ring);
  const gleba = asTurfPolygon(ring, origin);
  const inwardRef = origin;
  const extra = Math.max(widthM, 4);
  const out: Position[][][] = [];
  for (const edge of edges) {
    const a = edge[0];
    const b = edge[1];
    if (!a || !b || planarLength(a, b) < 0.5) continue;
    const len = planarLength(a, b);
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    let px = -uy;
    let py = ux;
    const mid = midpoint(a, b);
    if ((inwardRef[0] - mid[0]) * px + (inwardRef[1] - mid[1]) * py < 0) {
      px = -px;
      py = -py;
    }
    const a0: Position = [a[0] - ux * extra, a[1] - uy * extra];
    const b0: Position = [b[0] + ux * extra, b[1] + uy * extra];
    const c1: Position = [b0[0] + px * widthM, b0[1] + py * widthM];
    const d1: Position = [a0[0] + px * widthM, a0[1] + py * widthM];
    try {
      const strip = asTurfPolygon([a0, b0, c1, d1], origin);
      const cut = turf.intersect(turf.featureCollection([gleba, strip]));
      out.push(...flattenPoly(cut, origin).filter((poly) => planarAreaM2(poly[0]) >= SLIVER_M2));
    } catch {
      /* aresta degenerada */
    }
  }
  return out;
}

function signedRingArea(pts: Position[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function sameEdge(a: Position, b: Position, edge: Position[], tolM = 1): boolean {
  const c = edge[0];
  const d = edge[1];
  if (!c || !d) return false;
  const direct = planarLength(a, c) <= tolM && planarLength(b, d) <= tolM;
  const reverse = planarLength(a, d) <= tolM && planarLength(b, c) <= tolM;
  if (direct || reverse) return true;
  const m = midpoint(a, b);
  const len = planarLength(c, d);
  if (len < 0.5) return false;
  const ux = (d[0] - c[0]) / len;
  const uy = (d[1] - c[1]) / len;
  const off = Math.abs((m[0] - c[0]) * uy - (m[1] - c[1]) * ux);
  const t = (m[0] - c[0]) * ux + (m[1] - c[1]) * uy;
  return off <= tolM && t >= -tolM && t <= len + tolM && azDelta180(planarAzimuthDeg(a, b), planarAzimuthDeg(c, d)) <= 3;
}

/**
 * Via de contorno colada **por dentro** em cada aresta da gleba, com a largura cheia
 * ao longo de toda a aresta. Arestas em `skipEdges` (via existente, faixa de domínio) ficam sem via.
 */
export function generatePerimeterStreetsAlongEdges(
  glebaCoords: PolygonCoords,
  widthM: number,
  skipEdges: Position[][] = [],
): { vias: Position[][][]; eixos: Position[][] } {
  const pts = dropClosing(glebaCoords);
  if (pts.length < 3 || !(widthM > 0)) return { vias: [], eixos: [] };
  const origin = originOf(pts);
  const gleba = asTurfPolygon(pts, origin);
  const ccw = signedRingArea(pts) > 0;
  const halfW = widthM / 2;
  const n = pts.length;
  const isStreet = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    if (planarLength(a, b) < 0.5) return false;
    return !skipEdges.some((edge) => sameEdge(a, b, edge));
  });
  const inward = (i: number) => {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = planarLength(a, b);
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    return { a, b, ux, uy, px: ccw ? -uy : uy, py: ccw ? ux : -ux, len };
  };
  /** Canto do eixo: interseção das paralelas a halfW das duas arestas. */
  const axisCorner = (i: number, j: number, fallback: Position): Position => {
    const e1 = inward(i);
    const e2 = inward(j);
    const p1: Position = [e1.a[0] + e1.px * halfW, e1.a[1] + e1.py * halfW];
    const p2: Position = [e2.a[0] + e2.px * halfW, e2.a[1] + e2.py * halfW];
    const den = e1.ux * e2.uy - e1.uy * e2.ux;
    if (Math.abs(den) < 1e-6) return fallback;
    const t = ((p2[0] - p1[0]) * e2.uy - (p2[1] - p1[1]) * e2.ux) / den;
    return [p1[0] + e1.ux * t, p1[1] + e1.uy * t];
  };
  const vias: Position[][][] = [];
  const eixos: Position[][] = [];
  for (let i = 0; i < n; i++) {
    if (!isStreet[i]) continue;
    const e = inward(i);
    if (!(e.len >= 0.5)) continue;
    const ext = widthM * 2;
    const a0: Position = [e.a[0] - e.ux * ext, e.a[1] - e.uy * ext];
    const b0: Position = [e.b[0] + e.ux * ext, e.b[1] + e.uy * ext];
    const strip: Position[] = [
      a0,
      b0,
      [b0[0] + e.px * widthM, b0[1] + e.py * widthM],
      [a0[0] + e.px * widthM, a0[1] + e.py * widthM],
    ];
    try {
      const clipped = turf.intersect(turf.featureCollection([gleba, asTurfPolygon(strip, origin)]));
      vias.push(...flattenPoly(clipped, origin).filter((poly) => planarAreaM2(poly[0]) >= SLIVER_M2));
    } catch {
      /* aresta degenerada */
    }
    const prev = (i - 1 + n) % n;
    const next = (i + 1) % n;
    const startFallback: Position = [e.a[0] + e.px * halfW, e.a[1] + e.py * halfW];
    const endFallback: Position = [e.b[0] + e.px * halfW, e.b[1] + e.py * halfW];
    const start = isStreet[prev] ? axisCorner(prev, i, startFallback) : startFallback;
    const end = isStreet[next] ? axisCorner(i, next, endFallback) : endFallback;
    if (planarLength(start, end) >= 0.5) eixos.push([start, end]);
  }
  return { vias, eixos };
}

/**
 * Contorno da área loteável (gleba − área verde): via por dentro em todas as arestas,
 * inclusive as que confrontam a área verde. Área verde no miolo ganha anel de via em volta.
 */
function perimeterStreetsAroundGreen(
  ring: Position[],
  greenRings: Position[][],
  widthM: number,
  skipEdges: Position[][],
  origin: Position,
): { vias: Position[][][]; eixos: Position[][] } {
  if (greenRings.length === 0) return generatePerimeterStreetsAlongEdges(ring, widthM, skipEdges);
  const hosts = subtractRingsFromHost(ring, greenRings, origin);
  const vias: Position[][][] = [];
  const eixos: Position[][] = [];
  for (const host of hosts) {
    const outer = host[0];
    if (!outer || dropClosing(outer).length < 3) continue;
    const edge = generatePerimeterStreetsAlongEdges(outer, widthM, skipEdges);
    vias.push(...edge.vias);
    eixos.push(...edge.eixos);
    const holes = host.slice(1).filter((h) => dropClosing(h).length >= 3);
    if (holes.length > 0) {
      const anel = greenAreaRingRoads(outer, holes, [], widthM, origin, false);
      vias.push(...anel.vias);
      eixos.push(...anel.eixos);
    }
  }
  return { vias, eixos };
}

export type StreetGridOpts = {
  skipInternals?: boolean;
};

export function generateStreetGrid(
  polygonCoords: PolygonCoords,
  azimuthDeg: number,
  larguraViaM: number,
  profundidadeQuadraM: number,
  _areaMinimaQuadraM2 = 0,
  skipPerimeter: boolean | PerimeterSkip = false,
  opts: StreetGridOpts = {},
): { vias: Position[][][]; eixos: Position[][] } {
  const ring = dropClosing(polygonCoords);
  if (ring.length < 3 || larguraViaM <= 0 || profundidadeQuadraM <= 0) return { vias: [], eixos: [] };

  const origin = originOf(ring);
  const gleba = asTurfPolygon(ring, origin);
  const az = ((azimuthDeg % 360) + 360) % 360;
  const rad = (az * Math.PI) / 180;
  const dirS: Position = [Math.sin(rad), Math.cos(rad)];
  const dirD: Position = [Math.cos(rad), -Math.sin(rad)];

  let sMin = Infinity;
  let sMax = -Infinity;
  let dMin = Infinity;
  let dMax = -Infinity;
  for (const p of ring) {
    const vx = p[0] - origin[0];
    const vy = p[1] - origin[1];
    const s = vx * dirS[0] + vy * dirS[1];
    const d = vx * dirD[0] + vy * dirD[1];
    sMin = Math.min(sMin, s);
    sMax = Math.max(sMax, s);
    dMin = Math.min(dMin, d);
    dMax = Math.max(dMax, d);
  }

  const halfW = larguraViaM / 2;
  const skip = resolvePerimeterSkip(skipPerimeter);
  const dStart = dMin + halfW;
  const dEnd = dMax - halfW;
  if (dEnd < dStart - ANGLE_EPS) return { vias: [], eixos: [] };

  /** Quadra de duas fileiras: 2 × profundidade do lote + via entre quadras. */
  const step = profundidadeQuadraM * 2 + larguraViaM;
  const pads = Math.max(sMax - sMin, dMax - dMin, 1) * 0.05 + larguraViaM;
  const vias: Position[][][] = [];
  const eixos: Position[][] = [];

  const addStreet = (a: Position, b: Position) => {
    const viaPolys = clipCorridorToGleba(a, b, halfW, gleba, origin);
    if (viaPolys.length === 0) return;
    vias.push(...viaPolys);
    eixos.push(...clipStraightAxisToPolygon(a, b, gleba, origin));
  };

  const internals: number[] = [];
  if (!opts.skipInternals) {
    const skipBothD = Boolean(skip.dMin && skip.dMax);
    if (skipBothD) {
      /** Bloco já encostado em via externa: primeira interna após 2 fileiras, sem rua fantasma na borda. */
      const minRemain = profundidadeQuadraM * 0.75;
      for (
        let d = dMin + profundidadeQuadraM * 2 + halfW;
        d + halfW + minRemain <= dMax + 1e-6;
        d += step
      ) {
        internals.push(d);
      }
    } else {
      const first = skip.dMin ? dMin + profundidadeQuadraM * 2 + halfW : dStart + step;
      const lastLimit = skip.dMax ? dMax - profundidadeQuadraM * 2 - halfW : dEnd - step * 0.45;
      for (let d = first; d <= lastLimit + 1e-6; d += step) internals.push(d);
    }
  }

  const dPositions: number[] = [...internals];
  if (dEnd - dStart > 1e-3) {
    if (!skip.dMin) dPositions.push(dStart);
    if (!skip.dMax) dPositions.push(dEnd);
  } else if (!skip.dMin) {
    dPositions.push(dStart);
  }
  for (const d of dPositions) {
    const a: Position = [
      origin[0] + (sMin - pads) * dirS[0] + d * dirD[0],
      origin[1] + (sMin - pads) * dirS[1] + d * dirD[1],
    ];
    const b: Position = [
      origin[0] + (sMax + pads) * dirS[0] + d * dirD[0],
      origin[1] + (sMax + pads) * dirS[1] + d * dirD[1],
    ];
    addStreet(a, b);
  }

  const sStart = sMin + halfW;
  const sEnd = sMax - halfW;
  if (sEnd >= sStart - ANGLE_EPS) {
    const sPositions: number[] = [];
    if (!skip.sMin) sPositions.push(sStart);
    if (!skip.sMax) sPositions.push(sEnd);
    for (const s of sPositions) {
      const a: Position = [
        origin[0] + s * dirS[0] + (dMin - pads) * dirD[0],
        origin[1] + s * dirS[1] + (dMin - pads) * dirD[1],
      ];
      const b: Position = [
        origin[0] + s * dirS[0] + (dMax + pads) * dirD[0],
        origin[1] + s * dirS[1] + (dMax + pads) * dirD[1],
      ];
      addStreet(a, b);
    }
  }

  return { vias, eixos };
}

const TARGET_KEEP_RATIO = 1.52;
const TARGET_MIN_CHILD_RATIO = 0.48;
const TARGET_GRID_MIN_SIDE = 8;
const TARGET_MAX_DEPTH = 14;

function projectRingBounds(
  ring: Position[],
  origin: Position,
  dirS: Position,
  dirD: Position,
): { sMin: number; sMax: number; dMin: number; dMax: number } {
  let sMin = Infinity;
  let sMax = -Infinity;
  let dMin = Infinity;
  let dMax = -Infinity;
  for (const p of ring) {
    const vx = p[0] - origin[0];
    const vy = p[1] - origin[1];
    const s = vx * dirS[0] + vy * dirS[1];
    const d = vx * dirD[0] + vy * dirD[1];
    sMin = Math.min(sMin, s);
    sMax = Math.max(sMax, s);
    dMin = Math.min(dMin, d);
    dMax = Math.max(dMax, d);
  }
  return { sMin, sMax, dMin, dMax };
}

function stripRing(
  origin: Position,
  dirS: Position,
  dirD: Position,
  s0: number,
  s1: number,
  d0: number,
  d1: number,
): Position[] {
  const p = (s: number, d: number): Position => [
    origin[0] + s * dirS[0] + d * dirD[0],
    origin[1] + s * dirS[1] + d * dirD[1],
  ];
  return closeRing([p(s0, d0), p(s1, d0), p(s1, d1), p(s0, d1)]);
}

function clipRingByStrip(
  ring: Position[],
  origin: Position,
  dirS: Position,
  dirD: Position,
  s0: number,
  s1: number,
  d0: number,
  d1: number,
): Position[][] {
  try {
    const feat = asTurfPolygon(ring, origin);
    const strip = asTurfPolygon(stripRing(origin, dirS, dirD, s0, s1, d0, d1), origin);
    const cut = turf.intersect(turf.featureCollection([feat, strip]));
    return flattenPoly(cut, origin)
      .map((poly) => closeRing(poly[0] ?? []))
      .filter((outer) => dropClosing(outer).length >= 3 && planarAreaM2(outer) >= SLIVER_M2);
  } catch {
    return [];
  }
}

function chooseTargetGrid(
  spanS: number,
  spanD: number,
  targetM2: number,
  viaWidthM: number,
): { ns: number; nd: number; blockS: number; blockD: number } | null {
  let best: { ns: number; nd: number; blockS: number; blockD: number; score: number } | null = null;
  const maxN = 16;
  for (let ns = 1; ns <= maxN; ns++) {
    for (let nd = 1; nd <= maxN; nd++) {
      if (ns * nd < 2) continue;
      const blockS = (spanS - (ns - 1) * viaWidthM) / ns;
      const blockD = (spanD - (nd - 1) * viaWidthM) / nd;
      if (blockS < TARGET_GRID_MIN_SIDE || blockD < TARGET_GRID_MIN_SIDE) continue;
      const area = blockS * blockD;
      if (area < targetM2 * 0.45 || area > targetM2 * 1.85) continue;
      const aspect = Math.max(blockS / blockD, blockD / blockS);
      const score = Math.abs(area - targetM2) + (aspect - 1) * targetM2 * 0.1;
      if (!best || score < best.score) {
        best = { ns, nd, blockS, blockD, score };
      }
    }
  }
  return best;
}

function splitOnceByCut(
  ring: Position[],
  origin: Position,
  azimuthDeg: number,
  viaWidthM: number,
  ratio: number,
): { left: Position[][]; right: Position[][]; vias: Position[][][]; eixos: Position[][] } | null {
  const pts = dropClosing(ring);
  if (pts.length < 3 || !(viaWidthM > 0)) return null;
  const { dirS, dirD } = streetDir(azimuthDeg);
  const c = originOf(pts);
  const b = projectRingBounds(pts, c, dirS, dirD);
  const spanS = b.sMax - b.sMin;
  const spanD = b.dMax - b.dMin;
  const halfW = viaWidthM / 2;
  if (spanD < viaWidthM + TARGET_GRID_MIN_SIDE * 2) return null;

  const pad = Math.max(spanS, spanD, 10) + viaWidthM + 8;
  const total = planarAreaM2(ring);
  const goal = total * Math.min(0.85, Math.max(0.15, ratio));
  let lo = b.dMin;
  let hi = b.dMax;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    const leftArea = clipRingByStrip(ring, c, dirS, dirD, b.sMin - pad, b.sMax + pad, b.dMin - 1, mid).reduce(
      (s, outer) => s + planarAreaM2(outer),
      0,
    );
    if (leftArea < goal) lo = mid;
    else hi = mid;
  }
  const cut = (lo + hi) / 2;
  const left = clipRingByStrip(ring, c, dirS, dirD, b.sMin - pad, b.sMax + pad, b.dMin - 1, cut - halfW);
  const right = clipRingByStrip(ring, c, dirS, dirD, b.sMin - pad, b.sMax + pad, cut + halfW, b.dMax + 1);
  if (left.length === 0 || right.length === 0) return null;

  const piece = asTurfPolygon(ring, origin);
  const a: Position = [
    c[0] + (b.sMin - pad) * dirS[0] + cut * dirD[0],
    c[1] + (b.sMin - pad) * dirS[1] + cut * dirD[1],
  ];
  const bb: Position = [
    c[0] + (b.sMax + pad) * dirS[0] + cut * dirD[0],
    c[1] + (b.sMax + pad) * dirS[1] + cut * dirD[1],
  ];
  const vias = clipCorridorToGleba(a, bb, halfW, piece, origin);
  const eixos = clipStraightAxisToPolygon(a, bb, piece, origin);
  if (vias.length === 0) return null;
  return { left, right, vias, eixos };
}

/**
 * Parte a gleba em quadras de área alvo, com corredores de via entre elas.
 * Prefere malha 2D no eixo longo; recorre a bipartição em restos irregulares.
 */
export function splitParcelByTargetArea(
  polygonCoords: PolygonCoords,
  targetM2: number,
  viaWidthM: number,
  azimuthDeg: number,
  originHint?: Position,
): { quadras: Position[][]; vias: Position[][][]; eixos: Position[][] } {
  const ring = dropClosing(polygonCoords);
  const empty = { quadras: [] as Position[][], vias: [] as Position[][][], eixos: [] as Position[][] };
  if (ring.length < 3 || !(targetM2 > 0) || !(viaWidthM > 0)) {
    return ring.length >= 3 ? { quadras: [closeRing(ring)], vias: [], eixos: [] } : empty;
  }

  const origin = originHint ?? originOf(ring);
  const vias: Position[][][] = [];
  const eixos: Position[][] = [];
  const quadras: Position[][] = [];

  const applyGrid = (piece: Position[]): boolean => {
    const pts = dropClosing(piece);
    const area = planarAreaM2(pts);
    if (area <= targetM2 * TARGET_KEEP_RATIO) return false;
    const fill = (() => {
      const az = azimuthDeg;
      const { dirS, dirD } = streetDir(az);
      const c = originOf(pts);
      const b = projectRingBounds(pts, c, dirS, dirD);
      const aabb = Math.max((b.sMax - b.sMin) * (b.dMax - b.dMin), 1);
      return area / aabb;
    })();
    if (fill < 0.62) return false;

    const tryAz = [azimuthDeg, azimuthDeg + 90];
    let placed = false;
    for (const az of tryAz) {
      const { dirS, dirD } = streetDir(az);
      const c = originOf(pts);
      const b = projectRingBounds(pts, c, dirS, dirD);
      const spanS = b.sMax - b.sMin;
      const spanD = b.dMax - b.dMin;
      const grid = chooseTargetGrid(spanS, spanD, targetM2, viaWidthM);
      if (!grid) continue;
      const pieceFeat = asTurfPolygon(pts, origin);
      const pad = Math.max(spanS, spanD, 10) + viaWidthM + 8;
      const addCut = (s0: number, s1: number, d0: number, d1: number, alongS: boolean) => {
        const midS = (s0 + s1) / 2;
        const midD = (d0 + d1) / 2;
        const a: Position = alongS
          ? [c[0] + s0 * dirS[0] + midD * dirD[0], c[1] + s0 * dirS[1] + midD * dirD[1]]
          : [c[0] + midS * dirS[0] + d0 * dirD[0], c[1] + midS * dirS[1] + d0 * dirD[1]];
        const bb: Position = alongS
          ? [c[0] + s1 * dirS[0] + midD * dirD[0], c[1] + s1 * dirS[1] + midD * dirD[1]]
          : [c[0] + midS * dirS[0] + d1 * dirD[0], c[1] + midS * dirS[1] + d1 * dirD[1]];
        vias.push(...clipCorridorToGleba(a, bb, viaWidthM / 2, pieceFeat, origin));
        eixos.push(...clipStraightAxisToPolygon(a, bb, pieceFeat, origin));
      };
      for (let i = 0; i < grid.ns - 1; i++) {
        const sCut = b.sMin + (i + 1) * grid.blockS + i * viaWidthM + viaWidthM / 2;
        addCut(sCut, sCut, b.dMin - pad, b.dMax + pad, false);
      }
      for (let j = 0; j < grid.nd - 1; j++) {
        const dCut = b.dMin + (j + 1) * grid.blockD + j * viaWidthM + viaWidthM / 2;
        addCut(b.sMin - pad, b.sMax + pad, dCut, dCut, true);
      }
      placed = vias.length > 0;
      if (placed) break;
    }
    return placed;
  };

  const recurse = (piece: Position[], depth: number) => {
    const pts = dropClosing(piece);
    const area = planarAreaM2(pts);
    if (pts.length < 3 || area < SLIVER_M2) return;
    if (depth >= TARGET_MAX_DEPTH || area <= targetM2 * TARGET_KEEP_RATIO) {
      if (area >= targetM2 * TARGET_MIN_CHILD_RATIO || depth === 0) quadras.push(closeRing(pts));
      return;
    }

    if (depth === 0 && applyGrid(pts)) {
      const leftover = subtractStreets(pts, vias);
      for (const poly of leftover) {
        recurse(poly[0] ?? [], depth + 1);
      }
      return;
    }

    const n = Math.max(2, Math.round(area / targetM2));
    const ratio = Math.floor(n / 2) / n;
    const azA = getMainAxisAzimuth(pts);
    const options = [azA, azA + 90, azimuthDeg, azimuthDeg + 90];
    let split: ReturnType<typeof splitOnceByCut> = null;
    for (const az of options) {
      const cand = splitOnceByCut(pts, origin, az, viaWidthM, ratio);
      if (!cand) continue;
      const leftA = cand.left.reduce((s, r) => s + planarAreaM2(r), 0);
      const rightA = cand.right.reduce((s, r) => s + planarAreaM2(r), 0);
      if (leftA < targetM2 * TARGET_MIN_CHILD_RATIO || rightA < targetM2 * TARGET_MIN_CHILD_RATIO) continue;
      split = cand;
      break;
    }
    if (!split) {
      quadras.push(closeRing(pts));
      return;
    }
    vias.push(...split.vias);
    eixos.push(...split.eixos);
    for (const child of split.left) recurse(child, depth + 1);
    for (const child of split.right) recurse(child, depth + 1);
  };

  recurse(ring, 0);
  if (quadras.length === 0) quadras.push(closeRing(ring));
  return { quadras, vias, eixos };
}

/** Faixa em s coberta por todas as seções transversais (d constante) do miolo da peça. */
function innerSpanAlongS(
  ring: Position[],
  c: Position,
  dirS: Position,
  dirD: Position,
  b: { sMin: number; sMax: number; dMin: number; dMax: number },
): { lo: number; hi: number } {
  const pts = dropClosing(ring).map((p) => {
    const vx = p[0] - c[0];
    const vy = p[1] - c[1];
    return [vx * dirS[0] + vy * dirS[1], vx * dirD[0] + vy * dirD[1]] as const;
  });
  /**
   * Seções no miolo (15–85 % de d): perto dos extremos as arestas longas, levemente
   * inclinadas, cortam a seção pela metade. Os cantos saem por extrapolação linear.
   */
  const section = (t: number): [number, number] | null => {
    const d = b.dMin + (b.dMax - b.dMin) * t;
    let sLo = Infinity;
    let sHi = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [s1, d1] = pts[i];
      const [s2, d2] = pts[(i + 1) % pts.length];
      if ((d1 - d) * (d2 - d) > 0 || Math.abs(d2 - d1) < 1e-9) continue;
      const s = s1 + ((d - d1) / (d2 - d1)) * (s2 - s1);
      sLo = Math.min(sLo, s);
      sHi = Math.max(sHi, s);
    }
    return Number.isFinite(sLo) ? [sLo, sHi] : null;
  };
  const t0 = 0.15;
  const t1 = 0.85;
  const steps = 28;
  let lo = -Infinity;
  let hi = Infinity;
  for (let k = 0; k <= steps; k++) {
    const sec = section(t0 + ((t1 - t0) * k) / steps);
    if (!sec) continue;
    lo = Math.max(lo, sec[0]);
    hi = Math.min(hi, sec[1]);
  }
  const first = section(t0);
  const last = section(t1);
  if (first && last) {
    const k = t0 / (t1 - t0);
    lo = Math.max(lo, first[0] + (first[0] - last[0]) * k, last[0] + (last[0] - first[0]) * k);
    hi = Math.min(hi, first[1] + (first[1] - last[1]) * k, last[1] + (last[1] - first[1]) * k);
  }
  return Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? { lo, hi } : { lo: b.sMin, hi: b.sMin };
}

/**
 * Parte a gleba em quadras de largura × profundidade fixas, com vias entre elas.
 * O resto na borda vira quadra menor (depois loteada) — não deixa vazio urbanizável.
 */
export function splitParcelByDimensions(
  polygonCoords: PolygonCoords,
  larguraQuadraM: number,
  profundidadeBlocoM: number,
  viaWidthM: number,
  azimuthDeg: number,
  originHint?: Position,
  skipPerimeter: boolean | PerimeterSkip = false,
): { quadras: Position[][]; vias: Position[][][]; eixos: Position[][] } {
  const ring = dropClosing(polygonCoords);
  const empty = { quadras: [] as Position[][], vias: [] as Position[][][], eixos: [] as Position[][] };
  if (ring.length < 3 || !(larguraQuadraM > 0) || !(profundidadeBlocoM > 0) || !(viaWidthM > 0)) {
    return ring.length >= 3 ? { quadras: [closeRing(ring)], vias: [], eixos: [] } : empty;
  }

  const origin = originHint ?? originOf(ring);
  const { dirS, dirD } = streetDir(azimuthDeg);
  const c = originOf(ring);
  const b = projectRingBounds(ring, c, dirS, dirD);
  const spanS = b.sMax - b.sMin;
  const spanD = b.dMax - b.dMin;
  const halfW = viaWidthM / 2;
  const skip = resolvePerimeterSkip(skipPerimeter);
  const vias: Position[][][] = [];
  const eixos: Position[][] = [];
  const pieceFeat = asTurfPolygon(ring, origin);
  const pad = Math.max(spanS, spanD, 10) + viaWidthM + 8;
  /** Corredores inteiros: recortar a quadra com eles não deixa fio de área ligando quadras vizinhas. */
  const rawCuts: Position[][][] = [];

  const addCut = (s0: number, s1: number, d0: number, d1: number, alongS: boolean) => {
    const midS = (s0 + s1) / 2;
    const midD = (d0 + d1) / 2;
    const margin = halfW + 1;
    if (alongS) {
      if (skip.dMin && midD - margin <= b.dMin + 0.5) return;
      if (skip.dMax && midD + margin >= b.dMax - 0.5) return;
    } else {
      if (skip.sMin && midS - margin <= b.sMin + 0.5) return;
      if (skip.sMax && midS + margin >= b.sMax - 0.5) return;
    }
    const a: Position = alongS
      ? [c[0] + s0 * dirS[0] + midD * dirD[0], c[1] + s0 * dirS[1] + midD * dirD[1]]
      : [c[0] + midS * dirS[0] + d0 * dirD[0], c[1] + midS * dirS[1] + d0 * dirD[1]];
    const bb: Position = alongS
      ? [c[0] + s1 * dirS[0] + midD * dirD[0], c[1] + s1 * dirS[1] + midD * dirD[1]]
      : [c[0] + midS * dirS[0] + d1 * dirD[0], c[1] + midS * dirS[1] + d1 * dirD[1]];
    const clipped = clipCorridorToGleba(a, bb, halfW, pieceFeat, origin);
    if (clipped.length === 0) return;
    vias.push(...clipped);
    rawCuts.push([corridorPolygon(a, bb, halfW)]);
    eixos.push(...clipStraightAxisToPolygon(a, bb, pieceFeat, origin));
  };

  /**
   * Quadras iguais em cada direção. Entre ruas: nunca menos que `larguraQuadraM`
   * (a sobra é repartida entre todas, sem quadra de borda gigante ou estreita).
   * Ao longo da rua: o número de quadras mais próximo de `profundidadeBlocoM`.
   */
  /**
   * Com lados inclinados, a quadra da ponta é um trapézio: a largura conta a partir do
   * ponto mais estreito (miolo comum a todas as seções), para nenhum trecho ficar abaixo do mínimo.
   */
  const inner = innerSpanAlongS(ring, c, dirS, dirD, b);
  const useInner = inner.hi - inner.lo >= spanS * 0.6;  const sLo = useInner ? inner.lo : b.sMin;
  const spanEff = useInner ? inner.hi - inner.lo : spanS;
  const nS = Math.max(1, Math.floor((spanEff + viaWidthM + 1e-6) / (larguraQuadraM + viaWidthM)));
  const blockS = (spanEff - (nS - 1) * viaWidthM) / nS;
  for (let i = 1; i < nS; i++) {
    const sCut = sLo + i * blockS + (i - 1) * viaWidthM + halfW;
    addCut(sCut, sCut, b.dMin - pad, b.dMax + pad, false);
  }
  const nD = Math.max(1, Math.round((spanD + viaWidthM) / (profundidadeBlocoM + viaWidthM)));
  const blockD = (spanD - (nD - 1) * viaWidthM) / nD;
  for (let j = 1; j < nD; j++) {
    const dCut = b.dMin + j * blockD + (j - 1) * viaWidthM + halfW;
    addCut(b.sMin - pad, b.sMax + pad, dCut, dCut, true);
  }

  if (vias.length === 0) {
    return { quadras: [closeRing(ring)], vias: [], eixos: [] };
  }
  const leftover = subtractStreets(ring, rawCuts);
  const quadras = leftover
    .map((poly) => closeRing(poly[0] ?? []))
    .filter((outer) => dropClosing(outer).length >= 3 && planarAreaM2(outer) >= SLIVER_M2);
  return { quadras: quadras.length > 0 ? quadras : [closeRing(ring)], vias, eixos };
}

function clipBufferedAxisToGleba(
  axis: Position[],
  halfW: number,
  gleba: Feature<Polygon>,
  origin: Position,
): Position[][][] {
  const bufRing = bufferPolylineMeters(axis, halfW, "both");
  if (dropClosing(bufRing).length < 3) return [];
  try {
    const feat = asTurfPolygon(bufRing, origin);
    const clipped = turf.intersect(turf.featureCollection([gleba, feat]));
    return flattenPoly(clipped, origin).filter((poly) => planarAreaM2(poly[0]) >= SLIVER_M2);
  } catch {
    return [];
  }
}

/** Bufferiza eixos de via já desenhados (polilinhas) e recorta na gleba. */
export function bufferExistingStreetAxes(
  glebaCoords: PolygonCoords,
  axes: Position[][],
  larguraViaM: number,
): { vias: Position[][][]; eixos: Position[][] } {
  const ring = dropClosing(glebaCoords);
  if (ring.length < 3 || !(larguraViaM > 0) || axes.length === 0) return { vias: [], eixos: [] };
  const origin = originOf(ring);
  const gleba = asTurfPolygon(ring, origin);
  const halfW = larguraViaM / 2;
  const vias: Position[][][] = [];
  const eixos: Position[][] = [];
  for (const axis of axes) {
    const pts = dropClosing(axis).filter((p, i, arr) => {
      const prev = arr[i - 1];
      return !prev || planarLength(prev, p) >= 1e-9;
    });
    if (pts.length < 2) continue;
    const whole = clipBufferedAxisToGleba(pts, halfW, gleba, origin);
    if (whole.length > 0) {
      vias.push(...whole);
    } else {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (planarLength(a, b) < 1) continue;
        vias.push(...clipCorridorToGleba(a, b, halfW, gleba, origin));
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (planarLength(a, b) < 1) continue;
      eixos.push(...clipStraightAxisToPolygon(a, b, gleba, origin));
    }
  }
  return { vias, eixos };
}

export function subtractStreets(glebaCoords: PolygonCoords, viasPolygons: Position[][][]): Position[][][] {
  const ring = dropClosing(glebaCoords);
  if (ring.length < 3) return [];
  const origin = originOf(ring);
  const gleba = asTurfPolygon(ring, origin);
  if (viasPolygons.length === 0) return [[closeRing(ring)]];

  const streets = unionPolygons(viasPolygons, origin);
  if (!streets) return [[closeRing(ring)]];

  const leftover = turf.difference(turf.featureCollection([gleba, streets]));
  return flattenPoly(leftover, origin).filter((poly) => planarAreaM2(poly[0]) >= SLIVER_M2);
}

/** Recorta polígonos para não sobrepor obstáculos (reserva legal). Limite compartilhado ok. */
export function subtractObstaclesFromPolys(
  polys: Position[][][],
  obstacles: Position[][][],
  origin: Position,
): Position[][][] {
  if (obstacles.length === 0) return polys;
  const obsU = unionPolygons(obstacles, origin);
  if (!obsU) return polys;
  const out: Position[][][] = [];
  for (const poly of polys) {
    const outer = poly[0];
    if (!outer || dropClosing(outer).length < 3) continue;
    try {
      const feat = asTurfPolygon(outer, origin);
      const leftover = turf.difference(turf.featureCollection([feat, obsU]));
      out.push(
        ...flattenPoly(leftover, origin).filter((p) => planarAreaM2(p[0] ?? []) >= SLIVER_M2),
      );
    } catch {
      out.push(poly);
    }
  }
  return out;
}

/** Remove trechos de eixos que cruzam o interior da reserva. */
export function clipAxesOutsideObstacles(
  axes: Position[][],
  obstacles: Position[][][],
  origin: Position,
): Position[][] {
  if (obstacles.length === 0) return axes;
  const obsFeats = toTurfPolys(obstacles, origin);
  if (obsFeats.length === 0) return axes;
  const insideObs = (p: Position) =>
    obsFeats.some((feat) =>
      turf.booleanPointInPolygon(turf.point(toGeo(p, origin)), feat, { ignoreBoundary: true }),
    );
  const out: Position[][] = [];
  for (const axis of axes) {
    const pts = dropClosing(axis);
    if (pts.length < 2) continue;
    const dense: Position[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = planarLength(a, b);
      const n = Math.max(2, Math.ceil(len / 2));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        dense.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    dense.push(pts[pts.length - 1]);
    let run: Position[] = [];
    const flush = () => {
      if (run.length >= 2 && planarLength(run[0], run[run.length - 1]) >= 1) out.push(run);
      run = [];
    };
    for (const p of dense) {
      if (!insideObs(p)) run.push(p);
      else flush();
    }
    flush();
  }
  return out;
}

/** Folga (m) para considerar que uma via cortada termina no limite da área verde. */
const GREEN_TOUCH_M = 0.3;

/**
 * Via de contorno da área verde: faixa de `larguraViaM` colada ao limite da reserva, dentro
 * da gleba. Só entra para reservas onde alguma via foi cortada — as pontas passam a desembocar
 * nela em vez de terminar soltas no limite da reserva.
 */
export function greenAreaRingRoads(
  glebaCoords: PolygonCoords,
  greenRings: Position[][],
  vias: Position[][][],
  larguraViaM: number,
  origin: Position,
  requireTouch = true,
): { vias: Position[][][]; eixos: Position[][] } {
  const ring = dropClosing(glebaCoords);
  if (ring.length < 3 || !(larguraViaM > 0) || greenRings.length === 0 || (requireTouch && vias.length === 0)) {
    return { vias: [], eixos: [] };
  }
  const gleba = asTurfPolygon(ring, origin);
  const viaFeats = toTurfPolys(vias, origin);
  const outVias: Position[][][] = [];
  const outEixos: Position[][] = [];
  for (const green of greenRings) {
    if (dropClosing(green).length < 3) continue;
    let greenFeat: Feature<Polygon>;
    try {
      greenFeat = asTurfPolygon(green, origin);
    } catch {
      continue;
    }
    try {
      if (requireTouch) {
        const touch = turf.buffer(greenFeat, GREEN_TOUCH_M, { units: "meters", steps: 8 });
        if (!touch?.geometry || !viaFeats.some((v) => turf.booleanIntersects(touch, v))) continue;
      }
      const outer = turf.buffer(greenFeat, larguraViaM, { units: "meters", steps: 8 });
      if (!outer?.geometry) continue;
      const inGleba = turf.intersect(turf.featureCollection([gleba, outer as Feature<Polygon | MultiPolygon>]));
      if (!inGleba) continue;
      const band = turf.difference(turf.featureCollection([inGleba, greenFeat]));
      outVias.push(...flattenPoly(band, origin).filter((p) => planarAreaM2(p[0] ?? []) >= SLIVER_M2));

      const mid = turf.buffer(greenFeat, larguraViaM / 2, { units: "meters", steps: 8 });
      if (!mid?.geometry) continue;
      const midRings =
        mid.geometry.type === "Polygon"
          ? [mid.geometry.coordinates[0]]
          : mid.geometry.coordinates.map((poly) => poly[0]);
      for (const geoRing of midRings) {
        outEixos.push(...clipClosedAxisToGleba(ringFromGeo(geoRing, origin), gleba, origin));
      }
    } catch {
      /* buffer/recorte degenerado — sem contorno para esta reserva */
    }
  }
  return { vias: outVias, eixos: outEixos };
}

/** Trechos de um eixo fechado que ficam dentro da gleba. */
function clipClosedAxisToGleba(axis: Position[], gleba: Feature<Polygon>, origin: Position): Position[][] {
  const pts = dropClosing(axis);
  if (pts.length < 3) return [];
  const inside = pts.map((p) => turf.booleanPointInPolygon(turf.point(toGeo(p, origin)), gleba));
  if (inside.every(Boolean)) return [closeRing(pts)];
  const start = inside.findIndex((v) => !v);
  const out: Position[][] = [];
  let run: Position[] = [];
  for (let k = 1; k <= pts.length; k++) {
    const i = (start + k) % pts.length;
    if (inside[i]) {
      run.push(pts[i]);
    } else {
      if (run.length >= 2) out.push(run);
      run = [];
    }
  }
  if (run.length >= 2) out.push(run);
  return out;
}

export type PolylineBufferSide = "both" | "left" | "right";

function intersectInfinite(a: Position, b: Position, c: Position, d: Position): Position | null {
  const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
  if (Math.abs(den) < 1e-18) return null;
  const t = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / den;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

function offsetOpenChain(pts: Position[], dist: number): Position[] {
  const segs: { a: Position; b: Position; nx: number; ny: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = planarLength(a, b);
    if (len < 1e-9) continue;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    segs.push({ a, b, nx: -uy, ny: ux });
  }
  if (segs.length === 0) return [];
  const out: Position[] = [
    [segs[0].a[0] + segs[0].nx * dist, segs[0].a[1] + segs[0].ny * dist],
  ];
  const miterLimit = Math.abs(dist) * 4;
  for (let i = 0; i < segs.length - 1; i++) {
    const s0 = segs[i];
    const s1 = segs[i + 1];
    const p1: Position = [s0.a[0] + s0.nx * dist, s0.a[1] + s0.ny * dist];
    const p2: Position = [s0.b[0] + s0.nx * dist, s0.b[1] + s0.ny * dist];
    const p3: Position = [s1.a[0] + s1.nx * dist, s1.a[1] + s1.ny * dist];
    const p4: Position = [s1.b[0] + s1.nx * dist, s1.b[1] + s1.ny * dist];
    const hit = intersectInfinite(p1, p2, p3, p4);
    const joint: Position = [s0.b[0], s0.b[1]];
    if (hit && planarLength(hit, joint) <= miterLimit) out.push(hit);
    else {
      out.push(p2);
      out.push(p3);
    }
  }
  const last = segs[segs.length - 1];
  out.push([last.b[0] + last.nx * dist, last.b[1] + last.ny * dist]);
  return out;
}

function circleRing(center: Position, radius: number, steps = 16): Position[] {
  const pts: Position[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius]);
  }
  return closeRing(pts);
}

function largestOuterRing(polys: Position[][][]): Position[] {
  let best: Position[] = [];
  let bestA = -1;
  for (const poly of polys) {
    const outer = poly[0];
    if (!outer) continue;
    const area = planarAreaM2(outer);
    if (area > bestA) {
      bestA = area;
      best = outer;
    }
  }
  return best.length >= 3 ? closeRing(dropClosing(best)) : [];
}

/**
 * Buffer em metros em torno de uma polilinha (cápsula/estádio nos dois lados).
 * `left`/`right` = um lado no sentido do traçado (início → fim).
 */
export function bufferPolylineMeters(
  line: Position[],
  widthM: number,
  side: PolylineBufferSide = "both",
): Position[] {
  if (!(widthM > 0) || line.length < 2) return [];
  const raw = line.map((p) => [p[0], p[1]] as Position);
  const closed =
    raw.length >= 3 &&
    Math.hypot(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]) < 1e-6;
  const pts: Position[] = [];
  for (const p of dropClosing(raw)) {
    const prev = pts[pts.length - 1];
    if (prev && planarLength(prev, p) < 1e-9) continue;
    pts.push(p);
  }
  if (pts.length < 2) return [];
  const chain = closed ? [...pts, pts[0]] : pts;

  if (side !== "both") {
    const dist = side === "left" ? widthM : -widthM;
    const off = offsetOpenChain(chain, dist);
    if (off.length < 2) return [];
    const ring = [...(closed ? pts : chain), ...off.slice().reverse()];
    return dropClosing(ring).length >= 3 ? closeRing(ring) : [];
  }

  const origin = originOf(pts);
  try {
    const geo = chain.map((p) => toGeo(p, origin));
    const ls = turf.lineString(geo);
    const buf = turf.buffer(ls, widthM, { units: "meters", steps: 16 });
    const ring = largestOuterRing(flattenPoly(buf, origin));
    if (dropClosing(ring).length >= 3 && planarAreaM2(ring) >= SLIVER_M2) return ring;
  } catch {
    /* fallback planar */
  }

  const strips: Position[][][] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const corr = corridorPolygon(chain[i], chain[i + 1], widthM);
    if (corr.length >= 4) strips.push([corr]);
  }
  if (!closed) {
    strips.push([circleRing(chain[0], widthM)]);
    strips.push([circleRing(chain[chain.length - 1], widthM)]);
  }
  const merged = unionPolygons(strips, origin);
  return largestOuterRing(flattenPoly(merged, origin));
}

/** Área da interseção interior (m²). Limite compartilhado tende a ~0. */
export function polygonInteriorOverlapM2(a: PolygonCoords, b: PolygonCoords): number {
  const ra = dropClosing(a);
  const rb = dropClosing(b);
  if (ra.length < 3 || rb.length < 3) return 0;
  const origin = originOf(ra);
  try {
    const fa = asTurfPolygon(ra, origin);
    const fb = asTurfPolygon(rb, origin);
    const hit = turf.intersect(turf.featureCollection([fa, fb]));
    return flattenPoly(hit, origin).reduce((s, p) => s + planarAreaM2(p[0] ?? []), 0);
  } catch {
    return 0;
  }
}

export function leftoverAfterLots(
  host: Position[],
  lots: Position[][][],
  origin: Position,
): Position[][] {
  if (lots.length === 0) {
    const area = planarAreaM2(host);
    return area >= REMAINDER_MIN_M2 ? [closeRing(host)] : [];
  }
  try {
    const hostFeat = asTurfPolygon(host, origin);
    const lotsU = unionPolygons(lots, origin);
    if (!lotsU) return [closeRing(host)];
    let padded: Feature<Polygon | MultiPolygon> = lotsU;
    try {
      const buf = turf.buffer(lotsU, 0.2, { units: "meters", steps: 8 });
      if (buf?.geometry) padded = buf as Feature<Polygon | MultiPolygon>;
    } catch {
      /* união sem buffer */
    }
    const leftover = turf.difference(turf.featureCollection([hostFeat, padded]));
    return flattenPoly(leftover, origin)
      .map((poly) => closeRing(poly[0] ?? []))
      .filter((outer) => dropClosing(outer).length >= 3 && planarAreaM2(outer) >= REMAINDER_MIN_M2);
  } catch {
    return [];
  }
}

function absorbScrapAsLots(
  ring: Position[],
  azimuthDeg: number,
  testadaMinimaM: number,
  profundidadeQuadraM: number,
  areaMinimaM2: number,
  streetRings: Position[][],
  origin: Position,
  blockCentroid: Position | undefined,
  lotOpts: { profundidadeM?: number; percentualEsquina?: number; allowShallow?: boolean; allowIrregular?: boolean },
  pass = 0,
): { lots: Position[][][]; remanescente: Position[][] } {
  const closed = closeRing(dropClosing(ring));
  const area = planarAreaM2(closed);
  if (dropClosing(closed).length < 3 || area < REMAINDER_MIN_M2) return { lots: [], remanescente: [] };
  const target = lotMinAreaM2(testadaMinimaM, profundidadeQuadraM, areaMinimaM2);
  const maxArea = lotMaxAllowedAreaM2(testadaMinimaM, profundidadeQuadraM, areaMinimaM2);
  const hostC = blockCentroid ?? originOf(closed);
  const rows =
    pass < 3 ? splitThroughBlock(closed, azimuthDeg, streetRings, origin, profundidadeQuadraM) : [closed];
  const collected: Position[][][] = [];
  for (const row of rows) {
    const rowAz =
      rows.length > 1
        ? detectRowFrontage(row, streetRings, azimuthDeg, hostC).azimuthDeg
        : azimuthDeg;
    try {
      collected.push(
        ...subdivideQuadraEmLotes(
          row,
          rowAz,
          testadaMinimaM,
          areaMinimaM2,
          streetRings,
          origin,
          rows.length > 1 ? hostC : blockCentroid,
          { ...lotOpts, allowShallow: true },
        ),
      );
    } catch {
      /* geometria degenerada */
    }
  }
  const lots = collected.filter((poly) => {
    const a = planarAreaM2(poly[0] ?? []);
    if (target > 0 && a + 1e-6 < target * 0.95) return false;
    if (Number.isFinite(maxArea) && a > maxArea + 0.5) return false;
    if (a < SLIVER_M2) return false;
    return lotHasRoadAccess(poly[0] ?? [], streetRings, testadaMinimaM);
  });
  const still = leftoverAfterLots(closed, lots, origin);
  if (pass >= 2) {
    return { lots, remanescente: still };
  }
  const remanescente: Position[][] = [];
  const more: Position[][][] = [...lots];
  for (const rem of still) {
    const again = absorbScrapAsLots(
      rem,
      foldAz180(azimuthDeg + 90),
      testadaMinimaM,
      profundidadeQuadraM,
      areaMinimaM2,
      streetRings,
      origin,
      hostC,
      lotOpts,
      pass + 1,
    );
    more.push(...again.lots);
    remanescente.push(...again.remanescente);
  }
  return { lots: more, remanescente };
}

export type ComplementarLoteamentoParams = {
  azimuthDeg: number;
  testadaMinimaM: number;
  profundidadeQuadraM: number;
  areaMinimaM2: number;
  streetRings: Position[][];
  origin: Position;
  blockCentroid?: Position;
  percentualEsquina?: number;
};

function depthFromAzimuth(ring: Position[], azimuthDeg: number): number {
  const { dirD } = streetDir(azimuthDeg);
  const c = originOf(ring);
  let min = Infinity;
  let max = -Infinity;
  for (const p of dropClosing(ring)) {
    const d = (p[0] - c[0]) * dirD[0] + (p[1] - c[1]) * dirD[1];
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  return Number.isFinite(min) ? Math.max(0, max - min) : 0;
}

function complementarLotAcceptable(
  area: number,
  testadaMinimaM: number,
  profundidadeQuadraM: number,
  areaMinimaM2: number,
): boolean {
  if (!(area >= REMAINDER_MIN_M2)) return false;
  const minArea = lotMinAreaM2(testadaMinimaM, profundidadeQuadraM, areaMinimaM2);
  const maxArea = lotMaxAllowedAreaM2(testadaMinimaM, profundidadeQuadraM, areaMinimaM2);
  if (minArea > 0 && area + 0.5 < minArea * 0.65) return false;
  if (Number.isFinite(maxArea) && area > maxArea * 1.4 + 0.5) return false;
  return true;
}

function keepComplementarLots(
  lots: Position[][][],
  testadaMinimaM: number,
  profundidadeQuadraM: number,
  areaMinimaM2: number,
  streetRings: Position[][] = [],
): Position[][][] {
  return lots.filter((poly) => {
    if (!complementarLotAcceptable(planarAreaM2(poly[0] ?? []), testadaMinimaM, profundidadeQuadraM, areaMinimaM2)) {
      return false;
    }
    if (!lotHasRoadAccess(poly[0] ?? [], streetRings, testadaMinimaM)) return false;
    const front = lotStreetFrontageM(poly[0] ?? [], streetRings);
    return !(testadaMinimaM > 0 && front + 0.08 < testadaMinimaM);
  });
}

function trySubdivideComplementar(
  ring: Position[],
  azimuthDeg: number,
  testadaMinimaM: number,
  profundidadeM: number,
  areaMinimaM2: number,
  streetRings: Position[][],
  origin: Position,
  blockCentroid: Position | undefined,
  percentualEsquina?: number,
): Position[][][] {
  try {
    return keepComplementarLots(
      subdivideQuadraEmLotes(ring, azimuthDeg, testadaMinimaM, areaMinimaM2, streetRings, origin, blockCentroid, {
        profundidadeM,
        percentualEsquina,
        allowShallow: true,
        allowIrregular: true,
      }),
      testadaMinimaM,
      profundidadeM,
      areaMinimaM2,
      streetRings,
    );
  } catch {
    return [];
  }
}

/** Parte a sobra pela aresta mais longa — só aceita lote com confrontação real à via. */
function complementarPorArestaLonga(
  ring: Position[],
  testadaMinimaM: number,
  profundidadeM: number,
  areaMinimaM2: number,
  origin: Position,
  streetRings: Position[][] = [],
): Position[][][] {
  const pts = dropClosing(ring);
  if (pts.length < 3) return [];
  let best = { a: pts[0]!, b: pts[1] ?? pts[0]!, len: 0, az: 0 };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const len = planarLength(a, b);
    if (len > best.len) best = { a, b, len, az: planarAzimuthDeg(a, b) };
  }
  if (best.len < Math.max(4, testadaMinimaM * 0.45)) return [];
  const depth = Math.max(depthFromAzimuth(ring, best.az), 0.5);
  const target = lotTargetAreaM2(testadaMinimaM, profundidadeM, areaMinimaM2);
  const minW = Math.max(
    testadaMinimaM * 0.72,
    target > 0 && depth > 0.5 ? (target * 0.65) / depth : testadaMinimaM * 0.72,
  );
  const widths = planRowLotWidths(best.len, minW, false, false, minW, Math.max(minW, testadaMinimaM * 0.85));
  const used =
    widths.length > 0
      ? widths
      : (() => {
          const n = Math.max(1, Math.floor(best.len / Math.max(minW, 1e-6) + 1e-9));
          return Array.from({ length: n }, () => best.len / n);
        })();
  return keepComplementarLots(
    subdivideRowByWidths(ring, best.az, used, streetRings, origin, undefined, 0),
    testadaMinimaM,
    profundidadeM,
    areaMinimaM2,
    streetRings,
  );
}

function complementarForcarDivisao(
  ring: Position[],
  azimuthDeg: number,
  testadaMinimaM: number,
  profundidadeM: number,
  areaMinimaM2: number,
  origin: Position,
  streetRings: Position[][] = [],
): Position[][][] {
  const depth = depthFromAzimuth(ring, azimuthDeg);
  const along = boundaryFrontageLengths(ring, azimuthDeg, streetRings);
  const hasOppStreet = along.posStreet >= 2 && along.negStreet >= 2;
  const nRows = planBlockRowCount(depth, profundidadeM, hasOppStreet, false, streetRings.length > 0);
  if (nRows >= 2) {
    const rows = cutBlockIntoRows(ring, azimuthDeg, origin, nRows);
    const lots: Position[][][] = [];
    for (const row of rows) {
      lots.push(...complementarPorArestaLonga(row, testadaMinimaM, profundidadeM, areaMinimaM2, origin, streetRings));
    }
    if (lots.length > 0) return lots;
  }
  return complementarPorArestaLonga(ring, testadaMinimaM, profundidadeM, areaMinimaM2, origin, streetRings);
}

function complementarUmFragmento(
  ring: Position[],
  params: ComplementarLoteamentoParams,
  pass: number,
): { lots: Position[][][]; remanescente: Position[][] } {
  const closed = closeRing(dropClosing(ring));
  const area = planarAreaM2(closed);
  if (dropClosing(closed).length < 3 || area < REMAINDER_MIN_M2) return { lots: [], remanescente: [] };

  const {
    azimuthDeg,
    testadaMinimaM,
    profundidadeQuadraM,
    areaMinimaM2,
    streetRings,
    origin,
    blockCentroid,
    percentualEsquina,
  } = params;
  const hostC = blockCentroid ?? originOf(closed);
  const maxArea = lotMaxAllowedAreaM2(testadaMinimaM, profundidadeQuadraM, areaMinimaM2);
  const minArea = lotMinAreaM2(testadaMinimaM, profundidadeQuadraM, areaMinimaM2);
  if (minArea > 0 && area + 0.5 < minArea * 0.65) {
    return { lots: [], remanescente: [closed] };
  }

  const collected: Position[][][] = [];
  const testadas = [testadaMinimaM, testadaMinimaM * 0.88, testadaMinimaM * 0.75, Math.max(6, testadaMinimaM * 0.65)];
  const depths = [
    profundidadeQuadraM,
    profundidadeQuadraM * 0.85,
    profundidadeQuadraM * 0.72,
    Math.max(8, profundidadeQuadraM * 0.55),
  ];
  const azimuths = [azimuthDeg, foldAz180(azimuthDeg + 90)];

  for (const az of azimuths) {
    const absorbed = absorbScrapAsLots(
      closed,
      az,
      testadaMinimaM,
      profundidadeQuadraM,
      areaMinimaM2,
      streetRings,
      origin,
      hostC,
      { profundidadeM: profundidadeQuadraM, percentualEsquina, allowShallow: true, allowIrregular: true },
    );
    collected.push(
      ...keepComplementarLots(absorbed.lots, testadaMinimaM, profundidadeQuadraM, areaMinimaM2, streetRings),
    );
    if (collected.length > 0) break;
    for (const t of testadas) {
      for (const d of depths) {
        const split = trySubdivideComplementar(
          closed,
          az,
          t,
          d,
          Math.max(areaMinimaM2 * 0.7, t * d * 0.7),
          streetRings,
          origin,
          hostC,
          percentualEsquina,
        );
        if (split.length > 0) {
          collected.push(...split);
          break;
        }
      }
      if (collected.length > 0) break;
    }
    if (collected.length > 0) break;
  }

  if (collected.length === 0) {
    collected.push(
      ...complementarForcarDivisao(
        closed,
        azimuthDeg,
        testadaMinimaM,
        profundidadeQuadraM,
        areaMinimaM2,
        origin,
        streetRings,
      ),
    );
  }

  const lots = keepComplementarLots(collected, testadaMinimaM, profundidadeQuadraM, areaMinimaM2, streetRings);
  const still = leftoverAfterLots(closed, lots, origin);
  if (still.length === 0) return { lots, remanescente: [] };

  const remanescente: Position[][] = [];
  const more = [...lots];
  for (const rem of still) {
    const remA = planarAreaM2(rem);
    if (remA < REMAINDER_MIN_M2) continue;
    if (pass < 1) {
      const again = complementarUmFragmento(rem, { ...params, azimuthDeg: foldAz180(params.azimuthDeg + 90) }, pass + 1);
      more.push(...again.lots);
      remanescente.push(...again.remanescente);
      continue;
    }
    if (
      complementarLotAcceptable(remA, testadaMinimaM, profundidadeQuadraM, areaMinimaM2) &&
      lotHasRoadAccess(rem, streetRings, testadaMinimaM)
    ) {
      more.push([closeRing(rem)]);
      continue;
    }
    if (Number.isFinite(maxArea) && remA > maxArea * 1.4 && minArea > 0) {
      const forced = complementarForcarDivisao(
        rem,
        foldAz180(azimuthDeg + 90),
        testadaMinimaM,
        profundidadeQuadraM,
        areaMinimaM2,
        origin,
        streetRings,
      );
      if (forced.length > 0) {
        more.push(...forced);
        continue;
      }
    }
    remanescente.push(closeRing(rem));
  }
  return { lots: more, remanescente };
}

/**
 * Completa a área loteável que a malha principal não ocupou.
 * Nunca classifica a sobra como institucional/área verde — só lotes ou remanescente real.
 */
export function complementarLoteamento(
  leftovers: Position[][],
  params: ComplementarLoteamentoParams,
): { lots: Position[][][]; remanescente: Position[][] } {
  const lots: Position[][][] = [];
  const remanescente: Position[][] = [];
  for (const raw of leftovers) {
    const filled = complementarUmFragmento(raw, params, 0);
    lots.push(...filled.lots);
    remanescente.push(...filled.remanescente);
  }
  return { lots, remanescente };
}

function totalPolysAreaM2(polys: Position[][][]): number {
  return polys.reduce((s, p) => s + planarAreaM2(p[0] ?? []), 0);
}

/** Área das vias sem contar duas vezes o cruzamento (T / esquina). */
function unionPolysAreaM2(polys: Position[][][], origin: Position): number {
  if (polys.length === 0) return 0;
  try {
    const merged = unionPolygons(polys, origin);
    if (merged) {
      const flat = flattenPoly(merged, origin);
      const area = flat.reduce((s, p) => s + planarAreaM2(p[0] ?? []), 0);
      if (area >= SLIVER_M2) return area;
    }
  } catch {
    /* união degenerada */
  }
  return totalPolysAreaM2(polys);
}

function subtractRingsFromHost(host: Position[], rings: Position[][], origin: Position): Position[][][] {
  const obs = rings
    .map((r) => closeRing(dropClosing(r)))
    .filter((r) => dropClosing(r).length >= 3 && planarAreaM2(r) >= SLIVER_M2)
    .map((r) => [r]);
  if (obs.length === 0) return [[closeRing(host)]];
  return subtractObstaclesFromPolys([[closeRing(host)]], obs, origin);
}

/** gleba − APP − reserva legal. */
export function urbanizableAreaM2(
  gleba: PolygonCoords,
  apps: Position[][],
  reservaLegal: Position[][],
): number {
  const ring = dropClosing(gleba);
  if (ring.length < 3) return 0;
  return totalPolysAreaM2(subtractRingsFromHost(ring, [...apps, ...reservaLegal], originOf(ring)));
}

/** A = max(0, percent/100 × T − S). T = gleba, S = ruas. */
export function areaUtilFromStreetsM2(totalM2: number, streetM2: number, percent = DEFAULT_PERCENT_AREA_UTIL): number {
  if (!(totalM2 > 0) || !(percent > 0)) return 0;
  return Math.max(0, (percent / 100) * totalM2 - Math.max(0, streetM2));
}

function minDistBetweenRings(a: Position[], b: Position[]): number {
  let best = Infinity;
  for (const p of dropClosing(a)) {
    best = Math.min(best, minDistToRings(p, [b]));
  }
  for (const p of dropClosing(b)) {
    best = Math.min(best, minDistToRings(p, [a]));
  }
  return best;
}

/** Dois anéis compartilham fronteira (limite comum). Interior sobreposto não conta. */
export function ringsShareBoundary(a: PolygonCoords, b: PolygonCoords, tolM = 0.65): boolean {
  const ra = dropClosing(a);
  const rb = dropClosing(b);
  if (ra.length < 3 || rb.length < 3) return false;
  const origin = originOf(ra);
  const interior = polygonInteriorOverlapM2(ra, rb);
  try {
    const fa = asTurfPolygon(ra, origin);
    const fb = asTurfPolygon(rb, origin);
    const buf = turf.buffer(fa, tolM, { units: "meters", steps: 8 });
    if (buf?.geometry) {
      const hit = turf.intersect(turf.featureCollection([buf as Feature<Polygon | MultiPolygon>, fb]));
      const near = flattenPoly(hit, origin).reduce((s, p) => s + planarAreaM2(p[0] ?? []), 0);
      if (near > 0.35 && interior < Math.max(2, near * 0.55)) return true;
    }
  } catch {
    /* mede distância entre anéis */
  }
  if (interior >= 2) return false;
  return minDistBetweenRings(ra, rb) <= tolM;
}

function growBufferToArea(
  anchors: Position[][],
  remainingFeat: Feature<Polygon | MultiPolygon>,
  alvoM2: number,
  origin: Position,
): Position[][][] {
  const anchorU = unionPolygons(
    anchors
      .map((r) => closeRing(dropClosing(r)))
      .filter((r) => dropClosing(r).length >= 3)
      .map((r) => [r]),
    origin,
  );
  if (!anchorU) return [];

  const remPolys = flattenPoly(remainingFeat, origin);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of remPolys) {
    for (const p of dropClosing(poly[0] ?? [])) {
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
  }
  const maxD = Math.max(2, Math.hypot(maxX - minX, maxY - minY));

  const stripAt = (depth: number): Position[][][] => {
    try {
      const buf = turf.buffer(anchorU, depth, { units: "meters", steps: 16 });
      if (!buf?.geometry) return [];
      const hit = turf.intersect(
        turf.featureCollection([remainingFeat, buf as Feature<Polygon | MultiPolygon>]),
      );
      return flattenPoly(hit, origin).filter((p) => planarAreaM2(p[0] ?? []) >= SLIVER_M2);
    } catch {
      return [];
    }
  };

  let lo = 0.25;
  let hi = maxD;
  let best: Position[][][] = [];
  let bestDiff = Infinity;
  for (let i = 0; i < 42; i++) {
    const mid = (lo + hi) / 2;
    const strip = stripAt(mid);
    const area = totalPolysAreaM2(strip);
    const diff = Math.abs(area - alvoM2);
    if (area >= alvoM2 * 0.5 && diff < bestDiff) {
      best = strip;
      bestDiff = diff;
    }
    if (area < alvoM2) lo = mid;
    else hi = mid;
  }
  return best;
}

function mergePolys(existing: Position[][][], extra: Position[][][], origin: Position): Position[][][] {
  const all = [...existing, ...extra].filter(
    (p) => dropClosing(p[0] ?? []).length >= 3 && planarAreaM2(p[0] ?? []) >= SLIVER_M2,
  );
  if (all.length === 0) return [];
  if (all.length === 1) return all;
  try {
    const u = unionPolygons(all, origin);
    if (!u) return all;
    const flat = flattenPoly(u, origin).filter((p) => planarAreaM2(p[0] ?? []) >= SLIVER_M2);
    return flat.length > 0 ? flat : all;
  } catch {
    return all;
  }
}

function cantoScoreXY(x: number, y: number, canto: ReservaCanto): number {
  if (canto === "superior_direita") return x + y;
  if (canto === "superior_esquerda") return -x + y;
  if (canto === "inferior_direita") return x - y;
  return -x - y;
}

function cantoDir(canto: ReservaCanto): Position {
  if (canto === "superior_direita") return [1, 1];
  if (canto === "superior_esquerda") return [-1, 1];
  if (canto === "inferior_direita") return [1, -1];
  return [-1, -1];
}

function connectedPolyComponents(polys: Position[][][]): number[][] {
  const n = polys.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (ringsShareBoundary(polys[i][0] ?? [], polys[j][0] ?? [])) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }
  const seen = new Set<number>();
  const comps: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (seen.has(i)) continue;
    const comp: number[] = [];
    const stack = [i];
    seen.add(i);
    while (stack.length > 0) {
      const k = stack.pop();
      if (k == null) break;
      comp.push(k);
      for (const j of adj[k]) {
        if (seen.has(j)) continue;
        seen.add(j);
        stack.push(j);
      }
    }
    comps.push(comp);
  }
  return comps;
}

function keepLargestComponent(polys: Position[][][]): Position[][][] {
  if (polys.length <= 1) return polys;
  const comps = connectedPolyComponents(polys);
  let best = comps[0] ?? [];
  let bestArea = -1;
  for (const comp of comps) {
    const area = comp.reduce((sum, i) => sum + planarAreaM2(polys[i][0] ?? []), 0);
    if (area > bestArea) {
      bestArea = area;
      best = comp;
    }
  }
  return best.map((i) => polys[i]);
}

/**
 * Um único bloco colado na âncora (RL): o maior componente conexo que compartilha aresta.
 * Fragmentos noutros lados da reserva ou restos espalhados no loteamento são descartados.
 */
function keepContiguousToAnchors(polys: Position[][][], anchors: Position[][]): Position[][][] {
  if (polys.length === 0) return polys;
  if (anchors.length === 0) return keepLargestComponent(polys);
  const comps = connectedPolyComponents(polys);
  const touchesAnchor = (i: number) =>
    anchors.some((anchor) => ringsShareBoundary(polys[i][0] ?? [], anchor));
  let best: number[] = [];
  let bestArea = -1;
  for (const comp of comps) {
    if (!comp.some(touchesAnchor)) continue;
    const area = comp.reduce((sum, i) => sum + planarAreaM2(polys[i][0] ?? []), 0);
    if (area > bestArea) {
      bestArea = area;
      best = comp;
    }
  }
  return best.map((i) => polys[i]);
}

function coalesceAreaUtil(polys: Position[][][], anchors: Position[][], origin: Position): Position[][][] {
  const glued = keepContiguousToAnchors(polys, anchors);
  if (glued.length === 0) return [];
  return mergePolys([], glued, origin);
}

type InnerRlEdge = { a: Position; b: Position; mid: Position; outward: Position; len: number };

function collectInnerRlEdges(
  anchors: Position[][],
  remainingFeat: Feature<Polygon | MultiPolygon>,
  origin: Position,
): InnerRlEdge[] {
  const remRings = flattenPoly(remainingFeat, origin)
    .map((poly) => poly[0] ?? [])
    .filter((ring) => dropClosing(ring).length >= 3);
  const edges: InnerRlEdge[] = [];
  for (const ring of anchors) {
    const pts = dropClosing(ring);
    if (pts.length < 3) continue;
    const c = originOf(pts);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const len = planarLength(a, b);
      if (len < 0.4) continue;
      const mid = midpoint(a, b);
      let ox = -(b[1] - a[1]) / len;
      let oy = (b[0] - a[0]) / len;
      if ((c[0] - mid[0]) * ox + (c[1] - mid[1]) * oy > 0) {
        ox = -ox;
        oy = -oy;
      }
      const probe: Position = [mid[0] + ox * 0.85, mid[1] + oy * 0.85];
      const hitsRem =
        remRings.some((r) => pointInRing(probe[0], probe[1], r)) || minDistToRings(probe, remRings) < 1.25;
      if (hitsRem) edges.push({ a, b, mid, outward: [ox, oy], len });
    }
  }
  return edges;
}

function oneSidedEdgeStrip(edge: InnerRlEdge, depth: number): Position[] {
  const ux = (edge.b[0] - edge.a[0]) / edge.len;
  const uy = (edge.b[1] - edge.a[1]) / edge.len;
  const extra = Math.max(0.4, edge.len * 0.02);
  const a: Position = [edge.a[0] - ux * extra, edge.a[1] - uy * extra];
  const b: Position = [edge.b[0] + ux * extra, edge.b[1] + uy * extra];
  const ox = edge.outward[0] * depth;
  const oy = edge.outward[1] * depth;
  return [a, b, [b[0] + ox, b[1] + oy], [a[0] + ox, a[1] + oy]];
}

function growFromEdgesToArea(
  edges: InnerRlEdge[],
  remainingFeat: Feature<Polygon | MultiPolygon>,
  alvoM2: number,
  origin: Position,
): Position[][][] {
  if (edges.length === 0) return [];
  const remPolys = flattenPoly(remainingFeat, origin);
  let maxD = 2;
  for (const poly of remPolys) {
    for (const p of dropClosing(poly[0] ?? [])) {
      for (const edge of edges) {
        maxD = Math.max(maxD, planarLength(p, edge.mid));
      }
    }
  }

  const stripAt = (depth: number): Position[][][] => {
    const strips: Position[][][] = [];
    for (const edge of edges) {
      if (!(depth > 0.2)) continue;
      try {
        const feat = asTurfPolygon(oneSidedEdgeStrip(edge, depth), origin);
        const hit = turf.intersect(turf.featureCollection([remainingFeat, feat]));
        strips.push(...flattenPoly(hit, origin).filter((p) => planarAreaM2(p[0] ?? []) >= SLIVER_M2));
      } catch {
        /* aresta degenerada */
      }
    }
    return mergePolys([], strips, origin);
  };

  let lo = 0.25;
  let hi = maxD;
  let best: Position[][][] = [];
  let bestDiff = Infinity;
  let bestInBand = false;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const strip = stripAt(mid);
    const area = totalPolysAreaM2(strip);
    const diff = Math.abs(area - alvoM2);
    if (area >= SLIVER_M2) {
      const inBand = area >= alvoM2 * 0.5;
      if (inBand && (!bestInBand || diff < bestDiff)) {
        best = strip;
        bestDiff = diff;
        bestInBand = true;
      } else if (!bestInBand && (best.length === 0 || area > totalPolysAreaM2(best))) {
        best = strip;
      }
    }
    if (area < alvoM2) lo = mid;
    else hi = mid;
  }
  return best;
}

function scoreInnerEdge(edge: InnerRlEdge, canto: ReservaCanto): number {
  const dir = cantoDir(canto);
  const dlen = Math.hypot(dir[0], dir[1]) || 1;
  const face = (edge.outward[0] * dir[0] + edge.outward[1] * dir[1]) / dlen;
  return face * edge.len + cantoScoreXY(edge.mid[0], edge.mid[1], canto) * 0.05;
}

/** Normais das duas faces do canto pedido da RL (E/N, W/N, E/S, W/S). */
function cantoWantNormals(canto: ReservaCanto): Position[] {
  if (canto === "superior_direita") return [[1, 0], [0, 1]];
  if (canto === "superior_esquerda") return [[-1, 0], [0, 1]];
  if (canto === "inferior_direita") return [[1, 0], [0, -1]];
  return [[-1, 0], [0, -1]];
}

function edgeMatchesCanto(edge: InnerRlEdge, canto: ReservaCanto): boolean {
  return cantoWantNormals(canto).some((n) => edge.outward[0] * n[0] + edge.outward[1] * n[1] > 0.55);
}

function cantoVertex(anchors: Position[][], canto: ReservaCanto): Position {
  let best: Position = [0, 0];
  let bestS = -Infinity;
  for (const ring of anchors) {
    for (const p of dropClosing(ring)) {
      const s = cantoScoreXY(p[0], p[1], canto);
      if (s > bestS) {
        bestS = s;
        best = p;
      }
    }
  }
  return best;
}

/** Só as arestas do canto pedido (vértice + faces adjacentes), nunca o perímetro inteiro da RL. */
function pickDirectedEdges(inner: InnerRlEdge[], canto: ReservaCanto, vertex: Position): InnerRlEdge[] {
  const matched = inner.filter((edge) => edgeMatchesCanto(edge, canto));
  const pool = matched.length > 0 ? matched : inner;
  const atVertex = pool.filter(
    (edge) => planarLength(edge.a, vertex) <= 1.8 || planarLength(edge.b, vertex) <= 1.8,
  );
  const chosen =
    atVertex.length > 0
      ? atVertex
      : [...pool].sort((a, b) => planarLength(a.mid, vertex) - planarLength(b.mid, vertex)).slice(0, 2);
  return chosen.sort((a, b) => scoreInnerEdge(b, canto) - scoreInnerEdge(a, canto));
}

function clipFeatToWindow(
  remainingFeat: Feature<Polygon | MultiPolygon>,
  vertex: Position,
  radius: number,
  origin: Position,
): Feature<Polygon | MultiPolygon> | null {
  if (!(radius > 0.4)) return null;
  const ring: Position[] = [
    [vertex[0] - radius, vertex[1] - radius],
    [vertex[0] + radius, vertex[1] - radius],
    [vertex[0] + radius, vertex[1] + radius],
    [vertex[0] - radius, vertex[1] + radius],
  ];
  try {
    const box = asTurfPolygon(ring, origin);
    const hit = turf.intersect(turf.featureCollection([remainingFeat, box]));
    return hit as Feature<Polygon | MultiPolygon> | null;
  } catch {
    return null;
  }
}

/** Bloco compacto no canto da RL: preenche o restante dentro de uma janela no vértice. */
function growCompactBesideCanto(
  vertex: Position,
  remainingFeat: Feature<Polygon | MultiPolygon>,
  take: number,
  origin: Position,
): Position[][][] {
  const remPolys = flattenPoly(remainingFeat, origin);
  let maxR = 2;
  for (const poly of remPolys) {
    for (const p of dropClosing(poly[0] ?? [])) {
      maxR = Math.max(maxR, planarLength(p, vertex));
    }
  }

  const fillAt = (radius: number): Position[][][] => {
    const clipped = clipFeatToWindow(remainingFeat, vertex, radius, origin);
    if (!clipped) return [];
    return flattenPoly(clipped, origin).filter((p) => planarAreaM2(p[0] ?? []) >= SLIVER_M2);
  };

  let lo = 0.5;
  let hi = maxR;
  let best: Position[][][] = [];
  let bestDiff = Infinity;
  let bestInBand = false;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    const fill = fillAt(mid);
    const area = totalPolysAreaM2(fill);
    const diff = Math.abs(area - take);
    if (area >= SLIVER_M2) {
      const inBand = area >= take * 0.5 && area <= take * 1.2;
      if (inBand && (!bestInBand || diff < bestDiff)) {
        best = fill;
        bestDiff = diff;
        bestInBand = true;
      } else if (!bestInBand && (best.length === 0 || area > totalPolysAreaM2(best))) {
        best = fill;
      }
    }
    if (area < take) lo = mid;
    else hi = mid;
  }
  return best;
}

function placeAreaUtilTowardCanto(
  remainingFeat: Feature<Polygon | MultiPolygon>,
  anchors: Position[][],
  take: number,
  origin: Position,
  canto: ReservaCanto,
): Position[][][] {
  const vertex = cantoVertex(anchors, canto);
  const inner = collectInnerRlEdges(anchors, remainingFeat, origin);
  const matched = inner.filter((edge) => edgeMatchesCanto(edge, canto));
  const selected = pickDirectedEdges(inner, canto, vertex);

  const accept = (polys: Position[][][], minRatio: number): Position[][][] | null => {
    const glued = coalesceAreaUtil(polys, anchors, origin);
    if (totalPolysAreaM2(glued) >= take * minRatio) return glued;
    return null;
  };

  const compact = growCompactBesideCanto(vertex, remainingFeat, take, origin);
  const okCompact = accept(compact, matched.length >= 1 ? 0.55 : 0.4);
  if (okCompact) return okCompact;

  const fromSelected = growFromEdgesToArea(selected, remainingFeat, take, origin);
  const okSel = accept(fromSelected, 0.55);
  if (okSel) return okSel;
  const gluedSel = coalesceAreaUtil(fromSelected, anchors, origin);
  if (totalPolysAreaM2(gluedSel) >= take * 0.35) return gluedSel;

  const compactLoose = accept(compact, 0.25);
  if (compactLoose) return compactLoose;

  return gluedSel;
}

/**
 * Coloca a área útil no restante (já sem APP/RL/ruas), colada na reserva legal.
 * Sem reserva: bloco compacto no canto pedido (ou faixa no maior fragmento).
 */
function placeAreaUtilPolys(
  remaining: Position[][][],
  anchors: Position[][],
  alvoM2: number,
  origin: Position,
  canto?: ReservaCanto,
): Position[][][] {
  const remArea = totalPolysAreaM2(remaining);
  if (!(alvoM2 > SLIVER_M2) || remArea < SLIVER_M2) return [];
  const take = Math.min(alvoM2, remArea * 0.98);
  if (take >= remArea - SLIVER_M2) {
    return coalesceAreaUtil(remaining, anchors, origin);
  }

  const remU = unionPolygons(remaining, origin);
  if (!remU) return [];

  if (anchors.length > 0) {
    if (canto) {
      const directed = placeAreaUtilTowardCanto(remU, anchors, take, origin, canto);
      if (totalPolysAreaM2(directed) >= SLIVER_M2) return directed;
    }
    const vertex = cantoVertex(anchors, canto ?? "inferior_esquerda");
    const compact = growCompactBesideCanto(vertex, remU, take, origin);
    const gluedCompact = coalesceAreaUtil(compact, anchors, origin);
    if (totalPolysAreaM2(gluedCompact) >= SLIVER_M2) return gluedCompact;
    return [];
  }

  const largest = remaining.reduce(
    (best, p) => (planarAreaM2(p[0] ?? []) > planarAreaM2(best[0] ?? []) ? p : best),
    remaining[0] ?? [],
  );
  const host = dropClosing(largest[0] ?? []);
  if (host.length >= 3) {
    const corner = canto ?? "inferior_esquerda";
    try {
      const sq = reservarRetanguloNoCanto(host, corner, take);
      if (sq.reservedM2 >= take * 0.7) return [[closeRing(sq.reserved)]];
    } catch {
      /* tenta faixa */
    }
    try {
      const faixa = reservarFaixaDeArea(host, "frente", take);
      if (faixa.reservedM2 >= take * 0.7) return [[closeRing(faixa.reserved)]];
    } catch {
      /* cai no buffer do próprio fragmento */
    }
    const fromHost = growBufferToArea([host], remU, take, origin);
    if (totalPolysAreaM2(fromHost) >= take * 0.55) return fromHost;
  }
  return [];
}

/**
 * Área útil A colada na reserva legal (aresta compartilhada), no canto pedido da RL.
 * Sem RL: bloco no canto da gleba restante.
 */
export function placeAreaUtilBesideReserva(
  gleba: PolygonCoords,
  reservaLegal: Position[][],
  alvoM2: number,
  canto?: ReservaCanto | string | null,
  extraObstacles: Position[][] = [],
): Position[][][] {
  const ring = dropClosing(gleba);
  if (ring.length < 3 || !(alvoM2 > SLIVER_M2)) return [];
  const origin = originOf(ring);
  const anchors = reservaLegal
    .map((r) => closeRing(dropClosing(r)))
    .filter((r) => dropClosing(r).length >= 3 && planarAreaM2(r) >= SLIVER_M2);
  const obstacles = [
    ...anchors,
    ...extraObstacles
      .map((r) => closeRing(dropClosing(r)))
      .filter((r) => dropClosing(r).length >= 3 && planarAreaM2(r) >= SLIVER_M2),
  ];
  const remaining = subtractRingsFromHost(ring, obstacles, origin);
  const parsed = parseReservaCanto(canto != null ? String(canto) : null) ?? undefined;
  let placed = placeAreaUtilPolys(remaining, anchors, alvoM2, origin, parsed);
  if (placed.length > 0) placed = coalesceAreaUtil(placed, anchors, origin);
  return placed;
}

function looksStandardLot(
  coords: Position[][],
  testadaMinimaM: number,
  profundidadeQuadraM: number,
  streetRings: Position[][],
  azimuthDeg: number,
  blockCentroid?: Position,
  areaMinimaM2 = 0,
): boolean {
  const ring = coords[0] ?? [];
  const area = planarAreaM2(ring);
  const target = lotMinAreaM2(testadaMinimaM, profundidadeQuadraM, areaMinimaM2);
  if (area + 1e-6 < target * 0.95) return false;
  if (area > lotMaxAllowedAreaM2(testadaMinimaM, profundidadeQuadraM, areaMinimaM2) + 0.5) return false;
  const measured = measureLotFrontAndDepth(ring, streetRings, azimuthDeg, blockCentroid);
  return validateLot(
    { areaM2: area, depthM: measured.profundidadeM, frontageM: measured.testadaM },
    {
      minAreaM2: target * 0.95,
      targetAreaM2: lotTargetAreaM2(testadaMinimaM, profundidadeQuadraM, areaMinimaM2),
      minDepthM: profundidadeQuadraM > 0 ? profundidadeQuadraM * SUBDIV_MIN_RATIO : 0,
      maxDepthM: profundidadeQuadraM > 0 ? profundidadeQuadraM : 0,
      minFrontageM: testadaMinimaM,
    },
  );
}

function frontEdge(
  ring: Position[],
  azimuthDeg: number,
  streetRings?: Position[][],
  blockCentroid?: Position,
): { a: Position; b: Position; length: number; az: number } | null {
  const pts = dropClosing(ring);
  if (pts.length < 2) return null;

  type Run = { a: Position; b: Position; length: number; az: number; street: boolean; dist: number };
  const runs: Run[] = [];
  let cur: Run | null = null;

  const flush = () => {
    if (cur && cur.length >= 0.5) runs.push(cur);
    cur = null;
  };

  const rowC = originOf(pts);
  const outerVec: Position | null =
    blockCentroid && planarLength(rowC, blockCentroid) > 0.5
      ? [rowC[0] - blockCentroid[0], rowC[1] - blockCentroid[1]]
      : null;
  const preferOuter = outerVec != null;

  const consider = (a: Position, b: Position) => {
    const length = planarLength(a, b);
    if (length < 0.2) return;
    const az = planarAzimuthDeg(a, b);
    const align = Math.abs(Math.cos((angleDeltaDeg(az, azimuthDeg) * Math.PI) / 180));
    const mid = midpoint(a, b);
    const dist = streetRings && streetRings.length > 0 ? minDistToRings(mid, streetRings) : 1e9;
    const street = dist <= STREET_NEAR_M;
    const alignMin = street ? 0.2 : preferOuter ? FRONTAGE_ALIGN_MIN : 0.82;
    if (align < alignMin) {
      flush();
      return;
    }
    if (cur && angleDeltaDeg(cur.az, az) < 14 && planarLength(cur.b, a) < 0.4) {
      cur.b = b;
      cur.length += length;
      cur.street = cur.street || street;
      cur.dist = Math.min(cur.dist, dist);
      return;
    }
    flush();
    cur = { a, b, length, az, street, dist };
  };

  for (let i = 0; i < pts.length; i++) {
    consider(pts[i], pts[(i + 1) % pts.length]);
  }
  flush();

  if (runs.length >= 2) {
    const first = runs[0];
    const last = runs[runs.length - 1];
    if (angleDeltaDeg(first.az, last.az) < 14 && planarLength(last.b, first.a) < 0.4) {
      runs[0] = {
        a: last.a,
        b: first.b,
        length: first.length + last.length,
        az: first.az,
        street: first.street || last.street,
        dist: Math.min(first.dist, last.dist),
      };
      runs.pop();
    }
  }

  let best: { a: Position; b: Position; length: number; az: number; score: number } | null = null;
  for (const run of runs) {
    const align = Math.abs(Math.cos((angleDeltaDeg(run.az, azimuthDeg) * Math.PI) / 180));
    let score = run.length * align;
    if (run.street) score += run.length * 8;
    score -= Math.min(run.dist, 40) * 0.4;
    if (outerVec) {
      const mid = midpoint(run.a, run.b);
      const towardOuter = (mid[0] - rowC[0]) * outerVec[0] + (mid[1] - rowC[1]) * outerVec[1];
      if (towardOuter > 0) score += run.length * 7;
      else score -= run.length * 4;
    }
    if (!best || score > best.score) best = { a: run.a, b: run.b, length: run.length, az: run.az, score };
  }
  return best;
}

function streetDir(azimuthDeg: number): { dirS: Position; dirD: Position } {
  const az = ((azimuthDeg % 360) + 360) % 360;
  const rad = (az * Math.PI) / 180;
  return {
    dirS: [Math.sin(rad), Math.cos(rad)],
    dirD: [Math.cos(rad), -Math.sin(rad)],
  };
}

function edgeAlongStreet(a: Position, b: Position, streetRings: Position[][], maxDistM = STREET_NEAR_M): boolean {
  if (streetRings.length === 0 || planarLength(a, b) < 0.4) return false;
  let hits = 0;
  for (const t of [0.25, 0.5, 0.75]) {
    const p: Position = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (minDistToRings(p, streetRings) <= maxDistM) hits += 1;
  }
  return hits >= 2;
}

export type BlockFrontage = {
  azimuthDeg: number;
  hasOpposite: boolean;
  hasOppositeLongEdges: boolean;
  depthM: number;
};

type BoundaryFrontage = {
  pos: number;
  neg: number;
  posStreet: number;
  negStreet: number;
  depth: number;
  along: number;
};

function boundaryFrontageLengths(
  ring: Position[],
  azimuthDeg: number,
  streetRings: Position[][],
): BoundaryFrontage {
  const { dirS, dirD } = streetDir(azimuthDeg);
  const c = originOf(ring);
  let pos = 0;
  let neg = 0;
  let posStreet = 0;
  let negStreet = 0;
  const pts = dropClosing(ring);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const length = planarLength(a, b);
    if (length < 1) continue;
    const az = planarAzimuthDeg(a, b);
    const align = Math.abs(Math.cos((angleDeltaDeg(az, azimuthDeg) * Math.PI) / 180));
    if (align < FRONTAGE_ALIGN_MIN) continue;
    const mid = midpoint(a, b);
    const side = (mid[0] - c[0]) * dirD[0] + (mid[1] - c[1]) * dirD[1];
    const street = streetRings.length > 0 && edgeAlongStreet(a, b, streetRings);
    if (side >= 0) {
      pos += length;
      if (street) posStreet += length;
    } else {
      neg += length;
      if (street) negStreet += length;
    }
  }
  let dMin = Infinity;
  let dMax = -Infinity;
  let sMin = Infinity;
  let sMax = -Infinity;
  for (const p of pts) {
    const vx = p[0] - c[0];
    const vy = p[1] - c[1];
    const s = vx * dirS[0] + vy * dirS[1];
    const d = vx * dirD[0] + vy * dirD[1];
    sMin = Math.min(sMin, s);
    sMax = Math.max(sMax, s);
    dMin = Math.min(dMin, d);
    dMax = Math.max(dMax, d);
  }
  return { pos, neg, posStreet, negStreet, depth: dMax - dMin, along: sMax - sMin };
}

function hasOppositeLongFrontage(f: BoundaryFrontage): boolean {
  const minFront = Math.max(8, f.along * 0.08);
  return f.pos >= minFront && f.neg >= minFront;
}

function collectBoundaryEdges(
  ring: Position[],
  streetRings: Position[][],
  streetsOnly: boolean,
): { a: Position; b: Position; len: number; az: number }[] {
  const pts = dropClosing(ring);
  const out: { a: Position; b: Position; len: number; az: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = planarLength(a, b);
    if (len < 1.2) continue;
    if (streetsOnly && (streetRings.length === 0 || !edgeAlongStreet(a, b, streetRings))) continue;
    out.push({ a, b, len, az: planarAzimuthDeg(a, b) });
  }
  return out;
}

function lotMinAreaM2(testadaMinimaM: number, profundidadeQuadraM: number, areaMinimaM2?: number): number {
  if (areaMinimaM2 != null && Number.isFinite(areaMinimaM2) && areaMinimaM2 > 0) return areaMinimaM2;
  const t = testadaMinimaM > 0 ? testadaMinimaM : 0;
  const p = profundidadeQuadraM > 0 ? profundidadeQuadraM : 0;
  return t * p;
}

function lotTargetAreaM2(testadaMinimaM: number, profundidadeQuadraM: number, areaMinimaM2?: number): number {
  const product =
    (testadaMinimaM > 0 ? testadaMinimaM : 0) * (profundidadeQuadraM > 0 ? profundidadeQuadraM : 0);
  return Math.max(lotMinAreaM2(testadaMinimaM, profundidadeQuadraM, areaMinimaM2), product);
}

function lotMaxAllowedAreaM2(testadaMinimaM: number, profundidadeQuadraM: number, areaMinimaM2?: number): number {
  const target = lotTargetAreaM2(testadaMinimaM, profundidadeQuadraM, areaMinimaM2);
  return target > 0 ? target * LOT_MAX_AREA_RATIO : Number.POSITIVE_INFINITY;
}

const SUBDIV_MIN_RATIO = 0.72;
const SUBDIV_MAX_RATIO = 1.2;
/** Nenhum lote (incluindo o 01) pode ultrapassar área-alvo × este fator. */
export const LOT_MAX_AREA_RATIO = 1.25;
/** Profundidade máxima relativa ao alvo (faixa uniforme, sem 25+25+40). */
export const LOT_MAX_DEPTH_RATIO = 1.2;

export type LotValidationInput = {
  areaM2: number;
  depthM: number;
  frontageM: number;
};

export type LotValidationSpec = {
  minAreaM2: number;
  targetAreaM2: number;
  minDepthM: number;
  maxDepthM: number;
  minFrontageM: number;
  maxAreaRatio?: number;
};

/** Aceita lote interno ou de esquina perto da malha; rejeita cesta de sobras. */
export function validateLot(lot: LotValidationInput, spec: LotValidationSpec): boolean {
  const maxRatio = spec.maxAreaRatio ?? LOT_MAX_AREA_RATIO;
  const maxArea = spec.targetAreaM2 > 0 ? spec.targetAreaM2 * maxRatio : Number.POSITIVE_INFINITY;
  if (spec.minAreaM2 > 0 && lot.areaM2 + 0.5 < spec.minAreaM2) return false;
  if (Number.isFinite(maxArea) && lot.areaM2 > maxArea + 0.5) return false;
  if (spec.minDepthM > 0 && lot.depthM + 0.08 < spec.minDepthM * SUBDIV_MIN_RATIO) return false;
  if (spec.maxDepthM > 0 && lot.depthM > spec.maxDepthM * LOT_MAX_DEPTH_RATIO + 0.5) return false;
  if (spec.minFrontageM > 0 && lot.frontageM + 0.08 < spec.minFrontageM * 0.88) return false;
  if (!Number.isFinite(lot.areaM2) || lot.areaM2 < SLIVER_M2) return false;
  return true;
}

export function sortLotsForNumbering<T>(items: T[], azimuthDeg: number, ringOf: (item: T) => Position[]): T[] {
  const { dirS, dirD } = streetDir(azimuthDeg);
  return [...items].sort((a, b) => {
    const ca = originOf(ringOf(a));
    const cb = originOf(ringOf(b));
    const rowA = ca[0] * dirD[0] + ca[1] * dirD[1];
    const rowB = cb[0] * dirD[0] + cb[1] * dirD[1];
    if (Math.abs(rowA - rowB) > 2) return rowA - rowB;
    return ca[0] * dirS[0] + ca[1] * dirS[1] - (cb[0] * dirS[0] + cb[1] * dirS[1]);
  });
}

export function buildLoteamentoReport(
  lotes: LoteResult[],
  remanescente: Position[][][],
  streetRings: Position[][],
  azimuthDeg: number,
  spec: LotValidationSpec,
  extras?: { internalStreetCount?: number },
): LoteamentoReport {
  const areas = lotes.map((l) => l.area_m2);
  const depths: number[] = [];
  const fronts: number[] = [];
  const invalidLots: string[] = [];
  for (const lote of lotes) {
    const m = measureLotFrontAndDepth(lote.coordinates[0] ?? [], streetRings, azimuthDeg);
    depths.push(m.profundidadeM);
    fronts.push(m.testadaM);
    const maxArea = spec.targetAreaM2 > 0 ? spec.targetAreaM2 * (spec.maxAreaRatio ?? LOT_MAX_AREA_RATIO) : Number.POSITIVE_INFINITY;
    const areaInvalid =
      (spec.minAreaM2 > 0 && lote.area_m2 + 0.5 < spec.minAreaM2) ||
      (Number.isFinite(maxArea) && lote.area_m2 > maxArea + 0.5);
    if (!lotHasRoadAccess(lote.coordinates[0] ?? [], streetRings, spec.minFrontageM) || areaInvalid) {
      invalidLots.push(`${lote.quadra} ${lote.numero || "(sem número)"}`.trim());
    }
  }
  const residualArea = remanescente.reduce((s, p) => s + planarAreaM2(p[0] ?? []), 0);
  const totalLotArea = areas.reduce((s, a) => s + a, 0);
  const n = lotes.length;
  const equity = relatoriosEquidadePorQuadras(lotes);
  const global = calcularErroDeEquidadeLocal(areas);
  return {
    totalLots: n,
    totalLotArea,
    residualArea,
    minArea: n ? Math.min(...areas) : 0,
    maxArea: n ? Math.max(...areas) : 0,
    averageArea: n ? totalLotArea / n : 0,
    minDepth: depths.length ? Math.min(...depths) : 0,
    maxDepth: depths.length ? Math.max(...depths) : 0,
    averageDepth: depths.length ? depths.reduce((s, d) => s + d, 0) / depths.length : 0,
    minFrontage: fronts.length ? Math.min(...fronts) : 0,
    maxFrontage: fronts.length ? Math.max(...fronts) : 0,
    invalidLots,
    lotsWithoutRoadAccess: lotes.filter((lote) => !lotHasRoadAccess(lote.coordinates[0] ?? [], streetRings, spec.minFrontageM)).length,
    lotsWithoutFrontage: lotes.filter((lote) => lotStreetFrontageM(lote.coordinates[0] ?? [], streetRings) + 0.05 < spec.minFrontageM).length,
    internalStreetCount: extras?.internalStreetCount ?? 0,
    accessWarning:
      lotes.some((lote) => !lotHasRoadAccess(lote.coordinates[0] ?? [], streetRings, spec.minFrontageM))
        ? "Não foi possível preencher toda a quadra mantendo acesso viário para todos os lotes."
        : undefined,
    desvioPadraoArea: global.desvioPadrao,
    coeficienteVariacao: global.coeficienteVariacao,
    equityByQuadra: equity,
  };
}

function calcularErroDeEquidadeLocal(areas: number[]): { desvioPadrao: number; coeficienteVariacao: number } {
  if (areas.length === 0) return { desvioPadrao: 0, coeficienteVariacao: 0 };
  const media = areas.reduce((s, a) => s + a, 0) / areas.length;
  let erro = 0;
  for (const area of areas) {
    const d = area - media;
    erro += d * d;
  }
  const desvioPadrao = Math.sqrt(erro / areas.length);
  return { desvioPadrao, coeficienteVariacao: media > 1e-9 ? desvioPadrao / media : 0 };
}

export type EvenCountPlan = {
  n: number;
  each: number;
  score: number;
};

/** Quantidade uniforme que preenche `length` perto de `target`, sem concentrar sobra. */
export function findBestEvenCount(
  length: number,
  target: number,
  opts?: { minEach?: number; maxEach?: number; minN?: number; maxN?: number },
): EvenCountPlan {
  const tgt = target > 0 ? target : length;
  const minEach = opts?.minEach ?? tgt * SUBDIV_MIN_RATIO;
  const maxEach = opts?.maxEach ?? tgt * SUBDIV_MAX_RATIO;
  const minN = Math.max(1, opts?.minN ?? 1);
  const maxByMin = Math.max(minN, Math.floor(length / Math.max(minEach, 1e-6) + 1e-9));
  const maxN = Math.max(minN, opts?.maxN ?? maxByMin);
  const n0 = Math.max(minN, Math.min(maxN, Math.round(length / Math.max(tgt, 1e-6))));
  let best: EvenCountPlan = { n: minN, each: length / minN, score: Number.POSITIVE_INFINITY };
  const lo = Math.max(minN, n0 - 4);
  const hi = Math.max(lo, Math.min(maxN, n0 + 4));
  for (let n = lo; n <= hi; n++) {
    const each = length / n;
    if (n > 1 && each + 1e-9 < minEach) continue;
    const depthPen = Math.abs(each - tgt);
    const excess = Math.max(0, each - maxEach);
    const short = n > 1 ? Math.max(0, minEach - each) : 0;
    const score = short * 1_000_000 + excess * 10_000 + depthPen * 1_000 + Math.abs(n - n0) * 2;
    if (score < best.score) best = { n, each, score };
  }
  return best;
}

export type SubdivisionScoreInput = {
  areas: number[];
  testadas: number[];
  depths: number[];
  leftoverM2: number;
  blockAreaM2: number;
  targetAreaM2: number;
  targetTestadaM: number;
  targetDepthM: number;
  minAreaM2: number;
  minTestadaM: number;
  invalidCount?: number;
};

/** Menor score = melhor. Sobra pesa; lote absurdo pesa mais. */
export function scoreSubdivision(input: SubdivisionScoreInput): number {
  const {
    areas,
    testadas,
    depths,
    leftoverM2,
    blockAreaM2,
    targetAreaM2,
    targetTestadaM,
    targetDepthM,
    minAreaM2,
    minTestadaM,
    invalidCount = 0,
  } = input;
  let belowMin = 0;
  let excessArea = 0;
  let depthPen = 0;
  let testadaPen = 0;
  for (let i = 0; i < areas.length; i++) {
    const area = areas[i] ?? 0;
    const t = testadas[i] ?? 0;
    const d = depths[i] ?? 0;
    if (minAreaM2 > 0 && area + 0.5 < minAreaM2) belowMin += 1;
    if (minTestadaM > 0 && t + 0.08 < minTestadaM) belowMin += 1;
    if (targetAreaM2 > 0) excessArea += Math.max(0, area - targetAreaM2 * LOT_MAX_AREA_RATIO);
    if (targetDepthM > 0) depthPen += Math.abs(d - targetDepthM);
    if (targetTestadaM > 0) testadaPen += Math.abs(t - targetTestadaM);
  }
  const n = Math.max(areas.length, 1);
  const mean = areas.reduce((s, a) => s + a, 0) / n;
  let uni = 0;
  for (const a of areas) uni += Math.abs(a - mean);
  uni /= n;
  const leftoverPen = leftoverM2;
  const cv = mean > 1e-9 ? uni / mean : uni;
  return (
    belowMin * 1_000_000 +
    invalidCount * 1_000_000 +
    excessArea * 10_000 +
    depthPen * 1_000 +
    testadaPen * 1_000 +
    leftoverPen * 500 +
    cv * areas.length * 500
  );
}

/** 0 = todos iguais. Quanto maior, mais os lotes variam de tamanho. */
export function coeficienteDeUniformidade(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean <= 1e-9) return 0;
  const mad = values.reduce((s, v) => s + Math.abs(v - mean), 0) / values.length;
  return mad / mean;
}

export function geometryIsValid(ring: Position[]): boolean {
  const pts = dropClosing(ring);
  if (pts.length < 3) return false;
  const area = planarAreaM2(pts);
  if (!(area >= SLIVER_M2) || !Number.isFinite(area)) return false;
  try {
    asTurfPolygon(closeRing(pts), originOf(pts));
    return true;
  } catch {
    return false;
  }
}

export type SubdivisionPlan = {
  rowCount: number;
  rowDepthM: number;
  lotCountPerRow: number;
  lotWidthM: number;
  score: number;
};

/** Quantidades em torno da teórica, sem arredondar cegamente. */
export function generateCandidateCounts(theoretical: number, span = 4): number[] {
  const n0 = Math.max(1, Math.round(theoretical));
  const out: number[] = [];
  for (let n = Math.max(1, n0 - span); n <= n0 + span; n++) out.push(n);
  return out;
}

/**
 * Melhor (n faixas × n lotes/faixa) para um retângulo.
 * Fecha 100% (profundidadeReal = D/n, testadaReal = L/m) perto do alvo, sem faixa-sobrante.
 */
export function findBestSubdivision(args: {
  depthM: number;
  alongM: number;
  profundidadeM: number;
  testadaM: number;
  areaMinimaM2?: number;
  cornerStart?: boolean;
  cornerEnd?: boolean;
  percentualEsquina?: number;
}): SubdivisionPlan {
  const p = args.profundidadeM > 0 ? args.profundidadeM : args.depthM;
  const t = args.testadaM > 0 ? args.testadaM : args.alongM;
  const minArea = lotMinAreaM2(t, p, args.areaMinimaM2);
  const maxArea = lotMaxAllowedAreaM2(t, p, args.areaMinimaM2);
  const targetArea = lotTargetAreaM2(t, p, args.areaMinimaM2);
  const scale =
    args.percentualEsquina != null && Number.isFinite(args.percentualEsquina)
      ? 1 + Math.max(0, args.percentualEsquina) / 100
      : 1;
  const nCorners = (args.cornerStart ? 1 : 0) + (args.cornerEnd ? 1 : 0);

  let best: SubdivisionPlan | null = null;
  for (const nRows of generateCandidateCounts(args.depthM / Math.max(p, 1e-6), 2)) {
    const rowDepth = args.depthM / nRows;
    if (rowDepth + 0.05 < p * SUBDIV_MIN_RATIO) continue;
    if (p > 0 && rowDepth > p * LOT_MAX_DEPTH_RATIO + 0.5) continue;
    const minW = minArea > 0 && rowDepth > 0.5 ? Math.max(t, minArea / rowDepth) : t;
    const maxW = Number.isFinite(maxArea) && rowDepth > 0.5 ? maxArea / rowDepth : 0;
    const widths = planRowLotWidths(
      args.alongM,
      minW,
      Boolean(args.cornerStart),
      Boolean(args.cornerEnd),
      minW * scale,
      t,
      maxW,
    );
    if (widths.length === 0) continue;
    const areas = widths.map((w) => w * rowDepth);
    if (areas.some((a) => minArea > 0 && a + 0.5 < minArea * 0.95)) continue;
    if (areas.some((a) => Number.isFinite(maxArea) && a > maxArea + 0.5)) continue;
    const leftoverM2 = Math.abs(args.depthM * args.alongM - areas.reduce((s, a) => s + a, 0) * nRows);
    const score = scoreSubdivision({
      areas: Array.from({ length: nRows }, () => areas).flat(),
      testadas: Array.from({ length: nRows }, () => widths).flat(),
      depths: Array.from({ length: nRows * widths.length }, () => rowDepth),
      leftoverM2,
      blockAreaM2: args.depthM * args.alongM,
      targetAreaM2: targetArea,
      targetTestadaM: t,
      targetDepthM: p,
      minAreaM2: minArea,
      minTestadaM: t,
    });
    const plan: SubdivisionPlan = {
      rowCount: nRows,
      rowDepthM: rowDepth,
      lotCountPerRow: widths.length,
      lotWidthM: widths.length > 0 ? args.alongM / widths.length : 0,
      score: score + Math.abs(nRows - args.depthM / Math.max(p, 1e-6)) + nCorners * 0.01,
    };
    if (!best || plan.score < best.score) best = plan;
  }
  if (best) return best;

  const rows = findBestEvenCount(args.depthM, p, {
    minEach: p * SUBDIV_MIN_RATIO,
    maxEach: p * LOT_MAX_DEPTH_RATIO,
  });
  const minW = minArea > 0 && rows.each > 0.5 ? Math.max(t, minArea / rows.each) : t;
  const widths = planRowLotWidths(
    args.alongM,
    minW,
    Boolean(args.cornerStart),
    Boolean(args.cornerEnd),
    minW * scale,
    t,
  );
  return {
    rowCount: rows.n,
    rowDepthM: rows.each,
    lotCountPerRow: Math.max(1, widths.length),
    lotWidthM: widths.length > 0 ? args.alongM / widths.length : minW,
    score: rows.score + 50_000,
  };
}

function planBlockRowCount(
  depth: number,
  profundidadeQuadraM: number,
  hasOppositeStreets: boolean,
  oppositeLongEdges: boolean,
  hasAnyStreet = false,
): number {
  const lot = profundidadeQuadraM > 0 ? profundidadeQuadraM : 50;
  if (depth < 8) return 1;
  /** Sem via, não inventar fileira interna. Com via, dois lados longos opostos permitem costas-com-costas. */
  const canDouble = hasOppositeStreets || (hasAnyStreet && oppositeLongEdges);
  if (!canDouble) return 1;
  const eachIfTwo = depth / 2;
  /** No máximo duas fileiras. Mais do que isso exige rua interna. */
  if (
    eachIfTwo + 0.05 >= 18 &&
    (eachIfTwo + 0.05 >= lot * SUBDIV_MIN_RATIO || depth + 0.05 >= 70)
  ) {
    return 2;
  }
  return 1;
}

/** Azimute da via/aresta de testada (ruas opostas ou dois lados longos paralelos). */
export function detectBlockFrontage(
  ring: Position[],
  streetRings: Position[][],
  fallbackAz: number,
): BlockFrontage {
  const streetEdges = streetRings.length > 0 ? collectBoundaryEdges(ring, streetRings, true) : [];
  const longEdges = collectBoundaryEdges(ring, streetRings, false);
  const edges = streetEdges.length > 0 ? streetEdges : longEdges;
  let seed = foldAz180(fallbackAz);
  if (edges.length > 0) {
    let longest = edges[0];
    for (const e of edges) {
      if (e.len > longest.len) longest = e;
    }
    seed = foldAz180(longest.az);
  }
  const familyA = edges.filter((e) => azDelta180(e.az, seed) <= FRONTAGE_FAMILY_DEG);
  const familyB = edges.filter((e) => azDelta180(e.az, seed + 90) <= FRONTAGE_FAMILY_DEG);
  const azA = familyA.length ? circularMeanAz180(familyA.map((e) => ({ az: e.az, len: e.len }))) : seed;
  const azB = familyB.length ? circularMeanAz180(familyB.map((e) => ({ az: e.az, len: e.len }))) : foldAz180(seed + 90);
  const options = [azA, azB];

  let bestOppStreet: { frontage: BlockFrontage; streetLen: number } | null = null;
  let bestOppLong: { frontage: BlockFrontage; edgeLen: number } | null = null;
  let bestSingle: { frontage: BlockFrontage; streetLen: number } | null = null;
  for (const az of options) {
    const f = boundaryFrontageLengths(ring, az, streetRings);
    const hasOpposite = f.posStreet >= 2 && f.negStreet >= 2;
    const hasOppositeLongEdges = hasOppositeLongFrontage(f);
    const cand: BlockFrontage = { azimuthDeg: az, hasOpposite, hasOppositeLongEdges, depthM: f.depth };
    const streetLen = f.posStreet + f.negStreet;
    const edgeLen = f.pos + f.neg;
    if (hasOpposite) {
      const betterOpp =
        !bestOppStreet ||
        cand.depthM < bestOppStreet.frontage.depthM - 1 ||
        (Math.abs(cand.depthM - bestOppStreet.frontage.depthM) <= 1 && streetLen > bestOppStreet.streetLen);
      if (betterOpp) bestOppStreet = { frontage: cand, streetLen };
    }
    if (hasOppositeLongEdges) {
      const betterLong =
        !bestOppLong ||
        cand.depthM < bestOppLong.frontage.depthM - 1 ||
        (Math.abs(cand.depthM - bestOppLong.frontage.depthM) <= 1 && edgeLen > bestOppLong.edgeLen);
      if (betterLong) bestOppLong = { frontage: cand, edgeLen };
    }
    if (!bestSingle || streetLen > bestSingle.streetLen) bestSingle = { frontage: cand, streetLen };
  }
  if (bestOppStreet) return bestOppStreet.frontage;
  if (bestOppLong) return bestOppLong.frontage;
  if (bestSingle && bestSingle.streetLen > 0) return bestSingle.frontage;
  const seedDepth = boundaryFrontageLengths(ring, seed, streetRings);
  return {
    azimuthDeg: seed,
    hasOpposite: false,
    hasOppositeLongEdges: hasOppositeLongFrontage(seedDepth),
    depthM: seedDepth.depth,
  };
}

/** Azimute da testada desta fileira: rua local ou aresta longa externa (não a divisória de fundos). */
export function detectRowFrontage(
  ring: Position[],
  streetRings: Position[][],
  fallbackAz: number,
  blockCentroid: Position,
): BlockFrontage {
  const rowC = originOf(ring);
  const outer: Position = [rowC[0] - blockCentroid[0], rowC[1] - blockCentroid[1]];
  const pts = dropClosing(ring);
  let best: { az: number; score: number; street: boolean; depth: number } | null = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = planarLength(a, b);
    if (len < 2) continue;
    const mid = midpoint(a, b);
    const towardOuter = (mid[0] - rowC[0]) * outer[0] + (mid[1] - rowC[1]) * outer[1];
    const street = streetRings.length > 0 && edgeAlongStreet(a, b, streetRings);
    let score = len;
    if (towardOuter > 0) score += len * 8;
    else score -= len * 5;
    if (street) score += len * 10;
    if (!best || score > best.score) {
      best = { az: planarAzimuthDeg(a, b), score, street, depth: 0 };
    }
  }
  const az = best ? foldAz180(best.az) : foldAz180(fallbackAz);
  const f = boundaryFrontageLengths(ring, az, streetRings);
  return {
    azimuthDeg: az,
    hasOpposite: f.posStreet >= 2 && f.negStreet >= 2,
    hasOppositeLongEdges: hasOppositeLongFrontage(f),
    depthM: f.depth,
  };
}

function cutBlockIntoRows(
  ring: Position[],
  splitAz: number,
  origin: Position,
  rowCount = 2,
): Position[][] {
  const { dirS, dirD } = streetDir(splitAz);
  const c = originOf(ring);
  let dMin = Infinity;
  let dMax = -Infinity;
  let sMin = Infinity;
  let sMax = -Infinity;
  for (const p of ring) {
    const vx = p[0] - c[0];
    const vy = p[1] - c[1];
    const s = vx * dirS[0] + vy * dirS[1];
    const d = vx * dirD[0] + vy * dirD[1];
    sMin = Math.min(sMin, s);
    sMax = Math.max(sMax, s);
    dMin = Math.min(dMin, d);
    dMax = Math.max(dMax, d);
  }
  const depth = dMax - dMin;
  const n = Math.max(2, Math.round(rowCount));
  if (depth < 8) return [closeRing(ring)];
  const h = depth / n;
  const pad = Math.max(sMax - sMin, depth, 10) + 8;

  const halfStrip = (d0: number, d1: number): Position[] => {
    const p = (s: number, d: number): Position => [
      c[0] + s * dirS[0] + d * dirD[0],
      c[1] + s * dirS[1] + d * dirD[1],
    ];
    return closeRing([p(-pad, d0), p(pad, d0), p(pad, d1), p(-pad, d1)]);
  };

  const quadraFeat = asTurfPolygon(ring, origin);
  const rows: Position[][] = [];
  for (let i = 0; i < n; i++) {
    const d0 = dMin + i * h - (i === 0 ? 0.05 : 0.02);
    const d1 = dMin + (i + 1) * h + (i === n - 1 ? 0.05 : 0.02);
    try {
      const strip = asTurfPolygon(halfStrip(d0, d1), origin);
      const cut = turf.intersect(turf.featureCollection([quadraFeat, strip]));
      for (const poly of flattenPoly(cut, origin)) {
        if (planarAreaM2(poly[0]) >= SLIVER_M2) rows.push(closeRing(poly[0]));
      }
    } catch {
      /* ignore */
    }
  }
  if (rows.length < 2) return [closeRing(ring)];
  return rows;
}

/**
 * Parte a quadra ao meio (divisória de fundos) quando a profundidade cabe duas
 * fileiras, há dois lados longos opostos, ou há via na frente e nos fundos.
 * Não exige duas camadas de via gerada — a aresta oposta do polígono basta.
 */
export function splitThroughBlock(
  quadraCoords: PolygonCoords,
  azimuthDeg: number,
  streetRings: Position[][],
  origin: Position,
  profundidadeQuadraM = 0,
): Position[][] {
  const ring = dropClosing(quadraCoords);
  if (ring.length < 3) return [closeRing(ring)];

  const detected = detectBlockFrontage(ring, streetRings, azimuthDeg);
  const forced = boundaryFrontageLengths(ring, azimuthDeg, streetRings);
  const forcedOppStreet = forced.posStreet >= 2 && forced.negStreet >= 2;
  const splitAz = forcedOppStreet
    ? azimuthDeg
    : detected.hasOpposite || detected.hasOppositeLongEdges
      ? detected.azimuthDeg
      : azimuthDeg;
  const along = boundaryFrontageLengths(ring, splitAz, streetRings);
  const hasOppStreet = along.posStreet >= 2 && along.negStreet >= 2;
  const oppLong = hasOppositeLongFrontage(along);
  const rowCount = planBlockRowCount(
    along.depth,
    profundidadeQuadraM,
    hasOppStreet,
    oppLong,
    streetRings.length > 0,
  );
  if (rowCount < 2) return [closeRing(ring)];
  return cutBlockIntoRows(ring, splitAz, origin, rowCount);
}

/** Fatia a fileira com larguras explícitas ao longo da testada (soma = frente). */
export function subdivideRowByWidths(
  quadraCoords: PolygonCoords,
  azimuthDeg: number,
  widths: number[],
  streetRings?: Position[][],
  originHint?: Position,
  blockCentroid?: Position,
  minTestadaM = 0,
): Position[][][] {
  const ring = dropClosing(quadraCoords);
  if (ring.length < 3 || widths.length === 0) return [];

  const origin = originHint ?? originOf(ring);
  const inwardRef = originOf(ring);
  const front = frontEdge(ring, azimuthDeg, streetRings, blockCentroid);
  if (!front || front.length < 0.5) return [];

  const alongLen = planarLength(front.a, front.b);
  if (alongLen < 0.5) return [];
  const ux = (front.b[0] - front.a[0]) / alongLen;
  const uy = (front.b[1] - front.a[1]) / alongLen;
  let px = -uy;
  let py = ux;
  const mid: Position = [(front.a[0] + front.b[0]) / 2, (front.a[1] + front.b[1]) / 2];
  if ((inwardRef[0] - mid[0]) * px + (inwardRef[1] - mid[1]) * py < 0) {
    px = -px;
    py = -py;
  }

  let depth = 0;
  for (const p of ring) {
    const d = (p[0] - front.a[0]) * px + (p[1] - front.a[1]) * py;
    if (d > depth) depth = d;
  }
  if (depth < 0.5) return [];

  const positive = widths.map((w) => Math.max(0, w));
  const rawSum = positive.reduce((s, w) => s + w, 0);
  if (rawSum <= 1e-6) return [];
  const scaled = positive.map((w) => (w / rawSum) * alongLen);
  const extra = depth + Math.max(2, larguraPad(depth));
  const quadraFeat = asTurfPolygon(ring, origin);
  const lots: Position[][][] = [];
  let tCursor = 0;

  for (let i = 0; i < scaled.length; i++) {
    const span = i === scaled.length - 1 ? alongLen - tCursor : scaled[i];
    const t0 = tCursor;
    const t1 = tCursor + span;
    tCursor = t1;
    if (span < 0.25) continue;
    const a: Position = [front.a[0] + ux * t0, front.a[1] + uy * t0];
    const b: Position = [front.a[0] + ux * t1, front.a[1] + uy * t1];
    const c1: Position = [b[0] + px * extra, b[1] + py * extra];
    const d1: Position = [a[0] + px * extra, a[1] + py * extra];
    let strip: Feature<Polygon>;
    try {
      strip = turf.polygon([[toGeo(a, origin), toGeo(b, origin), toGeo(c1, origin), toGeo(d1, origin), toGeo(a, origin)]]);
    } catch {
      continue;
    }
    let cut: ReturnType<typeof turf.intersect> = null;
    try {
      cut = turf.intersect(turf.featureCollection([quadraFeat, strip]));
    } catch {
      continue;
    }
    for (const poly of flattenPoly(cut, origin)) {
      const area = planarAreaM2(poly[0]);
      if (area < SLIVER_M2) continue;
      const testada = lotFrontWidthM(poly[0], ux, uy);
      if (minTestadaM > 0 && testada + 0.08 < minTestadaM) continue;
      lots.push(poly);
    }
  }

  return lots;
}

function streetTouchesFrontEnd(
  ring: Position[],
  front: { a: Position; b: Position },
  which: "start" | "end",
  streetRings: Position[][],
): boolean {
  if (streetRings.length === 0) return false;
  const end = which === "start" ? front.a : front.b;
  const frontAz = planarAzimuthDeg(front.a, front.b);
  const pts = dropClosing(ring);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const mid = midpoint(a, b);
    const near =
      Math.min(planarLength(a, end), planarLength(b, end), planarLength(mid, end)) <= 2.8;
    if (!near) continue;
    if (azDelta180(planarAzimuthDeg(a, b), frontAz) <= 18) continue;
    if (edgeAlongStreet(a, b, streetRings)) return true;
  }
  const alongLen = planarLength(front.a, front.b);
  if (alongLen < 0.5 || minDistToRings(end, streetRings) > 2.8) return false;
  let px = -(front.b[1] - front.a[1]) / alongLen;
  let py = (front.b[0] - front.a[0]) / alongLen;
  const inward = originOf(ring);
  const mid = midpoint(front.a, front.b);
  if ((inward[0] - mid[0]) * px + (inward[1] - mid[1]) * py < 0) {
    px = -px;
    py = -py;
  }
  const probe: Position = [end[0] + px * 4, end[1] + py * 4];
  return minDistToRings(probe, streetRings) <= 2.8;
}

function planRowLotWidths(
  alongLen: number,
  minWidth: number,
  cornerStart: boolean,
  cornerEnd: boolean,
  cornerWidth: number,
  targetWidth = minWidth,
  maxWidth = 0,
): number[] {
  if (!(alongLen > 0) || !(minWidth > 0) || alongLen + 0.05 < minWidth) return [];
  const tgt = targetWidth > 0 ? targetWidth : minWidth;
  const wCorner = Math.max(minWidth, cornerWidth);
  const cornerScale = minWidth > 1e-9 ? wCorner / minWidth : 1;
  const nCorners = (cornerStart ? 1 : 0) + (cornerEnd ? 1 : 0);
  const maxN = Math.max(1, Math.floor(alongLen / minWidth + 1e-9));
  const minN =
    maxWidth > minWidth
      ? Math.max(1, nCorners, Math.ceil(alongLen / maxWidth - 1e-9))
      : Math.max(1, nCorners);
  const n0 =
    nCorners > 0 && alongLen > nCorners * wCorner + tgt
      ? nCorners + Math.max(0, Math.round((alongLen - nCorners * wCorner) / Math.max(tgt, 1e-6)))
      : Math.max(nCorners || 1, Math.round(alongLen / Math.max(tgt, 1e-6)));

  const widthsForN = (n: number): number[] | null => {
    if (n < minN || n > maxN) return null;
    const innerN = n - nCorners;
    const weights: number[] = [];
    if (cornerStart) weights.push(cornerScale);
    for (let i = 0; i < innerN; i++) weights.push(1);
    if (cornerEnd) weights.push(cornerScale);
    const wsum = weights.reduce((s, w) => s + w, 0);
    if (wsum <= 1e-9) return null;
    const unit = alongLen / wsum;
    const widths = weights.map((w) => w * unit);
    if (widths.some((w) => w + 0.05 < minWidth)) return null;
    return widths;
  };

  let best: { widths: number[]; score: number } | null = null;
  const lo = Math.max(minN, Math.min(Math.max(n0, minN), maxN) - 4);
  const hi = Math.min(maxN, Math.max(n0, minN) + 4);
  for (let n = lo; n <= hi; n++) {
    const widths = widthsForN(n);
    if (!widths) continue;
    const innerN = n - nCorners;
    let testadaPen = 0;
    let excess = 0;
    for (let i = 0; i < widths.length; i++) {
      const w = widths[i] ?? 0;
      const want =
        (cornerStart && i === 0) || (cornerEnd && i === widths.length - 1) ? wCorner : tgt;
      testadaPen += Math.abs(w - want);
      excess += Math.max(0, w - tgt * SUBDIV_MAX_RATIO);
    }
    const uni = innerN > 1 ? Math.abs((widths[cornerStart ? 1 : 0] ?? tgt) - tgt) : 0;
    const score = excess * 10_000 + testadaPen * 1_000 + uni * 500 + Math.abs(n - n0) * 2;
    if (!best || score < best.score) best = { widths, score };
  }
  if (best) return best.widths;
  if (minN > maxN) return [];
  const fallbackN = Math.max(minN, Math.min(maxN, n0));
  return Array.from({ length: fallbackN }, () => alongLen / fallbackN);
}

function seedInternalStreetsInBlocks(
  blocks: Position[][][],
  azimuthDeg: number,
  larguraViaM: number,
  profundidadeQuadraM: number,
  origin: Position,
  streetRings: Position[][] = [],
): { quadras: Position[][][]; vias: Position[][][]; eixos: Position[][] } {
  const vias: Position[][][] = [];
  const eixos: Position[][] = [];
  const quadras: Position[][][] = [];
  const p = profundidadeQuadraM;
  const module = p * 2 + larguraViaM;
  for (const block of blocks) {
    const outer = block[0];
    if (!outer || dropClosing(outer).length < 3) continue;
    const box = (() => {
      const pts = dropClosing(outer);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const pt of pts) {
        minX = Math.min(minX, pt[0]);
        maxX = Math.max(maxX, pt[0]);
        minY = Math.min(minY, pt[1]);
        maxY = Math.max(maxY, pt[1]);
      }
      return { minX, maxX, minY, maxY };
    })();
    const spanX = box.maxX - box.minX;
    const spanY = box.maxY - box.minY;
    const spanMax = Math.max(spanX, spanY);
    const frontage = detectBlockFrontage(outer, streetRings, azimuthDeg);
    const spanMin = Math.min(spanX, spanY);
    /** Duas fileiras costas-com-costas já resolvem — não abrir rua no miolo. */
    if (frontage.hasOpposite && frontage.depthM <= p * 2 + 2.5) {
      quadras.push(block);
      continue;
    }
    /** Com acesso oposto, manter o limiar antigo para não fragmentar quadra já dimensionada. */
    if (frontage.hasOpposite && spanMin + 0.5 < module * 1.15) {
      quadras.push(block);
      continue;
    }
    /** Quadra cega/profunda: usa o maior vão para caber rua interna + duas fileiras. */
    if (!frontage.hasOpposite && spanMax + 0.5 < module * 0.9) {
      quadras.push(block);
      continue;
    }
    if (frontage.hasOpposite && spanMax + 0.5 < module * 0.9) {
      quadras.push(block);
      continue;
    }
    const hostArea = planarAreaM2(outer);
    const azCandidates = [
      frontage.azimuthDeg,
      foldAz180(frontage.azimuthDeg + 90),
      azimuthDeg,
      foldAz180(azimuthDeg + 90),
    ].filter((az, i, all) => all.findIndex((x) => azDelta180(x, az) < 8) === i);
    let best: { leftover: Position[][][]; vias: Position[][][]; eixos: Position[][] } | null = null;
    let bestMinPiece = -1;
    for (const az of azCandidates) {
      const grid = generateStreetGrid(outer, az, larguraViaM, p, 0, true);
      if (grid.vias.length === 0) continue;
      const leftover = subtractStreets(outer, grid.vias);
      const pieces = leftover.length > 0 ? leftover : [block];
      const pieceAreas = pieces.map((pc) => planarAreaM2(pc[0] ?? []));
      const minPiece = Math.min(...pieceAreas);
      /** Não fragmentar quadra já dimensionada em retalhos inutilizáveis. */
      if (minPiece < 900 && minPiece < hostArea * 0.4) continue;
      if (minPiece > bestMinPiece) {
        best = { leftover: pieces, vias: grid.vias, eixos: grid.eixos };
        bestMinPiece = minPiece;
      }
    }
    if (!best) {
      quadras.push(block);
      continue;
    }
    vias.push(...best.vias);
    eixos.push(...best.eixos);
    quadras.push(...best.leftover);
  }
  return { quadras, vias, eixos };
}

export function subdivideQuadraEmLotes(
  quadraCoords: PolygonCoords,
  azimuthDeg: number,
  testadaMinimaM: number,
  areaMinimaM2 = 0,
  streetRings?: Position[][],
  originHint?: Position,
  blockCentroid?: Position,
  opts?: {
    profundidadeM?: number;
    percentualEsquina?: number;
    skipRowSplit?: boolean;
    allowShallow?: boolean;
    allowIrregular?: boolean;
  },
): Position[][][] {
  return subdivideQuadraEmLotesPass(
    quadraCoords,
    azimuthDeg,
    testadaMinimaM,
    areaMinimaM2,
    streetRings,
    originHint,
    blockCentroid,
    opts,
    0,
  );
}

function subdivideQuadraEmLotesPass(
  quadraCoords: PolygonCoords,
  azimuthDeg: number,
  testadaMinimaM: number,
  areaMinimaM2: number,
  streetRings: Position[][] | undefined,
  originHint: Position | undefined,
  blockCentroid: Position | undefined,
  opts:
    | {
        profundidadeM?: number;
        percentualEsquina?: number;
        skipRowSplit?: boolean;
        allowShallow?: boolean;
        allowIrregular?: boolean;
      }
    | undefined,
  pass: number,
): Position[][][] {
  const ring = dropClosing(quadraCoords);
  if (ring.length < 3 || testadaMinimaM <= 0 || pass > 6) return [];

  const origin = originHint ?? originOf(ring);
  const inwardRef = originOf(ring);
  const streets = streetRings ?? [];
  const hostArea = planarAreaM2(ring);
  const profundidadeMEarly =
    opts?.profundidadeM != null && opts.profundidadeM > 0
      ? opts.profundidadeM
      : areaMinimaM2 > 0 && testadaMinimaM > 0
        ? areaMinimaM2 / testadaMinimaM
        : 0;
  const minAreaEarly = lotMinAreaM2(testadaMinimaM, profundidadeMEarly, areaMinimaM2);
  const maxAreaEarly = lotMaxAllowedAreaM2(testadaMinimaM, profundidadeMEarly, areaMinimaM2);
  let front = frontEdge(ring, azimuthDeg, streets, blockCentroid);
  if ((!front || front.length < testadaMinimaM - 0.05) && hostArea > maxAreaEarly && pass < 4) {
    const altAz = foldAz180(azimuthDeg + 90);
    const altFront = frontEdge(ring, altAz, streets, blockCentroid);
    if (altFront && altFront.length >= testadaMinimaM - 0.05) {
      return subdivideQuadraEmLotesPass(
        ring,
        altAz,
        testadaMinimaM,
        areaMinimaM2,
        streets,
        origin,
        blockCentroid,
        opts,
        pass + 1,
      );
    }
  }
  if (!front || front.length < testadaMinimaM - 0.05) return [];

  const alongLen = planarLength(front.a, front.b);
  const ux = (front.b[0] - front.a[0]) / alongLen;
  const uy = (front.b[1] - front.a[1]) / alongLen;
  let px = -uy;
  let py = ux;
  const mid: Position = [(front.a[0] + front.b[0]) / 2, (front.a[1] + front.b[1]) / 2];
  if ((inwardRef[0] - mid[0]) * px + (inwardRef[1] - mid[1]) * py < 0) {
    px = -px;
    py = -py;
  }

  let depth = 0;
  for (const p of ring) {
    const d = (p[0] - front.a[0]) * px + (p[1] - front.a[1]) * py;
    if (d > depth) depth = d;
  }
  if (depth < 0.5) return [];

  if (
    pass < 4 &&
    alongLen + 0.05 < Math.max(testadaMinimaM * 1.9, profundidadeMEarly * 1.05) &&
    depth > alongLen * 1.35 &&
    hostArea > maxAreaEarly
  ) {
    const altAz = foldAz180(azimuthDeg + 90);
    if (Math.abs(azDelta180(altAz, azimuthDeg)) > 20) {
      return subdivideQuadraEmLotesPass(
        ring,
        altAz,
        testadaMinimaM,
        areaMinimaM2,
        streets,
        origin,
        blockCentroid,
        opts,
        pass + 1,
      );
    }
  }

  if (
    !opts?.skipRowSplit &&
    profundidadeMEarly > 0 &&
    depth > profundidadeMEarly * SUBDIV_MAX_RATIO + 0.05 &&
    pass < 5
  ) {
    const alongFront = boundaryFrontageLengths(ring, azimuthDeg, streets);
    const hasOppStreet = alongFront.posStreet >= 2 && alongFront.negStreet >= 2;
    const n = planBlockRowCount(depth, profundidadeMEarly, hasOppStreet, false, streets.length > 0);
    if (n >= 2) {
      const rows = cutBlockIntoRows(ring, azimuthDeg, origin, n);
      if (rows.length >= 2) {
        const fromRows: Position[][][] = [];
        for (const row of rows) {
          fromRows.push(
            ...subdivideQuadraEmLotesPass(
              row,
              azimuthDeg,
              testadaMinimaM,
              areaMinimaM2,
              streets,
              origin,
              blockCentroid ?? inwardRef,
              { ...opts, skipRowSplit: false },
              pass + 1,
            ),
          );
        }
        if (fromRows.length > 0) return fromRows;
      }
    }
  }

  const profundidadeM =
    opts?.profundidadeM != null && opts.profundidadeM > 0
      ? opts.profundidadeM
      : areaMinimaM2 > 0 && testadaMinimaM > 0
        ? areaMinimaM2 / testadaMinimaM
        : 0;
  const minArea = lotMinAreaM2(testadaMinimaM, profundidadeM, areaMinimaM2);
  const minWidth =
    minArea > 0 && depth > 0.5 ? Math.max(testadaMinimaM, minArea / depth) : testadaMinimaM;
  if (profundidadeM > 0 && depth + 0.05 < profundidadeM * SUBDIV_MIN_RATIO) {
    const shallowOk =
      Boolean(opts?.allowShallow) &&
      (Boolean(opts?.allowIrregular) || minWidth <= testadaMinimaM * 1.75 + 0.05);
    if (!shallowOk) return [];
  }
  if (alongLen + 0.05 < minWidth * 1.85 && hostArea > maxAreaEarly && pass < 4) {
    const altAz = foldAz180(azimuthDeg + 90);
    if (Math.abs(azDelta180(altAz, azimuthDeg)) > 20) {
      return subdivideQuadraEmLotesPass(
        ring,
        altAz,
        testadaMinimaM,
        areaMinimaM2,
        streets,
        origin,
        blockCentroid,
        opts,
        pass + 1,
      );
    }
  }
  if (alongLen + 0.05 < minWidth) return [];

  const pct = opts?.percentualEsquina != null && Number.isFinite(opts.percentualEsquina) ? opts.percentualEsquina : 0;
  const cornerStart = pct > 0 && streetTouchesFrontEnd(ring, front, "start", streets);
  const cornerEnd = pct > 0 && streetTouchesFrontEnd(ring, front, "end", streets);
  const cornerWidth =
    pct > 0 && profundidadeM > 0 ? (minArea * (1 + pct / 100)) / Math.max(depth, profundidadeM, 0.5) : minWidth;
  const maxLotWidth =
    Number.isFinite(maxAreaEarly) && maxAreaEarly > 0 && depth > 0.5 ? maxAreaEarly / depth : 0;
  const widths = planRowLotWidths(
    alongLen,
    minWidth,
    cornerStart,
    cornerEnd,
    cornerWidth,
    testadaMinimaM,
    maxLotWidth,
  );
  if (widths.length === 0) return [];

  const lots = subdivideRowByWidths(ring, azimuthDeg, widths, streets, origin, blockCentroid, minWidth * 0.88);
  const maxArea = lotMaxAllowedAreaM2(testadaMinimaM, profundidadeM, areaMinimaM2);
  const kept: Position[][][] = [];
  for (const poly of lots) {
    const area = planarAreaM2(poly[0] ?? []);
    if (minArea > 0 && area + 1e-6 < minArea * 0.95) continue;
    if (Number.isFinite(maxArea) && area > maxArea + 0.5) {
      if (pass < 5) {
        const split = subdivideQuadraEmLotesPass(
          poly[0] ?? [],
          azimuthDeg,
          testadaMinimaM,
          areaMinimaM2,
          streets,
          origin,
          blockCentroid,
          { ...opts, skipRowSplit: false },
          pass + 1,
        );
        const ok = split.filter((p) => {
          const a = planarAreaM2(p[0] ?? []);
          return (minArea <= 0 || a + 1e-6 >= minArea * 0.95) && a <= maxArea + 0.5;
        });
        if (ok.length >= 2) kept.push(...ok);
      }
      continue;
    }
    kept.push(poly);
  }
  return kept;
}

function lotFrontWidthM(ring: Position[], ux: number, uy: number): number {
  const pts = dropClosing(ring);
  if (pts.length === 0) return 0;
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const p of pts) {
    const t = p[0] * ux + p[1] * uy;
    tMin = Math.min(tMin, t);
    tMax = Math.max(tMax, t);
  }
  return tMax - tMin;
}

function larguraPad(depth: number): number {
  return Math.max(1, depth * 0.05);
}

/** Soma das arestas do lote que confrontam uma via (não basta estar perto). */
export function lotStreetFrontageM(ring: Position[], streetRings: Position[][]): number {
  if (streetRings.length === 0) return 0;
  return collectBoundaryEdges(ring, streetRings, true).reduce((sum, edge) => sum + edge.len, 0);
}

/** Acesso válido = confrontação real com via, com testada mínima quando informada. */
export function lotHasRoadAccess(ring: Position[], streetRings: Position[][], minFrontageM = 0): boolean {
  const front = lotStreetFrontageM(ring, streetRings);
  if (front < 2) return false;
  if (minFrontageM > 0 && front + 0.05 < minFrontageM) return false;
  return true;
}

export function countInternalStreetPolys(
  vias: Position[][][],
  glebaRing: Position[],
  streetWidthM: number,
): number {
  const pts = dropClosing(glebaRing);
  if (pts.length === 0 || vias.length === 0) return 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const margin = Math.max(streetWidthM * 1.35, 8);
  let n = 0;
  for (const via of vias) {
    const ring = via[0];
    if (!ring || dropClosing(ring).length < 3) continue;
    let vMinX = Infinity;
    let vMaxX = -Infinity;
    let vMinY = Infinity;
    let vMaxY = -Infinity;
    for (const p of dropClosing(ring)) {
      vMinX = Math.min(vMinX, p[0]);
      vMaxX = Math.max(vMaxX, p[0]);
      vMinY = Math.min(vMinY, p[1]);
      vMaxY = Math.max(vMaxY, p[1]);
    }
    const cx = (vMinX + vMaxX) / 2;
    const cy = (vMinY + vMaxY) / 2;
    if (cx < minX + margin || cx > maxX - margin || cy < minY + margin || cy > maxY - margin) continue;
    n += 1;
  }
  return n;
}

function rejectLotsWithoutAccess(
  lotes: LoteResult[],
  streetRings: Position[][],
  minFrontageM: number,
): { kept: LoteResult[]; rejected: Position[][][] } {
  const kept: LoteResult[] = [];
  const rejected: Position[][][] = [];
  for (const lote of lotes) {
    if (lotHasRoadAccess(lote.coordinates[0] ?? [], streetRings, minFrontageM)) kept.push(lote);
    else rejected.push(lote.coordinates);
  }
  return { kept, rejected };
}

function lotTestadaM(ring: Position[], azimuthDeg: number, streetRings?: Position[][], blockCentroid?: Position): number {
  const front = frontEdge(ring, azimuthDeg, streetRings, blockCentroid);
  if (front && planarLength(front.a, front.b) >= 0.5) {
    const alongLen = planarLength(front.a, front.b);
    return lotFrontWidthM(ring, (front.b[0] - front.a[0]) / alongLen, (front.b[1] - front.a[1]) / alongLen);
  }
  const { dirS } = streetDir(azimuthDeg);
  return lotFrontWidthM(ring, dirS[0], dirS[1]);
}

export type LotSizeSpec = {
  testadaM?: number;
  profundidadeM?: number;
  areaM2?: number;
};

export type LotFrontDepth = {
  testadaM: number;
  profundidadeM: number;
  azimuthDeg: number;
  areaM2: number;
};

export type PackedLotInput = {
  coordinates: Position[][];
  id?: string;
  numero?: string;
};

/** Testada (frente) e profundidade (fundo) de um lote, pela aresta de frente. */
export function measureLotFrontAndDepth(
  ring: PolygonCoords,
  streetRings: Position[][] = [],
  fallbackAz?: number,
  blockCentroid?: Position,
): LotFrontDepth {
  const pts = dropClosing(ring);
  const azimuthDeg =
    fallbackAz != null && Number.isFinite(fallbackAz)
      ? fallbackAz
      : detectBlockFrontage(pts, streetRings, getMainAxisAzimuth(pts)).azimuthDeg;
  const testadaM = lotTestadaM(pts, azimuthDeg, streetRings, blockCentroid);
  const front = frontEdge(pts, azimuthDeg, streetRings, blockCentroid);
  let profundidadeM = 0;
  if (front && planarLength(front.a, front.b) >= 0.5) {
    const alongLen = planarLength(front.a, front.b);
    const ux = (front.b[0] - front.a[0]) / alongLen;
    const uy = (front.b[1] - front.a[1]) / alongLen;
    let px = -uy;
    let py = ux;
    const mid = midpoint(front.a, front.b);
    const inward = originOf(pts);
    if ((inward[0] - mid[0]) * px + (inward[1] - mid[1]) * py < 0) {
      px = -px;
      py = -py;
    }
    for (const p of pts) {
      const d = (p[0] - front.a[0]) * px + (p[1] - front.a[1]) * py;
      if (d > profundidadeM) profundidadeM = d;
    }
  }
  const areaM2 = planarAreaM2(pts);
  if (profundidadeM < 0.5 && testadaM > 0.5) profundidadeM = areaM2 / testadaM;
  return { testadaM, profundidadeM, azimuthDeg, areaM2 };
}

/** Resolve testada × profundidade: área + frente mantém a testada; área + fundo calcula a frente. */
export function resolveLotSizeSpec(
  spec: LotSizeSpec,
  current: { testadaM: number; profundidadeM: number },
): { testadaM: number; profundidadeM: number } {
  const t = spec.testadaM != null && Number.isFinite(spec.testadaM) && spec.testadaM > 0 ? spec.testadaM : undefined;
  const p =
    spec.profundidadeM != null && Number.isFinite(spec.profundidadeM) && spec.profundidadeM > 0
      ? spec.profundidadeM
      : undefined;
  const a = spec.areaM2 != null && Number.isFinite(spec.areaM2) && spec.areaM2 > 0 ? spec.areaM2 : undefined;
  if (t != null && p != null) return { testadaM: t, profundidadeM: p };
  if (a != null && t != null) return { testadaM: t, profundidadeM: a / t };
  if (a != null && p != null) return { testadaM: a / p, profundidadeM: p };
  if (a != null && current.testadaM > 0.2) return { testadaM: current.testadaM, profundidadeM: a / current.testadaM };
  if (t != null) {
    return { testadaM: t, profundidadeM: current.profundidadeM > 0.2 ? current.profundidadeM : t };
  }
  if (p != null) {
    return { testadaM: current.testadaM > 0.2 ? current.testadaM : p, profundidadeM: p };
  }
  if (current.testadaM > 0.2 && current.profundidadeM > 0.2) {
    return { testadaM: current.testadaM, profundidadeM: current.profundidadeM };
  }
  throw new LoteamentoError("Informe testada e profundidade (ou área em m²) maiores que zero.");
}

/** Une anéis fechados (quadra reconstruída a partir dos lotes). */
export function unionClosedRings(rings: Position[][], originHint?: Position): Position[] {
  const cleaned = rings
    .map((r) => closeRing(dropClosing(r)))
    .filter((r) => dropClosing(r).length >= 3 && planarAreaM2(r) >= SLIVER_M2);
  if (cleaned.length === 0) return [];
  if (cleaned.length === 1) return cleaned[0];
  const origin = originHint ?? originOf(cleaned[0]);
  const merged = mergePolys(
    cleaned.map((r) => [r]),
    [],
    origin,
  );
  let best = merged[0]?.[0] ?? cleaned[0];
  let bestA = planarAreaM2(best);
  for (const poly of merged) {
    const a = planarAreaM2(poly[0] ?? []);
    if (a > bestA) {
      best = poly[0] ?? best;
      bestA = a;
    }
  }
  return closeRing(best);
}

function mergeTwoPolys(a: Position[][], b: Position[][], origin: Position): Position[][] | null {
  try {
    const u = unionPolygons([a, b], origin);
    const flat = flattenPoly(u, origin).filter((p) => planarAreaM2(p[0] ?? []) >= SLIVER_M2);
    if (flat.length === 1) return flat[0];
  } catch {
    /* união degenerada */
  }
  return null;
}

function nearestPolyIndex(lots: Position[][][], scrap: Position[]): number {
  if (lots.length === 0) return -1;
  let best = 0;
  let bestScore = -Infinity;
  const cScrap = originOf(dropClosing(scrap));
  for (let i = 0; i < lots.length; i++) {
    const ring = lots[i]?.[0] ?? [];
    const share = ringsShareBoundary(ring, scrap) ? 1_000_000 : 0;
    const dist = planarLength(originOf(dropClosing(ring)), cScrap);
    const score = share - dist;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/**
 * Sobra fina entra no lote vizinho. Sobra grande NÃO vira lote-cesta nem vai para o último lote.
 */
export function closeHostWithLots(host: Position[], lots: Position[][][], origin: Position): Position[][][] {
  if (lots.length === 0) return [];
  const scraps = leftoverAfterLots(host, lots, origin);
  if (scraps.length === 0) return lots;
  const result = lots.map((lot) => lot);
  for (const scrap of scraps) {
    const scrapA = planarAreaM2(scrap);
    if (scrapA < SLIVER_M2) continue;
    const areas = result.map((lot) => planarAreaM2(lot[0] ?? []));
    const mean = areas.reduce((s, a) => s + a, 0) / Math.max(areas.length, 1);
    const ranked = areas
      .map((_, i) => i)
      .sort((i, j) => {
        const belowI = (areas[i] ?? 0) < mean - 1e-6 ? 0 : 1;
        const belowJ = (areas[j] ?? 0) < mean - 1e-6 ? 0 : 1;
        if (belowI !== belowJ) return belowI - belowJ;
        return (areas[i] ?? 0) - (areas[j] ?? 0);
      });
    const nearest = nearestPolyIndex(result, scrap);
    let mergedOk = false;
    for (const idx of ranked) {
      const lotA = areas[idx] ?? 0;
      const tiny = scrapA <= Math.max(mean * 0.22, 48);
      if (!tiny && scrapA + lotA > mean * LOT_MAX_AREA_RATIO + 8) continue;
      if (!tiny && lotA > mean && ranked.some((k) => (areas[k] ?? 0) < mean * 0.98) && idx !== nearest) {
        continue;
      }
      const merged = mergeTwoPolys(result[idx]!, [closeRing(scrap)], origin);
      if (merged) {
        result[idx] = merged;
        mergedOk = true;
        break;
      }
    }
    if (mergedOk || nearest < 0) continue;
    const nearestA = areas[nearest] ?? 0;
    const tiny = scrapA <= Math.max(mean * 0.22, 48);
    if (!tiny && scrapA + nearestA > mean * LOT_MAX_AREA_RATIO + 8) continue;
    const merged = mergeTwoPolys(result[nearest]!, [closeRing(scrap)], origin);
    if (merged) result[nearest] = merged;
  }
  return result;
}

function cutBlockAtDepthFromSide(
  ring: Position[],
  azimuthDeg: number,
  origin: Position,
  depthFromFront: number,
  positiveFront: boolean,
): { front: Position[]; back: Position[] } {
  const { dirS, dirD } = streetDir(azimuthDeg);
  const c = originOf(ring);
  let dMin = Infinity;
  let dMax = -Infinity;
  let sMin = Infinity;
  let sMax = -Infinity;
  for (const p of ring) {
    const vx = p[0] - c[0];
    const vy = p[1] - c[1];
    const s = vx * dirS[0] + vy * dirS[1];
    const d = vx * dirD[0] + vy * dirD[1];
    sMin = Math.min(sMin, s);
    sMax = Math.max(sMax, s);
    dMin = Math.min(dMin, d);
    dMax = Math.max(dMax, d);
  }
  const depth = dMax - dMin;
  if (depth < 8) return { front: closeRing(ring), back: [] };
  const cut = Math.min(Math.max(depthFromFront, 1), Math.max(1.2, depth - 1));
  const dSplit = positiveFront ? dMax - cut : dMin + cut;
  const pad = Math.max(sMax - sMin, depth, 10) + 8;
  const halfStrip = (d0: number, d1: number): Position[] => {
    const p = (s: number, d: number): Position => [
      c[0] + s * dirS[0] + d * dirD[0],
      c[1] + s * dirS[1] + d * dirD[1],
    ];
    return closeRing([p(-pad, d0), p(pad, d0), p(pad, d1), p(-pad, d1)]);
  };
  const frontStrip = positiveFront ? halfStrip(dSplit, dMax + 0.05) : halfStrip(dMin - 0.05, dSplit);
  const backStrip = positiveFront ? halfStrip(dMin - 0.05, dSplit) : halfStrip(dSplit, dMax + 0.05);
  const intersectStrip = (stripRing: Position[]): Position[] | null => {
    try {
      const cutFeat = turf.intersect(turf.featureCollection([asTurfPolygon(ring, origin), asTurfPolygon(stripRing, origin)]));
      const polys = flattenPoly(cutFeat, origin).filter((poly) => planarAreaM2(poly[0]) >= SLIVER_M2);
      if (polys.length === 0) return null;
      let best = polys[0][0];
      let bestA = planarAreaM2(best);
      for (const poly of polys) {
        const a = planarAreaM2(poly[0]);
        if (a > bestA) {
          best = poly[0];
          bestA = a;
        }
      }
      return closeRing(best);
    } catch {
      return null;
    }
  };
  const front = intersectStrip(frontStrip);
  const back = intersectStrip(backStrip);
  if (!front) return { front: closeRing(ring), back: [] };
  return { front, back: back ?? [] };
}

function lotAlongKey(ring: Position[], dirS: Position): number {
  const c = originOf(ring);
  return c[0] * dirS[0] + c[1] * dirS[1];
}

function assignLotToRow(lotRing: Position[], rows: Position[][]): number {
  if (rows.length <= 1) return 0;
  let best = 0;
  let bestOv = -1;
  for (let i = 0; i < rows.length; i++) {
    const ov = polygonInteriorOverlapM2(lotRing, rows[i]);
    if (ov > bestOv) {
      bestOv = ov;
      best = i;
    }
  }
  return best;
}

function widthsForRow(
  items: { isAnchor: boolean; prevWidth: number }[],
  anchorWidth: number,
  totalFrontage: number,
): number[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [totalFrontage];
  const siblingCount = items.filter((it) => !it.isAnchor).length;
  const minSibling = siblingCount > 0 ? Math.min(0.8, totalFrontage / (items.length * 4)) : 0;
  const maxAnchor = Math.max(0.8, totalFrontage - siblingCount * minSibling);
  const clamped = Math.min(Math.max(anchorWidth, 0.8), maxAnchor);
  const leftover = Math.max(0, totalFrontage - clamped);
  const siblingPrev = items.filter((it) => !it.isAnchor).map((it) => Math.max(it.prevWidth, 0.2));
  const sumS = siblingPrev.reduce((s, w) => s + w, 0);
  const siblingOut =
    leftover <= 1e-6
      ? siblingPrev.map(() => 0)
      : sumS <= 1e-6
        ? siblingPrev.map(() => leftover / Math.max(siblingPrev.length, 1))
        : siblingPrev.map((w) => (w / sumS) * leftover);
  const out: number[] = [];
  let si = 0;
  for (const it of items) {
    out.push(it.isAnchor ? clamped : (siblingOut[si++] ?? leftover / Math.max(siblingCount, 1)));
  }
  const head = out.slice(0, -1);
  const used = head.reduce((s, w) => s + w, 0);
  out[out.length - 1] = totalFrontage - used;
  return out.map((w) => Math.max(w, 0.25));
}

function packRowByWidths(
  row: Position[],
  azimuthDeg: number,
  widths: number[],
  streetRings: Position[][],
  origin: Position,
  blockCentroid?: Position,
): Position[][][] {
  const cut = subdivideRowByWidths(row, azimuthDeg, widths, streetRings, origin, blockCentroid, 0);
  return closeHostWithLots(row, cut, origin);
}

function slicesToLotes(
  slices: LotSlice[],
  streetRings: Position[][],
  blockCentroid: Position | undefined,
  quadraName: string,
): LoteResult[] {
  return slices.map((slice, i) => {
    const closed = slice.coords.map(closeRing);
    return {
      coordinates: closed,
      area_m2: planarAreaM2(closed[0] ?? []),
      testada_m: lotTestadaM(closed[0] ?? [], slice.az, streetRings, blockCentroid),
      quadra: quadraName,
      numero: lotNumero(i),
      remainder: slice.remainder,
    };
  });
}

function packQuadraBlock(
  ring: Position[],
  testadaM: number,
  profundidadeM: number,
  streetRings: Position[][],
  origin: Position,
  quadraName: string,
  percentualEsquina = 0,
  areaMinimaM2 = 0,
): LoteResult[] {
  const blockCentroid = originOf(ring);
  const minArea = lotMinAreaM2(testadaM, profundidadeM, areaMinimaM2 > 0 ? areaMinimaM2 : testadaM * profundidadeM);
  const frontage = detectBlockFrontage(ring, streetRings, getMainAxisAzimuth(ring));
  const rows = splitThroughBlock(ring, frontage.azimuthDeg, streetRings, origin, profundidadeM);
  const slices: LotSlice[] = [];
  for (const row of rows) {
    const rowFront =
      rows.length > 1 ? detectRowFrontage(row, streetRings, frontage.azimuthDeg, blockCentroid) : frontage;
    const rowCentroid = rows.length > 1 ? blockCentroid : undefined;
    try {
      const split = subdivideQuadraEmLotes(
        row,
        rowFront.azimuthDeg,
        testadaM,
        minArea,
        streetRings,
        origin,
        rowCentroid,
        { profundidadeM, percentualEsquina },
      );
      const closed = closeHostWithLots(row, split, origin);
      for (const coords of closed) {
        slices.push({ coords, az: rowFront.azimuthDeg });
      }
    } catch {
      slices.push({ coords: [closeRing(row)], az: rowFront.azimuthDeg, remainder: true });
    }
  }
  if (slices.length === 0) {
    slices.push({ coords: [closeRing(ring)], az: frontage.azimuthDeg, remainder: true });
  }
  const packed = closeHostWithLots(
    ring,
    slices.map((s) => s.coords),
    origin,
  );
  const leftover = leftoverAfterLots(ring, packed, origin);
  const filled = complementarLoteamento(leftover, {
    azimuthDeg: frontage.azimuthDeg,
    testadaMinimaM: testadaM,
    profundidadeQuadraM: profundidadeM,
    areaMinimaM2: minArea,
    streetRings,
    origin,
    blockCentroid,
    percentualEsquina,
  });
  const closedAll = closeHostWithLots(ring, [...packed, ...filled.lots], origin);
  const byPacked = closedAll.map((coords, i) => ({
    coords,
    az: slices[Math.min(i, slices.length - 1)]?.az ?? frontage.azimuthDeg,
    remainder: i >= packed.length ? false : slices[i]?.remainder,
  }));
  const initial = slicesToLotes(byPacked, streetRings, rows.length > 1 ? blockCentroid : undefined, quadraName);
  const optimized = otimizarEquidadeDosLotes({
    host: ring,
    lotes: initial,
    streetRings,
    origin,
    testadaMinimaM: testadaM,
    profundidadeM,
    areaMinimaM2: minArea,
    percentualEsquina,
    config: { areaTarget: minArea },
  }).lotes;
  const access = rejectLotsWithoutAccess(optimized, streetRings, testadaM);
  if (access.kept.length > 0) return access.kept;
  /** Sem confrontação com as vias passadas, o empacotamento da quadra continua (orientação pelos lados). */
  return optimized;
}

/** Loteia a quadra inteira (sem remanescente) e numera os lotes. */
function lotearQuadraComoLotes(
  quadra: Position[][],
  quadraName: string,
  testadaM: number,
  areaMinimaM2: number,
  percentualEsquina: number,
  streetRings: Position[][],
  fallbackAzimuthDeg: number,
  profundidadeM = 0,
): LoteResult[] {
  const outer = quadra[0] ?? [];
  const azimuthDeg = detectBlockFrontage(outer, streetRings, fallbackAzimuthDeg).azimuthDeg;
  let lots: Position[][][];
  try {
    lots = lotearQuadraCompleta(quadra, {
      testadaM,
      areaMinimaM2,
      percentualEsquina,
      streetRings,
      profundidadeLoteM: profundidadeM > 0 ? profundidadeM : undefined,
    }).lots;
  } catch (err) {
    if (err instanceof CoberturaQuadraError) throw new LoteamentoError(`${quadraName}: ${err.message}`);
    throw err;
  }
  const lotes: LoteResult[] = lots.map((coords) => ({
    coordinates: coords.map(closeRing),
    area_m2: quadraPolyAreaM2(coords),
    testada_m: lotTestadaM(coords[0] ?? [], azimuthDeg, streetRings),
    quadra: quadraName,
    numero: "",
    remainder: false,
  }));
  const ordered = sortLotsForNumbering(lotes, azimuthDeg, (lote) => lote.coordinates[0] ?? []);
  ordered.forEach((lote, i) => {
    lote.numero = lotNumero(i);
  });
  return ordered;
}

/**
 * Reloteia a quadra. Se a profundidade exigir, insere ruas internas conectadas
 * à malha existente em vez de empilhar fileiras sem testada.
 */
export function rebuildQuadraLotesWithAccess(
  quadraCoords: PolygonCoords,
  testadaM: number,
  profundidadeM: number,
  streetRings: Position[][] = [],
  originHint?: Position,
  quadraName = "Quadra",
  larguraViaM = 10,
): { lotes: LoteResult[]; vias: Position[][][]; eixos: Position[][] } {
  if (!(testadaM > 0) || !(profundidadeM > 0)) {
    throw new LoteamentoError("Informe testada e profundidade (ou área em m²) maiores que zero.");
  }
  const ring = dropClosing(quadraCoords);
  if (ring.length < 3) {
    throw new LoteamentoError("A quadra precisa ser um polígono fechado.");
  }
  const origin = originHint ?? originOf(ring);
  const frontage = detectBlockFrontage(ring, streetRings, getMainAxisAzimuth(ring));
  const refined = seedInternalStreetsInBlocks(
    [[closeRing(ring)]],
    frontage.azimuthDeg,
    larguraViaM > 0 ? larguraViaM : 10,
    profundidadeM,
    origin,
    streetRings,
  );
  const allStreets = [...streetRings, ...streetOuterRings(refined.vias)];
  const hosts = refined.quadras.length > 0 ? refined.quadras : [[closeRing(ring)]];
  const lotes: LoteResult[] = [];
  for (const host of hosts) {
    const outer = host[0];
    if (!outer || dropClosing(outer).length < 3) continue;
    lotes.push(
      ...lotearQuadraComoLotes(
        host,
        quadraName,
        testadaM,
        testadaM * profundidadeM,
        0,
        allStreets,
        frontage.azimuthDeg,
        profundidadeM,
      ),
    );
  }
  if (hosts.length > 1) {
    const ordered = sortLotsForNumbering(lotes, frontage.azimuthDeg, (lote) => lote.coordinates[0] ?? []);
    ordered.forEach((lote, i) => {
      lote.numero = lotNumero(i);
    });
    return { lotes: ordered, vias: refined.vias, eixos: refined.eixos };
  }
  return { lotes, vias: refined.vias, eixos: refined.eixos };
}

/**
 * Reloteia só esta quadra com testada × profundidade uniformes.
 * A soma fecha a quadra quando não há rua interna nova; sobra fina redistribui entre vizinhos.
 */
export function rebuildQuadraLotes(
  quadraCoords: PolygonCoords,
  testadaM: number,
  profundidadeM: number,
  streetRings: Position[][] = [],
  originHint?: Position,
  quadraName = "Quadra",
  larguraViaM = 10,
): LoteResult[] {
  return rebuildQuadraLotesWithAccess(
    quadraCoords,
    testadaM,
    profundidadeM,
    streetRings,
    originHint,
    quadraName,
    larguraViaM,
  ).lotes;
}

/**
 * Altera o tamanho de um lote e reempacota os irmãos da mesma fileira
 * para fechar a quadra (sobra de testada nos outros; resto no último).
 */
export function adjustLotInQuadra(
  quadraCoords: PolygonCoords,
  lots: PackedLotInput[],
  anchorIndex: number,
  spec: LotSizeSpec,
  streetRings: Position[][] = [],
  originHint?: Position,
  quadraName = "Quadra",
): LoteResult[] {
  const ring = dropClosing(quadraCoords);
  if (ring.length < 3) {
    throw new LoteamentoError("A quadra precisa ser um polígono fechado.");
  }
  if (lots.length === 0 || anchorIndex < 0 || anchorIndex >= lots.length) {
    const size = resolveLotSizeSpec(spec, { testadaM: 10, profundidadeM: 25 });
    return rebuildQuadraLotes(ring, size.testadaM, size.profundidadeM, streetRings, originHint, quadraName);
  }
  const origin = originHint ?? originOf(ring);
  const blockCentroid = originOf(ring);
  const frontage = detectBlockFrontage(ring, streetRings, getMainAxisAzimuth(ring));
  const anchorRing = dropClosing(lots[anchorIndex].coordinates[0] ?? []);
  if (anchorRing.length < 3) {
    throw new LoteamentoError("O lote selecionado não é um polígono válido.");
  }
  const measured = measureLotFrontAndDepth(anchorRing, streetRings, frontage.azimuthDeg, blockCentroid);
  const size = resolveLotSizeSpec(spec, measured);
  if (lots.length === 1) {
    return rebuildQuadraLotes(ring, size.testadaM, size.profundidadeM, streetRings, origin, quadraName);
  }

  const depthChanged = Math.abs(size.profundidadeM - measured.profundidadeM) > 0.6;
  const { dirS, dirD } = streetDir(frontage.azimuthDeg);
  const lotC = originOf(anchorRing);
  const side = (lotC[0] - blockCentroid[0]) * dirD[0] + (lotC[1] - blockCentroid[1]) * dirD[1];
  let rows: Position[][];
  if (depthChanged) {
    const cut = cutBlockAtDepthFromSide(ring, frontage.azimuthDeg, origin, size.profundidadeM, side >= 0);
    rows = cut.back.length >= 4 ? [cut.front, cut.back] : [cut.front];
  } else {
    rows = splitThroughBlock(ring, frontage.azimuthDeg, streetRings, origin, size.profundidadeM);
  }

  const assignments = lots.map((lot) => assignLotToRow(dropClosing(lot.coordinates[0] ?? []), rows));
  const anchorRow = assignments[anchorIndex] ?? 0;
  const slices: LotSlice[] = [];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const rowFront =
      rows.length > 1 ? detectRowFrontage(row, streetRings, frontage.azimuthDeg, blockCentroid) : frontage;
    const rowCentroid = rows.length > 1 ? blockCentroid : undefined;
    const members = lots
      .map((lot, i) => ({ lot, i }))
      .filter((m) => assignments[m.i] === r);
    const front = frontEdge(row, rowFront.azimuthDeg, streetRings, rowCentroid);
    const along = front && front.length > 0.5 ? front.length : boundaryFrontageLengths(row, rowFront.azimuthDeg, streetRings).along;

    if (members.length === 0) {
      const split = subdivideQuadraEmLotes(
        row,
        rowFront.azimuthDeg,
        size.testadaM,
        size.testadaM * size.profundidadeM,
        streetRings,
        origin,
        rowCentroid,
        { profundidadeM: size.profundidadeM },
      );
      for (const coords of closeHostWithLots(row, split, origin)) {
        slices.push({ coords, az: rowFront.azimuthDeg, remainder: true });
      }
      continue;
    }

    members.sort((a, b) => {
      const ka = lotAlongKey(dropClosing(a.lot.coordinates[0] ?? []), dirS);
      const kb = lotAlongKey(dropClosing(b.lot.coordinates[0] ?? []), dirS);
      return ka - kb;
    });

    const items = members.map((m) => {
      const dims = measureLotFrontAndDepth(
        dropClosing(m.lot.coordinates[0] ?? []),
        streetRings,
        rowFront.azimuthDeg,
        rowCentroid,
      );
      return { isAnchor: m.i === anchorIndex, prevWidth: Math.max(dims.testadaM, 0.5) };
    });
    const widths =
      r === anchorRow
        ? widthsForRow(items, size.testadaM, along)
        : widthsForRow(
            items.map((it) => ({ ...it, isAnchor: false })),
            items[0]?.prevWidth ?? size.testadaM,
            along,
          );
    const packed = packRowByWidths(row, rowFront.azimuthDeg, widths, streetRings, origin, rowCentroid);
    for (const coords of packed) {
      slices.push({ coords, az: rowFront.azimuthDeg });
    }
  }

  const packed = closeHostWithLots(
    ring,
    slices.map((s) => s.coords),
    origin,
  );
  const byPacked = packed.map((coords, i) => ({
    coords,
    az: slices[Math.min(i, slices.length - 1)]?.az ?? frontage.azimuthDeg,
    remainder: i >= slices.length ? true : slices[i]?.remainder,
  }));
  return slicesToLotes(byPacked, streetRings, rows.length > 1 ? blockCentroid : undefined, quadraName);
}

function ringSignedArea(ring: Position[]): number {
  const pts = dropClosing(ring);
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return sum / 2;
}

const ARC_CHORD_M = 0.4;

function tessellateArc(
  center: Position,
  pStart: Position,
  pEnd: Position,
  radius: number,
  ccw: boolean,
): Position[] {
  const a0 = Math.atan2(pStart[1] - center[1], pStart[0] - center[0]);
  const a1 = Math.atan2(pEnd[1] - center[1], pEnd[0] - center[0]);
  let delta = a1 - a0;
  if (ccw && delta <= 0) delta += 2 * Math.PI;
  if (!ccw && delta >= 0) delta -= 2 * Math.PI;
  const abs = Math.abs(delta);
  const steps = Math.max(3, Math.ceil((radius * abs) / ARC_CHORD_M));
  const pts: Position[] = [];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const a = a0 + delta * t;
    pts.push([center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a)]);
  }
  return pts;
}

/**
 * Filete 2D só em esquinas verdadeiras: vértice cujo lote faz frente a duas vias
 * que se cruzam (ambos os lados adjacentes correm junto à rua).
 * Meio de quadra, fundo entre lotes e linha de fundos ficam em canto vivo.
 */
export function filletClosedRing(ring: Position[], radius: number, streetRings: Position[][]): Position[] {
  const pts = dropClosing(ring);
  if (pts.length < 3 || !(radius > 0)) return closeRing(pts);

  const ccwRing = ringSignedArea(pts) > 0;
  const n = pts.length;
  const out: Position[] = [];

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];

    const len1 = planarLength(prev, curr);
    const len2 = planarLength(curr, next);
    if (len1 < 2 || len2 < 2) {
      out.push(curr);
      continue;
    }

    const alongPrev = edgeAlongStreet(prev, curr, streetRings, 1.2);
    const alongNext = edgeAlongStreet(curr, next, streetRings, 1.2);
    if (!(alongPrev && alongNext)) {
      out.push(curr);
      continue;
    }

    const inx = curr[0] - prev[0];
    const iny = curr[1] - prev[1];
    const outx = next[0] - curr[0];
    const outy = next[1] - curr[1];
    const turn = inx * outy - iny * outx;
    const convex = ccwRing ? turn > ANGLE_EPS : turn < -ANGLE_EPS;
    if (!convex) {
      out.push(curr);
      continue;
    }

    const e1x = (prev[0] - curr[0]) / len1;
    const e1y = (prev[1] - curr[1]) / len1;
    const e2x = (next[0] - curr[0]) / len2;
    const e2y = (next[1] - curr[1]) / len2;
    const cosA = Math.max(-1, Math.min(1, e1x * e2x + e1y * e2y));
    const alpha = Math.acos(cosA);
    if (alpha < 0.5 || alpha > Math.PI - 0.5) {
      out.push(curr);
      continue;
    }

    const dIdeal = radius / Math.tan(alpha / 2);
    const maxD = Math.min(len1, len2) * 0.45;
    const trim = Math.min(dIdeal, maxD);
    const r = trim * Math.tan(alpha / 2);
    if (trim < 0.08 || r < 0.08) {
      out.push(curr);
      continue;
    }

    const p1: Position = [curr[0] + e1x * trim, curr[1] + e1y * trim];
    const p2: Position = [curr[0] + e2x * trim, curr[1] + e2y * trim];
    const bisX = e1x + e2x;
    const bisY = e1y + e2y;
    const bisLen = Math.hypot(bisX, bisY);
    if (bisLen < 1e-9) {
      out.push(curr);
      continue;
    }
    const distCenter = r / Math.sin(alpha / 2);
    const center: Position = [curr[0] + (bisX / bisLen) * distCenter, curr[1] + (bisY / bisLen) * distCenter];

    out.push(p1);
    out.push(...tessellateArc(center, p1, p2, r, ccwRing));
    out.push(p2);
  }

  const cleaned: Position[] = [];
  for (const p of out) {
    const last = cleaned[cleaned.length - 1];
    if (!last || planarLength(last, p) > 1e-5) cleaned.push(p);
  }
  if (cleaned.length >= 2 && planarLength(cleaned[0], cleaned[cleaned.length - 1]) < 1e-5) {
    cleaned.pop();
  }
  return closeRing(cleaned);
}

function absorbFilletIntoVias(
  vias: Position[][][],
  lotsBefore: Position[][][],
  lotsAfter: Position[][][],
  origin: Position,
): Position[][][] {
  try {
    const beforeU = unionPolygons(lotsBefore, origin);
    const afterU = unionPolygons(lotsAfter, origin);
    if (!beforeU || !afterU) return vias;
    const lost = turf.difference(turf.featureCollection([beforeU, afterU]));
    const lostPolys = flattenPoly(lost, origin).filter((p) => {
      const a = planarAreaM2(p[0]);
      return a >= 0.05 && a < 80;
    });
    if (lostPolys.length === 0) return vias;
    const viaArea0 = vias.reduce((s, poly) => s + planarAreaM2(poly[0] ?? []), 0);
    const merged = unionPolygons([...vias, ...lostPolys], origin);
    if (!merged) return vias;
    const next = flattenPoly(merged, origin);
    const viaArea1 = next.reduce((s, poly) => s + planarAreaM2(poly[0] ?? []), 0);
    if (viaArea1 > viaArea0 * 1.2 + 50) return vias;
    return next;
  } catch {
    return vias;
  }
}

/** Calçadas = faixa da via junto aos lotes (buffer do quarteirão ∩ cada corredor). */
function generateCalcadas(
  vias: Position[][][],
  loteRings: Position[][][],
  larguraCalcadaM: number,
  origin: Position,
): Position[][][] {
  if (!(larguraCalcadaM > 0) || vias.length === 0) return [];
  const viaFeats = toTurfPolys(vias, origin);
  if (viaFeats.length === 0) return [];

  const lotFeats = toTurfPolys(loteRings, origin);
  let lotsUnion: Feature<Polygon | MultiPolygon> | null = null;
  if (lotFeats.length === 1) {
    lotsUnion = lotFeats[0];
  } else if (lotFeats.length > 1) {
    try {
      lotsUnion = turf.union(turf.featureCollection(lotFeats));
    } catch {
      lotsUnion = null;
    }
    if (!lotsUnion) {
      lotsUnion = lotFeats[0];
      for (let i = 1; i < lotFeats.length; i++) {
        try {
          const next: Feature<Polygon | MultiPolygon> | null = turf.union(
            turf.featureCollection([lotsUnion, lotFeats[i]]),
          );
          if (next) lotsUnion = next;
        } catch {
          /* mantém acumulado */
        }
      }
    }
  }

  const bandPolys: Feature<Polygon>[] = [];
  if (lotsUnion) {
    try {
      const band = turf.buffer(lotsUnion, larguraCalcadaM, { units: "meters", steps: 16 });
      if (band?.geometry.type === "Polygon") {
        bandPolys.push(band as Feature<Polygon>);
      } else if (band?.geometry.type === "MultiPolygon") {
        for (const coords of band.geometry.coordinates) {
          try {
            bandPolys.push(turf.polygon(coords));
          } catch {
            /* anel inválido */
          }
        }
      }
    } catch {
      /* fallback por lote */
    }
  }

  const strips: Position[][][] = [];
  const addIntersect = (via: Feature<Polygon>, band: Feature<Polygon>, maxAreaM2: number) => {
    try {
      const sw = turf.intersect(turf.featureCollection([via, band]));
      for (const poly of flattenPoly(sw, origin)) {
        const a = planarAreaM2(poly[0]);
        if (a >= SLIVER_M2 && a <= maxAreaM2) strips.push(poly);
      }
    } catch {
      /* sem sobreposição */
    }
  };

  const viaCap = (i: number) => planarAreaM2(vias[i]?.[0] ?? []) * 0.55 + 8;

  if (bandPolys.length > 0) {
    for (let i = 0; i < viaFeats.length; i++) {
      for (const band of bandPolys) addIntersect(viaFeats[i], band, viaCap(i));
    }
  } else {
    for (const lot of lotFeats) {
      try {
        const b = turf.buffer(lot, larguraCalcadaM, { units: "meters", steps: 16 });
        if (b?.geometry.type !== "Polygon") continue;
        for (let i = 0; i < viaFeats.length; i++) addIntersect(viaFeats[i], b as Feature<Polygon>, viaCap(i));
      } catch {
        /* ignore */
      }
    }
  }

  if (strips.length === 0) return [];
  const stripArea = strips.reduce((s, p) => s + planarAreaM2(p[0] ?? []), 0);
  const viaArea = vias.reduce((s, p) => s + planarAreaM2(p[0] ?? []), 0);
  try {
    const merged = unionPolygons(strips, origin);
    if (merged) {
      const flat = flattenPoly(merged, origin).filter((p) => planarAreaM2(p[0]) >= SLIVER_M2);
      const mergedArea = flat.reduce((s, p) => s + planarAreaM2(p[0] ?? []), 0);
      if (flat.length > 0 && mergedArea <= Math.min(stripArea * 1.15 + 20, viaArea + 1)) return flat;
    }
  } catch {
    /* sobreposição degenerada — devolve as faixas */
  }
  return strips;
}

function blockAccessEdges(ring: Position[], streetRings: Position[][]): Position[][] {
  const pts = dropClosing(ring);
  const edges: Position[][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (planarLength(a, b) < 2) continue;
    const mid: Position = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (streetRings.length === 0 || minDistToRings(mid, streetRings) <= 1.6) {
      edges.push([a, b]);
    }
  }
  return edges;
}

export function countLotsInBlock(block: Position[], lots: Position[][][]): number {
  const ring = closeRing(dropClosing(block));
  return lots.filter((lot) => polygonInteriorOverlapM2(ring, lot[0] ?? []) > 1).length;
}

export function calculateRemainingArea(
  block: Position[],
  lots: Position[][][],
  origin?: Position,
): number {
  return validateBlockCoverage(block, lots, [], [], origin).remainingArea;
}

function lotInsideBlock(block: Position[], lot: Position[]): boolean {
  return polygonInteriorOverlapM2(block, lot) > 1;
}

function ringCoversMostOf(ring: Position[], host: Position[]): boolean {
  const hostArea = planarAreaM2(host);
  if (hostArea < 1) return false;
  const ringArea = planarAreaM2(ring);
  const overlap = polygonInteriorOverlapM2(ring, host);
  return overlap > hostArea * 0.85 && ringArea > hostArea * 0.85;
}

function lottingStatusFromCoverage(lots: number, coverage: BlockCoverageReport, blockArea: number, minLotAreaM2: number): {
  status: BlockLottingStatus;
  justification?: string;
} {
  if (lots === 0) {
    if (blockArea + 0.5 < Math.max(REMAINDER_MIN_M2, minLotAreaM2 * 0.75)) {
      return { status: "FAILED", justification: "Área menor que um lote mínimo — impossibilidade geométrica." };
    }
    return { status: "FAILED", justification: "Quadra sem lotes após o motor de geração." };
  }
  if (!coverage.valid) {
    return { status: "PARTIAL", justification: coverage.problems[0] ?? "Área restante acima da tolerância." };
  }
  return { status: "SUCCESS" };
}

export function detectBuildableBlocks(
  quadras: Position[][][],
  existingLots: Position[][][] = [],
  streetRings: Position[][] = [],
  minLotAreaM2 = 80,
): BuildableBlock[] {
  void minLotAreaM2;
  const blocks: BuildableBlock[] = [];
  let i = 0;
  for (const poly of quadras) {
    const outer = poly[0];
    if (!outer || dropClosing(outer).length < 3) continue;
    const area = planarAreaM2(outer);
    if (area < REMAINDER_MIN_M2) continue;
    const existingLotCount = existingLots.filter((lot) => lotInsideBlock(outer, lot[0] ?? [])).length;
    i += 1;
    blocks.push({
      id: `block-${String(i).padStart(3, "0")}`,
      polygon: closeRing(dropClosing(outer)),
      area,
      accessEdges: blockAccessEdges(outer, streetRings),
      status: "PENDING",
      existingLotCount,
    });
  }
  blocks.sort((a, b) => {
    if (Math.abs(b.area - a.area) > 1) return b.area - a.area;
    const emptyA = a.existingLotCount === 0 ? 1 : 0;
    const emptyB = b.existingLotCount === 0 ? 1 : 0;
    if (emptyA !== emptyB) return emptyB - emptyA;
    return b.accessEdges.length - a.accessEdges.length;
  });
  return blocks;
}

export function validateBlockCoverage(
  block: Position[],
  lots: Position[][][],
  streetRings: Position[][] = [],
  excluded: Position[][] = [],
  origin?: Position,
): BlockCoverageReport {
  const ring = closeRing(dropClosing(block));
  const blockArea = planarAreaM2(ring);
  const originHint = origin ?? originOf(ring);
  const lotsArea = lots.reduce((s, lot) => s + planarAreaM2(lot[0] ?? []), 0);
  const roadsArea = streetRings.reduce((s, r) => s + (r.length >= 4 ? planarAreaM2(r) : 0), 0);
  const excludedArea = excluded.reduce((s, r) => s + planarAreaM2(r), 0);
  const holes = leftoverAfterLots(ring, lots, originHint);
  const unusedByArea = Math.max(0, blockArea - lotsArea - excludedArea);
  const remainingArea = Math.min(
    holes.reduce((s, h) => s + planarAreaM2(h), 0),
    unusedByArea,
  );
  const buildable = Math.max(blockArea - excludedArea, 1e-6);
  const coveragePercent = (lotsArea / buildable) * 100;
  const problems: string[] = [];
  if (remainingArea > MAX_REMAINING_AREA_M2 && (remainingArea / buildable) * 100 > MAX_REMAINING_PERCENT) {
    problems.push("Área remanescente acima da tolerância");
  }
  for (const hole of holes) {
    const holeArea = planarAreaM2(hole);
    if (holeArea > unusedByArea * 1.25 + MAX_REMAINING_AREA_M2) continue;
    if (holeArea >= Math.max(MAX_REMAINING_AREA_M2, buildable * (MAX_REMAINING_PERCENT / 100))) {
      problems.push("Buraco interno significativo");
    }
  }
  const valid = problems.length === 0;
  const lotting = lottingStatusFromCoverage(lots.length, {
    blockArea,
    lotsArea,
    roadsArea,
    excludedArea,
    remainingArea,
    coveragePercent,
    valid,
    problems,
    lots: lots.length,
    status: "PENDING",
  }, blockArea, 0);
  return {
    blockArea,
    lotsArea,
    roadsArea,
    excludedArea,
    remainingArea,
    coveragePercent,
    valid,
    problems,
    lots: lots.length,
    status: lotting.status,
  };
}

export function findUnlotedAreas(
  block: Position[],
  lots: Position[][][],
  origin?: Position,
  minAreaM2 = REMAINDER_MIN_M2,
): Position[][] {
  const ring = closeRing(dropClosing(block));
  const lotsArea = lots.reduce((s, lot) => s + planarAreaM2(lot[0] ?? []), 0);
  const unusedByArea = Math.max(0, planarAreaM2(ring) - lotsArea);
  if (unusedByArea < minAreaM2) return [];
  return leftoverAfterLots(ring, lots, origin ?? originOf(ring)).filter((hole) => {
    const area = planarAreaM2(hole);
    return area >= minAreaM2 && area <= unusedByArea * 1.25 + minAreaM2;
  });
}

function lotSizeAttempts(
  testadaM: number,
  profundidadeM: number,
  areaMinimaM2 = 0,
): Array<{
  testadaM: number;
  profundidadeM: number;
  allowShallow?: boolean;
}> {
  const t = Math.max(testadaM, 6);
  const p = Math.max(profundidadeM, 12);
  const floor = (areaMinimaM2 > 0 ? areaMinimaM2 : t * p) * 0.95;
  const raw = [
    { testadaM: t, profundidadeM: p },
    { testadaM: t, profundidadeM: Math.max(22, p * 0.88) },
    { testadaM: 10, profundidadeM: p },
    { testadaM: 10, profundidadeM: 22 },
    { testadaM: 9, profundidadeM: p },
    { testadaM: Math.max(9, t * 0.85), profundidadeM: p },
    { testadaM: t, profundidadeM: Math.max(18, p * 0.72), allowShallow: true },
    { testadaM: Math.max(8, t * 0.75), profundidadeM: Math.max(18, p * 0.72), allowShallow: true },
  ];
  const out: Array<{ testadaM: number; profundidadeM: number; allowShallow?: boolean }> = [];
  for (const item of raw) {
    if (out.some((x) => Math.abs(x.testadaM - item.testadaM) < 0.05 && Math.abs(x.profundidadeM - item.profundidadeM) < 0.05)) {
      continue;
    }
    if (item.testadaM * item.profundidadeM + 0.5 < floor) continue;
    out.push(item);
  }
  return out.length > 0 ? out : [{ testadaM: t, profundidadeM: p }];
}

function candidateOrientations(
  ring: Position[],
  streetRings: Position[][],
  fallbackAz: number,
  rescue = false,
): number[] {
  const out: number[] = [];
  const add = (az: number) => {
    const folded = foldAz180(az);
    if (out.some((prev) => azDelta180(prev, folded) < 6)) return;
    out.push(folded);
  };
  const streetAz = detectBlockFrontage(ring, streetRings, fallbackAz).azimuthDeg;
  add(streetAz);
  add(streetAz + 15);
  add(streetAz - 15);
  add(streetAz + 30);
  add(streetAz - 30);
  add(streetAz + 90);
  add(fallbackAz);
  add(fallbackAz + 90);
  const pts = dropClosing(ring);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (planarLength(a, b) >= 8) add(planarAzimuthDeg(a, b));
  }
  for (let deg = 0; deg < 180; deg += 15) add(deg);
  return out.slice(0, rescue ? 18 : 14);
}

function packBlockOnce(
  ring: Position[],
  azimuthDeg: number,
  testadaM: number,
  profundidadeM: number,
  streetRings: Position[][],
  origin: Position,
  percentualEsquina: number,
  allowShallow: boolean,
  areaMinimaM2 = 0,
): Position[][][] {
  const closedHost = closeRing(dropClosing(ring));
  const centroid = originOf(closedHost);
  const minArea = lotMinAreaM2(testadaM, profundidadeM, areaMinimaM2 > 0 ? areaMinimaM2 : testadaM * profundidadeM);
  const opts = {
    profundidadeM,
    percentualEsquina,
    allowShallow,
    allowIrregular: allowShallow,
  };
  const rows = splitThroughBlock(closedHost, azimuthDeg, streetRings, origin, profundidadeM);
  const slices: Position[][][] = [];
  for (const row of rows) {
    const rowAz =
      rows.length > 1
        ? detectRowFrontage(row, streetRings, azimuthDeg, centroid).azimuthDeg
        : azimuthDeg;
    try {
      const split = subdivideQuadraEmLotes(
        row,
        rowAz,
        testadaM,
        minArea,
        streetRings,
        origin,
        rows.length > 1 ? centroid : undefined,
        opts,
      );
      const closed = split.length > 0 ? closeHostWithLots(row, split, origin) : split;
      slices.push(...(closed.length > 0 ? closed : split));
    } catch {
      /* geometria degenerada nesta fileira */
    }
  }
  const remainders = leftoverAfterLots(closedHost, slices, origin);
  for (const rem of remainders) {
    const absorbed = absorbScrapAsLots(
      rem,
      azimuthDeg,
      testadaM,
      profundidadeM,
      minArea,
      streetRings,
      origin,
      centroid,
      opts,
    );
    slices.push(...absorbed.lots);
  }
  const leftover = leftoverAfterLots(closedHost, slices, origin);
  const filled = complementarLoteamento(leftover, {
    azimuthDeg,
    testadaMinimaM: testadaM,
    profundidadeQuadraM: profundidadeM,
    areaMinimaM2: minArea,
    streetRings,
    origin,
    blockCentroid: centroid,
    percentualEsquina,
  });
  slices.push(...filled.lots);
  const unique: Position[][][] = [];
  for (const lot of slices) {
    const outer = lot[0] ?? [];
    const area = planarAreaM2(outer);
    if (area < SLIVER_M2) continue;
    if (minArea > 0 && area + 0.5 < minArea * 0.95) continue;
    if (unique.some((prev) => polygonInteriorOverlapM2(outer, prev[0] ?? []) > area * 0.6)) continue;
    unique.push(lot.map(closeRing));
  }
  return unique;
}

export function attemptFillRemainingArea(
  hole: Position[],
  testadaM: number,
  profundidadeM: number,
  streetRings: Position[][],
  origin: Position,
  percentualEsquina = 20,
  fallbackAz = 0,
  areaMinimaM2 = 0,
): Position[][][] {
  const ring = closeRing(dropClosing(hole));
  if (dropClosing(ring).length < 3 || planarAreaM2(ring) < REMAINDER_MIN_M2) return [];
  const areaMin = areaMinimaM2 > 0 ? areaMinimaM2 : testadaM * profundidadeM;
  const fromEngine = packQuadraBlock(
    ring,
    testadaM,
    profundidadeM,
    streetRings,
    origin,
    "Quadra",
    percentualEsquina,
    areaMin,
  )
    .map((lote) => lote.coordinates)
    .filter((lot) => areaMin <= 0 || planarAreaM2(lot[0] ?? []) + 0.5 >= areaMin * 0.95);
  let best = fromEngine;
  let bestArea = fromEngine.reduce((s, lot) => s + planarAreaM2(lot[0] ?? []), 0);
  if (bestArea >= planarAreaM2(ring) * 0.9) return best;
  const orientations = candidateOrientations(ring, streetRings, fallbackAz).slice(0, 6);
  for (const size of lotSizeAttempts(testadaM, profundidadeM, areaMin).slice(0, 4)) {
    for (const az of orientations) {
      const packed = packBlockOnce(
        ring,
        az,
        size.testadaM,
        size.profundidadeM,
        streetRings,
        origin,
        percentualEsquina,
        true,
        areaMin,
      );
      const area = packed.reduce((s, lot) => s + planarAreaM2(lot[0] ?? []), 0);
      if (area > bestArea) {
        best = packed;
        bestArea = area;
      }
      if (area >= planarAreaM2(ring) * 0.96) return packed;
    }
  }
  return best;
}

function fillHolesWithLots(
  ring: Position[],
  currentLots: Position[][][],
  testadaM: number,
  profundidadeM: number,
  streetRings: Position[][],
  origin: Position,
  percentualEsquina: number,
  fallbackAz: number,
  areaMin: number,
): Position[][][] {
  const lots = currentLots.map((lot) => lot.map(closeRing));
  const holes = findUnlotedAreas(ring, lots, origin, Math.max(REMAINDER_MIN_M2, Math.min(areaMin * 0.35, 40)));
  for (const hole of holes) {
    const extra = attemptFillRemainingArea(
      hole,
      testadaM,
      profundidadeM,
      streetRings,
      origin,
      percentualEsquina,
      fallbackAz,
      areaMin,
    );
    for (const lot of extra) {
      if (areaMin > 0 && planarAreaM2(lot[0] ?? []) + 0.5 < areaMin * 0.75) continue;
      if (lots.some((prev) => polygonInteriorOverlapM2(lot[0] ?? [], prev[0] ?? []) > 1)) continue;
      lots.push(lot);
    }
  }
  return lots;
}

export function generateLotsFromScratch(
  block: Position[],
  testadaM: number,
  profundidadeM: number,
  streetRings: Position[][],
  origin: Position,
  opts?: {
    percentualEsquina?: number;
    fallbackAzimuth?: number;
    areaMinimaM2?: number;
    rescue?: boolean;
  },
): { lots: Position[][][]; remaining: Position[][]; coverage: BlockCoverageReport } {
  const ring = closeRing(dropClosing(block));
  const percentualEsquina = opts?.percentualEsquina ?? 20;
  const fallbackAz = opts?.fallbackAzimuth ?? detectBlockFrontage(ring, streetRings, getMainAxisAzimuth(ring)).azimuthDeg;
  const areaMin = opts?.areaMinimaM2 ?? lotMinAreaM2(testadaM, profundidadeM);
  const maxArea = lotMaxAllowedAreaM2(testadaM, profundidadeM, areaMin);
  const oneLotFits = planarAreaM2(ring) <= maxArea * 1.08;
  const acceptLot = (lot: Position[][]) => {
    const area = planarAreaM2(lot[0] ?? []);
    if (area < SLIVER_M2) return false;
    if (areaMin > 0 && area + 0.5 < areaMin * 0.75) return false;
    if (Number.isFinite(maxArea) && area > maxArea + 0.5 && !oneLotFits) return false;
    if (!oneLotFits && ringCoversMostOf(lot[0] ?? [], ring)) return false;
    return true;
  };
  const better = (next: BlockCoverageReport, prev: BlockCoverageReport) => {
    if (next.lots !== prev.lots && (next.lots === 0 || prev.lots === 0)) return next.lots > prev.lots;
    if (next.valid !== prev.valid) return next.valid;
    if (Math.abs(next.lotsArea - prev.lotsArea) > 0.5) return next.lotsArea > prev.lotsArea;
    return next.remainingArea < prev.remainingArea;
  };

  let bestLots = packQuadraBlock(
    ring,
    testadaM,
    profundidadeM,
    streetRings,
    origin,
    "Quadra",
    percentualEsquina,
    areaMin,
  )
    .map((lote) => lote.coordinates)
    .filter(acceptLot);
  let bestCov = validateBlockCoverage(ring, bestLots, streetRings, [], origin);

  if (!bestCov.valid || bestLots.length === 0) {
    const orientations = candidateOrientations(ring, streetRings, fallbackAz, Boolean(opts?.rescue));
    const sizes = lotSizeAttempts(testadaM, profundidadeM, areaMin);
    outer: for (const size of sizes) {
      for (const az of orientations) {
        const packed = packBlockOnce(
          ring,
          az,
          size.testadaM,
          size.profundidadeM,
          streetRings,
          origin,
          percentualEsquina,
          Boolean(size.allowShallow) || Boolean(opts?.rescue),
          areaMin,
        );
        const merged = packed.filter(acceptLot);
        const cov = validateBlockCoverage(ring, merged, streetRings, [], origin);
        if (better(cov, bestCov)) {
          bestLots = merged;
          bestCov = cov;
        }
        if (cov.valid && cov.coveragePercent >= 98 && merged.length > 0) break outer;
      }
      if (bestCov.valid && bestLots.length > 0) break;
    }
  }

  bestLots = fillHolesWithLots(
    ring,
    bestLots,
    testadaM,
    profundidadeM,
    streetRings,
    origin,
    percentualEsquina,
    fallbackAz,
    areaMin,
  );
  if (bestLots.length === 0) {
    const absorbed = absorbScrapAsLots(
      ring,
      fallbackAz,
      testadaM,
      profundidadeM,
      areaMin * 0.75,
      streetRings,
      origin,
      originOf(ring),
      { profundidadeM, percentualEsquina, allowShallow: true, allowIrregular: true },
    );
    bestLots = absorbed.lots.filter(acceptLot);
  }

  const remaining = findUnlotedAreas(ring, bestLots, origin);
  return {
    lots: bestLots,
    remaining,
    coverage: validateBlockCoverage(ring, bestLots, streetRings, [], origin),
  };
}

export function generateLotsForBlock(
  block: Position[],
  testadaM: number,
  profundidadeM: number,
  streetRings: Position[][],
  origin: Position,
  opts?: {
    percentualEsquina?: number;
    fallbackAzimuth?: number;
    existingLots?: Position[][][];
    keepExisting?: boolean;
    areaMinimaM2?: number;
    rescue?: boolean;
  },
): { lots: Position[][][]; remaining: Position[][]; coverage: BlockCoverageReport } {
  const ring = closeRing(dropClosing(block));
  const existingInBlock = (opts?.existingLots ?? []).filter((lot) => lotInsideBlock(ring, lot[0] ?? []));
  const areaMin = opts?.areaMinimaM2 ?? lotMinAreaM2(testadaM, profundidadeM);
  const percentualEsquina = opts?.percentualEsquina ?? 20;
  const fallbackAz = opts?.fallbackAzimuth ?? detectBlockFrontage(ring, streetRings, getMainAxisAzimuth(ring)).azimuthDeg;

  if (existingInBlock.length === 0) {
    return generateLotsFromScratch(ring, testadaM, profundidadeM, streetRings, origin, {
      percentualEsquina,
      fallbackAzimuth: fallbackAz,
      areaMinimaM2: areaMin,
      rescue: opts?.rescue,
    });
  }

  let bestLots = fillHolesWithLots(
    ring,
    existingInBlock,
    testadaM,
    profundidadeM,
    streetRings,
    origin,
    percentualEsquina,
    fallbackAz,
    areaMin,
  );
  let bestCov = validateBlockCoverage(ring, bestLots, streetRings, [], origin);

  if (!bestCov.valid) {
    const rebuilt = generateLotsFromScratch(ring, testadaM, profundidadeM, streetRings, origin, {
      percentualEsquina,
      fallbackAzimuth: fallbackAz,
      areaMinimaM2: areaMin,
      rescue: true,
    });
    const rebuiltBetter =
      rebuilt.lots.length > 0 &&
      (bestLots.length === 0 ||
        rebuilt.coverage.lotsArea > bestCov.lotsArea + 0.5 ||
        (rebuilt.coverage.valid && !bestCov.valid));
    if (rebuiltBetter) {
      bestLots = rebuilt.lots;
      bestCov = rebuilt.coverage;
    }
  }

  const remaining = findUnlotedAreas(ring, bestLots, origin);
  return {
    lots: bestLots,
    remaining,
    coverage: validateBlockCoverage(ring, bestLots, streetRings, [], origin),
  };
}

export function formatLoteamentoCoverageNotice(summary: LoteamentoCoverageSummary): string {
  return [
    `QUADRAS: ${summary.blocksDetected}`,
    `PROCESSADAS: ${summary.blocksProcessed}`,
    `COM LOTES: ${summary.blocksWithLots}`,
    `VAZIAS: ${summary.blocksEmpty}`,
    `Lotes gerados: ${summary.lots}`,
    `Área loteada: ${summary.lotsArea.toFixed(0)} m²`,
    `Área restante: ${summary.remainingArea.toFixed(0)} m²`,
    summary.emptyWarning,
  ]
    .filter(Boolean)
    .join("\n");
}

export function logLoteamentoCoverageReport(summary: LoteamentoCoverageSummary): void {
  const lines = [
    "========================================",
    "LOTEAMENTO AUTOMÁTICO",
    "========================================",
    `QUADRAS: ${summary.blocksDetected}`,
    `PROCESSADAS: ${summary.blocksProcessed}`,
    `COM LOTES: ${summary.blocksWithLots}`,
    `VAZIAS: ${summary.blocksEmpty}`,
    `Lotes gerados: ${summary.lots}`,
    `Área loteada: ${summary.lotsArea.toFixed(2)} m²`,
    `Área restante: ${summary.remainingArea.toFixed(2)} m²`,
    `Cobertura: ${summary.coveragePercent.toFixed(1)} %`,
    "========================================",
  ];
  if (summary.emptyWarning) lines.push(summary.emptyWarning);
  for (const block of summary.blocks) {
    lines.push(
      `${block.id}`,
      `Área: ${block.area.toFixed(2)} m²`,
      `Lotes: ${block.lots}`,
      `Área loteada: ${block.lotsArea.toFixed(2)} m²`,
      `Área restante: ${block.remainingArea.toFixed(2)} m²`,
      `Cobertura: ${block.coveragePercent.toFixed(1)} %`,
      `Status: ${block.status}`,
      ...(block.justification ? [`Justificativa: ${block.justification}`] : []),
      "----------------------------------------",
    );
  }
  console.info(lines.join("\n"));
}

function buildCoverageSummary(
  blocks: BuildableBlock[],
  reports: LoteamentoCoverageSummary["blocks"],
  lotes: LoteResult[],
  remainingRings: Position[][],
): LoteamentoCoverageSummary {
  const lotsArea = lotes.reduce((s, lote) => s + lote.area_m2, 0);
  const remainingArea = remainingRings.reduce((s, r) => s + planarAreaM2(r), 0);
  const blockArea = blocks.reduce((s, b) => s + b.area, 0);
  const blocksWithLots = reports.filter((b) => b.lots > 0).length;
  const blocksEmpty = reports.filter((b) => b.lots === 0).length;
  return {
    blocksDetected: blocks.length,
    blocksProcessed: reports.length,
    blocksOk: reports.filter((b) => b.status === "SUCCESS" || b.status === "OK").length,
    blocksRemaining: reports.filter((b) => b.status === "PARTIAL" || b.status === "PENDING" || b.status === "PROCESSING" || b.status === "REPROCESSAR").length,
    blocksWithLots,
    blocksEmpty,
    lots: lotes.length,
    lotsArea,
    remainingArea,
    coveragePercent: blockArea > 0 ? (lotsArea / blockArea) * 100 : 0,
    emptyWarning: blocksEmpty > 0 ? "ATENÇÃO: existem quadras sem lotes." : undefined,
    blocks: reports,
  };
}

export function generateLoteamento(glebaCoords: PolygonCoords, params: LoteamentoParams): LoteamentoResult {
  const {
    larguraViaM,
    profundidadeQuadraM,
    testadaMinimaM,
    orientacao,
    prefixoQuadra = "Quadra",
    viasExistentesExtremidades = false,
    eixosExistentes,
    usarEixosComoRede = false,
    ladosViaExistente,
    ladosFaixaDominio,
  } = params;
  const larguraCalcadaM =
    params.larguraCalcadaM != null && Number.isFinite(params.larguraCalcadaM)
      ? Math.max(0, params.larguraCalcadaM)
      : 0;
  const raioEsquinaM =
    params.raioEsquinaM != null && Number.isFinite(params.raioEsquinaM) ? Math.max(0, params.raioEsquinaM) : 0;
  const eixoRua = params.eixoRua !== false;
  const areaQuadraM2 =
    params.areaMinimaQuadraM2 != null && Number.isFinite(params.areaMinimaQuadraM2)
      ? Math.max(0, params.areaMinimaQuadraM2)
      : 0;
  const larguraQuadraM =
    params.larguraQuadraM != null && Number.isFinite(params.larguraQuadraM)
      ? Math.max(0, params.larguraQuadraM)
      : 0;
  const profundidadeBlocoM =
    params.profundidadeBlocoM != null && Number.isFinite(params.profundidadeBlocoM)
      ? Math.max(0, params.profundidadeBlocoM)
      : 0;
  const splitByMedidas = larguraQuadraM > 0 && profundidadeBlocoM > 0;
  const splitByArea = !splitByMedidas && areaQuadraM2 > 0;
  const allowInternalRoads = params.allowInternalRoads !== false;
  const areaMinimaLoteM2 = lotMinAreaM2(testadaMinimaM, profundidadeQuadraM, params.areaMinimaM2);
  const percentualEsquina =
    params.percentualEsquina != null && Number.isFinite(params.percentualEsquina)
      ? Math.max(0, params.percentualEsquina)
      : 20;
  if (!(larguraViaM > 0) || !(profundidadeQuadraM > 0) || !(testadaMinimaM > 0)) {
    throw new LoteamentoError(
      "Parâmetros incoerentes: largura da via, profundidade do lote e testada mínima devem ser maiores que zero.",
    );
  }
  if (larguraCalcadaM > 0 && larguraCalcadaM * 2 >= larguraViaM - 0.05) {
    throw new LoteamentoError(
      "A calçada deve caber dentro da via: 2 × largura da calçada precisa ser menor que a largura da via (corredor total). A pista = via − 2×calçada.",
    );
  }

  const ring = dropClosing(glebaCoords);
  if (ring.length < 3) {
    throw new LoteamentoError("A gleba precisa ser um polígono fechado com pelo menos 3 vértices.");
  }

  const areaGlebaM2 = planarAreaM2(ring);
  const origin = originOf(ring);
  const azimuthDeg = orientacao != null && Number.isFinite(orientacao) ? orientacao : getMainAxisAzimuth(ring);
  const markedSides = (ladosViaExistente ?? []).filter((edge) => edge.length >= 2);
  const markedDominio = (ladosFaixaDominio ?? []).filter((edge) => edge.length >= 2);
  const existW = resolveExistingViaWidthM(larguraViaM, params.larguraViaExistenteM);
  const faixaW =
    params.larguraFaixaDominioM != null && Number.isFinite(params.larguraFaixaDominioM)
      ? Math.max(0, params.larguraFaixaDominioM)
      : 0;
  const generatedFaixa =
    faixaW > 0 && markedDominio.length > 0 ? generateFaixaDominioFromEdges(ring, markedDominio, faixaW) : [];
  const skipVia: boolean | PerimeterSkip =
    markedSides.length > 0
      ? perimeterSkipFromExistingSides(ring, azimuthDeg, markedSides)
      : viasExistentesExtremidades;
  const skipFaixa: boolean | PerimeterSkip =
    markedDominio.length > 0 ? perimeterSkipFromExistingSides(ring, azimuthDeg, markedDominio) : false;
  const skipPerimeter = orPerimeterSkip(skipVia, skipFaixa);
  const appRings = [
    ...(params.apps ?? []),
    ...generatedFaixa.map((poly) => poly[0] ?? []),
  ]
    .map((r) => closeRing(dropClosing(r)))
    .filter((r) => dropClosing(r).length >= 3 && planarAreaM2(r) >= SLIVER_M2);
  const rlRings = (params.reservaLegal ?? [])
    .map((r) => closeRing(dropClosing(r)))
    .filter((r) => dropClosing(r).length >= 3 && planarAreaM2(r) >= SLIVER_M2);
  const extraReservas = (params.reservas ?? [])
    .map((r) => closeRing(dropClosing(r)))
    .filter((r) => dropClosing(r).length >= 3 && planarAreaM2(r) >= SLIVER_M2);
  const exclusionRings = [...extraReservas, ...appRings, ...rlRings];
  const obstaclePolys: Position[][][] = exclusionRings.map((r) => [r]);
  const percentAreaUtil =
    params.percentAreaUtil != null && Number.isFinite(params.percentAreaUtil)
      ? Math.max(0, Math.min(99.9, params.percentAreaUtil))
      : DEFAULT_PERCENT_AREA_UTIL;
  void percentAreaUtil;
  /**
   * Área útil = gleba − APP − RL: vai para vias e lotes. Não se cria polígono laranja vazio.
   */
  const baseExclusions = appRings.length > 0 || rlRings.length > 0 ? [...appRings, ...rlRings] : extraReservas;
  const remainingUrban = subtractRingsFromHost(ring, baseExclusions, origin);
  const areaUrbanizavelM2 = totalPolysAreaM2(remainingUrban);
  const areaUtilOrcamentoM2 = areaUrbanizavelM2;
  let areaUtilPolys: Position[][][] = [];
  let areaUtilAlvoM2 = areaUtilOrcamentoM2;
  let areaViasM2 = 0;
  const axisNetwork = Boolean(usarEixosComoRede) && (eixosExistentes?.length ?? 0) > 0;
  const existing = bufferExistingStreetAxes(ring, eixosExistentes ?? [], larguraViaM);
  const existingEdges =
    markedSides.length > 0 ? markedSides : viasExistentesExtremidades ? ringEdges(ring) : [];
  const outsideStreets = generateExistingEdgeStreets(ring, existingEdges, existW);
  let vias: Position[][][] = [];
  const eixos: Position[][] = [];
  if (axisNetwork) {
    vias = existing.vias;
    if (eixoRua) eixos.push(...existing.eixos);
    if (vias.length === 0) {
      throw new LoteamentoError(
        "Não foi possível gerar vias a partir dos eixos editados. Verifique se o eixo cruza a gleba.",
      );
    }
  } else {
    const grid =
      splitByArea || splitByMedidas
        ? perimeterStreetsAroundGreen(
            ring,
            rlRings,
            larguraViaM,
            markedSides.length === 0 && viasExistentesExtremidades
              ? ringEdges(ring)
              : [...markedSides, ...markedDominio],
            origin,
          )
        : generateStreetGrid(ring, azimuthDeg, larguraViaM, profundidadeQuadraM, 0, skipPerimeter);
    vias = grid.vias;
    if (eixoRua) eixos.push(...grid.eixos);
    if (existing.vias.length > 0) {
      vias = [...vias, ...existing.vias];
      if (eixoRua) eixos.push(...existing.eixos);
    }
  }
  if (obstaclePolys.length > 0) {
    vias = subtractObstaclesFromPolys(vias, obstaclePolys, origin);
    if (eixoRua) {
      const clipped = clipAxesOutsideObstacles(eixos, obstaclePolys, origin);
      eixos.splice(0, eixos.length, ...clipped);
    }
  }
  let quadrasRings: Position[][][] = [];
  if (!axisNetwork && (splitByArea || splitByMedidas)) {
    const leftover = subtractStreets(ring, [...vias, ...obstaclePolys]);
    const blocks: Position[][][] = [];
    const minBlock = splitByArea ? areaQuadraM2 * TARGET_MIN_CHILD_RATIO : SLIVER_M2;
    for (const inner of leftover) {
      const outer = inner[0];
      if (!outer) continue;
      const split = splitByMedidas
        ? splitParcelByDimensions(
            outer,
            larguraQuadraM,
            profundidadeBlocoM,
            larguraViaM,
            azimuthDeg,
            origin,
            skipPerimeter,
          )
        : splitParcelByTargetArea(outer, areaQuadraM2, larguraViaM, azimuthDeg, origin);
      vias = [...vias, ...split.vias];
      if (eixoRua) eixos.push(...split.eixos);
      for (const q of split.quadras) {
        if (planarAreaM2(q) >= minBlock) blocks.push([closeRing(q)]);
      }
    }
    if (obstaclePolys.length > 0) {
      vias = subtractObstaclesFromPolys(vias, obstaclePolys, origin);
      if (eixoRua) {
        const clipped = clipAxesOutsideObstacles(eixos, obstaclePolys, origin);
        eixos.splice(0, eixos.length, ...clipped);
      }
    }
    quadrasRings = blocks.length > 0 ? blocks : leftover;
  } else {
    quadrasRings = subtractStreets(ring, [...vias, ...obstaclePolys]);
  }
  const knownStreetRings = [
    ...streetOuterRings(vias),
    ...streetOuterRings(outsideStreets.vias),
    ...markedEdgesAsStreetRings(existingEdges),
  ];
  /**
   * Quadra já dimensionada para duas fileiras: rua extra no miolo só fragmentaria.
   * Com rede de eixos, as ruas são as que o usuário manteve: nenhuma rua nova é criada.
   */
  const twoRowBlocks = splitByMedidas && larguraQuadraM <= profundidadeQuadraM * 2 + 2;
  const refined = allowInternalRoads && !twoRowBlocks && !axisNetwork
    ? seedInternalStreetsInBlocks(
        quadrasRings,
        azimuthDeg,
        larguraViaM,
        profundidadeQuadraM,
        origin,
        knownStreetRings,
      )
    : { quadras: quadrasRings, vias: [] as Position[][][], eixos: [] as Position[][] };
  if (refined.vias.length > 0) {
    vias = [...vias, ...refined.vias];
    if (eixoRua) eixos.push(...refined.eixos);
    quadrasRings = refined.quadras;
    if (obstaclePolys.length > 0) {
      vias = subtractObstaclesFromPolys(vias, obstaclePolys, origin);
      if (eixoRua) {
        const clipped = clipAxesOutsideObstacles(eixos, obstaclePolys, origin);
        eixos.splice(0, eixos.length, ...clipped);
      }
      quadrasRings = subtractObstaclesFromPolys(quadrasRings, obstaclePolys, origin);
    }
  }
  if (!axisNetwork && rlRings.length > 0 && !(splitByArea || splitByMedidas)) {
    const anel = greenAreaRingRoads(ring, rlRings, vias, larguraViaM, origin);
    const anelVias = subtractObstaclesFromPolys(anel.vias, obstaclePolys, origin);
    if (anelVias.length > 0) {
      vias = [...vias, ...anelVias];
      if (eixoRua) eixos.push(...clipAxesOutsideObstacles(anel.eixos, obstaclePolys, origin));
      const kept: Position[][][] = [];
      for (const q of subtractObstaclesFromPolys(quadrasRings, anelVias, origin)) {
        if (planarAreaM2(q[0] ?? []) >= areaMinimaLoteM2 * 0.5) kept.push(q);
        else vias.push(q);
      }
      quadrasRings = kept;
    }
  }
  areaViasM2 = unionPolysAreaM2(vias, origin);
  const skipAll =
    markedSides.length === 0 && viasExistentesExtremidades
      ? true
      : markedSides.length > 0 && allPerimeterSkip(resolvePerimeterSkip(skipPerimeter));
  const streetRings = [
    ...streetOuterRings(vias),
    ...streetOuterRings(outsideStreets.vias),
    ...markedEdgesAsStreetRings(existingEdges),
    ...(skipAll ? [closeRing(ring)] : []),
  ];

  if (!quadrasRings.some((q) => planarAreaM2(q[0] ?? []) + 0.5 >= areaMinimaLoteM2 * 0.95)) {
    throw new LoteamentoError("Gleba pequena demais para caber sequer 1 lote com os parâmetros dados.");
  }

  const lotes: LoteResult[] = [];
  const sharpRings: Position[][][] = [];
  let quadraIndex = 0;
  for (const quadra of quadrasRings) {
    const outer = quadra[0];
    if (!outer || planarAreaM2(outer) < SLIVER_M2) continue;
    const qName = quadraLabel(quadraIndex, prefixoQuadra);
    quadraIndex += 1;
    const lotesQuadra = lotearQuadraComoLotes(
      quadra,
      qName,
      testadaMinimaM,
      areaMinimaLoteM2,
      percentualEsquina,
      streetRings,
      azimuthDeg,
      profundidadeQuadraM,
    );
    for (const lote of lotesQuadra) {
      sharpRings.push(lote.coordinates);
      if (raioEsquinaM > 0 && streetRings.length > 0) {
        const filletedOuter = filletClosedRing(lote.coordinates[0] ?? [], raioEsquinaM, streetRings);
        if (planarAreaM2(filletedOuter) >= SLIVER_M2 && dropClosing(filletedOuter).length >= 3) {
          lote.coordinates = [filletedOuter, ...lote.coordinates.slice(1)];
          lote.area_m2 = quadraPolyAreaM2(lote.coordinates);
        }
      }
      lotes.push(lote);
    }
  }

  if (raioEsquinaM > 0) {
    vias = absorbFilletIntoVias(
      vias,
      sharpRings,
      lotes.map((l) => l.coordinates),
      origin,
    );
  }

  const punchObstacles: Position[][][] = [
    ...exclusionRings.map((r) => [r]),
    ...areaUtilPolys,
  ];

  if (punchObstacles.length > 0) {
    vias = subtractObstaclesFromPolys(vias, punchObstacles, origin);
    if (eixoRua) {
      const clipped = clipAxesOutsideObstacles(eixos, punchObstacles, origin);
      eixos.splice(0, eixos.length, ...clipped);
    }
  }

  if (lotes.length === 0) {
    throw new LoteamentoError("Gleba pequena demais para caber sequer 1 lote com os parâmetros dados.");
  }

  const lotSpec: LotValidationSpec = {
    minAreaM2: areaMinimaLoteM2 * 0.95,
    targetAreaM2: lotTargetAreaM2(testadaMinimaM, profundidadeQuadraM, areaMinimaLoteM2),
    minDepthM: profundidadeQuadraM,
    maxDepthM: profundidadeQuadraM,
    minFrontageM: testadaMinimaM,
  };
  const internalStreetCount = countInternalStreetPolys(vias, ring, larguraViaM);
  const report = buildLoteamentoReport(lotes, [], streetRings, azimuthDeg, lotSpec, { internalStreetCount });
  const blocksFinal = detectBuildableBlocks(quadrasRings, sharpRings, streetRings, areaMinimaLoteM2);
  const coverageSummary = buildCoverageSummary(
    blocksFinal,
    blocksFinal.map((block) => {
      const inside = sharpRings.filter((lot) => lotInsideBlock(block.polygon, lot[0] ?? []));
      const cov = validateBlockCoverage(block.polygon, inside, streetRings, [], origin);
      const lotting = lottingStatusFromCoverage(inside.length, cov, block.area, areaMinimaLoteM2);
      return {
        id: block.id,
        area: block.area,
        lots: inside.length,
        lotsArea: cov.lotsArea,
        remainingArea: cov.remainingArea,
        coveragePercent: cov.coveragePercent,
        status: lotting.status,
        justification: lotting.justification,
      };
    }),
    lotes,
    [],
  );

  logLoteamentoCoverageReport(coverageSummary);

  const calcadas = generateCalcadas(
    vias,
    lotes.map((l) => l.coordinates),
    larguraCalcadaM,
    origin,
  );
  const calcadasOut =
    punchObstacles.length > 0 ? subtractObstaclesFromPolys(calcadas, punchObstacles, origin) : calcadas;

  const areaRuasFinalM2 = unionPolysAreaM2(vias, origin);
  if (outsideStreets.vias.length > 0) {
    vias = [...vias, ...outsideStreets.vias];
    if (eixoRua) eixos.push(...outsideStreets.eixos);
  }
  const viasClosed = vias.map((poly) => poly.map(closeRing));
  const areaUtilClosed = areaUtilPolys.map((poly) => poly.map(closeRing));
  return {
    vias: viasClosed,
    lotes,
    calcadas: calcadasOut.map((poly) => poly.map(closeRing)),
    eixos,
    quadraPolys: quadrasRings.map((poly) => poly.map(closeRing)),
    quadras: Math.max(quadraIndex, quadrasRings.length),
    areaGlebaM2,
    areaUtil: areaUtilClosed,
    areaUtilAlvoM2: areaUtilOrcamentoM2,
    areaUtilOrcamentoM2,
    areaUtilM2: totalPolysAreaM2(areaUtilClosed),
    areaViasM2: areaRuasFinalM2,
    areaUrbanizavelM2,
    faixaDominio: generatedFaixa.map((poly) => poly.map(closeRing)),
    remanescente: [],
    report,
    coverage: coverageSummary,
  };
}

/** Alias estável para testes e para a IA (`generateSubdivision`). */
export function generateSubdivision(glebaCoords: PolygonCoords, params: LoteamentoParams): LoteamentoResult {
  return generateLoteamento(glebaCoords, params);
}

export function polygonAreaPlanarM2(coords: PolygonCoords): number {
  return planarAreaM2(coords);
}

export type ReservaAreaLado = "frente" | "fundo" | "esquerda" | "direita";

export type ReservaCanto =
  | "superior_direita"
  | "superior_esquerda"
  | "inferior_direita"
  | "inferior_esquerda";

const RESERVA_CANTO_ALIASES: Record<string, ReservaCanto> = {
  superior_direita: "superior_direita",
  superiordireita: "superior_direita",
  nordeste: "superior_direita",
  ne: "superior_direita",
  upper_right: "superior_direita",
  superior_esquerda: "superior_esquerda",
  superioresquerda: "superior_esquerda",
  noroeste: "superior_esquerda",
  no: "superior_esquerda",
  nw: "superior_esquerda",
  upper_left: "superior_esquerda",
  inferior_direita: "inferior_direita",
  inferiordireita: "inferior_direita",
  sudeste: "inferior_direita",
  se: "inferior_direita",
  lower_right: "inferior_direita",
  inferior_esquerda: "inferior_esquerda",
  inferioresquerda: "inferior_esquerda",
  sudoeste: "inferior_esquerda",
  so: "inferior_esquerda",
  sw: "inferior_esquerda",
  lower_left: "inferior_esquerda",
};

export function parseReservaCanto(raw: string | undefined | null): ReservaCanto | null {
  if (!raw) return null;
  const key = raw.toLowerCase().trim().replace(/[\s-]+/g, "_");
  return RESERVA_CANTO_ALIASES[key] ?? null;
}

function pointInRing(x: number, y: number, ring: Position[]): boolean {
  const pts = dropClosing(ring);
  if (pts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const yi = pts[i][1];
    const xj = pts[j][0];
    const yj = pts[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Translada o anel (dx, dy) sem sair do polígono hospedeiro, se possível.
 * Se o anel já estiver fora, aplica a translação pedida.
 */
export function translateRingInsideHost(
  ring: Position[],
  host: Position[],
  dx: number,
  dy: number,
): Position[] {
  const pts = dropClosing(ring);
  const hostPts = dropClosing(host);
  if (pts.length < 3) return pts.map((p) => [p[0] + dx, p[1] + dy] as Position);
  const fits = (tx: number, ty: number) => pts.every((p) => pointInRing(p[0] + tx, p[1] + ty, hostPts));
  if (fits(dx, dy) || hostPts.length < 3) {
    return pts.map((p) => [p[0] + dx, p[1] + dy] as Position);
  }
  if (!fits(0, 0)) {
    return pts.map((p) => [p[0] + dx, p[1] + dy] as Position);
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (fits(dx * mid, dy * mid)) lo = mid;
    else hi = mid;
  }
  return pts.map((p) => [p[0] + dx * lo, p[1] + dy * lo] as Position);
}

function closestPointOnSegment(p: Position, a: Position, b: Position): Position {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-18) return [a[0], a[1]];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
  return [a[0] + t * vx, a[1] + t * vy];
}

/** Projeta o ponto para dentro (ou no limite) do polígono hospedeiro. */
export function clampPointInsideHost(p: Position, host: Position[]): Position {
  const hostPts = dropClosing(host);
  if (hostPts.length < 3 || pointInRing(p[0], p[1], hostPts)) return p;
  let best: Position = hostPts[0] ?? p;
  let bestD = Infinity;
  for (let i = 0; i < hostPts.length; i++) {
    const q = closestPointOnSegment(p, hostPts[i], hostPts[(i + 1) % hostPts.length]);
    const d = planarLength(p, q);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

function pickObbCorner(
  canto: ReservaCanto,
  bounds: { sMin: number; sMax: number; dMin: number; dMax: number },
  origin: Position,
  dirS: Position,
  dirD: Position,
): { s: number; d: number; inwardS: number; inwardD: number } {
  const world = (s: number, d: number): Position => [
    origin[0] + s * dirS[0] + d * dirD[0],
    origin[1] + s * dirS[1] + d * dirD[1],
  ];
  const candidates = [
    { s: bounds.sMin, d: bounds.dMin, inwardS: 1, inwardD: 1 },
    { s: bounds.sMax, d: bounds.dMin, inwardS: -1, inwardD: 1 },
    { s: bounds.sMin, d: bounds.dMax, inwardS: 1, inwardD: -1 },
    { s: bounds.sMax, d: bounds.dMax, inwardS: -1, inwardD: -1 },
  ].map((c) => {
    const p = world(c.s, c.d);
    return { ...c, x: p[0], y: p[1] };
  });
  const score = (p: { x: number; y: number }) => {
    if (canto === "superior_direita") return p.x + p.y;
    if (canto === "superior_esquerda") return -p.x + p.y;
    if (canto === "inferior_direita") return p.x - p.y;
    return -p.x - p.y;
  };
  return candidates.reduce((best, c) => (score(c) > score(best) ? c : best));
}

/**
 * Quadrado de área alvo no canto da gleba (superior/inferior × esquerda/direita).
 * Prefere um quadrado verdadeiro inteiramente interno; recorta só se inevitável.
 */
export function reservarRetanguloNoCanto(
  quadraCoords: PolygonCoords,
  canto: ReservaCanto,
  alvoM2: number,
): { reserved: Position[]; reservedM2: number } {
  const ring = dropClosing(quadraCoords);
  if (ring.length < 3 || !(alvoM2 > 0)) {
    throw new LoteamentoError("Informe um polígono e uma área alvo válidos para a área verde.");
  }
  const total = planarAreaM2(ring);
  const minKeep = Math.min(SLIVER_M2, Math.max(total * 1e-6, Number.EPSILON));
  if (alvoM2 >= total - minKeep) {
    throw new LoteamentoError("A área reservada não pode ser maior ou igual à gleba.");
  }

  const origin = originOf(ring);
  const gleba = asTurfPolygon(ring, origin);
  const azimuth = getMainAxisAzimuth(ring);
  const { dirS, dirD } = streetDir(azimuth);
  const b = projectRingBounds(ring, origin, dirS, dirD);
  const spanS = b.sMax - b.sMin;
  const spanD = b.dMax - b.dMin;
  if (!(spanS > 0) || !(spanD > 0)) {
    throw new LoteamentoError("A gleba é pequena demais para posicionar a área verde.");
  }

  const corner = pickObbCorner(canto, b, origin, dirS, dirD);
  const targetSide = Math.sqrt(alvoM2);
  const maxSide = Math.min(spanS, spanD);

  const squareRing = (side: number): Position[] => {
    const s1 = corner.s + corner.inwardS * side;
    const d1 = corner.d + corner.inwardD * side;
    return stripRing(
      origin,
      dirS,
      dirD,
      Math.min(corner.s, s1),
      Math.max(corner.s, s1),
      Math.min(corner.d, d1),
      Math.max(corner.d, d1),
    );
  };

  const fullyInside = (side: number): Position[] | null => {
    if (!(side > 0.5) || side > maxSide + 1e-6) return null;
    const sq = squareRing(side);
    const pts = dropClosing(sq);
    const allIn = pts.every((p) =>
      turf.booleanPointInPolygon(turf.point(toGeo(p, origin)), gleba, { ignoreBoundary: false }),
    );
    if (!allIn) return null;
    try {
      const feat = asTurfPolygon(sq, origin);
      const hit = turf.intersect(turf.featureCollection([gleba, feat]));
      const area = flattenPoly(hit, origin).reduce((s, p) => s + planarAreaM2(p[0] ?? []), 0);
      if (area < side * side * 0.97) return null;
    } catch {
      return null;
    }
    return pts;
  };

  const want = Math.min(targetSide, maxSide);
  let best: Position[] | null = fullyInside(want);
  if (!best) {
    let lo = 0.5;
    let hi = want;
    for (let i = 0; i < 36; i++) {
      const mid = (lo + hi) / 2;
      const hit = fullyInside(mid);
      if (hit) {
        best = hit;
        lo = mid;
      } else {
        hi = mid;
      }
    }
  }

  if (best && planarAreaM2(best) >= alvoM2 * 0.72) {
    return { reserved: best, reservedM2: planarAreaM2(best) };
  }

  try {
    const sq = squareRing(want);
    const polys = flattenPoly(turf.intersect(turf.featureCollection([gleba, asTurfPolygon(sq, origin)])), origin);
    const reservedRing = polys[0]?.[0];
    if (reservedRing && planarAreaM2(reservedRing) >= minKeep) {
      return { reserved: dropClosing(reservedRing), reservedM2: planarAreaM2(reservedRing) };
    }
  } catch {
    /* cai no erro abaixo */
  }

  throw new LoteamentoError("Não foi possível posicionar a área verde nesse canto da gleba.");
}

function pickReservaEdge(ring: Position[], lado: ReservaAreaLado): { a: Position; b: Position } {
  const pts = dropClosing(ring);
  const edges = pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    return { a, b, len: planarLength(a, b), mid: midpoint(a, b), i };
  });
  const longest = edges.reduce((best, e) => (e.len > best.len ? e : best), edges[0]);
  if (!longest) return { a: pts[0], b: pts[1] ?? pts[0] };
  if (lado === "frente") return longest;

  const frontUx = (longest.b[0] - longest.a[0]) / longest.len;
  const frontUy = (longest.b[1] - longest.a[1]) / longest.len;
  let nx = -frontUy;
  let ny = frontUx;
  const c = originOf(pts);
  if ((c[0] - longest.mid[0]) * nx + (c[1] - longest.mid[1]) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }

  if (lado === "fundo") {
    let best = longest;
    let bestD = -Infinity;
    for (const e of edges) {
      if (e.i === longest.i) continue;
      const d = (e.mid[0] - longest.mid[0]) * nx + (e.mid[1] - longest.mid[1]) * ny;
      if (d > bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  let best = longest;
  let bestScore = -Infinity;
  for (const e of edges) {
    if (e.i === longest.i) continue;
    const vx = e.mid[0] - longest.mid[0];
    const vy = e.mid[1] - longest.mid[1];
    const cross = frontUx * vy - frontUy * vx;
    const score = lado === "esquerda" ? cross : -cross;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

/** Corta uma faixa da gleba com área alvo a partir de um lado (frente/fundo/esquerda/direita). */
export function reservarFaixaDeArea(
  quadraCoords: PolygonCoords,
  lado: ReservaAreaLado,
  alvoM2: number,
): { reserved: Position[]; remainder: Position[]; reservedM2: number; remainderM2: number } {
  const ring = dropClosing(quadraCoords);
  if (ring.length < 3 || !(alvoM2 > 0)) {
    throw new LoteamentoError("Informe um polígono e uma área alvo válidos para reservar a faixa.");
  }
  const total = planarAreaM2(ring);
  if (alvoM2 >= total - SLIVER_M2) {
    throw new LoteamentoError("A área reservada não pode ser maior ou igual à gleba.");
  }

  const origin = originOf(ring);
  const gleba = asTurfPolygon(ring, origin);
  const edge = pickReservaEdge(ring, lado);
  const len = planarLength(edge.a, edge.b);
  if (len < 0.5) {
    throw new LoteamentoError("O lado escolhido é curto demais para reservar uma faixa.");
  }

  const ux = (edge.b[0] - edge.a[0]) / len;
  const uy = (edge.b[1] - edge.a[1]) / len;
  let px = -uy;
  let py = ux;
  const mid: Position = [(edge.a[0] + edge.b[0]) / 2, (edge.a[1] + edge.b[1]) / 2];
  if ((origin[0] - mid[0]) * px + (origin[1] - mid[1]) * py < 0) {
    px = -px;
    py = -py;
  }

  let maxDepth = 0;
  for (const p of ring) {
    const d = (p[0] - edge.a[0]) * px + (p[1] - edge.a[1]) * py;
    if (d > maxDepth) maxDepth = d;
  }
  let depth = alvoM2 / len;
  if (depth > maxDepth * 0.95) depth = maxDepth * 0.95;
  if (depth < 0.3) {
    throw new LoteamentoError("A faixa reservada ficou pequena demais para o percentual informado.");
  }

  const extra = Math.max(2, len * 0.02);
  const a: Position = [edge.a[0] - ux * extra, edge.a[1] - uy * extra];
  const b: Position = [edge.b[0] + ux * extra, edge.b[1] + uy * extra];
  const c: Position = [b[0] + px * depth, b[1] + py * depth];
  const d: Position = [a[0] + px * depth, a[1] + py * depth];

  let reservedPolys: Position[][][];
  try {
    const strip = asTurfPolygon([a, b, c, d], origin);
    reservedPolys = flattenPoly(turf.intersect(turf.featureCollection([gleba, strip])), origin);
  } catch {
    throw new LoteamentoError("Não foi possível recortar a faixa reservada nesse lado.");
  }
  const reservedRing = reservedPolys[0]?.[0];
  if (!reservedRing || planarAreaM2(reservedRing) < SLIVER_M2) {
    throw new LoteamentoError("Não foi possível recortar a faixa reservada nesse lado.");
  }

  let remainderPolys: Position[][][];
  try {
    const reservedFeat = asTurfPolygon(reservedRing, origin);
    remainderPolys = flattenPoly(turf.difference(turf.featureCollection([gleba, reservedFeat])), origin);
  } catch {
    throw new LoteamentoError("A reserva consumiu a gleba inteira. Reduza o percentual.");
  }
  const remainderRing = remainderPolys[0]?.[0];
  if (!remainderRing || planarAreaM2(remainderRing) < SLIVER_M2) {
    throw new LoteamentoError("A reserva consumiu a gleba inteira. Reduza o percentual.");
  }

  return {
    reserved: dropClosing(reservedRing),
    remainder: dropClosing(remainderRing),
    reservedM2: planarAreaM2(reservedRing),
    remainderM2: planarAreaM2(remainderRing),
  };
}
