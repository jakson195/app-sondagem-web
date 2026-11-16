"use client";

import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-url";
import { SERVICOS_DIRETORIO } from "@/lib/diretorio/servicos";
import { MunicipioInput, type MunicipioOpcao } from "./municipio-input";

type Perfil = {
  visivel: boolean;
  codigoIbge: number;
  cidade: string;
  uf: string;
  raioKm: number;
  servicos: string[];
  descricao: string | null;
  registroProfissional: string | null;
  registroVerificado: boolean;
};
type Lead = {
  id: number;
  nome: string;
  email: string;
  telefone: string | null;
  cidade: string | null;
  servico: string | null;
  mensagem: string;
  lido: boolean;
  createdAt: string;
};

/** Perfil da empresa no diretório "Empresas por região" + pedidos de contato recebidos. */
export function DiretorioPerfilSection({ empresaId }: { empresaId: string }) {
  const [carregando, setCarregando] = useState(true);
  const [ativa, setAtiva] = useState(false);
  const [visivel, setVisivel] = useState(false);
  const [cidade, setCidade] = useState<MunicipioOpcao | null>(null);
  const [raio, setRaio] = useState("80");
  const [servicos, setServicos] = useState<string[]>([]);
  const [descricao, setDescricao] = useState("");
  const [registro, setRegistro] = useState("");
  const [verificado, setVerificado] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const url = apiUrl(`/api/empresa/${empresaId}/gestao/diretorio`);

  const aplicar = (p: Perfil | null) => {
    if (!p) return;
    setVisivel(p.visivel);
    setCidade({ codigoIbge: p.codigoIbge, nome: p.cidade, uf: p.uf });
    setRaio(String(p.raioKm));
    setServicos(p.servicos);
    setDescricao(p.descricao ?? "");
    setRegistro(p.registroProfissional ?? "");
    setVerificado(p.registroVerificado);
  };

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(url, { credentials: "include" });
      const data = (await r.json()) as { perfil?: Perfil | null; leads?: Lead[]; assinaturaAtiva?: boolean; error?: string };
      if (!r.ok) throw new Error(data.error ?? "Erro ao carregar.");
      aplicar(data.perfil ?? null);
      setLeads(data.leads ?? []);
      setAtiva(Boolean(data.assinaturaAtiva));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, [url]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar() {
    setMsg(null);
    setErro(null);
    if (!cidade) {
      setErro("Escolha a cidade sede na lista.");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch(url, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visivel,
          codigoIbge: cidade.codigoIbge,
          raioKm: Number(raio),
          servicos,
          descricao,
          registroProfissional: registro,
        }),
      });
      const data = (await r.json()) as { perfil?: Perfil; assinaturaAtiva?: boolean; error?: string };
      if (!r.ok) throw new Error(data.error ?? "Erro ao salvar.");
      aplicar(data.perfil ?? null);
      setAtiva(Boolean(data.assinaturaAtiva));
      setMsg(visivel ? "Perfil salvo. Sua empresa aparece na busca da região." : "Perfil salvo (oculto da busca).");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function marcarLidos() {
    const ids = leads.filter((l) => !l.lido).map((l) => l.id);
    if (ids.length === 0) return;
    await fetch(url, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds: ids }),
    });
    setLeads((prev) => prev.map((l) => ({ ...l, lido: true })));
  }

  const naoLidos = leads.filter((l) => !l.lido).length;

  return (
    <section className="mb-10 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <h2 className="mb-1 text-lg font-semibold text-[var(--text)]">Diretório de empresas por região</h2>
      <p className="mb-4 text-xs text-[var(--muted)]">
        Quem procura empresas para um loteamento numa cidade encontra a sua, se estiver no raio de atuação. Só empresas com
        assinatura ativa aparecem. Seu telefone e e-mail não são mostrados: os pedidos chegam aqui.
      </p>
      {carregando ? <p className="text-sm text-[var(--muted)]">A carregar…</p> : null}
      {!carregando ? (
        <div className="space-y-4">
          {!ativa ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Assinatura inativa: o perfil fica salvo, mas a empresa só aparece na busca com a assinatura em dia.
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-sm font-medium text-[var(--text)]">
            <input type="checkbox" checked={visivel} onChange={(e) => setVisivel(e.target.checked)} className="rounded" />
            Mostrar minha empresa na busca por região
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-[var(--muted)]">
              Cidade sede
              <div className="mt-1">
                <MunicipioInput value={cidade} onChange={setCidade} />
              </div>
            </label>
            <label className="block text-xs text-[var(--muted)]">
              Raio de atuação (km)
              <input
                type="number"
                min={5}
                max={300}
                value={raio}
                onChange={(e) => setRaio(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              />
            </label>
          </div>
          <fieldset>
            <legend className="mb-2 text-xs text-[var(--muted)]">Serviços que a empresa oferece</legend>
            <ul className="grid gap-2 sm:grid-cols-2">
              {Object.entries(SERVICOS_DIRETORIO).map(([chave, rotulo]) => (
                <li key={chave} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`srv-${chave}`}
                    checked={servicos.includes(chave)}
                    onChange={(e) =>
                      setServicos((prev) => (e.target.checked ? [...prev, chave] : prev.filter((s) => s !== chave)))
                    }
                    className="rounded"
                  />
                  <label htmlFor={`srv-${chave}`} className="text-sm text-[var(--text)]">
                    {rotulo}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <label className="block text-xs text-[var(--muted)]">
            Apresentação (até 600 caracteres)
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value.slice(0, 600))}
              rows={3}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs text-[var(--muted)]">
            Registro profissional (CREA/CAU)
            <input
              type="text"
              value={registro}
              onChange={(e) => setRegistro(e.target.value)}
              placeholder="ex.: CREA-SC 123456-7"
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
            <span className="mt-1 block">
              {verificado ? "✓ Registro verificado — selo exibido na busca." : "O selo de verificada aparece depois que conferirmos o registro."}
            </span>
          </label>
          <button
            type="button"
            disabled={salvando}
            onClick={() => void salvar()}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {salvando ? "Salvando…" : "Salvar perfil"}
          </button>
          {msg ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{msg}</p> : null}
          {erro ? <p className="text-sm text-red-600 dark:text-red-400">{erro}</p> : null}

          <div className="border-t border-[var(--border)] pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text)]">
                Pedidos de contato {naoLidos > 0 ? <span className="ml-1 rounded-full bg-teal-600 px-2 py-0.5 text-xs text-white">{naoLidos} novo(s)</span> : null}
              </h3>
              {naoLidos > 0 ? (
                <button type="button" onClick={() => void marcarLidos()} className="text-xs text-teal-700 hover:underline">
                  Marcar como lidos
                </button>
              ) : null}
            </div>
            {leads.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">Nenhum pedido ainda.</p>
            ) : (
              <ul className="space-y-2">
                {leads.map((l) => (
                  <li
                    key={l.id}
                    className={`rounded-lg border px-3 py-2 text-sm ${l.lido ? "border-[var(--border)]" : "border-teal-500 bg-teal-50/50 dark:bg-teal-950/30"}`}
                  >
                    <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
                      <span>
                        <strong className="text-[var(--text)]">{l.nome}</strong> · {l.email}
                        {l.telefone ? ` · ${l.telefone}` : ""}
                      </span>
                      <span>{new Date(l.createdAt).toLocaleString("pt-BR")}</span>
                    </div>
                    {l.cidade || l.servico ? (
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {l.cidade ? `Cidade: ${l.cidade}` : ""}
                        {l.cidade && l.servico ? " · " : ""}
                        {l.servico ? SERVICOS_DIRETORIO[l.servico as keyof typeof SERVICOS_DIRETORIO] ?? l.servico : ""}
                      </p>
                    ) : null}
                    <p className="mt-1 whitespace-pre-wrap text-[var(--text)]">{l.mensagem}</p>
                    <a href={`mailto:${l.email}`} className="mt-1 inline-block text-xs text-teal-700 hover:underline">
                      Responder por e-mail
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
