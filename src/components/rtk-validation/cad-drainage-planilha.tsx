"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import {
  DRAINAGE_PIPE_DIAMETERS_MM,
  type DrainageParams,
} from "@/lib/rtk-validation/cad/loteamento-drainage";
import {
  applyDrainageCalcEdit,
  buildDrainageBasinParams,
  buildDrainageCalcRows,
  buildDrainageExcavationRows,
  DRAINAGE_PLANILHA_UI_COLUMNS,
  drainageRowHasFail,
  type DrainageCalcEditPatch,
  type DrainageCalcRow,
  type DrainageCalcUiColumn,
} from "@/lib/rtk-validation/cad/loteamento-drainage-planilha";
import type { CadProject } from "@/lib/rtk-validation/cad/types";

function parseNum(value: string): number | null {
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function fmt(n: number, digits: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function cellValue(row: DrainageCalcRow, key: DrainageCalcUiColumn): string {
  switch (key) {
    case "segmento":
      return row.segmento.replace("->", "→");
    case "pvexist":
      return row.tuboExistente ? "Sim" : "Não";
    case "cr":
      return fmt(row.runoffC, 3);
    case "ctm":
      return `${fmt(row.cotaTerrenoMontanteM, 3)} m`;
    case "refalin":
      return row.superficieRefTubo;
    case "i":
      return `${fmt(row.intensityMmH, 3)} mm/h`;
    case "tcmax":
      return `${fmt(row.tcMin, 3)} min`;
    case "decmedtal":
      return `${fmt(row.decMedTalDecimal * 100, 2)} %`;
    case "scxa":
      return `${fmt(row.contribAreaM2, 2)} m²`;
    case "qesc":
      return `${fmt(row.vazaoEscoandoLps, 3)} l/s`;
    case "qsp":
      return `${fmt(row.vazaoPlenaLps, 3)} l/s`;
    case "vesc":
      return `${fmt(row.velocidadeRealMs, 3)} m/s`;
    case "lamina":
      return `${fmt(row.laminaReal, 2)} ${row.flowClass}`;
    case "declividade":
      return `${fmt(row.slopePct, 2)} %`;
    case "dn":
      return row.secaoTubo;
    case "extensao":
      return `${fmt(row.extensaoM, 3)} m`;
    case "rules":
      return String(row.regrasVioladas);
    default:
      return "";
  }
}

function failColumns(row: DrainageCalcRow): Set<DrainageCalcUiColumn> {
  const set = new Set<DrainageCalcUiColumn>(row.fails.map((f) => f.column));
  if (row.fails.length > 0) set.add("rules");
  return set;
}

type CadDrainagePlanilhaProps = {
  project: CadProject;
  params: Partial<DrainageParams>;
  selectedId: string | null;
  variant?: "page" | "dock";
  onSelectId: (id: string) => void;
  onProjectChange: (project: CadProject) => void;
  onRecalc: () => void;
  onExport: () => void;
  onHydrologyChange?: (patch: { runoffC?: string; intensityMmH?: string; returnPeriodYears?: string }) => void;
};

export function CadDrainagePlanilha({
  project,
  params,
  selectedId,
  variant = "page",
  onSelectId,
  onProjectChange,
  onRecalc,
  onExport,
  onHydrologyChange,
}: CadDrainagePlanilhaProps) {
  const t = useTranslations("rtkCad.drenagem");
  const [sheet, setSheet] = useState<"calc" | "excavacao">("calc");
  const rows = useMemo(() => buildDrainageCalcRows(project, params), [project, params]);
  const excavation = useMemo(() => buildDrainageExcavationRows(project, params), [project, params]);
  const selectedRow = rows.find((r) => r.pipeId === selectedId) ?? rows[0] ?? null;
  const basin = selectedRow ? buildDrainageBasinParams(selectedRow) : null;
  const failCount = rows.filter((r) => drainageRowHasFail(r.fails)).length;

  function commit(pipeId: string, patch: DrainageCalcEditPatch) {
    onProjectChange(applyDrainageCalcEdit(project, pipeId, patch));
  }

  function editSelected(field: "C" | "AREA" | "I" | "TC" | "QIN", raw: string) {
    if (!selectedRow) return;
    const n = parseNum(raw);
    if (n == null) return;
    if (field === "C") {
      onHydrologyChange?.({ runoffC: n.toFixed(3) });
      commit(selectedRow.pipeId, { runoffC: n });
      return;
    }
    if (field === "I") {
      onHydrologyChange?.({ intensityMmH: n.toFixed(1) });
      commit(selectedRow.pipeId, { intensityMmH: n });
      return;
    }
    if (field === "AREA") {
      commit(selectedRow.pipeId, { contribAreaM2: n });
      return;
    }
    if (field === "TC") {
      commit(selectedRow.pipeId, { tcMin: n });
    }
  }

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#d6c58b] bg-[#fffbeb] ${
        variant === "dock" ? "h-[min(42vh,420px)]" : "h-full"
      }`}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#e5d7a3] bg-[#f5efd0] px-3 py-1.5">
        <p className="text-xs font-semibold text-[#0f2848]">{t("planilha.title", { name: project.name || "REDE" })}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSheet("calc")}
            className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
              sheet === "calc" ? "bg-[#0f2848] text-white" : "text-[#6b7280] hover:bg-white"
            }`}
          >
            {t("planilha.sheetCalc")}
          </button>
          <button
            type="button"
            onClick={() => setSheet("excavacao")}
            className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
              sheet === "excavacao" ? "bg-[#0f2848] text-white" : "text-[#6b7280] hover:bg-white"
            }`}
          >
            {t("planilha.sheetExcav")}
          </button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className={`text-[10px] font-semibold ${failCount > 0 ? "text-red-700" : "text-emerald-700"}`}>
            {t("planilha.failCount", { count: failCount, total: rows.length })}
          </span>
          <button
            type="button"
            onClick={onRecalc}
            className="rounded border border-[#0369a1] bg-white px-2 py-1 text-[10px] font-medium text-[#0369a1] hover:bg-[#f0f9ff]"
          >
            {t("recalc")}
          </button>
          <button
            type="button"
            onClick={onExport}
            className="rounded bg-[#15803d] px-2 py-1 text-[10px] font-semibold text-white hover:bg-[#166534]"
          >
            {t("planilha.exportXlsx")}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">
          {sheet === "calc" ? (
            <table className="min-w-max border-collapse text-[10px]">
              <thead className="sticky top-0 z-10 bg-[#efe6b8]">
                <tr>
                  {DRAINAGE_PLANILHA_UI_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      title={col.header}
                      className="border border-[#e5d7a3] px-1.5 py-1 text-left font-semibold uppercase tracking-wide text-[#5b4b12]"
                    >
                      {col.code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={DRAINAGE_PLANILHA_UI_COLUMNS.length} className="px-3 py-4 text-[#9ca3af]">
                      {t("empty")}
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => {
                    const selected = row.pipeId === (selectedId ?? selectedRow?.pipeId);
                    const failed = failColumns(row);
                    const rowFail = drainageRowHasFail(row.fails);
                    return (
                      <tr
                        key={row.pipeId}
                        onClick={() => onSelectId(row.pipeId)}
                        className={`cursor-pointer ${
                          selected ? "bg-[#bfdbfe]" : rowFail ? "bg-[#fee2e2]" : idx % 2 === 0 ? "bg-[#fff8d6]" : "bg-white"
                        }`}
                      >
                        {DRAINAGE_PLANILHA_UI_COLUMNS.map((col) => {
                          const red = failed.has(col.key);
                          const cls = `border border-[#efe6b8] px-1.5 py-0.5 font-mono ${
                            red ? "font-semibold text-red-700" : "text-[#111827]"
                          }`;
                          if (col.key === "pvexist") {
                            return (
                              <td key={col.key} className={cls} onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={row.tuboExistente}
                                  onChange={(e) => commit(row.pipeId, { existingPipe: e.target.checked })}
                                />
                              </td>
                            );
                          }
                          if (col.key === "declividade") {
                            return (
                              <td key={col.key} className={cls} onClick={(e) => e.stopPropagation()}>
                                <input
                                  className={`w-14 rounded border px-0.5 ${red ? "border-red-400 bg-red-50 text-red-700" : "border-[#e5e7eb]"}`}
                                  defaultValue={row.slopePct.toFixed(2)}
                                  key={`${row.pipeId}-i-${row.slopePct}`}
                                  onBlur={(e) => {
                                    const n = parseNum(e.target.value);
                                    if (n == null) return;
                                    commit(row.pipeId, { slopePct: n });
                                  }}
                                />
                              </td>
                            );
                          }
                          if (col.key === "dn") {
                            return (
                              <td key={col.key} className={cls} onClick={(e) => e.stopPropagation()}>
                                <select
                                  className="rounded border border-[#e5e7eb] bg-transparent"
                                  value={row.diameterMm}
                                  onChange={(e) => commit(row.pipeId, { diameterMm: Number(e.target.value) })}
                                >
                                  {DRAINAGE_PIPE_DIAMETERS_MM.map((d) => (
                                    <option key={d} value={d}>
                                      DN{d}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            );
                          }
                          if (col.key === "scxa") {
                            return (
                              <td key={col.key} className={cls} onClick={(e) => e.stopPropagation()}>
                                <input
                                  className="w-20 rounded border border-[#e5e7eb] px-0.5"
                                  defaultValue={row.contribAreaM2.toFixed(2)}
                                  key={`${row.pipeId}-a-${row.contribAreaM2}`}
                                  onBlur={(e) => {
                                    const n = parseNum(e.target.value);
                                    if (n == null) return;
                                    commit(row.pipeId, { contribAreaM2: n });
                                  }}
                                />
                              </td>
                            );
                          }
                          if (col.key === "cr") {
                            return (
                              <td key={col.key} className={cls} onClick={(e) => e.stopPropagation()}>
                                <input
                                  className="w-12 rounded border border-[#e5e7eb] px-0.5"
                                  defaultValue={row.runoffC.toFixed(3)}
                                  key={`${row.pipeId}-c-${row.runoffC}`}
                                  onBlur={(e) => {
                                    const n = parseNum(e.target.value);
                                    if (n == null) return;
                                    onHydrologyChange?.({ runoffC: n.toFixed(3) });
                                    commit(row.pipeId, { runoffC: n });
                                  }}
                                />
                              </td>
                            );
                          }
                          if (col.key === "i") {
                            return (
                              <td key={col.key} className={cls} onClick={(e) => e.stopPropagation()}>
                                <input
                                  className="w-16 rounded border border-[#e5e7eb] px-0.5"
                                  defaultValue={row.intensityMmH.toFixed(1)}
                                  key={`${row.pipeId}-int-${row.intensityMmH}`}
                                  onBlur={(e) => {
                                    const n = parseNum(e.target.value);
                                    if (n == null) return;
                                    onHydrologyChange?.({ intensityMmH: n.toFixed(1) });
                                    commit(row.pipeId, { intensityMmH: n });
                                  }}
                                />
                              </td>
                            );
                          }
                          if (col.key === "tcmax") {
                            return (
                              <td key={col.key} className={cls} onClick={(e) => e.stopPropagation()}>
                                <input
                                  className="w-14 rounded border border-[#e5e7eb] px-0.5"
                                  defaultValue={row.tcMin.toFixed(1)}
                                  key={`${row.pipeId}-tc-${row.tcMin}`}
                                  onBlur={(e) => {
                                    const n = parseNum(e.target.value);
                                    if (n == null) return;
                                    commit(row.pipeId, { tcMin: n });
                                  }}
                                />
                              </td>
                            );
                          }
                          return (
                            <td key={col.key} className={cls}>
                              {cellValue(row, col.key)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            <table className="min-w-max border-collapse text-[10px]">
              <thead className="sticky top-0 z-10 bg-[#efe6b8]">
                <tr>
                  {["NOME", "TUBO", "EXT", "BERCO", "VALA", "TALVALA", "EMEC", "EMAN", "RMEC", "RMAN", "PROF", "CT", "Cota do fundo", "AREACORTE"].map(
                    (h) => (
                      <th key={h} className="border border-[#e5d7a3] px-1.5 py-1 text-left font-semibold text-[#5b4b12]">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {excavation.map((row, idx) => (
                  <tr
                    key={row.pipeId}
                    onClick={() => onSelectId(row.pipeId)}
                    className={`cursor-pointer ${
                      row.pipeId === selectedId ? "bg-[#bfdbfe]" : idx % 2 === 0 ? "bg-[#fff8d6]" : "bg-white"
                    }`}
                  >
                    <td className="border border-[#efe6b8] px-1.5 py-0.5 font-mono">{row.NOME}</td>
                    <td className="border border-[#efe6b8] px-1.5 py-0.5 font-mono">{row.TUBO}</td>
                    <td className="border border-[#efe6b8] px-1.5 py-0.5 font-mono">{fmt(row.EXT, 3)} m</td>
                    <td className="border border-[#efe6b8] px-1.5 py-0.5 font-mono">{fmt(row.BERCO, 3)} m</td>
                    <td className="border border-[#efe6b8] px-1.5 py-0.5 font-mono">{fmt(row.VALA, 3)} m</td>
                    <td className="border border-[#efe6b8] px-1.5 py-0.5">{row.TALVALA}</td>
                    <td className="border border-[#efe6b8] px-1.5 py-0.5 font-mono">{fmt(row.EMEC, 3)} m³</td>
                    <td className="border border-[#efe6b8] px-1.5 py-0.5 font-mono">{fmt(row.EMAN, 3)} m³</td>
                    <td className="border border-[#efe6b8] px-1.5 py-0.5 font-mono">{fmt(row.RMEC, 3)} m³</td>
                    <td className="border border-[#efe6b8] px-1.5 py-0.5 font-mono">{fmt(row.RMAN, 3)} m³</td>
                    <td className="border border-[#efe6b8] px-1.5 py-0.5 font-mono">{fmt(row.PROF, 3)} m</td>
                    <td className="border border-[#efe6b8] px-1.5 py-0.5 font-mono">{fmt(row.CT, 3)} m</td>
                    <td className="border border-[#efe6b8] px-1.5 py-0.5 font-mono">{fmt(row.cotaFundo, 3)} m</td>
                    <td className="border border-[#efe6b8] px-1.5 py-0.5 font-mono">{fmt(row.AREACORTE, 5)} m²</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside className="flex w-[220px] shrink-0 flex-col overflow-auto border-l border-[#e5d7a3] bg-[#fffdf3]">
          <div className="border-b border-[#e5d7a3] px-3 py-2">
            <p className="text-[11px] font-semibold text-[#0f2848]">{t("planilha.basinTitle")}</p>
            <p className="text-[10px] text-[#6b7280]">
              {selectedRow ? selectedRow.segmento.replace("->", "→") : "—"}
            </p>
          </div>
          {basin && selectedRow ? (
            <dl className="space-y-1.5 px-3 py-2 text-[10px]">
              {(
                [
                  ["AREA", `${fmt(basin.AREA, 2)} m²`, "AREA"],
                  ["C", fmt(basin.C, 3), "C"],
                  ["CATCHMENT", String(basin.CATCHMENT), null],
                  ["CXA", `${fmt(basin.CXA, 2)} m²`, null],
                  ["DECTAL", `${fmt(basin.DECTAL, 2)} %`, null],
                  ["F", fmt(basin.F, 3), null],
                  ["H", `${fmt(basin.H, 3)} m`, null],
                  ["LT", `${fmt(basin.LT, 3)} m`, null],
                  ["QIN", `${fmt(basin.QIN, 3)} l/s`, null],
                  ["TC", `${fmt(basin.TC, 3)} min`, "TC"],
                  ["I", `${fmt(basin.I, 3)} mm/h`, "I"],
                  ["TR", `${fmt(selectedRow.returnPeriodYears, 0)} anos`, "TR"],
                ] as const
              ).map(([label, value, edit]) => (
                <div key={label}>
                  <dt className="font-semibold uppercase tracking-wide text-[#6b7280]">{label}</dt>
                  <dd>
                    {edit === "AREA" || edit === "C" || edit === "TC" || edit === "I" ? (
                      <input
                        className="mt-0.5 w-full rounded border border-[#d1d5db] bg-white px-1.5 py-0.5 font-mono"
                        defaultValue={
                          edit === "AREA"
                            ? selectedRow.contribAreaM2.toFixed(2)
                            : edit === "C"
                              ? selectedRow.runoffC.toFixed(3)
                              : edit === "I"
                                ? selectedRow.intensityMmH.toFixed(1)
                                : selectedRow.tcMin.toFixed(1)
                        }
                        key={`${selectedRow.pipeId}-${edit}-${value}`}
                        onBlur={(e) => editSelected(edit, e.target.value)}
                      />
                    ) : edit === "TR" ? (
                      <input
                        className="mt-0.5 w-full rounded border border-[#d1d5db] bg-white px-1.5 py-0.5 font-mono"
                        defaultValue={String(selectedRow.returnPeriodYears)}
                        key={`${selectedRow.pipeId}-tr`}
                        onBlur={(e) => {
                          const n = parseNum(e.target.value);
                          if (n == null) return;
                          onHydrologyChange?.({ returnPeriodYears: String(n) });
                        }}
                      />
                    ) : (
                      <span className="font-mono text-[#111827]">{value}</span>
                    )}
                  </dd>
                </div>
              ))}
              <div className="border-t border-[#e5d7a3] pt-2">
                <p className="mb-1 font-semibold uppercase tracking-wide text-[#6b7280]">{t("planilha.hydraulics")}</p>
                {(
                  [
                    ["QESC", `${fmt(basin.QESC, 3)} l/s`],
                    ["VESC", `${fmt(basin.VESC, 3)} m/s`],
                    ["QSP", `${fmt(basin.QSP, 3)} l/s`],
                    ["DEG", `${fmt(basin.DEG, 3)} m`],
                    ["SUMP", `${fmt(basin.SUMP, 3)} m`],
                    ["RULES", String(basin.RULES)],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <dt className="text-[#6b7280]">{label}</dt>
                    <dd className={`font-mono ${label === "RULES" && basin.RULES > 0 ? "font-semibold text-red-700" : ""}`}>
                      {value}
                    </dd>
                  </div>
                ))}
              </div>
              {selectedRow.fails.length > 0 ? (
                <ul className="space-y-0.5 border-t border-red-200 pt-2 text-red-700">
                  {selectedRow.fails.map((f) => (
                    <li key={f.key}>{f.message}</li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-emerald-200 pt-2 font-semibold text-emerald-700">{t("ok")}</p>
              )}
              <p className="pt-1 text-[10px] text-[#9ca3af]">{t("planilha.areaHint")}</p>
            </dl>
          ) : (
            <p className="px-3 py-2 text-[10px] text-[#9ca3af]">{t("planilha.pickHint")}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
