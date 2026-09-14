import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DRAINAGE_3D_DEFAULT_COVER_M,
  DRAINAGE_3D_DEFAULT_MIN_SLOPE_PCT,
  buildDrainageNetwork3d,
  drainageNetwork3dReadiness,
  formatDrainage3dPipeLabel,
} from "./loteamento-drainage-3d";
import { DRENAGEM_BOCAS_LAYER, DRENAGEM_EMISSARIO_LAYER, DRENAGEM_PV_LAYER, DRENAGEM_TUBOS_LAYER } from "./loteamento-drainage";
import type { CadPointEntity, CadPolylineEntity, CadProject } from "./types";

function project(entities: CadProject["entities"]): CadProject {
  return {
    name: "Drenagem 3D",
    crs: "EPSG:31982",
    layers: [
      { id: "loteamento_vias", name: "VIAS", color: "#64748b", visible: true, locked: false },
      { ...DRENAGEM_PV_LAYER },
      { ...DRENAGEM_BOCAS_LAYER },
      { ...DRENAGEM_TUBOS_LAYER },
      { ...DRENAGEM_EMISSARIO_LAYER },
    ],
    entities,
  };
}

function pv(
  id: string,
  x: number,
  y: number,
  opts: {
    code?: string;
    kind?: "pv" | "outfall" | "inlet";
    groundZ?: number;
    invertZ?: number;
    z?: number;
    layerId?: string;
  } = {},
): CadPointEntity {
  const kind = opts.kind ?? "pv";
  const layerId =
    opts.layerId ??
    (kind === "outfall" ? DRENAGEM_EMISSARIO_LAYER.id : kind === "inlet" ? DRENAGEM_BOCAS_LAYER.id : DRENAGEM_PV_LAYER.id);
  const drainage =
    opts.groundZ == null && opts.invertZ == null && opts.code == null && opts.kind == null
      ? undefined
      : {
          kind,
          code: opts.code ?? id.toUpperCase(),
          groundZ: opts.groundZ,
          invertZ: opts.invertZ,
          coverDepthM:
            opts.groundZ != null && opts.invertZ != null ? opts.groundZ - opts.invertZ : undefined,
        };
  return {
    id,
    type: "point",
    layerId,
    x,
    y,
    z: opts.z ?? opts.groundZ ?? 0,
    label: opts.code,
    drainage,
  };
}

function pipe(
  id: string,
  from: CadPointEntity,
  to: CadPointEntity,
  opts: {
    diameterMm?: number;
    invertInZ?: number;
    invertOutZ?: number;
    status?: "ok" | "insuficiente" | "velocidade_baixa" | "velocidade_alta";
    code?: string;
  } = {},
): CadPolylineEntity {
  const invertInZ = opts.invertInZ ?? from.drainage?.invertZ ?? from.z;
  const invertOutZ = opts.invertOutZ ?? to.drainage?.invertZ ?? to.z;
  const lengthM = Math.hypot(to.x - from.x, to.y - from.y);
  return {
    id,
    type: "polyline",
    layerId: DRENAGEM_TUBOS_LAYER.id,
    closed: false,
    name: opts.code ?? id,
    vertices: [
      { x: from.x, y: from.y, z: invertInZ },
      { x: to.x, y: to.y, z: invertOutZ },
    ],
    drainage: {
      kind: "pipe",
      code: opts.code ?? "TB-01",
      fromPvId: from.id,
      toPvId: to.id,
      lengthM,
      diameterMm: opts.diameterMm ?? 300,
      invertInZ,
      invertOutZ,
      status: opts.status ?? "ok",
    },
  };
}

describe("drainageNetwork3dReadiness", () => {
  it("desabilita sem PVs e sem tubos", () => {
    const ready = drainageNetwork3dReadiness(project([]));
    assert.equal(ready.ok, false);
    assert.equal(ready.pvCount, 0);
    assert.equal(ready.pipeCount, 0);
  });

  it("habilita com PV mesmo sem tubo", () => {
    const ready = drainageNetwork3dReadiness(project([pv("pv1", 0, 0, { code: "PV-01", groundZ: 12, invertZ: 10.8 })]));
    assert.equal(ready.ok, true);
    assert.equal(ready.pvCount, 1);
  });
});

describe("buildDrainageNetwork3d", () => {
  it("usa invert montante/jusante e altura do poço = CT − CF", () => {
    const a = pv("pv1", 100, 200, { code: "PV-01", kind: "pv", groundZ: 12.4, invertZ: 11.0 });
    const b = pv("pv2", 160, 200, { code: "PV-02", kind: "outfall", groundZ: 11.9, invertZ: 10.5 });
    const tb = pipe("tb1", a, b, { diameterMm: 400, invertInZ: 11.0, invertOutZ: 10.5, code: "TB-01" });
    const scene = buildDrainageNetwork3d(project([a, b, tb]));
    assert.ok(scene);
    assert.equal(scene.schematic, false);
    assert.equal(scene.pipes.length, 1);
    const p = scene.pipes[0]!;
    assert.equal(p.start.x, 100);
    assert.equal(p.start.y, 200);
    assert.equal(p.start.z, 11.0);
    assert.equal(p.end.x, 160);
    assert.equal(p.end.y, 200);
    assert.equal(p.end.z, 10.5);
    assert.equal(p.diameterMm, 400);
    assert.ok(Math.abs(p.radiusM - 0.2) < 1e-9);
    assert.equal(p.failed, false);
    assert.equal(p.label, "Ø400");

    const shaft = scene.shafts.find((s) => s.id === "pv1");
    assert.ok(shaft);
    assert.equal(shaft.invertZ, 11.0);
    assert.equal(shaft.groundZ, 12.4);
    assert.ok(Math.abs(shaft.heightM - 1.4) < 1e-9);
    const outfall = scene.shafts.find((s) => s.kind === "outfall");
    assert.ok(outfall);
    assert.equal(outfall.code, "PV-02");
  });

  it("marca tubo em falha hidráulica", () => {
    const a = pv("pv1", 0, 0, { code: "PV-01", groundZ: 12, invertZ: 10.8 });
    const b = pv("pv2", 40, 0, { code: "PV-02", kind: "outfall", groundZ: 11.6, invertZ: 10.4 });
    const tb = pipe("tb1", a, b, { status: "insuficiente", diameterMm: 300 });
    const scene = buildDrainageNetwork3d(project([a, b, tb]));
    assert.equal(scene?.pipes[0]?.failed, true);
  });

  it("boca de lobo vira caixa menor na superfície", () => {
    const bl = pv("bl1", 10, 8, { code: "BL-01", kind: "inlet", groundZ: 12.0, invertZ: 11.4 });
    const scene = buildDrainageNetwork3d(project([bl]));
    assert.ok(scene);
    const inlet = scene.shafts[0]!;
    assert.equal(inlet.kind, "inlet");
    assert.ok(inlet.widthM < 1);
    assert.ok(inlet.depthM < inlet.widthM + 0.01);
    assert.ok(Math.abs(inlet.heightM - 0.6) < 1e-9);
  });

  it("sem cotas Z ainda monta esquema com recobrimento 1,2 m e declividade mínima", () => {
    const a = pv("pv1", 0, 0, { z: 0 });
    const b = pv("pv2", 100, 0, { z: 0, kind: "outfall" });
    a.drainage = { kind: "pv", code: "PV-01" };
    b.drainage = { kind: "outfall", code: "PV-02" };
    const tb: CadPolylineEntity = {
      id: "tb1",
      type: "polyline",
      layerId: DRENAGEM_TUBOS_LAYER.id,
      closed: false,
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 100, y: 0, z: 0 },
      ],
      drainage: {
        kind: "pipe",
        code: "TB-01",
        fromPvId: "pv1",
        toPvId: "pv2",
        lengthM: 100,
        diameterMm: 300,
      },
    };
    const scene = buildDrainageNetwork3d(project([a, b, tb]));
    assert.ok(scene);
    assert.equal(scene.schematic, true);
    assert.equal(scene.coverM, DRAINAGE_3D_DEFAULT_COVER_M);
    const from = scene.shafts.find((s) => s.id === "pv1")!;
    const to = scene.shafts.find((s) => s.id === "pv2")!;
    assert.ok(Math.abs(to.heightM - DRAINAGE_3D_DEFAULT_COVER_M) < 1e-6);
    assert.ok(from.heightM >= DRAINAGE_3D_DEFAULT_COVER_M - 1e-6);
    const p = scene.pipes[0]!;
    const drop = (DRAINAGE_3D_DEFAULT_MIN_SLOPE_PCT / 100) * 100;
    assert.ok(Math.abs(p.start.z - p.end.z - drop) < 1e-6);
    assert.ok(p.start.z > p.end.z);
  });

  it("não quebra com projeto vazio — retorna null", () => {
    assert.equal(buildDrainageNetwork3d(project([])), null);
  });

  it("inclui vias do loteamento como contexto", () => {
    const a = pv("pv1", 5, 5, { code: "PV-01", groundZ: 10, invertZ: 8.8 });
    const via: CadPolylineEntity = {
      id: "via1",
      type: "polyline",
      layerId: "loteamento_vias",
      closed: true,
      vertices: [
        { x: 0, y: 0, z: 10 },
        { x: 40, y: 0, z: 10 },
        { x: 40, y: 12, z: 10 },
        { x: 0, y: 12, z: 10 },
      ],
    };
    const scene = buildDrainageNetwork3d(project([a, via]));
    assert.equal(scene?.streets.length, 1);
    assert.equal(scene?.streets[0]?.outer.length, 4);
  });

  it("formata rótulo de diâmetro", () => {
    assert.equal(formatDrainage3dPipeLabel(300), "Ø300");
    assert.equal(formatDrainage3dPipeLabel(1000), "Ø1000");
  });
});
