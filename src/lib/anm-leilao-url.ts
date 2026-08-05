/** ANM Leilão SOPLE — viewer e API próprios (sem HidroGeo). */

const LEGACY_WRONG_PORT = /:8000(\/|$)/;

function withMapboxToken(base: string): string {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim();
  if (!token) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}mapboxToken=${encodeURIComponent(token)}`;
}

function resolveAnmLeilaoViewerBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_ANM_LEILAO_VIEWER_URL?.trim();
  if (fromEnv) {
    const base = fromEnv.replace(/\/$/, "");
    if (!LEGACY_WRONG_PORT.test(base)) return base;
  }
  return "/anm-leilao-viewer";
}

export function getLeilaoANMViewerUrl(): string {
  const base = resolveAnmLeilaoViewerBase();
  const url = withMapboxToken(base);
  return url.replace("/anm-leilao-viewer/?", "/anm-leilao-viewer?").replace("/anm-leilao-viewer//", "/anm-leilao-viewer/");
}

export function getLeilaoANMDirectUrl(): string {
  return "/mineracao/leilao-anm";
}

export function getLeilaoANMViteDirectUrl(): string {
  const vite =
    process.env.NEXT_PUBLIC_ANM_LEILAO_VITE_URL?.trim()?.replace(/\/$/, "") ||
    "http://localhost:5175";
  return withMapboxToken(`${vite}/anm-leilao-viewer/`);
}

export function getAnmLeilaoApiUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_ANM_LEILAO_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://127.0.0.1:8010";
}
