import tin from "@turf/tin";
import type { FeatureCollection, Point } from "geojson";
import { buildIdwElevationGrid } from "./elevation-grid";
import { extractSurveyElevationPoints } from "./contour";
import { entitiesForMapViewport } from "./map-bbox";
import { hypsometricColor } from "./hypsometric";
import type { CadEntity, CadLayer } from "./types";

export type Scene3DOrigin = { x: number; y: number; z: number };

export type Scene3DLineSegment = {
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  color: string;
  opacity?: number;
};

export type Scene3DPoint = {
  x: number;
  y: number;
  z: number;
  color: string;
  size?: number;
};

export type Scene3DTerrainMesh = {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
};

export type Scene3DData = {
  origin: Scene3DOrigin;
  zExaggeration: number;
  terrain: Scene3DTerrainMesh | null;
  lines: Scene3DLineSegment[];
  points: Scene3DPoint[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
};

const PROFILE_LAYERS = new Set(["profile", "profile_transversal"]);

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return [0.7, 0.7, 0.7];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function layerColor(layers: CadLayer[], layerId: string, fallback = "#94a3b8"): string {
  return layers.find((l) => l.id === layerId)?.color ?? fallback;
}

function layerVisible(layers: CadLayer[], layerId: string): boolean {
  const layer = layers.find((l) => l.id === layerId);
  return layer ? layer.visible : true;
}

function pushBounds(
  bounds: Scene3DData["bounds"],
  x: number,
  y: number,
  z: number,
) {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxY = Math.max(bounds.maxY, y);
  bounds.minZ = Math.min(bounds.minZ, z);
  bounds.maxZ = Math.max(bounds.maxZ, z);
}

function computeOriginAndZExag(samples: { x: number; y: number; z: number }[]): {
  origin: Scene3DOrigin;
  zExaggeration: number;
} {
  if (samples.length === 0) {
    return { origin: { x: 0, y: 0, z: 0 }, zExaggeration: 1 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const p of samples) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }

  const origin = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    z: (minZ + maxZ) / 2,
  };

  const hSpan = Math.max(maxX - minX, maxY - minY, 1);
  const zSpan = Math.max(maxZ - minZ, 0.01);
  const zExaggeration = Math.min(8, Math.max(1, (hSpan / zSpan) * 0.15));

  return { origin, zExaggeration };
}

function toScene(
  x: number,
  y: number,
  z: number,
  origin: Scene3DOrigin,
  zExaggeration: number,
) {
  return {
    x: x - origin.x,
    y: (z - origin.z) * zExaggeration,
    z: y - origin.y,
  };
}

function buildTerrainFromGrid(
  origin: Scene3DOrigin,
  zExaggeration: number,
  samples: { x: number; y: number; z: number }[],
): Scene3DTerrainMesh | null {
  if (samples.length < 3) return null;

  try {
    const grid = buildIdwElevationGrid(samples, { gridCols: 64, gridRows: 64 });
    const { cols, rows, values, zMin, zMax } = grid;
    const vertexCount = cols * rows;
    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const indices: number[] = [];

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const idx = i + j * cols;
        const z = values[idx];
        const x = grid.minX + (i / (cols - 1)) * (grid.maxX - grid.minX);
        const y = grid.minY + (j / (rows - 1)) * (grid.maxY - grid.minY);
        const p = toScene(x, y, Number.isFinite(z) ? z : origin.z, origin, zExaggeration);
        positions[idx * 3] = p.x;
        positions[idx * 3 + 1] = p.y;
        positions[idx * 3 + 2] = p.z;
        const [r8, g8, b8] = hypsometricColor(z, zMin, zMax);
        colors[idx * 3] = r8 / 255;
        colors[idx * 3 + 1] = g8 / 255;
        colors[idx * 3 + 2] = b8 / 255;
      }
    }

    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = i + j * cols;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    return { positions, colors, indices: Uint32Array.from(indices) };
  } catch {
    return null;
  }
}

function buildTerrainFromTin(
  origin: Scene3DOrigin,
  zExaggeration: number,
  samples: { x: number; y: number; z: number }[],
): Scene3DTerrainMesh | null {
  if (samples.length < 3) return null;

  const fc: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: samples.map((p, i) => ({
      type: "Feature",
      properties: { z: p.z, name: `P${i + 1}` },
      geometry: { type: "Point", coordinates: [p.x, p.y] },
    })),
  };

  const tinFc = tin(fc, "z");
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const vertexMap = new Map<string, number>();

  let zMin = Infinity;
  let zMax = -Infinity;
  for (const p of samples) {
    zMin = Math.min(zMin, p.z);
    zMax = Math.max(zMax, p.z);
  }

  function addVertex(x: number, y: number, z: number): number {
    const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
    const existing = vertexMap.get(key);
    if (existing != null) return existing;
    const p = toScene(x, y, z, origin, zExaggeration);
    const idx = positions.length / 3;
    positions.push(p.x, p.y, p.z);
    const [r8, g8, b8] = hypsometricColor(z, zMin, zMax);
    colors.push(r8 / 255, g8 / 255, b8 / 255);
    vertexMap.set(key, idx);
    return idx;
  }

  for (const feature of tinFc.features) {
    const ring = feature.geometry.coordinates[0] as number[][];
    if (ring.length < 4) continue;
    const zs = [feature.properties?.a, feature.properties?.b, feature.properties?.c] as number[];
    const ia = addVertex(ring[0][0], ring[0][1], zs[0] ?? 0);
    const ib = addVertex(ring[1][0], ring[1][1], zs[1] ?? 0);
    const ic = addVertex(ring[2][0], ring[2][1], zs[2] ?? 0);
    indices.push(ia, ib, ic);
  }

  if (indices.length === 0) return null;
  return {
    positions: Float32Array.from(positions),
    colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices),
  };
}

function collectEntitySamples(entities: CadEntity[]): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (const entity of entities) {
    if (PROFILE_LAYERS.has(entity.layerId)) continue;
    if (entity.type === "point") out.push({ x: entity.x, y: entity.y, z: entity.z });
    if (entity.type === "line") {
      out.push(entity.start, entity.end);
    }
    if (entity.type === "polyline") {
      for (const v of entity.vertices) out.push(v);
    }
  }
  return out;
}

export function buildScene3DData(
  entities: CadEntity[],
  layers: CadLayer[],
  options?: { preferTin?: boolean },
): Scene3DData {
  const mapEntities = entitiesForMapViewport(entities).filter(
    (e) => !PROFILE_LAYERS.has(e.layerId),
  );
  const elevationSamples = extractSurveyElevationPoints(entities);
  const allSamples =
    elevationSamples.length >= 3 ? elevationSamples : collectEntitySamples(mapEntities);

  const { origin, zExaggeration } = computeOriginAndZExag(allSamples);
  const bounds: Scene3DData["bounds"] = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  };

  const lines: Scene3DLineSegment[] = [];
  const points: Scene3DPoint[] = [];

  for (const entity of mapEntities) {
    if (!layerVisible(layers, entity.layerId)) continue;
    const color = layerColor(layers, entity.layerId);

    if (entity.type === "point") {
      const p = toScene(entity.x, entity.y, entity.z, origin, zExaggeration);
      pushBounds(bounds, p.x, p.y, p.z);
      points.push({
        x: p.x,
        y: p.y,
        z: p.z,
        color,
        size: entity.layerId === "rtk_points" ? 4 : 3,
      });
      continue;
    }

    if (entity.type === "line") {
      const a = toScene(entity.start.x, entity.start.y, entity.start.z, origin, zExaggeration);
      const b = toScene(entity.end.x, entity.end.y, entity.end.z, origin, zExaggeration);
      pushBounds(bounds, a.x, a.y, a.z);
      pushBounds(bounds, b.x, b.y, b.z);
      lines.push({
        x1: a.x,
        y1: a.y,
        z1: a.z,
        x2: b.x,
        y2: b.y,
        z2: b.z,
        color,
        opacity: entity.layerId === "tin" ? 0.85 : 1,
      });
      continue;
    }

    if (entity.type === "polyline") {
      const verts = entity.vertices;
      if (verts.length < 2) continue;
      const closed = entity.closed && verts.length >= 3;
      const count = closed ? verts.length : verts.length - 1;
      for (let i = 0; i < count; i++) {
        const v0 = verts[i];
        const v1 = verts[(i + 1) % verts.length];
        const a = toScene(v0.x, v0.y, v0.z, origin, zExaggeration);
        const b = toScene(v1.x, v1.y, v1.z, origin, zExaggeration);
        pushBounds(bounds, a.x, a.y, a.z);
        pushBounds(bounds, b.x, b.y, b.z);
        lines.push({
          x1: a.x,
          y1: a.y,
          z1: a.z,
          x2: b.x,
          y2: b.y,
          z2: b.z,
          color,
          opacity: entity.layerId === "contour" ? 0.9 : 1,
        });
      }
    }
  }

  const terrainSource = elevationSamples.length >= 3 ? elevationSamples : allSamples;
  const terrain =
    options?.preferTin && terrainSource.length >= 3
      ? (buildTerrainFromTin(origin, zExaggeration, terrainSource) ??
        buildTerrainFromGrid(origin, zExaggeration, terrainSource))
      : buildTerrainFromGrid(origin, zExaggeration, terrainSource);

  if (terrain) {
    for (let i = 0; i < terrain.positions.length; i += 3) {
      pushBounds(
        bounds,
        terrain.positions[i],
        terrain.positions[i + 1],
        terrain.positions[i + 2],
      );
    }
  }

  if (!Number.isFinite(bounds.minX)) {
    bounds.minX = bounds.maxX = bounds.minY = bounds.maxY = bounds.minZ = bounds.maxZ = 0;
  }

  return { origin, zExaggeration, terrain, lines, points, bounds };
}

export { hexToRgb };
