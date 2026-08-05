import { extractSurveyElevationPoints } from "./contour";
import type { CadEntity, CadPolylineEntity, CadVertex } from "./types";
import type { ElevationSample } from "./contour";

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function idwZ(x: number, y: number, samples: ElevationSample[], power = 2): number {
  let num = 0;
  let den = 0;
  for (const p of samples) {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < 1e-6) return p.z;
    const w = 1 / d ** power;
    num += w * p.z;
    den += w;
  }
  return den > 0 ? num / den : NaN;
}

export const PROFILE_LAYER = {
  id: "profile",
  name: "PERFIL_LONGITUDINAL",
  color: "#06b6d4",
  visible: true,
  locked: false,
} as const;

export const TRANSVERSAL_PROFILE_LAYER = {
  id: "profile_transversal",
  name: "PERFIL_TRANSVERSAL",
  color: "#8b5cf6",
  visible: true,
  locked: false,
} as const;

export function isTerrainProfileLayer(layerId: string): boolean {
  return layerId === PROFILE_LAYER.id || layerId === TRANSVERSAL_PROFILE_LAYER.id;
}

export function profileKindFromLayer(layerId: string): "longitudinal" | "transversal" {
  return layerId === TRANSVERSAL_PROFILE_LAYER.id ? "transversal" : "longitudinal";
}

function sampleElevationAt(
  x: number,
  y: number,
  t: number,
  start: CadVertex,
  end: CadVertex,
  samples: ElevationSample[],
): number {
  const z =
    samples.length >= 3 ? idwZ(x, y, samples) : start.z + (end.z - start.z) * t;
  return Number.isFinite(z) ? z : 0;
}

/** Amostra cotas ao longo de um segmento e retorna polilinha (distância × cota). */
export function generateProfileAlongSegment(
  entities: CadEntity[],
  start: CadVertex,
  end: CadVertex,
  layerId: string,
  name: string,
  sampleCount = 40,
): CadPolylineEntity {
  const samples = extractSurveyElevationPoints(entities);
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const vertices: CadVertex[] = [];

  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount;
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;
    const dist = length * t;
    vertices.push({ x: dist, y: 0, z: sampleElevationAt(x, y, t, start, end, samples) });
  }

  return {
    id: newId("prof"),
    type: "polyline",
    layerId,
    vertices,
    closed: false,
    name,
  };
}

/** Perfil longitudinal entre dois pontos. */
export function generateLongitudinalProfile(
  entities: CadEntity[],
  start: CadVertex,
  end: CadVertex,
  sampleCount = 40,
): CadPolylineEntity {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  return generateProfileAlongSegment(
    entities,
    start,
    end,
    PROFILE_LAYER.id,
    `Perfil ${length.toFixed(1)} m`,
    sampleCount,
  );
}

/** Perfil transversal entre dois pontos (limites esquerdo/direito da seção). */
export function generateTransversalProfile(
  entities: CadEntity[],
  start: CadVertex,
  end: CadVertex,
  sampleCount = 40,
): CadPolylineEntity {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  return generateProfileAlongSegment(
    entities,
    start,
    end,
    TRANSVERSAL_PROFILE_LAYER.id,
    `Transversal ${length.toFixed(1)} m`,
    sampleCount,
  );
}

/** Perfil transversal perpendicular à direção, centrado na estaca. */
export function generateTransversalProfileAtStation(
  entities: CadEntity[],
  station: CadVertex,
  directionToward: CadVertex,
  halfWidthM: number,
  sampleCount = 40,
): CadPolylineEntity {
  const dx = directionToward.x - station.x;
  const dy = directionToward.y - station.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const left: CadVertex = {
    x: station.x + px * halfWidthM,
    y: station.y + py * halfWidthM,
    z: station.z,
  };
  const right: CadVertex = {
    x: station.x - px * halfWidthM,
    y: station.y - py * halfWidthM,
    z: station.z,
  };
  const width = halfWidthM * 2;
  return generateProfileAlongSegment(
    entities,
    left,
    right,
    TRANSVERSAL_PROFILE_LAYER.id,
    `Transversal ${width.toFixed(1)} m`,
    sampleCount,
  );
}
