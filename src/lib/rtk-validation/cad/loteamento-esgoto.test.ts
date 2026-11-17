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

describe("esgoto x pluvial", () => {
  it("o coletor de esgoto fica afastado do eixo e abaixo da pluvial", async () => {
    const { generateLoteamentoDrainage, listDrainagePipes } = await import("./loteamento-drainage");
    const base = loteamento();
    const comPluvial = generateLoteamentoDrainage(base).project;
    const r = gerarRedeEsgoto(comPluvial);
    const pluv = listDrainagePipes(comPluvial).filter((p) => p.drainage?.pipeRole !== "ramal");
    const esg = listEsgotoTrechos(r.project);
    // nenhum trecho de esgoto em cima de um coletor pluvial (meio do trecho a ≥ 1,5 m)
    for (const t of esg) {
      const a = t.vertices[0]!;
      const b = t.vertices[1]!;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      for (const p of pluv) {
        const c = p.vertices[0]!;
        const d = p.vertices[p.vertices.length - 1]!;
        const dx = d.x - c.x;
        const dy = d.y - c.y;
        const l2 = dx * dx + dy * dy;
        const u = Math.max(0, Math.min(1, ((mx - c.x) * dx + (my - c.y) * dy) / l2));
        const dist = Math.hypot(mx - (c.x + u * dx), my - (c.y + u * dy));
        assert.ok(dist >= 1.5, `${t.esgoto?.code} sobre a pluvial ${p.drainage?.code} (${dist.toFixed(2)} m)`);
        if (dist < 4) {
          const invPluv = c.z + (d.z - c.z) * u;
          const topoEsg = (a.z + b.z) / 2 + (t.esgoto!.diameterMm! / 1000);
          assert.ok(topoEsg <= invPluv - 0.15, `${t.esgoto?.code} acima da pluvial`);
        }
      }
    }
  });
});

describe("cota digitada no PV", () => {
  it("muda a CT de um PV, recalcula e mantém a cota nas próximas gerações", async () => {
    const { definirCotaPvEsgoto } = await import("./loteamento-esgoto");
    const r1 = gerarRedeEsgoto(loteamento());
    const pv = r1.project.entities.find((e) => e.type === "point" && e.esgoto?.kind === "pv")!;
    const r2 = definirCotaPvEsgoto(r1.project, pv.id, 12.34);
    const mesmo = r2.project.entities.find(
      (e) => e.type === "point" && e.esgoto && Math.hypot(e.x - (pv as { x: number }).x, e.y - (pv as { y: number }).y) < 0.01,
    );
    assert.equal(mesmo?.type === "point" ? mesmo.esgoto?.groundZ : null, 12.34);
    assert.equal(mesmo?.type === "point" ? mesmo.esgoto?.cotaManual : null, true);
    const r3 = gerarRedeEsgoto(r2.project);
    const denovo = r3.project.entities.find(
      (e) => e.type === "point" && e.esgoto && Math.hypot(e.x - (pv as { x: number }).x, e.y - (pv as { y: number }).y) < 0.01,
    );
    assert.equal(denovo?.type === "point" ? denovo.esgoto?.groundZ : null, 12.34);
  });
});
