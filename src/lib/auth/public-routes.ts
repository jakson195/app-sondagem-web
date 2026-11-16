/** Rotas públicas (sem sessão). Usado pelo middleware. */

export const PUBLIC_EXACT_PATHS = new Set([
  "/",
  "/login",
  "/cadastro",
  "/recuperar-senha",
  "/redefinir-senha",
  "/auth/callback",
  "/privacy",
  "/comercial",
  "/funcionalidades",
  "/planos",
  "/contato",
  "/empresas",
]);

/** Prefixos de API acessíveis sem login. */
export const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/recover",
  "/api/auth/reset-password",
  "/api/billing/webhook",
  "/api/billing/mercadopago/webhook",
  // diretório público de empresas (só busca; pedir contato continua exigindo login)
  "/api/diretorio/busca",
  "/api/diretorio/municipios",
] as const;

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/cliente/")) return true;
  if (pathname.startsWith("/hidrogeo-viewer")) return true;
  if (pathname.startsWith("/anm-leilao-viewer")) return true;
  if (PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  return false;
}

/** Rotas da aplicação autenticada (referência; layout `(app)` também exige sessão). */
export const APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/obras",
  "/obra",
  "/geofisica",
  "/geo",
  "/spt",
  "/pocos",
  "/trado",
  "/rotativa",
  "/relatorio",
  "/projects",
  "/boreholes",
  "/digital-twin",
  "/hidrologia",
  "/geotecnia",
  "/mineracao",
  "/gestao-empresa",
  "/assinatura",
  "/empresa",
  "/empresas-regiao",
  "/mapa",
  "/mapa-osm",
  "/perfil-estratigrafico",
  "/secao-geologica",
] as const;

export function isAppRoute(pathname: string): boolean {
  return APP_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
