import type { ViabilidadePremissas } from "./types";

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
  };
}
