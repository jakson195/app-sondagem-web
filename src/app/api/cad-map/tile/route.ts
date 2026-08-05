import { NextRequest, NextResponse } from "next/server";
import { satelliteTileUrl } from "@/lib/rtk-validation/cad/map-tiles";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const z = Number(searchParams.get("z"));
  const x = Number(searchParams.get("x"));
  const y = Number(searchParams.get("y"));
  const source = searchParams.get("source") ?? "esri";

  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 22) {
    return NextResponse.json({ error: "Parâmetros z/x/y inválidos." }, { status: 400 });
  }

  const maxIndex = 2 ** z;
  if (x < 0 || y < 0 || x >= maxIndex || y >= maxIndex) {
    return NextResponse.json({ error: "Tile fora do intervalo." }, { status: 400 });
  }

  const upstreamUrl =
    source === "esri"
      ? satelliteTileUrl(z, x, y)
      : `https://mt1.google.com/vt/lyrs=s&hl=pt-BR&x=${x}&y=${y}&z=${z}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: "image/*",
        "User-Agent": "DatageoNTRIP-CAD/1.0",
      },
      next: { revalidate: 86400 },
    });

    if (!upstream.ok) {
      if (source !== "esri") {
        const fallback = await fetch(satelliteTileUrl(z, x, y), { next: { revalidate: 86400 } });
        if (fallback.ok) {
          const body = await fallback.arrayBuffer();
          return new NextResponse(body, {
            headers: {
              "Content-Type": fallback.headers.get("content-type") ?? "image/jpeg",
              "Cache-Control": "public, max-age=86400",
            },
          });
        }
      }
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
