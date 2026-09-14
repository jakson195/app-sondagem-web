import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTinTriangles,
  computeEarthworkVolume,
  computeStreetEarthwork,
  planeFromHorizontalZ,
  planeFromThreePoints,
  planeFromTwoElevations,
  planeZ,
  triangleArea2D,
} from "./earthwork";
import type { ElevationSample } from "./contour";

const triangle10: ElevationSample[] = [
  { x: 0, y: 0, z: 10 },
  { x: 10, y: 0, z: 10 },
  { x: 0, y: 10, z: 10 },
];

describe("TIN vs plane (prismóide)", () => {
  it("corte de um triângulo 50 m² com 2 m de altura = 100 m³", () => {
    const result = computeEarthworkVolume({
      terrainSamples: triangle10,
      design: planeFromHorizontalZ(8),
    });
    assert.equal(result.triangleCount, 1);
    assert.ok(Math.abs(result.areaM2 - 50) < 1e-6, `área ${result.areaM2}`);
    assert.ok(Math.abs(result.cutM3 - 100) < 1e-6, `corte ${result.cutM3}`);
    assert.ok(Math.abs(result.fillM3) < 1e-6, `aterro ${result.fillM3}`);
  });

  it("aterro quando o platô está acima do terreno", () => {
    const result = computeEarthworkVolume({
      terrainSamples: triangle10,
      design: planeFromHorizontalZ(12),
    });
    assert.ok(Math.abs(result.fillM3 - 100) < 1e-6, `aterro ${result.fillM3}`);
    assert.ok(Math.abs(result.cutM3) < 1e-6);
  });

  it("recorta pelo polígono (metade direita fora)", () => {
    const full = computeEarthworkVolume({
      terrainSamples: triangle10,
      design: planeFromHorizontalZ(8),
    });
    const clipped = computeEarthworkVolume({
      terrainSamples: triangle10,
      design: planeFromHorizontalZ(8),
      clipPolygon: [
        { x: 0, y: 0, z: 0 },
        { x: 4, y: 0, z: 0 },
        { x: 4, y: 10, z: 0 },
        { x: 0, y: 10, z: 0 },
      ],
    });
    assert.ok(clipped.areaM2 < full.areaM2 - 1, `área recortada ${clipped.areaM2} vs ${full.areaM2}`);
    assert.ok(clipped.cutM3 < full.cutM3 - 1);
    assert.ok(clipped.cutM3 > 0);
  });
});

describe("plano inclinado", () => {
  it("3 pontos: z = 0.1·E (cota 0 / 1 / 0) vs terreno Z=0", () => {
    const terrain: ElevationSample[] = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 0, y: 10, z: 0 },
    ];
    const plane = planeFromThreePoints(
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 1 },
      { x: 0, y: 10, z: 0 },
    );
    assert.ok(Math.abs(planeZ(plane, 10, 0) - 1) < 1e-6);
    assert.ok(Math.abs(planeZ(plane, 0, 10)) < 1e-6);
    const result = computeEarthworkVolume({ terrainSamples: terrain, design: plane });
    // h = 0, -1, 0 → média −1/3; área 50 → aterro 50/3
    assert.ok(Math.abs(result.fillM3 - 50 / 3) < 1e-6, `aterro ${result.fillM3}`);
    assert.ok(Math.abs(result.cutM3) < 1e-6);
  });

  it("duas cotas ao longo do eixo E: constante na perpendicular", () => {
    const plane = planeFromTwoElevations({ x: 0, y: 0, z: 10 }, { x: 20, y: 0, z: 8 });
    assert.ok(Math.abs(planeZ(plane, 0, 0) - 10) < 1e-6);
    assert.ok(Math.abs(planeZ(plane, 20, 0) - 8) < 1e-6);
    assert.ok(Math.abs(planeZ(plane, 10, 5) - 9) < 1e-6, `z ${planeZ(plane, 10, 5)}`);
  });
});

describe("TIN vs TIN", () => {
  it("mesma malha 2 m abaixo gera 100 m³ de corte", () => {
    const terrain = triangle10;
    const designSamples: ElevationSample[] = triangle10.map((p) => ({ ...p, z: 8 }));
    const result = computeEarthworkVolume({
      terrainSamples: terrain,
      design: { kind: "tin", triangles: buildTinTriangles(designSamples), samples: designSamples },
    });
    assert.ok(Math.abs(result.cutM3 - 100) < 1e-4, `corte ${result.cutM3}`);
  });
});

describe("área do triângulo", () => {
  it("catetos 10 m → 50 m²", () => {
    assert.equal(triangleArea2D(triangle10[0], triangle10[1], triangle10[2]), 50);
  });
});

describe("terraplanagem de arruamento (seções médias)", () => {
  it("eixo 100 m, seção 10 m × 2 m de corte → 2000 m³", () => {
    const terrain: ElevationSample[] = [
      { x: 0, y: -50, z: 10 },
      { x: 200, y: -50, z: 10 },
      { x: 0, y: 50, z: 10 },
      { x: 200, y: 50, z: 10 },
    ];
    const result = computeStreetEarthwork({
      alignment: [
        { x: 1, y: 0, z: 10 },
        { x: 101, y: 0, z: 10 },
      ],
      terrainSamples: terrain,
      intervalM: 50,
      halfWidthM: 5,
      zStart: 8,
      zEnd: 8,
    });
    assert.ok(Math.abs(result.cutM3 - 2000) < 5, `corte ${result.cutM3}`);
    assert.ok(result.fillM3 < 1, `aterro ${result.fillM3}`);
    assert.ok(result.stationCount >= 3);
    assert.ok(result.rows.length > 0);
  });
});
