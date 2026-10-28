import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyModifyCommand } from "./modify-ops";
import { parseModifyFollowUp, parseModifyNaturalCommand } from "./modify-ai";
import { CAD_EPSILON } from "./modify-geometry";
import type { CadLineEntity, CadPolylineEntity, CadProject } from "./types";

function projectWith(entities: CadProject["entities"]): CadProject {
  return {
    name: "Modify test",
    crs: "EPSG:31982",
    layers: [{ id: "draw", name: "DESENHO", color: "#111", visible: true, locked: false }],
    entities,
  };
}

function line(id: string, x1: number, y1: number, x2: number, y2: number, name?: string): CadLineEntity {
  return { id, type: "line", layerId: "draw", start: { x: x1, y: y1, z: 0 }, end: { x: x2, y: y2, z: 0 }, ...(name ? { name } : {}) } as CadLineEntity;
}

function poly(id: string, pts: [number, number][], closed = true, name?: string): CadPolylineEntity {
  return {
    id,
    type: "polyline",
    layerId: "draw",
    closed,
    name,
    vertices: pts.map(([x, y]) => ({ x, y, z: 0 })),
  };
}

describe("applyModifyCommand", () => {
  it("move a linha em coordenadas de mundo", () => {
    const project = projectWith([line("ln1", 0, 0, 10, 0)]);
    const result = applyModifyCommand(project, { acao: "mover", entidade_id: "ln1", dx: 5, dy: 0 });
    assert.equal(result.ok, true);
    const moved = result.project.entities.find((e) => e.id === "ln1");
    assert.ok(moved && moved.type === "line");
    assert.ok(Math.abs(moved.start.x - 5) < CAD_EPSILON);
    assert.ok(Math.abs(moved.end.x - 15) < CAD_EPSILON);
  });

  it("copia sem alterar o original", () => {
    const project = projectWith([line("ln1", 0, 0, 10, 0)]);
    const result = applyModifyCommand(project, { acao: "copiar", entidade_id: "ln1", dx: 0, dy: 10 });
    assert.equal(result.ok, true);
    assert.equal(result.project.entities.length, 2);
    const original = result.project.entities.find((e) => e.id === "ln1");
    assert.ok(original && original.type === "line");
    assert.equal(original.start.y, 0);
    const copy = result.project.entities.find((e) => e.id !== "ln1");
    assert.ok(copy && copy.type === "line");
    assert.ok(Math.abs(copy.start.y - 10) < CAD_EPSILON);
  });

  it("rotaciona 90° em torno da origem", () => {
    const project = projectWith([line("ln1", 10, 0, 20, 0)]);
    const result = applyModifyCommand(project, { acao: "rotacionar", entidade_id: "ln1", angulo: 90, x: 0, y: 0 });
    assert.equal(result.ok, true);
    const rotated = result.project.entities.find((e) => e.id === "ln1");
    assert.ok(rotated && rotated.type === "line");
    assert.ok(Math.abs(rotated.start.x) < 0.02);
    assert.ok(Math.abs(rotated.start.y - 10) < 0.02);
  });

  it("espelha mantendo o original", () => {
    const project = projectWith([line("ln1", 5, 0, 5, 10)]);
    const result = applyModifyCommand(project, {
      acao: "espelhar",
      entidade_id: "ln1",
      x: 0,
      y: 0,
      x2: 0,
      y2: 10,
      manter_original: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.project.entities.length, 2);
    assert.ok(result.project.entities.some((e) => e.id === "ln1"));
  });

  it("estica só os vértices do lado do deslocamento", () => {
    const project = projectWith([poly("pl1", [[0, 0], [10, 0], [10, 4], [0, 4]], false, "PL")]);
    const result = applyModifyCommand(project, { acao: "esticar", entidade_id: "pl1", dx: 8, dy: 0 });
    assert.equal(result.ok, true);
    const stretched = result.project.entities.find((e) => e.id === "pl1");
    assert.ok(stretched && stretched.type === "polyline");
    assert.ok(Math.abs(stretched.vertices[0].x) < CAD_EPSILON);
    assert.ok(Math.abs(stretched.vertices[1].x - 18) < 0.02);
  });

  it("escala por fator 2", () => {
    const project = projectWith([line("ln1", 0, 0, 10, 0)]);
    const result = applyModifyCommand(project, { acao: "escala", entidade_id: "ln1", fator: 2, x: 0, y: 0 });
    assert.equal(result.ok, true);
    const scaled = result.project.entities.find((e) => e.id === "ln1");
    assert.ok(scaled && scaled.type === "line");
    assert.ok(Math.abs(scaled.end.x - 20) < 0.02);
  });

  it("escala por referência para 50 m", () => {
    const project = projectWith([line("ln1", 0, 0, 10, 0)]);
    const result = applyModifyCommand(project, { acao: "escala", entidade_id: "ln1", distancia: 50, x: 0, y: 0 });
    assert.equal(result.ok, true);
    const scaled = result.project.entities.find((e) => e.id === "ln1");
    assert.ok(scaled && scaled.type === "line");
    assert.ok(Math.abs(scaled.end.x - 50) < 0.02);
  });

  it("offset gera paralela", () => {
    const project = projectWith([line("ln1", 0, 0, 10, 0)]);
    const result = applyModifyCommand(project, { acao: "deslocar", entidade_id: "ln1", distancia: 5, lado: "direita" });
    assert.equal(result.ok, true);
    assert.equal(result.project.entities.length, 2);
    const off = result.project.entities.find((e) => e.id !== "ln1");
    assert.ok(off && off.type === "line");
    assert.ok(Math.abs(Math.abs(off.start.y) - 5) < 0.05);
  });

  it("apara linha no limite da outra", () => {
    const project = projectWith([
      line("alvo", -10, 0, 10, 0),
      line("limite", 0, -5, 0, 5),
    ]);
    const result = applyModifyCommand(project, {
      acao: "aparar",
      entidade_id: "alvo",
      entidade_corte: "limite",
      x: 8,
      y: 0,
    });
    assert.equal(result.ok, true, result.message);
    const trimmed = result.project.entities.find((e) => e.id === "alvo");
    assert.ok(trimmed && trimmed.type === "line");
    assert.ok(Math.abs(trimmed.end.x) < 0.05 || Math.abs(trimmed.start.x) < 0.05);
  });

  it("estende linha até o limite", () => {
    const project = projectWith([
      line("alvo", 0, 0, 4, 0),
      line("limite", 10, -5, 10, 5),
    ]);
    const result = applyModifyCommand(project, {
      acao: "estender",
      entidade_id: "alvo",
      entidade_corte: "limite",
      x: 4,
      y: 0,
    });
    assert.equal(result.ok, true, result.message);
    const extended = result.project.entities.find((e) => e.id === "alvo");
    assert.ok(extended && extended.type === "line");
    assert.ok(Math.abs(extended.end.x - 10) < 0.05 || Math.abs(extended.start.x - 10) < 0.05);
  });

  it("concordância cria arco entre duas linhas", () => {
    const project = projectWith([line("a", 0, 10, 0, 0), line("b", 0, 0, 10, 0)]);
    const result = applyModifyCommand(project, { acao: "concordar", entidade_ids: ["a", "b"], raio: 2 });
    assert.equal(result.ok, true, result.message);
    assert.ok(result.project.entities.some((e) => e.type === "polyline" && (e.name ?? "").includes("Concord")));
  });

  it("chanfro corta a esquina", () => {
    const project = projectWith([line("a", 0, 10, 0, 0), line("b", 0, 0, 10, 0)]);
    const result = applyModifyCommand(project, { acao: "chanfrar", entidade_ids: ["a", "b"], distancia: 2 });
    assert.equal(result.ok, true, result.message);
    assert.ok(result.project.entities.some((e) => e.type === "line" && e.id !== "a" && e.id !== "b"));
  });

  it("matriz retangular cria cópias", () => {
    const project = projectWith([line("ln1", 0, 0, 2, 0)]);
    const result = applyModifyCommand(project, { acao: "matriz", entidade_id: "ln1", colunas: 3, linhas: 1, dx: 5, dy: 0 });
    assert.equal(result.ok, true);
    assert.equal(result.project.entities.length, 3);
  });

  it("explode polígono em linhas", () => {
    const project = projectWith([poly("pl1", [[0, 0], [10, 0], [10, 10], [0, 10]])]);
    const result = applyModifyCommand(project, { acao: "explodir", entidade_id: "pl1" });
    assert.equal(result.ok, true);
    assert.equal(result.project.entities.filter((e) => e.type === "line").length, 4);
    assert.equal(result.project.entities.some((e) => e.id === "pl1"), false);
  });

  it("une linhas conectadas", () => {
    const project = projectWith([line("a", 0, 0, 5, 0), line("b", 5, 0, 10, 0)]);
    const result = applyModifyCommand(project, { acao: "unir", entidade_ids: ["a", "b"] });
    assert.equal(result.ok, true, result.message);
    assert.equal(result.project.entities.length, 1);
    const joined = result.project.entities[0];
    assert.equal(joined.type, "polyline");
  });

  it("divide linha em duas", () => {
    const project = projectWith([line("ln1", 0, 0, 10, 0)]);
    const result = applyModifyCommand(project, { acao: "dividir", entidade_id: "ln1", partes: 2 });
    assert.equal(result.ok, true);
    assert.equal(result.project.entities.length, 2);
  });

  it("pede parâmetro que falta em vez de inventar", () => {
    const project = projectWith([line("ln1", 0, 0, 10, 0)]);
    const result = applyModifyCommand(project, { acao: "mover", entidade_id: "ln1" });
    assert.equal(result.ok, false);
    assert.ok(result.missing?.includes("distancia"));
  });
});

describe("parseModifyNaturalCommand", () => {
  it("interpreta as frases de teste do painel modificar", () => {
    const cases: Array<[string, string]> = [
      ["Mover lote 01 5 metros para leste", "mover"],
      ["Rotacionar quadra A 90 graus", "rotacionar"],
      ["Copiar lote 01 10 metros", "copiar"],
      ["Espelhar Rua D", "espelhar"],
      ["Esticar quadra A em 20 metros", "esticar"],
      ["Escalar lote 01 em 10%", "escala"],
      ["Offset de 5 metros", "deslocar"],
      ["Aparar essa linha na quadra", "aparar"],
      ["Estender Rua D até Rua C", "estender"],
      ["Concordância de 5 metros", "concordar"],
      ["Chanfrar esquina em 3 metros", "chanfrar"],
      ["Dividir lote 01 em dois", "dividir"],
      ["Unir essas linhas", "unir"],
      ["Explodir essa polilinha", "explodir"],
    ];
    for (const [phrase, acao] of cases) {
      const cmd = parseModifyNaturalCommand(phrase);
      assert.equal(cmd?.acao, acao, phrase);
    }
  });

  it("não rouba comando vago de mover", () => {
    assert.equal(parseModifyNaturalCommand("move isso um pouco"), null);
  });

  it("não trata dividir em lotes como ferramenta dividir", () => {
    assert.equal(parseModifyNaturalCommand("dividir em lotes de 300"), null);
  });

  it("completa follow-up conversacional", () => {
    const follow = parseModifyFollowUp("agora 5 metros para direita");
    assert.equal(follow?.distancia, 5);
    assert.equal(follow?.angulo, 90);
  });
});
