"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Building2, Filter, FolderKanban, PanelLeft, Search } from "lucide-react";
import { apiUrl } from "@/lib/api-url";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";
import { useObraModulos } from "@/components/obra-context";
import { OBRA_STATUS_LABEL, OBRA_STATUS_ORDER } from "@/lib/obra-status";
import type { ObraStatus } from "@prisma/client";

type EmpresaOpt = { id: number; nome: string };

type ObraListItem = {
  id: number;
  nome: string;
  cliente: string;
  local: string;
  description?: string | null;
  status: ObraStatus;
  companyId: number;
  empresaId: number;
  company?: { id: number; name: string };
};

export default function ObrasPage() {
  const { selectedObraId, setObraContext } = useObraModulos();
  const [obras, setObras] = useState<ObraListItem[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOpt[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingNome, setEditingNome] = useState("");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [filterReady, setFilterReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 380);
    return () => clearTimeout(t);
  }, [qInput]);

  const carregarEmpresas = useCallback(async () => {
    try {
      const [empresasRes, meRes] = await Promise.all([
        fetch(apiUrl("/api/empresas"), { credentials: "include" }),
        fetch(apiUrl("/api/auth/me"), { credentials: "include" }),
      ]);
      const data = await empresasRes.json();
      const meJson = (await meRes.json().catch(() => ({}))) as {
        activeCompany?: { companyId: number; companyName?: string } | null;
        user?: { systemRole?: string };
      };
      if (meRes.ok && meJson.user?.systemRole) {
        setIsPlatformAdmin(isPlatformSuperAdmin(meJson.user.systemRole as "USER"));
      }
      if (empresasRes.ok && Array.isArray(data)) {
        setEmpresas(data as EmpresaOpt[]);
      }
      const activeId = meJson.activeCompany?.companyId ?? null;
      setActiveCompanyId(activeId);
      if (activeId) {
        setCompanyFilter(String(activeId));
      }
      setFilterReady(true);
    } catch {
      setFilterReady(true);
    }
  }, []);

  const carregarObras = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (companyFilter) {
        params.set("companyId", companyFilter);
      } else if (isPlatformAdmin) {
        params.set("all", "1");
      }
      if (statusFilter) params.set("status", statusFilter);
      const qs = params.toString();
      const r = await fetch(apiUrl(`/api/obra${qs ? `?${qs}` : ""}`), {
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) {
        setErro(
          typeof data.error === "string" ? data.error : "Erro ao carregar obras",
        );
        setObras([]);
        return;
      }
      if (Array.isArray(data)) {
        setObras(data as ObraListItem[]);
      }
    } catch {
      setErro("Falha de rede");
      setObras([]);
    } finally {
      setLoading(false);
    }
  }, [q, companyFilter, statusFilter, isPlatformAdmin]);

  useEffect(() => {
    void carregarEmpresas();
  }, [carregarEmpresas]);

  useEffect(() => {
    if (!filterReady) return;
    void carregarObras();
  }, [carregarObras, filterReady]);

  async function guardarNomeObra(id: number) {
    const nome = editingNome.trim();
    if (!nome) {
      setErro("O nome da obra não pode ficar vazio.");
      return;
    }

    setMutatingId(id);
    setErro(null);
    setMensagem(null);
    try {
      const r = await fetch(apiUrl(`/api/obra/${id}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setErro(typeof data.error === "string" ? data.error : "Erro ao editar obra");
        return;
      }
      setObras((prev) => prev.map((o) => (o.id === id ? { ...o, nome } : o)));
      setEditingId(null);
      setEditingNome("");
      setMensagem(`Obra #${id} atualizada.`);
    } catch {
      setErro("Falha de rede ao editar obra.");
    } finally {
      setMutatingId(null);
    }
  }

  async function excluirObra(o: ObraListItem) {
    const ok = window.confirm(
      `Excluir a obra «${o.nome}»? Os furos e dados associados serão removidos.`,
    );
    if (!ok) return;

    setMutatingId(o.id);
    setErro(null);
    setMensagem(null);
    try {
      const r = await fetch(apiUrl(`/api/obra/${o.id}`), {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setErro(typeof data.error === "string" ? data.error : "Erro ao excluir obra");
        return;
      }
      setObras((prev) => prev.filter((obra) => obra.id !== o.id));
      if (selectedObraId === o.id) {
        setObraContext(null);
      }
      if (editingId === o.id) {
        setEditingId(null);
        setEditingNome("");
      }
      setMensagem(`Obra «${o.nome}» eliminada.`);
    } catch {
      setErro("Falha de rede ao excluir obra.");
    } finally {
      setMutatingId(null);
    }
  }

  function limparFiltros() {
    setQInput("");
    setQ("");
    setCompanyFilter(activeCompanyId ? String(activeCompanyId) : "");
    setStatusFilter("");
  }

  return (
    <div className="mx-auto max-w-5xl text-[var(--text)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
            <FolderKanban className="h-8 w-8 text-teal-600" />
            Obras
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
            {isPlatformAdmin
              ? "Projetos de campo por empresa. Filtre por organização, estado ou texto."
              : "Os seus projetos de campo. Filtre por estado ou texto."}
          </p>
        </div>
        <Link
          href="/obra"
          className="inline-flex items-center justify-center rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-teal-500"
        >
          + Nova obra
        </Link>
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--muted)]">
          <Filter className="h-4 w-4" />
          Filtros
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label htmlFor="obras-q" className="text-xs font-medium text-[var(--muted)]">
              Pesquisa
            </label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <input
                id="obras-q"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Nome, cliente, local, descrição…"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-10 pr-3 text-sm"
              />
            </div>
          </div>
          {isPlatformAdmin && (
          <div className="w-full sm:w-52">
            <label className="text-xs font-medium text-[var(--muted)]">Empresa</label>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
            >
              <option value="">Todas as empresas</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>
          )}
          <div className="w-full sm:w-44">
            <label className="text-xs font-medium text-[var(--muted)]">Estado</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
            >
              <option value="">Todos</option>
              {OBRA_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {OBRA_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => limparFiltros()}
            className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--surface)]"
          >
            Limpar
          </button>
        </div>
      </div>

      {erro && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {erro}
        </p>
      )}
      {mensagem && (
        <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-300" role="status">
          {mensagem}
        </p>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-sm text-[var(--muted)]">A carregar…</p>
        ) : obras.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--muted)]">
            Nenhuma obra com estes filtros.{" "}
            <Link href="/obra" className="font-medium text-teal-600 hover:underline">
              Criar obra
            </Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--surface)] text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">Obra</th>
                  <th className="hidden px-4 py-3 md:table-cell">Empresa</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Cliente</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {obras.map((o) => (
                  <tr key={o.id} className="hover:bg-[var(--surface)]/60">
                    <td className="px-4 py-3">
                      <span className="font-medium text-[var(--text)]">{o.nome}</span>
                      <p className="text-xs text-[var(--muted)] line-clamp-1">{o.local}</p>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className="inline-flex items-center gap-1 text-[var(--text)]">
                        <Building2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        {o.company?.name ?? `Empresa #${o.companyId}`}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell text-[var(--muted)]">
                      {o.cliente}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs font-medium text-[var(--muted)]">
                        {OBRA_STATUS_LABEL[o.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Link
                          href={`/obra/${o.id}`}
                          className="rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-500"
                        >
                          Mapa
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setErro(null);
                            setMensagem(null);
                            setObraContext(o.id);
                            setMensagem(
                              `Menu lateral filtrado pela obra «${o.nome}».`,
                            );
                          }}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                            selectedObraId === o.id
                              ? "bg-violet-600 text-white hover:bg-violet-500"
                              : "border border-violet-400/60 text-violet-800 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-200 dark:hover:bg-violet-950/50"
                          }`}
                          title="Usar esta obra no menu lateral (módulos ativos)"
                        >
                          <PanelLeft className="h-3.5 w-3.5 shrink-0" />
                          Menu
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setErro(null);
                            setMensagem(null);
                            setEditingId(o.id);
                            setEditingNome(o.nome);
                          }}
                          disabled={mutatingId === o.id}
                          className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--surface)] disabled:opacity-50"
                        >
                          Renomear
                        </button>
                        <button
                          type="button"
                          onClick={() => void excluirObra(o)}
                          disabled={mutatingId === o.id}
                          className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                        >
                          Excluir
                        </button>
                      </div>
                      {editingId === o.id && (
                        <div className="mt-2 flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-2">
                          <input
                            value={editingNome}
                            onChange={(e) => setEditingNome(e.target.value)}
                            className="min-w-[8rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => void guardarNomeObra(o.id)}
                            disabled={mutatingId === o.id}
                            className="rounded-lg bg-teal-600 px-2 py-1 text-xs font-semibold text-white"
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditingNome("");
                            }}
                            className="text-xs text-[var(--muted)] underline"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-[var(--muted)]">
        {obras.length} obra(s) listada(s)
      </p>
    </div>
  );
}
