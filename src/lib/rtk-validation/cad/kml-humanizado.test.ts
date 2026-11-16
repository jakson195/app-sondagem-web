import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { unzipSync, strFromU8 } from "fflate";
import { executeCadAiCommand } from "./ai-command-executor";
import { arvoreDae, buildHumanizadoKml, casaDoLote, exportCadProjectKmzHumanizado } from "./kml-humanizado";
import { applyReservaLegalToProject } from "./loteamento-tools";
import type { CadPolylineEntity, CadProject } from "./types";

/** Gleba em UTM SIRGAS 2000 22S, perto de Sombrio/SC. */
const E0 = 640000;
const N0 = 6778000;
export function projetoLoteado(): CadProject {
  const gleba: CadPolylineEntity = {
    id: "gleba",
    type: "polyline",
    layerId: "0",
    closed: true,
    name: "Gleba",
    vertices: [
      [0, 0],
      [300, 0],
      [300, 200],
      [0, 200],
    ].map(([x, y]) => ({ x: E0 + x, y: N0 + y, z: 0 })),
  };
  let p = {
    name: "Loteamento teste",
    crs: "EPSG:31982",
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [gleba],
  } as CadProject;
  p = applyReservaLegalToProject(p, { glebaId: "gleba", percent: 10, canto: "inferior_esquerda" }).project;
  const r = executeCadAiCommand(
    p,
    {
      acao: "gerar_loteamento",
      entidade_id: "gleba",
      largura_via_m: 12,
      profundidade_quadra_m: 25,
      testada_minima_m: 12,
      area_minima_quadra_m2: 2000,
      largura_calcada_m: 2,
      ruas_contorno: "indicadas",
      area_util_automatica: true,
      percentual_area_util: 35,
      canto_area_util: "superior_direita",
    } as never,
    { selectedId: "gleba" },
  );
  assert.equal(r.ok, true);
  return r.project;
}

describe("exportação humanizada para o Google Earth", () => {
  const projeto = projetoLoteado();

  it("KMZ com KML, modelo de árvore e pastas de piso, números, casas e árvores", () => {
    const { kmz, stats } = exportCadProjectKmzHumanizado(projeto);
    const files = unzipSync(kmz);
    assert.ok(files["doc.kml"], "sem doc.kml");
    assert.ok(files["modelos/arvore.dae"], "sem modelo de árvore");
    const kml = strFromU8(files["doc.kml"]);
    for (const pasta of ["Implantação (piso)", "Números dos lotes", "Casas 3D", "Árvores 3D"]) {
      assert.ok(kml.includes(`<name>${pasta}</name>`), `falta a pasta ${pasta}`);
    }
    assert.ok(stats.lotes > 30, `lotes ${stats.lotes}`);
    /** Padrão: ~30% dos lotes ocupados (maquete de lançamento). */
    assert.ok(stats.casas >= stats.lotes * 0.15 && stats.casas <= stats.lotes * 0.45, `casas ${stats.casas} de ${stats.lotes}`);
    const cheio = exportCadProjectKmzHumanizado(projeto, { ocupacao: 1 }).stats;
    assert.ok(cheio.casas >= cheio.lotes * 0.85, `ocupação 100%: ${cheio.casas} de ${cheio.lotes}`);
    assert.ok(stats.arvores > 20, `árvores ${stats.arvores}`);
    assert.equal((kml.match(/<Placemark>/g) ?? []).length, (kml.match(/<\/Placemark>/g) ?? []).length);
    assert.equal((kml.match(/<Folder>/g) ?? []).length, (kml.match(/<\/Folder>/g) ?? []).length);
  });

  it("coordenadas em WGS84 na região de Sombrio/SC", () => {
    const { kml } = buildHumanizadoKml(projeto);
    const nums = [...kml.matchAll(/(-?\d+\.\d{8}),(-?\d+\.\d{8}),/g)].slice(0, 200);
    assert.ok(nums.length > 50);
    for (const [, lon, lat] of nums) {
      assert.ok(Number(lon) > -50.5 && Number(lon) < -48.5, `lon ${lon}`);
      assert.ok(Number(lat) > -30 && Number(lat) < -28.5, `lat ${lat}`);
    }
  });

  it("casa fica dentro do lote, com pegada ≤ 45% e ≤ 180 m²", () => {
    const lotes = projeto.entities.filter((e) => e.layerId === "loteamento_lotes" && e.type === "polyline") as CadPolylineEntity[];
    for (const lote of lotes.slice(0, 40)) {
      const casa = casaDoLote(lote);
      if (!casa) continue;
      const a = (r: [number, number][]) =>
        Math.abs(r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length]![1] - r[(i + 1) % r.length]![0] * p[1], 0)) / 2;
      const loteRing = lote.vertices.map((v) => [v.x, v.y] as [number, number]);
      assert.ok(a(casa.corpo) <= Math.min(180, a(loteRing) * 0.45) + 0.5, `casa grande demais no ${lote.name}`);
    }
  });

  it("mesmo projeto gera o mesmo KMZ (sorteios determinísticos)", () => {
    assert.equal(buildHumanizadoKml(projeto).kml, buildHumanizadoKml(projeto).kml);
  });

  it("com imagem: GroundOverlay, PNG no KMZ e piso desligado", () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const { kmz, stats } = exportCadProjectKmzHumanizado(projeto, {
      overlay: { png, north: -29.0, south: -29.01, east: -49.5, west: -49.51 },
    });
    const files = unzipSync(kmz);
    assert.ok(files["imagens/humanizado.png"]);
    const kml = strFromU8(files["doc.kml"]);
    assert.ok(kml.includes("<GroundOverlay>"));
    assert.ok(kml.includes("<name>Implantação (piso)</name><visibility>0</visibility>"));
    assert.equal(stats.overlay, true);
  });

  it("modelo de árvore é COLLADA 1.4.1 com tronco e copa", () => {
    const dae = arvoreDae();
    assert.ok(dae.includes('version="1.4.1"'));
    assert.ok(dae.includes('material="m_tronco"') && dae.includes('material="m_copa"'));
  });
});
