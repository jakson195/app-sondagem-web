import type { ProjetoLoteamentoInput, QuantitativoExtraido } from "./types";

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function minOf(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.min(...values);
}

function maxOf(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
}

export type MetricasCadFallback = {
  areaTotal?: number;
  quantidadeLotes?: number;
  areaLotes?: number;
};

export function extrairQuantitativosProjeto(
  projeto: ProjetoLoteamentoInput,
  fallbacks?: MetricasCadFallback,
): QuantitativoExtraido {
  const areas = projeto.lotes.map((lote) => lote.area);
  const testadas = projeto.lotes.map((lote) => lote.testada).filter((value) => value > 0);
  const areaLotes = areas.reduce((sum, value) => sum + value, 0);
  const areaVias = projeto.vias.reduce((sum, via) => sum + (via.area ?? via.comprimento * via.largura), 0);
  const comprimentoTotalVias = projeto.vias.reduce((sum, via) => sum + via.comprimento, 0);
  const larguras = projeto.vias.map((via) => via.largura).filter((value) => value > 0);
  const areaVerde = (projeto.areasVerdes ?? []).reduce((sum, area) => sum + area.area, 0);
  const areaInstitucional = (projeto.areasInstitucionais ?? []).reduce((sum, area) => sum + area.area, 0);
  const areaApp = projeto.app?.area ?? 0;
  const areaCalcadas = (projeto.calcadas ?? []).reduce((sum, calcada) => sum + calcada.area, 0);
  const comprimentoCalcadas = (projeto.calcadas ?? []).reduce(
    (sum, calcada) => sum + (calcada.comprimento ?? 0),
    0,
  );

  const extraido: QuantitativoExtraido = {
    areaTotal: projeto.areaTotal,
    areaLotes,
    quantidadeLotes: projeto.lotes.length,
    areaMediaLote: avg(areas),
    areaMinimaLote: minOf(areas),
    areaMaximaLote: maxOf(areas),
    testadaMinima: minOf(testadas),
    testadaMedia: avg(testadas),
    areaVias,
    comprimentoTotalVias,
    larguraMediaVias: avg(larguras),
    areaVerde,
    areaInstitucional,
    areaApp,
    areaCalcadas,
    comprimentoCalcadas,
  };

  if (!(extraido.areaTotal > 0) && fallbacks?.areaTotal && fallbacks.areaTotal > 0) {
    extraido.areaTotal = fallbacks.areaTotal;
  }
  if (!(extraido.quantidadeLotes > 0) && fallbacks?.quantidadeLotes && fallbacks.quantidadeLotes > 0) {
    extraido.quantidadeLotes = Math.round(fallbacks.quantidadeLotes);
  }
  if (!(extraido.areaLotes > 0) && fallbacks?.areaLotes && fallbacks.areaLotes > 0) {
    extraido.areaLotes = fallbacks.areaLotes;
    extraido.areaMediaLote =
      extraido.quantidadeLotes > 0 ? extraido.areaLotes / extraido.quantidadeLotes : extraido.areaMediaLote;
  }

  return extraido;
}
