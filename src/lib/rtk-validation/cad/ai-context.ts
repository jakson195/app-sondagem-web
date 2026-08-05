import { CONTOUR_LAYER, extractSurveyElevationPoints } from "./contour";
import { TIN_LAYER } from "./tin";
import { listPointEntities } from "./viewport";
import type { CadEntity, CadProject } from "./types";
import type { CadAiProjectContext } from "./ai-command-types";

function describeCrs(crs: string): string {
  const upper = crs.toUpperCase();
  if (upper.includes("4674") || upper.includes("SIRGAS")) return "SIRGAS 2000 / UTM";
  if (upper.includes("4326") || upper.includes("WGS84")) return "WGS 84";
  return crs;
}

function computeBounds(entities: CadEntity[]) {
  let minE = Infinity;
  let minN = Infinity;
  let maxE = -Infinity;
  let maxN = -Infinity;

  function visit(x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minE = Math.min(minE, x);
    minN = Math.min(minN, y);
    maxE = Math.max(maxE, x);
    maxN = Math.max(maxN, y);
  }

  for (const e of entities) {
    if (e.type === "point") visit(e.x, e.y);
    else if (e.type === "line") {
      visit(e.start.x, e.start.y);
      visit(e.end.x, e.end.y);
    } else {
      for (const v of e.vertices) visit(v.x, v.y);
    }
  }

  if (!Number.isFinite(minE)) {
    return null;
  }

  return {
    minE: Number(minE.toFixed(3)),
    minN: Number(minN.toFixed(3)),
    maxE: Number(maxE.toFixed(3)),
    maxN: Number(maxN.toFixed(3)),
  };
}

function resolveSelectionPoints(project: CadProject, selectedId: string | null): string[] {
  if (!selectedId) return [];
  const entity = project.entities.find((e) => e.id === selectedId);
  if (!entity) return [];

  if (entity.type === "point") {
    return entity.label ? [entity.label] : [];
  }

  if (entity.type === "polyline") {
    const pointEntities = listPointEntities(project.entities);
    const labels: string[] = [];
    for (const vertex of entity.vertices) {
      const match = pointEntities.find(
        (p) =>
          Math.hypot(p.vertex.x - vertex.x, p.vertex.y - vertex.y) < 0.05 &&
          Math.abs(p.vertex.z - vertex.z) < 0.05,
      );
      if (match?.label) labels.push(match.label);
    }
    return labels;
  }

  return [];
}

export function buildCadAiContext(
  project: CadProject,
  selectedId: string | null,
  pendingProfileStart?: string | null,
): CadAiProjectContext {
  const pointEntities = listPointEntities(project.entities);
  const points = pointEntities.map((p) => ({
    label: p.label,
    x: Number(p.vertex.x.toFixed(3)),
    y: Number(p.vertex.y.toFixed(3)),
    z: Number(p.vertex.z.toFixed(3)),
    layerId: p.layerId,
  }));

  const polylines = project.entities.filter((e) => e.type === "polyline");
  const polygons = polylines.map((e) => ({
    id: e.id,
    name: e.name ?? e.id,
    vertices: e.vertices.length,
    closed: Boolean(e.closed),
  }));

  const layers = project.layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    entityCount: project.entities.filter((e) => e.layerId === layer.id).length,
  }));

  const tinEntities = project.entities.filter((e) => e.layerId === TIN_LAYER.id);
  const contourEntities = project.entities.filter(
    (e) => e.type === "polyline" && e.layerId === CONTOUR_LAYER.id,
  );

  const selectedEntity = selectedId ? project.entities.find((e) => e.id === selectedId) : null;
  let selectedEntitySummary: string | null = null;
  let selectedType: CadAiProjectContext["selecao"]["tipo"] = null;

  if (selectedEntity?.type === "polyline") {
    selectedType = "polyline";
    selectedEntitySummary = `${selectedEntity.name ?? "Polilinha"} (${selectedEntity.vertices.length} vértices, ${selectedEntity.closed ? "fechado" : "aberto"})`;
  } else if (selectedEntity?.type === "point") {
    selectedType = "point";
    selectedEntitySummary = `${selectedEntity.label ?? "Ponto"} E=${selectedEntity.x.toFixed(2)} N=${selectedEntity.y.toFixed(2)} Z=${selectedEntity.z.toFixed(2)}`;
  } else if (selectedEntity?.type === "line") {
    selectedType = "line";
    selectedEntitySummary = "Linha selecionada";
  }

  const pontosSelecionados = resolveSelectionPoints(project, selectedId);
  const extensao = computeBounds(project.entities);

  return {
    projectName: project.name,
    crs: project.crs,
    sistema: describeCrs(project.crs),
    coordenadas: {
      sistema: describeCrs(project.crs),
      epsg: project.crs,
      extensao,
    },
    selectedEntityId: selectedId,
    selectedEntitySummary,
    pontos: points.map((p) => p.label),
    points,
    camadas: layers.filter((l) => l.visible).map((l) => l.name),
    layers,
    polygons,
    lines: project.entities.filter((e) => e.type === "line").length,
    polylines: polylines.length,
    totalEntidades: project.entities.length,
    objetosSelecionados: selectedId ? 1 : 0,
    selecao: {
      entidadeId: selectedId,
      tipo: selectedType,
      resumo: selectedEntitySummary,
      pontos: pontosSelecionados,
    },
    terreno: {
      tin: {
        ativo: tinEntities.length > 0,
        arestas: tinEntities.filter((e) => e.type === "line").length,
        pontos: extractSurveyElevationPoints(project.entities).length,
      },
      curvasNivel: {
        ativo: contourEntities.length > 0,
        quantidade: contourEntities.length,
      },
    },
    elevationPointCount: extractSurveyElevationPoints(project.entities).length,
    pendingProfileStart: pendingProfileStart ?? null,
  };
}
