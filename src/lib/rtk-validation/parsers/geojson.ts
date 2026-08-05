import type { SurveyPoint } from "../types";

function uid() {
  return `pt_${Math.random().toString(36).slice(2, 10)}`;
}

type GeoFeature = {
  geometry?: { type: string; coordinates?: number[] | number[][] };
  properties?: Record<string, unknown>;
};

export function parseGeoJson(content: string) {
  const warnings: string[] = [];
  let data: { type: string; features?: GeoFeature[]; geometry?: GeoFeature["geometry"]; properties?: Record<string, unknown>; crs?: { properties?: { name?: string } } };
  try {
    data = JSON.parse(content);
  } catch {
    return { points: [], warnings: ["GeoJSON inválido."] };
  }

  const crs = data.crs?.properties?.name;
  const points: SurveyPoint[] = [];

  const addPoint = (coords: number[], props?: Record<string, unknown>) => {
    if (coords.length < 2) return;
    points.push({
      id: uid(),
      name: String(props?.name ?? props?.nome ?? props?.id ?? `P${points.length + 1}`),
      e: coords[0],
      n: coords[1],
      z: coords.length >= 3 ? coords[2] : 0,
      properties: props,
    });
  };

  const features = data.type === "FeatureCollection" ? data.features ?? [] : data.type === "Feature" ? [data as GeoFeature] : [];
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "Point" && Array.isArray(g.coordinates)) addPoint(g.coordinates as number[], f.properties);
    if (g.type === "MultiPoint" && Array.isArray(g.coordinates)) {
      for (const c of g.coordinates as number[][]) addPoint(c, f.properties);
    }
  }

  if (points.length === 0) warnings.push("Nenhum Point encontrado no GeoJSON.");
  return { points, warnings, crs };
}
