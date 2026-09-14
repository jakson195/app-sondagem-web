"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatBRL, formatPct } from "@/lib/viabilidade/format";
import { TITULO_ESTUDO } from "@/lib/viabilidade/types";

type Row = {
  id: string;
  projetoId: string;
  versao: number;
  uf: string;
  municipio: string | null;
  competenciaSinapi: string | null;
  quantidadeLotes: number | null;
  custoTotal: string;
  receitaEstimada: string | null;
  lucroEstimado: string;
  margemPercentual: string;
  updatedAt: string;
};

export default function ViabilidadeIndexPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/viabilidade", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível carregar os estudos.");
        return;
      }
      setRows(data.estudos ?? []);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--text)]">{TITULO_ESTUDO}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Gere o estudo a partir de um loteamento no Ambiente CAD. Os valores não são orçamento executivo.
        </p>
      </header>
      <Link
        href="/cad"
        className="inline-flex rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600"
      >
        Abrir Ambiente CAD
      </Link>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--surface)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Projeto</th>
              <th className="px-3 py-2">Versão</th>
              <th className="px-3 py-2">UF</th>
              <th className="px-3 py-2">Lotes</th>
              <th className="px-3 py-2">Investimento</th>
              <th className="px-3 py-2">Receita</th>
              <th className="px-3 py-2">Margem</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 font-mono text-xs">{row.projetoId.slice(-8)}</td>
                <td className="px-3 py-2">v{row.versao}</td>
                <td className="px-3 py-2">{row.uf}</td>
                <td className="px-3 py-2">{row.quantidadeLotes ?? "—"}</td>
                <td className="px-3 py-2">{formatBRL(row.custoTotal)}</td>
                <td className="px-3 py-2">{formatBRL(row.receitaEstimada)}</td>
                <td className="px-3 py-2">{formatPct(row.margemPercentual)}</td>
                <td className="px-3 py-2">
                  <Link href={`/viabilidade/${row.projetoId}`} className="text-teal-700 underline">
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !error ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[var(--muted)]">
                  Nenhum estudo salvo. Gere o loteamento no CAD e clique em ESTUDO DE VIABILIDADE.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
