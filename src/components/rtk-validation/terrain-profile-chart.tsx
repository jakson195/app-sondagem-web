"use client";

import { formatCoordBr } from "@/lib/rtk-validation/cad/polygon-utils";
import {
  computeProfileChartMetrics,
  profileChartAxisTicks,
  profileChartPointCoords,
  PROFILE_DISTANCE_TICK_M,
  PROFILE_ELEVATION_TICK_M,
} from "@/lib/rtk-validation/cad/profile-chart-metrics";
import type { CadPolylineEntity } from "@/lib/rtk-validation/cad/types";

type TerrainProfileChartProps = {
  profile: CadPolylineEntity;
  title?: string;
  distanceLabel?: string;
  elevationLabel?: string;
  distanceTickM?: number;
  elevationTickM?: number;
};

/** Gráfico distância × cota do perfil do terreno. */
export function TerrainProfileChart({
  profile,
  title,
  distanceLabel = "Distância (m)",
  elevationLabel = "Cota (m)",
  distanceTickM = PROFILE_DISTANCE_TICK_M,
  elevationTickM = PROFILE_ELEVATION_TICK_M,
}: TerrainProfileChartProps) {
  const metrics = computeProfileChartMetrics(profile);
  if (!metrics) return null;

  const chartW = 600;
  const chartH = 220;
  const margin = { left: 46, right: 12, top: 14, bottom: 28 };
  const { innerW, innerH, toX, toY } = profileChartPointCoords(metrics, chartW, chartH, margin);

  const { distanceTicks, elevationTicks } = profileChartAxisTicks(metrics, distanceTickM, elevationTickM);

  const path = profile.vertices
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.x).toFixed(2)} ${toY(p.z).toFixed(2)}`)
    .join(" ");

  return (
    <div className="rounded-lg border border-[#bae6fd] bg-[#f0f9ff] p-2">
      <p className="text-xs font-semibold text-[#0f2848]">{title ?? profile.name ?? "Perfil do terreno"}</p>
      <svg viewBox={`0 0 ${chartW} ${chartH}`} width="100%" height={chartH} className="mt-1 block">
        <rect
          x={margin.left}
          y={margin.top}
          width={innerW}
          height={innerH}
          fill="#fff"
          stroke="#94a3b8"
          strokeWidth={0.5}
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
              y={chartH - 8}
              textAnchor="middle"
              fontSize={6.5}
              fill="#64748b"
              fontFamily="ui-monospace, monospace"
            >
              {formatCoordBr(d)}
            </text>
          </g>
        ))}

        <path d={path} fill="none" stroke="#0891b2" strokeWidth={1.5} />
        {profile.vertices.map((p, i) => (
          <circle key={i} cx={toX(p.x)} cy={toY(p.z)} r={1.5} fill="#0e7490" />
        ))}

        <text x={margin.left + innerW / 2} y={chartH - 1} textAnchor="middle" fontSize={7} fill="#475569">
          {distanceLabel} · a cada {distanceTickM} m
        </text>
        <text
          x={7}
          y={margin.top + innerH / 2}
          textAnchor="middle"
          fontSize={7}
          fill="#475569"
          transform={`rotate(-90 7 ${margin.top + innerH / 2})`}
        >
          {elevationLabel} · a cada {elevationTickM} m
        </text>
      </svg>
      <p className="mt-1 text-[10px] text-[#64748b]">
        Comprimento: {formatCoordBr(metrics.spanD)} m · Δ cota: {formatCoordBr(metrics.maxZ - metrics.minZ)} m
      </p>
    </div>
  );
}
