/** Verifica se a API HidroGeo (FastAPI :8010) responde via proxy Next. */
export async function checkHidroGeoApiHealth(): Promise<boolean> {
  try {
    const res = await fetch("/api/hidrogeo/v1/config", { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkAnmLeilaoApiHealth(): Promise<boolean> {
  try {
    const res = await fetch("/api/anm-leilao/v1/config", { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export const HIDROGEO_START_HINT = `Infra + API HidroGeo (outro terminal):

cd hidrogeo-brasil/infra
docker compose up -d postgis pg_tileserv

cd hidrogeo-brasil/backend
uvicorn app.main:app --reload --port 8010

# ou, na pasta app-web:
npm run hidrogeo:infra
npm run hidrogeo:api`;
