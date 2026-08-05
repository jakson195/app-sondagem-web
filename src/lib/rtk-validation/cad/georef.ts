import {
  detectSirgasUtmFromSamples,
  enToLatLon,
  formatSirgasUtmProjection,
  latLonToEn,
  resolveEnToLatLon,
  utmZoneFromLongitude,
} from "@/lib/rtk-validation/project-coords";
import type { CadEntity, CadProject, CadVertex } from "./types";
import {
  detectWgs84Axes,
  isGeoreferencedVertex,
  isLikelyUtmViewport,
  isLikelyWgs84Vertex,
} from "./utm-bounds";

const SURVEY_LAYER_IDS = new Set(["rtk_points", "ctrl_known", "ctrl_obs", "draw"]);

export type CadCoordMode = "utm" | "wgs84";

export interface CadGeorefContext {
  utmZone: number;
  /** EPSG SIRGAS 2000 / UTM Sul (ex.: EPSG:31983). */
  utmEpsg: string;
  /** Texto de projeção para memorial/prancha. */
  utmProjectionLabel: string;
  /** E (UTM) ou lon (WGS84) armazenado em x ou y no CadVertex. */
  eastingAxis: "x" | "y";
  /** N (UTM) ou lat (WGS84) armazenado em x ou y no CadVertex. */
  northingAxis: "x" | "y";
  /** UTM em metros ou graus WGS84. */
  coordMode: CadCoordMode;
  /** Coordenadas parecem georreferenciadas (UTM ou WGS84). */
  isGeoreferenced: boolean;
}

function collectVertices(entities: CadEntity[], layerFilter?: Set<string>): CadVertex[] {
  const out: CadVertex[] = [];
  for (const entity of entities) {
    if (layerFilter && !layerFilter.has(entity.layerId)) continue;
    if (entity.type === "point") out.push({ x: entity.x, y: entity.y, z: entity.z });
    else if (entity.type === "line") out.push(entity.start, entity.end);
    else out.push(...entity.vertices);
  }
  return out;
}

function parseZoneFromCrs(crs?: string): number | null {
  if (!crs) return null;
  const m =
    crs.match(/(?:EPSG:|UTM\s*)\s*(\d{2})(?:S|N)?/i) ??
    crs.match(/319(\d{2})/) ??
    crs.match(/4674.*?(\d{2})/i);
  if (!m) return null;
  const zone = Number(m[1]);
  return zone >= 18 && zone <= 25 ? zone : null;
}

function buildGeoref(
  zone: number,
  eastingAxis: "x" | "y",
  northingAxis: "x" | "y",
  coordMode: CadCoordMode,
  isGeoreferenced: boolean,
): CadGeorefContext {
  return {
    utmZone: zone,
    utmEpsg: `EPSG:${31960 + zone}`,
    utmProjectionLabel:
      coordMode === "wgs84"
        ? "Coordenadas geográficas WGS84 (SIRGAS 2000)"
        : formatSirgasUtmProjection(zone),
    eastingAxis,
    northingAxis,
    coordMode,
    isGeoreferenced,
  };
}

function detectWgs84FromSamples(samples: CadVertex[]): {
  eastingAxis: "x" | "y";
  northingAxis: "x" | "y";
  zone: number;
} | null {
  let lonAxis: "x" | "y" = "x";
  let latAxis: "x" | "y" = "y";
  let hits = 0;
  let lonSum = 0;

  const step = samples.length > 32 ? Math.ceil(samples.length / 32) : 1;
  for (let i = 0; i < samples.length; i += step) {
    const axes = detectWgs84Axes(samples[i].x, samples[i].y);
    if (!axes) continue;
    hits += 1;
    lonAxis = axes.lonAxis;
    latAxis = axes.latAxis;
    lonSum += samples[i][axes.lonAxis];
  }

  if (hits === 0) return null;
  return {
    eastingAxis: lonAxis,
    northingAxis: latAxis,
    zone: utmZoneFromLongitude(lonSum / hits),
  };
}

function boundsFromVerts(verts: CadVertex[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const v of verts) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }
  return { minX, maxX, minY, maxY };
}

function hasGeoreferencedSamples(samples: CadVertex[]): boolean {
  return samples.some((v) => isGeoreferencedVertex(v.x, v.y));
}

function viewportLooksGeoreferenced(
  viewport: { minX: number; maxX: number; minY: number; maxY: number },
): boolean {
  if (isLikelyUtmViewport(viewport)) return true;
  const corners = [
    { x: viewport.minX, y: viewport.minY },
    { x: viewport.maxX, y: viewport.maxY },
  ];
  return corners.some((c) => isLikelyWgs84Vertex(c.x, c.y));
}

/** Detecta fuso UTM, WGS84 ou eixos E/N trocados. */
export function detectCadGeoref(
  entities: CadEntity[],
  viewport?: { minX: number; maxX: number; minY: number; maxY: number },
  crs?: string,
): CadGeorefContext {
  const surveyVerts = collectVertices(entities, SURVEY_LAYER_IDS);
  const allVerts = surveyVerts.length > 0 ? surveyVerts : collectVertices(entities);

  let eastingAxis: "x" | "y" = "x";
  let northingAxis: "x" | "y" = "y";
  let utmZone = parseZoneFromCrs(crs) ?? 23;
  let coordMode: CadCoordMode = "utm";

  if (allVerts.length > 0) {
    const wgs84 = detectWgs84FromSamples(allVerts);
    const utmHits = allVerts.filter(
      (v) => !isLikelyWgs84Vertex(v.x, v.y) && Math.max(Math.abs(v.x), Math.abs(v.y)) > 1_000,
    ).length;

    if (wgs84 && utmHits === 0) {
      coordMode = "wgs84";
      eastingAxis = wgs84.eastingAxis;
      northingAxis = wgs84.northingAxis;
      utmZone = wgs84.zone;
    } else {
      const detected = detectSirgasUtmFromSamples(allVerts);
      utmZone = detected.zone;
      eastingAxis = detected.eastingAxis;
      northingAxis = detected.northingAxis;
    }
  } else if (viewport && isLikelyUtmViewport(viewport)) {
    const cx = (viewport.minX + viewport.maxX) / 2;
    const cy = (viewport.minY + viewport.maxY) / 2;
    const resolved = resolveEnToLatLon(cx, cy);
    utmZone = resolved.zone;
    if (resolved.swapped) {
      eastingAxis = "y";
      northingAxis = "x";
    }
  } else if (viewport) {
    const wgs84 = detectWgs84FromSamples([
      { x: viewport.minX, y: viewport.minY, z: 0 },
      { x: viewport.maxX, y: viewport.maxY, z: 0 },
    ]);
    if (wgs84) {
      coordMode = "wgs84";
      eastingAxis = wgs84.eastingAxis;
      northingAxis = wgs84.northingAxis;
      utmZone = wgs84.zone;
    }
  }

  const bounds = allVerts.length > 0 ? boundsFromVerts(allVerts) : viewport;
  const isGeoreferenced =
    (allVerts.length > 0 && hasGeoreferencedSamples(allVerts)) ||
    (bounds != null && viewportLooksGeoreferenced(bounds));

  const crsZone = parseZoneFromCrs(crs);
  if (crsZone != null && coordMode === "utm" && !isGeoreferenced) {
    utmZone = crsZone;
  }

  return buildGeoref(utmZone, eastingAxis, northingAxis, coordMode, isGeoreferenced);
}

/** Contexto UTM explícito (importação de overlays, APIs). */
export function createCadGeorefContext(
  utmZone: number,
  eastingAxis: "x" | "y" = "x",
  northingAxis: "x" | "y" = "y",
  isGeoreferenced = true,
  coordMode: CadCoordMode = "utm",
): CadGeorefContext {
  return buildGeoref(utmZone, eastingAxis, northingAxis, coordMode, isGeoreferenced);
}

export function detectCadGeorefFromProject(
  project: CadProject,
  viewport?: { minX: number; maxX: number; minY: number; maxY: number },
): CadGeorefContext {
  return detectCadGeoref(project.entities, viewport, project.crs);
}

export function vertexToEn(v: CadVertex, georef: CadGeorefContext): { e: number; n: number } {
  return { e: v[georef.eastingAxis], n: v[georef.northingAxis] };
}

export function enToVertex(e: number, n: number, z: number, georef: CadGeorefContext): CadVertex {
  const v: CadVertex = { x: 0, y: 0, z };
  v[georef.eastingAxis] = e;
  v[georef.northingAxis] = n;
  return v;
}

export function enToLatLonGeoref(e: number, n: number, georef: CadGeorefContext) {
  if (georef.coordMode === "wgs84") {
    return { lat: n, lon: e, zone: georef.utmZone, epsg: georef.utmEpsg, swapped: false, e, n };
  }
  return enToLatLon(e, n, georef.utmZone);
}

export function latLonToVertexGeoref(lat: number, lon: number, z: number, georef: CadGeorefContext): CadVertex {
  if (georef.coordMode === "wgs84") {
    return enToVertex(lon, lat, z, georef);
  }
  const en = latLonToEn(lat, lon, georef.utmZone);
  return enToVertex(en.e, en.n, z, georef);
}

export function viewportBbox4326Georef(
  viewport: { minX: number; maxX: number; minY: number; maxY: number },
  georef: CadGeorefContext,
) {
  const corners = [
    { x: viewport.minX, y: viewport.minY },
    { x: viewport.maxX, y: viewport.minY },
    { x: viewport.maxX, y: viewport.maxY },
    { x: viewport.minX, y: viewport.maxY },
  ];

  const latLons = corners.map((c) => {
    const { e, n } = vertexToEn({ x: c.x, y: c.y, z: 0 }, georef);
    return enToLatLonGeoref(e, n, georef);
  });

  return {
    minLon: Math.min(...latLons.map((c) => c.lon)),
    minLat: Math.min(...latLons.map((c) => c.lat)),
    maxLon: Math.max(...latLons.map((c) => c.lon)),
    maxLat: Math.max(...latLons.map((c) => c.lat)),
  };
}

/** Bbox seguro para overlays — descarta valores não finitos. */
export function viewportBbox4326GeorefSafe(
  viewport: { minX: number; maxX: number; minY: number; maxY: number },
  georef: CadGeorefContext,
) {
  const bbox = viewportBbox4326Georef(viewport, georef);
  const finite = [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat].every(Number.isFinite);
  if (!finite || bbox.minLon >= bbox.maxLon || bbox.minLat >= bbox.maxLat) return null;
  return bbox;
}

export { formatSirgasUtmProjection } from "@/lib/rtk-validation/project-coords";
