import type { CadVertex } from "./types";
import {
  dxfAciToHex,
  type ImportedCadDrawing,
  type ImportedCadGeom,
  type ImportedCadLayer,
} from "./import-drawing-types";

type DxfGroup = { code: number; value: string };

const CIRCLE_SEGMENTS = 32;
const MAX_ENTITIES = 20_000;

export function looksLikeAsciiDxf(text: string): boolean {
  const head = text.slice(0, 8000);
  if (/AutoCAD Binary DXF/i.test(head)) return false;
  return /\bSECTION\b/i.test(head) && /\b(ENTITIES|HEADER|TABLES)\b/i.test(head);
}

export function bytesLookLikeAsciiDxf(bytes: Uint8Array): boolean {
  const sample = new TextDecoder("latin1").decode(bytes.subarray(0, 800));
  if (sample.startsWith("AC10")) return false;
  if (/AutoCAD Binary DXF/i.test(sample)) return false;
  return looksLikeAsciiDxf(sample);
}

export function bytesLookLikeBinaryDwg(bytes: Uint8Array): boolean {
  const sig = new TextDecoder("ascii").decode(bytes.subarray(0, 6));
  return /^AC10\d{2}/.test(sig);
}

export function bytesLookLikeBinaryDxf(bytes: Uint8Array): boolean {
  const sig = new TextDecoder("ascii").decode(bytes.subarray(0, 22));
  return sig.startsWith("AutoCAD Binary DXF");
}

export function decodeDxfText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function circleToPolylineVertices(
  cx: number,
  cy: number,
  z: number,
  radius: number,
  segments = CIRCLE_SEGMENTS,
): CadVertex[] {
  const r = Math.abs(radius);
  const n = Math.max(8, segments);
  const verts: CadVertex[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    verts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), z });
  }
  return verts;
}

function parseGroups(content: string): DxfGroup[] {
  const lines = content.split(/\r?\n/);
  const groups: DxfGroup[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i]?.trim();
    if (!raw) {
      i++;
      continue;
    }
    const code = Number(raw);
    if (!Number.isFinite(code)) {
      i++;
      continue;
    }
    groups.push({ code, value: (lines[i + 1] ?? "").trim() });
    i += 2;
  }
  return groups;
}

function num(value: string): number {
  return Number(value.replace(",", "."));
}

function tagMap(tags: DxfGroup[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const tag of tags) {
    const list = map.get(tag.code) ?? [];
    list.push(tag.value);
    map.set(tag.code, list);
  }
  return map;
}

function firstNum(map: Map<number, string[]>, code: number, fallback = 0): number {
  const v = map.get(code)?.[0];
  if (v == null) return fallback;
  const n = num(v);
  return Number.isFinite(n) ? n : fallback;
}

function firstStr(map: Map<number, string[]>, code: number, fallback = "0"): string {
  const v = map.get(code)?.[0]?.trim();
  return v || fallback;
}

function cleanDxfText(raw: string): string {
  return raw
    .replace(/\\P/gi, "\n")
    .replace(/\\~+/g, " ")
    .replace(/\\[A-Za-z][^;]*;/g, "")
    .replace(/[{}]/g, "")
    .trim();
}

/** Vértices LWPOLYLINE com bulge (arco entre vértices). */
function lwVerticesWithBulge(tags: DxfGroup[], elevation: number, closed: boolean): CadVertex[] {
  type V = { x: number; y: number; z: number; bulge: number };
  const raw: V[] = [];
  let cur: Partial<V> = { z: elevation, bulge: 0 };
  for (const tag of tags) {
    if (tag.code === 10) {
      if (cur.x != null && cur.y != null) {
        raw.push({ x: cur.x, y: cur.y, z: cur.z ?? elevation, bulge: cur.bulge ?? 0 });
      }
      cur = { x: num(tag.value), z: elevation, bulge: 0 };
    } else if (tag.code === 20) {
      cur.y = num(tag.value);
    } else if (tag.code === 30) {
      const n = num(tag.value);
      if (Number.isFinite(n)) cur.z = n;
    } else if (tag.code === 42) {
      const n = num(tag.value);
      if (Number.isFinite(n)) cur.bulge = n;
    }
  }
  if (cur.x != null && cur.y != null) {
    raw.push({ x: cur.x, y: cur.y, z: cur.z ?? elevation, bulge: cur.bulge ?? 0 });
  }

  const out: CadVertex[] = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i]!;
    out.push({ x: a.x, y: a.y, z: a.z });
    const isLast = i === raw.length - 1;
    const b = isLast ? raw[0] : raw[i + 1];
    if (!b || Math.abs(a.bulge) < 1e-8) continue;
    if (isLast && !closed) continue;
    out.push(...tessellateBulge(a, b, a.bulge));
  }
  return out.filter((v) => Number.isFinite(v.x) && Number.isFinite(v.y));
}

function tessellateBulge(
  a: CadVertex,
  b: CadVertex,
  bulge: number,
): CadVertex[] {
  const theta = 4 * Math.atan(bulge);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-12 || Math.abs(theta) < 1e-6) return [];
  const radius = chord / (2 * Math.sin(theta / 2));
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const h = Math.cos(theta / 2) * radius;
  const nx = -dy / chord;
  const ny = dx / chord;
  const cx = mx + nx * h;
  const cy = my + ny * h;
  const a0 = Math.atan2(a.y - cy, a.x - cx);
  const n = Math.max(2, Math.min(24, Math.ceil(Math.abs(theta) / (Math.PI / 10))));
  const r = Math.abs(radius);
  const extra: CadVertex[] = [];
  for (let i = 1; i < n; i++) {
    const t = a0 + (theta * i) / n;
    extra.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t), z: a.z });
  }
  return extra;
}

function collectSectionEntities(groups: DxfGroup[]): {
  layers: ImportedCadLayer[];
  entities: Array<{ type: string; tags: DxfGroup[] }>;
  insBase: CadVertex | null;
} {
  const layers: ImportedCadLayer[] = [];
  const entities: Array<{ type: string; tags: DxfGroup[] }> = [];
  let section = "";
  let table = "";
  let insBase: CadVertex | null = null;
  let headerVar = "";
  let i = 0;

  while (i < groups.length) {
    const g = groups[i]!;
    if (g.code === 0 && g.value === "SECTION") {
      const name = groups[i + 1]?.code === 2 ? groups[i + 1]!.value.toUpperCase() : "";
      section = name;
      i += 2;
      continue;
    }
    if (g.code === 0 && g.value === "ENDSEC") {
      section = "";
      table = "";
      i++;
      continue;
    }
    if (section === "HEADER" && g.code === 9) {
      headerVar = g.value.toUpperCase();
      i++;
      continue;
    }
    if (section === "HEADER" && headerVar === "$INSBASE") {
      const x: number = g.code === 10 ? num(g.value) : insBase?.x ?? 0;
      const y: number = groups[i + 1]?.code === 20 ? num(groups[i + 1]!.value) : insBase?.y ?? 0;
      const z: number = groups[i + 2]?.code === 30 ? num(groups[i + 2]!.value) : insBase?.z ?? 0;
      if (g.code === 10) {
        insBase = {
          x: Number.isFinite(x) ? x : 0,
          y: Number.isFinite(y) ? y : 0,
          z: Number.isFinite(z) ? z : 0,
        };
      }
    }
    if (section === "TABLES" && g.code === 0 && g.value === "TABLE") {
      table = groups[i + 1]?.code === 2 ? groups[i + 1]!.value.toUpperCase() : "";
      i += 2;
      continue;
    }
    if (section === "TABLES" && g.code === 0 && g.value === "ENDTAB") {
      table = "";
      i++;
      continue;
    }
    if (section === "TABLES" && table === "LAYER" && g.code === 0 && g.value === "LAYER") {
      const tags: DxfGroup[] = [];
      i++;
      while (i < groups.length && groups[i]!.code !== 0) {
        tags.push(groups[i]!);
        i++;
      }
      const map = tagMap(tags);
      const name = firstStr(map, 2, "0");
      const colorCode = firstNum(map, 62, 7);
      layers.push({ name, color: dxfAciToHex(Math.abs(colorCode)) });
      continue;
    }
    if (section === "ENTITIES" && g.code === 0) {
      const type = g.value.toUpperCase();
      const tags: DxfGroup[] = [];
      i++;
      while (i < groups.length && groups[i]!.code !== 0) {
        tags.push(groups[i]!);
        i++;
      }
      entities.push({ type, tags });
      continue;
    }
    i++;
  }

  return { layers, entities, insBase };
}

function entityFromRaw(
  type: string,
  tags: DxfGroup[],
  vertexBuffer: CadVertex[],
  closedPoly: boolean,
): ImportedCadGeom | null {
  const map = tagMap(tags);
  const layer = firstStr(map, 8, "0");

  if (type === "LINE") {
    const start = {
      x: firstNum(map, 10),
      y: firstNum(map, 20),
      z: firstNum(map, 30),
    };
    const end = {
      x: firstNum(map, 11),
      y: firstNum(map, 21),
      z: firstNum(map, 31),
    };
    if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) return null;
    return { kind: "line", layer, start, end };
  }

  if (type === "POINT") {
    const x = firstNum(map, 10);
    const y = firstNum(map, 20);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { kind: "point", layer, x, y, z: firstNum(map, 30) };
  }

  if (type === "CIRCLE") {
    const cx = firstNum(map, 10);
    const cy = firstNum(map, 20);
    const z = firstNum(map, 30);
    const r = firstNum(map, 40);
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !(r > 0)) return null;
    return {
      kind: "polyline",
      layer,
      closed: true,
      vertices: circleToPolylineVertices(cx, cy, z, r),
    };
  }

  if (type === "TEXT" || type === "MTEXT") {
    const x = firstNum(map, 10);
    const y = firstNum(map, 20);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const chunks = [...(map.get(1) ?? []), ...(map.get(3) ?? [])];
    const label = cleanDxfText(chunks.join(""));
    return { kind: "point", layer, x, y, z: firstNum(map, 30), label: label || undefined };
  }

  if (type === "LWPOLYLINE") {
    const flags = firstNum(map, 70);
    const elev = firstNum(map, 38, firstNum(map, 30));
    const vertices = lwVerticesWithBulge(tags, elev, (flags & 1) === 1);
    if (vertices.length < 2) return null;
    return { kind: "polyline", layer, vertices, closed: (flags & 1) === 1 };
  }

  if (type === "POLYLINE") {
    const flags = firstNum(map, 70);
    if (vertexBuffer.length < 2) return null;
    return {
      kind: "polyline",
      layer,
      vertices: vertexBuffer,
      closed: (flags & 1) === 1 || closedPoly,
    };
  }

  return null;
}

function vertexFromTags(tags: DxfGroup[]): CadVertex | null {
  const map = tagMap(tags);
  const flags = firstNum(map, 70);
  if ((flags & 16) === 16) return null;
  const x = firstNum(map, 10);
  const y = firstNum(map, 20);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, z: firstNum(map, 30) };
}

export function parseAsciiDxf(content: string): ImportedCadDrawing {
  const warnings: string[] = [];
  if (!looksLikeAsciiDxf(content)) {
    return { geoms: [], layers: [], warnings: ["Arquivo DXF ASCII inválido ou vazio."], source: "dxf" };
  }

  const groups = parseGroups(content);
  const { layers, entities, insBase } = collectSectionEntities(groups);
  if (insBase && (Math.abs(insBase.x) > 1e-6 || Math.abs(insBase.y) > 1e-6)) {
    warnings.push("INSBASE/UCS ignorados — coordenadas XY do desenho foram mantidas.");
  }

  const geoms: ImportedCadGeom[] = [];
  const layerByName = new Map(layers.map((l) => [l.name.toUpperCase(), l]));
  const ensureLayer = (name: string) => {
    const key = name.toUpperCase();
    if (!layerByName.has(key)) {
      const layer = { name, color: dxfAciToHex((layerByName.size % 7) + 1) };
      layerByName.set(key, layer);
      layers.push(layer);
    }
  };

  let polyVerts: CadVertex[] = [];
  let polyTags: DxfGroup[] = [];
  let polyOpen = false;

  const flushPolyline = () => {
    if (!polyOpen) return;
    const geom = entityFromRaw("POLYLINE", polyTags, polyVerts, false);
    if (geom) {
      ensureLayer(geom.layer);
      geoms.push(geom);
    }
    polyOpen = false;
    polyVerts = [];
    polyTags = [];
  };

  for (const ent of entities) {
    if (geoms.length >= MAX_ENTITIES) {
      warnings.push(`Limite de ${MAX_ENTITIES} entidades atingido.`);
      break;
    }
    if (ent.type === "POLYLINE") {
      flushPolyline();
      polyOpen = true;
      polyTags = ent.tags;
      polyVerts = [];
      continue;
    }
    if (ent.type === "VERTEX" && polyOpen) {
      const v = vertexFromTags(ent.tags);
      if (v) polyVerts.push(v);
      continue;
    }
    if (ent.type === "SEQEND") {
      flushPolyline();
      continue;
    }
    if (polyOpen && ent.type !== "VERTEX") flushPolyline();

    const geom = entityFromRaw(ent.type, ent.tags, [], false);
    if (geom) {
      ensureLayer(geom.layer);
      geoms.push(geom);
    }
  }
  flushPolyline();

  if (geoms.length === 0) {
    warnings.push("Nenhuma entidade LINE, POLYLINE, LWPOLYLINE, CIRCLE, POINT ou TEXT encontrada.");
  }

  return { geoms, layers, warnings, source: "dxf" };
}
