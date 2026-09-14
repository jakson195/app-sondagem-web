import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyTerrainCrossSectionsFromAlignment,
  applyTerrainProfileFromAlignment,
  findSelectedAlignment,
  generateLongitudinalProfileAlongPolyline,
  generateTypicalCrossSections,
  listSelectableAlignments,
  PROFILE_LAYER,
  sampleAlignmentStations,
  terrainElevationCoverage,
  TRANSVERSAL_PROFILE_LAYER,
} from "./profile";
import type { CadEntity, CadLineEntity, CadPointEntity, CadPolylineEntity, CadProject } from "./types";

function poly(id: string, vertices: Array<[number, number, number?]>, name?: string): CadPolylineEntity {
  return {
    id,
    type: "polyline",
    layerId: "eixos",
    closed: false,
    name,
    vertices: vertices.map(([x, y, z]) => ({ x, y, z: z ?? 0 })),
  };
}

function line(id: string, a: [number, number], b: [number, number]): CadLineEntity {
  return {
    id,
    type: "line",
    layerId: "eixos",
    start: { x: a[0], y: a[1], z: 0 },
    end: { x: b[0], y: b[1], z: 0 },
  };
}

function point(id: string, x: number, y: number, z: number): CadPointEntity {
  return { id, type: "point", layerId: "rtk_points", x, y, z, label: id };
}

function project(entities: CadEntity[]): CadProject {
  return {
    name: "Perfil",
    crs: "EPSG:31982",
    layers: [{ id: "eixos", name: "EIXOS", color: "#111", visible: true, locked: false }],
    entities,
  };
}

describe("findSelectedAlignment", () => {
  it("usa a polilinha selecionada e ignora camadas de gráfico", () => {
    const axis = poly("e1", [[0, 0], [80, 0]], "Rua A");
    const chart: CadPolylineEntity = {
      ...poly("p1", [[0, 0, 10], [80, 0, 12]]),
      layerId: PROFILE_LAYER.id,
      name: "Perfil",
    };
    assert.equal(findSelectedAlignment([axis, chart], null), null);
    const hit = findSelectedAlignment([axis, chart], "e1");
    assert.ok(hit);
    assert.equal(hit.name, "Rua A");
    assert.equal(hit.vertices.length, 2);
    assert.equal(findSelectedAlignment([axis, chart], "p1"), null);
  });

  it("aceita linha (2 pontos) como traçado", () => {
    const ln = line("ln1", [0, 0], [40, 30]);
    const hit = findSelectedAlignment([ln], "ln1");
    assert.ok(hit);
    assert.equal(hit.kind, "line");
    assert.equal(hit.vertices.length, 2);
    assert.equal(listSelectableAlignments([ln, poly("c1", [[0, 0]], "curta")]).length, 1);
  });
});

describe("perfil e seções a partir do traçado", () => {
  it("amostra estacas incluindo início e fim", () => {
    const stations = sampleAlignmentStations(
      [
        { x: 0, y: 0, z: 10 },
        { x: 50, y: 0, z: 12 },
      ],
      20,
    );
    assert.ok(stations.length >= 3);
    assert.equal(stations[0].stationM, 0);
    assert.ok(Math.abs(stations[stations.length - 1].stationM - 50) < 1e-6);
  });

  it("gera perfil mesmo sem pontos de cota e marca Z incompleto", () => {
    const axis = poly("e1", [[0, 0], [100, 0]], "Eixo");
    const profile = generateLongitudinalProfileAlongPolyline([axis], axis.vertices, 25);
    assert.ok(profile.vertices.length >= 2);
    assert.equal(profile.layerId, PROFILE_LAYER.id);
    assert.ok(profile.vertices.every((v) => v.y === 0));
    assert.equal(terrainElevationCoverage([axis]).zIncomplete, true);
  });

  it("interpola cotas do levantamento ao longo do eixo", () => {
    const axis = poly("e1", [[0, 0], [100, 0]], "Eixo");
    const pts = [point("P1", 0, 0, 100), point("P2", 50, 0, 110), point("P3", 100, 0, 104)];
    const profile = generateLongitudinalProfileAlongPolyline([...pts, axis], axis.vertices, 50);
    assert.ok(profile.vertices[0].z > 99);
    assert.ok(profile.vertices.some((v) => v.z > 105));
    assert.equal(terrainElevationCoverage([...pts, axis]).zIncomplete, false);
  });

  it("gera uma seção transversal por estaca", () => {
    const axis = poly("e1", [[0, 0], [40, 0]], "Eixo");
    const sections = generateTypicalCrossSections([axis], axis.vertices, 20, 8);
    assert.ok(sections.length >= 2);
    assert.ok(sections.every((s) => s.layerId === TRANSVERSAL_PROFILE_LAYER.id));
    assert.ok(sections.every((s) => s.vertices.length >= 2));
    const first = sections[0];
    const span = first.vertices[first.vertices.length - 1].x - first.vertices[0].x;
    assert.ok(Math.abs(span - 16) < 0.2);
  });

  it("grava perfil e seções no projeto a partir do traçado selecionado", () => {
    const axis = poly("e1", [[0, 0], [60, 0]], "Via");
    const pts = [point("A", 0, 0, 80), point("B", 30, 2, 82), point("C", 60, 0, 81)];
    const base = project([...pts, axis]);
    const profile = applyTerrainProfileFromAlignment(base, "e1", 20);
    assert.equal(profile.zIncomplete, false);
    assert.ok(profile.project.layers.some((l) => l.id === PROFILE_LAYER.id));
    assert.ok(profile.project.entities.some((e) => e.id === profile.profile.id));

    const sections = applyTerrainCrossSectionsFromAlignment(profile.project, "e1", 20, 10);
    assert.ok(sections.sections.length >= 2);
    assert.ok(sections.project.layers.some((l) => l.id === TRANSVERSAL_PROFILE_LAYER.id));
    const again = applyTerrainCrossSectionsFromAlignment(sections.project, "e1", 20, 10);
    const count = again.project.entities.filter((e) => e.layerId === TRANSVERSAL_PROFILE_LAYER.id).length;
    assert.equal(count, again.sections.length);
  });
});
