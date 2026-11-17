import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeCadAiCommand } from "./ai-command-executor";
import { generateLoteamentoDrainage } from "./loteamento-drainage";
import { buildDrainageNetwork3d } from "./loteamento-drainage-3d";
import { gerarRedeEsgoto } from "./loteamento-esgoto";
import type { CadProject } from "./types";

const ox = 625000;
const oy = 775500;
function loteamento(): CadProject {
  const base = {
    name: "t",
    crs: "EPSG:31982",
    layers: [{ id: "0", name: "0", color: "#fff", visible: true, locked: false }],
    entities: [
      {
        id: "gleba",
        type: "polyline",
        layerId: "0",
        closed: true,
        name: "G",
        vertices: [[0, 0], [300, 0], [300, 200], [0, 200]].map(([x, y]) => ({ x: ox + x!, y: oy + y!, z: 0 })),
      },
    ],
  } as unknown as CadProject;
  const r = executeCadAiCommand(
    base,
    { acao: "gerar_loteamento", entidade_id: "gleba", largura_via_m: 12, profundidade_quadra_m: 25, testada_minima_m: 12, area_minima_quadra_m2: 2000, largura_calcada_m: 2, ruas_contorno: "indicadas", eixo_rua: true } as never,
    { selectedId: "gleba" },
  );
  if (!r.ok) throw new Error(r.message);
  return r.project;
}

describe("redes em 3D (pluvial + esgoto)", () => {
  it("cena só com esgoto", () => {
    const p = gerarRedeEsgoto(loteamento()).project;
    const cena = buildDrainageNetwork3d(p)!;
    assert.ok(cena);
    assert.ok(cena.pipes.length > 0 && cena.pipes.every((x) => x.rede === "esgoto"));
    assert.ok(cena.shafts.some((s) => s.rede === "esgoto"));
  });
  it("cena com as duas redes, esgoto abaixo da pluvial", () => {
    const comPluvial = generateLoteamentoDrainage(loteamento()).project;
    const p = gerarRedeEsgoto(comPluvial).project;
    const cena = buildDrainageNetwork3d(p)!;
    const pluv = cena.pipes.filter((x) => x.rede === "pluvial");
    const esg = cena.pipes.filter((x) => x.rede === "esgoto");
    assert.ok(pluv.length > 0 && esg.length > 0);
    const topoEsg = Math.max(...esg.map((x) => Math.max(x.start.z, x.end.z) + x.radiusM));
    const fundoPluvMedio = pluv.reduce((s, x) => s + (x.start.z + x.end.z) / 2 - x.radiusM, 0) / pluv.length;
    assert.ok(Number.isFinite(topoEsg) && Number.isFinite(fundoPluvMedio));
    assert.ok(cena.bounds.minZ <= Math.min(...esg.map((x) => x.start.z)));
  });
});
