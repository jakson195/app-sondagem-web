import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zipSync, strToU8 } from "fflate";
import { createCadGeorefContext, latLonToVertexGeoref } from "./georef";
import {
  kmlPolygonVerticesFromFixture,
  parseKmlCoordinateTuples,
  parseKmlToCadGeoms,
  parseKmzBufferToCadGeoms,
} from "./import-kml-kmz";

const POLYGON_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<Placemark>
  <name>Quadra 01</name>
  <Polygon>
    <outerBoundaryIs>
      <LinearRing>
        <coordinates>
          -46.6333,-23.5505,0
          -46.6320,-23.5505,0
          -46.6320,-23.5490,0
          -46.6333,-23.5490,0
          -46.6333,-23.5505,0
        </coordinates>
      </LinearRing>
    </outerBoundaryIs>
  </Polygon>
</Placemark>
<Placemark>
  <name>Eixo</name>
  <LineString>
    <coordinates>-46.6333,-23.5505,0 -46.6320,-23.5490,10</coordinates>
  </LineString>
</Placemark>
<Placemark>
  <name>Marco</name>
  <Point>
    <coordinates>-46.6333,-23.5505,12</coordinates>
  </Point>
</Placemark>
</Document>
</kml>`;

describe("KML/KMZ para vértices CAD", () => {
  it("converte polígono lat/lon em vértices UTM", () => {
    const georef = createCadGeorefContext(23);
    const verts = kmlPolygonVerticesFromFixture(POLYGON_KML, georef);
    assert.equal(verts.length, 4);
    const expected = latLonToVertexGeoref(-23.5505, -46.6333, 0, georef);
    assert.ok(Math.abs(verts[0]!.x - expected.x) < 1e-6);
    assert.ok(Math.abs(verts[0]!.y - expected.y) < 1e-6);
    assert.ok(verts[0]!.x > 100_000);
    assert.ok(verts[0]!.y > 1_000_000);
  });

  it("lê LineString e Point no mesmo KML", () => {
    const georef = createCadGeorefContext(23);
    const parsed = parseKmlToCadGeoms(POLYGON_KML, georef);
    const line = parsed.geoms.find((g) => g.kind === "polyline" && !g.closed);
    const point = parsed.geoms.find((g) => g.kind === "point");
    assert.ok(line && line.kind === "polyline");
    assert.equal(line.vertices.length, 2);
    assert.equal(line.vertices[1]?.z, 10);
    assert.ok(point && point.kind === "point");
    assert.equal(point.label, "Marco");
    assert.equal(point.z, 12);
  });

  it("descompacta KMZ e lê o polígono interno", () => {
    const georef = createCadGeorefContext(23);
    const kmz = zipSync({ "doc.kml": strToU8(POLYGON_KML) });
    const parsed = parseKmzBufferToCadGeoms(kmz.buffer.slice(kmz.byteOffset, kmz.byteOffset + kmz.byteLength), georef);
    assert.equal(parsed.source, "kmz");
    const poly = parsed.geoms.find((g) => g.kind === "polyline" && g.closed);
    assert.ok(poly && poly.kind === "polyline");
    assert.equal(poly.vertices.length, 4);
    assert.equal(poly.name, "Quadra 01");
  });

  it("interpreta tuples lon,lat,elev", () => {
    const coords = parseKmlCoordinateTuples("-46.6,-23.5,3 -46.59,-23.5");
    assert.equal(coords.length, 2);
    assert.equal(coords[0]?.lng, -46.6);
    assert.equal(coords[0]?.lat, -23.5);
    assert.equal(coords[0]?.elevM, 3);
  });
});
