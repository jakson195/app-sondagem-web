import { unzipSync, zipSync, strToU8 } from "fflate";
import type { CadEntity, CadPointEntity, CadPolylineEntity, CadProject } from "./types";
import type { SurveyPoint } from "../types";

function uid() {
  return `pt_${Math.random().toString(36).slice(2, 10)}`;
}

/** Extrai blocos <coordinates>…</coordinates> do KML. */
function extractCoordinateBlocks(kml: string): string[] {
  const blocks: string[] = [];
  const re = /<coordinates[^>]*>([\s\S]*?)<\/coordinates>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(kml)) !== null) {
    blocks.push(m[1].trim());
  }
  return blocks;
}

function parseCoordinateTriplet(raw: string): { e: number; n: number; z: number } | null {
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length < 2) return null;
  const e = Number(parts[0]);
  const n = Number(parts[1]);
  const z = parts.length >= 3 ? Number(parts[2]) : 0;
  if (!Number.isFinite(e) || !Number.isFinite(n)) return null;
  return { e, n, z: Number.isFinite(z) ? z : 0 };
}

function parseCoordinateBlock(block: string): Array<{ e: number; n: number; z: number }> {
  const coords: Array<{ e: number; n: number; z: number }> = [];
  const tokens = block.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const pt = parseCoordinateTriplet(token);
    if (pt) coords.push(pt);
  }
  return coords;
}

/** Nomes de Placemarks na ordem de aparição. */
function extractPlacemarkNames(kml: string): string[] {
  const names: string[] = [];
  const re = /<Placemark[\s\S]*?<name[^>]*>([\s\S]*?)<\/name>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(kml)) !== null) {
    names.push(m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim());
  }
  return names;
}

export function parseKml(content: string): { points: SurveyPoint[]; warnings: string[] } {
  const warnings: string[] = [];
  const blocks = extractCoordinateBlocks(content);
  if (blocks.length === 0) {
    return { points: [], warnings: ["Nenhuma coordenada encontrada no KML."] };
  }

  const names = extractPlacemarkNames(content);
  const points: SurveyPoint[] = [];
  let nameIdx = 0;

  for (const block of blocks) {
    const coords = parseCoordinateBlock(block);
    if (coords.length === 1) {
      const c = coords[0];
      const name = names[nameIdx++] || `P${points.length + 1}`;
      points.push({ id: uid(), name, e: c.e, n: c.n, z: c.z });
    } else if (coords.length > 1) {
      coords.forEach((c, i) => {
        points.push({
          id: uid(),
          name: `V${points.length + 1}`,
          e: c.e,
          n: c.n,
          z: c.z,
        });
      });
      if (coords.length > 2) {
        warnings.push(`Linha/polígono KML convertido em ${coords.length} vértices.`);
      }
    }
  }

  if (points.length === 0) warnings.push("KML sem pontos válidos.");
  return { points, warnings };
}

export function parseKmzBuffer(buffer: ArrayBuffer): { kml: string; warnings: string[] } {
  const warnings: string[] = [];
  try {
    const files = unzipSync(new Uint8Array(buffer));
    const kmlName = Object.keys(files).find((n) => n.toLowerCase().endsWith(".kml"));
    if (!kmlName) {
      return { kml: "", warnings: ["KMZ sem arquivo .kml interno."] };
    }
    const kml = new TextDecoder("utf-8").decode(files[kmlName]);
    return { kml, warnings };
  } catch {
    return { kml: "", warnings: ["Falha ao descompactar KMZ."] };
  }
}

export function parseKmlOrKmz(content: string, format: "kml" | "kmz", binary?: ArrayBuffer): {
  points: SurveyPoint[];
  warnings: string[];
} {
  if (format === "kmz" && binary) {
    const { kml, warnings: w } = parseKmzBuffer(binary);
    if (!kml) return { points: [], warnings: w };
    const parsed = parseKml(kml);
    return { points: parsed.points, warnings: [...w, ...parsed.warnings] };
  }
  return parseKml(content);
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function exportCadProjectKml(project: CadProject): string {
  const placemarks: string[] = [];

  for (const entity of project.entities) {
    if (entity.type === "point") {
      placemarks.push(
        `<Placemark><name>${escapeXml(entity.label ?? entity.id)}</name><Point><coordinates>${entity.x},${entity.y},${entity.z}</coordinates></Point></Placemark>`,
      );
    }
    if (entity.type === "polyline" && entity.vertices.length >= 2) {
      const coords = entity.vertices.map((v) => `${v.x},${v.y},${v.z}`).join(" ");
      placemarks.push(
        `<Placemark><name>${escapeXml(entity.name ?? entity.id)}</name><LineString><coordinates>${coords}</coordinates></LineString></Placemark>`,
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>${escapeXml(project.name)}</name>
${placemarks.join("\n")}
</Document>
</kml>`;
}

export function exportCadProjectKmz(project: CadProject): Uint8Array {
  const kml = exportCadProjectKml(project);
  return zipSync({ "doc.kml": strToU8(kml) });
}

export function cadEntitiesFromSurveyPoints(
  points: SurveyPoint[],
): CadPointEntity[] {
  return points.map((p) => ({
    id: `pt_${Math.random().toString(36).slice(2, 10)}`,
    type: "point" as const,
    layerId: "rtk_points",
    x: p.e,
    y: p.n,
    z: p.z,
    label: p.name?.trim() || p.code?.trim() || p.id,
    sourceId: p.id,
  }));
}
