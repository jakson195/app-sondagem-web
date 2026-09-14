import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import {
  DRENAGEM_EMISSARIO_LAYER,
  DRENAGEM_PV_LAYER,
  DRENAGEM_TUBOS_LAYER,
  generateLoteamentoDrainage,
  listDrainageInlets,
  listDrainageRamais,
  manningCapacityLps,
} from "./loteamento-drainage";
import {
  applyDrainageCalcEdit,
  buildDrainageCalcRows,
  DRAINAGE_CALC_SHEET_HEADERS,
  DRAINAGE_EXCAVATION_SHEET_HEADERS,
  drainageCalcFailFlags,
  drainageEntityHasRedError,
  drainageRowHasFail,
  exportDrainageCalcWorkbook,
  selectDrainageCalcParams,
} from "./loteamento-drainage-planilha";
import type { CadPolylineEntity, CadProject } from "./types";

function failingProject(over: { qFactor?: number; slopePct?: number; velocityForce?: boolean } = {}): CadProject {
  const lengthM = 100;
  const invertInZ = 10;
  const slopePct = over.slopePct ?? 0.5;
  const invertOutZ = invertInZ - (slopePct / 100) * lengthM;
  const diameterMm = 300;
  const nManning = 0.013;
  const cap = manningCapacityLps(diameterMm, slopePct, nManning);
  const qContribLps = cap * (over.qFactor ?? 1.2);
  const pipe: CadPolylineEntity = {
    id: "tb1",
    type: "polyline",
    layerId: DRENAGEM_TUBOS_LAYER.id,
    closed: false,
    vertices: [
      { x: 0, y: 0, z: invertInZ },
      { x: 100, y: 0, z: invertOutZ },
    ],
    name: "TB-01",
    drainage: {
      kind: "pipe",
      code: "TB-01",
      origin: "manual",
      fromPvId: "pv1",
      toPvId: "pv2",
      lengthM,
      slopePct,
      diameterMm,
      invertInZ,
      invertOutZ,
      material: "Concreto",
      nManning,
      contribAreaHa: 0.2,
      runoffC: 0.7,
      intensityMmH: 150,
      qContribLps,
      qCapacityLps: cap,
      velocityMs: over.velocityForce ? 0.2 : 1.2,
      flowDepthRatio: qContribLps / cap,
      tcMin: 5,
      status: "insuficiente",
    },
  };
  return {
    name: "REDE E",
    crs: "EPSG:31982",
    layers: [DRENAGEM_PV_LAYER, DRENAGEM_TUBOS_LAYER, DRENAGEM_EMISSARIO_LAYER],
    entities: [
      {
        id: "pv1",
        type: "point",
        layerId: DRENAGEM_PV_LAYER.id,
        x: 0,
        y: 0,
        z: invertInZ + 1.2,
        label: "PV-01",
        drainage: {
          kind: "pv",
          code: "PV-01",
          groundZ: invertInZ + 1.2,
          invertZ: invertInZ,
          coverDepthM: 1.2,
        },
      },
      {
        id: "pv2",
        type: "point",
        layerId: DRENAGEM_EMISSARIO_LAYER.id,
        x: 100,
        y: 0,
        z: invertOutZ + 1.2,
        label: "PV-02",
        drainage: {
          kind: "outfall",
          code: "PV-02",
          groundZ: invertOutZ + 1.2,
          invertZ: invertOutZ,
          coverDepthM: 1.2,
        },
      },
      pipe,
    ],
  };
}

describe("drainageCalcFailFlags — erro em vermelho", () => {
  it("marca y/D Extrapolando, Q > capacidade e devolve red flag", () => {
    const flags = drainageCalcFailFlags({
      flowDepthRatio: 1.2,
      qContribLps: 200,
      qCapacityLps: 100,
      velocityMs: 1.2,
      slopePct: 0.8,
    });
    assert.ok(drainageRowHasFail(flags));
    assert.ok(flags.some((f) => f.key === "yd_extrapolando"));
    assert.ok(flags.some((f) => f.key === "q_capacity"));
    assert.ok(flags.some((f) => f.column === "lamina"));
  });

  it("marca Cheio, velocidade fora e declive abaixo do mínimo", () => {
    const flags = drainageCalcFailFlags({
      flowDepthRatio: 0.9,
      qContribLps: 80,
      qCapacityLps: 100,
      velocityMs: 0.2,
      slopePct: 0.1,
    });
    assert.ok(flags.some((f) => f.key === "yd_cheio"));
    assert.ok(flags.some((f) => f.key === "v_min"));
    assert.ok(flags.some((f) => f.key === "slope_min"));
    assert.ok(flags.some((f) => f.column === "vesc"));
    assert.ok(flags.some((f) => f.column === "declividade"));
  });

  it("não marca vermelho quando os critérios passam", () => {
    const flags = drainageCalcFailFlags({
      flowDepthRatio: 0.6,
      qContribLps: 50,
      qCapacityLps: 100,
      velocityMs: 1.2,
      slopePct: 0.8,
    });
    assert.equal(flags.length, 0);
    assert.equal(drainageRowHasFail(flags), false);
  });

  it("pipe com status de falha acende red flag na entidade", () => {
    const project = failingProject({ qFactor: 1.2 });
    const pipe = project.entities.find((e) => e.id === "tb1");
    assert.ok(pipe);
    assert.equal(drainageEntityHasRedError(pipe), true);
  });
});

describe("selectDrainageCalcParams — clique na rede", () => {
  it("ao selecionar um tubo devolve o objeto de parâmetros do trecho", () => {
    const project = failingProject({ qFactor: 0.4, slopePct: 1 });
    const selected = selectDrainageCalcParams(project, "tb1", { runoffC: 0.7, intensityMmH: 150 });
    assert.ok(selected);
    assert.equal(selected.kind, "pipe");
    assert.equal(selected.pipeId, "tb1");
    assert.ok(selected.params);
    assert.equal(selected.params.trecho, "PV1→PV2");
    assert.equal(selected.params.C, 0.7);
    assert.equal(selected.params.I, 150);
    assert.equal(selected.params.TC, 5);
    assert.ok(selected.params.SCXA > 0);
    assert.equal(selected.params.AREA, selected.params.SCXA);
    assert.ok(selected.params.Q > 0);
    assert.equal(selected.params.DN, 300);
    assert.equal(selected.params.L, 100);
    assert.ok(Number.isFinite(selected.params.invertInZ));
    assert.ok(Number.isFinite(selected.params.invertOutZ));
    assert.ok(Number.isFinite(selected.params.velocityMs));
    assert.ok(Number.isFinite(selected.params.yOverD));
    assert.ok(selected.params.status);
    assert.ok(selected.basin);
    assert.equal(selected.basin.C, 0.7);
    assert.equal(selected.rows.length, 1);
  });

  it("ao clicar no PV seleciona o tubo a jusante e os mesmos parâmetros", () => {
    const project = failingProject({ qFactor: 0.4, slopePct: 1 });
    const selected = selectDrainageCalcParams(project, "pv1");
    assert.ok(selected);
    assert.equal(selected.kind, "pv");
    assert.equal(selected.pipeId, "tb1");
    assert.ok(selected.params);
    assert.equal(selected.params.trecho, "PV1→PV2");
  });
});

describe("exportDrainageCalcWorkbook — colunas da planilha modelo", () => {
  it("exporta a folha principal com os cabeçalhos 1:1 do REDE E.xlsx", () => {
    const project = failingProject({ qFactor: 0.4, slopePct: 1 });
    const buf = exportDrainageCalcWorkbook(project, { runoffC: 0.7, intensityMmH: 150 });
    const wb = XLSX.read(buf, { type: "array" });
    assert.ok(wb.SheetNames.length >= 1);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as string[][];
    const headers = rows[0] ?? [];
    assert.deepEqual(headers, [...DRAINAGE_CALC_SHEET_HEADERS]);
    assert.equal(headers.length, 44);
    assert.equal(headers[0], "Segmento");
    assert.equal(headers[12], "Velocidade real de escoamento");
    assert.equal(headers[39], "Tempo de concentração");
    assert.ok((rows[1]?.[0] ?? "").includes("PV1→PV2"));
  });

  it("inclui a folha Escavação com os códigos do REDE E REV ESCAVACAO.xlsx", () => {
    const project = failingProject({ qFactor: 0.4, slopePct: 1 });
    const buf = exportDrainageCalcWorkbook(project);
    const wb = XLSX.read(buf, { type: "array" });
    assert.ok(wb.SheetNames.includes("Escavação"));
    const ws = wb.Sheets["Escavação"];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as string[][];
    assert.deepEqual(rows[0], [...DRAINAGE_EXCAVATION_SHEET_HEADERS]);
    assert.equal(rows[0]?.[0], "NOME");
    assert.equal(rows[0]?.[6], "EMEC");
  });

  it("editar SCXA/C na planilha grava de volta no tubo e recalcula Q", () => {
    const project = failingProject({ qFactor: 0.4, slopePct: 1 });
    const before = selectDrainageCalcParams(project, "tb1");
    const next = applyDrainageCalcEdit(project, "tb1", { contribAreaM2: 4000, runoffC: 0.8, intensityMmH: 120 });
    const after = selectDrainageCalcParams(next, "tb1");
    assert.ok(before?.params && after?.params);
    assert.ok(Math.abs(after.params.AREA - 4000) < 1e-6);
    assert.equal(after.params.C, 0.8);
    assert.equal(after.params.I, 120);
    assert.ok(after.params.Q !== before.params.Q);
  });
});

describe("planilha — ramal BL→PV", () => {
  it("inclui trecho BL→PV ou BL→T e o clique na boca abre o ramal", () => {
    const src: CadProject = {
      name: "JD. DRENAGEM",
      crs: "EPSG:31982",
      layers: [
        { id: "loteamento_lotes", name: "LOTES", color: "#d97706", visible: true, locked: false },
        { id: "loteamento_vias", name: "VIAS", color: "#64748b", visible: true, locked: false },
        { id: "loteamento_eixos", name: "EIXOS", color: "#eab308", visible: true, locked: false },
      ],
      entities: [
        {
          id: "e1",
          type: "polyline",
          layerId: "loteamento_eixos",
          closed: false,
          name: "Rua A",
          vertices: [
            { x: 0, y: 50, z: 12 },
            { x: 200, y: 50, z: 8 },
          ],
        } satisfies CadPolylineEntity,
        {
          id: "v1",
          type: "polyline",
          layerId: "loteamento_vias",
          closed: true,
          name: "Via 1",
          vertices: [
            { x: 0, y: 44, z: 10 },
            { x: 200, y: 44, z: 10 },
            { x: 200, y: 56, z: 10 },
            { x: 0, y: 56, z: 10 },
          ],
        } satisfies CadPolylineEntity,
        {
          id: "l1",
          type: "polyline",
          layerId: "loteamento_lotes",
          closed: true,
          name: "Lote 1",
          vertices: [
            { x: 10, y: 0, z: 10 },
            { x: 50, y: 0, z: 10 },
            { x: 50, y: 40, z: 10 },
            { x: 10, y: 40, z: 10 },
          ],
        } satisfies CadPolylineEntity,
      ],
    };
    const generated = generateLoteamentoDrainage(src, {
      pvSpacingM: 60,
      inletSpacingM: 25,
      enableAutoInlets: true,
      connectInletsToMain: true,
    });
    const rows = buildDrainageCalcRows(generated.project);
    assert.ok(rows.some((r) => /^BL\d+→(PV|T)\d+$/.test(r.segmento)));
    const bl = listDrainageInlets(generated.project)[0];
    assert.ok(bl);
    const selected = selectDrainageCalcParams(generated.project, bl.id);
    assert.ok(selected);
    assert.equal(selected.kind, "inlet");
    const ramal = listDrainageRamais(generated.project).find((p) => p.id === selected.pipeId);
    assert.ok(ramal);
    assert.match(selected.params?.trecho ?? "", /^BL\d+→(PV|T)\d+$/);
  });
});
