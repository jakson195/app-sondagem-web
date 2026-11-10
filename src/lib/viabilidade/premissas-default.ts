import type { TipoPavimento, ViabilidadePremissas } from "./types";

/** Espessuras padrão (cm) por tipo de revestimento: sub-base, base, revestimento. */
export const ESPESSURAS_PADRAO: Record<TipoPavimento, { subBase: number; base: number; revestimento: number }> = {
  CBUQ: { subBase: 15, base: 15, revestimento: 4 },
  LAJOTA: { subBase: 20, base: 0, revestimento: 8 },
  BLOCO: { subBase: 20, base: 0, revestimento: 8 },
  PARALELEPIPEDO: { subBase: 20, base: 0, revestimento: 0 },
};

export function defaultPremissas(partial?: Partial<ViabilidadePremissas>): ViabilidadePremissas {
  return {
    modalidadeReceita: partial?.modalidadeReceita ?? "M2",
    precoVendaM2: partial?.precoVendaM2,
    precosPorLote: partial?.precosPorLote,
    tipoCustoSinapi: partial?.tipoCustoSinapi ?? "DESONERADO",
    percentualContingencia: partial?.percentualContingencia,
    larguraCalcadaM: partial?.larguraCalcadaM ?? "2",
    numeroLadosCalcada: partial?.numeroLadosCalcada ?? 2,
    percentualPisoTatil: partial?.percentualPisoTatil ?? "0",
    percentualAcessibilidade: partial?.percentualAcessibilidade ?? "0",
    tipoCalcada: partial?.tipoCalcada,
    espacamentoMudasM: partial?.espacamentoMudasM ?? "10",
    numeroLadosArborizacao: partial?.numeroLadosArborizacao ?? 2,
    percentualRedePrincipalAgua: partial?.percentualRedePrincipalAgua ?? "100",
    sistemaPublicoEsgoto: partial?.sistemaPublicoEsgoto ?? null,
    orcamentoConcessionariaEnergia: partial?.orcamentoConcessionariaEnergia,
    volumeCorteManualM3: partial?.volumeCorteManualM3,
    volumeAterroManualM3: partial?.volumeAterroManualM3,
    municipio: partial?.municipio,
    tipoPavimento: partial?.tipoPavimento ?? "CBUQ",
    materialSubBase: partial?.materialSubBase ?? "BGS",
    espessuraSubBaseCm: partial?.espessuraSubBaseCm,
    espessuraBaseCm: partial?.espessuraBaseCm,
    espessuraRevestimentoCm: partial?.espessuraRevestimentoCm,
    profundidadeValaEsgotoM: partial?.profundidadeValaEsgotoM ?? "1.5",
    larguraValaEsgotoM: partial?.larguraValaEsgotoM ?? "0.65",
    espacamentoPvEsgotoM: partial?.espacamentoPvEsgotoM ?? "80",
  };
}
