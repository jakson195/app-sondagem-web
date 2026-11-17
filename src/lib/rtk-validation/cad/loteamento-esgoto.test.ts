import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeCadAiCommand } from "./ai-command-executor";
import { declividadeMinima, gerarRedeEsgoto, laminaParaVazao, listEsgotoTrechos, tensaoTrativaPa } from "./loteamento-esgoto";
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

describe("hidráulica do esgoto (NBR 9649)", () => {
  it("Imin = 0,0055·Qi^-0,47 e tubo DN150 com 1,5 L/s", () => {
    assert.ok(Math.abs(declividadeMinima(1.5) - 0.0045) < 0.0002);
    const s = laminaParaVazao(1.5, 150, 0.0045, 0.013)!;
    assert.ok(s.yOverD > 0.15 && s.yOverD < 0.4, `y/D=${s.yOverD}`);
    assert.ok(tensaoTrativaPa(s.rhM, 0.0045) >= 0.95, `σ=${tensaoTrativaPa(s.rhM, 0.0045)}`);
  });
  it("tubo cheio além de 0,938 não cabe", () => {
    assert.equal(laminaParaVazao(500, 150, 0.005, 0.013), null);
  });
});

describe("rede de esgoto do loteamento", () => {
  it("gera PVs, trechos e ligações, todos chegando ao lançamento e dentro da NBR", () => {
    const r = gerarRedeEsgoto(loteamento());
    const trechos = listEsgotoTrechos(r.project);
    assert.ok(r.pvs >= 4, r.message);
    assert.ok(trechos.length >= r.pvs - 1, r.message);
    assert.ok(r.ligacoes > 50, `ligações: ${r.ligacoes}`);
    for (const t of trechos) {
      const e = t.esgoto!;
      assert.ok(e.diameterMm! >= 150);
      assert.ok(e.slopePct! / 100 >= declividadeMinima(e.qiLps!) - 1e-9, `${e.code} i abaixo do mínimo`);
      assert.ok(e.yOverD! <= 0.75 + 1e-9, `${e.code} y/D=${e.yOverD}`);
      assert.ok(e.invertInZ! > e.invertOutZ!, `${e.code} sem caimento`);
      assert.ok(e.depthUpM! >= 0.9 + 0.15 - 1e-6, `${e.code} recobrimento`);
    }
    const total = trechos.reduce((s, t) => s + (t.esgoto!.lotes ?? 0), 0);
    assert.ok(total > 0);
    assert.ok(r.vazaoFinalLps > 1.5, r.message);
    console.log(r.message);
  });
});
