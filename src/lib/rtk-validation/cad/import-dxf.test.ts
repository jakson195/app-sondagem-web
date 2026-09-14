import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAsciiDxf, circleToPolylineVertices } from "./import-dxf";

const SAMPLE_DXF = `0
SECTION
2
HEADER
9
$INSBASE
10
0.0
20
0.0
30
0.0
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
0
LAYER
2
LOTE
62
1
0
LAYER
2
EIXO
62
5
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
LOTE
90
4
70
1
10
0
20
0
10
10
20
0
10
10
20
5
10
0
20
5
0
LINE
8
EIXO
10
0
20
0
30
0
11
20
21
0
31
0
0
POLYLINE
8
LOTE
70
0
0
VERTEX
8
LOTE
10
1
20
1
30
0
0
VERTEX
8
LOTE
10
2
20
1
30
0
0
VERTEX
8
LOTE
10
3
20
2
30
0
0
SEQEND
0
CIRCLE
8
EIXO
10
5
20
5
30
0
40
2
0
TEXT
8
LOTE
10
0
20
6
30
0
1
Quadra A
0
ENDSEC
0
EOF
`;

describe("parseAsciiDxf", () => {
  it("lê LWPOLYLINE fechada, LINE, POLYLINE, CIRCLE e TEXT com camadas", () => {
    const parsed = parseAsciiDxf(SAMPLE_DXF);
    assert.equal(parsed.source, "dxf");
    assert.ok(parsed.layers.some((l) => l.name === "LOTE"));
    assert.ok(parsed.layers.some((l) => l.name === "EIXO"));

    const lw = parsed.geoms.find((g) => g.kind === "polyline" && g.closed && g.layer === "LOTE");
    assert.ok(lw && lw.kind === "polyline");
    assert.equal(lw.vertices.length, 4);
    assert.equal(lw.vertices[0]?.x, 0);
    assert.equal(lw.vertices[1]?.x, 10);
    assert.equal(lw.vertices[2]?.y, 5);

    const line = parsed.geoms.find((g) => g.kind === "line" && g.layer === "EIXO");
    assert.ok(line && line.kind === "line");
    assert.equal(line.end.x, 20);

    const poly = parsed.geoms.find(
      (g) => g.kind === "polyline" && !g.closed && g.layer === "LOTE" && g.vertices.length === 3,
    );
    assert.ok(poly && poly.kind === "polyline");
    assert.equal(poly.vertices[2]?.x, 3);

    const circle = parsed.geoms.find((g) => g.kind === "polyline" && g.closed && g.layer === "EIXO");
    assert.ok(circle && circle.kind === "polyline");
    assert.equal(circle.vertices.length, 32);
    const r = Math.hypot((circle.vertices[0]?.x ?? 0) - 5, (circle.vertices[0]?.y ?? 0) - 5);
    assert.ok(Math.abs(r - 2) < 1e-6);

    const text = parsed.geoms.find((g) => g.kind === "point" && g.label === "Quadra A");
    assert.ok(text && text.kind === "point");
    assert.equal(text.y, 6);
  });

  it("aproxima círculo como polilinha fechada", () => {
    const verts = circleToPolylineVertices(0, 0, 0, 10, 8);
    assert.equal(verts.length, 8);
    assert.ok(Math.abs(Math.hypot(verts[0]!.x, verts[0]!.y) - 10) < 1e-9);
  });
});
