import type { Bbox4326 } from "@/lib/cad-map/fetch-map-image";
import {
  ANM_SIGMINE_LAYERS,
  ANM_SIGMINE_LAYER_KEYS,
  type AnmSigmineLayerKey,
} from "@/lib/cad-map/anm-sigmine-layers";
import { SIGEF_LAYERS, SIGEF_LAYER_KEYS, type SigefLayerKey } from "@/lib/cad-map/sigef-layers";
import { createCadGeorefContext, type CadGeorefContext } from "./georef";
import { latLonToVertexGeoref } from "./georef";
import type { CadEntity, CadLayer, CadPolylineEntity, CadVertex } from "./types";

export type OverlayImportSource = "anm" | "sigef";

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

export function cadLayerForSigefKey(key: SigefLayerKey): CadLayer {
  const def = SIGEF_LAYERS[key];
  return {
    id: def.cadLayerId,
    name: `SIGEF — ${def.label}`,
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

function firstStringProp(props: GeoJSON.GeoJsonProperties, keys: string[]): string | undefined {
  if (!props) return undefined;
  for (const key of keys) {
    const value = props[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function featureLabel(feature: GeoJSON.Feature): string | undefined {
  const props = feature.properties ?? {};
  return firstStringProp(props, [
    "tema",
    "PROCESSO",
    "NOME",
    "DSProcesso",
    "name",
    "parcela",
    "denominacao",
    "denominacao_do_imovel",
    "codigo",
    "codigo_imovel",
    "rt",
    "municipio",
    "proprietario",
    "detentor",
  ]);
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

export function countAnmLayerEntities(entities: CadEntity[], anmKey: AnmSigmineLayerKey): number {
  const layerId = ANM_SIGMINE_LAYERS[anmKey].cadLayerId;
  return entities.filter((e) => e.layerId === layerId).length;
}

export function hasAnmLayerEntities(entities: CadEntity[], anmKey: AnmSigmineLayerKey): boolean {
  return countAnmLayerEntities(entities, anmKey) > 0;
}

export function countAllAnmEntities(entities: CadEntity[]): number {
  const layerIds = new Set(ANM_SIGMINE_LAYER_KEYS.map((key) => ANM_SIGMINE_LAYERS[key].cadLayerId));
  return entities.filter((e) => layerIds.has(e.layerId)).length;
}

/** Remove geometrias importadas de uma camada ANM (mantém a definição da camada). */
export function removeAnmLayerImport(
  projectLayers: CadLayer[],
  projectEntities: CadEntity[],
  anmKey: AnmSigmineLayerKey,
): { layers: CadLayer[]; entities: CadEntity[]; removed: number } {
  const layerId = ANM_SIGMINE_LAYERS[anmKey].cadLayerId;
  const before = projectEntities.length;
  const entities = projectEntities.filter((e) => e.layerId !== layerId);
  return { layers: projectLayers, entities, removed: before - entities.length };
}

/** Remove todas as geometrias ANM/SIGMINE importadas. */
export function removeAllAnmImports(
  projectLayers: CadLayer[],
  projectEntities: CadEntity[],
): { layers: CadLayer[]; entities: CadEntity[]; removed: number } {
  const layerIds = new Set(ANM_SIGMINE_LAYER_KEYS.map((key) => ANM_SIGMINE_LAYERS[key].cadLayerId));
  const before = projectEntities.length;
  const entities = projectEntities.filter((e) => !layerIds.has(e.layerId));
  return { layers: projectLayers, entities, removed: before - entities.length };
}

export function mergeSigefLayerImport(
  projectLayers: CadLayer[],
  projectEntities: CadEntity[],
  sigefKey: SigefLayerKey,
  imported: CadEntity[],
): { layers: CadLayer[]; entities: CadEntity[] } {
  return mergeOverlayImport(projectLayers, projectEntities, cadLayerForSigefKey(sigefKey), imported);
}

export function countSigefLayerEntities(entities: CadEntity[], sigefKey: SigefLayerKey): number {
  const layerId = SIGEF_LAYERS[sigefKey].cadLayerId;
  return entities.filter((e) => e.layerId === layerId).length;
}

export function countAllSigefEntities(entities: CadEntity[]): number {
  const layerIds = new Set(SIGEF_LAYER_KEYS.map((key) => SIGEF_LAYERS[key].cadLayerId));
  return entities.filter((e) => layerIds.has(e.layerId)).length;
}

export function removeSigefLayerImport(
  projectLayers: CadLayer[],
  projectEntities: CadEntity[],
  sigefKey: SigefLayerKey,
): { layers: CadLayer[]; entities: CadEntity[]; removed: number } {
  const layerId = SIGEF_LAYERS[sigefKey].cadLayerId;
  const before = projectEntities.length;
  const entities = projectEntities.filter((e) => e.layerId !== layerId);
  return { layers: projectLayers, entities, removed: before - entities.length };
}

export function removeAllSigefImports(
  projectLayers: CadLayer[],
  projectEntities: CadEntity[],
): { layers: CadLayer[]; entities: CadEntity[]; removed: number } {
  const layerIds = new Set(SIGEF_LAYER_KEYS.map((key) => SIGEF_LAYERS[key].cadLayerId));
  const before = projectEntities.length;
  const entities = projectEntities.filter((e) => !layerIds.has(e.layerId));
  return { layers: projectLayers, entities, removed: before - entities.length };
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
