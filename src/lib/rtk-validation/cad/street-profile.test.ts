import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addGreidePiv,
  buildSecaoTipoGeometry,
  buildStreetAlignments,
  computeProfileEarthwork,
  defaultSecaoTipo,
  interpolateGreideZ,
  sampleSecaoTipo,
  secaoTipoFromInputs,
  streetDraftFromTerrainProfile,
  updateGreidePiv,
  applyStandaloneSecaoTipo,
  LOTEAMENTO_SECAO_LAYER,
} from "./street-profile";
import type { CadPolylineEntity } from "./types";

function eixo(id: string, a: [number, number], b: [number, number], name: string): CadPolylineEntity {
  return {
    id,
    type: "polyline",
    layerId: "loteamento_eixos",
    closed: false,
    name,
    vertices: [
      { x: a[0], y: a[1], z: 800 },
      { x: b[0], y: b[1], z: 800 },
    ],
  };
}

describe("buildStreetAlignments", () => {
  it("detecta cruzamento e nomeia o encontro nas duas ruas", () => {
    const streets = buildStreetAlignments([
      eixo("e1", [0, 0], [100, 0], "Eixo 1"),
      eixo("e2", [50, -40], [50, 40], "Eixo 2"),
    ]);
    assert.equal(streets.length, 2);
    const hits = streets.flatMap((s) => s.intersections);
    assert.ok(hits.length >= 2);
    assert.ok(hits.every((h) => Math.abs(h.x - 50) < 0.6 && Math.abs(h.y) < 0.6));
    assert.ok(hits.some((h) => h.streetNames.length >= 1));
  });

  it("detecta encontro em T sem atravessar a rua transversal", () => {
    const streets = buildStreetAlignments([
      eixo("main", [0, 0], [80, 0], "Avenida"),
      eixo("stem", [40, 0], [40, 30], "Rua lateral"),
    ]);
    assert.equal(streets.length, 2);
    const main = streets.find((s) => s.vertices.some((v) => v.x < 5));
    const stem = streets.find((s) => s !== main);
    assert.ok(main && stem);
    assert.ok(main.intersections.length >= 1);
    assert.ok(stem.intersections.length >= 1);
    const mainLen = main.vertices.reduce((acc, v, i, arr) => {
      if (i === 0) return 0;
      return acc + Math.hypot(v.x - arr[i - 1].x, v.y - arr[i - 1].y);
    }, 0);
    assert.ok(mainLen > 70);
  });

  it("encadeia eixos colineares numa só rua", () => {
    const streets = buildStreetAlignments([
      eixo("a", [0, 0], [40, 0], "Eixo 1"),
      eixo("b", [40, 0], [90, 0], "Eixo 2"),
    ]);
    assert.equal(streets.length, 1);
    assert.ok(streets[0].vertices.length >= 3);
  });
});

describe("greide", () => {
  it("interpola cota entre PIVs e aceita edição", () => {
    const profile = {
      streetId: "r1",
      streetName: "Rua 1",
      alignment: [
        { x: 0, y: 0, z: 10 },
        { x: 100, y: 0, z: 10 },
      ],
      terrain: [
        { x: 0, y: 0, z: 10 },
        { x: 100, y: 0, z: 20 },
      ],
      greide: [
        { id: "a", stationM: 0, z: 10, kind: "start" as const },
        { id: "b", stationM: 100, z: 20, kind: "end" as const },
      ],
      intersections: [],
    };
    assert.equal(interpolateGreideZ(profile.greide, 50), 15);
    const edited = updateGreidePiv(profile, "b", 30);
    assert.equal(interpolateGreideZ(edited.greide, 50), 20);
    const withPiv = addGreidePiv(edited, 40, 12);
    assert.equal(withPiv.greide.length, 3);
  });

  it("calcula área de corte e aterro no perfil", () => {
    const terrain = [
      { x: 0, y: 0, z: 12 },
      { x: 10, y: 0, z: 12 },
      { x: 20, y: 0, z: 8 },
    ];
    const greide = [
      { id: "a", stationM: 0, z: 10, kind: "start" as const },
      { id: "b", stationM: 20, z: 10, kind: "end" as const },
    ];
    const ew = computeProfileEarthwork(terrain, greide);
    assert.ok(ew.cutAreaM2 > 15);
    assert.ok(ew.fillAreaM2 > 5);
  });
});

describe("seção tipo", () => {
  it("monta pista, calçada e talude a partir da via do loteamento", () => {
    const params = defaultSecaoTipo(12, 2);
    assert.equal(params.larguraPistaM, 8);
    assert.equal(params.larguraCalcadaM, 2);
    assert.equal(params.meioFioM, 0.15);
    const samples = sampleSecaoTipo(params, 100, 3);
    assert.ok(samples.some((s) => s.part === "pista"));
    assert.ok(samples.some((s) => s.part === "calcada"));
    assert.ok(samples.some((s) => s.part === "talude"));
    const center = samples.reduce((best, s) => (Math.abs(s.offset) < Math.abs(best.offset) ? s : best));
    assert.ok(Math.abs(center.z - 100) < 0.05);
  });

  it("levanta a calçada pelo meio-fio e diferencia corte e aterro", () => {
    const params = secaoTipoFromInputs({
      pistaM: 8,
      calcadaM: 2,
      declivePistaPct: 2,
      decliveCalcadaPct: 0,
      taludeCorteH: 1.5,
      taludeAterroH: 2,
      meioFioM: 0.15,
      extensaoTaludeM: 3,
    });
    const geo = buildSecaoTipoGeometry(params, 100, 3);
    const crown = geo.platform.find((s) => Math.abs(s.offset) < 1e-9);
    const pistaEdge = geo.platform.find((s) => s.part === "pista" && Math.abs(s.offset - 4) < 1e-9);
    const calcadaInner = geo.platform.find((s) => s.part === "calcada" && Math.abs(s.offset - 4) < 1e-9);
    assert.ok(crown && pistaEdge && calcadaInner);
    assert.ok(Math.abs(crown.z - 100) < 1e-9);
    assert.ok(pistaEdge.z < crown.z);
    assert.ok(Math.abs(calcadaInner.z - (pistaEdge.z + 0.15)) < 1e-9);
    const aterroTip = geo.aterroRight[geo.aterroRight.length - 1];
    const corteTip = geo.corteRight[geo.corteRight.length - 1];
    assert.ok(aterroTip && corteTip);
    assert.ok(aterroTip.z < calcadaInner.z);
    assert.ok(corteTip.z > calcadaInner.z);
  });

  it("grava o projeto da seção-tipo sem eixos de rua", () => {
    const params = secaoTipoFromInputs({ pistaM: 8, calcadaM: 2 });
    const project = applyStandaloneSecaoTipo(
      {
        name: "Teste",
        crs: "SIRGAS2000",
        layers: [],
        entities: [],
      },
      params,
      100,
    );
    const secao = project.entities.filter((e) => e.layerId === LOTEAMENTO_SECAO_LAYER.id);
    assert.equal(secao.length, 1);
    assert.ok(project.layers.some((l) => l.id === LOTEAMENTO_SECAO_LAYER.id));
  });
});

describe("streetDraftFromTerrainProfile", () => {
  it("reaproveita o perfil do terreno no gráfico de rua", () => {
    const draft = streetDraftFromTerrainProfile({
      id: "prof1",
      type: "polyline",
      layerId: "profile",
      closed: false,
      name: "Perfil Rua A",
      vertices: [
        { x: 0, y: 0, z: 100 },
        { x: 40, y: 0, z: 104 },
      ],
    });
    assert.equal(draft.streetName, "Perfil Rua A");
    assert.equal(draft.terrain.length, 2);
    assert.equal(draft.greide.length, 2);
    assert.equal(draft.greide[0].z, 100);
  });
});
