"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-url";
import { SERVICOS_DIRETORIO } from "@/lib/diretorio/servicos";
import { DiretorioPerfilSection } from "./diretorio-perfil-section";
import { MunicipioInput, type MunicipioOpcao } from "./municipio-input";

type Empresa = {
  empresaId: number;
  nome: string;
  logo: string | null;
  cidade: string;
  uf: string;
  distanciaKm: number;
  atendeACidade: boolean;
  mesmaCidade: boolean;
  servicos: string[];
  descricao: string | null;
  verificada: boolean;
};

const rotuloServico = (s: string) => SERVICOS_DIRETORIO[s as keyof typeof SERVICOS_DIRETORIO] ?? s;

export function DiretorioBusca() {
  const [aba, setAba] = useState<"buscar" | "perfil">("buscar");
  const [cidade, setCidade] = useState<MunicipioOpcao | null>(null);
  const [raio, setRaio] = useState("80");
  const [servico, setServico] = useState("");
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [minhas, setMinhas] = useState<Array<{ id: number; nome: string }>>([]);
  const [minhaId, setMinhaId] = useState<string>("");
  const [contato, setContato] = useState<Empresa | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(apiUrl("/api/me/empresas-gestao"), { credentials: "include" });
        const data = (await r.json()) as { empresas?: Array<{ id: number; nome: string }> };
        const lista = data.empresas ?? [];
        setMinhas(lista);
        if (lista[0]) setMinhaId(String(lista[0].id));
      } catch {
        /* sem empresas administradas: só a busca */
      }
    })();
  }, []);

  async function buscar(c = cidade) {
    if (!c) {
      setErro("Escolha a cidade do loteamento na lista.");
      return;
    }
    setErro(null);
    setBuscando(true);
    try {
      const qs = new URLSearchParams({ ibge: String(c.codigoIbge), raio });
      if (servico) qs.set("servico", servico);
      const r = await fetch(apiUrl(`/api/diretorio/busca?${qs}`), { credentials: "include" });
      const data = (await r.json()) as { empresas?: Empresa[]; error?: string };
      if (!r.ok) throw new Error(data.error ?? "Falha na busca.");
      setEmpresas(data.empresas ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na busca.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-[var(--text)]">Empresas por região</h1>
      <p className="mb-5 text-sm text-[var(--muted)]">
        Encontre empresas que usam o DataGeo na cidade do seu loteamento ou nas proximidades.
      </p>
      {minhas.length > 0 ? (
        <div className="mb-5 inline-flex rounded-lg border border-[var(--border)] p-0.5 text-sm">
          {(["buscar", "perfil"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setAba(k)}
              className={`rounded-md px-3 py-1.5 ${aba === k ? "bg-teal-600 text-white" : "text-[var(--text)]"}`}
            >
              {k === "buscar" ? "Buscar empresas" : "Minha empresa no diretório"}
            </button>
          ))}
        </div>
      ) : null}

      {aba === "perfil" && minhas.length > 0 ? (
        <div>
          {minhas.length > 1 ? (
            <label className="mb-3 block text-xs text-[var(--muted)]">
              Empresa
              <select
                value={minhaId}
                onChange={(e) => setMinhaId(e.target.value)}
                className="mt-1 block rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              >
                {minhas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {minhaId ? <DiretorioPerfilSection key={minhaId} empresaId={minhaId} /> : null}
        </div>
      ) : (
        <>
          <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_2fr_auto] sm:items-end">
              <label className="block text-xs text-[var(--muted)]">
                Cidade do loteamento
                <div className="mt-1">
                  <MunicipioInput
                    value={cidade}
                    onChange={(m) => {
                      setCidade(m);
                      if (m) void buscar(m);
                    }}
                  />
                </div>
              </label>
              <label className="block text-xs text-[var(--muted)]">
                Distância até
                <select
                  value={raio}
                  onChange={(e) => setRaio(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                >
                  {["30", "50", "80", "150", "300"].map((r) => (
                    <option key={r} value={r}>
                      {r} km
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-[var(--muted)]">
                Serviço
                <select
                  value={servico}
                  onChange={(e) => setServico(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                >
                  <option value="">Todos</option>
                  {Object.entries(SERVICOS_DIRETORIO).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={buscando}
                onClick={() => void buscar()}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {buscando ? "Buscando…" : "Buscar"}
              </button>
            </div>
            {erro ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{erro}</p> : null}
          </section>

          {empresas && cidade ? (
            empresas.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center">
                <p className="text-sm font-medium text-[var(--text)]">
                  Nenhuma empresa do DataGeo atende {cidade.nome}/{cidade.uf} ainda.
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Aumente a distância ou mude o serviço. Sua empresa atua aqui? Ative o perfil em “Minha empresa no diretório”.
                </p>
              </div>
            ) : (
              <>
                <p className="mb-3 text-xs text-[var(--muted)]">
                  {empresas.length} empresa(s) para {cidade.nome}/{cidade.uf}
                </p>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {empresas.map((e) => (
                    <li key={e.empresaId} className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                      <div className="flex items-start gap-3">
                        {e.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={e.logo} alt="" className="h-10 w-10 rounded-lg object-contain" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600/15 text-sm font-semibold text-teal-700">
                            {e.nome.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[var(--text)]">
                            {e.nome}
                            {e.verificada ? (
                              <span className="ml-1.5 rounded-full bg-teal-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                ✓ verificada
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-[var(--muted)]">
                            {e.cidade}/{e.uf} ·{" "}
                            {e.mesmaCidade ? "na cidade" : `${e.distanciaKm.toLocaleString("pt-BR")} km`}
                            {e.atendeACidade && !e.mesmaCidade ? " · atende sua cidade" : ""}
                          </p>
                        </div>
                      </div>
                      {e.descricao ? <p className="mt-2 text-sm text-[var(--text)]">{e.descricao}</p> : null}
                      <ul className="mt-2 flex flex-wrap gap-1">
                        {e.servicos.map((s) => (
                          <li key={s} className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                            {rotuloServico(s)}
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => setContato(e)}
                        className="mt-3 self-start rounded-lg border border-teal-600 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40"
                      >
                        Pedir contato
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )
          ) : null}
        </>
      )}

      {contato ? (
        <ContatoDialog
          empresa={contato}
          cidade={cidade}
          servico={servico}
          onClose={() => setContato(null)}
        />
      ) : null}
    </div>
  );
}

function ContatoDialog({
  empresa,
  cidade,
  servico,
  onClose,
}: {
  empresa: Empresa;
  cidade: MunicipioOpcao | null;
  servico: string;
  onClose: () => void;
}) {
  const [mensagem, setMensagem] = useState(
    cidade ? `Olá! Estou planejando um loteamento em ${cidade.nome}/${cidade.uf} e gostaria de um orçamento.` : "",
  );
  const [telefone, setTelefone] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar() {
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch(apiUrl("/api/diretorio/contato"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId: empresa.empresaId, mensagem, telefone, codigoIbge: cidade?.codigoIbge, servico }),
      });
      if (r.status === 401) {
        throw new Error("Para pedir contato, entre na sua conta DataGeo Digital ou crie uma conta grátis (Trial 90 dias).");
      }
      const data = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "Falha ao enviar.");
      setOk(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao enviar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="text-lg font-semibold text-[var(--text)]">Pedir contato — {empresa.nome}</h2>
        {ok ? (
          <>
            <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
              Pedido enviado. A empresa vai responder no seu e-mail de cadastro.
            </p>
            <button type="button" onClick={onClose} className="mt-4 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white">
              Fechar
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-[var(--muted)]">A empresa recebe seu nome, e-mail e esta mensagem.</p>
            <label className="mt-3 block text-xs text-[var(--muted)]">
              Mensagem
              <textarea
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value.slice(0, 2000))}
                rows={5}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-2 block text-xs text-[var(--muted)]">
              Telefone / WhatsApp (opcional)
              <input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              />
            </label>
            {erro ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{erro}</p> : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={enviando}
                onClick={() => void enviar()}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {enviando ? "Enviando…" : "Enviar pedido"}
              </button>
              <button type="button" onClick={onClose} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)]">
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
