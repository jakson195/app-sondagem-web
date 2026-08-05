import { enToLatLon, resolveEnToLatLon } from "@/lib/rtk-validation/project-coords";
import type { CadEntity } from "./types";
import type { CadViewport } from "./viewport";
import { computeViewportBounds } from "./viewport";
import {
  detectCadGeoref,
  viewportBbox4326Georef,
  type CadGeorefContext,
} from "./georef";
import { isLikelyUtmViewport } from "./utm-bounds";

/** ~50 km × 50 km em UTM 23S (região central BR) — evita viewport fictício (-50…50). */
export const DEFAULT_BRAZIL_VIEWPORT = {
  minX: 450_000,
  maxX: 550_000,
  minY: 7_350_000,
  maxY: 7_450_000,
};

export { isLikelyUtmViewport };

export function isBboxInBrazil(bbox: {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}): boolean {
  return (
    Number.isFinite(bbox.minLon) &&
    Number.isFinite(bbox.minLat) &&
    Number.isFinite(bbox.maxLon) &&
    Number.isFinite(bbox.maxLat) &&
    bbox.minLat >= -35 &&
    bbox.maxLat <= 6 &&
    bbox.minLon >= -75 &&
    bbox.maxLon <= -30
  );
}

/** Bbox WGS84 válido para consultas de mapa (evita Infinity após zoom extremo). */
export function isValidMapBbox4326(bbox: {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}): boolean {
  return (
    Number.isFinite(bbox.minLon) &&
    Number.isFinite(bbox.minLat) &&
    Number.isFinite(bbox.maxLon) &&
    Number.isFinite(bbox.maxLat) &&
    bbox.minLon < bbox.maxLon &&
    bbox.minLat < bbox.maxLat &&
    bbox.minLon >= -180 &&
    bbox.maxLon <= 180 &&
    bbox.minLat >= -90 &&
    bbox.maxLat <= 90
  );
}

export function detectViewportUtmZone(
  viewport: Pick<CadViewport, "minX" | "maxX" | "minY" | "maxY">,
  entities: CadEntity[] = [],
  crs?: string,
): number {
  return detectCadGeoref(entities, viewport, crs).utmZone;
}

export function viewportBbox4326(
  viewport: Pick<CadViewport, "minX" | "maxX" | "minY" | "maxY">,
  zone?: number,
  entities: CadEntity[] = [],
  crs?: string,
) {
  const georef = detectCadGeoref(entities, viewport, crs);
  if (zone != null) georef.utmZone = zone;

  if (!georef.isGeoreferenced && entities.length === 0) {
    const fallback = enToLatLon(
      (DEFAULT_BRAZIL_VIEWPORT.minX + DEFAULT_BRAZIL_VIEWPORT.maxX) / 2,
      (DEFAULT_BRAZIL_VIEWPORT.minY + DEFAULT_BRAZIL_VIEWPORT.maxY) / 2,
      georef.utmZone,
    );
    const pad = 0.45;
    return {
      minLon: fallback.lon - pad,
      minLat: fallback.lat - pad,
      maxLon: fallback.lon + pad,
      maxLat: fallback.lat + pad,
    };
  }

  const bbox = viewportBbox4326Georef(viewport, georef);

  if (!isBboxInBrazil(bbox)) {
    const fallback = enToLatLon(
      (DEFAULT_BRAZIL_VIEWPORT.minX + DEFAULT_BRAZIL_VIEWPORT.maxX) / 2,
      (DEFAULT_BRAZIL_VIEWPORT.minY + DEFAULT_BRAZIL_VIEWPORT.maxY) / 2,
      georef.utmZone,
    );
    const pad = 0.45;
    return {
      minLon: fallback.lon - pad,
      minLat: fallback.lat - pad,
      maxLon: fallback.lon + pad,
      maxLat: fallback.lat + pad,
    };
  }

  return bbox;
}

export type { CadGeorefContext } from "./georef";
export { detectCadGeoref, detectCadGeorefFromProject, viewportBbox4326Georef } from "./georef";

const TERRAIN_PROFILE_LAYER_IDS = new Set(["profile", "profile_transversal"]);

/** Entidades desenhadas no plano UTM (exclui perfis distância×cota). */
export function entitiesForMapViewport(entities: CadEntity[]): CadEntity[] {
  return entities.filter((e) => !TERRAIN_PROFILE_LAYER_IDS.has(e.layerId));
}

export function computeViewportBoundsSafe(entities: CadEntity[], paddingRatio = 0.1) {
  const mapEntities = entitiesForMapViewport(entities);
  if (mapEntities.length === 0) return { ...DEFAULT_BRAZIL_VIEWPORT };
  return computeViewportBounds(mapEntities, paddingRatio);
}

/** Limite ~120 km × 120 km para consultas vetoriais. */
export function isViewportSmallEnoughForImport(
  viewport: Pick<CadViewport, "minX" | "maxX" | "minY" | "maxY">,
): boolean {
  const spanX = Math.abs(viewport.maxX - viewport.minX);
  const spanY = Math.abs(viewport.maxY - viewport.minY);
  return spanX <= 120_000 && spanY <= 120_000;
}
