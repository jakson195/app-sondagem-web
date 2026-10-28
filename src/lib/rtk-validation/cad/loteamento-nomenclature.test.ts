import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyLoteamentoNomenclature,
  applyNomenclatureToLoteamentoResult,
  formatQuadraName,
  quadraLetterAt,
  renomearQuadrasAutomaticamente,
  renumerarLotesGlobalmente,
  sortPolygonsSpatially,
  validateUniqueLotNumbers,
} from "./loteamento-nomenclature";
import { applyLoteamentoTables } from "./loteamento-tools";
import type { CadPolylineEntity, CadProject } from "./types";
import type { LoteamentoResult } from "./lot-subdivision";

function square(
  id: string,
  layerId: string,
  origin: [number, number],
  size: number,
  name?: string,
): CadPolylineEntity {
  const [x, y] = origin;
  return {
    id,
    type: "polyline",
    layerId,
    closed: true,
    name,
    vertices: [
      { x, y, z: 0 },
      { x: x + size, y, z: 0 },
      { x: x + size, y: y + size, z: 0 },
      { x, y: y + size, z: 0 },
    ],
  };
}

function project(entities: CadProject["entities"]): CadProject {
  return {
    name: "Teste nomenclatura",
    crs: "EPSG:31982",
    layers: [
      { id: "loteamento_lotes", name: "LOTES", color: "#d97706", visible: true, locked: false },
      { id: "loteamento_quadras", name: "QUADRAS", color: "#b45309", visible: true, locked: false },
      { id: "loteamento_vias", name: "VIAS", color: "#64748b", visible: true, locked: false },
    ],
    entities,
  };
}

function ring(origin: [number, number], w: number, h: number): [number, number][] {
  const [x, y] = origin;
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

describe("quadraLetterAt", () => {
  it("gera A, B, Z, AA", () => {
    assert.equal(quadraLetterAt(0), "A");
    assert.equal(quadraLetterAt(1), "B");
    assert.equal(quadraLetterAt(25), "Z");
    assert.equal(quadraLetterAt(26), "AA");
    assert.equal(formatQuadraName(2), "Quadra C");
  });
});

describe("sortPolygonsSpatially", () => {
  it("nomeia o grid norte→sul e oeste→leste como A B / C D / E F", () => {
    const cells = [
      { id: "f", ring: ring([100, 0], 40, 40) },
      { id: "c", ring: ring([0, 100], 40, 40) },
      { id: "a", ring: ring([0, 200], 40, 40) },
      { id: "e", ring: ring([0, 0], 40, 40) },
      { id: "b", ring: ring([100, 200], 40, 40) },
      { id: "d", ring: ring([100, 100], 40, 40) },
    ];
    const ordered = sortPolygonsSpatially(cells, (item) => item.ring).map((item) => item.id);
    assert.deepEqual(ordered, ["a", "b", "c", "d", "e", "f"]);
  });
});

describe("applyLoteamentoNomenclature", () => {
  it("nomeia a quadra norte como A e a sul como B", () => {
    const src = project([
      square("q-south", "loteamento_quadras", [0, 0], 40, "Quadra 2"),
      square("q-north", "loteamento_quadras", [0, 80], 40, "Quadra 1"),
      square("l1", "loteamento_lotes", [2, 82], 10, "sem nome"),
      square("l2", "loteamento_lotes", [2, 2], 10, "sem nome"),
    ]);
    const named = renomearQuadrasAutomaticamente(src);
    const north = named.entities.find((e) => e.id === "q-north");
    const south = named.entities.find((e) => e.id === "q-south");
    assert.equal(north && north.type === "polyline" ? north.name : "", "Quadra A");
    assert.equal(south && south.type === "polyline" ? south.name : "", "Quadra B");
  });

  it("numera de forma contínua: 13 lotes na A, a B começa no 14", () => {
    const entities: CadProject["entities"] = [
      square("qa", "loteamento_quadras", [0, 80], 140, "Quadra 1"),
      square("qb", "loteamento_quadras", [0, 0], 50, "Quadra 2"),
    ];
    for (let i = 0; i < 13; i++) {
      entities.push(square(`na_${i}`, "loteamento_lotes", [2 + i * 10, 90], 8, `Quadra A — ${String((i % 9) + 1).padStart(2, "0")}`));
    }
    for (let i = 0; i < 4; i++) {
      entities.push(square(`sb_${i}`, "loteamento_lotes", [2 + i * 10, 5], 8, `Quadra B — 0${i + 1}`));
    }
    const src = project(entities);
    const result = applyLoteamentoNomenclature(src);
    assert.equal(result.valid, true);
    const northLots = result.lots.filter((lot) => lot.quadra === "A").sort((a, b) => a.numero - b.numero);
    const southLots = result.lots.filter((lot) => lot.quadra === "B").sort((a, b) => a.numero - b.numero);
    assert.equal(northLots.length, 13);
    assert.equal(southLots.length, 4);
    assert.equal(northLots[0]?.numero, 1);
    assert.equal(northLots[12]?.numero, 13);
    assert.equal(southLots[0]?.numero, 14);
    assert.equal(southLots[3]?.numero, 17);
    assert.equal(new Set(result.lots.map((lot) => lot.numero)).size, 17);
    assert.ok(result.lots.every((lot) => lot.id && !String(lot.id).startsWith("0")));
    const northEntity = result.project.entities.find((e) => e.id === "qa");
    const southEntity = result.project.entities.find((e) => e.id === "qb");
    assert.equal(northEntity && northEntity.type === "polyline" ? northEntity.name : "", "Quadra A");
    assert.equal(southEntity && southEntity.type === "polyline" ? southEntity.name : "", "Quadra B");
  });

  it("é determinística e não altera a geometria nem o id interno", () => {
    const src = project([
      square("qb", "loteamento_quadras", [80, 0], 30, "X"),
      square("qa", "loteamento_quadras", [0, 0], 30, "Y"),
      square("l2", "loteamento_lotes", [85, 5], 8, "foo"),
      square("l1", "loteamento_lotes", [5, 5], 8, "bar"),
    ]);
    const first = applyLoteamentoNomenclature(src);
    const second = applyLoteamentoNomenclature(first.project);
    assert.deepEqual(
      first.lots.map((lot) => ({ id: lot.id, numero: lot.numero, quadra: lot.quadra, name: lot.name })),
      second.lots.map((lot) => ({ id: lot.id, numero: lot.numero, quadra: lot.quadra, name: lot.name })),
    );
    for (const id of ["l1", "l2", "qa", "qb"]) {
      const before = src.entities.find((e) => e.id === id);
      const after = first.project.entities.find((e) => e.id === id);
      assert.ok(before && after && before.type === "polyline" && after.type === "polyline");
      assert.equal(after.id, before.id);
      assert.deepEqual(after.vertices, before.vertices);
    }
  });

  it("corrige duplicidade automaticamente", () => {
    const src = project([
      square("qa", "loteamento_quadras", [0, 0], 40, "Quadra"),
      square("l1", "loteamento_lotes", [2, 2], 8, "Quadra A — 01"),
      square("l2", "loteamento_lotes", [12, 2], 8, "Quadra A — 01"),
    ]);
    src.entities = src.entities.map((entity) =>
      entity.type === "polyline" && entity.layerId === "loteamento_lotes"
        ? { ...entity, lote: { tipo: "INTERNO", areaM2: 64, areaMinimaM2: 64, atende: true, testadaM: 8, profundidadeM: 8, ruas: [], numero: 1, quadra: "A" } }
        : entity,
    );
    const before = validateUniqueLotNumbers(src);
    assert.equal(before.ok, false);
    assert.deepEqual(before.duplicateNumbers, [1]);
    const fixed = applyLoteamentoNomenclature(src);
    assert.equal(fixed.valid, true);
    assert.equal(validateUniqueLotNumbers(fixed.project).ok, true);
    const nums = fixed.lots.map((lot) => lot.numero).sort((a, b) => a - b);
    assert.deepEqual(nums, [1, 2]);
  });

  it("mantém tabela sincronizada com o desenho", () => {
    const entities: CadProject["entities"] = [
      square("qa", "loteamento_quadras", [0, 80], 80, "Quadra 1"),
      square("qb", "loteamento_quadras", [0, 0], 40, "Quadra 2"),
    ];
    for (let i = 0; i < 13; i++) {
      entities.push(square(`a${i}`, "loteamento_lotes", [2 + (i % 7) * 10, 90 + Math.floor(i / 7) * 10], 8));
    }
    entities.push(square("b0", "loteamento_lotes", [2, 5], 8, "Quadra B — 01"));
    const src = project(entities);
    const tables = applyLoteamentoTables(src);
    const lots = tables.project.entities.filter(
      (e): e is CadPolylineEntity => e.type === "polyline" && e.layerId === "loteamento_lotes",
    );
    const numbers = lots.map((lot) => lot.lote?.numero).sort((a, b) => (a ?? 0) - (b ?? 0));
    assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    const bLot = lots.find((lot) => lot.id === "b0");
    assert.equal(bLot?.lote?.numero, 14);
    assert.equal(bLot?.name, "Quadra B — 14");
    const label = tables.project.entities
      .filter((e) => e.type === "point")
      .map((e) => (e.type === "point" ? e.label ?? "" : ""))
      .join("\n");
    assert.match(label, /Quadra A/);
    assert.match(label, /Quadra B/);
    assert.match(label, /14/);
    assert.ok(!/Quadra B[\s\S]{0,40}01/.test(label) || label.includes("14"));
  });

  it("renumerar após a A ganhar lotes desloca o início da B", () => {
    const src = project([
      square("qa", "loteamento_quadras", [0, 80], 80, "Quadra A"),
      square("qb", "loteamento_quadras", [0, 0], 40, "Quadra B"),
      square("a1", "loteamento_lotes", [2, 90], 8),
      square("a2", "loteamento_lotes", [12, 90], 8),
      square("b1", "loteamento_lotes", [2, 5], 8),
    ]);
    const first = applyLoteamentoNomenclature(src);
    assert.equal(first.lots.find((lot) => lot.id === "b1")?.numero, 3);
    const grown: CadProject = {
      ...first.project,
      entities: [
        ...first.project.entities,
        square("a3", "loteamento_lotes", [22, 90], 8),
        square("a4", "loteamento_lotes", [32, 90], 8),
      ],
    };
    const second = renumerarLotesGlobalmente(grown);
    const b = second.entities.find((e) => e.id === "b1");
    assert.equal(b && b.type === "polyline" ? b.lote?.numero : 0, 5);
    assert.equal(b && b.type === "polyline" ? b.name : "", "Quadra B — 05");
  });
});

describe("applyNomenclatureToLoteamentoResult", () => {
  it("não reinicia o número em cada quadra", () => {
    const result = applyNomenclatureToLoteamentoResult({
      vias: [],
      calcadas: [],
      eixos: [],
      areaUtil: [],
      faixaDominio: [],
      remanescente: [],
      quadras: 2,
      areaGlebaM2: 1,
      areaUtilAlvoM2: 1,
      areaUtilOrcamentoM2: 1,
      areaUtilM2: 1,
      areaViasM2: 0,
      areaUrbanizavelM2: 1,
      report: {
        totalLots: 3,
        totalLotArea: 3,
        residualArea: 0,
        minArea: 1,
        maxArea: 1,
        averageArea: 1,
        minDepth: 1,
        maxDepth: 1,
        averageDepth: 1,
        minFrontage: 1,
        maxFrontage: 1,
        invalidLots: [],
        lotsWithoutRoadAccess: 0,
        lotsWithoutFrontage: 0,
        internalStreetCount: 0,
        desvioPadraoArea: 0,
        coeficienteVariacao: 0,
        equityByQuadra: [],
      },
      quadraPolys: [[[...ring([0, 80], 40, 40), [0, 80]]], [[...ring([0, 0], 40, 40), [0, 0]]]],
      lotes: [
        { coordinates: [ring([2, 2], 8, 8)], area_m2: 64, testada_m: 8, quadra: "Quadra B", numero: "Lote 01" },
        { coordinates: [ring([2, 82], 8, 8)], area_m2: 64, testada_m: 8, quadra: "Quadra A", numero: "Lote 01" },
        { coordinates: [ring([12, 82], 8, 8)], area_m2: 64, testada_m: 8, quadra: "Quadra A", numero: "Lote 02" },
      ],
    } as LoteamentoResult);
    const nums = result.lotes.map((lote) => ({ quadra: lote.quadra, numero: lote.numero }));
    const a = nums.filter((item) => item.quadra === "Quadra A").map((item) => item.numero);
    const b = nums.filter((item) => item.quadra === "Quadra B").map((item) => item.numero);
    assert.ok(a.includes("01"));
    assert.ok(a.includes("02"));
    assert.deepEqual(b, ["03"]);
  });
});
