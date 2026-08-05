/** HidroGeo Brasil — viewer Vite (Deck.gl + Mapbox + PostGIS). */

const LEGACY_WRONG_PORT = /:8000(\/|$)/;

export function getMapboxTokenForHidroGeo(): string | undefined {
  return process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() || undefined;
}

function withMapboxToken(base: string): string {
  const token = getMapboxTokenForHidroGeo();
  if (!token) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}mapboxToken=${encodeURIComponent(token)}`;
}

function withToolParam(base: string, tool?: string): string {
  if (!tool) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}tool=${encodeURIComponent(tool)}`;
}

function withAppParam(base: string, app?: string): string {
  if (!app) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}app=${encodeURIComponent(app)}`;
}

/** Base do iframe — proxy same-origin no DataGeo (public/ ou Vite via HIDROGEO_VITE_URL). */
function resolveHidroGeoViewerBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_HIDROGEO_URL?.trim();
  if (fromEnv) {
    const base = fromEnv.replace(/\/$/, "");
    if (!LEGACY_WRONG_PORT.test(base)) return base;
  }
  return "/hidrogeo-viewer";
}

/** Iframe — same-origin via Next proxy (sem barra final: evita 308 no dev). */
export function getHidroGeoViewerUrl(options?: { tool?: string; app?: string }): string {
  const base = resolveHidroGeoViewerBase();
  return withMapboxToken(withAppParam(withToolParam(base, options?.tool), options?.app));
}

/** Abrir mapa directo no Vite (nova aba). */
export function getHidroGeoDirectUrl(options?: { tool?: string; app?: string }): string {
  const fromEnv = process.env.NEXT_PUBLIC_HIDROGEO_VITE_URL?.trim();
  const vite = fromEnv?.replace(/\/$/, "") || "http://localhost:5175";
  return withMapboxToken(withAppParam(withToolParam(`${vite}/hidrogeo-viewer/`, options?.tool), options?.app));
}

export function getHidroGeoApiUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_HIDROGEO_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://127.0.0.1:8010";
}
