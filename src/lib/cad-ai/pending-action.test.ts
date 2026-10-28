import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ajustarLote, executeRedistributionPending } from "./execute";
import { cadCommandRouter } from "./command-router";
import { resetCadConversationState, upsertCadConversationState } from "./conversation-state";
import { interpretAssistenteIaCommand } from "@/lib/rtk-validation/cad/openai-assistant.service";
import { rebuildQuadraLotes } from "@/lib/rtk-validation/cad/lot-subdivision";
import type { CadAiProjectContext } from "@/lib/rtk-validation/cad/ai-command-types";
import type { CadPolylineEntity, CadProject } from "@/lib/rtk-validation/cad/types";
import {
  createRedistributionPending,
  isAffirmativeResponse,
  isNegativeResponse,
  resolvePendingUserMessage,
  type CadPendingModify,
} from "./pending-action";

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
    points: [],
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
      quadras: [{ id: "A", area: 4000, quantidadeLotes: 8, areaMedia: 300 }],
      lotes: [{ id: "A-01", quadra: "A", area: 250, testada: 10, profundidade: 25 }],
      ruas: [],
      areasInstitucionais: [],
      areasVerdes: [],
      remanescenteM2: 0,
    },
  };
}

function ringPoly(id: string, layerId: string, ring: [number, number][], name: string): CadPolylineEntity {
  return {
    id,
    type: "polyline",
    layerId,
    closed: true,
    name,
    vertices: ring.map(([x, y]) => ({ x, y, z: 0 })),
  };
}

function sampleProject(): CadProject {
  const quadraA: [number, number][] = [
    [0, 0],
    [80, 0],
    [80, 50],
    [0, 50],
  ];
  const streets: [number, number][][] = [
    [
      [-4, -12],
      [84, -12],
      [84, 0],
      [-4, 0],
    ],
  ];
  const lotsA = rebuildQuadraLotes(quadraA, 10, 25, streets, undefined, "Quadra A");
  return {
    name: "Loteamento teste",
    crs: "EPSG:31982",
    layers: [
      { id: "loteamento_lotes", name: "LOTES", color: "#d97706", visible: true, locked: false },
      { id: "loteamento_vias", name: "VIAS", color: "#64748b", visible: true, locked: false },
      { id: "loteamento_quadras", name: "QUADRAS", color: "#b45309", visible: true, locked: false },
    ],
    entities: [
      ringPoly("via_1", "loteamento_vias", streets[0], "Via 1"),
      ringPoly("qa", "loteamento_quadras", quadraA, "Quadra A"),
      ...lotsA.map((lote, i) =>
        ringPoly(
          `a_${i}`,
          "loteamento_lotes",
          (lote.coordinates[0] ?? []) as [number, number][],
          `${lote.quadra} — ${String(i + 1).padStart(2, "0")}`,
        ),
      ),
    ],
  };
}

const pending = () =>
  createRedistributionPending({
    originalCommand: "alterar lote 01 para 550m²",
    targetLot: "A-01",
    targetArea: 550,
  });

afterEach(() => {
  resetCadConversationState();
});

describe("respostas de confirmação", () => {
  it("reconhece afirmações", () => {
    for (const phrase of [
      "sim",
      "Sim",
      "SIM",
      "sim, pode",
      "pode",
      "pode fazer",
      "autorizo",
      "confirmo",
      "pode redistribuir",
      "pode ajustar",
      "ok",
      "confirmado",
    ]) {
      assert.equal(isAffirmativeResponse(phrase), true, phrase);
    }
  });

  it("reconhece negativas", () => {
    for (const phrase of ["não", "Não", "não pode", "cancela", "cancelar", "não quero", "deixa como está", "não autorizar", "não quero, deixa como está"]) {
      assert.equal(isNegativeResponse(phrase), true, phrase);
    }
  });
});

describe("contexto conversacional — pendingAction", () => {
  it("TESTE 1: sim executa a redistribuição pendente e não diz que não há alteração", async () => {
    const action = pending();
    const resolution = resolvePendingUserMessage("sim", action);
    assert.equal(resolution.kind, "confirm");
    const state = upsertCadConversationState("pend-1", { pendingAction: action });
    const routed = cadCommandRouter("sim", context(), undefined, state);
    assert.equal(routed.reason, "pending-confirm");
    assert.equal(routed.applyImmediately, true);
    assert.equal(routed.commands[0]?.acao, "ajustar_lote");
    assert.equal(routed.commands[0]?.scope, "local_redistribution");
    assert.match(routed.resposta ?? "", /redistribuir/i);
    assert.doesNotMatch(routed.resposta ?? "", /n[aã]o h[aá] altera/i);

    const result = await interpretAssistenteIaCommand({
      command: "sim",
      context: context(),
      conversationId: "pend-1",
      pendingAction: action,
    });
    assert.equal(result.openaiCalled, false);
    assert.equal(result.applyImmediately, true);
    assert.equal(result.commands[0]?.acao, "ajustar_lote");
    assert.doesNotMatch(result.resposta ?? "", /n[aã]o h[aá] altera/i);
  });

  it("TESTE 2: não cancela sem alterar geometria", async () => {
    const action = pending();
    const project = sampleProject();
    const before = JSON.stringify(project.entities);
    const resolution = resolvePendingUserMessage("não", action);
    assert.equal(resolution.kind, "cancel");
    const result = await interpretAssistenteIaCommand({
      command: "não",
      context: context(),
      conversationId: "pend-2",
      pendingAction: action,
    });
    assert.equal(result.openaiCalled, false);
    assert.equal(result.commands.length, 0);
    assert.match(result.resposta ?? "", /cancelada/i);
    assert.equal(JSON.stringify(project.entities), before);
  });

  it("TESTE 3: pode redistribuir executa a pendente", () => {
    const resolution = resolvePendingUserMessage("pode redistribuir", pending());
    assert.equal(resolution.kind, "confirm");
    const routed = cadCommandRouter(
      "pode redistribuir",
      context(),
      undefined,
      upsertCadConversationState("pend-3", { pendingAction: pending() }),
    );
    assert.equal(routed.reason, "pending-confirm");
    assert.equal(routed.commands[0]?.applyImmediately, true);
  });

  it("TESTE 4: não quero, deixa como está cancela", () => {
    const resolution = resolvePendingUserMessage("não quero, deixa como está", pending());
    assert.equal(resolution.kind, "cancel");
  });

  it("TESTE 5: renomear as quadras não executa a pendente", async () => {
    const action = pending();
    const resolution = resolvePendingUserMessage("renomear as quadras", action);
    assert.equal(resolution.kind, "topic_switch");
    if (resolution.kind !== "topic_switch") return;
    assert.equal(resolution.incomingCommand, "renomear as quadras");
    const result = await interpretAssistenteIaCommand({
      command: "renomear as quadras",
      context: context(),
      conversationId: "pend-5",
      pendingAction: action,
    });
    assert.equal(result.openaiCalled, false);
    assert.equal(result.commands.length, 0);
    assert.equal(result.pendingAction?.type, "confirm_topic_switch");
    assert.match(result.resposta ?? "", /altera[cç][aã]o pendente/i);
    assert.doesNotMatch(result.resposta ?? "", /vou ajustar somente/i);
  });

  it("sim sem pendingAction não inventa redistribuição", () => {
    const routed = cadCommandRouter("sim", context());
    assert.equal(routed.reason, "apply");
    assert.equal(routed.commands[0]?.acao, "aplicar_alteracao");
  });

  it("pending_modify completa com follow-up de distância", () => {
    const pendingModify: CadPendingModify = {
      type: "pending_modify",
      status: "pending",
      action: "mover",
      originalCommand: "mova o lote 01",
      lote: "01",
      collected: { acao: "mover", lote: "01" },
      missing: ["distancia", "angulo"],
      createdAt: new Date().toISOString(),
    };
    const incomplete = resolvePendingUserMessage("10 metros", pendingModify);
    assert.equal(incomplete.kind, "update_modify");
    const done = resolvePendingUserMessage("agora 5 metros para direita", pendingModify);
    assert.equal(done.kind, "complete_modify");
    if (done.kind === "complete_modify") {
      assert.equal(done.command.acao, "mover");
      assert.equal(done.command.lote, "01");
      assert.equal(done.command.distancia, 5);
      assert.equal(done.command.angulo, 90);
    }
    const routed = cadCommandRouter(
      "agora 5 metros para direita",
      context(),
      undefined,
      upsertCadConversationState("pend-mod", { pendingAction: pendingModify }),
    );
    assert.equal(routed.reason, "pending-modify-complete");
    assert.equal(routed.commands[0]?.acao, "mover");
    assert.equal(routed.applyImmediately, undefined);
  });
});

describe("execução da redistribuição pendente", () => {
  it("criar pending no ajuste impossível e executar ao confirmar", () => {
    const project = sampleProject();
    const isolated = ajustarLote(project, "01", 550);
    if (isolated.ok) {
      assert.ok(isolated.ok);
      return;
    }
    assert.ok(isolated.pendingAction);
    assert.equal(isolated.pendingAction?.type, "confirm_redistribution");
    assert.equal(isolated.project, project);
    const executed = executeRedistributionPending(project, isolated.pendingAction!, null);
    assert.equal(executed.ok, true, executed.message);
    assert.notEqual(executed.project, project);
    assert.match(executed.message, /redistribu/i);
    assert.doesNotMatch(executed.message, /n[aã]o h[aá] altera/i);
  });
});
