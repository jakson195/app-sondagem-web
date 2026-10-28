import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_OSNAP_SETTINGS,
  GEOMETRY_EPSILON,
  SnapEngine,
  SpatialIndex,
  findCenter,
  findEndpoint,
  findExtension,
  findIntersection,
  findMidpoint,
  findNearest,
  findPerpendicular,
  findQuadrant,
  findTangent,
  getSnapPoint,
  parseOsnapType,
  roundSnapCoord,
  type OsnapSettings,
  type OsnapType,
} from "./snap-engine";
import type { CadEntity, CadLineEntity, CadPointEntity, CadPolylineEntity } from "./types";
import { worldToScreen, type CadViewport } from "./viewport";

function vp(span = 100): CadViewport {
  return { minX: 0, maxX: span, minY: 0, maxY: span, width: 200, height: 200, padding: 0 };
}

function line(id: string, x1: number, y1: number, x2: number, y2: number, layerId = "draw"): CadLineEntity {
  return { id, type: "line", layerId, start: { x: x1, y: y1, z: 0 }, end: { x: x2, y: y2, z: 0 } };
}

function poly(
  id: string,
  pts: [number, number][],
  closed = true,
  layerId = "loteamento_lotes",
): CadPolylineEntity {
  return {
    id,
    type: "polyline",
    layerId,
    closed,
    name: id,
    vertices: pts.map(([x, y]) => ({ x, y, z: 0 })),
  };
}

function point(id: string, x: number, y: number): CadPointEntity {
  return { id, type: "point", layerId: "points", x, y, z: 0, label: id };
}

function circle(id: string, cx: number, cy: number, r: number, n = 16): CadPolylineEntity {
  const vertices = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), z: 0 };
  });
  return { id, type: "polyline", layerId: "draw", closed: true, name: id, vertices };
}

function only(type: OsnapType): OsnapSettings {
  const modes = { ...DEFAULT_OSNAP_SETTINGS.modes };
  for (const key of Object.keys(modes) as OsnapType[]) modes[key] = key === type;
  return { ...DEFAULT_OSNAP_SETTINGS, modes, priority: [type] };
}

function snapAt(entities: CadEntity[], x: number, y: number, settings = DEFAULT_OSNAP_SETTINGS, span = 100, reference?: { x: number; y: number; z: number }) {
  const viewport = vp(span);
  const screen = worldToScreen(x, y, viewport);
  return getSnapPoint({
    screen,
    world: { x, y, z: 0 },
    viewport,
    entities,
    index: new SpatialIndex(entities),
    settings,
    reference,
  });
}

describe("SnapEngine geometric snaps", () => {
  it("ENDPOINT de linha e vértice de lote", () => {
    const lote = poly("lote01", [
      [0, 0],
      [20, 0],
      [20, 10],
      [0, 10],
    ]);
    const ln = line("ln1", 0, 0, 10, 0);
    assert.equal(findEndpoint(ln).length, 2);
    const hit = snapAt([ln, lote], 0.2, 0.1);
    assert.equal(hit.snapped, true);
    if (!hit.snapped) return;
    assert.equal(hit.type, "ENDPOINT");
    assert.ok(Math.abs(hit.point.x) < GEOMETRY_EPSILON);
    assert.ok(Math.abs(hit.point.y) < GEOMETRY_EPSILON);
  });

  it("MIDPOINT de segmento", () => {
    const ln = line("ln1", 0, 0, 10, 0);
    const mids = findMidpoint(ln);
    assert.equal(mids[0].x, 5);
    const hit = snapAt([ln], 5.1, 0.2, only("MIDPOINT"));
    assert.equal(hit.snapped, true);
    if (!hit.snapped) return;
    assert.equal(hit.type, "MIDPOINT");
    assert.ok(Math.abs(hit.point.x - 5) < GEOMETRY_EPSILON);
  });

  it("CENTER e QUADRANT de círculo inferido", () => {
    const c = circle("c1", 40, 40, 10);
    const center = findCenter(c)[0];
    assert.ok(center);
    assert.ok(Math.abs(center.x - 40) < 0.3);
    const quads = findQuadrant(c);
    assert.equal(quads.length, 4);
    const hit = snapAt([c], 40.2, 40.1, only("CENTER"));
    assert.equal(hit.snapped, true);
    if (!hit.snapped) return;
    assert.equal(hit.type, "CENTER");
  });

  it("INTERSECTION de duas ruas", () => {
    const a = poly("ruaA", [
      [0, 5],
      [20, 5],
    ], false, "loteamento_vias");
    const b = poly("ruaB", [
      [10, 0],
      [10, 20],
    ], false, "loteamento_vias");
    const hits = findIntersection(a, b);
    assert.ok(hits.some((p) => Math.abs(p.x - 10) < 1e-6 && Math.abs(p.y - 5) < 1e-6));
    const snap = snapAt([a, b], 10.1, 5.1, only("INTERSECTION"));
    assert.equal(snap.snapped, true);
    if (!snap.snapped) return;
    assert.equal(snap.type, "INTERSECTION");
    assert.ok(Math.abs(snap.point.x - 10) < GEOMETRY_EPSILON);
    assert.ok(Math.abs(snap.point.y - 5) < GEOMETRY_EPSILON);
  });

  it("PERPENDICULAR a partir de um ponto de referência", () => {
    const ln = line("ln1", 0, 0, 20, 0);
    const p = findPerpendicular(ln, { x: 7, y: 9, z: 0 });
    assert.ok(p);
    assert.ok(Math.abs(p.x - 7) < 1e-6);
    assert.ok(Math.abs(p.y) < 1e-6);
    const hit = snapAt([ln], 7.1, 0.2, only("PERPENDICULAR"), 100, { x: 7, y: 9, z: 0 });
    assert.equal(hit.snapped, true);
    if (!hit.snapped) return;
    assert.equal(hit.type, "PERPENDICULAR");
  });

  it("TANGENT em círculo", () => {
    const c = circle("c1", 0, 0, 10);
    const pts = findTangent(c, { x: 30, y: 0, z: 0 });
    assert.equal(pts.length, 2);
    const hit = snapAt([c], pts[0].x, pts[0].y, only("TANGENT"), 80, { x: 30, y: 0, z: 0 });
    assert.equal(hit.snapped, true);
    if (!hit.snapped) return;
    assert.equal(hit.type, "TANGENT");
  });

  it("EXTENSION além do endpoint", () => {
    const ln = line("ln1", 0, 0, 10, 0);
    const ext = findExtension(ln, { x: 16, y: 0.2, z: 0 });
    assert.ok(ext);
    assert.ok(Math.abs(ext.point.y) < 0.3);
    const hit = snapAt([ln], 16, 0.15, only("EXTENSION"));
    assert.equal(hit.snapped, true);
    if (!hit.snapped) return;
    assert.equal(hit.type, "EXTENSION");
  });

  it("NEAREST só entra se nenhum snap mais prioritário estiver na tolerância", () => {
    const ln = line("ln1", 0, 0, 10, 0);
    const nearEnd = snapAt([ln], 0.15, 0.1);
    assert.equal(nearEnd.snapped, true);
    if (nearEnd.snapped) assert.equal(nearEnd.type, "ENDPOINT");
    const midAway = snapAt([ln], 4, 3, only("NEAREST"));
    assert.equal(midAway.snapped, true);
    if (midAway.snapped) assert.equal(midAway.type, "NEAREST");
  });

  it("NODE de ponto topográfico e vértice de quadra", () => {
    const node = point("RTK1", 12, 8);
    const quadra = poly(
      "quadraA",
      [
        [0, 0],
        [30, 0],
        [30, 20],
        [0, 20],
      ],
      true,
      "loteamento_quadras",
    );
    const nodeHit = snapAt([node], 12.1, 8.1, only("NODE"));
    assert.equal(nodeHit.snapped, true);
    if (nodeHit.snapped) assert.equal(nodeHit.type, "NODE");
    const corner = snapAt([quadra], 0.1, 0.1);
    assert.equal(corner.snapped, true);
    if (corner.snapped) assert.equal(corner.type, "ENDPOINT");
  });

  it("APPARENT_INTERSECTION de retas que não se cruzam", () => {
    const a = line("a", 0, 0, 10, 0);
    const b = line("b", 5, 4, 5, 10);
    const hits = findIntersection(a, b, true);
    assert.ok(hits.some((p) => Math.abs(p.x - 5) < 1e-6 && Math.abs(p.y) < 1e-6));
    const real = findIntersection(a, b, false);
    assert.equal(real.length, 0);
  });

  it("tolerância em pixels acompanha o zoom", () => {
    const ln = line("ln1", 0, 0, 50, 0);
    const zoomedIn = snapAt([ln], 3, 3, DEFAULT_OSNAP_SETTINGS, 20);
    const zoomedOut = snapAt([ln], 3, 3, DEFAULT_OSNAP_SETTINGS, 4000);
    assert.equal(zoomedIn.snapped, false);
    assert.equal(zoomedOut.snapped, true);
  });

  it("normaliza coordenadas com GEOMETRY_EPSILON", () => {
    assert.equal(roundSnapCoord(100.0000001), 100);
    assert.equal(parseOsnapType("canto"), "ENDPOINT");
    assert.equal(parseOsnapType("perpendicular"), "PERPENDICULAR");
  });

  it("índice espacial ignora TIN e devolve só vizinhos", () => {
    const entities: CadEntity[] = [
      line("keep", 0, 0, 5, 0),
      { ...line("tin1", 1000, 1000, 1001, 1001), layerId: "tin" },
    ];
    const index = new SpatialIndex(entities);
    const nearby = index.query(1, 0, 10);
    assert.ok(nearby.includes("keep"));
    assert.ok(!nearby.includes("tin1"));
  });

  it("resolveNamedSnap usa o motor, não a tela", async () => {
    const { resolveNamedSnap } = await import("./snap-named");
    const street = poly(
      "ruaA",
      [
        [0, 10],
        [20, 10],
      ],
      false,
      "loteamento_vias",
    );
    street.name = "Rua A";
    const project = {
      name: "t",
      crs: "EPSG:31982",
      layers: [{ id: "loteamento_vias", name: "VIAS", color: "#111", visible: true, locked: false }],
      entities: [street, line("ln1", 0, 0, 0, 8)],
    };
    const mid = resolveNamedSnap(project, { type: "MIDPOINT", nome: "Rua A" });
    assert.ok(mid);
    assert.equal(mid?.type, "MIDPOINT");
    assert.ok(Math.abs((mid?.point.x ?? 0) - 10) < 1e-6);
    const perp = resolveNamedSnap(project, {
      type: "PERPENDICULAR",
      nome: "Rua A",
      from: { x: 10, y: 0, z: 0 },
    });
    assert.ok(perp);
    assert.ok(Math.abs((perp?.point.y ?? 0) - 10) < 1e-6);
  });

  it("classe SnapEngine expõe getSnapPoint", () => {
    const entities = [line("ln1", 0, 0, 8, 0)];
    const engine = new SnapEngine(DEFAULT_OSNAP_SETTINGS, new SpatialIndex(entities));
    const viewport = vp();
    const screen = worldToScreen(0, 0, viewport);
    const hit = engine.getSnapPoint({
      screen,
      world: { x: 0.1, y: 0.1, z: 0 },
      viewport,
      entities,
    });
    assert.equal(hit.snapped, true);
    if (hit.snapped) assert.equal(hit.type, "ENDPOINT");
  });
});
