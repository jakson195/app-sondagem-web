import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  buildMinimalCadContext,
  compactCadContext,
  contextContainsGeometry,
  detectCadContextLevel,
} from "./minimal-context";
import { cadCommandRouter } from "./command-router";
import { getCadAiCostMetrics, resetCadAiCostMetrics } from "./cost-metrics";
import { resetCadConversationState } from "./conversation-state";
import { resetCadContextCache } from "./context-cache";
import { interpretAssistenteIaCommand } from "@/lib/rtk-validation/cad/openai-assistant.service";
import type { CadAiProjectContext } from "@/lib/rtk-validation/cad/ai-command-types";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
const originalInfo = console.info;
const originalError = console.error;

function loteamentoContext(): CadAiProjectContext {
  const lotes = Array.from({ length: 18 }, (_, index) => ({
    id: String(index + 1).padStart(2, "0"),
    quadra: "G",
    area: 320,
    testada: 12.5,
    profundidade: 25,
  }));
  return {
    projectName: "Loteamento X",
    crs: "EPSG:31982",
    sistema: "SIRGAS 2000 / UTM",
    coordenadas: {
      sistema: "SIRGAS 2000 / UTM",
      epsg: "EPSG:31982",
      extensao: { minE: 0, minN: 0, maxE: 400, maxN: 400 },
    },
    selectedEntityId: "01",
    selectedEntitySummary: "Lote 01",
    selectedVertexIndex: null,
    selectedSegmentIndex: null,
    pontos: ["P1", "P2"],
    points: [
      { label: "P1", x: 500000, y: 7100000, z: 12, layerId: "rtk_points" },
      { label: "P2", x: 500010, y: 7100010, z: 13, layerId: "rtk_points" },
    ],
    camadas: ["LOTES"],
    layers: [{ id: "loteamento_lotes", name: "LOTES", visible: true, entityCount: 18 }],
    polygons: [{ id: "01", name: "Lote 01", vertices: 500, closed: true }],
    lines: 0,
    polylines: 18,
    totalEntidades: 40,
    objetosSelecionados: 1,
    selecao: {
      entidadeId: "01",
      tipo: "polyline",
      resumo: "Lote 01",
      pontos: [],
      verticeIndex: null,
      arestaIndex: null,
    },
    terreno: { tin: { ativo: false, arestas: 0, pontos: 0 }, curvasNivel: { ativo: false, quantidade: 0 } },
    elevationPointCount: 2,
    loteamento: {
      projeto: { nome: "Loteamento X", unidade: "m / m²", sistemaCoordenadas: "EPSG:31982" },
      quadras: [{ id: "G", area: 5760, quantidadeLotes: 18, areaMedia: 320 }],
      lotes,
      ruas: [{ id: "r1", nome: "Rua A", area: 400 }],
      areasInstitucionais: [{ id: "i1", nome: "Escola", area: 800 }],
      areasVerdes: [{ id: "v1", nome: "Praça", area: 600 }],
      remanescenteM2: 120,
    },
  };
}

function openaiPayload(toolCalls: Array<{ name: string; args: Record<string, unknown> }>, content = "") {
  const output = toolCalls.map((tc, i) => ({
    type: "function_call",
    id: `fc_${i}`,
    call_id: `call_${i}`,
    name: tc.name,
    arguments: JSON.stringify(tc.args),
    status: "completed",
  }));
  return {
    id: "resp_cost",
    object: "response",
    created_at: 0,
    status: "completed",
    model: "gpt-4o-mini",
    output,
    output_text: content,
    error: null,
  };
}

async function readFetchBody(input: RequestInfo | URL, init?: RequestInit): Promise<string> {
  if (typeof init?.body === "string") return init.body;
  if (init?.body instanceof Uint8Array) return new TextDecoder().decode(init.body);
  if (typeof input === "object" && input && "clone" in input) {
    try {
      return await (input as Request).clone().text();
    } catch {
      return "";
    }
  }
  return String(init?.body ?? "");
}

function mockOpenAiCapture() {
  const captured: string[] = [];
  process.env.OPENAI_API_KEY = "sk-test-cost-router";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push(await readFetchBody(input, init));
    return new Response(
      JSON.stringify(
        openaiPayload([
          {
            name: "ajustar_lote",
            args: { lote: "01", area_alvo_m2: 360, preservar_ruas: true },
          },
        ]),
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  return captured;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.OPENAI_API_KEY = originalKey;
  console.info = originalInfo;
  console.error = originalError;
  resetCadAiCostMetrics();
  resetCadConversationState();
  resetCadContextCache();
});

describe("cadCommandRouter — comandos locais", () => {
  const context = loteamentoContext();

  it("consultas e UI simples ficam locais", () => {
    const cases = [
      ["qual a área do lote 01?", "consultar_lote"],
      ["selecionar lote 01", "selecionar"],
      ["desfazer", "desfazer_alteracao"],
      ["quantos lotes existem?", "consultar_lotes"],
      ["qual a área da quadra G?", "consultar_quadra"],
      ["qual lote está selecionado?", "consultar_projeto"],
      ["mostrar lote 01", "zoom_objeto"],
      ["mostrar área", "medir_area"],
      ["aplicar", "aplicar_alteracao"],
    ] as const;
    for (const [phrase, acao] of cases) {
      const decision = cadCommandRouter(phrase, context);
      assert.equal(decision.route, "local", phrase);
      assert.equal(decision.commands[0]?.acao, acao, phrase);
    }
  });

  it("alterar lote 01 para 500m² é local de alta confiança", () => {
    const decision = cadCommandRouter("alterar lote 01 para 500m²", context);
    assert.equal(decision.route, "local");
    assert.equal(decision.commands[0]?.acao, "ajustar_lote");
    assert.equal(decision.commands[0]?.area_alvo_m2, 500);
  });

  it("frases novas/complexas vão à OpenAI", () => {
    for (const phrase of [
      "quero aumentar um pouco o lote 01 sem mexer na rua",
      "complete essa quadra aproveitando a área e mantendo acesso às ruas",
      "deixa esse lote um pouco maior",
    ]) {
      const decision = cadCommandRouter(phrase, context);
      assert.equal(decision.route, "openai", phrase);
    }
  });
});

describe("contexto mínimo", () => {
  it("não inclui geometria bruta", () => {
    const context = loteamentoContext();
    const compact = compactCadContext(context, "alterar lote 01 para 500m²");
    assert.equal(compact.level, 1);
    assert.equal(compact.geometrySent, false);
    assert.equal(contextContainsGeometry(compact.payload), false);
    assert.ok(!("points" in compact.payload));
    assert.ok(!JSON.stringify(compact.payload).includes("500000"));
  });

  it("nível 0 não manda dados do CAD", () => {
    const compact = compactCadContext(loteamentoContext(), "olá");
    assert.equal(compact.level, 0);
    assert.deepEqual(compact.payload, { level: 0 });
  });

  it("nível 2 resume a quadra sem vértices", () => {
    const minimal = buildMinimalCadContext(loteamentoContext(), "ajustar os lotes da quadra G para 300m²", 2);
    assert.equal(minimal.quadraAtual, "G");
    assert.equal((minimal.resumo?.quantidadeLotes as number) > 0, true);
    assert.equal(contextContainsGeometry(minimal), false);
  });

  it("detectCadContextLevel cobre 0–3", () => {
    assert.equal(detectCadContextLevel("o que você consegue fazer?"), 0);
    assert.equal(detectCadContextLevel("alterar lote 01 para 500m²"), 1);
    assert.equal(detectCadContextLevel("ajustar os lotes da quadra G para 300m²"), 2);
    assert.equal(detectCadContextLevel("reprojetar o loteamento"), 3);
  });
});

describe("interpretAssistenteIaCommand — custo", () => {
  it("suite pedida: local vs OpenAI, tamanho e logs sem chave", async () => {
    const logs: string[] = [];
    console.info = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };

    const context = loteamentoContext();
    const captured = mockOpenAiCapture();

    const localPhrases = [
      "qual a área do lote 01?",
      "selecionar lote 01",
      "desfazer",
      "alterar lote 01 para 500m²",
      "quantos lotes existem?",
      "qual a área da quadra G?",
      "qual lote está selecionado?",
      "olá",
      "reprojete o loteamento mantendo as áreas verdes",
    ];
    const openaiPhrases = [
      "quero aumentar um pouco o lote 01 sem mexer na rua",
      "complete essa quadra aproveitando a área e mantendo acesso às ruas",
    ];

    const localResults = [];
    for (const command of localPhrases) {
      const result = await interpretAssistenteIaCommand({
        command,
        context,
        conversationId: "cost-test",
      });
      assert.equal(result.source, "local", command);
      assert.equal(result.openaiCalled, false, command);
      localResults.push(result);
    }

    const openaiResults = [];
    const sizes: number[] = [];
    for (const command of openaiPhrases) {
      const result = await interpretAssistenteIaCommand({
        command,
        context,
        conversationId: "cost-test",
      });
      assert.equal(result.source, "openai", command);
      assert.equal(result.openaiCalled, true, command);
      assert.ok((result.contextSize ?? 0) > 0, command);
      sizes.push(result.contextSize ?? 0);
      openaiResults.push(result);
    }

    const follow = await interpretAssistenteIaCommand({
      command: "mas preserve as ruas.",
      context,
      conversationId: "cost-test",
    });
    assert.equal(follow.source, "openai");
    assert.ok((follow.contextSize ?? 0) <= (openaiResults[0]?.contextSize ?? 0));

    const metrics = getCadAiCostMetrics();
    assert.equal(metrics.localRequests, localPhrases.length);
    assert.equal(metrics.openAIRequests, openaiPhrases.length + 1);
    assert.equal(metrics.lastGeometrySent, false);

    for (const body of captured) {
      const parsed = safeJson(body) as { input?: unknown; instructions?: string };
      const userPayload = parsed.input ?? body;
      assert.equal(contextContainsGeometry(userPayload), false, "geometria no input OpenAI");
      assert.doesNotMatch(JSON.stringify(userPayload), /500000|7100000|"vertices"|FeatureCollection/);
      assert.doesNotMatch(body, /sk-test-cost-router/);
      assert.doesNotMatch(parsed.instructions ?? "", /sk-/);
    }

    const joined = logs.join("\n");
    assert.match(joined, /route: local/);
    assert.match(joined, /route: openai/);
    assert.match(joined, /contextLevel:/);
    assert.match(joined, /contextSize:/);
    assert.doesNotMatch(joined, /sk-[a-zA-Z0-9]{8,}/);
    assert.doesNotMatch(joined, /OPENAI_API_KEY\s*=/);

    const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    assert.ok(avg < 4000, `contexto médio grande demais: ${avg}`);
    assert.ok(localResults[0]?.resposta?.includes("320"), localResults[0]?.resposta);
    assert.equal(openaiResults[0]?.commands[0]?.acao, "ajustar_lote");
  });
});

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
