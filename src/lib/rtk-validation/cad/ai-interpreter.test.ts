import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { CAD_AI_IMPLEMENTED_ACTIONS, cadAiTools } from "./ai-command-catalog";
import { parseOpenAiToolCalls } from "./ai-interpreter";
import { interpretAssistenteIaCommand } from "./openai-assistant.service";
import { validateCadAiCommands } from "./ai-command-validator";
import { buildCadAiContext } from "./ai-context";
import { executeCadAiCommand } from "./ai-command-executor";
import { parseLocalCadCommand } from "./local-command-parser";
import type { CadAiCommand, CadAiProjectContext } from "./ai-command-types";
import type { CadProject } from "./types";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.OPENAI_API_KEY = originalKey;
});

function sampleContext(): CadAiProjectContext {
  return {
    projectName: "Teste",
    crs: "EPSG:31982",
    sistema: "SIRGAS 2000 / UTM",
    coordenadas: {
      sistema: "SIRGAS 2000 / UTM",
      epsg: "EPSG:31982",
      extensao: { minE: 0, minN: 0, maxE: 100, maxN: 100 },
    },
    selectedEntityId: "pl_1",
    selectedEntitySummary: "Polígono (4 vértices, fechado)",
    selectedVertexIndex: 1,
    selectedSegmentIndex: 0,
    pontos: ["P1", "P2", "P3", "P4"],
    points: [
      { label: "P1", x: 0, y: 0, z: 10, layerId: "rtk_points" },
      { label: "P2", x: 10, y: 0, z: 10, layerId: "rtk_points" },
      { label: "P3", x: 10, y: 10, z: 11, layerId: "rtk_points" },
      { label: "P4", x: 0, y: 10, z: 11, layerId: "rtk_points" },
    ],
    camadas: ["PONTOS"],
    layers: [{ id: "rtk_points", name: "PONTOS", visible: true, entityCount: 4 }],
    polygons: [{ id: "pl_1", name: "Polígono 1", vertices: 4, closed: true }],
    lines: 0,
    polylines: 1,
    totalEntidades: 5,
    objetosSelecionados: 1,
    selecao: {
      entidadeId: "pl_1",
      tipo: "polyline",
      resumo: "Polígono (4 vértices, fechado)",
      pontos: ["P1", "P2", "P3", "P4"],
      verticeIndex: 1,
      arestaIndex: 0,
    },
    terreno: { tin: { ativo: false, arestas: 0, pontos: 4 }, curvasNivel: { ativo: false, quantidade: 0 } },
    elevationPointCount: 4,
    pendingProfileStart: null,
  };
}

const SAMPLE_ARGS: Record<(typeof CAD_AI_IMPLEMENTED_ACTIONS)[number], Record<string, unknown>> = {
  criar_ponto: { x: 500000, y: 7100000, z: 12, novo_id: "P5" },
  criar_linha: { pontos: ["P1", "P2"] },
  criar_polilinha: { pontos: ["P1", "P2", "P3"] },
  criar_poligono: { pontos: ["P1", "P2", "P3", "P4"] },
  fechar_poligono: { usarSelecao: true },
  unir_linhas: { entidade_ids: ["pl_a", "pl_b"] },
  apagar: { usarSelecao: true },
  mover: { usarSelecao: true, distancia: 10, angulo: 90 },
  copiar: { usarSelecao: true, distancia: 5, angulo: 45 },
  rotacionar: { usarSelecao: true, angulo: 30 },
  alterar_id: { id_origem: "P1", novo_id: "Marco-01" },
  alterar_cota: { id_origem: "P2", z: 245.5 },
  renumerar_pontos: {},
  mostrar_coordenadas: { pontos: ["P1"] },
  exportar_pontos: {},
  medir_distancia: { pontos: ["P1", "P2"] },
  medir_area: { usarSelecao: true },
  medir_perimetro: { usarSelecao: true },
  medir_azimute: { pontos: ["P1", "P2"] },
  medir_inclinacao: { pontos: ["P1", "P2"] },
  inserir_cota: { pontos: ["P1", "P2"] },
  inserir_cota_automatica: { usarSelecao: true },
  inserir_texto: { texto: "Lote 01", posicao: "centro", usarSelecao: true },
  inserir_coordenadas: { pontos: ["P1"] },
  inserir_area: { usarSelecao: true },
  inserir_elevacao: { pontos: ["P1", "P2"] },
  mostrar_cotas_pontos: {},
  gerar_tin: {},
  remover_tin: {},
  cota_curva: {},
  medir: { usarSelecao: true },
  curvas_nivel: { intervalo: 2 },
  mapa_hipsometrico: {},
  importar: { arquivo: "csv" },
  exportar: { formato: "dxf" },
  exportar_sigef: { usarSelecao: true },
  gerar_loteamento: {
    usarSelecao: true,
    largura_via_m: 12,
    profundidade_quadra_m: 50,
    testada_minima_m: 10,
    area_minima_m2: 250,
  },
  alterar_eixo: {},
  gerar_reurb: {},
  exportar_reurb_tabular: {},
  gerar_plantas_reurb: {},
  memorial_descritivo: { usarSelecao: true },
  calcular_azimutes: { usarSelecao: true },
  calcular_rumos: { usarSelecao: true },
  area_geodesica: { usarSelecao: true },
  conferir_fechamento: { usarSelecao: true },
  perfil_longitudinal: { pontos: ["P1", "P2"] },
  perfil_transversal: { pontos: ["P1", "P2"], largura: 20 },
  secoes: { largura: 20, intervalo: 20, usarSelecao: true },
  gerar_mdt: {},
  volume_corte: { z: 8, usarSelecao: true },
  volume_aterro: { z: 12, usarSelecao: true },
  ativar_ferramenta: { ferramenta: "polilinha" },
  trocar_camada: { camada: "PONTOS", visivel: true },
  subdividir_quadra: { testada_m: 12, usarSelecao: true },
  criar_rua_existente: { nome: "Rua A", usarSelecao: true },
  reservar_area: { tipo: "institucional", percentual: 20, lado: "fundo", usarSelecao: true },
  selecionar: { entidade_id: "pl_1" },
};

/** Frases informais que o parser local em geral não cobre — caem na OpenAI mockada. */
const PHRASES: Array<{
  phrase: string;
  acao: (typeof CAD_AI_IMPLEMENTED_ACTIONS)[number];
}> = [
  { phrase: "bota um ponto em E 500000 N 7100000", acao: "criar_ponto" },
  { phrase: "liga o P1 no P2 com uma linha reta", acao: "criar_linha" },
  { phrase: "faz uma polilinha passando por P1 P2 P3", acao: "criar_polilinha" },
  { phrase: "fecha um polígono usando P1 P2 P3 P4", acao: "criar_poligono" },
  { phrase: "fecha essa polilinha aberta", acao: "fechar_poligono" },
  { phrase: "junta essas duas polilinhas", acao: "unir_linhas" },
  { phrase: "some com essa linha", acao: "apagar" },
  { phrase: "empurra isso 10 metros no azimute 90", acao: "mover" },
  { phrase: "duplica o polígono 5 m a 45 graus", acao: "copiar" },
  { phrase: "gira o polígono 30 graus", acao: "rotacionar" },
  { phrase: "chama o P1 de Marco-01", acao: "alterar_id" },
  { phrase: "sobe a cota do P2 pra 245.5", acao: "alterar_cota" },
  { phrase: "recoloca os números dos pontos", acao: "renumerar_pontos" },
  { phrase: "me fala as coordenadas do P1", acao: "mostrar_coordenadas" },
  { phrase: "baixa os pontos em csv", acao: "exportar_pontos" },
  { phrase: "quanto tem de P1 até P2?", acao: "medir_distancia" },
  { phrase: "tamanho desse terreno", acao: "medir_area" },
  { phrase: "quanto mede o perímetro", acao: "medir_perimetro" },
  { phrase: "qual o azimute de P1 pra P2", acao: "medir_azimute" },
  { phrase: "qual a declividade entre P1 e P2", acao: "medir_inclinacao" },
  { phrase: "bota a cota entre P1 e P2 no desenho", acao: "inserir_cota" },
  { phrase: "coloca cotas em todos os lados", acao: "inserir_cota_automatica" },
  { phrase: "escreve Lote 01 no desenho", acao: "inserir_texto" },
  { phrase: "etiqueta as coords do P1", acao: "inserir_coordenadas" },
  { phrase: "coloca a área no meio do polígono", acao: "inserir_area" },
  { phrase: "mostra o Z dos pontos no desenho", acao: "inserir_elevacao" },
  { phrase: "exibe as cotas de todos os pontos", acao: "mostrar_cotas_pontos" },
  { phrase: "faz a malha triangular", acao: "gerar_tin" },
  { phrase: "tira o TIN da tela", acao: "remover_tin" },
  { phrase: "coloca as cotas nas curvas", acao: "cota_curva" },
  { phrase: "mede isso aí", acao: "medir" },
  { phrase: "quero isolinhas com 2 metros de equidistância", acao: "curvas_nivel" },
  { phrase: "pinta o mapa por altitude", acao: "mapa_hipsometrico" },
  { phrase: "carrega esse csv no desenho", acao: "importar" },
  { phrase: "salva o desenho em dxf", acao: "exportar" },
  { phrase: "exportar planilha sigef", acao: "exportar_sigef" },
  {
    phrase: "lotea essa gleba em lotes de 250 metros quadrados com testada mínima de 10 metros e vias de 12 metros",
    acao: "gerar_loteamento",
  },
  { phrase: "aplica cotas e numeração reurb nos lotes", acao: "gerar_reurb" },
  { phrase: "gera o memorial tabular da regularização", acao: "exportar_reurb_tabular" },
  { phrase: "exporta as plantas individuais dos lotes", acao: "gerar_plantas_reurb" },
  { phrase: "emite o memorial", acao: "memorial_descritivo" },
  { phrase: "lista os azimutes da poligonal", acao: "calcular_azimutes" },
  { phrase: "me dá os rumos", acao: "calcular_rumos" },
  { phrase: "área geodésica desse polígono", acao: "area_geodesica" },
  { phrase: "essa poligonal fecha?", acao: "conferir_fechamento" },
  { phrase: "corta um perfil de P1 a P2", acao: "perfil_longitudinal" },
  { phrase: "faz o transversal em P1 rumo P2 com 20 m de largura", acao: "perfil_transversal" },
  { phrase: "gera as seções-tipo no eixo de 20 em 20 metros com 20 m de largura", acao: "secoes" },
  { phrase: "gera o modelo digital do terreno", acao: "gerar_mdt" },
  { phrase: "calcula o volume de corte no platô de 8 metros", acao: "volume_corte" },
  { phrase: "quanto dá de aterro até a cota 12", acao: "volume_aterro" },
  { phrase: "ativa a ferramenta de desenho livre da polilinha", acao: "ativar_ferramenta" },
  { phrase: "deixa só a camada de pontos visível", acao: "trocar_camada" },
  { phrase: "parte essa quadra em fatias de 12 metros de testada", acao: "subdividir_quadra" },
  { phrase: "essa polilinha é a rua pública que já existe", acao: "criar_rua_existente" },
  { phrase: "separa 20 por cento da gleba para área institucional no fundo", acao: "reservar_area" },
  { phrase: "seleciona o polígono pl_1", acao: "selecionar" },
];

function openaiPayload(toolCalls: Array<{ name: string; args: Record<string, unknown> }>, content = "") {
  return {
    choices: [
      {
        message: {
          content,
          tool_calls: toolCalls.map((tc, i) => ({
            id: `call_${i}`,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify(tc.args) },
          })),
        },
      },
    ],
  };
}

function mockOpenAi(payload: object) {
  process.env.OPENAI_API_KEY = "sk-test";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.includes("api.openai.com")) {
      throw new Error(`fetch inesperado: ${url}`);
    }
    return {
      ok: true,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    } as Response;
  }) as typeof fetch;
}

describe("parseLocalCadCommand registro", () => {
  it("reconhece ferramenta, camada, subdividir, rua e reserva", () => {
    assert.equal(parseLocalCadCommand("ferramenta polilinha")?.acao, "ativar_ferramenta");
    assert.equal(parseLocalCadCommand("ferramenta polilinha")?.ferramenta, "polilinha");
    assert.equal(parseLocalCadCommand("ocultar camada curvas de nível")?.acao, "trocar_camada");
    assert.equal(parseLocalCadCommand("ocultar camada curvas de nível")?.visivel, false);
    assert.equal(parseLocalCadCommand("subdividir quadra testada 12")?.acao, "subdividir_quadra");
    assert.equal(parseLocalCadCommand("subdividir quadra testada 12")?.testada_m, 12);
    assert.equal(parseLocalCadCommand("criar rua existente Av. Brasil")?.acao, "criar_rua_existente");
    assert.equal(parseLocalCadCommand("reservar 20% institucional no fundo")?.acao, "reservar_area");
    assert.equal(parseLocalCadCommand("reservar 20% institucional no fundo")?.percentual, 20);
    assert.equal(parseLocalCadCommand("gerar curvas de nível")?.acao, "curvas_nivel");
    assert.equal(parseLocalCadCommand("alterar eixo da rua em 2 pontos")?.acao, "alterar_eixo");
  });
});

describe("cadAiTools", () => {
  it("expõe uma tool por ação implementada, sem stubs e sem duplicata", () => {
    const names = cadAiTools.map((t) => t.function.name);
    assert.deepEqual([...names].sort(), [...CAD_AI_IMPLEMENTED_ACTIONS].sort());
    assert.equal(new Set(names).size, names.length);
    assert.ok(names.includes("gerar_mdt"));
    assert.ok(names.includes("volume_corte"));
    assert.ok(names.includes("volume_aterro"));
    assert.ok(!(names as readonly string[]).includes("inserir_sondagem"));
    for (const tool of cadAiTools) {
      assert.equal(tool.type, "function");
      assert.equal(tool.function.parameters.type, "object");
      assert.ok(tool.function.description.length > 10);
    }
  });
});

describe("parseOpenAiToolCalls", () => {
  it("converte name+arguments em CadAiCommand", () => {
    const commands = parseOpenAiToolCalls([
      { function: { name: "mover", arguments: JSON.stringify({ distancia: 10, angulo: 90, usarSelecao: true }) } },
    ]);
    assert.equal(commands.length, 1);
    assert.equal(commands[0].acao, "mover");
    assert.equal(commands[0].distancia, 10);
    assert.equal(commands[0].angulo, 90);
    assert.equal(commands[0].usarSelecao, true);
  });

  it("suporta comando composto (vários tool_calls)", () => {
    const commands = parseOpenAiToolCalls([
      { function: { name: "criar_ponto", arguments: JSON.stringify({ x: 1, y: 2 }) } },
      { function: { name: "medir_distancia", arguments: JSON.stringify({ pontos: ["P1", "P2"] }) } },
    ]);
    assert.deepEqual(
      commands.map((c) => c.acao),
      ["criar_ponto", "medir_distancia"],
    );
    assert.equal(commands[0].x, 1);
    assert.equal(commands[0].y, 2);
  });
});

describe("validateCadAiCommands", () => {
  it("aceita mover com distancia e angulo", () => {
    const result = validateCadAiCommands([
      { acao: "mover", distancia: 10, angulo: 90, usarSelecao: true },
    ]);
    assert.equal(result.ok, true);
  });

  it("rejeita mover sem distancia e pede esclarecimento", () => {
    const result = validateCadAiCommands([{ acao: "mover", usarSelecao: true, angulo: 90 }]);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.message, /distancia/i);
  });

  it("rejeita ação inexistente", () => {
    const result = validateCadAiCommands([{ acao: "criar_circulo" } as unknown as CadAiCommand]);
    assert.equal(result.ok, false);
  });
});

describe("buildCadAiContext", () => {
  it("inclui vértice e aresta selecionados no snapshot", () => {
    const project: CadProject = {
      name: "Teste",
      crs: "EPSG:31982",
      layers: [{ id: "draw", name: "DESENHO", color: "#fff", visible: true, locked: false }],
      entities: [
        {
          id: "pl_1",
          type: "polyline",
          layerId: "draw",
          closed: true,
          name: "Polígono 1",
          vertices: [
            { x: 0, y: 0, z: 0 },
            { x: 10, y: 0, z: 0 },
            { x: 10, y: 10, z: 0 },
          ],
        },
      ],
    };
    const ctx = buildCadAiContext(project, "pl_1", null, {
      selectedVertexIndex: 2,
      selectedSegmentIndex: 1,
    });
    assert.equal(ctx.selectedVertexIndex, 2);
    assert.equal(ctx.selectedSegmentIndex, 1);
    assert.equal(ctx.selecao.verticeIndex, 2);
    assert.equal(ctx.selecao.arestaIndex, 1);
    assert.match(ctx.selectedEntitySummary ?? "", /vértice índice 2/);
    assert.match(ctx.selectedEntitySummary ?? "", /aresta índice 1/);
  });
});

describe("interpretAssistenteIaCommand", () => {
  it("parser local continua tendo prioridade (não chama OpenAI)", async () => {
    let called = false;
    process.env.OPENAI_API_KEY = "sk-test";
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("não deveria chamar OpenAI");
    }) as typeof fetch;

    const result = await interpretAssistenteIaCommand({
      command: "renumerar pontos",
      context: sampleContext(),
    });
    assert.equal(called, false);
    assert.equal(result.source, "local");
    assert.equal(result.commands[0]?.acao, "renumerar_pontos");
  });

  for (const { phrase, acao } of PHRASES) {
    it(`frase "${phrase}" → ${acao}`, async () => {
      mockOpenAi(openaiPayload([{ name: acao, args: SAMPLE_ARGS[acao] }]));
      const result = await interpretAssistenteIaCommand({
        command: phrase,
        context: sampleContext(),
      });
      assert.ok(result.commands.length >= 1, result.resposta ?? "sem comando");
      assert.equal(result.commands[0].acao, acao);
    });
  }

  it("comando composto: cria ponto e mede distância", async () => {
    mockOpenAi(
      openaiPayload([
        { name: "criar_ponto", args: SAMPLE_ARGS.criar_ponto },
        { name: "medir_distancia", args: SAMPLE_ARGS.medir_distancia },
      ]),
    );
    const result = await interpretAssistenteIaCommand({
      command: "cria um ponto em 500000 7100000 e depois mede a distância P1 P2",
      context: sampleContext(),
    });
    assert.equal(result.source, "openai");
    assert.deepEqual(
      result.commands.map((c) => c.acao),
      ["criar_ponto", "medir_distancia"],
    );
  });

  it("texto sem tool (ex.: círculo) vira esclarecimento, sem executar", async () => {
    mockOpenAi({
      choices: [
        {
          message: {
            content: "Ainda não consigo criar círculos neste CAD. Posso criar um polígono com os pontos selecionados.",
            tool_calls: [],
          },
        },
      ],
    });
    const result = await interpretAssistenteIaCommand({
      command: "desenha um círculo aqui",
      context: sampleContext(),
    });
    assert.equal(result.commands.length, 0);
    assert.match(result.resposta ?? "", /círculo/i);
  });

  it("tool incompleta não segue para o executor — pede o que faltou", async () => {
    mockOpenAi(openaiPayload([{ name: "mover", args: { usarSelecao: true } }]));
    const result = await interpretAssistenteIaCommand({
      command: "move isso um pouco",
      context: sampleContext(),
    });
    assert.equal(result.commands.length, 0);
    assert.match(result.resposta ?? "", /distancia/i);
  });
});

describe("gerar polígono do ponto até o quatro", () => {
  it("expande 'do ponto até o quatro' para P1–P4", async () => {
    const { parsePointReferenceList } = await import("./ai-point-utils");
    assert.deepEqual(parsePointReferenceList("do ponto até o quatro"), ["P1", "P2", "P3", "P4"]);
    assert.deepEqual(parsePointReferenceList("do ponto um até o quatro"), ["P1", "P2", "P3", "P4"]);
    assert.deepEqual(parsePointReferenceList("do V1 ao V4"), ["V1", "V2", "V3", "V4"]);
  });

  it("parser local reconhece a frase falada sem OpenAI", async () => {
    const result = await interpretAssistenteIaCommand({
      command: "Gerar polígonos do ponto até o quatro",
      context: sampleContext(),
    });
    assert.equal(result.source, "local");
    assert.equal(result.commands[0]?.acao, "criar_poligono");
    assert.deepEqual(result.commands[0]?.pontos, ["P1", "P2", "P3", "P4"]);
  });
});

describe("gerar_loteamento ponta a ponta", () => {
  const glebaProject: CadProject = {
    name: "Gleba teste",
    crs: "EPSG:31982",
    layers: [{ id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false }],
    entities: [
      {
        id: "gleba_1",
        type: "polyline",
        layerId: "draw",
        closed: true,
        name: "Gleba",
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 200, y: 0, z: 0 },
          { x: 200, y: 120, z: 0 },
          { x: 0, y: 120, z: 0 },
        ],
      },
    ],
  };

  it("interpreta a frase, monta o CadAiCommand e executa lotes na gleba 200×120", async () => {
    mockOpenAi(
      openaiPayload([
        {
          name: "gerar_loteamento",
          args: SAMPLE_ARGS.gerar_loteamento,
        },
      ]),
    );
    const interpreted = await interpretAssistenteIaCommand({
      command:
        "lotea essa gleba em lotes de 250 metros quadrados com testada mínima de 10 metros e vias de 12 metros",
      context: sampleContext(),
    });
    assert.equal(interpreted.commands[0]?.acao, "gerar_loteamento");
    const cmd = interpreted.commands[0];
    assert.equal(cmd.largura_via_m, 12);
    assert.equal(cmd.testada_minima_m, 10);
    assert.equal(cmd.area_minima_m2, 250);
    assert.equal(cmd.profundidade_quadra_m, 50);

    const executed = executeCadAiCommand(glebaProject, cmd, { selectedId: "gleba_1" });
    assert.equal(executed.ok, true, executed.message);
    const lotes = executed.project.entities.filter(
      (e) => e.layerId === "loteamento_lotes" && e.type === "polyline" && e.closed,
    );
    assert.ok(lotes.length >= 8, `esperado vários lotes, veio ${lotes.length}: ${executed.message}`);
    assert.ok(lotes.length <= 80, `número de lotes implausível: ${lotes.length}`);
    const areaUtil = executed.project.entities.filter(
      (e) => e.layerId === "area_util" && e.type === "polyline" && e.closed,
    );
    if (areaUtil.length > 0) {
      assert.ok(executed.project.layers.some((l) => l.id === "area_util"));
    }
    assert.match(executed.message, /lotes/i);
    assert.match(executed.message, /área útil/i);
    assert.match(executed.message, /ruas/i);
    assert.equal(
      executed.project.entities.filter((e) => e.layerId === "loteamento_calcadas").length,
      0,
      "sem largura_calcada_m não deve criar calçadas",
    );
  });

  it("cria calçadas, eixo tracejado e filete quando os parâmetros extras vêm no comando", () => {
    const executed = executeCadAiCommand(
      glebaProject,
      {
        acao: "gerar_loteamento",
        usarSelecao: true,
        largura_via_m: 12,
        profundidade_quadra_m: 50,
        testada_minima_m: 10,
        area_minima_m2: 250,
        largura_calcada_m: 2,
        eixo_rua: true,
        raio_esquina_m: 3,
      },
      { selectedId: "gleba_1" },
    );
    assert.equal(executed.ok, true, executed.message);
    const calcadas = executed.project.entities.filter(
      (e) => e.layerId === "loteamento_calcadas" && e.type === "polyline" && e.closed,
    );
    const eixos = executed.project.entities.filter(
      (e) => e.layerId === "loteamento_eixos" && e.type === "polyline" && !e.closed,
    );
    assert.ok(calcadas.length >= 1, `esperado calçadas, veio ${calcadas.length}`);
    assert.ok(eixos.length >= 1, `esperado eixos, veio ${eixos.length}`);
    const hatchLayer = executed.project.layers.find((l) => l.id === "loteamento_calcadas");
    assert.equal(hatchLayer?.hatchPattern, "diagonal");
    const eixoLayer = executed.project.layers.find((l) => l.id === "loteamento_eixos");
    assert.equal(eixoLayer?.lineType, "dashed");
  });

  it("recusa entidade que não é polígono fechado", () => {
    const withPoint: CadProject = {
      ...glebaProject,
      entities: [{ id: "pt_1", type: "point", layerId: "draw", x: 1, y: 2, z: 0, label: "P1" }],
    };
    const executed = executeCadAiCommand(
      withPoint,
      {
        acao: "gerar_loteamento",
        entidade_id: "pt_1",
        largura_via_m: 12,
        profundidade_quadra_m: 50,
        testada_minima_m: 10,
        area_minima_m2: 250,
      },
      { selectedId: "pt_1" },
    );
    assert.equal(executed.ok, false);
    assert.match(executed.message, /polígono fechado/i);
  });
});

describe("volumetria AI", () => {
  const terrainProject: CadProject = {
    name: "Volume teste",
    crs: "EPSG:31982",
    layers: [
      { id: "rtk_points", name: "PONTOS", color: "#38bdf8", visible: true, locked: false },
      { id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false },
    ],
    entities: [
      { id: "p1", type: "point", layerId: "rtk_points", x: 0, y: 0, z: 10, label: "P1" },
      { id: "p2", type: "point", layerId: "rtk_points", x: 10, y: 0, z: 10, label: "P2" },
      { id: "p3", type: "point", layerId: "rtk_points", x: 0, y: 10, z: 10, label: "P3" },
      {
        id: "pl_1",
        type: "polyline",
        layerId: "draw",
        closed: true,
        name: "Região",
        vertices: [
          { x: 0, y: 0, z: 10 },
          { x: 10, y: 0, z: 10 },
          { x: 10, y: 10, z: 10 },
          { x: 0, y: 10, z: 10 },
        ],
      },
    ],
  };

  it("gerar_mdt cria o TIN do terreno", () => {
    const executed = executeCadAiCommand(terrainProject, { acao: "gerar_mdt" });
    assert.equal(executed.ok, true, executed.message);
    assert.ok(executed.project.entities.some((e) => e.layerId === "tin"));
    assert.match(executed.message, /MDT/i);
  });

  it("volume_corte calcula corte vs platô horizontal", () => {
    const executed = executeCadAiCommand(terrainProject, { acao: "volume_corte", z: 8 });
    assert.equal(executed.ok, true, executed.message);
    assert.match(executed.message, /corte/i);
    assert.ok(executed.sideEffects?.some((s) => s.type === "download_binary"));
  });
});

describe("registro de comandos CAD", () => {
  const gleba: CadProject = {
    name: "Registro",
    crs: "EPSG:31982",
    layers: [
      { id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false },
      { id: "contours", name: "CURVAS_NIVEL", color: "#ef4444", visible: true, locked: true },
    ],
    entities: [
      {
        id: "quadra_1",
        type: "polyline",
        layerId: "draw",
        closed: true,
        name: "Quadra",
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 200, y: 0, z: 0 },
          { x: 200, y: 120, z: 0 },
          { x: 0, y: 120, z: 0 },
        ],
      },
      {
        id: "eixo_1",
        type: "polyline",
        layerId: "draw",
        closed: false,
        name: "Eixo",
        vertices: [
          { x: 0, y: 60, z: 0 },
          { x: 200, y: 60, z: 0 },
        ],
      },
    ],
  };

  it("ativar_ferramenta emite set_tool", () => {
    const executed = executeCadAiCommand(gleba, { acao: "ativar_ferramenta", ferramenta: "polilinha" });
    assert.equal(executed.ok, true, executed.message);
    assert.deepEqual(executed.sideEffects, [{ type: "set_tool", tool: "polyline" }]);
  });

  it("alterar_eixo pede eixo de loteamento e emite start_alterar_eixo", () => {
    const missing = executeCadAiCommand(gleba, { acao: "alterar_eixo" });
    assert.equal(missing.ok, false);
    const withEixo: CadProject = {
      ...gleba,
      entities: gleba.entities.map((entity) =>
        entity.id === "eixo_1" && entity.type === "polyline"
          ? { ...entity, layerId: "loteamento_eixos" }
          : entity,
      ),
    };
    const executed = executeCadAiCommand(withEixo, { acao: "alterar_eixo" });
    assert.equal(executed.ok, true, executed.message);
    assert.deepEqual(executed.sideEffects, [{ type: "start_alterar_eixo" }]);
  });

  it("trocar_camada oculta CURVAS_NIVEL pelo alias", () => {
    const executed = executeCadAiCommand(gleba, { acao: "trocar_camada", camada: "curvas de nível", visivel: false });
    assert.equal(executed.ok, true, executed.message);
    assert.equal(executed.project.layers.find((l) => l.id === "contours")?.visible, false);
  });

  it("subdividir_quadra fatia a quadra pela testada", () => {
    const executed = executeCadAiCommand(
      gleba,
      { acao: "subdividir_quadra", testada_m: 20, usarSelecao: true },
      { selectedId: "quadra_1" },
    );
    assert.equal(executed.ok, true, executed.message);
    const lotes = executed.project.entities.filter((e) => e.layerId === "loteamento_lotes");
    assert.ok(lotes.length >= 8, executed.message);
    assert.equal(executed.project.entities.some((e) => e.id === "quadra_1"), false);
  });

  it("criar_rua_existente move a polilinha para VIA_EXISTENTE", () => {
    const executed = executeCadAiCommand(
      gleba,
      { acao: "criar_rua_existente", nome: "Av. Central", usarSelecao: true },
      { selectedId: "eixo_1" },
    );
    assert.equal(executed.ok, true, executed.message);
    const street = executed.project.entities.find((e) => e.id === "eixo_1");
    assert.equal(street && "layerId" in street ? street.layerId : "", "via_existente");
    assert.equal(street && street.type === "polyline" ? street.name : "", "Av. Central");
  });

  it("reservar_area corta faixa institucional", () => {
    const executed = executeCadAiCommand(
      gleba,
      { acao: "reservar_area", tipo: "institucional", percentual: 20, lado: "fundo", usarSelecao: true },
      { selectedId: "quadra_1" },
    );
    assert.equal(executed.ok, true, executed.message);
    assert.ok(executed.project.entities.some((e) => e.layerId === "area_institucional"));
    assert.ok(executed.project.entities.some((e) => e.type === "polyline" && e.id !== "quadra_1"));
  });

  it("reservar_area reserva_legal no canto cria polígono sem recortar a gleba", () => {
    const executed = executeCadAiCommand(
      gleba,
      {
        acao: "reservar_area",
        tipo: "reserva_legal",
        percentual: 20,
        lado: "superior_direita",
        usarSelecao: true,
      },
      { selectedId: "quadra_1" },
    );
    assert.equal(executed.ok, true, executed.message);
    assert.ok(executed.project.entities.some((e) => e.id === "quadra_1"), "gleba permanece");
    assert.ok(executed.project.entities.some((e) => e.layerId === "area_reserva_legal" && e.type === "polyline"));
    assert.match(executed.message, /reserva legal/i);
  });
});
