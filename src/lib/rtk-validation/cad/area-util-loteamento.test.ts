import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeCadAiCommand } from "./ai-command-executor";
import {
  AREA_REMANESCENTE_LAYER_ID,
  AREA_UTIL_LAYER_ID,
  definirAreaUtilParaLotear,
  isLoteamentoGeradoLayer,
  removerAreaUtil,
  resetLoteamento,
} from "./loteamento-tools";
import { pointInPolygon } from "./polygon-utils";
import type { CadPolylineEntity, CadProject } from "./types";

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
const gerar = (project: CadProject) =>
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
    },
    { selectedId: "gleba" },
  );

describe("área útil e reset do loteamento", () => {
  it("cria área útil com % e canto, sem precisar de área verde", () => {
    const r = definirAreaUtilParaLotear(glebaProject(), { glebaId: "gleba", percent: 50, canto: "superior_direita" });
    assert.ok(Math.abs(r.areaM2 - 30000) < 300, `área útil ${r.areaM2.toFixed(0)} m²`);
    const c = r.utilRings[0].vertices;
    const cx = c.reduce((s, v) => s + v.x, 0) / c.length - ox;
    const cy = c.reduce((s, v) => s + v.y, 0) / c.length - oy;
    assert.ok(cx > 150 || cy > 100, "área útil fora do canto superior direito");
  });

  it("gera ruas e lotes só dentro da área útil; o resto vira remanescente", () => {
    const util = definirAreaUtilParaLotear(glebaProject(), { glebaId: "gleba", percent: 50, canto: "superior_direita" });
    const res = gerar(util.project);
    assert.equal(res.ok, true, res.ok ? "" : res.message);
    const p = res.project;
    const utilPoly = p.entities.find((e) => e.layerId === AREA_UTIL_LAYER_ID) as CadPolylineEntity;
    assert.ok(utilPoly, "área útil sumiu depois de gerar");
    const lotes = p.entities.filter((e) => e.layerId === "loteamento_lotes" && e.type === "polyline") as CadPolylineEntity[];
    assert.ok(lotes.length > 10, `poucos lotes: ${lotes.length}`);
    for (const lote of lotes) {
      const cx = lote.vertices.reduce((s, v) => s + v.x, 0) / lote.vertices.length;
      const cy = lote.vertices.reduce((s, v) => s + v.y, 0) / lote.vertices.length;
      assert.ok(pointInPolygon(cx, cy, utilPoly.vertices), `lote ${lote.name} fora da área útil`);
    }
    assert.ok(p.entities.some((e) => e.layerId === AREA_REMANESCENTE_LAYER_ID), "sem remanescente fora da área útil");
  });

  it("reset apaga o loteamento e mantém gleba e área útil; dá para gerar de novo", () => {
    const util = definirAreaUtilParaLotear(glebaProject(), { glebaId: "gleba", percent: 50, canto: "inferior_esquerda" });
    const gerado = gerar(util.project);
    assert.equal(gerado.ok, true);
    const reset = resetLoteamento(gerado.project);
    assert.ok(reset.removed > 0);
    assert.equal(reset.project.entities.some((e) => isLoteamentoGeradoLayer(e.layerId)), false, "sobrou loteamento");
    assert.ok(reset.project.entities.some((e) => e.id === "gleba"), "gleba apagada");
    assert.ok(reset.project.entities.some((e) => e.layerId === AREA_UTIL_LAYER_ID), "área útil apagada no reset");
    const de_novo = gerar(reset.project);
    assert.equal(de_novo.ok, true);
  });

  it("sem área útil volta a lotear a gleba inteira", () => {
    const util = definirAreaUtilParaLotear(glebaProject(), { glebaId: "gleba", percent: 40, canto: "superior_esquerda" });
    const sem = removerAreaUtil(util.project);
    assert.equal(sem.removed, true);
    const res = gerar(sem.project);
    assert.equal(res.ok, true);
    assert.equal(res.project.entities.some((e) => e.layerId === AREA_REMANESCENTE_LAYER_ID), false);
  });
});
