import "server-only";

import {
  CadDocument,
  DwgReader,
  DxfReader,
  Entity,
  Line,
  LwPolyline,
  Polyline2D,
  Polyline3D,
  Spline,
  XYZ,
} from "@node-projects/acad-ts";
import type { ProfilePoint } from "@/app/(app)/taludes/components/stability-engine";
import type { AcadSlopeCandidate, AcadSlopeImportResult } from "./acad-import-types";

const MIN_POINTS = 3;
const MAX_CANDIDATES = 30;

function detectFormat(filename: string, bytes: Uint8Array): "dwg" | "dxf" {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "dwg") return "dwg";
  if (ext === "dxf") return "dxf";

  if (DxfReader.isBinaryStream(bytes)) return "dxf";

  const head = new TextDecoder("ascii", { fatal: false }).decode(bytes.slice(0, 64)).trimStart();
  if (head.startsWith("0") && head.includes("SECTION")) return "dxf";

  return "dwg";
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function readCadDocument(bytes: Uint8Array, format: "dwg" | "dxf"): CadDocument {
  if (format === "dwg") {
    return DwgReader.readFromStream(toArrayBuffer(bytes));
  }
  return DxfReader.readFromStream(bytes);
}

function extractPoints(entity: Entity): XYZ[] | null {
  if (entity instanceof LwPolyline) {
    return entity.getPoints(24);
  }
  if (entity instanceof Polyline3D || entity instanceof Polyline2D) {
    return entity.getPoints(24);
  }
  if (entity instanceof Line) {
    return [entity.startPoint, entity.endPoint];
  }
  if (entity instanceof Spline) {
    if (entity.fitPoints.length >= 2) return entity.fitPoints;
    if (entity.controlPoints.length >= 2) return entity.polygonalVertexes(32);
  }
  return null;
}

function xyzPointsToProfile(points: XYZ[]): ProfilePoint[] {
  if (points.length < 2) return [];

  const coords = points.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  const rangeX = Math.max(...coords.map((p) => p.x)) - Math.min(...coords.map((p) => p.x));
  const rangeY = Math.max(...coords.map((p) => p.y)) - Math.min(...coords.map((p) => p.y));
  const rangeZ = Math.max(...coords.map((p) => p.z)) - Math.min(...coords.map((p) => p.z));
  const maxRange = Math.max(rangeX, rangeY, rangeZ, 1e-9);

  const depthAxis =
    rangeZ <= maxRange * 0.05 ? "z" :
    rangeY <= maxRange * 0.05 ? "y" :
    rangeX <= maxRange * 0.05 ? "x" :
    null;

  let chainage: (p: (typeof coords)[0]) => number;
  let elevation: (p: (typeof coords)[0]) => number;

  if (depthAxis === "z" || (rangeZ < rangeY * 0.08 && rangeZ < rangeX * 0.08)) {
    chainage = (p) => p.x;
    elevation = (p) => p.y;
  } else if (depthAxis === "y" || (rangeY < rangeZ * 0.08 && rangeY < rangeX * 0.08)) {
    chainage = (p) => p.x;
    elevation = (p) => p.z;
  } else if (depthAxis === "x") {
    chainage = (p) => p.y;
    elevation = (p) => p.z;
  } else {
    chainage = (p) => p.x;
    elevation = (p) => p.y;
  }

  const sorted = [...coords].sort((a, b) => chainage(a) - chainage(b));
  const x0 = chainage(sorted[0]);
  const profile = sorted.map((p) => ({
    x: chainage(p) - x0,
    y: elevation(p),
  }));

  return dedupeProfile(profile);
}

function dedupeProfile(profile: ProfilePoint[]): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  for (const point of profile) {
    const prev = out[out.length - 1];
    if (prev && Math.hypot(point.x - prev.x, point.y - prev.y) < 1e-4) continue;
    out.push(point);
  }
  return out;
}

function profileLength(profile: ProfilePoint[]): number {
  let len = 0;
  for (let i = 1; i < profile.length; i++) {
    len += Math.hypot(profile[i].x - profile[i - 1].x, profile[i].y - profile[i - 1].y);
  }
  return len;
}

function layerScore(layerName: string): number {
  const layer = layerName.toUpperCase();
  if (/TALUDE|PERFIL|SECAO|SECÃO|SLOPE|TERRENO|TOPO|SUPERF/.test(layer)) return 2;
  if (/GEO|SOLO|ESTRUT/.test(layer)) return 1.4;
  return 1;
}

function scoreCandidate(candidate: AcadSlopeCandidate): number {
  return candidate.length * layerScore(candidate.layerName);
}

function collectEntities(doc: CadDocument): Array<{ entity: Entity; layerName: string; blockName: string }> {
  const out: Array<{ entity: Entity; layerName: string; blockName: string }> = [];
  const blocks = doc.blockRecords;
  if (!blocks) return out;

  for (const block of blocks) {
    const blockName = block.name ?? "";
    if (blockName.startsWith("*Paper_Space")) continue;
    if (block.isAnonymous && blockName !== "*Model_Space") continue;

    for (const entity of block.entities) {
      if (!(entity instanceof Entity) || entity.isInvisible) continue;
      out.push({
        entity,
        layerName: entity.layer?.name ?? "0",
        blockName: blockName || "*Model_Space",
      });
    }
  }

  return out;
}

export function parseAcadSlopeFile(bytes: Uint8Array, fileName: string): AcadSlopeImportResult {
  const warnings: string[] = [];
  const format = detectFormat(fileName, bytes);

  let doc: CadDocument;
  try {
    doc = readCadDocument(bytes, format);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao ler o arquivo.";
    throw new Error(`Não foi possível abrir o ${format.toUpperCase()}: ${message}`);
  }

  const entities = collectEntities(doc);
  if (entities.length === 0) {
    warnings.push("Nenhuma entidade gráfica encontrada no desenho.");
  }

  const candidates: AcadSlopeCandidate[] = [];
  let index = 0;

  for (const { entity, layerName, blockName } of entities) {
    const points = extractPoints(entity);
    if (!points || points.length < MIN_POINTS) continue;

    const profile = xyzPointsToProfile(points);
    if (profile.length < MIN_POINTS) continue;

    const length = profileLength(profile);
    if (length < 0.5) continue;

    candidates.push({
      id: `c${index++}`,
      layerName,
      blockName,
      entityType: entity.objectName || entity.constructor.name,
      pointCount: profile.length,
      length: Number(length.toFixed(2)),
      profile,
    });
  }

  candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
  const trimmed = candidates.slice(0, MAX_CANDIDATES);

  if (candidates.length === 0) {
    warnings.push(
      "Nenhuma polilinha ou linha adequada encontrada. Desenhe o perfil do talude como POLYLINE ou LINE em vista de seção (X × cota).",
    );
  } else if (candidates.length > MAX_CANDIDATES) {
    warnings.push(`Mostrando ${MAX_CANDIDATES} de ${candidates.length} geometrias encontradas.`);
  }

  return {
    fileName,
    format,
    candidates: trimmed,
    recommendedId: trimmed[0]?.id ?? null,
    warnings,
  };
}
