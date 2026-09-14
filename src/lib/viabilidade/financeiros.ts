import { D, add, div, mul, pct, roundMoney, sub, type Decimal } from "./money";
import type { CenarioNome, IndicadoresCenario, PontoEquilibrio } from "./types";

export type IndicadoresInput = {
  receita: Decimal;
  custoTotal: Decimal;
  quantidadeLotes: number;
  areaLotes: Decimal;
};

export type Indicadores = {
  receitaTotal: Decimal;
  custoTotal: Decimal;
  lucroEstimado: Decimal;
  margemPercentual: Decimal;
  roiPercentual: Decimal;
  custoPorLote: Decimal;
  receitaPorLote: Decimal;
  precoMedioLote: Decimal;
  precoMedioM2: Decimal;
};

export function calcularReceitaM2(areaLotes: Decimal, precoVendaM2: Decimal): Decimal {
  return roundMoney(mul(areaLotes, precoVendaM2));
}

export function calcularReceitaPorLote(precos: Decimal[]): Decimal {
  return roundMoney(add(...precos));
}

export function calcularIndicadores(input: IndicadoresInput): Indicadores {
  const lucro = roundMoney(sub(input.receita, input.custoTotal));
  const qtd = D(input.quantidadeLotes);
  return {
    receitaTotal: roundMoney(input.receita),
    custoTotal: roundMoney(input.custoTotal),
    lucroEstimado: lucro,
    margemPercentual: roundMoney(pct(lucro, input.receita), 4),
    roiPercentual: roundMoney(pct(lucro, input.custoTotal), 4),
    custoPorLote: roundMoney(div(input.custoTotal, qtd)),
    receitaPorLote: roundMoney(div(input.receita, qtd)),
    precoMedioLote: roundMoney(div(input.receita, qtd)),
    precoMedioM2: roundMoney(div(input.receita, input.areaLotes)),
  };
}

export function calcularPontoEquilibrio(input: {
  custoTotal: Decimal;
  precoMedioLote: Decimal;
  precosOrdenados?: Decimal[];
}): PontoEquilibrio {
  if (input.precosOrdenados && input.precosOrdenados.length > 0) {
    const ordered = [...input.precosOrdenados].sort((a, b) => a.cmp(b));
    let acc = D(0);
    let count = 0;
    for (const preco of ordered) {
      acc = acc.add(preco);
      count += 1;
      if (acc.gte(input.custoTotal)) {
        return {
          quantidadeLotes: D(count),
          metodo: "LOTES_ORDENADOS",
          observacao: "Lotes ordenados por preço crescente até cobrir o investimento.",
        };
      }
    }
    return {
      quantidadeLotes: D(ordered.length),
      metodo: "LOTES_ORDENADOS",
      observacao: "A soma dos preços dos lotes não cobre o custo total.",
    };
  }
  return {
    quantidadeLotes: div(input.custoTotal, input.precoMedioLote),
    metodo: "PRECO_MEDIO",
    observacao: "pontoEquilibrio = custoTotal / precoMedioLote",
  };
}

export function calcularCenarios(receita: Decimal, custo: Decimal): IndicadoresCenario[] {
  const specs: Array<{ nome: CenarioNome; fatReceita: Decimal; fatCusto: Decimal }> = [
    { nome: "CONSERVADOR", fatReceita: D("0.9"), fatCusto: D("1.1") },
    { nome: "PROVAVEL", fatReceita: D(1), fatCusto: D(1) },
    { nome: "OTIMISTA", fatReceita: D("1.1"), fatCusto: D("0.9") },
  ];
  return specs.map((spec) => {
    const rec = roundMoney(mul(receita, spec.fatReceita));
    const cus = roundMoney(mul(custo, spec.fatCusto));
    const lucro = roundMoney(sub(rec, cus));
    return {
      nome: spec.nome,
      receita: rec,
      custo: cus,
      lucro,
      margem: roundMoney(pct(lucro, rec), 4),
      roi: roundMoney(pct(lucro, cus), 4),
    };
  });
}

export function custoInfraestrutura(custos: Record<string, Decimal>): Decimal {
  return roundMoney(
    add(
      custos.TERRAPLENAGEM,
      custos.PAVIMENTACAO,
      custos.DRENAGEM,
      custos.CALCADA,
      custos.AGUA,
      custos.ESGOTO,
      custos.ENERGIA,
      custos.ILUMINACAO,
      custos.ARBORIZACAO,
      custos.SINALIZACAO,
    ),
  );
}

export function custoTotalInvestimento(input: {
  valorTerreno: Decimal;
  custoInfraestrutura: Decimal;
  custoProjetos: Decimal;
  custoLicenciamento: Decimal;
  custoRegistro: Decimal;
  custoAdministrativo: Decimal;
  custoComercial: Decimal;
  custoContingencia: Decimal;
}): Decimal {
  return roundMoney(
    add(
      input.valorTerreno,
      input.custoInfraestrutura,
      input.custoProjetos,
      input.custoLicenciamento,
      input.custoRegistro,
      input.custoAdministrativo,
      input.custoComercial,
      input.custoContingencia,
    ),
  );
}
