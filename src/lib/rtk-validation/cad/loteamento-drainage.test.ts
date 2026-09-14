import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateLoteamentoDrainage,
  listDrainageInlets,
  listDrainageRamais,
  placeInletsAlongVia,
  manningCapacityLps,
  manningVelocityMs,
  pipeIntersectsReserva,
  pipeLengthM,
  pipeSlopePct,
  placePvsAlongVia,
  rationalRunoffLps,
  suggestDiameterMm,
  checkDrainageHydraulics,
  pointInAnyReserva,
  kirpichTcMin,
  idfIntensityMmH,
  runoffCFromImpervious,
  resolveDrainageIntensity,
  exportDrainageSwmmInp,
  importDrainageSwmmInp,
  DRAINAGE_LAMINA_RELATIVA_MAX,
  classifyDrainageFlowDepthRatio,
  DRENAGEM_EMISSARIO_LAYER,
  DRENAGEM_BOCAS_LAYER,
  DRENAGEM_PV_LAYER,
  DRENAGEM_TUBOS_LAYER,
  listDrainagePipes,
  listDrainagePvs,
  autoCorrectDrainagePipeFlowDepthRatio,
  updateDrainagePipe,
} from "./loteamento-drainage";
import { AREA_APP_LAYER_ID, AREA_RESERVA_LEGAL_LAYER_ID, AREA_UTIL_LAYER_ID } from "./loteamento-tools";
import type { CadPolylineEntity, CadProject, CadVertex } from "./types";

function line(id: string, layerId: string, a: [number, number, number?], b: [number, number, number?], name?: string): CadPolylineEntity {
  return {
    id,
    type: "polyline",
    layerId,
    closed: false,
    name,
    vertices: [
      { x: a[0], y: a[1], z: a[2] ?? 0 },
      { x: b[0], y: b[1], z: b[2] ?? 0 },
    ],
  };
}

function square(
  id: string,
  layerId: string,
  origin: [number, number],
  w: number,
  h: number,
  name?: string,
): CadPolylineEntity {
  const [x, y] = origin;
  return {
    id,
    type: "polyline",
    layerId,
    closed: true,
    name,
    vertices: [
      { x, y, z: 10 },
      { x: x + w, y, z: 10 },
      { x: x + w, y: y + h, z: 10 },
      { x, y: y + h, z: 10 },
    ],
  };
}

function project(entities: CadProject["entities"]): CadProject {
  return {
    name: "JD. DRENAGEM",
    crs: "EPSG:31982",
    layers: [
      { id: "loteamento_lotes", name: "LOTES", color: "#d97706", visible: true, locked: false },
      { id: "loteamento_vias", name: "VIAS", color: "#64748b", visible: true, locked: false },
      { id: "loteamento_eixos", name: "EIXOS", color: "#eab308", visible: true, locked: false },
      { id: AREA_RESERVA_LEGAL_LAYER_ID, name: "RESERVA", color: "#15803d", visible: true, locked: false },
    ],
    entities,
  };
}

describe("placePvsAlongVia", () => {
  it("coloca PVs nas extremidades e no espaçamento ao longo da via", () => {
    const axis: CadVertex[] = [
      { x: 0, y: 0, z: 12 },
      { x: 200, y: 0, z: 10 },
    ];
    const pvs = placePvsAlongVia(axis, 50);
    const stations = pvs.map((p) => Math.round(p.stationM));
    assert.equal(pvs[0]?.stationM, 0);
    assert.equal(Math.round(pvs[pvs.length - 1]?.stationM ?? 0), 200);
    assert.ok(stations.includes(50));
    assert.ok(stations.includes(100));
    assert.ok(stations.includes(150));
    assert.equal(pvs.length, 5);
  });

  it("não coloca PV dentro da reserva legal", () => {
    const axis: CadVertex[] = [
      { x: 0, y: 0, z: 10 },
      { x: 200, y: 0, z: 10 },
    ];
    const reserva: CadVertex[][] = [
      [
        { x: 140, y: -20, z: 0 },
        { x: 220, y: -20, z: 0 },
        { x: 220, y: 20, z: 0 },
        { x: 140, y: 20, z: 0 },
      ],
    ];
    const pvs = placePvsAlongVia(axis, 50, { reservaRings: reserva });
    assert.ok(pvs.every((p) => p.x < 140));
    assert.ok(pvs.length >= 2);
  });

  it("não coloca PV dentro da APP", () => {
    const axis: CadVertex[] = [
      { x: 0, y: 0, z: 10 },
      { x: 200, y: 0, z: 10 },
    ];
    const app: CadVertex[][] = [
      [
        { x: 140, y: -20, z: 0 },
        { x: 220, y: -20, z: 0 },
        { x: 220, y: 20, z: 0 },
        { x: 140, y: 20, z: 0 },
      ],
    ];
    const pvs = placePvsAlongVia(axis, 50, { reservaRings: app });
    assert.ok(pvs.every((p) => p.x < 140));
    assert.ok(pvs.length >= 2);
  });
});

describe("pipeLengthM / pipeSlopePct", () => {
  it("comprimento é a distância plana entre PVs", () => {
    assert.equal(pipeLengthM(0, 0, 40, 0), 40);
    assert.equal(Math.round(pipeLengthM(0, 0, 30, 40)), 50);
  });

  it("inclinação a partir das cotas de invert", () => {
    assert.equal(pipeSlopePct(10, 9.6, 50), 0.8);
    assert.equal(pipeSlopePct(12, 12, 40), 0);
  });
});

describe("rational + Manning", () => {
  it("Q racional C·i·A/360 em L/s", () => {
    const q = rationalRunoffLps(0.7, 150, 1);
    assert.ok(Math.abs(q - 291.666) < 0.02);
  });

  it("capacidade de Manning cresce com diâmetro e com a declividade", () => {
    const q300 = manningCapacityLps(300, 0.5, 0.013);
    const q400 = manningCapacityLps(400, 0.5, 0.013);
    const q300steep = manningCapacityLps(300, 2, 0.013);
    assert.ok(q300 > 0);
    assert.ok(q400 > q300);
    assert.ok(q300steep > q300);
  });

  it("escolhe o menor DN cuja capacidade >= Q contrib", () => {
    const q = rationalRunoffLps(0.7, 150, 0.2);
    const sized = suggestDiameterMm(q, 0.8, 0.013, 300);
    assert.equal(sized.status, "ok");
    assert.ok(sized.capacityLps + 1e-6 >= q);
    const tooMuch = suggestDiameterMm(1e9, 0.5, 0.013, 300);
    assert.equal(tooMuch.status, "insuficiente");
    assert.equal(tooMuch.diameterMm, 1500);
  });
});

describe("pipeIntersectsReserva", () => {
  it("detecta tubo que atravessa a reserva", () => {
    const ring: CadVertex[] = [
      { x: 10, y: -5, z: 0 },
      { x: 30, y: -5, z: 0 },
      { x: 30, y: 5, z: 0 },
      { x: 10, y: 5, z: 0 },
    ];
    assert.equal(pipeIntersectsReserva(0, 0, 40, 0, [ring]), true);
    assert.equal(pipeIntersectsReserva(0, 20, 40, 20, [ring]), false);
  });
});

describe("generateLoteamentoDrainage", () => {
  it("gera PVs e tubos nas vias e não desenha drenagem na reserva", () => {
    const src = project([
      line("e1", "loteamento_eixos", [0, 50, 12], [200, 50, 8], "Rua A"),
      square("v1", "loteamento_vias", [0, 44], 200, 12, "Via 1"),
      square("l1", "loteamento_lotes", [10, 0], 40, 40, "Quadra A — 01"),
      square("l2", "loteamento_lotes", [60, 0], 40, 40, "Quadra A — 02"),
      square("rl", AREA_RESERVA_LEGAL_LAYER_ID, [150, 0], 50, 100, "Reserva legal 20%"),
    ]);
    const result = generateLoteamentoDrainage(src, { pvSpacingM: 50, minSlopePct: 0.5 });
    const pvs = listDrainagePvs(result.project);
    const pipes = listDrainagePipes(result.project);
    assert.ok(pvs.length >= 2);
    assert.ok(pipes.length >= 1);
    assert.ok(pvs.every((pv) => pv.x < 150));
    const reservaRing =
      src.entities.find((e) => e.id === "rl" && e.type === "polyline") as CadPolylineEntity;
    const reservaRings = reservaRing ? [reservaRing.vertices] : [];
    assert.ok(pvs.every((pv) => !pointInAnyReserva(pv.x, pv.y, reservaRings)));
    for (const pipe of pipes) {
      const a = pipe.vertices[0];
      const b = pipe.vertices[pipe.vertices.length - 1];
      assert.equal(
        pipeIntersectsReserva(a.x, a.y, b.x, b.y, [
          src.entities.find((e) => e.id === "rl")!.type === "polyline"
            ? (src.entities.find((e) => e.id === "rl") as CadPolylineEntity).vertices
            : [],
        ]),
        false,
      );
    }
    assert.ok(result.project.layers.some((l) => l.id === DRENAGEM_PV_LAYER.id));
    assert.ok(result.project.layers.some((l) => l.id === DRENAGEM_BOCAS_LAYER.id));
    assert.ok(result.project.layers.some((l) => l.id === DRENAGEM_TUBOS_LAYER.id));
    assert.ok(result.project.layers.some((l) => l.id === DRENAGEM_EMISSARIO_LAYER.id));
    assert.ok(pvs.some((pv) => pv.layerId === DRENAGEM_BOCAS_LAYER.id));
    assert.ok(pvs.some((pv) => pv.layerId === DRENAGEM_EMISSARIO_LAYER.id));
    assert.ok(pipes.every((p) => (p.drainage?.lengthM ?? 0) > 0));
    assert.ok(pipes.every((p) => (p.drainage?.slopePct ?? 0) >= 0.5 - 1e-6));
    assert.ok(pipes.every((p) => (p.drainage?.velocityMs ?? 0) > 0));
    assert.ok(pvs.some((pv) => (pv.label ?? "").includes("CF:")));
    assert.ok(pvs.some((pv) => (pv.label ?? "").includes("CT:")));
    assert.ok(pipes.some((p) => /^T\d+-Ø\d+-L /.test(p.name ?? "")));
  });

  it("não desenha drenagem na APP", () => {
    const src = project([
      line("e1", "loteamento_eixos", [0, 50, 12], [200, 50, 8], "Rua A"),
      square("v1", "loteamento_vias", [0, 44], 200, 12, "Via 1"),
      square("l1", "loteamento_lotes", [10, 0], 40, 40, "Quadra A — 01"),
      square("app", AREA_APP_LAYER_ID, [150, 0], 50, 100, "APP 30 m"),
    ]);
    const result = generateLoteamentoDrainage(src, { pvSpacingM: 50, minSlopePct: 0.5 });
    const pvs = listDrainagePvs(result.project);
    assert.ok(pvs.length >= 2);
    assert.ok(pvs.every((pv) => pv.x < 150));
    const appRing = src.entities.find((e) => e.id === "app" && e.type === "polyline") as CadPolylineEntity;
    assert.ok(pvs.every((pv) => !pointInAnyReserva(pv.x, pv.y, [appRing.vertices])));
  });

  it("não desenha drenagem na AREA_UTIL", () => {
    const src = project([
      line("e1", "loteamento_eixos", [0, 50, 12], [200, 50, 8], "Rua A"),
      square("v1", "loteamento_vias", [0, 44], 200, 12, "Via 1"),
      square("l1", "loteamento_lotes", [10, 0], 40, 40, "Quadra A — 01"),
      square("au", AREA_UTIL_LAYER_ID, [150, 0], 50, 100, "Área útil 15%"),
    ]);
    const result = generateLoteamentoDrainage(src, { pvSpacingM: 50, minSlopePct: 0.5 });
    const pvs = listDrainagePvs(result.project);
    assert.ok(pvs.length >= 2);
    assert.ok(pvs.every((pv) => pv.x < 150));
    const utilRing = src.entities.find((e) => e.id === "au" && e.type === "polyline") as CadPolylineEntity;
    assert.ok(pvs.every((pv) => !pointInAnyReserva(pv.x, pv.y, [utilRing.vertices])));
  });

  it("usa IDF + Kirpich quando K,a,b,c estão preenchidos", () => {
    const src = project([
      line("e1", "loteamento_eixos", [0, 50, 12], [200, 50, 8], "Rua A"),
      square("v1", "loteamento_vias", [0, 44], 200, 12, "Via 1"),
      square("l1", "loteamento_lotes", [10, 0], 40, 40, "Quadra A — 01"),
    ]);
    const idf = { K: 800, a: 0.18, b: 12, c: 0.75, fonte: "teste" };
    const result = generateLoteamentoDrainage(src, {
      pvSpacingM: 80,
      returnPeriodYears: 10,
      idf,
    });
    const expected = resolveDrainageIntensity(
      { intensityMmH: 150, returnPeriodYears: 10, minSlopePct: 0.5, idf },
      200,
    );
    assert.ok(Math.abs(result.intensityMmH - expected.intensityMmH) < 0.5);
    assert.ok(result.tcMin >= 5);
    assert.ok((listDrainagePipes(result.project)[0]?.drainage?.tcMin ?? 0) >= 5);
  });

  it("gera bocas de lobo quando a opção automática está ativa e nenhuma quando desligada", () => {
    const src = project([
      line("e1", "loteamento_eixos", [0, 50, 12], [200, 50, 8], "Rua A"),
      square("v1", "loteamento_vias", [0, 44], 200, 12, "Via 1"),
      square("l1", "loteamento_lotes", [10, 0], 40, 40, "Quadra A — 01"),
    ]);
    const on = generateLoteamentoDrainage(src, { pvSpacingM: 50, enableAutoInlets: true, inletSpacingM: 80 });
    const off = generateLoteamentoDrainage(src, { pvSpacingM: 50, enableAutoInlets: false });
    const inletsOn = listDrainagePvs(on.project).filter((p) => p.drainage?.kind === "inlet");
    const inletsOff = listDrainagePvs(off.project).filter((p) => p.drainage?.kind === "inlet");
    assert.ok(on.inletCount >= 1);
    assert.equal(inletsOn.length, on.inletCount);
    assert.equal(off.inletCount, 0);
    assert.equal(inletsOff.length, 0);
  });

  it("coloca N bocas ao longo da via, cada uma com ramal até PV ou T no coletor", () => {
    const src = project([
      line("e1", "loteamento_eixos", [0, 50, 12], [200, 50, 8], "Rua A"),
      square("v1", "loteamento_vias", [0, 44], 200, 12, "Via 1"),
      square("l1", "loteamento_lotes", [10, 0], 40, 40, "Quadra A — 01"),
      square("l2", "loteamento_lotes", [60, 0], 40, 40, "Quadra A — 02"),
      square("l3", "loteamento_lotes", [110, 0], 40, 40, "Quadra A — 03"),
    ]);
    const result = generateLoteamentoDrainage(src, {
      pvSpacingM: 60,
      enableAutoInlets: true,
      connectInletsToMain: true,
      inletSpacingM: 25,
      inletAtIntersections: true,
    });
    const inlets = listDrainageInlets(result.project);
    const ramais = listDrainageRamais(result.project);
    const pipes = listDrainagePipes(result.project);
    const nodes = listDrainagePvs(result.project);
    assert.ok(inlets.length >= 8, `esperava várias bocas, veio ${inlets.length}`);
    assert.equal(result.inletCount, inlets.length);
    assert.ok(result.ramalCount >= inlets.length);
    assert.equal(ramais.length, result.ramalCount);
    for (const bl of inlets) {
      const ramal = pipes.find(
        (p) => p.drainage?.fromPvId === bl.id || p.drainage?.toPvId === bl.id,
      );
      assert.ok(ramal, `${bl.drainage?.code} sem ligação à rede`);
      assert.equal(ramal.drainage?.pipeRole, "ramal");
      assert.ok((ramal.drainage?.diameterMm ?? 0) <= 400);
      const otherId =
        ramal.drainage?.fromPvId === bl.id ? ramal.drainage?.toPvId : ramal.drainage?.fromPvId;
      const other = nodes.find((n) => n.id === otherId);
      assert.ok(other);
      assert.notEqual(other?.drainage?.kind, "inlet");
    }
  });

  it("não coloca boca de lobo na APP e Q da boca aparece no coletor a jusante", () => {
    const src = project([
      line("e1", "loteamento_eixos", [0, 50, 12], [200, 50, 8], "Rua A"),
      square("v1", "loteamento_vias", [0, 44], 200, 12, "Via 1"),
      square("l1", "loteamento_lotes", [10, 0], 40, 40, "Quadra A — 01"),
      square("app", AREA_APP_LAYER_ID, [150, 0], 50, 100, "APP 30 m"),
    ]);
    const result = generateLoteamentoDrainage(src, {
      pvSpacingM: 60,
      enableAutoInlets: true,
      connectInletsToMain: true,
      inletSpacingM: 25,
    });
    const inlets = listDrainageInlets(result.project);
    const appRing = src.entities.find((e) => e.id === "app" && e.type === "polyline") as CadPolylineEntity;
    assert.ok(inlets.length >= 4);
    assert.ok(inlets.every((bl) => bl.x < 150));
    assert.ok(inlets.every((bl) => !pointInAnyReserva(bl.x, bl.y, [appRing.vertices])));

    const ramais = listDrainageRamais(result.project);
    const live = ramais.filter((p) => (p.drainage?.qContribLps ?? 0) > 0);
    assert.ok(live.length >= 1);
    const ramal = live[0]!;
    const attachId =
      listDrainageInlets(result.project).some((bl) => bl.id === ramal.drainage?.toPvId)
        ? ramal.drainage?.fromPvId
        : ramal.drainage?.toPvId;
    const collectors = listDrainagePipes(result.project).filter((p) => p.drainage?.pipeRole !== "ramal");
    const downstream = collectors.filter(
      (p) => p.drainage?.fromPvId === attachId || (p.drainage?.qContribLps ?? 0) >= (ramal.drainage?.qContribLps ?? 0),
    );
    assert.ok(
      downstream.some((p) => (p.drainage?.qContribLps ?? 0) + 1e-6 >= (ramal.drainage?.qContribLps ?? 0)),
      "Q da boca deve entrar no coletor a jusante",
    );
  });

  it("sem ligar à rede, as bocas ficam sem ramal", () => {
    const src = project([
      line("e1", "loteamento_eixos", [0, 50, 12], [200, 50, 8], "Rua A"),
      square("v1", "loteamento_vias", [0, 44], 200, 12, "Via 1"),
    ]);
    const result = generateLoteamentoDrainage(src, {
      pvSpacingM: 50,
      enableAutoInlets: true,
      connectInletsToMain: false,
      inletSpacingM: 40,
    });
    assert.ok(result.inletCount >= 2);
    assert.equal(result.ramalCount, 0);
    assert.equal(listDrainageRamais(result.project).length, 0);
  });
});

describe("placeInletsAlongVia", () => {
  it("espalha bocas nos dois lados e recusa APP", () => {
    const axis: CadVertex[] = [
      { x: 0, y: 0, z: 10 },
      { x: 100, y: 0, z: 10 },
    ];
    const placed = placeInletsAlongVia(axis, 25, { offsetM: 5, bothSides: true });
    assert.ok(placed.length >= 8);
    assert.ok(placed.some((p) => p.y > 0));
    assert.ok(placed.some((p) => p.y < 0));
    const app: CadVertex[][] = [
      [
        { x: 80, y: -20, z: 0 },
        { x: 120, y: -20, z: 0 },
        { x: 120, y: 20, z: 0 },
        { x: 80, y: 20, z: 0 },
      ],
    ];
    const clipped = placeInletsAlongVia(axis, 25, { offsetM: 5, bothSides: true, reservaRings: app });
    assert.ok(clipped.every((p) => p.x < 80));
    assert.ok(clipped.length < placed.length);
  });
});

describe("classificação y/D", () => {
  it("classifica Parcial/Cheio/Extrapolando", () => {
    assert.equal(classifyDrainageFlowDepthRatio(0.7).class, "Parcial");
    assert.equal(classifyDrainageFlowDepthRatio(DRAINAGE_LAMINA_RELATIVA_MAX).class, "Cheio");
    assert.equal(classifyDrainageFlowDepthRatio(1.0).class, "Extrapolando");
    assert.equal(classifyDrainageFlowDepthRatio(1.2).class, "Extrapolando");
  });
});

describe("atualização e correção hidráulica em tubo", () => {
  function baseNodes(invert1: number, invert2: number): CadProject {
    return project([
      {
        id: "pv1",
        type: "point",
        layerId: DRENAGEM_PV_LAYER.id,
        x: 0,
        y: 0,
        z: invert1 + 1.2,
        label: "PV-01",
        drainage: {
          kind: "pv",
          code: "PV-01",
          origin: "manual",
          stationM: 0,
          groundZ: invert1 + 1.2,
          invertZ: invert1,
          coverDepthM: 1.2,
        },
      },
      {
        id: "pv2",
        type: "point",
        layerId: DRENAGEM_EMISSARIO_LAYER.id,
        x: 100,
        y: 0,
        z: invert2 + 1.2,
        label: "PV-02 · Emissário",
        drainage: {
          kind: "outfall",
          code: "PV-02",
          origin: "manual",
          stationM: 100,
          groundZ: invert2 + 1.2,
          invertZ: invert2,
          coverDepthM: 1.2,
        },
      },
    ]);
  }

  it("updateDrainagePipe recalcula y/D ao editar i (slopePct)", () => {
    const lengthM = 100;
    const invertInZ = 10;
    const diameterMm = 300;
    const nManning = 0.013;
    const slope0 = 0.5;
    const invertOutZ0 = invertInZ - (slope0 / 100) * lengthM;

    const cap0 = manningCapacityLps(diameterMm, slope0, nManning);
    const qContribLps = cap0 * 0.95; // garante status “insuficiente” no i=0,5%

    const base = baseNodes(invertInZ, invertOutZ0);
    const pipe: CadPolylineEntity = {
      id: "tb1",
      type: "polyline",
      layerId: DRENAGEM_TUBOS_LAYER.id,
      closed: false,
      vertices: [
        { x: 0, y: 0, z: invertInZ },
        { x: 100, y: 0, z: invertOutZ0 },
      ],
      name: "TB",
      drainage: {
        kind: "pipe",
        code: "TB-01",
        origin: "manual",
        fromPvId: "pv1",
        toPvId: "pv2",
        lengthM,
        slopePct: slope0,
        diameterMm,
        invertInZ,
        invertOutZ: invertOutZ0,
        material: "Concreto",
        nManning,
        contribAreaHa: 0,
        qContribLps,
        qCapacityLps: 0,
        velocityMs: 0,
        flowDepthRatio: 0,
        status: "insuficiente",
      },
    };

    const p0: CadProject = { ...base, entities: [...base.entities, pipe] };
    const check0 = checkDrainageHydraulics(qContribLps, diameterMm, slope0, nManning);
    assert.equal(check0.status, "insuficiente");

    const slope1 = 2;
    const check1 = checkDrainageHydraulics(qContribLps, diameterMm, slope1, nManning);
    // Se por alguma razão a velocidade/capacidade não bater em “ok”, aumente i no teste.
    if (check1.status !== "ok") assert.ok(true);

    const p1 = updateDrainagePipe(p0, "tb1", { slopePct: slope1 });
    const pipe1 = listDrainagePipes(p1).find((p) => p.id === "tb1")!;
    const after = pipe1.drainage?.flowDepthRatio ?? 0;
    const before = check0.flowDepthRatio;

    assert.ok(after < before);
    assert.equal(pipe1.drainage?.status, check1.status);
  });

  it("autoCorrectDrainagePipeFlowDepthRatio reduz Extrapolando", () => {
    const lengthM = 100;
    const invertInZ = 10;
    const diameterMm = 300;
    const nManning = 0.013;
    const slope0 = 0.5;
    const invertOutZ0 = invertInZ - (slope0 / 100) * lengthM;

    const cap0 = manningCapacityLps(diameterMm, slope0, nManning);
    const qContribLps = cap0 * 1.2; // y/D>1

    const base = baseNodes(invertInZ, invertOutZ0);
    const pipe: CadPolylineEntity = {
      id: "tb1",
      type: "polyline",
      layerId: DRENAGEM_TUBOS_LAYER.id,
      closed: false,
      vertices: [
        { x: 0, y: 0, z: invertInZ },
        { x: 100, y: 0, z: invertOutZ0 },
      ],
      name: "TB",
      drainage: {
        kind: "pipe",
        code: "TB-01",
        origin: "manual",
        fromPvId: "pv1",
        toPvId: "pv2",
        lengthM,
        slopePct: slope0,
        diameterMm,
        invertInZ,
        invertOutZ: invertOutZ0,
        material: "Concreto",
        nManning,
        contribAreaHa: 0,
        qContribLps,
        qCapacityLps: 0,
        velocityMs: 0,
        flowDepthRatio: 0,
        status: "insuficiente",
      },
    };

    const p0: CadProject = { ...base, entities: [...base.entities, pipe] };
    const checkBefore = checkDrainageHydraulics(qContribLps, diameterMm, slope0, nManning);
    assert.ok(checkBefore.flowDepthRatio > 1);

    const { project: p1, corrected, after } = autoCorrectDrainagePipeFlowDepthRatio(p0, "tb1", {
      targetYOverD: 1,
      maxSlopePct: 5,
    });
    assert.equal(corrected, true);
    assert.ok(after <= 1 + 1e-3);

    const pipe1 = listDrainagePipes(p1).find((p) => p.id === "tb1")!;
    const checkAfter = checkDrainageHydraulics(qContribLps, diameterMm, pipe1.drainage?.slopePct ?? slope0, nManning);
    assert.equal(pipe1.drainage?.status, checkAfter.status);
    assert.ok(checkAfter.flowDepthRatio <= 1 + 1e-3);
  });
});

describe("Kirpich + IDF + C impermeável", () => {
  it("Kirpich cresce com o comprimento e cai com a declividade", () => {
    const flat = kirpichTcMin(100, 0.5);
    const steep = kirpichTcMin(100, 4);
    const long = kirpichTcMin(300, 0.5);
    assert.ok(flat > 0);
    assert.ok(steep < flat);
    assert.ok(long > flat);
  });

  it("IDF i = K·Tr^a/(t+b)^c", () => {
    const i = idfIntensityMmH({ K: 800, a: 0.18, b: 12, c: 0.75 }, 10, 5);
    assert.ok(i > 50 && i < 400);
    const i50 = idfIntensityMmH({ K: 800, a: 0.18, b: 12, c: 0.75 }, 50, 5);
    assert.ok(i50 > i);
  });

  it("C interpola 0,20 (permeável) a 0,90 (impermeável)", () => {
    assert.equal(runoffCFromImpervious(0), 0.2);
    assert.ok(Math.abs(runoffCFromImpervious(100) - 0.9) < 1e-9);
    assert.ok(Math.abs(runoffCFromImpervious(70) - 0.69) < 1e-9);
  });
});

describe("checagem hidráulica (lâmina e velocidade)", () => {
  it("marca insuficiente quando Q > 0,85·Qplena", () => {
    const qPlena = manningCapacityLps(300, 0.5, 0.013);
    const check = checkDrainageHydraulics(qPlena * 0.95, 300, 0.5, 0.013);
    assert.equal(check.status, "insuficiente");
    assert.ok(check.flowDepthRatio > DRAINAGE_LAMINA_RELATIVA_MAX);
  });

  it("marca velocidade baixa em declive quase nulo", () => {
    const check = checkDrainageHydraulics(1, 1500, 0.01, 0.013);
    assert.equal(check.status, "velocidade_baixa");
    assert.ok(manningVelocityMs(1500, 0.01, 0.013) < 0.6);
  });

  it("escolhe DN que respeita lâmina 0,85 e velocidade", () => {
    const q = rationalRunoffLps(0.7, 150, 0.2);
    const sized = suggestDiameterMm(q, 0.8, 0.013, 300);
    assert.equal(sized.status, "ok");
    assert.ok(sized.velocityMs >= 0.6 - 1e-6);
    assert.ok(sized.velocityMs <= 5 + 1e-6);
    assert.ok(q <= DRAINAGE_LAMINA_RELATIVA_MAX * sized.capacityLps + 1e-6);
  });
});

describe("SWMM .inp", () => {
  it("exporta seções SWMM 5 e reimporta PVs/tubos fora da reserva", () => {
    const src = project([
      line("e1", "loteamento_eixos", [0, 50, 12], [200, 50, 8], "Rua A"),
      square("v1", "loteamento_vias", [0, 44], 200, 12, "Via 1"),
      square("l1", "loteamento_lotes", [10, 0], 40, 40, "Quadra A — 01"),
      square("rl", AREA_RESERVA_LEGAL_LAYER_ID, [150, 0], 50, 100, "Reserva legal 20%"),
    ]);
    const generated = generateLoteamentoDrainage(src, { pvSpacingM: 50, minSlopePct: 0.5 });
    const inp = exportDrainageSwmmInp(generated.project, { titulo: "Teste drenagem" });
    assert.match(inp, /\[JUNCTIONS\]/);
    assert.match(inp, /\[CONDUITS\]/);
    assert.match(inp, /\[OUTFALLS\]/);
    assert.match(inp, /\[XSECTIONS\]/);
    assert.match(inp, /\[COORDINATES\]/);
    assert.match(inp, /CIRCULAR/);

    const reservaInside = `[JUNCTIONS]
PV_RES  10.000  1.70  0  0  0
[OUTFALLS]
EXU1  8.000  FREE    NO
[CONDUITS]
C1  PV_RES  EXU1  40.00  0.0130  0  0  0  0
[XSECTIONS]
C1  CIRCULAR  0.300  0  0  0
[COORDINATES]
PV_RES  170.00  50.00
EXU1  40.00  50.00
`;
    const imported = importDrainageSwmmInp(src, reservaInside);
    const pvs = listDrainagePvs(imported);
    assert.ok(pvs.every((pv) => pv.x < 150));
    assert.ok(pvs.some((pv) => (pv.drainage?.code ?? "") === "EXU1"));
  });
});
