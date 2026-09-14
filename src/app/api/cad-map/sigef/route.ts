import { NextRequest, NextResponse } from "next/server";
import { parseBbox4326, parseMapDimensions } from "@/lib/cad-map/fetch-map-image";
import { fetchSigefMapImage } from "@/lib/cad-map/fetch-sigef-map-image";
import { normalizeSigefUf, parseSigefMapLayerKeys } from "@/lib/cad-map/overlay-sources";
import { isBboxInBrazil } from "@/lib/rtk-validation/cad/map-bbox";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const bbox = parseBbox4326(searchParams.get("bbox"));
  const layerIds = parseSigefMapLayerKeys(searchParams.get("layers"));
  const uf = normalizeSigefUf(searchParams.get("uf"));
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
    const mapResult = await fetchSigefMapImage(layerIds, uf, bbox, width, height);

    if (mapResult === "empty") {
      return NextResponse.json(
        { error: "Nenhuma parcela SIGEF nesta área — aproxime o zoom ou altere a UF." },
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
      { error: "Serviço SIGEF/INCRA indisponível nesta extensão." },
      { status: 502 },
    );
  } catch {
    return NextResponse.json({ error: "Falha ao consultar SIGEF." }, { status: 502 });
  }
}
