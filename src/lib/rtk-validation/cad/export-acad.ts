import "server-only";

import {
  ACadVersion,
  CadDocument,
  DwgWriter,
  DxfWriter,
  Layer,
  Line,
  LwPolyline,
  Point,
  Polyline3D,
  TextEntity,
  XY,
  XYZ,
} from "@node-projects/acad-ts";
import { CONTOUR_LAYER } from "./contour";
import type { CadEntity, CadProject, CadVertex } from "./types";

function sanitizeLayerName(name: string): string {
  const cleaned = name.replace(/[^\w\- .]/g, "_").trim();
  return cleaned.slice(0, 255) || "0";
}

function ensureLayer(doc: CadDocument, name: string): Layer {
  const table = doc.layers;
  if (!table) throw new Error("Documento CAD sem tabela de camadas.");
  const existing = [...table].find((l) => l.name === name);
  if (existing) return existing;
  const layer = new Layer(name);
  table.add(layer);
  return layer;
}

function modelSpace(doc: CadDocument) {
  const ms = doc.modelSpace;
  if (!ms) throw new Error("Model space indisponível.");
  return ms;
}

function uniformElevation(vertices: CadVertex[]): number | null {
  if (vertices.length === 0) return null;
  const z = vertices[0].z;
  return vertices.every((v) => Math.abs(v.z - z) < 1e-6) ? z : null;
}

function addPolyline(doc: CadDocument, layer: Layer, entity: Extract<CadEntity, { type: "polyline" }>) {
  const ms = modelSpace(doc);
  const elev = uniformElevation(entity.vertices);
  if (elev !== null) {
    const lw = new LwPolyline(entity.vertices.map((v) => new XY(v.x, v.y)));
    lw.isClosed = Boolean(entity.closed);
    lw.elevation = elev;
    lw.layer = layer;
    ms.entities.add(lw);
    return;
  }

  const poly3d = new Polyline3D(entity.vertices.map((v) => new XYZ(v.x, v.y, v.z)));
  poly3d.isClosed = Boolean(entity.closed);
  poly3d.layer = layer;
  ms.entities.add(poly3d);
}

function addPointLabel(doc: CadDocument, layer: Layer, x: number, y: number, z: number, label: string) {
  const text = new TextEntity();
  text.value = label;
  text.insertPoint = new XYZ(x + 0.8, y + 0.8, z);
  text.height = 2.5;
  text.layer = layer;
  modelSpace(doc).entities.add(text);
}

export function cadProjectToAcadDocument(project: CadProject): CadDocument {
  const doc = new CadDocument(ACadVersion.AC1021, true);

  for (const layerDef of project.layers) {
    ensureLayer(doc, sanitizeLayerName(layerDef.name));
  }

  for (const entity of project.entities) {
    const layerName = sanitizeLayerName(
      project.layers.find((l) => l.id === entity.layerId)?.name ?? "0",
    );
    const layer = ensureLayer(doc, layerName);
    const ms = modelSpace(doc);

    if (entity.type === "point") {
      const pt = new Point(new XYZ(entity.x, entity.y, entity.z));
      pt.layer = layer;
      ms.entities.add(pt);
      if (entity.label) {
        addPointLabel(doc, layer, entity.x, entity.y, entity.z, entity.label);
      }
      continue;
    }

    if (entity.type === "line") {
      const line = new Line(new XYZ(entity.start.x, entity.start.y, entity.start.z), new XYZ(entity.end.x, entity.end.y, entity.end.z));
      line.layer = layer;
      ms.entities.add(line);
      continue;
    }

    if (entity.type === "polyline") {
      addPolyline(doc, layer, entity);
      if (entity.name && entity.layerId !== CONTOUR_LAYER.id && entity.vertices.length > 0) {
        const v0 = entity.vertices[0];
        addPointLabel(doc, layer, v0.x, v0.y, v0.z, entity.name);
      }
    }
  }

  return doc;
}

export function writeAcadDocumentDxfBytes(doc: CadDocument): Uint8Array {
  const count = modelSpace(doc).entities.count;
  const buffer = new Uint8Array(Math.max(256 * 1024, count * 4096 + 65536));
  DxfWriter.writeToStream(buffer, doc, false);
  let end = buffer.length;
  while (end > 0 && buffer[end - 1] === 0) end -= 1;
  return buffer.subarray(0, end);
}

export function writeAcadDocumentDwgBytes(doc: CadDocument): Uint8Array {
  const count = modelSpace(doc).entities.count;
  const buffer = new Uint8Array(Math.max(512 * 1024, count * 8192 + 131072));
  const writer = new DwgWriter(buffer, doc);
  writer.write();
  return buffer.subarray(0, writer.bytesWritten);
}

export function exportCadProjectDxfBytes(project: CadProject): Uint8Array {
  return writeAcadDocumentDxfBytes(cadProjectToAcadDocument(project));
}

export function exportCadProjectDwgBytes(project: CadProject): Uint8Array {
  return writeAcadDocumentDwgBytes(cadProjectToAcadDocument(project));
}

export function exportCadProjectDxf(project: CadProject): string {
  const bytes = exportCadProjectDxfBytes(project);
  return new TextDecoder("utf-8").decode(bytes);
}
