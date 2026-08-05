import { polygonCentroid } from "./ai-geometry-utils";
import { computePolygonMetrics, formatAreaBr } from "./polygon-utils";
import type { CadProject, CadPolylineEntity } from "./types";

export const CAD_TEXT_LAYER = {
  id: "text",
  name: "TEXTOS",
  color: "#10b981",
  visible: true,
  locked: false,
} as const;

function newLabelId() {
  return `txt_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildPolygonCenterLabelText(name: string, areaM2: number): string {
  return `${name}\nÁrea ${formatAreaBr(areaM2)}`;
}

/** Insere rótulo (nome + área) no centroide de um polígono fechado. */
export function appendPolygonCenterLabel(
  project: CadProject,
  polygon: CadPolylineEntity,
  customText?: string,
): CadProject {
  if (!polygon.closed || polygon.vertices.length < 3) return project;

  const metrics = computePolygonMetrics(polygon.vertices, true);
  const name = polygon.name ?? "Polígono";
  const text = customText?.trim() || buildPolygonCenterLabelText(name, metrics.areaM2);
  const c = polygonCentroid(polygon.vertices);
  const layers = project.layers.some((l) => l.id === CAD_TEXT_LAYER.id)
    ? project.layers
    : [...project.layers, { ...CAD_TEXT_LAYER }];

  return {
    ...project,
    layers,
    entities: [
      ...project.entities,
      {
        id: newLabelId(),
        type: "point",
        layerId: CAD_TEXT_LAYER.id,
        x: c.x,
        y: c.y,
        z: c.z,
        label: text,
      },
    ],
  };
}
