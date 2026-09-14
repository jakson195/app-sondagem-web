import type { CategoriaCusto } from "./types";

export type ItemTemplate = {
  categoria: CategoriaCusto;
  codigo: string;
  descricao: string;
  unidade: string;
  preferirSicro?: boolean;
};

/** Códigos lógicos internos. Preços vêm de SINAPI/SICRO/parâmetro/manual — nunca daqui. */
export const ITEM_TEMPLATES: ItemTemplate[] = [
  { categoria: "TERRAPLENAGEM", codigo: "TER_CORTE", descricao: "Corte de material", unidade: "m³", preferirSicro: true },
  { categoria: "TERRAPLENAGEM", codigo: "TER_ATERRO", descricao: "Aterro compactado", unidade: "m³", preferirSicro: true },
  { categoria: "TERRAPLENAGEM", codigo: "TER_BOTA_FORA", descricao: "Transporte de bota-fora", unidade: "m³", preferirSicro: true },
  { categoria: "TERRAPLENAGEM", codigo: "TER_EMPRESTIMO", descricao: "Material de empréstimo", unidade: "m³", preferirSicro: true },
  { categoria: "PAVIMENTACAO", codigo: "PAV_REGULARIZACAO", descricao: "Regularização do subleito", unidade: "m²" },
  { categoria: "PAVIMENTACAO", codigo: "PAV_SUBBASE", descricao: "Sub-base", unidade: "m²" },
  { categoria: "PAVIMENTACAO", codigo: "PAV_BASE", descricao: "Base", unidade: "m²" },
  { categoria: "PAVIMENTACAO", codigo: "PAV_IMPRIMACAO", descricao: "Imprimação", unidade: "m²" },
  { categoria: "PAVIMENTACAO", codigo: "PAV_REVESTIMENTO", descricao: "Revestimento asfáltico", unidade: "m²" },
  { categoria: "PAVIMENTACAO", codigo: "PAV_MEIO_FIO", descricao: "Meio-fio", unidade: "m" },
  { categoria: "PAVIMENTACAO", codigo: "PAV_SARJETA", descricao: "Sarjeta", unidade: "m" },
  { categoria: "DRENAGEM", codigo: "DRE_TUBO_400", descricao: "Tubulação Ø400 mm", unidade: "m" },
  { categoria: "DRENAGEM", codigo: "DRE_TUBO_600", descricao: "Tubulação Ø600 mm", unidade: "m" },
  { categoria: "DRENAGEM", codigo: "DRE_TUBO_800", descricao: "Tubulação Ø800 mm", unidade: "m" },
  { categoria: "DRENAGEM", codigo: "DRE_BOCA_LOBO", descricao: "Boca de lobo", unidade: "un" },
  { categoria: "DRENAGEM", codigo: "DRE_PV", descricao: "Poço de visita", unidade: "un" },
  { categoria: "DRENAGEM", codigo: "DRE_DISSIPADOR", descricao: "Dissipador", unidade: "un" },
  { categoria: "DRENAGEM", codigo: "DRE_TRAVESSIA", descricao: "Travessia", unidade: "un" },
  { categoria: "CALCADA", codigo: "CAL_REGULARIZACAO", descricao: "Regularização de calçada", unidade: "m²" },
  { categoria: "CALCADA", codigo: "CAL_PAVIMENTO", descricao: "Pavimentação de calçada", unidade: "m²" },
  { categoria: "CALCADA", codigo: "CAL_PISO_TATIL", descricao: "Piso tátil", unidade: "m²" },
  { categoria: "CALCADA", codigo: "CAL_MEIO_FIO", descricao: "Meio-fio de calçada", unidade: "m" },
  { categoria: "CALCADA", codigo: "CAL_ACESSIBILIDADE", descricao: "Adequação de acessibilidade", unidade: "m²" },
  { categoria: "AGUA", codigo: "AGU_REDE", descricao: "Rede de distribuição de água", unidade: "m" },
  { categoria: "AGUA", codigo: "AGU_LIGACAO", descricao: "Ligação predial de água", unidade: "un" },
  { categoria: "AGUA", codigo: "AGU_REGISTRO", descricao: "Registro de rede", unidade: "un" },
  { categoria: "AGUA", codigo: "AGU_CAIXA", descricao: "Caixa de água / cavalete", unidade: "un" },
  { categoria: "ESGOTO", codigo: "ESG_REDE", descricao: "Rede coletora de esgoto", unidade: "m" },
  { categoria: "ESGOTO", codigo: "ESG_PV", descricao: "Poço de visita de esgoto", unidade: "un" },
  { categoria: "ESGOTO", codigo: "ESG_LIGACAO", descricao: "Ligação predial de esgoto", unidade: "un" },
  { categoria: "ENERGIA", codigo: "ENE_REDE", descricao: "Rede de distribuição de energia", unidade: "m" },
  { categoria: "ENERGIA", codigo: "ENE_POSTE", descricao: "Poste", unidade: "un" },
  { categoria: "ENERGIA", codigo: "ENE_TRANSFORMADOR", descricao: "Transformador", unidade: "un" },
  { categoria: "ILUMINACAO", codigo: "ILU_POSTE", descricao: "Poste de iluminação", unidade: "un" },
  { categoria: "ILUMINACAO", codigo: "ILU_LUMINARIA", descricao: "Luminária", unidade: "un" },
  { categoria: "ILUMINACAO", codigo: "ILU_REDE", descricao: "Rede de iluminação pública", unidade: "m" },
  { categoria: "ARBORIZACAO", codigo: "ARB_MUDA", descricao: "Muda / arborização viária", unidade: "un" },
  { categoria: "SINALIZACAO", codigo: "SIN_PLACA", descricao: "Placa de sinalização", unidade: "un" },
  { categoria: "SINALIZACAO", codigo: "SIN_PINTURA", descricao: "Pintura horizontal", unidade: "m²" },
  { categoria: "SINALIZACAO", codigo: "SIN_IDENTIFICACAO", descricao: "Identificação de ruas", unidade: "un" },
];

export const PARAMETROS_CATALOGO: Array<{
  categoria: string;
  codigo: string;
  descricao: string;
  unidade: string;
  fonte?: string;
}> = [
  ...ITEM_TEMPLATES.map((item) => ({
    categoria: item.categoria,
    codigo: item.codigo,
    descricao: item.descricao,
    unidade: item.unidade,
    fonte: item.preferirSicro ? "SICRO" : "SINAPI",
  })),
  {
    categoria: "CONTINGENCIA",
    codigo: "CONTINGENCIA_PCT",
    descricao: "Percentual de contingência sobre a infraestrutura",
    unidade: "%",
    fonte: "PARAMETRICO",
  },
  {
    categoria: "VALIDACAO",
    codigo: "AREA_MINIMA_LOTE",
    descricao: "Área mínima de lote (parâmetro urbanístico)",
    unidade: "m²",
    fonte: "PARAMETRICO",
  },
  {
    categoria: "VALIDACAO",
    codigo: "TESTADA_MINIMA",
    descricao: "Testada mínima de lote",
    unidade: "m",
    fonte: "PARAMETRICO",
  },
  {
    categoria: "VALIDACAO",
    codigo: "LARGURA_VIA",
    descricao: "Largura mínima de via",
    unidade: "m",
    fonte: "PARAMETRICO",
  },
  {
    categoria: "VALIDACAO",
    codigo: "AREA_VERDE_PCT",
    descricao: "Percentual mínimo de área verde sobre a gleba",
    unidade: "%",
    fonte: "PARAMETRICO",
  },
  {
    categoria: "VALIDACAO",
    codigo: "AREA_INSTITUCIONAL_PCT",
    descricao: "Percentual mínimo de área institucional sobre a gleba",
    unidade: "%",
    fonte: "PARAMETRICO",
  },
];

export function templateByCodigo(codigo: string): ItemTemplate | undefined {
  return ITEM_TEMPLATES.find((item) => item.codigo === codigo);
}
