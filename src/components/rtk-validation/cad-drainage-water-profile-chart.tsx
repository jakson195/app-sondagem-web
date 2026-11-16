"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import type { CadProject, CadPolylineEntity } from "@/lib/rtk-validation/cad/types";
import {
  DRAINAGE_LAMINA_RELATIVA_MAX,
  DRENAGEM_EMISSARIO_LAYER,
  listDrainagePipes,
  listDrainagePvs,
  classifyDrainageFlowDepthRatio,
  updateDrainagePipe,
  autoCorrectDrainagePipeFlowDepthRatio,
  pipeSlopePct,
  pipeLengthM,
} from "@/lib/rtk-validation/cad";

function parseNumBr(input: string): number | null {
  const v = Number(input.replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(digits);
}

type CadDrainageWaterProfileChartProps = {
  project: CadProject;
  selectedPipeId: string | null;
  setProject: (p: CadProject) => void;
};

export function CadDrainageWaterProfileChart({
  project,
  selectedPipeId,
  setProject,
}: CadDrainageWaterProfileChartProps) {
  const t = useTranslations("rtkCad");
  const [autoMode, setAutoMode] = useState<"current" | "notFull">("current");
  const [autoNotice, setAutoNotice] = useState<string | null>(null);

  const pipes = useMemo(() => listDrainagePipes(project), [project]);
  const pvs = useMemo(() => listDrainagePvs(project), [project]);

  const selectedPipe = useMemo(() => {
    if (!selectedPipeId) return null;
    return pipes.find((p) => p.id === selectedPipeId) ?? null;
  }, [pipes, selectedPipeId]);

  const outfallId = useMemo(() => {
    return (
      pvs.find((p) => p.drainage?.kind === "outfall" || p.layerId === DRENAGEM_EMISSARIO_LAYER.id)?.id ??
      null
    );
  }, [pvs]);

  const chainSegments = useMemo(() => {
    if (!selectedPipe) return [];
    const segs: CadPolylineEntity[] = [selectedPipe];
    let cursorNodeId = selectedPipe.drainage?.toPvId ?? null;
    let safety = 0;
    while (cursorNodeId && safety < pipes.length + 2) {
      safety++;
      if (outfallId && cursorNodeId === outfallId) break;
      const next = pipes.find((p) => p.drainage?.fromPvId === cursorNodeId);
      if (!next) break;
      segs.push(next);
      cursorNodeId = next.drainage?.toPvId ?? null;
    }
    return segs;
  }, [pipes, selectedPipe, outfallId]);

  const pvById = useMemo(() => new Map(pvs.map((p) => [p.id, p])), [pvs]);

  const profile = useMemo(() => {
    if (!selectedPipe) return null;
    if (chainSegments.length === 0) return null;

    const nodes: Array<{ id: string; code: string; groundZ: number | null }> = [];
    const invertZ: number[] = [];
    const waterZ: number[] = [];
    const distM: number[] = [];

    const first = chainSegments[0];
    const firstFromId = first.drainage?.fromPvId ?? "";
    nodes.push({
      id: firstFromId,
      code: pvById.get(firstFromId)?.drainage?.code ?? pvById.get(firstFromId)?.label ?? firstFromId,
      groundZ: pvById.get(firstFromId)?.drainage?.groundZ ?? null,
    });

    const firstInvertInZ = first.drainage?.invertInZ ?? first.vertices[0].z;
    distM.push(0);
    invertZ.push(firstInvertInZ);

    const firstD = (first.drainage?.diameterMm ?? 300) / 1000;
    const firstRatio =
      first.drainage?.flowDepthRatio ??
      // Fallback: se por algum motivo não existir, recalcula pelo Manning.
      0;
    const firstWater = firstInvertInZ + firstRatio * firstD;
    waterZ.push(firstWater);

    const segmentMeta: Array<{
      pipe: CadPolylineEntity;
      yOverD: number;
      waterIn: number;
      waterOut: number;
      invertIn: number;
      invertOut: number;
      D: number;
      lengthM: number;
      slopePct: number;
    }> = [];

    for (let i = 0; i < chainSegments.length; i++) {
      const seg = chainSegments[i];
      const fromId = seg.drainage?.fromPvId ?? nodes[i]?.id ?? "";
      const toId = seg.drainage?.toPvId ?? "";
      const diameterMm = seg.drainage?.diameterMm ?? 300;
      const D = diameterMm / 1000;
      const lengthM =
        seg.drainage?.lengthM ??
        pipeLengthM(seg.vertices[0].x, seg.vertices[0].y, seg.vertices.at(-1)!.x, seg.vertices.at(-1)!.y);
      const slopePct =
        seg.drainage?.slopePct ??
        pipeSlopePct(seg.drainage?.invertInZ ?? seg.vertices[0].z, seg.drainage?.invertOutZ ?? seg.vertices.at(-1)!.z, lengthM);
      const ratio = seg.drainage?.flowDepthRatio ?? firstRatio;
      const invertIn = seg.drainage?.invertInZ ?? seg.vertices[0].z;
      const invertOut = seg.drainage?.invertOutZ ?? seg.vertices.at(-1)!.z;

      const waterIn = invertIn + ratio * D;
      const waterOut = invertOut + ratio * D;

      segmentMeta.push({
        pipe: seg,
        yOverD: ratio,
        waterIn,
        waterOut,
        invertIn,
        invertOut,
        D,
        lengthM,
        slopePct,
      });

      // Nó i+1 (saída do trecho)
      if (i === 0) {
        // já empilhamos invert/water do nó inicial
      } else {
        // nó intermediário entra pela última iteração do trecho anterior
      }
      distM.push((distM.at(-1) ?? 0) + lengthM);
      invertZ.push(invertOut);
      waterZ.push(waterOut);
      nodes.push({
        id: toId,
        code: pvById.get(toId)?.drainage?.code ?? pvById.get(toId)?.label ?? toId,
        groundZ: pvById.get(toId)?.drainage?.groundZ ?? null,
      });
    }

    const grounds = nodes.map((n) => n.groundZ).filter((z): z is number => z != null && Number.isFinite(z));
    const crowns = segmentMeta.flatMap((m) => [m.invertIn + m.D, m.invertOut + m.D]);
    const zMin = Math.min(...invertZ, ...waterZ) - 0.4;
    const zMax = Math.max(...invertZ, ...waterZ, ...crowns, ...grounds) + 0.5;

    return {
      nodes,
      invertZ,
      waterZ,
      distM,
      segmentMeta,
      zMin,
      zMax,
      totalLengthM: distM.at(-1) ?? 0,
    };
  }, [selectedPipe, chainSegments, pvById]);

  if (!profile) return null;

  const totalLen = Math.max(1e-6, profile.totalLengthM);
  const zMin = profile.zMin;
  const zMax = profile.zMax + 1e-6;

  const chartW = 720;
  const chartH = 270;
  const margin = { left: 60, right: 18, top: 14, bottom: 36 };
  const innerW = chartW - margin.left - margin.right;
  const innerH = chartH - margin.top - margin.bottom;

  const toX = (d: number) => margin.left + innerW * (d / totalLen);
  const toY = (z: number) => margin.top + innerH * (1 - (z - zMin) / (zMax - zMin));

  const zTicks = (() => {
    const span = zMax - zMin;
    const tickCount = 4;
    const step = span / tickCount || 1;
    return new Array(tickCount + 1).fill(0).map((_, i) => zMin + step * i);
  })();

  const segment0 = profile.segmentMeta[0]?.pipe;
  const selectedRatio = segment0?.drainage?.flowDepthRatio ?? 0;
  const selectedClass = classifyDrainageFlowDepthRatio(selectedRatio, DRAINAGE_LAMINA_RELATIVA_MAX).class;

  const autoTargetYOverD =
    autoMode === "current" ? DRAINAGE_LAMINA_RELATIVA_MAX : 1;

  return (
    <section className="rounded-lg border border-[#e5e7eb] bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold text-[#0f2848]">{t("drenagem.profileTitle")}</h4>
          <p className="mt-0.5 text-[10px] text-[#6b7280]">{t("drenagem.profileHint")}</p>
        </div>
        <div className="text-[10px]">
          {selectedClass !== "Parcial" ? (
            <p className={selectedClass === "Extrapolando" ? "text-red-700 font-semibold" : "text-amber-700 font-semibold"}>
              {t("drenagem.profileAlert", { class: selectedClass, yOverD: fmt(selectedRatio, 2) })}
            </p>
          ) : (
            <p className="text-emerald-700 font-semibold">{t("drenagem.profileOk")}</p>
          )}
        </div>
      </div>

      <div className="mt-2 overflow-auto">
        <svg viewBox={`0 0 ${chartW} ${chartH}`} width="100%" height={chartH} className="block">
          {/* eixos / grade */}
          {zTicks.map((z, i) => (
            <g key={`z-${i}`}>
              <line
                x1={margin.left}
                y1={toY(z)}
                x2={margin.left + innerW}
                y2={toY(z)}
                stroke="#e2e8f0"
                strokeWidth={0.5}
              />
              <text x={margin.left - 8} y={toY(z) + 3} fontSize={7} fill="#64748b" textAnchor="end" fontFamily="ui-monospace, monospace">
                {z.toFixed(2)}
              </text>
            </g>
          ))}

          {/* terreno natural sobre a rede */}
          {profile.nodes.every((n) => n.groundZ != null) ? (
            <polyline
              points={profile.nodes.map((n, i) => `${toX(profile.distM[i] ?? 0)},${toY(n.groundZ!)}`).join(" ")}
              fill="none"
              stroke="#8b5e34"
              strokeWidth={1.4}
            />
          ) : null}

          {/* corpo do tubo (geratriz inferior até a superior) */}
          {profile.segmentMeta.map((meta, i) => {
            const x0 = toX(profile.distM[i]);
            const x1 = toX(profile.distM[i + 1]);
            return (
              <polygon
                key={`tubo-${i}`}
                points={`${x0},${toY(meta.invertIn)} ${x1},${toY(meta.invertOut)} ${x1},${toY(meta.invertOut + meta.D)} ${x0},${toY(meta.invertIn + meta.D)}`}
                fill="#f1f5f9"
                stroke="#64748b"
                strokeWidth={0.8}
              />
            );
          })}

          {/* preenchimento por trecho */}
          {profile.segmentMeta.map((meta, i) => {
            const x0 = toX(profile.distM[i]);
            const x1 = toX(profile.distM[i + 1]);
            const yInv0 = toY(meta.invertIn);
            const yInv1 = toY(meta.invertOut);
            const yW0 = toY(meta.waterIn);
            const yW1 = toY(meta.waterOut);
            const points = `${x0},${yInv0} ${x1},${yInv1} ${x1},${yW1} ${x0},${yW0}`;
            return (
              <polygon
                key={`fill-${i}`}
                points={points}
                fill="#7dd3fc"
                fillOpacity={0.35}
                stroke="none"
              />
            );
          })}

          {/* linhas: invert (preto) e nível d'água (azul tracejado) */}
          <polyline
            points={profile.nodes
              .map((_, i) => `${toX(profile.distM[i] ?? 0)},${toY(profile.invertZ[i] ?? 0)}`)
              .join(" ")}
            fill="none"
            stroke="#111827"
            strokeWidth={1.3}
          />
          <polyline
            points={profile.nodes
              .map((_, i) => `${toX(profile.distM[i] ?? 0)},${toY(profile.waterZ[i] ?? 0)}`)
              .join(" ")}
            fill="none"
            stroke="#0891b2"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />

          {/* PVs: poço do fundo até a tampa, com cotas */}
          {profile.nodes.map((n, i) => {
            const x = toX(profile.distM[i] ?? 0);
            const fundo = (profile.invertZ[i] ?? 0) - 0.15;
            const diam = Math.max(
              profile.segmentMeta[Math.max(0, i - 1)]?.D ?? 0.4,
              profile.segmentMeta[Math.min(i, profile.segmentMeta.length - 1)]?.D ?? 0.4,
            );
            const tampa = n.groundZ ?? (profile.invertZ[i] ?? 0) + diam + 0.6;
            const yT = toY(tampa);
            const yF = toY(fundo);
            const w = 9;
            const ehBoca = n.code.startsWith("BL");
            return (
              <g key={`node-${n.id}-${i}`}>
                <rect x={x - w / 2} y={yT} width={w} height={Math.max(4, yF - yT)} fill="#ffffff" stroke="#0b3a6e" strokeWidth={1.3} />
                <line x1={x - w / 2 - 2.5} y1={yT} x2={x + w / 2 + 2.5} y2={yT} stroke="#0b3a6e" strokeWidth={2.4} />
                <line x1={x - w / 2} y1={yF} x2={x + w / 2} y2={yF} stroke="#0b3a6e" strokeWidth={1.8} />
                <text x={x} y={yT - 12} fontSize={7.5} fontWeight={700} fill="#0b3a6e" textAnchor="middle">
                  {n.code}
                </text>
                <text x={x} y={yT - 4} fontSize={6} fill="#475569" textAnchor="middle" fontFamily="ui-monospace, monospace">
                  {ehBoca ? "" : `T ${tampa.toFixed(2)}`}
                </text>
                <text x={x} y={yF + 8} fontSize={6} fill="#475569" textAnchor="middle" fontFamily="ui-monospace, monospace">
                  {`F ${(profile.invertZ[i] ?? 0).toFixed(2)}`}
                </text>
              </g>
            );
          })}

          {/* labels por trecho */}
          {profile.segmentMeta.map((meta, i) => {
            const xMid = (toX(profile.distM[i]) + toX(profile.distM[i + 1])) / 2;
            const yLabel = toY(meta.waterOut) - 4;
            const cls = classifyDrainageFlowDepthRatio(meta.yOverD).class;
            const color = cls === "Extrapolando" ? "#dc2626" : cls === "Cheio" ? "#b45309" : "#0f766e";
            const text =
              cls === "Parcial"
                ? `Parcial y/D=${meta.yOverD.toFixed(2)}`
                : cls === "Cheio"
                  ? `Cheio y/D=${meta.yOverD.toFixed(2)}`
                  : `Extrapolando y/D=${meta.yOverD.toFixed(2)}`;
            return (
              <text key={`seg-${i}-label`} x={xMid} y={yLabel - 3} fontSize={7.5} fontWeight={600} fill={color} textAnchor="middle" stroke="#ffffff" strokeWidth={2.5} paintOrder="stroke">
                {text}
              </text>
            );
          })}
        </svg>
      </div>

      {/* seção transversal de cada trecho: o tubo e a lâmina d'água dentro dele */}
      <div className="mt-3 flex flex-wrap gap-2">
        {profile.segmentMeta.map((meta, i) => (
          <SecaoTubo
            key={`secao-${i}`}
            codigo={meta.pipe.drainage?.code ?? meta.pipe.name ?? `TB-${i + 1}`}
            diametroM={meta.D}
            yOverD={meta.yOverD}
            material={meta.pipe.drainage?.material}
          />
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded border border-[#e5e7eb] p-2">
          <p className="text-[10px] font-semibold text-[#0f2848]">{t("drenagem.profileSegmentsTitle")}</p>
          <div className="mt-1 space-y-1">
            {profile.segmentMeta.map((meta, i) => {
              const cls = classifyDrainageFlowDepthRatio(meta.yOverD);
              const code = meta.pipe.drainage?.code ?? meta.pipe.name ?? `TB-${i + 1}`;
              return (
                <div key={`seg-${i}`} className="rounded bg-[#f8fafc] px-2 py-1">
                  <p className="text-[10px] font-semibold text-[#0f2848]">{code}</p>
                  <p className="text-[10px] text-[#334155]">
                    i={fmt(meta.slopePct, 2)}% · y/D={fmt(meta.yOverD, 2)} · {cls.class}
                  </p>
                  <p className="text-[10px] text-[#475569]">
                    invert {fmt(meta.invertIn, 2)} → {fmt(meta.invertOut, 2)} m · nível d&apos;água{" "}
                    {fmt(meta.waterIn, 2)} → {fmt(meta.waterOut, 2)} m
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded border border-[#e5e7eb] p-2">
          <p className="text-[10px] font-semibold text-[#0f2848]">{t("drenagem.profileEditTitle")}</p>
          {selectedPipe ? (
            <>
              <div className="mt-1 grid grid-cols-1 gap-2">
                <label className="text-[10px] text-[#6b7280]">
                  {t("drenagem.propsSlope")} (i %)
                  <input
                    className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                    type="text"
                    inputMode="decimal"
                    defaultValue={String(selectedPipe.drainage?.slopePct ?? 0)}
                    onBlur={(e) => {
                      const v = parseNumBr(e.target.value);
                      if (v == null) return;
                      setProject(updateDrainagePipe(project, selectedPipe.id, { slopePct: v }));
                    }}
                  />
                </label>
                <label className="text-[10px] text-[#6b7280]">
                  {t("drenagem.propsInvert")} in
                  <input
                    className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                    type="text"
                    inputMode="decimal"
                    defaultValue={String(selectedPipe.drainage?.invertInZ ?? 0)}
                    onBlur={(e) => {
                      const v = parseNumBr(e.target.value);
                      if (v == null) return;
                      setProject(updateDrainagePipe(project, selectedPipe.id, { invertInZ: v }));
                    }}
                  />
                </label>
                <label className="text-[10px] text-[#6b7280]">
                  {t("drenagem.propsInvert")} out
                  <input
                    className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                    type="text"
                    inputMode="decimal"
                    defaultValue={String(selectedPipe.drainage?.invertOutZ ?? 0)}
                    onBlur={(e) => {
                      const v = parseNumBr(e.target.value);
                      if (v == null) return;
                      setProject(updateDrainagePipe(project, selectedPipe.id, { invertOutZ: v }));
                    }}
                  />
                </label>
              </div>

              <div className="mt-2 rounded bg-[#eef2ff] px-2 py-2">
                <p className="text-[10px] font-medium text-[#4338ca]">{t("drenagem.profileAutoHint")}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1 text-[10px] text-[#4338ca]">
                    <input type="radio" checked={autoMode === "current"} onChange={() => setAutoMode("current")} />
                    {t("drenagem.profileAutoModeCurrent")}
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-[#4338ca]">
                    <input type="radio" checked={autoMode === "notFull"} onChange={() => setAutoMode("notFull")} />
                    {t("drenagem.profileAutoModeNotFull")}
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAutoNotice(null);
                    const target = autoTargetYOverD;
                    try {
                      const res = autoCorrectDrainagePipeFlowDepthRatio(project, selectedPipe.id, {
                        targetYOverD: target,
                        maxSlopePct: 10,
                      });
                      setProject(res.project);
                      if (!res.corrected) setAutoNotice(res.reason ?? t("commands.error"));
                    } catch (err) {
                      setAutoNotice(err instanceof Error ? err.message : t("commands.error"));
                    }
                  }}
                  className="mt-2 w-full rounded-lg bg-[#0f2848] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#123a6a]"
                >
                  {t("drenagem.profileAutoFix")}
                </button>
                {autoNotice ? <p className="mt-1 text-[10px] text-red-700">{autoNotice}</p> : null}
              </div>
            </>
          ) : (
            <p className="mt-1 text-[10px] text-[#6b7280]">{t("drenagem.profileEditEmpty")}</p>
          )}
        </div>
      </div>
    </section>
  );
}


/** Corte do tubo: círculo com a lâmina d'água preenchida até y/D. */
function SecaoTubo({
  codigo,
  diametroM,
  yOverD,
  material,
}: {
  codigo: string;
  diametroM: number;
  yOverD: number;
  material?: string;
}) {
  const r = 34;
  const cx = 46;
  const cy = 44;
  const parede = 5;
  const ratio = Math.max(0, Math.min(1, yOverD));
  const cls = classifyDrainageFlowDepthRatio(ratio, DRAINAGE_LAMINA_RELATIVA_MAX).class;
  const cor = cls === "Extrapolando" ? "#dc2626" : cls === "Cheio" ? "#d97706" : "#0ea5e9";
  const ys = cy + r - 2 * r * ratio;
  const dy = ys - cy;
  const meia = Math.sqrt(Math.max(0, r * r - dy * dy));
  const agua =
    ratio <= 0.001
      ? null
      : ratio >= 0.999
        ? <circle cx={cx} cy={cy} r={r} fill={cor} fillOpacity={0.55} />
        : (
          <path
            d={`M ${cx - meia} ${ys} A ${r} ${r} 0 ${ratio > 0.5 ? 1 : 0} 0 ${cx + meia} ${ys} Z`}
            fill={cor}
            fillOpacity={0.55}
          />
        );
  const laminaMm = Math.round(ratio * diametroM * 1000);
  return (
    <figure className="flex items-center gap-2 rounded-lg border border-[#e5e7eb] bg-[#f8fafc] px-2 py-1.5">
      <svg width={92} height={88} viewBox="0 0 92 88" aria-label={`Seção do tubo ${codigo}`}>
        <circle cx={cx} cy={cy} r={r + parede / 2} fill="none" stroke="#94a3b8" strokeWidth={parede} />
        <circle cx={cx} cy={cy} r={r} fill="#ffffff" />
        {agua}
        {ratio > 0.001 && ratio < 0.999 ? (
          <line x1={cx - meia} y1={ys} x2={cx + meia} y2={ys} stroke={cor} strokeWidth={1.5} />
        ) : null}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#0b3a6e" strokeWidth={1.4} />
        <line x1={cx + r + 6} y1={cy + r} x2={cx + r + 6} y2={ys} stroke="#475569" strokeWidth={0.8} />
      </svg>
      <figcaption className="text-[10px] leading-4 text-[#334155]">
        <p className="font-semibold text-[#0f2848]">{codigo}</p>
        <p>
          DN {Math.round(diametroM * 1000)} mm{material ? ` · ${material}` : ""}
        </p>
        <p>
          lâmina {laminaMm} mm · y/D {ratio.toFixed(2)}
        </p>
        <p className="font-semibold" style={{ color: cor }}>
          {cls}
        </p>
      </figcaption>
    </figure>
  );
}
