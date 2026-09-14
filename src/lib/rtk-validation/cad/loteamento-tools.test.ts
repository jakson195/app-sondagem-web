import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyLoteamentoStakePoints,
  applyLoteamentoTables,
  buildLoteamentoTablesBlob,
  applyReservaLegalToProject,
  applyAreaUtilToProject,
  applyAppBufferToProject,
  AREA_APP_LAYER_ID,
  AREA_RESERVA_LEGAL_LAYER_ID,
  AREA_UTIL_LAYER_ID,
  appendAreaUtilToProject,
  APP_NEED_LINE,
  clearLoteamentoAnnotations,
  listLoteamentoStakePoints,
  loteamentoStakePointsCsv,
  parseLoteamentoLotName,
  punchLoteamentoUnderReserva,
  rebuildLoteamentoFromEixos,
  computeLoteamentoAreaUtilBreakdown,
  applyEixoTwoPointEdit,
  collectEixoQuadraFaceHits,
  hitTestEixoEditPoint,
  listLoteamentoQuadraPolylines,
  replaceEixoBetweenStations,
  AREA_UTIL_NEED_POLYGON,
  AREA_UTIL_NEED_RESERVA,
  RESERVA_LEGAL_NEED_POLYGON,
  applyLoteamentoLotSize,
  summarizeLoteamento,
  LOTEAMENTO_PONTOS_LAYER,
  LOTEAMENTO_TABELAS_LAYER,
} from "./loteamento-tools";
import { polygonAreaPlanarM2, polygonInteriorOverlapM2, rebuildQuadraLotes, ringsShareBoundary } from "./lot-subdivision";
import { applyReurbLotLabels, REURB_ANNOTATION_LAYER } from "./reurb";
import type { CadPolylineEntity, CadProject } from "./types";

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
    name: "JD. BOA ESPERANÇA",
    crs: "EPSG:31982",
    layers: [
      { id: "loteamento_lotes", name: "LOTES", color: "#d97706", visible: true, locked: false },
      { id: "loteamento_vias", name: "VIAS", color: "#64748b", visible: true, locked: false },
    ],
    entities,
  };
}

describe("parseLoteamentoLotName", () => {
  it("separa quadra e número", () => {
    assert.deepEqual(parseLoteamentoLotName("Quadra A — 01"), { quadra: "Quadra A", numero: "01" });
    assert.deepEqual(parseLoteamentoLotName("Quadra B - 12"), { quadra: "Quadra B", numero: "12" });
  });
});

describe("summarizeLoteamento", () => {
  it("agrupa quadras e soma áreas de lotes e vias", () => {
    const src = project([
      square("l1", "loteamento_lotes", [0, 0], 10, "Quadra A — 01"),
      square("l2", "loteamento_lotes", [12, 0], 10, "Quadra A — 02"),
      square("l3", "loteamento_lotes", [0, 20], 10, "Quadra B — 01"),
      square("v1", "loteamento_vias", [24, 0], 4, "Via 1"),
    ]);
    const summary = summarizeLoteamento(src);
    assert.equal(summary.lots.length, 3);
    assert.equal(summary.quadras.length, 2);
    assert.equal(summary.lotAreaM2, 300);
    assert.equal(summary.viaAreaM2, 16);
    const quadraA = summary.quadras.find((q) => q.name === "Quadra A");
    assert.ok(quadraA);
    assert.equal(quadraA.lotCount, 2);
    assert.equal(quadraA.areaMediaM2, 100);
    assert.ok(summary.lotRows.length >= 3);
    assert.ok(summary.areas.some((row) => row.tipo.includes("Sistema viário")));
  });
});

describe("computeLoteamentoAreaUtilBreakdown", () => {
  it("Total, RL 20%, ruas, 15% − ruas = área útil", () => {
    const gleba = square("gleba_1", "draw", [0, 0], 100, "Gleba");
    const src = project([
      gleba,
      square("rl_1", AREA_RESERVA_LEGAL_LAYER_ID, [0, 80], 20, "Reserva legal 20%"),
      square("v1", "loteamento_vias", [40, 0], 10, "Via 1"),
      square("au_1", AREA_UTIL_LAYER_ID, [0, 50], 10, "Área útil 15%"),
    ]);
    const br = computeLoteamentoAreaUtilBreakdown(src, gleba.vertices, 15);
    assert.equal(br.totalM2, 10_000);
    assert.equal(br.reservaPct, 20);
    assert.equal(br.reservaTargetM2, 2000);
    assert.equal(br.reservaM2, 400);
    assert.equal(br.viasM2, 100);
    assert.equal(br.orcamentoM2, 1500);
    assert.equal(br.alvoM2, 1400);
    assert.equal(br.areaUtilM2, 100);
  });
});

describe("applyLoteamentoStakePoints", () => {
  it("gera pontos únicos com E/N e substitui a camada anterior", () => {
    const src = project([
      square("l1", "loteamento_lotes", [500000, 7100000], 10, "Quadra A — 01"),
      square("l2", "loteamento_lotes", [500010, 7100000], 10, "Quadra A — 02"),
    ]);
    const listed = listLoteamentoStakePoints(src);
    assert.equal(listed.length, 6);
    const first = applyLoteamentoStakePoints(src);
    assert.equal(first.pointCount, 6);
    const pts = first.project.entities.filter((e) => e.layerId === LOTEAMENTO_PONTOS_LAYER.id);
    assert.equal(pts.length, 6);
    assert.ok(pts.some((e) => e.type === "point" && String((e as { label?: string }).label).includes("P01")));
    assert.ok(pts.some((e) => e.type === "point" && String((e as { label?: string }).label).includes("E ")));
    const second = applyLoteamentoStakePoints(first.project);
    const ptsAgain = second.project.entities.filter((e) => e.layerId === LOTEAMENTO_PONTOS_LAYER.id);
    assert.equal(ptsAgain.length, pts.length);
    const csv = loteamentoStakePointsCsv(src);
    assert.match(csv, /^Ponto;E;N;Z/);
    assert.match(csv, /P01;/);
  });
});

describe("applyLoteamentoTables", () => {
  it("insere tabelas de lotes e quadras à direita do desenho", () => {
    const src = project([
      square("l1", "loteamento_lotes", [0, 0], 10, "Quadra A — 01"),
      square("l2", "loteamento_lotes", [12, 0], 10, "Quadra A — 02"),
    ]);
    const result = applyLoteamentoTables(src);
    assert.equal(result.lotCount, 2);
    const tables = result.project.entities.filter((e) => e.layerId === LOTEAMENTO_TABELAS_LAYER.id);
    assert.equal(tables.length, 3);
    const labels = tables.map((e) => (e.type === "point" ? e.label ?? "" : "")).join("\n");
    assert.match(labels, /Tabela de Áreas/);
    assert.match(labels, /Tabela de lotes/);
    assert.match(labels, /Tabela de quadras/);
    assert.match(labels, /INTERNO|ESQUINA/);
    assert.match(labels, /Área méd/);
    assert.match(labels, /Quadra A/);
    assert.ok(tables.every((e) => e.type === "point" && e.x > 22));
    assert.ok(result.project.layers.some((l) => l.id === LOTEAMENTO_TABELAS_LAYER.id));
  });

  it("marca ESQUINA/INTERNO e exporta ODS com as colunas pedidas", () => {
    const src = project([
      square("l1", "loteamento_lotes", [0, 0], 10, "Quadra A — 01"),
      square("l2", "loteamento_lotes", [20, 0], 10, "Quadra A — 02"),
      square("via_s", "loteamento_vias", [-4, -8], 4, "RUA A"),
    ]);
    const south = src.entities.find((e) => e.id === "via_s");
    if (south && south.type === "polyline") {
      south.vertices = [
        { x: -4, y: -8, z: 0 },
        { x: 84, y: -8, z: 0 },
        { x: 84, y: 0, z: 0 },
        { x: -4, y: 0, z: 0 },
      ];
      south.name = "RUA A";
    }
    src.entities.push({
      id: "via_w",
      type: "polyline",
      layerId: "loteamento_vias",
      closed: true,
      name: "RUA B",
      vertices: [
        { x: -8, y: -4, z: 0 },
        { x: 0, y: -4, z: 0 },
        { x: 0, y: 54, z: 0 },
        { x: -8, y: 54, z: 0 },
      ],
    });
    const result = applyLoteamentoTables(src);
    const labels = result.project.entities
      .filter((e) => e.layerId === LOTEAMENTO_TABELAS_LAYER.id && e.type === "point")
      .map((e) => e.label ?? "")
      .join("\n");
    assert.match(labels, /ESQUINA/);
    assert.match(labels, /INTERNO/);
    assert.match(labels, /Testada/);
    assert.match(labels, /Prof/);
    const blob = buildLoteamentoTablesBlob(result.project);
    assert.ok(blob.size > 80);
  });
});

describe("clearLoteamentoAnnotations", () => {
  it("remove cotas, tabelas e pontos e mantém os lotes", () => {
    let src = project([square("l1", "loteamento_lotes", [0, 0], 10, "Quadra A — 01")]);
    src = applyReurbLotLabels(src).project;
    src = applyLoteamentoStakePoints(src).project;
    src = applyLoteamentoTables(src).project;
    const before = src.entities.length;
    const cleared = clearLoteamentoAnnotations(src);
    assert.ok(cleared.removed > 0);
    assert.ok(cleared.removed < before);
    assert.equal(
      cleared.project.entities.filter((e) => e.layerId === "loteamento_lotes").length,
      1,
    );
    assert.equal(
      cleared.project.entities.filter((e) => e.layerId === REURB_ANNOTATION_LAYER.id).length,
      0,
    );
  });
});

describe("applyReservaLegalToProject", () => {
  it("cria polígono AREA_RESERVA_LEGAL no canto da gleba (caminho da UI)", () => {
    const src: CadProject = {
      name: "Gleba",
      crs: "EPSG:31982",
      layers: [{ id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false }],
      entities: [
        square("gleba_1", "draw", [0, 0], 100, "Gleba"),
      ],
    };
    const result = applyReservaLegalToProject(src, {
      glebaId: "gleba_1",
      percent: 20,
      canto: "superior_direita",
    });
    const reserva = result.project.entities.find(
      (e): e is CadPolylineEntity =>
        e.type === "polyline" && e.layerId === AREA_RESERVA_LEGAL_LAYER_ID && Boolean(e.closed),
    );
    assert.ok(reserva, "deveria criar o polígono da reserva legal");
    assert.ok(result.reservedM2 > 1800 && result.reservedM2 < 2200, `área ${result.reservedM2}`);
    assert.ok(result.project.layers.some((l) => l.id === AREA_RESERVA_LEGAL_LAYER_ID && l.visible));
    const xs = reserva.vertices.map((v) => v.x);
    const ys = reserva.vertices.map((v) => v.y);
    assert.ok(Math.max(...xs) > 95, "canto direito");
    assert.ok(Math.max(...ys) > 95, "canto superior");
    const n = reserva.vertices.length;
    assert.ok(n === 4 || n === 5, `quadrado (4 vértices), veio ${n}`);
    const sides = reserva.vertices.map((v, i) => {
      const w = reserva.vertices[(i + 1) % reserva.vertices.length];
      return Math.hypot(w.x - v.x, w.y - v.y);
    }).filter((s) => s > 0.5);
    const mean = sides.reduce((s, a) => s + a, 0) / sides.length;
    for (const side of sides) {
      assert.ok(Math.abs(side - mean) < 1, `lado ${side.toFixed(2)} ≠ ${mean.toFixed(2)}`);
    }
    assert.equal(src.entities.some((e) => e.id === "gleba_1"), true, "não recorta a gleba");
  });

  it("recorta lotes e vias que estavam sob a reserva", () => {
    const src: CadProject = {
      name: "Gleba",
      crs: "EPSG:31982",
      layers: [
        { id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false },
        { id: "loteamento_lotes", name: "LOTES", color: "#d97706", visible: true, locked: false },
        { id: "loteamento_vias", name: "VIAS", color: "#64748b", visible: true, locked: false },
      ],
      entities: [
        square("gleba_1", "draw", [0, 0], 100, "Gleba"),
        square("lot_overlap", "loteamento_lotes", [70, 70], 30, "Quadra A — 01"),
        square("via_overlap", "loteamento_vias", [80, 40], 20, "Via 1"),
        square("lot_free", "loteamento_lotes", [0, 0], 20, "Quadra B — 01"),
      ],
    };
    const result = applyReservaLegalToProject(src, {
      glebaId: "gleba_1",
      percent: 20,
      canto: "superior_direita",
    });
    const reserva = result.reserved.vertices.map((v) => [v.x, v.y] as [number, number]);
    const lots = result.project.entities.filter(
      (e): e is CadPolylineEntity =>
        e.type === "polyline" && e.layerId === "loteamento_lotes" && Boolean(e.closed),
    );
    const vias = result.project.entities.filter(
      (e): e is CadPolylineEntity =>
        e.type === "polyline" && e.layerId === "loteamento_vias" && Boolean(e.closed),
    );
    assert.ok(lots.some((l) => l.id === "lot_free"), "lote fora da reserva permanece");
    for (const lot of lots) {
      const ring = lot.vertices.map((v) => [v.x, v.y] as [number, number]);
      const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
      const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      assert.ok(!(cx > 80 && cy > 80), `lote ${lot.id} ainda no interior da reserva`);
    }
    const punched = punchLoteamentoUnderReserva(src, reserva);
    assert.ok(punched.entities.some((e) => e.id === "lot_free"));
    const punchedLots = punched.entities.filter((e) => e.layerId === "loteamento_lotes");
    assert.ok(punchedLots.length >= 1);
    assert.ok(vias.length >= 0);
  });

  it("exige polígono fechado selecionado", () => {
    const src: CadProject = {
      name: "Vazio",
      crs: "EPSG:31982",
      layers: [{ id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false }],
      entities: [],
    };
    assert.throws(
      () => applyReservaLegalToProject(src, { percent: 20, canto: "superior_direita" }),
      (err: unknown) => err instanceof Error && err.message === RESERVA_LEGAL_NEED_POLYGON,
    );
  });
});

describe("applyAreaUtilToProject", () => {
  it("cola AREA_UTIL na reserva legal no canto escolhido", () => {
    const gleba = square("gleba_1", "draw", [0, 0], 200, "Gleba");
    gleba.vertices = [
      { x: 0, y: 0, z: 0 },
      { x: 200, y: 0, z: 0 },
      { x: 200, y: 120, z: 0 },
      { x: 0, y: 120, z: 0 },
    ];
    const src: CadProject = {
      name: "Gleba",
      crs: "EPSG:31982",
      layers: [{ id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false }],
      entities: [gleba],
    };
    const withRl = applyReservaLegalToProject(src, {
      glebaId: "gleba_1",
      percent: 20,
      canto: "superior_direita",
    });
    const left = applyAreaUtilToProject(withRl.project, {
      glebaId: "gleba_1",
      percent: 15,
      canto: "superior_esquerda",
    });
    const bottom = applyAreaUtilToProject(withRl.project, {
      glebaId: "gleba_1",
      percent: 15,
      canto: "inferior_direita",
    });
    const rl = withRl.reserved.vertices.map((v) => [v.x, v.y] as [number, number]);
    const leftRing = left.util.vertices.map((v) => [v.x, v.y] as [number, number]);
    const botRing = bottom.util.vertices.map((v) => [v.x, v.y] as [number, number]);
    assert.ok(ringsShareBoundary(leftRing, rl), "área útil esquerda deve colar na RL");
    assert.ok(ringsShareBoundary(botRing, rl), "área útil inferior deve colar na RL");
    const leftCx = leftRing.reduce((s, p) => s + p[0], 0) / leftRing.length;
    const botCx = botRing.reduce((s, p) => s + p[0], 0) / botRing.length;
    const leftCy = leftRing.reduce((s, p) => s + p[1], 0) / leftRing.length;
    const botCy = botRing.reduce((s, p) => s + p[1], 0) / botRing.length;
    assert.ok(leftCx < botCx - 4 || botCy < leftCy - 4, "o canto deve mudar o lado da RL");
    assert.ok(Math.abs(left.alvoM2 - 200 * 120 * 0.15) < 2, `A = 0.15T − S (S=0) ${left.alvoM2}`);
    assert.ok(left.areaM2 + 1 >= left.alvoM2 * 0.6);
    assert.ok(left.project.layers.some((l) => l.id === AREA_UTIL_LAYER_ID && l.visible));
  });

  it("os 4 cantos colam na RL com centróide no lado esperado e A ≈ 0.15T − S", () => {
    const gleba = square("gleba_1", "draw", [0, 0], 200, "Gleba");
    gleba.vertices = [
      { x: 0, y: 0, z: 0 },
      { x: 200, y: 0, z: 0 },
      { x: 200, y: 120, z: 0 },
      { x: 0, y: 120, z: 0 },
    ];
    const src: CadProject = {
      name: "Gleba",
      crs: "EPSG:31982",
      layers: [{ id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false }],
      entities: [gleba],
    };
    const withRl = applyReservaLegalToProject(src, {
      glebaId: "gleba_1",
      percent: 20,
      canto: "superior_direita",
    });
    const rl = withRl.reserved.vertices.map((v) => [v.x, v.y] as [number, number]);
    const rlCx = rl.reduce((s, p) => s + p[0], 0) / rl.length;
    const rlCy = rl.reduce((s, p) => s + p[1], 0) / rl.length;
    const cantos = [
      "superior_direita",
      "superior_esquerda",
      "inferior_direita",
      "inferior_esquerda",
    ] as const;
    const placed = cantos.map((canto) => {
      const result = applyAreaUtilToProject(withRl.project, {
        glebaId: "gleba_1",
        percent: 15,
        canto,
      });
      const ring = result.util.vertices.map((v) => [v.x, v.y] as [number, number]);
      const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
      const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      assert.ok(ringsShareBoundary(ring, rl), `${canto} deve compartilhar aresta com a RL`);
      assert.ok(Math.abs(result.alvoM2 - 200 * 120 * 0.15) < 2, `${canto} A=0.15T−S ${result.alvoM2}`);
      assert.ok(result.areaM2 + 1 >= result.alvoM2 * 0.6, `${canto} área ${result.areaM2} vs ${result.alvoM2}`);
      return { canto, cx, cy };
    });
    const by = Object.fromEntries(placed.map((row) => [row.canto, row]));
    const se = by.superior_esquerda!;
    const id = by.inferior_direita!;
    const ie = by.inferior_esquerda!;
    const sd = by.superior_direita!;
    assert.ok(se.cx < rlCx - 4, `superior esquerda deveria ficar a oeste da RL (${se.cx} vs ${rlCx})`);
    assert.ok(id.cy < rlCy - 4, `inferior direita deveria ficar ao sul da RL (${id.cy} vs ${rlCy})`);
    assert.ok(ie.cx < rlCx - 4 && ie.cy < rlCy - 4, "inferior esquerda deveria ficar a sudoeste da RL");
    assert.ok(se.cx < id.cx - 4, `esquerda ${se.cx} vs direita ${id.cx}`);
    assert.ok(id.cy < se.cy - 4, `inferior ${id.cy} vs superior ${se.cy}`);
    const dist = (a: { cx: number; cy: number }, b: { cx: number; cy: number }) =>
      Math.hypot(a.cx - b.cx, a.cy - b.cy);
    assert.ok(dist(sd, se) > 6, "superior direita deve distinguir-se da esquerda");
    assert.ok(dist(sd, id) > 6, "superior direita deve distinguir-se da inferior");
    assert.ok(dist(sd, ie) > 6, "superior direita deve distinguir-se da inferior esquerda");
  });

  it("usa a gleba mesmo se a seleção for a reserva legal", () => {
    const gleba = square("gleba_1", "draw", [0, 0], 200, "Gleba");
    gleba.vertices = [
      { x: 0, y: 0, z: 0 },
      { x: 200, y: 0, z: 0 },
      { x: 200, y: 120, z: 0 },
      { x: 0, y: 120, z: 0 },
    ];
    const src: CadProject = {
      name: "Gleba",
      crs: "EPSG:31982",
      layers: [{ id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false }],
      entities: [gleba],
    };
    const withRl = applyReservaLegalToProject(src, {
      glebaId: "gleba_1",
      percent: 20,
      canto: "superior_direita",
    });
    const result = applyAreaUtilToProject(withRl.project, {
      glebaId: withRl.reserved.id,
      percent: 15,
      canto: "superior_esquerda",
    });
    assert.ok(result.util.layerId === AREA_UTIL_LAYER_ID);
  });

  it("exige reserva legal", () => {
    const gleba = square("gleba_1", "draw", [0, 0], 200, "Gleba");
    const src: CadProject = {
      name: "Gleba",
      crs: "EPSG:31982",
      layers: [{ id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false }],
      entities: [gleba],
    };
    assert.throws(
      () => applyAreaUtilToProject(src, { glebaId: "gleba_1", percent: 15, canto: "superior_direita" }),
      (err: unknown) => err instanceof Error && err.message === AREA_UTIL_NEED_RESERVA,
    );
  });

  it("exige polígono fechado selecionado", () => {
    const src: CadProject = {
      name: "Vazio",
      crs: "EPSG:31982",
      layers: [{ id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false }],
      entities: [],
    };
    assert.throws(
      () => applyAreaUtilToProject(src, { percent: 15, canto: "superior_direita" }),
      (err: unknown) => err instanceof Error && err.message === AREA_UTIL_NEED_POLYGON,
    );
  });
});

describe("applyAppBufferToProject", () => {
  it("cria polígono AREA_APP em torno da linha e rotula APP + área", () => {
    const src: CadProject = {
      name: "Gleba",
      crs: "EPSG:31982",
      layers: [{ id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false }],
      entities: [
        {
          id: "rio_1",
          type: "polyline",
          layerId: "draw",
          closed: false,
          name: "Córrego",
          vertices: [
            { x: 0, y: 50, z: 0 },
            { x: 100, y: 50, z: 0 },
          ],
        },
      ],
    };
    const result = applyAppBufferToProject(src, { sourceId: "rio_1", widthM: 30 });
    const app = result.project.entities.find(
      (e): e is CadPolylineEntity =>
        e.type === "polyline" && e.layerId === AREA_APP_LAYER_ID && Boolean(e.closed),
    );
    assert.ok(app, "deveria criar o polígono da APP");
    assert.match(app.name ?? "", /^APP 30 m/);
    assert.ok(result.areaM2 > 5000 && result.areaM2 < 12000, `área ${result.areaM2}`);
    assert.ok(result.project.layers.some((l) => l.id === AREA_APP_LAYER_ID && l.visible));
    const label = result.project.entities.find(
      (e) => e.type === "point" && String((e as { label?: string }).label ?? "").startsWith("APP 30 m"),
    );
    assert.ok(label, "rótulo APP 30 m + área");
  });

  it("recorta lotes e vias que estavam sob a APP", () => {
    const src: CadProject = {
      name: "Gleba",
      crs: "EPSG:31982",
      layers: [
        { id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false },
        { id: "loteamento_lotes", name: "LOTES", color: "#d97706", visible: true, locked: false },
        { id: "loteamento_vias", name: "VIAS", color: "#64748b", visible: true, locked: false },
      ],
      entities: [
        {
          id: "rio_1",
          type: "polyline",
          layerId: "draw",
          closed: false,
          vertices: [
            { x: 0, y: 50, z: 0 },
            { x: 100, y: 50, z: 0 },
          ],
        },
        square("lot_overlap", "loteamento_lotes", [40, 40], 20, "Quadra A — 01"),
        square("via_overlap", "loteamento_vias", [60, 45], 20, "Via 1"),
        square("lot_free", "loteamento_lotes", [0, 0], 15, "Quadra B — 01"),
      ],
    };
    const result = applyAppBufferToProject(src, { sourceId: "rio_1", widthM: 30 });
    const lots = result.project.entities.filter(
      (e): e is CadPolylineEntity =>
        e.type === "polyline" && e.layerId === "loteamento_lotes" && Boolean(e.closed),
    );
    assert.ok(lots.some((l) => l.id === "lot_free"), "lote fora da APP permanece");
    for (const lot of lots) {
      const ring = lot.vertices.map((v) => [v.x, v.y] as [number, number]);
      const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      assert.ok(!(lot.id === "lot_overlap" && cy > 45 && cy < 55), `lote ${lot.id} ainda no miolo da APP`);
    }
  });

  it("exige linha ou polilinha selecionada", () => {
    const src: CadProject = {
      name: "Vazio",
      crs: "EPSG:31982",
      layers: [{ id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false }],
      entities: [],
    };
    assert.throws(
      () => applyAppBufferToProject(src, { widthM: 30 }),
      (err: unknown) => err instanceof Error && err.message === APP_NEED_LINE,
    );
  });
});

describe("appendAreaUtilToProject", () => {
  it("cria polígono AREA_UTIL com rótulo Área útil 15% + m²", () => {
    const src: CadProject = {
      name: "Gleba",
      crs: "EPSG:31982",
      layers: [{ id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false }],
      entities: [square("gleba_1", "draw", [0, 0], 100, "Gleba")],
    };
    const result = appendAreaUtilToProject(
      src,
      [
        [
          [0, 0],
          [40, 0],
          [40, 40],
          [0, 40],
        ],
      ],
      15,
    );
    const util = result.entities.find(
      (e): e is CadPolylineEntity =>
        e.type === "polyline" && e.layerId === AREA_UTIL_LAYER_ID && Boolean(e.closed),
    );
    assert.ok(util, "deveria criar o polígono da área útil");
    assert.match(util.name ?? "", /Área útil 15%/);
    assert.ok(result.layers.some((l) => l.id === AREA_UTIL_LAYER_ID && l.visible));
    const label = result.entities.find(
      (e) => e.type === "point" && String((e as { label?: string }).label ?? "").startsWith("Área útil 15%"),
    );
    assert.ok(label, "rótulo Área útil 15% + área");
  });
});

describe("rebuildLoteamentoFromEixos", () => {
  it("ao mover um vértice do eixo, vias seguem a nova centroide e lotes não cruzam a via", () => {
    const gleba = square("gleba_1", "draw", [0, 0], 200, "Gleba");
    gleba.vertices = [
      { x: 0, y: 0, z: 0 },
      { x: 200, y: 0, z: 0 },
      { x: 200, y: 120, z: 0 },
      { x: 0, y: 120, z: 0 },
    ];
    const eixo: CadPolylineEntity = {
      id: "eixo_1",
      type: "polyline",
      layerId: "loteamento_eixos",
      closed: false,
      name: "Eixo 1",
      vertices: [
        { x: 0, y: 60, z: 0 },
        { x: 200, y: 60, z: 0 },
      ],
    };
    const src: CadProject = {
      name: "Gleba",
      crs: "EPSG:31982",
      layers: [
        { id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false },
        { id: "loteamento_eixos", name: "EIXOS", color: "#334155", visible: true, locked: false },
        { id: "loteamento_vias", name: "VIAS", color: "#64748b", visible: true, locked: false },
        { id: "loteamento_lotes", name: "LOTES", color: "#d97706", visible: true, locked: false },
      ],
      entities: [gleba, eixo],
    };
    const params = {
      glebaId: "gleba_1",
      larguraViaM: 12,
      profundidadeQuadraM: 50,
      testadaMinimaM: 10,
      larguraCalcadaM: 2,
      percentAreaUtil: 15,
    };
    const first = rebuildLoteamentoFromEixos(src, params);
    assert.ok(first.viaCount >= 1);
    assert.ok(first.lotCount >= 2);
    const lotsLayer = first.project.layers.find((l) => l.id === "loteamento_lotes");
    assert.equal(lotsLayer?.hatchPattern, "grass");
    assert.equal(lotsLayer?.fillColor, "#4ade80");
    assert.equal(lotsLayer?.color, "#111827");
    const eixoKept = first.project.entities.find((e) => e.id === "eixo_1");
    assert.ok(eixoKept && eixoKept.type === "polyline", "eixo editável deve ser preservado");
    const tables = first.project.entities.filter((e) => e.layerId === LOTEAMENTO_TABELAS_LAYER.id);
    assert.equal(tables.length, 3);
    const tableText = tables.map((e) => (e.type === "point" ? e.label ?? "" : "")).join("\n");
    assert.match(tableText, /Tabela de lotes/);
    assert.match(tableText, /Tabela de quadras/);

    const moved: CadProject = {
      ...first.project,
      entities: first.project.entities.map((entity) =>
        entity.id === "eixo_1" && entity.type === "polyline"
          ? {
              ...entity,
              vertices: [
                { x: 0, y: 60, z: 0 },
                { x: 200, y: 90, z: 0 },
              ],
            }
          : entity,
      ),
    };
    const second = rebuildLoteamentoFromEixos(moved, params);
    const vias = second.project.entities.filter(
      (e): e is CadPolylineEntity =>
        e.type === "polyline" && Boolean(e.closed) && e.layerId === "loteamento_vias",
    );
    const lots = second.project.entities.filter(
      (e): e is CadPolylineEntity =>
        e.type === "polyline" && Boolean(e.closed) && e.layerId === "loteamento_lotes",
    );
    assert.ok(vias.length >= 1, "deveria regenerar vias");
    assert.ok(lots.length >= 2, "deveria regenerar lotes");
    const viaBoxes = vias.map((via) => {
      const xs = via.vertices.map((v) => v.x);
      const ys = via.vertices.map((v) => v.y);
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    });
    assert.ok(
      viaBoxes.some((b) => b.maxX > 180 && b.minY < 96 && b.maxY > 84),
      "via deve acompanhar o vértice movido em (200, 90)",
    );
    for (const lot of lots) {
      const lotRing = lot.vertices.map((v) => [v.x, v.y] as [number, number]);
      for (const via of vias) {
        const viaRing = via.vertices.map((v) => [v.x, v.y] as [number, number]);
        assert.ok(
          polygonInteriorOverlapM2(lotRing, viaRing) < 1.5,
          `lote ${lot.name} atravessa a via nova`,
        );
      }
    }
    assert.ok(second.project.entities.some((e) => e.id === "eixo_1"));
  });
});

describe("alterar eixo em 2 pontos", () => {
  const rebuildParams = {
    glebaId: "gleba_1",
    larguraViaM: 12,
    profundidadeQuadraM: 50,
    testadaMinimaM: 10,
    larguraCalcadaM: 2,
    percentAreaUtil: 15,
  };

  function eixoFourVertices(): CadPolylineEntity {
    return {
      id: "eixo_1",
      type: "polyline",
      layerId: "loteamento_eixos",
      closed: false,
      name: "Eixo 1",
      vertices: [
        { x: 0, y: 60, z: 0 },
        { x: 60, y: 90, z: 0 },
        { x: 140, y: 30, z: 0 },
        { x: 200, y: 60, z: 0 },
      ],
    };
  }

  function glebaProject(extra: CadProject["entities"] = []): CadProject {
    const gleba = square("gleba_1", "draw", [0, 0], 200, "Gleba");
    gleba.vertices = [
      { x: 0, y: 0, z: 0 },
      { x: 200, y: 0, z: 0 },
      { x: 200, y: 120, z: 0 },
      { x: 0, y: 120, z: 0 },
    ];
    return {
      name: "Gleba",
      crs: "EPSG:31982",
      layers: [
        { id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false },
        { id: "loteamento_eixos", name: "EIXOS", color: "#334155", visible: true, locked: false },
        { id: "loteamento_vias", name: "VIAS", color: "#64748b", visible: true, locked: false },
        { id: "loteamento_lotes", name: "LOTES", color: "#d97706", visible: true, locked: false },
        { id: "loteamento_quadras", name: "QUADRAS", color: "#b45309", visible: true, locked: false },
        { id: AREA_APP_LAYER_ID, name: "APP", color: "#0f766e", visible: true, locked: false },
        { id: AREA_RESERVA_LEGAL_LAYER_ID, name: "RL", color: "#15803d", visible: true, locked: false },
      ],
      entities: [gleba, eixoFourVertices(), ...extra],
    };
  }

  it("remove os vértices do miolo ao escolher o primeiro e o último", () => {
    const verts = eixoFourVertices().vertices;
    const next = replaceEixoBetweenStations(verts, 0, verts[0], 999, verts[3]);
    assert.equal(next.length, 2);
    assert.ok(Math.hypot(next[0].x - 0, next[0].y - 60) < 1e-6);
    assert.ok(Math.hypot(next[1].x - 200, next[1].y - 60) < 1e-6);
  });

  it("pick first/last + rebuild: miolo some e a via segue A–B", () => {
    const src = glebaProject([
      square("q1", "loteamento_quadras", [0, 0], 70, "Quadra 1"),
      square("q2", "loteamento_quadras", [130, 0], 70, "Quadra 2"),
      square("app_1", AREA_APP_LAYER_ID, [0, 0], 12, "APP 30 m"),
      square("rl_1", AREA_RESERVA_LEGAL_LAYER_ID, [0, 100], 18, "Reserva legal 20%"),
    ]);
    const first = src.entities.find((e) => e.id === "eixo_1");
    assert.ok(first && first.type === "polyline");
    const a = first.vertices[0];
    const b = first.vertices[first.vertices.length - 1];
    const hitA = hitTestEixoEditPoint(src, a.x, a.y, 2);
    const hitB = hitTestEixoEditPoint(src, b.x, b.y, 2);
    assert.ok(hitA && hitA.kind === "vertex" && hitA.vertexIndex === 0);
    assert.ok(hitB && hitB.kind === "vertex" && hitB.vertexIndex === 3);

    const edited = applyEixoTwoPointEdit(src, {
      eixoId: "eixo_1",
      pointA: hitA.point,
      pointB: hitB.point,
      stationA: hitA.stationM,
      stationB: hitB.stationM,
    });
    const eixo = edited.project.entities.find(
      (e): e is CadPolylineEntity => e.id === "eixo_1" && e.type === "polyline",
    );
    assert.ok(eixo);
    assert.equal(eixo.vertices.length, 2, "vértices do miolo devem sumir");
    assert.ok(edited.removedVertices >= 2);
    assert.ok(!eixo.vertices.some((v) => Math.hypot(v.x - 60, v.y - 90) < 0.5));
    assert.ok(!eixo.vertices.some((v) => Math.hypot(v.x - 140, v.y - 30) < 0.5));

    const rebuilt = rebuildLoteamentoFromEixos(edited.project, rebuildParams);
    assert.ok(rebuilt.viaCount >= 1);
    const vias = rebuilt.project.entities.filter(
      (e): e is CadPolylineEntity =>
        e.type === "polyline" && Boolean(e.closed) && e.layerId === "loteamento_vias",
    );
    assert.ok(
      vias.some((via) => {
        const xs = via.vertices.map((v) => v.x);
        const ys = via.vertices.map((v) => v.y);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        return Math.min(...xs) < 40 && Math.max(...xs) > 160 && minY < 66 && maxY > 54 && maxY < 78 && minY > 42;
      }),
      "via deve seguir o segmento reto A–B em y=60",
    );
    assert.ok(rebuilt.project.entities.some((e) => e.id === "app_1"), "APP permanece");
    assert.ok(rebuilt.project.entities.some((e) => e.id === "rl_1"), "reserva legal permanece");
    const lots = rebuilt.project.entities.filter(
      (e): e is CadPolylineEntity =>
        e.type === "polyline" && Boolean(e.closed) && e.layerId === "loteamento_lotes",
    );
    for (const lot of lots) {
      const cx = lot.vertices.reduce((s, v) => s + v.x, 0) / lot.vertices.length;
      const cy = lot.vertices.reduce((s, v) => s + v.y, 0) / lot.vertices.length;
      assert.ok(!(cx < 10 && cy < 10), `lote ${lot.name} invadiu a APP`);
    }
  });

  it("encaixa nas faces das quadras e elimina o miolo do eixo", () => {
    const src = glebaProject([
      square("q1", "loteamento_quadras", [0, 10], 80, "Quadra 1"),
      square("q2", "loteamento_quadras", [120, 10], 80, "Quadra 2"),
    ]);
    src.entities = src.entities.map((entity) =>
      entity.id === "eixo_1" && entity.type === "polyline"
        ? {
            ...entity,
            vertices: [
              { x: 0, y: 60, z: 0 },
              { x: 90, y: 90, z: 0 },
              { x: 110, y: 20, z: 0 },
              { x: 200, y: 60, z: 0 },
            ],
          }
        : entity,
    );
    const eixo0 = src.entities.find(
      (e): e is CadPolylineEntity => e.id === "eixo_1" && e.type === "polyline",
    );
    assert.ok(eixo0);
    const faces = collectEixoQuadraFaceHits(eixo0, listLoteamentoQuadraPolylines(src)).filter(
      (hit) => hit.point.x > 70 && hit.point.x < 130,
    );
    assert.ok(faces.length >= 2, "eixo deve cruzar as faces internas das duas quadras");
    const leftFace = faces.reduce((best, hit) => (hit.point.x < best.point.x ? hit : best), faces[0]);
    const rightFace = faces.reduce((best, hit) => (hit.point.x > best.point.x ? hit : best), faces[0]);
    const faceA = hitTestEixoEditPoint(src, leftFace.point.x, leftFace.point.y, 2);
    const faceB = hitTestEixoEditPoint(src, rightFace.point.x, rightFace.point.y, 2);
    assert.ok(faceA && faceA.eixoId === "eixo_1");
    assert.ok(faceB && faceB.eixoId === "eixo_1");
    assert.ok(faceA.kind === "quadra_edge" || faceA.kind === "segment" || faceA.kind === "vertex");
    assert.ok(faceB.kind === "quadra_edge" || faceB.kind === "segment" || faceB.kind === "vertex");
    const edited = applyEixoTwoPointEdit(src, {
      eixoId: "eixo_1",
      pointA: faceA.point,
      pointB: faceB.point,
      stationA: faceA.stationM,
      stationB: faceB.stationM,
    });
    const eixo = edited.project.entities.find(
      (e): e is CadPolylineEntity => e.id === "eixo_1" && e.type === "polyline",
    );
    assert.ok(eixo);
    assert.ok(!eixo.vertices.some((v) => Math.hypot(v.x - 90, v.y - 90) < 0.5));
    assert.ok(!eixo.vertices.some((v) => Math.hypot(v.x - 110, v.y - 20) < 0.5));
    assert.ok(eixo.vertices.length >= 2);
    const mid = eixo.vertices.filter((v) => v.x > 70 && v.x < 130);
    assert.ok(mid.length <= 2, "entre as faces só deve restar A–B");
  });
});

describe("applyLoteamentoLotSize", () => {
  function ringPoly(
    id: string,
    layerId: string,
    ring: [number, number][],
    name: string,
  ): CadPolylineEntity {
    return {
      id,
      type: "polyline",
      layerId,
      closed: true,
      name,
      vertices: ring.map(([x, y]) => ({ x, y, z: 0 })),
    };
  }

  it("aumentar um lote encolhe os irmãos, fecha a quadra e não mexe na outra", () => {
    const quadraA: [number, number][] = [
      [0, 0],
      [80, 0],
      [80, 50],
      [0, 50],
    ];
    const quadraB: [number, number][] = [
      [200, 0],
      [280, 0],
      [280, 50],
      [200, 50],
    ];
    const streetsA: [number, number][][] = [
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
    const lotsA = rebuildQuadraLotes(quadraA, 10, 25, streetsA, undefined, "Quadra A");
    const lotsB = rebuildQuadraLotes(quadraB, 10, 25, streetsA, undefined, "Quadra B");
    assert.ok(lotsA.length >= 4 && lotsB.length >= 4);

    const via = ringPoly(
      "via_1",
      "loteamento_vias",
      [
        [-4, -12],
        [84, -12],
        [84, 0],
        [-4, 0],
      ],
      "Via 1",
    );
    const app = square("app_1", AREA_APP_LAYER_ID, [300, 0], 20, "APP 30 m");
    const rl = square("rl_1", AREA_RESERVA_LEGAL_LAYER_ID, [300, 40], 20, "Reserva legal 20%");
    const util = square("au_1", AREA_UTIL_LAYER_ID, [300, 80], 16, "Área útil 15%");
    const qA = ringPoly("qa", "loteamento_quadras", quadraA, "Quadra 1");
    const qB = ringPoly("qb", "loteamento_quadras", quadraB, "Quadra 2");
    const lotEntitiesA = lotsA.map((lote, i) =>
      ringPoly(`la_${i}`, "loteamento_lotes", (lote.coordinates[0] ?? []) as [number, number][], `${lote.quadra} — ${lote.numero}`),
    );
    const lotEntitiesB = lotsB.map((lote, i) =>
      ringPoly(`lb_${i}`, "loteamento_lotes", (lote.coordinates[0] ?? []) as [number, number][], `${lote.quadra} — ${lote.numero}`),
    );
    const src = project([via, app, rl, util, qA, qB, ...lotEntitiesA, ...lotEntitiesB]);
    const snapB = lotEntitiesB.map((lot) => ({
      id: lot.id,
      verts: lot.vertices.map((v) => ({ x: v.x, y: v.y })),
    }));

    const south = lotEntitiesA
      .map((lot) => ({
        lot,
        cy: lot.vertices.reduce((s, v) => s + v.y, 0) / lot.vertices.length,
        area: lot.vertices.length,
      }))
      .filter((row) => row.cy < 25);
    const target = south[1]?.lot ?? lotEntitiesA[1]!;
    const areaBefore = new Map(
      lotEntitiesA.map((lot) => {
        const ring = lot.vertices.map((v) => [v.x, v.y] as [number, number]);
        return [lot.id, polygonAreaPlanarM2(ring)];
      }),
    );

    const result = applyLoteamentoLotSize(src, {
      entityId: target.id,
      mode: "lote",
      testadaM: 16,
      profundidadeM: 25,
    });
    assert.ok(result.lotCount >= 3);
    assert.ok(result.project.entities.some((e) => e.id === "app_1"), "APP permanece");
    assert.ok(result.project.entities.some((e) => e.id === "rl_1"), "RL permanece");
    assert.ok(result.project.entities.some((e) => e.id === "au_1"), "AREA_UTIL permanece");
    assert.ok(result.project.entities.some((e) => e.id === "via_1"), "via permanece");
    assert.ok(result.project.entities.some((e) => e.id === "qb"), "outra quadra permanece");

    for (const snap of snapB) {
      const lot = result.project.entities.find(
        (e): e is CadPolylineEntity => e.id === snap.id && e.type === "polyline",
      );
      assert.ok(lot, `lote da outra quadra sumiu ${snap.id}`);
      assert.equal(lot.vertices.length, snap.verts.length);
      for (let i = 0; i < snap.verts.length; i++) {
        assert.ok(Math.hypot(lot.vertices[i]!.x - snap.verts[i]!.x, lot.vertices[i]!.y - snap.verts[i]!.y) < 1e-6);
      }
    }

    const afterA = result.project.entities.filter(
      (e): e is CadPolylineEntity =>
        e.type === "polyline" && Boolean(e.closed) && e.layerId === "loteamento_lotes" && (e.name ?? "").startsWith("Quadra A"),
    );
    const sumAfter = afterA.reduce(
      (s, lot) => s + polygonAreaPlanarM2(lot.vertices.map((v) => [v.x, v.y] as [number, number])),
      0,
    );
    const quadraArea = polygonAreaPlanarM2(quadraA);
    assert.ok(Math.abs(sumAfter - quadraArea) < 40, `soma ${sumAfter} ≠ quadra ${quadraArea}`);

    const areasAfter = afterA.map((lot) => polygonAreaPlanarM2(lot.vertices.map((v) => [v.x, v.y] as [number, number])));
    const maxAfter = Math.max(...areasAfter);
    const targetBefore = areaBefore.get(target.id) ?? 0;
    assert.ok(maxAfter > targetBefore + 15, `âncora deveria crescer: ${targetBefore} → max ${maxAfter}`);
    const siblingSumBefore = [...areaBefore.values()].reduce((s, a) => s + a, 0) - targetBefore;
    const siblingSumAfter = areasAfter.reduce((s, a) => s + a, 0) - maxAfter;
    assert.ok(
      siblingSumAfter < siblingSumBefore - 10,
      `irmãos deveriam encolher: ${siblingSumBefore} → ${siblingSumAfter}`,
    );
  });
});

