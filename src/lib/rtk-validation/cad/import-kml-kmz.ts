import { parseKmzBuffer } from "./kml-io";
import {
  createCadGeorefContext,
  detectCadGeorefFromProject,
  latLonToVertexGeoref,
  type CadGeorefContext,
} from "./georef";
import { utmZoneFromLongitude } from "./utm-zone";
import type { CadProject, CadVertex } from "./types";
import type { ImportedCadDrawing, ImportedCadGeom, ImportedCadLayer } from "./import-drawing-types";

export type KmlLatLon = { lat: number; lng: number; elevM?: number };

const KML_LAYER: ImportedCadLayer = { name: "KML", color: "#38bdf8" };

function tagBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[\\w]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w]+:)?${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1] ?? "");
  }
  return out;
}

function firstTagText(xml: string, tag: string): string {
  const blocks = tagBlocks(xml, tag);
  return (blocks[0] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
}

export function parseKmlCoordinateTuples(text: string): KmlLatLon[] {
  const out: KmlLatLon[] = [];
  const chunks = text.trim().split(/\s+/).filter(Boolean);
  for (const chunk of chunks) {
    const parts = chunk.split(",").map((s) => Number(s.trim()));
    const lng = parts[0];
    const lat = parts[1];
    const elev = parts[2];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({
      lng: lng!,
      lat: lat!,
      elevM: Number.isFinite(elev) ? elev : undefined,
    });
  }
  return out;
}

function dropClosingDuplicate(coords: KmlLatLon[]): KmlLatLon[] {
  if (coords.length < 2) return coords;
  const a = coords[0]!;
  const b = coords[coords.length - 1]!;
  if (Math.abs(a.lat - b.lat) < 1e-12 && Math.abs(a.lng - b.lng) < 1e-12) {
    return coords.slice(0, -1);
  }
  return coords;
}

function coordsToVertices(coords: KmlLatLon[], georef: CadGeorefContext): CadVertex[] {
  return coords.map((c) => latLonToVertexGeoref(c.lat, c.lng, c.elevM ?? 0, georef));
}

export function firstKmlLatLon(kml: string): KmlLatLon | null {
  const blocks = tagBlocks(kml, "coordinates");
  for (const block of blocks) {
    const coords = parseKmlCoordinateTuples(block);
    if (coords[0]) return coords[0];
  }
  return null;
}

export function resolveKmlImportGeoref(project: CadProject, kml: string): CadGeorefContext {
  const current = detectCadGeorefFromProject(project);
  if (current.isGeoreferenced) return current;
  const first = firstKmlLatLon(kml);
  const zone = first ? utmZoneFromLongitude(first.lng) : 23;
  return createCadGeorefContext(zone);
}

function placemarkGeoms(pmXml: string, georef: CadGeorefContext, name: string): ImportedCadGeom[] {
  const geoms: ImportedCadGeom[] = [];
  const layer = KML_LAYER.name;

  for (const poly of tagBlocks(pmXml, "Polygon")) {
    const rings = tagBlocks(poly, "coordinates");
    const outer = rings[0] ? parseKmlCoordinateTuples(rings[0]) : [];
    const verts = coordsToVertices(dropClosingDuplicate(outer), georef);
    if (verts.length >= 3) {
      geoms.push({ kind: "polyline", layer, vertices: verts, closed: true, name: name || undefined });
    }
  }

  for (const line of tagBlocks(pmXml, "LineString")) {
    const raw = firstTagText(line, "coordinates");
    const verts = coordsToVertices(parseKmlCoordinateTuples(raw), georef);
    if (verts.length >= 2) {
      geoms.push({ kind: "polyline", layer, vertices: verts, closed: false, name: name || undefined });
    }
  }

  for (const point of tagBlocks(pmXml, "Point")) {
    const raw = firstTagText(point, "coordinates");
    const c = parseKmlCoordinateTuples(raw)[0];
    if (!c) continue;
    const v = latLonToVertexGeoref(c.lat, c.lng, c.elevM ?? 0, georef);
    geoms.push({ kind: "point", layer, x: v.x, y: v.y, z: v.z, label: name || undefined });
  }

  return geoms;
}

export function parseKmlToCadGeoms(kml: string, georef: CadGeorefContext): ImportedCadDrawing {
  const warnings: string[] = [];
  if (!kml.trim()) {
    return { geoms: [], layers: [], warnings: ["KML vazio."], source: "kml" };
  }

  const geoms: ImportedCadGeom[] = [];
  const placemarks = tagBlocks(kml, "Placemark");
  if (placemarks.length === 0) {
    geoms.push(...placemarkGeoms(kml, georef, ""));
  } else {
    placemarks.forEach((pm, i) => {
      const name = firstTagText(pm, "name") || `Placemark ${i + 1}`;
      geoms.push(...placemarkGeoms(pm, georef, name));
    });
  }

  if (geoms.length === 0) {
    warnings.push("Nenhum Polygon, LineString ou Point encontrado no KML.");
  }

  return {
    geoms,
    layers: geoms.length ? [{ ...KML_LAYER }] : [],
    warnings,
    source: "kml",
  };
}

export function parseKmzBufferToCadGeoms(
  buffer: ArrayBuffer,
  georef: CadGeorefContext,
): ImportedCadDrawing {
  const { kml, warnings } = parseKmzBuffer(buffer);
  if (!kml) {
    return { geoms: [], layers: [], warnings: warnings.length ? warnings : ["KMZ sem arquivo KML interno."], source: "kmz" };
  }
  const parsed = parseKmlToCadGeoms(kml, georef);
  return {
    ...parsed,
    source: "kmz",
    warnings: [...warnings, ...parsed.warnings],
  };
}

export function kmlPolygonVerticesFromFixture(
  kml: string,
  georef: CadGeorefContext,
): CadVertex[] {
  const parsed = parseKmlToCadGeoms(kml, georef);
  const poly = parsed.geoms.find((g) => g.kind === "polyline" && g.closed);
  return poly && poly.kind === "polyline" ? poly.vertices : [];
}
