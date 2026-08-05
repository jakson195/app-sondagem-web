import type { SurveyPoint } from "../types";
import type { CadEntity, CadProject } from "./types";

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const IMPORT_LAYER = {
  id: "rtk_points",
  name: "PONTOS_IMPORTADOS",
  color: "#38bdf8",
  visible: true,
  locked: false,
} as const;

export function surveyPointsToCadEntities(
  points: Array<{ id: string; e: number; n: number; z: number; name?: string; code?: string }>,
): CadEntity[] {
  return points.map((p) => ({
    id: newId("pt"),
    type: "point" as const,
    layerId: IMPORT_LAYER.id,
    x: p.e,
    y: p.n,
    z: p.z,
    label: p.name?.trim() || p.code?.trim() || p.id,
    sourceId: p.id,
  }));
}

export function importSurveyPointsToProject(
  project: CadProject,
  points: SurveyPoint[],
  layerName: string = IMPORT_LAYER.name,
): CadProject {
  const imported = surveyPointsToCadEntities(points);
  const hasLayer = project.layers.some((l) => l.id === IMPORT_LAYER.id);
  const layers = hasLayer
    ? project.layers.map((l) =>
        l.id === IMPORT_LAYER.id ? { ...l, name: layerName, visible: true } : l,
      )
    : [...project.layers, { ...IMPORT_LAYER, name: layerName }];

  return {
    ...project,
    layers,
    entities: [...project.entities, ...imported],
  };
}
