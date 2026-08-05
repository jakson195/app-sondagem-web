import tin from "@turf/tin";
import type { FeatureCollection, Point } from "geojson";
import {
  CONTOUR_LAYER,
  extractSurveyElevationPoints,
  formatContourElevationLabel,
  parseContourElevation,
  pickContourLabelVertex,
} from "./contour";
import type { CadEntity, CadLineEntity, CadPointEntity, CadPolylineEntity, CadProject } from "./types";

export const TIN_LAYER = {
  id: "tin",
  name: "TRIANGULACAO_TIN",
  color: "#6366f1",
  visible: true,
  locked: true,
} as const;

export const CONTOUR_LABEL_LAYER = {
  id: "contour_labels",
  name: "COTAS_CURVAS",
  color: "#ef4444",
  visible: true,
  locked: false,
} as const;

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function removeTinEntities(entities: CadEntity[]): CadEntity[] {
  return entities.filter((e) => e.layerId !== TIN_LAYER.id);
}

export function removeContourLabelEntities(entities: CadEntity[]): CadEntity[] {
  return entities.filter((e) => e.layerId !== CONTOUR_LABEL_LAYER.id);
}

/** Gera triangulação TIN (arestas) a partir dos pontos com cota. */
export function generateTinEntities(project: CadProject): {
  lines: CadLineEntity[];
  pointCount: number;
  triangleCount: number;
} {
  const samples = extractSurveyElevationPoints(project.entities);
  if (samples.length < 3) {
    throw new Error("São necessários pelo menos 3 pontos com cota para triangulação.");
  }

  const fc: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: samples.map((p, i) => ({
      type: "Feature",
      properties: { z: p.z, name: `T${i + 1}` },
      geometry: { type: "Point", coordinates: [p.x, p.y] },
    })),
  };

  const tinFc = tin(fc, "z");
  const lines: CadLineEntity[] = [];
  const edgeSet = new Set<string>();
  let triangleCount = 0;

  for (const feature of tinFc.features) {
    const ring = feature.geometry.coordinates[0] as number[][];
    if (ring.length < 4) continue;
    triangleCount += 1;

    const zs = [feature.properties?.a, feature.properties?.b, feature.properties?.c] as number[];

    for (let i = 0; i < 3; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % 3];
      const key = [a[0].toFixed(4), a[1].toFixed(4), b[0].toFixed(4), b[1].toFixed(4)].sort().join("|");
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      lines.push({
        id: newId("tin"),
        type: "line",
        layerId: TIN_LAYER.id,
        start: { x: a[0], y: a[1], z: zs[i] ?? 0 },
        end: { x: b[0], y: b[1], z: zs[(i + 1) % 3] ?? 0 },
      });
    }
  }

  return { lines, pointCount: samples.length, triangleCount };
}

/** Etiquetas de cota em curvas de nível. */
export function buildContourElevationLabels(
  entities: CadEntity[],
  majorOnly = false,
): CadPointEntity[] {
  const labels: CadPointEntity[] = [];

  for (const entity of entities) {
    if (entity.type !== "polyline" || entity.layerId !== CONTOUR_LAYER.id) continue;
    if (majorOnly && !entity.contourMajor) continue;
    const elev = parseContourElevation(entity);
    if (elev == null) continue;
    const pos = pickContourLabelVertex(entity.vertices);
    if (!pos) continue;
    labels.push({
      id: newId("clbl"),
      type: "point",
      layerId: CONTOUR_LABEL_LAYER.id,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      label: formatContourElevationLabel(elev),
    });
  }

  return labels;
}
