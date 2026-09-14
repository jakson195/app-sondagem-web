import type { CadEntity, CadPointEntity, CadVertex } from "./types";

const POINT_LIST_FILLER =
  /^(do|de|ao|a|até|ate|os|as|o|pontos?|vértices?|vertices?|com|nos?|nas?)$/i;

const PT_CARDINALS: Record<string, number> = {
  um: 1,
  uma: 1,
  primeiro: 1,
  primeira: 1,
  dois: 2,
  duas: 2,
  segundo: 2,
  segunda: 2,
  tres: 3,
  terceiro: 3,
  terceira: 3,
  quatro: 4,
  quarto: 4,
  quarta: 4,
  cinco: 5,
  quinto: 5,
  quinta: 5,
  seis: 6,
  sexto: 6,
  sexta: 6,
  sete: 7,
  setimo: 7,
  setima: 7,
  oito: 8,
  oitavo: 8,
  oitava: 8,
  nove: 9,
  nono: 9,
  nona: 9,
  dez: 10,
  decimo: 10,
  decima: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezasseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
};

function foldPt(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function parsePortugueseNumberWord(raw: string): number | null {
  const folded = foldPt(raw);
  if (/^\d+$/.test(folded)) return Number(folded);
  return PT_CARDINALS[folded] ?? null;
}

function stripSpokenPointNoise(token: string): string {
  return token
    .trim()
    .replace(/^(o|a|os|as|ao|à|do|da|de|no|na|dos|das)\s+/i, "")
    .replace(/^(pontos?|v[eé]rtices?|vertices?)\s*/i, "")
    .replace(/^(o|a|os|as)\s+/i, "")
    .trim();
}

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

/** Interpreta "P4", "4", "o quatro", "ponto" (início de intervalo = 1). */
export function parseSpokenPointToken(
  token: string,
  defaultPrefix = "P",
  defaultNum?: number,
): { prefix: string; num: number } | null {
  const labeled = parseLabeledPointToken(token);
  if (labeled) return labeled;

  const cleaned = stripSpokenPointNoise(token);
  if (!cleaned) {
    return defaultNum != null ? { prefix: defaultPrefix, num: defaultNum } : null;
  }

  const labeledClean = parseLabeledPointToken(cleaned);
  if (labeledClean) return labeledClean;

  const spoken = parsePortugueseNumberWord(cleaned);
  if (spoken != null) return { prefix: defaultPrefix, num: spoken };

  return null;
}

/** Expande intervalos como V1–V4 → V1, V2, V3, V4. */
export function expandPointRange(from: string, to: string, defaultPrefix = "P"): string[] {
  const startRef = parseSpokenPointToken(from, defaultPrefix, 1);
  const endRef = parseSpokenPointToken(to, startRef?.prefix ?? defaultPrefix);
  if (!startRef || !endRef) return [from.trim(), to.trim()].filter(Boolean);
  if (startRef.prefix !== endRef.prefix) {
    const alignedEnd = parseSpokenPointToken(to, startRef.prefix);
    if (!alignedEnd || alignedEnd.prefix !== startRef.prefix) {
      return [from.trim(), to.trim()];
    }
    return expandPointRange(`${startRef.prefix}${startRef.num}`, `${alignedEnd.prefix}${alignedEnd.num}`, startRef.prefix);
  }

  const start = Math.min(startRef.num, endRef.num);
  const end = Math.max(startRef.num, endRef.num);
  if (end - start > 500) return [from.trim(), to.trim()];

  return Array.from({ length: end - start + 1 }, (_, i) => `${startRef.prefix}${start + i}`);
}

/** Interpreta listas e intervalos: "do V1 ao V4", "do ponto até o quatro", "P1 P2 P3 P4". */
export function parsePointReferenceList(text: string, defaultPrefix = "P"): string[] {
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
      return expandPointRange(match[1].trim(), match[2].trim(), defaultPrefix);
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
    labels.length === 1 && /(?:\sao\s|\sat[eé]\s)/i.test(labels[0] ?? "")
      ? parsePointReferenceList(labels[0])
      : labels.flatMap((label) =>
          /(?:\sao\s|\sat[eé]\s)/i.test(label) ? parsePointReferenceList(label) : [label],
        );

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
