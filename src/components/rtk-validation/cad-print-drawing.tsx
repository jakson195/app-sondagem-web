"use client";

import { useMemo } from "react";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import { computeViewportBounds, worldToScreen } from "@/lib/rtk-validation/cad/viewport";
import {
  CONTOUR_LAYER,
  CONTOUR_COLOR_MAJOR,
  CONTOUR_COLOR_MINOR,
  formatContourElevationLabel,
  parseContourElevation,
  pickContourLabelVertex,
} from "@/lib/rtk-validation/cad/contour";
import type { CadEntity, CadLayer, CadPolylineEntity, CadProject, CadRasterOverlay } from "@/lib/rtk-validation/cad/types";
import { detectCadGeoref } from "@/lib/rtk-validation/cad/georef";
import {
  computePrintUtmGridLayout,
  PrintNorthArrow,
  PrintUtmGrid,
  projectEntityBounds,
} from "@/components/rtk-validation/cad-print-annotations";
import { buildCoordinateGrid } from "@/lib/rtk-validation/cad/grid";
import { CadRasterSvgLayer } from "@/components/rtk-validation/cad-raster-overlay";
import { PrintConventionsOverlay } from "@/components/rtk-validation/cad-print-conventions";
import { PrintEditableSvgText } from "@/components/rtk-validation/cad-print-editable-text";
import { CadSvgMultilineText } from "@/components/rtk-validation/cad-svg-multiline-text";
import {
  buildPrintPointLabelKey,
  type PrintTextOverrides,
} from "@/components/rtk-validation/cad-print-shared";
import { resolveDrawingConventions } from "@/lib/rtk-validation/cad/drawing-conventions";
import { isCoordLabelEntity, resolveCoordLabelLayout } from "@/lib/rtk-validation/cad/label-layout";
import {
  getLayerFillColor,
  getLayerLineColor,
  getLayerLineWidthForPrint,
  getLayerTextColorForPrint,
} from "@/lib/rtk-validation/cad/layer-styles";
import { polygonCentroid } from "@/lib/rtk-validation/cad/ai-geometry-utils";
import { computePolygonMetrics, formatAreaBr } from "@/lib/rtk-validation/cad/polygon-utils";

export type DrawingScaleMode = "fit" | "nominal";

export type PrintLayerVisibility = Record<string, boolean>;

export function filterPrintEntities(
  project: CadProject,
  layerVisibility?: PrintLayerVisibility,
): CadEntity[] {
  return project.entities.filter((e) => {
    if (layerVisibility && e.layerId in layerVisibility) {
      return layerVisibility[e.layerId];
    }
    const layer = project.layers.find((l) => l.id === e.layerId);
    return layer?.visible !== false;
  });
}

/** Cores fortes para impressão em fundo branco. */
const PRINT_CONTOUR_MAJOR_WIDTH = 1.85;
const PRINT_CONTOUR_MINOR_WIDTH = 1.15;

/** Tamanhos nominais na prancha (mm) — permanecem legíveis em qualquer zoom do desenho. */
const PRINT_POINT_RADIUS_RTK_MM = 2.4;
const PRINT_POINT_RADIUS_MM = 2.1;
const PRINT_POINT_STROKE_MM = 0.35;
const PRINT_POINT_LABEL_MM = 3.4;
const PRINT_POINT_LABEL_OFFSET_MM = 2.6;
const PRINT_LABEL_STROKE_MM = 0.85;

export type PrintMarkerSizes = {
  pointRadiusRtk: number;
  pointRadius: number;
  pointStroke: number;
  pointLabelSize: number;
  pointLabelOffsetX: number;
  pointLabelOffsetY: number;
  labelStroke: number;
};

export function resolvePrintMarkerSizes(unitsPerMm: number, vertexMarkerScale = 1): PrintMarkerSizes {
  const scale = Math.max(0.25, Math.min(6, vertexMarkerScale));
  const u = Math.max(unitsPerMm, 1) * scale;
  return {
    pointRadiusRtk: PRINT_POINT_RADIUS_RTK_MM * u,
    pointRadius: PRINT_POINT_RADIUS_MM * u,
    pointStroke: PRINT_POINT_STROKE_MM * u,
    pointLabelSize: PRINT_POINT_LABEL_MM * u,
    pointLabelOffsetX: PRINT_POINT_LABEL_OFFSET_MM * u,
    pointLabelOffsetY: PRINT_POINT_LABEL_OFFSET_MM * u * 0.85,
    labelStroke: PRINT_LABEL_STROKE_MM * u,
  };
}

export function parseScaleDenominator(escala: string): number | null {
  const match = escala.trim().match(/^1\s*:\s*(\d+(?:[.,]\d+)?)$/i);
  if (!match) return null;
  const n = Number(match[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function formatScaleDenominator(n: number): string {
  return `1:${Math.round(n)}`;
}

export function estimateNominalScale(
  entities: CadEntity[],
  areaWmm: number,
  areaHmm: number,
  rasters: CadRasterOverlay[] = [],
): number | null {
  const bounds = computePrintContentBounds(entities, rasters, 0.05);
  const worldW = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const worldH = Math.max(bounds.maxY - bounds.minY, 1e-6);
  if (entities.length === 0 && rasters.filter((r) => r.visible).length === 0) return null;
  if (areaWmm <= 0 || areaHmm <= 0) return null;
  const scaleW = (worldW * 1000) / areaWmm;
  const scaleH = (worldH * 1000) / areaHmm;
  return Math.max(scaleW, scaleH);
}

export function computePrintContentBounds(
  entities: CadEntity[],
  rasters: CadRasterOverlay[] = [],
  paddingRatio = 0.05,
) {
  const visibleRasters = rasters.filter((r) => r.visible);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let hasContent = false;

  for (const entity of entities) {
    hasContent = true;
    if (entity.type === "point") {
      minX = Math.min(minX, entity.x);
      maxX = Math.max(maxX, entity.x);
      minY = Math.min(minY, entity.y);
      maxY = Math.max(maxY, entity.y);
    } else if (entity.type === "line") {
      for (const v of [entity.start, entity.end]) {
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
    } else {
      for (const v of entity.vertices) {
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
    }
  }

  for (const raster of visibleRasters) {
    hasContent = true;
    minX = Math.min(minX, raster.minX);
    maxX = Math.max(maxX, raster.maxX);
    minY = Math.min(minY, raster.minY);
    maxY = Math.max(maxY, raster.maxY);
  }

  if (!hasContent) {
    return computeViewportBounds([], paddingRatio);
  }

  const padX = (maxX - minX) * paddingRatio || 10;
  const padY = (maxY - minY) * paddingRatio || 10;
  return {
    minX: minX - padX,
    maxX: maxX + padX,
    minY: minY - padY,
    maxY: maxY + padY,
  };
}

export function computePrintViewport(
  entities: CadEntity[],
  areaWmm: number,
  areaHmm: number,
  mode: DrawingScaleMode,
  scaleDenominator: number | null,
  drawingZoom: number,
  rasters: CadRasterOverlay[] = [],
) {
  const zoom = Math.max(0.1, drawingZoom);
  const bounds = computePrintContentBounds(entities, rasters, 0.05);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const worldW = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const worldH = Math.max(bounds.maxY - bounds.minY, 1e-6);

  if (mode === "nominal" && scaleDenominator) {
    const halfW = (areaWmm * scaleDenominator) / 1000 / 2 / zoom;
    const halfH = (areaHmm * scaleDenominator) / 1000 / 2 / zoom;
    return {
      minX: cx - halfW,
      maxX: cx + halfW,
      minY: cy - halfH,
      maxY: cy + halfH,
    };
  }

  const halfW = (worldW / 2) / zoom;
  const halfH = (worldH / 2) / zoom;
  return {
    minX: cx - halfW,
    maxX: cx + halfW,
    minY: cy - halfH,
    maxY: cy + halfH,
  };
}

type CadPrintDrawingProps = {
  project: CadProject;
  widthMm: number;
  heightMm: number;
  drawingZoom: number;
  scaleMode: DrawingScaleMode;
  scaleDenominator: number | null;
  emptyLabel: string;
  showConventions?: boolean;
  conventionsTitle?: string;
  layerVisibility?: PrintLayerVisibility;
  rasters?: CadRasterOverlay[];
  /** 1 = tamanho padrão; afeta marcadores P1/P2 e pontos do levantamento. */
  vertexMarkerScale?: number;
  editTextMode?: boolean;
  textOverrides?: PrintTextOverrides;
  onTextOverride?: (key: string, value: string) => void;
};

function renderPrintEntity(
  entity: CadEntity,
  entities: CadEntity[],
  layerMap: Map<string, CadLayer>,
  viewport: { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number; padding: number },
  markers: PrintMarkerSizes,
  unitsPerMm: number,
  viewW: number,
  viewH: number,
  polyDefaultName: string,
  editTextMode: boolean,
  textOverrides: PrintTextOverrides,
  onTextOverride: (key: string, value: string) => void,
) {
  const layer = layerMap.get(entity.layerId);
  const isContour = entity.layerId === CONTOUR_LAYER.id;
  const lineColor = getLayerLineColor(layer, "#111827");
  const textColor = getLayerTextColorForPrint(layer, "#111827");
  const fillColor = getLayerFillColor(layer, false, lineColor);
  const lineWidth = getLayerLineWidthForPrint(layer, unitsPerMm);

  if (entity.type === "point") {
    const point = entity;
    const wts = (x: number, y: number) => worldToScreen(x, y, viewport);
    const coordLayout = resolveCoordLabelLayout(
      point,
      entities,
      wts,
      viewW,
      viewH,
      markers.pointLabelSize,
    );
    const isCoordLabel = isCoordLabelEntity(point);
    const { sx, sy } = wts(point.x, point.y);
    const labelX = coordLayout?.labelSx ?? sx + markers.pointLabelOffsetX;
    const labelY = coordLayout?.labelSy ?? sy + markers.pointLabelOffsetY;

    return (
      <g key={entity.id}>
        {!isCoordLabel ? (
          <circle
            cx={sx}
            cy={sy}
            r={entity.layerId === "rtk_points" ? markers.pointRadiusRtk : markers.pointRadius}
            fill={lineColor}
            stroke="#111827"
            strokeWidth={markers.pointStroke}
          />
        ) : null}
        {entity.label ? (
          isCoordLabel || !editTextMode ? (
            <CadSvgMultilineText
              x={labelX}
              y={labelY}
              label={entity.label}
              fill={textColor}
              fontSize={markers.pointLabelSize}
              fontFamily="Arial, sans-serif"
            />
          ) : (
            <PrintEditableSvgText
              textKey={buildPrintPointLabelKey(entity.id)}
              x={labelX}
              y={labelY}
              defaultValue={entity.label}
              overrides={textOverrides}
              editMode={editTextMode}
              onChange={onTextOverride}
              fontSize={markers.pointLabelSize}
              strokeWidth={markers.labelStroke}
              fill={textColor}
            />
          )
        ) : null}
      </g>
    );
  }

  if (entity.type === "line") {
    const a = worldToScreen(entity.start.x, entity.start.y, viewport);
    const b = worldToScreen(entity.end.x, entity.end.y, viewport);
    return (
      <line
        key={entity.id}
        x1={a.sx}
        y1={a.sy}
        x2={b.sx}
        y2={b.sy}
        stroke={lineColor}
        strokeWidth={lineWidth}
        strokeDasharray={entity.layerId === "residuals" ? "4 3" : undefined}
      />
    );
  }

  const poly = entity as CadPolylineEntity;
  const pts = poly.vertices
    .map((v) => worldToScreen(v.x, v.y, viewport))
    .map((p) => `${p.sx},${p.sy}`)
    .join(" ");

  const isMajorContour = isContour && poly.contourMajor === true;
  const contourStroke = isMajorContour ? CONTOUR_COLOR_MAJOR : CONTOUR_COLOR_MINOR;
  const labelVertex = isMajorContour ? pickContourLabelVertex(poly.vertices) : null;
  const contourElevation =
    isMajorContour && labelVertex ? parseContourElevation(poly) : null;
  const contourLabel =
    contourElevation !== null ? formatContourElevationLabel(contourElevation) : null;

  const isClosedPoly = !isContour && poly.closed && poly.vertices.length >= 3;
  const strokeColor = isContour ? contourStroke : lineColor;
  const strokeW = isContour
    ? isMajorContour
      ? PRINT_CONTOUR_MAJOR_WIDTH * unitsPerMm * 0.24
      : PRINT_CONTOUR_MINOR_WIDTH * unitsPerMm * 0.24
    : lineWidth;

  return (
    <g key={entity.id}>
      {isClosedPoly ? (
        <polygon
          points={pts}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <polyline
          points={pts}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={isContour ? (isMajorContour ? 1 : 0.85) : 1}
        />
      )}
      {isMajorContour && labelVertex && contourLabel ? (
        <text
          x={worldToScreen(labelVertex.x, labelVertex.y, viewport).sx + 3}
          y={worldToScreen(labelVertex.x, labelVertex.y, viewport).sy - 3}
          fill={contourStroke}
          fontSize={markers.pointLabelSize}
          fontWeight={800}
          fontFamily="Arial, sans-serif"
          stroke="#fff"
          strokeWidth={markers.labelStroke}
          paintOrder="stroke"
        >
          {contourLabel}
        </text>
      ) : null}
      {isClosedPoly
        ? (() => {
            const metrics = computePolygonMetrics(poly.vertices, true);
            const c = polygonCentroid(poly.vertices);
            const { sx, sy } = worldToScreen(c.x, c.y, viewport);
            const polyName = poly.name ?? polyDefaultName;
            return (
              <CadSvgMultilineText
                x={sx}
                y={sy - markers.pointLabelSize * 0.55}
                label={`${polyName}\n${formatAreaBr(metrics.areaM2)}`}
                fill={textColor}
                fontSize={markers.pointLabelSize}
                fontFamily="Arial, sans-serif"
                fontWeight={600}
                textAnchor="middle"
              />
            );
          })()
        : null}
    </g>
  );
}

export function CadPrintDrawing({
  project,
  widthMm,
  heightMm,
  drawingZoom,
  scaleMode,
  scaleDenominator,
  emptyLabel,
  showConventions = false,
  conventionsTitle = "Convenções",
  layerVisibility,
  rasters = [],
  vertexMarkerScale = 1,
  editTextMode = false,
  textOverrides = {},
  onTextOverride = () => {},
}: CadPrintDrawingProps) {
  const t = useTranslations("rtkCad.printLayout");
  const tRoot = useTranslations("rtkCad");
  const viewW = Math.max(Math.round(widthMm * 16), 160);
  const viewH = Math.max(Math.round(heightMm * 16), 160);
  const unitsPerMm = Math.min(viewW / Math.max(widthMm, 1), viewH / Math.max(heightMm, 1));
  const markers = useMemo(
    () => resolvePrintMarkerSizes(unitsPerMm, vertexMarkerScale),
    [unitsPerMm, vertexMarkerScale],
  );
  const visibleEntities = useMemo(
    () => filterPrintEntities(project, layerVisibility),
    [project, layerVisibility],
  );
  const visibleRasters = useMemo(
    () => rasters.filter((r) => r.visible),
    [rasters],
  );
  const hasPrintContent = visibleEntities.length > 0 || visibleRasters.length > 0;

  const sortedEntities = useMemo(() => {
    const base = visibleEntities.filter((e) => e.layerId !== CONTOUR_LAYER.id);
    const contours = visibleEntities.filter((e) => e.layerId === CONTOUR_LAYER.id);
    return [...base, ...contours];
  }, [visibleEntities]);

  const layerMap = useMemo(() => new Map(project.layers.map((l) => [l.id, l])), [project.layers]);

  const bounds = useMemo(
    () =>
      computePrintViewport(
        visibleEntities,
        widthMm,
        heightMm,
        scaleMode,
        scaleDenominator,
        drawingZoom,
        rasters,
      ),
    [visibleEntities, widthMm, heightMm, scaleMode, scaleDenominator, drawingZoom, rasters],
  );

  const grid = useMemo(
    () => buildCoordinateGrid(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY),
    [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY],
  );

  const gridLayout = useMemo(
    () => computePrintUtmGridLayout(viewW, viewH, unitsPerMm, grid),
    [viewW, viewH, unitsPerMm, grid],
  );

  const viewport = useMemo(
    () => ({
      ...bounds,
      width: viewW,
      height: viewH,
      padding: gridLayout.pad,
    }),
    [bounds, viewW, viewH, gridLayout.pad],
  );

  const georef = useMemo(
    () => detectCadGeoref(visibleEntities, bounds, project.crs),
    [visibleEntities, bounds, project.crs],
  );
  const utmZone = georef.utmZone;

  const projectBounds = useMemo(
    () => projectEntityBounds(visibleEntities),
    [visibleEntities],
  );

  const northSize = Math.max(28, Math.min(viewW, viewH) * 0.07);
  const northX = viewW - viewport.padding - northSize * 0.6;
  const northY = viewport.padding + northSize * 0.75;

  const conventions = useMemo(
    () => resolveDrawingConventions(project, visibleEntities),
    [project, visibleEntities],
  );

  if (!hasPrintContent) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#9ca3af",
          fontSize: "3mm",
          textAlign: "center",
          padding: "4mm",
        }}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", background: "#fff" }}
      aria-label={project.name}
    >
      <PrintUtmGrid
        viewport={viewport}
        utmZone={utmZone}
        viewW={viewW}
        viewH={viewH}
        unitsPerMm={unitsPerMm}
        gridLayout={gridLayout}
        gridLabel={t("utmGrid")}
        zoneLabel={t("utmZone", { zone: utmZone })}
        underlay={<CadRasterSvgLayer rasters={visibleRasters} viewport={viewport} />}
      />
      {sortedEntities.map((entity) =>
        renderPrintEntity(
          entity,
          visibleEntities,
          layerMap,
          viewport,
          markers,
          unitsPerMm,
          viewW,
          viewH,
          tRoot("polygon.defaultName"),
          editTextMode,
          textOverrides,
          onTextOverride,
        ),
      )}
      <PrintNorthArrow
        x={northX}
        y={northY}
        size={northSize}
        title={t("northLetter")}
        subtitle={t("trueNorth")}
      />
      {showConventions ? (
        <PrintConventionsOverlay
          items={conventions}
          viewW={viewW}
          viewH={viewH}
          padding={viewport.padding}
          title={conventionsTitle}
        />
      ) : null}
    </svg>
  );
}

export function computePrintSheetMeta(
  project: CadProject,
  widthMm: number,
  heightMm: number,
  drawingZoom: number,
  scaleMode: DrawingScaleMode,
  scaleDenominator: number | null,
  layerVisibility?: PrintLayerVisibility,
  rasters: CadRasterOverlay[] = [],
) {
  const visibleEntities = filterPrintEntities(project, layerVisibility);
  const visibleRasters = rasters.filter((r) => r.visible);

  const viewW = Math.max(Math.round(widthMm * 16), 160);
  const viewH = Math.max(Math.round(heightMm * 16), 160);
  const bounds = computePrintViewport(
    visibleEntities,
    widthMm,
    heightMm,
    scaleMode,
    scaleDenominator,
    drawingZoom,
    rasters,
  );
  const viewport = {
    ...bounds,
    width: viewW,
    height: viewH,
    padding: Math.max(viewW, viewH) * 0.04,
  };
  const georef = detectCadGeoref(
    visibleEntities.length > 0 ? visibleEntities : project.entities,
    bounds,
    project.crs,
  );
  const utmZone = georef.utmZone;
  /** Extensão real do desenho (polígono/pontos) para planta de localização. */
  const entityBounds = projectEntityBounds(
    visibleEntities.length > 0 ? visibleEntities : project.entities,
  );
  const projectBounds =
    Number.isFinite(entityBounds.minX) && entityBounds.maxX > entityBounds.minX
      ? entityBounds
      : {
          minX: bounds.minX,
          maxX: bounds.maxX,
          minY: bounds.minY,
          maxY: bounds.maxY,
        };

  return {
    visibleEntities,
    visibleRasters,
    viewport,
    utmZone,
    georef,
    swapEn: georef.eastingAxis === "y",
    projectBounds,
  };
}
