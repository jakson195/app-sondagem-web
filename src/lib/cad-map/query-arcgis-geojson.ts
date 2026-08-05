import "server-only";

import { fetchGeoService } from "@/lib/cad-map/anm-fetch";
import { bboxToEnvelopeJson } from "@/lib/rtk-validation/cad/import-map-overlay";
import type { Bbox4326 } from "@/lib/cad-map/fetch-map-image";

export type ArcGisQueryResult =
  | { ok: true; collection: GeoJSON.FeatureCollection; truncated?: boolean }
  | { ok: false; reason: "http" | "arcgis" | "network" | "empty"; message: string };

export async function queryArcGisGeoJsonDetailed(
  queryLayerUrl: string,
  bbox: Bbox4326,
  outFields = "OBJECTID",
): Promise<ArcGisQueryResult> {
  const url = new URL(`${queryLayerUrl.replace(/\/$/, "")}/query`);
  url.searchParams.set("geometry", bboxToEnvelopeJson(bbox));
  url.searchParams.set("geometryType", "esriGeometryEnvelope");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("returnGeometry", "true");
  if (outFields) url.searchParams.set("outFields", outFields);
  url.searchParams.set("f", "geojson");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetchGeoService(url.toString(), {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "DatageoNTRIP-CAD/1.0" },
    });
    if (!res.ok) {
      return {
        ok: false,
        reason: "http",
        message: `Serviço retornou HTTP ${res.status}.`,
      };
    }

    const data = (await res.json()) as GeoJSON.FeatureCollection & {
      error?: { message?: string };
      exceededTransferLimit?: boolean;
      properties?: { exceededTransferLimit?: boolean };
    };
    if (data?.error?.message) {
      return { ok: false, reason: "arcgis", message: data.error.message };
    }
    if (!data || !Array.isArray(data.features)) {
      return { ok: false, reason: "empty", message: "Resposta inválida do serviço." };
    }
    const truncated =
      data.exceededTransferLimit === true ||
      data.properties?.exceededTransferLimit === true;
    return { ok: true, collection: data, truncated };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Consulta expirou — aproxime o zoom e tente novamente."
        : "Falha de conexão com o serviço geoespacial.";
    return { ok: false, reason: "network", message };
  } finally {
    clearTimeout(timer);
  }
}

export async function queryArcGisGeoJson(
  queryLayerUrl: string,
  bbox: Bbox4326,
  outFields = "OBJECTID",
): Promise<GeoJSON.FeatureCollection | null> {
  const result = await queryArcGisGeoJsonDetailed(queryLayerUrl, bbox, outFields);
  return result.ok ? result.collection : null;
}
