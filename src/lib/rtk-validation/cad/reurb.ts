import { zipSync } from "fflate";
import { detectCadGeorefFromProject, vertexToEn } from "./georef";
import type { MemorialFormDefaults } from "./memorial-types";
import { buildOdsBlob, buildOdsBytes, type OdsSheet } from "../ods-writer";
import {
  computePolygonMetrics,
  formatAzimuthDmsInt,
  vertexLabelsPn,
} from "./polygon-utils";
import {
  CAD_PLAN_AREA,
  CAD_PLAN_INK,
  buildCadastralLotPlanTexts,
  cadastralLotEntityTextSize,
} from "./plan-annotation-labels";
import type {
  CadEntity,
  CadLayer,
  CadPolylineEntity,
  CadProject,
  CadVertex,
} from "./types";

export const LOTEAMENTO_LOTES_LAYER_ID = "loteamento_lotes";
export const LOTEAMENTO_VIAS_LAYER_ID = "loteamento_vias";
export const LOTEAMENTO_CALCADAS_LAYER_ID = "loteamento_calcadas";
export const LOTEAMENTO_EIXOS_LAYER_ID = "loteamento_eixos";

export const REURB_ANNOTATION_LAYER: CadLayer = {
  id: "reurb_anotacoes",
  name: "REURB_ANOTACOES",
  color: CAD_PLAN_INK,
  textColor: CAD_PLAN_INK,
  textSize: 22,
  visible: true,
  locked: false,
};

/** Camadas que não são lotes urbanos (ANM/SIGEF/sistema/vias). */
const SKIP_LOT_LAYER_IDS = new Set([
  "rtk_points",
  "ctrl_known",
  "ctrl_obs",
  "residuals",
  "contours",
  "contour_labels",
  "tin",
  "text",
  "orthophoto",
  "hypsometric",
  "cutfill",
  "contours_interpolated",
  "dimensions",
  "profile",
  "profile_transversal",
  "locacao",
  REURB_ANNOTATION_LAYER.id,
  LOTEAMENTO_VIAS_LAYER_ID,
  LOTEAMENTO_CALCADAS_LAYER_ID,
  LOTEAMENTO_EIXOS_LAYER_ID,
  "loteamento_quadras",
  "loteamento_pontos",
  "loteamento_tabelas",
  "loteamento_encontros",
  "loteamento_perfil",
  "loteamento_greide",
  "loteamento_secao",
  "drenagem_pv",
  "drenagem_bocas",
  "drenagem_tubos",
  "drenagem_contrib",
  "drenagem_emissario",
  "area_reserva_legal",
  "anm_processos",
  "anm_protecao_fonte",
  "anm_arrendamentos",
  "anm_bloqueio",
  "anm_reservas_garimpeiras",
  "sigef_particular",
  "sigef_publico",
]);

export type ReurbLotLabelsOptions = {
  includeCotas?: boolean;
  includeArea?: boolean;
};

export type ApplyReurbLotLabelsResult = {
  project: CadProject;
  lotCount: number;
};

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function isSkippedLotLayer(layerId: string, layers: CadLayer[]): boolean {
  if (SKIP_LOT_LAYER_IDS.has(layerId)) return true;
  if (layerId.startsWith("anm_") || layerId.startsWith("sigef_")) return true;
  const layer = layers.find((l) => l.id === layerId);
  return Boolean(layer?.locked);
}

export function formatReurbLotNumber(index: number): string {
  return `Lote ${String(index + 1).padStart(2, "0")}`;
}

export function reurbLotSlug(index: number): string {
  return `lote_${String(index + 1).padStart(2, "0")}`;
}

export function listReurbLots(project: CadProject): CadPolylineEntity[] {
  const closed = project.entities.filter(
    (e): e is CadPolylineEntity => e.type === "polyline" && Boolean(e.closed) && e.vertices.length >= 3,
  );
  const onLotesLayer = closed.filter((e) => e.layerId === LOTEAMENTO_LOTES_LAYER_ID);
  const source =
    onLotesLayer.length > 0
      ? onLotesLayer
      : closed.filter((e) => !isSkippedLotLayer(e.layerId, project.layers));

  return [...source].sort((a, b) => {
    const byName = (a.name ?? "").localeCompare(b.name ?? "", "pt-BR", { numeric: true });
    if (byName !== 0) return byName;
    return a.id.localeCompare(b.id);
  });
}

function keepExistingLotName(name: string | undefined): boolean {
  const raw = name?.trim() ?? "";
  if (!raw) return false;
  return !/^pol[ií]gono\b/i.test(raw);
}

function ensurePlanAnnotationLayer(project: CadProject): CadLayer[] {
  const idx = project.layers.findIndex((layer) => layer.id === REURB_ANNOTATION_LAYER.id);
  if (idx < 0) return [...project.layers, { ...REURB_ANNOTATION_LAYER }];
  return project.layers.map((layer, i) =>
    i === idx
      ? {
          ...layer,
          color: CAD_PLAN_INK,
          textColor: CAD_PLAN_INK,
          textSize: Math.max(layer.textSize ?? 0, REURB_ANNOTATION_LAYER.textSize ?? 22),
          visible: true,
          locked: false,
        }
      : layer,
  );
}

/** Numera lotes e insere cotas no estilo figura 2 (número, testada, profundidade, área). */
export function applyReurbLotLabels(
  project: CadProject,
  options: ReurbLotLabelsOptions = {},
): ApplyReurbLotLabelsResult {
  const includeCotas = options.includeCotas !== false;
  const includeArea = options.includeArea !== false;
  const lots = listReurbLots(project);
  if (lots.length === 0) return { project, lotCount: 0 };

  const streets = project.entities.filter(
    (e): e is CadPolylineEntity =>
      e.type === "polyline" &&
      Boolean(e.closed) &&
      e.vertices.length >= 3 &&
      e.layerId === LOTEAMENTO_VIAS_LAYER_ID,
  );

  const renamedIds = new Map(
    lots.map((lot, i) => [lot.id, keepExistingLotName(lot.name) ? lot.name!.trim() : formatReurbLotNumber(i)]),
  );
  const withoutOld = project.entities.filter((e) => e.layerId !== REURB_ANNOTATION_LAYER.id);
  const renamed: CadEntity[] = withoutOld.map((e) => {
    if (e.type !== "polyline") return e;
    const name = renamedIds.get(e.id);
    return name ? { ...e, name } : e;
  });

  const annotations: CadEntity[] = [];
  for (const [index, lot] of lots.entries()) {
    const named = { ...lot, name: renamedIds.get(lot.id) ?? lot.name };
    const texts = buildCadastralLotPlanTexts(named, index, { includeCotas, includeArea, streets });
    for (const text of texts) {
      annotations.push({
        id: newId(text.role === "lot-edge" ? "reurb_dimlbl" : "reurb_lbl"),
        type: "point",
        layerId: REURB_ANNOTATION_LAYER.id,
        x: text.x,
        y: text.y,
        z: text.z,
        label: text.label,
        rotationDeg: text.rotationDeg,
        textColor: text.role === "lot-area" ? CAD_PLAN_AREA : CAD_PLAN_INK,
        textSize: cadastralLotEntityTextSize(text.role),
      });
    }
  }

  return {
    project: {
      ...project,
      layers: ensurePlanAnnotationLayer(project),
      entities: [...renamed, ...annotations],
    },
    lotCount: lots.length,
  };
}

function nearAnyVertex(point: CadVertex, vertices: CadVertex[], eps = 0.2): boolean {
  return vertices.some((v) => Math.hypot(point.x - v.x, point.y - v.y) <= eps);
}

function pointInPolygon(x: number, y: number, vertices: CadVertex[]): boolean {
  let inside = false;
  const n = vertices.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;
    const denom = yj - yi || 1e-15;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / denom + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function entityBelongsToLot(entity: CadEntity, lot: CadPolylineEntity): boolean {
  if (entity.id === lot.id) return true;
  if (entity.layerId !== REURB_ANNOTATION_LAYER.id && entity.layerId !== "text" && entity.layerId !== "dimensions") {
    return false;
  }
  if (entity.type === "point") {
    return pointInPolygon(entity.x, entity.y, lot.vertices) || nearAnyVertex(entity, lot.vertices);
  }
  if (entity.type === "line") {
    return nearAnyVertex(entity.start, lot.vertices) && nearAnyVertex(entity.end, lot.vertices);
  }
  return false;
}

export function collectLotPlantEntities(project: CadProject, lot: CadPolylineEntity): CadEntity[] {
  return project.entities.filter((e) => entityBelongsToLot(e, lot));
}

/** Projeto clone só com o lote e suas anotações (cotas/rótulos). */
export function cloneProjectForLot(
  project: CadProject,
  lot: CadPolylineEntity,
  index: number,
): CadProject {
  const entities = collectLotPlantEntities(project, lot);
  const layerIds = new Set(entities.map((e) => e.layerId));
  const layers = project.layers.filter((l) => layerIds.has(l.id));
  const lotLayer = project.layers.find((l) => l.id === lot.layerId);
  if (lotLayer && !layers.some((l) => l.id === lotLayer.id)) layers.push(lotLayer);
  return {
    name: lot.name?.trim() || formatReurbLotNumber(index),
    crs: project.crs,
    layers: layers.length ? layers : project.layers,
    entities,
    adjustment: project.adjustment,
  };
}

export type ReurbLotRow = {
  index: number;
  id: string;
  name: string;
  areaM2: number;
  areaHa: number;
  perimeterM: number;
  vertexCount: number;
};

export function summarizeReurbLots(project: CadProject): ReurbLotRow[] {
  return listReurbLots(project).map((lot, index) => {
    const metrics = computePolygonMetrics(lot.vertices, true);
    return {
      index,
      id: lot.id,
      name: lot.name?.trim() || formatReurbLotNumber(index),
      areaM2: metrics.areaM2,
      areaHa: metrics.areaHa,
      perimeterM: metrics.perimeterM,
      vertexCount: lot.vertices.length,
    };
  });
}

export function buildReurbTabularMemorialSheets(
  project: CadProject,
  memorial: MemorialFormDefaults,
): { sheets: OdsSheet[]; title: string; lotCount: number } {
  const lots = listReurbLots(project);
  const georef = detectCadGeorefFromProject(project);
  const denom = project.name?.trim() || "REURB";
  const totalArea = lots.reduce((sum, lot) => sum + computePolygonMetrics(lot.vertices, true).areaM2, 0);

  const identificacao: (string | number)[][] = [
    ["Campo", "Valor"],
    ["Natureza do serviço", "Regularização Fundiária Urbana (REURB) — Lei 13.465/2017"],
    ["Denominação", denom],
    ["Município", memorial.municipality],
    ["UF", memorial.state],
    ["Proprietário (preencher)", memorial.owner],
    ["Matrícula / registro (preencher)", memorial.registration],
    ["Responsável técnico", memorial.technicalName],
    ["CREA", memorial.technicalCrea],
    ["Sistema geodésico", memorial.crsLabel],
    ["Projeção", memorial.projectionNote || georef.utmProjectionLabel],
    ["EPSG UTM", georef.utmEpsg],
    ["Quantidade de lotes", lots.length],
    ["Área total dos lotes (m²)", Number(totalArea.toFixed(4))],
    ["Área total dos lotes (ha)", Number((totalArea / 10_000).toFixed(4))],
    [
      "Observação",
      "Memorial tabular gerado pelo DataGeo CAD para regularização urbana. Proprietário e matrícula são campos a preencher por lote quando distintos.",
    ],
  ];

  const lotes: (string | number)[][] = [
    [
      "Denominação",
      "Lote nº",
      "Nome no desenho",
      "Área (m²)",
      "Área (ha)",
      "Perímetro (m)",
      "Vértices",
      "Proprietário",
      "Matrícula / registro",
      "Município",
      "UF",
    ],
  ];

  const vertices: (string | number)[][] = [["Lote nº", "Vértice", "E (m)", "N (m)", "Z (m)"]];
  const confrontacoes: (string | number)[][] = [
    ["Lote nº", "De", "Para", "Azimute", "Distância (m)", "Confrontante"],
  ];

  lots.forEach((lot, index) => {
    const loteNo = formatReurbLotNumber(index);
    const labels = vertexLabelsPn(lot.vertices.length);
    const metrics = computePolygonMetrics(lot.vertices, true, labels);
    lotes.push([
      denom,
      loteNo,
      lot.name?.trim() || loteNo,
      Number(metrics.areaM2.toFixed(4)),
      Number(metrics.areaHa.toFixed(4)),
      Number(metrics.perimeterM.toFixed(4)),
      lot.vertices.length,
      memorial.owner,
      memorial.registration,
      memorial.municipality,
      memorial.state,
    ]);

    lot.vertices.forEach((v, i) => {
      const { e, n } = vertexToEn(v, georef);
      vertices.push([
        loteNo,
        labels[i] ?? `P${i + 1}`,
        Number(e.toFixed(3)),
        Number(n.toFixed(3)),
        Number(v.z.toFixed(3)),
      ]);
    });

    metrics.segments.forEach((seg, i) => {
      confrontacoes.push([
        loteNo,
        seg.fromLabel,
        seg.toLabel,
        formatAzimuthDmsInt(seg.azimuthDeg),
        Number(seg.distance.toFixed(3)),
        (lot.confrontations?.[i] ?? "").trim(),
      ]);
    });
  });

  return {
    title: `REURB ${denom}`,
    lotCount: lots.length,
    sheets: [
      { name: "Identificacao", rows: identificacao },
      { name: "Lotes", rows: lotes },
      { name: "Vertices", rows: vertices },
      { name: "Confrontacoes", rows: confrontacoes },
    ],
  };
}

export function buildReurbTabularMemorialBytes(
  project: CadProject,
  memorial: MemorialFormDefaults,
): Uint8Array {
  const { sheets, title } = buildReurbTabularMemorialSheets(project, memorial);
  return buildOdsBytes(sheets, title);
}

export function buildReurbTabularMemorialBlob(
  project: CadProject,
  memorial: MemorialFormDefaults,
): Blob {
  const { sheets, title } = buildReurbTabularMemorialSheets(project, memorial);
  return buildOdsBlob(sheets, title);
}

export function reurbTabularFilename(project: CadProject): string {
  const base = (project.name || "reurb").replace(/[^\w\-]+/g, "_").slice(0, 60);
  return `${base}_REURB_tabular.ods`;
}

export function reurbPlantasZipFilename(project: CadProject): string {
  const base = (project.name || "reurb").replace(/[^\w\-]+/g, "_").slice(0, 60);
  return `${base}_plantas_reurb.zip`;
}

export function zipReurbPlantas(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files);
}
