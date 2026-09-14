import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getLayerLineColor,
  getLayerPolygonFill,
  normalizeCadLayer,
} from "./layer-styles";
import {
  MAQUETE_GLEBA_CLIP,
  MAQUETE_GRASS_MATERIAL,
  buildLoteamentoMaquete,
  createMaqueteGrassTextureData,
  loteamentoMaqueteReadiness,
  maqueteGrassTextureHasVariation,
  pointInMaquetePolys,
  targetMaqueteHouseCount,
} from "./loteamento-maquete";
import type { CadPolylineEntity, CadProject } from "./types";

function rect(
  id: string,
  layerId: string,
  origin: [number, number],
  w: number,
  h: number,
  name?: string,
  closed = true,
): CadPolylineEntity {
  const [x, y] = origin;
  return {
    id,
    type: "polyline",
    layerId,
    closed,
    name,
    vertices: [
      { x, y, z: 0 },
      { x: x + w, y, z: 0 },
      { x: x + w, y: y + h, z: 0 },
      { x, y: y + h, z: 0 },
    ],
  };
}

function line(
  id: string,
  layerId: string,
  a: [number, number],
  b: [number, number],
  name?: string,
): CadPolylineEntity {
  return {
    id,
    type: "polyline",
    layerId,
    closed: false,
    name,
    vertices: [
      { x: a[0], y: a[1], z: 0 },
      { x: b[0], y: b[1], z: 0 },
    ],
  };
}

function project(entities: CadProject["entities"]): CadProject {
  return {
    name: "Maquete test",
    crs: "EPSG:31982",
    layers: [
      { id: "loteamento_lotes", name: "LOTES", color: "#d97706", visible: true, locked: false },
      { id: "loteamento_vias", name: "VIAS", color: "#64748b", visible: true, locked: false },
      { id: "loteamento_calcadas", name: "CALCADAS", color: "#a8a29e", visible: true, locked: false },
      { id: "loteamento_eixos", name: "EIXOS", color: "#eab308", visible: true, locked: false },
      { id: "area_reserva_legal", name: "RESERVA", color: "#15803d", visible: true, locked: false },
    ],
    entities,
  };
}

describe("loteamentoMaqueteReadiness", () => {
  it("fica desabilitada sem vias e lotes", () => {
    const empty = loteamentoMaqueteReadiness(project([]));
    assert.equal(empty.ok, false);
    assert.equal(empty.hasVias, false);
    assert.equal(empty.hasLotes, false);
  });

  it("habilita com vias e lotes mesmo sem reserva", () => {
    const src = project([
      rect("v1", "loteamento_vias", [0, 20], 40, 12),
      rect("l1", "loteamento_lotes", [0, 0], 18, 18, "Quadra A — 01"),
    ]);
    const ready = loteamentoMaqueteReadiness(src);
    assert.equal(ready.ok, true);
    assert.equal(ready.hasReserva, false);
  });
});

describe("buildLoteamentoMaquete", () => {
  it("gera asfalto, meio-fio, lotes, reserva e árvores", () => {
    const src = project([
      rect("v1", "loteamento_vias", [0, 40], 80, 12, "Via 1"),
      rect("l1", "loteamento_lotes", [2, 2], 24, 36, "Quadra A — 01"),
      rect("l2", "loteamento_lotes", [28, 2], 24, 36, "Quadra A — 02"),
      rect("r1", "area_reserva_legal", [80, 0], 50, 50),
      line("e1", "loteamento_eixos", [0, 46], [80, 46], "Rua das Palmeiras"),
    ]);
    const scene = buildLoteamentoMaquete(src, { calcadaM: 2, meioFioM: 0.15, maxTrees: 80 });
    assert.ok(scene);
    assert.ok(scene.asphalt.length >= 1, "asfalto");
    assert.ok(scene.curbs.length >= 4, "meio-fio ao longo das vias");
    assert.equal(scene.lots.length, 2);
    assert.ok(scene.lots.some((lot) => lot.house), "massas das casas nos lotes");
    assert.equal(scene.reserva.length, 1);
    assert.ok(scene.trees.length >= 8, `árvores insuficientes: ${scene.trees.length}`);
    assert.ok(scene.trees.length <= 80);
    assert.equal(scene.streetLabels[0]?.text, "Rua das Palmeiras");
    assert.ok(scene.usedFallbackSidewalk, "calçada derivada da seção-tipo");
    assert.ok(scene.sidewalks.length >= 1, "faixa de calçada");
    assert.ok(
      scene.sidewalks.some((p) => p.holes.length > 0),
      "calçada deve ser a faixa (polígono com furo da pista)",
    );
  });

  it("usa a camada de calçadas quando existe", () => {
    const src = project([
      rect("v1", "loteamento_vias", [0, 0], 40, 12),
      rect("c1", "loteamento_calcadas", [0, 0], 40, 2.2),
      rect("l1", "loteamento_lotes", [0, 14], 20, 25, "Lote 01"),
    ]);
    const scene = buildLoteamentoMaquete(src, { calcadaM: 2 });
    assert.ok(scene);
    assert.equal(scene.usedFallbackSidewalk, false);
    assert.ok(scene.sidewalks.length >= 1);
  });

  it("limita árvores na reserva grande", () => {
    const src = project([
      rect("v1", "loteamento_vias", [0, 0], 20, 8),
      rect("l1", "loteamento_lotes", [0, 10], 20, 30, "Lote 01"),
      rect("r1", "area_reserva_legal", [40, 0], 200, 200),
    ]);
    const scene = buildLoteamentoMaquete(src, { maxTrees: 40 });
    assert.ok(scene);
    assert.ok(scene.trees.length <= 40);
    assert.ok(scene.trees.length > 0);
  });

  it("coloca pessoas nas calçadas, carros nas vias, árvores de calçada e eixo pintado", () => {
    const src = project([
      rect("v1", "loteamento_vias", [0, 40], 140, 14, "Via 1"),
      rect("l1", "loteamento_lotes", [4, 2], 36, 34, "Quadra A — 01"),
      rect("l2", "loteamento_lotes", [44, 2], 36, 34, "Quadra A — 02"),
      rect("r1", "area_reserva_legal", [160, 0], 40, 40),
      line("e1", "loteamento_eixos", [0, 47], [140, 47], "Rua das Palmeiras"),
    ]);
    const scene = buildLoteamentoMaquete(src, { calcadaM: 2, meioFioM: 0.15, maxTrees: 40 });
    assert.ok(scene);
    assert.ok(scene.people.length >= 4, `pessoas insuficientes: ${scene.people.length}`);
    assert.ok(scene.people.length <= 80);
    assert.ok(
      scene.people.every((p) => pointInMaquetePolys(p.x, p.y, scene.sidewalks)),
      "pessoas devem ficar na calçada",
    );
    assert.ok(scene.cars.length >= 2, `carros insuficientes: ${scene.cars.length}`);
    assert.ok(scene.cars.length <= 40);
    assert.ok(
      scene.cars.every((c) => pointInMaquetePolys(c.x, c.y, scene.asphalt)),
      "carros devem ficar no asfalto",
    );
    assert.ok(
      scene.cars.every((c) => Math.abs(Math.cos(c.rotation)) > 0.85),
      "carros alinhados ao eixo da via",
    );
    assert.ok(scene.sidewalkTrees.length >= 2, `árvores de calçada: ${scene.sidewalkTrees.length}`);
    assert.ok(scene.sidewalkTrees.length <= 60);
    assert.ok(
      scene.sidewalkTrees.every((t) => pointInMaquetePolys(t.x, t.y, scene.sidewalks)),
      "árvores de calçada devem ficar na calçada",
    );
    assert.ok(scene.eixos.length >= 1, "eixo da rua");
    assert.ok(scene.eixoDashes.length >= 8, `traços do eixo: ${scene.eixoDashes.length}`);
    assert.ok(
      scene.eixoDashes.every((d) => Math.abs(d.y - 47) < 0.6 && d.length > 1 && d.width > 0.1),
      "eixo pintado no centro da pista",
    );
  });

  it("deriva o eixo da via quando a camada de eixos está vazia", () => {
    const src = project([
      rect("v1", "loteamento_vias", [0, 0], 80, 12),
      rect("c1", "loteamento_calcadas", [0, 0], 80, 2.2),
      rect("l1", "loteamento_lotes", [0, 14], 24, 28, "Lote 01"),
    ]);
    const scene = buildLoteamentoMaquete(src, { calcadaM: 2 });
    assert.ok(scene);
    assert.ok(scene.eixos.length >= 1);
    assert.ok(scene.eixoDashes.length >= 4);
    assert.ok(scene.cars.length >= 1);
    assert.ok(scene.cars.every((c) => pointInMaquetePolys(c.x, c.y, scene.asphalt)));
    assert.ok(scene.people.length >= 1);
    assert.ok(scene.people.every((p) => pointInMaquetePolys(p.x, p.y, scene.sidewalks)));
    assert.ok(scene.sidewalkTrees.length >= 1);
  });

  it("espalha casas em dois tipos e não ocupa todos os lotes", () => {
    const lots = Array.from({ length: 16 }, (_, i) => {
      const col = i % 8;
      const row = Math.floor(i / 8);
      return rect(`l${i}`, "loteamento_lotes", [col * 28, row * 40], 24, 36, `Lote ${i}`);
    });
    const src = project([
      rect("v1", "loteamento_vias", [0, 80], 220, 16, "Via principal"),
      ...lots,
      rect("r1", "area_reserva_legal", [230, 0], 40, 40),
    ]);
    const scene = buildLoteamentoMaquete(src);
    assert.ok(scene);
    const houses = scene.lots.map((l) => l.house).filter((h) => h != null);
    assert.equal(scene.lots.length, 16);
    assert.ok(houses.length < scene.lots.length, "nem todos os lotes devem ter casa");
    assert.ok(houses.length >= 6);
    assert.ok(houses.length <= 32);
    assert.ok(houses.some((h) => h.style === "pitched"), "casas com telhado inclinado");
    assert.ok(houses.some((h) => h.style === "modern"), "casas modernas");
  });

  it("coloca canteiro e palmeiras só na via principal larga", () => {
    const wide = project([
      rect("v1", "loteamento_vias", [0, 0], 160, 18),
      rect("l1", "loteamento_lotes", [0, 22], 30, 30, "Lote 01"),
    ]);
    const wideScene = buildLoteamentoMaquete(wide);
    assert.ok(wideScene);
    assert.ok(wideScene.medians.length >= 1, "canteiro central");
    assert.ok(wideScene.medianPalms.length >= 4, `palmeiras: ${wideScene.medianPalms.length}`);
    assert.ok(wideScene.medianPalms.every((t) => t.kind === "palm"));

    const narrow = project([
      rect("v1", "loteamento_vias", [0, 0], 80, 8),
      rect("l1", "loteamento_lotes", [0, 12], 24, 28, "Lote 01"),
    ]);
    const narrowScene = buildLoteamentoMaquete(narrow);
    assert.ok(narrowScene);
    assert.equal(narrowScene.medians.length, 0);
    assert.equal(narrowScene.medianPalms.length, 0);
  });

  it("limita o número de casas espalhadas no loteamento grande", () => {
    assert.equal(targetMaqueteHouseCount(2), 2);
    assert.equal(targetMaqueteHouseCount(6), 6);
    assert.ok(targetMaqueteHouseCount(200) <= 32);
    assert.ok(targetMaqueteHouseCount(200) >= 20);
  });

  it("usa grama procedural nos lotes e recorta o vazio fora da gleba", () => {
    assert.equal(MAQUETE_GRASS_MATERIAL, true);
    assert.equal(MAQUETE_GLEBA_CLIP, true);
    const grass = createMaqueteGrassTextureData(64);
    assert.equal(grass.length, 64 * 64 * 4);
    assert.ok(maqueteGrassTextureHasVariation(grass), "grama deve ter variação de lâminas/manchas");

    const src = project([
      rect("v1", "loteamento_vias", [0, 40], 80, 12, "Via 1"),
      rect("l1", "loteamento_lotes", [2, 2], 24, 36, "Quadra A — 01"),
      rect("l2", "loteamento_lotes", [28, 2], 24, 36, "Quadra A — 02"),
      rect("r1", "area_reserva_legal", [80, 0], 50, 50),
    ]);
    const scene = buildLoteamentoMaquete(src);
    assert.ok(scene);
    assert.equal(scene.lots.length, 2, "GrassLots recebe um pad por lote");
    assert.ok(scene.gleba.length >= 1, "clip da gleba");
    assert.ok(pointInMaquetePolys(14, 20, scene.gleba), "lote fica dentro da gleba");
    assert.ok(pointInMaquetePolys(40, 46, scene.gleba), "via fica dentro da gleba");
    assert.ok(pointInMaquetePolys(100, 20, scene.gleba), "reserva fica dentro da gleba");
    assert.equal(pointInMaquetePolys(-40, -40, scene.gleba), false, "fora do loteamento fica fora do clip");
    assert.equal(pointInMaquetePolys(200, 200, scene.gleba), false);
  });

  it("estilo 2D de LOTEAMENTO_LOTES é hachura de grama, não laranja", () => {
    const legacy = normalizeCadLayer({
      id: "loteamento_lotes",
      name: "LOTES",
      color: "#d97706",
      visible: true,
      locked: false,
    });
    assert.equal(legacy.hatchPattern, "grass");
    assert.equal(legacy.fillColor, "#4ade80");
    assert.equal(legacy.color, "#111827");
    assert.equal(legacy.textColor, "#111827");
    assert.equal(getLayerPolygonFill(legacy), "url(#cad-hatch-loteamento_lotes)");
    assert.equal(getLayerLineColor(legacy), "#111827");
    assert.notEqual((legacy.fillColor ?? "").toLowerCase(), "#d97706");
  });
});
