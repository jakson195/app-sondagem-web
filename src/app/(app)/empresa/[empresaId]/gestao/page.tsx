"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-url";
import { DiretorioPerfilSection } from "@/components/diretorio/diretorio-perfil-section";
import {
  MODULO_ROTULO,
  MODULOS_PLATAFORMA,
  isModuloPlataformaChave,
} from "@/lib/modulos-plataforma";

type MembroRow = {
  id: number;
  orgRole: string;
  equipeId: number | null;
  modulosPermitidos: string[];
  user: { email: string; name: string | null; systemRole: string };
  equipe: { id: number; nome: string } | null;
};

type EquipeRow = { id: number; nome: string };

type ModRow = { id: number; modulo: string; ativo: boolean };

type Pack = {
  empresa: { id: number; nome: string };
  membros: MembroRow[];
  equipes: EquipeRow[];
  modulos: ModRow[];
};

const ORG_ROLES = ["ADMIN", "MANAGER", "MEMBER", "VIEWER"] as const;

export default function EmpresaGestaoPage() {
  const params = useParams<{ empresaId?: string }>();
  const empresaId =
    typeof params?.empresaId === "string" ? params.empresaId : "";

  const [pack, setPack] = useState<Pack | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [novaEquipe, setNovaEquipe] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addRole, setAddRole] = useState<string>("MEMBER");
  const [addEquipe, setAddEquipe] = useState<string>("");

  const refresh = useCallback(async () => {
    const r = await fetch(apiUrl(`/api/empresa/${empresaId}/gestao/membros`), {
      credentials: "include",
    });
    const data = (await r.json()) as Pack & { error?: string };
    if (!r.ok) {
      setErro(typeof data.error === "string" ? data.error : "Erro ao carregar.");
      setPack(null);
      return;
    }
    setPack(data as Pack);
    setErro(null);
  }, [empresaId]);

  useEffect(() => {
    let c = false;
    void (async () => {
      setLoading(true);
      try {
        await refresh();
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [refresh]);

  async function guardarModulosEmpresa() {
    if (!pack) return;
    setMsg(null);
    const modulos: Record<string, boolean> = {};
    for (const m of pack.modulos) {
      if (isModuloPlataformaChave(m.modulo)) modulos[m.modulo] = m.ativo;
    }
    const r = await fetch(apiUrl(`/api/empresa/${empresaId}/gestao/modulos`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ modulos }),
    });
    const j = (await r.json()) as { error?: string };
    if (!r.ok) {
      setMsg(typeof j.error === "string" ? j.error : "Erro ao guardar módulos.");
      return;
    }
    setMsg("Módulos da empresa atualizados.");
    await refresh();
  }

  function toggleModuloEmpresa(modulo: string, ativo: boolean) {
    if (!pack) return;
    setPack({
      ...pack,
      modulos: pack.modulos.map((m) =>
        m.modulo === modulo ? { ...m, ativo } : m,
      ),
    });
  }

  async function criarEquipe() {
    const n = novaEquipe.trim();
    if (!n) return;
    setMsg(null);
    const r = await fetch(apiUrl(`/api/empresa/${empresaId}/gestao/equipes`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ nome: n }),
    });
    const j = (await r.json()) as { error?: string };
    if (!r.ok) {
      setMsg(typeof j.error === "string" ? j.error : "Erro ao criar equipa.");
      return;
    }
    setNovaEquipe("");
    setMsg("Equipa criada.");
    await refresh();
  }

  async function adicionarMembro() {
    setMsg(null);
    const body: Record<string, unknown> = {
      email: addEmail.trim(),
      orgRole: addRole,
      equipeId: addEquipe === "" ? undefined : Number(addEquipe),
    };
    if (addPassword.trim().length > 0) body.password = addPassword;
    const r = await fetch(apiUrl(`/api/empresa/${empresaId}/gestao/membros`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const j = (await r.json()) as { error?: string };
    if (!r.ok) {
      setMsg(typeof j.error === "string" ? j.error : "Erro ao adicionar.");
      return;
    }
    setAddEmail("");
    setAddPassword("");
    setMsg("Utilizador associado à empresa.");
    await refresh();
  }

  async function guardarMembro(m: MembroRow) {
    setMsg(null);
    const r = await fetch(
      apiUrl(`/api/empresa/${empresaId}/gestao/membros/${m.id}`),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orgRole: m.orgRole,
          equipeId: m.equipeId,
          modulosPermitidos: m.modulosPermitidos,
        }),
      },
    );
    const j = (await r.json()) as { error?: string };
    if (!r.ok) {
      setMsg(typeof j.error === "string" ? j.error : "Erro ao guardar membro.");
      await refresh();
      return;
    }
    setMsg("Membro atualizado.");
    await refresh();
  }

  async function removerMembro(id: number) {
    if (!confirm("Remover este utilizador da empresa?")) return;
    setMsg(null);
    const r = await fetch(
      apiUrl(`/api/empresa/${empresaId}/gestao/membros/${id}`),
      { method: "DELETE", credentials: "include" },
    );
    const j = (await r.json()) as { error?: string };
    if (!r.ok) {
      setMsg(typeof j.error === "string" ? j.error : "Erro ao remover.");
      return;
    }
    setMsg("Membro removido.");
    await refresh();
  }

  function setMembroField(
    id: number,
    patch: Partial<Pick<MembroRow, "orgRole" | "equipeId" | "modulosPermitidos">>,
  ) {
    if (!pack) return;
    setPack({
      ...pack,
      membros: pack.membros.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    });
  }

  function toggleModuloMembro(m: MembroRow, chave: string) {
    const ativos = pack!.modulos.filter((x) => x.ativo).map((x) => x.modulo);
    const restringe = m.modulosPermitidos.length > 0;
    if (!restringe) {
      setMembroField(m.id, {
        modulosPermitidos: ativos.filter((x) => x !== chave),
      });
      return;
    }
    if (m.modulosPermitidos.includes(chave)) {
      setMembroField(m.id, {
        modulosPermitidos: m.modulosPermitidos.filter((x) => x !== chave),
      });
    } else {
      setMembroField(m.id, {
        modulosPermitidos: [...m.modulosPermitidos, chave].filter((x) =>
          ativos.includes(x),
        ),
      });
    }
  }

  function membroAcessoTotal(m: MembroRow) {
    setMembroField(m.id, { modulosPermitidos: [] });
  }

  if (loading) {
    return (
      <div className="px-4 py-8 text-sm text-[var(--muted)]">A carregar…</div>
    );
  }

  if (erro || !pack) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <p className="text-red-600 dark:text-red-400" role="alert">
          {erro ?? "Sem dados."}
        </p>
        <Link href="/gestao-empresa" className="mt-4 inline-block text-teal-600 underline">
          Voltar à lista
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <p className="mb-1 text-sm text-[var(--muted)]">
        <Link href="/gestao-empresa" className="text-teal-600 hover:underline">
          ← Empresas
        </Link>
      </p>
      <h1 className="mb-2 text-2xl font-semibold text-[var(--text)]">
        {pack.empresa.nome}
      </h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Gerir módulos contratados, equipas e acessos por utilizador.
      </p>

      {msg && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" role="status">
          {msg}
        </p>
      )}

      <section className="mb-10 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">
          Módulos da empresa (contrato)
        </h2>
        <p className="mb-4 text-xs text-[var(--muted)]">
          Só os módulos ativos aqui podem ser atribuídos aos utilizadores. Lista vazia
          no utilizador significa acesso a <strong>todos</strong> os módulos ativos.
        </p>
        <ul className="mb-4 grid gap-2 sm:grid-cols-2">
          {MODULOS_PLATAFORMA.map((chave) => {
            const row = pack.modulos.find((x) => x.modulo === chave);
            const ativo = row?.ativo ?? false;
            const label = MODULO_ROTULO[chave];
            return (
              <li key={chave} className="flex items-center gap-2">
                <input
                  id={`mod-emp-${chave}`}
                  type="checkbox"
                  checked={ativo}
                  onChange={(e) => toggleModuloEmpresa(chave, e.target.checked)}
                  className="rounded border-[var(--border)]"
                />
                <label htmlFor={`mod-emp-${chave}`} className="text-sm text-[var(--text)]">
                  {label}{" "}
                  <span className="text-[var(--muted)]">({chave})</span>
                </label>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => void guardarModulosEmpresa()}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
        >
          Guardar módulos da empresa
        </button>
      </section>

      <section className="mb-10 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">Equipas</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={novaEquipe}
            onChange={(e) => setNovaEquipe(e.target.value)}
            placeholder="Nome da equipa"
            className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void criarEquipe()}
            className="rounded-lg border border-teal-600 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40"
          >
            Criar equipa
          </button>
        </div>
        {pack.equipes.length > 0 && (
          <ul className="mt-3 text-sm text-[var(--muted)]">
            {pack.equipes.map((e) => (
              <li key={e.id}>
                {e.nome} <span className="text-xs">#{e.id}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-10 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="mb-3 text-lg font-semibold text-[var(--text)]">
          Adicionar utilizador
        </h2>
        <p className="mb-4 text-xs text-[var(--muted)]">
          Se o email ainda não existir, indique uma password (mín. 8 caracteres) para
          criar a conta.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="email"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            placeholder="Email"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={addPassword}
            onChange={(e) => setAddPassword(e.target.value)}
            placeholder="Password (só se novo utilizador)"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          <select
            value={addRole}
            onChange={(e) => setAddRole(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          >
            {ORG_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={addEquipe}
            onChange={(e) => setAddEquipe(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          >
            <option value="">— Sem equipa —</option>
            {pack.equipes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void adicionarMembro()}
          className="mt-4 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
        >
          Associar à empresa
        </button>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">
          Utilizadores e acessos
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                <th className="p-2 font-medium">Email</th>
                <th className="p-2 font-medium">Papel</th>
                <th className="p-2 font-medium">Equipa</th>
                <th className="p-2 font-medium">Módulos</th>
                <th className="p-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {pack.membros.map((m) => {
                const restringe = m.modulosPermitidos.length > 0;
                return (
                  <tr key={m.id} className="border-b border-[var(--border)] align-top">
                    <td className="p-2 text-[var(--text)]">
                      <div className="font-medium">{m.user.email}</div>
                      {m.user.name && (
                        <div className="text-xs text-[var(--muted)]">{m.user.name}</div>
                      )}
                    </td>
                    <td className="p-2">
                      <select
                        value={m.orgRole}
                        onChange={(e) =>
                          setMembroField(m.id, { orgRole: e.target.value })
                        }
                        className="w-full rounded border border-[var(--border)] bg-[var(--surface)] p-1 text-xs"
                      >
                        {ORG_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <select
                        value={m.equipeId ?? ""}
                        onChange={(e) =>
                          setMembroField(m.id, {
                            equipeId: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                        className="w-full rounded border border-[var(--border)] bg-[var(--surface)] p-1 text-xs"
                      >
                        <option value="">—</option>
                        {pack.equipes.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.nome}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => membroAcessoTotal(m)}
                        className="mb-2 text-xs text-teal-600 underline hover:no-underline"
                      >
                        Acesso a todos os módulos contratados
                      </button>
                      <p className="mb-1 text-[10px] text-[var(--muted)]">
                        {restringe
                          ? "Restrito (marque os permitidos):"
                          : "Sem restrição explícita."}
                      </p>
                      <ul className="space-y-1">
                        {MODULOS_PLATAFORMA.map((chave) => {
                          const contrato = pack.modulos.find((x) => x.modulo === chave);
                          const ativoContrato = contrato?.ativo ?? false;
                          const checked = restringe
                            ? m.modulosPermitidos.includes(chave)
                            : true;
                          return (
                            <li key={chave} className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                disabled={!ativoContrato}
                                checked={checked && ativoContrato}
                                onChange={() => toggleModuloMembro(m, chave)}
                                className="rounded border-[var(--border)]"
                              />
                              <span className="text-[10px] text-[var(--text)]">
                                {MODULO_ROTULO[chave]}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                    <td className="p-2">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => void guardarMembro(m)}
                          className="rounded bg-teal-600 px-2 py-1 text-xs font-semibold text-white"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => void removerMembro(m.id)}
                          className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-800 dark:text-red-400"
                        >
                          Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <DiretorioPerfilSection empresaId={empresaId} />
    </div>
  );
}
