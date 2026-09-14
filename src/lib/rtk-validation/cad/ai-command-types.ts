/** Catálogo completo de ações CAD interpretadas pela IA. */
export type CadAiAction =
  // Desenho
  | "criar_ponto"
  | "criar_linha"
  | "criar_polilinha"
  | "criar_poligono"
  | "fechar_poligono"
  | "unir_linhas"
  | "apagar"
  | "mover"
  | "copiar"
  | "rotacionar"
  // Pontos
  | "alterar_id"
  | "alterar_cota"
  | "renumerar_pontos"
  | "mostrar_coordenadas"
  | "exportar_pontos"
  // Medições
  | "medir_distancia"
  | "medir_area"
  | "medir_perimetro"
  | "medir_azimute"
  | "medir_inclinacao"
  // Cotas e textos
  | "inserir_cota"
  | "inserir_cota_automatica"
  | "inserir_texto"
  | "inserir_coordenadas"
  | "inserir_area"
  | "inserir_elevacao"
  | "mostrar_cotas_pontos"
  // Terreno
  | "gerar_tin"
  | "triangulacao"
  | "remover_tin"
  | "cota_curva"
  | "medir"
  | "adicionar_texto"
  | "gerar_mdt"
  | "gerar_mds"
  | "curvas_nivel"
  | "mapa_declividade"
  | "mapa_hipsometrico"
  // Importação / exportação
  | "importar"
  | "exportar"
  | "exportar_sigef"
  | "gerar_loteamento"
  | "alterar_eixo"
  | "gerar_reurb"
  | "exportar_reurb_tabular"
  | "gerar_plantas_reurb"
  // Memorial
  | "memorial_descritivo"
  // Georreferenciamento
  | "calcular_azimutes"
  | "calcular_rumos"
  | "area_geodesica"
  | "conferir_fechamento"
  | "ajustar_poligono"
  // Topografia
  | "perfil_longitudinal"
  | "perfil_transversal"
  | "secoes"
  | "volume_corte"
  | "volume_aterro"
  // Ferramentas / camadas (registro de comandos)
  | "ativar_ferramenta"
  | "trocar_camada"
  // Loteamento pontual
  | "subdividir_quadra"
  | "criar_rua_existente"
  | "reservar_area"
  // Geotecnia
  | "inserir_sondagem"
  | "perfil_geologico"
  | "secao_spt"
  | "poco_monitoramento"
  | "selecionar"
  | "desconhecido";

export type CadImportFormat = "csv" | "txt" | "dxf" | "shp" | "kml" | "kmz" | "geojson";
export type CadExportFormat = "dxf" | "dwg" | "shp" | "csv" | "kml" | "kmz" | "pdf" | "ods";

export interface CadAiCommand {
  acao: CadAiAction;
  pontos?: string[];
  entidade_id?: string;
  entidade_ids?: string[];
  /** Intervalo / equidistância vertical (m) — curvas de nível. */
  intervalo?: number;
  equidistancia?: number;
  /** Formato de importação (csv, dxf, kmz…). */
  arquivo?: string;
  /** Formato de exportação. */
  formato?: string;
  texto?: string;
  novo_id?: string;
  id_origem?: string;
  distancia?: number;
  /** Largura da seção transversal (m). */
  largura?: number;
  angulo?: number;
  x?: number;
  y?: number;
  z?: number;
  conteudo?: string;
  csv_conteudo?: string;
  resposta?: string;
  /** Ignora bloqueio RTK ao apagar (após confirmação do usuário). */
  forcar?: boolean;
  /** Usa pontos/entidade selecionada no desenho. */
  usarSelecao?: boolean;
  /** Posição do texto: "centro" coloca no centróide do polígono selecionado. */
  posicao?: "centro" | string;
  /** Largura das vias internas (m) — gerar_loteamento. */
  largura_via_m?: number;
  /** Profundidade do lote / meia quadra (m) — gerar_loteamento. */
  profundidade_quadra_m?: number;
  /** Testada mínima por lote (m) — gerar_loteamento. */
  testada_minima_m?: number;
  /** Ignorado no loteamento — lotes dimensionam pela testada/profundidade. */
  area_minima_m2?: number;
  /** Área alvo de cada quadra (m²). Ex.: 2000. 0 / omitido = não divide por área. */
  area_minima_quadra_m2?: number;
  /** Alias de area_minima_quadra_m2 — área alvo da quadra (m²). */
  area_quadra_m2?: number;
  /** Largura da quadra (m) — gerar_loteamento no modo medidas. */
  largura_quadra_m?: number;
  /** Profundidade/distância da quadra (m) — gerar_loteamento no modo medidas. */
  distancia_quadra_m?: number;
  /** Azimute das vias (graus). Se ausente, usa o lado mais longo da gleba. */
  orientacao?: number;
  /** Prefixo das quadras (ex.: "Q" ou "Quadra"). */
  prefixo_quadra?: string;
  /** Largura da calçada em cada lado (m), interna ao corredor da via. 0 = sem calçada. */
  largura_calcada_m?: number;
  /** Desenha o eixo tracejado no centro de cada via. Padrão: true. */
  eixo_rua?: boolean;
  /** Raio nas esquinas dos lotes voltadas para a via (m). 0 = cantos vivos. */
  raio_esquina_m?: number;
  /** Não gera rua nova na borda da gleba (via pública já existente). */
  vias_existentes_extremidades?: boolean;
  /** Índices das arestas da gleba com via já existente (0 = primeiro lado). */
  lados_aresta?: number[];
  /** Ferramenta do canvas — ativar_ferramenta. */
  ferramenta?: string;
  /** Nome ou id da camada — trocar_camada. */
  camada?: string;
  /** Visibilidade da camada (padrão true). */
  visivel?: boolean;
  /** Testada desejada (m) — subdividir_quadra. Alias de testada_minima_m. */
  testada_m?: number;
  /** Lado da gleba/quadra: norte|sul|leste|oeste|frente|fundo|esquerda|direita|selecionado_no_mapa. */
  lado?: string;
  /** Percentual (0–100) — reservar_area. */
  percentual?: number;
  /** Percentual de área útil (0–100) — gerar_loteamento. Padrão 15. */
  percentual_area_util?: number;
  /** Acréscimo % da área mínima do lote de esquina. Padrão 20. Não altera INTERNO. */
  percentual_esquina?: number;
  /** Canto da área útil na reserva legal — gerar_loteamento. */
  canto_area_util?: string;
  /** Tipo de reserva: institucional | reserva_legal. */
  tipo?: string;
  /** Nome da via — criar_rua_existente. */
  nome?: string;
  /** Equidistância em metros (alias de intervalo). */
  equidistancia_m?: number;
  /** Cota de referência da volumetria (alias de z). */
  cota_referencia_m?: number;
}

export interface CadAiHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CadAiProjectContext {
  projectName: string;
  crs: string;
  /** Descrição legível do sistema de coordenadas. */
  sistema: string;
  coordenadas: {
    sistema: string;
    epsg: string;
    extensao: { minE: number; minN: number; maxE: number; maxN: number } | null;
  };
  selectedEntityId: string | null;
  selectedEntitySummary: string | null;
  /** Rótulos dos pontos disponíveis no desenho. */
  pontos: string[];
  points: Array<{ label: string; x: number; y: number; z: number; layerId: string }>;
  /** Nomes das camadas visíveis. */
  camadas: string[];
  layers: Array<{ id: string; name: string; visible: boolean; entityCount: number }>;
  polygons: Array<{ id: string; name: string; vertices: number; closed: boolean }>;
  lines: number;
  polylines: number;
  /** Total de entidades no desenho. */
  totalEntidades: number;
  /** 1 se há seleção, senão 0. */
  objetosSelecionados: number;
  /** Índice do vértice em edição na polilinha selecionada (null se nenhum). */
  selectedVertexIndex: number | null;
  /** Índice da aresta destacada (confrontação) na polilinha selecionada (null se nenhuma). */
  selectedSegmentIndex: number | null;
  selecao: {
    entidadeId: string | null;
    tipo: "point" | "line" | "polyline" | null;
    resumo: string | null;
    pontos: string[];
    verticeIndex: number | null;
    arestaIndex: number | null;
  };
  terreno: {
    tin: { ativo: boolean; arestas: number; pontos: number };
    curvasNivel: { ativo: boolean; quantidade: number };
  };
  elevationPointCount: number;
  pendingProfileStart?: string | null;
}

export interface CadAiInterpretRequest {
  command: string;
  context: CadAiProjectContext;
  history?: CadAiHistoryMessage[];
  fileContent?: string;
  fileName?: string;
  /** KMZ binário em base64 (opcional). */
  fileBinaryBase64?: string;
}

export type CadAiSideEffect =
  | { type: "download_memorial"; entityId: string; project: import("./types").CadProject }
  | { type: "fit_view"; entities: import("./types").CadEntity[] }
  | { type: "export_cad"; format: "dxf" | "dwg" | "shp" | "ods"; project: import("./types").CadProject }
  | { type: "download_text"; filename: string; content: string; mime?: string }
  | { type: "download_binary"; filename: string; bytes: Uint8Array; mime?: string }
  | { type: "print_pdf" }
  | { type: "add_raster"; raster: import("./types").CadRasterOverlay }
  | { type: "remove_rasters"; kind?: import("./types").CadRasterKind }
  | { type: "generate_reurb_plantas"; project: import("./types").CadProject }
  | { type: "set_tool"; tool: import("./types").CadTool }
  | { type: "start_alterar_eixo" }
  | { type: "enable_satellite" };

export interface CadCommandExecutionResult {
  ok?: boolean;
  project: import("./types").CadProject;
  selectedId?: string | null;
  message: string;
  sideEffects?: CadAiSideEffect[];
}

export interface CadCommandExecutorMeta {
  pendingProfileStart?: string | null;
}

export interface CadCommandExecutorOptions {
  selectedId?: string | null;
  memorialForm?: import("./memorial-types").MemorialFormDefaults;
  pendingProfileStart?: string | null;
  /** Aresta destacada (confrontação) — subdividir_quadra com lado=selecionado_no_mapa. */
  selectedSegmentIndex?: number | null;
}
