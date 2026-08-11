"use client";

import type { AnalysisResult, SlipCircle } from "./stability-engine";
import { classifyFS } from "./stability-engine";

type Geo5ResultsPanelProps = {
  results: Record<string, AnalysisResult>;
  circle: SlipCircle;
  activeMethod: string;
  onSelectMethod?: (key: string) => void;
};

export function Geo5ResultsSummary({
  results,
  circle,
  activeMethod,
}: Geo5ResultsPanelProps) {
  const primary = results[activeMethod] ?? Object.values(results)[0];
  if (!primary) return null;

  const cls = classifyFS(primary.fs);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 p-3 bg-[#eceae4] border-b border-[#c8c4bc]">
      <div className="md:col-span-1 rounded border-2 bg-white p-3 text-center" style={{ borderColor: cls.color }}>
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#666]">Fator de Segurança</div>
        <div className="text-3xl font-bold tabular-nums" style={{ color: cls.color }}>
          {primary.fs.toFixed(3)}
        </div>
        <div className="text-xs font-semibold mt-1" style={{ color: cls.color }}>{cls.label}</div>
        <div className="text-[10px] text-[#666] mt-1">{primary.method}</div>
      </div>

      <div className="md:col-span-1 rounded border border-[#c8c4bc] bg-white p-3 text-[11px]">
        <div className="font-bold text-[#333] mb-2 uppercase text-[10px] tracking-wide">Superfície crítica</div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[#444]">
          <span className="text-[#777]">Centro X</span><span className="font-mono text-right">{circle.cx.toFixed(2)} m</span>
          <span className="text-[#777]">Centro Y</span><span className="font-mono text-right">{circle.cy.toFixed(2)} m</span>
          <span className="text-[#777]">Raio R</span><span className="font-mono text-right">{circle.r.toFixed(2)} m</span>
          <span className="text-[#777]">Fatias</span><span className="font-mono text-right">{primary.slices.length}</span>
        </div>
      </div>

      <div className="md:col-span-2 rounded border border-[#c8c4bc] bg-white p-2 overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="bg-[#f5f3ed] text-[#555] uppercase tracking-wide">
              <th className="text-left px-2 py-1">Método</th>
              <th className="text-right px-2 py-1">Fs</th>
              <th className="text-left px-2 py-1">Estado</th>
              <th className="text-right px-2 py-1">Iter.</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(results).map(([key, res]) => {
              const c = classifyFS(res.fs);
              return (
                <tr key={key} className="border-t border-[#ebe8e0]">
                  <td className="px-2 py-1 font-medium text-[#222]">{res.method}</td>
                  <td className="px-2 py-1 text-right font-mono font-bold" style={{ color: c.color }}>{res.fs.toFixed(3)}</td>
                  <td className="px-2 py-1" style={{ color: c.color }}>{c.label}</td>
                  <td className="px-2 py-1 text-right text-[#666]">{res.iterations}{res.converged ? "" : " *"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Geo5SliceTable({ result }: { result: AnalysisResult | null }) {
  if (!result || result.slices.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-[#777] bg-[#f5f3ed]">
        Execute a análise para ver a tabela de fatias (estilo GEO5).
      </div>
    );
  }

  return (
    <div className="overflow-auto max-h-48 bg-white border-t border-[#c8c4bc]">
      <table className="w-full text-[10px] border-collapse">
        <thead className="sticky top-0 bg-[#dfe6ef] text-[#334155]">
          <tr>
            <th className="border border-[#c8c4bc] px-2 py-1">Fatia</th>
            <th className="border border-[#c8c4bc] px-2 py-1">b (m)</th>
            <th className="border border-[#c8c4bc] px-2 py-1">h (m)</th>
            <th className="border border-[#c8c4bc] px-2 py-1">α (°)</th>
            <th className="border border-[#c8c4bc] px-2 py-1">W (kN/m)</th>
            <th className="border border-[#c8c4bc] px-2 py-1">c (kPa)</th>
            <th className="border border-[#c8c4bc] px-2 py-1">φ (°)</th>
            <th className="border border-[#c8c4bc] px-2 py-1">u (kPa)</th>
            <th className="border border-[#c8c4bc] px-2 py-1">Camada</th>
          </tr>
        </thead>
        <tbody>
          {result.slices.map((s, i) => {
            const W = s.gamma * s.b * s.h;
            return (
              <tr key={i} className={i % 2 === 0 ? "bg-[#faf9f6]" : "bg-white"}>
                <td className="border border-[#e5e2da] px-2 py-0.5 text-center font-semibold">{i + 1}</td>
                <td className="border border-[#e5e2da] px-2 py-0.5 text-right font-mono">{s.b.toFixed(2)}</td>
                <td className="border border-[#e5e2da] px-2 py-0.5 text-right font-mono">{s.h.toFixed(2)}</td>
                <td className="border border-[#e5e2da] px-2 py-0.5 text-right font-mono">{(s.alpha * 180 / Math.PI).toFixed(1)}</td>
                <td className="border border-[#e5e2da] px-2 py-0.5 text-right font-mono">{W.toFixed(1)}</td>
                <td className="border border-[#e5e2da] px-2 py-0.5 text-right font-mono">{s.c.toFixed(1)}</td>
                <td className="border border-[#e5e2da] px-2 py-0.5 text-right font-mono">{(s.phi * 180 / Math.PI).toFixed(1)}</td>
                <td className="border border-[#e5e2da] px-2 py-0.5 text-right font-mono">{s.u.toFixed(1)}</td>
                <td className="border border-[#e5e2da] px-2 py-0.5">{s.layer}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Geo5NormativePanel({ fs }: { fs: number }) {
  const rows = [
    { label: "Obras definitivas (NBR 11682)", min: 1.5 },
    { label: "Obras temporárias", min: 1.3 },
    { label: "Limite crítico", min: 1.1 },
  ];

  return (
    <div className="rounded border border-[#c8c4bc] bg-white p-2 mt-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-[#555] mb-1.5">Verificação normativa</div>
      {rows.map(({ label, min }) => {
        const ok = fs >= min;
        return (
          <div key={label} className="flex items-center justify-between py-0.5 text-[10px]">
            <span className="text-[#555]">{label} ≥ {min.toFixed(1)}</span>
            <span className={`font-bold ${ok ? "text-emerald-700" : "text-red-600"}`}>
              {ok ? "SATISFAZ" : "NÃO SATISFAZ"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
