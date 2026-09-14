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
  parseCadastralLotNumber,
  readableLabelRotationDeg,
} from "./plan-annotation-labels";
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
    assert.ok(title.y < area.y, "número fica junto da testada (y menor neste retângulo)");
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

  it("textos cadastrais de lote 12×25 ficam bem maiores que o teto antigo de 8 px", () => {
    const viewport = { minX: 0, maxX: 200, minY: 0, maxY: 120, width: 1200, height: 800, padding: 40 };
    const title = cadastralLotFontSizePx(viewport, "lot-title", 12);
    const area = cadastralLotFontSizePx(viewport, "lot-area", 12);
    const edge = cadastralLotFontSizePx(viewport, "lot-edge", 12);
    assert.ok(title >= 14, `número do lote deveria ser grande, veio ${title}`);
    assert.ok(area >= 16, `área deveria ser a mais destacada, veio ${area}`);
    assert.ok(edge >= 10, `cota deveria ser grande, veio ${edge}`);
    assert.ok(area >= title, "área mais proeminente que o número");
    assert.ok(title > 8 && area > 5.5 && edge > 5.5);
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
