import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCoordBr } from "./polygon-utils";
import { computeProfileChartMetrics, profileChartAxisTicks, profileChartPointCoords } from "./profile-chart-metrics";
import type { CadPolylineEntity } from "./types";

const BRAND_PRIMARY: [number, number, number] = [15, 40, 72];
const BRAND_ACCENT: [number, number, number] = [8, 145, 178];
const MARGIN = 14;

type AutoTableDoc = jsPDF & { lastAutoTable?: { finalY: number } };

export type TerrainProfilePdfInput = {
  profile: CadPolylineEntity;
  projectName: string;
  kind: "longitudinal" | "transversal";
  startLabel?: string;
  endLabel?: string;
};

function kindTitle(kind: TerrainProfilePdfInput["kind"]) {
  return kind === "transversal" ? "Perfil transversal" : "Perfil longitudinal";
}

function drawProfileChart(doc: jsPDF, profile: CadPolylineEntity, x: number, y: number, w: number, h: number) {
  const metrics = computeProfileChartMetrics(profile);
  if (!metrics) return y;

  const chartW = 280;
  const chartH = 90;
  const margin = { left: 36, right: 8, top: 12, bottom: 22 };
  const { innerW, innerH, toX, toY } = profileChartPointCoords(metrics, chartW, chartH, margin);

  const scaleX = w / chartW;
  const scaleY = h / chartH;
  const mapX = (px: number) => x + px * scaleX;
  const mapY = (py: number) => y + py * scaleY;

  doc.setDrawColor(148, 163, 184);
  doc.setFillColor(255, 255, 255);
  doc.rect(mapX(margin.left), mapY(margin.top), innerW * scaleX, innerH * scaleY, "FD");

  doc.setDrawColor(226, 232, 240);
  const { distanceTicks, elevationTicks } = profileChartAxisTicks(metrics);
  for (const z of elevationTicks) {
    const py = toY(z);
    doc.line(mapX(margin.left), mapY(py), mapX(margin.left + innerW), mapY(py));
  }
  doc.setDrawColor(241, 245, 249);
  for (const d of distanceTicks) {
    const px = toX(d);
    doc.line(mapX(px), mapY(margin.top), mapX(px), mapY(margin.top + innerH));
  }

  doc.setDrawColor(...BRAND_ACCENT);
  doc.setLineWidth(0.4);
  let first = true;
  for (const v of profile.vertices) {
    const px = mapX(toX(v.x));
    const py = mapY(toY(v.z));
    if (first) {
      doc.moveTo(px, py);
      first = false;
    } else {
      doc.lineTo(px, py);
    }
  }
  doc.stroke();

  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  for (const d of distanceTicks) {
    doc.text(formatCoordBr(d), mapX(toX(d)), mapY(chartH - 4), { align: "center" });
  }
  for (const z of elevationTicks) {
    doc.text(formatCoordBr(z), mapX(margin.left - 3), mapY(toY(z) + 1), { align: "right" });
  }
  doc.setFontSize(7);
  doc.text("Distância (m) · a cada 20 m", mapX(margin.left + innerW / 2), mapY(chartH - 1), { align: "center" });
  doc.text("Cota (m) · a cada 2 m", mapX(6), mapY(margin.top + innerH / 2), { angle: 90 });

  return y + h + 4;
}

/** Gera PDF A4 paisagem com gráfico e tabela do perfil do terreno. */
export function generateTerrainProfilePdf(input: TerrainProfilePdfInput): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const title = kindTitle(input.kind);

  doc.setFillColor(...BRAND_PRIMARY);
  doc.rect(0, 0, pageW, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(title, MARGIN, 11);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(input.projectName, pageW - MARGIN, 11, { align: "right" });

  let y = 26;
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.text(input.profile.name ?? title, MARGIN, y);
  y += 5;

  const metrics = computeProfileChartMetrics(input.profile);
  if (metrics) {
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Comprimento: ${formatCoordBr(metrics.spanD)} m · Δ cota: ${formatCoordBr(metrics.maxZ - metrics.minZ)} m · Cota min/máx: ${formatCoordBr(metrics.minZ)} / ${formatCoordBr(metrics.maxZ)} m`,
      MARGIN,
      y,
    );
    y += 6;
  }

  if (input.startLabel && input.endLabel) {
    doc.text(`Referência: ${input.startLabel} → ${input.endLabel}`, MARGIN, y);
    y += 6;
  }

  y = drawProfileChart(doc, input.profile, MARGIN, y, pageW - MARGIN * 2, 52);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [["Distância (m)", "Cota (m)"]],
    body: input.profile.vertices.map((v) => [formatCoordBr(v.x), formatCoordBr(v.z)]),
    styles: { fontSize: 7, cellPadding: 1.2 },
    headStyles: { fillColor: BRAND_PRIMARY, textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [240, 249, 255] },
    margin: { left: MARGIN, right: MARGIN },
  });

  const tableEnd = (doc as AutoTableDoc).lastAutoTable?.finalY ?? y;
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Gerado em ${new Date().toLocaleString("pt-BR")} · DatGeo NTRIP CAD`,
    MARGIN,
    Math.min(tableEnd + 8, doc.internal.pageSize.getHeight() - 8),
  );

  return doc;
}

export function downloadTerrainProfilePdf(input: TerrainProfilePdfInput, filename?: string) {
  const doc = generateTerrainProfilePdf(input);
  const safeName = input.projectName.replace(/[^\w\-]+/g, "_").slice(0, 60) || "projeto";
  const suffix = input.kind === "transversal" ? "perfil_transversal" : "perfil_longitudinal";
  doc.save(filename ?? `${safeName}_${suffix}.pdf`);
}
