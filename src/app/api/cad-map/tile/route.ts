import { NextRequest, NextResponse } from "next/server";
import { mapboxSatelliteTileUrl } from "@/lib/mapbox-config";
import { esriSatelliteTileUrl } from "@/lib/rtk-validation/cad/map-tiles";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const z = Number(searchParams.get("z"));
  const x = Number(searchParams.get("x"));
  const y = Number(searchParams.get("y"));
  const source = searchParams.get("source") ?? "mapbox";
  const mapType = searchParams.get("type") ?? "satellite";
  const googleLyrs =
    mapType === "hybrid" ? "y" : mapType === "roadmap" ? "m" : mapType === "terrain" ? "p" : "s";

  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 22) {
    return NextResponse.json({ error: "Parâmetros z/x/y inválidos." }, { status: 400 });
  }

  const maxIndex = 2 ** z;
  if (x < 0 || y < 0 || x >= maxIndex || y >= maxIndex) {
    return NextResponse.json({ error: "Tile fora do intervalo." }, { status: 400 });
  }

  const googleUrl = `https://mt1.google.com/vt/lyrs=${googleLyrs}&hl=pt-BR&x=${x}&y=${y}&z=${z}`;
  const esriUrl = esriSatelliteTileUrl(z, x, y);
  const osmUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  const upstreamUrl =
    source === "esri" ? esriUrl : source === "google" ? googleUrl : mapboxSatelliteTileUrl(z, x, y);
  const fallbackUrl = mapType === "roadmap" ? osmUrl : esriUrl;

  if (!upstreamUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_MAPBOX_TOKEN não configurado." },
      { status: 503 },
    );
  }

  const tileHeaders = {
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Referer: source === "google" ? "https://www.google.com/" : "https://www.openstreetmap.org/",
  };

  try {
    let upstream = await fetch(upstreamUrl, {
      headers: tileHeaders,
      next: { revalidate: 86400 },
    });

    if (!upstream.ok && source !== "esri") {
      const fallback = await fetch(fallbackUrl, {
        headers: tileHeaders,
        next: { revalidate: 86400 },
      });
      if (fallback.ok) upstream = fallback;
    }

    if (!upstream.ok) {
      return NextResponse.json({ error: "Tile indisponível." }, { status: 502 });
    }

    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Falha ao carregar tile." }, { status: 502 });
  }
}
