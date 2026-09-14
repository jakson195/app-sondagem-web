import { CONTOUR_LAYER, extractSurveyElevationPoints } from "./contour";
import { TIN_LAYER } from "./tin";
import type { CadEntity, CadLayer, CadPolylineEntity, CadProject, CadVertex } from "./types";
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

export function listTerrainProfiles(entities: CadEntity[]): CadPolylineEntity[] {
  return entities.filter(
    (e): e is CadPolylineEntity => e.type === "polyline" && isTerrainProfileLayer(e.layerId),
  );
}

/** Perfil selecionado ou o mais recente gerado no CAD. */
export function resolveTerrainProfile(
  entities: CadEntity[],
  selectedId: string | null,
): CadPolylineEntity | null {
  if (selectedId) {
    const entity = entities.find((e) => e.id === selectedId);
    if (entity?.type === "polyline" && isTerrainProfileLayer(entity.layerId)) {
      return entity;
    }
  }
  const profiles = listTerrainProfiles(entities);
  return profiles.length > 0 ? profiles[profiles.length - 1] : null;
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

export type AlignmentStation = {
  stationM: number;
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirY: number;
};

export function polylineLengthM(vertices: CadVertex[]): number {
  let length = 0;
  for (let i = 1; i < vertices.length; i++) {
    length += Math.hypot(vertices[i].x - vertices[i - 1].x, vertices[i].y - vertices[i - 1].y);
  }
  return length;
}

/** Estacas ao longo de um eixo (E/N planas em metros), incluindo início e fim. */
export function sampleAlignmentStations(vertices: CadVertex[], intervalM: number): AlignmentStation[] {
  if (vertices.length < 2) return [];
  const interval = Math.max(1e-6, intervalM);
  const stations: AlignmentStation[] = [];

  const pushStation = (stationM: number, x: number, y: number, z: number, dirX: number, dirY: number) => {
    const len = Math.hypot(dirX, dirY) || 1;
    stations.push({ stationM, x, y, z, dirX: dirX / len, dirY: dirY / len });
  };

  const first = vertices[0];
  const second = vertices[1];
  pushStation(0, first.x, first.y, first.z, second.x - first.x, second.y - first.y);

  let accumulated = 0;
  let nextAt = interval;
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i];
    const b = vertices[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen < 1e-9) continue;
    const dirX = b.x - a.x;
    const dirY = b.y - a.y;
    while (nextAt <= accumulated + segLen + 1e-9) {
      const t = (nextAt - accumulated) / segLen;
      if (t > 1e-9 && t < 1 - 1e-9) {
        pushStation(
          nextAt,
          a.x + (b.x - a.x) * t,
          a.y + (b.y - a.y) * t,
          a.z + (b.z - a.z) * t,
          dirX,
          dirY,
        );
      }
      nextAt += interval;
    }
    accumulated += segLen;
    const isLast = i === vertices.length - 2;
    if (isLast) {
      pushStation(accumulated, b.x, b.y, b.z, dirX, dirY);
    }
  }

  return stations;
}

/** Perfil longitudinal ao longo de uma polilinha de eixo (distância × cota). */
export function generateLongitudinalProfileAlongPolyline(
  entities: CadEntity[],
  alignment: CadVertex[],
  sampleIntervalM = 5,
): CadPolylineEntity {
  const samples = extractSurveyElevationPoints(entities);
  const stations = sampleAlignmentStations(alignment, sampleIntervalM);
  if (stations.length < 2) {
    throw new Error("Selecione uma polilinha com pelo menos 2 vértices para o perfil longitudinal.");
  }
  const length = polylineLengthM(alignment);
  const vertices: CadVertex[] = stations.map((st) => {
    const t = length > 0 ? st.stationM / length : 0;
    const start = alignment[0];
    const end = alignment[alignment.length - 1];
    return {
      x: st.stationM,
      y: 0,
      z: sampleElevationAt(st.x, st.y, t, start, end, samples),
    };
  });
  return {
    id: newId("prof"),
    type: "polyline",
    layerId: PROFILE_LAYER.id,
    vertices,
    closed: false,
    name: `Perfil ${length.toFixed(1)} m`,
  };
}

/** Seções-tipo transversais em intervalo regular ao longo do eixo. */
export function generateTypicalCrossSections(
  entities: CadEntity[],
  alignment: CadVertex[],
  intervalM: number,
  halfWidthM: number,
  sampleCount = 40,
): CadPolylineEntity[] {
  const stations = sampleAlignmentStations(alignment, intervalM);
  return stations.map((st) => {
    const profile = generateTransversalProfileAtStation(
      entities,
      { x: st.x, y: st.y, z: st.z },
      { x: st.x + st.dirX, y: st.y + st.dirY, z: st.z },
      halfWidthM,
      sampleCount,
    );
    return {
      ...profile,
      name: `ST ${st.stationM.toFixed(1)} m · ${ (halfWidthM * 2).toFixed(1)} m`,
    };
  });
}

export type AlignmentSource = {
  id: string;
  name: string;
  vertices: CadVertex[];
  kind: "polyline" | "line";
};

const ALIGNMENT_EXCLUDE_LAYERS = new Set<string>([
  PROFILE_LAYER.id,
  TRANSVERSAL_PROFILE_LAYER.id,
  CONTOUR_LAYER.id,
  TIN_LAYER.id,
  "loteamento_perfil",
  "loteamento_greide",
  "loteamento_secao",
  "loteamento_encontros",
]);

export function isSelectableAlignmentEntity(entity: CadEntity): boolean {
  if (ALIGNMENT_EXCLUDE_LAYERS.has(entity.layerId)) return false;
  if (entity.type === "polyline") return entity.vertices.length >= 2;
  if (entity.type === "line") return true;
  return false;
}

export function alignmentVerticesFromEntity(entity: CadEntity): CadVertex[] | null {
  if (entity.type === "polyline" && entity.vertices.length >= 2) return entity.vertices;
  if (entity.type === "line") return [entity.start, entity.end];
  return null;
}

export function alignmentLabel(entity: CadEntity): string {
  if (entity.type === "polyline") {
    return entity.name?.trim() || `Polilinha ${entity.id.slice(-6)}`;
  }
  if (entity.type === "line") return `Linha ${entity.id.slice(-6)}`;
  return entity.id;
}

export function findSelectedAlignment(
  entities: CadEntity[],
  selectedId: string | null,
): AlignmentSource | null {
  if (!selectedId) return null;
  const entity = entities.find((e) => e.id === selectedId);
  if (!entity || !isSelectableAlignmentEntity(entity)) return null;
  const vertices = alignmentVerticesFromEntity(entity);
  if (!vertices || vertices.length < 2) return null;
  return {
    id: entity.id,
    name: alignmentLabel(entity),
    vertices,
    kind: entity.type === "line" ? "line" : "polyline",
  };
}

export function listSelectableAlignments(entities: CadEntity[]): AlignmentSource[] {
  const out: AlignmentSource[] = [];
  for (const entity of entities) {
    if (!isSelectableAlignmentEntity(entity)) continue;
    const vertices = alignmentVerticesFromEntity(entity);
    if (!vertices || vertices.length < 2) continue;
    out.push({
      id: entity.id,
      name: alignmentLabel(entity),
      vertices,
      kind: entity.type === "line" ? "line" : "polyline",
    });
  }
  return out;
}

export function listLongitudinalTerrainProfiles(entities: CadEntity[]): CadPolylineEntity[] {
  return entities.filter(
    (e): e is CadPolylineEntity => e.type === "polyline" && e.layerId === PROFILE_LAYER.id,
  );
}

export function listTerrainCrossSections(entities: CadEntity[]): CadPolylineEntity[] {
  return entities.filter(
    (e): e is CadPolylineEntity => e.type === "polyline" && e.layerId === TRANSVERSAL_PROFILE_LAYER.id,
  );
}

export type TerrainElevationCoverage = {
  sampleCount: number;
  zIncomplete: boolean;
};

export function terrainElevationCoverage(entities: CadEntity[]): TerrainElevationCoverage {
  const samples = extractSurveyElevationPoints(entities);
  return {
    sampleCount: samples.length,
    zIncomplete: samples.length < 3,
  };
}

function ensureProjectLayer(project: CadProject, layer: CadLayer): CadLayer[] {
  return project.layers.some((l) => l.id === layer.id) ? project.layers : [...project.layers, { ...layer }];
}

export type TerrainProfileApplyResult = {
  project: CadProject;
  profile: CadPolylineEntity;
  selectedId: string;
  lengthM: number;
  stationCount: number;
  sampleCount: number;
  zIncomplete: boolean;
};

function resolveStationIntervalM(lengthM: number, requestedM: number, maxStations = 200): number {
  const safeLength = Math.max(0, lengthM);
  const minInterval = safeLength / Math.max(1, maxStations - 1);
  return Math.max(requestedM, minInterval, 1e-3);
}

export function applyTerrainProfileFromAlignment(
  project: CadProject,
  alignmentId: string,
  sampleIntervalM = 5,
): TerrainProfileApplyResult {
  const alignment = findSelectedAlignment(project.entities, alignmentId);
  if (!alignment) {
    throw new Error("Selecione uma linha ou polilinha (traçado) no desenho.");
  }
  const coverage = terrainElevationCoverage(project.entities);
  const lengthM = polylineLengthM(alignment.vertices);
  const profile = generateLongitudinalProfileAlongPolyline(
    project.entities,
    alignment.vertices,
    resolveStationIntervalM(lengthM, sampleIntervalM),
  );
  profile.name = `Perfil ${alignment.name} · ${polylineLengthM(alignment.vertices).toFixed(1)} m`;
  const kept = project.entities.filter((e) => e.layerId !== PROFILE_LAYER.id);
  return {
    project: {
      ...project,
      layers: ensureProjectLayer(project, { ...PROFILE_LAYER }),
      entities: [...kept, profile],
    },
    profile,
    selectedId: profile.id,
    lengthM,
    stationCount: profile.vertices.length,
    sampleCount: coverage.sampleCount,
    zIncomplete: coverage.zIncomplete,
  };
}

export type TerrainSectionsApplyResult = {
  project: CadProject;
  sections: CadPolylineEntity[];
  selectedId: string | null;
  intervalM: number;
  halfWidthM: number;
  sampleCount: number;
  zIncomplete: boolean;
};

export function applyTerrainCrossSectionsFromAlignment(
  project: CadProject,
  alignmentId: string,
  intervalM: number,
  halfWidthM: number,
): TerrainSectionsApplyResult {
  const alignment = findSelectedAlignment(project.entities, alignmentId);
  if (!alignment) {
    throw new Error("Selecione uma linha ou polilinha (traçado) no desenho.");
  }
  const half = Math.max(1e-3, halfWidthM);
  const coverage = terrainElevationCoverage(project.entities);
  const interval = resolveStationIntervalM(polylineLengthM(alignment.vertices), Math.max(1e-3, intervalM));
  const sections = generateTypicalCrossSections(project.entities, alignment.vertices, interval, half);
  const kept = project.entities.filter((e) => e.layerId !== TRANSVERSAL_PROFILE_LAYER.id);
  return {
    project: {
      ...project,
      layers: ensureProjectLayer(project, { ...TRANSVERSAL_PROFILE_LAYER }),
      entities: [...kept, ...sections],
    },
    sections,
    selectedId: sections[0]?.id ?? null,
    intervalM: interval,
    halfWidthM: half,
    sampleCount: coverage.sampleCount,
    zIncomplete: coverage.zIncomplete,
  };
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
