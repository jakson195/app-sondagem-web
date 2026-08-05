import type { CadEntity } from "./types";
import { detectCadGeoref } from "./georef";

export function detectProjectUtmZone(
  entities: CadEntity[],
  fallbackViewport?: { minX: number; maxX: number; minY: number; maxY: number },
  crs?: string,
): number {
  return detectCadGeoref(entities, fallbackViewport, crs).utmZone;
}

export {
  detectSirgasUtmFromSamples,
  detectSirgasUtmZone,
  formatSirgasUtmProjection,
  resolveEnToLatLon,
  sirgasUtmEpsgCode,
  utmZoneFromLongitude,
} from "@/lib/rtk-validation/project-coords";
