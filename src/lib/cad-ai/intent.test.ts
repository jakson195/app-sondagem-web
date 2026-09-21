import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { classifyCadIntent, commandFromIntent, detectCadEntity, validateIntent } from "./intent";
import { cadCommandRouter } from "./command-router";
import { resetCadConversationState } from "./conversation-state";
import { interpretAssistenteIaCommand } from "@/lib/rtk-validation/cad/openai-assistant.service";
import type { CadAiProjectContext } from "@/lib/rtk-validation/cad/ai-command-types";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;

function context(): CadAiProjectContext {
  return {
    projectName: "Loteamento X",
    crs: "EPSG:31982",
    sistema: "SIRGAS 2000 / UTM",
    coordenadas: {
      sistema: "SIRGAS 2000 / UTM",
      epsg: "EPSG:31982",
      extensao: { minE: 0, minN: 0, maxE: 100, maxN: 100 },
    },
    selectedEntityId: null,
    selectedEntitySummary: null,
    selectedVertexIndex: null,
    selectedSegmentIndex: null,
    pontos: [],
    points: [{ label: "P1", x: 1, y: 2, z: 3, layerId: "rtk_points" }],
    camadas: [],
    layers: [],
    polygons: [],
    lines: 0,
    polylines: 0,
    totalEntidades: 0,
    objetosSelecionados: 0,
    selecao: {
      entidadeId: null,
      tipo: null,
      resumo: null,
      pontos: [],
      verticeIndex: null,
      arestaIndex: null,
    },
    terreno: { tin: { ativo: false, arestas: 0, pontos: 0 }, curvasNivel: { ativo: false, quantidade: 0 } },
    elevationPointCount: 0,
    loteamento: {
      projeto: { nome: "Loteamento X", unidade: "m / m²", sistemaCoordenadas: "EPSG:31982" },
      quadras: [
        { id: "A", area: 2000, quantidadeLotes: 4, areaMedia: 300 },
        { id: "B", area: 2000, quantidadeLotes: 4, areaMedia: 300 },
        { id: "G", area: 5760, quantidadeLotes: 18, areaMedia: 320 },
      ],
      lotes: [{ id: "01", quadra: "G", area: 320, testada: 12.5, profundidade: 25 }],
      ruas: [],
      areasInstitucionais: [],
      areasVerdes: [],
      remanescenteM2: 0,
    },
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.OPENAI_API_KEY = originalKey;
  resetCadConversationState();
});

describe("classificação de entidade e intenção", () => {
  it("A) dar nome às quadras → renomear_quadra, nunca ajustar_lote", async () => {
    const intent = classifyCadIntent("dar nome às quadras", context());
    assert.equal(intent.intent, "renomear_quadra");
    assert.equal(intent.entity, "quadra");
    assert.equal(intent.requiresClarification, true);
    const result = await interpretAssistenteIaCommand({
      command: "dar nome às quadras",
      context: context(),
      conversationId: "intent-a",
    });
    assert.equal(result.commands[0]?.acao, "renomear_quadra");
    assert.notEqual(result.commands[0]?.acao, "ajustar_lote");
    assert.match(result.resposta ?? "", /quais nomes/i);
  });

  it("B) renomear a quadra A → renomear_quadra", async () => {
    const result = await interpretAssistenteIaCommand({
      command: "renomear a quadra A",
      context: context(),
    });
    assert.equal(result.intent, "renomear_quadra");
    assert.equal(result.commands[0]?.acao, "renomear_quadra");
    assert.equal(result.commands[0]?.quadra, "A");
  });

  it("C) quero chamar a quadra A de QA → renomear_quadra", async () => {
    const result = await interpretAssistenteIaCommand({
      command: "quero chamar a quadra A de QA",
      context: context(),
    });
    assert.equal(result.commands[0]?.acao, "renomear_quadra");
    assert.equal(result.commands[0]?.quadra, "A");
    assert.equal(result.commands[0]?.novo_id, "QA");
  });

  it("D) alterar lote 01 para 500m² → ajustar_lote", async () => {
    const result = await interpretAssistenteIaCommand({
      command: "alterar lote 01 para 500m²",
      context: context(),
    });
    assert.equal(result.intent, "ajustar_lote");
    assert.equal(result.entity, "lote");
    assert.equal(result.commands[0]?.acao, "ajustar_lote");
    assert.equal(result.commands[0]?.area_alvo_m2, 500);
    assert.equal(result.commands[0]?.scope, "single_lot");
    assert.equal(result.commands.length, 1);
  });

  it("E) ajustar os lotes da quadra G para 300m² → otimizar_quadra", async () => {
    const result = await interpretAssistenteIaCommand({
      command: "ajustar os lotes da quadra G para 300m²",
      context: context(),
    });
    assert.equal(result.commands[0]?.acao, "otimizar_quadra");
    assert.notEqual(result.commands[0]?.acao, "ajustar_lote");
    assert.equal(result.commands[0]?.quadra, "G");
    assert.equal(result.commands[0]?.area_alvo_m2, 300);
  });

  it("F) reprojetar o loteamento → reprojetar_loteamento, nunca ajustar_lote", async () => {
    const intent = classifyCadIntent("reprojetar o loteamento", context());
    assert.equal(intent.intent, "reprojetar_loteamento");
    assert.equal(intent.entity, "projeto");
    const result = await interpretAssistenteIaCommand({
      command: "reprojetar o loteamento",
      context: context(),
    });
    assert.equal(result.intent, "reprojetar_loteamento");
    assert.notEqual(result.commands[0]?.acao, "ajustar_lote");
    assert.ok(["otimizar_quadra", "reprojetar_loteamento"].includes(result.commands[0]?.acao ?? ""));
  });

  it("G) qual a área do lote 01? → consultar_lote", async () => {
    const result = await interpretAssistenteIaCommand({
      command: "qual a área do lote 01?",
      context: context(),
    });
    assert.equal(result.commands[0]?.acao, "consultar_lote");
    assert.equal(result.entity, "lote");
  });

  it("paráfrases de nomeação de quadra não viram lote", () => {
    for (const phrase of [
      "coloca nomes nas quadras",
      "quero identificar as quadras",
      "trocar os nomes das quadras",
      "nomear as quadras",
    ]) {
      const intent = classifyCadIntent(phrase, context());
      assert.equal(intent.intent, "renomear_quadra", phrase);
      assert.equal(intent.entity, "quadra", phrase);
      assert.notEqual(commandFromIntent(intent).acao, "ajustar_lote", phrase);
      assert.equal(cadCommandRouter(phrase, context()).commands[0]?.acao, "renomear_quadra", phrase);
    }
  });

  it("loteamento não é lote", () => {
    assert.equal(detectCadEntity("reprojetar o loteamento"), "projeto");
    assert.equal(detectCadEntity("alterar lote 01"), "lote");
    assert.equal(detectCadEntity("dar nome às quadras"), "quadra");
  });

  it("validateIntent impede ajustar_lote quando a entidade é quadra", () => {
    const intent = classifyCadIntent("dar nome às quadras", context());
    const checked = validateIntent(intent, { acao: "ajustar_lote", lote: "01", area_alvo_m2: 500 });
    assert.equal(checked.command.acao, "renomear_quadra");
    assert.match(checked.command.resposta ?? "", /quais nomes/i);
  });

  it("follow-up QA e QB completa a renomeação", async () => {
    await interpretAssistenteIaCommand({
      command: "dar nome às quadras",
      context: context(),
      conversationId: "intent-follow",
    });
    const follow = await interpretAssistenteIaCommand({
      command: "QA e QB",
      context: context(),
      conversationId: "intent-follow",
    });
    assert.equal(follow.commands[0]?.acao, "renomear_quadra");
    assert.deepEqual(follow.commands[0]?.nomes, ["QA", "QB"]);
  });
});
