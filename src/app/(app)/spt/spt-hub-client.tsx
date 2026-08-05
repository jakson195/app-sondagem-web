"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/api-url";

type ObraListItem = {
  id: number;
  nome: string;
  cliente: string;
  local: string;
};

type FuroRow = { id: number; codigo: string };

/** Sugere o próximo nome tipo "SPT 02" a partir dos furos existentes. */
export function sugerirProximoCodigoSpt(furos: FuroRow[]): string {
  let max = 0;
  for (const f of furos) {
    const m = f.codigo.trim().match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const next = max > 0 ? max + 1 : furos.length > 0 ? furos.length + 1 : 1;
  return `SPT ${String(next).padStart(2, "0")}`;
}

export function SptHubClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const obraIdParam = searchParams?.get("obraId");
  const initialObraId =
    obraIdParam !== null && obraIdParam !== ""
      ? Number(obraIdParam)
      : NaN;

  const [obras, setObras] = useState<ObraListItem[]>([]);
  const [obraId, setObraId] = useState<number | null>(
    Number.isFinite(initialObraId) ? initialObraId : null,
  );
  const [furos, setFuros] = useState<FuroRow[]>([]);
  const [novoCodigo, setNovoCodigo] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(apiUrl("/api/obra"), { credentials: "include" });
        const data = await r.json();
        if (cancelled || !r.ok) return;
        if (Array.isArray(data)) setObras(data as ObraListItem[]);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const carregarFuros = useCallback(async (oid: number) => {
    setErro(null);
    try {
      const r = await fetch(apiUrl(`/api/obra/${oid}/furos/spt`));
      const data = await r.json();
      if (!r.ok) {
        setFuros([]);
        return;
      }
      setFuros(Array.isArray(data) ? (data as FuroRow[]) : []);
    } catch {
      setFuros([]);
    }
  }, []);

  useEffect(() => {
    if (obraId != null && Number.isFinite(obraId)) {
      void carregarFuros(obraId);
    } else {
      setFuros([]);
    }
  }, [obraId, carregarFuros]);

  useEffect(() => {
    if (obraId != null && Number.isFinite(obraId)) {
      setNovoCodigo(sugerirProximoCodigoSpt(furos));
    }
  }, [furos, obraId]);

  async function criarNovoSpt() {
    if (obraId == null || !Number.isFinite(obraId)) return;
    const codigo = novoCodigo.trim();
    if (!codigo) {
      setErro("Indique um nome para o novo registo.");
      return;
    }
    setLoading(true);
    setErro(null);
    try {
      const r = await fetch(apiUrl("/api/furo"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, obraId, tipo: "spt" }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        error?: string;
        id?: number;
      };
      if (!r.ok) {
        setErro(
          typeof data.error === "string" ? data.error : "Erro ao criar furo",
        );
        setLoading(false);
        return;
      }
      if (typeof data.id === "number") {
        router.push(`/spt/${data.id}`);
        return;
      }
      await carregarFuros(obraId);
    } catch {
      setErro("Falha de rede");
    } finally {
      setLoading(false);
    }
  }

  const obraNome = useMemo(
    () => obras.find((o) => o.id === obraId)?.nome,
    [obras, obraId],
  );

  return (
    <div className="mx-auto max-w-2xl p-6 text-[var(--text)]">
      <h1 className="mb-2 text-2xl font-bold">Sondagem SPT</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Cada registo (<strong className="text-[var(--text)]">SPT 01</strong>,{" "}
        <strong className="text-[var(--text)]">SPT 02</strong>, …) é um{" "}
        <strong className="text-[var(--text)]">furo</strong> na obra. Os metros
        de ensaio ficam guardados na base de dados: pode fechar o browser e
        voltar a <strong className="text-[var(--text)]">Abrir / editar</strong>{" "}
        quando quiser.
      </p>

      <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <label className="block text-sm font-medium" htmlFor="spt-hub-obra">
          Obra (projeto)
        </label>
        <select
          id="spt-hub-obra"
          value={obraId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            setObraId(v === "" ? null : Number(v));
          }}
          className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-sm"
        >
          <option value="">— Escolher obra —</option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome} — {o.cliente}
            </option>
          ))}
        </select>
        {obraId != null && Number.isFinite(obraId) && (
          <p className="mt-2 text-sm text-[var(--muted)]">
            Obra: <span className="text-[var(--text)]">{obraNome}</span>
            {" · "}
            <Link
              href={`/obra/${obraId}`}
              className="font-medium text-teal-600 hover:underline dark:text-teal-400"
            >
              Mapa, GPS e lista de furos
            </Link>
          </p>
        )}
      </div>

      {obraId != null && Number.isFinite(obraId) && (
        <>
          <h2 className="mb-2 text-lg font-semibold">Registos SPT desta obra</h2>
          {furos.length === 0 ? (
            <p className="mb-4 text-sm text-[var(--muted)]">
              Ainda não há furos. Crie o primeiro abaixo (ex.: SPT 01).
            </p>
          ) : (
            <ul className="mb-4 space-y-2">
              {furos.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"
                >
                  <span className="font-medium">{f.codigo}</span>
                  <Link
                    href={`/spt/${f.id}`}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Abrir / editar
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="mb-2 text-sm font-semibold">Novo registo SPT</h3>
            <p className="mb-3 text-xs text-[var(--muted)]">
              Nome sugerido automaticamente; pode alterar antes de criar.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={novoCodigo}
                onChange={(e) => setNovoCodigo(e.target.value)}
                placeholder="ex.: SPT 02"
                className="min-w-[8rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => void criarNovoSpt()}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {loading ? "A criar…" : "Criar e abrir"}
              </button>
            </div>
            {erro && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
                {erro}
              </p>
            )}
          </div>
        </>
      )}

      <p className="mt-10 border-t border-[var(--border)] pt-6 text-sm text-[var(--muted)]">
        <Link
          href="/spt/local"
          className="font-medium text-teal-600 hover:underline dark:text-teal-400"
        >
          Modo local (sem obra)
        </Link>
        — ensaio rápido; os metros não são guardados no servidor até criar um furo
        numa obra.
      </p>
    </div>
  );
}
