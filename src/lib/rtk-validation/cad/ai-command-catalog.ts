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
  reservar_faixa: "reservar_area",
  subdividir: "subdividir_quadra",
  dividir_quadra: "subdividir_quadra",
  medir_distancia_entre_pontos: "medir_distancia",
  cota_curva: "cota_curva",
  inserir_id_pontos: "mostrar_cotas_pontos",
  id_ponto: "alterar_id",
};

export function normalizeCadAiCommand(raw: CadAiCommand): CadAiCommand {
  const acao = CAD_AI_ACTION_ALIASES[raw.acao] ?? raw.acao;
  const intervalo = raw.intervalo ?? raw.equidistancia ?? raw.equidistancia_m;
  const conteudo = raw.conteudo ?? raw.csv_conteudo;
  const arquivo = raw.arquivo?.toLowerCase();
  const formato = raw.formato?.toLowerCase();
  const z = raw.z ?? raw.cota_referencia_m;
  const testada_minima_m = raw.testada_minima_m ?? raw.testada_m;
  const area_minima_quadra_m2 = raw.area_minima_quadra_m2 ?? raw.area_quadra_m2;
  const largura_quadra_m = raw.largura_quadra_m;
  const distancia_quadra_m = raw.distancia_quadra_m;
  const texto = raw.texto ?? raw.nome;
  const visivel =
    acao === "trocar_camada" && (raw.acao as string) === "ocultar_camada" ? false : raw.visivel;

  return {
    ...raw,
    acao,
    intervalo,
    conteudo,
    arquivo,
    formato,
    z,
    testada_minima_m,
    area_minima_quadra_m2,
    largura_quadra_m,
    distancia_quadra_m,
    texto,
    visivel,
  };
}

export const CAD_AI_ACTION_CATALOG: Array<{ acao: CadAiAction; descricao: string; params?: string }> = [
  { acao: "criar_ponto", descricao: "Criar ponto", params: "x, y, z ou pontos[]" },
  { acao: "criar_linha", descricao: "Linha entre 2 pontos", params: "pontos: [P1,P2]" },
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
    params: "largura_via_m, profundidade_quadra_m, testada_minima_m, area_minima_quadra_m2?, largura_quadra_m?, distancia_quadra_m?, largura_calcada_m?, eixo_rua?, raio_esquina_m?, vias_existentes_extremidades?, entidade_ids?",
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
    descricao: "Reserva uma faixa da gleba (institucional ou reserva legal)",
    params: "tipo, percentual, lado?",
  },
  { acao: "inserir_sondagem", descricao: "Sondagem (em desenvolvimento)", params: "—" },
  { acao: "perfil_geologico", descricao: "Perfil geológico (em desenvolvimento)", params: "—" },
  { acao: "secao_spt", descricao: "Seção SPT (em desenvolvimento)", params: "—" },
  { acao: "poco_monitoramento", descricao: "Poço monitoramento (em desenvolvimento)", params: "—" },
  { acao: "selecionar", descricao: "Selecionar entidade", params: "entidade_id" },
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
      "Profundidade do lote em metros, da testada ao fundo (ex.: 50). A malha espaça vias paralelas em ~2× este valor (duas fileiras). Quadras com rua na frente e nos fundos são sempre partidas ao meio.",
  },
  testada_minima_m: {
    type: "number",
    description: "Testada mínima de cada lote em metros (ex.: 10).",
  },
  area_minima_m2: {
    type: "number",
    description: "Ignorado. Os lotes dimensionam pela testada e pela profundidade restantes.",
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
      "Largura da quadra em metros (modo medidas). Use com distancia_quadra_m para dividir a gleba em quadras dessa dimensão, com vias entre elas.",
  },
  distancia_quadra_m: {
    type: "number",
    description:
      "Profundidade/distância da quadra em metros (modo medidas). Use com largura_quadra_m. Tem prioridade sobre area_minima_quadra_m2 quando ambos são informados.",
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
      "true = não gera rua nova na borda da gleba (via pública já existente nas extremidades). Os lotes fazem testada no limite. Combine com lados_aresta para indicar só alguns lados. Padrão: false.",
  },
  lados_aresta: {
    type: "array",
    items: { type: "number" },
    description:
      "Índices das arestas da gleba (0 = primeiro lado) onde já existe via pública. Só nesses lados não se abre rua nova. Clique no desenho para marcar.",
  },
  ferramenta: {
    type: "string",
    enum: ["selecionar", "pan", "linha", "polilinha", "editar_poligono", "confrontacao"],
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
    enum: ["institucional", "reserva_legal"],
    description: "Tipo da área reservada.",
  },
  nome: {
    type: "string",
    description: "Nome da via pública existente.",
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

/**
 * Tools OpenAI function calling — uma por ação implementada.
 * O name da tool é a própria `acao` de CadAiCommand.
 */
export const cadAiTools: CadAiTool[] = [
  tool("criar_ponto", "Criar um ponto nas coordenadas E/N (x/y). Use quando o usuário pedir um ponto novo.", ["x", "y", "z", "novo_id", "texto", "resposta"], ["x", "y"]),
  tool("criar_linha", "Criar uma linha reta entre dois pontos existentes.", ["pontos", "usarSelecao", "resposta"]),
  tool("criar_polilinha", "Criar uma polilinha aberta ligando uma sequência de pontos. 'Ligue todos os pontos' usa todos os pontos do contexto.", ["pontos", "usarSelecao", "resposta"]),
  tool("criar_poligono", "Criar um polígono fechado com no mínimo 3 pontos.", ["pontos", "usarSelecao", "resposta"]),
  tool("fechar_poligono", "Fechar a polilinha selecionada, transformando-a em polígono.", ["entidade_id", "usarSelecao", "resposta"]),
  tool("unir_linhas", "Unir duas polilinhas em uma só (informe entidade_ids).", ["entidade_ids", "usarSelecao", "resposta"]),
  tool("apagar", "Apagar ponto(s) ou entidade(s). Com seleção e 'esse/essa', use usarSelecao=true. Não há ferramenta para apagar só um vértice de polígono.", ["entidade_id", "entidade_ids", "pontos", "id_origem", "forcar", "usarSelecao", "resposta"]),
  tool("mover", "Mover a entidade selecionada ou indicada. Informe distancia (m) e angulo (azimute em graus).", ["entidade_id", "distancia", "angulo", "usarSelecao", "resposta"], ["distancia", "angulo"]),
  tool("copiar", "Copiar a entidade com o mesmo deslocamento de mover (distancia + angulo).", ["entidade_id", "distancia", "angulo", "usarSelecao", "resposta"], ["distancia", "angulo"]),
  tool("rotacionar", "Rotacionar a entidade em torno do centróide. Informe angulo em graus.", ["entidade_id", "angulo", "usarSelecao", "resposta"], ["angulo"]),
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
    "Divide uma área/gleba selecionada em lotes com vias internas. area_minima_quadra_m2 (ex. 2000) é a área alvo de cada quadra — o motor parte a gleba em quadras desse tamanho com vias entre elas. Alternativa: largura_quadra_m + distancia_quadra_m define a quadra por largura e profundidade. Quadras profundas partem ao meio (divisória de fundos) mesmo sem rua no interior; laterais ortogonais à testada de cada fileira. Restos nas bordas viram lotes (sem vazios). Reserva legal é recortada — lotes e vias não sobrepõem. vias_existentes_extremidades=true não abre rua nova na borda (via pública já encostada). lados_aresta = índices das arestas da gleba com via já existente (só esses lados). entidade_ids = polilinhas de eixo existentes para inserir. Use quando o usuário pedir para lotear, parcelar a gleba, dividir o terreno em lotes ou criar um loteamento.",
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
      "lados_aresta",
      "entidade_ids",
      "orientacao",
      "prefixo_quadra",
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
    "Corta uma faixa da gleba selecionada para área institucional ou reserva legal, no percentual informado. Ação destrutiva: substitui o polígono pela gleba restante + a faixa reservada.",
    ["entidade_id", "usarSelecao", "tipo", "percentual", "lado", "resposta"],
    ["tipo", "percentual"],
  ),
  tool("selecionar", "Selecionar uma entidade pelo ID.", ["entidade_id", "usarSelecao", "resposta"]),
];

export function buildCadAiSystemPrompt(): string {
  const actions = cadAiTools
    .map((t) => `- ${t.function.name}: ${t.function.description}`)
    .join("\n");

  return `Você é o assistente IA do ambiente CAD DataGeo (topografia, agrimensura, geotecnia).
Interprete comandos naturais em português (voz ou texto) e execute-os chamando as ferramentas (tools) disponíveis.
Nunca invente o nome de uma ferramenta. Só existem as tools listadas abaixo.

Comando composto (ex.: "importe o KMZ, gere TIN e curvas de 1 m"): chame várias tools na ordem de execução.
Se faltar um parâmetro obrigatório (coordenadas, distância, ângulo, dois pontos, etc.), NÃO chame a tool — pergunte em português o que falta.
Não há ferramenta de círculo, arco ou elipse. Se o usuário pedir isso, explique educadamente que o CAD ainda não cria círculos; não chame uma tool inventada.
Não há ferramenta para apagar/arredondar um único vértice ou aresta. contexto.selecao.verticeIndex e arestaIndex descrevem o que está destacado no desenho; use isso só como referência. Para apagar, a tool "apagar" remove a entidade inteira.

Flags:
- usarSelecao: true — usa pontos/entidade selecionada (contexto.selecao)
- posicao: "centro" — texto/área no centróide do polígono selecionado

Regras:
- Use rótulos exatos dos pontos do contexto. Normalize "ponto 1" → P1, "vértice 1" → V1.
- "Crie um polígono com P1, P2, P3 e P4" / "gerar polígonos do ponto até o quatro" → criar_poligono, pontos: ["P1","P2","P3","P4"]
- "Ligue todos os pontos" → criar_polilinha com todos os pontos do contexto em ordem
- "Numere os vértices" → renumerar_pontos. "Coloque as distâncias" → inserir_cota_automatica
- "Calcule a área e coloque texto no centro" → medir_area e inserir_area (duas tools)
- "Quanto mede a área?" / "Qual o tamanho do terreno?" → medir_area
- "Gerar memorial" → memorial_descritivo. "Exportar SIGEF" / "gerar planilha SIGEF" → exportar_sigef. "Perfil longitudinal P1 P2" → perfil_longitudinal
- "Lotear essa área" / "divide esse terreno em lotes" / "cria um loteamento" / "parcela essa gleba" → gerar_loteamento (peça largura da via, profundidade do lote e testada se faltarem; area_minima_quadra_m2 é a área alvo de cada quadra, ex. 2000, com vias entre elas; ou largura_quadra_m + distancia_quadra_m para definir a quadra por medidas; largura_calcada_m, eixo_rua, raio_esquina_m, vias_existentes_extremidades e entidade_ids de eixos existentes são opcionais). Não peça área mínima de lote. A quadra é partida no meio (divisória de fundos) mesmo sem rua no interior; lotes ortogonais à testada da fileira; raio só na esquina verdadeira. Restos nas bordas viram lotes. Reserva legal não recebe lote nem via. Se o usuário disser que já há via/rodovia na borda, use vias_existentes_extremidades=true.
- "Alterar eixo da rua em 2 pontos" / "alterar eixo de uma quadra até a outra" → alterar_eixo (o usuário clica dois pontos no eixo, nas faces das quadras).
- "Gerar REURB" / "numerar lotes e cotas" / "aplicar regularização urbana" → gerar_reurb. "Memorial tabular REURB" / "planilha da regularização" → exportar_reurb_tabular. "Plantas individuais dos lotes" → gerar_plantas_reurb
- "Gerar MDT" / "modelo digital do terreno" → gerar_mdt. "Volume de corte" / "calcular volume" / "calcular volumetria" → volume_corte (informe z do platô). "Volume de aterro" → volume_aterro. "Seções-tipo" / "notas de serviço no eixo" → secoes
- "Ferramenta polilinha" / "ativar selecionar" → ativar_ferramenta. "Mostrar/ocultar camada curvas de nível" → trocar_camada
- "Subdividir a quadra com testada de 12 m" → subdividir_quadra. "Marcar essa polilinha como rua existente" → criar_rua_existente. "Reservar 20% institucional no fundo" → reservar_area
- Considere camadas, CRS, objetosSelecionados, verticeIndex e arestaIndex do contexto.

Tools:
${actions}`;
}
