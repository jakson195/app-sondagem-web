import { detectBlockFrontage, sortLotsForNumbering, type LoteamentoResult } from "./lot-subdivision";
import { pointInPolygon } from "./polygon-utils";
import { listReurbLots, LOTEAMENTO_VIAS_LAYER_ID } from "./reurb";
import type { CadLoteProps, CadPolylineEntity, CadProject, CadVertex } from "./types";

const QUADRAS_LAYER_ID = "loteamento_quadras";
export const LOTEAMENTO_LOT_NAME_SEP = " — ";

type PlanarRing = [number, number][];

export type QuadraNomenclature = {
  id: string;
  letter: string;
  name: string;
  centroid: { x: number; y: number };
};

export type LotNomenclature = {
  id: string;
  numero: number;
  quadra: string;
  name: string;
};

export type LoteamentoNomenclatureResult = {
  project: CadProject;
  quadras: QuadraNomenclature[];
  lots: LotNomenclature[];
  valid: boolean;
};

export type LotNumberValidation = {
  ok: boolean;
  duplicateNumbers: number[];
  unnamedQuadras: string[];
  missingLotIds: string[];
};

function dropClosing(ring: [number, number][]): [number, number][] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) {
    return ring.slice(0, -1);
  }
  return ring;
}

function verticesToRing(vertices: { x: number; y: number }[]): [number, number][] {
  return vertices.map((v) => [v.x, v.y] as [number, number]);
}

function ringToVertices(ring: [number, number][]): CadVertex[] {
  return ring.map(([x, y]) => ({ x, y, z: 0 }));
}

export function centroidOfRing(ring: [number, number][]): { x: number; y: number } {
  const pts = dropClosing(ring);
  if (pts.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return { x: x / pts.length, y: y / pts.length };
}

export function quadraLetterAt(index: number): string {
  let n = Math.max(0, Math.floor(index));
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
}

export function formatQuadraName(index: number): string {
  return `Quadra ${quadraLetterAt(index)}`;
}

export function formatLotDisplayNumber(n: number): string {
  return String(Math.max(1, Math.floor(n))).padStart(2, "0");
}

export function formatLoteamentoLotName(quadraName: string, numero: number): string {
  const letter = quadraName.replace(/^quadra\s+/i, "").trim() || "A";
  return `Quadra ${letter}${LOTEAMENTO_LOT_NAME_SEP}${formatLotDisplayNumber(numero)}`;
}

function bboxOfRing(ring: [number, number][]): { minX: number; maxX: number; minY: number; maxY: number } {
  const pts = dropClosing(ring);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

function ringHeight(ring: [number, number][]): number {
  const b = bboxOfRing(ring);
  return Math.max(1, b.maxY - b.minY);
}

function bboxRingOfRings(rings: [number, number][][]): [number, number][] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of dropClosing(ring)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return [];
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
}

/** Norte → sul em faixas; em cada faixa, oeste → leste. */
export function sortPolygonsSpatially<T>(
  items: T[],
  ringOf: (item: T) => [number, number][],
): T[] {
  if (items.length <= 1) return items.slice();
  const decorated = items.map((item, index) => {
    const ring = ringOf(item);
    const c = centroidOfRing(ring);
    return { item, index, c, h: ringHeight(ring) };
  });
  const medianH = [...decorated].sort((a, b) => a.h - b.h)[Math.floor(decorated.length / 2)]?.h ?? 40;
  const rowTol = Math.max(12, medianH * 0.45);
  const sortedY = [...decorated].sort((a, b) => b.c.y - a.c.y || a.c.x - b.c.x || a.index - b.index);
  const rows: (typeof decorated)[] = [];
  for (const item of sortedY) {
    const last = rows[rows.length - 1];
    if (!last) {
      rows.push([item]);
      continue;
    }
    const rowY = last.reduce((s, r) => s + r.c.y, 0) / last.length;
    if (Math.abs(item.c.y - rowY) <= rowTol) last.push(item);
    else rows.push([item]);
  }
  const ordered: T[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.c.x - b.c.x || b.c.y - a.c.y || a.index - b.index);
    for (const cell of row) ordered.push(cell.item);
  }
  return ordered;
}

function pointInRing(x: number, y: number, ring: [number, number][]): boolean {
  return pointInPolygon(x, y, ringToVertices(dropClosing(ring)));
}

function nearestRingIndex(x: number, y: number, rings: PlanarRing[]): number {
  let best = 0;
  let bestD = Infinity;
  rings.forEach((ring, i) => {
    const c = centroidOfRing(ring);
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export function listLoteamentoQuadraEntities(project: CadProject): CadPolylineEntity[] {
  return project.entities.filter(
    (entity): entity is CadPolylineEntity =>
      entity.type === "polyline" &&
      Boolean(entity.closed) &&
      entity.vertices.length >= 3 &&
      entity.layerId === QUADRAS_LAYER_ID,
  );
}

function listStreetRings(project: CadProject): [number, number][][] {
  return project.entities
    .filter(
      (entity): entity is CadPolylineEntity =>
        entity.type === "polyline" &&
        Boolean(entity.closed) &&
        entity.layerId === LOTEAMENTO_VIAS_LAYER_ID &&
        entity.vertices.length >= 3,
    )
    .map((entity) => verticesToRing(entity.vertices));
}

function assignLotToQuadraIndex(lotRing: PlanarRing, quadraRings: PlanarRing[]): number {
  if (quadraRings.length === 0) return 0;
  const c = centroidOfRing(lotRing);
  for (let i = 0; i < quadraRings.length; i++) {
    if (pointInRing(c.x, c.y, quadraRings[i])) return i;
  }
  return nearestRingIndex(c.x, c.y, quadraRings);
}

function fallbackAzimuth(ring: [number, number][]): number {
  const pts = dropClosing(ring);
  let bestLen = 0;
  let bestAz = 90;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len > bestLen) {
      bestLen = len;
      const az = (Math.atan2(dx, dy) * 180) / Math.PI;
      bestAz = az < 0 ? az + 360 : az;
    }
  }
  return bestAz;
}

function sortLotsInQuadra<T>(
  lots: T[],
  ringOf: (lot: T) => PlanarRing,
  streetRings: PlanarRing[],
  hostRing: PlanarRing,
): T[] {
  if (lots.length <= 1) return lots.slice();
  const frontage = detectBlockFrontage(hostRing, streetRings, fallbackAzimuth(hostRing));
  return sortLotsForNumbering(lots, frontage.azimuthDeg, ringOf);
}

function mergeLoteProps(
  prev: CadLoteProps | undefined,
  quadraLetter: string,
  numero: number,
): CadLoteProps {
  return {
    tipo: prev?.tipo ?? "INTERNO",
    areaM2: prev?.areaM2 ?? 0,
    areaMinimaM2: prev?.areaMinimaM2 ?? 0,
    atende: prev?.atende ?? true,
    testadaM: prev?.testadaM ?? 0,
    profundidadeM: prev?.profundidadeM ?? 0,
    ruas: prev?.ruas ?? [],
    numero,
    quadra: quadraLetter,
  };
}

function existingQuadraKey(lot: CadPolylineEntity): string {
  if (lot.lote?.quadra?.trim()) return lot.lote.quadra.trim().toUpperCase();
  const fromName = lot.name?.match(/quadra\s+([A-Z]+)/i)?.[1];
  return fromName?.toUpperCase() ?? "_";
}

/**
 * Ordena quadras espacialmente (norte → sul, oeste → leste) e atribui Quadra A, B, C…
 * Não altera geometria. Não usa IA.
 */
export function renomearQuadrasAutomaticamente(project: CadProject): CadProject {
  const quadras = listLoteamentoQuadraEntities(project);
  if (quadras.length === 0) return project;
  const ordered = sortPolygonsSpatially(quadras, (q) => verticesToRing(q.vertices));
  const nameById = new Map<string, string>();
  ordered.forEach((quadra, index) => {
    nameById.set(quadra.id, formatQuadraName(index));
  });
  return {
    ...project,
    entities: project.entities.map((entity) => {
      if (entity.type !== "polyline") return entity;
      const name = nameById.get(entity.id);
      return name ? { ...entity, name } : entity;
    }),
  };
}

/**
 * Numera lotes de forma contínua entre todas as quadras, em ordem espacial reproduzível.
 * id interno permanece; apenas `name`, `lote.numero` e `lote.quadra` mudam.
 */
export function renumerarLotesGlobalmente(project: CadProject): CadProject {
  const lots = listReurbLots(project);
  if (lots.length === 0) return project;

  const quadras = sortPolygonsSpatially(listLoteamentoQuadraEntities(project), (q) =>
    verticesToRing(q.vertices),
  );
  const streetRings = listStreetRings(project);
  const quadraRings = quadras.map((q) => verticesToRing(q.vertices));
  const quadraLetters = quadras.map((_, i) => quadraLetterAt(i));

  let groups: CadPolylineEntity[][];
  if (quadras.length > 0) {
    groups = quadras.map(() => []);
    for (const lot of lots) {
      const idx = assignLotToQuadraIndex(verticesToRing(lot.vertices), quadraRings);
      groups[idx]?.push(lot);
    }
  } else {
    const byKey = new Map<string, CadPolylineEntity[]>();
    for (const lot of lots) {
      const key = existingQuadraKey(lot);
      const list = byKey.get(key) ?? [];
      list.push(lot);
      byKey.set(key, list);
    }
    groups = sortPolygonsSpatially(
      [...byKey.values()],
      (group) => bboxRingOfRings(group.map((lot) => verticesToRing(lot.vertices))),
    );
  }

  const nameById = new Map<string, { name: string; numero: number; quadra: string }>();
  let next = 1;
  groups.forEach((group, qi) => {
    const letter = quadraLetters[qi] ?? quadraLetterAt(qi);
    const host = quadraRings[qi] ?? bboxRingOfRings(group.map((lot) => verticesToRing(lot.vertices)));
    const ordered = sortLotsInQuadra(group, (lot) => verticesToRing(lot.vertices), streetRings, host);
    for (const lot of ordered) {
      nameById.set(lot.id, {
        name: formatLoteamentoLotName(`Quadra ${letter}`, next),
        numero: next,
        quadra: letter,
      });
      next += 1;
    }
  });

  return {
    ...project,
    entities: project.entities.map((entity) => {
      if (entity.type !== "polyline") return entity;
      const assigned = nameById.get(entity.id);
      if (!assigned) return entity;
      return {
        ...entity,
        name: assigned.name,
        lote: mergeLoteProps(entity.lote, assigned.quadra, assigned.numero),
      };
    }),
  };
}

export function validateUniqueLotNumbers(project: CadProject): LotNumberValidation {
  const lots = listReurbLots(project);
  const quadras = listLoteamentoQuadraEntities(project);
  const seen = new Map<number, string[]>();
  const missingLotIds: string[] = [];
  for (const lot of lots) {
    const n = lot.lote?.numero;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 1) {
      missingLotIds.push(lot.id);
      continue;
    }
    const list = seen.get(n) ?? [];
    list.push(lot.id);
    seen.set(n, list);
  }
  const duplicateNumbers = [...seen.entries()].filter(([, ids]) => ids.length > 1).map(([n]) => n);
  const unnamedQuadras = quadras
    .filter((q) => !/^quadra\s+[A-Z]+$/i.test(q.name?.trim() ?? ""))
    .map((q) => q.id);
  return {
    ok: duplicateNumbers.length === 0 && unnamedQuadras.length === 0 && missingLotIds.length === 0,
    duplicateNumbers,
    unnamedQuadras,
    missingLotIds,
  };
}

function repairDuplicateLotNumbers(project: CadProject): CadProject {
  return renumerarLotesGlobalmente(renomearQuadrasAutomaticamente(project));
}

/** Nomenclatura + numeração + validação. Não altera geometria. */
export function applyLoteamentoNomenclature(project: CadProject): LoteamentoNomenclatureResult {
  if (listReurbLots(project).length === 0 && listLoteamentoQuadraEntities(project).length === 0) {
    return { project, quadras: [], lots: [], valid: true };
  }
  let next = renumerarLotesGlobalmente(renomearQuadrasAutomaticamente(project));
  let check = validateUniqueLotNumbers(next);
  if (!check.ok) {
    next = repairDuplicateLotNumbers(next);
    check = validateUniqueLotNumbers(next);
  }
  const quadras = sortPolygonsSpatially(listLoteamentoQuadraEntities(next), (q) =>
    verticesToRing(q.vertices),
  ).map((q, i) => ({
    id: q.id,
    letter: quadraLetterAt(i),
    name: formatQuadraName(i),
    centroid: centroidOfRing(verticesToRing(q.vertices)),
  }));
  const lots = listReurbLots(next)
    .filter((lot) => typeof lot.lote?.numero === "number")
    .sort((a, b) => (a.lote?.numero ?? 0) - (b.lote?.numero ?? 0))
    .map((lot) => ({
      id: lot.id,
      numero: lot.lote!.numero!,
      quadra: lot.lote!.quadra ?? "A",
      name: lot.name ?? formatLoteamentoLotName(`Quadra ${lot.lote!.quadra ?? "A"}`, lot.lote!.numero!),
    }));
  return { project: next, quadras, lots, valid: check.ok };
}

/** Aplica a mesma nomenclatura no resultado geométrico, antes de criar entidades. */
export function applyNomenclatureToLoteamentoResult(result: LoteamentoResult): LoteamentoResult {
  const quadraRings = result.quadraPolys.map((poly) => (poly[0] ?? []) as [number, number][]).filter((r) => r.length >= 3);
  const orderedQuadras = sortPolygonsSpatially(
    quadraRings.map((ring, i) => ({ ring, i })),
    (item) => item.ring,
  );
  const letterByIndex = new Map<number, string>();
  orderedQuadras.forEach((item, order) => {
    letterByIndex.set(item.i, quadraLetterAt(order));
  });

  const streetRings = result.vias.map((poly) => (poly[0] ?? []) as [number, number][]).filter((r) => r.length >= 3);
  const groups: { lote: (typeof result.lotes)[number]; quadraIndex: number }[][] = orderedQuadras.map(
    () => [],
  );

  if (orderedQuadras.length === 0) {
    const fallbackGroups = new Map<string, typeof result.lotes>();
    for (const lote of result.lotes) {
      const key = lote.quadra || "_";
      const list = fallbackGroups.get(key) ?? [];
      list.push(lote);
      fallbackGroups.set(key, list);
    }
    const named: typeof result.lotes = [];
    let n = 1;
    const orderedGroups = sortPolygonsSpatially(
      [...fallbackGroups.values()],
      (group) => bboxRingOfRings(group.map((lote) => (lote.coordinates[0] ?? []) as [number, number][])),
    );
    orderedGroups.forEach((group, qi) => {
      const letter = quadraLetterAt(qi);
      const host = bboxRingOfRings(group.map((lote) => (lote.coordinates[0] ?? []) as [number, number][]));
      const ordered = sortLotsInQuadra(group, (lote) => (lote.coordinates[0] ?? []) as [number, number][], streetRings, host);
      for (const lote of ordered) {
        named.push({
          ...lote,
          quadra: `Quadra ${letter}`,
          numero: formatLotDisplayNumber(n),
        });
        n += 1;
      }
    });
    return { ...result, lotes: named };
  }

  for (const lote of result.lotes) {
    const ring = (lote.coordinates[0] ?? []) as [number, number][];
    const rawIndex = assignLotToQuadraIndex(ring, quadraRings);
    const orderIndex = orderedQuadras.findIndex((item) => item.i === rawIndex);
    groups[orderIndex >= 0 ? orderIndex : 0]?.push({ lote, quadraIndex: rawIndex });
  }

  const named: typeof result.lotes = [];
  let n = 1;
  groups.forEach((group, order) => {
    const src = orderedQuadras[order];
    const letter = src ? letterByIndex.get(src.i) ?? quadraLetterAt(order) : quadraLetterAt(order);
    const host = src?.ring ?? [];
    const ordered = sortLotsInQuadra(group, (item) => (item.lote.coordinates[0] ?? []) as [number, number][], streetRings, host);
    for (const item of ordered) {
      named.push({
        ...item.lote,
        quadra: `Quadra ${letter}`,
        numero: formatLotDisplayNumber(n),
      });
      n += 1;
    }
  });
  return { ...result, lotes: named };
}

export function namedQuadraPolys(result: LoteamentoResult): { ring: [number, number][]; name: string }[] {
  const rings = result.quadraPolys.map((poly) => (poly[0] ?? []) as [number, number][]).filter((r) => r.length >= 3);
  const ordered = sortPolygonsSpatially(
    rings.map((ring, i) => ({ ring, i })),
    (item) => item.ring,
  );
  return ordered.map((item, i) => ({ ring: item.ring, name: formatQuadraName(i) }));
}
