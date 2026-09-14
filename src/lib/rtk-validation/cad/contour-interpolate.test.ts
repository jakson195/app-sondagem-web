import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONTOUR_INTERPOLATE_NEED_Z,
  extractImportedContourTerrain,
  generateInterpolatedContours,
  INTERPOLATED_CONTOUR_LAYER,
  linearIntermediatePolylines,
  parseElevationText,
} from "./contour-interpolate";
import { parseContourElevation } from "./contour";
import { buildTinTriangles, computeEarthworkVolume, interpolateTinZ, planeFromHorizontalZ } from "./earthwork";
import { computeLoteamentoCutFill } from "./loteamento-earthwork";
import type { CadPolylineEntity, CadProject } from "./types";

function contourPoly(
  id: string,
  z: number,
  y: number,
  layerId = "imp_CURVAS",
): CadPolylineEntity {
  return {
    id,
    type: "polyline",
    layerId,
    name: `CN ${z.toFixed(2)} m`,
    vertices: [
      { x: 0, y, z },
      { x: 50, y, z },
      { x: 100, y, z },
    ],
  };
}

function projectWithContours(entities: CadProject["entities"]): CadProject {
  return {
    name: "teste",
    crs: "local",
    layers: [
      { id: "imp_CURVAS", name: "CURVAS", color: "#ef4444", visible: true, locked: false },
      { id: "loteamento_lotes", name: "LOTEAMENTO_LOTES", color: "#22c55e", visible: true, locked: false },
      { id: "loteamento_vias", name: "LOTEAMENTO_VIAS", color: "#6b7280", visible: true, locked: false },
    ],
    entities,
  };
}

describe("parseElevationText", () => {
  it("lê cota em texto com metro", () => {
    assert.equal(parseElevationText("245,50 m"), 245.5);
    assert.equal(parseElevationText("CN 10"), 10);
  });
});

describe("interpolação de curvas importadas", () => {
  it("linear entre Z=10 e Z=20 gera curva intermediária ~Z=15 no meio", () => {
    const lows = [{ vertices: contourPoly("c10", 10, 0).vertices, z: 10 }];
    const highs = [{ vertices: contourPoly("c20", 20, 100).vertices, z: 20 }];
    const mids = linearIntermediatePolylines([...lows, ...highs], 15);
    assert.ok(mids.length >= 1, "deveria gerar pelo menos uma curva em Z=15");
    const ys = mids[0]!.vertices.map((v) => v.y);
    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
    assert.ok(Math.abs(meanY - 50) < 5, `Y médio ${meanY}`);
    assert.ok(mids[0]!.vertices.every((v) => Math.abs(v.z - 15) < 1e-6));
  });

  it("TIN/IDW: duas curvas Z=10 e Z=20 geram isolinha ~Z=15", () => {
    const project = projectWithContours([contourPoly("c10", 10, 0), contourPoly("c20", 20, 100)]);
    const extracted = extractImportedContourTerrain(project);
    const zMid = interpolateTinZ(buildTinTriangles(extracted.samples), 50, 50, extracted.samples);
    assert.ok(Math.abs(zMid - 15) < 0.35, `TIN Z(50,50)=${zMid}`);

    const linear = generateInterpolatedContours(project, {
      interval: 5,
      method: "linear",
    });
    const linear15 = linear.polylines.find((p) => {
      const z = parseContourElevation(p);
      return z != null && Math.abs(z - 15) < 0.05;
    });
    assert.ok(linear15, "método linear deveria gerar CN 15");
    const meanY = linear15!.vertices.reduce((s, v) => s + v.y, 0) / linear15!.vertices.length;
    assert.ok(Math.abs(meanY - 50) < 5, `Y médio ${meanY}`);

    const result = generateInterpolatedContours(project, {
      interval: 5,
      method: "tin",
      gridSmoothPasses: 0,
      lineSmoothIterations: 0,
    });
    assert.equal(result.polylines.every((p) => p.layerId === INTERPOLATED_CONTOUR_LAYER.id), true);
    const at15 = result.polylines.filter((p) => {
      const z = parseContourElevation(p);
      return z != null && Math.abs(z - 15) < 0.05;
    });
    assert.ok(at15.length >= 1, `níveis ${result.levels.join(",")}`);
  });

  it("curvas sem Z pedem atribuição de cota", () => {
    const flat: CadPolylineEntity = {
      id: "c0",
      type: "polyline",
      layerId: "imp_CURVAS",
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 20, y: 0, z: 0 },
        { x: 40, y: 0, z: 0 },
      ],
    };
    const project = projectWithContours([flat]);
    assert.throws(
      () => generateInterpolatedContours(project, { interval: 1, usePointElevations: false }),
      (err: unknown) => err instanceof Error && err.message.includes(CONTOUR_INTERPOLATE_NEED_Z),
    );
  });
});

describe("corte e aterro do loteamento", () => {
  it("terreno acima do platô é corte", () => {
    const lot: CadPolylineEntity = {
      id: "lote1",
      type: "polyline",
      layerId: "loteamento_lotes",
      closed: true,
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
        { x: 10, y: 10, z: 0 },
        { x: 0, y: 10, z: 0 },
      ],
    };
    const terrain = [
      { x: 0, y: 0, z: 12 },
      { x: 10, y: 0, z: 12 },
      { x: 10, y: 10, z: 12 },
      { x: 0, y: 10, z: 12 },
    ];
    const project = projectWithContours([lot]);
    const result = computeLoteamentoCutFill({
      project,
      plateauZ: 10,
      terrainSamples: terrain,
    });
    assert.ok(result.cutM3 > 50, `corte ${result.cutM3}`);
    assert.ok(result.fillM3 < 1e-3, `aterro ${result.fillM3}`);
  });

  it("terreno abaixo do platô é aterro", () => {
    const result = computeEarthworkVolume({
      terrainSamples: [
        { x: 0, y: 0, z: 8 },
        { x: 10, y: 0, z: 8 },
        { x: 0, y: 10, z: 8 },
      ],
      design: planeFromHorizontalZ(10),
    });
    assert.ok(result.fillM3 > 0);
    assert.ok(result.cutM3 < 1e-6);
  });
});
