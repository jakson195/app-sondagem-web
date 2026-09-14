"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AVISOS_ESTUDO, TITULO_ESTUDO, VIABILIDADE_LOCAL_ID } from "@/lib/viabilidade/types";
import { formatArea, formatBRL, formatNum, formatPct } from "@/lib/viabilidade/format";
import { defaultPremissas } from "@/lib/viabilidade/premissas-default";
import type { ViabilidadePremissas } from "@/lib/viabilidade/types";
import { adaptCadProjectToLoteamentoInput } from "@/lib/viabilidade/project-adapter";
import { extrairQuantitativosProjeto } from "@/lib/viabilidade/extrator";
import { readViabilidadeSession, type ViabilidadeSessionPayload } from "@/lib/viabilidade/cad-session";
import { ordenarUfsComPrioridade, UFS_BRASIL } from "@/lib/viabilidade/sinapi-ufs";
import type { CadProject } from "@/lib/rtk-validation/cad/types";

type CatalogoSinapiRow = {
  codigo: string;
  descricao: string;
  unidade: string;
  uf: string;
  competencia: string;
  custoDesonerado: string | null;
  custoNaoDesonerado: string | null;
};

type EstudoPayload = {
  id?: string | null;
  titulo?: string;
  versao?: number;
  desatualizado?: boolean;
  avisoDesatualizado?: string | null;
  persistido?: boolean;
  projetoId?: string;
  projetoNome?: string;
  uf?: string;
  municipio?: string | null;
  competenciaSinapi?: string | null;
  premissas?: ViabilidadePremissas;
  extraido?: {
    areaTotal?: number;
    areaLotes?: number;
    quantidadeLotes?: number;
    areaVias?: number;
    areaVerde?: number;
    areaInstitucional?: number;
    areaApp?: number;
    areaMediaLote?: number;
    comprimentoTotalVias?: number;
  };
  itens?: Array<{
    id?: string;
    categoria: string;
    descricao: string;
    quantidade: string;
    unidade: string;
    codigoReferencia?: string | null;
    fonte?: string | null;
    competencia?: string | null;
    uf?: string | null;
    custoUnitario: string;
    custoTotal: string;
    origemValor: string;
    observacao?: string | null;
  }>;
  quantitativos?: Array<{
    categoria: string;
    descricao: string;
    quantidade: string;
    unidade: string;
    origem: string;
    confianca?: string | null;
    observacao?: string | null;
  }>;
  validacoes?: Array<{
    categoria: string;
    parametro: string;
    valorProjeto?: string | null;
    valorMinimo?: string | null;
    unidade?: string | null;
    status: string;
    mensagem?: string | null;
  }>;
  custosPorCategoria?: Record<string, string>;
  valorTerreno?: string | null;
  custoProjetos?: string;
  custoLicenciamento?: string;
  custoRegistro?: string;
  custoAdministrativo?: string;
  custoComercial?: string;
  custoContingencia?: string;
  custoInfraestrutura?: string;
  custoTotal?: string;
  receitaEstimada?: string;
  lucroEstimado?: string;
  margemPercentual?: string;
  roiPercentual?: string;
  custoPorLote?: string;
  receitaPorLote?: string;
  custoTerraplenagem?: string;
  custoPavimentacao?: string;
  custoDrenagem?: string;
  custoCalcadas?: string;
  custoAgua?: string;
  custoEsgoto?: string;
  custoEnergia?: string;
  custoIluminacao?: string;
  custoArborizacao?: string;
  custoSinalizacao?: string;
  pontoEquilibrio?: { quantidadeLotes: string; metodo: string; observacao: string };
  cenarios?: Array<{ nome: string; receita: string; custo: string; lucro: string; margem: string; roi: string }>;
  semaforos?: { urbanistica: string; ambiental: string; infraestrutura: string; economica: string };
  avisos?: string[];
  fonteCustosLabel?: string;
  alertaCompetencia?: string | null;
  precosAusentes?: number;
};

const CHART_COLORS: Record<string, string> = {
  TERRAPLENAGEM: "#b45309",
  PAVIMENTACAO: "#0f766e",
  DRENAGEM: "#0369a1",
  CALCADA: "#4f46e5",
  AGUA: "#0284c7",
  ESGOTO: "#7c3aed",
  ENERGIA: "#ca8a04",
  ILUMINACAO: "#d97706",
  ARBORIZACAO: "#15803d",
  SINALIZACAO: "#334155",
};

const CHART_LABELS: Record<string, string> = {
  TERRAPLENAGEM: "Terraplenagem",
  PAVIMENTACAO: "Pavimentação",
  DRENAGEM: "Drenagem",
  CALCADA: "Calçadas",
  AGUA: "Água",
  ESGOTO: "Esgoto",
  ENERGIA: "Energia",
  ILUMINACAO: "Iluminação",
  ARBORIZACAO: "Arborização",
  SINALIZACAO: "Sinalização",
};

function semaforoClass(status: string): string {
  if (status === "OK") return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (status === "ALERTA") return "bg-amber-100 text-amber-900 border-amber-300";
  if (status === "INCONFORME") return "bg-red-100 text-red-800 border-red-300";
  return "bg-slate-100 text-slate-600 border-slate-300";
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text)]">{value}</p>
    </div>
  );
}

export function EstudoViabilidadeClient({ projetoId }: { projetoId: string }) {
  const isLocal = projetoId === VIABILIDADE_LOCAL_ID;
  const [estudo, setEstudo] = useState<EstudoPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uf, setUf] = useState("SC");
  const [competencia, setCompetencia] = useState("");
  const [tipo, setTipo] = useState<"DESONERADO" | "NAO_DESONERADO">("DESONERADO");
  const [municipio, setMunicipio] = useState("");
  const [valorTerreno, setValorTerreno] = useState("");
  const [precoM2, setPrecoM2] = useState("");
  const [modalidade, setModalidade] = useState<"M2" | "POR_LOTE">("M2");
  const [contingencia, setContingencia] = useState("");
  const [projetos, setProjetos] = useState("");
  const [licenciamento, setLicenciamento] = useState("");
  const [registro, setRegistro] = useState("");
  const [administrativo, setAdministrativo] = useState("");
  const [comercial, setComercial] = useState("");
  const [sistemaEsgoto, setSistemaEsgoto] = useState<"na" | "sim" | "nao">("na");
  const [corteManual, setCorteManual] = useState("");
  const [aterroManual, setAterroManual] = useState("");
  const [printOpen, setPrintOpen] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ uf: string; current: number; total: number } | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [fonteSinapi, setFonteSinapi] = useState<string | null>(null);
  const [catalogRows, setCatalogRows] = useState<CatalogoSinapiRow[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogEmptyReason, setCatalogEmptyReason] = useState<string | null>(null);
  const [avisoCompetencia, setAvisoCompetencia] = useState<string | null>(null);
  const competenciaRef = useRef(competencia);
  const fileRef = useRef<HTMLInputElement>(null);
  const localPayloadRef = useRef<ViabilidadeSessionPayload | null>(null);
  const autoSyncRef = useRef(false);
  const skipUfRecalcRef = useRef(true);
  const skipCompRecalcRef = useRef(false);
  const catalogReqRef = useRef(0);

  function isCadProject(value: unknown): value is CadProject {
    return Boolean(value) && typeof value === "object" && Array.isArray((value as CadProject).entities);
  }

  function extraidoFromSession(payload: ViabilidadeSessionPayload | null) {
    if (!payload) return null;
    const fallbacks = {
      areaTotal: Number(payload.areaTotal) || undefined,
      quantidadeLotes: Number(payload.quantidadeLotes) || undefined,
      areaLotes: Number(payload.areaLotes) || undefined,
    };
    if (isCadProject(payload.project)) {
      const projeto = adaptCadProjectToLoteamentoInput(payload.project, {
        projetoId: payload.projetoId ?? VIABILIDADE_LOCAL_ID,
        streetProfiles: payload.streetProfiles,
        plateauZ: payload.plateauZ,
        glebaId: payload.glebaId,
        larguraViaFallbackM: payload.larguraViaFallbackM,
      });
      return extrairQuantitativosProjeto(projeto, fallbacks);
    }
    if ((fallbacks.areaTotal ?? 0) > 0 || (fallbacks.quantidadeLotes ?? 0) > 0) {
      return extrairQuantitativosProjeto(
        {
          projetoId: payload.projetoId ?? VIABILIDADE_LOCAL_ID,
          areaTotal: fallbacks.areaTotal ?? 0,
          lotes: Array.from({ length: fallbacks.quantidadeLotes ?? 0 }, (_, i) => ({
            id: `lote_sessao_${i + 1}`,
            area: fallbacks.quantidadeLotes ? (fallbacks.areaLotes ?? 0) / fallbacks.quantidadeLotes : 0,
            testada: 0,
          })),
          vias: [],
          avisos: [],
        },
        fallbacks,
      );
    }
    return null;
  }

  function mergeCadMetrics(data: EstudoPayload, payload: ViabilidadeSessionPayload | null): EstudoPayload {
    const fromSession = extraidoFromSession(payload);
    if (!fromSession) return data;
    const extraido = { ...(data.extraido ?? {}) };
    if (!(Number(extraido.areaTotal) > 0) && fromSession.areaTotal > 0) extraido.areaTotal = fromSession.areaTotal;
    if (!(Number(extraido.quantidadeLotes) > 0) && fromSession.quantidadeLotes > 0) {
      extraido.quantidadeLotes = fromSession.quantidadeLotes;
    }
    if (!(Number(extraido.areaLotes) > 0) && fromSession.areaLotes > 0) extraido.areaLotes = fromSession.areaLotes;
    return { ...data, extraido };
  }

  function estudoFromGeometry(payload: ViabilidadeSessionPayload): EstudoPayload {
    const extraido = extraidoFromSession(payload);
    return {
      persistido: false,
      titulo: TITULO_ESTUDO,
      projetoId: payload.projetoId ?? undefined,
      extraido: extraido ?? undefined,
      itens: [],
      avisos: [
        ...AVISOS_ESTUDO,
        "Quantitativos extraídos do projeto CAD. Preços SINAPI serão aplicados após sincronizar/importar a tabela.",
      ],
      alertaCompetencia: competencia
        ? "Não existem preços disponíveis para esta competência."
        : "Importe ou sincronize o SINAPI para preencher investimento, receita e o quadro de custos.",
    };
  }

  function previewBody(payload: ViabilidadeSessionPayload) {
    return {
      projetoId: payload.projetoId ?? (isLocal ? VIABILIDADE_LOCAL_ID : projetoId),
      project: payload.project,
      streetProfiles: payload.streetProfiles,
      plateauZ: payload.plateauZ,
      glebaId: payload.glebaId,
      larguraViaFallbackM: payload.larguraViaFallbackM,
      areaTotal: payload.areaTotal,
      quantidadeLotes: payload.quantidadeLotes,
      areaLotes: payload.areaLotes,
      uf,
      competenciaSinapi: competenciaRef.current || competencia || null,
      premissas: premissasAtuais(),
      ...indiretosBody(),
    };
  }

  function aplicarCompetencia(next: string, aviso?: string | null) {
    const label = next.trim();
    if (!label) return;
    competenciaRef.current = label;
    setCompetencia(label);
    if (aviso !== undefined) setAvisoCompetencia(aviso);
  }

  const premissasAtuais = useCallback((): ViabilidadePremissas => {
    return defaultPremissas({
      modalidadeReceita: modalidade,
      precoVendaM2: precoM2,
      tipoCustoSinapi: tipo,
      percentualContingencia: contingencia || undefined,
      sistemaPublicoEsgoto: sistemaEsgoto === "na" ? null : sistemaEsgoto === "sim",
      volumeCorteManualM3: corteManual || undefined,
      volumeAterroManualM3: aterroManual || undefined,
      municipio: municipio || undefined,
    });
  }, [modalidade, precoM2, tipo, contingencia, sistemaEsgoto, corteManual, aterroManual, municipio]);

  const indiretosBody = useCallback(
    () => ({
      valorTerreno,
      custoProjetos: projetos,
      custoLicenciamento: licenciamento,
      custoRegistro: registro,
      custoAdministrativo: administrativo,
      custoComercial: comercial,
    }),
    [valorTerreno, projetos, licenciamento, registro, administrativo, comercial],
  );

  const applyEstudo = useCallback((data: EstudoPayload) => {
    setEstudo(data);
    if (data.uf) setUf(data.uf);
    if (data.municipio) setMunicipio(data.municipio);
    if (data.competenciaSinapi) {
      competenciaRef.current = data.competenciaSinapi;
      setCompetencia(data.competenciaSinapi);
    }
    if (data.premissas) {
      setTipo(data.premissas.tipoCustoSinapi);
      setModalidade(data.premissas.modalidadeReceita);
      if (data.premissas.precoVendaM2) setPrecoM2(data.premissas.precoVendaM2);
      if (data.premissas.percentualContingencia) setContingencia(data.premissas.percentualContingencia);
      if (data.premissas.volumeCorteManualM3) setCorteManual(data.premissas.volumeCorteManualM3);
      if (data.premissas.volumeAterroManualM3) setAterroManual(data.premissas.volumeAterroManualM3);
      if (data.premissas.sistemaPublicoEsgoto === true) setSistemaEsgoto("sim");
      if (data.premissas.sistemaPublicoEsgoto === false) setSistemaEsgoto("nao");
    }
    if (data.valorTerreno) setValorTerreno(data.valorTerreno);
    if (data.custoProjetos) setProjetos(data.custoProjetos);
    if (data.custoLicenciamento) setLicenciamento(data.custoLicenciamento);
    if (data.custoRegistro) setRegistro(data.custoRegistro);
    if (data.custoAdministrativo) setAdministrativo(data.custoAdministrativo);
    if (data.custoComercial) setComercial(data.custoComercial);
  }, []);

  const postPreview = useCallback(
    async (payload: ViabilidadeSessionPayload) => {
      const res = await fetch("/api/viabilidade/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previewBody(payload)),
      });
      const data = (await res.json()) as EstudoPayload & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha na extração local.");
      return mergeCadMetrics(data, payload);
    },
    // previewBody reads current form state
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [competencia, indiretosBody, isLocal, premissasAtuais, projetoId, uf],
  );

  const loadFromCadPayload = useCallback(
    async (payload: ViabilidadeSessionPayload) => {
      localPayloadRef.current = payload;
      applyEstudo(estudoFromGeometry(payload));
      try {
        applyEstudo(await postPreview(payload));
      } catch (err) {
        if (extraidoFromSession(payload)) {
          setError(
            err instanceof Error
              ? `${err.message} Quantitativos do projeto foram extraídos localmente.`
              : "Falha na API; quantitativos do projeto extraídos localmente.",
          );
          return;
        }
        throw err;
      }
    },
    [applyEstudo, postPreview],
  );

  const loadLocal = useCallback(async () => {
    const payload = readViabilidadeSession();
    if (!payload) {
      throw new Error("Nenhum loteamento local encontrado. Abra o estudo a partir da aba Loteamento do CAD.");
    }
    await loadFromCadPayload(payload);
  }, [loadFromCadPayload]);

  const loadSaved = useCallback(async () => {
    const extras = readViabilidadeSession();
    localPayloadRef.current = extras;
    const fromCad =
      extras &&
      (extras.projetoId === projetoId || !extras.projetoId) &&
      (isCadProject(extras.project) || Number(extras.areaTotal) > 0 || Number(extras.quantidadeLotes) > 0);

    if (fromCad && extras) {
      await loadFromCadPayload({ ...extras, projetoId: extras.projetoId ?? projetoId });
      return;
    }

    const listRes = await fetch(`/api/viabilidade?projetoId=${encodeURIComponent(projetoId)}`, {
      credentials: "include",
    });
    const list = await listRes.json();
    if (!listRes.ok) {
      if (extras && (isCadProject(extras.project) || Number(extras.quantidadeLotes) > 0)) {
        await loadFromCadPayload({ ...extras, projetoId });
        return;
      }
      throw new Error(list.error ?? "Falha ao listar estudos.");
    }
    const id = list.estudos?.[0]?.id as string | undefined;
    if (!id) {
      const created = await fetch("/api/viabilidade", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projetoId,
          uf,
          municipio,
          competenciaSinapi: competenciaRef.current || competencia || null,
          premissas: premissasAtuais(),
          ...indiretosBody(),
          ...(extras ? previewBody(extras) : {}),
        }),
      });
      const data = await created.json();
      if (!created.ok) {
        if (extras && (isCadProject(extras.project) || Number(extras.quantidadeLotes) > 0)) {
          await loadFromCadPayload({ ...extras, projetoId });
          return;
        }
        throw new Error(data.error ?? "Falha ao criar o estudo.");
      }
      applyEstudo(mergeCadMetrics({ ...data, projetoNome: data.projetoNome, projetoId }, extras));
      return;
    }
    const res = await fetch(`/api/viabilidade/${id}`, { credentials: "include" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Falha ao carregar o estudo.");
    const merged = mergeCadMetrics(data, extras);
    if (
      extras &&
      isCadProject(extras.project) &&
      !(Number(merged.extraido?.quantidadeLotes) > 0) &&
      !(Number(merged.extraido?.areaTotal) > 0)
    ) {
      await loadFromCadPayload({ ...extras, projetoId });
      return;
    }
    applyEstudo(merged);
  }, [applyEstudo, competencia, indiretosBody, loadFromCadPayload, municipio, premissasAtuais, projetoId, uf]);

  const carregarCatalogo = useCallback(async (comp?: string, sigla?: string) => {
    const c = (comp ?? competenciaRef.current ?? competencia).trim();
    const u = (sigla ?? uf).trim().toUpperCase();
    const reqId = catalogReqRef.current + 1;
    catalogReqRef.current = reqId;
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const qs = new URLSearchParams();
      if (u) qs.set("uf", u);
      if (c) qs.set("competencia", c);
      qs.set("_ts", String(Date.now()));
      const res = await fetch(`/api/viabilidade/sinapi/search?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
        headers: { "Cache-Control": "no-store" },
      });
      const data = (await res.json()) as {
        items?: CatalogoSinapiRow[];
        total?: number;
        error?: string;
        emptyReason?: string | null;
        competencia?: string | null;
        fallbackUsado?: boolean;
        fallbackCompetencia?: string | null;
        avisoFallback?: string | null;
      };
      if (catalogReqRef.current !== reqId) return [];
      const items = Array.isArray(data.items) ? data.items : [];
      setCatalogRows(items);
      setCatalogTotal(Number(data.total) || items.length);
      const usada = (data.fallbackCompetencia ?? data.competencia ?? c).trim();
      if (data.fallbackUsado && usada) {
        aplicarCompetencia(usada, data.avisoFallback ?? `Sem preços em ${c}. Usando competência ${usada} (mais próxima com dados).`);
        setCatalogEmptyReason(null);
        setFonteSinapi(`Fonte dos custos: SINAPI — ${u} — competência ${usada}`);
        if (usada !== c) {
          skipCompRecalcRef.current = true;
          void recalcular(usada);
        }
      } else {
        setCatalogEmptyReason(items.length === 0 ? (data.emptyReason ?? data.error ?? null) : null);
        if (items.length > 0 && usada) {
          setFonteSinapi(`Fonte dos custos: SINAPI — ${u} — competência ${usada}`);
        }
      }
      if (!res.ok) {
        throw new Error(data.error ?? data.emptyReason ?? "Falha ao carregar o catálogo SINAPI.");
      }
      return items;
    } catch (err) {
      if (catalogReqRef.current !== reqId) return [];
      const message = err instanceof Error ? err.message : "Falha ao carregar o catálogo SINAPI.";
      setCatalogError(message);
      setCatalogEmptyReason(message);
      setCatalogRows([]);
      setCatalogTotal(0);
      if (/tabela|migration|sinapicomposicao/i.test(message)) setError(message);
      return [];
    } finally {
      if (catalogReqRef.current === reqId) setCatalogLoading(false);
    }
  }, [competencia, uf]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        if (isLocal) await loadLocal();
        else await loadSaved();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar o estudo.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetoId]);

  useEffect(() => {
    if (busy || !estudo || autoSyncRef.current || syncing) return;
    autoSyncRef.current = true;
    void atualizarSinapi({ auto: true });
    // uma vez após o estudo carregar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estudo, busy]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void carregarCatalogo();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [uf, competencia, carregarCatalogo]);

  useEffect(() => {
    if (skipUfRecalcRef.current) {
      skipUfRecalcRef.current = false;
      return;
    }
    if (!estudo) return;
    void recalcular();
    // Recalcula CUSTOS quando UF/tipo mudam; competência recarrega a lista (efeito acima) e o estudo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uf, tipo]);

  useEffect(() => {
    if (!estudo) return;
    if (skipCompRecalcRef.current) {
      skipCompRecalcRef.current = false;
      return;
    }
    const c = competencia.trim();
    if (!c) return;
    if (!/^\d{2}\/\d{4}$/.test(c) && !/^\d{6}$/.test(c) && !/^\d{4}-\d{2}$/.test(c)) return;
    const timer = window.setTimeout(() => {
      void recalcular();
    }, 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competencia]);

  async function recalcular(compOverride?: string) {
    if (compOverride?.trim()) aplicarCompetencia(compOverride.trim());
    setBusy(true);
    setError(null);
    try {
      if (isLocal) {
        await loadLocal();
        return;
      }
      if (!estudo?.id) {
        await loadSaved();
        return;
      }
      const extras = readViabilidadeSession();
      if (
        extras &&
        (isCadProject(extras.project) ||
          Number(extras.quantidadeLotes) > 0 ||
          Number(extras.areaTotal) > 0)
      ) {
        await loadFromCadPayload({
          projetoId: extras.projetoId ?? projetoId,
          project: extras.project,
          streetProfiles: extras.streetProfiles,
          plateauZ: extras.plateauZ,
          glebaId: extras.glebaId,
          larguraViaFallbackM: extras.larguraViaFallbackM,
          areaTotal: extras.areaTotal ?? 0,
          quantidadeLotes: extras.quantidadeLotes ?? 0,
          areaLotes: extras.areaLotes ?? 0,
          savedAt: extras.savedAt ?? new Date().toISOString(),
        });
        return;
      }
      const res = await fetch(`/api/viabilidade/${estudo.id}/calcular`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uf,
          municipio,
          competenciaSinapi: competenciaRef.current || competencia || null,
          premissas: premissasAtuais(),
          streetProfiles: extras?.streetProfiles,
          plateauZ: extras?.plateauZ,
          ...indiretosBody(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao recalcular.");
      applyEstudo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao recalcular.");
    } finally {
      setBusy(false);
      await carregarCatalogo(competenciaRef.current, uf);
    }
  }

  async function importarSinapi(file: File) {
    setImportMsg(null);
    if (!competencia.trim()) {
      setImportMsg("Informe a competência (MM/AAAA) antes de importar. Nenhuma outra competência é usada automaticamente.");
      return;
    }
    const form = new FormData();
    form.set("arquivo", file);
    form.set("uf", uf);
    form.set("competencia", competencia.trim());
    form.set("tipo", tipo);
    const res = await fetch("/api/viabilidade/sinapi/import", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      setImportMsg(data.error ?? "Falha na importação. O XLSX oficial da Caixa continua disponível como fallback.");
      return;
    }
    setImportMsg(`Importadas ${data.imported} composições. ${data.errors?.length ? `${data.errors.length} aviso(s).` : ""}`);
    if (typeof data.competencia === "string" && data.competencia.trim()) {
      setCompetencia(data.competencia.trim());
    }
    setFonteSinapi(`Fonte dos custos: SINAPI — ${uf} — competência ${data.competencia ?? competencia}`);
    await carregarCatalogo(data.competencia ?? competencia, uf);
    await recalcular();
  }

  async function atualizarSinapi(opts?: { auto?: boolean }) {
    setSyncMsg(null);
    if (!opts?.auto) setError(null);
    try {
      let comp = (competenciaRef.current || competencia).trim();
      if (!comp) {
        const disc = await fetch("/api/viabilidade/sinapi/sync?descobrir=1", { credentials: "include" });
        const data = await disc.json();
        if (!disc.ok || !data.competencia) {
          const msg = data.error ?? "Informe a competência SINAPI (MM/AAAA). Nenhuma competência foi inferida em silêncio.";
          if (opts?.auto) setSyncMsg(msg);
          else setError(msg);
          return;
        }
        comp = String(data.competencia);
        aplicarCompetencia(comp);
      }

      const aplicarResultadoSync = async (data: {
        competencia?: string;
        fallbackUsado?: boolean;
        avisoFallback?: string | null;
        fonteCustosLabel?: string;
      }) => {
        const usada = (data.competencia ?? comp).trim();
        if (data.fallbackUsado && usada) {
          aplicarCompetencia(usada, data.avisoFallback ?? `Sem preços em ${comp}. Usando competência ${usada} (mais próxima com dados).`);
          setSyncMsg(data.avisoFallback ?? `Sem preços em ${comp}. Usando competência ${usada} (mais próxima com dados).`);
          comp = usada;
        } else if (usada) {
          aplicarCompetencia(usada);
          comp = usada;
        }
        setFonteSinapi(data.fonteCustosLabel ?? `Fonte dos custos: SINAPI — ${uf} — competência ${comp}`);
        await carregarCatalogo(comp, uf);
        await recalcular(comp);
      };

      if (opts?.auto) {
        const st = await fetch(
          `/api/viabilidade/sinapi/sync?competencia=${encodeURIComponent(comp)}&uf=${encodeURIComponent(uf)}`,
          { credentials: "include" },
        );
        const status = await st.json();
        if (!st.ok) {
          const msg = status.error ?? "Falha ao consultar o catálogo SINAPI.";
          setCatalogError(msg);
          setError(msg);
          await carregarCatalogo(comp, uf);
          return;
        }
        if (Number(status.count) > 0) {
          setFonteSinapi(`Fonte dos custos: SINAPI — ${uf} — competência ${comp}`);
          await carregarCatalogo(comp, uf);
          await recalcular(comp);
          return;
        }
        const jaNoBanco = await carregarCatalogo(comp, uf);
        if (jaNoBanco.length > 0) {
          await recalcular(competenciaRef.current || comp);
          return;
        }
        setSyncing(true);
        const one = await fetch("/api/viabilidade/sinapi/sync", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uf,
            competencia: comp,
            tipo: tipo === "NAO_DESONERADO" ? "nao" : "desonerado",
          }),
        });
        const oneData = await one.json();
        if (one.ok) {
          await aplicarResultadoSync(oneData);
        } else {
          const msg = oneData.error ?? "A Caixa não entregou o arquivo automaticamente.";
          setSyncMsg(msg);
          await carregarCatalogo(comp, uf);
          await recalcular(comp);
        }
        return;
      }

      const fila = ordenarUfsComPrioridade(uf);
      setSyncing(true);
      const erros: string[] = [];
      let ufEstudoOk = false;
      let avisoLocal: string | null = null;
      for (let i = 0; i < fila.length; i++) {
        const atual = fila[i]!;
        setSyncProgress({ uf: atual, current: i + 1, total: fila.length });
        const res = await fetch("/api/viabilidade/sinapi/sync", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uf: atual,
            competencia: comp,
            tipo: tipo === "NAO_DESONERADO" ? "nao" : "desonerado",
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          erros.push(`${atual}: ${data.error ?? "falha no download"}`);
          continue;
        }
        if (data.fallbackUsado && data.competencia) {
          avisoLocal =
            data.avisoFallback ??
            `Sem preços em ${comp}. Usando competência ${data.competencia} (mais próxima com dados).`;
          aplicarCompetencia(String(data.competencia), avisoLocal);
          setSyncMsg(avisoLocal);
          comp = String(data.competencia);
        }
        if (atual === uf) {
          ufEstudoOk = true;
          setFonteSinapi(data.fonteCustosLabel ?? `Fonte dos custos: SINAPI — ${uf} — competência ${comp}`);
          await carregarCatalogo(comp, atual);
          await recalcular(comp);
        }
      }
      if (!ufEstudoOk) {
        const msg =
          erros.find((item) => item.startsWith(`${uf}:`)) ??
          erros[0] ??
          "Não existem preços disponíveis para esta competência nem nos 12 meses mais próximos.";
        setError(msg);
        setCatalogEmptyReason(msg);
        setSyncMsg(`${msg} Importe o XLSX/CSV oficial da Caixa abaixo.`);
      } else if (avisoLocal) {
        setSyncMsg(avisoLocal);
      } else if (erros.length) {
        setSyncMsg(`SINAPI ${uf} atualizado. Demais UFs: ${erros.length} falha(s). ${erros.slice(0, 3).join(" · ")}`);
      } else {
        setSyncMsg(`SINAPI sincronizado nas 27 UFs — competência ${comp}. O estudo usa preços de ${uf}.`);
      }
      await carregarCatalogo(comp, uf);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao sincronizar SINAPI.");
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  }

  const chartData = useMemo(() => {
    if (!estudo) return [];
    const map: Record<string, string | undefined> = {
      TERRAPLENAGEM: estudo.custoTerraplenagem,
      PAVIMENTACAO: estudo.custoPavimentacao,
      DRENAGEM: estudo.custoDrenagem,
      CALCADA: estudo.custoCalcadas,
      AGUA: estudo.custoAgua,
      ESGOTO: estudo.custoEsgoto,
      ENERGIA: estudo.custoEnergia,
      ILUMINACAO: estudo.custoIluminacao,
      ARBORIZACAO: estudo.custoArborizacao,
      SINALIZACAO: estudo.custoSinalizacao,
    };
    return Object.keys(CHART_LABELS)
      .map((key) => ({
        name: CHART_LABELS[key] ?? key,
        key,
        value: Number(map[key] ?? estudo.custosPorCategoria?.[key] ?? 0),
      }))
      .filter((row) => row.value > 0);
  }, [estudo]);

  const avisos = estudo?.avisos?.length ? estudo.avisos : [...AVISOS_ESTUDO];
  const fonteLabel = estudo?.fonteCustosLabel ?? fonteSinapi;
  const custosAgrupados = useMemo(() => {
    const map = new Map<string, NonNullable<EstudoPayload["itens"]>>();
    for (const item of estudo?.itens ?? []) {
      const list = map.get(item.categoria) ?? [];
      list.push(item);
      map.set(item.categoria, list);
    }
    return [...map.entries()];
  }, [estudo?.itens]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">DataGeo Digital</p>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-3xl">
          {estudo?.titulo ?? TITULO_ESTUDO}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Projeto: {estudo?.projetoNome ?? (isLocal ? "Loteamento local (não persistido)" : projetoId)}
          {estudo?.versao ? ` · Viabilidade v${estudo.versao}` : ""}
        </p>
        <p className="text-sm text-[var(--muted)]">
          Município: {municipio || "—"} · UF: {uf}
          {competencia ? ` · Competência SINAPI: ${competencia}` : ""}
        </p>
        {fonteLabel ? <p className="text-sm font-medium text-teal-800">{fonteLabel}</p> : null}
        {avisoCompetencia ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {avisoCompetencia}
          </p>
        ) : estudo?.alertaCompetencia ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {estudo.alertaCompetencia}
          </p>
        ) : null}
        {estudo?.desatualizado ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {estudo.avisoDesatualizado}
          </p>
        ) : null}
        {isLocal ? (
          <p className="text-sm text-[var(--muted)]">
            Extração local sem gravar no banco. Salve o projeto no CAD para persistir versões do estudo.
          </p>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-2">
        <Link href="/cad" className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--surface)]">
          Voltar ao CAD
        </Link>
        <Link href="/viabilidade" className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--surface)]">
          Estudos salvos
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => void recalcular()}
          className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
        >
          {busy ? "Calculando…" : "Recalcular estudo"}
        </button>
        <button
          type="button"
          onClick={() => setPrintOpen(true)}
          className="rounded-xl bg-[#0f2848] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e3a5f]"
        >
          GERAR ESTUDO DE VIABILIDADE
        </button>
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <section className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[var(--muted)]">
          UF
          <select value={uf} onChange={(e) => setUf(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
            {UFS_BRASIL.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--muted)]">
          Competência SINAPI
          <input
            value={competencia}
            onChange={(e) => {
              competenciaRef.current = e.target.value;
              setCompetencia(e.target.value);
              setAvisoCompetencia(null);
            }}
            placeholder="09/2026"
            className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Tipo
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "DESONERADO" | "NAO_DESONERADO")}
            className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
          >
            <option value="DESONERADO">Desonerado</option>
            <option value="NAO_DESONERADO">Não desonerado</option>
          </select>
        </label>
        <div className="flex flex-col justify-end gap-1 text-xs text-[var(--muted)]">
          <button
            type="button"
            disabled={syncing || busy}
            onClick={() => void atualizarSinapi()}
            className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
          >
            {syncing && syncProgress
              ? `Sincronizando ${syncProgress.uf}… ${syncProgress.current}/${syncProgress.total}`
              : "Atualizar SINAPI"}
          </button>
          <p>Baixa as 27 UFs da competência. O estudo usa só a UF selecionada.</p>
        </div>
        <label className="text-xs text-[var(--muted)]">
          Município
          <input value={municipio} onChange={(e) => setMunicipio(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Valor do terreno (R$)
          <input value={valorTerreno} onChange={(e) => setValorTerreno(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5 font-mono text-sm" />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Modalidade de receita
          <select value={modalidade} onChange={(e) => setModalidade(e.target.value as "M2" | "POR_LOTE")} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
            <option value="M2">Preço por m²</option>
            <option value="POR_LOTE">Preço por lote</option>
          </select>
        </label>
        <label className="text-xs text-[var(--muted)]">
          Preço de venda (R$/m²)
          <input value={precoM2} onChange={(e) => setPrecoM2(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5 font-mono text-sm" />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Contingência (%)
          <input value={contingencia} onChange={(e) => setContingencia(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5 font-mono text-sm" />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Projetos (R$)
          <input value={projetos} onChange={(e) => setProjetos(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5 font-mono text-sm" />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Licenciamento (R$)
          <input value={licenciamento} onChange={(e) => setLicenciamento(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5 font-mono text-sm" />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Registro (R$)
          <input value={registro} onChange={(e) => setRegistro(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5 font-mono text-sm" />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Administrativo (R$)
          <input value={administrativo} onChange={(e) => setAdministrativo(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5 font-mono text-sm" />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Comercial (R$)
          <input value={comercial} onChange={(e) => setComercial(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5 font-mono text-sm" />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Esgoto — sistema público?
          <select value={sistemaEsgoto} onChange={(e) => setSistemaEsgoto(e.target.value as "na" | "sim" | "nao")} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
            <option value="na">Não informado</option>
            <option value="sim">Sim — conexão à rede pública</option>
            <option value="nao">Não — solução específica necessária</option>
          </select>
        </label>
        <label className="text-xs text-[var(--muted)]">
          Corte manual (m³)
          <input value={corteManual} onChange={(e) => setCorteManual(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5 font-mono text-sm" />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Aterro manual (m³)
          <input value={aterroManual} onChange={(e) => setAterroManual(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5 font-mono text-sm" />
        </label>
        <div className="text-xs text-[var(--muted)] sm:col-span-2">
          Fallback — importar SINAPI (XLSX/CSV oficial da Caixa)
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.txt"
            className="mt-1 block w-full text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importarSinapi(file);
            }}
          />
          {syncProgress ? (
            <p className="mt-1 font-medium text-teal-800">
              Sincronizando {syncProgress.uf}… {syncProgress.current}/{syncProgress.total}
            </p>
          ) : null}
          {syncMsg ? <p className="mt-1 text-amber-900">{syncMsg}</p> : null}
          {catalogError ? <p className="mt-1 text-red-700">{catalogError}</p> : null}
          {importMsg ? <p className="mt-1 text-emerald-700">{importMsg}</p> : null}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Lista SINAPI — {uf}
          {competencia ? ` — competência ${competencia}` : ""}
        </h2>
        <p className="mb-3 text-sm text-[var(--text)]">
          {catalogLoading
            ? "Atualizando catálogo…"
            : catalogTotal > catalogRows.length
              ? `Exibindo ${catalogRows.length} de ${catalogTotal} composições.`
              : `${catalogTotal} composições`}
        </p>
        {catalogError ? (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{catalogError}</p>
        ) : null}
        {!catalogLoading && avisoCompetencia ? (
          <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {avisoCompetencia}
          </p>
        ) : null}
        {!catalogLoading && catalogRows.length === 0 && catalogEmptyReason ? (
          <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {catalogEmptyReason}
          </p>
        ) : null}
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--surface)] text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 font-semibold">Código</th>
                <th className="px-3 py-2 font-semibold">Descrição</th>
                <th className="px-3 py-2 font-semibold">Unidade</th>
                <th className="px-3 py-2 font-semibold">UF</th>
                <th className="px-3 py-2 font-semibold">Competência</th>
                <th className="px-3 py-2 font-semibold">Custo</th>
                <th className="px-3 py-2 font-semibold">Fonte</th>
              </tr>
            </thead>
            <tbody>
              {catalogRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[var(--muted)]">
                    {catalogLoading
                      ? "Carregando composições SINAPI…"
                      : catalogEmptyReason ??
                        `Nenhuma composição para ${uf}${competencia ? ` ${competencia}` : ""}. Clique em Atualizar SINAPI ou importe o XLSX oficial.`}
                  </td>
                </tr>
              ) : (
                catalogRows.map((row) => {
                  const bruto =
                    tipo === "NAO_DESONERADO"
                      ? (row.custoNaoDesonerado ?? row.custoDesonerado)
                      : (row.custoDesonerado ?? row.custoNaoDesonerado);
                  return (
                    <tr key={`${row.codigo}-${row.uf}-${row.competencia}`} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 font-mono text-xs">{row.codigo}</td>
                      <td className="px-3 py-2">{row.descricao}</td>
                      <td className="px-3 py-2">{row.unidade}</td>
                      <td className="px-3 py-2">{row.uf}</td>
                      <td className="px-3 py-2">{row.competencia}</td>
                      <td className="px-3 py-2 tabular-nums">{bruto != null && bruto !== "" ? formatBRL(bruto) : "—"}</td>
                      <td className="px-3 py-2">SINAPI</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Resumo</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card label="Área total" value={formatArea(estudo?.extraido?.areaTotal)} />
          <Card label="Número de lotes" value={String(estudo?.extraido?.quantidadeLotes ?? 0)} />
          <Card label="Área comercializável" value={formatArea(estudo?.extraido?.areaLotes)} />
          <Card label="Investimento total" value={formatBRL(estudo?.custoTotal)} />
          <Card label="Receita estimada" value={formatBRL(estudo?.receitaEstimada)} />
          <Card label="Lucro estimado" value={formatBRL(estudo?.lucroEstimado)} />
          <Card label="Margem" value={formatPct(estudo?.margemPercentual)} />
          <Card label="ROI" value={formatPct(estudo?.roiPercentual)} />
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Custos — tabela SINAPI</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Colunas no padrão da planilha Caixa. Preços do estudo usam a UF {uf}
          {competencia ? ` · competência ${competencia}` : ""}.
        </p>
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--surface)] text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 font-semibold">Código</th>
                <th className="px-3 py-2 font-semibold">Descrição</th>
                <th className="px-3 py-2 font-semibold">Unidade</th>
                <th className="px-3 py-2 font-semibold">UF</th>
                <th className="px-3 py-2 font-semibold">Competência</th>
                <th className="px-3 py-2 font-semibold">Custo desonerado</th>
                <th className="px-3 py-2 font-semibold">Custo não desonerado</th>
                <th className="px-3 py-2 font-semibold">Fonte</th>
                <th className="px-3 py-2 font-semibold">Qtd.</th>
                <th className="px-3 py-2 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {custosAgrupados.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-[var(--muted)]">
                    Sem itens ainda. Sincronize o SINAPI ou importe o XLSX oficial.
                  </td>
                </tr>
              ) : (
                custosAgrupados.map(([categoria, itens]) => (
                  <Fragment key={categoria}>
                    <tr className="border-t border-[var(--border)] bg-slate-50">
                      <td colSpan={10} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                        {CHART_LABELS[categoria] ?? categoria}
                      </td>
                    </tr>
                    {itens.map((item, idx) => {
                      const ausente = item.origemValor === "AUSENTE";
                      const deson = tipo === "DESONERADO" && !ausente ? formatBRL(item.custoUnitario) : "—";
                      const naoDeson = tipo === "NAO_DESONERADO" && !ausente ? formatBRL(item.custoUnitario) : "—";
                      return (
                        <tr key={item.id ?? `${categoria}-${idx}`} className="border-t border-[var(--border)]">
                          <td className="px-3 py-2 font-mono text-xs">{item.codigoReferencia ?? "—"}</td>
                          <td className="px-3 py-2">
                            {item.descricao}
                            {ausente ? (
                              <span className="ml-2 text-xs text-amber-700">Composição não encontrada</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">{item.unidade}</td>
                          <td className="px-3 py-2">{item.uf ?? uf}</td>
                          <td className="px-3 py-2">{item.competencia ?? competencia ?? "—"}</td>
                          <td className="px-3 py-2 tabular-nums">{deson}</td>
                          <td className="px-3 py-2 tabular-nums">{naoDeson}</td>
                          <td className="px-3 py-2">{item.fonte ?? item.origemValor ?? "—"}</td>
                          <td className="px-3 py-2 tabular-nums">{formatNum(item.quantidade)}</td>
                          <td className="px-3 py-2 tabular-nums font-medium">{ausente ? "—" : formatBRL(item.custoTotal)}</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Distribuição dos custos</h2>
          {chartData.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Sem custos com preço encontrado para o gráfico.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                    {chartData.map((entry) => (
                      <Cell key={entry.key} fill={CHART_COLORS[entry.key] ?? "#64748b"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatBRL(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Viabilidade — semáforo</h2>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["Urbanística", estudo?.semaforos?.urbanistica ?? "NAO_ANALISADO"],
                ["Ambiental", estudo?.semaforos?.ambiental ?? "NAO_ANALISADO"],
                ["Infraestrutura", estudo?.semaforos?.infraestrutura ?? "NAO_ANALISADO"],
                ["Econômica", estudo?.semaforos?.economica ?? "NAO_ANALISADO"],
              ] as const
            ).map(([label, status]) => (
              <div key={label} className={`rounded-xl border px-3 py-4 text-center ${semaforoClass(status)}`}>
                <p className="text-xs font-semibold uppercase">{label}</p>
                <p className="mt-1 text-lg font-bold">{status}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Cenários</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {(estudo?.cenarios ?? []).map((cenario) => (
            <div key={cenario.nome} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <p className="text-sm font-semibold">{cenario.nome}</p>
              <p className="mt-2 text-sm">Receita: {formatBRL(cenario.receita)}</p>
              <p className="text-sm">Custo: {formatBRL(cenario.custo)}</p>
              <p className="text-sm">Lucro: {formatBRL(cenario.lucro)}</p>
              <p className="text-sm">Margem: {formatPct(cenario.margem)}</p>
              <p className="text-sm">ROI: {formatPct(cenario.roi)}</p>
            </div>
          ))}
        </div>
        {estudo?.pontoEquilibrio ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            Ponto de equilíbrio: {formatNum(estudo.pontoEquilibrio.quantidadeLotes, 2)} lote(s) — {estudo.pontoEquilibrio.observacao}
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Validações urbanísticas</h2>
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--surface)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">Parâmetro</th>
                <th className="px-3 py-2">Projeto</th>
                <th className="px-3 py-2">Mínimo</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {(estudo?.validacoes ?? []).map((row) => (
                <tr key={row.parametro} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">{row.parametro}</td>
                  <td className="px-3 py-2 tabular-nums">{row.valorProjeto ?? "—"} {row.unidade}</td>
                  <td className="px-3 py-2 tabular-nums">{row.valorMinimo ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${semaforoClass(row.status)}`}>{row.status}</span>
                  </td>
                  <td className="px-3 py-2 text-[var(--muted)]">{row.mensagem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <h2 className="mb-2 font-semibold">Avisos e limitações</h2>
        <ul className="list-disc space-y-1 pl-5">
          {avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      </section>

      {printOpen ? (
        <div className="fixed inset-0 z-50 overflow-auto bg-black/50 p-4">
          <div className="mx-auto max-w-4xl rounded-xl bg-white p-6 text-black">
            <div className="mb-4 flex justify-between gap-2">
              <h2 className="text-xl font-semibold">{TITULO_ESTUDO}</h2>
              <div className="flex gap-2">
                <button type="button" className="rounded-lg bg-[#0f2848] px-3 py-1.5 text-sm text-white" onClick={() => window.print()}>
                  Imprimir / PDF
                </button>
                <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setPrintOpen(false)}>
                  Fechar
                </button>
              </div>
            </div>
            <div className="page space-y-3 text-sm">
              <p><strong>Empreendimento:</strong> {estudo?.projetoNome}</p>
              <p><strong>Município / UF:</strong> {municipio || "—"} / {uf}</p>
              <p><strong>Área do imóvel:</strong> {formatArea(estudo?.extraido?.areaTotal)}</p>
              <p><strong>Lotes:</strong> {estudo?.extraido?.quantidadeLotes}</p>
              <p><strong>Áreas públicas:</strong> verde {formatArea(estudo?.extraido?.areaVerde)}; institucional {formatArea(estudo?.extraido?.areaInstitucional)}; APP {formatArea(estudo?.extraido?.areaApp)}</p>
              <p><strong>Sistema viário:</strong> {formatArea(estudo?.extraido?.areaVias)}</p>
              <p><strong>Fonte dos preços:</strong> {estudo?.fonteCustosLabel}</p>
              <p><strong>Investimento:</strong> {formatBRL(estudo?.custoTotal)}</p>
              <p><strong>Receita:</strong> {formatBRL(estudo?.receitaEstimada)}</p>
              <p><strong>Lucro / margem / ROI:</strong> {formatBRL(estudo?.lucroEstimado)} · {formatPct(estudo?.margemPercentual)} · {formatPct(estudo?.roiPercentual)}</p>
              <p><strong>Ponto de equilíbrio:</strong> {formatNum(estudo?.pontoEquilibrio?.quantidadeLotes, 2)} lotes</p>
              <h3 className="font-semibold">Cenários</h3>
              {(estudo?.cenarios ?? []).map((c) => (
                <p key={c.nome}>{c.nome}: receita {formatBRL(c.receita)}, custo {formatBRL(c.custo)}, lucro {formatBRL(c.lucro)}</p>
              ))}
              <h3 className="font-semibold">Limitações</h3>
              {avisos.map((a) => (
                <p key={a}>{a}</p>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
