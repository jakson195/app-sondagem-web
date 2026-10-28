/**
 * Viabilidade automática a partir do loteamento do Ambiente CAD.
 *
 * Fluxo (cliente):
 * 1. Descobre a competência SINAPI publicada mais recente (uma vez por sessão).
 * 2. Verifica se a UF já tem preços dessa competência no banco; se não, sincroniza só essa UF.
 * 3. Envia o projeto para `/api/viabilidade/preview` (não persiste) e devolve o resumo.
 *
 * Nenhum preço é inventado: se a Caixa não entregar a tabela e não houver dados no banco,
 * o estudo volta com `precosAusentes > 0` e a UI avisa.
 */
import type { ViabilidadeSessionPayload } from "./cad-session";
import { VIABILIDADE_LOCAL_ID } from "./types";

export type ViabilidadeAutoPrefs = {
  enabled: boolean;
  uf: string;
  tipo: "DESONERADO" | "NAO_DESONERADO";
  precoVendaM2: string;
};

const PREFS_KEY = "datageo.viabilidade.auto";

export const DEFAULT_AUTO_PREFS: ViabilidadeAutoPrefs = {
  enabled: true,
  uf: "SC",
  tipo: "DESONERADO",
  precoVendaM2: "",
};

export function readAutoPrefs(): ViabilidadeAutoPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_AUTO_PREFS;
    const parsed = JSON.parse(raw) as Partial<ViabilidadeAutoPrefs>;
    return {
      enabled: parsed.enabled !== false,
      uf: typeof parsed.uf === "string" && parsed.uf ? parsed.uf.toUpperCase() : DEFAULT_AUTO_PREFS.uf,
      tipo: parsed.tipo === "NAO_DESONERADO" ? "NAO_DESONERADO" : "DESONERADO",
      precoVendaM2: typeof parsed.precoVendaM2 === "string" ? parsed.precoVendaM2 : "",
    };
  } catch {
    return DEFAULT_AUTO_PREFS;
  }
}

export function writeAutoPrefs(prefs: ViabilidadeAutoPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage indisponível — preferências ficam só em memória */
  }
}

export type ViabilidadeAutoEtapa = "competencia" | "sinapi" | "calculo";

export type ViabilidadeAutoResumo = {
  uf: string;
  competencia: string | null;
  fonteCustosLabel?: string;
  avisoSinapi?: string | null;
  quantidadeLotes?: number;
  areaTotal?: number;
  areaLotes?: number;
  custoInfraestrutura?: string;
  custoTotal?: string;
  receitaEstimada?: string;
  lucroEstimado?: string;
  margemPercentual?: string;
  roiPercentual?: string;
  custoPorLote?: string;
  custosPorCategoria?: Record<string, string>;
  semaforos?: { urbanistica: string; ambiental: string; infraestrutura: string; economica: string };
  precosAusentes?: number;
  alertaCompetencia?: string | null;
  calculadoEm: string;
};

let competenciaPublicadaCache: string | null = null;
const ufCompSincronizada = new Set<string>();

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function descobrirCompetencia(): Promise<string | null> {
  if (competenciaPublicadaCache) return competenciaPublicadaCache;
  const res = await fetch("/api/viabilidade/sinapi/sync?descobrir=1", { credentials: "include" });
  const data = await readJson(res);
  const comp = res.ok && typeof data.competencia === "string" ? data.competencia.trim() : "";
  if (comp) competenciaPublicadaCache = comp;
  return comp || null;
}

/** Garante preços da UF na competência; devolve a competência efetivamente usada. */
async function garantirSinapi(
  uf: string,
  competencia: string,
  tipo: ViabilidadeAutoPrefs["tipo"],
  onEtapa?: (etapa: ViabilidadeAutoEtapa) => void,
): Promise<{ competencia: string; fonte?: string; aviso?: string | null }> {
  const key = `${uf}|${competencia}`;
  if (ufCompSincronizada.has(key)) return { competencia };

  const st = await fetch(
    `/api/viabilidade/sinapi/sync?competencia=${encodeURIComponent(competencia)}&uf=${encodeURIComponent(uf)}`,
    { credentials: "include" },
  );
  const status = await readJson(st);
  if (st.ok && Number(status.count) > 0) {
    ufCompSincronizada.add(key);
    return { competencia, fonte: `Fonte dos custos: SINAPI — ${uf} — competência ${competencia}` };
  }

  onEtapa?.("sinapi");
  const res = await fetch("/api/viabilidade/sinapi/sync", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uf, competencia, tipo: tipo === "NAO_DESONERADO" ? "nao" : "desonerado" }),
  });
  const data = await readJson(res);
  if (!res.ok) {
    return {
      competencia,
      aviso:
        typeof data.error === "string"
          ? `SINAPI ${uf} ${competencia}: ${data.error}`
          : `Não foi possível sincronizar o SINAPI ${uf} ${competencia}.`,
    };
  }
  const usada = typeof data.competencia === "string" && data.competencia.trim() ? data.competencia.trim() : competencia;
  ufCompSincronizada.add(`${uf}|${usada}`);
  return {
    competencia: usada,
    fonte: typeof data.fonteCustosLabel === "string" ? data.fonteCustosLabel : undefined,
    aviso: data.fallbackUsado ? (typeof data.avisoFallback === "string" ? data.avisoFallback : null) : null,
  };
}

export async function calcularViabilidadeAutomatica(input: {
  payload: ViabilidadeSessionPayload;
  prefs: ViabilidadeAutoPrefs;
  signal?: AbortSignal;
  onEtapa?: (etapa: ViabilidadeAutoEtapa) => void;
}): Promise<ViabilidadeAutoResumo> {
  const { payload, prefs, onEtapa } = input;
  const uf = prefs.uf.toUpperCase();

  onEtapa?.("competencia");
  let competencia: string | null = null;
  let fonte: string | undefined;
  let avisoSinapi: string | null | undefined;
  try {
    const publicada = await descobrirCompetencia();
    if (publicada) {
      const garantido = await garantirSinapi(uf, publicada, prefs.tipo, onEtapa);
      competencia = garantido.competencia;
      fonte = garantido.fonte;
      avisoSinapi = garantido.aviso;
    } else {
      avisoSinapi = "Não foi possível descobrir a competência SINAPI publicada pela Caixa.";
    }
  } catch (err) {
    avisoSinapi = err instanceof Error ? err.message : "Falha ao consultar o SINAPI.";
  }
  if (input.signal?.aborted) throw new DOMException("Cancelado", "AbortError");

  onEtapa?.("calculo");
  const res = await fetch("/api/viabilidade/preview", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    signal: input.signal,
    body: JSON.stringify({
      projetoId: payload.projetoId ?? VIABILIDADE_LOCAL_ID,
      project: payload.project,
      streetProfiles: payload.streetProfiles,
      plateauZ: payload.plateauZ,
      glebaId: payload.glebaId,
      larguraViaFallbackM: payload.larguraViaFallbackM,
      areaTotal: payload.areaTotal,
      quantidadeLotes: payload.quantidadeLotes,
      areaLotes: payload.areaLotes,
      uf,
      competenciaSinapi: competencia,
      premissas: {
        modalidadeReceita: "M2",
        precoVendaM2: prefs.precoVendaM2.trim().replace(",", ".") || undefined,
        tipoCustoSinapi: prefs.tipo,
        larguraCalcadaM: payload.larguraCalcadaM != null ? String(payload.larguraCalcadaM) : undefined,
      },
    }),
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Falha ao calcular a viabilidade.");
  }
  const extraido = (data.extraido ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (v == null ? undefined : String(v));
  return {
    uf,
    competencia: str(data.competenciaSinapi) ?? competencia,
    fonteCustosLabel: str(data.fonteCustosLabel) ?? fonte,
    avisoSinapi: avisoSinapi ?? null,
    quantidadeLotes: Number(extraido.quantidadeLotes ?? payload.quantidadeLotes) || 0,
    areaTotal: Number(extraido.areaTotal ?? payload.areaTotal) || 0,
    areaLotes: Number(extraido.areaLotes ?? payload.areaLotes) || 0,
    custoInfraestrutura: str(data.custoInfraestrutura),
    custoTotal: str(data.custoTotal),
    receitaEstimada: str(data.receitaEstimada),
    lucroEstimado: str(data.lucroEstimado),
    margemPercentual: str(data.margemPercentual),
    roiPercentual: str(data.roiPercentual),
    custoPorLote: str(data.custoPorLote),
    custosPorCategoria: (data.custosPorCategoria as Record<string, string>) ?? undefined,
    semaforos: data.semaforos as ViabilidadeAutoResumo["semaforos"],
    precosAusentes: Number(data.precosAusentes) || 0,
    alertaCompetencia: (data.alertaCompetencia as string | null) ?? null,
    calculadoEm: new Date().toISOString(),
  };
}

/** Assinatura barata da geometria do loteamento — muda quando lotes/vias/calçadas mudam. */
export function loteamentoSignature(
  entities: ReadonlyArray<{ id: string; layerId: string; type: string; vertices?: ReadonlyArray<{ x: number; y: number }> }>,
): string {
  let n = 0;
  let acc = 0;
  for (const e of entities) {
    if (!/^(loteamento_|area_|drenagem_)/i.test(e.layerId)) continue;
    n += 1;
    const vs = e.vertices ?? [];
    acc += vs.length * 7;
    for (const v of vs) acc += Math.round(v.x * 10) * 3 + Math.round(v.y * 10);
    acc %= 1_000_000_007;
  }
  return `${n}:${acc}`;
}

export function hasLotes(entities: ReadonlyArray<{ layerId: string }>): boolean {
  return entities.some((e) => e.layerId.toLowerCase() === "loteamento_lotes");
}
