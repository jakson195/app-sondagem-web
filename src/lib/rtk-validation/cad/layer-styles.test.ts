import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyLoteamentoLotesGrassStyle,
  cadHatchPatternId,
  getLayerPolygonFill,
  normalizeCadLayer,
  resolveLayerHatchPattern,
} from "./layer-styles";
import type { CadLayer } from "./types";

describe("layer-styles lote grass", () => {
  it("aplica hachura de grama em loteamento_lotes mesmo com camada laranja antiga", () => {
    const raw: CadLayer = {
      id: "loteamento_lotes",
      name: "LOTEAMENTO_LOTES",
      color: "#d97706",
      fillColor: "#fbbf24",
      visible: true,
      locked: false,
    };
    const styled = applyLoteamentoLotesGrassStyle(raw);
    assert.equal(styled.hatchPattern, "grass");
    assert.equal(styled.fillColor, "#4ade80");
    assert.equal(styled.color, "#111827");
    assert.equal(styled.textColor, "#111827");
    assert.equal(styled.lineWidth, 1);
    assert.equal(styled.textSize, 22);
    assert.equal(resolveLayerHatchPattern(raw), "grass");
    assert.equal(getLayerPolygonFill(raw), `url(#${cadHatchPatternId("loteamento_lotes")})`);
    assert.equal(normalizeCadLayer(raw).hatchPattern, "grass");
  });
});
