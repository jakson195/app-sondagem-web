"use client";

import type { ReactNode } from "react";
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

/** Fixed lateral column — 280px is usable without eating the canvas. */
export const CAD_TOOLS_PANEL_WIDTH_PX = 280;

type CadToolsSidebarProps = {
  activeTab: CadToolsTab;
  onTabChange: (tab: CadToolsTab) => void;
  onHide?: () => void;
  sections: Record<CadToolsTab, ReactNode>;
};

const TAB_ORDER: CadToolsTab[] = [
  "draw",
  "layers",
  "properties",
  "commands",
  "memorial",
  "contour",
  "tin",
  "hypsometric",
  "profile",
  "volumetria",
  "anm",
  "sigef",
  "loteamento",
  "drenagem",
  "reurb",
];

export function CadToolsSidebar({
  activeTab,
  onTabChange,
  onHide,
  sections,
}: CadToolsSidebarProps) {
  const t = useTranslations("rtkCad.sidebar");

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#e5e7eb] px-3 py-2">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-[#0f2848]">{t("title")}</p>
        {onHide ? (
          <button
            type="button"
            onClick={onHide}
            title={t("hide")}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#0f2848]"
          >
            {t("hide")}
          </button>
        ) : null}
      </div>
      <nav className="flex shrink-0 flex-col gap-0.5 overflow-y-auto border-b border-[#e5e7eb] p-2">
        {TAB_ORDER.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={`w-full truncate rounded-md px-2.5 py-1.5 text-left text-xs font-medium leading-snug transition ${
              activeTab === tab
                ? "bg-[#0f2848] text-white"
                : "text-[#374151] hover:bg-[#f3f4f6]"
            }`}
          >
            {t(tab)}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{sections[activeTab]}</div>
    </aside>
  );
}
