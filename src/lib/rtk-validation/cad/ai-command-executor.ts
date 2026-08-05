import { parseSurveyFile } from "../parsers";
import { normalizeCadAiCommand } from "./ai-command-catalog";
import {
  exportCadProjectKml,
  exportCadProjectKmz,
  parseKml,
  parseKmzBuffer,
} from "./kml-io";
import {
  azimuthToRumo,
  entitiesToSurveyCsv,
  findPointByRef,
  polygonCentroid,
  resolvePointRefs,
  rotateVertex,
  translateVertex,
} from "./ai-geometry-utils";
import { parsePointReferenceList, resolvePointLabels } from "./ai-point-utils";
import {
  CONTOUR_LAYER,
  extractSurveyElevationPoints,
  generateContoursFromPoints,
  removeContourEntities,
} from "./contour";
import {
  azimuthFromNorth,
  buildMemorialNarrative,
  computePolygonMetrics,
  formatAreaBr,
  formatAzimuthDmsInt,
  formatCoordBr,
  formatDistanceBr,
  formatVertexCoordLabel,
  segmentDistance,
  vertexLabelsPn,
} from "./polygon-utils";
import {
  generateLongitudinalProfile,
  generateTransversalProfile,
  generateTransversalProfileAtStation,
  PROFILE_LAYER,
  TRANSVERSAL_PROFILE_LAYER,
} from "./profile";
import {
  buildContourElevationLabels,
  CONTOUR_LABEL_LAYER,
  generateTinEntities,
  removeContourLabelEntities,
  removeTinEntities,
  TIN_LAYER,
} from "./tin";
import {
  appendPolygonCenterLabel,
  buildPolygonCenterLabelText,
  CAD_TEXT_LAYER,
} from "./polygon-labels";
import { generateHypsometricRaster } from "./hypsometric";
import { detectCadGeorefFromProject } from "./georef";
import { importSurveyPointsToProject, surveyPointsToCadEntities } from "./import-survey-points";
import type {
  CadAiCommand,
  CadAiSideEffect,
  CadCommandExecutionResult,
  CadCommandExecutorMeta,
  CadCommandExecutorOptions,
} from "./ai-command-types";
import type { CadEntity, CadPolylineEntity, CadProject, CadVertex } from "./types";

const TEXT_LAYER = CAD_TEXT_LAYER;
const DIMENSION_LAYER = { id: "dimensions", name: "COTAS", color: "#a855f7", visible: true, locked: false } as const;

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureLayer(
  project: CadProject,
  layer: { id: string; name: string; color: string; visible: boolean; locked: boolean },
) {
  return project.layers.some((l) => l.id === layer.id) ? project.layers : [...project.layers, { ...layer }];
}

function findClosedPolygon(project: CadProject, entityId?: string, selectedId?: string | null) {
  const tryId = entityId ?? selectedId ?? undefined;
  if (tryId) {
    const entity = project.entities.find((e) => e.id === tryId);
    if (entity?.type === "polyline" && entity.closed) return entity;
  }
  return (
    project.entities.find(
      (e): e is CadPolylineEntity => e.type === "polyline" && Boolean(e.closed),
    ) ?? null
  );
}

function findClosedPolygonStrict(project: CadProject, entityId?: string, selectedId?: string | null) {
  const tryId = entityId ?? selectedId ?? undefined;
  if (!tryId) return null;
  const entity = project.entities.find((e) => e.id === tryId);
  if (entity?.type === "polyline" && entity.closed) return entity;
  return null;
}

function findPolyline(project: CadProject, entityId?: string, selectedId?: string | null) {
  const tryId = entityId ?? selectedId ?? undefined;
  if (tryId) {
    const e = project.entities.find((x) => x.id === tryId);
    if (e?.type === "polyline") return e;
  }
  return project.entities.find((e): e is CadPolylineEntity => e.type === "polyline") ?? null;
}

function surveyPointsToEntities(
  points: Array<{ id: string; e: number; n: number; z: number; name?: string; code?: string }>,
): CadEntity[] {
  return surveyPointsToCadEntities(points);
}

function stub(feature: string) {
  return `${feature} está em desenvolvimento. Em breve no DataGeo CAD.`;
}

function fail(project: CadProject, message: string): CadCommandExecutionResult {
  return { ok: false, project, message };
}

function transformEntity(entity: CadEntity, fn: (v: CadVertex) => CadVertex): CadEntity {
  if (entity.type === "point") {
    const v = fn({ x: entity.x, y: entity.y, z: entity.z });
    return { ...entity, x: v.x, y: v.y, z: v.z };
  }
  if (entity.type === "line") {
    return { ...entity, start: fn(entity.start), end: fn(entity.end) };
  }
  return { ...entity, vertices: entity.vertices.map(fn) };
}

function addDimensionBetween(
  project: CadProject,
  a: CadVertex,
  b: CadVertex,
  labelA: string,
  labelB: string,
) {
  const dist = segmentDistance(a, b);
  const layers = ensureLayer(project, DIMENSION_LAYER);
  return {
    ...project,
    layers,
    entities: [
      ...project.entities,
      { id: newId("dim"), type: "line" as const, layerId: DIMENSION_LAYER.id, start: a, end: b },
      {
        id: newId("dimlbl"),
        type: "point" as const,
        layerId: DIMENSION_LAYER.id,
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        z: (a.z + b.z) / 2,
        label: `${labelA}–${labelB}: ${dist.toFixed(2)} m`,
      },
    ],
  };
}

export function executeCadAiCommand(
  project: CadProject,
  rawCommand: CadAiCommand,
  options: CadCommandExecutorOptions = {},
): CadCommandExecutionResult & { meta?: CadCommandExecutorMeta } {
  const command = normalizeCadAiCommand(rawCommand);
  const sideEffects: CadAiSideEffect[] = [];
  let nextProject = project;
  let selectedId = options.selectedId ?? null;
  let message = command.resposta?.trim() || "";
  let meta: CadCommandExecutorMeta | undefined;

  switch (command.acao) {
    case "criar_ponto": {
      if (command.x != null && command.y != null) {
        const pt = {
          id: newId("pt"),
          type: "point" as const,
          layerId: "draw",
          x: command.x,
          y: command.y,
          z: command.z ?? 0,
          label: command.novo_id ?? command.texto ?? `P${nextProject.entities.filter((e) => e.type === "point").length + 1}`,
        };
        nextProject = { ...nextProject, entities: [...nextProject.entities, pt] };
        selectedId = pt.id;
        sideEffects.push({ type: "fit_view", entities: nextProject.entities });
        message = message || `Ponto ${pt.label} criado em E ${formatCoordBr(pt.x)}, N ${formatCoordBr(pt.y)}.`;
      } else {
        return fail(project, "Informe coordenadas (x, y) ou use importar para pontos em lote.");
      }
      break;
    }

    case "criar_linha": {
      const labels = command.pontos ?? [];
      if (labels.length < 2) return fail(project, "Informe dois pontos para a linha.");
      const { vertices, missing } = resolvePointLabels(nextProject.entities, labels.slice(0, 2));
      if (missing.length) return fail(project, `Pontos não encontrados: ${missing.join(", ")}.`);
      const entity = { id: newId("ln"), type: "line" as const, layerId: "draw", start: vertices[0], end: vertices[1] };
      nextProject = { ...nextProject, entities: [...nextProject.entities, entity] };
      selectedId = entity.id;
      message = message || `Linha criada entre ${labels[0]} e ${labels[1]}.`;
      break;
    }

    case "criar_polilinha": {
      const labels = command.pontos ?? [];
      if (labels.length < 2) return fail(project, "Informe pelo menos 2 pontos.");
      const { vertices, missing } = resolvePointLabels(nextProject.entities, labels);
      if (missing.length) return fail(project, `Pontos não encontrados: ${missing.join(", ")}.`);
      const n = nextProject.entities.filter((e) => e.type === "polyline").length;
      const entity: CadPolylineEntity = {
        id: newId("pl"),
        type: "polyline",
        layerId: "draw",
        vertices,
        closed: false,
        name: `Polilinha ${n + 1}`,
      };
      nextProject = { ...nextProject, entities: [...nextProject.entities, entity] };
      selectedId = entity.id;
      sideEffects.push({ type: "fit_view", entities: nextProject.entities });
      message = message || `Polilinha criada com ${labels.length} vértices.`;
      break;
    }

    case "criar_poligono": {
      let labels = command.pontos ?? [];
      if (labels.length === 1 && labels[0]) {
        labels = parsePointReferenceList(labels[0]);
      }
      if (labels.length < 3) return fail(project, "Informe pelo menos 3 pontos (ex.: V1 ao V4).");
      const { vertices, missing } = resolvePointLabels(nextProject.entities, labels);
      if (missing.length) return fail(project, `Pontos não encontrados: ${missing.join(", ")}.`);
      const n = nextProject.entities.filter((e) => e.type === "polyline" && e.closed).length;
      const entity: CadPolylineEntity = {
        id: newId("pl"),
        type: "polyline",
        layerId: "draw",
        vertices,
        closed: true,
        name: `Polígono ${n + 1}`,
      };
      nextProject = { ...nextProject, entities: [...nextProject.entities, entity] };
      nextProject = appendPolygonCenterLabel(nextProject, entity);
      selectedId = entity.id;
      sideEffects.push({ type: "fit_view", entities: nextProject.entities });
      message = message || `Polígono criado: ${labels.join(", ")}. Rótulo com nome e área inserido no centro.`;
      break;
    }

    case "fechar_poligono": {
      const pl = findPolyline(nextProject, command.entidade_id, selectedId);
      if (!pl || pl.vertices.length < 3) return fail(project, "Selecione uma polilinha com 3+ vértices.");
      const closedName = pl.name?.replace("Polilinha", "Polígono") ?? "Polígono";
      nextProject = {
        ...nextProject,
        entities: nextProject.entities.map((e) =>
          e.id === pl.id && e.type === "polyline" ? { ...e, closed: true, name: closedName } : e,
        ),
      };
      const closed = nextProject.entities.find(
        (e): e is CadPolylineEntity => e.id === pl.id && e.type === "polyline",
      );
      if (closed) nextProject = appendPolygonCenterLabel(nextProject, closed);
      selectedId = pl.id;
      message = message || "Polígono fechado. Rótulo com nome e área inserido no centro.";
      break;
    }

    case "unir_linhas": {
      const ids = command.entidade_ids ?? (command.entidade_id ? [command.entidade_id] : []);
      const pls = ids
        .map((id) => nextProject.entities.find((e) => e.id === id))
        .filter((e): e is CadPolylineEntity => e?.type === "polyline");
      if (pls.length < 2) return fail(project, "Selecione duas polilinhas para unir (entidade_ids).");
      const merged = [...pls[0].vertices, ...pls[1].vertices.slice(1)];
      const entity: CadPolylineEntity = {
        id: newId("pl"),
        type: "polyline",
        layerId: "draw",
        vertices: merged,
        closed: false,
        name: "Polilinha unida",
      };
      nextProject = {
        ...nextProject,
        entities: [...nextProject.entities.filter((e) => !ids.includes(e.id)), entity],
      };
      selectedId = entity.id;
      message = message || "Polilinhas unidas.";
      break;
    }

    case "apagar": {
      const refs = [
        ...(command.entidade_ids ?? []),
        ...(command.entidade_id ? [command.entidade_id] : []),
        ...(command.id_origem ? [command.id_origem] : []),
        ...(command.pontos ?? []),
      ];
      const ids = new Set<string>();

      for (const ref of refs) {
        const byId = nextProject.entities.find((e) => e.id === ref);
        if (byId) {
          ids.add(byId.id);
          continue;
        }
        const hit = findPointByRef(nextProject.entities, ref);
        if (hit) ids.add(hit.entity.id);
      }

      if (
        ids.size === 0 &&
        selectedId &&
        !command.entidade_id &&
        !command.entidade_ids?.length &&
        !command.pontos?.length &&
        !command.id_origem
      ) {
        ids.add(selectedId);
      }

      if (ids.size === 0) return fail(project, "Informe o ponto ou selecione uma entidade a apagar.");

      if (!command.forcar) {
        const locked = [...ids]
          .map((id) => nextProject.entities.find((e) => e.id === id))
          .filter((e): e is Extract<CadEntity, { type: "point" }> => e?.type === "point" && Boolean(e.locked));
        if (locked.length > 0) {
          const names = locked.map((p) => p.label ?? p.id).join(", ");
          return fail(project, `Ponto(s) bloqueado(s) não podem ser excluídos: ${names}.`);
        }
      }

      nextProject = { ...nextProject, entities: nextProject.entities.filter((e) => !ids.has(e.id)) };
      selectedId = null;
      message = message || `${ids.size} entidade(s) removida(s).`;
      break;
    }

    case "mover":
    case "copiar": {
      const id = command.entidade_id ?? selectedId;
      if (!id) return fail(project, "Selecione a entidade a mover/copiar.");
      const entity = nextProject.entities.find((e) => e.id === id);
      if (!entity) return fail(project, "Entidade não encontrada.");
      const dist = command.distancia ?? 1;
      const ang = command.angulo ?? 0;
      const fn = (v: CadVertex) => translateVertex(v, dist, ang);
      const transformed = transformEntity(entity, fn);
      if (command.acao === "copiar") {
        const copy = { ...transformed, id: newId(entity.type === "point" ? "pt" : entity.type === "line" ? "ln" : "pl") };
        nextProject = { ...nextProject, entities: [...nextProject.entities, copy] };
        selectedId = copy.id;
        message = message || `Cópia deslocada ${dist} m, azimute ${ang}°.`;
      } else {
        nextProject = {
          ...nextProject,
          entities: nextProject.entities.map((e) => (e.id === id ? transformed : e)),
        };
        message = message || `Entidade movida ${dist} m, azimute ${ang}°.`;
      }
      break;
    }

    case "rotacionar": {
      const id = command.entidade_id ?? selectedId;
      if (!id) return fail(project, "Selecione a entidade a rotacionar.");
      const entity = nextProject.entities.find((e) => e.id === id);
      if (!entity) return fail(project, "Entidade não encontrada.");
      const angle = command.angulo ?? 90;
      let center: CadVertex = { x: 0, y: 0, z: 0 };
      if (entity.type === "point") center = { x: entity.x, y: entity.y, z: entity.z };
      else if (entity.type === "line") center = polygonCentroid([entity.start, entity.end]);
      else center = polygonCentroid(entity.vertices);
      const fn = (v: CadVertex) => rotateVertex(v, center, angle);
      nextProject = {
        ...nextProject,
        entities: nextProject.entities.map((e) => (e.id === id ? transformEntity(e, fn) : e)),
      };
      message = message || `Entidade rotacionada ${angle}°.`;
      break;
    }

    case "alterar_id": {
      const origem = command.id_origem ?? command.pontos?.[0];
      const novo = command.novo_id ?? command.texto ?? command.pontos?.[1];
      if (!origem || !novo) return fail(project, "Informe id_origem e novo_id (ex.: renomear P1 para V-01).");
      const hit = findPointByRef(nextProject.entities, origem);
      if (!hit) return fail(project, `Ponto "${origem}" não encontrado.`);
      nextProject = {
        ...nextProject,
        entities: nextProject.entities.map((e) =>
          e.id === hit.entity.id && e.type === "point" ? { ...e, label: novo } : e,
        ),
      };
      message = message || `Ponto renomeado de ${origem} para ${novo}.`;
      break;
    }

    case "alterar_cota": {
      const origem = command.id_origem ?? command.pontos?.[0];
      const z = command.z;
      if (!origem || z == null || !Number.isFinite(z)) {
        return fail(project, "Informe o ponto e a nova cota Z (ex.: alterar cota do P1 para 245.5).");
      }
      const hit = findPointByRef(nextProject.entities, origem);
      if (!hit) return fail(project, `Ponto "${origem}" não encontrado.`);
      nextProject = {
        ...nextProject,
        entities: nextProject.entities.map((e) =>
          e.id === hit.entity.id && e.type === "point" ? { ...e, z } : e,
        ),
      };
      selectedId = hit.entity.id;
      message = message || `Cota de ${origem} alterada para ${z.toFixed(3)} m.`;
      break;
    }

    case "renumerar_pontos": {
      const points = nextProject.entities.filter((e): e is Extract<CadEntity, { type: "point" }> => e.type === "point");
      let i = 1;
      nextProject = {
        ...nextProject,
        entities: nextProject.entities.map((e) => {
          if (e.type !== "point") return e;
          const label = `P${i++}`;
          return { ...e, label };
        }),
      };
      message = message || `${points.length} pontos renumerados (P1…P${points.length}).`;
      break;
    }

    case "mostrar_coordenadas": {
      const refs = command.pontos?.length ? command.pontos : nextProject.entities.filter((e) => e.type === "point").map((e) => e.label ?? e.id);
      const lines: string[] = [];
      for (const ref of refs.slice(0, 20)) {
        const hit = findPointByRef(nextProject.entities, ref);
        if (hit) lines.push(`${hit.entity.label}: E ${formatCoordBr(hit.vertex.x)}, N ${formatCoordBr(hit.vertex.y)}, Z ${formatCoordBr(hit.vertex.z)}`);
      }
      message = message || lines.join(" · ") || "Nenhum ponto encontrado.";
      break;
    }

    case "exportar_pontos": {
      const csv = entitiesToSurveyCsv(nextProject.entities);
      sideEffects.push({ type: "download_text", filename: `${nextProject.name}_pontos.csv`, content: csv, mime: "text/csv" });
      message = message || "Exportação CSV de pontos iniciada.";
      break;
    }

    case "medir_distancia": {
      const labels = command.pontos ?? [];
      if (labels.length < 2) return fail(project, "Informe dois pontos.");
      const { vertices, missing } = resolvePointLabels(nextProject.entities, labels.slice(0, 2));
      if (missing.length) return fail(project, `Pontos não encontrados: ${missing.join(", ")}.`);
      const d = segmentDistance(vertices[0], vertices[1]);
      message = message || `Distância ${labels[0]}–${labels[1]}: ${formatDistanceBr(d)} m.`;
      break;
    }

    case "medir_area":
    case "area_geodesica": {
      const polygon = findClosedPolygonStrict(nextProject, command.entidade_id, selectedId);
      if (!polygon) return fail(project, "Selecione um polígono fechado no desenho ou na lista.");
      const metrics = computePolygonMetrics(polygon.vertices, true, vertexLabelsPn(polygon.vertices.length));
      selectedId = polygon.id;
      message = message || `Área: ${formatAreaBr(metrics.areaM2)} (${metrics.areaHa.toFixed(4)} ha).`;
      break;
    }

    case "medir_perimetro": {
      const polygon = findClosedPolygon(nextProject, command.entidade_id, selectedId);
      if (!polygon) return fail(project, "Selecione um polígono fechado.");
      const metrics = computePolygonMetrics(polygon.vertices, true);
      selectedId = polygon.id;
      message = message || `Perímetro: ${formatDistanceBr(metrics.perimeterM)} m.`;
      break;
    }

    case "medir_azimute": {
      const labels = command.pontos ?? [];
      if (labels.length < 2) return fail(project, "Informe dois pontos.");
      const { vertices, missing } = resolvePointLabels(nextProject.entities, labels.slice(0, 2));
      if (missing.length) return fail(project, `Pontos não encontrados: ${missing.join(", ")}.`);
      const az = azimuthFromNorth(vertices[0], vertices[1]);
      message = message || `Azimute ${labels[0]}→${labels[1]}: ${formatAzimuthDmsInt(az)}.`;
      break;
    }

    case "medir_inclinacao": {
      const labels = command.pontos ?? [];
      if (labels.length < 2) return fail(project, "Informe dois pontos.");
      const { vertices, missing } = resolvePointLabels(nextProject.entities, labels.slice(0, 2));
      if (missing.length) return fail(project, `Pontos não encontrados: ${missing.join(", ")}.`);
      const horiz = segmentDistance(vertices[0], vertices[1]);
      const dz = vertices[1].z - vertices[0].z;
      const pct = horiz > 0 ? (dz / horiz) * 100 : 0;
      message = message || `Inclinação ${labels[0]}→${labels[1]}: ${pct.toFixed(2)}% (ΔZ ${dz.toFixed(2)} m).`;
      break;
    }

    case "inserir_cota": {
      const labels = command.pontos ?? [];
      if (labels.length < 2) return fail(project, "Informe dois pontos para a cota.");
      const { vertices, missing } = resolvePointLabels(nextProject.entities, labels.slice(0, 2));
      if (missing.length) return fail(project, `Pontos não encontrados: ${missing.join(", ")}.`);
      nextProject = addDimensionBetween(nextProject, vertices[0], vertices[1], labels[0], labels[1]);
      message = message || `Cota inserida entre ${labels[0]} e ${labels[1]}.`;
      break;
    }

    case "inserir_cota_automatica": {
      const polygon = findClosedPolygon(nextProject, command.entidade_id, selectedId);
      if (!polygon) return fail(project, "Selecione um polígono fechado.");
      const labels = vertexLabelsPn(polygon.vertices.length);
      for (let i = 0; i < polygon.vertices.length; i++) {
        const j = (i + 1) % polygon.vertices.length;
        nextProject = addDimensionBetween(nextProject, polygon.vertices[i], polygon.vertices[j], labels[i], labels[j]);
      }
      selectedId = polygon.id;
      message = message || `Cotas automáticas inseridas (${polygon.vertices.length} lados).`;
      break;
    }

    case "inserir_texto": {
      const text = command.texto?.trim();
      if (!text) return fail(project, "Informe o texto a inserir.");
      let pos: CadVertex = { x: 0, y: 0, z: 0 };
      if (command.pontos?.length) {
        const { vertices, missing } = resolvePointLabels(nextProject.entities, [command.pontos[0]]);
        if (missing.length) return fail(project, `Ponto ${command.pontos[0]} não encontrado.`);
        pos = vertices[0];
      } else {
        const polygon = findClosedPolygon(nextProject, command.entidade_id, selectedId);
        if (polygon) pos = polygonCentroid(polygon.vertices);
      }
      const layers = ensureLayer(nextProject, TEXT_LAYER);
      const pt = { id: newId("txt"), type: "point" as const, layerId: TEXT_LAYER.id, ...pos, label: text };
      nextProject = { ...nextProject, layers, entities: [...nextProject.entities, pt] };
      message = message || `Texto "${text}" inserido.`;
      break;
    }

    case "inserir_coordenadas": {
      const layers = ensureLayer(nextProject, TEXT_LAYER);
      const added: CadEntity[] = [];

      if (!command.pontos?.length && selectedId) {
        const selected = nextProject.entities.find((e) => e.id === selectedId);
        if (selected?.type === "polyline" && selected.closed && selected.vertices.length >= 3) {
          for (const v of selected.vertices) {
            added.push({
              id: newId("coord"),
              type: "point",
              layerId: TEXT_LAYER.id,
              x: v.x,
              y: v.y - 2,
              z: v.z,
              label: formatVertexCoordLabel(v.x, v.y),
            });
          }
          nextProject = { ...nextProject, layers, entities: [...nextProject.entities, ...added] };
          message = message || `${added.length} etiqueta(s) de coordenadas inseridas.`;
          break;
        }
      }

      const refs = command.pontos?.length
        ? command.pontos
        : selectedId
          ? (() => {
              const sel = nextProject.entities.find((e) => e.id === selectedId);
              return sel?.type === "point" && sel.label ? [sel.label] : [];
            })()
          : nextProject.entities
              .filter((e): e is Extract<CadEntity, { type: "point" }> => e.type === "point" && e.layerId !== TEXT_LAYER.id)
              .map((e) => e.label ?? e.id);
      for (const ref of refs) {
        const hit = findPointByRef(nextProject.entities, ref);
        if (!hit) continue;
        added.push({
          id: newId("coord"),
          type: "point",
          layerId: TEXT_LAYER.id,
          x: hit.vertex.x,
          y: hit.vertex.y - 2,
          z: hit.vertex.z,
          label: formatVertexCoordLabel(hit.vertex.x, hit.vertex.y),
        });
      }
      if (added.length === 0) return fail(project, "Informe o(s) ponto(s) ou selecione um ponto no desenho.");
      nextProject = { ...nextProject, layers, entities: [...nextProject.entities, ...added] };
      message = message || `${added.length} etiqueta(s) de coordenadas inseridas.`;
      break;
    }

    case "inserir_area": {
      const polygon = findClosedPolygon(nextProject, command.entidade_id, selectedId);
      if (!polygon) return fail(project, "Selecione um polígono fechado.");
      const metrics = computePolygonMetrics(polygon.vertices, true);
      const name = polygon.name ?? "Polígono";
      const text = command.texto?.trim() || buildPolygonCenterLabelText(name, metrics.areaM2);
      nextProject = appendPolygonCenterLabel(nextProject, polygon, text);
      selectedId = polygon.id;
      message = message || `Rótulo inserido no centro: ${text.replace("\n", " · ")}.`;
      break;
    }

    case "inserir_elevacao":
    case "mostrar_cotas_pontos": {
      const layers = ensureLayer(nextProject, TEXT_LAYER);
      const points = command.pontos?.length
        ? resolvePointRefs(nextProject.entities, command.pontos).entities
        : nextProject.entities.filter((e): e is Extract<CadEntity, { type: "point" }> => e.type === "point");
      const added = points.map((p) => ({
        id: newId("z"),
        type: "point" as const,
        layerId: TEXT_LAYER.id,
        x: p.x,
        y: p.y + 1.5,
        z: p.z,
        label: `Z ${p.z.toFixed(2)} m`,
      }));
      nextProject = { ...nextProject, layers, entities: [...nextProject.entities, ...added] };
      message = message || `Cotas Z exibidas em ${added.length} ponto(s).`;
      break;
    }

    case "medir": {
      const labels = command.pontos ?? [];
      if (labels.length >= 2) {
        const { vertices, missing } = resolvePointLabels(nextProject.entities, labels.slice(0, 2));
        if (missing.length) return fail(project, `Pontos não encontrados: ${missing.join(", ")}.`);
        const d = segmentDistance(vertices[0], vertices[1]);
        const az = azimuthFromNorth(vertices[0], vertices[1]);
        message =
          message ||
          `Distância ${labels[0]}–${labels[1]}: ${formatDistanceBr(d)} m. Azimute: ${formatAzimuthDmsInt(az)}.`;
        break;
      }
      const polygon = findClosedPolygon(nextProject, command.entidade_id, selectedId);
      if (polygon) {
        const metrics = computePolygonMetrics(polygon.vertices, true, vertexLabelsPn(polygon.vertices.length));
        selectedId = polygon.id;
        message =
          message ||
          `Área: ${formatAreaBr(metrics.areaM2)}. Perímetro: ${formatDistanceBr(metrics.perimeterM)} m.`;
      } else {
        message = message || "Informe dois pontos para distância ou selecione um polígono para área/perímetro.";
      }
      break;
    }

    case "cota_curva": {
      const contours = nextProject.entities.filter(
        (e) => e.type === "polyline" && e.layerId === CONTOUR_LAYER.id,
      );
      if (contours.length === 0) {
        return fail(project, "Gere curvas de nível antes de inserir cotas de curva.");
      }
      const labels = buildContourElevationLabels(nextProject.entities);
      const layers = ensureLayer(nextProject, { ...CONTOUR_LABEL_LAYER });
      nextProject = {
        ...nextProject,
        layers,
        entities: [...removeContourLabelEntities(nextProject.entities), ...labels],
      };
      message = message || `${labels.length} etiqueta(s) de cota inseridas nas curvas de nível.`;
      break;
    }

    case "gerar_tin":
    case "triangulacao": {
      try {
        const result = generateTinEntities(nextProject);
        const layers = ensureLayer(nextProject, { ...TIN_LAYER });
        nextProject = {
          ...nextProject,
          layers,
          entities: [...removeTinEntities(nextProject.entities), ...result.lines],
        };
        sideEffects.push({ type: "fit_view", entities: nextProject.entities });
        message =
          message ||
          `Triangulação TIN: ${result.triangleCount} triângulos, ${result.lines.length} arestas (${result.pointCount} pontos).`;
      } catch (err) {
        return fail(project, err instanceof Error ? err.message : "Falha na triangulação.");
      }
      break;
    }

    case "remover_tin": {
      const hadTin = nextProject.entities.some((e) => e.layerId === TIN_LAYER.id);
      nextProject = {
        ...nextProject,
        entities: removeTinEntities(nextProject.entities),
      };
      message = message || (hadTin ? "Triangulação TIN removida." : "Nenhuma triangulação TIN ativa.");
      break;
    }

    case "curvas_nivel": {
      const interval = command.intervalo ?? 1;
      const samples = extractSurveyElevationPoints(nextProject.entities);
      if (samples.length < 3) return fail(project, "Mínimo 3 pontos com cota Z.");
      try {
        const result = generateContoursFromPoints(samples, { interval });
        const layers = ensureLayer(nextProject, { ...CONTOUR_LAYER });
        nextProject = { ...nextProject, layers, entities: [...removeContourEntities(nextProject.entities), ...result.polylines] };
        sideEffects.push({ type: "fit_view", entities: nextProject.entities });
        message = message || `${result.polylines.length} curvas geradas (equidistância ${interval} m).`;
      } catch (err) {
        return fail(project, err instanceof Error ? err.message : "Falha nas curvas de nível.");
      }
      break;
    }

    case "gerar_mdt":
    case "gerar_mds":
    case "mapa_declividade":
    case "secoes":
    case "volume_corte":
    case "volume_aterro":
    case "inserir_sondagem":
    case "perfil_geologico":
    case "secao_spt":
    case "poco_monitoramento":
    case "ajustar_poligono":
      message = message || stub(command.acao.replace(/_/g, " "));
      break;

    case "mapa_hipsometrico": {
      const samples = extractSurveyElevationPoints(nextProject.entities);
      if (samples.length < 3) return fail(project, "Mínimo 3 pontos com cota Z para mapa hipsométrico.");
      if (typeof document === "undefined") {
        message = message || "Mapa hipsométrico requer ambiente de navegador.";
        break;
      }
      try {
        const raster = generateHypsometricRaster(samples);
        sideEffects.push({ type: "add_raster", raster });
        message =
          message ||
          `Mapa hipsométrico gerado (${samples.length} pontos, cotas ${raster.zMin?.toFixed(1)}–${raster.zMax?.toFixed(1)} m).`;
      } catch (err) {
        return fail(project, err instanceof Error ? err.message : "Falha no mapa hipsométrico.");
      }
      break;
    }

    case "importar": {
      const content = command.conteudo?.trim();
      if (!content) return fail(project, "Anexe o arquivo (CSV, KML, KMZ, DXF, GeoJSON…) e repita o comando.");
      const ext = (command.arquivo ?? "csv").toLowerCase();

      if (ext === "kml") {
        const parsed = parseKml(content);
        if (parsed.points.length === 0) return fail(project, parsed.warnings.join(" ") || "KML sem pontos.");
        const imported = surveyPointsToEntities(parsed.points);
        const layers = ensureLayer(nextProject, { id: "rtk_points", name: "PONTOS_KML", color: "#38bdf8", visible: true, locked: false });
        nextProject = { ...nextProject, layers, entities: [...nextProject.entities, ...imported] };
        sideEffects.push({ type: "fit_view", entities: nextProject.entities });
        message = message || `${imported.length} pontos importados do KML.`;
        break;
      }

      if (ext === "kmz") {
        return fail(project, "Para KMZ, anexe o arquivo .kmz pelo botão 📎 (não cole texto).");
      }

      if (ext === "shp") {
        return fail(project, "Importação SHP em desenvolvimento. Use KML, CSV, DXF ou GeoJSON.");
      }

      const filename = `import.${ext === "geojson" ? "geojson" : ext}`;
      const parsed = parseSurveyFile(filename, content);
      if (parsed.points.length === 0) return fail(project, parsed.warnings.join(" ") || "Nenhum ponto válido.");
      nextProject = importSurveyPointsToProject(nextProject, parsed.points);
      sideEffects.push({ type: "fit_view", entities: nextProject.entities });
      message = message || `${parsed.points.length} pontos importados (${ext.toUpperCase()}).`;
      break;
    }

    case "exportar": {
      const fmt = (command.formato ?? "dxf").toLowerCase();
      if (fmt === "kml") {
        const kml = exportCadProjectKml(nextProject);
        sideEffects.push({
          type: "download_text",
          filename: `${nextProject.name}.kml`,
          content: kml,
          mime: "application/vnd.google-earth.kml+xml",
        });
        message = message || "Exportação KML iniciada.";
        break;
      }
      if (fmt === "kmz") {
        const kmz = exportCadProjectKmz(nextProject);
        sideEffects.push({
          type: "download_binary",
          filename: `${nextProject.name}.kmz`,
          bytes: kmz,
          mime: "application/vnd.google-earth.kmz",
        });
        message = message || "Exportação KMZ iniciada.";
        break;
      }
      if (fmt === "pdf") {
        sideEffects.push({ type: "print_pdf" });
        message = message || "Abrindo diálogo de impressão PDF.";
        break;
      }
      if (fmt === "csv") {
        sideEffects.push({
          type: "download_text",
          filename: `${nextProject.name}_pontos.csv`,
          content: entitiesToSurveyCsv(nextProject.entities),
          mime: "text/csv",
        });
        message = message || "Exportação CSV iniciada.";
        break;
      }
      if (["dxf", "dwg", "shp", "ods"].includes(fmt)) {
        sideEffects.push({ type: "export_cad", format: fmt as "dxf" | "dwg" | "shp" | "ods", project: nextProject });
        message = message || `Exportação ${fmt.toUpperCase()} iniciada.`;
        break;
      }
      return fail(project, `Formato "${fmt}" não suportado. Use dxf, dwg, shp, csv, ods ou pdf.`);
    }

    case "memorial_descritivo": {
      const polygon = findClosedPolygon(nextProject, command.entidade_id, selectedId);
      if (!polygon) return fail(project, "Selecione um polígono fechado.");
      const form = options.memorialForm;
      const georef = detectCadGeorefFromProject(nextProject);
      const narrative = buildMemorialNarrative({
        vertices: polygon.vertices,
        vertexLabels: vertexLabelsPn(polygon.vertices.length),
        crsLabel: form?.crsLabel ?? "Sistema Geodésico Brasileiro Sirgas 2000",
        projectionNote:
          form?.projectionNote?.trim() && form.projectionNote.trim().toLowerCase() !== "plano de projeção utm"
            ? form.projectionNote
            : georef.utmProjectionLabel,
        appNote: form?.appNote ?? "Não consta área de APP.",
      });
      selectedId = polygon.id;
      sideEffects.push({ type: "download_memorial", entityId: polygon.id, project: nextProject });
      message = message || `Memorial gerado. ${narrative.map((p) => p.text).join("").slice(0, 200)}…`;
      break;
    }

    case "calcular_azimutes": {
      const polygon = findClosedPolygon(nextProject, command.entidade_id, selectedId);
      if (!polygon) return fail(project, "Selecione um polígono fechado.");
      const labels = vertexLabelsPn(polygon.vertices.length);
      const metrics = computePolygonMetrics(polygon.vertices, true, labels);
      const lines = metrics.segments.map((s) => `${s.fromLabel}→${s.toLabel}: ${formatAzimuthDmsInt(s.azimuthDeg)}`).join("; ");
      selectedId = polygon.id;
      message = message || lines;
      break;
    }

    case "calcular_rumos": {
      const polygon = findClosedPolygon(nextProject, command.entidade_id, selectedId);
      if (!polygon) return fail(project, "Selecione um polígono fechado.");
      const metrics = computePolygonMetrics(polygon.vertices, true, vertexLabelsPn(polygon.vertices.length));
      const lines = metrics.segments
        .map((s) => `${s.fromLabel}→${s.toLabel}: ${azimuthToRumo(s.azimuthDeg)} ${formatAzimuthDmsInt(s.azimuthDeg)}`)
        .join("; ");
      selectedId = polygon.id;
      message = message || lines;
      break;
    }

    case "conferir_fechamento": {
      const pl = findPolyline(nextProject, command.entidade_id, selectedId);
      if (!pl || pl.vertices.length < 2) return fail(project, "Selecione uma polilinha.");
      const first = pl.vertices[0];
      const last = pl.vertices[pl.vertices.length - 1];
      const gap = segmentDistance(first, last);
      const ok = pl.closed || gap < 0.05;
      selectedId = pl.id;
      message = message || (ok ? `Fechamento OK (gap ${gap.toFixed(3)} m).` : `Polígono aberto — gap ${gap.toFixed(3)} m entre primeiro e último vértice.`);
      break;
    }

    case "perfil_longitudinal": {
      const labels = command.pontos ?? [];
      if (labels.length < 2) {
        const pending = options.pendingProfileStart;
        if (pending && labels.length === 1) {
          const s = resolvePointLabels(nextProject.entities, [pending]);
          const e = resolvePointLabels(nextProject.entities, labels);
          if (s.missing.length || e.missing.length) return fail(project, "Pontos do perfil não encontrados.");
          const profile = generateLongitudinalProfile(nextProject.entities, s.vertices[0], e.vertices[0]);
          const layers = ensureLayer(nextProject, { ...PROFILE_LAYER });
          nextProject = { ...nextProject, layers, entities: [...nextProject.entities, profile] };
          selectedId = profile.id;
          meta = { pendingProfileStart: null };
          message = message || `Perfil longitudinal ${pending} → ${labels[0]}.`;
          break;
        }
        if (labels.length === 1) {
          meta = { pendingProfileStart: labels[0] };
          message = message || `Ponto inicial ${labels[0]}. Informe o ponto final.`;
          break;
        }
        return fail(project, "Informe ponto inicial e final.");
      }
      const { vertices, missing } = resolvePointLabels(nextProject.entities, labels.slice(0, 2));
      if (missing.length) return fail(project, `Pontos não encontrados: ${missing.join(", ")}.`);
      const profile = generateLongitudinalProfile(nextProject.entities, vertices[0], vertices[1]);
      const layers = ensureLayer(nextProject, { ...PROFILE_LAYER });
      nextProject = { ...nextProject, layers, entities: [...nextProject.entities, profile] };
      selectedId = profile.id;
      meta = { pendingProfileStart: null };
      message = message || `Perfil longitudinal ${labels[0]} → ${labels[1]}.`;
      break;
    }

    case "perfil_transversal": {
      const labels = command.pontos ?? [];
      const widthM = command.largura ?? command.distancia;

      if (widthM != null && widthM > 0 && labels.length >= 2) {
        const { vertices, missing } = resolvePointLabels(nextProject.entities, labels.slice(0, 2));
        if (missing.length) return fail(project, `Pontos não encontrados: ${missing.join(", ")}.`);
        const profile = generateTransversalProfileAtStation(
          nextProject.entities,
          vertices[0],
          vertices[1],
          widthM / 2,
        );
        const layers = ensureLayer(nextProject, { ...TRANSVERSAL_PROFILE_LAYER });
        nextProject = { ...nextProject, layers, entities: [...nextProject.entities, profile] };
        selectedId = profile.id;
        meta = { pendingProfileStart: null };
        message =
          message ||
          `Perfil transversal ${widthM.toFixed(1)} m em ${labels[0]} (direção ${labels[1]}).`;
        break;
      }

      if (labels.length < 2) {
        const pending = options.pendingProfileStart;
        if (pending && labels.length === 1) {
          const s = resolvePointLabels(nextProject.entities, [pending]);
          const e = resolvePointLabels(nextProject.entities, labels);
          if (s.missing.length || e.missing.length) return fail(project, "Pontos do perfil não encontrados.");
          const profile = generateTransversalProfile(nextProject.entities, s.vertices[0], e.vertices[0]);
          const layers = ensureLayer(nextProject, { ...TRANSVERSAL_PROFILE_LAYER });
          nextProject = { ...nextProject, layers, entities: [...nextProject.entities, profile] };
          selectedId = profile.id;
          meta = { pendingProfileStart: null };
          message = message || `Perfil transversal ${pending} → ${labels[0]}.`;
          break;
        }
        if (labels.length === 1) {
          meta = { pendingProfileStart: labels[0] };
          message = message || `Ponto inicial ${labels[0]}. Informe o ponto final.`;
          break;
        }
        return fail(project, "Informe dois pontos ou estaca + direção com largura.");
      }

      const { vertices, missing } = resolvePointLabels(nextProject.entities, labels.slice(0, 2));
      if (missing.length) return fail(project, `Pontos não encontrados: ${missing.join(", ")}.`);
      const profile = generateTransversalProfile(nextProject.entities, vertices[0], vertices[1]);
      const layers = ensureLayer(nextProject, { ...TRANSVERSAL_PROFILE_LAYER });
      nextProject = { ...nextProject, layers, entities: [...nextProject.entities, profile] };
      selectedId = profile.id;
      meta = { pendingProfileStart: null };
      message = message || `Perfil transversal ${labels[0]} → ${labels[1]}.`;
      break;
    }

    case "selecionar": {
      const targetId = command.entidade_id;
      if (!targetId) return fail(project, "Informe entidade_id.");
      if (!nextProject.entities.some((e) => e.id === targetId)) return fail(project, `Entidade ${targetId} não encontrada.`);
      selectedId = targetId;
      message = message || "Entidade selecionada.";
      break;
    }

    case "desconhecido":
    default:
      message =
        message ||
        "Comando não reconhecido. Ex.: criar polígono P1 P2 P3 P4, medir área, inserir cota P1 P2, curvas de nível 1 m, importar CSV, exportar DXF, memorial descritivo, perfil longitudinal P1 P2.";
      break;
  }

  return {
    ok: true,
    project: nextProject,
    selectedId,
    message,
    sideEffects: sideEffects.length ? sideEffects : undefined,
    meta,
  };
}

export function importKmzIntoProject(project: CadProject, buffer: ArrayBuffer): CadCommandExecutionResult {
  const { kml, warnings } = parseKmzBuffer(buffer);
  if (!kml) return fail(project, warnings.join(" ") || "KMZ inválido.");
  return executeCadAiCommand(project, {
    acao: "importar",
    arquivo: "kml",
    conteudo: kml,
    resposta: "Importação KMZ concluída.",
  });
}

export function describePolygonMetrics(polygon: CadPolylineEntity): string {
  const labels = vertexLabelsPn(polygon.vertices.length);
  const metrics = computePolygonMetrics(polygon.vertices, Boolean(polygon.closed), labels);
  return `Área: ${formatAreaBr(metrics.areaM2)}. Perímetro: ${formatDistanceBr(metrics.perimeterM)} m.`;
}

export function describeVertexCoords(polygon: CadPolylineEntity): string {
  const labels = vertexLabelsPn(polygon.vertices.length);
  return polygon.vertices.map((v, i) => `${labels[i]}: N ${formatCoordBr(v.y)} E ${formatCoordBr(v.x)}`).join("; ");
}
