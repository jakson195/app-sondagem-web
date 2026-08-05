import type { CadEntity, CadPointEntity, CadVertex } from "./types";

const POINT_LIST_FILLER =
  /^(do|de|ao|a|até|ate|os|as|o|pontos?|vértices?|vertices?|com|nos?|nas?)$/i;

export function normalizePointLabel(label: string): string {
  return label.trim().toUpperCase().replace(/\s+/g, "");
}

export function parseLabeledPointToken(
  token: string,
): { prefix: string; num: number } | null {
  const normalized = normalizePointLabel(token).replace(/^PONTO/, "");
  const match = normalized.match(/^([A-Z-]*?)(\d+)$/);
  if (!match) return null;
  return { prefix: match[1] || "P", num: Number(match[2]) };
}

/** Expande intervalos como V1–V4 → V1, V2, V3, V4. */
export function expandPointRange(from: string, to: string): string[] {
  const startRef = parseLabeledPointToken(from);
  const endRef = parseLabeledPointToken(to);
  if (!startRef || !endRef) return [from.trim(), to.trim()].filter(Boolean);
  if (startRef.prefix !== endRef.prefix) return [from.trim(), to.trim()];

  const start = Math.min(startRef.num, endRef.num);
  const end = Math.max(startRef.num, endRef.num);
  if (end - start > 500) return [from.trim(), to.trim()];

  return Array.from({ length: end - start + 1 }, (_, i) => `${startRef.prefix}${start + i}`);
}

/** Interpreta listas e intervalos: "do V1 ao V4", "V1, V2, V3", "P1 P2 P3 P4". */
export function parsePointReferenceList(text: string): string[] {
  let raw = text.trim();
  if (!raw) return [];

  raw = raw.replace(/^(?:nos?\s+pontos?\s+|com\s+(?:os\s+)?pontos?\s+)/i, "");

  const rangePatterns = [
    /^(?:do|de)\s+(.+?)\s+(?:ao|a|até|ate)\s+(.+)$/i,
    /^(.+?)\s+(?:ao|a|até|ate)\s+(.+)$/i,
  ];
  for (const pattern of rangePatterns) {
    const match = raw.match(pattern);
    if (match) {
      return expandPointRange(match[1].trim(), match[2].trim());
    }
  }

  return raw
    .split(/\s*,\s*|\s+e\s+|\s+/i)
    .map((part) => part.trim())
    .filter((part) => part && !POINT_LIST_FILLER.test(part));
}

function labeledNumbersMatch(target: string, candidate: string): boolean {
  const a = parseLabeledPointToken(target);
  const b = parseLabeledPointToken(candidate);
  if (!a || !b || a.num !== b.num) return false;
  if (!a.prefix || !b.prefix) return true;
  return a.prefix === b.prefix;
}

export function findPointByLabel(
  entities: CadEntity[],
  label: string,
): { entity: CadPointEntity; vertex: CadVertex } | null {
  const target = normalizePointLabel(label).replace(/^PONTO/, "");
  if (!target) return null;

  const points = entities.filter((e): e is CadPointEntity => e.type === "point");

  for (const entity of points) {
    const entityLabel = entity.label?.trim();
    if (!entityLabel) continue;
    const normalized = normalizePointLabel(entityLabel).replace(/^PONTO/, "");
    if (normalized === target) {
      return { entity, vertex: { x: entity.x, y: entity.y, z: entity.z } };
    }
  }

  for (const entity of points) {
    const entityLabel = entity.label?.trim();
    if (entityLabel && labeledNumbersMatch(label, entityLabel)) {
      return { entity, vertex: { x: entity.x, y: entity.y, z: entity.z } };
    }
  }

  if (/^\d+$/.test(target)) {
    const num = Number(target);
    for (const entity of points) {
      const entityLabel = entity.label?.trim();
      if (!entityLabel) continue;
      const parsed = parseLabeledPointToken(entityLabel);
      if (parsed && parsed.num === num) {
        return { entity, vertex: { x: entity.x, y: entity.y, z: entity.z } };
      }
    }
  }

  for (const entity of points) {
    const fallback = normalizePointLabel(`P${entity.id.slice(-4)}`);
    if (fallback === target) {
      return { entity, vertex: { x: entity.x, y: entity.y, z: entity.z } };
    }
  }

  return null;
}

export function resolvePointLabels(
  entities: CadEntity[],
  labels: string[],
): { vertices: CadVertex[]; missing: string[] } {
  const expanded =
    labels.length === 1 && labels[0]?.includes(" ao ")
      ? parsePointReferenceList(labels[0])
      : labels.flatMap((label) => (label.includes(" ao ") ? parsePointReferenceList(label) : [label]));

  const vertices: CadVertex[] = [];
  const missing: string[] = [];

  for (const label of expanded) {
    const hit = findPointByLabel(entities, label);
    if (hit) {
      vertices.push(hit.vertex);
    } else {
      missing.push(label);
    }
  }

  return { vertices, missing };
}
