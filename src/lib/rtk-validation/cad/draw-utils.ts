import type { CadEntity, CadVertex } from "./types";
import type { CadViewport } from "./viewport";
import { findPointAtScreen, screenToWorld, snapToPoint } from "./viewport";
import {
  DEFAULT_OSNAP_SETTINGS,
  effectiveOsnapSettings,
  getSnapPoint,
  type OsnapSettings,
  type OsnapType,
  type SnapResult,
  type SpatialIndex,
} from "./snap-engine";

/** Azimute topográfico (0° = Norte, 90° = Leste). */
export function vertexFromPolar(from: CadVertex, distanceM: number, azimuthDeg: number): CadVertex {
  const rad = (azimuthDeg * Math.PI) / 180;
  return {
    x: from.x + distanceM * Math.sin(rad),
    y: from.y + distanceM * Math.cos(rad),
    z: from.z,
  };
}

/** Restringe o destino aos eixos E/N (ortogonal). */
export function constrainOrthogonal(from: CadVertex, to: CadVertex): CadVertex {
  const dE = Math.abs(to.x - from.x);
  const dN = Math.abs(to.y - from.y);
  if (dE >= dN) {
    return { x: to.x, y: from.y, z: to.z ?? from.z };
  }
  return { x: from.x, y: to.y, z: to.z ?? from.z };
}

export function parseDrawNumber(raw: string): number | null {
  const n = Number(raw.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export type ResolveDrawOptions = {
  snapToPoints: boolean;
  orthogonalMode: boolean;
  reference?: CadVertex | null;
  osnap?: OsnapSettings;
  overrideType?: OsnapType | null;
  index?: SpatialIndex;
  excludeIds?: string[];
};

export function resolveDrawSnap(
  sx: number,
  sy: number,
  viewport: CadViewport,
  entities: CadEntity[],
  options: ResolveDrawOptions,
): SnapResult {
  const world = screenToWorld(sx, sy, viewport);
  const raw: CadVertex = { x: world.x, y: world.y, z: 0 };
  const settings = effectiveOsnapSettings(
    options.osnap ?? DEFAULT_OSNAP_SETTINGS,
    options.snapToPoints,
    options.overrideType,
  );
  if (settings.enabled) {
    const snap = getSnapPoint({
      screen: { sx, sy },
      world: raw,
      viewport,
      entities,
      index: options.index,
      settings,
      reference: options.reference,
      overrideType: options.overrideType,
      excludeIds: options.excludeIds,
    });
    if (snap.snapped) return snap;
    if (options.orthogonalMode && options.reference) {
      return { snapped: false, point: constrainOrthogonal(options.reference, raw) };
    }
    return { snapped: false, point: raw };
  }

  let point = raw;
  if (options.snapToPoints) {
    const screenHit = findPointAtScreen(sx, sy, entities, viewport, 16);
    if (screenHit) point = { ...screenHit.vertex };
    else {
      const snapped = snapToPoint(world.x, world.y, entities, 3);
      if (snapped) point = snapped;
    }
  }
  if (options.orthogonalMode && options.reference) {
    point = constrainOrthogonal(options.reference, point);
  }
  return { snapped: false, point };
}

export function resolveDrawVertex(
  sx: number,
  sy: number,
  viewport: CadViewport,
  entities: CadEntity[],
  options: ResolveDrawOptions,
): CadVertex {
  return resolveDrawSnap(sx, sy, viewport, entities, options).point;
}

export function segmentLengthM(a: CadVertex, b: CadVertex): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function segmentAzimuthDeg(a: CadVertex, b: CadVertex): number {
  const dE = b.x - a.x;
  const dN = b.y - a.y;
  let az = (Math.atan2(dE, dN) * 180) / Math.PI;
  if (az < 0) az += 360;
  return az;
}

/** Azimute restrito ao eixo E ou N mais próximo (0°, 90°, 180°, 270°). */
export function snapAzimuthOrthogonal(azimuthDeg: number): number {
  return ((Math.round(azimuthDeg / 90) * 90) % 360 + 360) % 360;
}

/** Vértice a partir de distância e azimute, respeitando modo ortogonal. */
export function vertexFromDistance(
  from: CadVertex,
  distanceM: number,
  azimuthDeg: number,
  orthogonalMode: boolean,
): CadVertex {
  const az = orthogonalMode ? snapAzimuthOrthogonal(azimuthDeg) : azimuthDeg;
  return vertexFromPolar(from, distanceM, az);
}
