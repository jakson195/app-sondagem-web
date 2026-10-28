import shp from "shpjs";
import { createUserLayer } from "./layer-styles";
import { applyDetectedZoneToProject } from "./utm-zone";
import type { CadEntity, CadProject, CadVertex } from "./types";

type VecGeometry = {
  type: string;
  coordinates: unknown;
};

type VecFeature = {
  type?: string;
  geometry?: VecGeometry | null;
  properties?: Record<string, unknown> | null;
};

type VecCollection = {
  type?: string;
  features?: VecFeature[];
};

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function verts(coords: unknown, z0 = 0): CadVertex[] {
  if (!Array.isArray(coords)) return [];
  return coords
    .map((pair) => {
      if (!Array.isArray(pair) || typeof pair[0] !== "number" || typeof pair[1] !== "number") return null;
      const z = typeof pair[2] === "number" ? pair[2] : z0;
      return { x: pair[0], y: pair[1], z };
    })
    .filter((v): v is CadVertex => v != null);
}

function featureToEntities(feature: VecFeature, layerId: string): CadEntity[] {
  const g = feature.geometry;
  if (!g) return [];
  const props = feature.properties ?? {};
  const name = String(props.name ?? props.NOME ?? props.id ?? "");
  if (g.type === "Point") {
    const c = Array.isArray(g.coordinates) ? g.coordinates : [];
    const x = Number(c[0]);
    const y = Number(c[1]);
    const z = typeof c[2] === "number" ? c[2] : 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    return [{ id: newId("pt"), type: "point", layerId, x, y, z, label: name || undefined }];
  }
  if (g.type === "MultiPoint") {
    const pts = Array.isArray(g.coordinates) ? g.coordinates : [];
    return pts.flatMap((pair, i) => {
      if (!Array.isArray(pair)) return [];
      const x = Number(pair[0]);
      const y = Number(pair[1]);
      const z = typeof pair[2] === "number" ? pair[2] : 0;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
      return [
        {
          id: newId("pt"),
          type: "point" as const,
          layerId,
          x,
          y,
          z,
          label: name ? `${name}_${i + 1}` : undefined,
        },
      ];
    });
  }
  if (g.type === "LineString") {
    const v = verts(g.coordinates);
    if (v.length < 2) return [];
    return [{ id: newId("pl"), type: "polyline", layerId, vertices: v, closed: false, name: name || undefined }];
  }
  if (g.type === "MultiLineString") {
    const lines = Array.isArray(g.coordinates) ? g.coordinates : [];
    return lines.flatMap((line) => {
      const v = verts(line);
      if (v.length < 2) return [];
      return [{ id: newId("pl"), type: "polyline" as const, layerId, vertices: v, closed: false, name: name || undefined }];
    });
  }
  if (g.type === "Polygon") {
    const rings = Array.isArray(g.coordinates) ? g.coordinates : [];
    const ring = verts(rings[0]);
    if (ring.length < 3) return [];
    return [{ id: newId("pl"), type: "polyline", layerId, vertices: ring, closed: true, name: name || undefined }];
  }
  if (g.type === "MultiPolygon") {
    const polys = Array.isArray(g.coordinates) ? g.coordinates : [];
    return polys.flatMap((poly, i) => {
      const rings = Array.isArray(poly) ? poly : [];
      const ring = verts(rings[0]);
      if (ring.length < 3) return [];
      return [
        {
          id: newId("pl"),
          type: "polyline" as const,
          layerId,
          vertices: ring,
          closed: true,
          name: name ? `${name}_${i + 1}` : undefined,
        },
      ];
    });
  }
  return [];
}

function featuresFromGeoJson(data: VecCollection & VecGeometry & { geometries?: VecGeometry[] }): VecFeature[] {
  if (data.type === "FeatureCollection") return data.features ?? [];
  if (data.type === "Feature") return [data];
  if (data.type === "GeometryCollection") {
    return (data.geometries ?? []).map((geometry) => ({ type: "Feature", geometry, properties: {} }));
  }
  if (data.type && data.coordinates != null) {
    return [{ type: "Feature", geometry: data, properties: {} }];
  }
  return [];
}

function mergeEntities(project: CadProject, entities: CadEntity[], layerName: string): CadProject {
  const layer = createUserLayer(layerName, { id: `imp_${layerName.toLowerCase().replace(/\s+/g, "_")}` });
  const has = project.layers.some((l) => l.id === layer.id);
  return applyDetectedZoneToProject({
    ...project,
    layers: has ? project.layers : [...project.layers, layer],
    entities: [...project.entities, ...entities],
  });
}

export async function importGeoJsonFile(
  file: File,
  project: CadProject,
): Promise<{ project: CadProject; count: number; error?: string }> {
  try {
    const data = JSON.parse(await file.text()) as VecCollection & VecGeometry & { geometries?: VecGeometry[] };
    const features = featuresFromGeoJson(data);
    const layerId = "imp_geojson";
    const entities = features.flatMap((f) => featureToEntities(f, layerId));
    if (!entities.length) return { project, count: 0, error: "Nenhuma geometria válida no GeoJSON." };
    return { project: mergeEntities(project, entities, "GEOJSON"), count: entities.length };
  } catch (err) {
    return { project, count: 0, error: err instanceof Error ? err.message : "GeoJSON inválido." };
  }
}

export async function importShapefileFile(
  file: File,
  project: CadProject,
): Promise<{ project: CadProject; count: number; error?: string }> {
  try {
    const geo = await shp(await file.arrayBuffer());
    const collections = Array.isArray(geo) ? geo : [geo];
    const layerId = "imp_shp";
    const entities = collections.flatMap((fc) =>
      (fc.features ?? []).flatMap((f) => featureToEntities(f, layerId)),
    );
    if (!entities.length) {
      return { project, count: 0, error: "Nenhuma geometria válida no shapefile. Use um ZIP com .shp/.dbf/.shx." };
    }
    return { project: mergeEntities(project, entities, "SHP"), count: entities.length };
  } catch (err) {
    return {
      project,
      count: 0,
      error: err instanceof Error ? err.message : "Falha ao ler shapefile. Envie um ZIP com .shp, .dbf e .shx.",
    };
  }
}
