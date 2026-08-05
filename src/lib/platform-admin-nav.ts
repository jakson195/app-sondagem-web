/** Rotas de gestão SaaS visíveis só para administrador de plataforma. */
export const PLATFORM_ADMIN_ONLY_NAV_HREFS = [
  "/gestao-empresa",
  "/assinatura",
  "/admin/companies",
] as const;

export function isPlatformAdminNavHref(href: string): boolean {
  const path = href.split("?")[0] ?? href;
  if (path.startsWith("/admin/") || path === "/adm" || path.startsWith("/adm/")) {
    return true;
  }
  if (path.startsWith("/empresa/") && path.endsWith("/gestao")) {
    return true;
  }
  return PLATFORM_ADMIN_ONLY_NAV_HREFS.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
