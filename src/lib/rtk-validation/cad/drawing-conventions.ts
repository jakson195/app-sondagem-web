import { CONTOUR_LAYER } from "./contour";
import type { CadEntity, CadProject } from "./types";

export type ConventionKind =
  | "dot"
  | "dot-ring"
  | "line"
  | "line-thick"
  | "line-dashed"
  | "hatch"
  | "cross"
  | "north";

export type ConventionId =
  | "perimeter_vertex"
  | "boundary"
  | "survey_point"
  | "control_known"
  | "control_observed"
  | "residual"
  | "contour_major"
  | "contour_minor"
  | "legal_reserve"
  | "utm_grid"
  | "north";

export interface DrawingConventionDef {
  id: ConventionId;
  kind: ConventionKind;
  color: string;
  labelKey: ConventionId;
}

export const DRAWING_CONVENTION_CATALOG: DrawingConventionDef[] = [
  { id: "perimeter_vertex", kind: "dot", color: "#22c55e", labelKey: "perimeter_vertex" },
  { id: "boundary", kind: "line-thick", color: "#dc2626", labelKey: "boundary" },
  { id: "survey_point", kind: "dot", color: "#38bdf8", labelKey: "survey_point" },
  { id: "control_known", kind: "dot-ring", color: "#22c55e", labelKey: "control_known" },
  { id: "control_observed", kind: "dot-ring", color: "#f59e0b", labelKey: "control_observed" },
  { id: "residual", kind: "line-dashed", color: "#a78bfa", labelKey: "residual" },
  { id: "contour_major", kind: "line-thick", color: "#dc2626", labelKey: "contour_major" },
  { id: "contour_minor", kind: "line-dashed", color: "#111827", labelKey: "contour_minor" },
  { id: "legal_reserve", kind: "hatch", color: "#16a34a", labelKey: "legal_reserve" },
  { id: "utm_grid", kind: "cross", color: "#64748b", labelKey: "utm_grid" },
  { id: "north", kind: "north", color: "#111827", labelKey: "north" },
];

export type ConventionDetectOptions = {
  includeLayoutSymbols?: boolean;
};

function hasClosedBoundary(entities: CadEntity[]): boolean {
  return entities.some(
    (e) =>
      e.type === "polyline" &&
      e.closed &&
      e.vertices.length >= 3 &&
      e.layerId !== CONTOUR_LAYER.id,
  );
}

function hasContourMajor(entities: CadEntity[]): boolean {
  return entities.some(
    (e) => e.type === "polyline" && e.layerId === CONTOUR_LAYER.id && e.contourMajor === true,
  );
}

function hasContourMinor(entities: CadEntity[]): boolean {
  return entities.some(
    (e) => e.type === "polyline" && e.layerId === CONTOUR_LAYER.id && e.contourMajor !== true,
  );
}

function hasLegalReserveLayer(project: CadProject): boolean {
  return project.layers.some((l) => /reserva|car|app/i.test(l.name));
}

export function detectActiveConventionIds(
  project: CadProject,
  entities: CadEntity[],
  options: ConventionDetectOptions = {},
): ConventionId[] {
  const includeLayout = options.includeLayoutSymbols !== false;
  const ids = new Set<ConventionId>();

  if (hasClosedBoundary(entities)) {
    ids.add("boundary");
    ids.add("perimeter_vertex");
  }

  if (entities.some((e) => e.type === "point" && e.layerId === "rtk_points")) {
    ids.add("survey_point");
  }

  if (entities.some((e) => e.type === "point" && e.layerId === "ctrl_known")) {
    ids.add("control_known");
  }

  if (entities.some((e) => e.type === "point" && e.layerId === "ctrl_obs")) {
    ids.add("control_observed");
  }

  if (entities.some((e) => e.type === "line" && e.layerId === "residuals")) {
    ids.add("residual");
  }

  if (hasContourMajor(entities)) ids.add("contour_major");
  if (hasContourMinor(entities)) ids.add("contour_minor");

  if (hasLegalReserveLayer(project)) ids.add("legal_reserve");

  if (includeLayout) {
    ids.add("utm_grid");
    ids.add("north");
  }

  const order = DRAWING_CONVENTION_CATALOG.map((c) => c.id);
  return order.filter((id) => ids.has(id));
}

export function resolveDrawingConventions(
  project: CadProject,
  entities: CadEntity[],
  options?: ConventionDetectOptions,
): DrawingConventionDef[] {
  const active = new Set(detectActiveConventionIds(project, entities, options));
  return DRAWING_CONVENTION_CATALOG.filter((c) => active.has(c.id));
}
