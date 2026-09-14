import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { polygonCentroid } from "./ai-geometry-utils";
import { detectCadGeorefFromProject, vertexToEn } from "./georef";
import type { MemorialFormDefaults } from "./memorial-types";
import {
  computePolygonMetrics,
  formatAzimuthDmsInt,
  formatCoordBr,
  vertexLabelsPn,
} from "./polygon-utils";
import { formatReurbLotNumber } from "./reurb";
import type { CadPolylineEntity, CadProject } from "./types";

const BRAND: [number, number, number] = [15, 40, 72];
const ACCENT: [number, number, number] = [8, 145, 178];

type AutoTableDoc = jsPDF & { lastAutoTable?: { finalY: number } };

function lotBbox(lot: CadPolylineEntity) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const v of lot.vertices) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }
  const padX = Math.max((maxX - minX) * 0.12, 1);
  const padY = Math.max((maxY - minY) * 0.12, 1);
  return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
}

function drawLotSketch(doc: jsPDF, lot: CadPolylineEntity, x: number, y: number, w: number, h: number) {
  const box = lotBbox(lot);
  const spanX = box.maxX - box.minX || 1;
  const spanY = box.maxY - box.minY || 1;
  const scale = Math.min(w / spanX, h / spanY);
  const ox = x + (w - spanX * scale) / 2;
  const oy = y + h;

  const toPage = (vx: number, vy: number) => ({
    px: ox + (vx - box.minX) * scale,
    py: oy - (vy - box.minY) * scale,
  });

  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x, y, w, h, 1.2, 1.2, "FD");

  const pts = lot.vertices.map((v) => toPage(v.x, v.y));
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.5);
  doc.setLineJoin("round");
  if (pts.length >= 2) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      doc.line(a.px, a.py, b.px, b.py);
    }
  }

  doc.setFillColor(...BRAND);
  const labels = vertexLabelsPn(lot.vertices.length);
  doc.setFontSize(6.5);
  doc.setTextColor(15, 40, 72);
  pts.forEach((p, i) => {
    doc.circle(p.px, p.py, 0.9, "F");
    doc.text(labels[i] ?? `P${i + 1}`, p.px + 1.4, p.py - 1.1);
  });

  const c = polygonCentroid(lot.vertices);
  const cp = toPage(c.x, c.y);
  doc.setFontSize(8);
  doc.setTextColor(...ACCENT);
  doc.text(lot.name?.trim() || "Lote", cp.px, cp.py, { align: "center" });
}

/** Planta individual A4 (PDF) de um lote REURB — vértices E/N, área e confrontações. */
export function buildReurbLotPdfBytes(
  project: CadProject,
  lot: CadPolylineEntity,
  index: number,
  memorial: MemorialFormDefaults,
): Uint8Array {
  const loteNo = lot.name?.trim() || formatReurbLotNumber(index);
  const labels = vertexLabelsPn(lot.vertices.length);
  const metrics = computePolygonMetrics(lot.vertices, true, labels);
  const georef = detectCadGeorefFromProject(project);

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;

  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageW, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text("DataGeo CAD · REURB — Planta individual do lote", margin, 8);
  doc.setFontSize(8);
  doc.text("Regularização Fundiária Urbana — Lei 13.465/2017", margin, 14);

  doc.setTextColor(15, 40, 72);
  doc.setFontSize(14);
  doc.text(loteNo, margin, 28);
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  const info = [
    `Projeto: ${project.name}`,
    `Área: ${formatCoordBr(metrics.areaM2, 2)} m²  (${formatCoordBr(metrics.areaHa, 4)} ha)`,
    `Perímetro: ${formatCoordBr(metrics.perimeterM, 2)} m`,
    `Projeção: ${memorial.projectionNote || georef.utmProjectionLabel}  ·  ${georef.utmEpsg}`,
    `Município: ${memorial.municipality || "—"}/${memorial.state || "—"}`,
    `Proprietário: ${memorial.owner || "—"}  ·  Matrícula: ${memorial.registration || "—"}`,
  ];
  info.forEach((line, i) => doc.text(line, margin, 34 + i * 5));

  const sketchY = 66;
  const sketchH = 72;
  drawLotSketch(doc, lot, margin, sketchY, pageW - margin * 2, sketchH);

  const tableStart = sketchY + sketchH + 8;
  const vertexRows = lot.vertices.map((v, i) => {
    const { e, n } = vertexToEn(v, georef);
    return [labels[i] ?? `P${i + 1}`, e.toFixed(3), n.toFixed(3), v.z.toFixed(3)];
  });

  autoTable(doc, {
    startY: tableStart,
    head: [["Vértice", "E (m)", "N (m)", "Z (m)"]],
    body: vertexRows,
    styles: { fontSize: 8, cellPadding: 1.2 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
    margin: { left: margin, right: margin },
  });

  const afterVertices = ((doc as AutoTableDoc).lastAutoTable?.finalY ?? tableStart) + 6;
  const confRows = metrics.segments.map((seg, i) => [
    `${seg.fromLabel} → ${seg.toLabel}`,
    formatAzimuthDmsInt(seg.azimuthDeg),
    `${seg.distance.toFixed(2)} m`,
    (lot.confrontations?.[i] ?? "").trim() || "—",
  ]);

  autoTable(doc, {
    startY: afterVertices,
    head: [["Lado", "Azimute", "Distância", "Confrontante"]],
    body: confRows,
    styles: { fontSize: 8, cellPadding: 1.2 },
    headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: "bold" },
    margin: { left: margin, right: margin },
  });

  const footerY = doc.internal.pageSize.getHeight() - 16;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, footerY - 6, pageW - margin, footerY - 6);
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Responsável técnico: ${memorial.technicalName || "—"}  ·  ${memorial.technicalCrea || ""}`, margin, footerY);
  doc.text("Planta gerada automaticamente no ambiente CAD DataGeo.", margin, footerY + 5);

  const buffer = doc.output("arraybuffer");
  return new Uint8Array(buffer);
}
