import type { Decimal } from "./money";
import { toJsonNumber } from "./money";
import type { CalculoEstudo } from "./types";

export function decStr(value: Decimal | null | undefined): string {
  if (value == null) return "0";
  return toJsonNumber(value);
}

export function serializeCalculo(calculo: CalculoEstudo) {
  const custos: Record<string, string> = {};
  for (const [key, value] of Object.entries(calculo.custosCategoria)) {
    custos[key] = decStr(value);
  }
  return {
    extraido: calculo.extraido,
    itens: calculo.itens.map((item) => ({
      categoria: item.categoria,
      descricao: item.descricao,
      quantidade: decStr(item.quantidade),
      unidade: item.unidade,
      codigoReferencia: item.codigoReferencia,
      fonte: item.fonte,
      competencia: item.competencia,
      uf: item.uf,
      custoUnitario: decStr(item.custoUnitario),
      custoTotal: decStr(item.custoTotal),
      origemValor: item.origemValor,
      observacao: item.observacao,
    })),
    quantitativos: calculo.quantitativos.map((row) => ({
      categoria: row.categoria,
      descricao: row.descricao,
      quantidade: decStr(row.quantidade),
      unidade: row.unidade,
      origem: row.origem,
      confianca: row.confianca,
      observacao: row.observacao,
    })),
    validacoes: calculo.validacoes.map((row) => ({
      categoria: row.categoria,
      parametro: row.parametro,
      valorProjeto: row.valorProjeto ? decStr(row.valorProjeto) : null,
      valorMinimo: row.valorMinimo ? decStr(row.valorMinimo) : null,
      valorMaximo: row.valorMaximo ? decStr(row.valorMaximo) : null,
      unidade: row.unidade,
      status: row.status,
      mensagem: row.mensagem,
    })),
    custosPorCategoria: custos,
    custoTerraplenagem: decStr(calculo.custosCategoria.TERRAPLENAGEM),
    custoPavimentacao: decStr(calculo.custosCategoria.PAVIMENTACAO),
    custoDrenagem: decStr(calculo.custosCategoria.DRENAGEM),
    custoCalcadas: decStr(calculo.custosCategoria.CALCADA),
    custoAgua: decStr(calculo.custosCategoria.AGUA),
    custoEsgoto: decStr(calculo.custosCategoria.ESGOTO),
    custoEnergia: decStr(calculo.custosCategoria.ENERGIA),
    custoIluminacao: decStr(calculo.custosCategoria.ILUMINACAO),
    custoArborizacao: decStr(calculo.custosCategoria.ARBORIZACAO),
    custoSinalizacao: decStr(calculo.custosCategoria.SINALIZACAO),
    custoInfraestrutura: decStr(calculo.custoInfraestrutura),
    custoContingencia: decStr(calculo.custoContingencia),
    custoProjetos: decStr(calculo.custoProjetos),
    custoLicenciamento: decStr(calculo.custoLicenciamento),
    custoRegistro: decStr(calculo.custoRegistro),
    custoAdministrativo: decStr(calculo.custoAdministrativo),
    custoComercial: decStr(calculo.custoComercial),
    valorTerreno: decStr(calculo.valorTerreno),
    custoTotal: decStr(calculo.custoTotal),
    receitaEstimada: decStr(calculo.receitaEstimada),
    lucroEstimado: decStr(calculo.lucroEstimado),
    margemPercentual: decStr(calculo.margemPercentual),
    roiPercentual: decStr(calculo.roiPercentual),
    custoPorLote: decStr(calculo.custoPorLote),
    receitaPorLote: decStr(calculo.receitaPorLote),
    precoMedioLote: decStr(calculo.precoMedioLote),
    precoMedioM2: decStr(calculo.precoMedioM2),
    pontoEquilibrio: {
      quantidadeLotes: decStr(calculo.pontoEquilibrio.quantidadeLotes),
      metodo: calculo.pontoEquilibrio.metodo,
      observacao: calculo.pontoEquilibrio.observacao,
    },
    cenarios: calculo.cenarios.map((cenario) => ({
      nome: cenario.nome,
      receita: decStr(cenario.receita),
      custo: decStr(cenario.custo),
      lucro: decStr(cenario.lucro),
      margem: decStr(cenario.margem),
      roi: decStr(cenario.roi),
    })),
    semaforos: calculo.semaforos,
    avisos: calculo.avisos,
    fonteCustosLabel: calculo.fonteCustosLabel,
    alertaCompetencia: calculo.alertaCompetencia,
    precosAusentes: calculo.precosAusentes,
  };
}

export { defaultPremissas } from "./premissas-default";
