import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyLoteamentoLotClassification,
  areaMinimaEsquina,
  classifyLot,
  classifyLotTipo,
  collectLotStreetFrontages,
  formatLoteEsquinaTooltip,
  lotEsquinaTooltipOf,
  resolveAreaMinimaInterno,
} from "./lot-corner-classification";
import type { CadPolylineEntity, CadProject } from "./types";

function rect(
  id: string,
  layerId: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  name?: string,
): CadPolylineEntity {
  return {
    id,
    type: "polyline",
    layerId,
    closed: true,
    name,
    vertices: [
      { x: x0, y: y0, z: 0 },
      { x: x1, y: y0, z: 0 },
      { x: x1, y: y1, z: 0 },
      { x: x0, y: y1, z: 0 },
    ],
  };
}

describe("área mínima de esquina", () => {
  it("areaMinima 250 + 20% = 300", () => {
    assert.equal(areaMinimaEsquina(250, 20), 300);
    assert.equal(areaMinimaEsquina(250), 300);
  });

  it("usa área mínima existente; senão testada × profundidade", () => {
    assert.equal(resolveAreaMinimaInterno({ areaMinimaM2: 250, testadaM: 10, profundidadeM: 50 }), 250);
    assert.equal(resolveAreaMinimaInterno({ testadaM: 10, profundidadeM: 25 }), 250);
    assert.equal(resolveAreaMinimaInterno({ areaMinimaM2: 0, testadaM: 12, profundidadeM: 20 }), 240);
  });
});

describe("classificação INTERNO / ESQUINA", () => {
  const southStreet = rect("via_s", "loteamento_vias", -4, -8, 84, 0, "RUA A");
  const westStreet = rect("via_w", "loteamento_vias", -8, -4, 0, 54, "RUA B");
  const midLot = rect("lote_mid", "loteamento_lotes", 20, 0, 30, 25, "Quadra A — 02");
  const cornerLot = rect("lote_c", "loteamento_lotes", 0, 0, 10, 25, "Quadra A — 01");

  it("uma frente em uma rua → INTERNO", () => {
    const frontages = collectLotStreetFrontages(midLot, [southStreet, westStreet]);
    assert.equal(frontages.length, 1);
    assert.equal(frontages[0]?.streetId, "via_s");
    assert.equal(classifyLotTipo(frontages), "INTERNO");
    const classified = classifyLot({
      lot: midLot,
      streets: [southStreet, westStreet],
      areaMinimaInterno: 250,
      percentualEsquina: 20,
    });
    assert.equal(classified.tipo, "INTERNO");
    assert.equal(classified.areaMinimaM2, 250);
    assert.equal(classified.areaM2, 250);
    assert.equal(classified.atende, true);
  });

  it("duas frentes em duas ruas distintas → ESQUINA", () => {
    const frontages = collectLotStreetFrontages(cornerLot, [southStreet, westStreet]);
    assert.equal(frontages.length, 2);
    assert.deepEqual(
      frontages.map((f) => f.streetId).sort(),
      ["via_s", "via_w"],
    );
    assert.equal(classifyLotTipo(frontages), "ESQUINA");
    const classified = classifyLot({
      lot: cornerLot,
      streets: [southStreet, westStreet],
      areaMinimaInterno: 250,
      percentualEsquina: 20,
    });
    assert.equal(classified.tipo, "ESQUINA");
    assert.equal(classified.areaMinimaM2, 300);
    assert.equal(classified.areaM2, 250);
    assert.equal(classified.atende, false);
  });

  it("duas arestas na mesma rua continuam INTERNO", () => {
    const longStreet = rect("via_s2", "loteamento_vias", -4, -8, 84, 0, "RUA A");
    const lot = rect("lote_one", "loteamento_lotes", 10, 0, 30, 25, "Quadra A — 03");
    const frontages = collectLotStreetFrontages(lot, [longStreet]);
    assert.equal(frontages.length, 1);
    assert.equal(classifyLotTipo(frontages), "INTERNO");
  });
});

describe("tooltip e passada no projeto", () => {
  it("tooltip de esquina: Lote 01 / Tipo / Área / Área mínima / Status", () => {
    const text = formatLoteEsquinaTooltip({
      name: "Quadra A — 01",
      areaM2: 312,
      areaMinimaM2: 300,
      atende: true,
    });
    assert.match(text, /Lote 01/);
    assert.match(text, /Tipo: ESQUINA/);
    assert.match(text, /Área: 312,00 m²/);
    assert.match(text, /Área mínima: 300,00 m²/);
    assert.match(text, /Status: ✓ ATENDE/);
  });

  it("grava lote.tipo sem alterar vértices", () => {
    const corner = rect("lote_c", "loteamento_lotes", 0, 0, 10, 25, "Quadra A — 01");
    const mid = rect("lote_m", "loteamento_lotes", 20, 0, 30, 25, "Quadra A — 02");
    const project: CadProject = {
      name: "Teste",
      crs: "EPSG:31982",
      layers: [],
      entities: [
        corner,
        mid,
        rect("via_s", "loteamento_vias", -4, -8, 84, 0, "RUA A"),
        rect("via_w", "loteamento_vias", -8, -4, 0, 54, "RUA B"),
      ],
    };
    const vertsBefore = corner.vertices.map((v) => ({ ...v }));
    const next = applyLoteamentoLotClassification(project, {
      areaMinimaInterno: 250,
      percentualEsquina: 20,
    });
    const c = next.entities.find((e) => e.id === "lote_c") as CadPolylineEntity;
    const m = next.entities.find((e) => e.id === "lote_m") as CadPolylineEntity;
    assert.equal(c.lote?.tipo, "ESQUINA");
    assert.equal(c.lote?.areaMinimaM2, 300);
    assert.equal(m.lote?.tipo, "INTERNO");
    assert.equal(m.lote?.areaMinimaM2, 250);
    assert.deepEqual(c.vertices, vertsBefore);
    const tip = lotEsquinaTooltipOf(c);
    assert.ok(tip);
    assert.match(tip, /Tipo: ESQUINA/);
    assert.equal(lotEsquinaTooltipOf(m), null);
  });
});
