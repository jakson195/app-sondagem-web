import { D } from "./money";
import type {
  DrenagemProjetoQuantidades,
  ItemCalculo,
  ProjetoLoteamentoInput,
  QuantitativoExtraido,
  QuantitativoResultado,
  ViabilidadePremissas,
} from "./types";

function parseNum(value: string | number | undefined | null, fallback: number | null = null): number | null {
  if (value == null || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function roundInt(value: number): number {
  return Math.max(0, Math.round(value));
}

export function itensPavimentacao(extraido: QuantitativoExtraido): {
  itens: ItemCalculo[];
  quantitativos: QuantitativoResultado[];
} {
  const area = extraido.areaVias;
  const comprimento = extraido.comprimentoTotalVias;
  const meioFio = comprimento * 2;
  const stages: Array<{ codigo: string; descricao: string; qty: number; unidade: string }> = [
    { codigo: "PAV_REGULARIZACAO", descricao: "Regularização do subleito", qty: area, unidade: "m²" },
    { codigo: "PAV_SUBBASE", descricao: "Sub-base", qty: area, unidade: "m²" },
    { codigo: "PAV_BASE", descricao: "Base", qty: area, unidade: "m²" },
    { codigo: "PAV_IMPRIMACAO", descricao: "Imprimação", qty: area, unidade: "m²" },
    { codigo: "PAV_REVESTIMENTO", descricao: "Revestimento asfáltico", qty: area, unidade: "m²" },
    { codigo: "PAV_MEIO_FIO", descricao: "Meio-fio", qty: meioFio, unidade: "m" },
    { codigo: "PAV_SARJETA", descricao: "Sarjeta", qty: meioFio, unidade: "m" },
  ];
  const itens: ItemCalculo[] = [];
  const quantitativos: QuantitativoResultado[] = [];
  for (const stage of stages) {
    quantitativos.push({
      categoria: "PAVIMENTACAO",
      descricao: stage.descricao,
      quantidade: D(stage.qty),
      unidade: stage.unidade,
      origem: "PROJETO",
      confianca: "MEDIA",
      observacao: "Quantitativo a partir da área/comprimento das vias do projeto urbanístico.",
    });
    if (stage.qty > 0) {
      itens.push({
        categoria: "PAVIMENTACAO",
        codigo: stage.codigo,
        descricao: stage.descricao,
        quantidade: D(stage.qty),
        unidade: stage.unidade,
        origemQuantitativo: "PROJETO",
        confianca: "MEDIA",
      });
    }
  }
  return { itens, quantitativos };
}

function estimarDrenagem(extraido: QuantitativoExtraido): DrenagemProjetoQuantidades {
  const L = extraido.comprimentoTotalVias;
  return {
    tubulacaoPorDiametroMm: {
      400: L * 0.8,
      600: L * 0.15,
      800: L * 0.05,
    },
    bocasDeLobo: Math.max(2, roundInt(L / 25)),
    pocosDeVisita: Math.max(2, roundInt(L / 60)),
    dissipadores: Math.max(1, roundInt(L / 400)),
    travessias: 0,
    origem: "ESTIMATIVA",
    confianca: extraido.comprimentoTotalVias > 0 ? "MEDIA" : "BAIXA",
  };
}

function agruparTubos(drenagem: DrenagemProjetoQuantidades): { m400: number; m600: number; m800: number } {
  let m400 = 0;
  let m600 = 0;
  let m800 = 0;
  for (const [diam, length] of Object.entries(drenagem.tubulacaoPorDiametroMm)) {
    const mm = Number(diam);
    const qty = Number(length) || 0;
    if (mm <= 0) {
      m400 += qty;
      continue;
    }
    if (mm <= 450) m400 += qty;
    else if (mm <= 700) m600 += qty;
    else m800 += qty;
  }
  return { m400, m600, m800 };
}

export function itensDrenagem(
  extraido: QuantitativoExtraido,
  projeto: ProjetoLoteamentoInput,
): { itens: ItemCalculo[]; quantitativos: QuantitativoResultado[] } {
  const fromProject = projeto.drenagemProjeto;
  const drenagem = fromProject ?? estimarDrenagem(extraido);
  const tubos = agruparTubos(drenagem);
  const confianca = drenagem.confianca;
  const origem = drenagem.origem;
  const nota = fromProject
    ? "Quantitativo lido da rede de drenagem do projeto."
    : "Estimativa preliminar a partir do sistema viário — não é dimensionamento executivo.";

  const rows: Array<{ codigo: string; descricao: string; qty: number; unidade: string }> = [
    { codigo: "DRE_TUBO_400", descricao: "Tubulação Ø400 mm", qty: tubos.m400, unidade: "m" },
    { codigo: "DRE_TUBO_600", descricao: "Tubulação Ø600 mm", qty: tubos.m600, unidade: "m" },
    { codigo: "DRE_TUBO_800", descricao: "Tubulação Ø800 mm", qty: tubos.m800, unidade: "m" },
    { codigo: "DRE_BOCA_LOBO", descricao: "Boca de lobo", qty: drenagem.bocasDeLobo, unidade: "un" },
    { codigo: "DRE_PV", descricao: "Poço de visita", qty: drenagem.pocosDeVisita, unidade: "un" },
    { codigo: "DRE_DISSIPADOR", descricao: "Dissipador", qty: drenagem.dissipadores, unidade: "un" },
    { codigo: "DRE_TRAVESSIA", descricao: "Travessia", qty: drenagem.travessias, unidade: "un" },
  ];

  const itens: ItemCalculo[] = [];
  const quantitativos: QuantitativoResultado[] = [];
  for (const row of rows) {
    quantitativos.push({
      categoria: "DRENAGEM",
      descricao: row.descricao,
      quantidade: D(row.qty),
      unidade: row.unidade,
      origem,
      confianca,
      observacao: nota,
    });
    if (row.qty > 0) {
      itens.push({
        categoria: "DRENAGEM",
        codigo: row.codigo,
        descricao: row.descricao,
        quantidade: D(row.qty),
        unidade: row.unidade,
        origemQuantitativo: origem,
        confianca,
        observacao: nota,
      });
    }
  }
  return { itens, quantitativos };
}

export function itensCalcadas(
  extraido: QuantitativoExtraido,
  premissas: ViabilidadePremissas,
): { itens: ItemCalculo[]; quantitativos: QuantitativoResultado[] } {
  const lados = premissas.numeroLadosCalcada && premissas.numeroLadosCalcada > 0 ? premissas.numeroLadosCalcada : 2;
  const largura = parseNum(premissas.larguraCalcadaM, 2) ?? 2;
  const fromProject = extraido.areaCalcadas > 0;
  const area =
    fromProject
      ? extraido.areaCalcadas
      : extraido.comprimentoTotalVias * lados * largura;
  const comprimento = fromProject
    ? extraido.comprimentoCalcadas || extraido.comprimentoTotalVias * lados
    : extraido.comprimentoTotalVias * lados;
  const pctTatil = (parseNum(premissas.percentualPisoTatil, 0) ?? 0) / 100;
  const pctAcess = (parseNum(premissas.percentualAcessibilidade, 0) ?? 0) / 100;
  const origem = fromProject ? "PROJETO" : "ESTIMATIVA";
  const confianca = fromProject ? "ALTA" : "MEDIA";
  const areaTatil = area * pctTatil;
  const areaAcess = area * pctAcess;

  const rows: Array<{ codigo: string; descricao: string; qty: number; unidade: string }> = [
    { codigo: "CAL_REGULARIZACAO", descricao: "Regularização de calçada", qty: area, unidade: "m²" },
    { codigo: "CAL_PAVIMENTO", descricao: "Pavimentação de calçada", qty: area, unidade: "m²" },
    { codigo: "CAL_PISO_TATIL", descricao: "Piso tátil", qty: areaTatil, unidade: "m²" },
    { codigo: "CAL_MEIO_FIO", descricao: "Meio-fio de calçada", qty: comprimento, unidade: "m" },
    { codigo: "CAL_ACESSIBILIDADE", descricao: "Adequação de acessibilidade", qty: areaAcess, unidade: "m²" },
  ];

  const itens: ItemCalculo[] = [];
  const quantitativos: QuantitativoResultado[] = [];
  const nota = fromProject
    ? "Área de calçada extraída da camada LOTEAMENTO_CALCADAS."
    : `Estimativa: comprimento das vias × ${lados} lado(s) × ${largura} m.`;
  for (const row of rows) {
    quantitativos.push({
      categoria: "CALCADA",
      descricao: row.descricao,
      quantidade: D(row.qty),
      unidade: row.unidade,
      origem,
      confianca,
      observacao: nota,
    });
    if (row.qty > 0) {
      itens.push({
        categoria: "CALCADA",
        codigo: row.codigo,
        descricao: row.descricao,
        quantidade: D(row.qty),
        unidade: row.unidade,
        origemQuantitativo: origem,
        confianca,
        observacao: nota,
      });
    }
  }
  return { itens, quantitativos, };
}

export function itensAgua(
  extraido: QuantitativoExtraido,
  premissas: ViabilidadePremissas,
): { itens: ItemCalculo[]; quantitativos: QuantitativoResultado[] } {
  const pctRede = (parseNum(premissas.percentualRedePrincipalAgua, 100) ?? 100) / 100;
  const comprimento = extraido.comprimentoTotalVias * pctRede;
  const ligacoes = extraido.quantidadeLotes;
  const registros = Math.max(1, roundInt(comprimento / 100));
  const caixas = extraido.quantidadeLotes;
  const rows: Array<{ codigo: string; descricao: string; qty: number; unidade: string }> = [
    { codigo: "AGU_REDE", descricao: "Rede de distribuição de água", qty: comprimento, unidade: "m" },
    { codigo: "AGU_LIGACAO", descricao: "Ligação predial de água", qty: ligacoes, unidade: "un" },
    { codigo: "AGU_REGISTRO", descricao: "Registro de rede", qty: registros, unidade: "un" },
    { codigo: "AGU_CAIXA", descricao: "Caixa / cavalete", qty: caixas, unidade: "un" },
  ];
  return packInfra("AGUA", rows, "ESTIMATIVA", "MEDIA", "Estimativa pelo comprimento das vias e número de lotes.");
}

export function itensEsgoto(
  extraido: QuantitativoExtraido,
  premissas: ViabilidadePremissas,
): { itens: ItemCalculo[]; quantitativos: QuantitativoResultado[]; avisos: string[] } {
  const avisos: string[] = [];
  if (premissas.sistemaPublicoEsgoto === false) {
    avisos.push(
      "Sistema público de esgoto não disponível: é necessária solução específica (ETE/elevatória). Não incluída automaticamente no custo.",
    );
  } else if (premissas.sistemaPublicoEsgoto == null) {
    avisos.push("Informe se há sistema público de esgoto disponível. ETE/elevatória não são assumidas automaticamente.");
  }
  const comprimento = extraido.comprimentoTotalVias;
  const rows: Array<{ codigo: string; descricao: string; qty: number; unidade: string }> = [
    { codigo: "ESG_REDE", descricao: "Rede coletora de esgoto", qty: comprimento, unidade: "m" },
    { codigo: "ESG_PV", descricao: "Poço de visita de esgoto", qty: Math.max(2, roundInt(comprimento / 50)), unidade: "un" },
    { codigo: "ESG_LIGACAO", descricao: "Ligação predial de esgoto", qty: extraido.quantidadeLotes, unidade: "un" },
  ];
  const packed = packInfra("ESGOTO", rows, "ESTIMATIVA", "MEDIA", "Estimativa preliminar — não é projeto da concessionária.");
  return { ...packed, avisos };
}

export function itensEnergia(
  extraido: QuantitativoExtraido,
  premissas: ViabilidadePremissas,
): { itens: ItemCalculo[]; quantitativos: QuantitativoResultado[] } {
  const orcamento = parseNum(premissas.orcamentoConcessionariaEnergia, null);
  if (orcamento != null && orcamento > 0) {
    return {
      quantitativos: [
        {
          categoria: "ENERGIA",
          descricao: "Orçamento da concessionária",
          quantidade: D(1),
          unidade: "un",
          origem: "PROJETO",
          confianca: "ALTA",
          observacao: "Valor informado pela concessionária substitui a estimativa paramétrica.",
        },
      ],
      itens: [
        {
          categoria: "ENERGIA",
          codigo: "ENE_ORCAMENTO",
          descricao: "Orçamento da concessionária de energia",
          quantidade: D(1),
          unidade: "un",
          origemQuantitativo: "PROJETO",
          confianca: "ALTA",
          valorManual: orcamento,
          observacao: "Orçamento real da concessionária.",
        },
      ],
    };
  }
  const comprimento = extraido.comprimentoTotalVias;
  const postes = Math.max(2, roundInt(comprimento / 30));
  const transformadores = Math.max(1, Math.ceil(Math.max(extraido.quantidadeLotes, 1) / 40));
  const rows: Array<{ codigo: string; descricao: string; qty: number; unidade: string }> = [
    { codigo: "ENE_REDE", descricao: "Rede de distribuição de energia", qty: comprimento, unidade: "m" },
    { codigo: "ENE_POSTE", descricao: "Poste", qty: postes, unidade: "un" },
    { codigo: "ENE_TRANSFORMADOR", descricao: "Transformador", qty: transformadores, unidade: "un" },
  ];
  return packInfra("ENERGIA", rows, "ESTIMATIVA", "BAIXA", "Estimativa paramétrica. Prefira o orçamento real da concessionária.");
}

export function itensIluminacao(extraido: QuantitativoExtraido): {
  itens: ItemCalculo[];
  quantitativos: QuantitativoResultado[];
} {
  const comprimento = extraido.comprimentoTotalVias;
  const postes = Math.max(2, roundInt(comprimento / 30));
  const rows: Array<{ codigo: string; descricao: string; qty: number; unidade: string }> = [
    { codigo: "ILU_POSTE", descricao: "Poste de iluminação", qty: postes, unidade: "un" },
    { codigo: "ILU_LUMINARIA", descricao: "Luminária", qty: postes, unidade: "un" },
    { codigo: "ILU_REDE", descricao: "Rede de iluminação pública", qty: comprimento, unidade: "m" },
  ];
  return packInfra("ILUMINACAO", rows, "ESTIMATIVA", "BAIXA", "Estimativa a partir do comprimento das vias.");
}

export function itensArborizacao(
  extraido: QuantitativoExtraido,
  premissas: ViabilidadePremissas,
): { itens: ItemCalculo[]; quantitativos: QuantitativoResultado[] } {
  const lados = premissas.numeroLadosArborizacao && premissas.numeroLadosArborizacao > 0
    ? premissas.numeroLadosArborizacao
    : 2;
  const espacamento = parseNum(premissas.espacamentoMudasM, 10) ?? 10;
  const comprimentoCalcada =
    extraido.comprimentoCalcadas > 0
      ? extraido.comprimentoCalcadas
      : extraido.comprimentoTotalVias * lados;
  const mudas = espacamento > 0 ? comprimentoCalcada / espacamento : 0;
  return packInfra(
    "ARBORIZACAO",
    [{ codigo: "ARB_MUDA", descricao: "Muda / arborização viária", qty: mudas, unidade: "un" }],
    "ESTIMATIVA",
    "MEDIA",
    `quantidadeMudas = comprimentoCalçada (${comprimentoCalcada.toFixed(1)} m) / espaçamento (${espacamento} m).`,
  );
}

export function itensSinalizacao(
  extraido: QuantitativoExtraido,
  projeto: ProjetoLoteamentoInput,
): { itens: ItemCalculo[]; quantitativos: QuantitativoResultado[] } {
  const L = extraido.comprimentoTotalVias;
  const placas = Math.max(4, roundInt(L / 80));
  const pintura = L * 0.3;
  const identificacao = Math.max(projeto.vias.length, 1);
  const rows: Array<{ codigo: string; descricao: string; qty: number; unidade: string }> = [
    { codigo: "SIN_PLACA", descricao: "Placa de sinalização", qty: placas, unidade: "un" },
    { codigo: "SIN_PINTURA", descricao: "Pintura horizontal", qty: pintura, unidade: "m²" },
    { codigo: "SIN_IDENTIFICACAO", descricao: "Identificação de ruas", qty: identificacao, unidade: "un" },
  ];
  return packInfra("SINALIZACAO", rows, "ESTIMATIVA", "BAIXA", "Estimativa preliminar — valores podem ser alterados manualmente.");
}

function packInfra(
  categoria: string,
  rows: Array<{ codigo: string; descricao: string; qty: number; unidade: string }>,
  origem: "PROJETO" | "TOPOGRAFIA" | "ESTIMATIVA",
  confianca: "ALTA" | "MEDIA" | "BAIXA",
  observacao: string,
): { itens: ItemCalculo[]; quantitativos: QuantitativoResultado[] } {
  const itens: ItemCalculo[] = [];
  const quantitativos: QuantitativoResultado[] = [];
  for (const row of rows) {
    quantitativos.push({
      categoria,
      descricao: row.descricao,
      quantidade: D(row.qty),
      unidade: row.unidade,
      origem,
      confianca,
      observacao,
    });
    if (row.qty > 0) {
      itens.push({
        categoria,
        codigo: row.codigo,
        descricao: row.descricao,
        quantidade: D(row.qty),
        unidade: row.unidade,
        origemQuantitativo: origem,
        confianca,
        observacao,
      });
    }
  }
  return { itens, quantitativos };
}
