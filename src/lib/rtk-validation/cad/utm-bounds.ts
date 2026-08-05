import type { CadViewport } from "./viewport";

/** Coordenadas parecem UTM em metros (não graus locais). */
export function isLikelyUtmViewport(
  bounds: Pick<CadViewport, "minX" | "maxX" | "minY" | "maxY">,
): boolean {
  const spanX = Math.abs(bounds.maxX - bounds.minX);
  const spanY = Math.abs(bounds.maxY - bounds.minY);
  const maxCoord = Math.max(
    Math.abs(bounds.minX),
    Math.abs(bounds.maxX),
    Math.abs(bounds.minY),
    Math.abs(bounds.maxY),
  );
  return maxCoord > 1_000 && (spanX > 1 || spanY > 1);
}

/** Vértice em graus WGS84 dentro do Brasil (lon/lat ou lat/lon). */
export function detectWgs84Axes(x: number, y: number): { lonAxis: "x" | "y"; latAxis: "x" | "y" } | null {
  if (x >= -75 && x <= -30 && y >= -35 && y <= 6) return { lonAxis: "x", latAxis: "y" };
  if (y >= -75 && y <= -30 && x >= -35 && x <= 6) return { lonAxis: "y", latAxis: "x" };
  return null;
}

export function isLikelyWgs84Vertex(x: number, y: number): boolean {
  return detectWgs84Axes(x, y) != null;
}

export function isGeoreferencedVertex(x: number, y: number): boolean {
  return isLikelyWgs84Vertex(x, y) || Math.max(Math.abs(x), Math.abs(y)) > 1_000;
}
