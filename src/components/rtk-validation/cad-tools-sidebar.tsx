"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Blend,
  Box,
  ChevronLeft,
  Droplets,
  FileText,
  Landmark,
  Layers,
  LayoutGrid,
  Minus,
  Mountain,
  Pencil,
  Recycle,
  SlidersHorizontal,
  SquareTerminal,
  Triangle,
  Waves,
} from "lucide-react";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";

export type CadToolsTab =
  | "draw"
  | "layers"
  | "properties"
  | "commands"
  | "memorial"
  | "contour"
  | "tin"
  | "hypsometric"
  | "profile"
  | "volumetria"
  | "anm"
  | "sigef"
  | "loteamento"
  | "drenagem"
  | "reurb";

export const CAD_TOOLS_PANEL_WIDTH_PX = 268;
export const CAD_TOOLS_RAIL_WIDTH_PX = 48;

type CadToolsSidebarProps = {
  activeTab: CadToolsTab;
  onTabChange: (tab: CadToolsTab) => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onHide?: () => void;
  sections: Record<CadToolsTab, ReactNode>;
};

type SectionId =
  | "quick"
  | "docs"
  | "topo"
  | "earth"
  | "loteamento"
  | "infra"
  | "regularizacao"
  | "orgaos";

const TAB_ICONS: Record<CadToolsTab, typeof Pencil> = {
  draw: Pencil,
  layers: Layers,
  properties: SlidersHorizontal,
  commands: SquareTerminal,
  memorial: FileText,
  contour: Waves,
  tin: Triangle,
  hypsometric: Blend,
  profile: Minus,
  volumetria: Box,
  anm: Mountain,
  sigef: Landmark,
  loteamento: LayoutGrid,
  drenagem: Droplets,
  reurb: Recycle,
};

const SECTIONS: { id: SectionId; tabs: CadToolsTab[] }[] = [
  { id: "quick", tabs: ["draw", "layers", "properties", "commands"] },
  { id: "docs", tabs: ["memorial"] },
  { id: "topo", tabs: ["contour", "tin", "hypsometric", "profile"] },
  { id: "earth", tabs: ["volumetria"] },
  { id: "loteamento", tabs: ["loteamento"] },
  { id: "infra", tabs: ["drenagem"] },
  { id: "regularizacao", tabs: ["reurb"] },
  { id: "orgaos", tabs: ["anm", "sigef"] },
];

const TAB_ORDER: CadToolsTab[] = SECTIONS.flatMap((section) => section.tabs);

function sectionForTab(tab: CadToolsTab): SectionId {
  return SECTIONS.find((section) => section.tabs.includes(tab))?.id ?? "quick";
}

export function CadToolsSidebar({
  activeTab,
  onTabChange,
  collapsed = false,
  onCollapsedChange,
  onHide,
  sections,
}: CadToolsSidebarProps) {
  const t = useTranslations("rtkCad.sidebar");
  const chrome = useTranslations("rtkCad.chrome");
  const [openSection, setOpenSection] = useState<SectionId>("quick");

  useEffect(() => {
    setOpenSection(sectionForTab(activeTab));
  }, [activeTab]);

  const collapse = () => {
    onCollapsedChange?.(true);
    onHide?.();
  };

  const expandTo = (tab: CadToolsTab) => {
    onTabChange(tab);
    onCollapsedChange?.(false);
  };

  const labels = useMemo(
    () => Object.fromEntries(TAB_ORDER.map((tab) => [tab, t(tab)])) as Record<CadToolsTab, string>,
    [t],
  );

  if (collapsed) {
    return (
      <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden border-r border-[#e5e7eb] bg-white">
        <button
          type="button"
          onClick={() => onCollapsedChange?.(false)}
          title={t("show")}
          aria-label={t("show")}
          className="flex h-10 items-center justify-center text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#0f2848]"
        >
          <ChevronLeft className="h-4 w-4 rotate-180" />
        </button>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 py-1">
          {TAB_ORDER.map((tab) => {
            const Icon = TAB_ICONS[tab];
            const label = labels[tab];
            return (
              <button
                key={tab}
                type="button"
                title={label}
                aria-label={label}
                onClick={() => expandTo(tab)}
                className={`flex h-8 w-full items-center justify-center rounded-md ${
                  activeTab === tab ? "bg-[#0f2848] text-white" : "text-[#374151] hover:bg-[#f3f4f6]"
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </nav>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden border-r border-[#e5e7eb] bg-white">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[#e5e7eb] px-2">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-[#0f2848]">{t("title")}</p>
        <button
          type="button"
          onClick={collapse}
          title={t("hide")}
          aria-label={t("hide")}
          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#0f2848]"
        >
          {t("hide")}
        </button>
      </div>
      <nav className="flex max-h-[42%] shrink-0 flex-col overflow-y-auto border-b border-[#e5e7eb] p-1.5">
        {SECTIONS.map((section) => {
          const open = openSection === section.id;
          return (
            <div key={section.id} className="mb-0.5">
              <button
                type="button"
                onClick={() => setOpenSection(open ? "quick" : section.id)}
                title={chrome(`section.${section.id}`)}
                aria-label={chrome(`section.${section.id}`)}
                aria-expanded={open}
                className="flex w-full items-center justify-between rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#6b7280] hover:bg-[#f9fafb]"
              >
                {chrome(`section.${section.id}`)}
                <span aria-hidden>{open ? "▾" : "▸"}</span>
              </button>
              {open
                ? section.tabs.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      title={labels[tab]}
                      aria-label={labels[tab]}
                      onClick={() => onTabChange(tab)}
                      className={`mt-0.5 w-full truncate rounded px-2 py-1 text-left text-[11px] font-medium uppercase tracking-wide ${
                        activeTab === tab
                          ? "bg-[#0f2848] text-white"
                          : "text-[#374151] hover:bg-[#f3f4f6]"
                      }`}
                    >
                      {labels[tab]}
                    </button>
                  ))
                : null}
            </div>
          );
        })}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{sections[activeTab]}</div>
    </aside>
  );
}
