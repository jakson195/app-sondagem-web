"use client";

import { useEffect, useId, useMemo, type ReactNode } from "react";
import { buildCoordinateGrid, formatGridLabel } from "@/lib/rtk-validation/cad/grid";
export { detectProjectUtmZone } from "@/lib/rtk-validation/cad/utm-zone";
import { computeViewportBounds, worldToScreen, type CadViewport } from "@/lib/rtk-validation/cad/viewport";
import type { CadEntity } from "@/lib/rtk-validation/cad/types";
import type { LocationMapStyle } from "@/lib/cad-map/location-map-image";
import {
  expandedProjectBoundsToBbox4326,
  LOCATION_MAP_EXPAND_FACTOR,
  projectBoundsOnLocationMap,
} from "@/lib/cad-map/location-map-image";
import type { CadGeorefContext } from "@/lib/rtk-validation/cad/georef";
import { useLocationMapImage, type LocationMapLoadStatus } from "@/hooks/use-location-map-image";

type ViewportLike = CadViewport;

export function projectEntityBounds(entities: CadEntity[]) {
  return computeViewportBounds(entities, 0);
}

export function expandedLocationBounds(
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  factor = 14,
) {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const halfW = Math.max(((bounds.maxX - bounds.minX) / 2) * factor, 3000);
  const halfH = Math.max(((bounds.maxY - bounds.minY) / 2) * factor, 3000);
  return {
    minX: cx - halfW,
    maxX: cx + halfW,
    minY: cy - halfH,
    maxY: cy + halfH,
  };
}

function miniWorldToScreen(
  x: number,
  y: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  innerX: number,
  innerY: number,
  innerW: number,
  innerH: number,
) {
  const sx = innerX + ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * innerW;
  const sy = innerY + innerH - ((y - bounds.minY) / (bounds.maxY - bounds.minY)) * innerH;
  return { sx, sy };
}

const PRINT_GRID_LABEL_MM = 2.85;
const PRINT_GRID_TITLE_MM = 2.55;
const PRINT_GRID_LABEL_BAND_MM = 4.5;
const PRINT_GRID_MARGIN_MM = 2;
const PRINT_GRID_MAJOR_STROKE_MM = 0.32;
const PRINT_GRID_MINOR_STROKE_MM = 0.18;
const PRINT_GRID_FRAME_STROKE_MM = 0.38;
const PRINT_GRID_CROSS_STROKE_MM = 0.22;

function estimateGridLabelWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.62;
}

export type PrintUtmGridLayout = {
  u: number;
  pad: number;
  sideMargin: number;
  innerX: number;
  innerY: number;
  innerW: number;
  innerH: number;
  labelFontSize: number;
  titleFontSize: number;
  majorStroke: number;
  minorStroke: number;
  frameStroke: number;
  crossStroke: number;
  crossSize: number;
  nLabelX: number;
  eLabelTopY: number;
  eLabelBottomY: number;
};

/** Reserva margens simétricas (pad) alinhadas à malha UTM e ao worldToScreen. */
export function computePrintUtmGridLayout(
  viewW: number,
  viewH: number,
  unitsPerMm: number,
  grid: ReturnType<typeof buildCoordinateGrid>,
): PrintUtmGridLayout {
  const u = Math.max(unitsPerMm, 1);
  const labelFontSize = PRINT_GRID_LABEL_MM * u;
  const titleFontSize = PRINT_GRID_TITLE_MM * u;
  const sideMargin = PRINT_GRID_MARGIN_MM * u;

  const majorNLabels = grid.nLines
    .filter((_, idx) => idx % 2 === 0)
    .map((n) => formatGridLabel(n, grid.stepN));

  const maxNLabelW = Math.max(
    labelFontSize * 4,
    ...majorNLabels.map((text) => estimateGridLabelWidth(text, labelFontSize)),
  );

  const leftBand = maxNLabelW + 1.5 * u;
  const topBand = labelFontSize * 1.35;
  const bottomBand = labelFontSize * 1.35;

  const padLeft = sideMargin + leftBand;
  const padTop = sideMargin + topBand;
  const padBottom = sideMargin + bottomBand;
  const pad = Math.ceil(Math.max(padLeft, padTop, padBottom, sideMargin + PRINT_GRID_LABEL_BAND_MM * u));

  const innerX = pad;
  const innerY = pad;
  const innerW = Math.max(40, viewW - pad * 2);
  const innerH = Math.max(40, viewH - pad * 2);

  return {
    u,
    pad,
    sideMargin,
    innerX,
    innerY,
    innerW,
    innerH,
    labelFontSize,
    titleFontSize,
    majorStroke: PRINT_GRID_MAJOR_STROKE_MM * u,
    minorStroke: PRINT_GRID_MINOR_STROKE_MM * u,
    frameStroke: PRINT_GRID_FRAME_STROKE_MM * u,
    crossStroke: PRINT_GRID_CROSS_STROKE_MM * u,
    crossSize: Math.max(4 * u, Math.min(innerW, innerH) * 0.012),
    nLabelX: sideMargin + 0.7 * u,
    eLabelTopY: sideMargin + labelFontSize * 0.95,
    eLabelBottomY: viewH - sideMargin - labelFontSize * 0.2,
  };
}

type PrintUtmGridProps = {
  viewport: ViewportLike;
  utmZone: number;
  viewW: number;
  viewH: number;
  /** Unidades SVG por mm (ex.: 16 em CadPrintDrawing). */
  unitsPerMm: number;
  gridLayout: PrintUtmGridLayout;
  gridLabel: string;
  zoneLabel: string;
  /** Renderizado sobre o fundo branco e abaixo da malha (ex.: ortofoto, hipsométrico). */
  underlay?: ReactNode;
};

export function PrintUtmGrid({
  viewport,
  utmZone,
  viewW,
  viewH,
  unitsPerMm,
  gridLayout,
  gridLabel,
  zoneLabel,
  underlay,
}: PrintUtmGridProps) {
  const clipId = useId().replace(/:/g, "");
  const grid = buildCoordinateGrid(viewport.minX, viewport.maxX, viewport.minY, viewport.maxY);
  const {
    u,
    innerX,
    innerY,
    innerW,
    innerH,
    labelFontSize,
    titleFontSize,
    majorStroke,
    minorStroke,
    frameStroke,
    crossStroke,
    crossSize,
    nLabelX,
    eLabelTopY,
    eLabelBottomY,
  } = gridLayout;
  void utmZone;
  void viewW;
  void viewH;
  void unitsPerMm;

  return (
    <g className="print-utm-grid" pointerEvents="none">
      <defs>
        <clipPath id={clipId}>
          <rect x={innerX} y={innerY} width={innerW} height={innerH} />
        </clipPath>
      </defs>
      {/* Moldura da área cartográfica */}
      <rect
        x={innerX}
        y={innerY}
        width={innerW}
        height={innerH}
        fill="#fff"
        stroke="#0f172a"
        strokeWidth={frameStroke}
      />

      {underlay ? <g clipPath={`url(#${clipId})`}>{underlay}</g> : null}

      {grid.eLines.map((e, idx) => {
        const top = worldToScreen(e, viewport.maxY, viewport);
        const bottom = worldToScreen(e, viewport.minY, viewport);
        const major = idx % 2 === 0;
        const insideTop = Math.max(top.sy, innerY);
        const insideBottom = Math.min(bottom.sy, innerY + innerH);
        if (insideBottom <= insideTop) return null;

        return (
          <g key={`pe-${e}`}>
            <line
              x1={top.sx}
              y1={insideTop}
              x2={bottom.sx}
              y2={insideBottom}
              stroke={major ? "#1e293b" : "#64748b"}
              strokeWidth={major ? majorStroke : minorStroke}
              strokeDasharray={major ? undefined : `${1.6 * u} ${1.2 * u}`}
            />
            {major ? (
              <text
                x={bottom.sx}
                y={eLabelBottomY}
                textAnchor="middle"
                fill="#0f172a"
                fontSize={labelFontSize}
                fontWeight={700}
                fontFamily="Arial, Helvetica, sans-serif"
              >
                {formatGridLabel(e, grid.stepE)}
              </text>
            ) : null}
            {major ? (
              <text
                x={top.sx}
                y={eLabelTopY}
                textAnchor="middle"
                fill="#0f172a"
                fontSize={labelFontSize}
                fontWeight={700}
                fontFamily="Arial, Helvetica, sans-serif"
              >
                {formatGridLabel(e, grid.stepE)}
              </text>
            ) : null}
          </g>
        );
      })}

      {grid.nLines.map((n, idx) => {
        const left = worldToScreen(viewport.minX, n, viewport);
        const right = worldToScreen(viewport.maxX, n, viewport);
        const major = idx % 2 === 0;
        const insideLeft = Math.max(left.sx, innerX);
        const insideRight = Math.min(right.sx, innerX + innerW);
        if (insideRight <= insideLeft) return null;

        return (
          <g key={`pn-${n}`}>
            <line
              x1={insideLeft}
              y1={left.sy}
              x2={insideRight}
              y2={right.sy}
              stroke={major ? "#1e293b" : "#64748b"}
              strokeWidth={major ? majorStroke : minorStroke}
              strokeDasharray={major ? undefined : `${1.6 * u} ${1.2 * u}`}
            />
            {major ? (
              <text
                x={nLabelX}
                y={left.sy + labelFontSize * 0.32}
                textAnchor="start"
                fill="#0f172a"
                fontSize={labelFontSize}
                fontWeight={700}
                fontFamily="Arial, Helvetica, sans-serif"
              >
                {formatGridLabel(n, grid.stepN)}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* Cruzamentos (+) nos encontros das linhas mestras */}
      {grid.eLines.map((e, eIdx) =>
        eIdx % 2 === 0
          ? grid.nLines.map((n, nIdx) => {
              if (nIdx % 2 !== 0) return null;
              const p = worldToScreen(e, n, viewport);
              if (p.sx < innerX || p.sx > innerX + innerW || p.sy < innerY || p.sy > innerY + innerH) {
                return null;
              }
              return (
                <g key={`cross-${e}-${n}`} stroke="#334155" strokeWidth={crossStroke}>
                  <line x1={p.sx - crossSize} y1={p.sy} x2={p.sx + crossSize} y2={p.sy} />
                  <line x1={p.sx} y1={p.sy - crossSize} x2={p.sx} y2={p.sy + crossSize} />
                </g>
              );
            })
          : null,
      )}

      <text
        x={innerX + 1.2 * u}
        y={innerY + titleFontSize * 1.15}
        fill="#0f172a"
        fontSize={titleFontSize}
        fontWeight={700}
        fontFamily="Arial, Helvetica, sans-serif"
      >
        {gridLabel} · {zoneLabel}
      </text>
    </g>
  );
}

type PrintNorthArrowProps = {
  x: number;
  y: number;
  size: number;
  title: string;
  subtitle: string;
};

export function PrintNorthArrow({ x, y, size, title, subtitle }: PrintNorthArrowProps) {
  const r = size * 0.52;
  return (
    <g className="print-north-arrow" transform={`translate(${x}, ${y})`} pointerEvents="none">
      <circle cx={0} cy={0} r={r} fill="#fff" stroke="#111827" strokeWidth={0.6} />
      <polygon
        points={`0,${-r * 0.72} ${r * 0.38},${r * 0.55} ${-r * 0.38},${r * 0.55}`}
        fill="#111827"
      />
      <text
        x={0}
        y={-r * 0.08}
        textAnchor="middle"
        fontSize={size * 0.28}
        fontWeight={700}
        fill="#fff"
        fontFamily="Arial, sans-serif"
      >
        {title}
      </text>
      <text
        x={0}
        y={r + 9}
        textAnchor="middle"
        fontSize={6}
        fill="#374151"
        fontFamily="Arial, sans-serif"
      >
        {subtitle}
      </text>
    </g>
  );
}

type PrintLocationMapProps = {
  viewport: ViewportLike;
  projectBounds: { minX: number; maxX: number; minY: number; maxY: number };
  viewW: number;
  viewH: number;
  title: string;
  projectLabel: string;
  utmZone: number;
  swapEn?: boolean;
  mapStyle?: LocationMapStyle;
};

export function PrintLocationMap({
  viewport,
  projectBounds,
  viewW,
  viewH,
  title,
  projectLabel,
  utmZone,
  swapEn = false,
  mapStyle = "satellite",
}: PrintLocationMapProps) {
  const clipId = useId().replace(/:/g, "");
  const boxW = Math.min(viewW * 0.4, 220);
  const boxH = Math.min(viewH * 0.34, 180);
  const boxX = viewport.padding + 4;
  const boxY = viewport.padding + 14;
  const pad = 5;
  const innerX = boxX + pad;
  const innerY = boxY + pad + 8;
  const innerW = boxW - pad * 2;
  const innerH = boxH - pad * 2 - 8;

  const georef = useMemo<CadGeorefContext>(
    () => ({
      utmZone,
      utmEpsg: `EPSG:${31960 + utmZone}`,
      utmProjectionLabel: `Fuso ${utmZone}S`,
      eastingAxis: swapEn ? "y" : "x",
      northingAxis: swapEn ? "x" : "y",
      coordMode: "utm" as const,
      isGeoreferenced: true,
    }),
    [utmZone, swapEn],
  );

  const mapBbox = useMemo(
    () => expandedProjectBoundsToBbox4326(projectBounds, georef, LOCATION_MAP_EXPAND_FACTOR),
    [projectBounds, georef],
  );

  const { imageUrl, status, onImageLoad, onImageError } = useLocationMapImage({
    projectBounds,
    utmZone,
    swapEn,
    mapStyle,
    width: innerW * 2,
    height: innerH * 2,
  });

  const projectRect = useMemo(
    () => projectBoundsOnLocationMap(projectBounds, georef, mapBbox, innerX, innerY, innerW, innerH),
    [projectBounds, georef, mapBbox, innerX, innerY, innerW, innerH],
  );
  const { rx, ry, rw, rh } = projectRect;

  return (
    <g className="print-location-map" pointerEvents="none">
      <defs>
        <clipPath id={clipId}>
          <rect x={innerX} y={innerY} width={innerW} height={innerH} />
        </clipPath>
      </defs>
      <rect
        x={boxX}
        y={boxY}
        width={boxW}
        height={boxH}
        fill="#fff"
        stroke="#111827"
        strokeWidth={0.5}
      />
      <text
        x={boxX + boxW / 2}
        y={boxY + 7}
        textAnchor="middle"
        fontSize={6.5}
        fontWeight={700}
        fill="#111827"
        fontFamily="Arial, sans-serif"
      >
        {title}
      </text>

      <rect x={innerX} y={innerY} width={innerW} height={innerH} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={0.3} />
      {imageUrl ? (
        <image
          href={imageUrl}
          x={innerX}
          y={innerY}
          width={innerW}
          height={innerH}
          preserveAspectRatio="none"
          clipPath={`url(#${clipId})`}
          onLoad={onImageLoad}
        />
      ) : null}
      {status === "loading" ? (
        <text
          x={innerX + innerW / 2}
          y={innerY + innerH / 2}
          textAnchor="middle"
          fontSize={5}
          fill="#64748b"
          fontFamily="Arial, sans-serif"
        >
          …
        </text>
      ) : null}

      <rect
        x={rx}
        y={ry}
        width={Math.max(rw, 3)}
        height={Math.max(rh, 3)}
        fill="rgba(220,38,38,0.12)"
        stroke="#dc2626"
        strokeWidth={0.8}
      />
      <text x={rx + 2} y={ry + 8} fontSize={5.5} fill="#dc2626" fontWeight={700} fontFamily="Arial, sans-serif">
        {projectLabel}
      </text>
    </g>
  );
}

type SidebarLocationMapProps = {
  projectBounds: { minX: number; maxX: number; minY: number; maxY: number };
  widthMm: number;
  heightMm: number;
  title: string;
  scaleLabel: string;
  georef: CadGeorefContext;
  mapStyle?: LocationMapStyle;
  projectLabel?: string;
  onStatusChange?: (status: LocationMapLoadStatus) => void;
};

/** Planta de localização na barra lateral da prancha. */
export function SidebarLocationMap({
  projectBounds,
  widthMm,
  heightMm,
  title,
  scaleLabel,
  georef,
  mapStyle = "satellite",
  projectLabel = "Área",
  onStatusChange,
}: SidebarLocationMapProps) {
  const clipId = useId().replace(/:/g, "");
  const viewW = 320;
  const viewH = 220;
  const titleH = 14;
  const pad = 6;
  const innerX = pad;
  const innerY = titleH + pad;
  const innerW = viewW - pad * 2;
  const innerH = viewH - innerY - pad - 10;

  const mapBbox = useMemo(
    () => expandedProjectBoundsToBbox4326(projectBounds, georef, LOCATION_MAP_EXPAND_FACTOR),
    [projectBounds, georef],
  );

  const { imageUrl, status, onImageLoad, onImageError } = useLocationMapImage({
    projectBounds,
    utmZone: georef.utmZone,
    swapEn: georef.eastingAxis === "y",
    mapStyle,
    width: innerW * 2,
    height: innerH * 2,
  });

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  const projectRect = useMemo(
    () => projectBoundsOnLocationMap(projectBounds, georef, mapBbox, innerX, innerY, innerW, innerH),
    [projectBounds, georef, mapBbox, innerX, innerY, innerW, innerH],
  );
  const { rx, ry, rw, rh } = projectRect;

  return (
    <div style={{ width: `${widthMm}mm`, height: `${heightMm}mm`, position: "relative", overflow: "hidden", background: "#fff" }}>
      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        style={{ display: "block", pointerEvents: "none" }}
        aria-label={title}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={innerX} y={innerY} width={innerW} height={innerH} />
          </clipPath>
        </defs>
        <rect x={0.5} y={0.5} width={viewW - 1} height={viewH - 1} fill="none" stroke="#111827" strokeWidth={0.6} />
        <rect x={0} y={0} width={viewW} height={titleH + 2} fill="#fff" fillOpacity={0.82} />
        <text
          x={viewW / 2}
          y={9}
          textAnchor="middle"
          fontSize={8}
          fontWeight={700}
          fill="#111827"
          fontFamily="Arial, sans-serif"
        >
          {title}
        </text>
        <rect x={innerX} y={innerY} width={innerW} height={innerH} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={0.4} />
        {imageUrl ? (
          <image
            href={imageUrl}
            x={innerX}
            y={innerY}
            width={innerW}
            height={innerH}
            preserveAspectRatio="none"
            clipPath={`url(#${clipId})`}
            onLoad={onImageLoad}
            onError={onImageError}
          />
        ) : null}
        {status === "loading" ? (
          <text
            x={innerX + innerW / 2}
            y={innerY + innerH / 2}
            textAnchor="middle"
            fontSize={6}
            fill="#64748b"
            fontFamily="Arial, sans-serif"
          >
            Carregando…
          </text>
        ) : null}
        {status === "needs_georef" ? (
          <text
            x={innerX + innerW / 2}
            y={innerY + innerH / 2}
            textAnchor="middle"
            fontSize={5}
            fill="#64748b"
            fontFamily="Arial, sans-serif"
          >
            <tspan x={innerX + innerW / 2} dy={0}>
              Importe pontos UTM
            </tspan>
            <tspan x={innerX + innerW / 2} dy={7}>
              ou enquadre o desenho
            </tspan>
          </text>
        ) : null}
        {status === "error" ? (
          <text
            x={innerX + innerW / 2}
            y={innerY + innerH / 2}
            textAnchor="middle"
            fontSize={5.5}
            fill="#64748b"
            fontFamily="Arial, sans-serif"
          >
            Mapa indisponível
          </text>
        ) : null}
        <rect
          x={rx}
          y={ry}
          width={Math.max(rw, 4)}
          height={Math.max(rh, 4)}
          fill="rgba(220,38,38,0.18)"
          stroke="#dc2626"
          strokeWidth={0.9}
        />
        {rw >= 18 && rh >= 10 ? (
          <text x={rx + 2} y={ry + 8} fontSize={5.5} fill="#dc2626" fontWeight={700} fontFamily="Arial, sans-serif">
            {projectLabel}
          </text>
        ) : null}
        <text x={viewW - pad - 2} y={viewH - 3} textAnchor="end" fontSize={6.5} fill="#374151" fontFamily="Arial, sans-serif">
          {scaleLabel}
        </text>
        <g transform={`translate(${viewW - pad - 16}, ${innerY + 8})`}>
          <circle cx={0} cy={0} r={5} fill="#fff" stroke="#111827" strokeWidth={0.4} />
          <polygon points="0,-4 2.5,3 -2.5,3" fill="#111827" />
          <text x={0} y={1} textAnchor="middle" fontSize={4} fontWeight={700} fill="#fff">
            N
          </text>
        </g>
      </svg>
    </div>
  );
}
