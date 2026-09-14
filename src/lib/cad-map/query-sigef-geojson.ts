import "server-only";

import type { Bbox4326 } from "./fetch-map-image";
import { SIGEF_I3GEO_OGC, type SigefLayerKey, sigefTema } from "./sigef-layers";

const FETCH_INIT = {
  headers: {
    Accept: "application/json,application/geo+json,text/xml,application/xml,*/*",
    "User-Agent": "DataGeo-CAD/1.0",
  },
} as const;

function bboxParam(bbox: Bbox4326): string {
  return bbox.map((n) => n.toFixed(6)).join(",");
}

function asFeatureCollection(raw: unknown): GeoJSON.FeatureCollection | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as GeoJSON.FeatureCollection;
  if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) return obj;
  if ((raw as GeoJSON.Feature).type === "Feature") {
    return { type: "FeatureCollection", features: [raw as GeoJSON.Feature] };
  }
  return null;
}

function parseGmlCoordinates(gml: string): GeoJSON.Position[][] {
  const rings: GeoJSON.Position[][] = [];
  const coordBlocks = [
    ...gml.matchAll(/<gml:coordinates[^>]*>([\s\S]*?)<\/gml:coordinates>/gi),
    ...gml.matchAll(/<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/gi),
  ];
  for (const match of coordBlocks) {
    const raw = match[1].trim();
    if (!raw) continue;
    const nums = raw
      .replace(/,/g, " ")
      .split(/\s+/)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    if (nums.length < 6) continue;
    const ring: GeoJSON.Position[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const a = nums[i];
      const b = nums[i + 1];
      const lon = Math.abs(a) >= Math.abs(b) ? a : b;
      const lat = Math.abs(a) >= Math.abs(b) ? b : a;
      ring.push([lon, lat]);
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

function gmlToCollection(gml: string, tema: string): GeoJSON.FeatureCollection | null {
  const rings = parseGmlCoordinates(gml);
  if (rings.length === 0) return null;
  return {
    type: "FeatureCollection",
    features: rings.map((ring, i) => ({
      type: "Feature",
      properties: { name: `Parcela SIGEF ${i + 1}`, tema },
      geometry: { type: "Polygon", coordinates: [ring] },
    })),
  };
}

function withTema(collection: GeoJSON.FeatureCollection, tema: string): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) => ({
      ...feature,
      properties: { tema, ...(feature.properties ?? {}) },
    })),
  };
}

async function fetchWfs(url: string, tema: string): Promise<GeoJSON.FeatureCollection | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(url, { ...FETCH_INIT, signal: controller.signal });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();
    if (contentType.includes("json") || text.trim().startsWith("{")) {
      try {
        return asFeatureCollection(JSON.parse(text));
      } catch {
        return null;
      }
    }
    return gmlToCollection(text, tema);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function querySigefGeoJson(
  layer: SigefLayerKey,
  uf: string,
  bbox: Bbox4326,
): Promise<{ ok: true; collection: GeoJSON.FeatureCollection } | { ok: false; message: string }> {
  const tema = sigefTema(layer, uf);
  const bboxStr = bboxParam(bbox);

  const geoJsonUrl = new URL(SIGEF_I3GEO_OGC);
  geoJsonUrl.searchParams.set("tema", tema);
  geoJsonUrl.searchParams.set("SERVICE", "WFS");
  geoJsonUrl.searchParams.set("VERSION", "1.0.0");
  geoJsonUrl.searchParams.set("REQUEST", "GetFeature");
  geoJsonUrl.searchParams.set("TYPENAME", tema);
  geoJsonUrl.searchParams.set("BBOX", bboxStr);
  geoJsonUrl.searchParams.set("SRSNAME", "EPSG:4326");
  geoJsonUrl.searchParams.set("OUTPUTFORMAT", "application/json");
  geoJsonUrl.searchParams.set("MAXFEATURES", "80");

  const json = await fetchWfs(geoJsonUrl.toString(), tema);
  if (json?.features.length) return { ok: true, collection: withTema(json, tema) };

  const gmlUrl = new URL(SIGEF_I3GEO_OGC);
  gmlUrl.searchParams.set("tema", tema);
  gmlUrl.searchParams.set("SERVICE", "WFS");
  gmlUrl.searchParams.set("VERSION", "1.0.0");
  gmlUrl.searchParams.set("REQUEST", "GetFeature");
  gmlUrl.searchParams.set("TYPENAME", tema);
  gmlUrl.searchParams.set("BBOX", bboxStr);
  gmlUrl.searchParams.set("SRSNAME", "EPSG:4326");
  gmlUrl.searchParams.set("MAXFEATURES", "80");

  const gml = await fetchWfs(gmlUrl.toString(), tema);
  if (gml?.features.length) return { ok: true, collection: withTema(gml, tema) };

  return {
    ok: false,
    message: "Nenhuma parcela SIGEF na área visível (ou o serviço INCRA não respondeu).",
  };
}
