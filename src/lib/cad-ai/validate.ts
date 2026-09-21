import {
  AREA_APP_LAYER_ID,
  AREA_REMANESCENTE_LAYER_ID,
  AREA_RESERVA_LEGAL_LAYER_ID,
  listLoteamentoQuadraPolylines,
  summarizeLoteamento,
} from "@/lib/rtk-validation/cad/loteamento-tools";
import { polygonAreaPlanarM2, polygonInteriorOverlapM2 } from "@/lib/rtk-validation/cad/lot-subdivision";
import { computePolygonMetrics, pointInPolygon } from "@/lib/rtk-validation/cad/polygon-utils";
import { polygonCentroid } from "@/lib/rtk-validation/cad/ai-geometry-utils";
import { formatAreaBr } from "@/lib/rtk-validation/cad/polygon-utils";
import { LOTEAMENTO_VIAS_LAYER_ID } from "@/lib/rtk-validation/cad/reurb";
import type { CadPolylineEntity, CadProject } from "@/lib/rtk-validation/cad/types";
import { formatLotId, formatQuadraId, listProjectLots, sameQuadra } from "./resolve";

export type CadValidationIssue = {
  nivel: "ok" | "aviso" | "erro";
  texto: string;
};

function ringOf(entity: CadPolylineEntity): [number, number][] {
  return entity.vertices.map((vertex) => [vertex.x, vertex.y] as [number, number]);
}

function closedOnLayer(project: CadProject, layerId: string): CadPolylineEntity[] {
  return project.entities.filter(
    (entity): entity is CadPolylineEntity =>
      entity.type === "polyline" &&
      Boolean(entity.closed) &&
      entity.vertices.length >= 3 &&
      entity.layerId === layerId,
  );
}

export function validarLoteamento(project: CadProject): CadValidationIssue[] {
  const issues: CadValidationIssue[] = [];
  const lots = listProjectLots(project);
  const quadras = listLoteamentoQuadraPolylines(project);
  const summary = summarizeLoteamento(project);

  if (lots.length === 0) {
    return [{ nivel: "aviso", texto: "Ainda não há lotes no desenho para analisar." }];
  }

  let overlapCount = 0;
  for (let i = 0; i < lots.length; i++) {
    const a = lots[i].entity;
    if (a.vertices.length < 3 || computePolygonMetrics(a.vertices, true).areaM2 < 0.05) {
      issues.push({ nivel: "erro", texto: `Geometria inválida em ${formatLotId(lots[i])}.` });
    }
    const ca = polygonCentroid(a.vertices);
    const host = quadras.find((quadra) => pointInPolygon(ca.x, ca.y, quadra.vertices));
    if (quadras.length > 0 && !host) {
      issues.push({ nivel: "aviso", texto: `${formatLotId(lots[i])} está fora das quadras.` });
    }
    for (let j = i + 1; j < lots.length; j++) {
      const overlap = polygonInteriorOverlapM2(ringOf(a), ringOf(lots[j].entity));
      if (overlap > 0.4) overlapCount += 1;
    }
  }

  const belowArea = summary.lotRows.filter((row) => {
    const min = lots.find((lot) => lot.entity.name === row.name)?.entity.lote?.areaMinimaM2;
    return (row.areaM2 > 0 && min != null && row.areaM2 + 0.05 < min) || row.areaM2 > 0 && lots.some((lot) => lot.entity.name === row.name && lot.entity.lote && !lot.entity.lote.atende);
  });
  const uniqueBelow = new Set(
    summary.lotRows
      .filter((row) => {
        const entity = lots.find((lot) => sameQuadra(lot.quadra, row.quadra) && lot.numero === row.numero)?.entity;
        return Boolean(entity?.lote && !entity.lote.atende);
      })
      .map((row) => `${formatQuadraId(row.quadra)}-${row.numero}`),
  );
  if (uniqueBelow.size > 0) {
    issues.push({
      nivel: "aviso",
      texto: `${uniqueBelow.size} lote(s) abaixo da área mínima.`,
    });
  } else if (belowArea.length > 0) {
    issues.push({ nivel: "aviso", texto: `${belowArea.length} lote(s) abaixo da área mínima.` });
  }

  const shortFront = summary.lotRows.filter((row) => row.testadaM > 0 && row.testadaM < 5);
  if (shortFront.length > 0) {
    issues.push({
      nivel: "aviso",
      texto: `${shortFront.length} lote(s) com testada inferior a 5 m.`,
    });
  }

  const shallow = summary.lotRows.filter((row) => row.profundidadeM > 0 && row.profundidadeM < 8);
  if (shallow.length > 0) {
    issues.push({
      nivel: "aviso",
      texto: `${shallow.length} lote(s) com profundidade reduzida.`,
    });
  }

  const remanescente = closedOnLayer(project, AREA_REMANESCENTE_LAYER_ID).reduce(
    (sum, entity) => sum + polygonAreaPlanarM2(ringOf(entity)),
    0,
  );
  if (remanescente > 1) {
    const byQuadra = summary.quadras.map((row) => formatQuadraId(row.name)).join(", ");
    issues.push({
      nivel: "aviso",
      texto: `${byQuadra ? "Há" : "Existe"} ${formatAreaBr(remanescente)} de área remanescente.`,
    });
  }

  const streets = closedOnLayer(project, LOTEAMENTO_VIAS_LAYER_ID);
  let streetConflict = 0;
  for (const lot of lots) {
    const c = polygonCentroid(lot.entity.vertices);
    if (streets.some((street) => pointInPolygon(c.x, c.y, street.vertices))) streetConflict += 1;
  }
  if (streetConflict > 0) {
    issues.push({ nivel: "aviso", texto: `${streetConflict} lote(s) em conflito com ruas.` });
  }

  const obstacles = [
    ...closedOnLayer(project, AREA_RESERVA_LEGAL_LAYER_ID),
    ...closedOnLayer(project, "area_institucional"),
    ...closedOnLayer(project, AREA_APP_LAYER_ID),
  ];
  let obstacleConflict = 0;
  for (const lot of lots) {
    const lotRing = ringOf(lot.entity);
    for (const obstacle of obstacles) {
      if (polygonInteriorOverlapM2(lotRing, ringOf(obstacle)) > 0.5) obstacleConflict += 1;
    }
  }
  if (obstacleConflict > 0) {
    issues.push({
      nivel: "aviso",
      texto: `${obstacleConflict} conflito(s) com área verde, institucional ou faixa.`,
    });
  }

  if (overlapCount === 0) {
    issues.push({ nivel: "ok", texto: "Nenhuma sobreposição encontrada." });
  } else {
    issues.push({ nivel: "erro", texto: `${overlapCount} sobreposição(ões) entre lotes.` });
  }

  return issues;
}

export function formatValidacao(issues: CadValidationIssue[]): string {
  if (issues.length === 0) return "Análise concluída. Nenhum ponto a destacar.";
  const lines = issues.map((issue) => {
    if (issue.nivel === "ok") return `✅ ${issue.texto}`;
    if (issue.nivel === "erro") return `⛔ ${issue.texto}`;
    return `⚠️ ${issue.texto}`;
  });
  const hasFix = issues.some((issue) => issue.nivel !== "ok");
  return `Análise concluída:\n\n${lines.join("\n")}${hasFix ? "\n\nDeseja que eu tente corrigir?" : ""}`;
}
