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
  selecao: {
    entidadeId: string | null;
    tipo: "point" | "line" | "polyline" | null;
    resumo: string | null;
    pontos: string[];
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
  | { type: "remove_rasters"; kind?: import("./types").CadRasterKind };

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
}
