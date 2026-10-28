import { unzipSync, zipSync, strToU8 } from "fflate";
import { detectCadGeorefFromProject, enToLatLonGeoref, vertexToEn } from "./georef";
import type { CadPointEntity, CadPolylineEntity, CadProject } from "./types";
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

/** Converte "#rrggbb" (ou "#rgb") para a cor KML aabbggrr. */
function kmlColor(hex: string | undefined, alpha: number): string {
  let h = (hex ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) h = "ffffff";
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, "0");
  return `${a}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toLowerCase();
}

function loteDescription(entity: CadPolylineEntity): string {
  const lote = entity.lote;
  if (!lote) return "";
  const rows = [
    lote.quadra ? `Quadra: ${lote.quadra}` : "",
    lote.numero != null ? `Lote: ${lote.numero}` : "",
    `Área: ${lote.areaM2.toFixed(2)} m²`,
    lote.testadaM > 0 ? `Testada: ${lote.testadaM.toFixed(2)} m` : "",
    lote.profundidadeM > 0 ? `Profundidade: ${lote.profundidadeM.toFixed(2)} m` : "",
    lote.ruas.length ? `Ruas: ${lote.ruas.join(", ")}` : "",
  ].filter(Boolean);
  return `<description>${escapeXml(rows.join("\n"))}</description>`;
}

/**
 * KML em WGS84 (lon,lat). Coordenadas UTM SIRGAS 2000 são convertidas pela zona detectada no projeto.
 * Lança erro se o desenho não estiver georreferenciado.
 */
export function exportCadProjectKml(project: CadProject): string {
  const georef = detectCadGeorefFromProject(project);
  if (!georef.isGeoreferenced) {
    throw new Error("Desenho sem coordenadas georreferenciadas (UTM SIRGAS 2000 ou WGS84). KML/KMZ exige georreferência.");
  }

  const lonLat = (x: number, y: number, z: number) => {
    const v = { x, y, z };
    const en = vertexToEn(v, georef);
    const ll = enToLatLonGeoref(en.e, en.n, georef);
    return `${ll.lon.toFixed(8)},${ll.lat.toFixed(8)},${Number.isFinite(z) ? z.toFixed(3) : 0}`;
  };

  const styles: string[] = [];
  const folders: string[] = [];
  const layerIds = [...new Set(project.entities.map((e) => e.layerId))];

  for (const layerId of layerIds) {
    const layer = project.layers.find((l) => l.id === layerId);
    const styleId = `s_${layerId.replace(/[^\w-]/g, "_")}`;
    const stroke = layer?.color ?? "#ffffff";
    const fillAlpha = layer?.fillAlpha ?? 0.25;
    styles.push(
      `<Style id="${styleId}"><LineStyle><color>${kmlColor(stroke, 1)}</color><width>${Math.max(1, layer?.lineWidth ?? 2)}</width></LineStyle>` +
        `<PolyStyle><color>${kmlColor(layer?.fillColor ?? stroke, fillAlpha)}</color></PolyStyle>` +
        `<IconStyle><color>${kmlColor(stroke, 1)}</color><scale>0.7</scale></IconStyle><LabelStyle><scale>0.7</scale></LabelStyle></Style>`,
    );

    const placemarks: string[] = [];
    for (const entity of project.entities) {
      if (entity.layerId !== layerId) continue;
      if (entity.type === "point") {
        placemarks.push(
          `<Placemark><name>${escapeXml(entity.label ?? "")}</name><styleUrl>#${styleId}</styleUrl>` +
            `<Point><coordinates>${lonLat(entity.x, entity.y, entity.z)}</coordinates></Point></Placemark>`,
        );
      } else if (entity.type === "line") {
        placemarks.push(
          `<Placemark><styleUrl>#${styleId}</styleUrl><LineString><tessellate>1</tessellate><coordinates>` +
            `${lonLat(entity.start.x, entity.start.y, entity.start.z)} ${lonLat(entity.end.x, entity.end.y, entity.end.z)}` +
            `</coordinates></LineString></Placemark>`,
        );
      } else if (entity.vertices.length >= 2) {
        const coords = entity.vertices.map((v) => lonLat(v.x, v.y, v.z));
        const name = entity.lote?.numero != null
          ? `${entity.lote.quadra ? `Q${entity.lote.quadra} ` : ""}L${entity.lote.numero}`
          : (entity.name ?? "");
        const head = `<Placemark><name>${escapeXml(name)}</name>${loteDescription(entity)}<styleUrl>#${styleId}</styleUrl>`;
        if (entity.closed && entity.vertices.length >= 3) {
          placemarks.push(
            `${head}<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>` +
              `${[...coords, coords[0]].join(" ")}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`,
          );
        } else {
          placemarks.push(
            `${head}<LineString><tessellate>1</tessellate><coordinates>${coords.join(" ")}</coordinates></LineString></Placemark>`,
          );
        }
      }
    }

    if (placemarks.length > 0) {
      folders.push(
        `<Folder><name>${escapeXml(layer?.name ?? layerId)}</name><visibility>${layer?.visible === false ? 0 : 1}</visibility>\n${placemarks.join("\n")}\n</Folder>`,
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>${escapeXml(project.name)}</name>
${styles.join("\n")}
${folders.join("\n")}
</Document>
</kml>`;
}

export function exportCadProjectKmz(project: CadProject): Uint8Array<ArrayBuffer> {
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
