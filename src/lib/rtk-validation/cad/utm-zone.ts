import type { CadEntity, CadProject } from "./types";
import { detectCadGeoref, type CadGeorefContext } from "./georef";
import {
  detectSirgasUtmFromSamples,
  detectSirgasUtmZone,
  formatSirgasUtmProjection,
  resolveEnToLatLon,
} from "@/lib/rtk-validation/project-coords";

export type UtmZoneDetection = {
  zone: number;
  epsg: string;
  projectionLabel: string;
  eastingAxis: "x" | "y";
  northingAxis: "x" | "y";
  coordMode: "utm" | "wgs84";
  isGeoreferenced: boolean;
  confidence: number;
  sampleCount: number;
  swapped: boolean;
  lat?: number;
  lon?: number;
};

function collectCoordSamples(entities: CadEntity[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const entity of entities) {
    if (entity.type === "point") out.push({ x: entity.x, y: entity.y });
    else if (entity.type === "line") {
      out.push(entity.start, entity.end);
    } else {
      out.push(...entity.vertices);
    }
  }
  return out;
}

/** Identifica fuso UTM (18S–25S) a partir de coordenadas E/N ou lat/lon do desenho. */
export function detectUtmZoneFromCoordinates(
  entities: CadEntity[],
  viewport?: { minX: number; maxX: number; minY: number; maxY: number },
  crs?: string,
): UtmZoneDetection {
  const georef = detectCadGeoref(entities, viewport, crs);
  const samples = collectCoordSamples(entities);

  if (georef.coordMode === "wgs84" && samples.length > 0) {
    const resolved = resolveEnToLatLon(samples[0]!.x, samples[0]!.y);
    return {
      zone: georef.utmZone,
      epsg: georef.utmEpsg,
      projectionLabel: georef.utmProjectionLabel,
      eastingAxis: georef.eastingAxis,
      northingAxis: georef.northingAxis,
      coordMode: "wgs84",
      isGeoreferenced: georef.isGeoreferenced,
      confidence: 1,
      sampleCount: samples.length,
      swapped: georef.eastingAxis === "y",
      lat: resolved.lat,
      lon: resolved.lon,
    };
  }

  const utm = detectSirgasUtmFromSamples(samples);
  const anchor = samples.length > 0 ? resolveEnToLatLon(samples[0]!.x, samples[0]!.y) : null;

  return {
    zone: georef.utmZone,
    epsg: georef.utmEpsg,
    projectionLabel: georef.utmProjectionLabel,
    eastingAxis: georef.eastingAxis,
    northingAxis: georef.northingAxis,
    coordMode: georef.coordMode,
    isGeoreferenced: georef.isGeoreferenced,
    confidence: samples.length > 0 ? utm.confidence : 0,
    sampleCount: utm.sampleCount,
    swapped: utm.eastingAxis === "y",
    lat: anchor?.lat,
    lon: anchor?.lon,
  };
}

/** Fuso UTM a partir de um par E/N (metros). */
export function detectUtmZoneFromEn(e: number, n: number): number {
  return detectSirgasUtmZone(e, n);
}

/** Aplica fuso detectado ao CRS do projeto (SIRGAS 2000 / UTM Sul). */
export function applyDetectedZoneToProject(
  project: CadProject,
  georef?: CadGeorefContext,
): CadProject {
  const ctx = georef ?? detectCadGeoref(project.entities, undefined, project.crs);
  if (!ctx.isGeoreferenced) return project;
  if (ctx.coordMode === "wgs84") {
    return project.crs === "EPSG:4326" ? project : { ...project, crs: "EPSG:4326" };
  }
  return project.crs === ctx.utmEpsg ? project : { ...project, crs: ctx.utmEpsg };
}

export function formatZoneDetectionSummary(detection: UtmZoneDetection): string {
  if (!detection.isGeoreferenced) {
    return "Coordenadas ainda não reconhecidas como georreferenciadas.";
  }
  if (detection.coordMode === "wgs84") {
    return `Coordenadas geográficas WGS84 · fuso estimado ${detection.zone}S para mapas`;
  }
  const pct = Math.round(detection.confidence * 100);
  return `${formatSirgasUtmProjection(detection.zone)} · ${detection.epsg} (${pct}% das amostras)`;
}

export {
  detectSirgasUtmFromSamples,
  detectSirgasUtmZone,
  formatSirgasUtmProjection,
  resolveEnToLatLon,
  sirgasUtmEpsgCode,
  utmZoneFromLongitude,
} from "@/lib/rtk-validation/project-coords";

export function detectProjectUtmZone(
  entities: CadEntity[],
  fallbackViewport?: { minX: number; maxX: number; minY: number; maxY: number },
  crs?: string,
): number {
  return detectCadGeoref(entities, fallbackViewport, crs).utmZone;
}
