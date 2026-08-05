import type { CadProject } from "./types";
import {
  computePolygonMetrics,
  formatAzimuthDmsInt,
  vertexLabelsPn,
} from "./polygon-utils";
import { CONTOUR_LAYER } from "./contour";
import { buildOdsBlob, type OdsSheet } from "../ods-writer";

function layerName(project: CadProject, layerId: string): string {
  return project.layers.find((l) => l.id === layerId)?.name ?? layerId;
}

function pointsSheet(project: CadProject): OdsSheet {
  const rows: (string | number)[][] = [["Camada", "Nome", "E (m)", "N (m)", "Z (m)"]];
  for (const entity of project.entities) {
    if (entity.type !== "point") continue;
    rows.push([
      layerName(project, entity.layerId),
      entity.label ?? entity.id,
      Number(entity.x.toFixed(4)),
      Number(entity.y.toFixed(4)),
      Number(entity.z.toFixed(4)),
    ]);
  }
  return { name: "Pontos", rows };
}

function polygonsSheet(project: CadProject): OdsSheet {
  const rows: (string | number | boolean)[][] = [
    ["Polígono", "Camada", "Vértice", "E (m)", "N (m)", "Z (m)", "Fechado"],
  ];
  for (const entity of project.entities) {
    if (entity.type !== "polyline" || entity.layerId === CONTOUR_LAYER.id) continue;
    const labels = vertexLabelsPn(entity.vertices.length);
    entity.vertices.forEach((v, i) => {
      rows.push([
        entity.name ?? entity.id,
        layerName(project, entity.layerId),
        labels[i] ?? `P${i + 1}`,
        Number(v.x.toFixed(4)),
        Number(v.y.toFixed(4)),
        Number(v.z.toFixed(4)),
        Boolean(entity.closed),
      ]);
    });
  }
  return { name: "Polígonos", rows };
}

function segmentsSheet(project: CadProject): OdsSheet {
  const rows: (string | number)[][] = [
    ["Polígono", "De", "Para", "Azimute", "Distância (m)", "Área (m²)", "Perímetro (m)"],
  ];
  for (const entity of project.entities) {
    if (entity.type !== "polyline" || entity.layerId === CONTOUR_LAYER.id || !entity.closed) continue;
    if (entity.vertices.length < 3) continue;
    const labels = vertexLabelsPn(entity.vertices.length);
    const metrics = computePolygonMetrics(entity.vertices, true, labels);
    for (const seg of metrics.segments) {
      rows.push([
        entity.name ?? entity.id,
        seg.fromLabel,
        seg.toLabel,
        formatAzimuthDmsInt(seg.azimuthDeg),
        Number(seg.distance.toFixed(4)),
        Number(metrics.areaM2.toFixed(4)),
        Number(metrics.perimeterM.toFixed(4)),
      ]);
    }
  }
  return { name: "Segmentos", rows };
}

function contoursSheet(project: CadProject): OdsSheet {
  const rows: (string | number)[][] = [
    ["Nome", "Cota (m)", "Tipo", "Vértices", "E médio (m)", "N médio (m)"],
  ];
  for (const entity of project.entities) {
    if (entity.type !== "polyline" || entity.layerId !== CONTOUR_LAYER.id) continue;
    const z = entity.vertices[0]?.z ?? 0;
    const avgE = entity.vertices.reduce((s, v) => s + v.x, 0) / Math.max(entity.vertices.length, 1);
    const avgN = entity.vertices.reduce((s, v) => s + v.y, 0) / Math.max(entity.vertices.length, 1);
    rows.push([
      entity.name ?? entity.id,
      Number(z.toFixed(4)),
      entity.contourMajor ? "Mestra" : "Secundária",
      entity.vertices.length,
      Number(avgE.toFixed(4)),
      Number(avgN.toFixed(4)),
    ]);
  }
  return { name: "Curvas", rows };
}

function projectInfoSheet(project: CadProject): OdsSheet {
  const rows: (string | number)[][] = [
    ["Campo", "Valor"],
    ["Projeto", project.name],
    ["CRS", project.crs],
  ];
  if (project.adjustment) {
    rows.push(
      ["Método de ajuste", project.adjustment.method],
      ["RMS antes (m)", Number(project.adjustment.rmsBefore.toFixed(4))],
      ["RMS depois (m)", Number(project.adjustment.rmsAfter.toFixed(4))],
      ["Importado em", project.adjustment.importedAt],
    );
  }
  return { name: "Projeto", rows };
}

export function exportCadProjectOds(project: CadProject): Blob {
  const sheets: OdsSheet[] = [projectInfoSheet(project), pointsSheet(project)];

  const hasPolygons = project.entities.some(
    (e) => e.type === "polyline" && e.layerId !== CONTOUR_LAYER.id,
  );
  const hasContours = project.entities.some(
    (e) => e.type === "polyline" && e.layerId === CONTOUR_LAYER.id,
  );
  const hasClosedPolygons = project.entities.some(
    (e) =>
      e.type === "polyline" &&
      e.layerId !== CONTOUR_LAYER.id &&
      e.closed &&
      e.vertices.length >= 3,
  );

  if (hasPolygons) sheets.push(polygonsSheet(project));
  if (hasClosedPolygons) sheets.push(segmentsSheet(project));
  if (hasContours) sheets.push(contoursSheet(project));

  return buildOdsBlob(sheets, project.name);
}

export function exportSurveyPointsOds(
  points: Array<{
    code?: string;
    name: string;
    description?: string;
    e: number;
    n: number;
    z: number;
    eCorr?: number;
    nCorr?: number;
    zCorr?: number;
  }>,
  projectName: string,
): Blob {
  const rows: (string | number)[][] = [
    ["ID", "Descrição", "E", "N", "Z", "E orig", "N orig", "Z orig"],
  ];
  for (const pt of points) {
    const e = pt.eCorr ?? pt.e;
    const n = pt.nCorr ?? pt.n;
    const z = pt.zCorr ?? pt.z;
    rows.push([
      pt.code ?? pt.name,
      pt.description ?? pt.name,
      Number(e.toFixed(4)),
      Number(n.toFixed(4)),
      Number(z.toFixed(4)),
      Number(pt.e.toFixed(4)),
      Number(pt.n.toFixed(4)),
      Number(pt.z.toFixed(4)),
    ]);
  }
  return buildOdsBlob([{ name: "Pontos RTK", rows }], projectName);
}
