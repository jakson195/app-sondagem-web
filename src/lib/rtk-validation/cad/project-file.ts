import { normalizeCadLayers } from "./layer-styles";
import type {
  CadAdjustmentMeta,
  CadEntity,
  CadLayer,
  CadLineEntity,
  CadPointEntity,
  CadPolylineEntity,
  CadProject,
  CadRasterOverlay,
  CadVertex,
} from "./types";

export const CAD_PROJECT_FILE_KIND = "datageo-cad-project";
export const CAD_PROJECT_FILE_VERSION = 1;
/** Dedicated JSON keys when the `dwg` bytea column is missing (fallback only). */
export const CAD_DWG_EMBED_KEY = "_dwgBase64";
export const CAD_DWG_NAME_KEY = "_dwgFilename";
const RASTER_DATA_URL_RE = /data:image\/(png|jpe?g|tiff?|webp|gif|bmp)/i;

export interface CadProjectSnapshot {
  project: CadProject;
  rasters: CadRasterOverlay[];
}

export interface CadProjectFileV1 {
  version: typeof CAD_PROJECT_FILE_VERSION;
  kind: typeof CAD_PROJECT_FILE_KIND;
  savedAt: string;
  project: CadProject;
  rasters?: CadRasterOverlay[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseVertex(raw: unknown): CadVertex | null {
  if (!isRecord(raw)) return null;
  const x = finiteNumber(raw.x, Number.NaN);
  const y = finiteNumber(raw.y, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, z: finiteNumber(raw.z, 0) };
}

function parseLayer(raw: unknown): CadLayer | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || !raw.id || typeof raw.name !== "string") return null;
  const layer = raw as unknown as CadLayer;
  return {
    ...layer,
    id: raw.id,
    name: raw.name,
    color: typeof raw.color === "string" && raw.color ? raw.color : "#fbbf24",
    visible: raw.visible !== false,
    locked: Boolean(raw.locked),
  };
}

function parseEntity(raw: unknown): CadEntity | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || !raw.id || typeof raw.layerId !== "string") return null;

  if (raw.type === "point") {
    const x = finiteNumber(raw.x, Number.NaN);
    const y = finiteNumber(raw.y, Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const entity = raw as unknown as CadPointEntity;
    return { ...entity, type: "point", id: raw.id, layerId: raw.layerId, x, y, z: finiteNumber(raw.z, 0) };
  }

  if (raw.type === "line") {
    const start = parseVertex(raw.start);
    const end = parseVertex(raw.end);
    if (!start || !end) return null;
    const entity = raw as unknown as CadLineEntity;
    return { ...entity, type: "line", id: raw.id, layerId: raw.layerId, start, end };
  }

  if (raw.type === "polyline") {
    if (!Array.isArray(raw.vertices)) return null;
    const vertices = raw.vertices.map(parseVertex).filter((v): v is CadVertex => v !== null);
    if (vertices.length < 1) return null;
    const entity = raw as unknown as CadPolylineEntity;
    return {
      ...entity,
      type: "polyline",
      id: raw.id,
      layerId: raw.layerId,
      vertices,
      closed: Boolean(raw.closed),
    };
  }

  return null;
}

function parseAdjustment(raw: unknown): CadAdjustmentMeta | undefined {
  if (!isRecord(raw)) return undefined;
  if (typeof raw.method !== "string") return undefined;
  return {
    method: raw.method,
    rmsBefore: finiteNumber(raw.rmsBefore, 0),
    rmsAfter: finiteNumber(raw.rmsAfter, 0),
    importedAt: typeof raw.importedAt === "string" ? raw.importedAt : new Date().toISOString(),
  };
}

function parseRaster(raw: unknown): CadRasterOverlay | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (raw.kind !== "orthophoto" && raw.kind !== "hypsometric") return null;
  const minX = finiteNumber(raw.minX, Number.NaN);
  const minY = finiteNumber(raw.minY, Number.NaN);
  const maxX = finiteNumber(raw.maxX, Number.NaN);
  const maxY = finiteNumber(raw.maxY, Number.NaN);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return {
    id: raw.id,
    name: typeof raw.name === "string" && raw.name ? raw.name : raw.id,
    kind: raw.kind,
    imageDataUrl: typeof raw.imageDataUrl === "string" ? raw.imageDataUrl : "",
    minX,
    minY,
    maxX,
    maxY,
    opacity: Number.isFinite(Number(raw.opacity)) ? Number(raw.opacity) : 1,
    visible: raw.visible !== false,
    zMin: raw.zMin == null ? undefined : finiteNumber(raw.zMin),
    zMax: raw.zMax == null ? undefined : finiteNumber(raw.zMax),
  };
}

function parseRasters(raw: unknown): CadRasterOverlay[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseRaster).filter((r): r is CadRasterOverlay => r !== null);
}

function defaultDrawLayer(): CadLayer {
  return { id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false };
}

export function splitStoredCadData(data: unknown, fallbackName = "Projeto CAD"): CadProjectSnapshot {
  if (!isRecord(data)) {
    return {
      project: { name: fallbackName, crs: "EPSG:4674", layers: [defaultDrawLayer()], entities: [] },
      rasters: [],
    };
  }

  const rasters = parseRasters(data.rasters);
  const layersRaw = Array.isArray(data.layers) ? data.layers.map(parseLayer).filter((l): l is CadLayer => l !== null) : [];
  const entities = Array.isArray(data.entities)
    ? data.entities.map(parseEntity).filter((e): e is CadEntity => e !== null)
    : [];

  const project: CadProject = {
    name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : fallbackName,
    crs: typeof data.crs === "string" && data.crs.trim() ? data.crs : "EPSG:4674",
    layers: normalizeCadLayers(layersRaw.length > 0 ? layersRaw : [defaultDrawLayer()]),
    entities,
  };
  const adjustment = parseAdjustment(data.adjustment);
  if (adjustment) project.adjustment = adjustment;

  return { project, rasters };
}

export function parseCadProjectFile(raw: unknown): CadProjectSnapshot {
  if (!isRecord(raw)) {
    throw new Error("Arquivo de projeto inválido.");
  }

  if (typeof raw.version === "number" && raw.kind === CAD_PROJECT_FILE_KIND && raw.version !== CAD_PROJECT_FILE_VERSION) {
    throw new Error("Versão de projeto não suportada.");
  }

  if (raw.kind === CAD_PROJECT_FILE_KIND || raw.version === CAD_PROJECT_FILE_VERSION) {
    if (!isRecord(raw.project)) {
      throw new Error("Arquivo de projeto inválido.");
    }
    const snap = splitStoredCadData(raw.project, "Projeto CAD");
    const rasters = parseRasters(raw.rasters);
    return { project: snap.project, rasters: rasters.length > 0 ? rasters : snap.rasters };
  }

  if (isRecord(raw.project)) {
    const inner = raw.project;
    if (isRecord(inner.project) || inner.kind === CAD_PROJECT_FILE_KIND) {
      return parseCadProjectFile(inner);
    }
    const snap = splitStoredCadData(inner, typeof raw.name === "string" ? raw.name : "Projeto CAD");
    const rasters = parseRasters(raw.rasters);
    return { project: snap.project, rasters: rasters.length > 0 ? rasters : snap.rasters };
  }

  if (Array.isArray(raw.entities) && Array.isArray(raw.layers)) {
    return splitStoredCadData(raw, "Projeto CAD");
  }

  throw new Error("Arquivo de projeto inválido ou versão não suportada.");
}

export function parseCadProjectFileText(text: string): CadProjectSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error("O arquivo não é um JSON válido.");
  }
  return parseCadProjectFile(raw);
}

export function serializeCadProjectFile(snapshot: CadProjectSnapshot, savedAt = new Date().toISOString()): string {
  const file: CadProjectFileV1 = {
    version: CAD_PROJECT_FILE_VERSION,
    kind: CAD_PROJECT_FILE_KIND,
    savedAt,
    project: snapshot.project,
    rasters: snapshot.rasters,
  };
  return JSON.stringify(file);
}

export function cadProjectFileBasename(name: string): string {
  const base = name.replace(/[^\w\-]+/g, "_").slice(0, 80) || "projeto_cad";
  return `${base}.cad.json`;
}

export function stripRasterImageData(rasters: CadRasterOverlay[]): CadRasterOverlay[] {
  return rasters.map((r) => ({ ...r, imageDataUrl: "" }));
}

/** Vector-only clone. Cloud must never receive GeoTIFF/JPEG/PNG bytes. */
export function toCloudCadProject(project: CadProject): CadProject {
  const stored: CadProject = {
    name: project.name,
    crs: project.crs,
    layers: project.layers,
    entities: project.entities,
  };
  if (project.adjustment) stored.adjustment = project.adjustment;
  return stored;
}

export function sanitizeCloudCadWriteData(raw: unknown, name: string): CadProject {
  const snap = splitStoredCadData(raw, name);
  return toCloudCadProject({ ...snap.project, name: snap.project.name || name });
}

export function cloudPayloadHasRasterBytes(payload: unknown): boolean {
  try {
    return RASTER_DATA_URL_RE.test(JSON.stringify(payload));
  } catch {
    return false;
  }
}

export function extractEmbeddedDwgBase64(data: unknown): { base64: string; filename: string | null } | null {
  if (!isRecord(data)) return null;
  const base64 = data[CAD_DWG_EMBED_KEY];
  if (typeof base64 !== "string" || !base64.trim()) return null;
  const filename = data[CAD_DWG_NAME_KEY];
  return {
    base64,
    filename: typeof filename === "string" && filename.trim() ? filename.trim() : null,
  };
}

export function storedRecordHasDwg(data: unknown, dwgBytes?: Uint8Array | null): boolean {
  if (dwgBytes && dwgBytes.length > 0) return true;
  if (extractEmbeddedDwgBase64(data)) return true;
  return isRecord(data) && data.hasDwg === true;
}

/**
 * Cloud payload: drawing metadata only. Rasters are always omitted
 * (TIFF/JPEG/PNG orthophotos stay on the computer).
 */
export function prepareCloudCadPayload(
  project: CadProject,
  _rasters: CadRasterOverlay[] = [],
): { stored: CadProject; rastersOmitted: boolean } {
  void _rasters;
  const stored = toCloudCadProject(project);
  return { stored, rastersOmitted: true };
}

export function buildCloudSaveBody(
  name: string,
  project: CadProject,
  dwgBase64: string,
  dwgFilename: string,
): { name: string; project: CadProject; dwgBase64: string; dwgFilename: string } {
  return {
    name,
    project: toCloudCadProject({ ...project, name }),
    dwgBase64,
    dwgFilename,
  };
}

export function snapshotFromSavedRecord(record: {
  name: string;
  project: CadProject;
  rasters?: CadRasterOverlay[];
}): CadProjectSnapshot {
  const nested = splitStoredCadData(record.project, record.name);
  return {
    project: nested.project,
    rasters: record.rasters && record.rasters.length > 0 ? record.rasters : nested.rasters,
  };
}

export function toCadApiRecord(
  row: {
    id: string;
    name: string;
    data: unknown;
    createdAt: Date;
    updatedAt: Date;
    dwg?: Uint8Array | null;
  },
  mode: "full" | "summary" = "full",
) {
  const snap = splitStoredCadData(row.data, row.name);
  const hasDwg = storedRecordHasDwg(row.data, row.dwg);
  return {
    id: row.id,
    name: row.name,
    savedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    entityCount: snap.project.entities.length,
    hasDwg,
    project:
      mode === "summary"
        ? { name: row.name, crs: snap.project.crs, layers: [] as CadLayer[], entities: [] as CadEntity[] }
        : { ...snap.project, name: row.name },
    rasters: mode === "summary" ? [] : snap.rasters,
  };
}
