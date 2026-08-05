import type { CadEntity, CadPointEntity, CadVertex } from "./types";
import { findPointByLabel, normalizePointLabel } from "./ai-point-utils";

export { normalizePointLabel, findPointByLabel, resolvePointLabels } from "./ai-point-utils";

/** Busca ponto por rótulo, número ou referência parcial. */
export function findPointByRef(
  entities: CadEntity[],
  ref: string,
): { entity: CadPointEntity; vertex: CadVertex } | null {
  const fromLabel = findPointByLabel(entities, ref);
  if (fromLabel) return fromLabel;

  const target = normalizePointLabel(ref);
  if (!target) return null;

  const points = entities.filter((e): e is CadPointEntity => e.type === "point");

  for (const entity of points) {
    const label = entity.label?.trim() ?? "";
    const source = entity.sourceId?.trim() ?? "";
    if (label === ref.trim() || source === ref.trim()) {
      return { entity, vertex: { x: entity.x, y: entity.y, z: entity.z } };
    }
    if (label.includes(ref.trim()) || ref.trim().includes(label)) {
      return { entity, vertex: { x: entity.x, y: entity.y, z: entity.z } };
    }
  }

  return null;
}

export function resolvePointRefs(
  entities: CadEntity[],
  refs: string[],
): { vertices: CadVertex[]; entities: CadPointEntity[]; missing: string[] } {
  const vertices: CadVertex[] = [];
  const found: CadPointEntity[] = [];
  const missing: string[] = [];

  for (const ref of refs) {
    const hit = findPointByRef(entities, ref);
    if (hit) {
      vertices.push(hit.vertex);
      found.push(hit.entity);
    } else {
      missing.push(ref);
    }
  }

  return { vertices, entities: found, missing };
}

export function polygonCentroid(vertices: CadVertex[]): CadVertex {
  if (vertices.length === 0) return { x: 0, y: 0, z: 0 };
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const v of vertices) {
    sx += v.x;
    sy += v.y;
    sz += v.z;
  }
  const n = vertices.length;
  return { x: sx / n, y: sy / n, z: sz / n };
}

/** Azimute → rumo NE/NW/SE/SW. */
export function azimuthToRumo(azimuthDeg: number): string {
  const a = ((azimuthDeg % 360) + 360) % 360;
  if (a >= 0 && a < 90) return "NE";
  if (a >= 90 && a < 180) return "SE";
  if (a >= 180 && a < 270) return "SW";
  return "NW";
}

export function translateVertex(v: CadVertex, distM: number, azimuthDeg: number): CadVertex {
  const rad = (azimuthDeg * Math.PI) / 180;
  return {
    x: v.x + distM * Math.sin(rad),
    y: v.y + distM * Math.cos(rad),
    z: v.z,
  };
}

export function rotateVertex(v: CadVertex, center: CadVertex, angleDeg: number): CadVertex {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = v.x - center.x;
  const dy = v.y - center.y;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
    z: v.z,
  };
}

export function entitiesToSurveyCsv(entities: CadEntity[]): string {
  const header = "ID,DESC,E,N,Z";
  const rows = entities
    .filter((e): e is CadPointEntity => e.type === "point")
    .map((p) =>
      [p.label ?? p.id, p.label ?? "", p.x.toFixed(4), p.y.toFixed(4), p.z.toFixed(4)].join(","),
    );
  return [header, ...rows].join("\n");
}
