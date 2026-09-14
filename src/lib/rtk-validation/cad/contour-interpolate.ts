import {
  CONTOUR_LAYER,
  generateContoursFromGrid,
  generateContoursFromPoints,
  parseContourElevation,
  type ContourGenerationOptions,
  type ContourGenerationResult,
  type ElevationSample,
} from "./contour";
import { buildTinTriangles, interpolateTinZ } from "./earthwork";
import type { CadEntity, CadLayer, CadPointEntity, CadPolylineEntity, CadProject } from "./types";

export const INTERPOLATED_CONTOUR_LAYER: CadLayer = {
  id: "contours_interpolated",
  name: "CURVAS_INTERPOLADAS",
  color: "#c2410c",
  visible: true,
  locked: true,
};

export const CONTOUR_INTERPOLATE_NEED_Z =
  "As curvas importadas não têm cota Z. Atribua a cota nas propriedades, use textos de cota próximos ou informe pontos com elevação.";

export const CONTOUR_INTERPOLATE_NEED_CURVES =
  "Selecione polilinhas de curva de nível (com Z) ou deixe visível a camada de curvas importadas.";

export type ContourInterpolateMethod = "tin" | "idw" | "linear";

export type ContourZSource = "vertex" | "name" | "text" | "points" | "assigned";

export type ContourElevationSource = {
  polyline: CadPolylineEntity;
  z: number | null;
  zSource: ContourZSource | null;
};

const CONTOUR_NAME_RE = /curva|contour|n[ií]vel|isolinha|\bcn\b|curvas/i;
const SKIP_SOURCE_LAYER_IDS = new Set([
  INTERPOLATED_CONTOUR_LAYER.id,
  "tin",
  "text",
  "rtk_points",
  "ctrl_known",
  "ctrl_obs",
  "residuals",
  "orthophoto",
  "hypsometric",
  "cutfill",
  "loteamento_lotes",
  "loteamento_vias",
  "loteamento_calcadas",
  "loteamento_eixos",
  "loteamento_quadras",
  "loteamento_pontos",
  "loteamento_tabelas",
  "loteamento_encontros",
  "loteamento_perfil",
  "loteamento_greide",
  "loteamento_secao",
  "drenagem_pv",
  "drenagem_bocas",
  "drenagem_tubos",
  "drenagem_contrib",
  "drenagem_emissario",
  "area_reserva_legal",
  "area_app",
  "area_util",
  "profile",
  "profile_transversal",
  "locacao",
]);

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function isInterpolatedContourLayer(layerId: string): boolean {
  return layerId === INTERPOLATED_CONTOUR_LAYER.id;
}

export function isGeneratedOrImportedContourLayer(layerId: string, layerName?: string): boolean {
  if (layerId === CONTOUR_LAYER.id || layerId === INTERPOLATED_CONTOUR_LAYER.id) return true;
  return Boolean(layerName && CONTOUR_NAME_RE.test(layerName));
}

export function parseElevationText(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const matches = [...String(raw).matchAll(/(-?\d+(?:[.,]\d+)?)\s*m\b/gi)];
  if (matches.length === 0) {
    const bare = String(raw).match(/^\s*(-?\d+(?:[.,]\d+)?)\s*$/);
    if (bare) {
      const n = Number(bare[1]!.replace(",", "."));
      return Number.isFinite(n) && n > -200 && n < 9000 ? n : null;
    }
    const named = String(raw).match(/(?:cn|cota|z|elev(?:a[cç][aã]o)?)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i);
    if (named) {
      const n = Number(named[1]!.replace(",", "."));
      return Number.isFinite(n) && n > -200 && n < 9000 ? n : null;
    }
    return parseContourElevation({
      id: "tmp",
      type: "polyline",
      layerId: "contours",
      vertices: [],
      name: raw,
    });
  }
  const n = Number(matches[0]![1]!.replace(",", "."));
  return Number.isFinite(n) && n > -200 && n < 9000 ? n : null;
}

function polylineLength(vertices: { x: number; y: number }[]): number {
  let len = 0;
  for (let i = 1; i < vertices.length; i++) {
    len += Math.hypot(vertices[i]!.x - vertices[i - 1]!.x, vertices[i]!.y - vertices[i - 1]!.y);
  }
  return len;
}

function polylineCentroid(vertices: { x: number; y: number }[]): { x: number; y: number } {
  if (vertices.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const v of vertices) {
    x += v.x;
    y += v.y;
  }
  return { x: x / vertices.length, y: y / vertices.length };
}

function minDistToPolyline(x: number, y: number, vertices: { x: number; y: number }[]): number {
  if (vertices.length === 0) return Infinity;
  let best = Infinity;
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i]!;
    const b = vertices[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t)));
  }
  for (const v of vertices) {
    best = Math.min(best, Math.hypot(x - v.x, y - v.y));
  }
  return best;
}

function vertexElevation(poly: CadPolylineEntity): { z: number | null; mixed: boolean } {
  const zs = poly.vertices.map((v) => v.z).filter((z) => Number.isFinite(z));
  if (zs.length === 0) return { z: null, mixed: false };
  const min = Math.min(...zs);
  const max = Math.max(...zs);
  if (max - min > 0.05) return { z: null, mixed: true };
  const z = zs[0]!;
  if (Math.abs(z) < 1e-6) return { z: null, mixed: false };
  return { z, mixed: false };
}

function nearestTextElevation(
  poly: CadPolylineEntity,
  texts: CadPointEntity[],
): number | null {
  if (texts.length === 0) return null;
  const search = Math.max(5, Math.min(40, polylineLength(poly.vertices) * 0.08 || 15));
  let best: { d: number; z: number } | null = null;
  for (const p of texts) {
    const z = parseElevationText(p.label) ?? (Number.isFinite(p.z) && Math.abs(p.z) > 1e-6 ? p.z : null);
    if (z == null) continue;
    const d = minDistToPolyline(p.x, p.y, poly.vertices);
    if (d > search) continue;
    if (!best || d < best.d) best = { d, z };
  }
  return best?.z ?? null;
}

function nearestPointElevation(poly: CadPolylineEntity, samples: ElevationSample[]): number | null {
  if (samples.length === 0) return null;
  const c = polylineCentroid(poly.vertices);
  let best: { d: number; z: number } | null = null;
  for (const p of samples) {
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (!best || d < best.d) best = { d, z: p.z };
  }
  return best?.z ?? null;
}

export function isContourLikePolyline(
  entity: CadPolylineEntity,
  layers: CadLayer[],
  selectedId?: string | null,
): boolean {
  if (entity.vertices.length < 2) return false;
  if (SKIP_SOURCE_LAYER_IDS.has(entity.layerId) && entity.layerId !== CONTOUR_LAYER.id) {
    return false;
  }
  if (entity.layerId === CONTOUR_LAYER.id) return true;
  const layer = layers.find((l) => l.id === entity.layerId);
  if (isGeneratedOrImportedContourLayer(entity.layerId, layer?.name)) return true;
  if (entity.contourMajor != null) return true;
  if (parseElevationText(entity.name) != null) return true;
  if (selectedId && entity.id === selectedId) return true;
  const vz = vertexElevation(entity);
  return vz.z != null || vz.mixed;
}

export function resolveContourPolylineZ(
  poly: CadPolylineEntity,
  texts: CadPointEntity[],
  pointSamples: ElevationSample[],
  assignedZ?: number | null,
  usePointElevations = true,
): { z: number | null; zSource: ContourZSource | null; mixed: boolean } {
  const vz = vertexElevation(poly);
  if (vz.mixed) return { z: null, zSource: "vertex", mixed: true };
  if (vz.z != null) return { z: vz.z, zSource: "vertex", mixed: false };

  const fromName = parseElevationText(poly.name);
  if (fromName != null) return { z: fromName, zSource: "name", mixed: false };

  const fromText = nearestTextElevation(poly, texts);
  if (fromText != null) return { z: fromText, zSource: "text", mixed: false };

  if (usePointElevations) {
    const fromPts = nearestPointElevation(poly, pointSamples);
    if (fromPts != null) return { z: fromPts, zSource: "points", mixed: false };
  }

  if (assignedZ != null && Number.isFinite(assignedZ)) {
    return { z: assignedZ, zSource: "assigned", mixed: false };
  }

  return { z: null, zSource: null, mixed: false };
}

export function samplePolylineElevations(
  poly: CadPolylineEntity,
  z: number | null,
  spacingM: number,
): ElevationSample[] {
  const verts = poly.vertices;
  if (verts.length < 2) return [];
  const samples: ElevationSample[] = [];
  const push = (x: number, y: number, elev: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(elev)) return;
    samples.push({ x, y, z: elev });
  };

  const elevAt = (v: { x: number; y: number; z: number }) => {
    if (z != null) return z;
    return Number.isFinite(v.z) ? v.z : NaN;
  };

  for (const v of verts) push(v.x, v.y, elevAt(v));

  const spacing = Math.max(0.5, spacingM);
  for (let i = 0; i < verts.length - 1; i++) {
    const a = verts[i]!;
    const b = verts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < spacing) continue;
    const steps = Math.floor(len / spacing);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      push(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, elevAt(a) + (elevAt(b) - elevAt(a)) * t);
    }
  }

  return samples;
}

function collectTextPoints(entities: CadEntity[]): CadPointEntity[] {
  return entities.filter((e): e is CadPointEntity => e.type === "point" && Boolean(e.label));
}

function collectPointSamples(entities: CadEntity[]): ElevationSample[] {
  return entities
    .filter((e): e is CadPointEntity => e.type === "point")
    .map((p) => ({ x: p.x, y: p.y, z: p.z }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && Math.abs(p.z) > 1e-9);
}

export function listContourSourcePolylines(
  project: CadProject,
  selectedId?: string | null,
): CadPolylineEntity[] {
  const polys = project.entities.filter((e): e is CadPolylineEntity => e.type === "polyline");
  const selected = selectedId ? polys.find((p) => p.id === selectedId) : undefined;
  const selectedIsContour =
    selected && isContourLikePolyline(selected, project.layers, selectedId);

  if (selectedIsContour) {
    const sameLayer = polys.filter(
      (p) =>
        p.layerId === selected.layerId &&
        p.vertices.length >= 2 &&
        !SKIP_SOURCE_LAYER_IDS.has(p.layerId),
    );
    const extras = polys.filter(
      (p) => p.layerId === CONTOUR_LAYER.id || p.id === selected.id,
    );
    const byId = new Map<string, CadPolylineEntity>();
    for (const p of [...sameLayer, ...extras]) byId.set(p.id, p);
    return [...byId.values()];
  }

  return polys.filter((p) => isContourLikePolyline(p, project.layers, selectedId));
}

export function extractImportedContourTerrain(
  project: CadProject,
  options?: {
    selectedId?: string | null;
    assignedZ?: number | null;
    usePointElevations?: boolean;
    spacingM?: number;
  },
): {
  sources: ContourElevationSource[];
  samples: ElevationSample[];
  missingZ: CadPolylineEntity[];
  usedPolylines: CadPolylineEntity[];
} {
  const polys = listContourSourcePolylines(project, options?.selectedId);
  const texts = collectTextPoints(project.entities);
  const pointSamples = collectPointSamples(project.entities);
  const usePts = options?.usePointElevations !== false;
  const spacing = options?.spacingM ?? 8;

  const sources: ContourElevationSource[] = [];
  const samples: ElevationSample[] = [];
  const missingZ: CadPolylineEntity[] = [];
  const usedPolylines: CadPolylineEntity[] = [];

  for (const poly of polys) {
    const resolved = resolveContourPolylineZ(poly, texts, pointSamples, options?.assignedZ, usePts);
    sources.push({ polyline: poly, z: resolved.z, zSource: resolved.zSource });
    const zs = resolved.mixed
      ? samplePolylineElevations(poly, null, spacing)
      : resolved.z != null
        ? samplePolylineElevations(poly, resolved.z, spacing)
        : [];
    if (zs.length === 0) {
      missingZ.push(poly);
      continue;
    }
    usedPolylines.push(poly);
    samples.push(...zs);
  }

  return { sources, samples, missingZ, usedPolylines };
}

function nearestOnPolyline(
  x: number,
  y: number,
  vertices: { x: number; y: number; z: number }[],
): { x: number; y: number } {
  let best: { x: number; y: number } = vertices[0] ?? { x, y };
  let bestD = Infinity;
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i]!;
    const b = vertices[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < bestD) {
      bestD = d;
      best = { x: px, y: py };
    }
  }
  return best;
}

/** Interpolação linear entre pares de polilinhas com Z distinto. */
export function linearIntermediatePolylines(
  sources: Array<{ vertices: { x: number; y: number; z: number }[]; z: number }>,
  targetZ: number,
): Array<{ vertices: { x: number; y: number; z: number }[]; z: number }> {
  const groups = new Map<number, typeof sources>();
  for (const src of sources) {
    const key = Number(src.z.toFixed(4));
    const list = groups.get(key) ?? [];
    list.push(src);
    groups.set(key, list);
  }
  const levels = [...groups.keys()].sort((a, b) => a - b);
  const out: Array<{ vertices: { x: number; y: number; z: number }[]; z: number }> = [];

  for (let i = 0; i < levels.length - 1; i++) {
    const z0 = levels[i]!;
    const z1 = levels[i + 1]!;
    if (!(z0 < targetZ && targetZ < z1)) continue;
    const t = (targetZ - z0) / (z1 - z0);
    const lows = groups.get(z0) ?? [];
    const highs = groups.get(z1) ?? [];
    for (const low of lows) {
      let pair = highs[0];
      let pairD = Infinity;
      const lc = polylineCentroid(low.vertices);
      for (const high of highs) {
        const hc = polylineCentroid(high.vertices);
        const d = Math.hypot(hc.x - lc.x, hc.y - lc.y);
        if (d < pairD) {
          pairD = d;
          pair = high;
        }
      }
      if (!pair) continue;
      const verts = low.vertices.map((v) => {
        const q = nearestOnPolyline(v.x, v.y, pair.vertices);
        return {
          x: v.x + (q.x - v.x) * t,
          y: v.y + (q.y - v.y) * t,
          z: targetZ,
        };
      });
      if (verts.length >= 2) out.push({ vertices: verts, z: targetZ });
    }
  }
  return out;
}

function generateFromTinGrid(
  samples: ElevationSample[],
  interval: number,
  options: ContourGenerationOptions,
): ContourGenerationResult {
  const triangles = buildTinTriangles(samples);
  const padding = options.paddingRatio ?? 0.06;
  const cols = Math.min(Math.max(options.gridCols ?? 80, 40), 160);
  const rows = Math.min(Math.max(options.gridRows ?? 80, 40), 160);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const p of samples) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    zMin = Math.min(zMin, p.z);
    zMax = Math.max(zMax, p.z);
  }
  const padX = (maxX - minX) * padding || interval;
  const padY = (maxY - minY) * padding || interval;
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  const values = new Float64Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = minX + (i / (cols - 1)) * spanX;
      const y = minY + (j / (rows - 1)) * spanY;
      values[i + j * cols] = interpolateTinZ(triangles, x, y, samples);
    }
  }

  return generateContoursFromGrid(values, cols, rows, minX, maxX, minY, maxY, interval, {
    majorInterval: options.majorInterval,
    zMin,
    zMax,
    pointCount: samples.length,
    gridSmoothPasses: options.gridSmoothPasses,
    lineSmoothIterations: options.lineSmoothIterations,
  });
}

function stampInterpolatedLayer(result: ContourGenerationResult): ContourGenerationResult {
  return {
    ...result,
    polylines: result.polylines.map((p) => ({
      ...p,
      id: newId("cni"),
      layerId: INTERPOLATED_CONTOUR_LAYER.id,
    })),
  };
}

export type InterpolateContoursOptions = ContourGenerationOptions & {
  method?: ContourInterpolateMethod;
  selectedId?: string | null;
  assignedZ?: number | null;
  usePointElevations?: boolean;
  spacingM?: number;
};

export function generateInterpolatedContours(
  project: CadProject,
  options: InterpolateContoursOptions,
): ContourGenerationResult & { sampleCount: number; sourceCount: number } {
  const interval = options.interval;
  if (!Number.isFinite(interval) || interval <= 0) {
    throw new Error("Intervalo das novas curvas deve ser maior que zero.");
  }

  const extracted = extractImportedContourTerrain(project, {
    selectedId: options.selectedId,
    assignedZ: options.assignedZ,
    usePointElevations: options.usePointElevations,
    spacingM: options.spacingM,
  });

  if (extracted.usedPolylines.length === 0) {
    if (extracted.sources.length === 0) throw new Error(CONTOUR_INTERPOLATE_NEED_CURVES);
    throw new Error(CONTOUR_INTERPOLATE_NEED_Z);
  }
  if (extracted.samples.length < 3) {
    throw new Error(CONTOUR_INTERPOLATE_NEED_Z);
  }

  const method = options.method ?? "tin";
  const contourOpts: ContourGenerationOptions = {
    interval,
    majorInterval: options.majorInterval,
    gridCols: options.gridCols,
    gridRows: options.gridRows,
    idwPower: options.idwPower,
    paddingRatio: options.paddingRatio,
    maxSearchRadius: options.maxSearchRadius,
    gridSmoothPasses: options.gridSmoothPasses ?? 0,
    lineSmoothIterations: options.lineSmoothIterations ?? 1,
  };

  let result: ContourGenerationResult;
  if (method === "idw") {
    result = generateContoursFromPoints(extracted.samples, contourOpts);
  } else if (method === "linear") {
    const zMin = Math.min(...extracted.samples.map((s) => s.z));
    const zMax = Math.max(...extracted.samples.map((s) => s.z));
    const start = Math.ceil(zMin / interval) * interval;
    const end = Math.floor(zMax / interval) * interval;
    const levels: number[] = [];
    for (let z = start; z <= end + 1e-9; z += interval) {
      levels.push(Number(z.toFixed(6)));
    }
    const grouped = extracted.usedPolylines
      .map((poly, i) => {
        const src = extracted.sources.find((s) => s.polyline.id === poly.id);
        return {
          vertices: poly.vertices,
          z: src?.z ?? extracted.samples[i]?.z ?? 0,
        };
      })
      .filter((g) => Number.isFinite(g.z));
    const polylines: CadPolylineEntity[] = [];
    for (const level of levels) {
      const mids = linearIntermediatePolylines(grouped, level);
      for (const mid of mids) {
        polylines.push({
          id: newId("cni"),
          type: "polyline",
          layerId: INTERPOLATED_CONTOUR_LAYER.id,
          vertices: mid.vertices,
          closed: false,
          name: `CN ${level.toFixed(2)} m`,
          contourMajor: Math.abs(level / interval - Math.round(level / interval)) < 1e-6 && Math.round(level / interval) % 5 === 0,
        });
      }
    }
    if (polylines.length === 0) {
      result = generateFromTinGrid(extracted.samples, interval, contourOpts);
    } else {
      result = {
        polylines,
        zMin,
        zMax,
        levels,
        pointCount: extracted.samples.length,
      };
    }
  } else {
    try {
      result = generateFromTinGrid(extracted.samples, interval, contourOpts);
    } catch {
      result = generateContoursFromPoints(extracted.samples, contourOpts);
    }
  }

  const stamped = stampInterpolatedLayer(result);
  return {
    ...stamped,
    sampleCount: extracted.samples.length,
    sourceCount: extracted.usedPolylines.length,
  };
}

export function removeInterpolatedContourEntities(entities: CadEntity[]): CadEntity[] {
  return entities.filter((e) => e.layerId !== INTERPOLATED_CONTOUR_LAYER.id);
}

export function extractTerrainSamplesIncludingContours(
  project: CadProject,
  selectedId?: string | null,
): ElevationSample[] {
  const fromContours = extractImportedContourTerrain(project, {
    selectedId,
    usePointElevations: true,
  }).samples;
  if (fromContours.length >= 3) return fromContours;
  const points = collectPointSamples(project.entities);
  return points;
}
