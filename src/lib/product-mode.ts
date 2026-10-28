/**
 * Modo comercial da UI (não é controlo de acesso).
 *
 * - `LOTEAMENTO` ou variável omitida: só CAD, GEO e Estudo de Viabilidade no menu.
 * - `SONDAGEM`: SPT, rotativa, trado, poços, obras e relatórios.
 * - `FULL`: mostra todos os módulos actuais no menu.
 *
 * Rotas, APIs, Prisma e permissões existentes permanecem intactas.
 * Ocultar um item do menu não bloqueia URL nem API.
 */
export type ProductMode = "FULL" | "LOTEAMENTO" | "SONDAGEM";

const LOTEAMENTO_VISIBLE_PATH_PREFIXES = [
  "/dashboard",
  "/cad",
  "/geo",
  "/viabilidade",
] as const;

const SONDAGEM_VISIBLE_PATH_PREFIXES = [
  "/dashboard",
  "/spt",
  "/rotativa",
  "/trado",
  "/pocos",
  "/relatorio",
  "/obra",
  "/obras",
  "/boreholes",
  "/geofisica",
] as const;

const LOTEAMENTO_VISIBLE_MODULE_IDS = ["cad", "geo", "viabilidade"] as const;

const SONDAGEM_VISIBLE_MODULE_IDS = ["spt", "relatorios", "obras"] as const;

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

/** Atalhos do painel no modo SONDAGEM (rótulos iguais aos do menu). */
export const SONDAGEM_MODULE_CARDS = [
  {
    href: "/spt",
    label: "📊 Sondagem SPT",
    description: "Registo de campo, gráficos NSPT e relatório PDF.",
  },
  {
    href: "/rotativa",
    label: "🌀 Sondagem Rotativa",
    description: "Perfil estratigráfico, RQD e coluna da sondagem.",
  },
  {
    href: "/trado",
    label: "🪵 Sondagem Trado",
    description: "Furos a trado e descrição das camadas.",
  },
  {
    href: "/pocos",
    label: "💧 Poços Monitoramento",
    description: "Piezometria e acompanhamento de poços.",
  },
  {
    href: "/obra",
    label: "🏗️ Obras",
    description: "Obras de campo, furos e contexto do projeto.",
  },
] as const;

export function getProductMode(): ProductMode {
  const raw = process.env.NEXT_PUBLIC_PRODUCT_MODE?.trim().toUpperCase();
  if (raw === "FULL") return "FULL";
  if (raw === "SONDAGEM") return "SONDAGEM";
  return "LOTEAMENTO";
}

export function isLoteamentoProductMode(): boolean {
  return getProductMode() === "LOTEAMENTO";
}

export function isSondagemProductMode(): boolean {
  return getProductMode() === "SONDAGEM";
}

export function isFullProductMode(): boolean {
  return getProductMode() === "FULL";
}

function pathOnly(href: string): string {
  const withoutQuery = href.split("?")[0] ?? href;
  const withoutHash = withoutQuery.split("#")[0] ?? withoutQuery;
  return withoutHash;
}

function visiblePathPrefixes(): readonly string[] | null {
  const mode = getProductMode();
  if (mode === "FULL") return null;
  if (mode === "SONDAGEM") return SONDAGEM_VISIBLE_PATH_PREFIXES;
  return LOTEAMENTO_VISIBLE_PATH_PREFIXES;
}

export function isProductVisibleHref(href: string): boolean {
  const prefixes = visiblePathPrefixes();
  if (prefixes == null) return true;
  const path = pathOnly(href);
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function filterNavByProductMode<T extends { href: string }>(items: T[]): T[] {
  if (getProductMode() === "FULL") return items;
  return items.filter((item) => isProductVisibleHref(item.href));
}

export function filterModulesByProductMode<T extends { id: string }>(modules: T[]): T[] {
  const mode = getProductMode();
  if (mode === "FULL") return modules;
  const allowed = new Set<string>(
    mode === "SONDAGEM" ? SONDAGEM_VISIBLE_MODULE_IDS : LOTEAMENTO_VISIBLE_MODULE_IDS,
  );
  return modules.filter((mod) => allowed.has(mod.id));
}

/** Âncoras / entradas de marketing que promovem módulos ocultos. */
export function isProductVisibleMarketingHref(href: string): boolean {
  const mode = getProductMode();
  if (mode === "FULL" || mode === "SONDAGEM") return true;
  const raw = href.trim();
  if (raw.includes("galeria-sondagens") || raw.includes("ntrip") || raw.includes("como-funciona")) {
    return false;
  }
  return true;
}
