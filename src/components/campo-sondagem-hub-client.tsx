"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CampoTipo } from "@/lib/campo-sondagem-tipo";
import { sugerirProximoCodigoComPrefixo } from "@/lib/campo-sondagem-tipo";
import { apiUrl } from "@/lib/api-url";

type ObraListItem = {
  id: number;
  nome: string;
  cliente: string;
  local: string;
};

type FuroRow = { id: number; codigo: string };

export type CampoSondagemHubConfig = {
  titulo: string;
  descricao: ReactNode;
  tipo: CampoTipo;
  /** Rota base do registo, ex. `/rotativa` → abre `/rotativa/123` */
  basePath: string;
  listaTitulo: string;
  novoRegistoTitulo: string;
  novoRegistoDica: string;
  placeholderNovo: string;
  /** Prefixo sugerido para novos códigos, ex. `SR`, `ST`, `PZ`. */
  codigoPrefixo: string;
  modoLocalHref: string;
  modoLocalTexto: string;
  /** Link opcional para visão geológica agregada por obra. */
  perfilGeologicoPath?: string;
  /** Mapa agregado de carga hidráulica (piezo / monitoramento). */
  mapaCargaHidraulicaPath?: string;
};

export function CampoSondagemHubClient({ config }: { config: CampoSondagemHubConfig }) {
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
  const [mutatingId, setMutatingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingCodigo, setEditingCodigo] = useState("");
  const [mensagem, setMensagem] = useState<string | null>(null);
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

  const carregarFuros = useCallback(
    async (oid: number) => {
      setErro(null);
      try {
        const r = await fetch(
          apiUrl(`/api/obra/${oid}/furos/${config.tipo}`),
        );
        const data = await r.json();
        if (!r.ok) {
          setFuros([]);
          return;
        }
        setFuros(Array.isArray(data) ? (data as FuroRow[]) : []);
      } catch {
        setFuros([]);
      }
    },
    [config.tipo],
  );

  useEffect(() => {
    if (obraId != null && Number.isFinite(obraId)) {
      void carregarFuros(obraId);
    } else {
      setFuros([]);
    }
  }, [obraId, carregarFuros]);

  useEffect(() => {
    if (obraId != null && Number.isFinite(obraId)) {
      setNovoCodigo(
        sugerirProximoCodigoComPrefixo(furos, config.codigoPrefixo),
      );
    }
  }, [furos, obraId, config.codigoPrefixo]);

  async function criarNovo() {
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
        body: JSON.stringify({
          codigo,
          obraId,
          tipo: config.tipo,
        }),
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
        router.push(`${config.basePath}/${data.id}`);
        return;
      }
      await carregarFuros(obraId);
    } catch {
      setErro("Falha de rede");
    } finally {
      setLoading(false);
    }
  }

  async function editarCodigoFuro(furo: FuroRow) {
    const codigo = editingCodigo.trim();
    if (!codigo) {
      setErro("O código não pode ficar vazio.");
      return;
    }

    setMutatingId(furo.id);
    setErro(null);
    try {
      const r = await fetch(apiUrl(`/api/furo/${furo.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setErro(typeof data.error === "string" ? data.error : "Erro ao editar furo");
        return;
      }
      if (obraId != null && Number.isFinite(obraId)) {
        await carregarFuros(obraId);
      }
      setEditingId(null);
      setEditingCodigo("");
      setMensagem(`Registo #${furo.id} atualizado para "${codigo}".`);
    } catch {
      setErro("Falha de rede ao editar.");
    } finally {
      setMutatingId(null);
    }
  }

  async function excluirFuro(furo: FuroRow) {
    const confirmar = window.confirm(
      `Apagar o registo "${furo.codigo}"? Esta ação não pode ser desfeita.`,
    );
    if (!confirmar) return;

    setMutatingId(furo.id);
    setErro(null);
    try {
      const r = await fetch(apiUrl(`/api/furo/${furo.id}`), {
        method: "DELETE",
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setErro(typeof data.error === "string" ? data.error : "Erro ao apagar furo");
        return;
      }
      if (obraId != null && Number.isFinite(obraId)) {
        await carregarFuros(obraId);
      }
      setMensagem(`Registo #${furo.id} apagado.`);
      if (editingId === furo.id) {
        setEditingId(null);
        setEditingCodigo("");
      }
    } catch {
      setErro("Falha de rede ao apagar.");
    } finally {
      setMutatingId(null);
    }
  }

  const obraNome = useMemo(
    () => obras.find((o) => o.id === obraId)?.nome,
    [obras, obraId],
  );

  return (
    <div className="mx-auto max-w-2xl p-6 text-[var(--text)]">
      <h1 className="mb-2 text-2xl font-bold">{config.titulo}</h1>
      <div className="mb-6 text-sm text-[var(--muted)]">{config.descricao}</div>

      <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <label className="block text-sm font-medium" htmlFor="campo-hub-obra">
          Obra (projeto)
        </label>
        <select
          id="campo-hub-obra"
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
            {config.perfilGeologicoPath && (
              <>
                {" · "}
                <Link
                  href={`${config.perfilGeologicoPath}?obraId=${obraId}`}
                  className="font-medium text-teal-600 hover:underline dark:text-teal-400"
                >
                  PERFIL geológico
                </Link>
              </>
            )}
            {config.mapaCargaHidraulicaPath && (
              <>
                {" · "}
                <Link
                  href={`${config.mapaCargaHidraulicaPath}?obraId=${obraId}`}
                  className="font-medium text-sky-700 hover:underline dark:text-sky-400"
                >
                  Mapa carga hidráulica
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      {obraId != null && Number.isFinite(obraId) && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {config.perfilGeologicoPath && (
              <Link
                href={`${config.perfilGeologicoPath}?obraId=${obraId}`}
                className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                Abrir PERFIL geológico
              </Link>
            )}
            {config.mapaCargaHidraulicaPath && (
              <Link
                href={`${config.mapaCargaHidraulicaPath}?obraId=${obraId}`}
                className="inline-flex items-center rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-800"
              >
                Mapa carga hidráulica
              </Link>
            )}
          </div>
          <h2 className="mb-2 text-lg font-semibold">{config.listaTitulo}</h2>
          {furos.length === 0 ? (
            <p className="mb-4 text-sm text-[var(--muted)]">
              Ainda não há registos deste tipo nesta obra. Crie o primeiro
              abaixo.
            </p>
          ) : (
            <ul className="mb-4 space-y-2">
              {furos.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"
                >
                  <span className="font-medium">
                    #{f.id} · {f.codigo}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`${config.basePath}/${f.id}`}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      Abrir
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setErro(null);
                        setMensagem(null);
                        setEditingId(f.id);
                        setEditingCodigo(f.codigo);
                      }}
                      disabled={mutatingId === f.id}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold hover:bg-black/[0.04] disabled:opacity-50 dark:hover:bg-white/[0.06]"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void excluirFuro(f)}
                      disabled={mutatingId === f.id}
                      className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
                    >
                      Apagar
                    </button>
                  </div>
                  {editingId === f.id && (
                    <div className="mt-2 flex w-full flex-wrap gap-2">
                      <input
                        value={editingCodigo}
                        onChange={(e) => setEditingCodigo(e.target.value)}
                        className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
                        placeholder="Novo código"
                      />
                      <button
                        type="button"
                        onClick={() => void editarCodigoFuro(f)}
                        disabled={mutatingId === f.id}
                        className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditingCodigo("");
                        }}
                        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="mb-2 text-sm font-semibold">
              {config.novoRegistoTitulo}
            </h3>
            <p className="mb-3 text-xs text-[var(--muted)]">
              {config.novoRegistoDica}
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={novoCodigo}
                onChange={(e) => setNovoCodigo(e.target.value)}
                placeholder={config.placeholderNovo}
                className="min-w-[8rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => void criarNovo()}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {loading ? "A criar…" : "Criar e abrir"}
              </button>
            </div>
            {erro && (
              <p
                className="mt-2 text-sm text-red-600 dark:text-red-400"
                role="alert"
              >
                {erro}
              </p>
            )}
            {mensagem && (
              <p
                className="mt-2 text-sm text-emerald-700 dark:text-emerald-300"
                role="status"
              >
                {mensagem}
              </p>
            )}
          </div>
        </>
      )}

      <p className="mt-10 border-t border-[var(--border)] pt-6 text-sm text-[var(--muted)]">
        <Link
          href={config.modoLocalHref}
          className="font-medium text-teal-600 hover:underline dark:text-teal-400"
        >
          {config.modoLocalTexto}
        </Link>
        — ensaio rápido sem gravar na obra até exportar PDF; para vários registos
        na mesma obra, escolha a obra acima.
      </p>
    </div>
  );
}
