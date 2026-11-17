"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_ESGOTO_PARAMS,
  clearEsgoto,
  gerarRedeEsgoto,
  laminaParaVazao,
  listEsgotoTrechos,
  type EsgotoParams,
} from "@/lib/rtk-validation/cad/loteamento-esgoto";
import type { CadPointEntity, CadPolylineEntity, CadProject } from "@/lib/rtk-validation/cad/types";

const num = (v: number | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const lerNum = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const STATUS: Record<string, { txt: string; cor: string }> = {
  ok: { txt: "OK", cor: "#15803d" },
  lamina: { txt: "Lâmina > 75%", cor: "#dc2626" },
  tensao: { txt: "Tensão < 1 Pa", cor: "#d97706" },
  profundidade: { txt: "Muito fundo", cor: "#b45309" },
};

const CAMPOS: Array<{ k: keyof EsgotoParams; rotulo: string; passo?: string }> = [
  { k: "habPorLote", rotulo: "Habitantes por lote" },
  { k: "perCapitaLhd", rotulo: "Consumo (L/hab·dia)" },
  { k: "coefRetorno", rotulo: "Coef. de retorno C" },
  { k: "k1", rotulo: "K1 (dia maior)" },
  { k: "k2", rotulo: "K2 (hora maior)" },
  { k: "infiltracaoLsKm", rotulo: "Infiltração (L/s·km)" },
  { k: "ocupacaoInicial", rotulo: "Ocupação inicial (0–1)" },
  { k: "diametroMinMm", rotulo: "DN mínimo (mm)" },
  { k: "recobrimentoMinM", rotulo: "Recobrimento mín. (m)" },
  { k: "distMaxPvM", rotulo: "Distância máx. PV (m)" },
  { k: "profundidadeMaxM", rotulo: "Profundidade máx. (m)" },
];

/** Painel lateral: parâmetros NBR 9649, gerar/remover a rede e resumo. */
export function CadEsgotoPanel({
  project,
  onProjectChange,
  onAbrirPlanilha,
}: {
  project: CadProject;
  onProjectChange: (p: CadProject) => void;
  onAbrirPlanilha: () => void;
}) {
  const [params, setParams] = useState<Record<string, string>>(() =>
    Object.fromEntries(CAMPOS.map((c) => [c.k, String(DEFAULT_ESGOTO_PARAMS[c.k]).replace(".", ",")])),
  );
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const trechos = listEsgotoTrechos(project);

  function gerar() {
    setErro(null);
    setAviso(null);
    const p: Partial<EsgotoParams> = {};
    for (const c of CAMPOS) {
      const n = lerNum(params[c.k] ?? "");
      if (n == null || n < 0) {
        setErro(`Valor inválido em “${c.rotulo}”.`);
        return;
      }
      (p as Record<string, number>)[c.k] = n;
    }
    try {
      const r = gerarRedeEsgoto(project, p);
      onProjectChange(r.project);
      setAviso(r.message);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gerar a rede.");
    }
  }

  const resumo = useMemo(() => {
    if (trechos.length === 0) return null;
    const ext = trechos.reduce((s, t) => s + (t.esgoto?.lengthM ?? 0), 0);
    const porDn = new Map<number, number>();
    for (const t of trechos) {
      const dn = t.esgoto?.diameterMm ?? 0;
      porDn.set(dn, (porDn.get(dn) ?? 0) + (t.esgoto?.lengthM ?? 0));
    }
    const fora = trechos.filter((t) => t.esgoto?.status !== "ok").length;
    const profMax = Math.max(...trechos.map((t) => Math.max(t.esgoto?.depthUpM ?? 0, t.esgoto?.depthDownM ?? 0)));
    return { ext, porDn: [...porDn.entries()].sort((a, b) => a[0] - b[0]), fora, profMax };
  }, [trechos]);

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-[#fed7aa] bg-[#fff7ed] px-3 py-2">
        <h4 className="text-xs font-semibold text-[#7c2d12]">Rede de esgoto (NBR 9649)</h4>
        <p className="mt-0.5 text-[10px] text-[#6b7280]">
          Coletor no eixo das ruas, PVs nos cruzamentos e a cada ≤ 80 m, ligação de cada lote e cálculo de vazão,
          diâmetro, declividade, lâmina e tensão trativa. Pré-dimensionamento: confira com as regras da concessionária.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {CAMPOS.map((c) => (
            <label key={c.k} className="block text-[10px] text-[#6b7280]">
              {c.rotulo}
              <input
                type="text"
                inputMode="decimal"
                value={params[c.k] ?? ""}
                onChange={(e) => setParams((prev) => ({ ...prev, [c.k]: e.target.value }))}
                className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={gerar}
          className="mt-2 w-full rounded-lg bg-[#9a3412] px-3 py-2 text-xs font-semibold text-white hover:bg-[#7c2d12]"
        >
          {trechos.length > 0 ? "Recalcular rede de esgoto" : "Gerar rede de esgoto"}
        </button>
        {erro ? <p className="mt-1 text-[11px] text-red-700">{erro}</p> : null}
        {aviso ? <p className="mt-1 text-[11px] text-emerald-800">{aviso}</p> : null}
      </div>
      {resumo ? (
        <div className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-[11px] text-[#374151]">
          <p className="font-semibold text-[#0f2848]">
            {trechos.length} trechos · {num(resumo.ext, 0)} m de rede
          </p>
          {resumo.porDn.map(([dn, l]) => (
            <p key={dn}>
              DN {dn}: {num(l, 0)} m
            </p>
          ))}
          <p>Profundidade máxima: {num(resumo.profMax)} m</p>
          <p className={resumo.fora > 0 ? "font-semibold text-amber-700" : "font-semibold text-emerald-700"}>
            {resumo.fora > 0 ? `${resumo.fora} trecho(s) fora do critério` : "Todos os trechos atendem a NBR 9649"}
          </p>
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={onAbrirPlanilha}
              className="flex-1 rounded-lg bg-[#0f2848] px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1e3a5f]"
            >
              Abrir planilha e perfil
            </button>
            <button
              type="button"
              onClick={() => {
                onProjectChange(clearEsgoto(project));
                setAviso("Rede de esgoto removida.");
              }}
              className="rounded-lg border border-red-300 px-2 py-1.5 text-[11px] font-medium text-red-700 hover:bg-red-50"
            >
              Remover
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Planilha de cálculo + perfil longitudinal do caminho até o lançamento. */
export function CadEsgotoPlanilha({
  project,
  selectedId,
  onSelectId,
}: {
  project: CadProject;
  selectedId: string | null;
  onSelectId: (id: string) => void;
}) {
  const trechos = listEsgotoTrechos(project);
  const nos = useMemo(
    () =>
      new Map(
        project.entities
          .filter((e): e is CadPointEntity => e.type === "point" && Boolean(e.esgoto))
          .map((e) => [e.id, e]),
      ),
    [project.entities],
  );
  const sel = trechos.find((t) => t.id === selectedId) ?? trechos[0] ?? null;
  // caminho do trecho escolhido até o lançamento
  const caminho = useMemo(() => {
    const out: CadPolylineEntity[] = [];
    let cur: CadPolylineEntity | null = sel;
    const vistos = new Set<string>();
    while (cur && !vistos.has(cur.id) && out.length < 200) {
      vistos.add(cur.id);
      out.push(cur);
      const to: string | undefined = cur.esgoto?.toId;
      cur = trechos.find((t) => t.esgoto?.fromId === to) ?? null;
    }
    return out;
  }, [sel, trechos]);

  if (trechos.length === 0) {
    return <p className="p-3 text-xs text-[#6b7280]">Gere a rede de esgoto no painel Infraestrutura → Esgoto.</p>;
  }

  const cab = ["Trecho", "Montante → Jusante", "L (m)", "Lotes", "Qi (L/s)", "Qf (L/s)", "DN", "i (%)", "y/D", "V (m/s)", "σ (Pa)", "Prof. mont.", "Prof. jus.", "Situação"];
  return (
    <div className="space-y-3 p-2">
      <PerfilEsgoto caminho={caminho} nos={nos} />
      <div className="overflow-auto rounded-lg border border-[#e5e7eb]">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 bg-[#fff7ed]">
            <tr>
              {cab.map((c) => (
                <th key={c} className="border-b border-[#fed7aa] px-2 py-1 text-left font-semibold text-[#7c2d12]">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trechos.map((t) => {
              const e = t.esgoto!;
              const st = STATUS[e.status ?? "ok"] ?? STATUS.ok!;
              const de = nos.get(e.fromId ?? "")?.esgoto?.code ?? "—";
              const para = nos.get(e.toId ?? "")?.esgoto?.code ?? "—";
              return (
                <tr
                  key={t.id}
                  onClick={() => onSelectId(t.id)}
                  className={`cursor-pointer ${t.id === sel?.id ? "bg-[#ffedd5]" : "hover:bg-[#f8fafc]"}`}
                >
                  <td className="px-2 py-1 font-semibold">{e.code}</td>
                  <td className="px-2 py-1">
                    {de} → {para}
                  </td>
                  <td className="px-2 py-1 font-mono">{num(e.lengthM, 1)}</td>
                  <td className="px-2 py-1 font-mono">{e.lotes ?? 0}</td>
                  <td className="px-2 py-1 font-mono">{num(e.qiLps)}</td>
                  <td className="px-2 py-1 font-mono">{num(e.qfLps)}</td>
                  <td className="px-2 py-1 font-mono">{e.diameterMm}</td>
                  <td className="px-2 py-1 font-mono">{num(e.slopePct, 3)}</td>
                  <td className="px-2 py-1 font-mono">{num(e.yOverD)}</td>
                  <td className="px-2 py-1 font-mono">{num(e.velocityMs)}</td>
                  <td className="px-2 py-1 font-mono">{num(e.tensaoPa)}</td>
                  <td className="px-2 py-1 font-mono">{num(e.depthUpM)}</td>
                  <td className="px-2 py-1 font-mono">{num(e.depthDownM)}</td>
                  <td className="px-2 py-1 font-semibold" style={{ color: st.cor }}>
                    {st.txt}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PerfilEsgoto({ caminho, nos }: { caminho: CadPolylineEntity[]; nos: Map<string, CadPointEntity> }) {
  if (caminho.length === 0) return null;
  const pts: Array<{ d: number; code: string; ground: number; inv: number }> = [];
  let acc = 0;
  const first = caminho[0]!.esgoto!;
  pts.push({ d: 0, code: nos.get(first.fromId ?? "")?.esgoto?.code ?? "", ground: nos.get(first.fromId ?? "")?.esgoto?.groundZ ?? 0, inv: first.invertInZ ?? 0 });
  for (const t of caminho) {
    const e = t.esgoto!;
    acc += e.lengthM ?? 0;
    const no = nos.get(e.toId ?? "");
    pts.push({ d: acc, code: no?.esgoto?.code ?? "", ground: no?.esgoto?.groundZ ?? 0, inv: e.invertOutZ ?? 0 });
  }
  const zs = [...pts.map((p) => p.ground), ...pts.map((p) => p.inv), ...caminho.map((t) => (t.esgoto?.invertInZ ?? 0) + (t.esgoto?.diameterMm ?? 150) / 1000)];
  const zMin = Math.min(...zs) - 0.5;
  const zMax = Math.max(...zs) + 0.8;
  const W = 760;
  const H = 230;
  const m = { l: 48, r: 14, t: 26, b: 22 };
  const X = (d: number) => m.l + ((W - m.l - m.r) * d) / Math.max(acc, 1e-6);
  const Y = (z: number) => m.t + (H - m.t - m.b) * (1 - (z - zMin) / (zMax - zMin));
  const inicios = caminho.map((_, i) => caminho.slice(0, i).reduce((s, t) => s + (t.esgoto?.lengthM ?? 0), 0));
  return (
    <figure className="rounded-lg border border-[#e5e7eb] bg-white p-2">
      <figcaption className="mb-1 text-[11px] font-semibold text-[#7c2d12]">
        Perfil longitudinal até o lançamento ({caminho.length} trecho{caminho.length > 1 ? "s" : ""}, {num(acc, 0)} m)
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const z = zMin + (zMax - zMin) * f;
          return (
            <g key={f}>
              <line x1={m.l} x2={W - m.r} y1={Y(z)} y2={Y(z)} stroke="#e2e8f0" strokeWidth={0.5} />
              <text x={m.l - 4} y={Y(z) + 3} fontSize={8} textAnchor="end" fill="#64748b">
                {z.toFixed(2)}
              </text>
            </g>
          );
        })}
        <polyline points={pts.map((p) => `${X(p.d)},${Y(p.ground)}`).join(" ")} fill="none" stroke="#8b5e34" strokeWidth={1.4} />
        {caminho.map((t, i) => {
          const e = t.esgoto!;
          const L = e.lengthM ?? 0;
          const D = (e.diameterMm ?? 150) / 1000;
          const x0 = X(inicios[i] ?? 0);
          const x1 = X((inicios[i] ?? 0) + L);
          const a = e.invertInZ ?? 0;
          const b = e.invertOutZ ?? 0;
          const s = laminaParaVazao(e.qfLps ?? 1.5, e.diameterMm ?? 150, (e.slopePct ?? 0.5) / 100, 0.013);
          const y = (s?.yOverD ?? 0) * D;
          return (
            <g key={t.id}>
              <polygon points={`${x0},${Y(a)} ${x1},${Y(b)} ${x1},${Y(b + D)} ${x0},${Y(a + D)}`} fill="#fff7ed" stroke="#9a3412" strokeWidth={0.9} />
              <polygon points={`${x0},${Y(a)} ${x1},${Y(b)} ${x1},${Y(b + y)} ${x0},${Y(a + y)}`} fill="#b45309" fillOpacity={0.45} />
              <text x={(x0 + x1) / 2} y={Y(Math.max(a, b) + D) - 5} fontSize={8} textAnchor="middle" fill="#7c2d12" stroke="#fff" strokeWidth={2.5} paintOrder="stroke">
                {`${e.code} DN${e.diameterMm} i=${num(e.slopePct, 2)}% y/D=${num(e.yOverD)}`}
              </text>
            </g>
          );
        })}
        {pts.map((p, i) => {
          const x = X(p.d);
          return (
            <g key={i}>
              <rect x={x - 4.5} y={Y(p.ground)} width={9} height={Math.max(4, Y(p.inv - 0.1) - Y(p.ground))} fill="#fff" stroke="#7c2d12" strokeWidth={1.2} />
              <line x1={x - 7} x2={x + 7} y1={Y(p.ground)} y2={Y(p.ground)} stroke="#7c2d12" strokeWidth={2.2} />
              <text x={x} y={Y(p.ground) - 6} fontSize={8} fontWeight={700} textAnchor="middle" fill="#7c2d12">
                {p.code}
              </text>
              <text x={x} y={Y(p.inv - 0.1) + 9} fontSize={7} textAnchor="middle" fill="#475569">
                {`CT ${p.ground.toFixed(2)} · CF ${p.inv.toFixed(2)}`}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
