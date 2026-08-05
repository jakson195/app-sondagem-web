"use client";

import { useMemo } from "react";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import { CONTOUR_LAYER } from "@/lib/rtk-validation/cad/contour";
import {
  computePolygonMetrics,
  formatAreaBr,
  formatCoordBr,
  vertexLabelsPn,
} from "@/lib/rtk-validation/cad/polygon-utils";
import type { CadEntity, CadPolylineEntity } from "@/lib/rtk-validation/cad/types";
import { SidebarLocationMap } from "@/components/rtk-validation/cad-print-annotations";
import type { CadGeorefContext } from "@/lib/rtk-validation/cad/georef";
import type { LocationMapLoadStatus } from "@/hooks/use-location-map-image";
import { DrawingConventionsList } from "@/components/rtk-validation/cad-print-conventions";
import { resolveDrawingConventions } from "@/lib/rtk-validation/cad/drawing-conventions";
import type { CadProject } from "@/lib/rtk-validation/cad/types";
import {
  buildPrintVertexLabelKey,
  resolvePrintLabel,
  PRINT_BOTTOM_STRIP_TYPO,
  PRINT_CELL_BORDER,
  PRINT_COORD_TABLE_TYPO,
  type LayoutState,
} from "@/components/rtk-validation/cad-print-shared";

export function findPrimaryPolyline(
  entities: CadEntity[],
  selected?: CadPolylineEntity | null,
): CadPolylineEntity | null {
  if (selected?.closed && selected.vertices.length >= 3 && selected.layerId !== CONTOUR_LAYER.id) {
    return selected;
  }
  return (
    entities.find(
      (e): e is CadPolylineEntity =>
        e.type === "polyline" &&
        e.closed === true &&
        e.vertices.length >= 3 &&
        e.layerId !== CONTOUR_LAYER.id,
    ) ?? null
  );
}

type CadPrintSupplementaryPanelProps = {
  layout: LayoutState;
  project: CadProject;
  entities: CadEntity[];
  selectedPolyline?: CadPolylineEntity | null;
  utmZone: number;
  swapEn?: boolean;
  georef: CadGeorefContext;
  projectBounds: { minX: number; maxX: number; minY: number; maxY: number };
  widthMm: number;
  heightMm: number;
  onLocationMapStatusChange?: (status: LocationMapLoadStatus) => void;
};

const cellBorder = PRINT_CELL_BORDER;
const thStyle: React.CSSProperties = {
  border: cellBorder,
  padding: "0.65mm 1mm",
  fontWeight: 700,
  fontSize: PRINT_BOTTOM_STRIP_TYPO.tableSize,
  textAlign: "center",
  background: "#e5e7eb",
  color: PRINT_BOTTOM_STRIP_TYPO.text,
  fontFamily: PRINT_BOTTOM_STRIP_TYPO.fontFamily,
  lineHeight: PRINT_BOTTOM_STRIP_TYPO.lineHeight,
  letterSpacing: "0.02em",
};
const tdStyle: React.CSSProperties = {
  border: cellBorder,
  padding: "0.55mm 1mm",
  fontSize: PRINT_BOTTOM_STRIP_TYPO.tableSize,
  textAlign: "center",
  color: PRINT_BOTTOM_STRIP_TYPO.text,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontVariantNumeric: "tabular-nums",
  lineHeight: PRINT_BOTTOM_STRIP_TYPO.lineHeight,
};
const coordThStyle: React.CSSProperties = {
  ...thStyle,
  fontSize: PRINT_COORD_TABLE_TYPO.headerSize,
  padding: "0.55mm 0.7mm",
};
const coordTdStyle: React.CSSProperties = {
  ...tdStyle,
  fontSize: PRINT_COORD_TABLE_TYPO.cellSize,
  padding: "0.45mm 0.7mm",
  fontWeight: 600,
};

/** Painel auxiliar (planta, coordenadas, áreas) à esquerda da legenda ABNT. */
export function CadPrintSupplementaryPanel({
  layout,
  project,
  entities,
  selectedPolyline,
  utmZone,
  swapEn = false,
  georef,
  projectBounds,
  widthMm,
  heightMm,
  onLocationMapStatusChange,
}: CadPrintSupplementaryPanelProps) {
  const t = useTranslations("rtkCad.printLayout");

  const conventions = useMemo(
    () => resolveDrawingConventions(project, entities),
    [project, entities],
  );

  const showConventions = layout.showConventions && conventions.length > 0;

  const primaryPoly = useMemo(
    () => findPrimaryPolyline(entities, selectedPolyline),
    [entities, selectedPolyline],
  );

  const coordRows = useMemo(() => {
    if (!primaryPoly) return [];
    const labels = vertexLabelsPn(primaryPoly.vertices.length);
    return primaryPoly.vertices.map((v, i) => ({
      id: resolvePrintLabel(
        layout.textOverrides,
        buildPrintVertexLabelKey(primaryPoly.id, i),
        labels[i] ?? `P${i + 1}`,
      ),
      n: v.y,
      e: v.x,
    }));
  }, [primaryPoly, layout.textOverrides]);

  const areaRows = useMemo(() => {
    if (!primaryPoly) {
      return [{ label: t("areaSurveyed"), value: "—" }];
    }
    const metrics = computePolygonMetrics(primaryPoly.vertices, true, vertexLabelsPn(primaryPoly.vertices.length));
    return [
      { label: t("areaSurveyed"), value: formatAreaBr(metrics.areaM2) },
      { label: t("areaPerimeter"), value: `${formatCoordBr(metrics.perimeterM)} m` },
    ];
  }, [primaryPoly, t]);

  if (widthMm < 40) return null;

  const locMapW = Math.min(52, widthMm * 0.28);

  return (
    <div
      className="print-supplementary"
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        boxSizing: "border-box",
        display: "flex",
        gap: "1.2mm",
        fontSize: PRINT_BOTTOM_STRIP_TYPO.bodySize,
        lineHeight: PRINT_BOTTOM_STRIP_TYPO.lineHeight,
        fontFamily: PRINT_BOTTOM_STRIP_TYPO.fontFamily,
        color: PRINT_BOTTOM_STRIP_TYPO.text,
        background: "#fff",
        overflow: "hidden",
        alignSelf: "stretch",
      }}
    >
      <div
        style={{
          width: `${locMapW}mm`,
          height: "100%",
          border: cellBorder,
          padding: "0.8mm",
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        <SidebarLocationMap
          projectBounds={projectBounds}
          widthMm={locMapW - 1.6}
          heightMm={heightMm - 1.6}
          title={t("locationMap")}
          scaleLabel="1:10.000"
          georef={georef}
          mapStyle={layout.locationMapStyle}
          projectLabel={t("locationProject")}
          onStatusChange={onLocationMapStatusChange}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "1.2mm" }}>
        <div style={{ flex: 1, border: cellBorder, padding: "1mm", overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <p
            style={{
              fontWeight: 700,
              fontSize: PRINT_COORD_TABLE_TYPO.titleSize,
              textAlign: "center",
              margin: "0 0 1mm",
              color: PRINT_BOTTOM_STRIP_TYPO.text,
              letterSpacing: "0.03em",
            }}
          >
            {t("coordTableTitle", { zone: utmZone })}
          </p>
          <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
            <table className="print-coord-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...coordThStyle, width: "18%" }}>{t("colVertex")}</th>
                  <th style={coordThStyle}>{t("colNorth")}</th>
                  <th style={coordThStyle}>{t("colEast")}</th>
                </tr>
              </thead>
              <tbody>
                {coordRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ ...coordTdStyle, textAlign: "center", color: PRINT_BOTTOM_STRIP_TYPO.muted, fontFamily: PRINT_BOTTOM_STRIP_TYPO.fontFamily }}>
                      {t("noVertices")}
                    </td>
                  </tr>
                ) : (
                  coordRows.slice(0, 12).map((row, index) => (
                    <tr key={row.id} style={{ background: index % 2 === 0 ? "#fff" : "#f9fafb" }}>
                      <td style={{ ...coordTdStyle, fontWeight: 700, fontFamily: PRINT_BOTTOM_STRIP_TYPO.fontFamily }}>{row.id}</td>
                      <td style={coordTdStyle}>{formatCoordBr(row.n)}</td>
                      <td style={coordTdStyle}>{formatCoordBr(row.e)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: "flex", gap: "1.2mm", flexShrink: 0, minHeight: "22mm" }}>
          <div style={{ flex: 1, border: cellBorder, padding: "0.8mm 1mm" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: "left" }}>{t("colDescription")}</th>
                  <th style={{ ...thStyle, width: "44%" }}>{t("colArea")}</th>
                </tr>
              </thead>
              <tbody>
                {areaRows.map((row, index) => (
                  <tr key={row.label} style={{ background: index % 2 === 0 ? "#fff" : "#f9fafb" }}>
                    <td style={{ ...tdStyle, textAlign: "left", fontFamily: PRINT_BOTTOM_STRIP_TYPO.fontFamily, fontWeight: 600 }}>{row.label}</td>
                    <td style={tdStyle}>{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showConventions ? (
            <div
              style={{
                width: "72mm",
                border: cellBorder,
                padding: "1mm",
                fontSize: PRINT_BOTTOM_STRIP_TYPO.smallSize,
                lineHeight: PRINT_BOTTOM_STRIP_TYPO.lineHeight,
                overflow: "hidden",
              }}
            >
              <DrawingConventionsList items={conventions} title={t("legendTitle")} compact />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
