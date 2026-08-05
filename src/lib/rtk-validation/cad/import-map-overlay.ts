import type { Bbox4326 } from "@/lib/cad-map/fetch-map-image";
import {
  ANM_SIGMINE_LAYERS,
  type AnmSigmineLayerKey,
} from "@/lib/cad-map/anm-sigmine-layers";
import { createCadGeorefContext, type CadGeorefContext } from "./georef";
import { latLonToVertexGeoref } from "./georef";
import type { CadEntity, CadLayer, CadPolylineEntity, CadVertex } from "./types";

export type OverlayImportSource = "anm";

export function cadLayerForAnmKey(key: AnmSigmineLayerKey): CadLayer {
  const def = ANM_SIGMINE_LAYERS[key];
  return {
    id: def.cadLayerId,
    name: `ANM — ${def.label}`,
    color: def.color,
    visible: true,
    locked: true,
  };
}

function newOverlayId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultGeoref(utmZone = 23): CadGeorefContext {
  return createCadGeorefContext(utmZone);
}

function toVertex(lon: number, lat: number, z: number | undefined, georef: CadGeorefContext): CadVertex {
  return latLonToVertexGeoref(lat, lon, z ?? 0, georef);
}

function ringToVertices(coords: number[][], georef: CadGeorefContext): CadVertex[] {
  return coords.map(([lon, lat, z]) => toVertex(lon, lat, z, georef));
}

function lineToVertices(coords: number[][], georef: CadGeorefContext): CadVertex[] {
  return coords.map(([lon, lat, z]) => toVertex(lon, lat, z, georef));
}

function featureLabel(feature: GeoJSON.Feature): string | undefined {
  const props = feature.properties ?? {};
  if (typeof props.tema === "string" && props.tema.trim()) return props.tema.trim();
  if (typeof props.PROCESSO === "string" && props.PROCESSO.trim()) return props.PROCESSO.trim();
  if (typeof props.NOME === "string" && props.NOME.trim()) return props.NOME.trim();
  if (typeof props.DSProcesso === "string" && props.DSProcesso.trim()) return props.DSProcesso.trim();
  if (typeof props.name === "string" && props.name.trim()) return props.name.trim();
  return undefined;
}

function featureToEntities(
  feature: GeoJSON.Feature,
  layerId: string,
  idPrefix: string,
  georef: CadGeorefContext,
): CadEntity[] {
  const geom = feature.geometry;
  if (!geom) return [];
  const name = featureLabel(feature);

  if (geom.type === "Polygon") {
    const ring = geom.coordinates[0];
    if (!ring || ring.length < 3) return [];
    const vertices = ringToVertices(ring, georef);
    return [
      {
        id: newOverlayId(idPrefix),
        type: "polyline",
        layerId,
        vertices,
        closed: true,
        name,
      } satisfies CadPolylineEntity,
    ];
  }

  if (geom.type === "MultiPolygon") {
    return geom.coordinates.flatMap((poly) => {
      const ring = poly[0];
      if (!ring || ring.length < 3) return [];
      return [
        {
          id: newOverlayId(idPrefix),
          type: "polyline",
          layerId,
          vertices: ringToVertices(ring, georef),
          closed: true,
          name,
        } satisfies CadPolylineEntity,
      ];
    });
  }

  if (geom.type === "LineString") {
    const vertices = lineToVertices(geom.coordinates, georef);
    if (vertices.length < 2) return [];
    return [
      {
        id: newOverlayId(idPrefix),
        type: "polyline",
        layerId,
        vertices,
        closed: false,
        name,
      } satisfies CadPolylineEntity,
    ];
  }

  if (geom.type === "MultiLineString") {
    return geom.coordinates.flatMap((line) => {
      const vertices = lineToVertices(line, georef);
      if (vertices.length < 2) return [];
      return [
        {
          id: newOverlayId(idPrefix),
          type: "polyline",
          layerId,
          vertices,
          closed: false,
          name,
        } satisfies CadPolylineEntity,
      ];
    });
  }

  return [];
}

export function geoJsonToOverlayEntities(
  collection: GeoJSON.FeatureCollection,
  layerId: string,
  idPrefix: string,
  georef: CadGeorefContext | number = 23,
): CadEntity[] {
  const ctx = typeof georef === "number" ? defaultGeoref(georef) : georef;
  const entities: CadEntity[] = [];
  for (const feature of collection.features) {
    entities.push(...featureToEntities(feature, layerId, idPrefix, ctx));
  }
  return entities;
}

export function mergeOverlayImport(
  projectLayers: CadLayer[],
  projectEntities: CadEntity[],
  layerDef: CadLayer,
  imported: CadEntity[],
): { layers: CadLayer[]; entities: CadEntity[] } {
  const hasLayer = projectLayers.some((l) => l.id === layerDef.id);
  const layers = hasLayer ? projectLayers : [...projectLayers, layerDef];
  const entities = [
    ...projectEntities.filter((e) => e.layerId !== layerDef.id),
    ...imported,
  ];
  return { layers, entities };
}

export function mergeAnmLayerImport(
  projectLayers: CadLayer[],
  projectEntities: CadEntity[],
  anmKey: AnmSigmineLayerKey,
  imported: CadEntity[],
): { layers: CadLayer[]; entities: CadEntity[] } {
  const layerDef = cadLayerForAnmKey(anmKey);
  return mergeOverlayImport(projectLayers, projectEntities, layerDef, imported);
}

export function bboxToEnvelopeJson(bbox: Bbox4326) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return JSON.stringify({
    xmin: minLon,
    ymin: minLat,
    xmax: maxLon,
    ymax: maxLat,
    spatialReference: { wkid: 4326 },
  });
}
