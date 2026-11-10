/**
 * Vínculo automático item interno → composição SINAPI pela DESCRIÇÃO.
 *
 * Os itens do estudo têm códigos lógicos (PAV_BASE, ESG_REDE…). A tabela da Caixa usa códigos
 * numéricos que mudam entre versões; a descrição é estável. Cada regra exige palavras-chave
 * e a mesma unidade; entre as candidatas, vence a de maior pontuação (palavras preferidas)
 * e, no empate, a descrição mais curta (composição mais genérica).
 *
 * Um código informado pelo usuário (`codigoReferencia` do parâmetro) sempre tem prioridade —
 * este vínculo só entra quando nada mais casou. Nunca inventa preço: sem candidata, fica ausente.
 */
import type { SinapiRow } from "./custos";

type Regra = {
  /** Unidades aceitas (normalizadas: M, M2, M3, UN, T, KG). */
  unidades: string[];
  /** Cada grupo precisa ter ao menos um termo presente. */
  todos: string[][];
  /** Nenhum destes pode aparecer. */
  nenhum?: string[];
  /** Cada termo presente soma pontos. */
  preferir?: string[];
};

const COMUNS_EXCLUIR = ["RECOMPOSICAO", "REMENDO", "FECHAMENTO DE VALA", "REASSENTAMENTO", "REMOCAO", "DEMOLICAO", "USINAGEM"];

export const REGRAS_SINAPI: Record<string, Regra> = {
  PAV_REGULARIZACAO: {
    unidades: ["M2"],
    todos: [["REGULARIZACAO"], ["SUBLEITO"]],
    nenhum: COMUNS_EXCLUIR,
    preferir: ["COMPACTACAO", "ARGILOSO"],
  },
  PAV_SUBBASE: {
    unidades: ["M3"],
    todos: [["SUB-BASE", "SUB BASE"], ["PAVIMENTACAO"]],
    nenhum: [...COMUNS_EXCLUIR, "CIMENTO", "CONCRETO COMPACTADO"],
    preferir: ["BRITA GRADUADA SIMPLES", "EXCLUSIVE CARGA E TRANSPORTE"],
  },
  PAV_SUBBASE_SOLO_BRITA: {
    unidades: ["M3"],
    todos: [["SUB-BASE", "SUB BASE"], ["PAVIMENTACAO"], ["SOLO"], ["BRITA"]],
    nenhum: [...COMUNS_EXCLUIR, "CIMENTO"],
    preferir: ["40%-60%", "40/60", "EXCLUSIVE"],
  },
  PAV_BASE: {
    unidades: ["M3"],
    todos: [["BASE"], ["PAVIMENTACAO"], ["BRITA GRADUADA SIMPLES"]],
    nenhum: [...COMUNS_EXCLUIR, "TRATADA COM CIMENTO"],
    preferir: ["EXCLUSIVE CARGA E TRANSPORTE"],
  },
  PAV_IMPRIMACAO: {
    unidades: ["M2"],
    todos: [["IMPRIMACAO"]],
    nenhum: COMUNS_EXCLUIR,
    preferir: ["CM-30", "ASFALTO DILUIDO"],
  },
  PAV_PINTURA_LIGACAO: {
    unidades: ["M2"],
    todos: [["PINTURA DE LIGACAO"]],
    nenhum: COMUNS_EXCLUIR,
    preferir: ["EMULSAO", "RR-2C", "RR-1C"],
  },
  PAV_REVESTIMENTO: {
    unidades: ["M3"],
    todos: [["CONCRETO ASFALTICO"], ["CAMADA DE ROLAMENTO"]],
    nenhum: [...COMUNS_EXCLUIR, "TAPA BURACO", "PRE-MISTURADO", "BINDER"],
    preferir: ["EXECUCAO DE PAVIMENTO", "EXCLUSIVE CARGA E TRANSPORTE"],
  },
  PAV_LAJOTA: {
    unidades: ["M2"],
    todos: [["PAVIMENTO", "VIA"], ["SEXTAVAD", "16 FACES"]],
    nenhum: [...COMUNS_EXCLUIR, "PASSEIO", "PERMEAVEL", "DRENANTE"],
    preferir: ["SEXTAVAD", "ESPESSURA 8 CM", "EXECUCAO DE PAVIMENTO"],
  },
  PAV_BLOCO: {
    unidades: ["M2"],
    todos: [["PISO INTERTRAVADO"], ["PAVIMENTO", "VIA"], ["RETANGULAR"]],
    nenhum: [...COMUNS_EXCLUIR, "PASSEIO", "PERMEAVEL", "DRENANTE"],
    preferir: ["ESPESSURA 8 CM", "COR NATURAL", "EXECUCAO DE PAVIMENTO"],
  },
  PAV_PARALELEPIPEDO: {
    unidades: ["M2"],
    todos: [["PARALELEPIPEDO"], ["PAVIMENT", "CALCAMENTO"]],
    nenhum: [...COMUNS_EXCLUIR, "BLOQUETE", "INTERTRAVADO"],
    preferir: ["REJUNTAMENTO", "EXECUCAO"],
  },
  PAV_MEIO_FIO: {
    unidades: ["M"],
    todos: [["MEIO-FIO", "MEIO FIO"], ["GUIA"]],
    nenhum: [...COMUNS_EXCLUIR, "JARDIN", "PRACAS", "PASSEIO", "CURVO", "SARJETA"],
    preferir: ["TRECHO RETO", "100X15X13X30", "PRE-FABRICADO"],
  },
  PAV_SARJETA: {
    unidades: ["M"],
    todos: [["SARJETA"]],
    nenhum: [...COMUNS_EXCLUIR, "CURVO", "SARJETAO"],
    preferir: ["TRECHO RETO", "CONCRETO", "MOLDADA IN LOCO"],
  },
  CAL_MEIO_FIO: {
    unidades: ["M"],
    todos: [["MEIO-FIO", "MEIO FIO"], ["GUIA"]],
    nenhum: [...COMUNS_EXCLUIR, "CURVO", "SARJETA"],
    preferir: ["PASSEIO", "JARDIN", "TRECHO RETO"],
  },
  CAL_PAVIMENTO: {
    unidades: ["M2"],
    todos: [["PASSEIO", "CALCADA"]],
    nenhum: [...COMUNS_EXCLUIR, "PERMEAVEL", "DRENANTE", "PISO TATIL", "DEMOLICAO"],
    preferir: ["CONCRETO", "MOLDADO IN LOCO", "ESPESSURA 6 CM", "INTERTRAVADO"],
  },
  CAL_PISO_TATIL: {
    unidades: ["M2"],
    todos: [["TATIL"]],
    nenhum: COMUNS_EXCLUIR,
    preferir: ["ALERTA", "DIRECIONAL", "CONCRETO"],
  },
  DRE_TUBO_400: {
    unidades: ["M"],
    todos: [["TUBO DE CONCRETO"], ["AGUAS PLUVIAIS"], ["400 MM"]],
    nenhum: [...COMUNS_EXCLUIR, "NAO INCLUI FORNECIMENTO", "SIMPLES"],
    preferir: ["BAIXO NIVEL", "FORNECIMENTO E ASSENTAMENTO"],
  },
  DRE_TUBO_600: {
    unidades: ["M"],
    todos: [["TUBO DE CONCRETO"], ["AGUAS PLUVIAIS"], ["600 MM"]],
    nenhum: [...COMUNS_EXCLUIR, "NAO INCLUI FORNECIMENTO", "SIMPLES"],
    preferir: ["BAIXO NIVEL", "FORNECIMENTO E ASSENTAMENTO"],
  },
  DRE_TUBO_800: {
    unidades: ["M"],
    todos: [["TUBO DE CONCRETO"], ["AGUAS PLUVIAIS", "DRENAGEM"], ["800 MM"]],
    nenhum: [...COMUNS_EXCLUIR, "NAO INCLUI FORNECIMENTO", "SIMPLES", "ESGOTO SANITARIO"],
    preferir: ["BAIXO NIVEL", "FORNECIMENTO E ASSENTAMENTO"],
  },
  DRE_BOCA_LOBO: {
    unidades: ["UN"],
    todos: [["BOCA DE LOBO", "BOCA-DE-LOBO"]],
    nenhum: COMUNS_EXCLUIR,
    preferir: ["SIMPLES", "GRELHA", "CONCRETO"],
  },
  DRE_PV: {
    unidades: ["UN"],
    todos: [["POCO DE VISITA"], ["PLUVIA", "DRENAGEM"]],
    nenhum: COMUNS_EXCLUIR,
    preferir: ["PROFUNDIDADE = 1,5", "1,50 M", "CIRCULAR", "PRE-MOLDADO"],
  },
  DRE_ESCAVACAO: {
    unidades: ["M3"],
    todos: [["ESCAVACAO"], ["VALA"]],
    nenhum: [...COMUNS_EXCLUIR, "MANUAL", "ROCHA", "ESCORAMENTO"],
    preferir: ["MECANIZADA", "RETROESCAVADEIRA", "ATE 1,5 M", "1,5 A 3,0 M"],
  },
  DRE_REATERRO: {
    unidades: ["M3"],
    todos: [["REATERRO"], ["VALA"]],
    nenhum: [...COMUNS_EXCLUIR, "MANUAL"],
    preferir: ["MECANIZADO", "RETROESCAVADEIRA", "COMPACTACAO"],
  },
  ESG_REDE: {
    unidades: ["M"],
    todos: [["REDE COLETORA DE ESGOTO"], ["DN 150"]],
    nenhum: [...COMUNS_EXCLUIR, "PREDIAL", "CORRUGADO"],
    preferir: ["PAREDE MACICA", "FORNECIMENTO E ASSENTAMENTO", "JUNTA ELASTICA"],
  },
  ESG_PV: {
    unidades: ["UN"],
    todos: [["POCO DE VISITA"], ["ESG"]],
    nenhum: COMUNS_EXCLUIR,
    preferir: ["PROFUNDIDADE = 1,5", "1,50 M", "ANEIS DE CONCRETO", "600 MM"],
  },
  ESG_LIGACAO: {
    unidades: ["UN"],
    todos: [["ESGOTO"], ["LIGACAO", "RAMAL PREDIAL", "LIGACOES"]],
    nenhum: COMUNS_EXCLUIR,
    preferir: ["DOMICILIAR", "PREDIAL", "DN 100"],
  },
  ESG_ESCAVACAO: {
    unidades: ["M3"],
    todos: [["ESCAVACAO"], ["VALA"]],
    nenhum: [...COMUNS_EXCLUIR, "MANUAL", "ROCHA", "ESCORAMENTO"],
    preferir: ["MECANIZADA", "RETROESCAVADEIRA", "ATE 1,5 M"],
  },
  ESG_REATERRO: {
    unidades: ["M3"],
    todos: [["REATERRO"], ["VALA"]],
    nenhum: [...COMUNS_EXCLUIR, "MANUAL"],
    preferir: ["MECANIZADO", "RETROESCAVADEIRA", "COMPACTACAO"],
  },
  AGU_REDE: {
    unidades: ["M"],
    todos: [["REDE DE AGUA"], ["DN 50", "DN 60", "DE 50", "DE 60", "50 MM", "60 MM"]],
    nenhum: [...COMUNS_EXCLUIR, "NAO INCLUI FORNECIMENTO"],
    preferir: ["PVC", "FORNECIMENTO E ASSENTAMENTO", "BAIXO"],
  },
};

/** "m²" → "M2", "m³" → "M3", "un" → "UN". */
export function normalizarUnidade(unidade: string | null | undefined): string {
  return (unidade ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace("²", "2")
    .replace("³", "3")
    .replace(/\s+/g, "")
    .replace(/^UND?$/, "UN")
    .replace(/^UNID(ADE)?$/, "UN");
}

function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
}

export type VinculoSinapi = { row: SinapiRow; pontuacao: number };

/** Melhor composição SINAPI para o código interno, ou null se nenhuma atende à regra. */
export function vincularSinapiPorDescricao(rows: SinapiRow[], codigoInterno: string): VinculoSinapi | null {
  const regra = REGRAS_SINAPI[codigoInterno];
  if (!regra) return null;
  let melhor: VinculoSinapi | null = null;
  let melhorLen = Infinity;
  for (const row of rows) {
    if (row.ativo === false) continue;
    if (!regra.unidades.includes(normalizarUnidade(row.unidade))) continue;
    const desc = normalizarTexto(row.descricao);
    if (!regra.todos.every((grupo) => grupo.some((termo) => desc.includes(normalizarTexto(termo))))) continue;
    if (regra.nenhum?.some((termo) => desc.includes(normalizarTexto(termo)))) continue;
    const pontuacao = (regra.preferir ?? []).reduce(
      (acc, termo) => acc + (desc.includes(normalizarTexto(termo)) ? 10 : 0),
      0,
    );
    if (!melhor || pontuacao > melhor.pontuacao || (pontuacao === melhor.pontuacao && desc.length < melhorLen)) {
      melhor = { row, pontuacao };
      melhorLen = desc.length;
    }
  }
  return melhor;
}
