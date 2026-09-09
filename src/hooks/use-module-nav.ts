"use client";

import { useMemo } from "react";
import type { ModuloProjetoChave } from "@/lib/modulos-projeto";
import { filterNavByProductMode, isLoteamentoProductMode } from "@/lib/product-mode";
import { buildMainModuleNav } from "@/modules/registry";

const MODULE_NAV_DEFS: {
  module: ModuloProjetoChave;
  href: string;
  label: string;
}[] = [
  { module: "geo", href: "/geo", label: "🧭 GEO" },
  { module: "spt", href: "/spt", label: "📊 Sondagem SPT" },
  { module: "rotativa", href: "/rotativa", label: "🌀 Sondagem Rotativa" },
  { module: "trado", href: "/trado", label: "🪵 Sondagem Trado" },
  { module: "piezo", href: "/pocos", label: "💧 Poços Monitoramento" },
  { module: "relatorios", href: "/relatorio", label: "📄 Relatórios" },
];

export function useModuleNav(options: {
  obraId: number | null;
  obraModules: Record<ModuloProjetoChave, boolean> | null;
  modulesLoading: boolean;
}) {
  const { obraId, obraModules, modulesLoading } = options;

  return useMemo(() => {
    const withObra = (href: string) =>
      obraId != null ? `${href}?obraId=${obraId}` : href;

    let items = MODULE_NAV_DEFS;
    // Em LOTEAMENTO o GEO fica sempre no menu, mesmo com obra sem o módulo.
    if (
      obraId != null &&
      !modulesLoading &&
      obraModules != null &&
      !isLoteamentoProductMode()
    ) {
      items = MODULE_NAV_DEFS.filter((item) => obraModules[item.module]);
    }

    return filterNavByProductMode(
      items.map((item) => ({
        href: withObra(item.href),
        label: item.label,
      })),
    );
  }, [obraId, obraModules, modulesLoading]);
}

export { buildMainModuleNav };
