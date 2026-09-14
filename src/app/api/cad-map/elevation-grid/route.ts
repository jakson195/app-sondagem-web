import { NextRequest, NextResponse } from "next/server";
import {
  fetchDemElevations,
  isGoogleElevationConfigured,
  probeGoogleElevation,
  type DemElevationSource,
} from "@/lib/geofisica/geodata/fetch-elevation-dem";

export async function GET(request: NextRequest) {
  const test = request.nextUrl.searchParams.get("test") === "1";
  const payload = {
    ok: true,
    googleConfigured: isGoogleElevationConfigured(),
    sources: ["google", "opentopo", "auto"] as const,
  };
  if (!test) return NextResponse.json(payload);
  const googleTest = await probeGoogleElevation();
  return NextResponse.json({ ...payload, googleTest });
}

export async function POST(request: NextRequest) {
  let body: {
    locations?: { lat: number; lng: number }[];
    source?: DemElevationSource;
  };
  try {
    body = (await request.json()) as {
      locations?: { lat: number; lng: number }[];
      source?: DemElevationSource;
    };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const locations = body.locations ?? [];
  const source: DemElevationSource = body.source ?? "auto";
  if (locations.length === 0) {
    return NextResponse.json({ error: "Lista de pontos vazia." }, { status: 400 });
  }
  if (locations.length > 1600) {
    return NextResponse.json({ error: "Máximo 1600 pontos por consulta DEM." }, { status: 400 });
  }

  for (const p of locations) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) {
      return NextResponse.json({ error: "Coordenadas lat/lng inválidas." }, { status: 400 });
    }
    if (p.lat < -35 || p.lat > 6 || p.lng < -75 || p.lng > -30) {
      return NextResponse.json({ error: "Área fora do Brasil." }, { status: 400 });
    }
  }

  if (source === "google" && !isGoogleElevationConfigured()) {
    return NextResponse.json(
      {
        error:
          "Google Elevation indisponível. Configure GOOGLE_MAPS_API_KEY com a Elevation API activada.",
      },
      { status: 503 },
    );
  }

  try {
    const result = await fetchDemElevations(locations, source);
    const valid = result.points.filter((p) => p.elevationM != null).length;
    const minValid =
      source === "google"
        ? Math.max(4, Math.round(locations.length * 0.2))
        : Math.max(4, Math.round(locations.length * 0.25));
    if (valid < minValid) {
      return NextResponse.json(
        {
          error:
            source === "google"
              ? "Google Earth não devolveu cotas suficientes para esta área."
              : "Poucas cotas DEM válidas para esta área.",
          detail: `${valid} de ${locations.length} pontos com cota válida.`,
          validCount: valid,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      points: result.points,
      source: result.source,
      dataset: result.dataset,
      validCount: valid,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[elevation-grid]", source, detail);
    return NextResponse.json(
      {
        error:
          source === "google"
            ? "Google Earth indisponível."
            : "Serviço DEM indisponível.",
        detail,
      },
      { status: 502 },
    );
  }
}
