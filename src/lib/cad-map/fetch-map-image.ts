export type Bbox4326 = [minLon: number, minLat: number, maxLon: number, maxLat: number];

export function parseBbox4326(raw: string | null): Bbox4326 | null {
  if (!raw) return null;
  const parts = raw.split(",").map((v) => Number(v.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [minLon, minLat, maxLon, maxLat] = parts;
  if (minLon >= maxLon || minLat >= maxLat) return null;
  if (minLon < -180 || maxLon > 180 || minLat < -90 || maxLat > 90) return null;
  return [minLon, minLat, maxLon, maxLat];
}

export type MapImageResult = { body: ArrayBuffer; contentType: string };

const FETCH_TIMEOUT_MS = 45_000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isImageResponse(contentType: string, body: ArrayBuffer): boolean {
  if (contentType.includes("image")) return body.byteLength >= 200;
  if (body.byteLength < 16) return false;
  const head = new Uint8Array(body.slice(0, 8));
  // PNG signature
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return true;
  // JPEG
  if (head[0] === 0xff && head[1] === 0xd8) return true;
  return false;
}

export async function fetchWmsMap(
  wmsBase: string,
  layers: string,
  bbox: Bbox4326,
  width: number,
  height: number,
  options?: { version?: string; srs?: string },
): Promise<MapImageResult | null> {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const version = options?.version ?? "1.1.1";
  const srs = options?.srs ?? "EPSG:4326";
  const url = new URL(wmsBase);
  url.searchParams.set("service", "WMS");
  url.searchParams.set("version", version);
  url.searchParams.set("request", "GetMap");
  url.searchParams.set("layers", layers);
  url.searchParams.set("styles", "");
  url.searchParams.set("bbox", `${minLon},${minLat},${maxLon},${maxLat}`);
  url.searchParams.set("width", String(Math.round(width)));
  url.searchParams.set("height", String(Math.round(height)));
  url.searchParams.set("srs", srs);
  url.searchParams.set("format", "image/png");
  url.searchParams.set("transparent", "true");

  const upstream = await fetchWithTimeout(url.toString(), {
    headers: {
      Accept: "image/png,image/jpeg,*/*",
      "User-Agent": "DatageoNTRIP-CAD/1.0",
    },
    next: { revalidate: 300 },
  });

  if (!upstream.ok) return null;
  const contentType = upstream.headers.get("content-type") ?? "";
  const body = await upstream.arrayBuffer();
  if (!isImageResponse(contentType, body)) return null;
  return { body, contentType: contentType.includes("image") ? contentType : "image/png" };
}

export async function fetchArcGisWmsMap(
  wmsBase: string,
  layers: string,
  bbox: Bbox4326,
  width: number,
  height: number,
): Promise<MapImageResult | null> {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const url = new URL(wmsBase);
  url.searchParams.set("service", "WMS");
  url.searchParams.set("version", "1.1.1");
  url.searchParams.set("request", "GetMap");
  url.searchParams.set("layers", layers);
  url.searchParams.set("styles", "");
  url.searchParams.set("bbox", `${minLon},${minLat},${maxLon},${maxLat}`);
  url.searchParams.set("width", String(Math.round(width)));
  url.searchParams.set("height", String(Math.round(height)));
  url.searchParams.set("srs", "EPSG:4326");
  url.searchParams.set("format", "image/png");
  url.searchParams.set("transparent", "true");

  const upstream = await fetchWithTimeout(url.toString(), {
    headers: {
      Accept: "image/png,image/jpeg,*/*",
      "User-Agent": "DatageoNTRIP-CAD/1.0",
    },
    next: { revalidate: 300 },
  });

  if (!upstream.ok) return null;
  const contentType = upstream.headers.get("content-type") ?? "";
  const body = await upstream.arrayBuffer();
  if (!isImageResponse(contentType, body)) return null;
  return { body, contentType: contentType.includes("image") ? contentType : "image/png" };
}

export async function fetchArcGisExportMap(
  mapServerBase: string,
  layerIds: string | string[],
  bbox: Bbox4326,
  width: number,
  height: number,
): Promise<MapImageResult | null> {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const ids = (Array.isArray(layerIds) ? layerIds : [layerIds]).filter(Boolean);
  if (ids.length === 0) return null;
  const url = new URL(`${mapServerBase.replace(/\/$/, "")}/export`);
  url.searchParams.set("bbox", `${minLon},${minLat},${maxLon},${maxLat}`);
  url.searchParams.set("bboxSR", "4326");
  url.searchParams.set("imageSR", "4326");
  url.searchParams.set("size", `${Math.round(width)},${Math.round(height)}`);
  url.searchParams.set("format", "png");
  url.searchParams.set("transparent", "true");
  url.searchParams.set("layers", `show:${ids.join(",")}`);
  url.searchParams.set("f", "image");

  const upstream = await fetchWithTimeout(url.toString(), {
    headers: {
      Accept: "image/png,image/jpeg,*/*",
      "User-Agent": "DatageoNTRIP-CAD/1.0",
    },
    next: { revalidate: 3600 },
  });

  if (!upstream.ok) return null;
  const contentType = upstream.headers.get("content-type") ?? "";
  const body = await upstream.arrayBuffer();
  if (!isImageResponse(contentType, body)) return null;
  return { body, contentType: contentType.includes("image") ? contentType : "image/png" };
}

export function parseMapDimensions(
  widthRaw: string | null,
  heightRaw: string | null,
): { width: number; height: number } {
  const width = Math.min(1600, Math.max(256, Number(widthRaw) || 1024));
  const height = Math.min(1600, Math.max(256, Number(heightRaw) || 768));
  return { width, height };
}
