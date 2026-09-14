import "server-only";

import {
  Arc,
  Circle,
  DwgReader,
  DxfReader,
  Line,
  LwPolyline,
  MText,
  Point,
  Polyline2D,
  Polyline3D,
  TextEntity,
  type CadDocument,
  type Entity,
} from "@node-projects/acad-ts";
import {
  bytesLookLikeAsciiDxf,
  bytesLookLikeBinaryDxf,
  bytesLookLikeBinaryDwg,
  circleToPolylineVertices,
  decodeDxfText,
  parseAsciiDxf,
} from "./import-dxf";
import { dxfAciToHex, rgbToHex, DWG_CONVERT_HINT_PT, type ImportedCadDrawing, type ImportedCadGeom, type ImportedCadLayer } from "./import-drawing-types";

function layerNameOf(entity: Entity): string {
  try {
    return entity.layer?.name?.trim() || "0";
  } catch {
    return "0";
  }
}

function colorHexOf(entity: Entity, fallback = "#fbbf24"): string {
  try {
    const rgb = entity.color?.getRgb?.();
    if (Array.isArray(rgb) && rgb.length >= 3) {
      return rgbToHex(Number(rgb[0]), Number(rgb[1]), Number(rgb[2]));
    }
    const index = entity.color?.index;
    if (typeof index === "number") return dxfAciToHex(index);
  } catch {
    /* bylayer */
  }
  return fallback;
}

function layerColor(layer: { color?: { getRgb?: () => number[]; index?: number } } | undefined): string {
  try {
    const rgb = layer?.color?.getRgb?.();
    if (Array.isArray(rgb) && rgb.length >= 3) {
      return rgbToHex(Number(rgb[0]), Number(rgb[1]), Number(rgb[2]));
    }
    if (typeof layer?.color?.index === "number") return dxfAciToHex(layer.color.index);
  } catch {
    /* ignore */
  }
  return "#fbbf24";
}

function xyz(v: { x?: number; y?: number; z?: number } | null | undefined) {
  const x = Number(v?.x);
  const y = Number(v?.y);
  const z = Number(v?.z);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    z: Number.isFinite(z) ? z : 0,
  };
}

function addLayer(layers: ImportedCadLayer[], name: string, color: string) {
  const key = name.trim().toUpperCase() || "0";
  if (layers.some((l) => l.name.trim().toUpperCase() === key)) return;
  layers.push({ name: name.trim() || "0", color });
}

function fromEntity(entity: Entity, layers: ImportedCadLayer[]): ImportedCadGeom | null {
  const layer = layerNameOf(entity);
  addLayer(layers, layer, colorHexOf(entity, layerColor(entity.layer)));

  if (entity instanceof Line) {
    return { kind: "line", layer, start: xyz(entity.startPoint), end: xyz(entity.endPoint) };
  }

  if (entity instanceof Arc) {
    return arcToPolyline(entity, layer);
  }

  if (entity instanceof Circle) {
    const c = xyz(entity.center);
    const r = Number(entity.radius);
    if (!(r > 0)) return null;
    return {
      kind: "polyline",
      layer,
      closed: true,
      vertices: circleToPolylineVertices(c.x, c.y, c.z, r),
    };
  }

  if (entity instanceof LwPolyline) {
    const pts =
      entity.getPoints?.(16)?.map((p) => xyz(p)) ??
      entity.vertices.map((v) => xyz({ x: v.location.x, y: v.location.y, z: entity.elevation }));
    if (pts.length < 2) return null;
    return { kind: "polyline", layer, vertices: pts, closed: Boolean(entity.isClosed) };
  }

  if (entity instanceof Polyline2D || entity instanceof Polyline3D) {
    const pts = entity.getPoints?.(8)?.map((p) => xyz(p)) ?? [];
    if (pts.length < 2) return null;
    return { kind: "polyline", layer, vertices: pts, closed: Boolean(entity.isClosed) };
  }

  if (entity instanceof Point) {
    const p = xyz(entity.location);
    return { kind: "point", layer, x: p.x, y: p.y, z: p.z };
  }

  if (entity instanceof TextEntity) {
    const p = xyz(entity.insertPoint);
    const label = String(entity.value ?? "").trim();
    return { kind: "point", layer, x: p.x, y: p.y, z: p.z, label: label || undefined };
  }

  if (entity instanceof MText) {
    const p = xyz(entity.insertPoint);
    const label = String(entity.plainText ?? entity.value ?? "").trim();
    return { kind: "point", layer, x: p.x, y: p.y, z: p.z, label: label || undefined };
  }

  return null;
}

function arcToPolyline(
  entity: { center: { x: number; y: number; z: number }; radius: number; startAngle: number; endAngle: number },
  layer: string,
): ImportedCadGeom | null {
  const r = Number(entity.radius);
  if (!(r > 0)) return null;
  let a0 = Number(entity.startAngle);
  let a1 = Number(entity.endAngle);
  if (!Number.isFinite(a0) || !Number.isFinite(a1)) return null;
  if (a1 <= a0) a1 += Math.PI * 2;
  const sweep = a1 - a0;
  const n = Math.max(8, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * 32));
  const c = xyz(entity.center);
  const vertices = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + (sweep * i) / n;
    vertices.push({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t), z: c.z });
  }
  return { kind: "polyline", layer, vertices, closed: false };
}

export function cadDocumentToImportedDrawing(doc: CadDocument, source: "dxf" | "dwg"): ImportedCadDrawing {
  const layers: ImportedCadLayer[] = [];
  const geoms: ImportedCadGeom[] = [];
  const warnings: string[] = [];

  try {
    if (doc.layers) {
      for (const layer of doc.layers) {
        addLayer(layers, layer.name || "0", layerColor(layer));
      }
    }
  } catch {
    warnings.push("Tabela de camadas incompleta.");
  }

  const entities = doc.modelSpace?.entities ?? doc.entities;
  if (!entities) {
    return { geoms: [], layers, warnings: ["Documento CAD sem model space."], source };
  }

  for (const entity of entities) {
    if (geoms.length >= 20_000) {
      warnings.push("Limite de 20000 entidades atingido.");
      break;
    }
    const geom = fromEntity(entity, layers);
    if (geom) geoms.push(geom);
  }

  if (geoms.length === 0) {
    warnings.push("Nenhuma entidade suportada no DWG/DXF (LINE, POLYLINE, CIRCLE, POINT, TEXT).");
  }

  return { geoms, layers, warnings, source };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function parseCadBytesWithAcadTs(bytes: Uint8Array, filename: string): ImportedCadDrawing {
  const lower = filename.toLowerCase();

  if (bytesLookLikeAsciiDxf(bytes) && !bytesLookLikeBinaryDxf(bytes)) {
    return parseAsciiDxf(decodeDxfText(bytes));
  }

  try {
    if (bytesLookLikeBinaryDxf(bytes) || (lower.endsWith(".dxf") && !bytesLookLikeBinaryDwg(bytes))) {
      const doc = DxfReader.readFromStream(bytes);
      return cadDocumentToImportedDrawing(doc, "dxf");
    }
    if (bytesLookLikeBinaryDwg(bytes) || lower.endsWith(".dwg")) {
      const doc = DwgReader.readFromStream(toArrayBuffer(bytes));
      return cadDocumentToImportedDrawing(doc, "dwg");
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : "";
    throw new Error(detail ? `${DWG_CONVERT_HINT_PT} (${detail})` : DWG_CONVERT_HINT_PT);
  }

  throw new Error(DWG_CONVERT_HINT_PT);
}
