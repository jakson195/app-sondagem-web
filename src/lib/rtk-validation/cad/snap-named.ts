import { resolveLotRef, resolveQuadraRef } from "@/lib/cad-ai/resolve";
import { findIntersection, parseOsnapType, snapOnEntity, type OsnapType } from "./snap-engine";
import type { CadEntity, CadProject, CadVertex } from "./types";

function displayName(entity: CadEntity): string {
  if (entity.type === "point") return entity.label ?? "";
  if (entity.type === "polyline") return entity.name ?? "";
  return "";
}

function findEntityByName(project: CadProject, name: string): CadEntity | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    project.entities.find((e) => e.id === name) ??
    project.entities.find((e) => displayName(e).toLowerCase() === needle) ??
    project.entities.find((e) => {
      const folded = displayName(e).toLowerCase();
      return Boolean(folded) && (folded.includes(needle) || needle.includes(folded));
    })
  );
}

export function resolveSnapEntity(
  project: CadProject,
  spec: {
    entidade_id?: string;
    lote?: string;
    quadra?: string;
    nome?: string;
    selectedId?: string | null;
  },
): CadEntity | null {
  if (spec.entidade_id) {
    const direct = project.entities.find((e) => e.id === spec.entidade_id);
    if (direct) return direct;
    const lot = resolveLotRef(project, spec.entidade_id, spec.selectedId);
    if (lot) return lot.entity;
    const quadra = resolveQuadraRef(project, spec.entidade_id);
    if (quadra?.entity) return quadra.entity;
  }
  if (spec.lote) {
    const lot = resolveLotRef(project, spec.lote, spec.selectedId);
    if (lot) return lot.entity;
  }
  if (spec.quadra) {
    const quadra = resolveQuadraRef(project, spec.quadra);
    if (quadra?.entity) return quadra.entity;
  }
  if (spec.nome) {
    const named = findEntityByName(project, spec.nome);
    if (named) return named;
    const lot = resolveLotRef(project, spec.nome, spec.selectedId);
    if (lot) return lot.entity;
    const quadra = resolveQuadraRef(project, spec.nome);
    if (quadra?.entity) return quadra.entity;
  }
  if (spec.selectedId) {
    return project.entities.find((e) => e.id === spec.selectedId) ?? null;
  }
  return null;
}

export function resolveNamedSnap(
  project: CadProject,
  spec: {
    type?: string | null;
    lote?: string;
    quadra?: string;
    nome?: string;
    entidade_id?: string;
    entidade_ids?: string[];
    from?: CadVertex;
    selectedId?: string | null;
  },
): { point: CadVertex; type: OsnapType; entityId: string } | null {
  const type = parseOsnapType(spec.type) ?? "ENDPOINT";
  if ((type === "INTERSECTION" || type === "APPARENT_INTERSECTION") && spec.entidade_ids && spec.entidade_ids.length >= 2) {
    const a = resolveSnapEntity(project, { entidade_id: spec.entidade_ids[0], selectedId: spec.selectedId });
    const b = resolveSnapEntity(project, { entidade_id: spec.entidade_ids[1], selectedId: spec.selectedId });
    if (a && b) {
      const hits = findIntersection(a, b, type === "APPARENT_INTERSECTION");
      if (hits[0]) return { point: hits[0], type, entityId: a.id };
    }
  }

  const entity = resolveSnapEntity(project, spec);
  if (!entity) return null;
  if (type === "INTERSECTION" || type === "APPARENT_INTERSECTION") {
    const other =
      (spec.quadra && spec.lote
        ? resolveSnapEntity(project, { quadra: spec.quadra, selectedId: spec.selectedId })
        : null) ??
      (spec.nome && spec.lote
        ? resolveSnapEntity(project, { nome: spec.nome, selectedId: spec.selectedId })
        : null);
    if (other && other.id !== entity.id) {
      const hits = findIntersection(entity, other, type === "APPARENT_INTERSECTION");
      if (hits[0]) return { point: hits[0], type, entityId: entity.id };
    }
  }
  const point = snapOnEntity(entity, type, spec.from);
  if (!point) return null;
  return { point, type, entityId: entity.id };
}
