import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseLocalCadCommand, parseLocalCadCommandChain } from "@/lib/rtk-validation/cad/local-command-parser";
import { applyLoteamentoLotSize } from "@/lib/rtk-validation/cad/loteamento-tools";
import { rebuildQuadraLotes } from "@/lib/rtk-validation/cad/lot-subdivision";
import type { CadPolylineEntity, CadProject } from "@/lib/rtk-validation/cad/types";
import { buildCadContext } from "./context";
import { consultarQuadra, consultarLotes, otimizarQuadra } from "./execute";
import type { CadAiProjectContext } from "@/lib/rtk-validation/cad/ai-command-types";
import { parseLoteamentoAssistantCommand } from "./parse";
import { formatQuadraId, normalizeLotNumero, resolveLotRef, resolveQuadraRef } from "./resolve";
import { requiresConfirmation } from "./tools";
import { formatValidacao, validarLoteamento } from "./validate";

function ringPoly(
  id: string,
  layerId: string,
  ring: [number, number][],
  name: string,
): CadPolylineEntity {
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
  const quadraG: [number, number][] = [
    [0, 0],
    [80, 0],
    [80, 50],
    [0, 50],
  ];
  const quadraH: [number, number][] = [
    [200, 0],
    [280, 0],
    [280, 50],
    [200, 50],
  ];
  const streets: [number, number][][] = [
    [
      [-4, -12],
      [84, -12],
      [84, 0],
      [-4, 0],
    ],
  ];
  const lotsG = rebuildQuadraLotes(quadraG, 10, 25, streets, undefined, "Quadra G");
  const lotsH = rebuildQuadraLotes(quadraH, 10, 25, streets, undefined, "Quadra H");
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
      ringPoly("qg", "loteamento_quadras", quadraG, "Quadra G"),
      ringPoly("qh", "loteamento_quadras", quadraH, "Quadra H"),
      ...lotsG.map((lote, i) =>
        ringPoly(`g_${i}`, "loteamento_lotes", (lote.coordinates[0] ?? []) as [number, number][], `${lote.quadra} — ${lote.numero}`),
      ),
      ...lotsH.map((lote, i) =>
        ringPoly(`h_${i}`, "loteamento_lotes", (lote.coordinates[0] ?? []) as [number, number][], `${lote.quadra} — ${lote.numero}`),
      ),
    ],
  };
}

describe("parseLoteamentoAssistantCommand", () => {
  it("TESTE 1 — área da quadra G → consultar_quadra", () => {
    const cmds = parseLoteamentoAssistantCommand("Qual a área da quadra G?");
    assert.equal(cmds?.[0]?.acao, "consultar_quadra");
    assert.equal(cmds?.[0]?.quadra, "G");
  });

  it("TESTE 2 — quantos lotes na H → consultar_quadra", () => {
    const cmds = parseLoteamentoAssistantCommand("Quantos lotes existem na quadra H?");
    assert.equal(cmds?.[0]?.acao, "consultar_quadra");
    assert.equal(cmds?.[0]?.quadra, "H");
  });

  it("TESTE 3 — lotes de 300 na G → otimizar_quadra", () => {
    const cmds = parseLoteamentoAssistantCommand("Na quadra G quero lotes de 300 m².");
    assert.equal(cmds?.[0]?.acao, "otimizar_quadra");
    assert.equal(cmds?.[0]?.quadra, "G");
    assert.equal(cmds?.[0]?.area_alvo_m2, 300);
    assert.equal(cmds?.[0]?.preservar_ruas, true);
    assert.ok(requiresConfirmation(cmds!.map((cmd) => cmd.acao)));
  });

  it("TESTE 4 — H 250 e H-01 350", () => {
    const cmds = parseLoteamentoAssistantCommand("Na H quero 250 m² e H-01 com 350.");
    assert.equal(cmds?.[0]?.acao, "otimizar_quadra");
    assert.equal(cmds?.[0]?.quadra, "H");
    assert.equal(cmds?.[0]?.area_alvo_m2, 250);
    assert.ok(cmds?.[0]?.excecoes?.some((item) => item.lote === "H-01" && item.area_alvo_m2 === 350));
  });

  it("TESTE 5 — lotes abaixo de 250 → consultar_lotes", () => {
    const cmds = parseLoteamentoAssistantCommand("Mostre os lotes abaixo de 250 m².");
    assert.equal(cmds?.[0]?.acao, "consultar_lotes");
    assert.equal(cmds?.[0]?.filtro_area_max_m2, 250);
    assert.equal(requiresConfirmation(cmds!.map((cmd) => cmd.acao)), false);
  });

  it("TESTE 6 — analise o loteamento → validar_loteamento", () => {
    const cmds = parseLoteamentoAssistantCommand("Analise o loteamento.");
    assert.equal(cmds?.[0]?.acao, "validar_loteamento");
  });

  it("TESTE 7 — desfaz → desfazer_alteracao", () => {
    const cmds = parseLoteamentoAssistantCommand("Desfaz.");
    assert.equal(cmds?.[0]?.acao, "desfazer_alteracao");
  });

  it("reprojetar todo o loteamento → otimizar_quadra", () => {
    for (const phrase of [
      "reprojetar loteamento",
      "reprojetar todo loteamento",
      "reporjetar todo loteamento",
      "refazer o loteamento",
    ]) {
      const cmds = parseLoteamentoAssistantCommand(phrase);
      assert.equal(cmds?.[0]?.acao, "otimizar_quadra", phrase);
      assert.equal(cmds?.[0]?.preservar_ruas, true, phrase);
    }
  });

  it("testada e profundidade sozinhas completam o reprojeto", () => {
    const withLots = {
      loteamento: {
        lotes: [{ id: "01", quadra: "G", area: 200, testada: 8, profundidade: 25 }],
      },
    } as CadAiProjectContext;
    const cmds = parseLoteamentoAssistantCommand(
      "testada de 10 metros, profundidade de 20",
      withLots,
      [{ role: "assistant", content: "Informe testada e profundidade (ou área em m²) maiores que zero." }],
    );
    assert.equal(cmds?.[0]?.acao, "otimizar_quadra");
    assert.equal(cmds?.[0]?.testada_minima_m, 10);
    assert.equal(cmds?.[0]?.profundidade_quadra_m, 20);
    assert.equal(cmds?.[0]?.area_alvo_m2, 200);
    assert.equal(cmds?.[0]?.preservar_ruas, true);
    assert.match(cmds?.[0]?.resposta ?? "", /Deseja aplicar/);
    assert.ok(requiresConfirmation(cmds!.map((cmd) => cmd.acao)));
  });

  it("10 por 20 após pedido de medidas → otimizar_quadra", () => {
    const cmds = parseLoteamentoAssistantCommand("10 por 20", undefined, [
      { role: "user", content: "reprojetar loteamento" },
      { role: "assistant", content: "Informe testada e profundidade (ou área em m²) maiores que zero." },
    ]);
    assert.equal(cmds?.[0]?.acao, "otimizar_quadra");
    assert.equal(cmds?.[0]?.testada_minima_m, 10);
    assert.equal(cmds?.[0]?.profundidade_quadra_m, 20);
  });

  it("testada e profundidade sem loteamento existente → gerar_loteamento", () => {
    const cmds = parseLoteamentoAssistantCommand("testada de 10 metros, profundidade de 20");
    assert.equal(cmds?.[0]?.acao, "gerar_loteamento");
    assert.equal(cmds?.[0]?.testada_minima_m, 10);
    assert.equal(cmds?.[0]?.profundidade_quadra_m, 20);
  });

  it("TESTE 8 — refaz somente a H", () => {
    const cmds = parseLoteamentoAssistantCommand("Refaz somente a quadra H.");
    assert.equal(cmds?.[0]?.acao, "otimizar_quadra");
    assert.equal(cmds?.[0]?.quadra, "H");
  });

  it("TESTE 9 — não mexa nas ruas", () => {
    const cmds = parseLoteamentoAssistantCommand("Não mexa nas ruas.");
    assert.equal(cmds?.[0]?.preservar_ruas, true);
  });

  it("TESTE 0 — alterar lote 01 para 500m² → ajustar_lote", () => {
    const cmds = parseLoteamentoAssistantCommand("alterar lote 01 para 500m²");
    assert.equal(cmds?.[0]?.acao, "ajustar_lote");
    assert.equal(cmds?.[0]?.lote, "01");
    assert.equal(cmds?.[0]?.area_alvo_m2, 500);
    assert.equal(cmds?.[0]?.scope, "single_lot");
    assert.match(cmds?.[0]?.resposta ?? "", /500/);
    assert.ok(requiresConfirmation(cmds!.map((cmd) => cmd.acao)));
  });

  it("ajustar os lotes para 250m² → otimizar_quadra sem OpenAI", () => {
    const cmds = parseLoteamentoAssistantCommand("ajustar os lotes para 250m²");
    assert.equal(cmds?.[0]?.acao, "otimizar_quadra");
    assert.equal(cmds?.[0]?.area_alvo_m2, 250);
    assert.equal(cmds?.[0]?.preservar_ruas, true);
    assert.match(cmds?.[0]?.resposta ?? "", /250/);
  });

  it("os demias com 250m² preserva o lote 01 do histórico", () => {
    const cmds = parseLoteamentoAssistantCommand("os demias com 250m²", undefined, [
      { role: "user", content: "alterar lote 01 para 500m²" },
      { role: "assistant", content: "Entendi. Vou ajustar o lote 01 para aproximadamente 500 m². Deseja aplicar?" },
    ]);
    assert.equal(cmds?.[0]?.acao, "otimizar_quadra");
    assert.equal(cmds?.[0]?.area_alvo_m2, 250);
    assert.ok(cmds?.[0]?.excecoes?.some((item) => item.lote === "01" && item.area_alvo_m2 === 500));
  });

  it("mudar area verde para 10% → reservar_area", () => {
    for (const phrase of ["mudar area verde para 10%", "mudar área verde para 10%", "área verde 10%"]) {
      const cmds = parseLoteamentoAssistantCommand(phrase);
      assert.equal(cmds?.[0]?.acao, "reservar_area", phrase);
      assert.equal(cmds?.[0]?.tipo, "reserva_legal", phrase);
      assert.equal(cmds?.[0]?.percentual, 10, phrase);
    }
  });

  it("TESTE 10 — elimine área remanescente", () => {
    const cmds = parseLoteamentoAssistantCommand("Elimine a área remanescente.");
    assert.ok(cmds?.some((cmd) => cmd.acao === "calcular_area_remanescente"));
    assert.ok(cmds?.some((cmd) => cmd.acao === "otimizar_quadra" && cmd.minimizar_remanescente));
  });

  it("entende variações linguísticas da mesma intenção", () => {
    const phrases = [
      "Quadra G com lotes de 300 m².",
      "Na G quero lotes de 300.",
      "Coloca aproximadamente 300 metros nos lotes da G.",
      "Redimensiona a quadra G para lotes próximos de 300 m².",
      "Quero os lotes da G em torno de 300 metros quadrados.",
    ];
    for (const phrase of phrases) {
      const cmds = parseLoteamentoAssistantCommand(phrase);
      assert.equal(cmds?.[0]?.acao, "otimizar_quadra", phrase);
      assert.equal(cmds?.[0]?.quadra, "G", phrase);
      assert.equal(cmds?.[0]?.area_alvo_m2, 300, phrase);
    }
  });

  it("compõe G 300, H 250 e exceções G-01/G-02", () => {
    const cmds = parseLoteamentoAssistantCommand(
      "Na quadra G quero lotes com 300 m², na quadra H lotes de 250 m². G-01 e G-02 com 350 m².",
    );
    assert.ok((cmds?.length ?? 0) >= 2);
    const g = cmds?.find((cmd) => cmd.quadra === "G");
    const h = cmds?.find((cmd) => cmd.quadra === "H");
    assert.equal(g?.area_alvo_m2, 300);
    assert.equal(h?.area_alvo_m2, 250);
    assert.ok(g?.excecoes?.some((item) => item.lote === "G-01" && item.area_alvo_m2 === 350));
    assert.ok(g?.excecoes?.some((item) => item.lote === "G-02" && item.area_alvo_m2 === 350));
  });
});

describe("local parser integration", () => {
  it("encaminha o comando de área da quadra sem OpenAI", () => {
    const cmd = parseLocalCadCommand("Qual a área da quadra G?");
    assert.equal(cmd?.acao, "consultar_quadra");
    assert.equal(cmd?.quadra, "G");
  });

  it("encaminha cadeia de remanescente", () => {
    const chain = parseLocalCadCommandChain("Elimine a área remanescente.");
    assert.ok(chain && chain.length >= 2);
  });

  it("interpreta medidas de follow-up sem OpenAI", () => {
    const cmd = parseLocalCadCommand(
      "testada de 10 metros, profundidade de 20",
      {
        loteamento: {
          lotes: [{ id: "01", quadra: "G", area: 200, testada: 8, profundidade: 25 }],
        },
      } as CadAiProjectContext,
    );
    assert.equal(cmd?.acao, "otimizar_quadra");
    assert.equal(cmd?.testada_minima_m, 10);
    assert.equal(cmd?.profundidade_quadra_m, 20);
  });
});

describe("buildCadContext / resolve", () => {
  it("monta contexto sem geometria bruta", () => {
    const ctx = buildCadContext(sampleProject());
    assert.ok(ctx.quadras.some((row) => row.id === "G"));
    assert.ok(ctx.lotes.length > 0);
    assert.equal("coordinates" in ctx.lotes[0], false);
  });

  it("resolve G e G-01", () => {
    const project = sampleProject();
    const quadra = resolveQuadraRef(project, "G");
    assert.ok(quadra);
    assert.equal(formatQuadraId(quadra!.name), "G");
    const first = ctxLot(project);
    assert.ok(first);
    const lot = resolveLotRef(project, first);
    assert.ok(lot);
    const byNumero = resolveLotRef(project, "01");
    assert.ok(byNumero);
    assert.equal(normalizeLotNumero(byNumero!.numero), "01");
  });
});

function ctxLot(project: CadProject): string {
  const ctx = buildCadContext(project);
  return ctx.lotes.find((lote) => lote.quadra === "G")?.id ?? "G-01";
}

describe("execute consult / optimize", () => {
  it("consulta a quadra G", () => {
    const result = consultarQuadra(sampleProject(), "G");
    assert.equal(result.ok, true);
    assert.match(result.message, /Quadra G/i);
    assert.match(result.message, /lote/i);
  });

  it("lista lotes abaixo de um limiar", () => {
    const result = consultarLotes(sampleProject(), { areaMax: 100000 });
    assert.ok((result.message.match(/lote/i) ?? []).length > 0);
  });

  it("otimiza a quadra com o motor existente e não inventa coordenadas", () => {
    const project = sampleProject();
    const viaBefore = project.entities.find((entity) => entity.id === "via_1");
    const result = otimizarQuadra(project, {
      quadra: "G",
      areaAlvo: 300,
      preservarRuas: true,
      minimizarRemanescente: true,
    });
    assert.equal(result.ok, true);
    const viaAfter = result.project.entities.find((entity) => entity.id === "via_1");
    assert.ok(viaBefore && viaAfter && viaBefore.type === "polyline" && viaAfter.type === "polyline");
    assert.deepEqual(viaAfter.vertices, viaBefore.vertices);
    assert.match(result.message, /Aplicar alteração/i);
  });

  it("applyLoteamentoLotSize continua sendo o motor da exceção", () => {
    const project = sampleProject();
    const lot = resolveLotRef(project, ctxLot(project));
    assert.ok(lot);
    const adjusted = applyLoteamentoLotSize(project, {
      entityId: lot!.entity.id,
      mode: "lote",
      areaM2: 350,
    });
    assert.ok(adjusted.lotCount > 0);
  });

  it("valida o loteamento sem inventar resultado", () => {
    const text = formatValidacao(validarLoteamento(sampleProject()));
    assert.match(text, /Análise concluída/);
  });
});
