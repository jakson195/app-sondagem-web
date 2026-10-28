import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Position } from "geojson";
import * as turf from "@turf/turf";
import { generateLoteamento } from "./lot-subdivision";
import {
  RESIDUO_TOL_M2,
  lotearQuadraCompleta,
  quadraPolyAreaM2,
  residuoQuadraM2,
  sharedBoundaryM,
  type QuadraPoly,
} from "./quadra-lotting";

/** Faixa de via de 12 m colada, por fora, em cada aresta da quadra. */
function streetsAround(ring: Position[], onlyEdges?: number[]): Position[][] {
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const out: Position[][] = [];
  for (let i = 0; i < ring.length; i++) {
    if (onlyEdges && !onlyEdges.includes(i)) continue;
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let nx = -(b[1] - a[1]) / len;
    let ny = (b[0] - a[0]) / len;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if ((mx - cx) * nx + (my - cy) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    out.push([a, b, [b[0] + nx * 12, b[1] + ny * 12], [a[0] + nx * 12, a[1] + ny * 12], a]);
  }
  return out;
}

function overlapM2(a: QuadraPoly, b: QuadraPoly): number {
  const hit = turf.intersect(turf.featureCollection([turf.polygon(a), turf.polygon(b)]));
  return hit ? planar(hit.geometry) : 0;
}

function planar(g: { type: string; coordinates: unknown }): number {
  const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as Position[][][];
  return polys.reduce((s, p) => s + quadraPolyAreaM2(p), 0);
}

function assertFullCoverage(quadra: Position[], lots: QuadraPoly[]) {
  const block: QuadraPoly = [[...quadra, quadra[0]]];
  const areaQuadra = quadraPolyAreaM2(block);
  const soma = lots.reduce((s, l) => s + quadraPolyAreaM2(l), 0);
  const residuo = residuoQuadraM2(block, lots);
  assert.ok(residuo <= RESIDUO_TOL_M2, `resíduo ${residuo.toFixed(4)} m²`);
  assert.ok(Math.abs(soma - areaQuadra) < RESIDUO_TOL_M2, `soma ${soma.toFixed(4)} ≠ quadra ${areaQuadra.toFixed(4)}`);
  for (let i = 0; i < lots.length; i++) {
    for (let j = i + 1; j < lots.length; j++) {
      assert.ok(overlapM2(lots[i], lots[j]) < RESIDUO_TOL_M2, `lotes ${i} e ${j} sobrepostos`);
    }
  }
}

const OPTS = { testadaM: 12, areaMinimaM2: 300 };

describe("lotearQuadraCompleta — 100% da quadra vira lote", () => {
  it("quadra retangular larga: duas fileiras costas com costas, resíduo 0", () => {
    const quadra: Position[] = [
      [0, 0],
      [200, 0],
      [200, 60],
      [0, 60],
    ];
    const r = lotearQuadraCompleta([quadra], { ...OPTS, streetRings: streetsAround(quadra) });
    assertFullCoverage(quadra, r.lots);
    assert.equal(r.residuoM2 <= RESIDUO_TOL_M2, true);
    const south = r.lots.filter((l) => l[0].every((p) => p[1] <= 30 + 1e-6));
    const north = r.lots.filter((l) => l[0].every((p) => p[1] >= 30 - 1e-6));
    assert.equal(south.length + north.length, r.lots.length, "divisa de fundo no eixo y = 30");
    assert.equal(south.length, 16, "floor(200 / 12) = 16 lotes na fileira sul");
    assert.equal(north.length, 16);
    for (const lot of r.lots) {
      assert.ok(Math.abs(quadraPolyAreaM2(lot) - 12.5 * 30) < 1e-6, "largura distribuída: 200 / 16 = 12,5 m");
    }
  });

  it("quadra trapezoidal com bordas diagonais: resíduo 0 e sem pedaço descartado", () => {
    const quadra: Position[] = [
      [0, 0],
      [210, 0],
      [180, 58],
      [25, 58],
    ];
    const r = lotearQuadraCompleta([quadra], { ...OPTS, streetRings: streetsAround(quadra) });
    assertFullCoverage(quadra, r.lots);
    assert.ok(r.lots.length >= 20, `lotes: ${r.lots.length}`);
    for (const lot of r.lots) {
      assert.ok(quadraPolyAreaM2(lot) + 1e-6 >= OPTS.areaMinimaM2, "pedaço pequeno deve ser fundido");
    }
  });

  it("quadra com ponta triangular: a esquina absorve a ponta, resíduo 0", () => {
    const quadra: Position[] = [
      [0, 0],
      [160, 0],
      [215, 30],
      [160, 60],
      [0, 60],
    ];
    const r = lotearQuadraCompleta([quadra], { ...OPTS, streetRings: streetsAround(quadra) });
    assertFullCoverage(quadra, r.lots);
    const tip: Position = [214, 30];
    const holder = r.lots.filter((l) =>
      turf.booleanPointInPolygon(turf.point(tip), turf.polygon(l)),
    );
    assert.equal(holder.length, 1, "a ponta pertence a um lote");
    for (const lot of r.lots) {
      assert.ok(quadraPolyAreaM2(lot) + 1e-6 >= OPTS.areaMinimaM2);
    }
  });

  it("ponta mais estreita que 2 × profundidade não gera lado abaixo do mínimo", () => {
    const quadra: Position[] = [
      [0, 0],
      [160, 0],
      [160, 46],
      [120, 48.5],
      [0, 48.5],
    ];
    const streets = streetsAround(quadra, [0, 3]);
    const r = lotearQuadraCompleta([quadra], {
      testadaM: 12,
      areaMinimaM2: 288,
      profundidadeLoteM: 24,
      percentualEsquina: 0,
      streetRings: streets,
    });
    assert.ok(r.lots.length >= 8, `lotes: ${r.lots.length}`);
    for (const lot of r.lots) {
      const xs = (lot[0] ?? []).map((p) => p[0]);
      const ys = (lot[0] ?? []).map((p) => p[1]);
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      const menor = Math.min(w, h);
      const maior = Math.max(w, h);
      assert.ok(menor + 0.05 >= 12, `lado ${menor.toFixed(2)} m abaixo da testada 12 m`);
      assert.ok(maior + 0.05 >= 24, `lado ${maior.toFixed(2)} m abaixo da profundidade 24 m`);
    }
  });

  it("via só de um lado: lote vai da testada até o fundo", () => {
    const quadra: Position[] = [
      [0, 0],
      [120, 0],
      [120, 40],
      [0, 40],
    ];
    const r = lotearQuadraCompleta([quadra], { ...OPTS, streetRings: streetsAround(quadra, [0]) });
    assertFullCoverage(quadra, r.lots);
    assert.equal(r.lots.length, 10);
    for (const lot of r.lots) {
      const ys = lot[0].map((p) => p[1]);
      assert.ok(Math.min(...ys) <= 1e-6 && Math.max(...ys) >= 40 - 1e-6, "lote atravessa a quadra");
    }
  });

  it("generateLoteamento em gleba com bordas diagonais: nenhuma quadra com remanescente", () => {
    const gleba: [number, number][] = [
      [0, 0],
      [260, 0],
      [320, 90],
      [300, 210],
      [40, 230],
      [-30, 110],
    ];
    const result = generateLoteamento(gleba, {
      larguraViaM: 12,
      profundidadeQuadraM: 25,
      testadaMinimaM: 12,
      areaMinimaM2: 300,
      raioEsquinaM: 0,
    });
    assert.equal(result.remanescente.length, 0, "não pode existir polígono de área remanescente");
    assert.ok(result.quadraPolys.length >= 2);
    const lots = result.lotes.map((l) => l.coordinates);
    for (const quadra of result.quadraPolys) {
      const inside = lots.filter((lot) => overlapM2(quadra, lot) > 1);
      const areaQuadra = quadraPolyAreaM2(quadra);
      const soma = inside.reduce((s, l) => s + quadraPolyAreaM2(l), 0);
      assert.ok(residuoQuadraM2(quadra, inside) <= RESIDUO_TOL_M2, "quadra com miolo ou ponta sem lote");
      assert.ok(Math.abs(soma - areaQuadra) < RESIDUO_TOL_M2, `soma ${soma.toFixed(3)} ≠ quadra ${areaQuadra.toFixed(3)}`);
    }
  });

  it("fiada de 150 m com testada 12: 12 lotes de 12,5 m, sem lote de sobra", () => {
    const quadra: Position[] = [
      [0, 0],
      [150, 0],
      [150, 30],
      [0, 30],
    ];
    const r = lotearQuadraCompleta([quadra], { testadaM: 12, streetRings: streetsAround(quadra, [0]) });
    assertFullCoverage(quadra, r.lots);
    assert.equal(r.lots.length, 12);
    for (const lot of r.lots) {
      assert.ok(Math.abs(quadraPolyAreaM2(lot) - 12.5 * 30) < 1e-6, "150 / 12 = 12,5 m cada");
    }
  });

  it("fiadas de comprimentos diferentes: divisas de fundo se encontram", () => {
    const quadra: Position[] = [
      [0, 0],
      [150, 0],
      [174, 60],
      [0, 60],
    ];
    const r = lotearQuadraCompleta([quadra], {
      ...OPTS,
      percentualEsquina: 20,
      streetRings: streetsAround(quadra),
    });
    assertFullCoverage(quadra, r.lots);
    const backXs = (lots: QuadraPoly[]) =>
      lots
        .flatMap((l) => l[0])
        .filter((p) => Math.abs(p[1] - 30) < 1e-6 && p[0] > 1 && p[0] < 149)
        .map((p) => p[0]);
    const south = r.lots.filter((l) => l[0].some((p) => Math.abs(p[1]) < 1e-6));
    const north = r.lots.filter((l) => l[0].some((p) => Math.abs(p[1] - 60) < 1e-6));
    assert.equal(south.length + north.length, r.lots.length, "nenhum lote atravessa as duas fiadas");
    for (const lot of r.lots) {
      assert.ok(quadraPolyAreaM2(lot) < 3 * OPTS.areaMinimaM2, `lote de ${quadraPolyAreaM2(lot).toFixed(0)} m² na ponta`);
    }
    const northXs = backXs(north);
    const southXs = backXs(south);
    assert.ok(southXs.length > 0);
    for (const x of southXs) {
      assert.ok(
        northXs.some((nx) => Math.abs(nx - x) < 1e-3),
        `divisa sul em x=${x.toFixed(3)} sem par na fiada norte`,
      );
    }
    assert.ok(north.length > south.length, "a fiada mais longa ganha lotes na sobra");
  });

  it("generateLoteamento com reserva legal no miolo: via de contorno liga as ruas cortadas", () => {
    const gleba: [number, number][] = [
      [0, 0],
      [300, 0],
      [300, 240],
      [0, 240],
    ];
    const rl: Position[] = [
      [120, 90],
      [180, 90],
      [180, 150],
      [120, 150],
      [120, 90],
    ];
    const result = generateLoteamento(gleba, {
      larguraViaM: 12,
      profundidadeQuadraM: 25,
      testadaMinimaM: 12,
      areaMinimaM2: 300,
      raioEsquinaM: 0,
      reservaLegal: [rl],
    });
    const viaFeats = result.vias.map((v) => turf.polygon(v));
    const onVia = (p: Position) => viaFeats.some((f) => turf.booleanPointInPolygon(turf.point(p), f));
    for (const p of [
      [150, 84],
      [150, 156],
      [114, 120],
      [186, 120],
    ] as Position[]) {
      assert.ok(onVia(p), `sem via de contorno em (${p[0]}, ${p[1]})`);
    }
    const rlPoly: QuadraPoly = [rl];
    for (const lot of result.lotes) {
      assert.ok(overlapM2(rlPoly, lot.coordinates) < RESIDUO_TOL_M2, `lote ${lot.numero} sobre a reserva`);
    }
    const lots = result.lotes.map((l) => l.coordinates);
    for (const quadra of result.quadraPolys) {
      const inside = lots.filter((lot) => overlapM2(quadra, lot) > 1);
      assert.ok(residuoQuadraM2(quadra, inside) <= RESIDUO_TOL_M2, "quadra com área sem lote");
    }
  });

  it("vizinhos fundidos compartilham divisa", () => {
    const a: QuadraPoly = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]];
    const b: QuadraPoly = [[[10, 2], [20, 2], [20, 8], [10, 8], [10, 2]]];
    assert.ok(Math.abs(sharedBoundaryM(a, b) - 6) < 1e-9);
  });
});
