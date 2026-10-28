import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeParcelAccess,
  formatLoteamentoAccessSummary,
  validateLotAccess,
  validateSubdivision,
} from "./lot-access";
import { generateSubdivision, lotHasRoadAccess } from "./lot-subdivision";
import { normalizeCadAiCommand } from "./ai-command-catalog";

const SQUARE_150: [number, number][] = [
  [0, 0],
  [150, 0],
  [150, 150],
  [0, 150],
];

describe("analyzeParcelAccess", () => {
  it("150×150 com lote 10×30 precisa de ruas internas", () => {
    const analysis = analyzeParcelAccess(SQUARE_150, [], {
      minFrontageM: 10,
      lotDepthM: 30,
      streetWidthM: 10,
      targetLotAreaM2: 300,
    });
    assert.ok(analysis.needsInternalStreets);
    assert.ok(analysis.proposedInternalStreetCount >= 1);
    assert.equal(analysis.targetLotAreaM2, 300);
  });
});

describe("validateSubdivision 150×150", () => {
  it("generateSubdivision + validateSubdivision → zero lotes sem acesso", () => {
    const result = generateSubdivision(SQUARE_150, {
      larguraViaM: 10,
      profundidadeQuadraM: 30,
      testadaMinimaM: 10,
      areaMinimaM2: 300,
      larguraQuadraM: 150,
      profundidadeBlocoM: 150,
      percentAreaUtil: 0,
    });
    const streets = result.vias.map((poly) => poly[0] ?? []);
    const validation = validateSubdivision(result.lotes, streets, 10);
    assert.equal(validation.invalidLotsCount, 0);
    assert.equal(validation.lotsWithoutRoadAccessCount, 0);
    assert.equal(validation.lotsWithoutFrontageCount, 0);
    assert.ok(result.lotes.length >= 1);
    for (const lote of result.lotes) {
      const info = validateLotAccess(lote, streets, 10);
      assert.equal(info.hasRoadAccess, true, info.lot);
      assert.ok(info.tipo !== "INTERNO", info.lot);
      assert.ok(lotHasRoadAccess(lote.coordinates[0] ?? [], streets, 10));
    }
    const summary = formatLoteamentoAccessSummary({
      widthM: 150,
      heightM: 150,
      lotCount: result.lotes.length,
      averageArea: result.report.averageArea,
      internalStreetCount: result.report.internalStreetCount,
      lotsWithoutRoadAccess: result.report.lotsWithoutRoadAccess,
      lotsWithoutFrontage: result.report.lotsWithoutFrontage,
      residualArea: result.report.residualArea,
    });
    assert.match(summary, /Loteamento gerado/);
    assert.match(summary, /Lotes sem acesso: 0/);
  });
});

describe("normalizeCadAiCommand loteamento 150×150", () => {
  it("infere profundidade, via, testada e quadra quadrada a partir de 300 m²", () => {
    const cmd = normalizeCadAiCommand({
      acao: "gerar_loteamento",
      area_alvo_m2: 300,
      largura_quadra_m: 150,
    });
    assert.equal(cmd.area_minima_m2, 300);
    assert.equal(cmd.testada_minima_m, 10);
    assert.equal(cmd.largura_via_m, 10);
    assert.equal(cmd.profundidade_quadra_m, 30);
    assert.equal(cmd.distancia_quadra_m, 150);
    assert.equal(cmd.allow_internal_roads, true);
    assert.equal(cmd.require_road_access, true);
  });
});
