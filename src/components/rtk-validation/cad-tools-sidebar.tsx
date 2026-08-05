"use client";

import type { ReactNode } from "react";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";

export type CadToolsTab =
  | "draw"
  | "layers"
  | "properties"
  | "contour"
  | "tin"
  | "hypsometric"
  | "profile"
  | "anm";

type CadToolsSidebarProps = {
  activeTab: CadToolsTab;
  onTabChange: (tab: CadToolsTab) => void;
  sections: Record<CadToolsTab, ReactNode>;
};

const TAB_ORDER: CadToolsTab[] = [
  "draw",
  "layers",
  "properties",
  "contour",
  "tin",
  "hypsometric",
  "profile",
  "anm",
];

export function CadToolsSidebar({
  activeTab,
  onTabChange,
  sections,
}: CadToolsSidebarProps) {
  const t = useTranslations("rtkCad.sidebar");

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-sm xl:max-h-[calc(100vh-12rem)]">
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#e5e7eb] p-2 xl:flex-col xl:overflow-x-visible xl:overflow-y-auto">
        {TAB_ORDER.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-xs font-medium transition xl:w-full ${
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
