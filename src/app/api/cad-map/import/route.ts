import { NextRequest, NextResponse } from "next/server";
import { parseBbox4326 } from "@/lib/cad-map/fetch-map-image";
import {
  ANM_SIGMINE_LAYERS,
  anmQueryLayerUrl,
  isAnmSigmineLayerKey,
} from "@/lib/cad-map/overlay-sources";
import {
  cadLayerForAnmKey,
  geoJsonToOverlayEntities,
} from "@/lib/rtk-validation/cad/import-map-overlay";
import { queryArcGisGeoJsonDetailed } from "@/lib/cad-map/query-arcgis-geojson";
import { createCadGeorefContext } from "@/lib/rtk-validation/cad/georef";
import { isBboxInBrazil } from "@/lib/rtk-validation/cad/map-bbox";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const source = searchParams.get("source");
  const anmLayerKey = searchParams.get("anmLayer");
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

  if (source !== "anm") {
    return NextResponse.json({ error: "Parâmetro source inválido (anm)." }, { status: 400 });
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

    const layerDef = cadLayerForAnmKey(layerKey);
    return NextResponse.json({
      source,
      anmLayer: layerKey,
      features: collection.features.length,
      entities,
      layer: layerDef,
      truncated: query.truncated === true,
    });
  } catch {
    return NextResponse.json({ error: "Falha ao importar dados geoespaciais." }, { status: 502 });
  }
}
