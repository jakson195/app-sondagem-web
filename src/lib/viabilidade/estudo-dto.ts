import { TITULO_ESTUDO } from "./types";
import { premissasFromJson } from "./parse-body";
import type { Viabilidade, ViabilidadeItem, ViabilidadeQuantitativo, ViabilidadeValidacao } from "@prisma/client";
import { calcularCenarios, calcularPontoEquilibrio } from "./financeiros";
import { D } from "./money";
import { rotuloFonteCustos } from "./custos";
import { piorStatus } from "./validacoes";

type EstudoFull = Viabilidade & {
  itens: ViabilidadeItem[];
  quantitativos: ViabilidadeQuantitativo[];
  validacoes: ViabilidadeValidacao[];
};

function d(value: { toString(): string } | null | undefined): string | null {
  return value == null ? null : value.toString();
}

export function serializeEstudo(
  estudo: EstudoFull,
  cad: { id: string; name: string; updatedAt: Date },
) {
  const desatualizado = cad.updatedAt.getTime() > estudo.updatedAt.getTime() + 1000;
  const receita = D(estudo.receitaEstimada ?? 0);
  const custoTotal = D(estudo.custoTotal);
  const qtd = estudo.quantidadeLotes ?? 0;
  const precoMedio = qtd > 0 ? D(estudo.receitaPorLote) : D(0);
  const cenarios = calcularCenarios(receita, custoTotal);
  const urbanistica = piorStatus(
    estudo.validacoes.filter((row) => row.categoria === "URBANISTICA").map((row) => row.status as "OK" | "ALERTA" | "INCONFORME" | "NAO_ANALISADO"),
  );
  const ambiental = piorStatus(
    estudo.validacoes.filter((row) => row.categoria === "AMBIENTAL").map((row) => row.status as "OK" | "ALERTA" | "INCONFORME" | "NAO_ANALISADO"),
  );
  const precosAusentes = estudo.itens.filter((item) => item.origemValor === "AUSENTE").length;
  let infraestrutura: typeof urbanistica = "OK";
  if (precosAusentes > 0) infraestrutura = "ALERTA";
  if (Number(estudo.areaVias ?? 0) <= 0) infraestrutura = "INCONFORME";
  let economica: typeof urbanistica = "NAO_ANALISADO";
  if (!receita.isZero() || !custoTotal.isZero()) {
    if (D(estudo.lucroEstimado).gt(0) && D(estudo.margemPercentual).gte(15)) economica = "OK";
    else if (D(estudo.lucroEstimado).gt(0)) economica = "ALERTA";
    else economica = "INCONFORME";
  }
  return {
    id: estudo.id,
    titulo: TITULO_ESTUDO,
    versao: estudo.versao,
    desatualizado,
    avisoDesatualizado: desatualizado
      ? "Este estudo foi calculado sobre uma versão anterior do projeto."
      : null,
    projetoId: estudo.projetoId,
    projetoNome: cad.name,
    uf: estudo.uf,
    municipio: estudo.municipio,
    competenciaSinapi: estudo.competenciaSinapi,
    premissas: premissasFromJson(estudo.premissas),
    extraido: {
      areaTotal: Number(estudo.areaTotal ?? 0),
      areaLotes: Number(estudo.areaLotes ?? 0),
      quantidadeLotes: estudo.quantidadeLotes ?? 0,
      areaVias: Number(estudo.areaVias ?? 0),
      areaVerde: Number(estudo.areaVerde ?? 0),
      areaInstitucional: Number(estudo.areaInstitucional ?? 0),
      areaApp: Number(estudo.areaApp ?? 0),
      areaMediaLote:
        estudo.quantidadeLotes && estudo.quantidadeLotes > 0
          ? Number(estudo.areaLotes ?? 0) / estudo.quantidadeLotes
          : 0,
      comprimentoTotalVias: 0,
    },
    itens: estudo.itens.map((item) => ({
      id: item.id,
      categoria: item.categoria,
      descricao: item.descricao,
      quantidade: item.quantidade.toString(),
      unidade: item.unidade,
      codigoReferencia: item.codigoReferencia,
      fonte: item.fonte,
      competencia: item.competencia,
      uf: item.uf,
      custoUnitario: item.custoUnitario.toString(),
      custoTotal: item.custoTotal.toString(),
      origemValor: item.origemValor,
      observacao: item.observacao,
    })),
    quantitativos: estudo.quantitativos.map((row) => ({
      id: row.id,
      categoria: row.categoria,
      descricao: row.descricao,
      quantidade: row.quantidade.toString(),
      unidade: row.unidade,
      origem: row.origem,
      confianca: row.confianca,
      observacao: row.observacao,
    })),
    validacoes: estudo.validacoes.map((row) => ({
      id: row.id,
      categoria: row.categoria,
      parametro: row.parametro,
      valorProjeto: d(row.valorProjeto),
      valorMinimo: d(row.valorMinimo),
      valorMaximo: d(row.valorMaximo),
      unidade: row.unidade,
      status: row.status,
      mensagem: row.mensagem,
    })),
    valorTerreno: d(estudo.valorTerreno),
    receitaEstimada: d(estudo.receitaEstimada),
    custoTerraplenagem: estudo.custoTerraplenagem.toString(),
    custoPavimentacao: estudo.custoPavimentacao.toString(),
    custoDrenagem: estudo.custoDrenagem.toString(),
    custoCalcadas: estudo.custoCalcadas.toString(),
    custoAgua: estudo.custoAgua.toString(),
    custoEsgoto: estudo.custoEsgoto.toString(),
    custoEnergia: estudo.custoEnergia.toString(),
    custoIluminacao: estudo.custoIluminacao.toString(),
    custoArborizacao: estudo.custoArborizacao.toString(),
    custoSinalizacao: estudo.custoSinalizacao.toString(),
    custoProjetos: estudo.custoProjetos.toString(),
    custoLicenciamento: estudo.custoLicenciamento.toString(),
    custoRegistro: estudo.custoRegistro.toString(),
    custoAdministrativo: estudo.custoAdministrativo.toString(),
    custoComercial: estudo.custoComercial.toString(),
    custoContingencia: estudo.custoContingencia.toString(),
    custoInfraestrutura: estudo.custoInfraestrutura.toString(),
    custoTotal: estudo.custoTotal.toString(),
    lucroEstimado: estudo.lucroEstimado.toString(),
    margemPercentual: estudo.margemPercentual.toString(),
    roiPercentual: estudo.roiPercentual.toString(),
    custoPorLote: estudo.custoPorLote.toString(),
    receitaPorLote: estudo.receitaPorLote.toString(),
    custosPorCategoria: {
      TERRAPLENAGEM: estudo.custoTerraplenagem.toString(),
      PAVIMENTACAO: estudo.custoPavimentacao.toString(),
      DRENAGEM: estudo.custoDrenagem.toString(),
      CALCADA: estudo.custoCalcadas.toString(),
      AGUA: estudo.custoAgua.toString(),
      ESGOTO: estudo.custoEsgoto.toString(),
      ENERGIA: estudo.custoEnergia.toString(),
      ILUMINACAO: estudo.custoIluminacao.toString(),
      ARBORIZACAO: estudo.custoArborizacao.toString(),
      SINALIZACAO: estudo.custoSinalizacao.toString(),
    },
    pontoEquilibrio: {
      quantidadeLotes: calcularPontoEquilibrio({ custoTotal, precoMedioLote: precoMedio }).quantidadeLotes.toString(),
      metodo: "PRECO_MEDIO",
      observacao: "pontoEquilibrio = custoTotal / precoMedioLote",
    },
    cenarios: cenarios.map((cenario) => ({
      nome: cenario.nome,
      receita: cenario.receita.toString(),
      custo: cenario.custo.toString(),
      lucro: cenario.lucro.toString(),
      margem: cenario.margem.toString(),
      roi: cenario.roi.toString(),
    })),
    semaforos: { urbanistica, ambiental, infraestrutura, economica },
    fonteCustosLabel: rotuloFonteCustos(estudo.uf, estudo.competenciaSinapi),
    alertaCompetencia: null,
    precosAusentes,
    avisos: [
      "Este estudo possui caráter preliminar e foi elaborado para análise de viabilidade econômica do empreendimento.",
      "Os quantitativos de infraestrutura que não possuem projeto executivo são estimativos.",
      "Os valores de referência devem ser atualizados conforme a competência selecionada.",
      "O estudo não substitui projetos executivos, orçamento analítico, estudos ambientais, análise das concessionárias ou aprovação dos órgãos competentes.",
    ],
    createdAt: estudo.createdAt.toISOString(),
    updatedAt: estudo.updatedAt.toISOString(),
  };
}
