import { D, mul, pct, type Decimal } from "./money";
import type { ParametroCatalogo, QuantitativoExtraido, StatusValidacao, ValidacaoResultado } from "./types";

function paramValue(parametros: ParametroCatalogo[], codigo: string): Decimal | null {
  const row = parametros.find((item) => item.ativo !== false && item.codigo === codigo);
  if (!row) return null;
  if (row.valorUnitario != null) return D(row.valorUnitario);
  if (row.percentual != null) return D(row.percentual);
  return null;
}

function statusMin(valor: Decimal, minimo: Decimal | null): StatusValidacao {
  if (minimo == null) return "NAO_ANALISADO";
  if (valor.gte(minimo)) return "OK";
  if (valor.gte(mul(minimo, "0.9"))) return "ALERTA";
  return "INCONFORME";
}

export function validarUrbanismo(
  extraido: QuantitativoExtraido,
  parametros: ParametroCatalogo[],
  temAcessoViario: boolean,
): ValidacaoResultado[] {
  const areaMin = paramValue(parametros, "AREA_MINIMA_LOTE");
  const testadaMin = paramValue(parametros, "TESTADA_MINIMA");
  const larguraMin = paramValue(parametros, "LARGURA_VIA");
  const verdePctMin = paramValue(parametros, "AREA_VERDE_PCT");
  const instPctMin = paramValue(parametros, "AREA_INSTITUCIONAL_PCT");

  const verdePct = extraido.areaTotal > 0 ? pct(extraido.areaVerde, extraido.areaTotal) : D(0);
  const instPct = extraido.areaTotal > 0 ? pct(extraido.areaInstitucional, extraido.areaTotal) : D(0);

  const rows: ValidacaoResultado[] = [
    {
      categoria: "URBANISTICA",
      parametro: "AREA_MINIMA_LOTE",
      valorProjeto: D(extraido.areaMinimaLote),
      valorMinimo: areaMin,
      valorMaximo: null,
      unidade: "m²",
      status: extraido.quantidadeLotes === 0 ? "NAO_ANALISADO" : statusMin(D(extraido.areaMinimaLote), areaMin),
      mensagem:
        areaMin == null
          ? "Parâmetro de área mínima não cadastrado."
          : extraido.areaMinimaLote >= areaMin.toNumber()
            ? "Área mínima dos lotes atende ao parâmetro."
            : "Há lote(s) abaixo da área mínima cadastrada.",
    },
    {
      categoria: "URBANISTICA",
      parametro: "TESTADA_MINIMA",
      valorProjeto: D(extraido.testadaMinima),
      valorMinimo: testadaMin,
      valorMaximo: null,
      unidade: "m",
      status: extraido.quantidadeLotes === 0 ? "NAO_ANALISADO" : statusMin(D(extraido.testadaMinima), testadaMin),
      mensagem:
        testadaMin == null
          ? "Parâmetro de testada mínima não cadastrado."
          : extraido.testadaMinima >= testadaMin.toNumber()
            ? "Testada mínima atende ao parâmetro."
            : "Há lote(s) com testada inferior ao mínimo.",
    },
    {
      categoria: "URBANISTICA",
      parametro: "LARGURA_VIA",
      valorProjeto: D(extraido.larguraMediaVias),
      valorMinimo: larguraMin,
      valorMaximo: null,
      unidade: "m",
      status: extraido.comprimentoTotalVias === 0 ? "NAO_ANALISADO" : statusMin(D(extraido.larguraMediaVias), larguraMin),
      mensagem:
        larguraMin == null
          ? "Parâmetro de largura de via não cadastrado."
          : extraido.larguraMediaVias >= larguraMin.toNumber()
            ? "Largura média das vias atende ao parâmetro."
            : "Largura média das vias abaixo do mínimo.",
    },
    {
      categoria: "AMBIENTAL",
      parametro: "AREA_VERDE",
      valorProjeto: verdePct,
      valorMinimo: verdePctMin,
      valorMaximo: null,
      unidade: "%",
      status: statusMin(verdePct, verdePctMin),
      mensagem:
        verdePctMin == null
          ? "Percentual mínimo de área verde não cadastrado."
          : `Área verde = ${verdePct.toFixed(2)}% da gleba.`,
    },
    {
      categoria: "URBANISTICA",
      parametro: "AREA_INSTITUCIONAL",
      valorProjeto: instPct,
      valorMinimo: instPctMin,
      valorMaximo: null,
      unidade: "%",
      status: statusMin(instPct, instPctMin),
      mensagem:
        instPctMin == null
          ? "Percentual mínimo de área institucional não cadastrado."
          : `Área institucional (AREA_UTIL) = ${instPct.toFixed(2)}% da gleba.`,
    },
    {
      categoria: "AMBIENTAL",
      parametro: "APP",
      valorProjeto: D(extraido.areaApp),
      valorMinimo: null,
      valorMaximo: null,
      unidade: "m²",
      status: extraido.areaApp > 0 ? "OK" : "NAO_ANALISADO",
      mensagem:
        extraido.areaApp > 0
          ? "APP identificada no projeto. Conferir restrições ambientais."
          : "Nenhuma APP extraída do projeto.",
    },
    {
      categoria: "URBANISTICA",
      parametro: "DECLIVIDADE",
      valorProjeto: null,
      valorMinimo: null,
      valorMaximo: null,
      unidade: "%",
      status: "NAO_ANALISADO",
      mensagem: "Declividade não avaliada automaticamente neste estudo preliminar.",
    },
    {
      categoria: "URBANISTICA",
      parametro: "ACESSO_VIARIO",
      valorProjeto: D(extraido.comprimentoTotalVias),
      valorMinimo: D(0),
      valorMaximo: null,
      unidade: "m",
      status: temAcessoViario ? "OK" : "INCONFORME",
      mensagem: temAcessoViario
        ? "Sistema viário presente no projeto."
        : "Não há vias extraídas do projeto.",
    },
  ];

  return rows;
}

export function piorStatus(statuses: StatusValidacao[]): StatusValidacao {
  if (statuses.includes("INCONFORME")) return "INCONFORME";
  if (statuses.includes("ALERTA")) return "ALERTA";
  if (statuses.includes("OK")) return "OK";
  return "NAO_ANALISADO";
}
