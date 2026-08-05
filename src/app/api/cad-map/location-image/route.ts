import { NextRequest, NextResponse } from "next/server";
import {
  fetchLocationMapImage,
  isLocationMapBoundsValid,
  type LocationMapStyle,
} from "@/lib/cad-map/location-map-image";

export const runtime = "nodejs";

function parseStyle(raw: string | null): LocationMapStyle {
  if (raw === "street" || raw === "topo" || raw === "satellite") return raw;
  return "satellite";
}

function parseSwapEn(raw: string | null): boolean {
  return raw === "1" || raw === "true" || raw === "yes";
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const minX = Number(searchParams.get("minX"));
  const maxX = Number(searchParams.get("maxX"));
  const minY = Number(searchParams.get("minY"));
  const maxY = Number(searchParams.get("maxY"));
  const zone = Number(searchParams.get("zone"));
  const swapEn = parseSwapEn(searchParams.get("swapEn"));
  const width = Math.min(1280, Math.max(160, Number(searchParams.get("width")) || 640));
  const height = Math.min(1280, Math.max(120, Number(searchParams.get("height")) || 440));
  const style = parseStyle(searchParams.get("style"));

  const bounds = { minX, maxX, minY, maxY };

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxY) ||
    maxX <= minX ||
    maxY <= minY ||
    !Number.isFinite(zone) ||
    zone < 18 ||
    zone > 25
  ) {
    return NextResponse.json({ error: "Parâmetros de bounds/zone inválidos." }, { status: 400 });
  }

  if (!isLocationMapBoundsValid(bounds)) {
    return NextResponse.json(
      { error: "Coordenadas UTM inválidas — importe pontos georreferenciados e enquadre o desenho." },
      { status: 400 },
    );
  }

  const georef = {
    utmZone: zone,
    eastingAxis: swapEn ? ("y" as const) : ("x" as const),
    northingAxis: swapEn ? ("x" as const) : ("y" as const),
  };

  try {
    const result = await fetchLocationMapImage(bounds, georef, width, height, style);

    if (!result) {
      return NextResponse.json({ error: "Mapa de localização indisponível." }, { status: 502 });
    }

    return new NextResponse(Buffer.from(result.body), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
        "X-Location-Map-Style": result.style,
      },
    });
  } catch {
    return NextResponse.json({ error: "Falha ao gerar mapa de localização." }, { status: 502 });
  }
}
