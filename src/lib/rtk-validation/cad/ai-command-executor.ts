import { parseSurveyFile } from "../parsers";
import { normalizeCadAiCommand } from "./ai-command-catalog";
import {
  exportCadProjectKml,
  exportCadProjectKmz,
  parseKmzBuffer,
} from "./kml-io";
import { mergeImportedDrawing } from "./import-cad-drawing";
import { parseAsciiDxf } from "./import-dxf";
import { parseKmlToCadGeoms, resolveKmlImportGeoref } from "./import-kml-kmz";
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
  polygonAreaM2,
  segmentDistance,
  vertexLabelsPn,
} from "./polygon-utils";
import {
  generateLongitudinalProfile,
  generateTypicalCrossSections,
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
import { importSurveyPointsToProject } from "./import-survey-points";
import { buildSigefOdsBytes, sigefOdsFilename } from "./export-sigef-ods";
import { defaultMemorialForm } from "./memorial-types";
import {
  generateLoteamento,
  LoteamentoError,
  parseReservaCanto,
  polygonAreaPlanarM2,
  reservarFaixaDeArea,
  reservarRetanguloNoCanto,
  subdivideQuadraEmLotes,
  type ReservaAreaLado,
} from "./lot-subdivision";
import {
  applyLoteamentoLotClassification,
  DEFAULT_PERCENTUAL_ESQUINA,
  resolveAreaMinimaInterno,
} from "./lot-corner-classification";
import {
  applyLoteamentoTables,
  applyReservaLegalToProject,
  AREA_RESERVA_LEGAL_LAYER,
  AREA_UTIL_LAYER,
  appendAreaUtilToProject,
  collectAppRings,
  collectLoteamentoExclusionRings,
  collectReservaLegalRings,
  EIXO_NEED_LOTEAMENTO,
  isLoteamentoEixoPolyline,
  stripPreviousAreaUtil,
} from "./loteamento-tools";
import {
  applyReurbLotLabels,
  buildReurbTabularMemorialBytes,
  listReurbLots,
  reurbTabularFilename,
} from "./reurb";
import { formatStreetPlanName } from "./plan-annotation-labels";
import {
  computeEarthworkVolume,
  findAlignmentPolyline,
  formatVolumeM3,
  meanElevation,
  planeFromHorizontalZ,
  volumeOdsFilename,
  volumeSummarySheets,
} from "./earthwork";
import { buildOdsBytes } from "../ods-writer";
import type {
  CadAiCommand,
  CadAiSideEffect,
  CadCommandExecutionResult,
  CadCommandExecutorMeta,
  CadCommandExecutorOptions,
} from "./ai-command-types";
import type { CadEntity, CadPolylineEntity, CadProject, CadTool, CadVertex } from "./types";

const TEXT_LAYER = CAD_TEXT_LAYER;
const DIMENSION_LAYER = { id: "dimensions", name: "COTAS", color: "#a855f7", visible: true, locked: false } as const;
const LOTEAMENTO_VIAS_LAYER = {
  id: "loteamento_vias",
  name: "LOTEAMENTO_VIAS",
  color: "#64748b",
  textColor: "#0000FF",
  visible: true,
  locked: false,
} as const;
const LOTEAMENTO_LOTES_LAYER = {
  id: "loteamento_lotes",
  name: "LOTEAMENTO_LOTES",
  color: "#111827",
  textColor: "#111827",
  textSize: 22,
  lineWidth: 1,
  fillColor: "#4ade80",
  fillAlpha: 0.52,
  hatchPattern: "grass" as const,
  visible: true,
  locked: false,
} as const;
const LOTEAMENTO_CALCADAS_LAYER = {
  id: "loteamento_calcadas",
  name: "LOTEAMENTO_CALCADAS",
  color: "#94a3b8",
  fillColor: "#cbd5e1",
  hatchPattern: "diagonal" as const,
  visible: true,
  locked: false,
};
const LOTEAMENTO_EIXOS_LAYER = {
  id: "loteamento_eixos",
  name: "LOTEAMENTO_EIXO_VIA",
  color: "#334155",
  lineType: "dashed" as const,
  lineWidth: 1.25,
  visible: true,
  locked: false,
};
const LOTEAMENTO_QUADRAS_LAYER = {
  id: "loteamento_quadras",
  name: "LOTEAMENTO_QUADRAS",
  color: "#b45309",
  fillColor: "#fde68a",
  visible: true,
  locked: false,
};
const LOTEAMENTO_LAYER_IDS = new Set([
  LOTEAMENTO_VIAS_LAYER.id,
  LOTEAMENTO_LOTES_LAYER.id,
  LOTEAMENTO_CALCADAS_LAYER.id,
  LOTEAMENTO_EIXOS_LAYER.id,
  LOTEAMENTO_QUADRAS_LAYER.id,
]);
const VIA_EXISTENTE_LAYER = {
  id: "via_existente",
  name: "VIA_EXISTENTE",
  color: "#0f766e",
  lineType: "dashed" as const,
  lineWidth: 1.5,
  visible: true,
  locked: false,
};
const AREA_INSTITUCIONAL_LAYER = {
  id: "area_institucional",
  name: "AREA_INSTITUCIONAL",
  color: "#7c3aed",
  fillColor: "#c4b5fd",
  visible: true,
  locked: false,
};

const FERRAMENTA_TO_TOOL: Record<string, CadTool> = {
  selecionar: "select",
  select: "select",
  pan: "pan",
  linha: "line",
  line: "line",
  polilinha: "polyline",
  polyline: "polyline",
  editar_poligono: "editPolygon",
  editpolygon: "editPolygon",
  confrontacao: "confrontacao",
  confrontação: "confrontacao",
  inserir_coordenadas: "select",
  excluir_ponto: "deletePoint",
  alterar_cota: "editElevation",
};

const LAYER_ID_ALIASES: Record<string, string> = {
  curvasdenivel: "contours",
  curvasnivel: "contours",
  isolinhas: "contours",
  curvasinterpoladas: "contours_interpolated",
  curvasinterpoladasnivel: "contours_interpolated",
  tin: "tin",
  triangulacao: "tin",
  triangulacaotin: "tin",
  hipsometrico: "hypsometric",
  mapahipsometrico: "hypsometric",
  loteamentovias: "loteamento_vias",
  loteamentolotes: "loteamento_lotes",
  loteamentoeixovia: "loteamento_eixos",
  eixovia: "loteamento_eixos",
  viaexistente: "via_existente",
  ruaexistente: "via_existente",
};

function foldKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function findProjectLayer(project: CadProject, raw: string) {
  const key = foldKey(raw);
  const direct = project.layers.find((l) => foldKey(l.id) === key || foldKey(l.name) === key);
  if (direct) return direct;
  const aliasId = LAYER_ID_ALIASES[key];
  if (aliasId) {
    const aliased = project.layers.find((l) => l.id === aliasId || foldKey(l.id) === foldKey(aliasId));
    if (aliased) return aliased;
  }
  return project.layers.find((l) => {
    const id = foldKey(l.id);
    const name = foldKey(l.name);
    return (key.length >= 4 && (name.includes(key) || id.includes(key))) || name.includes(key);
  }) ?? null;
}

function pickFrontAzimuth(
  vertices: CadVertex[],
  lado?: string,
  segmentIndex?: number | null,
): number {
  const n = vertices.length;
  if (n < 2) return 90;
  if (lado === "selecionado_no_mapa" && segmentIndex != null && segmentIndex >= 0 && segmentIndex < n) {
    return azimuthFromNorth(vertices[segmentIndex], vertices[(segmentIndex + 1) % n]);
  }
  let bestI = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let score = len;
    if (lado === "norte") score = midY;
    else if (lado === "sul") score = -midY;
    else if (lado === "leste") score = midX;
    else if (lado === "oeste") score = -midX;
    if (score > bestScore) {
      bestScore = score;
      bestI = i;
    }
  }
  return azimuthFromNorth(vertices[bestI], vertices[(bestI + 1) % n]);
}

function coordsToPolyline(
  ring: number[][],
  layerId: string,
  name: string,
  idPrefix: string,
  z0: number,
  closed = true,
): CadPolylineEntity {
  const raw = ring.map(([x, y]) => ({ x, y, z: z0 }));
  const first = raw[0];
  const last = raw[raw.length - 1];
  const vertices =
    closed && first && last && first.x === last.x && first.y === last.y && first.z === last.z
      ? raw.slice(0, -1)
      : raw;
  return {
    id: newId(idPrefix),
    type: "polyline",
    layerId,
    vertices,
    closed,
    name,
  };
}

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureLayer(
  project: CadProject,
  layer: {
    id: string;
    name: string;
    color: string;
    visible: boolean;
    locked: boolean;
    fillColor?: string;
    fillAlpha?: number;
    textColor?: string;
    lineType?: "solid" | "dashed";
    lineWidth?: number;
    hatchPattern?: "diagonal" | "cross" | "grass";
  },
) {
  const idx = project.layers.findIndex((l) => l.id === layer.id);
  if (idx < 0) return [...project.layers, { ...layer }];
  if (layer.id !== "loteamento_lotes") return project.layers;
  return project.layers.map((existing, i) =>
    i === idx
      ? {
          ...existing,
          ...layer,
          visible: existing.visible,
          color: "#111827",
          textColor: "#111827",
          lineWidth: 1,
          fillColor: "#4ade80",
          fillAlpha: 0.52,
          hatchPattern: "grass" as const,
        }
      : existing,
  );
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
    case "triangulacao":
    case "gerar_mdt": {
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
          (command.acao === "gerar_mdt"
            ? `MDT gerado: ${result.triangleCount} triângulos, ${result.lines.length} arestas (${result.pointCount} pontos).`
            : `Triangulação TIN: ${result.triangleCount} triângulos, ${result.lines.length} arestas (${result.pointCount} pontos).`);
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

    case "gerar_mds":
    case "mapa_declividade":
    case "inserir_sondagem":
    case "perfil_geologico":
    case "secao_spt":
    case "poco_monitoramento":
    case "ajustar_poligono":
      message = message || stub(command.acao.replace(/_/g, " "));
      break;

    case "volume_corte":
    case "volume_aterro": {
      const samples = extractSurveyElevationPoints(nextProject.entities);
      if (samples.length < 3) return fail(project, "Mínimo 3 pontos com cota Z para calcular volume.");
      const clip = findClosedPolygonStrict(nextProject, command.entidade_id, selectedId);
      const z = command.z ?? meanElevation(samples);
      try {
        const result = computeEarthworkVolume({
          terrainSamples: samples,
          design: planeFromHorizontalZ(z),
          clipPolygon: clip?.vertices ?? null,
          designLabel: `Platô Z=${z.toFixed(2)} m`,
        });
        const focus =
          command.acao === "volume_aterro"
            ? `Aterro: ${formatVolumeM3(result.fillM3)} (corte ${formatVolumeM3(result.cutM3)})`
            : `Corte: ${formatVolumeM3(result.cutM3)} (aterro ${formatVolumeM3(result.fillM3)})`;
        message =
          message ||
          `${focus}. Líquido ${formatVolumeM3(result.netM3)}. Platô Z=${z.toFixed(2)} m${clip ? ` · região ${clip.name ?? clip.id}` : ""}.`;
        sideEffects.push({
          type: "download_binary",
          filename: volumeOdsFilename(nextProject),
          bytes: buildOdsBytes(volumeSummarySheets(result), "Volume terraplanagem"),
          mime: "application/vnd.oasis.opendocument.spreadsheet",
        });
      } catch (err) {
        return fail(project, err instanceof Error ? err.message : "Falha no cálculo de volume.");
      }
      break;
    }

    case "secoes": {
      const axis = findAlignmentPolyline(nextProject.entities, command.entidade_id ?? selectedId ?? null);
      if (!axis) return fail(project, "Selecione a polilinha do eixo para gerar as seções-tipo.");
      const interval = command.intervalo ?? command.distancia ?? 20;
      const width = command.largura ?? 20;
      if (!(interval > 0) || !(width > 0)) {
        return fail(project, "Informe intervalo de estacas e largura da seção (m), ambos > 0.");
      }
      try {
        const sections = generateTypicalCrossSections(nextProject.entities, axis.vertices, interval, width / 2);
        const layers = ensureLayer(nextProject, { ...TRANSVERSAL_PROFILE_LAYER });
        nextProject = { ...nextProject, layers, entities: [...nextProject.entities, ...sections] };
        if (sections[0]) selectedId = sections[0].id;
        message = message || `${sections.length} seção(ões)-tipo geradas no eixo (intervalo ${interval} m, largura ${width} m).`;
      } catch (err) {
        return fail(project, err instanceof Error ? err.message : "Falha ao gerar seções-tipo.");
      }
      break;
    }

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

      if (ext === "kml" || ext === "kmz") {
        const georef = resolveKmlImportGeoref(nextProject, content);
        const parsed = parseKmlToCadGeoms(content, georef);
        parsed.source = ext === "kmz" ? "kmz" : "kml";
        if (parsed.geoms.length === 0) return fail(project, parsed.warnings.join(" ") || "KML sem geometria.");
        const merged = mergeImportedDrawing(nextProject, parsed);
        nextProject = merged.project;
        sideEffects.push({ type: "fit_view", entities: merged.entities });
        sideEffects.push({ type: "enable_satellite" });
        message = message || `Importados ${merged.entities.length} objetos de ${ext.toUpperCase()}.`;
        break;
      }

      if (ext === "dxf") {
        const parsed = parseAsciiDxf(content);
        if (parsed.geoms.length === 0) {
          return fail(project, parsed.warnings.join(" ") || "DXF sem geometria suportada.");
        }
        const merged = mergeImportedDrawing(nextProject, parsed);
        nextProject = merged.project;
        sideEffects.push({ type: "fit_view", entities: merged.entities });
        message = message || `Importados ${merged.entities.length} objetos de DXF.`;
        break;
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

    case "exportar_sigef": {
      const polygon = findClosedPolygon(nextProject, command.entidade_id, selectedId);
      if (!polygon) return fail(project, "Selecione um polígono fechado (≥ 3 vértices) para gerar a planilha SIGEF.");
      const georef = detectCadGeorefFromProject(nextProject);
      if (!georef.isGeoreferenced) {
        return fail(project, "Importe pontos RTK e use Enquadrar antes de exportar SIGEF.");
      }
      if (polygon.vertices.length < 3) {
        return fail(project, "A poligonal precisa de pelo menos 3 vértices.");
      }
      selectedId = polygon.id;
      const form = options.memorialForm ?? defaultMemorialForm();
      const bytes = buildSigefOdsBytes(nextProject, polygon, form);
      sideEffects.push({
        type: "download_binary",
        filename: sigefOdsFilename(nextProject, polygon),
        bytes,
        mime: "application/vnd.oasis.opendocument.spreadsheet",
      });
      message =
        message ||
        "Planilha SIGEF gerada. Copie os dados para o modelo oficial e valide com a extensão LibreOffice no portal INCRA.";
      break;
    }

    case "gerar_loteamento": {
      const tryId = command.entidade_id ?? selectedId ?? undefined;
      if (tryId) {
        const raw = nextProject.entities.find((e) => e.id === tryId);
        if (raw && !(raw.type === "polyline" && raw.closed && raw.vertices.length >= 3)) {
          return fail(project, "A entidade referenciada não é um polígono fechado.");
        }
      }
      const gleba = findClosedPolygon(nextProject, command.entidade_id, selectedId);
      if (!gleba || gleba.vertices.length < 3) {
        return fail(project, "Selecione um polígono fechado (gleba) para gerar o loteamento.");
      }

      const larguraViaM = command.largura_via_m ?? 0;
      const profundidadeQuadraM = command.profundidade_quadra_m ?? 0;
      const testadaMinimaM = command.testada_minima_m ?? 0;
      const areaMinimaQuadraM2 =
        command.area_minima_quadra_m2 != null && Number.isFinite(command.area_minima_quadra_m2)
          ? Math.max(0, command.area_minima_quadra_m2)
          : command.area_quadra_m2 != null && Number.isFinite(command.area_quadra_m2)
            ? Math.max(0, command.area_quadra_m2)
            : 0;
      const larguraQuadraM =
        command.largura_quadra_m != null && Number.isFinite(command.largura_quadra_m)
          ? Math.max(0, command.largura_quadra_m)
          : 0;
      const profundidadeBlocoM =
        command.distancia_quadra_m != null && Number.isFinite(command.distancia_quadra_m)
          ? Math.max(0, command.distancia_quadra_m)
          : 0;
      const larguraCalcadaM =
        command.largura_calcada_m != null && Number.isFinite(command.largura_calcada_m)
          ? Math.max(0, command.largura_calcada_m)
          : 0;
      const raioEsquinaM =
        command.raio_esquina_m != null && Number.isFinite(command.raio_esquina_m)
          ? Math.max(0, command.raio_esquina_m)
          : 0;
      const eixoRua = command.eixo_rua !== false;
      const viasExistentesExtremidades = command.vias_existentes_extremidades === true;
      const nVerts = gleba.vertices.length;
      const ladosViaExistente = (command.lados_aresta ?? [])
        .map((i) => Math.trunc(i))
        .filter((i) => i >= 0 && i < nVerts)
        .map((i) => {
          const a = gleba.vertices[i];
          const b = gleba.vertices[(i + 1) % nVerts];
          return [
            [a.x, a.y],
            [b.x, b.y],
          ] as [number, number][];
        });
      const pickedEixoIds = new Set(command.entidade_ids ?? []);
      const eixosExistentes = nextProject.entities
        .filter((entity): entity is Extract<(typeof nextProject.entities)[number], { type: "polyline" }> => {
          if (entity.type !== "polyline" || entity.id === gleba.id || entity.vertices.length < 2) return false;
          return pickedEixoIds.has(entity.id) || entity.layerId === VIA_EXISTENTE_LAYER.id;
        })
        .map((entity) => entity.vertices.map((v) => [v.x, v.y] as [number, number]));
      nextProject = stripPreviousAreaUtil(nextProject);
      const reservas = collectLoteamentoExclusionRings(nextProject);
      const reservaLegal = collectReservaLegalRings(nextProject);
      const apps = collectAppRings(nextProject);
      const percentAreaUtil =
        command.percentual_area_util != null && Number.isFinite(command.percentual_area_util)
          ? Math.max(0, Math.min(99.9, command.percentual_area_util))
          : 15;
      if (larguraViaM <= 0 || profundidadeQuadraM <= 0 || testadaMinimaM <= 0) {
        return fail(
          project,
          "Parâmetros incoerentes: informe largura da via, profundidade do lote e testada mínima maiores que zero.",
        );
      }

      const z0 = gleba.vertices[0]?.z ?? 0;
      const coords = gleba.vertices.map((v) => [v.x, v.y] as [number, number]);
      try {
        const result = generateLoteamento(coords, {
          larguraViaM,
          profundidadeQuadraM,
          testadaMinimaM,
          areaMinimaQuadraM2,
          larguraQuadraM: larguraQuadraM > 0 ? larguraQuadraM : undefined,
          profundidadeBlocoM: profundidadeBlocoM > 0 ? profundidadeBlocoM : undefined,
          orientacao: command.orientacao,
          prefixoQuadra: command.prefixo_quadra?.trim() || "Quadra",
          larguraCalcadaM,
          eixoRua,
          raioEsquinaM,
          viasExistentesExtremidades: viasExistentesExtremidades || ladosViaExistente.length > 0,
          eixosExistentes: eixosExistentes.length > 0 ? eixosExistentes : undefined,
          ladosViaExistente: ladosViaExistente.length > 0 ? ladosViaExistente : undefined,
          reservas: reservas.length > 0 ? reservas : undefined,
          reservaLegal: reservaLegal.length > 0 ? reservaLegal : undefined,
          apps: apps.length > 0 ? apps : undefined,
          percentAreaUtil,
          cantoAreaUtil: command.canto_area_util,
        });

        const stamp = new Date().toISOString().slice(0, 10);
        const viasLayer = {
          ...LOTEAMENTO_VIAS_LAYER,
          name: `Loteamento vias — ${stamp}`,
        };
        const lotesLayer = {
          ...LOTEAMENTO_LOTES_LAYER,
          name: `Loteamento lotes — ${stamp}`,
        };
        const calcadasLayer = {
          ...LOTEAMENTO_CALCADAS_LAYER,
          name: `Loteamento calçadas — ${stamp}`,
        };
        const eixosLayer = {
          ...LOTEAMENTO_EIXOS_LAYER,
          name: `Loteamento eixos — ${stamp}`,
        };
        const quadrasLayer = {
          ...LOTEAMENTO_QUADRAS_LAYER,
          name: `Loteamento quadras — ${stamp}`,
        };

        const toPolyline = (
          ring: number[][],
          layerId: string,
          name: string,
          idPrefix: string,
          closed: boolean,
        ): CadPolylineEntity => {
          const raw = ring.map(([x, y]) => ({ x, y, z: z0 }));
          const first = raw[0];
          const last = raw[raw.length - 1];
          const vertices =
            closed && first && last && first.x === last.x && first.y === last.y && first.z === last.z
              ? raw.slice(0, -1)
              : raw;
          return {
            id: newId(idPrefix),
            type: "polyline",
            layerId,
            vertices,
            closed,
            name,
          };
        };

        const viaEntities = result.vias.map((poly, i) =>
          toPolyline(poly[0] ?? [], viasLayer.id, formatStreetPlanName(`Via ${i + 1}`, i), "via", true),
        );
        const loteEntities = result.lotes.map((lote) =>
          toPolyline(lote.coordinates[0] ?? [], lotesLayer.id, `${lote.quadra} — ${lote.numero}`, "lote", true),
        );
        const calcadaEntities = result.calcadas.map((poly, i) =>
          toPolyline(poly[0] ?? [], calcadasLayer.id, `Calçada ${i + 1}`, "calcada", true),
        );
        const eixoEntities = result.eixos.map((line, i) =>
          toPolyline(line, eixosLayer.id, `Eixo ${i + 1}`, "eixo", false),
        );
        const quadraEntities = result.quadraPolys.map((poly, i) =>
          toPolyline(poly[0] ?? [], quadrasLayer.id, `Quadra ${i + 1}`, "quadra", true),
        );

        const kept = nextProject.entities.filter((e) => {
          if (LOTEAMENTO_LAYER_IDS.has(e.layerId)) return false;
          if (e.layerId === AREA_UTIL_LAYER.id) return false;
          return true;
        });
        let layers = ensureLayer(nextProject, viasLayer);
        layers = layers.some((l) => l.id === lotesLayer.id) ? layers : [...layers, lotesLayer];
        if (calcadaEntities.length > 0) {
          layers = layers.some((l) => l.id === calcadasLayer.id) ? layers : [...layers, calcadasLayer];
        }
        if (eixoEntities.length > 0) {
          layers = layers.some((l) => l.id === eixosLayer.id) ? layers : [...layers, eixosLayer];
        }
        if (quadraEntities.length > 0) {
          layers = layers.some((l) => l.id === quadrasLayer.id) ? layers : [...layers, quadrasLayer];
        }
        nextProject = {
          ...nextProject,
          layers,
          entities: [...kept, ...viaEntities, ...calcadaEntities, ...eixoEntities, ...quadraEntities, ...loteEntities],
        };
        if (result.areaUtil.length > 0) {
          nextProject = appendAreaUtilToProject(
            nextProject,
            result.areaUtil.map((poly) => poly[0] ?? []),
            percentAreaUtil,
            z0,
          );
        }
        const labeledLots = applyReurbLotLabels(nextProject, { includeCotas: true, includeArea: true });
        if (labeledLots.lotCount > 0) nextProject = labeledLots.project;
        nextProject = applyLoteamentoLotClassification(nextProject, {
          percentualEsquina: command.percentual_esquina ?? DEFAULT_PERCENTUAL_ESQUINA,
          areaMinimaInterno: resolveAreaMinimaInterno({
            areaMinimaM2: command.area_minima_m2,
            testadaM: testadaMinimaM,
            profundidadeM: profundidadeQuadraM,
          }),
        });
        nextProject = applyLoteamentoTables(nextProject, {
          percentualEsquina: command.percentual_esquina ?? DEFAULT_PERCENTUAL_ESQUINA,
          areaMinimaInterno: resolveAreaMinimaInterno({
            areaMinimaM2: command.area_minima_m2,
            testadaM: testadaMinimaM,
            profundidadeM: profundidadeQuadraM,
          }),
        }).project;
        selectedId = loteEntities[0]?.id ?? gleba.id;
        sideEffects.push({ type: "fit_view", entities: nextProject.entities });
        const areaLotes = result.lotes.reduce((s, l) => s + l.area_m2, 0);
        const rlM2 = reservaLegal.reduce((s, ring) => s + polygonAreaPlanarM2(ring), 0);
        const rlShow = rlM2 > 0 ? rlM2 : result.areaGlebaM2 * 0.2;
        message =
          message ||
          `Loteamento gerado: ${result.lotes.length} lotes em ${result.quadras} quadras, lotes ${formatAreaBr(areaLotes)}. Total ${formatAreaBr(result.areaGlebaM2)}. RL 20% ${formatAreaBr(rlShow)}. Ruas ${formatAreaBr(result.areaViasM2)}. ${percentAreaUtil.toFixed(0)}% − ruas = área útil ${formatAreaBr(result.areaUtilAlvoM2)}.`;
      } catch (err) {
        const text = err instanceof LoteamentoError || err instanceof Error ? err.message : "Falha ao gerar loteamento.";
        return fail(project, text);
      }
      break;
    }

    case "alterar_eixo": {
      if (!nextProject.entities.some(isLoteamentoEixoPolyline)) {
        return fail(project, EIXO_NEED_LOTEAMENTO);
      }
      sideEffects.push({ type: "start_alterar_eixo" });
      message = message || "Clique o primeiro ponto do eixo (face da quadra).";
      break;
    }

    case "gerar_reurb": {
      const labeled = applyReurbLotLabels(nextProject, { includeCotas: true, includeArea: true });
      if (labeled.lotCount === 0) {
        return fail(
          project,
          "Nenhum polígono fechado de lote. Feche polilinhas na camada de lotes (ou desenhe lotes sobre a ortofoto).",
        );
      }
      nextProject = labeled.project;
      sideEffects.push({ type: "fit_view", entities: nextProject.entities });
      message =
        message ||
        `REURB: ${labeled.lotCount} lote(s) numerados com cotas e medidas (Lei 13.465/2017).`;
      break;
    }

    case "exportar_reurb_tabular": {
      const lots = listReurbLots(nextProject);
      if (lots.length === 0) {
        return fail(project, "Nenhum lote fechado para o memorial tabular REURB.");
      }
      const form = options.memorialForm ?? defaultMemorialForm();
      const bytes = buildReurbTabularMemorialBytes(nextProject, form);
      sideEffects.push({
        type: "download_binary",
        filename: reurbTabularFilename(nextProject),
        bytes,
        mime: "application/vnd.oasis.opendocument.spreadsheet",
      });
      message = message || `Memorial tabular REURB gerado (${lots.length} lote(s)).`;
      break;
    }

    case "gerar_plantas_reurb": {
      const lots = listReurbLots(nextProject);
      if (lots.length === 0) {
        return fail(project, "Nenhum lote fechado para gerar plantas individuais.");
      }
      sideEffects.push({ type: "generate_reurb_plantas", project: nextProject });
      message =
        message ||
        `Gerando plantas individuais de ${lots.length} lote(s) em DWG e PDF…`;
      break;
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

    case "ativar_ferramenta": {
      const rawTool = (command.ferramenta ?? "").trim().toLowerCase().replace(/\s+/g, "_");
      const tool = FERRAMENTA_TO_TOOL[rawTool];
      if (!tool) {
        return fail(
          project,
          "Informe a ferramenta: selecionar, pan, linha, polilinha, editar_poligono ou confrontacao.",
        );
      }
      sideEffects.push({ type: "set_tool", tool });
      message = message || `Ferramenta ativa: ${command.ferramenta?.replace(/_/g, " ") ?? tool}.`;
      break;
    }

    case "trocar_camada": {
      const rawLayer = command.camada?.trim();
      if (!rawLayer) return fail(project, "Informe o nome da camada.");
      const layer = findProjectLayer(nextProject, rawLayer);
      if (!layer) {
        const names = nextProject.layers.map((l) => l.name).join(", ");
        return fail(project, `Camada "${rawLayer}" não encontrada.${names ? ` Camadas: ${names}.` : ""}`);
      }
      const visible = command.visivel ?? true;
      nextProject = {
        ...nextProject,
        layers: nextProject.layers.map((l) => (l.id === layer.id ? { ...l, visible } : l)),
      };
      message = message || `Camada ${layer.name} ${visible ? "visível" : "oculta"}.`;
      break;
    }

    case "subdividir_quadra": {
      const gleba = findClosedPolygon(nextProject, command.entidade_id, selectedId);
      if (!gleba || gleba.vertices.length < 3) {
        return fail(project, "Selecione um polígono fechado (quadra) para subdividir.");
      }
      const testadaM = command.testada_m ?? command.testada_minima_m ?? 0;
      if (!(testadaM > 0)) {
        return fail(project, "Informe a testada desejada em metros (testada_m).");
      }
      const coords = gleba.vertices.map((v) => [v.x, v.y] as [number, number]);
      const az = pickFrontAzimuth(gleba.vertices, command.lado, options.selectedSegmentIndex);
      const lots = subdivideQuadraEmLotes(coords, az, testadaM, 0);
      if (lots.length === 0) {
        return fail(
          project,
          "Não foi possível subdividir a quadra com essa testada. Verifique o lado da frente ou aumente a testada.",
        );
      }
      const z0 = gleba.vertices[0]?.z ?? 0;
      const layers = ensureLayer(nextProject, LOTEAMENTO_LOTES_LAYER);
      const loteEntities = lots.map((poly, i) =>
        coordsToPolyline(poly[0] ?? [], LOTEAMENTO_LOTES_LAYER.id, `Lote ${i + 1}`, "lote", z0),
      );
      nextProject = {
        ...nextProject,
        layers,
        entities: [...nextProject.entities.filter((e) => e.id !== gleba.id), ...loteEntities],
      };
      selectedId = loteEntities[0]?.id ?? null;
      sideEffects.push({ type: "fit_view", entities: nextProject.entities });
      message = message || `Quadra subdividida em ${loteEntities.length} lote(s) com testada de ${testadaM} m.`;
      break;
    }

    case "criar_rua_existente": {
      const poly = findPolyline(nextProject, command.entidade_id, selectedId);
      if (!poly || poly.vertices.length < 2) {
        return fail(project, "Selecione ou desenhe uma polilinha para marcar como rua existente.");
      }
      const nome = (command.nome ?? command.texto)?.trim() || poly.name || "Via existente";
      const layers = ensureLayer(nextProject, VIA_EXISTENTE_LAYER);
      nextProject = {
        ...nextProject,
        layers,
        entities: nextProject.entities.map((e) =>
          e.id === poly.id ? { ...e, layerId: VIA_EXISTENTE_LAYER.id, name: nome } : e,
        ),
      };
      selectedId = poly.id;
      message = message || `Polilinha marcada como rua existente${nome ? ` (${nome})` : ""}.`;
      break;
    }

    case "reservar_area": {
      const gleba = findClosedPolygon(nextProject, command.entidade_id, selectedId);
      if (!gleba || gleba.vertices.length < 3) {
        return fail(project, "Selecione um polígono fechado (gleba) para reservar a faixa.");
      }
      const tipo = (command.tipo ?? "").trim().toLowerCase();
      if (tipo !== "institucional" && tipo !== "reserva_legal") {
        return fail(project, "Informe o tipo da reserva: institucional ou reserva_legal.");
      }
      const pct = command.percentual ?? 0;
      if (!(pct > 0) || pct >= 100) {
        return fail(project, "Informe um percentual entre 0 e 100 (exclusive).");
      }
      const ladoRaw = (command.lado ?? "fundo").toLowerCase();
      const canto = parseReservaCanto(ladoRaw);
      const lado: ReservaAreaLado =
        ladoRaw === "frente" || ladoRaw === "fundo" || ladoRaw === "esquerda" || ladoRaw === "direita"
          ? ladoRaw
          : "fundo";
      const areaTotal = polygonAreaM2(gleba.vertices, true);
      const alvo = (pct / 100) * areaTotal;
      try {
        const z0 = gleba.vertices[0]?.z ?? 0;
        const reserveLayer = tipo === "institucional" ? AREA_INSTITUCIONAL_LAYER : AREA_RESERVA_LEGAL_LAYER;
        const layers = ensureLayer(nextProject, reserveLayer);
        const glebaCoords = gleba.vertices.map((v) => [v.x, v.y] as [number, number]);

        if (tipo === "reserva_legal" && canto) {
          const applied = applyReservaLegalToProject(nextProject, {
            glebaId: gleba.id,
            percent: pct,
            canto,
          });
          nextProject = applied.project;
          selectedId = applied.reserved.id;
          sideEffects.push({ type: "set_tool", tool: "select" });
          message =
            message ||
            `Reservados ${formatAreaBr(applied.reservedM2)} (${pct}%) para reserva legal no canto ${canto.replace(/_/g, " ")}. Arraste o polígono para reposicionar.`;
        } else if (canto) {
          const placed = reservarRetanguloNoCanto(glebaCoords, canto, alvo);
          const reserved = coordsToPolyline(
            placed.reserved,
            reserveLayer.id,
            "Área institucional",
            "inst",
            z0,
          );
          nextProject = {
            ...nextProject,
            layers,
            entities: [
              ...nextProject.entities.filter(
                (e) => !(e.layerId === reserveLayer.id && e.type === "polyline" && e.closed),
              ),
              reserved,
            ],
          };
          nextProject = appendPolygonCenterLabel(nextProject, reserved);
          selectedId = reserved.id;
          sideEffects.push({ type: "set_tool", tool: "select" });
          message =
            message ||
            `Reservados ${formatAreaBr(placed.reservedM2)} (${pct}%) para área institucional no canto ${canto.replace(/_/g, " ")}. Arraste o polígono para reposicionar.`;
        } else {
          const cut = reservarFaixaDeArea(glebaCoords, lado, alvo);
          const reserved = coordsToPolyline(
            cut.reserved,
            reserveLayer.id,
            tipo === "institucional" ? "Área institucional" : "Reserva legal",
            tipo === "institucional" ? "inst" : "rl",
            z0,
          );
          const remainder = coordsToPolyline(cut.remainder, gleba.layerId, gleba.name ?? "Gleba", "gleba", z0);
          nextProject = {
            ...nextProject,
            layers,
            entities: [...nextProject.entities.filter((e) => e.id !== gleba.id), remainder, reserved],
          };
          selectedId = reserved.id;
          sideEffects.push({ type: "fit_view", entities: nextProject.entities });
          message =
            message ||
            `Reservados ${formatAreaBr(cut.reservedM2)} (${pct}%) para ${tipo === "institucional" ? "área institucional" : "reserva legal"} no ${lado}. Gleba restante: ${formatAreaBr(cut.remainderM2)}.`;
        }
      } catch (err) {
        const text = err instanceof LoteamentoError || err instanceof Error ? err.message : "Falha ao reservar a faixa.";
        return fail(project, text);
      }
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
    arquivo: "kmz",
    conteudo: kml,
    resposta: "",
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
