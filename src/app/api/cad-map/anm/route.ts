import { NextRequest, NextResponse } from "next/server";
import { parseBbox4326, parseMapDimensions } from "@/lib/cad-map/fetch-map-image";
import { fetchAnmSigmineMapImage } from "@/lib/cad-map/fetch-anm-map-image";
import {
  ANM_SIGMINE_MAPSERVER,
  ANM_SIGMINE_WMS,
  parseAnmMapLayerIds,
} from "@/lib/cad-map/overlay-sources";
import { isBboxInBrazil } from "@/lib/rtk-validation/cad/map-bbox";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const bbox = parseBbox4326(searchParams.get("bbox"));
  const layerIds = parseAnmMapLayerIds(searchParams.get("layers"));
  const { width, height } = parseMapDimensions(
    searchParams.get("width"),
    searchParams.get("height"),
  );

  if (!bbox) {
    return NextResponse.json({ error: "Parâmetro bbox inválido." }, { status: 400 });
  }

  const [minLon, minLat, maxLon, maxLat] = bbox;
  if (!isBboxInBrazil({ minLon, minLat, maxLon, maxLat })) {
    return NextResponse.json(
      { error: "Área fora do Brasil — ajuste o zoom ou importe pontos RTK." },
      { status: 400 },
    );
  }

  try {
    const mapResult = await fetchAnmSigmineMapImage(
      ANM_SIGMINE_MAPSERVER,
      ANM_SIGMINE_WMS,
      layerIds,
      bbox,
      width,
      height,
    );

    if (mapResult === "empty") {
      return NextResponse.json(
        {
          error:
            "Nenhum processo minerário nesta área — aproxime o zoom ou navegue até a região com dados ANM.",
        },
        { status: 404 },
      );
    }

    if (mapResult) {
      return new NextResponse(mapResult.body, {
        headers: {
          "Content-Type": mapResult.contentType,
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    return NextResponse.json(
      { error: "Serviço ANM/SIGMINE indisponível nesta extensão." },
      { status: 502 },
    );
  } catch {
    return NextResponse.json({ error: "Falha ao consultar ANM/SIGMINE." }, { status: 502 });
  }
}
