/**
 * Consulta cotas a serviços DEM públicos (Google Elevation, OpenTopoData SRTM/ASTER, USGS EPQS).
 */

export type DemElevationPoint = {
  lat: number;
  lng: number;
  stationM?: number;
  elevationM: number | null;
  /** Resolução estimada da amostra (m), quando disponível. */
  resolutionM?: number | null;
};

export type DemFetchResult = {
  points: DemElevationPoint[];
  dataset: string;
  source: string;
};

export type DemElevationSource = "auto" | "google" | "opentopo";

const OPENTOPO_DATASETS = ["srtm30m", "aster30m"] as const;
const OPENTOPO_CHUNK_SIZE = 90;
/** URLs GET do Google têm limite prático — 128 pontos por pedido é seguro. */
const GOOGLE_CHUNK_SIZE = 128;

function roundCoord(n: number): number {
  return Math.round(n * 1e7) / 1e7;
}

function mapGoogleElevationError(status: string | undefined, errorMessage?: string): string {
  switch (status) {
    case "REQUEST_DENIED":
      return (
        errorMessage ??
        "Google recusou o pedido — active a Elevation API e a facturação no Google Cloud."
      );
    case "OVER_QUERY_LIMIT":
      return "Cota da Google Elevation API excedida — verifique facturação ou limites no Google Cloud.";
    case "OVER_DAILY_LIMIT":
      return "Limite diário da Google Elevation API atingido.";
    case "INVALID_REQUEST":
      return errorMessage ?? "Pedido inválido à Google Elevation API (coordenadas ou URL demasiado longa).";
    case "ZERO_RESULTS":
      return "Google não encontrou terreno para estas coordenadas.";
    default:
      return errorMessage ?? `Google Elevation: ${status ?? "erro desconhecido"}`;
  }
}

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      return res;
    } catch (e) {
      lastError = e;
      if (i + 1 < attempts) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
  }
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Falha de rede ao contactar Google Elevation (${msg}).`);
}

export function getGoogleMapsApiKey(): string | undefined {
  const key =
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    "";
  return key || undefined;
}

export function isGoogleElevationConfigured(): boolean {
  return Boolean(getGoogleMapsApiKey());
}

async function fetchGoogleElevationChunk(
  apiKey: string,
  chunk: { lat: number; lng: number; stationM?: number }[],
): Promise<DemElevationPoint[]> {
  const locStr = chunk
    .map((p) => `${roundCoord(p.lat)},${roundCoord(p.lng)}`)
    .join("|");
  const url =
    "https://maps.googleapis.com/maps/api/elevation/json?" +
    new URLSearchParams({ locations: locStr, key: apiKey }).toString();
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`Google Elevation API HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    status?: string;
    error_message?: string;
    results?: {
      elevation: number;
      location: { lat: number; lng: number };
      resolution: number;
    }[];
  };
  if (data.status !== "OK" || !data.results?.length) {
    throw new Error(mapGoogleElevationError(data.status, data.error_message));
  }
  if (data.results.length !== chunk.length) {
    throw new Error(
      `Google Elevation devolveu ${data.results.length} de ${chunk.length} cotas — reduza a área ou aproxime o zoom.`,
    );
  }
  return chunk.map((p, i) => {
    const row = data.results![i];
    const elevationM =
      row?.elevation != null && Number.isFinite(row.elevation) ? row.elevation : null;
    const resolutionM =
      row?.resolution != null && Number.isFinite(row.resolution) ? row.resolution : null;
    return { lat: p.lat, lng: p.lng, stationM: p.stationM, elevationM, resolutionM };
  });
}

/** Teste rápido da Google Elevation API (Belo Horizonte). */
export async function probeGoogleElevation(
  apiKey = getGoogleMapsApiKey(),
): Promise<{ ok: boolean; elevationM: number | null; dataset: string; message?: string }> {
  if (!apiKey) {
    return { ok: false, elevationM: null, dataset: "none", message: "GOOGLE_MAPS_API_KEY não configurada." };
  }
  try {
    const result = await fetchGoogleElevations([{ lat: -19.9167, lng: -43.9345 }], apiKey);
    const elevationM = result.points[0]?.elevationM ?? null;
    return {
      ok: elevationM != null,
      elevationM,
      dataset: result.dataset,
      message: elevationM != null ? undefined : "Google não devolveu cota para o ponto de teste.",
    };
  } catch (e) {
    return {
      ok: false,
      elevationM: null,
      dataset: "none",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Google Maps / Earth — terreno 3D (Elevation API). */
export async function fetchGoogleElevations(
  locations: { lat: number; lng: number; stationM?: number }[],
  apiKey = getGoogleMapsApiKey(),
): Promise<DemFetchResult> {
  if (!apiKey) {
    throw new Error("Chave Google Maps não configurada (GOOGLE_MAPS_API_KEY).");
  }
  const out: DemElevationPoint[] = [];
  for (let i = 0; i < locations.length; i += GOOGLE_CHUNK_SIZE) {
    const chunk = locations.slice(i, i + GOOGLE_CHUNK_SIZE);
    const part = await fetchGoogleElevationChunk(apiKey, chunk);
    out.push(...part);
  }
  const resolutions = out
    .map((p) => p.resolutionM)
    .filter((r): r is number => r != null && Number.isFinite(r));
  const avgRes =
    resolutions.length > 0
      ? Math.round(resolutions.reduce((a, b) => a + b, 0) / resolutions.length)
      : null;
  return {
    points: out,
    dataset: avgRes != null ? `Terreno ~${avgRes} m` : "Google Terreno 3D",
    source: "Google Earth / Maps",
  };
}

async function fetchOpenTopoChunk(
  dataset: string,
  chunk: { lat: number; lng: number; stationM?: number }[],
): Promise<DemElevationPoint[]> {
  const locStr = chunk.map((p) => `${p.lat},${p.lng}`).join("|");
  const url = `https://api.opentopodata.org/v1/${dataset}?locations=${encodeURIComponent(locStr)}`;
  const res = await fetch(url, {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(`OpenTopoData ${dataset} (${res.status})`);
  }
  const data = (await res.json()) as {
    results?: {
      elevation: number | null;
      location: { lat: number; lng: number };
    }[];
  };
  const results = data.results ?? [];
  return chunk.map((p, i) => ({
    lat: p.lat,
    lng: p.lng,
    stationM: p.stationM,
    elevationM:
      results[i]?.elevation != null && Number.isFinite(results[i]!.elevation)
        ? results[i]!.elevation!
        : null,
  }));
}

async function fetchOpenTopoDataset(
  dataset: string,
  locations: { lat: number; lng: number; stationM?: number }[],
): Promise<DemElevationPoint[]> {
  const out: DemElevationPoint[] = [];
  for (let i = 0; i < locations.length; i += OPENTOPO_CHUNK_SIZE) {
    const chunk = locations.slice(i, i + OPENTOPO_CHUNK_SIZE);
    const part = await fetchOpenTopoChunk(dataset, chunk);
    out.push(...part);
    if (i + OPENTOPO_CHUNK_SIZE < locations.length) {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }
  return out;
}

/** USGS 3DEP EPQS — fallback ponto a ponto. */
async function fetchEpqsElevation(
  lat: number,
  lng: number,
): Promise<number | null> {
  const url = `https://epqs.nationalmap.gov/v1/json?x=${lng}&y=${lat}&units=Meters&wkid=4326`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { value?: number | null };
  return data.value != null && Number.isFinite(data.value) ? data.value : null;
}

async function fillMissingWithEpqs(
  points: DemElevationPoint[],
): Promise<DemElevationPoint[]> {
  const out: DemElevationPoint[] = [];
  for (const p of points) {
    if (p.elevationM != null) {
      out.push(p);
      continue;
    }
    const elev = await fetchEpqsElevation(p.lat, p.lng);
    out.push({ ...p, elevationM: elev });
    await new Promise((r) => setTimeout(r, 120));
  }
  return out;
}

/** Obtém elevações OpenTopoData / USGS (SRTM 30 m). */
async function fetchOpenTopoElevations(
  locations: { lat: number; lng: number; stationM?: number }[],
): Promise<DemFetchResult> {
  if (locations.length === 0) {
    return { points: [], dataset: "none", source: "none" };
  }

  for (const dataset of OPENTOPO_DATASETS) {
    try {
      let points = await fetchOpenTopoDataset(dataset, locations);
      const valid = points.filter((p) => p.elevationM != null).length;
      if (valid < Math.max(2, locations.length * 0.4)) {
        continue;
      }
      if (valid < locations.length) {
        points = await fillMissingWithEpqs(points);
      }
      return {
        points,
        dataset: dataset.toUpperCase(),
        source: "OpenTopoData",
      };
    } catch {
      /* próximo dataset */
    }
  }

  const points = await fillMissingWithEpqs(
    locations.map((l) => ({ ...l, elevationM: null })),
  );
  return {
    points,
    dataset: "USGS-3DEP",
    source: "USGS EPQS",
  };
}

/** Obtém elevações para uma lista de pontos WGS84. */
export async function fetchDemElevations(
  locations: { lat: number; lng: number; stationM?: number }[],
  source: DemElevationSource = "auto",
): Promise<DemFetchResult> {
  if (locations.length === 0) {
    return { points: [], dataset: "none", source: "none" };
  }

  const preferGoogle = source === "google" || (source === "auto" && isGoogleElevationConfigured());

  if (preferGoogle) {
    try {
      return await fetchGoogleElevations(locations);
    } catch (e) {
      if (source === "google") throw e;
      /* auto: fallback SRTM */
    }
  }

  return fetchOpenTopoElevations(locations);
}
