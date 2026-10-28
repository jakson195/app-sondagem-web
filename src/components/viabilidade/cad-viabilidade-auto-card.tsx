"use client";

import { useEffect, useRef, useState } from "react";
import type { ViabilidadeSessionPayload } from "@/lib/viabilidade/cad-session";
import {
  calcularViabilidadeAutomatica,
  DEFAULT_AUTO_PREFS,
  readAutoPrefs,
  writeAutoPrefs,
  type ViabilidadeAutoEtapa,
  type ViabilidadeAutoPrefs,
  type ViabilidadeAutoResumo,
} from "@/lib/viabilidade/auto-cad";
import { formatArea, formatBRL, formatPct } from "@/lib/viabilidade/format";
import { UFS_BRASIL } from "@/lib/viabilidade/sinapi-ufs";

const ETAPA_LABEL: Record<ViabilidadeAutoEtapa, string> = {
  competencia: "Consultando competência SINAPI…",
  sinapi: "Sincronizando tabela SINAPI da UF…",
  calculo: "Calculando custos e indicadores…",
};

const CATEGORIA_LABEL: Record<string, string> = {
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

function semaforoDot(status?: string) {
  if (status === "OK") return "bg-emerald-500";
  if (status === "ALERTA") return "bg-amber-400";
  if (status === "INCONFORME") return "bg-red-500";
  return "bg-gray-300";
}

type Props = {
  /** Muda sempre que a geometria do loteamento muda. */
  signature: string;
  /** Só calcula quando existem lotes no desenho. */
  ready: boolean;
  /** Monta o payload atual do CAD (lido no momento do cálculo). */
  buildPayload: () => ViabilidadeSessionPayload;
  /** Abre o estudo completo com as mesmas preferências. */
  onOpenEstudo: (prefs: ViabilidadeAutoPrefs) => void;
};

export function CadViabilidadeAutoCard({ signature, ready, buildPayload, onOpenEstudo }: Props) {
  const [prefs, setPrefs] = useState<ViabilidadeAutoPrefs>(DEFAULT_AUTO_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [etapa, setEtapa] = useState<ViabilidadeAutoEtapa | null>(null);
  const [resumo, setResumo] = useState<ViabilidadeAutoResumo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forceTick, setForceTick] = useState(0);
  const buildRef = useRef(buildPayload);
  buildRef.current = buildPayload;
  const reqRef = useRef(0);

  useEffect(() => {
    setPrefs(readAutoPrefs());
    setPrefsLoaded(true);
  }, []);

  function updatePrefs(patch: Partial<ViabilidadeAutoPrefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      writeAutoPrefs(next);
      return next;
    });
  }

  useEffect(() => {
    if (!prefsLoaded || !ready) return;
    if (!prefs.enabled && forceTick === 0) return;
    const reqId = ++reqRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setError(null);
      void (async () => {
        try {
          const payload = buildRef.current();
          const out = await calcularViabilidadeAutomatica({
            payload,
            prefs,
            signal: controller.signal,
            onEtapa: (e) => {
              if (reqRef.current === reqId) setEtapa(e);
            },
          });
          if (reqRef.current === reqId) setResumo(out);
        } catch (err) {
          if (controller.signal.aborted || reqRef.current !== reqId) return;
          setError(err instanceof Error ? err.message : "Falha ao calcular a viabilidade.");
        } finally {
          if (reqRef.current === reqId) setEtapa(null);
        }
      })();
    }, 900);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // prefs.precoVendaM2 é digitado: o debounce acima evita chamadas a cada tecla.
  }, [signature, ready, prefsLoaded, prefs.enabled, prefs.uf, prefs.tipo, prefs.precoVendaM2, forceTick]);

  const categorias = Object.entries(resumo?.custosPorCategoria ?? {})
    .map(([k, v]) => [k, Number(v)] as const)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const lucro = Number(resumo?.lucroEstimado ?? 0);
  const semReceita = !(Number(resumo?.receitaEstimada) > 0);

  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/40 px-3 py-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-800">
          Viabilidade automática (SINAPI)
        </p>
        <label className="flex items-center gap-1 text-[10px] text-[#374151]">
          <input
            type="checkbox"
            checked={prefs.enabled}
            onChange={(e) => updatePrefs({ enabled: e.target.checked })}
            className="rounded border-[#d1d5db]"
          />
          Automático
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[10px] text-[#6b7280]">
          UF (SINAPI)
          <select
            value={prefs.uf}
            onChange={(e) => updatePrefs({ uf: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[#d1d5db] bg-white px-2 py-1.5 text-xs"
          >
            {UFS_BRASIL.map((sigla) => (
              <option key={sigla} value={sigla}>
                {sigla}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[10px] text-[#6b7280]">
          Encargos
          <select
            value={prefs.tipo}
            onChange={(e) => updatePrefs({ tipo: e.target.value === "NAO_DESONERADO" ? "NAO_DESONERADO" : "DESONERADO" })}
            className="mt-1 w-full rounded-lg border border-[#d1d5db] bg-white px-2 py-1.5 text-xs"
          >
            <option value="DESONERADO">Desonerado</option>
            <option value="NAO_DESONERADO">Não desonerado</option>
          </select>
        </label>
      </div>
      <label className="block text-[10px] text-[#6b7280]">
        Preço de venda (R$/m² de lote)
        <input
          type="text"
          inputMode="decimal"
          placeholder="ex.: 450"
          value={prefs.precoVendaM2}
          onChange={(e) => updatePrefs({ precoVendaM2: e.target.value })}
          className="mt-1 w-full rounded-lg border border-[#d1d5db] bg-white px-3 py-1.5 font-mono text-xs"
        />
      </label>

      {!ready ? (
        <p className="text-[11px] text-[#6b7280]">Gere o loteamento para calcular a viabilidade automaticamente.</p>
      ) : null}
      {etapa ? <p className="text-[11px] text-teal-800">{ETAPA_LABEL[etapa]}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      {resumo && ready ? (
        <div className={`space-y-1.5 text-[11px] text-[#0f2848] ${etapa ? "opacity-60" : ""}`}>
          <p className="text-[10px] text-[#6b7280]">
            {resumo.fonteCustosLabel ?? `SINAPI — ${resumo.uf} — competência ${resumo.competencia ?? "indisponível"}`}
          </p>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            <span className="text-[#6b7280]">Lotes</span>
            <span className="text-right font-medium">{resumo.quantidadeLotes ?? 0}</span>
            <span className="text-[#6b7280]">Área vendável</span>
            <span className="text-right font-medium">{formatArea(resumo.areaLotes)}</span>
            <span className="text-[#6b7280]">Infraestrutura</span>
            <span className="text-right font-medium">{formatBRL(resumo.custoInfraestrutura)}</span>
            <span className="text-[#6b7280]">Investimento total</span>
            <span className="text-right font-semibold">{formatBRL(resumo.custoTotal)}</span>
            <span className="text-[#6b7280]">Custo por lote</span>
            <span className="text-right font-medium">{formatBRL(resumo.custoPorLote)}</span>
            {!semReceita ? (
              <>
                <span className="text-[#6b7280]">Receita</span>
                <span className="text-right font-medium">{formatBRL(resumo.receitaEstimada)}</span>
                <span className="text-[#6b7280]">Lucro</span>
                <span className={`text-right font-semibold ${lucro < 0 ? "text-red-600" : "text-emerald-700"}`}>
                  {formatBRL(resumo.lucroEstimado)}
                </span>
                <span className="text-[#6b7280]">Margem / ROI</span>
                <span className="text-right font-medium">
                  {formatPct(resumo.margemPercentual)} / {formatPct(resumo.roiPercentual)}
                </span>
              </>
            ) : null}
          </div>
          {semReceita ? (
            <p className="text-[10px] text-amber-700">Informe o preço de venda por m² para ver receita, lucro, margem e ROI.</p>
          ) : null}

          {categorias.length > 0 ? (
            <div className="space-y-0.5 border-t border-teal-100 pt-1">
              {categorias.slice(0, 6).map(([k, v]) => (
                <div key={k} className="flex justify-between text-[10px]">
                  <span className="text-[#6b7280]">{CATEGORIA_LABEL[k] ?? k}</span>
                  <span>{formatBRL(v)}</span>
                </div>
              ))}
            </div>
          ) : null}

          {resumo.semaforos ? (
            <div className="flex flex-wrap gap-2 border-t border-teal-100 pt-1 text-[10px] text-[#374151]">
              {(
                [
                  ["Urbanística", resumo.semaforos.urbanistica],
                  ["Ambiental", resumo.semaforos.ambiental],
                  ["Infraestrutura", resumo.semaforos.infraestrutura],
                  ["Econômica", resumo.semaforos.economica],
                ] as const
              ).map(([label, status]) => (
                <span key={label} className="flex items-center gap-1" title={status}>
                  <span className={`inline-block h-2 w-2 rounded-full ${semaforoDot(status)}`} />
                  {label}
                </span>
              ))}
            </div>
          ) : null}

          {resumo.avisoSinapi ? <p className="text-[10px] text-amber-700">{resumo.avisoSinapi}</p> : null}
          {(resumo.precosAusentes ?? 0) > 0 ? (
            <p className="text-[10px] text-amber-700">
              {resumo.precosAusentes} item(ns) sem preço SINAPI/SICRO nesta competência — abra o estudo completo para
              importar a tabela ou informar valores.
            </p>
          ) : null}
          {resumo.alertaCompetencia ? <p className="text-[10px] text-amber-700">{resumo.alertaCompetencia}</p> : null}
          <p className="text-[9px] text-[#9ca3af]">
            Estudo preliminar. Quantitativos sem projeto executivo são estimativos.
          </p>
        </div>
      ) : null}

      <div className="flex gap-2">
        {!prefs.enabled ? (
          <button
            type="button"
            disabled={!ready || etapa !== null}
            onClick={() => setForceTick((n) => n + 1)}
            className="flex-1 rounded-lg border border-teal-700 px-3 py-1.5 text-[11px] font-medium text-teal-800 disabled:opacity-40"
          >
            Calcular agora
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onOpenEstudo(prefs)}
          className="flex-1 rounded-lg bg-teal-700 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-teal-800"
        >
          Abrir estudo completo
        </button>
      </div>
    </div>
  );
}
