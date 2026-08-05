import proj4 from "proj4";

const WGS84 = "EPSG:4326";

proj4.defs(WGS84, "+proj=longlat +datum=WGS84 +no_defs");

export function sirgasUtmEpsgCode(zone: number): string {
  return `EPSG:${31960 + zone}`;
}

function sirgasUtmProjDef(zone: number) {
  return `+proj=utm +zone=${zone} +south +ellps=GRS80 +units=m +no_defs`;
}

for (let zone = 18; zone <= 25; zone++) {
  proj4.defs(sirgasUtmEpsgCode(zone), sirgasUtmProjDef(zone));
}

const SIRGAS_UTM_SOUTH: Record<number, string> = {
  18: sirgasUtmEpsgCode(18),
  19: sirgasUtmEpsgCode(19),
  20: sirgasUtmEpsgCode(20),
  21: sirgasUtmEpsgCode(21),
  22: sirgasUtmEpsgCode(22),
  23: sirgasUtmEpsgCode(23),
  24: sirgasUtmEpsgCode(24),
  25: sirgasUtmEpsgCode(25),
};

export type EnLatLonResolved = {
  e: number;
  n: number;
  lat: number;
  lon: number;
  zone: number;
  epsg: string;
  swapped: boolean;
};

function inBrazil(lat: number, lon: number) {
  if (lat < -35 || lat > 6 || lon < -75 || lon > -30) return false;
  // Falsos positivos: mesmo par E/N UTM pode projetar no Chile/Argentina com fuso errado.
  if (lat < -20 && lon < -57) return false;
  if (lat < -10 && lon < -62) return false;
  return true;
}

/** Fuso UTM (18–25) a partir da longitude WGS84. */
export function utmZoneFromLongitude(lon: number): number {
  return Math.min(25, Math.max(18, Math.floor((lon + 180) / 6) + 1));
}

export function formatSirgasUtmProjection(zone: number): string {
  return `Projeção UTM — Fuso ${zone}S (SIRGAS 2000 · ${sirgasUtmEpsgCode(zone)})`;
}

function looksLikeUtmEasting(v: number): boolean {
  return v >= 100_000 && v <= 900_000;
}

function looksLikeUtmNorthingSouth(v: number): boolean {
  return v >= 1_000_000 && v <= 10_500_000;
}

function brazilLocationBias(lat: number, lon: number): number {
  if (lat < -20) return Math.abs(lon + 51);
  return Math.hypot(lon + 54, lat + 14);
}

function resolveEnPair(a: number, b: number, swapped: boolean): (EnLatLonResolved & { score: number }) | null {
  let best: (EnLatLonResolved & { score: number; locationBias: number }) | null = null;

  for (let zone = 18; zone <= 25; zone++) {
    const crs = SIRGAS_UTM_SOUTH[zone];
    const [lon, lat] = proj4(crs, WGS84, [a, b]) as [number, number];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!inBrazil(lat, lon)) continue;

    const lonZone = utmZoneFromLongitude(lon);
    if (lonZone !== zone) continue;

    const centralMeridian = zone * 6 - 183;
    const score = Math.abs(lon - centralMeridian);
    const locationBias = brazilLocationBias(lat, lon);
    if (
      !best ||
      score < best.score - 1e-6 ||
      (Math.abs(score - best.score) <= 1e-6 && locationBias < best.locationBias - 1e-6)
    ) {
      best = { e: a, n: b, lat, lon, zone, epsg: crs, swapped, score, locationBias };
    }
  }

  if (!best) return null;
  const { locationBias: _locationBias, ...resolved } = best;
  return resolved;
}

export function resolveEnToLatLon(e: number, n: number): EnLatLonResolved {
  const candidates: EnLatLonResolved[] = [];

  if (looksLikeUtmEasting(e) && looksLikeUtmNorthingSouth(n)) {
    const hit = resolveEnPair(e, n, false);
    if (hit) candidates.push(hit);
  }
  if (looksLikeUtmEasting(n) && looksLikeUtmNorthingSouth(e)) {
    const hit = resolveEnPair(n, e, true);
    if (hit) candidates.push(hit);
  }
  if (candidates.length === 0) {
    const direct = resolveEnPair(e, n, false);
    if (direct) candidates.push(direct);
    const swapped = resolveEnPair(n, e, true);
    if (swapped) candidates.push(swapped);
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      const scoreA = Math.abs(a.lon - (a.zone * 6 - 183));
      const scoreB = Math.abs(b.lon - (b.zone * 6 - 183));
      if (Math.abs(scoreA - scoreB) > 1e-6) return scoreA - scoreB;
      const biasA = brazilLocationBias(a.lat, a.lon);
      const biasB = brazilLocationBias(b.lat, b.lon);
      if (Math.abs(biasA - biasB) > 1e-6) return biasA - biasB;
      return Number(a.swapped) - Number(b.swapped);
    });
    return candidates[0];
  }

  const zone = 23;
  const crs = SIRGAS_UTM_SOUTH[zone];
  const [lon, lat] = proj4(crs, WGS84, [e, n]) as [number, number];
  return { e, n, lat, lon, zone, epsg: crs, swapped: false };
}

export function detectSirgasUtmZone(e: number, n: number): number {
  return resolveEnToLatLon(e, n).zone;
}

/** Detecta fuso UTM e eixos E/N a partir de amostras de coordenadas do projeto. */
export function detectSirgasUtmFromSamples(samples: { x: number; y: number }[]): {
  zone: number;
  eastingAxis: "x" | "y";
  northingAxis: "x" | "y";
  epsg: string;
} {
  if (samples.length === 0) {
    return { zone: 23, eastingAxis: "x", northingAxis: "y", epsg: sirgasUtmEpsgCode(23) };
  }

  const zoneVotes = new Map<number, number>();
  let swapVotes = 0;
  let total = 0;

  const step = samples.length > 32 ? Math.ceil(samples.length / 32) : 1;
  for (let i = 0; i < samples.length; i += step) {
    const sample = samples[i];
    const resolved = resolveEnToLatLon(sample.x, sample.y);
    zoneVotes.set(resolved.zone, (zoneVotes.get(resolved.zone) ?? 0) + 1);
    if (resolved.swapped) swapVotes += 1;
    total += 1;
  }

  let zone = 23;
  let bestVotes = 0;
  for (const [candidateZone, votes] of zoneVotes) {
    if (votes > bestVotes) {
      bestVotes = votes;
      zone = candidateZone;
    }
  }

  const swapped = swapVotes > total / 2;
  return {
    zone,
    eastingAxis: swapped ? "y" : "x",
    northingAxis: swapped ? "x" : "y",
    epsg: sirgasUtmEpsgCode(zone),
  };
}

export function enToLatLon(e: number, n: number, zone?: number) {
  if (zone === undefined) return resolveEnToLatLon(e, n);
  const crs = SIRGAS_UTM_SOUTH[zone] ?? SIRGAS_UTM_SOUTH[23];
  const [lon, lat] = proj4(crs, WGS84, [e, n]) as [number, number];
  return { lat, lon, zone, epsg: crs, swapped: false, e, n };
}

export function latLonToEn(lat: number, lon: number, zone: number) {
  const crs = SIRGAS_UTM_SOUTH[zone] ?? SIRGAS_UTM_SOUTH[23];
  const [e, n] = proj4(WGS84, crs, [lon, lat]) as [number, number];
  return { e, n };
}

export function surveyCenterLatLon(points: { e: number; n: number }[]) {
  if (points.length === 0) return { lat: -14, lon: -54, zone: 23 };
  const avgE = points.reduce((s, p) => s + p.e, 0) / points.length;
  const avgN = points.reduce((s, p) => s + p.n, 0) / points.length;
  const resolved = resolveEnToLatLon(avgE, avgN);
  return { lat: resolved.lat, lon: resolved.lon, zone: resolved.zone };
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}
