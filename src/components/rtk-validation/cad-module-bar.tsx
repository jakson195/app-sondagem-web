"use client";

import { BarChart3, Box, Droplets, FileText, LayoutGrid, Mountain, Route, Square } from "lucide-react";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import type { CadToolsTab } from "./cad-tools-sidebar";

/**
 * Barra de módulos do CAD (Gleba · Loteamento · Vias · Terreno · Infraestrutura · Documentos · 3D).
 * Só organiza a navegação: cada módulo abre as ferramentas já existentes no painel lateral.
 */
export type CadModuleId = "gleba" | "loteamento" | "vias" | "terreno" | "infra" | "documentos" | "viabilidade" | "3d";

export const CAD_MODULES: { id: CadModuleId; tabs: CadToolsTab[]; icon: typeof Square }[] = [
  { id: "gleba", tabs: ["draw", "layers", "properties", "commands", "sigef", "anm"], icon: Square },
  { id: "loteamento", tabs: ["loteamento", "reurb"], icon: LayoutGrid },
  { id: "vias", tabs: ["loteamento"], icon: Route },
  { id: "terreno", tabs: ["contour", "tin", "hypsometric", "profile", "volumetria"], icon: Mountain },
  { id: "infra", tabs: ["drenagem"], icon: Droplets },
  { id: "documentos", tabs: ["memorial"], icon: FileText },
  { id: "viabilidade", tabs: [], icon: BarChart3 },
  { id: "3d", tabs: [], icon: Box },
];

/** Módulo ativo: o último clicado, se ainda combina com a aba aberta; senão, o dono da aba. */
export function moduloAtivo(toolsTab: CadToolsTab, escolhido: CadModuleId | null): CadModuleId {
  if (escolhido && CAD_MODULES.find((m) => m.id === escolhido)?.tabs.includes(toolsTab)) return escolhido;
  return CAD_MODULES.find((m) => m.id !== "vias" && m.tabs.includes(toolsTab))?.id ?? "gleba";
}

export function CadModuleBar({
  active,
  onSelect,
  disabled3d,
}: {
  active: CadModuleId;
  onSelect: (id: CadModuleId) => void;
  disabled3d?: boolean;
}) {
  const t = useTranslations("rtkCad.modules");
  return (
    <nav
      aria-label={t("aria")}
      className="flex shrink-0 items-stretch gap-1 overflow-x-auto border-b border-[#e5e7eb] bg-white px-2"
    >
      {CAD_MODULES.map(({ id, icon: Icon }) => {
        const on = active === id;
        const off = id === "3d" && disabled3d;
        return (
          <button
            key={id}
            type="button"
            aria-current={on ? "page" : undefined}
            title={off ? t("need3d") : t(`${id}Hint`)}
            onClick={() => onSelect(id)}
            className={`relative flex shrink-0 items-center gap-1.5 px-3 py-2 text-[13px] font-semibold transition-colors ${
              on ? "text-[#0f2848]" : off ? "text-[#9ca3af] hover:text-[#6b7280]" : "text-[#4b5563] hover:text-[#0f2848]"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {t(id)}
            <span
              aria-hidden
              className={`absolute inset-x-2 bottom-0 h-[3px] rounded-t ${on ? "bg-[#00a8c8]" : "bg-transparent"}`}
            />
          </button>
        );
      })}
    </nav>
  );
}
