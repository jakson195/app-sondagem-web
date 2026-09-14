/** Estilo Mapbox partilhado (taludes drone + ambiente CAD). */
export const MAPBOX_STYLE_SATELLITE_STREETS = "mapbox://styles/mapbox/satellite-streets-v12";

export const MAPBOX_STYLE_SATELLITE_STREETS_ID = "mapbox/satellite-streets-v12";

export function getMapboxAccessToken(): string | undefined {
  const token =
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ||
    process.env.MAPBOX_ACCESS_TOKEN?.trim();
  return token || undefined;
}

/** URL de tile raster 512px do estilo satellite-streets-v12 (fallback sem Mapbox GL). */
export function mapboxSatelliteTileUrl(z: number, x: number, y: number, token?: string): string | null {
  const accessToken = token ?? getMapboxAccessToken();
  if (!accessToken) return null;
  return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE_SATELLITE_STREETS_ID}/tiles/512/${z}/${x}/${y}?access_token=${accessToken}`;
}
