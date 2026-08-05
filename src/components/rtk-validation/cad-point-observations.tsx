"use client";

import { useEffect, useMemo, useState } from "react";
import { runQueuedInEffect } from "@/lib/react/queue-in-effect";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import type { CadEntity, CadPointEntity } from "@/lib/rtk-validation/cad/types";

const OBSERVATION_LAYER_IDS = new Set(["rtk_points", "ctrl_known", "ctrl_obs"]);

export type CadPointPatch = Partial<Pick<CadPointEntity, "label" | "x" | "y" | "z">>;

type CadPointObservationsProps = {
  entities: CadEntity[];
  layers: { id: string; name: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdatePoint: (id: string, patch: CadPointPatch) => void;
};

function layerName(layers: CadPointObservationsProps["layers"], layerId: string) {
  return layers.find((l) => l.id === layerId)?.name ?? layerId;
}

function parseCoord(text: string): number | null {
  const n = Number(text.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function EditableTextCell({
  value,
  onCommit,
  onFocusSelect,
}: {
  value: string;
  onCommit: (next: string) => void;
  onFocusSelect?: () => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => runQueuedInEffect(() => setDraft(value)), [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed !== value) onCommit(trimmed);
    else setDraft(value);
  };

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => onFocusSelect?.()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      className="w-full min-w-[4.5rem] rounded border border-transparent bg-transparent px-1 py-0.5 font-medium text-[#0f2848] hover:border-[#d1d5db] focus:border-[#0891b2] focus:bg-white focus:outline-none"
    />
  );
}

function EditableNumberCell({
  value,
  decimals,
  onCommit,
  onFocusSelect,
}: {
  value: number;
  decimals: number;
  onCommit: (next: number) => void;
  onFocusSelect?: () => void;
}) {
  const formatted = value.toFixed(decimals);
  const [draft, setDraft] = useState(formatted);

  useEffect(() => runQueuedInEffect(() => setDraft(value.toFixed(decimals))), [value, decimals]);

  const commit = () => {
    const parsed = parseCoord(draft);
    if (parsed == null) {
      setDraft(formatted);
      return;
    }
    if (Math.abs(parsed - value) > 1e-9) onCommit(parsed);
    else setDraft(formatted);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => onFocusSelect?.()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      className="w-full min-w-[5.5rem] rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-[#374151] hover:border-[#d1d5db] focus:border-[#0891b2] focus:bg-white focus:outline-none"
    />
  );
}

export function CadPointObservations({
  entities,
  layers,
  selectedId,
  onSelect,
  onUpdatePoint,
}: CadPointObservationsProps) {
  const t = useTranslations("rtkCad.observations");
  const [open, setOpen] = useState(true);

  const points = useMemo(
    () =>
      entities.filter(
        (e): e is CadPointEntity =>
          e.type === "point" && OBSERVATION_LAYER_IDS.has(e.layerId),
      ),
    [entities],
  );

  if (points.length === 0) return null;

  return (
    <section className="rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <h2 className="text-sm font-semibold text-[#0f2848]">{t("title")}</h2>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            {t("count", { count: points.length })}
          </p>
        </div>
        <span className="text-xs text-[#6b7280]">{open ? "▾" : "▸"}</span>
      </button>

      {open ? (
        <div className="border-t border-[#e5e7eb] px-4 pb-4">
          <p className="pt-3 text-xs text-[#6b7280]">{t("hint")}</p>
          <div className="mt-3 max-h-52 overflow-y-auto rounded-lg border border-[#e5e7eb]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#f9fafb] text-[#6b7280]">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("point")}</th>
                  <th className="px-3 py-2 font-medium">{t("layer")}</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">E</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">N</th>
                  <th className="px-3 py-2 font-medium">Z</th>
                </tr>
              </thead>
              <tbody>
                {points.map((pt) => {
                  const active = pt.id === selectedId;
                  const selectRow = () => onSelect(pt.id);
                  return (
                    <tr
                      key={pt.id}
                      onClick={selectRow}
                      className={`cursor-pointer ${active ? "bg-[#f0fdff]" : "hover:bg-[#f9fafb]"}`}
                    >
                      <td className="px-2 py-1.5">
                        <EditableTextCell
                          value={pt.label ?? pt.id}
                          onFocusSelect={selectRow}
                          onCommit={(label) => onUpdatePoint(pt.id, { label: label || pt.label })}
                        />
                      </td>
                      <td className="px-3 py-2 text-[#6b7280]">
                        {layerName(layers, pt.layerId)}
                      </td>
                      <td className="hidden px-2 py-1.5 sm:table-cell">
                        <EditableNumberCell
                          value={pt.x}
                          decimals={3}
                          onFocusSelect={selectRow}
                          onCommit={(x) => onUpdatePoint(pt.id, { x })}
                        />
                      </td>
                      <td className="hidden px-2 py-1.5 sm:table-cell">
                        <EditableNumberCell
                          value={pt.y}
                          decimals={3}
                          onFocusSelect={selectRow}
                          onCommit={(y) => onUpdatePoint(pt.id, { y })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <EditableNumberCell
                          value={pt.z}
                          decimals={3}
                          onFocusSelect={selectRow}
                          onCommit={(z) => onUpdatePoint(pt.id, { z })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
