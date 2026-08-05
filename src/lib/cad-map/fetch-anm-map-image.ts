import "server-only";

import type { Bbox4326, MapImageResult } from "./fetch-map-image";
import { fetchAnmGeoService } from "./anm-fetch";

const ANM_FETCH_INIT = {
  headers: {
    Accept: "image/png,image/jpeg,*/*",
    "User-Agent": "DatageoNTRIP-CAD/1.0",
  },
} as const;

/** PNG quase vazio (só transparência) costuma ter < 4 KB. */
const MIN_ANM_MAP_BYTES = 4096;

export type AnmMapImageOutcome = MapImageResult | "empty" | null;

/** Export/WMS ANM com TLS tolerante (geo.anm.gov.br). */
export async function fetchAnmSigmineMapImage(
  mapServerBase: string,
  wmsBase: string,
  layerIds: string[],
  bbox: Bbox4326,
  width: number,
  height: number,
): Promise<AnmMapImageOutcome> {
  const exportUrl = buildAnmExportUrl(mapServerBase, layerIds, bbox, width, height);
  const exportResult = await fetchAnmMapImageUrl(exportUrl);
  if (exportResult === "empty" || exportResult) return exportResult;

  const wmsUrl = buildAnmWmsUrl(wmsBase, layerIds, bbox, width, height);
  return fetchAnmMapImageUrl(wmsUrl);
}

function buildAnmExportUrl(
  mapServerBase: string,
  layerIds: string[],
  bbox: Bbox4326,
  width: number,
  height: number,
): string {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const url = new URL(`${mapServerBase.replace(/\/$/, "")}/export`);
  url.searchParams.set("bbox", `${minLon},${minLat},${maxLon},${maxLat}`);
  url.searchParams.set("bboxSR", "4326");
  url.searchParams.set("imageSR", "4326");
  url.searchParams.set("size", `${Math.round(width)},${Math.round(height)}`);
  url.searchParams.set("format", "png");
  url.searchParams.set("transparent", "true");
  url.searchParams.set("layers", `show:${layerIds.join(",")}`);
  url.searchParams.set("f", "image");
  return url.toString();
}

function buildAnmWmsUrl(
  wmsBase: string,
  layerIds: string[],
  bbox: Bbox4326,
  width: number,
  height: number,
): string {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const url = new URL(wmsBase);
  url.searchParams.set("service", "WMS");
  url.searchParams.set("version", "1.1.1");
  url.searchParams.set("request", "GetMap");
  url.searchParams.set("layers", layerIds.join(","));
  url.searchParams.set("styles", "");
  url.searchParams.set("bbox", `${minLon},${minLat},${maxLon},${maxLat}`);
  url.searchParams.set("width", String(Math.round(width)));
  url.searchParams.set("height", String(Math.round(height)));
  url.searchParams.set("srs", "EPSG:4326");
  url.searchParams.set("format", "image/png");
  url.searchParams.set("transparent", "true");
  return url.toString();
}

async function fetchAnmMapImageUrl(url: string): Promise<AnmMapImageOutcome> {
  let upstream: Response;
  try {
    upstream = await fetchAnmGeoService(url, ANM_FETCH_INIT);
  } catch {
    return null;
  }
  if (!upstream.ok) return null;
  const contentType = upstream.headers.get("content-type") ?? "";
  const body = await upstream.arrayBuffer();
  if (body.byteLength < MIN_ANM_MAP_BYTES) return "empty";
  if (!contentType.includes("image") && body.byteLength < 16) return null;
  return { body, contentType: contentType.includes("image") ? contentType : "image/png" };
}
