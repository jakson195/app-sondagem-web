import { TITULO_ESTUDO, type CalculoEstudo, type ViabilidadePremissas } from "./types";
import { serializeCalculo } from "./serialize";

export function montarRelatorio(input: {
  projetoNome: string;
  municipio?: string | null;
  uf: string;
  versao: number;
  premissas: ViabilidadePremissas;
  calculo: CalculoEstudo;
}) {
  const dados = serializeCalculo(input.calculo);
  return {
    titulo: TITULO_ESTUDO,
    identificacao: {
      empreendimento: input.projetoNome,
      municipio: input.municipio ?? input.premissas.municipio ?? null,
      uf: input.uf,
      versao: input.versao,
      competencia: input.calculo.fonteCustosLabel,
    },
    areaImovel: dados.extraido.areaTotal,
    caracteristicas: dados.extraido,
    quantidadeLotes: dados.extraido.quantidadeLotes,
    areasPublicas: {
      verde: dados.extraido.areaVerde,
      institucional: dados.extraido.areaInstitucional,
      app: dados.extraido.areaApp,
    },
    sistemaViario: {
      areaVias: dados.extraido.areaVias,
      comprimentoTotalVias: dados.extraido.comprimentoTotalVias,
      larguraMediaVias: dados.extraido.larguraMediaVias,
    },
    quantitativos: dados.quantitativos,
    custos: dados.itens,
    fontePrecos: dados.fonteCustosLabel,
    competencia: input.calculo.alertaCompetencia,
    receita: dados.receitaEstimada,
    investimento: dados.custoTotal,
    lucro: dados.lucroEstimado,
    margem: dados.margemPercentual,
    roi: dados.roiPercentual,
    pontoEquilibrio: dados.pontoEquilibrio,
    cenarios: dados.cenarios,
    validacoes: dados.validacoes,
    premissas: input.premissas,
    limitacoes: dados.avisos,
  };
}
