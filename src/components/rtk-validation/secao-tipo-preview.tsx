"use client";

import { useMemo } from "react";
import { formatCoordBr } from "@/lib/rtk-validation/cad/polygon-utils";
import {
  buildSecaoTipoGeometry,
  secaoTipoElevations,
  type SecaoTipoParams,
  type SecaoTipoSample,
} from "@/lib/rtk-validation/cad/street-profile";

export type SecaoTipoPreviewVariant = "panel" | "chart" | "print";

type SecaoTipoPreviewProps = {
  params: SecaoTipoParams;
  greideZ?: number;
  pistaLabel: string;
  calcadaLabel: string;
  corteLabel: string;
  aterroLabel: string;
  axisLabel?: string;
  variant?: SecaoTipoPreviewVariant;
  title?: string;
  streetName?: string;
};

function toPath(points: SecaoTipoSample[], mapX: (v: number) => number, mapY: (v: number) => number): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${mapX(p.offset).toFixed(1)} ${mapY(p.z).toFixed(1)}`)
    .join(" ");
}

function DimLine({
  x1,
  x2,
  y,
  label,
  mapX,
}: {
  x1: number;
  x2: number;
  y: number;
  label: string;
  mapX: (v: number) => number;
}) {
  const a = mapX(Math.min(x1, x2));
  const b = mapX(Math.max(x1, x2));
  if (b - a < 8) return null;
  return (
    <g>
      <line x1={a} y1={y - 3.5} x2={a} y2={y + 3.5} stroke="#475569" strokeWidth={0.7} />
      <line x1={b} y1={y - 3.5} x2={b} y2={y + 3.5} stroke="#475569" strokeWidth={0.7} />
      <line x1={a} y1={y} x2={b} y2={y} stroke="#475569" strokeWidth={0.65} />
      <text x={(a + b) / 2} y={y - 4} textAnchor="middle" fontSize={7} fill="#334155" fontFamily="Arial, sans-serif">
        {label}
      </text>
    </g>
  );
}

export function SecaoTipoPreview({
  params,
  greideZ = 100,
  pistaLabel,
  calcadaLabel,
  corteLabel,
  aterroLabel,
  axisLabel = "Eixo",
  variant = "panel",
  title,
  streetName,
}: SecaoTipoPreviewProps) {
  const detailed = variant !== "panel";
  const geo = useMemo(() => buildSecaoTipoGeometry(params, greideZ), [params, greideZ]);
  const elev = useMemo(() => secaoTipoElevations(params, greideZ), [params, greideZ]);

  const { mapX, mapY, width, height, plotBottom } = useMemo(() => {
    const pts = [
      ...geo.platform,
      ...geo.aterroLeft,
      ...geo.aterroRight,
      ...geo.corteLeft,
      ...geo.corteRight,
    ];
    const xs = pts.map((p) => p.offset);
    const zs = pts.map((p) => p.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const w = detailed ? 880 : 220;
    const h = detailed ? 360 : 92;
    const padL = detailed ? 36 : 10;
    const padR = detailed ? 20 : 10;
    const padT = detailed ? (title ? 36 : 22) : 10;
    const padB = detailed ? 58 : 10;
    const spanX = Math.max(1e-3, maxX - minX);
    const spanZ = Math.max(1e-3, maxZ - minZ);
    return {
      width: w,
      height: h,
      plotBottom: h - padB,
      mapX: (x: number) => padL + ((x - minX) / spanX) * (w - padL - padR),
      mapY: (z: number) => padT + (1 - (z - minZ) / spanZ) * (h - padT - padB),
    };
  }, [detailed, geo, title]);

  const sidewalk = elev.halfPista + elev.calcada;
  const tip = sidewalk + elev.extra;
  const stroke = detailed ? 2.1 : 1.4;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={variant === "print" ? "100%" : undefined}
      className={
        variant === "panel"
          ? "h-[92px] w-full rounded border border-[#c7d2fe] bg-white"
          : variant === "chart"
            ? "mt-1 block h-[280px] w-full rounded border border-[#ddd6fe] bg-white"
            : "block h-full w-full bg-white"
      }
      role="img"
      aria-label={title ?? "Seção-tipo"}
      preserveAspectRatio="xMidYMid meet"
    >
      {detailed ? (
        <rect x={0} y={0} width={width} height={height} fill="#fff" />
      ) : null}
      {title ? (
        <text x={width / 2} y={16} textAnchor="middle" fontSize={11} fontWeight={700} fill="#0f2848" fontFamily="Arial, sans-serif">
          {title}
          {streetName ? ` — ${streetName}` : ""}
        </text>
      ) : null}

      <path d={toPath(geo.corteLeft, mapX, mapY)} fill="none" stroke="#dc2626" strokeWidth={stroke} strokeDasharray="4 3" />
      <path d={toPath(geo.corteRight, mapX, mapY)} fill="none" stroke="#dc2626" strokeWidth={stroke} strokeDasharray="4 3" />
      <path d={toPath(geo.aterroLeft, mapX, mapY)} fill="none" stroke="#d97706" strokeWidth={stroke} />
      <path d={toPath(geo.aterroRight, mapX, mapY)} fill="none" stroke="#d97706" strokeWidth={stroke} />
      <path
        d={toPath(geo.platform.filter((p) => p.part === "calcada" && p.offset <= 0), mapX, mapY)}
        fill="none"
        stroke="#94a3b8"
        strokeWidth={detailed ? 3 : 2.2}
      />
      <path
        d={toPath(geo.platform.filter((p) => p.part === "calcada" && p.offset >= 0), mapX, mapY)}
        fill="none"
        stroke="#94a3b8"
        strokeWidth={detailed ? 3 : 2.2}
      />
      <path
        d={toPath(geo.platform.filter((p) => p.part === "pista"), mapX, mapY)}
        fill="none"
        stroke="#334155"
        strokeWidth={detailed ? 3.2 : 2.4}
      />
      {geo.platform
        .reduce<Array<{ x: number; z0: number; z1: number }>>((acc, p, i, arr) => {
          const next = arr[i + 1];
          if (!next || Math.abs(p.offset - next.offset) > 1e-6) return acc;
          acc.push({ x: p.offset, z0: p.z, z1: next.z });
          return acc;
        }, [])
        .map((curb) => (
          <line
            key={`curb-${curb.x}`}
            x1={mapX(curb.x)}
            y1={mapY(curb.z0)}
            x2={mapX(curb.x)}
            y2={mapY(curb.z1)}
            stroke="#0f172a"
            strokeWidth={detailed ? 2 : 1.6}
          />
        ))}
      <line
        x1={mapX(0)}
        y1={detailed ? 28 : 8}
        x2={mapX(0)}
        y2={plotBottom}
        stroke="#2563eb"
        strokeWidth={0.85}
        strokeDasharray="3 2"
      />

      {detailed ? (
        <>
          <text x={mapX(0) + 4} y={detailed && title ? 40 : 28} fill="#2563eb" fontSize={8} fontFamily="Arial, sans-serif">
            {axisLabel}
          </text>
          <text
            x={mapX(0)}
            y={mapY(elev.greideZ) - 8}
            textAnchor="middle"
            fill="#1e3a8a"
            fontSize={8}
            fontFamily="Arial, sans-serif"
          >
            Z {formatCoordBr(elev.greideZ)}
          </text>
          <text x={mapX(-elev.halfPista / 2)} y={mapY(elev.greideZ) - 10} textAnchor="middle" fill="#334155" fontSize={8}>
            i = {formatCoordBr(elev.declivePista, 1)}%
          </text>
          <text x={mapX(elev.halfPista / 2)} y={mapY(elev.greideZ) - 10} textAnchor="middle" fill="#334155" fontSize={8}>
            i = {formatCoordBr(elev.declivePista, 1)}%
          </text>
          {elev.calcada > 0 ? (
            <>
              <text
                x={mapX(-(elev.halfPista + elev.calcada / 2))}
                y={mapY(elev.calcadaInnerZ) - 8}
                textAnchor="middle"
                fill="#64748b"
                fontSize={7.5}
              >
                i = {formatCoordBr(elev.decliveCalcada, 1)}%
              </text>
              <text
                x={mapX(elev.halfPista + elev.calcada / 2)}
                y={mapY(elev.calcadaInnerZ) - 8}
                textAnchor="middle"
                fill="#64748b"
                fontSize={7.5}
              >
                i = {formatCoordBr(elev.decliveCalcada, 1)}%
              </text>
            </>
          ) : null}
          <text
            x={mapX(-(sidewalk + elev.extra * 0.55))}
            y={mapY((elev.calcadaOuterZ + (geo.corteLeft[0]?.z ?? elev.calcadaOuterZ)) / 2)}
            fill="#dc2626"
            fontSize={7.5}
          >
            {corteLabel} {formatCoordBr(elev.corteH, 1)}H:1V
          </text>
          <text
            x={mapX(sidewalk + elev.extra * 0.15)}
            y={mapY((elev.calcadaOuterZ + (geo.aterroRight[1]?.z ?? elev.calcadaOuterZ)) / 2) + 10}
            fill="#d97706"
            fontSize={7.5}
          >
            {aterroLabel} {formatCoordBr(elev.aterroH, 1)}H:1V
          </text>
          <DimLine
            x1={-elev.halfPista}
            x2={elev.halfPista}
            y={plotBottom + 16}
            label={`${pistaLabel} ${formatCoordBr(params.larguraPistaM)} m`}
            mapX={mapX}
          />
          {elev.calcada > 0 ? (
            <>
              <DimLine
                x1={-sidewalk}
                x2={-elev.halfPista}
                y={plotBottom + 32}
                label={`${calcadaLabel} ${formatCoordBr(params.larguraCalcadaM)} m`}
                mapX={mapX}
              />
              <DimLine
                x1={elev.halfPista}
                x2={sidewalk}
                y={plotBottom + 32}
                label={`${calcadaLabel} ${formatCoordBr(params.larguraCalcadaM)} m`}
                mapX={mapX}
              />
            </>
          ) : null}
          <DimLine
            x1={-tip}
            x2={tip}
            y={plotBottom + 48}
            label={`${formatCoordBr(tip * 2)} m`}
            mapX={mapX}
          />
          <text
            x={mapX(elev.halfPista) + 6}
            y={(mapY(elev.edgePistaZ) + mapY(elev.calcadaInnerZ)) / 2 + 3}
            fill="#0f172a"
            fontSize={7}
            fontFamily="Arial, sans-serif"
          >
            {formatCoordBr(elev.meioFio)} m
          </text>
        </>
      ) : (
        <>
          <text x={8} y={12} fill="#334155" fontSize={8}>
            {pistaLabel}
          </text>
          <text x={width - 8} y={12} fill="#64748b" fontSize={8} textAnchor="end">
            {calcadaLabel}
          </text>
          <text x={8} y={height - 6} fill="#d97706" fontSize={8}>
            {aterroLabel}
          </text>
          <text x={width - 8} y={height - 6} fill="#dc2626" fontSize={8} textAnchor="end">
            {corteLabel}
          </text>
        </>
      )}
    </svg>
  );
}
