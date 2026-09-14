"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import type { CadLayer } from "@/lib/rtk-validation/cad/types";
import { isUserLayer } from "@/lib/rtk-validation/cad/layer-styles";

type CadLayersPanelProps = {
  layers: CadLayer[];
  activeLayerId: string;
  entityCounts: Record<string, number>;
  onToggleVisibility: (layerId: string) => void;
  onSetActive: (layerId: string) => void;
  onAddLayer: (name: string, color: string) => void;
  onUpdateLayer: (layerId: string, patch: Partial<CadLayer>) => void;
  onDeleteLayer?: (layerId: string) => void;
};

function ColorField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[10px] text-[#6b7280]">
      <span>{label}</span>
      <input
        type="color"
        value={value.startsWith("#") ? value.slice(0, 7) : "#fbbf24"}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-10 cursor-pointer rounded border border-[#d1d5db] bg-white p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );
}

export function CadLayersPanel({
  layers,
  activeLayerId,
  entityCounts,
  onToggleVisibility,
  onSetActive,
  onAddLayer,
  onUpdateLayer,
  onDeleteLayer,
}: CadLayersPanelProps) {
  const t = useTranslations("rtkCad.layers");
  const nextIndex = useMemo(
    () => layers.filter((l) => l.id.startsWith("lyr_")).length + 1,
    [layers],
  );
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState("#fbbf24");
  const [createNotice, setCreateNotice] = useState<string | null>(null);

  const editingLayer = layers.find((l) => l.id === activeLayerId) ?? layers[0] ?? null;
  const canEditStyles = editingLayer ? !editingLayer.locked : false;
  const canDelete = editingLayer ? isUserLayer(editingLayer) : false;

  function submitNewLayer() {
    const name = draftName.trim().toUpperCase() || `CAMADA_${nextIndex}`;
    const color = draftColor.startsWith("#") ? draftColor.slice(0, 7) : "#fbbf24";
    onAddLayer(name, color);
    setDraftName("");
    setCreateNotice(t("created", { name }));
    window.setTimeout(() => setCreateNotice(null), 4000);
  }

  return (
    <section className="rounded-xl border border-[#e5e7eb] bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#0f2848]">{t("title")}</h3>
      </div>

      <div className="mt-3 space-y-2 rounded-lg border border-[#dbeafe] bg-[#f8fafc] p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-[#6b7280]">{t("createTitle")}</p>
        <label className="block text-[10px] text-[#6b7280]">
          {t("name")}
          <input
            type="text"
            value={draftName}
            placeholder={`CAMADA_${nextIndex}`}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitNewLayer();
              }
            }}
            className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
          />
        </label>
        <ColorField label={t("lineColor")} value={draftColor} onChange={setDraftColor} />
        <button
          type="button"
          onClick={submitNewLayer}
          className="w-full rounded-lg bg-[#0f2848] px-2 py-1.5 text-xs font-medium text-white hover:bg-[#1e3a5f]"
        >
          {t("create")}
        </button>
        {createNotice ? <p className="text-[10px] text-emerald-700">{createNotice}</p> : null}
      </div>

      <ul className="mt-3 space-y-2">
        {layers.map((layer) => {
          const isActive = layer.id === activeLayerId;
          return (
            <li key={layer.id}>
              <div
                className={`flex items-center justify-between gap-2 rounded-lg px-1 py-1 text-sm ${
                  isActive ? "bg-[#eff6ff] ring-1 ring-[#93c5fd]" : ""
                }`}
              >
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={layer.visible}
                    onChange={() => onToggleVisibility(layer.id)}
                  />
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
                    style={{ background: layer.color }}
                  />
                  <button
                    type="button"
                    onClick={() => onSetActive(layer.id)}
                    className="truncate text-left font-mono text-xs text-[#111827] hover:underline"
                    title={t("setActive")}
                  >
                    {layer.name}
                  </button>
                </label>
                <span className="shrink-0 text-[10px] text-[#9ca3af]">
                  {entityCounts[layer.id] ?? 0}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {editingLayer ? (
        <div className="mt-4 space-y-3 border-t border-[#e5e7eb] pt-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-[#6b7280]">
            {t("active")}: <span className="font-mono normal-case text-[#0f2848]">{editingLayer.name}</span>
          </p>

          {canEditStyles ? (
            <>
              <label className="block text-[10px] text-[#6b7280]">
                {t("name")}
                <input
                  type="text"
                  value={editingLayer.name}
                  onChange={(e) => onUpdateLayer(editingLayer.id, { name: e.target.value.toUpperCase() })}
                  className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                />
              </label>

              <ColorField
                label={t("lineColor")}
                value={editingLayer.color}
                onChange={(color) => onUpdateLayer(editingLayer.id, { color })}
              />
              <ColorField
                label={t("fillColor")}
                value={editingLayer.fillColor ?? editingLayer.color}
                onChange={(fillColor) => onUpdateLayer(editingLayer.id, { fillColor })}
              />
              <ColorField
                label={t("textColor")}
                value={editingLayer.textColor ?? "#e2e8f0"}
                onChange={(textColor) => onUpdateLayer(editingLayer.id, { textColor })}
              />

              <label className="block text-[10px] text-[#6b7280]">
                {t("textSize")}
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="range"
                    min={6}
                    max={36}
                    step={1}
                    value={editingLayer.textSize ?? 10}
                    onChange={(e) =>
                      onUpdateLayer(editingLayer.id, { textSize: Number(e.target.value) })
                    }
                    className="flex-1"
                  />
                  <span className="w-10 text-right font-mono text-xs text-[#374151]">
                    {(editingLayer.textSize ?? 10).toFixed(0)}
                  </span>
                </div>
              </label>

              <label className="block text-[10px] text-[#6b7280]">
                {t("lineWidth")}
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="range"
                    min={0.5}
                    max={8}
                    step={0.5}
                    value={editingLayer.lineWidth ?? 1.5}
                    onChange={(e) =>
                      onUpdateLayer(editingLayer.id, { lineWidth: Number(e.target.value) })
                    }
                    className="flex-1"
                  />
                  <span className="w-10 text-right font-mono text-xs text-[#374151]">
                    {(editingLayer.lineWidth ?? 1.5).toFixed(1)}
                  </span>
                </div>
              </label>

              {canDelete && onDeleteLayer ? (
                <button
                  type="button"
                  onClick={() => onDeleteLayer(editingLayer.id)}
                  className="w-full rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                >
                  {t("delete")}
                </button>
              ) : null}
            </>
          ) : (
            <p className="text-[10px] text-[#9ca3af]">{t("lockedHint")}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
