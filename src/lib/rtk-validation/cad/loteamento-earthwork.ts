import { extractTerrainSamplesIncludingContours } from "./contour-interpolate";
import type { ElevationSample } from "./contour";
import {
  buildTinTriangles,
  computeEarthworkVolume,
  interpolateTinZ,
  planeFromHorizontalZ,
  type DesignSurface,
  type EarthworkVolumeResult,
} from "./earthwork";
import { generateCutFillRaster } from "./hypsometric";
import { pointInPolygon } from "./polygon-utils";
import { LOTEAMENTO_LOTES_LAYER_ID, LOTEAMENTO_VIAS_LAYER_ID } from "./reurb";
import { interpolateGreideZ, type StreetProfileDraft } from "./street-profile";
import type { CadPolylineEntity, CadProject, CadRasterOverlay, CadVertex } from "./types";

export const LOTEAMENTO_CUTFILL_NEED_LOTEAMENTO =
  "Gere o loteamento (vias e lotes) antes de calcular corte e aterro.";

export const LOTEAMENTO_CUTFILL_NEED_TERRAIN =
  "Importe curvas de nível com Z ou pontos com cota para o terreno.";

export const LOTEAMENTO_CUTFILL_NEED_DESIGN =
  "Informe a cota de platô ou crie o greide das ruas (Perfis) para o projeto.";

export function projectPointOnPolyline(
  x: number,
  y: number,
  vertices: CadVertex[],
): { stationM: number; dist: number; x: number; y: number } {
  let bestDist = Infinity;
  let bestStation = 0;
  let bestX = vertices[0]?.x ?? x;
  let bestY = vertices[0]?.y ?? y;
  let acc = 0;
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i]!;
    const b = vertices[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const len2 = dx * dx + dy * dy;
    const t = len2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const dist = Math.hypot(x - px, y - py);
    if (dist < bestDist) {
      bestDist = dist;
      bestStation = acc + len * t;
      bestX = px;
      bestY = py;
    }
    acc += len;
  }
  return { stationM: bestStation, dist: bestDist, x: bestX, y: bestY };
}

export function greideZAtXY(x: number, y: number, profiles: StreetProfileDraft[]): number | null {
  if (profiles.length === 0) return null;
  let best = Infinity;
  let z: number | null = null;
  for (const profile of profiles) {
    if (profile.alignment.length < 2) continue;
    const proj = projectPointOnPolyline(x, y, profile.alignment);
    if (proj.dist < best) {
      best = proj.dist;
      z = interpolateGreideZ(profile.greide, proj.stationM);
    }
  }
  return z;
}

export function listLoteamentoPlatformPolygons(project: CadProject): {
  vias: CadPolylineEntity[];
  lots: CadPolylineEntity[];
} {
  const vias: CadPolylineEntity[] = [];
  const lots: CadPolylineEntity[] = [];
  for (const e of project.entities) {
    if (e.type !== "polyline" || !e.closed || e.vertices.length < 3) continue;
    if (e.layerId === LOTEAMENTO_VIAS_LAYER_ID) vias.push(e);
    else if (e.layerId === LOTEAMENTO_LOTES_LAYER_ID) lots.push(e);
  }
  return { vias, lots };
}

export function loteamentoDesignZAt(
  x: number,
  y: number,
  vias: CadPolylineEntity[],
  lots: CadPolylineEntity[],
  profiles: StreetProfileDraft[],
  plateauZ?: number | null,
): number {
  for (const via of vias) {
    if (pointInPolygon(x, y, via.vertices)) {
      return greideZAtXY(x, y, profiles) ?? plateauZ ?? NaN;
    }
  }
  for (const lot of lots) {
    if (pointInPolygon(x, y, lot.vertices)) {
      return plateauZ ?? greideZAtXY(x, y, profiles) ?? NaN;
    }
  }
  return plateauZ ?? greideZAtXY(x, y, profiles) ?? NaN;
}

function designSurfaceForPolygon(
  poly: CadPolylineEntity,
  kind: "via" | "lot",
  profiles: StreetProfileDraft[],
  plateauZ?: number | null,
): DesignSurface | null {
  const zs = poly.vertices.map((v) =>
    kind === "via"
      ? (greideZAtXY(v.x, v.y, profiles) ?? plateauZ)
      : (plateauZ ?? greideZAtXY(v.x, v.y, profiles)),
  );
  const finite = zs.filter((z): z is number => z != null && Number.isFinite(z));
  if (finite.length === 0) return null;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (max - min < 0.02) return planeFromHorizontalZ(finite[0]!);

  const samples: ElevationSample[] = poly.vertices.map((v, i) => ({
    x: v.x,
    y: v.y,
    z: finite[Math.min(i, finite.length - 1)]!,
  }));
  if (samples.length < 3) return planeFromHorizontalZ(finite[0]!);
  try {
    return { kind: "tin", triangles: buildTinTriangles(samples), samples };
  } catch {
    return planeFromHorizontalZ(finite.reduce((a, b) => a + b, 0) / finite.length);
  }
}

export function computeLoteamentoCutFill(input: {
  project: CadProject;
  streetProfiles?: StreetProfileDraft[];
  plateauZ?: number | null;
  selectedId?: string | null;
  terrainSamples?: ElevationSample[];
}): EarthworkVolumeResult {
  const { vias, lots } = listLoteamentoPlatformPolygons(input.project);
  if (vias.length === 0 && lots.length === 0) {
    throw new Error(LOTEAMENTO_CUTFILL_NEED_LOTEAMENTO);
  }

  const terrain =
    input.terrainSamples ??
    extractTerrainSamplesIncludingContours(input.project, input.selectedId);
  if (terrain.length < 3) {
    throw new Error(LOTEAMENTO_CUTFILL_NEED_TERRAIN);
  }

  const profiles = input.streetProfiles ?? [];
  const plateauZ = input.plateauZ;
  const hasDesign =
    (plateauZ != null && Number.isFinite(plateauZ)) || profiles.some((p) => p.greide.length > 0);
  if (!hasDesign) {
    throw new Error(LOTEAMENTO_CUTFILL_NEED_DESIGN);
  }

  const acc: EarthworkVolumeResult = {
    cutM3: 0,
    fillM3: 0,
    netM3: 0,
    areaM2: 0,
    triangleCount: 0,
    usedTriangleCount: 0,
    method:
      "Prismóide TIN (Z terreno − Z projeto). Vias na cota do greide; lotes na cota de platô ou greide mais próximo. Terreno acima do platô/greide = corte.",
    designLabel: plateauZ != null ? `Platô Z=${plateauZ.toFixed(2)} m + greide das vias` : "Greide das vias / lotes",
  };

  const run = (poly: CadPolylineEntity, kind: "via" | "lot") => {
    const design = designSurfaceForPolygon(poly, kind, profiles, plateauZ);
    if (!design) return;
    const part = computeEarthworkVolume({
      terrainSamples: terrain,
      design,
      clipPolygon: poly.vertices,
      designLabel: acc.designLabel,
    });
    acc.cutM3 += part.cutM3;
    acc.fillM3 += part.fillM3;
    acc.areaM2 += part.areaM2;
    acc.triangleCount += part.triangleCount;
    acc.usedTriangleCount += part.usedTriangleCount;
  };

  for (const via of vias) run(via, "via");
  for (const lot of lots) run(lot, "lot");
  acc.netM3 = acc.cutM3 - acc.fillM3;
  return acc;
}

export function buildLoteamentoCutFillSamples(input: {
  project: CadProject;
  streetProfiles?: StreetProfileDraft[];
  plateauZ?: number | null;
  selectedId?: string | null;
  terrainSamples?: ElevationSample[];
  gridStepM?: number;
}): ElevationSample[] {
  const { vias, lots } = listLoteamentoPlatformPolygons(input.project);
  const terrain =
    input.terrainSamples ??
    extractTerrainSamplesIncludingContours(input.project, input.selectedId);
  if (terrain.length < 3 || (vias.length === 0 && lots.length === 0)) return [];

  const triangles = buildTinTriangles(terrain);
  const profiles = input.streetProfiles ?? [];
  const rings = [...vias, ...lots];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const v of ring.vertices) {
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
  }
  const step = Math.max(1, input.gridStepM ?? Math.max((maxX - minX) / 40, (maxY - minY) / 40, 2));
  const samples: ElevationSample[] = [];
  for (let x = minX; x <= maxX + 1e-9; x += step) {
    for (let y = minY; y <= maxY + 1e-9; y += step) {
      const zD = loteamentoDesignZAt(x, y, vias, lots, profiles, input.plateauZ);
      if (!Number.isFinite(zD)) continue;
      const zT = interpolateTinZ(triangles, x, y, terrain);
      if (!Number.isFinite(zT)) continue;
      samples.push({ x, y, z: zT - zD });
    }
  }
  return samples;
}

export function tryGenerateLoteamentoCutFillRaster(input: {
  project: CadProject;
  streetProfiles?: StreetProfileDraft[];
  plateauZ?: number | null;
  selectedId?: string | null;
  terrainSamples?: ElevationSample[];
}): CadRasterOverlay | null {
  if (typeof document === "undefined") return null;
  const samples = buildLoteamentoCutFillSamples(input);
  if (samples.length < 3) return null;
  try {
    return generateCutFillRaster(samples);
  } catch {
    return null;
  }
}
