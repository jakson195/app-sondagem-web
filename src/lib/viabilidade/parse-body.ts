import type { Prisma } from "@prisma/client";
import type { StreetProfileDraft } from "@/lib/rtk-validation/cad/street-profile";
import type { MetricasCadFallback } from "./extrator";
import { D } from "./money";
import type { CustosIndiretosInput } from "./pipeline";
import { defaultPremissas } from "./premissas-default";
import type { AdapterOptions } from "./project-adapter";
import type { TipoCustoSinapi, ViabilidadePremissas } from "./types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length ? t : null;
}

export function parsePremissas(raw: unknown): ViabilidadePremissas {
  const rec = isRecord(raw) ? raw : {};
  const tipo = rec.tipoCustoSinapi === "NAO_DESONERADO" ? "NAO_DESONERADO" : "DESONERADO";
  const modalidade = rec.modalidadeReceita === "POR_LOTE" ? "POR_LOTE" : "M2";
  const precosPorLote = isRecord(rec.precosPorLote)
    ? Object.fromEntries(Object.entries(rec.precosPorLote).map(([k, v]) => [k, String(v ?? "")]))
    : undefined;
  let sistema: boolean | null = null;
  if (rec.sistemaPublicoEsgoto === true || rec.sistemaPublicoEsgoto === "sim") sistema = true;
  if (rec.sistemaPublicoEsgoto === false || rec.sistemaPublicoEsgoto === "nao") sistema = false;
  return defaultPremissas({
    modalidadeReceita: modalidade,
    precoVendaM2: rec.precoVendaM2 != null ? String(rec.precoVendaM2) : undefined,
    precosPorLote,
    tipoCustoSinapi: tipo as TipoCustoSinapi,
    percentualContingencia: rec.percentualContingencia != null ? String(rec.percentualContingencia) : undefined,
    larguraCalcadaM: rec.larguraCalcadaM != null ? String(rec.larguraCalcadaM) : undefined,
    numeroLadosCalcada: typeof rec.numeroLadosCalcada === "number" ? rec.numeroLadosCalcada : undefined,
    percentualPisoTatil: rec.percentualPisoTatil != null ? String(rec.percentualPisoTatil) : undefined,
    percentualAcessibilidade: rec.percentualAcessibilidade != null ? String(rec.percentualAcessibilidade) : undefined,
    tipoCalcada: rec.tipoCalcada != null ? String(rec.tipoCalcada) : undefined,
    espacamentoMudasM: rec.espacamentoMudasM != null ? String(rec.espacamentoMudasM) : undefined,
    numeroLadosArborizacao: typeof rec.numeroLadosArborizacao === "number" ? rec.numeroLadosArborizacao : undefined,
    percentualRedePrincipalAgua:
      rec.percentualRedePrincipalAgua != null ? String(rec.percentualRedePrincipalAgua) : undefined,
    sistemaPublicoEsgoto: sistema,
    orcamentoConcessionariaEnergia:
      rec.orcamentoConcessionariaEnergia != null ? String(rec.orcamentoConcessionariaEnergia) : undefined,
    volumeCorteManualM3: rec.volumeCorteManualM3 != null ? String(rec.volumeCorteManualM3) : undefined,
    volumeAterroManualM3: rec.volumeAterroManualM3 != null ? String(rec.volumeAterroManualM3) : undefined,
    municipio: rec.municipio != null ? String(rec.municipio) : undefined,
  });
}

export function parseIndiretos(raw: unknown): CustosIndiretosInput {
  const rec = isRecord(raw) ? raw : {};
  const pick = (key: string) => (rec[key] != null && rec[key] !== "" ? D(String(rec[key])) : null);
  return {
    valorTerreno: pick("valorTerreno"),
    custoProjetos: pick("custoProjetos"),
    custoLicenciamento: pick("custoLicenciamento"),
    custoRegistro: pick("custoRegistro"),
    custoAdministrativo: pick("custoAdministrativo"),
    custoComercial: pick("custoComercial"),
  };
}

export function premissasFromJson(value: Prisma.JsonValue | null | undefined): ViabilidadePremissas {
  return parsePremissas(value);
}

function asPositiveNumber(value: unknown): number | undefined {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value.trim().replace(",", "."))
        : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function parseAdapterOptions(body: Record<string, unknown>, projetoId: string): AdapterOptions {
  const plateauZ = typeof body.plateauZ === "number" && Number.isFinite(body.plateauZ) ? body.plateauZ : null;
  const glebaId = typeof body.glebaId === "string" && body.glebaId.trim() ? body.glebaId.trim() : null;
  const largura = asPositiveNumber(body.larguraViaFallbackM);
  return {
    projetoId,
    streetProfiles: Array.isArray(body.streetProfiles) ? (body.streetProfiles as StreetProfileDraft[]) : [],
    plateauZ,
    glebaId,
    larguraViaFallbackM: largura,
  };
}

export function parseCadMetricFallbacks(body: Record<string, unknown>): MetricasCadFallback {
  const quantidade = asPositiveNumber(body.quantidadeLotes);
  return {
    areaTotal: asPositiveNumber(body.areaTotal),
    quantidadeLotes: quantidade != null ? Math.round(quantidade) : undefined,
    areaLotes: asPositiveNumber(body.areaLotes),
  };
}
