import { enToLatLon, latLonToEn } from "@/lib/rtk-validation/project-coords";
import type { CadViewport } from "./viewport";
import { viewportBbox4326 } from "./map-bbox";

export {
  DEFAULT_BRAZIL_VIEWPORT,
  computeViewportBoundsSafe,
  detectViewportUtmZone,
  isBboxInBrazil,
  isLikelyUtmViewport,
  isViewportSmallEnoughForImport,
  viewportBbox4326,
} from "./map-bbox";
const EARTH_RADIUS_M = 6378137;
const SATELLITE_TILE_SIZE = 256;

export function latLonToTileXY(lat: number, lon: number, zoom: number) {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

export function tileLatLonBounds(x: number, y: number, zoom: number) {
  const n = 2 ** zoom;
  const lonMin = (x / n) * 360 - 180;
  const lonMax = ((x + 1) / n) * 360 - 180;
  const latMax = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const latMin = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;
  return { lonMin, lonMax, latMin, latMax };
}

export function satelliteTileUrl(z: number, x: number, y: number) {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}

export function viewportCenterLatLon(
  viewport: Omit<CadViewport, "width" | "height" | "padding">,
  zone: number,
) {
  const cx = (viewport.minX + viewport.maxX) / 2;
  const cy = (viewport.minY + viewport.maxY) / 2;
  return enToLatLon(cx, cy, zone);
}

// viewportBbox4326 — ver map-bbox.ts

export function pickTileZoom(viewport: CadViewport, centerLat: number): number {
  const innerW = Math.max(viewport.width - viewport.padding * 2, 1);
  const worldMpp = (viewport.maxX - viewport.minX) / innerW;
  const cosLat = Math.max(Math.cos((centerLat * Math.PI) / 180), 0.05);
  for (let z = 19; z >= 3; z--) {
    const mpp = (2 * Math.PI * EARTH_RADIUS_M * cosLat) / (SATELLITE_TILE_SIZE * 2 ** z);
    if (mpp <= worldMpp * 1.8) return z;
  }
  return 3;
}

export type MapTileRef = { x: number; y: number; z: number };

export function listTilesForViewport(viewport: CadViewport, zone: number, zoom: number): MapTileRef[] {
  const bbox = viewportBbox4326(viewport, zone);
  const { x: x0, y: y0 } = latLonToTileXY(bbox.maxLat, bbox.minLon, zoom);
  const { x: x1, y: y1 } = latLonToTileXY(bbox.minLat, bbox.maxLon, zoom);
  const tiles: MapTileRef[] = [];
  const maxTiles = 48;
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      tiles.push({ x, y, z: zoom });
      if (tiles.length >= maxTiles) return tiles;
    }
  }
  return tiles;
}

export function tileScreenBounds(
  tile: MapTileRef,
  viewport: CadViewport,
  zone: number,
  worldToScreenFn: (x: number, y: number, vp: CadViewport) => { sx: number; sy: number },
) {
  const b = tileLatLonBounds(tile.x, tile.y, tile.z);
  const nw = latLonToEn(b.latMax, b.lonMin, zone);
  const se = latLonToEn(b.latMin, b.lonMax, zone);
  const tl = worldToScreenFn(nw.e, nw.n, viewport);
  const br = worldToScreenFn(se.e, se.n, viewport);
  const x = Math.min(tl.sx, br.sx);
  const y = Math.min(tl.sy, br.sy);
  const width = Math.abs(br.sx - tl.sx);
  const height = Math.abs(br.sy - tl.sy);
  if (width < 1 || height < 1) return null;
  return { x, y, width, height };
}

export function viewportScreenBounds(
  viewport: CadViewport,
  worldToScreenFn: (x: number, y: number, vp: CadViewport) => { sx: number; sy: number },
) {
  const sw = worldToScreenFn(viewport.minX, viewport.minY, viewport);
  const ne = worldToScreenFn(viewport.maxX, viewport.maxY, viewport);
  const x = Math.min(sw.sx, ne.sx);
  const y = Math.min(sw.sy, ne.sy);
  const width = Math.abs(ne.sx - sw.sx);
  const height = Math.abs(sw.sy - ne.sy);
  return { x, y, width, height };
}
