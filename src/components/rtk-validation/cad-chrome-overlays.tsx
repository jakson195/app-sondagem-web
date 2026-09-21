"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import type { SavedCadProjectRecord } from "@/lib/rtk-validation/cad";
import { formatLoteNumeroLabel } from "@/lib/rtk-validation/cad/lot-corner-classification";
import { formatAreaBr } from "@/lib/rtk-validation/cad/polygon-utils";
import type { CadLoteProps } from "@/lib/rtk-validation/cad/types";

export function CadLotInfoCard({
  name,
  lote,
  minimized,
  onMinimizedChange,
}: {
  name?: string;
  lote: CadLoteProps;
  minimized: boolean;
  onMinimizedChange: (next: boolean) => void;
}) {
  const t = useTranslations("rtkCad.loteamento");
  const chrome = useTranslations("rtkCad.chrome");
  const title = formatLoteNumeroLabel(name, 0);
  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => onMinimizedChange(false)}
        title={`${title} — ${chrome("restore")}`}
        aria-label={`${title}. ${chrome("restore")}`}
        className="absolute left-2 top-2 z-20 rounded border border-[#0f2848] bg-white/95 px-2 py-1 text-[11px] font-semibold text-[#0f2848] shadow-sm"
      >
        {title}
      </button>
    );
  }
  return (
    <div className="absolute left-2 top-2 z-20 w-[13.5rem] rounded border border-[#0f2848] bg-white/95 px-2.5 py-2 text-[11px] leading-5 text-[#0f2848] shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">{title}</p>
        <button
          type="button"
          onClick={() => onMinimizedChange(true)}
          title={chrome("minimize")}
          aria-label={chrome("minimize")}
          className="rounded px-1 text-xs text-[#6b7280] hover:bg-[#f3f4f6]"
        >
          −
        </button>
      </div>
      <p className="font-medium">{lote.tipo === "ESQUINA" ? t("tipoEsquina") : t("tipoInterno")}</p>
      <p>
        {chrome("area")}: {formatAreaBr(lote.areaM2)}
      </p>
      <p>
        {chrome("minArea")}: {formatAreaBr(lote.areaMinimaM2)}
      </p>
      <p className={lote.atende ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>
        {lote.atende ? t("statusAtende") : `⚠ ${t("statusNaoAtende")}`}
      </p>
    </div>
  );
}

export function CadStatusBar({
  crs,
  zoneLabel,
  x,
  y,
  zoom,
  step,
  hint,
}: {
  crs: string;
  zoneLabel: string;
  x: string;
  y: string;
  zoom: string;
  step: string | null;
  hint?: string;
}) {
  return (
    <div className="flex h-6 shrink-0 items-center gap-3 overflow-hidden border-t border-[#1e293b] bg-[#0b1220] px-3 font-mono text-[10px] text-[#94a3b8]">
      <span className="truncate">
        {crs}
        {zoneLabel ? ` • ${zoneLabel}` : ""}
      </span>
      <span>X: {x}</span>
      <span>Y: {y}</span>
      <span>Zoom: {zoom}</span>
      {step ? <span>Passo: {step}</span> : null}
      {hint ? <span className="ml-auto truncate text-[#64748b]">{hint}</span> : null}
    </div>
  );
}

export function CadIaLauncher({ onClick }: { onClick: () => void }) {
  const t = useTranslations("rtkCad");
  return (
    <button
      type="button"
      onClick={onClick}
      title={t("ai.openChat")}
      aria-label={t("ai.openChat")}
      className="absolute bottom-2 right-2 z-20 inline-flex h-8 items-center gap-1 rounded-md bg-[#7c3aed]/90 px-2 text-[11px] font-semibold text-white shadow-sm hover:bg-[#6d28d9]"
    >
      <Sparkles className="h-3.5 w-3.5" />
      {t("chrome.ai")}
    </button>
  );
}

export function CadProjectsDialog({
  open,
  savedProjects,
  savedProjectId,
  formatSavedDate,
  onClose,
  onOpenFile,
  onNewProject,
  onOpenProject,
  onDownloadDwg,
  onDelete,
}: {
  open: boolean;
  savedProjects: SavedCadProjectRecord[];
  savedProjectId: string | null;
  formatSavedDate: (iso: string) => string;
  onClose: () => void;
  onOpenFile: () => void;
  onNewProject: () => void;
  onOpenProject: (id: string) => void;
  onDownloadDwg: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const t = useTranslations("rtkCad");
  if (!open) return null;
  return (
    <div
      className="absolute inset-0 z-40 flex items-start justify-center bg-[#0b1220]/40 p-6"
      onClick={onClose}
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("project.openTitle")}
        className="max-h-[min(28rem,80%)] w-full max-w-xl overflow-hidden rounded-lg border border-[#e5e7eb] bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e5e7eb] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-[#0f2848]">{t("project.openTitle")}</h3>
            <p className="mt-0.5 text-[11px] text-[#6b7280]">{t("project.openHint")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-[#6b7280] hover:bg-[#f3f4f6]"
            aria-label={t("chrome.close")}
          >
            ✕
          </button>
        </div>
        <div className="flex flex-wrap gap-2 px-4 py-2">
          <button
            type="button"
            onClick={onOpenFile}
            className="rounded border border-[#0f2848] px-2.5 py-1 text-[11px] font-medium text-[#0f2848]"
          >
            {t("actions.openFile")}
          </button>
          <button
            type="button"
            onClick={onNewProject}
            className="rounded border border-[#d1d5db] px-2.5 py-1 text-[11px] font-medium text-[#0f2848]"
          >
            {t("actions.newProject")}
          </button>
        </div>
        <ul className="max-h-64 space-y-1 overflow-y-auto px-4 pb-4">
          {savedProjects.length === 0 ? (
            <li className="rounded border border-dashed border-[#d1d5db] px-3 py-6 text-center text-xs text-[#6b7280]">
              {t("chrome.noSavedProjects")}
            </li>
          ) : (
            savedProjects.map((item) => (
              <li
                key={item.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 ${
                  item.id === savedProjectId ? "border-[#00c8f0] bg-[#f0fdff]" : "border-[#e5e7eb]"
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#0f2848]">{item.name}</p>
                  <p className="text-[10px] text-[#6b7280]">
                    {t("project.lastSaved", { date: formatSavedDate(item.updatedAt) })}
                    {" · "}
                    {t("project.entities", {
                      count: item.entityCount ?? item.project.entities.length,
                    })}
                    {item.hasDwg ? ` · ${t("project.hasDwg")}` : ""}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenProject(item.id)}
                    className="rounded bg-[#0f2848] px-2.5 py-1 text-[11px] font-medium text-white"
                  >
                    {t("project.open")}
                  </button>
                  {item.hasDwg ? (
                    <button
                      type="button"
                      onClick={() => onDownloadDwg(item.id)}
                      className="rounded border border-[#0e7490] px-2.5 py-1 text-[11px] font-medium text-[#0e7490]"
                    >
                      {t("project.downloadDwg")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onDelete(item.id, item.name)}
                    className="rounded border border-[#d1d5db] px-2.5 py-1 text-[11px] text-[#6b7280]"
                  >
                    {t("project.remove")}
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
