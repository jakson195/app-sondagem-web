import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCadastralLotPlanTexts,
  diameterMmToPlanCm,
  extractTrailingNumber,
  formatCadastralEdgeDimension,
  formatCadastralLotArea,
  formatCadastralLotCenterLabel,
  formatCadastralLotTitle,
  formatDrainageCotaLine,
  formatDrainageNodeCallout,
  formatDrainageNodePlanId,
  formatPipePlanLabel,
  formatPlanLengthM,
  formatStreetPlanName,
  indexToStreetLetter,
  isAreaQuadroLabel,
  parseCadastralLotNumber,
  planTableQuadroSize,
  readableLabelRotationDeg,
} from "./plan-annotation-labels";
import { pointInPolygon } from "./polygon-utils";
import { cadastralLotFontSizePx } from "./viewport";
import type { CadPolylineEntity } from "./types";

describe("rótulos cadastrais de lote", () => {
  it("monta número 17 e área 143,45 m²", () => {
    assert.equal(formatCadastralLotTitle(17), "17");
    assert.equal(formatCadastralLotArea(143.45), "143,45 m²");
    assert.equal(formatCadastralLotCenterLabel("Quadra A — 17", 143.45), "17\n143,45 m²");
    assert.equal(parseCadastralLotNumber("Quadra B — 11", 0), 11);
    assert.equal(parseCadastralLotNumber("Lote 08", 0), 8);
  });

  it("cota testada e profundidade no estilo 10,00 m e 25,00 m", () => {
    assert.equal(formatCadastralEdgeDimension(10), "10,00 m");
    assert.equal(formatCadastralEdgeDimension(25), "25,00 m");
  });

  it("coloca número na frente, área no centro e só testada/profundidade", () => {
    const lot: CadPolylineEntity = {
      id: "l17",
      type: "polyline",
      layerId: "loteamento_lotes",
      closed: true,
      name: "Quadra A — 17",
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 7, y: 0, z: 0 },
        { x: 7, y: 20, z: 0 },
        { x: 0, y: 20, z: 0 },
      ],
    };
    const texts = buildCadastralLotPlanTexts(lot, 0);
    const labels = texts.map((t) => t.label);
    assert.ok(labels.includes("17"));
    assert.ok(labels.includes("140,00 m²"));
    assert.ok(labels.includes("7,00 m"));
    assert.ok(labels.includes("20,00 m"));
    assert.equal(texts.filter((t) => t.role === "lot-title").length, 1);
    assert.equal(texts.filter((t) => t.role === "lot-area").length, 1);
    const edges = texts.filter((t) => t.role === "lot-edge");
    assert.equal(edges.length, 3);
    assert.equal(edges.filter((e) => e.label === "7,00 m").length, 1);
    assert.equal(edges.filter((e) => e.label === "20,00 m").length, 2);
    for (const edge of edges) {
      assert.ok(edge.x > 0.3 && edge.x < 6.7 && edge.y > 0.3 && edge.y < 19.7, "cota para dentro do lote");
    }
    const title = texts.find((t) => t.role === "lot-title");
    const area = texts.find((t) => t.role === "lot-area");
    assert.ok(title && area);
    assert.ok(Math.hypot(title.x - 3.5, title.y - 10) < 0.2, "número no centro do lote");
    const frontDim = edges.find((e) => e.label === "7,00 m");
    assert.ok(frontDim);
    assert.ok(frontDim.y < 1.2, "cota da frente alinhada à testada");
    assert.ok(title.y > frontDim.y, "círculo mais ao centro que a cota da frente");
    assert.ok(area.y > title.y, "área logo atrás do número, rumo ao fundo");
    for (const edge of edges) {
      assert.ok(
        Math.hypot(area.x - edge.x, area.y - edge.y) >= 1.2,
        `área sobreposta à cota ${edge.label}`,
      );
    }
  });

  it("une segmentos colineares da testada numa só cota", () => {
    const lot: CadPolylineEntity = {
      id: "l46",
      type: "polyline",
      layerId: "loteamento_lotes",
      closed: true,
      name: "Quadra A — 46",
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 3.5, y: 0, z: 0 },
        { x: 7, y: 0, z: 0 },
        { x: 10.5, y: 0, z: 0 },
        { x: 10.5, y: 25, z: 0 },
        { x: 0, y: 25, z: 0 },
      ],
    };
    const street: CadPolylineEntity = {
      id: "via1",
      type: "polyline",
      layerId: "loteamento_vias",
      closed: true,
      name: "Rua Marechal Deodoro",
      vertices: [
        { x: -2, y: -8, z: 0 },
        { x: 14, y: -8, z: 0 },
        { x: 14, y: -0.4, z: 0 },
        { x: -2, y: -0.4, z: 0 },
      ],
    };
    const texts = buildCadastralLotPlanTexts(lot, 0, { streets: [street] });
    const edges = texts.filter((t) => t.role === "lot-edge");
    assert.equal(texts.find((t) => t.role === "lot-title")?.label, "46");
    assert.equal(edges.filter((e) => e.label === "10,50 m").length, 1);
    assert.ok(edges.some((e) => e.label === "25,00 m"));
    assert.ok(edges.length <= 3);
  });

  it("lote de esquina: círculo no miolo e área laranja sem sobrepor", () => {
    const fillet: CadPolylineEntity["vertices"] = [];
    for (let i = 0; i <= 16; i++) {
      const t = (i / 16) * (Math.PI / 2);
      fillet.push({ x: 3 * Math.cos(t), y: 3 * Math.sin(t), z: 0 });
    }
    const lot: CadPolylineEntity = {
      id: "l20",
      type: "polyline",
      layerId: "loteamento_lotes",
      closed: true,
      name: "Quadra A — 20",
      vertices: [...fillet, { x: 0, y: 20, z: 0 }, { x: 10, y: 20, z: 0 }, { x: 10, y: 0, z: 0 }],
    };
    const south: CadPolylineEntity = {
      id: "via-s",
      type: "polyline",
      layerId: "loteamento_vias",
      closed: true,
      vertices: [
        { x: -4, y: -6, z: 0 },
        { x: 14, y: -6, z: 0 },
        { x: 14, y: -0.3, z: 0 },
        { x: -4, y: -0.3, z: 0 },
      ],
    };
    const west: CadPolylineEntity = {
      id: "via-w",
      type: "polyline",
      layerId: "loteamento_vias",
      closed: true,
      vertices: [
        { x: -6, y: -4, z: 0 },
        { x: -0.3, y: -4, z: 0 },
        { x: -0.3, y: 24, z: 0 },
        { x: -6, y: 24, z: 0 },
      ],
    };
    const texts = buildCadastralLotPlanTexts(lot, 0, { streets: [south, west] });
    const title = texts.find((t) => t.role === "lot-title");
    const area = texts.find((t) => t.role === "lot-area");
    assert.ok(title && area);
    assert.ok(Math.hypot(title.x - 5, title.y - 10) < 2.2, `círculo deveria ficar no miolo, veio (${title.x.toFixed(2)}, ${title.y.toFixed(2)})`);
    assert.ok(title.x > 3.2 && title.y > 4, "círculo não pode colar no filete da esquina");
    assert.ok(pointInPolygon(area.x, area.y, lot.vertices), "área laranja saiu do próprio lote");
    assert.ok(area.x < 8.2 && area.x > 2.2, `área foi para o lote vizinho em x=${area.x.toFixed(2)}`);
    assert.ok(
      Math.abs(area.x - title.x) < 1.6,
      `área deslocada para o lado (${area.x.toFixed(2)} vs círculo ${title.x.toFixed(2)})`,
    );
    assert.ok(
      Math.hypot(area.x - title.x, area.y - title.y) >= 1.05,
      `área laranja sobreposta ao círculo (${Math.hypot(area.x - title.x, area.y - title.y).toFixed(2)} m)`,
    );
    for (const edge of texts.filter((t) => t.role === "lot-edge")) {
      assert.ok(
        Math.hypot(area.x - edge.x, area.y - edge.y) >= 1.2,
        `área sobreposta à cota ${edge.label}`,
      );
    }
  });

  it("lote de esquina 10×23: laranja no eixo do lote, não no vizinho", () => {
    const fillet: CadPolylineEntity["vertices"] = [];
    for (let i = 0; i <= 16; i++) {
      const t = (i / 16) * (Math.PI / 2);
      fillet.push({ x: 3 * Math.cos(t), y: 3 * Math.sin(t), z: 0 });
    }
    const lot: CadPolylineEntity = {
      id: "l20b",
      type: "polyline",
      layerId: "loteamento_lotes",
      closed: true,
      name: "Quadra A — 20",
      vertices: [...fillet, { x: 0, y: 23, z: 0 }, { x: 10, y: 23, z: 0 }, { x: 10, y: 0, z: 0 }],
    };
    const south: CadPolylineEntity = {
      id: "via-s",
      type: "polyline",
      layerId: "loteamento_vias",
      closed: true,
      vertices: [
        { x: -4, y: -6, z: 0 },
        { x: 14, y: -6, z: 0 },
        { x: 14, y: -0.3, z: 0 },
        { x: -4, y: -0.3, z: 0 },
      ],
    };
    const west: CadPolylineEntity = {
      id: "via-w",
      type: "polyline",
      layerId: "loteamento_vias",
      closed: true,
      vertices: [
        { x: -6, y: -4, z: 0 },
        { x: -0.3, y: -4, z: 0 },
        { x: -0.3, y: 27, z: 0 },
        { x: -6, y: 27, z: 0 },
      ],
    };
    const texts = buildCadastralLotPlanTexts(lot, 0, { streets: [south, west] });
    const title = texts.find((t) => t.role === "lot-title");
    const area = texts.find((t) => t.role === "lot-area");
    assert.ok(title && area);
    assert.ok(pointInPolygon(area.x, area.y, lot.vertices), "área laranja saiu do próprio lote");
    assert.ok(area.x < 8, `texto laranja atravessou para o terreno do lado (x=${area.x.toFixed(2)})`);
    assert.ok(Math.abs(area.x - title.x) < 0.8, "laranja deve ficar no eixo do círculo, não na divisa");
    assert.ok(area.y > title.y, "área logo atrás do número, rumo ao fundo");
  });

  it("área laranja fica menor que o número e cabe no miolo do lote", () => {
    const viewport = { minX: 0, maxX: 200, minY: 0, maxY: 120, width: 1200, height: 800, padding: 40 };
    const title = cadastralLotFontSizePx(viewport, "lot-title", 12);
    const area = cadastralLotFontSizePx(viewport, "lot-area", 12);
    const edge = cadastralLotFontSizePx(viewport, "lot-edge", 12);
    assert.ok(title >= 11, `número do lote deveria permanecer legível, veio ${title}`);
    assert.ok(area <= 13.2, `área compacta, veio ${area}`);
    assert.ok(area < title, "área menor que o número circundado");
    assert.ok(edge >= 7.5, `cota deveria permanecer legível, veio ${edge}`);
    assert.ok(area >= 3, `área ainda visível, veio ${area}`);
  });

  it("reconhece o quadro de áreas da planta", () => {
    assert.ok(isAreaQuadroLabel("Quadro de Áreas\nTipo"));
    assert.ok(isAreaQuadroLabel("Tabela de Áreas"));
    const box = planTableQuadroSize(8.5, "Quadro de Áreas\nTipo                     Área m²      %");
    assert.ok(box.width < 280, `quadro compacto, veio ${box.width}`);
    assert.ok(box.height < 48, `quadro baixo, veio ${box.height}`);
  });
});

describe("rótulos de rua e drenagem na planta", () => {
  it("nomeia vias no estilo Rua B", () => {
    assert.equal(indexToStreetLetter(0), "A");
    assert.equal(indexToStreetLetter(1), "B");
    assert.equal(formatStreetPlanName("Via 2", 1), "Rua B");
    assert.equal(formatStreetPlanName("Rua B"), "Rua B");
    assert.equal(formatStreetPlanName("via A"), "Rua A");
    assert.equal(formatStreetPlanName("RUA MARECHAL DEODORO"), "Rua Marechal Deodoro");
  });

  it("tubo T3-Ø40-L 53m (Ø em cm)", () => {
    assert.equal(diameterMmToPlanCm(400), 40);
    assert.equal(extractTrailingNumber("TB-03"), 3);
    assert.equal(formatPlanLengthM(53), "53");
    assert.equal(formatPipePlanLabel({ code: "TB-03", diameterMm: 400, lengthM: 53 }), "T3-Ø40-L 53m");
    assert.equal(formatPipePlanLabel({ code: "T3", diameterMm: 400, lengthM: 53.04 }), "T3-Ø40-L 53m");
    assert.equal(
      formatPipePlanLabel({ code: "RM-01", diameterMm: 300, lengthM: 6, pipeRole: "ramal" }),
      "R1-Ø30-L 6m",
    );
  });

  it("nó BL/PV com CF e CT", () => {
    assert.equal(formatDrainageNodePlanId("inlet", "BO-07"), "BL 7");
    assert.equal(formatDrainageNodePlanId("pv", "PV-03"), "PV 3");
    assert.equal(formatDrainageCotaLine("CF", 735.8), "CF: 735,80");
    assert.equal(formatDrainageCotaLine("CT", 735.3), "CT: 735,30");
    assert.equal(
      formatDrainageNodeCallout({
        kind: "inlet",
        code: "BL-07",
        invertZ: 735.8,
        groundZ: 735.3,
      }),
      "BL 7\nCF: 735,80\nCT: 735,30",
    );
  });

  it("rotação do texto acompanha o segmento e permanece legível", () => {
    assert.equal(Math.round(readableLabelRotationDeg(10, 0)), 0);
    assert.equal(Math.round(readableLabelRotationDeg(-10, 0)), 0);
    assert.equal(Math.round(readableLabelRotationDeg(0, 10)), -90);
  });
});
