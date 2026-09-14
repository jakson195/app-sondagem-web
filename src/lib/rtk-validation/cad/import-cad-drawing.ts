import { createUserLayer } from "./layer-styles";
import { applyDetectedZoneToProject } from "./utm-zone";
import type { CadEntity, CadLayer, CadProject } from "./types";
import {
  DWG_CONVERT_HINT_PT,
  layerIdFromName,
  newImportEntityId,
  type ImportedCadDrawing,
  type ImportedCadGeom,
} from "./import-drawing-types";
import {
  bytesLookLikeAsciiDxf,
  bytesLookLikeBinaryDxf,
  bytesLookLikeBinaryDwg,
  decodeDxfText,
  parseAsciiDxf,
} from "./import-dxf";
import { parseKmlToCadGeoms, resolveKmlImportGeoref } from "./import-kml-kmz";
import { parseKmzBuffer } from "./kml-io";

export type CadDrawingImportOutcome = {
  project: CadProject;
  importedEntities: CadEntity[];
  count: number;
  enableSatellite: boolean;
  warnings: string[];
  error?: string;
  source?: ImportedCadDrawing["source"];
};

function geomToEntity(geom: ImportedCadGeom, layerId: string): CadEntity | null {
  if (geom.kind === "point") {
    return {
      id: newImportEntityId("pt"),
      type: "point",
      layerId,
      x: geom.x,
      y: geom.y,
      z: geom.z,
      label: geom.label,
    };
  }
  if (geom.kind === "line") {
    return {
      id: newImportEntityId("ln"),
      type: "line",
      layerId,
      start: geom.start,
      end: geom.end,
    };
  }
  if (geom.vertices.length < 2) return null;
  return {
    id: newImportEntityId("pl"),
    type: "polyline",
    layerId,
    vertices: geom.vertices,
    closed: Boolean(geom.closed),
    name: geom.name,
  };
}

export function mergeImportedDrawing(project: CadProject, drawing: ImportedCadDrawing): {
  project: CadProject;
  entities: CadEntity[];
} {
  const layers: CadLayer[] = [...project.layers];
  const idByName = new Map(layers.map((l) => [l.name.trim().toUpperCase(), l.id]));

  const resolveLayerId = (name: string, color: string): string => {
    const key = name.trim().toUpperCase() || "0";
    const existing = idByName.get(key);
    if (existing) return existing;
    const layer = createUserLayer(name.trim() || "0", {
      id: layerIdFromName(name),
      color,
    });
    layers.push(layer);
    idByName.set(key, layer.id);
    return layer.id;
  };

  for (const layer of drawing.layers) {
    resolveLayerId(layer.name, layer.color);
  }

  const colorByName = new Map(drawing.layers.map((l) => [l.name.trim().toUpperCase(), l.color]));
  const entities: CadEntity[] = [];
  for (const geom of drawing.geoms) {
    const color = colorByName.get(geom.layer.trim().toUpperCase()) ?? "#fbbf24";
    const layerId = resolveLayerId(geom.layer, color);
    const entity = geomToEntity(geom, layerId);
    if (entity) entities.push(entity);
  }

  let next: CadProject = {
    ...project,
    layers,
    entities: [...project.entities, ...entities],
  };
  if (drawing.source === "kml" || drawing.source === "kmz") {
    next = applyDetectedZoneToProject(next);
  }
  return { project: next, entities };
}

async function importBinaryCadViaApi(file: File): Promise<ImportedCadDrawing> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/cad/import-drawing", { method: "POST", body: form });
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; drawing?: ImportedCadDrawing; error?: string }
    | null;
  if (!res.ok || !data?.ok || !data.drawing) {
    throw new Error(data?.error || DWG_CONVERT_HINT_PT);
  }
  return data.drawing;
}

function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export async function importCadDrawingFile(
  file: File,
  project: CadProject,
): Promise<CadDrawingImportOutcome> {
  const ext = extOf(file.name);
  try {
    if (ext === "kml") {
      const text = await file.text();
      const georef = resolveKmlImportGeoref(project, text);
      const drawing = parseKmlToCadGeoms(text, georef);
      drawing.source = "kml";
      return finish(project, drawing, true);
    }

    if (ext === "kmz") {
      const buffer = await file.arrayBuffer();
      const { kml, warnings } = parseKmzBuffer(buffer);
      if (!kml) {
        return {
          project,
          importedEntities: [],
          count: 0,
          enableSatellite: false,
          warnings,
          error: warnings.join(" ") || "KMZ sem arquivo KML interno.",
          source: "kmz",
        };
      }
      const georef = resolveKmlImportGeoref(project, kml);
      const drawing = parseKmlToCadGeoms(kml, georef);
      drawing.source = "kmz";
      drawing.warnings = [...warnings, ...drawing.warnings];
      return finish(project, drawing, true);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    if (ext === "dxf" || bytesLookLikeAsciiDxf(bytes)) {
      if (bytesLookLikeBinaryDxf(bytes) || bytesLookLikeBinaryDwg(bytes)) {
        const drawing = await importBinaryCadViaApi(file);
        return finish(project, drawing, false);
      }
      const drawing = parseAsciiDxf(decodeDxfText(bytes));
      return finish(project, drawing, false);
    }

    if (ext === "dwg") {
      if (bytesLookLikeAsciiDxf(bytes)) {
        const drawing = parseAsciiDxf(decodeDxfText(bytes));
        drawing.source = "dxf";
        drawing.warnings = [
          ...drawing.warnings,
          "Arquivo .dwg contém DXF ASCII — importado como DXF.",
        ];
        return finish(project, drawing, false);
      }
      if (!bytesLookLikeBinaryDwg(bytes)) {
        return {
          project,
          importedEntities: [],
          count: 0,
          enableSatellite: false,
          warnings: [],
          error: DWG_CONVERT_HINT_PT,
          source: "dwg",
        };
      }
      try {
        const drawing = await importBinaryCadViaApi(file);
        return finish(project, drawing, false);
      } catch (err) {
        return {
          project,
          importedEntities: [],
          count: 0,
          enableSatellite: false,
          warnings: [],
          error: err instanceof Error ? err.message : DWG_CONVERT_HINT_PT,
          source: "dwg",
        };
      }
    }

    return {
      project,
      importedEntities: [],
      count: 0,
      enableSatellite: false,
      warnings: [],
      error: "Formato não suportado. Use DWG, DXF, KMZ ou KML.",
    };
  } catch (err) {
    return {
      project,
      importedEntities: [],
      count: 0,
      enableSatellite: false,
      warnings: [],
      error: err instanceof Error ? err.message : "Falha na importação.",
    };
  }
}

function finish(
  project: CadProject,
  drawing: ImportedCadDrawing,
  enableSatellite: boolean,
): CadDrawingImportOutcome {
  if (drawing.geoms.length === 0) {
    return {
      project,
      importedEntities: [],
      count: 0,
      enableSatellite: false,
      warnings: drawing.warnings,
      error: drawing.warnings.join(" ") || "Nenhuma geometria válida no arquivo.",
      source: drawing.source,
    };
  }
  const merged = mergeImportedDrawing(project, drawing);
  return {
    project: merged.project,
    importedEntities: merged.entities,
    count: merged.entities.length,
    enableSatellite,
    warnings: drawing.warnings,
    source: drawing.source,
  };
}
