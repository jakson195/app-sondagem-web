/**
 * Modo comercial da UI (não é controlo de acesso).
 *
 * - `LOTEAMENTO` ou variável omitida: só CAD, GEO e Estudo de Viabilidade no menu.
 * - `FULL`: mostra todos os módulos actuais no menu.
 *
 * Rotas, APIs, Prisma e permissões existentes permanecem intactas.
 * Ocultar um item do menu não bloqueia URL nem API.
 */
export type ProductMode = "FULL" | "LOTEAMENTO";

const LOTEAMENTO_VISIBLE_PATH_PREFIXES = [
  "/dashboard",
  "/cad",
  "/geo",
  "/viabilidade",
] as const;

const LOTEAMENTO_VISIBLE_MODULE_IDS = ["cad", "geo", "viabilidade"] as const;

/** Atalhos do painel no modo LOTEAMENTO (rótulos iguais aos do menu). */
export const LOTEAMENTO_MODULE_CARDS = [
  {
    href: "/cad",
    label: "📐 Ambiente CAD",
    description: "Desenho técnico, loteamento e exportação.",
  },
  {
    href: "/geo",
    label: "🧭 GEO",
    description: "Mapas, imagens históricas e camadas de contexto.",
  },
  {
    href: "/viabilidade",
    label: "📊 Estudo de viabilidade",
    description: "Custos, quantitativos e análise financeira do loteamento.",
  },
] as const;

export function getProductMode(): ProductMode {
  const raw = process.env.NEXT_PUBLIC_PRODUCT_MODE?.trim().toUpperCase();
  return raw === "FULL" ? "FULL" : "LOTEAMENTO";
}

export function isLoteamentoProductMode(): boolean {
  return getProductMode() === "LOTEAMENTO";
}

function pathOnly(href: string): string {
  const withoutQuery = href.split("?")[0] ?? href;
  const withoutHash = withoutQuery.split("#")[0] ?? withoutQuery;
  return withoutHash;
}

export function isProductVisibleHref(href: string): boolean {
  if (getProductMode() === "FULL") return true;
  const path = pathOnly(href);
  return LOTEAMENTO_VISIBLE_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function filterNavByProductMode<T extends { href: string }>(items: T[]): T[] {
  if (getProductMode() === "FULL") return items;
  return items.filter((item) => isProductVisibleHref(item.href));
}

export function filterModulesByProductMode<T extends { id: string }>(modules: T[]): T[] {
  if (getProductMode() === "FULL") return modules;
  const allowed = new Set<string>(LOTEAMENTO_VISIBLE_MODULE_IDS);
  return modules.filter((mod) => allowed.has(mod.id));
}

/** Âncoras / entradas de marketing que promovem módulos ocultos. */
export function isProductVisibleMarketingHref(href: string): boolean {
  if (getProductMode() === "FULL") return true;
  const raw = href.trim();
  if (raw.includes("galeria-sondagens") || raw.includes("ntrip") || raw.includes("como-funciona")) {
    return false;
  }
  return true;
}
