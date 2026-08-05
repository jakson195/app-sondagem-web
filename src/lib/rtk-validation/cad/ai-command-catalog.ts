import type { CadAiAction, CadAiCommand } from "./ai-command-types";

/** Sinônimos e ações legadas → ação canônica. */
const ACTION_ALIASES: Record<string, CadAiAction> = {
  criar_cota: "inserir_cota",
  calcular_area: "medir_area",
  criar_curvas_nivel: "curvas_nivel",
  gerar_memorial: "memorial_descritivo",
  gerar_perfil: "perfil_longitudinal",
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
  medir_distancia_entre_pontos: "medir_distancia",
  cota_curva: "cota_curva",
  inserir_id_pontos: "mostrar_cotas_pontos",
  id_ponto: "alterar_id",
};

export function normalizeCadAiCommand(raw: CadAiCommand): CadAiCommand {
  const acao = ACTION_ALIASES[raw.acao] ?? raw.acao;
  const intervalo = raw.intervalo ?? raw.equidistancia;
  const conteudo = raw.conteudo ?? raw.csv_conteudo;
  const arquivo = raw.arquivo?.toLowerCase();
  const formato = raw.formato?.toLowerCase();

  return {
    ...raw,
    acao,
    intervalo,
    conteudo,
    arquivo,
    formato,
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
  { acao: "gerar_mdt", descricao: "MDT (em desenvolvimento)", params: "—" },
  { acao: "gerar_mds", descricao: "MDS (em desenvolvimento)", params: "—" },
  { acao: "curvas_nivel", descricao: "Curvas de nível", params: "equidistancia (m)" },
  { acao: "mapa_declividade", descricao: "Mapa declividade (em desenvolvimento)", params: "—" },
  { acao: "mapa_hipsometrico", descricao: "Mapa hipsométrico colorido com escala", params: "—" },
  { acao: "importar", descricao: "Importar arquivo", params: "arquivo: csv|txt|dxf|geojson|shp|kml|kmz, conteudo" },
  { acao: "exportar", descricao: "Exportar projeto", params: "formato: dxf|dwg|shp|csv|ods|pdf|kml|kmz" },
  { acao: "memorial_descritivo", descricao: "Memorial descritivo Word", params: "entidade_id?" },
  { acao: "calcular_azimutes", descricao: "Azimutes do perímetro", params: "entidade_id?" },
  { acao: "calcular_rumos", descricao: "Rumos do perímetro", params: "entidade_id?" },
  { acao: "area_geodesica", descricao: "Área (plano atual)", params: "entidade_id?" },
  { acao: "conferir_fechamento", descricao: "Conferir fechamento", params: "entidade_id?" },
  { acao: "ajustar_poligono", descricao: "Ajuste geométrico (em desenvolvimento)", params: "—" },
  { acao: "perfil_longitudinal", descricao: "Perfil longitudinal", params: "pontos: [P1,P2]" },
  { acao: "secoes", descricao: "Seções (em desenvolvimento)", params: "—" },
  { acao: "volume_corte", descricao: "Volume corte (em desenvolvimento)", params: "—" },
  { acao: "volume_aterro", descricao: "Volume aterro (em desenvolvimento)", params: "—" },
  { acao: "inserir_sondagem", descricao: "Sondagem (em desenvolvimento)", params: "—" },
  { acao: "perfil_geologico", descricao: "Perfil geológico (em desenvolvimento)", params: "—" },
  { acao: "secao_spt", descricao: "Seção SPT (em desenvolvimento)", params: "—" },
  { acao: "poco_monitoramento", descricao: "Poço monitoramento (em desenvolvimento)", params: "—" },
  { acao: "selecionar", descricao: "Selecionar entidade", params: "entidade_id" },
  { acao: "desconhecido", descricao: "Comando não reconhecido", params: "resposta com sugestões" },
];

export function buildCadAiSystemPrompt(): string {
  const actions = CAD_AI_ACTION_CATALOG.map(
    (a) => `- ${a.acao}: ${a.descricao}${a.params ? ` (${a.params})` : ""}`,
  ).join("\n");

  return `Você é o assistente IA do ambiente CAD DataGeo (topografia, agrimensura, geotecnia).
Interprete comandos naturais em português (voz ou texto) e responda SOMENTE com JSON válido, sem markdown.

Para UM comando, use:
{
  "acao": "<ação do catálogo>",
  "pontos": ["P1","P2"],
  "entidade_id": "pl_xxx",
  "equidistancia": 1,
  "texto": "conteúdo do rótulo",
  "resposta": "mensagem curta em português"
}

Para VÁRIOS comandos em sequência (ex.: importar KMZ + TIN + curvas), use:
{
  "acoes": [
    {"funcao": "criarPoligono", "usarSelecao": true},
    {"funcao": "calcularArea"},
    {"funcao": "adicionarTexto", "posicao": "centro"}
  ],
  "resposta": "Resumo do que será feito"
}

Flags especiais:
- usarSelecao: true — usa pontos/entidade selecionada (contexto.selecao)
- posicao: "centro" — texto/área no centróide do polígono selecionado

Também aceite "funcao" como alias de "acao" (ex.: criarPoligono, calcularArea, calcularDeclividade, gerarMemorial).

Schema de parâmetros:
- pontos: ["P1","P2"]
- entidade_id, entidade_ids
- equidistancia / intervalo (m) — curvas de nível
- arquivo: csv|txt|dxf|geojson|shp|kml|kmz
- formato: dxf|dwg|shp|csv|ods|pdf|kml|kmz
- texto, novo_id, id_origem, distancia, angulo, x, y, z, conteudo

Catálogo de ações:
${actions}

Regras:
- Use rótulos exatos dos pontos do contexto (campo "pontos"). Normalize "ponto 1" → P1, "vértice 1" → V1.
- "Crie um polígono com P1, P2, P3 e P4" → criar_poligono, pontos: ["P1","P2","P3","P4"]
- "Ligue todos os pontos" → criar_polilinha com todos os pontos do contexto em ordem
- "Numere os vértices" → renumerar_pontos. "Coloque as distâncias" → inserir_cota_automatica
- "Calcule a área e coloque texto no centro" → acoes: [medir_area, inserir_area] ou inserir_area
- "Quanto mede a área?" / "Qual o tamanho do terreno?" → medir_area
- "Importe este KMZ, gere triangulação e curvas de 1 m" → acoes com importar, gerar_tin, curvas_nivel equidistancia 1
- "Gerar memorial" → memorial_descritivo. "Perfil longitudinal P1 P2" → perfil_longitudinal
- "Volume de corte e aterro" → volume_corte (informe se dados insuficientes em resposta)
- Considere camadas, sistema de coordenadas e objetosSelecionados do contexto
- desconhecido: sugira comandos válidos em "resposta".`;
}
