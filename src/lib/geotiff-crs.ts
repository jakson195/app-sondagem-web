import type { GeoTIFFImage } from "geotiff";
import proj4 from "proj4";

const WGS84 = "EPSG:4326";

proj4.defs(WGS84, "+proj=longlat +datum=WGS84 +no_defs +type=crs");

/** CRS frequentes em obras BR (evita fetch quando offline). */
const BUNDLED_PROJ4: Record<number, string> = {
  4326: "+proj=longlat +datum=WGS84 +no_defs +type=crs",
  4269: "+proj=longlat +datum=NAD83 +no_defs +type=crs",
  4674: "+proj=longlat +ellps=GRS80 +no_defs +type=crs",
  3857: "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs",
  31978: "+proj=utm +zone=18 +south +ellps=GRS80 +units=m +no_defs +type=crs",
  31979: "+proj=utm +zone=19 +south +ellps=GRS80 +units=m +no_defs +type=crs",
  31980: "+proj=utm +zone=20 +south +ellps=GRS80 +units=m +no_defs +type=crs",
  31981: "+proj=utm +zone=21 +south +ellps=GRS80 +units=m +no_defs +type=crs",
  31982: "+proj=utm +zone=22 +south +ellps=GRS80 +units=m +no_defs +type=crs",
  31983: "+proj=utm +zone=23 +south +ellps=GRS80 +units=m +no_defs +type=crs",
  31984: "+proj=utm +zone=24 +south +ellps=GRS80 +units=m +no_defs +type=crs",
  31985: "+proj=utm +zone=25 +south +ellps=GRS80 +units=m +no_defs +type=crs",
  32723: "+proj=utm +zone=23 +south +datum=WGS84 +units=m +no_defs +type=crs",
  32722: "+proj=utm +zone=22 +south +datum=WGS84 +units=m +no_defs +type=crs",
  32721: "+proj=utm +zone=21 +south +datum=WGS84 +units=m +no_defs +type=crs",
};

const proj4Cache = new Set<number>();

export type GeotiffCrsInfo = {
  epsg: number;
  label: string;
  geographic: boolean;
  reprojected: boolean;
};

function geoKeyNumber(keys: Record<string, unknown>, name: string, numeric: number): number | null {
  const raw = keys[name] ?? keys[numeric] ?? keys[String(numeric)];
  return typeof raw === "number" && raw > 0 && raw !== 32767 ? raw : null;
}

export function epsgFromGeoTiffImage(image: GeoTIFFImage): number {
  try {
    const keys = image.getGeoKeys() as Record<string, unknown> | undefined;
    if (!keys) return 4326;
    const raw =
      geoKeyNumber(keys, "ProjectedCSTypeGeoKey", 3072) ??
      geoKeyNumber(keys, "GeographicTypeGeoKey", 2048);
    if (raw == null) return 4326;
    return raw;
  } catch {
    return 4326;
  }
}

/** Registra definição proj4 embutida (SIRGAS/UTM/WGS84). */
export function defineBundledProj4(epsg: number): boolean {
  const code = `EPSG:${epsg}`;
  if (proj4.defs(code)) return true;
  const bundled = BUNDLED_PROJ4[epsg];
  if (!bundled) return false;
  proj4.defs(code, bundled);
  return true;
}

export function crsLabel(epsg: number): string {
  if (epsg === 4326) return "WGS 84 (EPSG:4326)";
  if (epsg === 4674) return "SIRGAS 2000 (EPSG:4674)";
  if (epsg >= 31978 && epsg <= 31985) {
    return `SIRGAS 2000 / UTM zona ${epsg - 31960}S (EPSG:${epsg})`;
  }
  if (epsg >= 32700 && epsg <= 32760) {
    return `WGS 84 / UTM (EPSG:${epsg})`;
  }
  return `EPSG:${epsg}`;
}

function isGeographicEpsg(epsg: number): boolean {
  return epsg === 4326 || epsg === 4269 || epsg === 4674;
}

export function bboxLooksLikeWgs84Degrees(bb: number[]): boolean {
  const [minX, minY, maxX, maxY] = bb;
  if (![minX, minY, maxX, maxY].every((n) => Number.isFinite(n))) return false;
  if (Math.abs(minX) > 180 || Math.abs(maxX) > 180) return false;
  if (Math.abs(minY) > 90 || Math.abs(maxY) > 90) return false;
  return true;
}

/** Limites do raster na unidade do CRS (geokeys ou origem/resolução). */
export function readRasterBoundingBox(image: GeoTIFFImage): number[] {
  try {
    const bb = image.getBoundingBox();
    if (bb.length >= 4 && bb.every((n) => Number.isFinite(n))) return bb;
  } catch {
    /* origem + resolução */
  }

  const origin = image.getOrigin();
  const resolution = image.getResolution();
  if (!origin || !resolution) {
    throw new Error(
      "Este TIFF não tem georreferenciação legível (sem bounding box nem transformação). Exporte como GeoTIFF georreferenciado no QGIS.",
    );
  }

  const [ox, oy] = origin;
  const [rx, ry] = resolution;
  const w = image.getWidth();
  const h = image.getHeight();
  const xs = [ox, ox + w * rx];
  const ys = [oy, oy + h * ry];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

async function ensureProj4Definition(epsg: number): Promise<void> {
  const code = `EPSG:${epsg}`;
  if (proj4Cache.has(epsg) || proj4.defs(code)) {
    proj4Cache.add(epsg);
    return;
  }
  const bundled = BUNDLED_PROJ4[epsg];
  if (bundled) {
    proj4.defs(code, bundled);
    proj4Cache.add(epsg);
    return;
  }
  try {
    const res = await fetch(`https://epsg.io/${epsg}.proj4`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const def = (await res.text()).trim();
    if (!def || def.startsWith("<")) throw new Error("def inválida");
    proj4.defs(code, def);
    proj4Cache.add(epsg);
  } catch {
    throw new Error(
      `Não foi possível resolver o CRS EPSG:${epsg}. Exporte o raster em WGS 84 (EPSG:4326) no QGIS ou use um CRS UTM/SIRGAS comum no Brasil.`,
    );
  }
}

export type Wgs84Bounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

/** Converte o retângulo do raster (CRS de origem) para limites WGS84 para o Leaflet. */
export function bboxLooksProjectedMeters(bb: number[]): boolean {
  const [minX, minY, maxX, maxY] = bb;
  const spanX = Math.abs(maxX - minX);
  const spanY = Math.abs(maxY - minY);
  return spanX > 500 || spanY > 500;
}

export async function resolveGeotiffWgs84Bounds(
  image: GeoTIFFImage,
): Promise<{ bounds: Wgs84Bounds; crs: GeotiffCrsInfo }> {
  const epsg = epsgFromGeoTiffImage(image);
  const bbox = readRasterBoundingBox(image);
  const [minX, minY, maxX, maxY] = bbox;
  const label = crsLabel(epsg);

  if (epsg === 4326 && !bboxLooksLikeWgs84Degrees(bbox) && bboxLooksProjectedMeters(bbox)) {
    throw new Error(
      "O GeoTIFF parece estar em metros (UTM/projetado) mas não declara o CRS nas geokeys. No QGIS: camada → Exportar → Guardar como raster → marque CRS (ex. SIRGAS UTM) ou exporte em WGS 84 (EPSG:4326).",
    );
  }

  const geographic =
    isGeographicEpsg(epsg) && bboxLooksLikeWgs84Degrees(bbox);

  if (geographic && bboxLooksLikeWgs84Degrees(bbox)) {
    return {
      bounds: {
        west: Math.min(minX, maxX),
        east: Math.max(minX, maxX),
        south: Math.min(minY, maxY),
        north: Math.max(minY, maxY),
      },
      crs: { epsg, label, geographic: true, reprojected: false },
    };
  }

  if (geographic && !bboxLooksLikeWgs84Degrees(bbox)) {
    throw new Error(
      `O ficheiro declara ${label}, mas os limites numéricos não parecem graus. Verifique a exportação no QGIS.`,
    );
  }

  await ensureProj4Definition(epsg);
  const src = `EPSG:${epsg}`;
  const corners: Array<[number, number]> = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
  const latLng = corners.map(([x, y]) => {
    const [lng, lat] = proj4(src, WGS84, [x, y]) as [number, number];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error(`Falha ao converter coordenadas de ${label} para WGS84.`);
    }
    return { lat, lng };
  });

  return {
    bounds: {
      south: Math.min(...latLng.map((p) => p.lat)),
      north: Math.max(...latLng.map((p) => p.lat)),
      west: Math.min(...latLng.map((p) => p.lng)),
      east: Math.max(...latLng.map((p) => p.lng)),
    },
    crs: { epsg, label, geographic: false, reprojected: true },
  };
}
