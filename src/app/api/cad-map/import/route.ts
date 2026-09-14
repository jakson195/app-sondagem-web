import { NextRequest, NextResponse } from "next/server";
import { parseBbox4326 } from "@/lib/cad-map/fetch-map-image";
import {
  ANM_SIGMINE_LAYERS,
  anmQueryLayerUrl,
  isAnmSigmineLayerKey,
  isSigefLayerKey,
  normalizeSigefUf,
  SIGEF_LAYERS,
} from "@/lib/cad-map/overlay-sources";
import {
  cadLayerForAnmKey,
  cadLayerForSigefKey,
  geoJsonToOverlayEntities,
} from "@/lib/rtk-validation/cad/import-map-overlay";
import { queryArcGisGeoJsonDetailed } from "@/lib/cad-map/query-arcgis-geojson";
import { querySigefGeoJson } from "@/lib/cad-map/query-sigef-geojson";
import { createCadGeorefContext } from "@/lib/rtk-validation/cad/georef";
import { isBboxInBrazil } from "@/lib/rtk-validation/cad/map-bbox";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const source = searchParams.get("source");
  const anmLayerKey = searchParams.get("anmLayer");
  const sigefLayerKey = searchParams.get("sigefLayer");
  const bbox = parseBbox4326(searchParams.get("bbox"));
  const utmZoneRaw = Number(searchParams.get("utmZone"));
  const utmZone = Number.isFinite(utmZoneRaw) ? utmZoneRaw : 23;
  const swapEn = searchParams.get("swapEn") === "1";
  const georef = createCadGeorefContext(
    utmZone,
    swapEn ? "y" : "x",
    swapEn ? "x" : "y",
    true,
  );

  if (source !== "anm" && source !== "sigef") {
    return NextResponse.json({ error: "Parâmetro source inválido (anm ou sigef)." }, { status: 400 });
  }
  if (!bbox) {
    return NextResponse.json({ error: "Parâmetro bbox inválido." }, { status: 400 });
  }

  const [minLon, minLat, maxLon, maxLat] = bbox;
  if (!isBboxInBrazil({ minLon, minLat, maxLon, maxLat })) {
    return NextResponse.json(
      { error: "Área fora do Brasil — importe pontos RTK e use Enquadrar." },
      { status: 400 },
    );
  }

  const spanLon = maxLon - minLon;
  const spanLat = maxLat - minLat;
  if (spanLon > 1.2 || spanLat > 1.2) {
    return NextResponse.json(
      { error: "Área muito grande — aproxime o zoom antes de importar." },
      { status: 400 },
    );
  }

  try {
    if (source === "sigef") {
      const layerKey = sigefLayerKey && isSigefLayerKey(sigefLayerKey) ? sigefLayerKey : "particular";
      const uf = normalizeSigefUf(searchParams.get("uf"));
      const def = SIGEF_LAYERS[layerKey];
      const query = await querySigefGeoJson(layerKey, uf, bbox);

      if (!query.ok) {
        return NextResponse.json({ error: query.message }, { status: 502 });
      }

      const collection = query.collection;
      if (collection.features.length === 0) {
        return NextResponse.json(
          { error: "Nenhuma parcela SIGEF na área visível.", features: 0, entities: [] },
          { status: 404 },
        );
      }

      const entities = geoJsonToOverlayEntities(collection, def.cadLayerId, `sigef_${layerKey}`, georef);
      if (entities.length === 0) {
        return NextResponse.json(
          {
            error: "Geometrias não suportadas nesta camada.",
            features: collection.features.length,
            entities: [],
          },
          { status: 422 },
        );
      }

      return NextResponse.json({
        source,
        sigefLayer: layerKey,
        uf,
        features: collection.features.length,
        entities,
        layer: cadLayerForSigefKey(layerKey),
      });
    }

    const layerKey = anmLayerKey && isAnmSigmineLayerKey(anmLayerKey) ? anmLayerKey : "processos";
    const def = ANM_SIGMINE_LAYERS[layerKey];
    const query = await queryArcGisGeoJsonDetailed(
      anmQueryLayerUrl(def.mapLayerId),
      bbox,
      def.outFields,
    );

    if (!query.ok) {
      return NextResponse.json({ error: query.message }, { status: 502 });
    }

    const collection = query.collection;
    if (collection.features.length === 0) {
      return NextResponse.json(
        { error: "Nenhum dado encontrado na área visível.", features: 0, entities: [] },
        { status: 404 },
      );
    }

    const entities = geoJsonToOverlayEntities(
      collection,
      def.cadLayerId,
      `anm_${def.mapLayerId}`,
      georef,
    );
    if (entities.length === 0) {
      return NextResponse.json(
        { error: "Geometrias não suportadas nesta camada.", features: collection.features.length, entities: [] },
        { status: 422 },
      );
    }

    return NextResponse.json({
      source,
      anmLayer: layerKey,
      features: collection.features.length,
      entities,
      layer: cadLayerForAnmKey(layerKey),
      truncated: query.truncated === true,
    });
  } catch {
    return NextResponse.json({ error: "Falha ao importar dados geoespaciais." }, { status: 502 });
  }
}
