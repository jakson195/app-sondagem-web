import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bufferPolylineMeters,
  areaUtilFromStreetsM2,
  generateLoteamento,
  generateFaixaDominioFromEdges,
  getMainAxisAzimuth,
  polygonAreaPlanarM2,
  polygonInteriorOverlapM2,
  ringsShareBoundary,
  placeAreaUtilBesideReserva,
  reservarFaixaDeArea,
  reservarRetanguloNoCanto,
  splitParcelByDimensions,
  splitParcelByTargetArea,
  splitThroughBlock,
  subdivideQuadraEmLotes,
  complementarLoteamento,
  findBestEvenCount,
  findBestSubdivision,
  LOT_MAX_AREA_RATIO,
  validateLot,
  translateRingInsideHost,
  clampPointInsideHost,
  adjustLotInQuadra,
  rebuildQuadraLotes,
  type LoteamentoParams,
} from "./lot-subdivision";

const PARAMS: LoteamentoParams = {
  larguraViaM: 12,
  profundidadeQuadraM: 50,
  testadaMinimaM: 10,
  areaMinimaM2: 250,
};

/** Retângulo 200 × 120 m (24 000 m²). */
const RECT: [number, number][] = [
  [0, 0],
  [200, 0],
  [200, 120],
  [0, 120],
];

/** Gleba em L: 200×80 + 80×120. */
const ELL: [number, number][] = [
  [0, 0],
  [200, 0],
  [200, 80],
  [80, 80],
  [80, 200],
  [0, 200],
];

function dropClosing(ring: number[][]): number[][] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
  return ring;
}

function bbox(ring: number[][]) {
  const pts = dropClosing(ring);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function viaTouches(a: number[][][], b: number[][][]): boolean {
  const ra = a[0] ?? [];
  const rb = b[0] ?? [];
  return ringsShareBoundary(ra, rb) || polygonInteriorOverlapM2(ra, rb) > 0.5;
}

function outsideBorderVias(
  vias: number[][][][],
  side: "south" | "north" | "west" | "east",
  span: { maxX: number; maxY: number },
) {
  return vias.filter((poly) => {
    const v = bbox(poly[0] ?? []);
    const alongX = v.maxX - v.minX;
    const alongY = v.maxY - v.minY;
    if (side === "south") return v.maxY < 2 && v.minY < -4 && alongX > 40;
    if (side === "north") return v.minY > span.maxY - 2 && v.maxY > span.maxY + 4 && alongX > 40;
    if (side === "west") return v.maxX < 2 && v.minX < -4 && alongY > 40;
    return v.minX > span.maxX - 2 && v.maxX > span.maxX + 4 && alongY > 40;
  });
}

function insideBorderVias(
  vias: number[][][][],
  side: "south" | "north" | "west" | "east",
  span: { maxX: number; maxY: number },
) {
  return vias.filter((poly) => {
    const v = bbox(poly[0] ?? []);
    const alongX = v.maxX - v.minX;
    const alongY = v.maxY - v.minY;
    if (side === "south") return v.minY < 1.5 && v.maxY > 8 && alongX > 40;
    if (side === "north") return v.maxY > span.maxY - 1.5 && v.minY < span.maxY - 8 && alongX > 40;
    if (side === "west") return v.minX < 1.5 && v.maxX > 8 && alongY > 40;
    return v.maxX > span.maxX - 1.5 && v.minX < span.maxX - 8 && alongY > 40;
  });
}

function absDot(ax: number, ay: number, bx: number, by: number) {
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la < 1e-9 || lb < 1e-9) return 0;
  return Math.abs((ax * bx + ay * by) / (la * lb));
}

function viaCorridors(vias: number[][][][]) {
  return vias.map((poly) => bbox(poly[0] ?? []));
}

function touchesCorridor(
  box: { minX: number; maxX: number; minY: number; maxY: number },
  v: { minX: number; maxX: number; minY: number; maxY: number },
  gap = 1.2,
) {
  const shareX = Math.min(box.maxX, v.maxX) - Math.max(box.minX, v.minX) > 2;
  const shareY = Math.min(box.maxY, v.maxY) - Math.max(box.minY, v.minY) > 2;
  const adjacentY = Math.abs(box.minY - v.maxY) <= gap || Math.abs(box.maxY - v.minY) <= gap;
  const adjacentX = Math.abs(box.minX - v.maxX) <= gap || Math.abs(box.maxX - v.minX) <= gap;
  const overlapY = Math.min(box.maxY, v.maxY) - Math.max(box.minY, v.minY);
  const overlapX = Math.min(box.maxX, v.maxX) - Math.max(box.minX, v.minX);
  return (adjacentY && shareX) || (adjacentX && shareY) || (overlapY >= 1.5 && overlapX >= 1.5);
}

function assertLoteamentoValid(
  gleba: [number, number][],
  params: LoteamentoParams,
) {
  const result = generateLoteamento(gleba, params);
  const glebaArea = polygonAreaPlanarM2(gleba);
  assert.ok(result.lotes.length >= 1, "deveria gerar pelo menos 1 lote");
  assert.ok(result.quadras >= 1, "deveria gerar pelo menos 1 quadra");

  for (const lote of result.lotes) {
    assert.ok(lote.area_m2 >= 4, `lote ${lote.quadra} ${lote.numero} área ${lote.area_m2} degenerada`);
    if (!lote.remainder) {
      assert.ok(
        lote.testada_m + 0.08 >= params.testadaMinimaM,
        `lote ${lote.quadra} ${lote.numero} testada ${lote.testada_m} < ${params.testadaMinimaM}`,
      );
    }
  }

  const lotesArea = result.lotes.reduce((s, l) => s + l.area_m2, 0);
  const viasArea = result.vias.reduce((s, poly) => s + polygonAreaPlanarM2(poly[0] ?? []), 0);
  const utilArea = result.areaUtil.reduce((s, poly) => s + polygonAreaPlanarM2(poly[0] ?? []), 0);
  const occupied = lotesArea + viasArea + utilArea;
  assert.ok(occupied <= glebaArea * 1.2, `ocupação ${occupied} > gleba ${glebaArea}`);
  assert.ok(occupied >= glebaArea * 0.62, `ocupação ${occupied} muito abaixo da gleba ${glebaArea}`);
  for (const lote of result.lotes) {
    for (const util of result.areaUtil) {
      assert.ok(
        polygonInteriorOverlapM2(lote.coordinates[0] ?? [], util[0] ?? []) < 1.5,
        `lote ${lote.numero} intersecta AREA_UTIL`,
      );
    }
  }
  for (const via of result.vias) {
    for (const util of result.areaUtil) {
      assert.ok(
        polygonInteriorOverlapM2(via[0] ?? [], util[0] ?? []) < 1.5,
        "via intersecta AREA_UTIL",
      );
    }
  }
  return result;
}

function vertexCount(ring: number[][] | undefined): number {
  if (!ring || ring.length === 0) return 0;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) return ring.length - 1;
  return ring.length;
}

describe("getMainAxisAzimuth", () => {
  it("retorna ~90° para retângulo alongado no eixo E", () => {
    const az = getMainAxisAzimuth(RECT);
    const delta = Math.min(Math.abs(az - 90), Math.abs(az - 270), Math.abs(az));
    assert.ok(delta < 5 || Math.abs(az - 90) < 5 || Math.abs(az % 180 - 90) < 5, `azimute inesperado ${az}`);
  });
});

describe("generateLoteamento", () => {
  it("loteia um retângulo simples respeitando área e testada mínimas", () => {
    const result = assertLoteamentoValid(RECT, PARAMS);
    assert.ok(result.lotes.length >= 8, `esperado vários lotes, veio ${result.lotes.length}`);
    assert.ok(result.lotes.length <= 80, `número de lotes implausível: ${result.lotes.length}`);
    const glebaArea = polygonAreaPlanarM2(RECT);
    assert.ok(Math.abs(result.areaGlebaM2 - glebaArea) < 1);
  });

  it("loteia uma gleba em L", () => {
    const result = assertLoteamentoValid(ELL, PARAMS);
    assert.ok(result.lotes.length >= 4, `L deveria gerar vários lotes, veio ${result.lotes.length}`);
  });

  it("rejeita gleba menor que 1 lote", () => {
    const tiny: [number, number][] = [
      [0, 0],
      [8, 0],
      [8, 8],
      [0, 8],
    ];
    assert.throws(() => generateLoteamento(tiny, PARAMS), /pequena demais/i);
  });

  it("rejeita parâmetros ≤ 0", () => {
    assert.throws(
      () => generateLoteamento(RECT, { ...PARAMS, larguraViaM: 0 }),
      /incoerentes/i,
    );
  });

  it("não gera calçadas quando larguraCalcadaM é 0 ou omitida", () => {
    const omitted = generateLoteamento(RECT, PARAMS);
    assert.equal(omitted.calcadas.length, 0);
    const zero = generateLoteamento(RECT, { ...PARAMS, larguraCalcadaM: 0 });
    assert.equal(zero.calcadas.length, 0);
  });

  it("gera polígonos de calçada internos à via quando larguraCalcadaM > 0", () => {
    const result = assertLoteamentoValid(RECT, { ...PARAMS, larguraCalcadaM: 2 });
    assert.ok(result.calcadas.length >= 1, "deveria gerar ao menos um polígono de calçada");
    const calcadaArea = result.calcadas.reduce((s, poly) => s + polygonAreaPlanarM2(poly[0] ?? []), 0);
    const viasArea = result.vias.reduce((s, poly) => s + polygonAreaPlanarM2(poly[0] ?? []), 0);
    assert.ok(calcadaArea > 10, `área de calçada implausível: ${calcadaArea}`);
    assert.ok(calcadaArea < viasArea + 1, "calçada deve caber no corredor da via");
  });

  it("rejeita calçada que não cabe na via", () => {
    assert.throws(
      () => generateLoteamento(RECT, { ...PARAMS, larguraCalcadaM: 8 }),
      /calçada/i,
    );
  });

  it("gera eixo da via quando eixoRua é true (padrão) e omite quando false", () => {
    const withAxis = generateLoteamento(RECT, PARAMS);
    assert.ok(withAxis.eixos.length >= 1, "eixo padrão deveria existir");
    for (const eixo of withAxis.eixos) {
      assert.ok(eixo.length >= 2, "eixo precisa de pelo menos 2 pontos");
    }
    const without = generateLoteamento(RECT, { ...PARAMS, eixoRua: false });
    assert.equal(without.eixos.length, 0);
  });

  it("densifica vértices com raio de esquina e mantém cantos vivos com raio 0", () => {
    const sharp = generateLoteamento(RECT, { ...PARAMS, raioEsquinaM: 0 });
    const round = generateLoteamento(RECT, { ...PARAMS, raioEsquinaM: 3 });
    const sharpMax = Math.max(...sharp.lotes.map((l) => vertexCount(l.coordinates[0])));
    const roundMax = Math.max(...round.lotes.map((l) => vertexCount(l.coordinates[0])));
    assert.ok(roundMax > sharpMax, `filete deveria adicionar vértices (${roundMax} vs ${sharpMax})`);
    assertLoteamentoValid(RECT, { ...PARAMS, raioEsquinaM: 3 });
  });

  it("parte lotes de passagem em duas fileiras com uma testada por rua", () => {
    const result = assertLoteamentoValid(RECT, PARAMS);
    const eW = viaCorridors(result.vias).filter((v) => v.maxX - v.minX > v.maxY - v.minY + 20);
    assert.ok(eW.length >= 2, `esperava vias E-W opostas, veio ${eW.length}`);
    for (const lote of result.lotes) {
      const box = bbox(lote.coordinates[0] ?? []);
      const hits = eW.filter((v) => Math.min(box.maxY, v.maxY) - Math.max(box.minY, v.minY) >= 1.5);
      assert.ok(
        hits.length <= 1,
        `${lote.quadra} ${lote.numero} atravessa duas vias paralelas (y ${box.minY.toFixed(1)}–${box.maxY.toFixed(1)})`,
      );
    }
    const yMids = result.lotes.map((l) => {
      const b = bbox(l.coordinates[0] ?? []);
      return (b.minY + b.maxY) / 2;
    });
    const rowA = yMids.filter((y) => y < 60).length;
    const rowB = yMids.filter((y) => y >= 60).length;
    assert.ok(rowA >= 4 && rowB >= 4, `duas fileiras esperadas (sul ${rowA}, norte ${rowB})`);
    assert.ok(result.lotes.length >= 16, `fileiras duplas deveriam gerar muitos lotes, veio ${result.lotes.length}`);
  });

  it("lotes ficam ortogonais à via de testada (testada paralela, laterais perpendiculares)", () => {
    const result = assertLoteamentoValid(RECT, PARAMS);
    const eW = viaCorridors(result.vias).filter((v) => v.maxX - v.minX > v.maxY - v.minY + 20);
    assert.ok(eW.length >= 2, "precisava de vias E-W");
    const streetDir: [number, number] = [1, 0];
    let checked = 0;
    for (const lote of result.lotes) {
      if (lote.remainder) continue;
      const pts = dropClosing(lote.coordinates[0] ?? []);
      if (pts.length < 3) continue;
      const box = bbox(pts);
      const fronting = eW.filter((v) => touchesCorridor(box, v));
      if (fronting.length === 0) continue;
      let maxParallel = 0;
      let maxPerp = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.hypot(dx, dy);
        if (len < 2) continue;
        const parallel = absDot(dx, dy, streetDir[0], streetDir[1]);
        const perp = absDot(dx, dy, -streetDir[1], streetDir[0]);
        if (parallel > 0.98) maxParallel = Math.max(maxParallel, len);
        if (perp > 0.98) maxPerp = Math.max(maxPerp, len);
      }
      assert.ok(
        maxParallel + 0.2 >= PARAMS.testadaMinimaM,
        `${lote.quadra} ${lote.numero} sem testada paralela à rua (len ${maxParallel.toFixed(2)})`,
      );
      assert.ok(
        maxPerp >= 8,
        `${lote.quadra} ${lote.numero} sem divisa lateral perpendicular à rua (len ${maxPerp.toFixed(2)})`,
      );
      checked += 1;
    }
    assert.ok(checked >= 8, `deveria checar vários lotes, veio ${checked}`);
  });

  it("quadra larga entre duas vias paralelas não gera lote de passagem mesmo com profundidade grande", () => {
    const result = assertLoteamentoValid(RECT, { ...PARAMS, profundidadeQuadraM: 100 });
    const eW = viaCorridors(result.vias).filter((v) => v.maxX - v.minX > v.maxY - v.minY + 20);
    assert.ok(eW.length >= 2, "gleba 200×120 deveria ter vias na frente e nos fundos");
    for (const lote of result.lotes) {
      const box = bbox(lote.coordinates[0] ?? []);
      const hits = eW.filter((v) => Math.min(box.maxY, v.maxY) - Math.max(box.minY, v.minY) >= 1.5);
      assert.ok(hits.length <= 1, `${lote.quadra} ${lote.numero} ainda é lote de passagem`);
      assert.ok(box.maxY - box.minY < 70, `lote ${lote.numero} profundo demais: ${(box.maxY - box.minY).toFixed(1)} m`);
    }
    const yMids = [...new Set(result.lotes.map((l) => Math.round(bbox(l.coordinates[0] ?? []).minY / 5)))];
    assert.ok(yMids.length >= 2, "deveria haver ao menos duas fileiras");
  });

  it("aplica raio só na esquina; lotes de meio de quadra ficam com cantos vivos", () => {
    const sharp = generateLoteamento(RECT, { ...PARAMS, raioEsquinaM: 0 });
    const round = generateLoteamento(RECT, { ...PARAMS, raioEsquinaM: 3 });
    const isMid = (lote: (typeof round.lotes)[number]) => {
      const xs = (lote.coordinates[0] ?? []).map((p) => p[0]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      return cx > 40 && cx < 160;
    };
    const isCorner = (lote: (typeof round.lotes)[number]) => {
      const xs = (lote.coordinates[0] ?? []).map((p) => p[0]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      return cx < 32 || cx > 168;
    };
    const midRoundMax = Math.max(0, ...round.lotes.filter(isMid).map((l) => vertexCount(l.coordinates[0])));
    const midSharpMax = Math.max(0, ...sharp.lotes.filter(isMid).map((l) => vertexCount(l.coordinates[0])));
    assert.ok(midRoundMax > 0 && midSharpMax > 0, "deveria haver lotes de meio de quadra");
    assert.ok(
      midRoundMax <= midSharpMax + 1,
      `meio de quadra não deve receber arco (${midRoundMax} vs ${midSharpMax})`,
    );
    const corners = round.lotes.filter(isCorner);
    assert.ok(corners.length >= 1, "deveria haver lote de esquina");
    const cornerMax = Math.max(...corners.map((l) => vertexCount(l.coordinates[0])));
    assert.ok(cornerMax > midRoundMax, `esquina deveria densificar o filete (${cornerMax} vs ${midRoundMax})`);
  });

  it("área da quadra 2000 m² parte a gleba em quadras de ~2000 m² com vias entre elas", () => {
    const result = assertLoteamentoValid(RECT, { ...PARAMS, areaMinimaQuadraM2: 2000 });
    assert.ok(result.quadraPolys.length >= 4, `esperava várias quadras, veio ${result.quadraPolys.length}`);
    const areas = result.quadraPolys.map((poly) => polygonAreaPlanarM2(poly[0] ?? []));
    for (const area of areas) {
      assert.ok(area > 900 && area < 3400, `quadra fora da faixa ~2000 m²: ${area.toFixed(0)}`);
    }
    const mean = areas.reduce((s, a) => s + a, 0) / areas.length;
    assert.ok(Math.abs(mean - 2000) < 900, `média das quadras ${mean.toFixed(0)} longe de 2000`);
    assert.ok(result.vias.length >= 2, `esperava vias entre quadras, veio ${result.vias.length}`);
    const boxes = result.quadraPolys.map((poly) => bbox(poly[0] ?? []));
    const viaBoxes = viaCorridors(result.vias);
    let separated = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const gapX = Math.max(a.minX, b.minX) < Math.min(a.maxX, b.maxX) ? 0 : Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX);
        const gapY = Math.max(a.minY, b.minY) < Math.min(a.maxY, b.maxY) ? 0 : Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY);
        const adjacent = (gapX > 0.5 && gapX < 16 && gapY < 2) || (gapY > 0.5 && gapY < 16 && gapX < 2);
        if (!adjacent) continue;
        const mid = {
          minX: (Math.min(a.maxX, b.maxX) + Math.max(a.minX, b.minX)) / 2 - 2,
          maxX: (Math.min(a.maxX, b.maxX) + Math.max(a.minX, b.minX)) / 2 + 2,
          minY: (Math.min(a.maxY, b.maxY) + Math.max(a.minY, b.minY)) / 2 - 2,
          maxY: (Math.min(a.maxY, b.maxY) + Math.max(a.minY, b.minY)) / 2 + 2,
        };
        const hit = viaBoxes.some((v) => touchesCorridor(mid, v, 8));
        if (hit) separated += 1;
      }
    }
    assert.ok(separated >= 2, `vias deveriam separar quadras adjacentes (achou ${separated})`);
  });

  it("respeita área mínima testada × profundidade e não loteia faixa rasa", () => {
    const row: [number, number][] = [
      [0, 0],
      [120, 0],
      [120, 25],
      [0, 25],
    ];
    const lots = subdivideQuadraEmLotes(row, 90, 12, 300, undefined, undefined, undefined, { profundidadeM: 25 });
    assert.ok(lots.length >= 8, `esperava fileira de 12 m, veio ${lots.length}`);
    for (const poly of lots) {
      const area = polygonAreaPlanarM2(poly[0] ?? []);
      assert.ok(area + 0.8 >= 300, `lote interno ${area.toFixed(1)} m² abaixo de 300`);
    }

    const thin: [number, number][] = [
      [0, 0],
      [120, 0],
      [120, 6],
      [0, 6],
    ];
    const thinLots = subdivideQuadraEmLotes(thin, 90, 12, 300, undefined, undefined, undefined, { profundidadeM: 25 });
    assert.equal(thinLots.length, 0, "faixa de 6 m não pode virar lote < 300 m²");
  });

  it("não parte fileira mais rasa que ~2× profundidade só porque há ruas opostas", () => {
    const row: [number, number][] = [
      [0, 0],
      [100, 0],
      [100, 30],
      [0, 30],
    ];
    const south: [number, number][] = [
      [-4, -4],
      [104, -4],
      [104, 0.4],
      [-4, 0.4],
    ];
    const north: [number, number][] = [
      [-4, 29.6],
      [104, 29.6],
      [104, 34],
      [-4, 34],
    ];
    const rows = splitThroughBlock(row, 90, [south, north], [50, 15], 25);
    assert.equal(rows.length, 1, `30 m de profundidade não deve virar duas fileiras de 15 m, veio ${rows.length}`);
  });

  it("findBestEvenCount: 150/25 = 6×25 e 160/25 = 6×26,67", () => {
    const exact = findBestEvenCount(150, 25);
    assert.equal(exact.n, 6);
    assert.ok(Math.abs(exact.each - 25) < 1e-6);
    const leftover = findBestEvenCount(160, 25);
    assert.equal(leftover.n, 6, `160 m deve virar 6 faixas, veio ${leftover.n}`);
    assert.ok(Math.abs(leftover.each - 160 / 6) < 1e-6);
    const plan = findBestSubdivision({
      depthM: 150,
      alongM: 150,
      profundidadeM: 25,
      testadaM: 10,
    });
    assert.equal(plan.rowCount, 6);
    assert.equal(plan.lotCountPerRow, 15);
    const uneven = findBestSubdivision({
      depthM: 160,
      alongM: 153,
      profundidadeM: 25,
      testadaM: 10,
    });
    assert.ok(uneven.rowCount === 6 || uneven.rowCount === 7, `faixas de 160 m: ${uneven.rowCount}`);
    assert.ok(Math.abs(uneven.rowDepthM - 160 / uneven.rowCount) < 1e-6);
    assert.ok(uneven.rowDepthM <= 25 * 1.2 + 0.05, `profundidade ${uneven.rowDepthM} acima do limite`);
    assert.ok(uneven.lotCountPerRow >= 14 && uneven.lotCountPerRow <= 16);
  });

  it("quadra 150×150 com P=25 parte em 6 faixas iguais", () => {
    const q: [number, number][] = [
      [0, 0],
      [150, 0],
      [150, 150],
      [0, 150],
    ];
    const rows = splitThroughBlock(q, 90, [], [75, 75], 25);
    assert.equal(rows.length, 6, `esperava 6 faixas, veio ${rows.length}`);
    for (const ring of rows) {
      const b = bbox(ring);
      const h = b.maxY - b.minY;
      assert.ok(Math.abs(h - 25) < 1.2, `faixa ${h.toFixed(2)} m deveria ~25 m`);
    }
  });

  it("quadra 160 m redistribui sobra em 6 faixas de ~26,67 m", () => {
    const q: [number, number][] = [
      [0, 0],
      [200, 0],
      [200, 160],
      [0, 160],
    ];
    const south: [number, number][] = [
      [-4, -4],
      [204, -4],
      [204, 0.4],
      [-4, 0.4],
    ];
    const north: [number, number][] = [
      [-4, 159.6],
      [204, 159.6],
      [204, 164],
      [-4, 164],
    ];
    const rows = splitThroughBlock(q, 90, [south, north], [100, 80], 25);
    assert.equal(rows.length, 6, `esperava 6 faixas, veio ${rows.length}`);
    const heights = rows.map((ring) => {
      const b = bbox(ring);
      return b.maxY - b.minY;
    });
    const maxH = Math.max(...heights);
    assert.ok(maxH < 29, `não concentrar sobra numa faixa de ${maxH.toFixed(2)} m`);
    for (const h of heights) {
      assert.ok(Math.abs(h - 160 / 6) < 1.2, `faixa ${h.toFixed(2)} m deveria ~26,67 m`);
    }
  });

  it("quadra 150×150 com lotes 12×25: internos ≥ 300 m² e esquina maior", () => {
    const gleba: [number, number][] = [
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ];
    const result = generateLoteamento(gleba, {
      larguraViaM: 12,
      profundidadeQuadraM: 25,
      testadaMinimaM: 12,
      areaMinimaM2: 300,
      percentualEsquina: 20,
      larguraQuadraM: 150,
      profundidadeBlocoM: 150,
      larguraCalcadaM: 0,
      raioEsquinaM: 0,
      percentAreaUtil: 0,
    });
    const numbered = result.lotes.filter((l) => !l.remainder);
    assert.ok(numbered.length >= 8, `esperava vários lotes, veio ${numbered.length}`);
    for (const lote of numbered) {
      assert.ok(
        lote.area_m2 + 1 >= 300,
        `lote ${lote.quadra} ${lote.numero} com ${lote.area_m2.toFixed(1)} m² abaixo de 300`,
      );
    }
    const areas = numbered.map((l) => l.area_m2).sort((a, b) => a - b);
    const median = areas[Math.floor(areas.length / 2)] ?? 0;
    assert.ok(
      median >= 290 && median <= 380,
      `lotes deveriam ficar perto de 300 m², mediana ${median.toFixed(1)}`,
    );
    const corners = numbered.filter((l) => l.testada_m + 0.05 >= 14 && l.area_m2 + 1 >= 360);
    assert.ok(corners.length >= 4, `esperava lotes de esquina mais largos, veio ${corners.length}`);
  });

  it("validateLot rejeita cesta de sobras de 1.689 m²", () => {
    const spec = {
      minAreaM2: 250 * 0.95,
      targetAreaM2: 250,
      minDepthM: 25 * 0.72,
      maxDepthM: 25,
      minFrontageM: 10,
    };
    assert.equal(validateLot({ areaM2: 250, depthM: 25, frontageM: 10 }, spec), true);
    assert.equal(validateLot({ areaM2: 300, depthM: 25, frontageM: 12 }, spec), true);
    assert.equal(validateLot({ areaM2: 312.5, depthM: 25, frontageM: 12.5 }, spec), true);
    assert.equal(validateLot({ areaM2: 325, depthM: 25, frontageM: 13 }, spec), false);
    assert.equal(validateLot({ areaM2: 1689.53, depthM: 67, frontageM: 25 }, spec), false);
    assert.equal(validateLot({ areaM2: 400, depthM: 25, frontageM: 16 }, spec), false);
    assert.equal(validateLot({ areaM2: 250, depthM: 31, frontageM: 10 }, spec), false);
  });

  it("faixa residual 67,56×25 não vira um único lote gigante", () => {
    const leftover: [number, number][] = [
      [0, 0],
      [25, 0],
      [25, 67.56],
      [0, 67.56],
    ];
    const westStreet: [number, number][] = [
      [-6, -2],
      [6, -2],
      [6, 70],
      [-6, 70],
    ];
    const lots = subdivideQuadraEmLotes(leftover, 90, 10, 250, [westStreet], [12, 33], undefined, {
      profundidadeM: 25,
    });
    assert.ok(lots.length >= 4, `esperava vários lotes na faixa residual, veio ${lots.length}`);
    const target = 250;
    const maxArea = target * LOT_MAX_AREA_RATIO;
    for (const poly of lots) {
      const area = polygonAreaPlanarM2(poly[0] ?? []);
      assert.ok(area <= maxArea + 1, `lote residual ${area.toFixed(1)} m² > ${maxArea.toFixed(0)}`);
      assert.ok(area + 1 >= target * 0.95, `lote residual ${area.toFixed(1)} m² abaixo da área alvo`);
    }
  });

  it("Lote 01 não absorve sobra: nenhum lote > 1,30 × área alvo", () => {
    const gleba: [number, number][] = [
      [0, 0],
      [150, 0],
      [150, 150],
      [40, 150],
      [40, 82],
      [0, 82],
    ];
    const result = generateLoteamento(gleba, {
      larguraViaM: 12,
      profundidadeQuadraM: 25,
      testadaMinimaM: 10,
      areaMinimaM2: 250,
      percentualEsquina: 20,
      larguraCalcadaM: 0,
      raioEsquinaM: 0,
      percentAreaUtil: 0,
      viasExistentesExtremidades: true,
    });
    const numbered = result.lotes.filter((l) => !l.remainder);
    assert.ok(numbered.length >= 8, `esperava malha de lotes, veio ${numbered.length}`);
    const target = 250;
    const maxArea = target * LOT_MAX_AREA_RATIO;
    for (const lote of numbered) {
      assert.ok(
        lote.area_m2 <= maxArea + 1,
        `${lote.quadra} ${lote.numero} com ${lote.area_m2.toFixed(1)} m² é cesta de sobras`,
      );
    }
    const lote01 = numbered.find((l) => l.numero === "Lote 01");
    assert.ok(lote01, "deveria existir Lote 01 após a numeração");
    const areas = numbered.map((l) => l.area_m2).sort((a, b) => a - b);
    const median = areas[Math.floor(areas.length / 2)] ?? 0;
    assert.ok(
      lote01!.area_m2 < maxArea + 1,
      `Lote 01 com ${lote01!.area_m2.toFixed(1)} m² ultrapassa o máximo`,
    );
    assert.ok(
      lote01!.area_m2 <= median * 1.35 + 5,
      `Lote 01 ${lote01!.area_m2.toFixed(1)} m² longe da mediana ${median.toFixed(1)}`,
    );
    assert.equal(result.remanescente.length, 0, "não deve restar área remanescente");
    assert.ok((result.report?.residualArea ?? 0) < 1, "residual da malha deveria ser ~0");
  });

  it("não sobrepõe reserva legal ao gerar quadras e vias", () => {
    const reserva: [number, number][] = [
      [0, 80],
      [70, 80],
      [70, 120],
      [0, 120],
    ];
    const result = generateLoteamento(RECT, { ...PARAMS, areaMinimaQuadraM2: 2000, reservas: [reserva] });
    assert.ok(result.lotes.length >= 4, `ainda deveria lotear o restante, veio ${result.lotes.length}`);
    for (const lote of result.lotes) {
      const box = bbox(lote.coordinates[0] ?? []);
      const cx = (box.minX + box.maxX) / 2;
      const cy = (box.minY + box.maxY) / 2;
      assert.ok(!(cx < 68 && cy > 82), `lote ${lote.numero} invadiu a reserva (${cx.toFixed(1)}, ${cy.toFixed(1)})`);
      assert.ok(
        polygonInteriorOverlapM2(lote.coordinates[0] ?? [], reserva) < 1,
        `lote ${lote.numero} intersecta o interior da reserva`,
      );
    }
    for (const poly of result.vias) {
      assert.ok(
        polygonInteriorOverlapM2(poly[0] ?? [], reserva) < 1,
        "via intersecta o interior da reserva",
      );
    }
    for (const poly of result.quadraPolys) {
      const box = bbox(poly[0] ?? []);
      const cx = (box.minX + box.maxX) / 2;
      const cy = (box.minY + box.maxY) / 2;
      assert.ok(!(cx < 68 && cy > 82), `quadra invadiu a reserva (${cx.toFixed(1)}, ${cy.toFixed(1)})`);
      assert.ok(
        polygonInteriorOverlapM2(poly[0] ?? [], reserva) < 1,
        "quadra intersecta o interior da reserva",
      );
    }
  });

  it("não sobrepõe APP ao gerar lotes e vias", () => {
    const stream: [number, number][] = [
      [30, 10],
      [30, 110],
    ];
    const app = bufferPolylineMeters(stream, 20, "both");
    assert.ok(polygonAreaPlanarM2(app) > 1000, "buffer da APP deveria ter área");
    const result = generateLoteamento(RECT, { ...PARAMS, areaMinimaQuadraM2: 2000, reservas: [app] });
    assert.ok(result.lotes.length >= 4, `ainda deveria lotear o restante, veio ${result.lotes.length}`);
    for (const lote of result.lotes) {
      assert.ok(
        polygonInteriorOverlapM2(lote.coordinates[0] ?? [], app) < 1,
        `lote ${lote.numero} intersecta o interior da APP`,
      );
    }
    for (const poly of result.vias) {
      assert.ok(
        polygonInteriorOverlapM2(poly[0] ?? [], app) < 1,
        "via intersecta o interior da APP",
      );
    }
  });

  it("quadra rotacionada: lotes ortogonais à via local, duas fileiras, sem lote de passagem", () => {
    const rad = (30 * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const rot = ([x, y]: [number, number]): [number, number] => [x * c - y * s, x * s + y * c];
    const gleba = RECT.map(rot);
    const result = assertLoteamentoValid(gleba, { ...PARAMS, percentAreaUtil: 0 });
    const streetAz = getMainAxisAzimuth(gleba);
    const streetUx = Math.sin((streetAz * Math.PI) / 180);
    const streetUy = Math.cos((streetAz * Math.PI) / 180);
    const delta = Math.min(Math.abs(streetAz - 60), Math.abs(streetAz - 240), Math.abs((streetAz % 180) - 60));
    assert.ok(delta < 8, `eixo da gleba rotacionada deveria ser ~60°, veio ${streetAz}`);

    let checked = 0;
    for (const lote of result.lotes) {
      if (lote.remainder) continue;
      const pts = dropClosing(lote.coordinates[0] ?? []);
      if (pts.length < 3) continue;
      let maxParallel = 0;
      let maxPerp = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.hypot(dx, dy);
        if (len < 2) continue;
        const parallel = absDot(dx, dy, streetUx, streetUy);
        const perp = absDot(dx, dy, -streetUy, streetUx);
        if (parallel > 0.97) maxParallel = Math.max(maxParallel, len);
        if (perp > 0.97) maxPerp = Math.max(maxPerp, len);
      }
      assert.ok(
        maxParallel + 0.3 >= PARAMS.testadaMinimaM,
        `${lote.quadra} ${lote.numero} testada não paralela à via (${maxParallel.toFixed(2)} m, az ${streetAz.toFixed(1)})`,
      );
      assert.ok(
        maxPerp >= 8,
        `${lote.quadra} ${lote.numero} lateral não perpendicular à via (${maxPerp.toFixed(2)} m)`,
      );
      const horiz = pts.filter((_, i) => {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 8) return false;
        return absDot(b[0] - a[0], b[1] - a[1], 1, 0) > 0.995;
      });
      assert.ok(
        horiz.length === 0,
        `${lote.quadra} ${lote.numero} ainda tem divisa horizontal (eixo mundo), deveria seguir a via`,
      );
      checked += 1;
    }
    assert.ok(checked >= 8, `deveria checar vários lotes rotacionados, veio ${checked}`);
    assert.ok(result.lotes.length >= 16, `duas fileiras na gleba rotacionada, veio ${result.lotes.length}`);
  });

  it("quadra profunda sem vias ainda parte no meio (divisória de fundos)", () => {
    const origin: [number, number] = [100, 60];
    const rows = splitThroughBlock(RECT, 90, [], origin, PARAMS.profundidadeQuadraM);
    assert.equal(rows.length, 2, `esperava 2 fileiras sem rua, veio ${rows.length}`);
    const yMids = rows.map((ring) => {
      const b = bbox(ring);
      return (b.minY + b.maxY) / 2;
    });
    yMids.sort((a, b) => a - b);
    assert.ok(yMids[0]! < 55 && yMids[1]! > 65, `fileiras deveriam ficar de um lado e do outro do meio (y ${yMids.join(", ")})`);
    for (const ring of rows) {
      const b = bbox(ring);
      assert.ok(b.maxY - b.minY < 80, `fileira ainda atravessa a quadra: ${(b.maxY - b.minY).toFixed(1)} m`);
    }
  });

  it("gleba tipo Polígono 1 (um lado diagonal, outro ~N-S) não gera lote de passagem horizontal", () => {
    /** Esquerda em segmentos ~35°, direita quase vertical (aresta mais longa) — reproduz o snap a 0°. */
    const p1: [number, number][] = [
      [0, 0],
      [155, 8],
      [170, 345],
      [210, 348],
      [175, 290],
      [140, 232],
      [105, 174],
      [70, 116],
      [35, 58],
    ];
    const result = assertLoteamentoValid(p1, PARAMS);
    const glebaBox = bbox(p1);
    const glebaWidth = glebaBox.maxX - glebaBox.minX;
    const glebaHeight = glebaBox.maxY - glebaBox.minY;
    assert.ok(result.lotes.length >= 8, `esperava vários lotes, veio ${result.lotes.length}`);

    let throughLots = 0;
    const xMids: number[] = [];
    let diagonalLaterals = 0;
    for (const lote of result.lotes) {
      const box = bbox(lote.coordinates[0] ?? []);
      const w = box.maxX - box.minX;
      const h = box.maxY - box.minY;
      if (w > glebaWidth * 0.72 && h < glebaHeight * 0.2) throughLots += 1;
      xMids.push((box.minX + box.maxX) / 2);
      const pts = dropClosing(lote.coordinates[0] ?? []);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.hypot(dx, dy);
        if (len < 8) continue;
        const horiz = absDot(dx, dy, 1, 0);
        if (horiz < 0.92) diagonalLaterals += 1;
      }
    }
    assert.equal(throughLots, 0, `${throughLots} lote(s) ainda atravessam a gleba de lado a lado`);
    const midX = (glebaBox.minX + glebaBox.maxX) / 2;
    const leftRow = xMids.filter((x) => x < midX).length;
    const rightRow = xMids.filter((x) => x >= midX).length;
    assert.ok(leftRow >= 3 && rightRow >= 3, `duas fileiras (esq ${leftRow}, dir ${rightRow})`);
    assert.ok(
      diagonalLaterals >= 4,
      `laterais deveriam seguir a testada diagonal, não o eixo mundo (achou ${diagonalLaterals} arestas inclinadas)`,
    );
  });

  it("vias existentes nas extremidades ficam fora da gleba e as internas se unem", () => {
    const existing = generateLoteamento(RECT, { ...PARAMS, viasExistentesExtremidades: true });
    assert.ok(existing.lotes.length >= 8, `ainda deveria lotear, veio ${existing.lotes.length}`);
    const span = { maxX: 200, maxY: 120 };
    const south = outsideBorderVias(existing.vias, "south", span);
    const north = outsideBorderVias(existing.vias, "north", span);
    const west = outsideBorderVias(existing.vias, "west", span);
    const east = outsideBorderVias(existing.vias, "east", span);
    assert.ok(south.length >= 1, "deveria gerar via fora no sul");
    assert.ok(north.length >= 1, "deveria gerar via fora no norte");
    assert.ok(west.length >= 1, "deveria gerar via fora no oeste");
    assert.ok(east.length >= 1, "deveria gerar via fora no leste");
    assert.equal(insideBorderVias(existing.vias, "south", span).length, 0, "não deve comer o terreno no sul");
    const southVia = south[0]!;
    const sb = bbox(southVia[0] ?? []);
    assert.ok(sb.maxY - sb.minY > 8 && sb.maxY - sb.minY < 18, `via sul ~12 m (h=${sb.maxY - sb.minY})`);
    assert.ok(
      existing.vias.some((v) => v !== southVia && viaTouches(v, southVia)),
      "ruas do loteamento devem unir na via existente do sul",
    );
    const boxes = existing.lotes.map((l) => bbox(l.coordinates[0] ?? []));
    assert.ok(
      boxes.some((b) => b.minY < 2) && boxes.some((b) => b.maxY > 118),
      "lotes devem fazer testada no limite da gleba (via lá fora)",
    );
  });

  it("quadra por medidas com vias existentes gera a rua fora e une as internas", () => {
    const gleba: [number, number][] = [
      [0, 0],
      [170, 0],
      [170, 170],
      [0, 170],
    ];
    const result = generateLoteamento(gleba, {
      larguraViaM: 12,
      profundidadeQuadraM: 25,
      testadaMinimaM: 12,
      areaMinimaM2: 300,
      larguraQuadraM: 150,
      profundidadeBlocoM: 150,
      viasExistentesExtremidades: true,
      larguraCalcadaM: 0,
      raioEsquinaM: 0,
      percentAreaUtil: 0,
    });
    assert.ok(result.lotes.length >= 8, `ainda deveria lotear, veio ${result.lotes.length}`);
    const span = { maxX: 170, maxY: 170 };
    const south = outsideBorderVias(result.vias, "south", span);
    const east = outsideBorderVias(result.vias, "east", span);
    assert.ok(south.length >= 1, "deveria gerar via fora no sul");
    assert.ok(east.length >= 1, "deveria gerar via fora no leste");
    assert.equal(insideBorderVias(result.vias, "south", span).length, 0, "não deve abrir rua nova dentro no sul");
    const southVia = south[0]!;
    assert.ok(
      result.vias.some((v) => v !== southVia && viaTouches(v, southVia)),
      "vias internas/perpendiculares devem unir na via existente",
    );
    const boxes = result.lotes.map((l) => bbox(l.coordinates[0] ?? []));
    assert.ok(boxes.some((b) => b.minY < 2), "lotes devem encostar no sul (via lá fora)");
  });

  it("via existente só no lado marcado — rua fora nesse lado; os outros ainda recebem rua nova", () => {
    const southEdge: [number, number][] = [
      [0, 0],
      [200, 0],
    ];
    const oneSide = generateLoteamento(RECT, { ...PARAMS, ladosViaExistente: [southEdge] });
    const span = { maxX: 200, maxY: 120 };
    const southOut = outsideBorderVias(oneSide.vias, "south", span);
    const northIn = insideBorderVias(oneSide.vias, "north", span);
    assert.ok(southOut.length >= 1, "lado marcado deve gerar via fora da gleba");
    assert.ok(northIn.length >= 1, "lados não marcados ainda recebem rua nova por dentro");
    const southVia = southOut[0]!;
    assert.ok(
      oneSide.vias.some((v) => v !== southVia && viaTouches(v, southVia)),
      "ruas do loteamento devem unir na via existente marcada",
    );
    const boxes = oneSide.lotes.map((l) => bbox(l.coordinates[0] ?? []));
    assert.ok(boxes.some((b) => b.minY < 2), "lotes do lado sul devem encostar na gleba");
    assert.ok(oneSide.lotes.length >= 8);
  });

  it("faixa de domínio da rodovia entra para dentro da gleba e não recebe lote nem via", () => {
    const south: [number, number][] = [
      [0, 0],
      [200, 0],
    ];
    const faixaPolys = generateFaixaDominioFromEdges(RECT, [south], 20);
    assert.ok(faixaPolys.length >= 1, "deveria gerar o polígono da faixa");
    const faixaBox = bbox(faixaPolys[0]![0] ?? []);
    assert.ok(faixaBox.minY > -0.6 && faixaBox.minY < 1.5, `faixa deve colar no sul (minY=${faixaBox.minY})`);
    assert.ok(faixaBox.maxY > 18 && faixaBox.maxY < 22.5, `faixa de 20 m (maxY=${faixaBox.maxY})`);

    const result = generateLoteamento(RECT, {
      ...PARAMS,
      percentAreaUtil: 0,
      ladosFaixaDominio: [south],
      larguraFaixaDominioM: 20,
    });
    assert.ok(result.faixaDominio.length >= 1, "resultado deve trazer a faixa de domínio");
    const faixa = result.faixaDominio[0]![0] ?? [];
    assert.ok(result.lotes.length >= 4, `ainda deveria lotear o restante, veio ${result.lotes.length}`);
    for (const lote of result.lotes) {
      assert.ok(
        polygonInteriorOverlapM2(lote.coordinates[0] ?? [], faixa) < 1,
        `lote ${lote.numero} intersecta a faixa de domínio`,
      );
    }
    for (const poly of result.vias) {
      assert.ok(
        polygonInteriorOverlapM2(poly[0] ?? [], faixa) < 1,
        "via intersecta a faixa de domínio",
      );
    }
    const lotBoxes = result.lotes.map((l) => bbox(l.coordinates[0] ?? []));
    assert.ok(
      lotBoxes.every((b) => b.minY > 18),
      "lotes não devem ocupar os 20 m da faixa no sul",
    );
  });

  it("via existente usa a largura informada e fica fora do polígono", () => {
    const southEdge: [number, number][] = [
      [0, 0],
      [200, 0],
    ];
    const result = generateLoteamento(RECT, {
      ...PARAMS,
      ladosViaExistente: [southEdge],
      larguraViaExistenteM: 20,
    });
    const south = outsideBorderVias(result.vias, "south", { maxX: 200, maxY: 120 });
    assert.ok(south.length >= 1, "deveria gerar via fora no sul");
    const sb = bbox(south[0]![0] ?? []);
    assert.ok(sb.maxY < 2, `via sul deve ficar fora (maxY=${sb.maxY})`);
    assert.ok(sb.minY < -16 && sb.minY > -26, `via sul deveria ter ~20 m para fora (minY=${sb.minY})`);
  });

  it("insere eixos de via existentes como corredor interno", () => {
    const axis: [number, number][] = [
      [0, 60],
      [200, 60],
    ];
    const result = generateLoteamento(RECT, {
      ...PARAMS,
      viasExistentesExtremidades: true,
      eixosExistentes: [axis],
    });
    assert.ok(result.vias.length >= 1, "eixo existente deveria virar via");
    assert.ok(result.eixos.length >= 1, "deveria desenhar o eixo inserido");
    assert.ok(
      result.vias.some((poly) => {
        const viaBox = bbox(poly[0] ?? []);
        return viaBox.minY < 60 && viaBox.maxY > 60 && viaBox.maxX - viaBox.minX > 40;
      }),
      "corredor deveria cruzar y=60",
    );
    assert.ok(result.lotes.length >= 4);
  });

  it("eixo editado vira a rede: vias seguem a nova centroide e lotes não atravessam a via", () => {
    const original: [number, number][] = [
      [0, 60],
      [200, 60],
    ];
    const moved: [number, number][] = [
      [0, 60],
      [200, 90],
    ];
    const params: LoteamentoParams = {
      ...PARAMS,
      usarEixosComoRede: true,
      eixosExistentes: [original],
      percentAreaUtil: 15,
    };
    const before = generateLoteamento(RECT, params);
    const after = generateLoteamento(RECT, { ...params, eixosExistentes: [moved] });
    assert.ok(after.vias.length >= 1, "deveria gerar via no eixo movido");
    assert.ok(after.lotes.length >= 2, `deveria recortar lotes, veio ${after.lotes.length}`);

    const covers = (vias: typeof after.vias, x: number, y: number, half = 7) =>
      vias.some((poly) => {
        const b = bbox(poly[0] ?? []);
        return x >= b.minX - 1 && x <= b.maxX + 1 && y >= b.minY - half && y <= b.maxY + half;
      });
    assert.ok(covers(before.vias, 100, 60), "via original em y=60");
    assert.ok(covers(after.vias, 200, 90), "via nova deve acompanhar o vértice em (200, 90)");
    assert.ok(
      !covers(after.vias, 100, 60, 4) || covers(after.vias, 160, 84),
      "corredor deve inclinar em direção ao vértice movido",
    );

    for (const lote of after.lotes) {
      for (const via of after.vias) {
        assert.ok(
          polygonInteriorOverlapM2(lote.coordinates[0] ?? [], via[0] ?? []) < 1.5,
          `lote ${lote.numero} atravessa a via nova`,
        );
      }
    }
  });
});

describe("reservarFaixaDeArea / subdivideQuadraEmLotes", () => {
  it("reserva ~20% no fundo e deixa o restante da gleba", () => {
    const total = polygonAreaPlanarM2(RECT);
    const cut = reservarFaixaDeArea(RECT, "fundo", total * 0.2);
    assert.ok(cut.reservedM2 > total * 0.12 && cut.reservedM2 < total * 0.32, `reservado ${cut.reservedM2}`);
    assert.ok(cut.remainderM2 > total * 0.6, `resto ${cut.remainderM2}`);
    assert.ok(cut.reserved.length >= 3 && cut.remainder.length >= 3);
  });

  it("reserva ~20% no canto superior direito sem recortar a gleba", () => {
    const total = polygonAreaPlanarM2(RECT);
    const cut = reservarRetanguloNoCanto(RECT, "superior_direita", total * 0.2);
    assert.ok(cut.reservedM2 > total * 0.15 && cut.reservedM2 < total * 0.25, `reservado ${cut.reservedM2}`);
    const pts = dropClosing(cut.reserved);
    assert.equal(pts.length, 4, `reserva deveria ser quadrado (4 vértices), veio ${pts.length}`);
    const sides = pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length];
      return Math.hypot(q[0] - p[0], q[1] - p[1]);
    });
    const mean = sides.reduce((s, a) => s + a, 0) / sides.length;
    for (const side of sides) {
      assert.ok(Math.abs(side - mean) < 0.8, `lado ${side.toFixed(2)} ≠ ${mean.toFixed(2)}`);
    }
    assert.ok(Math.abs(cut.reservedM2 - mean * mean) < 40, "área deveria ser lado²");
    const xs = cut.reserved.map((p) => p[0]);
    const ys = cut.reserved.map((p) => p[1]);
    assert.ok(Math.max(...xs) > 190, "deve encostar na direita");
    assert.ok(Math.max(...ys) > 110, "deve encostar no topo");
  });

  it("reserva legal no canto funciona em coordenadas UTM e em graus (georef)", () => {
    const utm: [number, number][] = [
      [500000, 7500000],
      [500200, 7500000],
      [500200, 7500120],
      [500000, 7500120],
    ];
    const utmTotal = polygonAreaPlanarM2(utm);
    const utmCut = reservarRetanguloNoCanto(utm, "inferior_esquerda", utmTotal * 0.2);
    assert.ok(utmCut.reservedM2 > utmTotal * 0.15 && utmCut.reservedM2 < utmTotal * 0.25);
    assert.ok(Math.min(...utmCut.reserved.map((p) => p[0])) < 500010);
    assert.ok(Math.min(...utmCut.reserved.map((p) => p[1])) < 7500010);

    const deg: [number, number][] = [
      [-47.0, -15.0],
      [-46.998, -15.0],
      [-46.998, -14.999],
      [-47.0, -14.999],
    ];
    const degTotal = polygonAreaPlanarM2(deg);
    const degCut = reservarRetanguloNoCanto(deg, "superior_direita", degTotal * 0.2);
    assert.ok(degCut.reserved.length >= 3);
    assert.ok(degCut.reservedM2 > degTotal * 0.12 && degCut.reservedM2 < degTotal * 0.32);
  });

  it("translateRingInsideHost não deixa a reserva sair da gleba", () => {
    const reserva: [number, number][] = [
      [0, 0],
      [40, 0],
      [40, 40],
      [0, 40],
    ];
    const moved = translateRingInsideHost(reserva, RECT, 500, 0);
    const xs = moved.map((p) => p[0]);
    assert.ok(Math.max(...xs) <= 200.01, `saiu da gleba: maxX=${Math.max(...xs)}`);
    assert.ok(Math.min(...xs) >= -0.01);
  });

  it("clampPointInsideHost projeta vértice para o limite da gleba", () => {
    const inside = clampPointInsideHost([10, 10], RECT);
    assert.ok(Math.abs(inside[0] - 10) < 1e-9 && Math.abs(inside[1] - 10) < 1e-9);
    const outside = clampPointInsideHost([250, 60], RECT);
    assert.ok(outside[0] <= 200.01, `ainda fora: ${outside[0]}`);
    assert.ok(outside[0] >= 199.5);
  });

  it("subdivide retângulo 200×120 com testada 20 m em vários lotes", () => {
    const lots = subdivideQuadraEmLotes(RECT, 90, 20, 0);
    assert.ok(lots.length >= 8, `esperado vários lotes, veio ${lots.length}`);
  });
});

describe("splitParcelByTargetArea", () => {
  it("parte 24 000 m² em quadras de ~2000 m² com corredor de 12 m", () => {
    const split = splitParcelByTargetArea(RECT, 2000, 12, 90);
    assert.ok(split.quadras.length >= 4, `esperava várias quadras, veio ${split.quadras.length}`);
    assert.ok(split.vias.length >= 1, "deveria inserir via entre quadras");
    for (const ring of split.quadras) {
      const area = polygonAreaPlanarM2(ring);
      assert.ok(area > 900 && area < 3400, `quadra ${area.toFixed(0)} fora de ~2000`);
    }
  });
});

describe("splitParcelByDimensions", () => {
  it("parte por largura × profundidade da quadra com vias entre elas", () => {
    const split = splitParcelByDimensions(RECT, 80, 50, 12, 90);
    assert.ok(split.quadras.length >= 2, `esperava várias quadras, veio ${split.quadras.length}`);
    assert.ok(split.vias.length >= 1, "deveria inserir via entre quadras");
    const areas = split.quadras.map((ring) => polygonAreaPlanarM2(ring));
    assert.ok(
      areas.some((a) => a > 3200 && a < 4800),
      `deveria haver quadra ~80×50 (4000 m²), áreas ${areas.map((a) => a.toFixed(0)).join(",")}`,
    );
    const result = generateLoteamento(RECT, {
      ...PARAMS,
      larguraQuadraM: 80,
      profundidadeBlocoM: 50,
    });
    assert.ok(result.quadraPolys.length >= 2, `geração por medidas, quadras ${result.quadraPolys.length}`);
    assert.ok(result.vias.length >= 1);
    assert.ok(result.lotes.length >= 8);
  });
});

describe("lotes de resto", () => {
  it("não espalha restos como AREA_UTIL pelo loteamento", () => {
    const trap: [number, number][] = [
      [0, 0],
      [140, 0],
      [110, 50],
      [20, 50],
    ];
    const result = generateLoteamento(trap, {
      larguraViaM: 8,
      profundidadeQuadraM: 25,
      testadaMinimaM: 12,
      viasExistentesExtremidades: true,
    });
    assert.ok(result.lotes.length >= 4, `esperava lotes, veio ${result.lotes.length}`);
    const glebaArea = polygonAreaPlanarM2(trap);
    const lotsArea = result.lotes.reduce((s, l) => s + l.area_m2, 0);
    const viasArea = result.vias.reduce((s, poly) => s + polygonAreaPlanarM2(poly[0] ?? []), 0);
    const utilArea = result.areaUtil.reduce((s, poly) => s + polygonAreaPlanarM2(poly[0] ?? []), 0);
    assert.ok(
      lotsArea + viasArea + utilArea >= glebaArea * 0.72,
      `ocupação ${lotsArea + viasArea + utilArea} muito abaixo da gleba ${glebaArea}`,
    );
    assert.ok(result.areaUtil.length <= 2, `AREA_UTIL deve ser um bloco, veio ${result.areaUtil.length} polígonos`);
  });
});

describe("área útil 15%", () => {
  const reserva: [number, number][] = [
    [0, 80],
    [70, 80],
    [70, 120],
    [0, 120],
  ];

  function assertNoEmptyUtil(result: ReturnType<typeof generateLoteamento>, gleba: [number, number][]) {
    const T = polygonAreaPlanarM2(gleba);
    const lotsArea = result.lotes.reduce((s, l) => s + l.area_m2, 0);
    assert.equal(result.areaUtil.length, 0, "não cria polígono laranja de área útil");
    assert.equal(result.areaUtilM2, 0);
    assert.ok(result.lotes.length >= 1, "área útil deve virar lote");
    assert.ok(lotsArea > T * 0.2, `lotes ${lotsArea} deveriam ocupar a área útil`);
  }

  it("areaUtilFromStreetsM2 = max(0, 15%T − S)", () => {
    assert.equal(areaUtilFromStreetsM2(10_000, 500, 15), 1000);
    assert.equal(areaUtilFromStreetsM2(10_000, 2000, 15), 0);
  });

  it("gerar loteamento não cria AREA_UTIL: o restante vira lote", () => {
    const result = generateLoteamento(RECT, {
      ...PARAMS,
      viasExistentesExtremidades: true,
      percentAreaUtil: 15,
      reservaLegal: [reserva],
      reservas: [reserva],
    });
    assertNoEmptyUtil(result, RECT);
    for (const lote of result.lotes) {
      assert.ok(polygonInteriorOverlapM2(lote.coordinates[0] ?? [], reserva) < 1);
    }
  });

  it("lotes e vias não intersectam a reserva legal", () => {
    const result = generateLoteamento(RECT, {
      ...PARAMS,
      percentAreaUtil: 15,
      reservaLegal: [reserva],
      reservas: [reserva],
    });
    assertNoEmptyUtil(result, RECT);
    for (const lote of result.lotes) {
      assert.ok(polygonInteriorOverlapM2(lote.coordinates[0] ?? [], reserva) < 1);
    }
    for (const via of result.vias) {
      assert.ok(polygonInteriorOverlapM2(via[0] ?? [], reserva) < 1);
    }
  });

  it("resto após lotes não vira polígono AREA_UTIL", () => {
    const result = generateLoteamento(RECT, {
      ...PARAMS,
      viasExistentesExtremidades: true,
      percentAreaUtil: 15,
      reservaLegal: [reserva],
      reservas: [reserva],
    });
    assert.equal(result.areaUtil.length, 0);
    const glebaArea = polygonAreaPlanarM2(RECT);
    const lotsArea = result.lotes.reduce((s, l) => s + l.area_m2, 0);
    const viasArea = result.vias.reduce((s, poly) => s + polygonAreaPlanarM2(poly[0] ?? []), 0);
    const rlArea = polygonAreaPlanarM2(reserva);
    const covered = lotsArea + viasArea + rlArea;
    assert.ok(covered >= glebaArea * 0.86, `cobertura ${covered} < 86% de ${glebaArea}`);
  });

  it("percentual 15 não abre buraco laranja mesmo com ruas grandes", () => {
    const result = generateLoteamento(RECT, {
      ...PARAMS,
      percentAreaUtil: 15,
      reservaLegal: [reserva],
      reservas: [reserva],
    });
    assertNoEmptyUtil(result, RECT);
  });

  it("sem reserva: área útil inteira vira lote, sem polígono AREA_UTIL", () => {
    const result = generateLoteamento(RECT, { ...PARAMS, percentAreaUtil: 15 });
    assertNoEmptyUtil(result, RECT);
  });

  it("com APP e reserva, lotes ficam na área útil e não na APP", () => {
    const app: [number, number][] = [
      [180, 0],
      [200, 0],
      [200, 120],
      [180, 120],
    ];
    const result = generateLoteamento(RECT, {
      ...PARAMS,
      viasExistentesExtremidades: true,
      percentAreaUtil: 15,
      apps: [app],
      reservaLegal: [reserva],
      reservas: [app, reserva],
    });
    assertNoEmptyUtil(result, RECT);
    for (const lote of result.lotes) {
      assert.ok(polygonInteriorOverlapM2(lote.coordinates[0] ?? [], app) < 1);
      assert.ok(polygonInteriorOverlapM2(lote.coordinates[0] ?? [], reserva) < 1);
    }
  });

  function utilCentroid(polys: number[][][][]) {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const poly of polys) {
      for (const p of dropClosing(poly[0] ?? [])) {
        sx += p[0];
        sy += p[1];
        n += 1;
      }
    }
    return { x: n ? sx / n : 0, y: n ? sy / n : 0 };
  }

  it("AREA_UTIL cola na RL e o canto muda o lado da reserva", () => {
    const rl = reservarRetanguloNoCanto(RECT, "superior_direita", polygonAreaPlanarM2(RECT) * 0.2).reserved;
    const alvo = 2400;
    const left = placeAreaUtilBesideReserva(RECT, [rl], alvo, "superior_esquerda");
    const bottom = placeAreaUtilBesideReserva(RECT, [rl], alvo, "inferior_direita");
    assert.ok(left.length >= 1, "área útil à esquerda da RL");
    assert.ok(bottom.length >= 1, "área útil abaixo da RL");
    assert.ok(left.some((poly) => ringsShareBoundary(poly[0] ?? [], rl)), "esquerda deve compartilhar aresta");
    assert.ok(bottom.some((poly) => ringsShareBoundary(poly[0] ?? [], rl)), "inferior deve compartilhar aresta");
    const leftC = utilCentroid(left);
    const botC = utilCentroid(bottom);
    assert.ok(leftC.x < botC.x - 6, `canto esquerdo deveria ficar mais a oeste (${leftC.x} vs ${botC.x})`);
    assert.ok(botC.y < leftC.y - 6, `canto inferior deveria ficar mais ao sul (${botC.y} vs ${leftC.y})`);
    const leftA = left.reduce((s, poly) => s + polygonAreaPlanarM2(poly[0] ?? []), 0);
    const botA = bottom.reduce((s, poly) => s + polygonAreaPlanarM2(poly[0] ?? []), 0);
    assert.ok(leftA + 1 >= alvo * 0.6, `A esquerda ${leftA} vs ${alvo}`);
    assert.ok(botA + 1 >= alvo * 0.6, `A inferior ${botA} vs ${alvo}`);
  });

  it("os 4 cantos produzem centróides no lado esperado da RL, com aresta compartilhada", () => {
    const rl = reservarRetanguloNoCanto(RECT, "superior_direita", polygonAreaPlanarM2(RECT) * 0.2).reserved;
    const alvo = 2400;
    const rlCx = dropClosing(rl).reduce((s, p) => s + p[0], 0) / dropClosing(rl).length;
    const rlCy = dropClosing(rl).reduce((s, p) => s + p[1], 0) / dropClosing(rl).length;
    const cantos = [
      "superior_direita",
      "superior_esquerda",
      "inferior_direita",
      "inferior_esquerda",
    ] as const;
    const placed = cantos.map((canto) => {
      const polys = placeAreaUtilBesideReserva(RECT, [rl], alvo, canto);
      assert.ok(polys.length >= 1, `${canto} deveria gerar AREA_UTIL`);
      assert.ok(polys.some((poly) => ringsShareBoundary(poly[0] ?? [], rl)), `${canto} deve colar na RL`);
      const area = polys.reduce((s, poly) => s + polygonAreaPlanarM2(poly[0] ?? []), 0);
      assert.ok(area + 1 >= alvo * 0.6, `${canto} A ${area} vs ${alvo}`);
      const c = utilCentroid(polys);
      return { canto, ...c, area };
    });
    const by = Object.fromEntries(placed.map((row) => [row.canto, row]));
    const se = by.superior_esquerda!;
    const id = by.inferior_direita!;
    const ie = by.inferior_esquerda!;
    const sd = by.superior_direita!;
    assert.ok(se.x < rlCx - 4, `superior esquerda a oeste (${se.x} vs RL ${rlCx})`);
    assert.ok(id.y < rlCy - 4, `inferior direita ao sul (${id.y} vs RL ${rlCy})`);
    assert.ok(ie.x < rlCx - 4 && ie.y < rlCy - 4, "inferior esquerda a sudoeste");
    assert.ok(se.x < id.x - 6, `esquerda ${se.x} vs sul ${id.x}`);
    assert.ok(id.y < se.y - 6, `sul ${id.y} vs oeste ${se.y}`);
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    assert.ok(dist(sd, se) > 6, "superior direita ≠ esquerda");
    assert.ok(dist(sd, id) > 6, "superior direita ≠ inferior");
    assert.ok(dist(sd, ie) > 6, "superior direita ≠ inferior esquerda");
  });

  it("gerar loteamento nunca abre buraco AREA_UTIL, qualquer canto", () => {
    const rl = reservarRetanguloNoCanto(RECT, "superior_direita", polygonAreaPlanarM2(RECT) * 0.2).reserved;
    for (const canto of ["superior_esquerda", "inferior_direita"] as const) {
      const result = generateLoteamento(RECT, {
        ...PARAMS,
        percentAreaUtil: 35,
        cantoAreaUtil: canto,
        reservaLegal: [rl],
        reservas: [rl],
      });
      assertNoEmptyUtil(result, RECT);
    }
  });
});

describe("rebuildQuadraLotes / adjustLotInQuadra", () => {
  const BLOCK: [number, number][] = [
    [0, 0],
    [80, 0],
    [80, 50],
    [0, 50],
  ];
  const STREETS: [number, number][][] = [
    [
      [-4, -12],
      [84, -12],
      [84, 0],
      [-4, 0],
    ],
    [
      [-4, 50],
      [84, 50],
      [84, 62],
      [-4, 62],
    ],
  ];

  it("um lote aumentado encolhe os irmãos e a soma fecha a quadra", () => {
    const before = rebuildQuadraLotes(BLOCK, 10, 25, STREETS, undefined, "Quadra A");
    assert.ok(before.length >= 6, `esperava vários lotes, veio ${before.length}`);
    const quadraArea = polygonAreaPlanarM2(BLOCK);
    const sumBefore = before.reduce((s, l) => s + l.area_m2, 0);
    assert.ok(Math.abs(sumBefore - quadraArea) < 40, `soma antes ${sumBefore} ≠ quadra ${quadraArea}`);

    const sorted = [...before].sort((a, b) => {
      const ca = a.coordinates[0]![0]!;
      const cb = b.coordinates[0]![0]!;
      const ay = a.coordinates[0]!.reduce((s, p) => s + p[1], 0) / a.coordinates[0]!.length;
      const by = b.coordinates[0]!.reduce((s, p) => s + p[1], 0) / b.coordinates[0]!.length;
      if (Math.abs(ay - by) > 8) return ay - by;
      return ca[0] - cb[0];
    });
    const south = sorted.filter((l) => {
      const cy = l.coordinates[0]!.reduce((s, p) => s + p[1], 0) / l.coordinates[0]!.length;
      return cy < 25;
    });
    assert.ok(south.length >= 3, `fileira sul curta: ${south.length}`);
    const anchorIdx = before.indexOf(south[1]!);
    const anchorBefore = before[anchorIdx]!;
    const siblingBefore = south.filter((_, i) => i !== 1).map((l) => l.area_m2);
    const siblingSumBefore = siblingBefore.reduce((s, a) => s + a, 0);

    const after = adjustLotInQuadra(
      BLOCK,
      before.map((l) => ({ coordinates: l.coordinates })),
      anchorIdx,
      { testadaM: 16, profundidadeM: 25 },
      STREETS,
      undefined,
      "Quadra A",
    );
    assert.ok(after.length >= 3);
    const sumAfter = after.reduce((s, l) => s + l.area_m2, 0);
    assert.ok(Math.abs(sumAfter - quadraArea) < 40, `soma depois ${sumAfter} ≠ quadra ${quadraArea}`);

    const ax = anchorBefore.coordinates[0]!.reduce((s, p) => s + p[0], 0) / anchorBefore.coordinates[0]!.length;
    const ay = anchorBefore.coordinates[0]!.reduce((s, p) => s + p[1], 0) / anchorBefore.coordinates[0]!.length;
    const grown =
      after.reduce(
        (best, l) => {
          const c = l.coordinates[0]!;
          const cx = c.reduce((s, p) => s + p[0], 0) / c.length;
          const cy = c.reduce((s, p) => s + p[1], 0) / c.length;
          const d = Math.hypot(cx - ax, cy - ay);
          return !best || d < best.d ? { lot: l, d } : best;
        },
        null as { lot: (typeof after)[number]; d: number } | null,
      )?.lot ?? after.reduce((best, l) => (l.area_m2 > best.area_m2 ? l : best), after[0]!);
    assert.ok(
      grown.area_m2 > anchorBefore.area_m2 + 20 || grown.testada_m > anchorBefore.testada_m + 2,
      `lote âncora deveria crescer: área ${anchorBefore.area_m2}→${grown.area_m2} testada ${anchorBefore.testada_m}→${grown.testada_m}`,
    );
    const siblingSumAfter = after.reduce((s, l) => s + l.area_m2, 0) - grown.area_m2;
    const allSiblingBefore = sumBefore - anchorBefore.area_m2;
    assert.ok(
      siblingSumAfter < allSiblingBefore - 10,
      `irmãos deveriam encolher: ${allSiblingBefore} → ${siblingSumAfter}`,
    );
    assert.ok(siblingSumBefore > 0);
  });
});

describe("complementarLoteamento", () => {
  it("transforma sobra rasa no fundo da quadra em lotes, não em institucional", () => {
    const leftover: [number, number][] = [
      [0, 50],
      [80, 50],
      [80, 62],
      [0, 62],
    ];
    const street: [number, number][] = [
      [-2, 48],
      [82, 48],
      [82, 50],
      [-2, 50],
    ];
    const result = complementarLoteamento([leftover], {
      azimuthDeg: 90,
      testadaMinimaM: 10,
      profundidadeQuadraM: 25,
      areaMinimaM2: 250,
      streetRings: [street],
      origin: [0, 0],
    });
    const leftoverArea = 80 * 12;
    const lotArea = result.lots.reduce((s, poly) => s + polygonAreaPlanarM2(poly[0] ?? []), 0);
    assert.ok(result.lots.length >= 2, `esperava lotes complementares, veio ${result.lots.length}`);
    assert.ok(lotArea > leftoverArea * 0.7, `lotes ${lotArea.toFixed(1)} m² não preencheram a sobra ${leftoverArea}`);
    assert.ok(
      result.remanescente.reduce((s, ring) => s + polygonAreaPlanarM2(ring), 0) < leftoverArea * 0.25,
      "sobra complementar demais ficou remanescente",
    );
    for (const lot of result.lots) {
      const area = polygonAreaPlanarM2(lot[0] ?? []);
      assert.ok(area > 80, `lote complementar pequeno demais: ${area.toFixed(1)}`);
      assert.ok(area < 450, `lote complementar virou cesta: ${area.toFixed(1)}`);
    }
  });

  it("não despeja sobra em área útil quando gera o loteamento", () => {
    const result = generateLoteamento(RECT, {
      ...PARAMS,
      profundidadeQuadraM: 25,
      testadaMinimaM: 10,
      areaMinimaM2: 250,
      percentAreaUtil: 0,
      viasExistentesExtremidades: true,
    });
    assert.equal(result.areaUtil.length, 0, "sem parâmetro de área útil não deve criar área especial");
    const leftoverArea = result.remanescente.reduce((s, poly) => s + polygonAreaPlanarM2(poly[0] ?? []), 0);
    assert.ok(leftoverArea < 80, `remanescente real demais: ${leftoverArea.toFixed(1)} m²`);
    assert.ok(result.lotes.length >= 8, `esperava preencher a gleba, veio ${result.lotes.length} lotes`);
  });
});

describe("bufferPolylineMeters", () => {
  it("buffer em torno de um segmento tem área aproximada de estádio", () => {
    const line: [number, number][] = [
      [0, 0],
      [100, 0],
    ];
    const width = 30;
    const ring = bufferPolylineMeters(line, width, "both");
    const area = polygonAreaPlanarM2(ring);
    const expected = 100 * (2 * width) + Math.PI * width * width;
    const rel = Math.abs(area - expected) / expected;
    assert.ok(area > 5000, `área ${area} pequena demais`);
    assert.ok(rel < 0.12, `área ${area.toFixed(1)} ≠ estádio ${expected.toFixed(1)} (rel ${rel.toFixed(3)})`);
  });

  it("buffer de um lado fica próximo de retângulo L × largura", () => {
    const line: [number, number][] = [
      [0, 0],
      [80, 0],
    ];
    const ring = bufferPolylineMeters(line, 20, "left");
    const area = polygonAreaPlanarM2(ring);
    const expected = 80 * 20;
    assert.ok(Math.abs(area - expected) / expected < 0.15, `área ${area} ≠ ${expected}`);
  });
});
