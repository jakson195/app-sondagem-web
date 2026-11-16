/** Serviços do diretório — arquivo leve (sem a tabela do IBGE) para uso nas telas. */
export const SERVICOS_DIRETORIO = {
  topografia: "Topografia / levantamento",
  projeto_urbanistico: "Projeto urbanístico de loteamento",
  aprovacao: "Aprovação na prefeitura e licenças",
  infraestrutura: "Projetos de infraestrutura (drenagem, esgoto, pavimento)",
  sondagem: "Sondagem e geotecnia",
  regularizacao: "Regularização fundiária / REURB",
  georreferenciamento: "Georreferenciamento (INCRA/SIGEF)",
  execucao: "Execução de obras",
} as const;
export type ServicoDiretorio = keyof typeof SERVICOS_DIRETORIO;
