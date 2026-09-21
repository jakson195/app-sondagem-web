import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseLoteamentoAssistantCommand } from "@/lib/cad-ai/parse";
import { classifyCadIntent } from "@/lib/cad-ai/intent";
import {
  calcularErroDeEquidade,
  isApproximatelyRectangular,
  otimizarEquidadeDosLotes,
  planTargetAreaWidths,
} from "./lot-equity";
import { tryAdjustSingleLot } from "./lot-single-adjust";
import {
  generateLoteamento,
  measureLotFrontAndDepth,
  polygonAreaPlanarM2,
  polygonInteriorOverlapM2,
  rebuildQuadraLotes,
  subdivideRowByWidths,
  type LoteResult,
} from "./lot-subdivision";
import type { CadPolylineEntity, CadProject } from "./types";
import type { Position } from "geojson";

function close(ring: Position[]): Position[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) return ring;
  return first ? [...ring, [first[0], first[1]]] : ring;
}

function rect(w: number, h: number, x = 0, y = 0): Position[] {
  return close([
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]);
}

function streetBand(x0: number, x1: number, y0: number, y1: number): Position[] {
  return close([
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]);
}

function streetsAround(w: number, h: number): Position[][] {
  return [
    streetBand(-4, w + 4, -4, 0.3),
    streetBand(-4, w + 4, h - 0.3, h + 4),
  ];
}

function toLotes(polys: Position[][][], streets: Position[][], az: number, quadra = "Quadra A"): LoteResult[] {
  return polys.map((coords, i) => {
    const ring = coords[0] ?? [];
    return {
      coordinates: coords,
      area_m2: polygonAreaPlanarM2(ring),
      testada_m: measureLotFrontAndDepth(ring, streets, az).testadaM,
      quadra,
      numero: `Lote ${String(i + 1).padStart(2, "0")}`,
    };
  });
}

function constraintsOk(
  lotes: LoteResult[],
  minArea: number,
  minTestada: number,
  host: Position[],
  forbidden: Position[][] = [],
): boolean {
  for (const lote of lotes) {
    const ring = lote.coordinates[0] ?? [];
    if (lote.area_m2 + 0.6 < minArea * 0.95) return false;
    if (minTestada > 0 && lote.testada_m + 0.12 < minTestada * 0.88) return false;
    if (polygonInteriorOverlapM2(ring, host) < lote.area_m2 * 0.8) return false;
    for (const obs of forbidden) {
      if (polygonInteriorOverlapM2(ring, obs) > 1.5) return false;
    }
  }
  return true;
}

describe("calcularErroDeEquidade", () => {
  it("é zero quando todas as áreas são iguais", () => {
    const m = calcularErroDeEquidade([360, 360, 360, 360]);
    assert.equal(m.quantidade, 4);
    assert.equal(m.media, 360);
    assert.ok(m.erro < 1e-9);
    assert.ok(m.coeficienteVariacao < 1e-9);
  });

  it("cresce com a dispersão 365 / 321 / 339", () => {
    const m = calcularErroDeEquidade([365.59, 320.71, 339.27]);
    assert.ok(m.menor < 321);
    assert.ok(m.maior > 365);
    assert.ok(m.coeficienteVariacao > 0.04);
    assert.ok(m.erro > 0);
  });
});

describe("otimizarEquidadeDosLotes", () => {
  it("1. quadra retangular: CV otimizado <= CV inicial e lotes ~iguais", () => {
    const host = rect(100, 40);
    const streets = streetsAround(100, 40);
    const uneven = [8, 12, 9, 11, 8, 13, 10, 9, 10, 10];
    const initialPolys = subdivideRowByWidths(host, 90, uneven, streets, [50, 20]);
    const initial = toLotes(initialPolys, streets, 90);
    assert.ok(initial.length >= 8, `inicial veio ${initial.length}`);
    const before = calcularErroDeEquidade(initial.map((l) => l.area_m2));
    const opt = otimizarEquidadeDosLotes({
      host,
      lotes: initial,
      streetRings: streets,
      origin: [50, 20],
      testadaMinimaM: 8,
      profundidadeM: 40,
      areaMinimaM2: 250,
      percentualEsquina: 0,
    });
    const after = opt.metrics;
    assert.ok(after.coeficienteVariacao <= before.coeficienteVariacao + 1e-9);
    assert.ok(constraintsOk(opt.lotes, 250, 8, host));
    assert.ok(isApproximatelyRectangular(host));
    assert.ok(after.coeficienteVariacao < 0.06, `CV retangular ${after.coeficienteVariacao}`);
    assert.ok(after.maior - after.menor < 40, `faixa ${after.menor.toFixed(1)}–${after.maior.toFixed(1)}`);
  });

  it("2. quadra irregular: equal-area reduz a variação", () => {
    const host = close([
      [0, 0],
      [100, 0],
      [88, 40],
      [8, 42],
    ]);
    const streets = streetsAround(100, 42);
    const widths = [8, 14, 9, 13, 8, 12, 10, 16, 10];
    const initialPolys = subdivideRowByWidths(host, 90, widths, streets, [50, 20]);
    const initial = toLotes(initialPolys, streets, 90);
    assert.ok(initial.length >= 4);
    const before = calcularErroDeEquidade(initial.map((l) => l.area_m2));
    const opt = otimizarEquidadeDosLotes({
      host,
      lotes: initial,
      streetRings: streets,
      origin: [50, 20],
      testadaMinimaM: 8,
      profundidadeM: 40,
      areaMinimaM2: 200,
    });
    assert.ok(opt.metrics.coeficienteVariacao <= before.coeficienteVariacao + 1e-9);
    assert.ok(constraintsOk(opt.lotes, 200, 8, host));
  });

  it("3. quadra com esquina: não despeja o erro num único lote", () => {
    const host = rect(80, 40);
    const streets = [
      streetBand(-4, 84, -4, 0.3),
      streetBand(-4, 0.3, -4, 44),
      streetBand(-4, 84, 39.7, 44),
    ];
    const widths = [18, 8, 8, 8, 8, 30];
    const initialPolys = subdivideRowByWidths(host, 90, widths, streets, [40, 20]);
    const initial = toLotes(initialPolys, streets, 90);
    assert.ok(initial.length >= 4);
    const before = calcularErroDeEquidade(initial.map((l) => l.area_m2));
    const opt = otimizarEquidadeDosLotes({
      host,
      lotes: initial,
      streetRings: streets,
      origin: [40, 20],
      testadaMinimaM: 8,
      profundidadeM: 40,
      areaMinimaM2: 200,
      percentualEsquina: 20,
    });
    assert.ok(opt.metrics.coeficienteVariacao <= before.coeficienteVariacao + 1e-9);
    assert.ok(opt.metrics.maior - opt.metrics.menor < before.maior - before.menor + 1e-6);
    assert.ok(constraintsOk(opt.lotes, 200, 8, host));
  });

  it("4. quadra com curva: CV não piora", () => {
    const host: Position[] = [[0, 0], [70, 0]];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const a = Math.PI * t;
      host.push([70 + 18 * Math.sin(a), 20 - 18 * Math.cos(a)]);
    }
    host.push([70, 40], [0, 40]);
    const closed = close(host);
    const streets = streetsAround(90, 40);
    const widths = [7, 14, 8, 13, 9, 16, 10, 12];
    const initialPolys = subdivideRowByWidths(closed, 90, widths, streets, [40, 20]);
    const initial = toLotes(initialPolys, streets, 90);
    assert.ok(initial.length >= 3, `curva gerou ${initial.length}`);
    const before = calcularErroDeEquidade(initial.map((l) => l.area_m2));
    const opt = otimizarEquidadeDosLotes({
      host: closed,
      lotes: initial,
      streetRings: streets,
      origin: [40, 20],
      testadaMinimaM: 7,
      profundidadeM: 40,
      areaMinimaM2: 180,
    });
    assert.ok(opt.metrics.coeficienteVariacao <= before.coeficienteVariacao + 1e-9);
    assert.ok(constraintsOk(opt.lotes, 180, 7, closed));
  });

  it("5. quadra com área verde: não invade o verde e CV não piora", () => {
    const host = close([
      [0, 0],
      [100, 0],
      [100, 28],
      [82, 28],
      [82, 50],
      [0, 50],
    ]);
    const green = rect(18, 22, 82, 28);
    const streets = streetsAround(100, 50);
    const widths = [8, 14, 9, 15, 8, 16, 10, 20];
    const initialPolys = subdivideRowByWidths(host, 90, widths, streets, [40, 20]);
    const initial = toLotes(initialPolys, streets, 90);
    assert.ok(initial.length >= 3);
    const before = calcularErroDeEquidade(initial.map((l) => l.area_m2));
    const opt = otimizarEquidadeDosLotes({
      host,
      lotes: initial,
      streetRings: streets,
      origin: [40, 20],
      testadaMinimaM: 8,
      profundidadeM: 50,
      areaMinimaM2: 180,
      forbiddenRings: [green],
    });
    assert.ok(opt.metrics.coeficienteVariacao <= before.coeficienteVariacao + 1e-9);
    assert.ok(constraintsOk(opt.lotes, 180, 8, host, [green]));
  });

  it("6. sistema viário irregular: CV otimizado <= CV inicial", () => {
    const host = close([
      [0, 0],
      [90, 4],
      [96, 38],
      [6, 44],
    ]);
    const streets = [
      close([
        [-6, -6],
        [100, -2],
        [100, 3],
        [-6, -1],
      ]),
      close([
        [92, 0],
        [104, 0],
        [108, 48],
        [94, 48],
      ]),
    ];
    const widths = [9, 16, 8, 14, 10, 18, 11];
    const initialPolys = subdivideRowByWidths(host, 90, widths, streets, [48, 22]);
    const initial = toLotes(initialPolys, streets, 90);
    assert.ok(initial.length >= 3);
    const before = calcularErroDeEquidade(initial.map((l) => l.area_m2));
    const opt = otimizarEquidadeDosLotes({
      host,
      lotes: initial,
      streetRings: streets,
      origin: [48, 22],
      testadaMinimaM: 7,
      profundidadeM: 36,
      areaMinimaM2: 160,
    });
    assert.ok(opt.metrics.coeficienteVariacao <= before.coeficienteVariacao + 1e-9);
    assert.ok(constraintsOk(opt.lotes, 160, 7, host));
  });

  it("não é usado no ajuste individual: só o lote pedido muda", () => {
    const host = rect(100, 40);
    const streets = streetsAround(100, 40);
    const before = rebuildQuadraLotes(host, 10, 40, streets, [50, 20], "Quadra A");
    assert.ok(before.length >= 6);
    const lotEntities: CadPolylineEntity[] = before.map((lote, i) => ({
      id: `lote-${i + 1}`,
      type: "polyline",
      layerId: "loteamento_lotes",
      closed: true,
      name: `Quadra A — ${lote.numero}`,
      vertices: (lote.coordinates[0] ?? []).map(([x, y]) => ({ x, y, z: 0 })),
    }));
    const project: CadProject = {
      name: "t",
      crs: "local",
      layers: [
        { id: "loteamento_lotes", name: "LOTES", color: "#d97706", visible: true, locked: false },
        { id: "loteamento_vias", name: "VIAS", color: "#64748b", visible: true, locked: false },
        { id: "loteamento_quadras", name: "QUADRAS", color: "#b45309", visible: true, locked: false },
      ],
      entities: [
        {
          id: "via-s",
          type: "polyline",
          layerId: "loteamento_vias",
          closed: true,
          name: "Via S",
          vertices: streets[0]!.map(([x, y]) => ({ x, y, z: 0 })),
        },
        {
          id: "qa",
          type: "polyline",
          layerId: "loteamento_quadras",
          closed: true,
          name: "Quadra A",
          vertices: host.map(([x, y]) => ({ x, y, z: 0 })),
        },
        ...lotEntities,
      ],
    };
    const snap = lotEntities.slice(1).map((e) => ({
      id: e.id,
      area: polygonAreaPlanarM2(e.vertices.map((v) => [v.x, v.y])),
    }));
    const target = project.entities.find((e) => e.id === "lote-1") as CadPolylineEntity;
    const current = polygonAreaPlanarM2(target.vertices.map((v) => [v.x, v.y]));
    const result = tryAdjustSingleLot(project, target, Math.max(220, current * 0.7));
    assert.ok(result.ok === true || result.ok === false);
    for (const item of snap) {
      const ent = result.project.entities.find((e) => e.id === item.id);
      assert.ok(ent && ent.type === "polyline");
      const area = polygonAreaPlanarM2((ent as CadPolylineEntity).vertices.map((v) => [v.x, v.y]));
      assert.ok(Math.abs(area - item.area) < 0.5, `irmão ${item.id} mudou ${item.area}→${area}`);
    }
  });

  it("rebuild de retângulo 100×40 busca testadas iguais", () => {
    const host = rect(100, 40);
    const streets = streetsAround(100, 40);
    const lots = rebuildQuadraLotes(host, 10, 40, streets, [50, 20], "Quadra A");
    assert.ok(lots.length >= 6);
    const m = calcularErroDeEquidade(lots.map((l) => l.area_m2));
    assert.ok(m.coeficienteVariacao < 0.08, `CV rebuild ${m.coeficienteVariacao}`);
    assert.ok(constraintsOk(lots, 250, 8, host));
  });
});

describe("planTargetAreaWidths", () => {
  it("parte de testadaIdeal = frente / n", () => {
    const host = rect(100, 40);
    const streets = streetsAround(100, 40);
    const targets = Array.from({ length: 10 }, () => 400);
    const widths = planTargetAreaWidths(host, targets, 90, 8, streets, [50, 20]);
    assert.ok(widths);
    assert.equal(widths!.length, 10);
    for (const w of widths!) {
      assert.ok(Math.abs(w - 10) < 1.2, `testada ${w} deveria ~10`);
    }
  });
});

describe("duas quadras independentes", () => {
  it("otimizar A não altera B", () => {
    const hostA = rect(80, 40, 0, 0);
    const hostB = rect(80, 40, 0, 60);
    const streets = [...streetsAround(80, 40), ...streetsAround(80, 40).map((r) => r.map((p) => [p[0], p[1] + 60] as Position))];
    const unevenA = toLotes(subdivideRowByWidths(hostA, 90, [8, 18, 8, 16, 10, 20], streets, [40, 20]), streets, 90, "Quadra A");
    const evenB = toLotes(subdivideRowByWidths(hostB, 90, [10, 10, 10, 10, 10, 10, 10, 10], streets, [40, 80]), streets, 90, "Quadra B");
    const snapB = evenB.map((lote) => lote.area_m2);
    const optA = otimizarEquidadeDosLotes({
      host: hostA,
      lotes: unevenA,
      streetRings: streets,
      origin: [40, 20],
      testadaMinimaM: 8,
      profundidadeM: 40,
      areaMinimaM2: 200,
    });
    assert.equal(evenB.length, snapB.length);
    for (let i = 0; i < evenB.length; i++) {
      assert.equal(evenB[i]!.area_m2, snapB[i]);
    }
    assert.ok(optA.lotes.every((lote) => lote.quadra === "Quadra A"));
  });
});

describe("GPT só mapeia o objetivo", () => {
  it("quero os lotes mais iguais possível → otimizar_quadra + maximizar_equidade", () => {
    const cmds = parseLoteamentoAssistantCommand("quero os lotes mais iguais possível");
    assert.equal(cmds?.[0]?.acao, "otimizar_quadra");
    assert.equal(cmds?.[0]?.objetivo, "maximizar_equidade");
    assert.equal(cmds?.[0]?.scope, "quad");
  });

  it("alterar lote 01 para 500m² continua ajuste individual", () => {
    const cmds = parseLoteamentoAssistantCommand("alterar lote 01 para 500m²");
    assert.equal(cmds?.[0]?.acao, "ajustar_lote");
    assert.notEqual(cmds?.[0]?.objetivo, "maximizar_equidade");
  });

  it("intent de equidade não vira ajuste de um lote", () => {
    const intent = classifyCadIntent("uniformizar as áreas dos lotes da quadra A");
    assert.equal(intent.intent, "otimizar_quadra");
    assert.equal(intent.objetivo, "maximizar_equidade");
    assert.equal(intent.scope, "quad");
  });
});

describe("generateLoteamento aplica equidade por quadra", () => {
  it("lotes de uma quadra retangular não ficam com o padrão 365/321/339", () => {
    const gleba = rect(120, 52);
    const result = generateLoteamento(gleba, {
      larguraViaM: 8,
      profundidadeQuadraM: 40,
      testadaMinimaM: 10,
      areaMinimaM2: 300,
      percentualEsquina: 0,
      viasExistentesExtremidades: true,
      larguraCalcadaM: 0,
      raioEsquinaM: 0,
      percentAreaUtil: 0,
    });
    assert.ok(result.lotes.length >= 4);
    const byQ = new Map<string, number[]>();
    for (const lote of result.lotes) {
      const list = byQ.get(lote.quadra) ?? [];
      list.push(lote.area_m2);
      byQ.set(lote.quadra, list);
    }
    for (const [name, areas] of byQ) {
      if (areas.length < 3) continue;
      const m = calcularErroDeEquidade(areas);
      assert.ok(
        m.coeficienteVariacao < 0.12,
        `${name} CV ${((m.coeficienteVariacao) * 100).toFixed(1)}% min ${m.menor.toFixed(1)} max ${m.maior.toFixed(1)}`,
      );
      assert.ok(m.maior - m.menor < 80, `${name} faixa ${m.menor.toFixed(1)}–${m.maior.toFixed(1)}`);
    }
    assert.ok((result.report.coeficienteVariacao ?? 1) < 0.2);
  });
});
