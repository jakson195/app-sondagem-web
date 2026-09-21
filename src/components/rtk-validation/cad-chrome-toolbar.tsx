"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import type { CadTool } from "@/lib/rtk-validation/cad/types";
import { CadMenu, CadMenuItem } from "./cad-ui-menu";

type CadChromeToolbarProps = {
  tool: CadTool;
  coordLabelsVisible: boolean;
  viewMode: "plan" | "3d";
  polylineDraftLen: number;
  canCloseSelected: boolean;
  onTool: (tool: CadTool) => void;
  onToggleCoords: () => void;
  onFinishPolyline: (closed: boolean) => void;
  onCloseSelected: () => void;
  onViewMode: (mode: "plan" | "3d") => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

const PRIMARY: CadTool[] = ["select", "pan", "line", "polyline", "editPolygon"];

export function CadChromeToolbar({
  tool,
  coordLabelsVisible,
  viewMode,
  polylineDraftLen,
  canCloseSelected,
  onTool,
  onToggleCoords,
  onFinishPolyline,
  onCloseSelected,
  onViewMode,
  onZoomIn,
  onZoomOut,
}: CadChromeToolbarProps) {
  const t = useTranslations("rtkCad");
  const t3d = useTranslations("rtkCad.view3d");
  const [moreOpen, setMoreOpen] = useState(false);

  const btn = (id: CadTool, label: string) => (
    <button
      key={id}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={tool === id}
      onClick={() => onTool(id)}
      className={`h-7 rounded px-2 text-[11px] font-medium ${
        tool === id ? "bg-[#00c8f0] text-[#0f2848]" : "text-[#94a3b8] hover:bg-[#1e293b]"
      }`}
    >
      {id === "editPolygon" ? t("chrome.edit") : label}
    </button>
  );

  return (
    <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-[#1e293b] bg-[#0b1220] px-1.5">
      {PRIMARY.map((id) => btn(id, t(`tools.${id}`)))}
      <CadMenu
        open={moreOpen}
        onOpenChange={setMoreOpen}
        label={<span className="normal-case">{t("chrome.more")}</span>}
        title={t("chrome.more")}
        tone="dark"
        active={tool === "confrontacao"}
      >
        <CadMenuItem
          onClick={() => {
            setMoreOpen(false);
            onTool("confrontacao");
          }}
        >
          {t("tools.confrontacao")}
        </CadMenuItem>
        <CadMenuItem
          onClick={() => {
            setMoreOpen(false);
            onToggleCoords();
          }}
        >
          {coordLabelsVisible ? t("tools.hideCoords") : t("tools.insertCoords")}
        </CadMenuItem>
      </CadMenu>
      {tool === "polyline" && polylineDraftLen >= 2 ? (
        <>
          <button
            type="button"
            onClick={() => onFinishPolyline(false)}
            className="h-7 rounded border border-[#334155] px-2 text-[11px] font-medium text-[#e2e8f0]"
          >
            {t("tools.finishPolyline")}
          </button>
          <button
            type="button"
            onClick={() => onFinishPolyline(true)}
            disabled={polylineDraftLen < 3}
            className="h-7 rounded bg-emerald-600 px-2 text-[11px] font-medium text-white disabled:opacity-40"
          >
            {t("tools.closePolygon")}
          </button>
        </>
      ) : null}
      {canCloseSelected ? (
        <button
          type="button"
          onClick={onCloseSelected}
          className="h-7 rounded bg-emerald-700 px-2 text-[11px] font-medium text-white"
        >
          {t("tools.closeSelected")}
        </button>
      ) : null}
      <div className="ml-auto flex items-center gap-1">
        <div className="flex overflow-hidden rounded border border-[#334155]">
          <button
            type="button"
            onClick={() => onViewMode("plan")}
            title={t3d("plan")}
            aria-label={t3d("plan")}
            className={`h-7 border-r border-[#334155] px-2 text-[11px] font-medium ${
              viewMode === "plan" ? "bg-[#00c8f0] text-[#0f2848]" : "text-[#e2e8f0] hover:bg-[#1e293b]"
            }`}
          >
            2D
          </button>
          <button
            type="button"
            onClick={() => onViewMode("3d")}
            title={t3d("scene")}
            aria-label={t3d("scene")}
            className={`h-7 px-2 text-[11px] font-medium ${
              viewMode === "3d" ? "bg-[#00c8f0] text-[#0f2848]" : "text-[#e2e8f0] hover:bg-[#1e293b]"
            }`}
          >
            3D
          </button>
        </div>
        <div className="flex overflow-hidden rounded border border-[#334155]">
          <button
            type="button"
            onClick={onZoomOut}
            title={t("actions.zoomOut")}
            aria-label={t("actions.zoomOut")}
            className="h-7 border-r border-[#334155] px-2 text-xs font-semibold text-[#e2e8f0] hover:bg-[#1e293b]"
          >
            −
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            title={t("actions.zoomIn")}
            aria-label={t("actions.zoomIn")}
            className="h-7 px-2 text-xs font-semibold text-[#e2e8f0] hover:bg-[#1e293b]"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
