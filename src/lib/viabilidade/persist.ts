import { prisma } from "@/lib/prisma";
import { D } from "./money";
import { calcularEstudo, type CustosIndiretosInput } from "./pipeline";
import { serializeCalculo } from "./serialize";
import type { MetricasCadFallback } from "./extrator";
import type { ProjetoLoteamentoInput, TipoCustoSinapi, ViabilidadePremissas } from "./types";
import { loadPriceCatalog } from "./catalog-db";

export async function persistirCalculo(input: {
  viabilidadeId: string;
  projeto: ProjetoLoteamentoInput;
  uf: string;
  competencia: string | null;
  municipio?: string | null;
  premissas: ViabilidadePremissas;
  indiretos?: CustosIndiretosInput;
  metricasCad?: MetricasCadFallback;
}) {
  const catalog = await loadPriceCatalog({
    uf: input.uf,
    competencia: input.competencia,
    tipoSinapi: input.premissas.tipoCustoSinapi,
  });
  const calculo = calcularEstudo({
    projeto: input.projeto,
    premissas: input.premissas,
    uf: input.uf,
    competencia: input.competencia,
    catalog,
    indiretos: input.indiretos,
    metricasCad: input.metricasCad,
  });

  await prisma.$transaction([
    prisma.viabilidadeItem.deleteMany({ where: { viabilidadeId: input.viabilidadeId } }),
    prisma.viabilidadeQuantitativo.deleteMany({ where: { viabilidadeId: input.viabilidadeId } }),
    prisma.viabilidadeValidacao.deleteMany({ where: { viabilidadeId: input.viabilidadeId } }),
    prisma.viabilidade.update({
      where: { id: input.viabilidadeId },
      data: {
        uf: input.uf,
        municipio: input.municipio ?? input.premissas.municipio ?? null,
        competenciaSinapi: input.competencia,
        areaTotal: D(calculo.extraido.areaTotal),
        areaLotes: D(calculo.extraido.areaLotes),
        areaVias: D(calculo.extraido.areaVias),
        areaVerde: D(calculo.extraido.areaVerde),
        areaInstitucional: D(calculo.extraido.areaInstitucional),
        areaApp: D(calculo.extraido.areaApp),
        quantidadeLotes: calculo.extraido.quantidadeLotes,
        valorTerreno: calculo.valorTerreno,
        receitaEstimada: calculo.receitaEstimada,
        custoTerraplenagem: calculo.custosCategoria.TERRAPLENAGEM ?? D(0),
        custoPavimentacao: calculo.custosCategoria.PAVIMENTACAO ?? D(0),
        custoDrenagem: calculo.custosCategoria.DRENAGEM ?? D(0),
        custoCalcadas: calculo.custosCategoria.CALCADA ?? D(0),
        custoAgua: calculo.custosCategoria.AGUA ?? D(0),
        custoEsgoto: calculo.custosCategoria.ESGOTO ?? D(0),
        custoEnergia: calculo.custosCategoria.ENERGIA ?? D(0),
        custoIluminacao: calculo.custosCategoria.ILUMINACAO ?? D(0),
        custoArborizacao: calculo.custosCategoria.ARBORIZACAO ?? D(0),
        custoSinalizacao: calculo.custosCategoria.SINALIZACAO ?? D(0),
        custoProjetos: calculo.custoProjetos,
        custoLicenciamento: calculo.custoLicenciamento,
        custoRegistro: calculo.custoRegistro,
        custoAdministrativo: calculo.custoAdministrativo,
        custoComercial: calculo.custoComercial,
        custoContingencia: calculo.custoContingencia,
        custoInfraestrutura: calculo.custoInfraestrutura,
        custoTotal: calculo.custoTotal,
        lucroEstimado: calculo.lucroEstimado,
        margemPercentual: calculo.margemPercentual,
        roiPercentual: calculo.roiPercentual,
        custoPorLote: calculo.custoPorLote,
        receitaPorLote: calculo.receitaPorLote,
        premissas: input.premissas as object,
        itens: {
          create: calculo.itens.map((item) => ({
            categoria: item.categoria,
            descricao: item.descricao,
            quantidade: item.quantidade,
            unidade: item.unidade,
            codigoReferencia: item.codigoReferencia,
            fonte: item.fonte,
            competencia: item.competencia,
            uf: item.uf,
            custoUnitario: item.custoUnitario,
            custoTotal: item.custoTotal,
            origemValor: item.origemValor,
            observacao: item.observacao,
          })),
        },
        quantitativos: {
          create: calculo.quantitativos.map((row) => ({
            categoria: row.categoria,
            descricao: row.descricao,
            quantidade: row.quantidade,
            unidade: row.unidade,
            origem: row.origem,
            confianca: row.confianca,
            observacao: row.observacao,
          })),
        },
        validacoes: {
          create: calculo.validacoes.map((row) => ({
            categoria: row.categoria,
            parametro: row.parametro,
            valorProjeto: row.valorProjeto,
            valorMinimo: row.valorMinimo,
            valorMaximo: row.valorMaximo,
            unidade: row.unidade,
            status: row.status,
            mensagem: row.mensagem,
          })),
        },
      },
    }),
  ]);

  return { calculo, dto: serializeCalculo(calculo) };
}

export type { TipoCustoSinapi };
