import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeCadAiCommand } from "./ai-command-executor";
import { applyReservaLegalToProject, AREA_RESERVA_LEGAL_LAYER_ID, AREA_UTIL_LAYER_ID } from "./loteamento-tools";
import { pointInPolygon } from "./polygon-utils";
import type { CadPolylineEntity, CadProject } from "./types";

/**
 * O CAD refaz os lotes sozinho quando a área verde ou a área de utilidade pública é definida,
 * movida ou excluída: chama de novo gerar_loteamento com area_util_automatica = false.
 * Aqui conferimos que essa regeneração respeita a posição nova das duas áreas.
 */
const ox = 625000;
const oy = 775500;
function glebaProject(): CadProject {
  const gleba: CadPolylineEntity = {
    id: "gleba",
    type: "polyline",
    layerId: "0",
    closed: true,
    name: "Gleba",
    vertices: [
      [0, 0],
      [300, 0],
      [300, 200],
      [0, 200],
    ].map(([x, y]) => ({ x: ox + x, y: oy + y, z: 0 })),
  };
  return {
    name: "teste",
    crs: "EPSG:31982",
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [gleba],
  } as CadProject;
}
const gerar = (project: CadProject, extra: Record<string, unknown> = {}) =>
  executeCadAiCommand(
    project,
    {
      acao: "gerar_loteamento",
      entidade_id: "gleba",
      largura_via_m: 12,
      profundidade_quadra_m: 25,
      testada_minima_m: 12,
      area_minima_quadra_m2: 2000,
      largura_calcada_m: 2,
      ruas_contorno: "indicadas",
      ...extra,
    } as never,
    { selectedId: "gleba" },
  );
const lotes = (p: CadProject) =>
  p.entities.filter((e) => e.layerId === "loteamento_lotes" && e.type === "polyline") as CadPolylineEntity[];
const centro = (vs: { x: number; y: number }[]) => ({
  x: vs.reduce((s, v) => s + v.x, 0) / vs.length,
  y: vs.reduce((s, v) => s + v.y, 0) / vs.length,
});
const mover = (p: CadProject, layerId: string, dx: number, dy: number): CadProject => ({
  ...p,
  entities: p.entities.map((e) =>
    e.type === "polyline" && e.layerId === layerId
      ? { ...e, vertices: e.vertices.map((v) => ({ ...v, x: v.x + dx, y: v.y + dy })) }
      : e,
  ),
});
const lotesDentro = (p: CadProject, area: CadPolylineEntity) =>
  lotes(p).filter((l) => {
    const c = centro(l.vertices);
    return pointInPolygon(c.x, c.y, area.vertices);
  }).length;

describe("atualização automática dos lotes ao mexer nas áreas", () => {
  it("área de utilidade pública movida: fica no lugar novo e os lotes se refazem em volta", () => {
    const r1 = gerar(glebaProject(), { area_util_automatica: true, percentual_area_util: 35, canto_area_util: "superior_direita" });
    assert.equal(r1.ok, true, r1.ok ? "" : r1.message);
    const movido = mover(r1.project, AREA_UTIL_LAYER_ID, -150, -100);
    const utilMovida = movido.entities.find((e) => e.layerId === AREA_UTIL_LAYER_ID) as CadPolylineEntity;
    const r2 = gerar(movido, { area_util_automatica: false, percentual_area_util: 35 });
    assert.equal(r2.ok, true, r2.ok ? "" : r2.message);
    const util = r2.project.entities.find((e) => e.layerId === AREA_UTIL_LAYER_ID) as CadPolylineEntity;
    assert.ok(util, "a área de utilidade pública sumiu");
    assert.deepEqual(centro(util.vertices), centro(utilMovida.vertices), "a área voltou para o canto antigo");
    assert.equal(lotesDentro(r2.project, util), 0, "ficou lote dentro da área de utilidade pública");
    assert.ok(lotes(r2.project).length > 0);
    // onde a área estava antes (canto superior direito) agora há lotes
    const antigo = { x: ox + 250, y: oy + 170 };
    const temLoteNoAntigo = lotes(r2.project).some((l) => pointInPolygon(antigo.x, antigo.y, l.vertices));
    const temViaNoAntigo = r2.project.entities.some(
      (e) => e.type === "polyline" && e.layerId === "loteamento_vias" && pointInPolygon(antigo.x, antigo.y, e.vertices),
    );
    assert.ok(temLoteNoAntigo || temViaNoAntigo, "o espaço liberado não foi loteado");
  });

  it("área verde definida e depois movida: os lotes saem de baixo dela e voltam para onde ela estava", () => {
    const r1 = gerar(glebaProject());
    assert.equal(r1.ok, true, r1.ok ? "" : r1.message);
    const comVerde = applyReservaLegalToProject(r1.project, { glebaId: "gleba", percent: 10, canto: "inferior_esquerda" }).project;
    const r2 = gerar(comVerde, { area_util_automatica: false });
    assert.equal(r2.ok, true, r2.ok ? "" : r2.message);
    const verde1 = r2.project.entities.find((e) => e.layerId === AREA_RESERVA_LEGAL_LAYER_ID) as CadPolylineEntity;
    assert.ok(verde1, "área verde sumiu na regeneração");
    assert.equal(lotesDentro(r2.project, verde1), 0, "lote dentro da área verde");

    const movido = mover(r2.project, AREA_RESERVA_LEGAL_LAYER_ID, 180, 0);
    const r3 = gerar(movido, { area_util_automatica: false });
    assert.equal(r3.ok, true, r3.ok ? "" : r3.message);
    const verde2 = r3.project.entities.find((e) => e.layerId === AREA_RESERVA_LEGAL_LAYER_ID) as CadPolylineEntity;
    assert.equal(lotesDentro(r3.project, verde2), 0, "lote dentro da área verde movida");
    const c1 = centro(verde1.vertices);
    const ocupado =
      lotes(r3.project).some((l) => pointInPolygon(c1.x, c1.y, l.vertices)) ||
      r3.project.entities.some(
        (e) => e.type === "polyline" && e.layerId === "loteamento_vias" && pointInPolygon(c1.x, c1.y, e.vertices),
      );
    assert.ok(ocupado, "o lugar antigo da área verde ficou vazio");
  });
});
