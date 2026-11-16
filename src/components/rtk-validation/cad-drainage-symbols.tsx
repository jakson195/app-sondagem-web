"use client";

import type { CadViewport } from "@/lib/rtk-validation/cad/viewport";
import { isDrainageInletEntity, isDrainagePipeEntity } from "@/lib/rtk-validation/cad/loteamento-drainage";
import type { CadEntity, CadPointEntity, CadPolylineEntity, CadProject } from "@/lib/rtk-validation/cad/types";

/**
 * Símbolos de planta da drenagem (padrão de projeto):
 * - tubo do coletor em linha dupla, espessura proporcional ao diâmetro, com setas de sentido do escoamento;
 * - ramal da boca de lobo tracejado e fino;
 * - PV como círculo com tampa (círculo interno);
 * - boca de lobo como retângulo com grelha, alinhado ao meio-fio;
 * - lançamento final (emissário) em vermelho, com seta.
 */
export const DRENAGEM_CORES = {
  tuboBorda: "#0b3a6e",
  tuboMiolo: "#7cc4f5",
  ramal: "#0284c7",
  pv: "#0b3a6e",
  pvTampa: "#1d6fb8",
  boca: "#0b3a6e",
  erro: "#dc2626",
  emissario: "#b91c1c",
} as const;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function pixelsPorMetro(viewport: CadViewport): number {
  const innerW = viewport.width - viewport.padding * 2;
  const span = viewport.maxX - viewport.minX;
  return span > 1e-9 ? innerW / span : 1;
}

export function isRamalDrenagem(pipe: CadPolylineEntity, inletIds: Set<string>): boolean {
  if (pipe.drainage?.pipeRole === "ramal") return true;
  return inletIds.has(pipe.drainage?.fromPvId ?? "") || inletIds.has(pipe.drainage?.toPvId ?? "");
}

/** Para cada boca de lobo: ângulo (rad, no mundo) do meio-fio = direção do trecho de coletor mais próximo. */
export function angulosDasBocas(project: CadProject): { angulos: Map<string, number>; inletIds: Set<string> } {
  const inlets = project.entities.filter((e): e is CadPointEntity => isDrainageInletEntity(e));
  const inletIds = new Set(inlets.map((e) => e.id));
  const segs: { ax: number; ay: number; bx: number; by: number }[] = [];
  const ramais: CadPolylineEntity[] = [];
  for (const e of project.entities) {
    if (!isDrainagePipeEntity(e)) continue;
    if (isRamalDrenagem(e, inletIds)) {
      ramais.push(e);
      continue;
    }
    for (let i = 0; i + 1 < e.vertices.length; i++) {
      const a = e.vertices[i]!;
      const b = e.vertices[i + 1]!;
      segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
    }
  }
  const angulos = new Map<string, number>();
  for (const p of inlets) {
    let melhor: { d: number; ang: number } | null = null;
    for (const s of segs) {
      const dx = s.bx - s.ax;
      const dy = s.by - s.ay;
      const l2 = dx * dx + dy * dy;
      if (l2 < 1e-9) continue;
      const t = Math.max(0, Math.min(1, ((p.x - s.ax) * dx + (p.y - s.ay) * dy) / l2));
      const d = Math.hypot(p.x - (s.ax + t * dx), p.y - (s.ay + t * dy));
      if (!melhor || d < melhor.d) melhor = { d, ang: Math.atan2(dy, dx) };
    }
    if (melhor && melhor.d < 40) {
      angulos.set(p.id, melhor.ang);
      continue;
    }
    // sem coletor perto: perpendicular ao próprio ramal
    const r = ramais.find((e) => e.drainage?.fromPvId === p.id || e.drainage?.toPvId === p.id);
    if (r && r.vertices.length >= 2) {
      const v0 = r.vertices[0]!;
      const v1 = r.vertices[r.vertices.length - 1]!;
      angulos.set(p.id, Math.atan2(v1.y - v0.y, v1.x - v0.x) + Math.PI / 2);
    }
  }
  return { angulos, inletIds };
}

export function DrenagemNoSimbolo({
  entity,
  sx,
  sy,
  pxPorM,
  anguloMundo,
  destaque,
  corDestaque,
}: {
  entity: CadPointEntity;
  sx: number;
  sy: number;
  pxPorM: number;
  anguloMundo?: number;
  destaque: boolean;
  corDestaque: string;
}) {
  const kind = entity.drainage?.kind ?? (isDrainageInletEntity(entity) ? "inlet" : "pv");
  const tap = entity.drainage?.tap === true;
  const borda = destaque ? corDestaque : undefined;
  if (kind === "inlet") {
    // boca de lobo ~1,0 × 0,45 m (exagerada quando o zoom é pequeno)
    const w = clamp(pxPorM * 1.4, 10, 22);
    const h = w * 0.46;
    const rot = anguloMundo != null ? (-anguloMundo * 180) / Math.PI : 0;
    const barras = [-0.25, 0, 0.25];
    return (
      <g transform={`translate(${sx} ${sy}) rotate(${rot})`}>
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={1} fill="#ffffff" stroke={borda ?? DRENAGEM_CORES.boca} strokeWidth={destaque ? 2.4 : 1.6} />
        {barras.map((f) => (
          <line key={f} x1={f * w} y1={-h / 2 + 1.5} x2={f * w} y2={h / 2 - 1.5} stroke={DRENAGEM_CORES.pvTampa} strokeWidth={1.2} />
        ))}
      </g>
    );
  }
  if (kind === "outfall") {
    const r = clamp(pxPorM * 0.9, 6, 12);
    return (
      <g>
        <circle cx={sx} cy={sy} r={r} fill="#fff" stroke={borda ?? DRENAGEM_CORES.emissario} strokeWidth={destaque ? 3 : 2.2} />
        <path d={`M ${sx - r * 0.45} ${sy - r * 0.5} L ${sx + r * 0.55} ${sy} L ${sx - r * 0.45} ${sy + r * 0.5} Z`} fill={DRENAGEM_CORES.emissario} />
      </g>
    );
  }
  if (tap) {
    // junção do ramal no coletor (T)
    const r = clamp(pxPorM * 0.35, 2.5, 5);
    return <circle cx={sx} cy={sy} r={r} fill={DRENAGEM_CORES.pv} stroke={borda ?? "#fff"} strokeWidth={destaque ? 2 : 1} />;
  }
  // PV: diâmetro ~1,2 m
  const r = clamp(pxPorM * 0.7, 5.5, 13);
  return (
    <g>
      <circle cx={sx} cy={sy} r={r} fill="#ffffff" stroke={borda ?? DRENAGEM_CORES.pv} strokeWidth={destaque ? 3 : 2} />
      <circle cx={sx} cy={sy} r={r * 0.48} fill={DRENAGEM_CORES.pvTampa} />
    </g>
  );
}

export function DrenagemTuboSimbolo({
  pontos,
  pxPorM,
  diametroMm,
  ramal,
  falha,
  destaque,
  corDestaque,
}: {
  pontos: { sx: number; sy: number }[];
  pxPorM: number;
  diametroMm?: number;
  ramal: boolean;
  falha: boolean;
  destaque: boolean;
  corDestaque: string;
}) {
  const pts = pontos.map((p) => `${p.sx},${p.sy}`).join(" ");
  if (ramal) {
    return (
      <polyline
        points={pts}
        fill="none"
        stroke={destaque ? corDestaque : falha ? DRENAGEM_CORES.erro : DRENAGEM_CORES.ramal}
        strokeWidth={destaque ? 2.6 : 1.6}
        strokeDasharray="5 3"
        strokeLinecap="round"
      />
    );
  }
  const dM = (diametroMm ?? 400) / 1000;
  // exagero de 3× para o tubo aparecer na planta, sempre entre 3 e 12 px
  const largura = clamp(dM * pxPorM * 3, 3.2, 12);
  const borda = destaque ? corDestaque : falha ? DRENAGEM_CORES.erro : DRENAGEM_CORES.tuboBorda;
  const setas: { x: number; y: number; ang: number }[] = [];
  for (let i = 0; i + 1 < pontos.length; i++) {
    const a = pontos[i]!;
    const b = pontos[i + 1]!;
    const len = Math.hypot(b.sx - a.sx, b.sy - a.sy);
    if (len < 46) continue;
    const n = Math.min(3, Math.max(1, Math.floor(len / 160)));
    for (let k = 1; k <= n; k++) {
      const f = k / (n + 1);
      setas.push({ x: a.sx + (b.sx - a.sx) * f, y: a.sy + (b.sy - a.sy) * f, ang: (Math.atan2(b.sy - a.sy, b.sx - a.sx) * 180) / Math.PI });
    }
  }
  const s = clamp(largura * 0.9, 4, 8);
  return (
    <g>
      <polyline points={pts} fill="none" stroke={borda} strokeWidth={largura} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={pts} fill="none" stroke={falha ? "#fca5a5" : DRENAGEM_CORES.tuboMiolo} strokeWidth={Math.max(1.2, largura - 2.4)} strokeLinecap="round" strokeLinejoin="round" />
      {setas.map((p, i) => (
        <path
          key={i}
          transform={`translate(${p.x} ${p.y}) rotate(${p.ang})`}
          d={`M ${-s * 0.6} ${-s * 0.7} L ${s * 0.6} 0 L ${-s * 0.6} ${s * 0.7}`}
          fill="none"
          stroke={borda}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}

export function isTuboDrenagem(entity: CadEntity): entity is CadPolylineEntity {
  return isDrainagePipeEntity(entity);
}
