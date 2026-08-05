import type { AdjustmentResult, ControlPointWithStats, SurveyPoint } from "../types";
import { defaultDrawLayerStyles } from "./layer-styles";
import type { CadEntity, CadImportPayload, CadLayer, CadProject } from "./types";
import { CAD_IMPORT_STORAGE_KEY } from "./types";

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function surveyCoord(pt: SurveyPoint) {
  return {
    x: pt.eCorr ?? pt.e,
    y: pt.nCorr ?? pt.n,
    z: pt.zCorr ?? pt.z,
  };
}

export const DEFAULT_CAD_LAYERS: CadLayer[] = [
  { id: "rtk_points", name: "PONTOS_AJUSTADOS", color: "#38bdf8", visible: true, locked: true },
  { id: "ctrl_known", name: "CONTROLE_CONHECIDO", color: "#22c55e", visible: true, locked: true },
  { id: "ctrl_obs", name: "CONTROLE_OBSERVADO", color: "#f59e0b", visible: true, locked: true },
  { id: "residuals", name: "RESIDUOS", color: "#a78bfa", visible: true, locked: true },
  { id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false, ...defaultDrawLayerStyles() },
  { id: "contours", name: "CURVAS_NIVEL", color: "#ef4444", visible: true, locked: true },
];

export function buildCadProjectFromAdjustment(input: {
  projectName: string;
  crs?: string;
  surveyPoints: SurveyPoint[];
  controlPoints: ControlPointWithStats[];
  adjustmentResult?: AdjustmentResult | null;
}): CadProject {
  const entities: CadEntity[] = [];

  for (const pt of input.surveyPoints) {
    const c = surveyCoord(pt);
    entities.push({
      id: newId("pt"),
      type: "point",
      layerId: "rtk_points",
      x: c.x,
      y: c.y,
      z: c.z,
      label: pt.code?.trim() || pt.description?.trim() || pt.name,
      sourceId: pt.id,
      locked: true,
    });
  }

  for (const cp of input.controlPoints) {
    entities.push({
      id: newId("ck"),
      type: "point",
      layerId: "ctrl_known",
      x: cp.eKnown,
      y: cp.nKnown,
      z: cp.zKnown,
      label: `${cp.name} (conhecido)`,
      locked: true,
    });
    entities.push({
      id: newId("co"),
      type: "point",
      layerId: "ctrl_obs",
      x: cp.eObserved,
      y: cp.nObserved,
      z: cp.zObserved,
      label: `${cp.name} (observado)`,
      locked: true,
    });
    entities.push({
      id: newId("ln"),
      type: "line",
      layerId: "residuals",
      start: { x: cp.eObserved, y: cp.nObserved, z: cp.zObserved },
      end: { x: cp.eKnown, y: cp.nKnown, z: cp.zKnown },
    });
  }

  return {
    name: input.projectName,
    crs: input.crs ?? "EPSG:4674",
    layers: DEFAULT_CAD_LAYERS.map((l) => ({ ...l })),
    entities,
    adjustment: input.adjustmentResult
      ? {
          method: input.adjustmentResult.params.method,
          rmsBefore: input.adjustmentResult.rmsBefore,
          rmsAfter: input.adjustmentResult.rmsAfter,
          importedAt: new Date().toISOString(),
        }
      : undefined,
  };
}

export function buildCadProjectFromPayload(payload: CadImportPayload): CadProject {
  const points =
    payload.adjustmentResult?.surveyPoints.length
      ? payload.adjustmentResult.surveyPoints
      : payload.surveyPoints;
  const controls =
    payload.adjustmentResult?.controlPoints.length
      ? payload.adjustmentResult.controlPoints
      : payload.controlPoints;

  return buildCadProjectFromAdjustment({
    projectName: payload.projectName,
    crs: payload.crs,
    surveyPoints: points,
    controlPoints: controls,
    adjustmentResult: payload.adjustmentResult,
  });
}

export function saveCadImportPayload(payload: CadImportPayload) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(CAD_IMPORT_STORAGE_KEY, JSON.stringify(payload));
}

export function loadCadImportPayload(): CadImportPayload | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(CAD_IMPORT_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CadImportPayload;
  } catch {
    return null;
  }
}

export function clearCadImportPayload() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(CAD_IMPORT_STORAGE_KEY);
}
