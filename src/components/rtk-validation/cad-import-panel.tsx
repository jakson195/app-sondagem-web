"use client";

import { useState } from "react";
import {
  importAccept,
  importAllowsMultiple,
  importTitle,
  isPointsImport,
  type CadImportKind,
} from "@/lib/rtk-validation/cad/cad-io-kinds";
import type { SurveyColumnMap } from "@/lib/rtk-validation/parsers";

type CadImportPanelProps = {
  kind: CadImportKind;
  busy: boolean;
  notice: string | null;
  onClose: () => void;
  onPickFile: (files: File[]) => void;
  onImportPoints?: (file: File, map: SurveyColumnMap) => void;
  preview?: {
    fileName: string;
    format: string;
    headers: string[];
    rows: string[][];
    map: SurveyColumnMap;
  } | null;
  onMapChange?: (map: SurveyColumnMap) => void;
};

export function CadImportPanel({
  kind,
  busy,
  notice,
  onClose,
  onPickFile,
  onImportPoints,
  preview,
  onMapChange,
}: CadImportPanelProps) {
  const [picked, setPicked] = useState<File | null>(null);
  const points = isPointsImport(kind);

  function applyFiles(files: File[]) {
    const file = files[0] ?? null;
    setPicked(file);
    if (!file) return;
    if (points) onPickFile(files);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#0f2848]">{importTitle(kind)}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-0.5 text-[10px] font-medium text-[#6b7280] hover:bg-[#f3f4f6]"
        >
          Voltar
        </button>
      </div>
      <p className="text-[10px] text-[#6b7280]">
        {points
          ? "Escolha o arquivo, confira o mapeamento das colunas e importe nas coordenadas reais do projeto."
          : "Escolha o arquivo e importe. A geometria entra em coordenadas de mundo, não de tela."}
      </p>
      <input
        type="file"
        accept={importAccept(kind)}
        multiple={importAllowsMultiple(kind)}
        disabled={busy}
        className="block w-full cursor-pointer text-xs text-[#374151] file:mr-2 file:rounded-md file:border-0 file:bg-[#0f2848] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-[#1e3a5f]"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          applyFiles(files);
        }}
      />
      {picked ? <p className="truncate font-mono text-[10px] text-[#374151]">{picked.name}</p> : null}
      {points && preview ? (
        <div className="space-y-2 border-t border-[#e5e7eb] pt-3">
          <p className="text-[10px] font-medium text-[#374151]">Formato: {preview.format.toUpperCase()}</p>
          <p className="text-[10px] font-medium text-[#374151]">Mapeamento de colunas</p>
          {(
            [
              ["code", "Código"],
              ["east", "Este"],
              ["north", "Norte"],
              ["elev", "Cota"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-[10px] text-[#6b7280]">
              {label}
              <select
                value={String(preview.map[key] ?? -1)}
                onChange={(e) =>
                  onMapChange?.({
                    ...preview.map,
                    [key]: Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 text-xs"
              >
                <option value={-1}>—</option>
                {preview.headers.map((h, i) => (
                  <option key={`${h}-${i}`} value={i}>
                    {i + 1}: {h || `Coluna ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <p className="text-[10px] font-medium text-[#374151]">Opções</p>
          <label className="flex items-center gap-2 text-[11px] text-[#374151]">
            <input
              type="checkbox"
              checked={preview.map.headerRow !== false}
              onChange={(e) => onMapChange?.({ ...preview.map, headerRow: e.target.checked })}
            />
            Primeira linha é cabeçalho
          </label>
          {preview.rows[1] ? (
            <p className="font-mono text-[10px] text-[#6b7280]">
              Ex.: {preview.rows[preview.map.headerRow !== false ? 1 : 0]?.slice(0, 5).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}
      {notice ? <p className="text-[11px] text-[#0f2848]">{notice}</p> : null}
      <button
        type="button"
        disabled={
          busy ||
          !picked ||
          (points && (!preview || preview.map.east < 0 || preview.map.north < 0))
        }
        onClick={() => {
          if (!picked) return;
          if (points && onImportPoints && preview) {
            onImportPoints(picked, {
              ...preview.map,
              east: preview.map.east,
              north: preview.map.north,
            });
            return;
          }
          onPickFile([picked]);
        }}
        className="w-full rounded-lg bg-[#0f2848] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
      >
        {busy ? "Importando…" : picked && !points ? "Importar" : points ? "Importar pontos" : "Importar"}
      </button>
    </section>
  );
}
