import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ajustarLote, otimizarQuadra } from "@/lib/cad-ai/execute";
import { commandFromIntent, classifyCadIntent, validateCadCommand } from "@/lib/cad-ai/intent";
import { parseLoteamentoAssistantCommand } from "@/lib/cad-ai/parse";
import { resolveLotRef } from "@/lib/cad-ai/resolve";
import { rebuildQuadraLotes } from "./lot-subdivision";
import { snapshotLotGeometries, tryAdjustSingleLot, validateSingleLotModification } from "./lot-single-adjust";
import type { CadPolylineEntity, CadProject } from "./types";

function ringPoly(
  id: string,
  layerId: string,
  ring: [number, number][],
  name: string,
): CadPolylineEntity {
  return {
    id,
    type: "polyline",
    layerId,
    closed: true,
    name,
    vertices: ring.map(([x, y]) => ({ x, y, z: 0 })),
  };
}

function sampleProject(): CadProject {
  const quadraA: [number, number][] = [
    [0, 0],
    [80, 0],
    [80, 50],
    [0, 50],
  ];
  const streets: [number, number][][] = [
    [
      [-4, -12],
      [84, -12],
      [84, 0],
      [-4, 0],
    ],
  ];
  const lotsA = rebuildQuadraLotes(quadraA, 10, 25, streets, undefined, "Quadra A");
  return {
    name: "Loteamento teste",
    crs: "EPSG:31982",
    layers: [
      { id: "loteamento_lotes", name: "LOTES", color: "#d97706", visible: true, locked: false },
      { id: "loteamento_vias", name: "VIAS", color: "#64748b", visible: true, locked: false },
      { id: "loteamento_quadras", name: "QUADRAS", color: "#b45309", visible: true, locked: false },
    ],
    entities: [
      ringPoly("via_1", "loteamento_vias", streets[0], "Via 1"),
      ringPoly("qa", "loteamento_quadras", quadraA, "Quadra A"),
      ...lotsA.map((lote, i) =>
        ringPoly(
          `a_${i}`,
          "loteamento_lotes",
          (lote.coordinates[0] ?? []) as [number, number][],
          `${lote.quadra} — ${String(i + 1).padStart(2, "0")}`,
        ),
      ),
    ],
  };
}

function lotVerts(project: CadProject, id: string) {
  const lot = project.entities.find((e) => e.id === id);
  assert.ok(lot && lot.type === "polyline");
  return lot.vertices.map((v) => ({ x: v.x, y: v.y }));
}

describe("parser / scope", () => {
  it("alterar lote 01 para 500m² → ajustar_lote single_lot", () => {
    const cmds = parseLoteamentoAssistantCommand("alterar lote 01 para 500m²");
    assert.equal(cmds?.[0]?.acao, "ajustar_lote");
    assert.equal(cmds?.[0]?.scope, "single_lot");
    assert.equal(cmds?.[0]?.lote, "01");
    assert.equal(cmds?.[0]?.area_alvo_m2, 500);
    assert.match(cmds?.[0]?.resposta ?? "", /somente/i);
    const intent = classifyCadIntent("alterar lote 01 para 500m²");
    assert.equal(intent.scope, "single_lot");
    assert.equal(commandFromIntent(intent).acao, "ajustar_lote");
  });

  it("alterar lote 05 para 400m² → ajustar_lote single_lot", () => {
    const cmds = parseLoteamentoAssistantCommand("alterar lote 05 para 400m²");
    assert.equal(cmds?.[0]?.acao, "ajustar_lote");
    assert.equal(cmds?.[0]?.lote, "05");
    assert.equal(cmds?.[0]?.area_alvo_m2, 400);
    assert.equal(cmds?.[0]?.scope, "single_lot");
  });

  it("ajustar os lotes da quadra A para 300m² → otimizar_quadra", () => {
    const cmds = parseLoteamentoAssistantCommand("ajustar os lotes da quadra A para 300m²");
    assert.equal(cmds?.[0]?.acao, "otimizar_quadra");
    assert.equal(cmds?.[0]?.quadra, "A");
    assert.equal(cmds?.[0]?.area_alvo_m2, 300);
    assert.equal(cmds?.[0]?.scope, "quad");
  });

  it("validateCadCommand remove tools de quadra no ajuste individual", () => {
    const filtered = validateCadCommand([
      { acao: "ajustar_lote", lote: "01", area_alvo_m2: 500, scope: "single_lot" },
      { acao: "otimizar_quadra", quadra: "A", area_alvo_m2: 500 },
    ]);
    assert.deepEqual(filtered.map((cmd) => cmd.acao), ["ajustar_lote"]);
    assert.equal(filtered[0]?.scope, "single_lot");
  });
});

describe("ajuste individual de geometria", () => {
  it("encolher o lote 01 não altera os demais vértices/área/perímetro/testada", () => {
    const project = sampleProject();
    const target = resolveLotRef(project, "01");
    assert.ok(target);
    const before = snapshotLotGeometries(project);
    const current = before.get(target.entity.id)!;
    const result = ajustarLote(project, "01", Math.max(80, current.areaM2 * 0.65));
    assert.equal(result.ok, true, result.message);
    const check = validateSingleLotModification({
      targetEntityId: target.entity.id,
      beforeState: project,
      afterState: result.project,
    });
    assert.equal(check.ok, true, check.changedIds.join(","));
    for (const [id, snap] of before) {
      if (id === target.entity.id) continue;
      assert.deepEqual(lotVerts(result.project, id), snap.vertices.map((v) => ({ x: v.x, y: v.y })));
    }
  });

  it("aumentar o lote 01 para 500m² numa quadra fechada não mexe nos outros", () => {
    const project = sampleProject();
    const target = resolveLotRef(project, "01");
    assert.ok(target);
    const before = snapshotLotGeometries(project);
    const result = ajustarLote(project, "01", 500);
    if (result.ok) {
      const check = validateSingleLotModification({
        targetEntityId: target.entity.id,
        beforeState: project,
        afterState: result.project,
      });
      assert.equal(check.ok, true);
    } else {
      assert.ok(result.redistributionOffer);
      assert.match(result.message, /redistribui/i);
      assert.equal(result.project, project);
    }
    for (const [id, snap] of before) {
      if (id === target.entity.id) continue;
      assert.deepEqual(lotVerts(result.project, id), snap.vertices.map((v) => ({ x: v.x, y: v.y })));
    }
  });

  it("alterar lote 05 para 400m² não altera os outros lotes", () => {
    const project = sampleProject();
    const target = resolveLotRef(project, "05");
    if (!target) return;
    const before = snapshotLotGeometries(project);
    const result = ajustarLote(project, "05", 400);
    if (result.ok) {
      assert.equal(
        validateSingleLotModification({
          targetEntityId: target.entity.id,
          beforeState: project,
          afterState: result.project,
        }).ok,
        true,
      );
    } else {
      assert.equal(result.project, project);
    }
    for (const [id, snap] of before) {
      if (id === target.entity.id) continue;
      assert.deepEqual(lotVerts(result.project, id), snap.vertices.map((v) => ({ x: v.x, y: v.y })));
    }
  });

  it("otimizar a quadra A pode alterar vários lotes", () => {
    const project = sampleProject();
    const before = snapshotLotGeometries(project);
    const result = otimizarQuadra(project, {
      quadra: "A",
      areaAlvo: 300,
      preservarRuas: true,
      minimizarRemanescente: true,
    });
    assert.equal(result.ok, true);
    let changed = 0;
    for (const [id, snap] of before) {
      const after = result.project.entities.find((e) => e.id === id);
      if (!after || after.type !== "polyline") {
        changed += 1;
        continue;
      }
      if (!snap.vertices.every((v, i) => Math.hypot(v.x - after.vertices[i]!.x, v.y - after.vertices[i]!.y) < 1e-6)) {
        changed += 1;
      }
    }
    assert.ok(changed >= 1);
  });

  it("validateSingleLotModification acusa alteração em irmão", () => {
    const project = sampleProject();
    const lots = project.entities.filter((e) => e.type === "polyline" && e.layerId === "loteamento_lotes");
    const first = lots[0];
    const second = lots[1];
    assert.ok(first && second && first.type === "polyline" && second.type === "polyline");
    const tampered: CadProject = {
      ...project,
      entities: project.entities.map((entity) =>
        entity.id === second.id && entity.type === "polyline"
          ? { ...entity, vertices: entity.vertices.map((v) => ({ ...v, x: v.x + 2 })) }
          : entity,
      ),
    };
    const check = validateSingleLotModification({
      targetEntityId: first.id,
      beforeState: project,
      afterState: tampered,
    });
    assert.equal(check.ok, false);
    assert.ok(check.changedIds.includes(second.id));
  });

  it("tryAdjustSingleLot não recria a quadra", () => {
    const project = sampleProject();
    const target = resolveLotRef(project, "01");
    assert.ok(target);
    const idsBefore = project.entities.filter((e) => e.layerId === "loteamento_lotes").map((e) => e.id);
    const isolated = tryAdjustSingleLot(project, target.entity, 80);
    if (isolated.ok) {
      const idsAfter = isolated.project.entities.filter((e) => e.layerId === "loteamento_lotes").map((e) => e.id);
      assert.deepEqual(idsAfter, idsBefore);
    }
  });
});
