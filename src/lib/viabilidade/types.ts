import type { Decimal } from "./money";

export const TITULO_ESTUDO = "ESTUDO DE VIABILIDADE PRELIMINAR";

export const CATEGORIAS = [
  "TERRAPLENAGEM",
  "PAVIMENTACAO",
  "DRENAGEM",
  "CALCADA",
  "AGUA",
  "ESGOTO",
  "ENERGIA",
  "ILUMINACAO",
  "ARBORIZACAO",
  "SINALIZACAO",
  "PROJETOS",
  "LICENCIAMENTO",
  "REGISTRO",
  "ADMINISTRATIVO",
  "COMERCIAL",
  "CONTINGENCIA",
] as const;

export type CategoriaCusto = (typeof CATEGORIAS)[number];

export type OrigemValor = "SINAPI" | "SICRO" | "MANUAL" | "PARAMETRICO";
export type OrigemQuantitativo = "PROJETO" | "TOPOGRAFIA" | "ESTIMATIVA";
export type NivelConfianca = "ALTA" | "MEDIA" | "BAIXA";
export type StatusValidacao = "OK" | "ALERTA" | "INCONFORME" | "NAO_ANALISADO";
export type ModalidadeReceita = "M2" | "POR_LOTE";
export type TipoCustoSinapi = "DESONERADO" | "NAO_DESONERADO";
export type FontePreco = "SINAPI" | "SICRO" | "PARAMETRICO" | "MANUAL";

export interface ProjetoLoteamentoInput {
  projetoId: string;
  nome?: string;
  crs?: string;
  areaTotal: number;
  lotes: {
    id: string;
    area: number;
    testada: number;
    profundidade?: number;
    geometria?: unknown;
  }[];
  vias: {
    id: string;
    comprimento: number;
    largura: number;
    area?: number;
    geometria?: unknown;
  }[];
  areasVerdes?: { id: string; area: number }[];
  areasInstitucionais?: { id: string; area: number }[];
  app?: { area: number };
  superficieNatural?: unknown;
  superficieProjeto?: unknown;
  calcadas?: { id: string; area: number; comprimento?: number }[];
  eixos?: { id: string; comprimento: number }[];
  drenagemProjeto?: DrenagemProjetoQuantidades;
  terraplenagem?: TerraplenagemVolumes | null;
  avisos: string[];
}

export type TerraplenagemVolumes = {
  volumeCorte: number;
  volumeAterro: number;
  balancoTerraplenagem: number;
  volumeBotaFora: number;
  volumeEmprestimo: number;
  origem: OrigemQuantitativo;
  confianca: NivelConfianca;
};

export type DrenagemProjetoQuantidades = {
  tubulacaoPorDiametroMm: Record<number, number>;
  bocasDeLobo: number;
  pocosDeVisita: number;
  dissipadores: number;
  travessias: number;
  origem: OrigemQuantitativo;
  confianca: NivelConfianca;
};

export type QuantitativoExtraido = {
  areaTotal: number;
  areaLotes: number;
  quantidadeLotes: number;
  areaMediaLote: number;
  areaMinimaLote: number;
  areaMaximaLote: number;
  testadaMinima: number;
  testadaMedia: number;
  areaVias: number;
  comprimentoTotalVias: number;
  larguraMediaVias: number;
  areaVerde: number;
  areaInstitucional: number;
  areaApp: number;
  areaCalcadas: number;
  comprimentoCalcadas: number;
};

export type ViabilidadePremissas = {
  modalidadeReceita: ModalidadeReceita;
  precoVendaM2?: string;
  precosPorLote?: Record<string, string>;
  tipoCustoSinapi: TipoCustoSinapi;
  percentualContingencia?: string;
  larguraCalcadaM?: string;
  numeroLadosCalcada?: number;
  percentualPisoTatil?: string;
  percentualAcessibilidade?: string;
  tipoCalcada?: string;
  espacamentoMudasM?: string;
  numeroLadosArborizacao?: number;
  percentualRedePrincipalAgua?: string;
  sistemaPublicoEsgoto?: boolean | null;
  orcamentoConcessionariaEnergia?: string;
  volumeCorteManualM3?: string;
  volumeAterroManualM3?: string;
  municipio?: string;
};

export type PriceQuery = {
  categoria: string;
  codigo?: string | null;
  uf: string;
  competencia?: string | null;
  fonte?: FontePreco | null;
  preferirSicro?: boolean;
  valorManual?: Decimal | string | number | null;
};

export type PriceHit =
  | {
      encontrado: true;
      custoUnitario: Decimal;
      fonte: FontePreco;
      codigo?: string;
      competencia?: string;
      uf?: string;
      descricao?: string;
      unidade?: string;
    }
  | {
      encontrado: false;
      motivo: string;
    };

export type ItemCalculo = {
  categoria: CategoriaCusto | string;
  codigo: string;
  descricao: string;
  quantidade: Decimal;
  unidade: string;
  origemQuantitativo: OrigemQuantitativo;
  confianca: NivelConfianca;
  preferirSicro?: boolean;
  observacao?: string;
  valorManual?: Decimal | string | number | null;
};

export type ItemResultado = {
  categoria: string;
  descricao: string;
  quantidade: Decimal;
  unidade: string;
  codigoReferencia: string | null;
  fonte: string | null;
  competencia: string | null;
  uf: string | null;
  custoUnitario: Decimal;
  custoTotal: Decimal;
  origemValor: OrigemValor | "AUSENTE";
  observacao: string | null;
};

export type QuantitativoResultado = {
  categoria: string;
  descricao: string;
  quantidade: Decimal;
  unidade: string;
  origem: OrigemQuantitativo;
  confianca: NivelConfianca;
  observacao: string | null;
};

export type ValidacaoResultado = {
  categoria: string;
  parametro: string;
  valorProjeto: Decimal | null;
  valorMinimo: Decimal | null;
  valorMaximo: Decimal | null;
  unidade: string | null;
  status: StatusValidacao;
  mensagem: string | null;
};

export type CenarioNome = "CONSERVADOR" | "PROVAVEL" | "OTIMISTA";

export type IndicadoresCenario = {
  nome: CenarioNome;
  receita: Decimal;
  custo: Decimal;
  lucro: Decimal;
  margem: Decimal;
  roi: Decimal;
};

export type PontoEquilibrio = {
  quantidadeLotes: Decimal;
  metodo: "PRECO_MEDIO" | "LOTES_ORDENADOS";
  observacao: string;
};

export type SemaforoNivel = "OK" | "ALERTA" | "INCONFORME" | "NAO_ANALISADO";

export type Semaforos = {
  urbanistica: SemaforoNivel;
  ambiental: SemaforoNivel;
  infraestrutura: SemaforoNivel;
  economica: SemaforoNivel;
};

export type CalculoEstudo = {
  extraido: QuantitativoExtraido;
  itens: ItemResultado[];
  quantitativos: QuantitativoResultado[];
  validacoes: ValidacaoResultado[];
  custosCategoria: Record<string, Decimal>;
  custoInfraestrutura: Decimal;
  custoContingencia: Decimal;
  custoProjetos: Decimal;
  custoLicenciamento: Decimal;
  custoRegistro: Decimal;
  custoAdministrativo: Decimal;
  custoComercial: Decimal;
  valorTerreno: Decimal;
  custoTotal: Decimal;
  receitaEstimada: Decimal;
  lucroEstimado: Decimal;
  margemPercentual: Decimal;
  roiPercentual: Decimal;
  custoPorLote: Decimal;
  receitaPorLote: Decimal;
  precoMedioLote: Decimal;
  precoMedioM2: Decimal;
  pontoEquilibrio: PontoEquilibrio;
  cenarios: IndicadoresCenario[];
  semaforos: Semaforos;
  avisos: string[];
  fonteCustosLabel: string;
  alertaCompetencia: string | null;
  precosAusentes: number;
};

export type ParametroCatalogo = {
  categoria: string;
  codigo: string | null;
  descricao: string;
  unidade: string;
  valorUnitario: Decimal | null;
  percentual: Decimal | null;
  fonte: string | null;
  codigoReferencia: string | null;
  uf: string | null;
  competencia: string | null;
  ativo: boolean;
};

export const AVISOS_ESTUDO = [
  "Este estudo possui caráter preliminar e foi elaborado para análise de viabilidade econômica do empreendimento.",
  "Os quantitativos de infraestrutura que não possuem projeto executivo são estimativos.",
  "Os valores de referência devem ser atualizados conforme a competência selecionada.",
  "O estudo não substitui projetos executivos, orçamento analítico, estudos ambientais, análise das concessionárias ou aprovação dos órgãos competentes.",
] as const;

export const VIABILIDADE_LOCAL_KEY = "datageo:viabilidade-local-project";
export const VIABILIDADE_LOCAL_ID = "local";

export const TERRAPLENAGEM_INDISPONIVEL =
  "Terraplenagem: quantitativo não disponível — informar volume estimado ou fornecer superfície topográfica.";
