import { ITEM_TEMPLATES } from "./catalog";
import { buscarPreco, competenciaTemPrecos, rotuloFonteCustos, type PriceCatalog } from "./custos";
import { extrairQuantitativosProjeto, type MetricasCadFallback } from "./extrator";
import {
  calcularIndicadores,
  calcularPontoEquilibrio,
  calcularReceitaM2,
  calcularReceitaPorLote,
  calcularCenarios,
  custoInfraestrutura,
  custoTotalInvestimento,
} from "./financeiros";
import {
  itensAgua,
  itensArborizacao,
  itensCalcadas,
  itensDrenagem,
  itensEnergia,
  itensEsgoto,
  itensIluminacao,
  itensPavimentacao,
  itensSinalizacao,
} from "./infraestrutura";
import { D, add, calcularItem, mul, roundMoney, type Decimal } from "./money";
import { itensTerraplenagem, resolverTerraplenagem } from "./terraplenagem";
import {
  AVISOS_ESTUDO,
  type CalculoEstudo,
  type ItemCalculo,
  type ItemResultado,
  type ProjetoLoteamentoInput,
  type QuantitativoResultado,
  type SemaforoNivel,
  type ViabilidadePremissas,
} from "./types";
import { piorStatus, validarUrbanismo } from "./validacoes";

export type CustosIndiretosInput = {
  custoProjetos?: Decimal | string | number | null;
  custoLicenciamento?: Decimal | string | number | null;
  custoRegistro?: Decimal | string | number | null;
  custoAdministrativo?: Decimal | string | number | null;
  custoComercial?: Decimal | string | number | null;
  valorTerreno?: Decimal | string | number | null;
};

function mergePack(
  ...packs: Array<{ itens: ItemCalculo[]; quantitativos: QuantitativoResultado[] }>
): { itens: ItemCalculo[]; quantitativos: QuantitativoResultado[] } {
  return {
    itens: packs.flatMap((pack) => pack.itens),
    quantitativos: packs.flatMap((pack) => pack.quantitativos),
  };
}

function precoParametro(catalog: PriceCatalog, codigo: string): Decimal | null {
  const row = catalog.parametros.find((item) => item.ativo !== false && item.codigo === codigo);
  if (!row?.percentual) return null;
  return D(row.percentual);
}

export function calcularEstudo(input: {
  projeto: ProjetoLoteamentoInput;
  premissas: ViabilidadePremissas;
  uf: string;
  competencia: string | null;
  catalog: PriceCatalog;
  indiretos?: CustosIndiretosInput;
  metricasCad?: MetricasCadFallback;
}): CalculoEstudo {
  const extraido = extrairQuantitativosProjeto(input.projeto, input.metricasCad);
  const avisos = [...AVISOS_ESTUDO, ...input.projeto.avisos];

  const terra = resolverTerraplenagem(input.projeto, input.premissas);
  if (terra.aviso) avisos.push(terra.aviso);

  const pav = itensPavimentacao(extraido);
  const dre = itensDrenagem(extraido, input.projeto);
  const cal = itensCalcadas(extraido, input.premissas);
  const agua = itensAgua(extraido, input.premissas);
  const esgoto = itensEsgoto(extraido, input.premissas);
  avisos.push(...esgoto.avisos);
  const energia = itensEnergia(extraido, input.premissas);
  const ilum = itensIluminacao(extraido);
  const arbor = itensArborizacao(extraido, input.premissas);
  const sinal = itensSinalizacao(extraido, input.projeto);
  const ter = itensTerraplenagem(terra.volumes);

  const packed = mergePack(ter, pav, dre, cal, agua, esgoto, energia, ilum, arbor, sinal);

  const itens: ItemResultado[] = packed.itens.map((item) => {
    const hit = buscarPreco(input.catalog, {
      categoria: item.categoria,
      codigo: item.codigo,
      uf: input.uf,
      competencia: input.competencia,
      preferirSicro: item.preferirSicro,
      valorManual: item.valorManual,
    });
    if (!hit.encontrado) {
      return {
        categoria: item.categoria,
        descricao: item.descricao,
        quantidade: item.quantidade,
        unidade: item.unidade,
        codigoReferencia: item.codigo,
        fonte: null,
        competencia: input.competencia,
        uf: input.uf,
        custoUnitario: D(0),
        custoTotal: D(0),
        origemValor: "AUSENTE",
        observacao: [hit.motivo, item.observacao].filter(Boolean).join(" — "),
      };
    }
    const origemValor =
      hit.fonte === "SINAPI" || hit.fonte === "SICRO" || hit.fonte === "PARAMETRICO" || hit.fonte === "MANUAL"
        ? hit.fonte
        : "MANUAL";
    return {
      categoria: item.categoria,
      descricao: item.descricao,
      quantidade: item.quantidade,
      unidade: item.unidade,
      codigoReferencia: hit.codigo ?? item.codigo,
      fonte: hit.fonte,
      competencia: hit.competencia ?? input.competencia,
      uf: hit.uf ?? input.uf,
      custoUnitario: hit.custoUnitario,
      custoTotal: calcularItem(item.quantidade, hit.custoUnitario),
      origemValor,
      observacao: item.observacao ?? null,
    };
  });

  const custosCategoria: Record<string, Decimal> = {};
  for (const template of ITEM_TEMPLATES) {
    custosCategoria[template.categoria] = custosCategoria[template.categoria] ?? D(0);
  }
  for (const item of itens) {
    custosCategoria[item.categoria] = add(custosCategoria[item.categoria], item.custoTotal);
  }

  const infra = custoInfraestrutura(custosCategoria);
  const pctCont =
    input.premissas.percentualContingencia != null && input.premissas.percentualContingencia !== ""
      ? D(input.premissas.percentualContingencia)
      : precoParametro(input.catalog, "CONTINGENCIA_PCT");
  const custoContingencia = pctCont != null ? roundMoney(mul(infra, mul(pctCont, "0.01"))) : D(0);
  if (pctCont == null) {
    avisos.push("Contingência não aplicada: cadastre o percentual (parâmetro CONTINGENCIA_PCT) ou informe nas premissas.");
  }

  const indiretos = input.indiretos ?? {};
  const custoProjetos = D(indiretos.custoProjetos);
  const custoLicenciamento = D(indiretos.custoLicenciamento);
  const custoRegistro = D(indiretos.custoRegistro);
  const custoAdministrativo = D(indiretos.custoAdministrativo);
  const custoComercial = D(indiretos.custoComercial);
  const valorTerreno = D(indiretos.valorTerreno);

  const custoTotal = custoTotalInvestimento({
    valorTerreno,
    custoInfraestrutura: infra,
    custoProjetos,
    custoLicenciamento,
    custoRegistro,
    custoAdministrativo,
    custoComercial,
    custoContingencia,
  });

  const areaLotes = D(extraido.areaLotes);
  let receita = D(0);
  const precosLote: Decimal[] = [];
  if (input.premissas.modalidadeReceita === "POR_LOTE") {
    for (const lote of input.projeto.lotes) {
      const raw = input.premissas.precosPorLote?.[lote.id];
      precosLote.push(D(raw));
    }
    receita = calcularReceitaPorLote(precosLote);
  } else {
    receita = calcularReceitaM2(areaLotes, D(input.premissas.precoVendaM2));
  }

  const indicadores = calcularIndicadores({
    receita,
    custoTotal,
    quantidadeLotes: extraido.quantidadeLotes,
    areaLotes,
  });

  const pontoEquilibrio = calcularPontoEquilibrio({
    custoTotal,
    precoMedioLote: indicadores.precoMedioLote,
    precosOrdenados:
      input.premissas.modalidadeReceita === "POR_LOTE" && precosLote.some((preco) => !preco.isZero())
        ? precosLote
        : undefined,
  });

  const validacoes = validarUrbanismo(extraido, input.catalog.parametros, extraido.comprimentoTotalVias > 0);
  const urbanistica = piorStatus(
    validacoes.filter((row) => row.categoria === "URBANISTICA").map((row) => row.status),
  );
  const ambiental = piorStatus(
    validacoes.filter((row) => row.categoria === "AMBIENTAL").map((row) => row.status),
  );

  const precosAusentes = itens.filter((item) => item.origemValor === "AUSENTE").length;
  let infraestrutura: SemaforoNivel = "OK";
  if (!terra.volumes) infraestrutura = "ALERTA";
  if (precosAusentes > 0) infraestrutura = "ALERTA";
  if (extraido.comprimentoTotalVias === 0) infraestrutura = "INCONFORME";

  let economica: SemaforoNivel = "NAO_ANALISADO";
  if (!receita.isZero() || !custoTotal.isZero()) {
    if (indicadores.lucroEstimado.gt(0) && indicadores.margemPercentual.gte(15)) economica = "OK";
    else if (indicadores.lucroEstimado.gt(0)) economica = "ALERTA";
    else economica = "INCONFORME";
  }

  const alertaCompetencia =
    input.competencia && !competenciaTemPrecos(input.catalog, input.uf, input.competencia)
      ? "Não existem preços disponíveis para esta competência."
      : null;
  if (alertaCompetencia) avisos.push(alertaCompetencia);

  return {
    extraido,
    itens,
    quantitativos: packed.quantitativos,
    validacoes,
    custosCategoria,
    custoInfraestrutura: infra,
    custoContingencia,
    custoProjetos,
    custoLicenciamento,
    custoRegistro,
    custoAdministrativo,
    custoComercial,
    valorTerreno,
    custoTotal,
    receitaEstimada: indicadores.receitaTotal,
    lucroEstimado: indicadores.lucroEstimado,
    margemPercentual: indicadores.margemPercentual,
    roiPercentual: indicadores.roiPercentual,
    custoPorLote: indicadores.custoPorLote,
    receitaPorLote: indicadores.receitaPorLote,
    precoMedioLote: indicadores.precoMedioLote,
    precoMedioM2: indicadores.precoMedioM2,
    pontoEquilibrio,
    cenarios: calcularCenarios(indicadores.receitaTotal, indicadores.custoTotal),
    semaforos: {
      urbanistica,
      ambiental,
      infraestrutura,
      economica,
    },
    avisos: [...new Set(avisos)],
    fonteCustosLabel: rotuloFonteCustos(input.uf, input.competencia),
    alertaCompetencia,
    precosAusentes,
  };
}
