import type { CadAiAction, CadAiCommand } from "./ai-command-types";

/** Sinônimos e ações legadas → ação canônica. */
export const CAD_AI_ACTION_ALIASES: Record<string, CadAiAction> = {
  criar_cota: "inserir_cota",
  calcular_area: "medir_area",
  criar_curvas_nivel: "curvas_nivel",
  gerar_curvas_de_nivel: "curvas_nivel",
  gerar_curvas_nivel: "curvas_nivel",
  isolinhas: "curvas_nivel",
  gerar_memorial: "memorial_descritivo",
  gerar_planilha_sigef: "exportar_sigef",
  exportar_planilha_sigef: "exportar_sigef",
  alterar_eixo_rua: "alterar_eixo",
  editar_eixo: "alterar_eixo",
  lotear: "gerar_loteamento",
  lotear_area: "gerar_loteamento",
  lotear_terreno: "gerar_loteamento",
  criar_loteamento: "gerar_loteamento",
  parcela_gleba: "gerar_loteamento",
  parcelar: "gerar_loteamento",
  parcelar_solo: "gerar_loteamento",
  dividir_em_lotes: "gerar_loteamento",
  divide_em_lotes: "gerar_loteamento",
  aplicar_reurb: "gerar_reurb",
  numerar_lotes: "gerar_reurb",
  memorial_tabular_reurb: "exportar_reurb_tabular",
  exportar_reurb: "exportar_reurb_tabular",
  plantas_individuais: "gerar_plantas_reurb",
  plantas_reurb: "gerar_plantas_reurb",
  gerar_perfil: "perfil_longitudinal",
  modelo_digital_terreno: "gerar_mdt",
  gerar_modelo_digital: "gerar_mdt",
  calcular_volume: "volume_corte",
  volume_terraplenagem: "volume_corte",
  calcular_volumetria: "volume_corte",
  volumetria: "volume_corte",
  corte_aterro: "volume_corte",
  notas_de_servico: "secoes",
  secoes_tipo: "secoes",
  importar_csv: "importar",
  importar_kml: "importar",
  importar_kmz: "importar",
  exportar_kml: "exportar",
  exportar_kmz: "exportar",
  apagar_entidades: "apagar",
  move_entity: "mover",
  rotate_entity: "rotacionar",
  copy_entity: "copiar",
  mirror_entity: "espelhar",
  stretch_entity: "esticar",
  scale_entity: "escala",
  offset_entity: "deslocar",
  trim_entity: "aparar",
  extend_entity: "estender",
  fillet_entity: "concordar",
  chamfer_entity: "chanfrar",
  array_entity: "matriz",
  explode_entity: "explodir",
  join_entities: "unir",
  split_entity: "dividir",
  offset: "deslocar",
  fillet: "concordar",
  chamfer: "chanfrar",
  trim: "aparar",
  explode: "explodir",
  join: "unir",
  unir_linhas: "unir",
  adicionar_texto: "inserir_texto",
  triangulacao: "gerar_tin",
  gerar_triangulacao: "gerar_tin",
  desativar_triangulacao: "remover_tin",
  remover_triangulacao: "remover_tin",
  desabilitar_triangulacao: "remover_tin",
  excluir_ponto: "apagar",
  remover_ponto: "apagar",
  deletar_ponto: "apagar",
  alterar_elevacao: "alterar_cota",
  modificar_cota: "alterar_cota",
  cota_ponto: "alterar_cota",
  inserir_coordenada: "inserir_coordenadas",
  adicionar_vertice: "criar_ponto",
  ferramenta: "ativar_ferramenta",
  set_ferramenta: "ativar_ferramenta",
  trocar_ferramenta: "ativar_ferramenta",
  mostrar_camada: "trocar_camada",
  ocultar_camada: "trocar_camada",
  set_camada: "trocar_camada",
  rua_existente: "criar_rua_existente",
  marcar_rua: "criar_rua_existente",
  via_existente: "criar_rua_existente",
  criar_rua: "criar_rua_existente",
  area_institucional: "reservar_area",
  reserva_legal: "reservar_area",
  area_verde: "reservar_area",
  reservar_faixa: "reservar_area",
  subdividir: "subdividir_quadra",
  dividir_quadra: "subdividir_quadra",
  medir_distancia_entre_pontos: "medir_distancia",
  cota_curva: "cota_curva",
  inserir_id_pontos: "mostrar_cotas_pontos",
  id_ponto: "alterar_id",
  selecionar_objetos: "selecionar",
  consultar_area: "consultar_quadra",
  area_da_quadra: "consultar_quadra",
  otimizar_lotes: "otimizar_quadra",
  redimensionar_quadra: "otimizar_quadra",
  refazer_quadra: "otimizar_quadra",
  ajustar_lotes: "otimizar_quadra",
  redistribuir_quadra: "redistribuir_lotes",
  analisar_loteamento: "validar_loteamento",
  area_remanescente: "calcular_area_remanescente",
  zoom: "zoom_objeto",
  aplicar: "aplicar_alteracao",
  desfazer: "desfazer_alteracao",
  alterar_area_verde: "reservar_area",
  alterar_area_institucional: "reservar_area",
  reprojetar_loteamento: "otimizar_quadra",
  reprojetar: "otimizar_quadra",
  completar_quadra: "redistribuir_lotes",
  completar_loteamento: "otimizar_quadra",
  nomear_quadra: "renomear_quadra",
  nomear_quadras: "renomear_quadra",
  identificar_quadras: "renomear_quadra",
  dar_nome_quadras: "renomear_quadra",
};

export function normalizeCadAiCommand(raw: CadAiCommand): CadAiCommand {
  const original = String(raw.acao ?? "");
  const acao = CAD_AI_ACTION_ALIASES[original] ?? raw.acao;
  const intervalo = raw.intervalo ?? raw.equidistancia ?? raw.equidistancia_m;
  const conteudo = raw.conteudo ?? raw.csv_conteudo;
  const arquivo = raw.arquivo?.toLowerCase();
  const formato = raw.formato?.toLowerCase();
  const z = raw.z ?? raw.cota_referencia_m;
  const area_minima_m2 = raw.area_minima_m2 ?? raw.area_alvo_m2;
  let testada_minima_m = raw.testada_minima_m ?? raw.testada_m;
  let largura_via_m = raw.largura_via_m;
  let profundidade_quadra_m = raw.profundidade_quadra_m;
  let largura_quadra_m = raw.largura_quadra_m;
  let distancia_quadra_m = raw.distancia_quadra_m;
  const area_minima_quadra_m2 = raw.area_minima_quadra_m2 ?? raw.area_quadra_m2;
  if (acao === "gerar_loteamento") {
    const hasLotTarget = area_minima_m2 != null && Number.isFinite(area_minima_m2) && area_minima_m2 > 0;
    const hasBlockSize =
      (largura_quadra_m != null && largura_quadra_m > 0) ||
      (distancia_quadra_m != null && distancia_quadra_m > 0);
    if (!(testada_minima_m != null && testada_minima_m > 0) && hasLotTarget) testada_minima_m = 10;
    if (!(largura_via_m != null && largura_via_m > 0) && (hasLotTarget || hasBlockSize)) largura_via_m = 10;
    if (
      !(profundidade_quadra_m != null && profundidade_quadra_m > 0) &&
      hasLotTarget &&
      testada_minima_m != null &&
      testada_minima_m > 0
    ) {
      profundidade_quadra_m = area_minima_m2 / testada_minima_m;
    }
    if (!(distancia_quadra_m != null && distancia_quadra_m > 0) && largura_quadra_m != null && largura_quadra_m > 0) {
      distancia_quadra_m = largura_quadra_m;
    }
    largura_quadra_m = undefined;
  }
  const texto = raw.texto ?? raw.nome;
  const visivel =
    acao === "trocar_camada" && original === "ocultar_camada" ? false : raw.visivel;
  let tipo = raw.tipo;
  if (!tipo) {
    if (original === "alterar_area_verde" || original === "area_verde") tipo = "reserva_legal";
    if (original === "alterar_area_institucional" || original === "area_institucional") {
      tipo = "institucional";
    }
  }

  return {
    ...raw,
    acao,
    intervalo,
    conteudo,
    arquivo,
    formato,
    z,
    area_minima_m2,
    testada_minima_m,
    largura_via_m,
    profundidade_quadra_m,
    area_minima_quadra_m2,
    largura_quadra_m,
    distancia_quadra_m,
    require_road_access: acao === "gerar_loteamento" ? raw.require_road_access !== false : raw.require_road_access,
    allow_internal_roads: acao === "gerar_loteamento" ? raw.allow_internal_roads !== false : raw.allow_internal_roads,
    texto,
    visivel,
    tipo,
  };
}

export const CAD_AI_ACTION_CATALOG: Array<{ acao: CadAiAction; descricao: string; params?: string }> = [
  { acao: "criar_ponto", descricao: "Criar ponto", params: "x, y, z ou osnap+lote/quadra" },
  { acao: "criar_linha", descricao: "Linha entre 2 pontos", params: "pontos: [P1,P2] ou osnap_origem/osnap_destino" },
  { acao: "criar_polilinha", descricao: "Polilinha aberta", params: "pontos[]" },
  { acao: "criar_poligono", descricao: "Polígono fechado", params: "pontos[] (mín. 3)" },
  { acao: "fechar_poligono", descricao: "Fechar polígono selecionado", params: "entidade_id?" },
  { acao: "unir_linhas", descricao: "Unir polilinhas", params: "entidade_ids[]" },
  { acao: "apagar", descricao: "Apagar entidade(s)", params: "entidade_id | entidade_ids" },
  { acao: "mover", descricao: "Mover entidade", params: "entidade_id, distancia, angulo" },
  { acao: "copiar", descricao: "Copiar entidade", params: "entidade_id, distancia, angulo" },
  { acao: "rotacionar", descricao: "Rotacionar entidade", params: "entidade_id, angulo" },
  { acao: "alterar_id", descricao: "Renomear ponto", params: "id_origem, novo_id" },
  { acao: "alterar_cota", descricao: "Alterar cota Z do ponto", params: "id_origem, z" },
  { acao: "renumerar_pontos", descricao: "Renumerar P1, P2…", params: "—" },
  { acao: "mostrar_coordenadas", descricao: "Listar coordenadas", params: "pontos[]?" },
  { acao: "exportar_pontos", descricao: "Exportar pontos CSV", params: "—" },
  { acao: "medir_distancia", descricao: "Distância entre pontos", params: "pontos: [P1,P2]" },
  { acao: "medir_area", descricao: "Área do polígono", params: "entidade_id?" },
  { acao: "medir_perimetro", descricao: "Perímetro", params: "entidade_id?" },
  { acao: "medir_azimute", descricao: "Azimute entre pontos", params: "pontos: [P1,P2]" },
  { acao: "medir_inclinacao", descricao: "Inclinação/declividade", params: "pontos: [P1,P2]" },
  { acao: "inserir_cota", descricao: "Cota linear", params: "pontos: [P1,P2]" },
  { acao: "inserir_cota_automatica", descricao: "Cotas em todos os lados", params: "entidade_id?" },
  { acao: "inserir_texto", descricao: "Texto no desenho", params: "texto, pontos? | entidade_id" },
  { acao: "inserir_coordenadas", descricao: "Etiqueta de coordenadas", params: "pontos[]" },
  { acao: "inserir_area", descricao: "Texto de área no centro", params: "entidade_id?" },
  { acao: "inserir_elevacao", descricao: "Etiqueta de cota Z", params: "pontos[]?" },
  { acao: "mostrar_cotas_pontos", descricao: "Etiquetas Z em todos os pontos", params: "—" },
  { acao: "gerar_tin", descricao: "Triangulação TIN", params: "—" },
  { acao: "triangulacao", descricao: "Alias triangulação TIN", params: "—" },
  { acao: "remover_tin", descricao: "Remover/desativar triangulação TIN", params: "—" },
  { acao: "cota_curva", descricao: "Etiquetas de cota nas curvas de nível", params: "—" },
  { acao: "medir", descricao: "Medição genérica (área, distância ou perímetro)", params: "pontos[]?" },
  { acao: "adicionar_texto", descricao: "Alias inserir texto", params: "texto" },
  { acao: "gerar_mdt", descricao: "Gerar MDT (TIN) a partir dos pontos com cota", params: "—" },
  { acao: "gerar_mds", descricao: "MDS (em desenvolvimento)", params: "—" },
  { acao: "curvas_nivel", descricao: "Curvas de nível", params: "equidistancia (m)" },
  { acao: "mapa_declividade", descricao: "Mapa declividade (em desenvolvimento)", params: "—" },
  { acao: "mapa_hipsometrico", descricao: "Mapa hipsométrico colorido com escala", params: "—" },
  { acao: "importar", descricao: "Importar arquivo", params: "arquivo: csv|txt|dxf|geojson|shp|kml|kmz, conteudo" },
  { acao: "exportar", descricao: "Exportar projeto", params: "formato: dxf|dwg|shp|csv|ods|pdf|kml|kmz" },
  { acao: "exportar_sigef", descricao: "Planilha ODS SIGEF da poligonal selecionada", params: "entidade_id?" },
  {
    acao: "gerar_loteamento",
    descricao: "Divide a gleba em lotes com vias internas",
    params: "largura_via_m, profundidade_quadra_m, testada_minima_m, area_minima_quadra_m2?, largura_quadra_m?, distancia_quadra_m?, largura_calcada_m?, eixo_rua?, raio_esquina_m?, vias_existentes_extremidades?, largura_via_existente_m?, lados_aresta?, entidade_ids?",
  },
  {
    acao: "alterar_eixo",
    descricao: "Altera o eixo da rua em 2 pontos (de uma quadra até a outra)",
    params: "—",
  },
  {
    acao: "gerar_reurb",
    descricao: "Numera lotes (Lote 01…), insere cotas e áreas nos polígonos fechados",
    params: "—",
  },
  {
    acao: "exportar_reurb_tabular",
    descricao: "Memorial tabular ODS de todos os lotes (REURB)",
    params: "—",
  },
  {
    acao: "gerar_plantas_reurb",
    descricao: "Plantas individuais DWG+PDF de todos os lotes (ZIP)",
    params: "—",
  },
  { acao: "memorial_descritivo", descricao: "Memorial descritivo Word", params: "entidade_id?" },
  { acao: "calcular_azimutes", descricao: "Azimutes do perímetro", params: "entidade_id?" },
  { acao: "calcular_rumos", descricao: "Rumos do perímetro", params: "entidade_id?" },
  { acao: "area_geodesica", descricao: "Área (plano atual)", params: "entidade_id?" },
  { acao: "conferir_fechamento", descricao: "Conferir fechamento", params: "entidade_id?" },
  { acao: "ajustar_poligono", descricao: "Ajuste geométrico (em desenvolvimento)", params: "—" },
  { acao: "perfil_longitudinal", descricao: "Perfil longitudinal", params: "pontos: [P1,P2]" },
  { acao: "secoes", descricao: "Seções-tipo no eixo selecionado", params: "intervalo, largura" },
  { acao: "volume_corte", descricao: "Volume de corte vs platô (Z) e polígono opcional", params: "z?, entidade_id?" },
  { acao: "volume_aterro", descricao: "Volume de aterro vs platô (Z) e polígono opcional", params: "z?, entidade_id?" },
  {
    acao: "ativar_ferramenta",
    descricao: "Troca a ferramenta ativa do CAD",
    params: "ferramenta: selecionar|pan|linha|polilinha|editar_poligono|confrontacao",
  },
  { acao: "trocar_camada", descricao: "Mostra ou oculta uma camada", params: "camada, visivel?" },
  {
    acao: "subdividir_quadra",
    descricao: "Divide a quadra selecionada em lotes pela testada",
    params: "testada_m, lado?, area_minima_m2?",
  },
  { acao: "criar_rua_existente", descricao: "Marca a polilinha como via pública existente", params: "nome?, largura?, entidade_id?" },
  {
    acao: "reservar_area",
    descricao: "Reserva uma faixa da gleba (institucional ou área verde)",
    params: "tipo, percentual, lado?",
  },
  { acao: "inserir_sondagem", descricao: "Sondagem (em desenvolvimento)", params: "—" },
  { acao: "perfil_geologico", descricao: "Perfil geológico (em desenvolvimento)", params: "—" },
  { acao: "secao_spt", descricao: "Seção SPT (em desenvolvimento)", params: "—" },
  { acao: "poco_monitoramento", descricao: "Poço monitoramento (em desenvolvimento)", params: "—" },
  { acao: "selecionar", descricao: "Selecionar entidade", params: "entidade_id" },
  { acao: "consultar_projeto", descricao: "Resumo do projeto e do loteamento", params: "—" },
  { acao: "consultar_quadras", descricao: "Listar quadras e áreas", params: "—" },
  { acao: "consultar_quadra", descricao: "Consultar uma quadra", params: "quadra" },
  { acao: "consultar_lotes", descricao: "Listar/filtrar lotes", params: "quadra?, filtro_area_max_m2?" },
  { acao: "consultar_lote", descricao: "Consultar um lote", params: "lote" },
  { acao: "calcular_testada", descricao: "Testada de um lote", params: "lote" },
  { acao: "calcular_area_remanescente", descricao: "Área remanescente do loteamento", params: "quadra?" },
  { acao: "otimizar_quadra", descricao: "Reempacota lotes da quadra pelo motor geométrico", params: "quadra, area_alvo_m2, excecoes?" },
  { acao: "ajustar_lote", descricao: "Ajusta SOMENTE o lote informado (scope=single_lot). Não reempacota a quadra.", params: "lote, area_alvo_m2, scope" },
  { acao: "redistribuir_lotes", descricao: "Redistribui lotes da quadra fechando a área", params: "quadra?" },
  { acao: "validar_loteamento", descricao: "Analisa problemas do loteamento", params: "—" },
  { acao: "aplicar_alteracao", descricao: "Aplica a prévia pendente", params: "—" },
  { acao: "desfazer_alteracao", descricao: "Desfaz a última alteração aplicada", params: "—" },
  { acao: "zoom_objeto", descricao: "Enquadra quadra ou lote", params: "quadra? | lote?" },
  { acao: "renomear_quadra", descricao: "Renomeia rótulos de quadras (sem alterar geometria)", params: "quadra?, novo_id?, nomes?" },
  { acao: "desconhecido", descricao: "Comando não reconhecido", params: "resposta com sugestões" },
];

/** Ações com implementação real no executor (não são stubs). */
export const CAD_AI_IMPLEMENTED_ACTIONS = [
  "criar_ponto",
  "criar_linha",
  "criar_polilinha",
  "criar_poligono",
  "fechar_poligono",
  "unir_linhas",
  "apagar",
  "mover",
  "copiar",
  "rotacionar",
  "espelhar",
  "esticar",
  "escala",
  "deslocar",
  "aparar",
  "estender",
  "concordar",
  "chanfrar",
  "matriz",
  "explodir",
  "unir",
  "dividir",
  "alterar_id",
  "alterar_cota",
  "renumerar_pontos",
  "mostrar_coordenadas",
  "exportar_pontos",
  "medir_distancia",
  "medir_area",
  "medir_perimetro",
  "medir_azimute",
  "medir_inclinacao",
  "inserir_cota",
  "inserir_cota_automatica",
  "inserir_texto",
  "inserir_coordenadas",
  "inserir_area",
  "inserir_elevacao",
  "mostrar_cotas_pontos",
  "gerar_tin",
  "remover_tin",
  "cota_curva",
  "medir",
  "curvas_nivel",
  "mapa_hipsometrico",
  "importar",
  "exportar",
  "exportar_sigef",
  "gerar_loteamento",
  "alterar_eixo",
  "gerar_reurb",
  "exportar_reurb_tabular",
  "gerar_plantas_reurb",
  "memorial_descritivo",
  "calcular_azimutes",
  "calcular_rumos",
  "area_geodesica",
  "conferir_fechamento",
  "perfil_longitudinal",
  "perfil_transversal",
  "secoes",
  "gerar_mdt",
  "volume_corte",
  "volume_aterro",
  "ativar_ferramenta",
  "trocar_camada",
  "subdividir_quadra",
  "criar_rua_existente",
  "reservar_area",
  "selecionar",
  "consultar_projeto",
  "consultar_quadras",
  "consultar_quadra",
  "consultar_lotes",
  "consultar_lote",
  "calcular_testada",
  "calcular_area_remanescente",
  "otimizar_quadra",
  "ajustar_lote",
  "redistribuir_lotes",
  "validar_loteamento",
  "aplicar_alteracao",
  "desfazer_alteracao",
  "zoom_objeto",
  "renomear_quadra",
] as const satisfies readonly CadAiAction[];

export type CadAiImplementedAction = (typeof CAD_AI_IMPLEMENTED_ACTIONS)[number];

const CAD_AI_IMPLEMENTED_SET = new Set<string>(CAD_AI_IMPLEMENTED_ACTIONS);

export function isCadAiImplementedAction(acao: string): acao is CadAiImplementedAction {
  return CAD_AI_IMPLEMENTED_SET.has(acao);
}

export type CadAiJsonSchema = {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties: false;
};

export type CadAiTool = {
  type: "function";
  function: {
    name: CadAiImplementedAction;
    description: string;
    parameters: CadAiJsonSchema;
  };
};

const SCHEMA_PROPS = {
  pontos: {
    type: "array",
    items: { type: "string" },
    description: "Rótulos dos pontos do contexto (ex.: P1, P2). Normalize 'ponto 1' → P1, 'vértice 1' → V1.",
  },
  entidade_id: {
    type: "string",
    description: "ID da entidade no desenho. Omita se usarSelecao=true.",
  },
  entidade_ids: {
    type: "array",
    items: { type: "string" },
    description: "IDs de duas ou mais entidades (unir linhas, apagar em lote).",
  },
  usarSelecao: {
    type: "boolean",
    description: "true para usar a entidade/pontos atualmente selecionados (contexto.selecao).",
  },
  resposta: {
    type: "string",
    description: "Mensagem curta em português confirmando a ação.",
  },
  distancia: { type: "number", description: "Distância em metros." },
  distancia_1: { type: "number", description: "Primeira distância do chanfro (m)." },
  distancia_2: { type: "number", description: "Segunda distância do chanfro (m)." },
  dx: { type: "number", description: "Deslocamento em E (metros). +leste." },
  dy: { type: "number", description: "Deslocamento em N (metros). +norte." },
  x2: { type: "number", description: "Segundo ponto E (eixo de espelho / janela)." },
  y2: { type: "number", description: "Segundo ponto N (eixo de espelho / janela)." },
  fator: { type: "number", description: "Fator de escala (2 = dobro, 0.8 = 80%)." },
  raio: { type: "number", description: "Raio da concordância em metros." },
  manter_original: { type: "boolean", description: "true = manter o original ao espelhar/copiar." },
  colunas: { type: "number", description: "Colunas da matriz retangular." },
  linhas: { type: "number", description: "Linhas da matriz retangular." },
  partes: { type: "number", description: "Quantidade de partes iguais (dividir) ou cópias (matriz polar)." },
  entidade_corte: { type: "string", description: "ID do objeto limite (aparar/estender)." },
  vertices_indices: {
    type: "array",
    items: { type: "number" },
    description: "Índices dos vértices a esticar ou da esquina da concordância.",
  },
  tipo_matriz: {
    type: "string",
    enum: ["retangular", "polar"],
    description: "Tipo da matriz: retangular ou polar.",
  },
  entity_type: {
    type: "string",
    description: "Tipo lógico: lote, quadra, rua, linha, polilinha, poligono.",
  },
  angulo: {
    type: "number",
    description: "Azimute ou ângulo em graus. Em mover/copiar: azimute a partir do norte.",
  },
  x: { type: "number", description: "Coordenada E (este) em metros." },
  y: { type: "number", description: "Coordenada N (norte) em metros." },
  z: { type: "number", description: "Cota Z em metros." },
  texto: { type: "string", description: "Texto do rótulo a inserir." },
  novo_id: { type: "string", description: "Novo identificador/rótulo do ponto." },
  id_origem: { type: "string", description: "Rótulo ou ID atual do ponto." },
  intervalo: { type: "number", description: "Equidistância vertical em metros (curvas de nível)." },
  equidistancia: { type: "number", description: "Alias de intervalo, em metros." },
  largura: { type: "number", description: "Largura da seção transversal em metros." },
  arquivo: {
    type: "string",
    enum: ["csv", "txt", "dxf", "shp", "kml", "kmz", "geojson"],
    description: "Formato do arquivo a importar.",
  },
  formato: {
    type: "string",
    enum: ["dxf", "dwg", "shp", "csv", "kml", "kmz", "pdf", "ods"],
    description: "Formato de exportação.",
  },
  conteudo: { type: "string", description: "Conteúdo textual do arquivo anexado (já enviado no contexto)." },
  forcar: { type: "boolean", description: "true para apagar pontos RTK bloqueados após confirmação." },
  posicao: {
    type: "string",
    description: 'Use "centro" para colocar texto no centróide do polígono selecionado.',
  },
  largura_via_m: {
    type: "number",
    description:
      "Largura total do corredor da via em metros (pista + 2 calçadas). Ex.: 12. A calçada é faixa interna; não some à via.",
  },
  profundidade_quadra_m: {
    type: "number",
    description:
      "Profundidade do lote em metros, da testada ao fundo (ex.: 30 para lote de 300 m² com testada 10). A malha espaça vias internas em ~2× este valor + largura da via. Nunca empilha mais de duas fileiras sem criar rua.",
  },
  testada_minima_m: {
    type: "number",
    description: "Testada mínima de cada lote em metros (ex.: 10).",
  },
  area_minima_m2: {
    type: "number",
    description: "Área mínima do lote interno em m². Se omitida, usa testada × profundidade (ex.: 12×25 = 300).",
  },
  area_minima_quadra_m2: {
    type: "number",
    description:
      "Área alvo de cada quadra em m² (ex.: 2000). Divide a gleba em quadras de cerca desse tamanho, com vias entre elas. 0 ou omitir = não divide por área.",
  },
  area_quadra_m2: {
    type: "number",
    description: "Alias de area_minima_quadra_m2 — área alvo da quadra em m² (ex.: 2000).",
  },
  largura_quadra_m: {
    type: "number",
    description:
      "Obsoleto. A largura da quadra é sempre 2 × profundidade_quadra_m (duas fileiras, uma para cada rua). Não envie.",
  },
  distancia_quadra_m: {
    type: "number",
    description:
      "Comprimento da quadra ao longo da rua, em metros. A largura entre as duas ruas é calculada: 2 × profundidade do lote, com um lote virado para cada lado. Tem prioridade sobre area_minima_quadra_m2.",
  },
  orientacao: {
    type: "number",
    description: "Azimute das vias em graus (0–360). Se omitido, usa o lado mais longo da gleba.",
  },
  prefixo_quadra: {
    type: "string",
    description: 'Prefixo das quadras (padrão "Quadra"). Ex.: "Q" gera Q A, Q B…',
  },
  largura_calcada_m: {
    type: "number",
    description:
      "Largura da calçada em cada lado (m), interna ao corredor da via (hachura). 0 = sem calçada. Pista = largura_via_m − 2×largura_calcada_m. Omitir = 0.",
  },
  eixo_rua: {
    type: "boolean",
    description: "Se true, desenha o eixo tracejado no centro de cada via (camada LOTEAMENTO_EIXO_VIA). Padrão: true.",
  },
  raio_esquina_m: {
    type: "number",
    description:
      "Raio só nas esquinas verdadeiras (lote de canto com frente a duas vias que se cruzam), em metros. Meio de quadra e fundos ficam em canto vivo. 0 = sem filete. Omitir = 0.",
  },
  vias_existentes_extremidades: {
    type: "boolean",
    description:
      "true = a via pública já existe fora da gleba. Gera o corredor do lado de fora (não come o terreno) e une as vias do loteamento a ele na borda. Combine com lados_aresta e largura_via_existente_m. Padrão: false.",
  },
  largura_via_existente_m: {
    type: "number",
    description:
      "Largura (m) da via existente gerada fora da gleba. Omitir = mesma largura_via_m das ruas do loteamento.",
  },
  lados_aresta: {
    type: "array",
    items: { type: "number" },
    description:
      "Índices das arestas da gleba (0 = primeiro lado) onde a via pública já passa por fora. Só nesses lados se gera a via fora do polígono e as ruas internas se unem a ela. Clique no desenho para marcar.",
  },
  lados_faixa_dominio: {
    type: "array",
    items: { type: "number" },
    description:
      "Índices das arestas da gleba voltadas à rodovia. A faixa de domínio entra para DENTRO da gleba (não é rua). Lotes e vias não ocupam essa faixa.",
  },
  lados_rua_contorno: {
    type: "array",
    items: { type: "number" },
    description:
      "Índices das arestas da gleba (0 = primeiro lado) que recebem rua de contorno NOVA, por dentro da divisa. Só criar quando o usuário pedir rua naquele lado; sem índices não há rua na divisa e a fileira de lotes fica de costas para ela.",
  },
  ruas_contorno: {
    type: "string",
    enum: ["indicadas", "todas"],
    description:
      "\"indicadas\" (padrão): rua de contorno só nos lados_rua_contorno. \"todas\": rua em todas as divisas — só se o usuário pedir explicitamente rua em volta da gleba inteira.",
  },
  largura_faixa_dominio_m: {
    type: "number",
    description:
      "Largura (m) da faixa de domínio recuada para dentro da gleba no lado da rodovia. Ex.: 15 ou 20.",
  },
  ferramenta: {
    type: "string",
    enum: [
      "selecionar",
      "pan",
      "linha",
      "polilinha",
      "editar_poligono",
      "confrontacao",
      "mover",
      "rotacionar",
      "copiar",
      "espelhar",
      "esticar",
      "escala",
      "deslocar",
      "aparar",
      "estender",
      "concordar",
      "chanfrar",
      "matriz",
      "explodir",
      "unir",
      "dividir",
    ],
    description: "Ferramenta do canvas a ativar.",
  },
  camada: {
    type: "string",
    description: "Nome ou id da camada (ex.: CURVAS_NIVEL, TRIANGULACAO_TIN, LOTEAMENTO_LOTES).",
  },
  visivel: {
    type: "boolean",
    description: "true para mostrar a camada, false para ocultar. Padrão: true.",
  },
  testada_m: {
    type: "number",
    description: "Testada desejada de cada lote em metros (subdividir_quadra). Alias de testada_minima_m.",
  },
  lado: {
    type: "string",
    enum: ["norte", "sul", "leste", "oeste", "frente", "fundo", "esquerda", "direita", "selecionado_no_mapa"],
    description: "Lado da quadra/gleba (frente da testada ou lado da faixa reservada).",
  },
  percentual: {
    type: "number",
    description: "Percentual da área da gleba a reservar (0–100).",
  },
  tipo: {
    type: "string",
    enum: ["institucional", "reserva_legal", "area_verde"],
    description: "Tipo da área reservada: institucional ou área verde.",
  },
  nome: {
    type: "string",
    description: "Nome da via pública existente.",
  },
  quadra: {
    type: "string",
    description: 'Identificador da quadra no loteamento (ex.: "G", "H", "Quadra G").',
  },
  lote: {
    type: "string",
    description: 'Identificador do lote: "01", "lote 1", "G-01" ou "H-05". Normalize "lote 1" → "01".',
  },
  osnap: {
    type: "string",
    description:
      "Tipo OSNAP do motor CAD: ENDPOINT, MIDPOINT, CENTER, INTERSECTION, PERPENDICULAR, TANGENT, QUADRANT, NODE, NEAREST, EXTENSION, INSERTION, APPARENT_INTERSECTION. A IA NÃO calcula coordenada — só pede o tipo e o alvo (lote/quadra/nome).",
  },
  osnap_origem: {
    type: "string",
    description: "OSNAP do ponto inicial da linha (mesmo vocabulário de osnap).",
  },
  osnap_destino: {
    type: "string",
    description: "OSNAP do ponto final da linha (ex.: PERPENDICULAR na Rua A).",
  },
  lotes: {
    type: "array",
    items: { type: "string" },
    description: "Lista de lotes (ex.: G-01, G-02).",
  },
  area_alvo_m2: {
    type: "number",
    description: "Área alvo de cada lote em m² (ex.: 300).",
  },
  area_maxima_m2: {
    type: "number",
    description: "Área máxima em m².",
  },
  require_road_access: {
    type: "boolean",
    description: "true = todo lote precisa confrontar uma via. Sempre true no motor.",
  },
  allow_internal_roads: {
    type: "boolean",
    description: "true = criar ruas internas conectadas quando a profundidade da quadra exigir.",
  },
  preservar_ruas: {
    type: "boolean",
    description: "true = não alterar eixos/vias. Padrão: true.",
  },
  preservar_limites: {
    type: "boolean",
    description: "true = manter o contorno da quadra. Padrão: true.",
  },
  minimizar_remanescente: {
    type: "boolean",
    description: "true = fechar a quadra e reduzir sobras. Padrão: true.",
  },
  lotes_esquina_maiores: {
    type: "boolean",
    description: "true = lotes de esquina com área maior que os internos.",
  },
  objetivo: {
    type: "string",
    enum: ["maximizar_equidade", "maximize_valid_lots"],
    description:
      'maximizar_equidade = lotes mais iguais. maximize_valid_lots = máximo de lotes válidos com acesso viário. NÃO calcule geometria — o motor CAD otimiza.',
  },
  excecoes: {
    type: "array",
    items: {
      type: "object",
      properties: {
        lote: { type: "string" },
        area_alvo_m2: { type: "number" },
      },
      required: ["lote", "area_alvo_m2"],
      additionalProperties: false,
    },
    description: "Lotes com área diferente da área alvo da quadra.",
  },
  filtro_area_max_m2: {
    type: "number",
    description: "Filtrar lotes com área abaixo deste valor (m²).",
  },
  filtro_area_min_m2: {
    type: "number",
    description: "Filtrar lotes com área acima deste valor (m²).",
  },
  nomes: {
    type: "array",
    items: { type: "string" },
    description: "Novos nomes das quadras na ordem (ex.: QA, QB). Sem nomes: pergunte, não execute.",
  },
  scope: {
    type: "string",
    enum: ["single_lot", "quad", "local_redistribution"],
    description:
      "single_lot = só o lote informado (padrão de ajustar_lote). quad = quadra inteira. local_redistribution = lote + vizinhos autorizados pelo usuário.",
  },
} as const;

type SchemaPropKey = keyof typeof SCHEMA_PROPS;

function synonymsFor(acao: CadAiAction): string[] {
  return Object.entries(CAD_AI_ACTION_ALIASES)
    .filter(([, canonical]) => canonical === acao)
    .map(([alias]) => alias);
}

function tool(
  acao: CadAiImplementedAction,
  descricao: string,
  props: SchemaPropKey[],
  required?: SchemaPropKey[],
): CadAiTool {
  const syn = synonymsFor(acao);
  const description = syn.length
    ? `${descricao} Sinônimos: ${syn.join(", ")}.`
    : descricao;
  const properties: CadAiJsonSchema["properties"] = {};
  for (const key of props) {
    properties[key] = { ...SCHEMA_PROPS[key] };
  }
  return {
    type: "function",
    function: {
      name: acao,
      description,
      parameters: {
        type: "object",
        properties,
        ...(required?.length ? { required: [...required] } : {}),
        additionalProperties: false,
      },
    },
  };
}

const CAD_AI_RESPONSE_ALIASES: Array<{
  name: string;
  from: CadAiImplementedAction;
  description: string;
}> = [
  {
    name: "calcular_area",
    from: "medir_area",
    description: "Calcular a área de um lote, quadra ou polígono. Somente leitura. Equivale a medir_area / consultar_lote.",
  },
  {
    name: "ajustar_lotes",
    from: "otimizar_quadra",
    description:
      "Ajusta o conjunto de lotes da quadra/seleção (ex.: todos para 250 m²). Se várias quadras e nenhuma selecionada, pergunte qual. Equivale a otimizar_quadra.",
  },
  {
    name: "reprojetar_loteamento",
    from: "otimizar_quadra",
    description:
      "Reprojeta o loteamento com o motor CAD (preservar ruas, maximizar aproveitamento, acesso viário). Exige confirmação. Equivale a otimizar_quadra.",
  },
  {
    name: "alterar_area_verde",
    from: "reservar_area",
    description: "Altera a área verde para o percentual informado (ex.: 10). O CAD calcula a geometria. tipo=reserva_legal.",
  },
  {
    name: "alterar_area_institucional",
    from: "reservar_area",
    description: "Altera a área institucional para o percentual informado. O CAD calcula a geometria. tipo=institucional.",
  },
  { name: "move_entity", from: "mover", description: "Mover geometria. O CAD executa. dx/dy ou distancia+angulo (0=norte, 90=leste)." },
  { name: "rotate_entity", from: "rotacionar", description: "Rotacionar geometria. O CAD executa. angulo em graus." },
  { name: "copy_entity", from: "copiar", description: "Copiar geometria sem alterar o original. O CAD executa." },
  { name: "mirror_entity", from: "espelhar", description: "Espelhar no eixo (x,y)-(x2,y2). O CAD executa." },
  { name: "stretch_entity", from: "esticar", description: "Esticar só parte da geometria. O CAD executa." },
  { name: "scale_entity", from: "escala", description: "Escalar a partir de um ponto. O CAD executa." },
  { name: "offset_entity", from: "deslocar", description: "Offset/paralela. O CAD executa." },
  { name: "trim_entity", from: "aparar", description: "Aparar no limite. O CAD executa." },
  { name: "extend_entity", from: "estender", description: "Estender até o limite. O CAD executa." },
  { name: "fillet_entity", from: "concordar", description: "Concordância/fillet. O CAD executa." },
  { name: "chamfer_entity", from: "chanfrar", description: "Chanfro. O CAD executa." },
  { name: "array_entity", from: "matriz", description: "Matriz retangular ou polar. O CAD executa." },
  { name: "explode_entity", from: "explodir", description: "Explodir polígono em linhas. O CAD executa." },
  { name: "join_entities", from: "unir", description: "Unir linhas conectadas. O CAD executa." },
  { name: "split_entity", from: "dividir", description: "Dividir em partes iguais. O CAD executa." },
];

/**
 * Tools no formato Responses API (`type: "function"` no topo).
 * Reutiliza o catálogo canônico — aliases apontam para as mesmas funções do motor.
 */
export function cadAiResponsesTools(): Array<{
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict: boolean;
}> {
  const canonical = cadAiTools.map((item) => ({
    type: "function" as const,
    name: item.function.name,
    description: item.function.description,
    parameters: item.function.parameters as unknown as Record<string, unknown>,
    strict: false,
  }));
  const byName = new Map(cadAiTools.map((item) => [item.function.name, item]));
  const aliases = CAD_AI_RESPONSE_ALIASES.flatMap((alias) => {
    const source = byName.get(alias.from);
    if (!source) return [];
    return [
      {
        type: "function" as const,
        name: alias.name,
        description: alias.description,
        parameters: source.function.parameters as unknown as Record<string, unknown>,
        strict: false,
      },
    ];
  });
  return [...canonical, ...aliases];
}

/**
 * Tools OpenAI function calling — uma por ação implementada.
 * O name da tool é a própria `acao` de CadAiCommand.
 */
export const cadAiTools: CadAiTool[] = [
  tool("criar_ponto", "Criar um ponto nas coordenadas E/N (x/y) ou no OSNAP de um lote/quadra/entidade. A IA não calcula o snap — informe osnap + lote/quadra/nome.", ["x", "y", "z", "novo_id", "texto", "osnap", "lote", "quadra", "nome", "usarSelecao", "resposta"]),
  tool("criar_linha", "Criar uma linha reta. Use pontos rotulados ou osnap_origem/osnap_destino no motor CAD (ENDPOINT no lote, PERPENDICULAR na rua). A IA não calcula coordenadas.", ["pontos", "usarSelecao", "osnap", "osnap_origem", "osnap_destino", "lote", "quadra", "nome", "distancia", "angulo", "resposta"]),
  tool("criar_polilinha", "Criar uma polilinha aberta ligando uma sequência de pontos. 'Ligue todos os pontos' usa todos os pontos do contexto.", ["pontos", "usarSelecao", "resposta"]),
  tool("criar_poligono", "Criar um polígono fechado com no mínimo 3 pontos.", ["pontos", "usarSelecao", "resposta"]),
  tool("fechar_poligono", "Fechar a polilinha selecionada, transformando-a em polígono.", ["entidade_id", "usarSelecao", "resposta"]),
  tool("unir_linhas", "Unir duas polilinhas em uma só (informe entidade_ids).", ["entidade_ids", "usarSelecao", "resposta"]),
  tool("unir", "Unir linhas/polilinhas cujas extremidades se tocam (tolerância 0,001 m).", ["entidade_ids", "usarSelecao", "resposta"]),
  tool("apagar", "Apagar ponto(s) ou entidade(s). Com seleção e 'esse/essa', use usarSelecao=true. Não há ferramenta para apagar só um vértice de polígono.", ["entidade_id", "entidade_ids", "pontos", "id_origem", "forcar", "usarSelecao", "resposta"]),
  tool("mover", "Mover entidade/lote/quadra. Use dx/dy ou distancia+angulo (0=norte, 90=leste). 'lote 01 5 m para leste' → lote=01, distancia=5, angulo=90.", ["entidade_id", "entidade_ids", "lote", "quadra", "dx", "dy", "distancia", "angulo", "usarSelecao", "resposta"]),
  tool("copiar", "Copiar entidade sem alterar o original. Mesmos parâmetros de mover.", ["entidade_id", "entidade_ids", "lote", "quadra", "dx", "dy", "distancia", "angulo", "usarSelecao", "resposta"]),
  tool("rotacionar", "Rotacionar em torno do centróide ou de x/y. angulo em graus.", ["entidade_id", "entidade_ids", "lote", "quadra", "angulo", "x", "y", "usarSelecao", "resposta"]),
  tool("espelhar", "Espelhar no eixo (x,y)→(x2,y2). manter_original=true cria cópia.", ["entidade_id", "entidade_ids", "x", "y", "x2", "y2", "manter_original", "usarSelecao", "resposta"]),
  tool("esticar", "Estica só os vértices da janela (x,y)-(x2,y2) ou vertices_indices.", ["entidade_id", "dx", "dy", "distancia", "angulo", "x", "y", "x2", "y2", "vertices_indices", "usarSelecao", "resposta"]),
  tool("escala", "Escala a partir de x/y. fator=2 dobra; distancia=50 escala a linha para 50 m.", ["entidade_id", "fator", "distancia", "x", "y", "usarSelecao", "resposta"]),
  tool("deslocar", "Offset/paralela. distancia em metros; lado=esquerda|direita.", ["entidade_id", "distancia", "lado", "usarSelecao", "resposta"]),
  tool("aparar", "Aparar alvo no limite. entidade_id=alvo, entidade_corte=limite.", ["entidade_id", "entidade_corte", "entidade_ids", "x", "y", "usarSelecao", "resposta"]),
  tool("estender", "Estender alvo até o limite. entidade_id=alvo, entidade_corte=limite.", ["entidade_id", "entidade_corte", "entidade_ids", "x", "y", "usarSelecao", "resposta"]),
  tool("concordar", "Fillet/concordância de raio. Duas linhas ou esquina de polilinha (vertices_indices).", ["entidade_ids", "raio", "distancia", "vertices_indices", "usarSelecao", "resposta"]),
  tool("chanfrar", "Chanfro. distancia ou distancia_1/distancia_2.", ["entidade_ids", "distancia", "distancia_1", "distancia_2", "usarSelecao", "resposta"]),
  tool("matriz", "Matriz retangular (colunas, linhas, dx, dy) ou polar (partes, angulo).", ["entidade_id", "colunas", "linhas", "dx", "dy", "distancia", "partes", "angulo", "tipo_matriz", "usarSelecao", "resposta"]),
  tool("explodir", "Explode polígono/polilinha em linhas.", ["entidade_id", "usarSelecao", "resposta"]),
  tool("dividir", "Divide linha/polígono/lote em N partes iguais (partes, padrão 2).", ["entidade_id", "lote", "partes", "usarSelecao", "resposta"]),
  tool("alterar_id", "Renomear o rótulo de um ponto (id_origem → novo_id).", ["id_origem", "novo_id", "pontos", "resposta"], ["id_origem", "novo_id"]),
  tool("alterar_cota", "Alterar a cota Z de um ponto.", ["id_origem", "pontos", "z", "resposta"], ["z"]),
  tool("renumerar_pontos", "Renumerar todos os pontos como P1, P2, P3… ('numere os vértices').", ["resposta"]),
  tool("mostrar_coordenadas", "Listar coordenadas E/N/Z dos pontos (só texto, não desenha).", ["pontos", "resposta"]),
  tool("exportar_pontos", "Exportar os pontos do desenho em CSV.", ["resposta"]),
  tool("medir_distancia", "Medir a distância horizontal entre dois pontos.", ["pontos", "usarSelecao", "resposta"]),
  tool("medir_area", "Calcular a área do polígono fechado selecionado ou indicado.", ["entidade_id", "usarSelecao", "resposta"]),
  tool("medir_perimetro", "Calcular o perímetro do polígono fechado.", ["entidade_id", "usarSelecao", "resposta"]),
  tool("medir_azimute", "Calcular o azimute entre dois pontos.", ["pontos", "usarSelecao", "resposta"]),
  tool("medir_inclinacao", "Calcular a inclinação/declividade entre dois pontos (ΔZ / horizontal).", ["pontos", "usarSelecao", "resposta"]),
  tool("inserir_cota", "Inserir cota linear (distância) entre dois pontos no desenho.", ["pontos", "usarSelecao", "resposta"]),
  tool("inserir_cota_automatica", "Inserir cotas em todos os lados do polígono ('coloque as distâncias').", ["entidade_id", "usarSelecao", "resposta"]),
  tool("inserir_texto", "Inserir um rótulo de texto. posicao='centro' coloca no centróide do polígono selecionado.", ["texto", "pontos", "entidade_id", "posicao", "usarSelecao", "resposta"], ["texto"]),
  tool("inserir_coordenadas", "Inserir etiquetas de coordenadas E/N nos pontos ou vértices do polígono selecionado.", ["pontos", "entidade_id", "usarSelecao", "resposta"]),
  tool("inserir_area", "Inserir o texto de área no centro do polígono.", ["entidade_id", "texto", "usarSelecao", "resposta"]),
  tool("inserir_elevacao", "Inserir etiquetas de cota Z junto aos pontos.", ["pontos", "usarSelecao", "resposta"]),
  tool("mostrar_cotas_pontos", "Mostrar cotas Z em todos os pontos do desenho.", ["resposta"]),
  tool("gerar_tin", "Gerar triangulação TIN a partir dos pontos com cota.", ["resposta"]),
  tool("remover_tin", "Remover/desativar a triangulação TIN.", ["resposta"]),
  tool("cota_curva", "Inserir etiquetas de cota nas curvas de nível já geradas.", ["resposta"]),
  tool("medir", "Medição genérica: dois pontos → distância/azimute; polígono selecionado → área/perímetro.", ["pontos", "entidade_id", "usarSelecao", "resposta"]),
  tool("curvas_nivel", "Gerar curvas de nível. Informe intervalo ou equidistancia em metros.", ["intervalo", "equidistancia", "resposta"]),
  tool("mapa_hipsometrico", "Gerar mapa hipsométrico colorido a partir dos pontos com cota.", ["resposta"]),
  tool("importar", "Importar pontos/geometria de arquivo anexado (CSV, KML, KMZ, DXF, GeoJSON).", ["arquivo", "conteudo", "resposta"]),
  tool("exportar", "Exportar o projeto CAD (dxf, dwg, shp, csv, kml, kmz, pdf, ods).", ["formato", "resposta"]),
  tool("exportar_sigef", "Exportar ODS SIGEF da poligonal fechada selecionada (vértices, E/N, lat/lon e confrontantes) para conferência no INCRA.", ["entidade_id", "usarSelecao", "resposta"]),
  tool(
    "gerar_loteamento",
    "Divide uma área/gleba selecionada em lotes com acesso viário obrigatório. TODO lote precisa de testada confrontando uma via — nunca preencha o miolo sem rua. Se a profundidade da quadra for maior que ~2 fileiras, o motor cria ruas internas ligadas à malha. 'quadra de 150 m ao longo da rua com lotes de 300m²' → distancia_quadra_m + area_minima_m2 + testada_minima_m (padrão 10) + profundidade_quadra_m = área/testada + largura_via_m (padrão 10). A largura da quadra é sempre 2 × profundidade do lote (um lote para cada rua); não envie largura_quadra_m. area_minima_quadra_m2 parte a gleba em quadras dessa área. Restos sem acesso viram remanescente, nunca lote inválido nem institucional artificial. Área verde/APP é recortada. vias_existentes_extremidades=true: via pública já existe FORA da gleba. Use quando o usuário pedir para lotear, parcelar, criar ruas internas ou não querer lote sem acesso.",
    [
      "entidade_id",
      "usarSelecao",
      "largura_via_m",
      "profundidade_quadra_m",
      "testada_minima_m",
      "area_minima_m2",
      "area_minima_quadra_m2",
      "area_quadra_m2",
      "largura_quadra_m",
      "distancia_quadra_m",
      "largura_calcada_m",
      "eixo_rua",
      "raio_esquina_m",
      "vias_existentes_extremidades",
      "largura_via_existente_m",
      "lados_aresta",
      "lados_faixa_dominio",
      "lados_rua_contorno",
      "ruas_contorno",
      "largura_faixa_dominio_m",
      "entidade_ids",
      "orientacao",
      "prefixo_quadra",
      "require_road_access",
      "allow_internal_roads",
      "resposta",
    ],
    ["largura_via_m", "profundidade_quadra_m", "testada_minima_m"],
  ),
  tool(
    "alterar_eixo",
    "Inicia a edição do eixo da rua em 2 pontos: clique o eixo na face de uma quadra e o segundo na quadra oposta. O trecho entre A e B vira o segmento reto e o loteamento é regenerado. Use quando o usuário pedir para alterar o eixo da rua em 2 pontos, de uma quadra até a outra.",
    ["entidade_id", "usarSelecao", "resposta"],
  ),
  tool("gerar_reurb", "Regularização fundiária urbana (REURB): numera os lotes fechados (Lote 01, 02…), insere cotas/distâncias em cada lado e a área no centro. Use quando o usuário pedir REURB, numerar lotes, cotas nos lotes ou anotações automáticas de regularização urbana.", ["resposta"]),
  tool("exportar_reurb_tabular", "Gerar o memorial tabular ODS de TODOS os lotes da regularização urbana (denominação, nº, área, perímetro, vértices E/N, confrontações, proprietário/matrícula).", ["resposta"]),
  tool("gerar_plantas_reurb", "Gerar plantas individuais de todos os lotes fechados em DWG e PDF, empacotadas em um ZIP.", ["resposta"]),
  tool("memorial_descritivo", "Gerar o memorial descritivo Word do polígono fechado.", ["entidade_id", "usarSelecao", "resposta"]),
  tool("calcular_azimutes", "Listar azimutes de todos os lados do polígono.", ["entidade_id", "usarSelecao", "resposta"]),
  tool("calcular_rumos", "Listar rumos de todos os lados do polígono.", ["entidade_id", "usarSelecao", "resposta"]),
  tool("area_geodesica", "Calcular a área no plano atual do polígono (mesmo cálculo de medir_area).", ["entidade_id", "usarSelecao", "resposta"]),
  tool("conferir_fechamento", "Conferir se a polilinha/polígono fecha (gap entre primeiro e último vértice).", ["entidade_id", "usarSelecao", "resposta"]),
  tool("perfil_longitudinal", "Gerar perfil longitudinal entre dois pontos.", ["pontos", "usarSelecao", "resposta"]),
  tool("perfil_transversal", "Gerar perfil transversal. Com largura: seção na estaca (pontos[0]) na direção de pontos[1].", ["pontos", "largura", "distancia", "usarSelecao", "resposta"]),
  tool("secoes", "Gerar seções-tipo transversais ao longo da polilinha de eixo selecionada. intervalo = espaçamento das estacas (m); largura = largura total da seção (m).", ["entidade_id", "usarSelecao", "intervalo", "largura", "distancia", "resposta"]),
  tool("gerar_mdt", "Gerar o modelo digital do terreno (MDT) como triangulação TIN a partir dos pontos com cota. Equivale a gerar_tin.", ["resposta"]),
  tool("volume_corte", "Calcular volume de corte (terreno acima do platô). z = cota do platô horizontal em metros; polígono fechado selecionado recorta a região. Informe z ou usa a cota média dos pontos. Use também para 'calcular volumetria' / 'volumetria'.", ["z", "entidade_id", "usarSelecao", "resposta"]),
  tool("volume_aterro", "Calcular volume de aterro (terreno abaixo do platô). z = cota do platô horizontal em metros; polígono fechado selecionado recorta a região.", ["z", "entidade_id", "usarSelecao", "resposta"]),
  tool("ativar_ferramenta", "Troca a ferramenta ativa do CAD (Selecionar, Pan, Linha, Polilinha, Editar polígono, Confrontação).", ["ferramenta", "resposta"], ["ferramenta"]),
  tool("trocar_camada", "Mostra ou oculta uma camada do desenho (Curvas de nível, Triangulação, Loteamento, etc).", ["camada", "visivel", "resposta"], ["camada"]),
  tool(
    "subdividir_quadra",
    "Divide a quadra/polígono selecionado em lotes a partir da testada (largura de frente), sem gerar vias novas. Use quando o usuário pedir para subdividir a quadra, fatiar pela testada ou quebrar o quarteirão em lotes.",
    ["entidade_id", "usarSelecao", "testada_m", "testada_minima_m", "area_minima_m2", "lado", "resposta"],
    ["testada_m"],
  ),
  tool(
    "criar_rua_existente",
    "Marca a polilinha selecionada (ou desenhada) como via pública / rua existente (camada VIA_EXISTENTE). Use quando o usuário pedir para criar rua existente, marcar via pública ou nomear a rua.",
    ["entidade_id", "usarSelecao", "nome", "texto", "largura", "resposta"],
  ),
  tool(
    "reservar_area",
    "Ajusta área verde (tipo=reserva_legal ou area_verde) ou institucional (tipo=institucional) para o percentual informado. Use para 'mudar área verde para 10%', 'quero aumentar a área verde', 'reduza a área institucional'. O CAD calcula a geometria.",
    ["entidade_id", "usarSelecao", "tipo", "percentual", "lado", "resposta"],
    ["tipo", "percentual"],
  ),
  tool("selecionar", "Selecionar uma entidade pelo ID.", ["entidade_id", "usarSelecao", "resposta"]),
  tool("consultar_projeto", "Resumo do projeto e do loteamento atual (quadras, lotes, ruas). Somente leitura.", ["resposta"]),
  tool("consultar_quadras", "Listar todas as quadras com área, quantidade de lotes e área média. Somente leitura.", ["resposta"]),
  tool(
    "consultar_quadra",
    "Consultar uma quadra pelo identificador (G, H, Quadra G): área, quantidade de lotes e média. Use para 'qual a área da quadra G' ou 'quantos lotes na H'.",
    ["quadra", "usarSelecao", "resposta"],
  ),
  tool(
    "consultar_lotes",
    "Listar lotes, opcionalmente filtrando por quadra ou área. Use para 'mostre os lotes abaixo de 250 m²' ou 'qual o menor lote'.",
    ["quadra", "lote", "lotes", "filtro_area_max_m2", "filtro_area_min_m2", "resposta"],
  ),
  tool("consultar_lote", "Consultar um lote específico (área, testada, profundidade).", ["lote", "resposta"], ["lote"]),
  tool("calcular_testada", "Calcular a testada (frente) de um lote.", ["lote", "quadra", "resposta"]),
  tool(
    "calcular_area_remanescente",
    "Calcular a área remanescente do loteamento ou de uma quadra. Somente leitura.",
    ["quadra", "resposta"],
  ),
  tool(
    "otimizar_quadra",
    "Reempacota os lotes de uma ou mais quadras com o motor geométrico existente. NÃO calcule coordenadas. Use para reprojetar loteamento, refazer quadra, ajustar todos os lotes, completar a quadra, aproveitar remanescente, lotes sem acesso à rua. preservar_ruas=true se o usuário pedir para manter as ruas. A alteração exige confirmação no CAD.",
    [
      "quadra",
      "area_alvo_m2",
      "area_minima_m2",
      "area_maxima_m2",
      "testada_minima_m",
      "preservar_ruas",
      "preservar_limites",
      "minimizar_remanescente",
      "lotes_esquina_maiores",
      "objetivo",
      "excecoes",
      "usarSelecao",
      "scope",
      "resposta",
    ],
  ),
  tool(
    "ajustar_lote",
    "Ajusta SOMENTE um lote (scope=single_lot). NUNCA chame otimizar_quadra, redistribuir_lotes ou gerar_loteamento no mesmo turno. Use para 'alterar lote 01 para 500m²' (lote='01', area_alvo_m2=500, scope='single_lot'). Só use scope=local_redistribution se o usuário autorizar vizinhos. Não invente coordenadas.",
    ["lote", "area_alvo_m2", "testada_minima_m", "scope", "resposta"],
    ["lote"],
  ),
  tool(
    "redistribuir_lotes",
    "Redistribui os lotes da quadra para fechar a área (aproveitar melhor / eliminar remanescente).",
    ["quadra", "minimizar_remanescente", "preservar_ruas", "usarSelecao", "resposta"],
  ),
  tool(
    "validar_loteamento",
    "Analisa o loteamento: área mínima, testada, sobreposição, remanescente, conflito com ruas e áreas verdes. Use para 'analise esse loteamento'.",
    ["resposta"],
  ),
  tool("aplicar_alteracao", "Confirma e aplica a prévia pendente. Use quando o usuário disser sim/aplicar.", ["resposta"]),
  tool("desfazer_alteracao", "Desfaz a última alteração geométrica aplicada. Use quando o usuário disser desfaz.", ["resposta"]),
  tool("zoom_objeto", "Enquadrar no desenho uma quadra ou lote.", ["quadra", "lote", "entidade_id", "usarSelecao", "resposta"]),
  tool(
    "renomear_quadra",
    "Renomeia o rótulo das quadras. NÃO altera geometria nem lotes. Use para 'dar nome às quadras', 'renomear a quadra A', 'chamar a quadra A de QA'. Se faltar o nome novo, pergunte. NUNCA use ajustar_lote para isso.",
    ["quadra", "novo_id", "nomes", "resposta"],
  ),
];

export function buildCadAiSystemPrompt(): string {
  const actions = cadAiTools
    .map((t) => `- ${t.function.name}: ${t.function.description}`)
    .join("\n");

  return `Você é o interpretador principal de linguagem natural do ambiente CAD DataGeo.
O usuário fala em português, com paráfrases e frases que NÃO estão cadastradas. Entenda a INTENÇÃO e chame as tools.
Nunca invente o nome de uma ferramenta. Só existem as tools listadas abaixo.
NUNCA invente coordenadas, vértices ou geometria — o motor CAD calcula.

Você interpreta. As tools consultam e alteram o desenho. Operações geométricas geram prévia; o usuário confirma com Aplicar.
Memória: use o histórico. "os de esquina", "agora a H", "mas não mexa na rua" referem-se à operação anterior.
Se faltar um dado obrigatório e não houver seleção/contexto, PERGUNTE em português. Não invente.
Se houver uma única quadra no contexto ou uma selecionada, use-a. Se houver várias e o pedido for ambíguo, pergunte qual quadra.

Comando composto: chame várias tools na ordem.
Não há círculo/arco/elipse. Explique; não invente tool.
Não há tool para apagar um único vértice; "apagar" remove a entidade inteira.

Você é um interpretador de comandos CAD.
Primeiro identifique a ENTIDADE principal mencionada pelo usuário.
Entidades possíveis: lote, quadra, rua, área verde, área institucional, gleba, projeto.
Nunca assuma que uma operação sobre uma quadra é uma operação sobre um lote.
Nunca confunda 'loteamento' com 'lote'.
A entidade deve ser determinada pelo significado da frase.
'dar nome / nomear / identificar / trocar nomes das quadras' → renomear_quadra. Sem nomes: pergunte. NUNCA ajustar_lote.

Intenções de loteamento (paráfrases livres):
- alterar/aumentar um lote (lote 01, lote 1, uns 500 metros) → ajustar_lote(lote, area_alvo_m2, scope=single_lot). Uma tool só. NUNCA otimizar_quadra.
- "quero o lote 01 maior" sem número: pergunte a área alvo, salvo se o histórico já tiver.
- ajustar todos os lotes / dessa quadra / próximos de 250 → otimizar_quadra(area_alvo_m2, preservar_ruas=true).
- lotes mais iguais / mesma área / uniformizar áreas → otimizar_quadra(objetivo="maximizar_equidade", preservar_ruas=true). NÃO calcule áreas, vértices nem iterações.
- área verde para X% / aumentar área verde → reservar_area(tipo="reserva_legal", percentual).
- reduzir área institucional → reservar_area(tipo="institucional", percentual); peça o % se faltar.
- reprojetar loteamento / refazer essa quadra / complete a quadra / aproveite a área que sobrou → otimizar_quadra ou redistribuir_lotes, preservar_ruas=true, minimizar_remanescente=true. Peça "Deseja aplicar?" na resposta.
- não quero lotes sem acesso à rua / mantenha as ruas e reorganize → otimizar_quadra(preservar_ruas=true).
- área do lote 01 → consultar_lote. Área/quantidade da quadra G → consultar_quadra.
- desfaz → desfazer_alteracao. sim/aplicar → aplicar_alteracao.

Consulta: execute direto. Geometria: descreva e peça confirmação na resposta.

Flags: usarSelecao=true usa a seleção; preservar_ruas=true não altera vias.
Normalize "ponto 1"→P1, "lote 1"/"lote 01"→"01".
Lotear gleba nova / 'quadra de 150 m com lotes de 300m²' / 'crie ruas internas' / 'não quero lote sem acesso' / 'máximo de lotes possível' → gerar_loteamento(distancia_quadra_m=150, area_minima_m2=300, testada_minima_m=10, profundidade_quadra_m=30, largura_via_m=10, allow_internal_roads=true, require_road_access=true, objetivo=maximize_valid_lots). A largura entre as ruas é 2 × profundidade do lote. Nunca preencha o centro sem via.
Modificar geometria: mover/copiar/rotacionar/espelhar/esticar/escala/deslocar/aparar/estender/concordar/chanfrar/matriz/explodir/unir/dividir. O motor CAD calcula. 'mova o lote 01 5 m para leste' → mover(lote=01, distancia=5, angulo=90). Sem distância: pergunte, não invente. 'agora 5 metros para direita' completa a operação pendente. Nunca deixe lote sem acesso, fora da quadra ou sobreposto.
Loteamento já gerado (contexto.loteamento): você decide O QUE fazer; o motor decide COMO.
Considere camadas, CRS, seleção, histórico e contexto.loteamento.

Tools:
${actions}`;
}

const COMPACT_TOOL_NAMES = new Set([
  "consultar_projeto",
  "consultar_quadras",
  "consultar_quadra",
  "consultar_lotes",
  "consultar_lote",
  "calcular_area",
  "calcular_testada",
  "calcular_area_remanescente",
  "ajustar_lote",
  "ajustar_lotes",
  "otimizar_quadra",
  "reprojetar_loteamento",
  "redistribuir_lotes",
  "gerar_loteamento",
  "alterar_area_verde",
  "alterar_area_institucional",
  "reservar_area",
  "validar_loteamento",
  "aplicar_alteracao",
  "desfazer_alteracao",
  "zoom_objeto",
  "selecionar",
  "renomear_quadra",
  "mover",
  "copiar",
  "rotacionar",
  "espelhar",
  "esticar",
  "escala",
  "deslocar",
  "aparar",
  "estender",
  "concordar",
  "chanfrar",
  "matriz",
  "explodir",
  "unir",
  "dividir",
  "move_entity",
  "rotate_entity",
  "copy_entity",
  "mirror_entity",
  "stretch_entity",
  "scale_entity",
  "offset_entity",
  "trim_entity",
  "extend_entity",
  "fillet_entity",
  "chamfer_entity",
  "array_entity",
  "explode_entity",
  "join_entities",
  "split_entity",
]);

const LOTEAMENTO_INTENT_RE =
  /lote|quadra|loteamento|gleba|área verde|area verde|institucional|reprojet|reporjet|testada|remanescente|vi[aá]rio|ruas?|mover|copiar|rotacion|espelh|estic|escala|offset|desloc|aparar|estend|concord|fillet|chanfr|matriz|explod|unir|divid/i;

/** Tools enxutas para linguagem natural de loteamento — menos tokens. */
export function cadAiCompactResponsesTools() {
  return cadAiResponsesTools().filter((item) => COMPACT_TOOL_NAMES.has(item.name));
}

export function buildCadAiCompactSystemPrompt(): string {
  return `Você é um interpretador de comandos CAD. Primeiro identifique a ENTIDADE: lote, quadra, rua, área verde, área institucional, gleba, projeto.
Nunca trate quadra como lote. Nunca confunda loteamento com lote.
Saída principal: tool call. Texto curto.
NUNCA invente coordenadas, vértices, GeoJSON, JavaScript, SQL ou shell.
NUNCA altere geometria direto — só tools. O motor CAD calcula.
Modificar: mover/move_entity, copiar/copy_entity, rotacionar/rotate_entity, espelhar/mirror_entity, esticar/stretch_entity, escala/scale_entity, deslocar/offset_entity, aparar/trim_entity, estender/extend_entity, concordar/fillet_entity, chanfrar/chamfer_entity, matriz/array_entity, explodir/explode_entity, unir/join_entities, dividir/split_entity. Sem distância: pergunte. 'agora 5 m para direita' completa a pendente.
dar nome / nomear / identificar quadras → renomear_quadra. Sem nomes: pergunte. NUNCA ajustar_lote.
ajustar_lote só com lote explícito (lote 01), área e scope=single_lot. Uma tool. otimizar_quadra/reprojetar_loteamento para lotes da quadra ou o loteamento.
Normalize lote 1 → 01. Operação grande: peça confirmação na resposta curta.`;
}

export function selectCadAiOpenAiToolkit(command: string): {
  tools: ReturnType<typeof cadAiResponsesTools>;
  instructions: string;
} {
  if (LOTEAMENTO_INTENT_RE.test(command)) {
    return { tools: cadAiCompactResponsesTools(), instructions: buildCadAiCompactSystemPrompt() };
  }
  return {
    tools: cadAiResponsesTools(),
    instructions: `${buildCadAiCompactSystemPrompt()}
Desenho: use as tools do catálogo (criar_ponto, medir_*, importar). Sem executar código.`,
  };
}
