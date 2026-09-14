import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultMemorialForm } from "./memorial-types";
import {
  applyReurbLotLabels,
  buildReurbTabularMemorialSheets,
  cloneProjectForLot,
  formatReurbLotNumber,
  listReurbLots,
  REURB_ANNOTATION_LAYER,
  reurbLotSlug,
  summarizeReurbLots,
} from "./reurb";
import type { CadPolylineEntity, CadProject } from "./types";

function square(
  id: string,
  layerId: string,
  origin: [number, number],
  size: number,
  name?: string,
  confrontations?: string[],
): CadPolylineEntity {
  const [x, y] = origin;
  return {
    id,
    type: "polyline",
    layerId,
    closed: true,
    name,
    confrontations,
    vertices: [
      { x, y, z: 10 },
      { x: x + size, y, z: 10 },
      { x: x + size, y: y + size, z: 10 },
      { x, y: y + size, z: 10 },
    ],
  };
}

function baseProject(entities: CadProject["entities"], layers: CadProject["layers"]): CadProject {
  return {
    name: "Núcleo urbano teste",
    crs: "EPSG:31982",
    layers,
    entities,
  };
}

describe("formatReurbLotNumber / slug", () => {
  it("numera Lote 01… e slug lote_01", () => {
    assert.equal(formatReurbLotNumber(0), "Lote 01");
    assert.equal(formatReurbLotNumber(9), "Lote 10");
    assert.equal(reurbLotSlug(0), "lote_01");
    assert.equal(reurbLotSlug(11), "lote_12");
  });
});

describe("listReurbLots", () => {
  it("prioriza polígonos fechados na camada loteamento_lotes", () => {
    const project = baseProject(
      [
        square("g1", "draw", [0, 0], 40, "Gleba"),
        square("l1", "loteamento_lotes", [50, 0], 10, "Q A — 01"),
        square("l2", "loteamento_lotes", [65, 0], 10, "Q A — 02"),
        square("via", "loteamento_vias", [0, 50], 8, "Via 1"),
      ],
      [
        { id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false },
        { id: "loteamento_lotes", name: "LOTES", color: "#d97706", visible: true, locked: false },
        { id: "loteamento_vias", name: "VIAS", color: "#64748b", visible: true, locked: false },
      ],
    );
    const lots = listReurbLots(project);
    assert.equal(lots.length, 2);
    assert.deepEqual(
      lots.map((l) => l.id),
      ["l1", "l2"],
    );
  });

  it("sem loteamento, usa polígonos do usuário e ignora ANM/SIGEF bloqueados", () => {
    const project = baseProject(
      [
        square("u1", "draw", [0, 0], 20, "Polígono 1"),
        square("u2", "draw", [30, 0], 20, "Polígono 2"),
        square("sig", "sigef_particular", [100, 0], 50, "Parcela SIGEF"),
        square("anm", "anm_processos", [200, 0], 50, "Processo ANM"),
        {
          id: "open",
          type: "polyline",
          layerId: "draw",
          closed: false,
          name: "Aberta",
          vertices: [
            { x: 0, y: 0, z: 0 },
            { x: 5, y: 0, z: 0 },
            { x: 5, y: 5, z: 0 },
          ],
        },
      ],
      [
        { id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false },
        { id: "sigef_particular", name: "SIGEF", color: "#22c55e", visible: true, locked: true },
        { id: "anm_processos", name: "ANM", color: "#ef4444", visible: true, locked: true },
      ],
    );
    const lots = listReurbLots(project);
    assert.equal(lots.length, 2);
    assert.deepEqual(
      lots.map((l) => l.id).sort(),
      ["u1", "u2"],
    );
  });
});

describe("applyReurbLotLabels", () => {
  it("renomeia Lote 01/02, insere cotas cadastrais e área, e substitui anotações anteriores", () => {
    const project = baseProject(
      [square("a", "draw", [0, 0], 10), square("b", "draw", [20, 0], 10)],
      [{ id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false }],
    );
    const first = applyReurbLotLabels(project, { includeCotas: true, includeArea: true });
    assert.equal(first.lotCount, 2);
    const named = first.project.entities.filter((e) => e.type === "polyline" && e.closed) as CadPolylineEntity[];
    assert.deepEqual(
      named.map((e) => e.name).sort(),
      ["Lote 01", "Lote 02"],
    );
    const notes = first.project.entities.filter((e) => e.layerId === REURB_ANNOTATION_LAYER.id);
    assert.ok(notes.some((e) => e.type === "point" && String((e as { label?: string }).label) === "1"));
    assert.ok(notes.some((e) => e.type === "point" && String((e as { label?: string }).label).includes("m²")));
    assert.ok(notes.some((e) => e.type === "point" && String((e as { label?: string }).label) === "10,00 m"));
    const dimLines = notes.filter((e) => e.type === "line");
    assert.equal(dimLines.length, 0);
    const edgePts = notes.filter((e) => e.type === "point" && (e as { rotationDeg?: number }).rotationDeg != null);
    assert.ok(edgePts.length >= 8);

    const second = applyReurbLotLabels(first.project, { includeCotas: true, includeArea: true });
    const notesAgain = second.project.entities.filter((e) => e.layerId === REURB_ANNOTATION_LAYER.id);
    assert.equal(notesAgain.length, notes.length);
  });

  it("mantém o nome Quadra — número e desenha o número do lote", () => {
    const project = baseProject(
      [square("a", "loteamento_lotes", [0, 0], 7, "Quadra A — 17")],
      [{ id: "loteamento_lotes", name: "LOTES", color: "#0000FF", visible: true, locked: false }],
    );
    const result = applyReurbLotLabels(project, { includeCotas: true, includeArea: true });
    const lot = result.project.entities.find((e) => e.id === "a") as CadPolylineEntity;
    assert.equal(lot.name, "Quadra A — 17");
    const labels = result.project.entities
      .filter((e) => e.layerId === REURB_ANNOTATION_LAYER.id && e.type === "point")
      .map((e) => (e as { label?: string }).label ?? "");
    assert.ok(labels.includes("17"));
    assert.ok(labels.some((l) => l.includes("m²")));
    assert.ok(labels.includes("7,00 m"));
    const title = result.project.entities.find(
      (e) => e.type === "point" && e.layerId === REURB_ANNOTATION_LAYER.id && e.label === "17",
    );
    const area = result.project.entities.find(
      (e) => e.type === "point" && e.layerId === REURB_ANNOTATION_LAYER.id && String(e.label).includes("m²"),
    );
    const edge = result.project.entities.find(
      (e) => e.type === "point" && e.layerId === REURB_ANNOTATION_LAYER.id && e.label === "7,00 m",
    );
    assert.equal(title && title.type === "point" ? title.textSize : 0, 24);
    assert.equal(area && area.type === "point" ? area.textSize : 0, 30);
    assert.equal(edge && edge.type === "point" ? edge.textSize : 0, 18);
    assert.equal(result.project.layers.find((l) => l.id === REURB_ANNOTATION_LAYER.id)?.textSize, 22);
  });
});

describe("buildReurbTabularMemorialSheets", () => {
  it("monta abas com lotes, vértices E/N e confrontações", () => {
    const project = baseProject(
      [
        square("a", "loteamento_lotes", [500000, 7100000], 20, "Lote 01", ["Rua A", "Lote 02", "Fundo", "Rua B"]),
        square("b", "loteamento_lotes", [500030, 7100000], 20, "Lote 02"),
      ],
      [{ id: "loteamento_lotes", name: "LOTES", color: "#d97706", visible: true, locked: false }],
    );
    const memorial = { ...defaultMemorialForm(), owner: "João Silva", municipality: "Florianópolis", state: "SC" };
    const { sheets, lotCount } = buildReurbTabularMemorialSheets(project, memorial);
    assert.equal(lotCount, 2);
    assert.deepEqual(
      sheets.map((s) => s.name),
      ["Identificacao", "Lotes", "Vertices", "Confrontacoes"],
    );
    const lotes = sheets.find((s) => s.name === "Lotes");
    assert.ok(lotes);
    assert.equal(lotes.rows.length, 3);
    assert.equal(lotes.rows[1]?.[1], "Lote 01");
    assert.equal(lotes.rows[1]?.[7], "João Silva");
    const verts = sheets.find((s) => s.name === "Vertices");
    assert.ok(verts);
    assert.equal(verts.rows.length, 1 + 8);
    assert.equal(verts.rows[1]?.[2], 500000);
    assert.equal(verts.rows[1]?.[3], 7100000);
    const conf = sheets.find((s) => s.name === "Confrontacoes");
    assert.ok(conf);
    assert.equal(conf.rows[1]?.[5], "Rua A");
  });
});

describe("cloneProjectForLot", () => {
  it("isola o lote e as anotações REURB associadas", () => {
    const project = baseProject(
      [square("a", "draw", [0, 0], 10), square("b", "draw", [40, 0], 10)],
      [{ id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false }],
    );
    const labeled = applyReurbLotLabels(project).project;
    const lots = listReurbLots(labeled);
    const clone = cloneProjectForLot(labeled, lots[0], 0);
    const polys = clone.entities.filter((e) => e.type === "polyline");
    assert.equal(polys.length, 1);
    assert.equal(polys[0]?.id, lots[0].id);
    assert.ok(clone.entities.some((e) => e.layerId === REURB_ANNOTATION_LAYER.id));
    assert.equal(summarizeReurbLots(labeled).length, 2);
  });
});
