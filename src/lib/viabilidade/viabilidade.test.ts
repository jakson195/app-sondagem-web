import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adaptCadProjectToLoteamentoInput } from "./project-adapter";
import { extrairQuantitativosProjeto } from "./extrator";
import { calcularItem, D } from "./money";
import {
  calcularIndicadores,
  calcularPontoEquilibrio,
  calcularReceitaM2,
  calcularCenarios,
} from "./financeiros";
import { buscarPreco, filtrarSinapi, type PriceCatalog } from "./custos";
import { parseCsv, parseTabularSinapi } from "./sinapi-import";
import { calcularEstudo } from "./pipeline";
import { defaultPremissas } from "./premissas-default";
import { montarEstudoFromCad } from "./calcular-from-cad";
import { emptyPriceCatalog } from "./custos";
import { buildViabilidadeSessionPayload } from "./cad-session";
import type { CadProject, CadPolylineEntity } from "@/lib/rtk-validation/cad/types";

function square(
  id: string,
  layerId: string,
  origin: [number, number],
  width: number,
  height: number,
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
      { x, y, z: 0 },
      { x: x + width, y, z: 0 },
      { x: x + width, y: y + height, z: 0 },
      { x, y: y + height, z: 0 },
    ],
  };
}

function fixtureProject(): CadProject {
  return {
    name: "Loteamento teste",
    crs: "EPSG:31982",
    layers: [
      { id: "loteamento_lotes", name: "LOTES", color: "#d97706", visible: true, locked: false },
      { id: "loteamento_vias", name: "VIAS", color: "#64748b", visible: true, locked: false },
      { id: "area_app", name: "APP", color: "#0f766e", visible: true, locked: false },
      { id: "area_reserva_legal", name: "RL", color: "#15803d", visible: true, locked: false },
      { id: "area_util", name: "UTIL", color: "#ea580c", visible: true, locked: false },
    ],
    entities: [
      square("lote_1", "loteamento_lotes", [0, 12], 20, 30, "Quadra A — 01"),
      square("lote_2", "loteamento_lotes", [20, 12], 20, 30, "Quadra A — 02"),
      square("lote_3", "loteamento_lotes", [40, 12], 20, 30, "Quadra A — 03"),
      square("lote_4", "loteamento_lotes", [60, 12], 20, 30, "Quadra A — 04"),
      square("via_1", "loteamento_vias", [0, 0], 80, 12, "Via 1"),
      square("rl_1", "area_reserva_legal", [80, 0], 20, 20, "Reserva"),
      square("au_1", "area_util", [80, 20], 20, 10, "Área útil"),
      square("app_1", "area_app", [80, 30], 20, 12, "APP"),
    ],
  };
}

describe("extração de áreas e lotes", () => {
  it("conta lotes e calcula áreas a partir das camadas CAD", () => {
    const projeto = adaptCadProjectToLoteamentoInput(fixtureProject(), { projetoId: "p1" });
    const extraido = extrairQuantitativosProjeto(projeto);
    assert.equal(extraido.quantidadeLotes, 4);
    assert.equal(extraido.areaLotes, 4 * 20 * 30);
    assert.ok(extraido.areaVias > 0);
    assert.equal(extraido.areaVerde, 400);
    assert.equal(extraido.areaInstitucional, 200);
    assert.equal(extraido.areaApp, 240);
    assert.equal(extraido.areaMediaLote, 600);
    assert.equal(extraido.areaMinimaLote, 600);
    assert.equal(extraido.areaMaximaLote, 600);
    assert.equal(extraido.areaTotal, 4 * 20 * 30 + 80 * 12 + 400 + 200);
  });

  it("extrai areaTotal e quantidadeLotes de um CadProject com 6 lotes e gleba", () => {
    const lots = [0, 1, 2, 3, 4, 5].map((i) =>
      square(`lote_${i + 1}`, "loteamento_lotes", [i * 20, 12], 20, 30, `Lote ${i + 1}`),
    );
    const project: CadProject = {
      name: "Loteamento 6 lotes",
      crs: "EPSG:31982",
      layers: [
        { id: "gleba", name: "GLEBA", color: "#111827", visible: true, locked: false },
        { id: "loteamento_lotes", name: "LOTEAMENTO_LOTES", color: "#22c55e", visible: true, locked: false },
        { id: "loteamento_vias", name: "LOTEAMENTO_VIAS", color: "#64748b", visible: true, locked: false },
      ],
      entities: [
        square("gleba_1", "gleba", [0, 0], 120, 80, "Gleba"),
        ...lots,
        square("via_1", "loteamento_vias", [0, 0], 120, 12, "Via 1"),
      ],
    };
    const projeto = adaptCadProjectToLoteamentoInput(project, { projetoId: "p6", glebaId: "gleba_1" });
    const extraido = extrairQuantitativosProjeto(projeto);
    assert.equal(extraido.quantidadeLotes, 6);
    assert.equal(extraido.areaLotes, 6 * 20 * 30);
    assert.equal(extraido.areaTotal, 120 * 80);
  });

  it("reconhece LOTEAMENTO_LOTES pelo nome da camada quando o id é outro", () => {
    const lots = [0, 1, 2, 3, 4, 5].map((i) =>
      square(`lote_${i + 1}`, "lyr_lotes_dxf", [i * 20, 0], 20, 25, `Lote ${i + 1}`),
    );
    const project: CadProject = {
      name: "DXF lotes",
      crs: "EPSG:31982",
      layers: [{ id: "lyr_lotes_dxf", name: "LOTEAMENTO_LOTES", color: "#22c55e", visible: true, locked: false }],
      entities: lots,
    };
    const projeto = adaptCadProjectToLoteamentoInput(project, { projetoId: "p-dxf" });
    const extraido = extrairQuantitativosProjeto(projeto);
    assert.equal(extraido.quantidadeLotes, 6);
    assert.equal(extraido.areaTotal, 6 * 20 * 25);
    assert.equal(extraido.areaLotes, 6 * 20 * 25);
  });

  it("não inventa terraplenagem sem superfícies", () => {
    const projeto = adaptCadProjectToLoteamentoInput(fixtureProject(), { projetoId: "p1" });
    assert.equal(projeto.terraplenagem, null);
    assert.ok(projeto.avisos.some((aviso) => /Terraplenagem/.test(aviso)));
  });
});

describe("cálculos financeiros", () => {
  it("calcula custo, receita, lucro, margem e ROI com Decimal", () => {
    const custo = calcularItem(10, "15.5");
    assert.equal(custo.toFixed(2), "155.00");
    const receita = calcularReceitaM2(D(1000), D("120.50"));
    assert.equal(receita.toFixed(2), "120500.00");
    const ind = calcularIndicadores({
      receita,
      custoTotal: D("80000"),
      quantidadeLotes: 4,
      areaLotes: D(1000),
    });
    assert.equal(ind.lucroEstimado.toFixed(2), "40500.00");
    assert.equal(ind.margemPercentual.toFixed(2), "33.61");
    assert.equal(ind.roiPercentual.toFixed(2), "50.63");
    assert.equal(ind.custoPorLote.toFixed(2), "20000.00");
  });

  it("calcula ponto de equilíbrio por preço médio", () => {
    const pe = calcularPontoEquilibrio({
      custoTotal: D(100000),
      precoMedioLote: D(25000),
    });
    assert.equal(pe.metodo, "PRECO_MEDIO");
    assert.equal(pe.quantidadeLotes.toFixed(0), "4");
  });

  it("calcula ponto de equilíbrio ordenando lotes", () => {
    const pe = calcularPontoEquilibrio({
      custoTotal: D(100),
      precoMedioLote: D(50),
      precosOrdenados: [D(10), D(40), D(80)],
    });
    assert.equal(pe.metodo, "LOTES_ORDENADOS");
    assert.equal(pe.quantidadeLotes.toNumber(), 3);
  });
});

describe("cenários", () => {
  it("conservador, provável e otimista", () => {
    const [cons, prov, otm] = calcularCenarios(D(1000), D(800));
    assert.equal(cons.nome, "CONSERVADOR");
    assert.equal(cons.receita.toFixed(0), "900");
    assert.equal(cons.custo.toFixed(0), "880");
    assert.equal(prov.nome, "PROVAVEL");
    assert.equal(prov.receita.toFixed(0), "1000");
    assert.equal(otm.nome, "OTIMISTA");
    assert.equal(otm.receita.toFixed(0), "1100");
    assert.equal(otm.custo.toFixed(0), "720");
  });
});

function catalogComPreco(): PriceCatalog {
  return {
    tipoSinapi: "DESONERADO",
    sinapi: [
      {
        codigo: "PAV_REVESTIMENTO",
        descricao: "Revestimento",
        unidade: "m²",
        uf: "SC",
        competencia: "09/2026",
        custoDesonerado: "50",
        custoNaoDesonerado: "55",
      },
    ],
    sicro: [
      {
        codigo: "TER_CORTE",
        descricao: "Corte",
        unidade: "m³",
        uf: "SC",
        competencia: "09/2026",
        custo: "20",
      },
    ],
    parametros: [
      {
        categoria: "PAVIMENTACAO",
        codigo: "PAV_BASE",
        descricao: "Base",
        unidade: "m²",
        valorUnitario: D(30),
        percentual: null,
        fonte: "PARAMETRICO",
        codigoReferencia: null,
        uf: "SC",
        competencia: "09/2026",
        ativo: true,
      },
    ],
  };
}

describe("motor de preços", () => {
  it("busca por UF e competência", () => {
    const cat = catalogComPreco();
    const hits = filtrarSinapi(cat.sinapi, { uf: "SC", competencia: "202609" });
    assert.equal(hits.length, 1);
    const miss = filtrarSinapi(cat.sinapi, { uf: "SC", competencia: "01/2020" });
    assert.equal(miss.length, 0);
  });

  it("ausência de preço", () => {
    const hit = buscarPreco(catalogComPreco(), {
      categoria: "PAVIMENTACAO",
      codigo: "PAV_IMPRIMACAO",
      uf: "SC",
      competencia: "09/2026",
    });
    assert.equal(hit.encontrado, false);
    if (!hit.encontrado) assert.equal(hit.motivo, "Composição não encontrada");
  });

  it("fallback manual e SINAPI e paramétrico", () => {
    const cat = catalogComPreco();
    const manual = buscarPreco(cat, {
      categoria: "PAVIMENTACAO",
      codigo: "X",
      uf: "SC",
      valorManual: "12.34",
    });
    assert.equal(manual.encontrado, true);
    if (manual.encontrado) {
      assert.equal(manual.fonte, "MANUAL");
      assert.equal(manual.custoUnitario.toFixed(2), "12.34");
    }
    const sinapi = buscarPreco(cat, {
      categoria: "PAVIMENTACAO",
      codigo: "PAV_REVESTIMENTO",
      uf: "SC",
      competencia: "09/2026",
    });
    assert.equal(sinapi.encontrado, true);
    if (sinapi.encontrado) assert.equal(sinapi.fonte, "SINAPI");
    const param = buscarPreco(cat, {
      categoria: "PAVIMENTACAO",
      codigo: "PAV_BASE",
      uf: "SC",
      competencia: "09/2026",
    });
    assert.equal(param.encontrado, true);
    if (param.encontrado) assert.equal(param.fonte, "PARAMETRICO");
  });

  it("prioriza SICRO na terraplenagem", () => {
    const hit = buscarPreco(catalogComPreco(), {
      categoria: "TERRAPLENAGEM",
      codigo: "TER_CORTE",
      uf: "SC",
      competencia: "09/2026",
      preferirSicro: true,
    });
    assert.equal(hit.encontrado, true);
    if (hit.encontrado) assert.equal(hit.fonte, "SICRO");
  });
});

describe("importação SINAPI", () => {
  it("lê CSV com código, descrição, unidade e custo", () => {
    const csv = "codigo;descricao;unidade;custo\n101;Regularizacao;m2;10,5\n102;Base;m2;20";
    const parsed = parseTabularSinapi(parseCsv(csv));
    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rows[0]?.codigo, "101");
    assert.equal(parsed.rows[0]?.custoDesonerado, "10.5");
  });
});

describe("payload CAD → estudo", () => {
  it("grava areaTotal e quantidadeLotes no payload da sessão", () => {
    const lots = [0, 1, 2, 3, 4, 5].map((i) =>
      square(`lote_${i + 1}`, "loteamento_lotes", [i * 20, 12], 20, 30, `Lote ${i + 1}`),
    );
    const project: CadProject = {
      name: "Sessão",
      crs: "EPSG:31982",
      layers: [
        { id: "gleba", name: "GLEBA", color: "#111", visible: true, locked: false },
        { id: "loteamento_lotes", name: "LOTEAMENTO_LOTES", color: "#22c55e", visible: true, locked: false },
      ],
      entities: [square("gleba_1", "gleba", [0, 0], 120, 80, "Gleba"), ...lots],
    };
    const payload = buildViabilidadeSessionPayload({ project, glebaId: "gleba_1" });
    assert.equal(payload.quantidadeLotes, 6);
    assert.equal(payload.areaTotal, 120 * 80);
    assert.ok(payload.project);
    assert.equal(payload.project?.entities.filter((e) => e.layerId === "loteamento_lotes").length, 6);
  });

  it("montarEstudoFromCad preenche RESUMO mesmo sem SINAPI", () => {
    const lots = [0, 1, 2, 3, 4, 5].map((i) =>
      square(`lote_${i + 1}`, "loteamento_lotes", [i * 20, 12], 20, 30, `Lote ${i + 1}`),
    );
    const project: CadProject = {
      name: "Preview",
      crs: "EPSG:31982",
      layers: [
        { id: "gleba", name: "GLEBA", color: "#111", visible: true, locked: false },
        { id: "loteamento_lotes", name: "LOTEAMENTO_LOTES", color: "#22c55e", visible: true, locked: false },
      ],
      entities: [square("gleba_1", "gleba", [0, 0], 120, 80, "Gleba"), ...lots],
    };
    const estudo = montarEstudoFromCad({
      project,
      projetoId: "local",
      uf: "SC",
      competencia: null,
      premissas: defaultPremissas(),
      indiretos: {},
      adapter: { projetoId: "local", glebaId: "gleba_1" },
      catalog: emptyPriceCatalog(),
    });
    assert.equal(estudo.extraido.quantidadeLotes, 6);
    assert.equal(estudo.extraido.areaTotal, 9600);
    assert.ok(estudo.precosAusentes > 0);
  });
});

describe("pipeline do estudo", () => {
  it("não usa preço hardcoded e marca composição ausente", () => {
    const projeto = adaptCadProjectToLoteamentoInput(fixtureProject(), { projetoId: "p1" });
    const calculo = calcularEstudo({
      projeto,
      premissas: defaultPremissas({
        precoVendaM2: "200",
        percentualContingencia: "10",
      }),
      uf: "SC",
      competencia: "09/2026",
      catalog: {
        tipoSinapi: "DESONERADO",
        sinapi: [],
        sicro: [],
        parametros: [],
      },
      indiretos: { valorTerreno: "50000" },
    });
    assert.ok(calculo.itens.length > 0);
    assert.ok(calculo.itens.every((item) => item.origemValor !== "SINAPI" || item.custoUnitario.gt(0)));
    assert.ok(calculo.precosAusentes > 0);
    assert.ok(calculo.receitaEstimada.gt(0));
    assert.equal(calculo.cenarios.length, 3);
  });
});
