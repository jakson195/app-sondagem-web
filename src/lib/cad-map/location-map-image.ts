import type { CadGeorefContext } from "@/lib/rtk-validation/cad/georef";
import { enToLatLonGeoref, vertexToEn } from "@/lib/rtk-validation/cad/georef";
import { isLikelyUtmViewport } from "@/lib/rtk-validation/cad/map-bbox";
import { fetchArcGisExportMap, type Bbox4326 } from "./fetch-map-image";

export type LocationMapStyle = "satellite" | "street" | "topo";

/** Expansão do enquadramento da planta de localização (contexto regional). */
export const LOCATION_MAP_EXPAND_FACTOR = 22;

const ESRI_MAP_SERVERS: Record<LocationMapStyle, string> = {
  satellite: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
  street: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer",
  topo: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer",
};

/** Converte bounds do CAD (x/y) para WGS84 usando eixo E/N detectado. */
export function expandedProjectBoundsToBbox4326(
  projectBounds: { minX: number; maxX: number; minY: number; maxY: number },
  georef: Pick<CadGeorefContext, "utmZone" | "eastingAxis" | "northingAxis">,
  factor = LOCATION_MAP_EXPAND_FACTOR,
): Bbox4326 {
  const corners = [
    { x: projectBounds.minX, y: projectBounds.minY },
    { x: projectBounds.maxX, y: projectBounds.minY },
    { x: projectBounds.maxX, y: projectBounds.maxY },
    { x: projectBounds.minX, y: projectBounds.maxY },
  ];

  const latLons = corners.map((c) => {
    const { e, n } = vertexToEn({ x: c.x, y: c.y, z: 0 }, georef as CadGeorefContext);
    return enToLatLonGeoref(e, n, georef as CadGeorefContext);
  });

  const minLon = Math.min(...latLons.map((c) => c.lon));
  const maxLon = Math.max(...latLons.map((c) => c.lon));
  const minLat = Math.min(...latLons.map((c) => c.lat));
  const maxLat = Math.max(...latLons.map((c) => c.lat));

  const cx = (minLon + maxLon) / 2;
  const cy = (minLat + maxLat) / 2;
  const halfLon = Math.max(((maxLon - minLon) / 2) * factor, 0.012);
  const halfLat = Math.max(((maxLat - minLat) / 2) * factor, 0.012);

  return [cx - halfLon, cy - halfLat, cx + halfLon, cy + halfLat];
}

/** Posição na imagem do mapa (bbox WGS84 → retângulo em px). */
export function latLonToLocationMapScreen(
  lat: number,
  lon: number,
  bbox: Bbox4326,
  innerX: number,
  innerY: number,
  innerW: number,
  innerH: number,
) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const lonSpan = maxLon - minLon || 1e-9;
  const latSpan = maxLat - minLat || 1e-9;
  return {
    sx: innerX + ((lon - minLon) / lonSpan) * innerW,
    sy: innerY + innerH - ((lat - minLat) / latSpan) * innerH,
  };
}

/** Retângulo do projeto sobre o mapa, alinhado ao mesmo bbox WGS84 da imagem ESRI. */
export function projectBoundsOnLocationMap(
  projectBounds: { minX: number; maxX: number; minY: number; maxY: number },
  georef: Pick<CadGeorefContext, "utmZone" | "eastingAxis" | "northingAxis">,
  mapBbox: Bbox4326,
  innerX: number,
  innerY: number,
  innerW: number,
  innerH: number,
) {
  const corners = [
    { x: projectBounds.minX, y: projectBounds.minY },
    { x: projectBounds.maxX, y: projectBounds.minY },
    { x: projectBounds.maxX, y: projectBounds.maxY },
    { x: projectBounds.minX, y: projectBounds.maxY },
  ];

  const screens = corners.map((c) => {
    const { e, n } = vertexToEn({ x: c.x, y: c.y, z: 0 }, georef as CadGeorefContext);
    const { lat, lon } = enToLatLonGeoref(e, n, georef as CadGeorefContext);
    return latLonToLocationMapScreen(lat, lon, mapBbox, innerX, innerY, innerW, innerH);
  });

  const xs = screens.map((p) => p.sx);
  const ys = screens.map((p) => p.sy);
  const rx = Math.min(...xs);
  const ry = Math.min(...ys);

  return {
    rx,
    ry,
    rw: Math.max(Math.max(...xs) - rx, 2),
    rh: Math.max(Math.max(...ys) - ry, 2),
  };
}

export function isLocationMapBoundsValid(
  projectBounds: { minX: number; maxX: number; minY: number; maxY: number },
): boolean {
  if (projectBounds.maxX <= projectBounds.minX || projectBounds.maxY <= projectBounds.minY) return false;
  return isLikelyUtmViewport(projectBounds);
}

/** @deprecated Use expandedProjectBoundsToBbox4326 com georef. */
export function expandedUtmBoundsToBbox4326(
  projectBounds: { minX: number; maxX: number; minY: number; maxY: number },
  zone: number,
  factor = 22,
): Bbox4326 {
  return expandedProjectBoundsToBbox4326(
    projectBounds,
    { utmZone: zone, eastingAxis: "x", northingAxis: "y" },
    factor,
  );
}

export async function fetchEsriMapServerImage(
  mapServerUrl: string,
  bbox: Bbox4326,
  width: number,
  height: number,
): Promise<ArrayBuffer | null> {
  const result = await fetchArcGisExportMap(mapServerUrl, "0", bbox, width, height);
  return result?.body ?? null;
}

export async function fetchLocationMapImage(
  projectBounds: { minX: number; maxX: number; minY: number; maxY: number },
  georef: Pick<CadGeorefContext, "utmZone" | "eastingAxis" | "northingAxis">,
  width: number,
  height: number,
  preferredStyle: LocationMapStyle = "satellite",
): Promise<{ body: ArrayBuffer; style: LocationMapStyle } | null> {
  if (!isLocationMapBoundsValid(projectBounds)) return null;

  const bbox = expandedProjectBoundsToBbox4326(projectBounds, georef);
  const fallbackOrder = (
    [preferredStyle, "satellite", "street", "topo"] as LocationMapStyle[]
  ).filter((style, index, arr) => arr.indexOf(style) === index);

  for (const style of fallbackOrder) {
    const body = await fetchEsriMapServerImage(ESRI_MAP_SERVERS[style], bbox, width, height);
    if (body) return { body, style };
  }

  return null;
}
