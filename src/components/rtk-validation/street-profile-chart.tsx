"use client";

import { useMemo, useRef, useState } from "react";
import { formatCoordBr } from "@/lib/rtk-validation/cad/polygon-utils";
import {
  buildProfileAxisTicks,
  PROFILE_DISTANCE_TICK_M,
  PROFILE_ELEVATION_TICK_M,
} from "@/lib/rtk-validation/cad/profile-chart-metrics";
import {
  computeProfileEarthwork,
  interpolateGreideZ,
  type GreidePiv,
  type StreetProfileDraft,
} from "@/lib/rtk-validation/cad/street-profile";

type StreetProfileChartProps = {
  profile: StreetProfileDraft;
  onGreideChange?: (pivId: string, z: number) => void;
  onAddPiv?: (stationM: number, z: number) => void;
  variant?: "edit" | "print";
  title?: string;
};

export function StreetProfileChart({
  profile,
  onGreideChange,
  onAddPiv,
  variant = "edit",
  title,
}: StreetProfileChartProps) {
  const interactive = variant === "edit" && Boolean(onGreideChange && onAddPiv);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const chartW = variant === "print" ? 1000 : 720;
  const chartH = variant === "print" ? 380 : 260;
  const margin = { left: 48, right: 16, top: 28, bottom: 36 };
  const innerW = chartW - margin.left - margin.right;
  const innerH = chartH - margin.top - margin.bottom;

  const metrics = useMemo(() => {
    const zs = [
      ...profile.terrain.map((p) => p.z),
      ...profile.greide.map((p) => p.z),
    ];
    const ds = profile.terrain.map((p) => p.x);
    const minD = Math.min(...ds, 0);
    const maxD = Math.max(...ds, 1);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const padZ = Math.max((maxZ - minZ) * 0.15, 0.8);
    return {
      minD,
      maxD,
      spanD: Math.max(maxD - minD, 1),
      zMin: minZ - padZ,
      zMax: maxZ + padZ,
      spanZ: Math.max(maxZ - minZ + 2 * padZ, 1),
    };
  }, [profile.greide, profile.terrain]);

  const toX = (d: number) => margin.left + ((d - metrics.minD) / metrics.spanD) * innerW;
  const toY = (z: number) => margin.top + innerH - ((z - metrics.zMin) / metrics.spanZ) * innerH;
  const fromX = (px: number) => metrics.minD + ((px - margin.left) / innerW) * metrics.spanD;
  const fromY = (py: number) => metrics.zMin + ((margin.top + innerH - py) / innerH) * metrics.spanZ;

  const terrainPath = profile.terrain
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.x).toFixed(2)} ${toY(p.z).toFixed(2)}`)
    .join(" ");
  const greidePath = [...profile.greide]
    .sort((a, b) => a.stationM - b.stationM)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.stationM).toFixed(2)} ${toY(p.z).toFixed(2)}`)
    .join(" ");

  const cutFillPath = useMemo(() => {
    const pts = profile.terrain.map((p) => ({
      d: p.x,
      t: p.z,
      g: interpolateGreideZ(profile.greide, p.x),
    }));
    const cut: string[] = [];
    const fill: string[] = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const cutSeg = a.t >= a.g && b.t >= b.g;
      const fillSeg = a.t <= a.g && b.t <= b.g;
      const d = `M ${toX(a.d)} ${toY(a.t)} L ${toX(b.d)} ${toY(b.t)} L ${toX(b.d)} ${toY(b.g)} L ${toX(a.d)} ${toY(a.g)} Z`;
      if (cutSeg) cut.push(d);
      else if (fillSeg) fill.push(d);
    }
    return { cut, fill };
  }, [profile.greide, profile.terrain, metrics]);

  const earthwork = useMemo(
    () => computeProfileEarthwork(profile.terrain, profile.greide),
    [profile.greide, profile.terrain],
  );

  const distanceTicks = buildProfileAxisTicks(metrics.minD, metrics.maxD, PROFILE_DISTANCE_TICK_M);
  const elevationTicks = buildProfileAxisTicks(metrics.zMin, metrics.zMax, PROFILE_ELEVATION_TICK_M);

  function clientToSvg(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * chartW;
    const y = ((event.clientY - rect.top) / rect.height) * chartH;
    return { x, y };
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!interactive || !dragId || !onGreideChange) return;
    const pt = clientToSvg(event);
    if (!pt) return;
    onGreideChange(dragId, fromY(pt.y));
  }

  function onPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (dragId) {
      svgRef.current?.releasePointerCapture(event.pointerId);
      setDragId(null);
    }
  }

  function onBackgroundClick(event: React.PointerEvent<SVGRectElement>) {
    if (!interactive || dragId || !onAddPiv) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * chartW;
    const station = fromX(x);
    onAddPiv(station, interpolateGreideZ(profile.greide, station));
  }

  return (
    <div
      className={
        variant === "print"
          ? "flex h-full w-full flex-col bg-white p-1"
          : "rounded-lg border border-[#bfdbfe] bg-[#f8fafc] p-2"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={`font-semibold text-[#0f2848] ${variant === "print" ? "text-sm" : "text-xs"}`}>
            {title ?? `Perfil longitudinal — ${profile.streetName}`}
          </p>
          {interactive ? (
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#2563eb]">
              Edite o greide do perfil
            </p>
          ) : null}
        </div>
        <div className="flex gap-3 text-[10px]">
          <span className="text-rose-700">
            Área de corte: {formatCoordBr(earthwork.cutAreaM2)} m²
          </span>
          <span className="text-sky-700">
            Área de aterro: {formatCoordBr(earthwork.fillAreaM2)} m²
          </span>
        </div>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${chartW} ${chartH}`}
        width="100%"
        height={variant === "print" ? "100%" : chartH}
        className={variant === "print" ? "mt-1 block min-h-0 flex-1" : "mt-1 block touch-none"}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <rect
          x={margin.left}
          y={margin.top}
          width={innerW}
          height={innerH}
          fill="#fff"
          stroke="#94a3b8"
          strokeWidth={0.5}
          onPointerDown={onBackgroundClick}
        />
        {elevationTicks.map((z) => (
          <g key={`y-${z}`}>
            <line
              x1={margin.left}
              y1={toY(z)}
              x2={margin.left + innerW}
              y2={toY(z)}
              stroke="#e2e8f0"
              strokeWidth={0.5}
            />
            <text
              x={margin.left - 4}
              y={toY(z) + 3}
              textAnchor="end"
              fontSize={6.5}
              fill="#64748b"
              fontFamily="ui-monospace, monospace"
            >
              {formatCoordBr(z)}
            </text>
          </g>
        ))}
        {distanceTicks.map((d) => (
          <g key={`x-${d}`}>
            <line
              x1={toX(d)}
              y1={margin.top}
              x2={toX(d)}
              y2={margin.top + innerH}
              stroke="#f1f5f9"
              strokeWidth={0.5}
            />
            <text
              x={toX(d)}
              y={chartH - 10}
              textAnchor="middle"
              fontSize={6.5}
              fill="#64748b"
              fontFamily="ui-monospace, monospace"
            >
              {formatCoordBr(d, 0)}
            </text>
          </g>
        ))}
        {cutFillPath.cut.map((d, i) => (
          <path key={`c-${i}`} d={d} fill="#fda4af" fillOpacity={0.55} />
        ))}
        {cutFillPath.fill.map((d, i) => (
          <path key={`f-${i}`} d={d} fill="#7dd3fc" fillOpacity={0.45} />
        ))}
        {profile.intersections.map((hit) => (
          <g key={`enc-${hit.stationM}-${hit.x}`}>
            <line
              x1={toX(hit.stationM)}
              y1={margin.top}
              x2={toX(hit.stationM)}
              y2={margin.top + innerH}
              stroke="#dc2626"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <text
              x={toX(hit.stationM) + 3}
              y={margin.top + 10}
              fontSize={6}
              fill="#b91c1c"
            >
              {hit.streetNames[0] ? `Encontro ${hit.streetNames[0]}` : "Encontro"}
            </text>
          </g>
        ))}
        <path d={terrainPath} fill="none" stroke="#0891b2" strokeWidth={1.4} />
        <path d={greidePath} fill="none" stroke="#2563eb" strokeWidth={2} />
        {profile.greide.map((piv: GreidePiv) => (
          <g key={piv.id}>
            <circle
              cx={toX(piv.stationM)}
              cy={toY(piv.z)}
              r={piv.kind === "intersection" ? 4.5 : 4}
              fill={piv.kind === "intersection" ? "#dc2626" : "#2563eb"}
              stroke="#fff"
              strokeWidth={1}
              className={interactive ? "cursor-ns-resize" : undefined}
              onPointerDown={
                interactive
                  ? (event) => {
                      event.stopPropagation();
                      setDragId(piv.id);
                      svgRef.current?.setPointerCapture(event.pointerId);
                    }
                  : undefined
              }
            />
            <text
              x={toX(piv.stationM) + 6}
              y={toY(piv.z) - 6}
              fontSize={6}
              fill="#1e3a8a"
            >
              {piv.kind === "intersection" ? "PIV encontro" : piv.kind === "piv" ? "PIV" : piv.kind === "start" ? "Início" : "Fim"}
              {" "}
              {formatCoordBr(piv.z)}
            </text>
          </g>
        ))}
        <text x={margin.left + innerW / 2} y={chartH - 2} textAnchor="middle" fontSize={7} fill="#475569">
          Estaca / distância (m)
        </text>
        <text
          x={8}
          y={margin.top + innerH / 2}
          textAnchor="middle"
          fontSize={7}
          fill="#475569"
          transform={`rotate(-90 8 ${margin.top + innerH / 2})`}
        >
          Cota (m)
        </text>
      </svg>
      {interactive ? (
        <p className="mt-1 text-[10px] text-[#64748b]">
          Arraste os pontos azuis para editar o greide. Clique no gráfico para inserir PIV.
          Encontros de rua aparecem em vermelho.
        </p>
      ) : null}
    </div>
  );
}
