"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runQueuedInEffect } from "@/lib/react/queue-in-effect";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import type { MemorialFormDefaults } from "@/lib/rtk-validation/cad";
import type { CadPolylineEntity, CadProject, CadRasterOverlay } from "@/lib/rtk-validation/cad/types";
import { countRasterLayerItems, rastersWithPrintLayerVisibility } from "@/lib/rtk-validation/cad/raster-layers";
import { AbntLegendBlock } from "@/components/rtk-validation/cad-print-abnt-legend";
import { CadPrintSupplementaryPanel } from "@/components/rtk-validation/cad-print-supplementary-panel";
import {
  ABNT_SHEET_FORMATS,
  computeAbntSheetLayout,
} from "@/lib/rtk-validation/cad/abnt-sheet-format";
import {
  buildDefaultLayoutState,
  ClickToEdit,
  printSheetFrameBorder,
  sheetDimensions,
  PRINT_CELL_BORDER,
  type LayoutState,
} from "@/components/rtk-validation/cad-print-shared";
import {
  CadPrintDrawing,
  estimateNominalScale,
  formatScaleDenominator,
  parseScaleDenominator,
  computePrintSheetMeta,
  type DrawingScaleMode,
  type PrintLayerVisibility,
} from "@/components/rtk-validation/cad-print-drawing";
import { waitUntil, type LocationMapLoadStatus } from "@/hooks/use-location-map-image";

const LOGO_ACCEPT = ".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml";

type CadPrintLayoutProps = {
  project: CadProject;
  memorialForm: MemorialFormDefaults;
  selectedPolyline?: CadPolylineEntity | null;
  rasters?: CadRasterOverlay[];
};

function buildPrintLayerVisibility(layers: CadProject["layers"]): PrintLayerVisibility {
  return Object.fromEntries(layers.map((l) => [l.id, l.visible !== false]));
}

export function CadPrintLayout({ project, memorialForm, selectedPolyline, rasters = [] }: CadPrintLayoutProps) {
  const t = useTranslations("rtkCad.printLayout");
  const fileRef = useRef<HTMLInputElement>(null);
  const previewHostRef = useRef<HTMLDivElement>(null);
  const locationMapStatusRef = useRef<LocationMapLoadStatus>("idle");
  const [locationMapStatus, setLocationMapStatus] = useState<LocationMapLoadStatus>("idle");
  const [printing, setPrinting] = useState(false);
  const [layout, setLayout] = useState<LayoutState>(() =>
    buildDefaultLayoutState(project, memorialForm, selectedPolyline),
  );
  const [previewScale, setPreviewScale] = useState(1);
  const [drawingZoom, setDrawingZoom] = useState(1);
  const [scaleMode, setScaleMode] = useState<DrawingScaleMode>("fit");
  const [vertexMarkerScale, setVertexMarkerScale] = useState(130);
  const [editTextMode, setEditTextMode] = useState(false);
  const [printLayerVisibility, setPrintLayerVisibility] = useState<PrintLayerVisibility>(() =>
    buildPrintLayerVisibility(project.layers),
  );

  useEffect(
    () =>
      runQueuedInEffect(() => {
        setPrintLayerVisibility((prev) => {
          const next: PrintLayerVisibility = {};
          for (const layer of project.layers) {
            next[layer.id] = layer.id in prev ? prev[layer.id] : layer.visible !== false;
          }
          return next;
        });
      }),
    [project.layers],
  );

  const printRasters = useMemo(
    () => rastersWithPrintLayerVisibility(rasters, printLayerVisibility),
    [rasters, printLayerVisibility],
  );

  const patchLayout = useCallback((patch: Partial<LayoutState>) => {
    setLayout((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(
    () =>
      runQueuedInEffect(() => {
        setLayout((prev) => ({
          ...prev,
          projeto: project.name,
          titulo: prev.titulo || selectedPolyline?.name || "PLANTA TOPOGRÁFICA GEORREFERENCIADA",
          empresa: prev.empresa || memorialForm.lawFirmName || "DATAGEO NTRIP",
          desenhista: prev.desenhista || memorialForm.technicalName,
          proprietario: prev.proprietario || memorialForm.owner || "",
          local:
            prev.local ||
            (memorialForm.municipality && memorialForm.state
              ? `${memorialForm.municipality} - ${memorialForm.state}`
              : memorialForm.municipality || memorialForm.state || ""),
        }));
      }),
    [
      project.name,
      selectedPolyline?.name,
      memorialForm.lawFirmName,
      memorialForm.technicalName,
      memorialForm.owner,
      memorialForm.municipality,
      memorialForm.state,
    ],
  );

  const sheet = useMemo(
    () => sheetDimensions(layout.formato, layout.orientacao),
    [layout.formato, layout.orientacao],
  );

  const sheetLayout = useMemo(
    () => computeAbntSheetLayout(layout.formato, layout.orientacao),
    [layout.formato, layout.orientacao],
  );

  const framePad = sheetLayout.frameLineWidth;
  const contentW = Math.max(1, sheetLayout.innerW - 2 * framePad);
  const contentH = Math.max(1, sheetLayout.innerH - 2 * framePad);
  const drawW = contentW;
  const drawH = Math.max(1, contentH - sheetLayout.bottomStripH);

  const parsedScale = useMemo(() => parseScaleDenominator(layout.escala), [layout.escala]);
  const effectiveScaleMode = scaleMode === "nominal" && parsedScale ? "nominal" : "fit";
  const effectiveScaleDenominator = effectiveScaleMode === "nominal" ? parsedScale : null;

  const sheetMeta = computePrintSheetMeta(
    project,
    drawW,
    drawH,
    drawingZoom,
    effectiveScaleMode,
    effectiveScaleDenominator,
    printLayerVisibility,
    printRasters,
  );

  const togglePrintLayer = useCallback((layerId: string) => {
    setPrintLayerVisibility((prev) => ({ ...prev, [layerId]: !prev[layerId] }));
  }, []);

  const setAllPrintLayers = useCallback(
    (visible: boolean) => {
      setPrintLayerVisibility(Object.fromEntries(project.layers.map((l) => [l.id, visible])));
    },
    [project.layers],
  );

  const syncPrintLayersFromDrawing = useCallback(() => {
    setPrintLayerVisibility(buildPrintLayerVisibility(project.layers));
  }, [project.layers]);

  const patchTextOverride = useCallback((key: string, value: string) => {
    setLayout((prev) => ({
      ...prev,
      textOverrides: { ...prev.textOverrides, [key]: value },
    }));
  }, []);

  const applyPresetScale = useCallback(
    (denominator: number) => {
      setScaleMode("nominal");
      setDrawingZoom(1);
      patchLayout({ escala: formatScaleDenominator(denominator) });
    },
    [patchLayout],
  );

  const fitDrawingToSheet = useCallback(() => {
    setScaleMode("fit");
    setDrawingZoom(1);
    const estimated = estimateNominalScale(sheetMeta.visibleEntities, drawW, drawH, printRasters);
    if (estimated) {
      const rounded = Math.max(1, Math.round(estimated / 50) * 50);
      patchLayout({ escala: formatScaleDenominator(rounded) });
    }
  }, [sheetMeta.visibleEntities, drawW, drawH, patchLayout, printRasters]);

  const handleLocationMapStatusChange = useCallback((status: LocationMapLoadStatus) => {
    locationMapStatusRef.current = status;
    setLocationMapStatus(status);
  }, []);

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (sheetLayout.supplementaryW <= 0) {
          handleLocationMapStatusChange("idle");
        }
      }),
    [sheetLayout.supplementaryW, handleLocationMapStatusChange],
  );

  const handlePrint = useCallback(async () => {
    setEditTextMode(false);
    setPrinting(true);
    try {
      if (sheetLayout.supplementaryW > 0) {
        await waitUntil(() => locationMapStatusRef.current !== "loading");
      }
      window.print();
    } finally {
      setPrinting(false);
    }
  }, [sheetLayout.supplementaryW]);

  useEffect(() => {
    const host = previewHostRef.current;
    if (!host) return;

    const updateScale = () => {
      const rect = host.getBoundingClientRect();
      const mmToPx = 96 / 25.4;
      const sheetPxW = sheet.w * mmToPx;
      const sheetPxH = sheet.h * mmToPx;
      const pad = 24;
      const scale = Math.min((rect.width - pad) / sheetPxW, (rect.height - pad) / sheetPxH, 1);
      setPreviewScale(Number.isFinite(scale) && scale > 0 ? scale : 1);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(host);
    window.addEventListener("resize", updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [sheet.w, sheet.h]);

  function handleLogoFile(file: File | undefined) {
    if (!file) return;
    const okType =
      file.type === "image/png" ||
      file.type === "image/jpeg" ||
      file.type === "image/svg+xml" ||
      /\.(png|jpe?g|svg)$/i.test(file.name);
    if (!okType) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") patchLayout({ logo: reader.result });
    };
    reader.readAsDataURL(file);
  }

  const pageSizeCss =
    layout.orientacao === "paisagem"
      ? `${layout.formato} landscape`
      : `${layout.formato} portrait`;

  const toolbarBtn =
    "rounded-lg border border-[#d1d5db] px-3 py-2 text-sm font-medium text-[#374151] hover:bg-[#f3f4f6]";
  const toolbarBtnActive =
    "rounded-lg border border-[#0f2848] bg-[#0f2848] px-3 py-2 text-sm font-medium text-white";

  return (
    <div className="cad-print-layout space-y-4">
      <div className="cad-interface rounded-xl border border-[#e5e7eb] bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#0f2848]">{t("title")}</h3>
            <p className="mt-1 text-xs text-[#6b7280]">{t("subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={LOGO_ACCEPT}
              className="hidden"
              onChange={(e) => {
                handleLogoFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button type="button" className={toolbarBtn} onClick={() => fileRef.current?.click()}>
              {t("importLogo")}
            </button>
            <button
              type="button"
              className="rounded-lg bg-[#0f2848] px-4 py-2 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-70"
              disabled={printing || (sheetLayout.supplementaryW > 0 && locationMapStatus === "loading")}
              onClick={() => void handlePrint()}
              title={
                sheetLayout.supplementaryW > 0 && locationMapStatus === "loading"
                  ? t("printWaitMap")
                  : undefined
              }
            >
              {printing
                ? t("printPreparing")
                : sheetLayout.supplementaryW > 0 && locationMapStatus === "loading"
                  ? t("printLoadingMap")
                  : t("print")}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#6b7280]">{t("format")}</p>
            <div className="flex flex-wrap gap-1">
              {ABNT_SHEET_FORMATS.slice().reverse().map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  className={layout.formato === fmt ? toolbarBtnActive : toolbarBtn}
                  onClick={() => patchLayout({ formato: fmt })}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#6b7280]">{t("orientation")}</p>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className={layout.orientacao === "retrato" ? toolbarBtnActive : toolbarBtn}
                onClick={() => patchLayout({ orientacao: "retrato" })}
              >
                {t("portrait")}
              </button>
              <button
                type="button"
                className={layout.orientacao === "paisagem" ? toolbarBtnActive : toolbarBtn}
                onClick={() => patchLayout({ orientacao: "paisagem" })}
              >
                {t("landscape")}
              </button>
            </div>
          </div>
          <div className="flex items-end">
            <p className="text-xs text-[#6b7280]">
              {t("sheetSize", { w: sheet.w, h: sheet.h, format: layout.formato })}
              {" · "}
              {t("abntMargins", {
                left: sheetLayout.marginLeft,
                other: sheetLayout.marginOther,
                frame: sheetLayout.frameLineWidth,
                legend: sheetLayout.legendWidth,
              })}
              {" · "}
              {t("abntLegendRule", { sum: 185 })}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[#6b7280]">{t("drawingScale")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className={toolbarBtn} onClick={() => setDrawingZoom((z) => Math.max(0.25, z / 1.25))}>
              −
            </button>
            <input
              type="range"
              min={25}
              max={400}
              step={5}
              value={Math.round(drawingZoom * 100)}
              onChange={(e) => {
                setDrawingZoom(Number(e.target.value) / 100);
                if (scaleMode === "nominal") setScaleMode("fit");
              }}
              className="min-w-[140px] flex-1"
              aria-label={t("drawingZoom")}
            />
            <button type="button" className={toolbarBtn} onClick={() => setDrawingZoom((z) => Math.min(4, z * 1.25))}>
              +
            </button>
            <span className="min-w-[4rem] text-center text-xs font-mono text-[#374151]">
              {Math.round(drawingZoom * 100)}%
            </span>
            <button type="button" className={toolbarBtn} onClick={fitDrawingToSheet}>
              {t("fitDrawing")}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {[500, 1000, 2000, 5000].map((den) => (
              <button
                key={den}
                type="button"
                className={
                  effectiveScaleMode === "nominal" && parsedScale === den ? toolbarBtnActive : toolbarBtn
                }
                onClick={() => applyPresetScale(den)}
              >
                1:{den}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-[#6b7280]">
            {effectiveScaleMode === "nominal" && parsedScale
              ? t("scaleModeNominal", { scale: layout.escala })
              : t("scaleModeFit")}
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[#6b7280]">{t("vertexMarkerSize")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={toolbarBtn}
              onClick={() => setVertexMarkerScale((value) => Math.max(50, value - 10))}
            >
              −
            </button>
            <input
              type="range"
              min={50}
              max={500}
              step={5}
              value={vertexMarkerScale}
              onChange={(e) => setVertexMarkerScale(Number(e.target.value))}
              className="min-w-[140px] flex-1"
              aria-label={t("vertexMarkerSize")}
            />
            <button
              type="button"
              className={toolbarBtn}
              onClick={() => setVertexMarkerScale((value) => Math.min(500, value + 10))}
            >
              +
            </button>
            <span className="min-w-[4rem] text-center text-xs font-mono text-[#374151]">
              {vertexMarkerScale}%
            </span>
            <button type="button" className={toolbarBtn} onClick={() => setVertexMarkerScale(130)}>
              {t("vertexMarkerReset")}
            </button>
          </div>
          <p className="mt-2 text-xs text-[#6b7280]">{t("vertexMarkerSizeHint")}</p>
        </div>

        <div className="mt-4 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[#374151]">
            <input
              type="checkbox"
              checked={editTextMode}
              onChange={(e) => setEditTextMode(e.target.checked)}
              className="rounded border-[#d1d5db]"
            />
            {t("editTextMode")}
          </label>
          <p className="mt-1 text-xs text-[#6b7280]">{t("editTextModeHint")}</p>
        </div>

        <div className="mt-4 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[#6b7280]">{t("locationMapStyle")}</p>
          <div className="mt-3 flex flex-wrap gap-1">
            {(["satellite", "street", "topo"] as const).map((style) => (
              <button
                key={style}
                type="button"
                className={layout.locationMapStyle === style ? toolbarBtnActive : toolbarBtn}
                onClick={() => patchLayout({ locationMapStyle: style })}
              >
                {t(`locationMapStyles.${style}`)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-[#6b7280]">{t("locationMapStyleHint")}</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[#374151]">
            <input
              type="checkbox"
              checked={layout.showConventions}
              onChange={(e) => patchLayout({ showConventions: e.target.checked })}
              className="rounded border-[#d1d5db]"
            />
            {t("showConventions")}
          </label>
          <p className="text-xs text-[#6b7280]">{t("showConventionsHint")}</p>
        </div>

        <div className="mt-4 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[#6b7280]">{t("printLayers")}</p>
            <div className="flex flex-wrap gap-1">
              <button type="button" className={toolbarBtn} onClick={() => setAllPrintLayers(true)}>
                {t("printLayersAll")}
              </button>
              <button type="button" className={toolbarBtn} onClick={() => setAllPrintLayers(false)}>
                {t("printLayersNone")}
              </button>
              <button type="button" className={toolbarBtn} onClick={syncPrintLayersFromDrawing}>
                {t("printLayersSync")}
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-[#6b7280]">{t("printLayersHint")}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {project.layers.map((layer) => {
              const count =
                countRasterLayerItems(layer.id, rasters) ??
                project.entities.filter((e) => e.layerId === layer.id).length;
              return (
                <label
                  key={layer.id}
                  className="flex cursor-pointer items-center gap-2 text-sm text-[#374151]"
                >
                  <input
                    type="checkbox"
                    checked={printLayerVisibility[layer.id] !== false}
                    onChange={() => togglePrintLayer(layer.id)}
                    className="rounded border-[#d1d5db]"
                  />
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-[#d1d5db]"
                    style={{ background: layer.color }}
                  />
                  <span className="font-mono text-xs">{layer.name}</span>
                  <span className="text-xs text-[#9ca3af]">({count})</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div
        ref={previewHostRef}
        className="prancha-wrapper flex min-h-[520px] items-center justify-center overflow-auto rounded-xl border border-[#d1d5db] bg-[#e5e7eb] p-4"
        style={{
          ["--preview-scale" as string]: String(previewScale),
          ["--abnt-frame-mm" as string]: `${sheetLayout.frameLineWidth}mm`,
        }}
      >
        <div
          style={{
            transform: `scale(${previewScale})`,
            transformOrigin: "center center",
          }}
        >
          <div
            className="prancha relative bg-white text-black shadow-lg"
            style={{
              width: `${sheet.w}mm`,
              height: `${sheet.h}mm`,
              boxSizing: "border-box",
              ["--abnt-m-left" as string]: `${sheetLayout.innerLeft}mm`,
              ["--abnt-m-top" as string]: `${sheetLayout.innerTop}mm`,
              ["--abnt-m-right" as string]: `${sheetLayout.innerRight}mm`,
              ["--abnt-m-bottom" as string]: `${sheetLayout.innerBottom}mm`,
            }}
          >
            {/* Faixas de margem ABNT — visíveis só na pré-visualização */}
            <div className="print-margin-overlay" aria-hidden />

            {/* Nota superior esquerda */}
            <div
              style={{
                position: "absolute",
                top: `${sheetLayout.innerTop + 1}mm`,
                left: `${sheetLayout.innerLeft + 2}mm`,
                fontSize: "2mm",
                fontWeight: 700,
                letterSpacing: "0.02em",
                zIndex: 2,
                maxWidth: `${sheetLayout.innerW * 0.45}mm`,
              }}
            >
              <ClickToEdit
                value={layout.conformeNota}
                onChange={(conformeNota) => patchLayout({ conformeNota })}
              />
            </div>

            {/* Área principal: quadro ABNT + desenho + faixa inferior */}
            <div
              className="print-sheet-frame"
              style={{
                position: "absolute",
                top: `${sheetLayout.innerTop}mm`,
                left: `${sheetLayout.innerLeft}mm`,
                width: `${sheetLayout.innerW}mm`,
                height: `${sheetLayout.innerH}mm`,
                boxSizing: "border-box",
                overflow: "hidden",
              }}
            >
              {/* Contorno ABNT por cima do conteúdo — evita borda direita coberta pelo desenho branco */}
              <div
                className="print-sheet-frame-outline"
                aria-hidden
                style={{
                  boxSizing: "border-box",
                  border: printSheetFrameBorder(),
                }}
              />
              <div
                className="print-sheet-frame-content"
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  boxSizing: "border-box",
                }}
              >
              <div
                className="print-drawing-area"
                style={{
                  width: "100%",
                  height: `${drawH}mm`,
                  overflow: "hidden",
                  background: "#fff",
                  borderBottom: PRINT_CELL_BORDER,
                  boxSizing: "border-box",
                  flexShrink: 0,
                }}
              >
                <CadPrintDrawing
                  project={project}
                  widthMm={drawW}
                  heightMm={drawH}
                  drawingZoom={drawingZoom}
                  scaleMode={effectiveScaleMode}
                  scaleDenominator={effectiveScaleDenominator}
                  emptyLabel={t("noDrawing")}
                  showConventions={layout.showConventions}
                  conventionsTitle={t("legendTitle")}
                  layerVisibility={printLayerVisibility}
                  rasters={printRasters}
                  vertexMarkerScale={vertexMarkerScale / 100}
                  editTextMode={editTextMode}
                  textOverrides={layout.textOverrides}
                  onTextOverride={patchTextOverride}
                />
              </div>

              <div
                style={{
                  height: `${sheetLayout.bottomStripH}mm`,
                  width: "100%",
                  display: "flex",
                  alignItems: "stretch",
                  justifyContent: "flex-end",
                  gap: "2mm",
                  boxSizing: "border-box",
                  flexShrink: 0,
                }}
              >
                {sheetLayout.supplementaryW > 0 ? (
                  <CadPrintSupplementaryPanel
                    layout={layout}
                    project={project}
                    entities={sheetMeta.visibleEntities}
                    selectedPolyline={selectedPolyline}
                    utmZone={sheetMeta.utmZone}
                    swapEn={sheetMeta.swapEn}
                    georef={sheetMeta.georef}
                    projectBounds={sheetMeta.projectBounds}
                    widthMm={sheetLayout.supplementaryW}
                    heightMm={sheetLayout.bottomStripH}
                    onLocationMapStatusChange={handleLocationMapStatusChange}
                  />
                ) : null}

                <AbntLegendBlock
                  layout={layout}
                  patchLayout={patchLayout}
                  widthMm={sheetLayout.legendWidth}
                  heightMm={sheetLayout.bottomStripH}
                />
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="cad-interface text-xs text-[#6b7280]">{t("editHint")}</p>

      <style>{`
        @media screen {
          .prancha-wrapper {
            --print-border-w: max(0.25mm, calc(1.5px / var(--preview-scale, 1)));
            --print-frame-w: max(var(--abnt-frame-mm, 0.5mm), calc(2px / var(--preview-scale, 1)));
            --print-sheet-outline-w: calc(1px / var(--preview-scale, 1));
          }

          .prancha-wrapper .prancha {
            outline: var(--print-sheet-outline-w) solid #94a3b8;
            outline-offset: 0;
          }

          .prancha-wrapper .print-margin-overlay {
            position: absolute;
            inset: 0;
            z-index: 0;
            pointer-events: none;
            box-sizing: border-box;
            padding:
              max(var(--abnt-m-top, 7mm), calc(2px / var(--preview-scale, 1)))
              max(var(--abnt-m-right, 7mm), calc(3px / var(--preview-scale, 1)))
              max(var(--abnt-m-bottom, 7mm), calc(2px / var(--preview-scale, 1)))
              max(var(--abnt-m-left, 25mm), calc(4px / var(--preview-scale, 1)));
            background: repeating-linear-gradient(
              -45deg,
              rgba(148, 163, 184, 0.16) 0 1.2mm,
              rgba(148, 163, 184, 0.38) 1.2mm 2.4mm
            );
            -webkit-mask:
              linear-gradient(#fff 0 0) content-box,
              linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask:
              linear-gradient(#fff 0 0) content-box,
              linear-gradient(#fff 0 0);
            mask-composite: exclude;
          }

          .prancha-wrapper .print-sheet-frame {
            z-index: 1;
          }

          .prancha-wrapper .print-sheet-frame-outline {
            position: absolute;
            inset: 0;
            z-index: 5;
            pointer-events: none;
            box-sizing: border-box;
          }

          .prancha-wrapper .print-sheet-frame-content {
            position: relative;
            z-index: 1;
          }

          .prancha-wrapper .print-coord-table th {
            font-size: max(2.35mm, calc(10px / var(--preview-scale, 1))) !important;
          }

          .prancha-wrapper .print-coord-table td {
            font-size: max(2.65mm, calc(11px / var(--preview-scale, 1))) !important;
          }
        }

        @media print {
          .prancha-wrapper {
            --print-border-w: 0.25mm;
            --print-frame-w: var(--abnt-frame-mm, 0.5mm);
          }

          .print-margin-overlay {
            display: none !important;
          }

          .print-sheet-frame-outline {
            border: var(--print-frame-w, 0.5mm) solid #000 !important;
          }

          @page {
            size: ${pageSizeCss};
            margin: 0;
          }

          body * {
            visibility: hidden;
          }

          .cad-print-layout,
          .cad-print-layout * {
            visibility: visible;
          }

          .cad-interface {
            display: none !important;
          }

          .cad-workspace > :not(.cad-print-layout),
          .cad-workspace .cad-interface {
            display: none !important;
          }

          .prancha-wrapper {
            position: fixed;
            inset: 0;
            display: flex !important;
            align-items: center;
            justify-content: center;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            background: white !important;
            min-height: 0 !important;
          }

          .prancha-wrapper > div {
            transform: none !important;
          }

          .prancha {
            width: 100% !important;
            height: 100% !important;
            box-shadow: none !important;
            outline: none !important;
            page-break-after: avoid;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .print-supplementary img,
          .print-supplementary image,
          .print-location-map img,
          .print-location-map image {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}

export { buildDefaultLayoutState, type LayoutState };
