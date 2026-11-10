import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buscarPreco, type PriceCatalog, type SinapiRow } from "./custos";
import { itensEsgoto, itensPavimentacao } from "./infraestrutura";
import { defaultPremissas } from "./premissas-default";
import { vincularSinapiPorDescricao } from "./sinapi-match";
import type { QuantitativoExtraido } from "./types";

const extraido: QuantitativoExtraido = {
  areaTotal: 20000,
  areaLotes: 12000,
  quantidadeLotes: 40,
  areaMediaLote: 300,
  areaMinimaLote: 280,
  areaMaximaLote: 360,
  testadaMinima: 12,
  testadaMedia: 12,
  areaVias: 1000,
  comprimentoTotalVias: 100,
  larguraMediaVias: 10,
  areaVerde: 0,
  areaInstitucional: 0,
  areaApp: 0,
  areaCalcadas: 400,
  comprimentoCalcadas: 200,
};
const qty = (itens: { codigo: string; quantidade: { toNumber(): number } }[], codigo: string) =>
  itens.find((i) => i.codigo === codigo)?.quantidade.toNumber();

const row = (codigo: string, descricao: string, unidade: string, custo: number): SinapiRow => ({
  codigo,
  descricao,
  unidade,
  uf: "SC",
  competencia: "2026-09",
  custoDesonerado: custo,
  custoNaoDesonerado: custo * 1.1,
});
/** Descrições reais do SINAPI, com composições parecidas que NÃO devem ser escolhidas. */
const SINAPI: SinapiRow[] = [
  row("101849", "RECOMPOSIÇÃO DE BASE E OU SUB-BASE PARA FECHAMENTO DE VALAS DE BRITA GRADUADA SIMPLES - INCLUSO RETIRADA E COLOCAÇÃO DO MATERIAL. AF_12/2020", "M3", 174),
  row("96393", "USINAGEM DE BRITA GRADUADA SIMPLES. AF_09/2025", "M3", 142),
  row("96396", "CONSTRUÇÃO DE BASE E SUB-BASE PARA PAVIMENTAÇÃO DE BRITA GRADUADA SIMPLES, COM ESPESSURA DE 15 CM - EXCLUSIVE CARGA E TRANSPORTE. AF_09/2024", "M3", 190),
  row("96397", "CONSTRUÇÃO DE BASE E SUB-BASE PARA PAVIMENTAÇÃO DE BRITA GRADUADA SIMPLES TRATADA COM CIMENTO, COM ESPESSURA DE 15 CM - EXCLUSIVE CARGA E TRANSPORTE. AF_09/2024", "M3", 221),
  row("94273", "ASSENTAMENTO DE GUIA (MEIO-FIO) EM TRECHO RETO, CONFECCIONADA EM CONCRETO PRÉ-FABRICADO, DIMENSÕES 100X15X13X30 CM (COMPRIMENTO X BASE INFERIOR X BASE SUPERIOR X ALTURA). AF_01/2024", "M", 46),
  row("94274", "ASSENTAMENTO DE GUIA (MEIO-FIO) EM TRECHO CURVO, CONFECCIONADA EM CONCRETO PRÉ-FABRICADO, DIMENSÕES 100X15X13X30 CM (COMPRIMENTO X BASE INFERIOR X BASE SUPERIOR X ALTURA). AF_01/2024", "M", 50),
  row("94279", "ASSENTAMENTO DE GUIA (MEIO-FIO) EM TRECHO RETO, CONFECCIONADA EM CONCRETO PRÉ-FABRICADO, DIMENSÕES 39X6,5X6,5X19 CM (COMPRIMENTO X BASE INFERIOR X BASE SUPERIOR X ALTURA), PARA DELIMITAÇÃO DE JARDINS, PRAÇAS OU PASSEIOS. AF_01/2024", "M", 35),
  row("95995", "EXECUÇÃO DE PAVIMENTO COM APLICAÇÃO DE CONCRETO ASFÁLTICO, CAMADA DE ROLAMENTO - EXCLUSIVE CARGA E TRANSPORTE. AF_10/2025", "M3", 1532),
  row("95996", "EXECUÇÃO DE PAVIMENTO COM APLICAÇÃO DE CONCRETO ASFÁLTICO, CAMADA DE BINDER - EXCLUSIVE CARGA E TRANSPORTE. AF_10/2025", "M3", 1400),
  row("92397", "EXECUÇÃO DE PAVIMENTO EM PISO INTERTRAVADO, COM BLOCO RETANGULAR COR NATURAL DE 20 X 10 CM, ESPESSURA 6 CM. AF_10/2022", "M2", 99),
  row("92404", "EXECUÇÃO DE PAVIMENTO EM PISO INTERTRAVADO, COM BLOCO 16 FACES DE 22 X 11 CM, ESPESSURA 8 CM. AF_10/2022", "M2", 106),
  row("101868", "REASSENTAMENTO DE BLOCOS 16 FACES PARA PISO INTERTRAVADO, ESPESSURA DE 6 CM, EM VIA/ESTACIONAMENTO, COM REAPROVEITAMENTO DOS BLOCOS 16 FACES - INCLUSO RETIRADA E COLOCAÇÃO DO MATERIAL. AF_12/2020", "M2", 39),
  row("90695", "TUBO DE PVC PARA REDE COLETORA DE ESGOTO DE PAREDE MACIÇA, DN 150 MM, JUNTA ELÁSTICA - FORNECIMENTO E ASSENTAMENTO. AF_01/2021", "M", 110),
  row("90701", "TUBO DE PVC CORRUGADO DE DUPLA PAREDE PARA REDE COLETORA DE ESGOTO, DN 150 MM, JUNTA ELÁSTICA - FORNECIMENTO E ASSENTAMENTO. AF_01/2021", "M", 82),
  row("104086", "TUBO, PVC OCRE, JUNTA ELÁSTICA, DN 150 MM, PARA COLETOR PREDIAL DE ESGOTO. AF_06/2022", "M", 121),
  row("92210", "TUBO DE CONCRETO PARA REDES COLETORAS DE ÁGUAS PLUVIAIS, DIÂMETRO DE 400 MM, JUNTA RÍGIDA, INSTALADO EM LOCAL COM BAIXO NÍVEL DE INTERFERÊNCIAS - FORNECIMENTO E ASSENTAMENTO. AF_03/2024", "M", 186),
  row("92219", "TUBO DE CONCRETO PARA REDES COLETORAS DE ÁGUAS PLUVIAIS, DIÂMETRO DE 400 MM, JUNTA RÍGIDA, INSTALADO EM LOCAL COM ALTO NÍVEL DE INTERFERÊNCIAS - FORNECIMENTO E ASSENTAMENTO. AF_03/2024", "M", 190),
  row("92821", "ASSENTAMENTO DE TUBO DE CONCRETO PARA REDES COLETORAS DE ÁGUAS PLUVIAIS, DIÂMETRO DE 400 MM, JUNTA RÍGIDA, INSTALADO EM LOCAL COM ALTO NÍVEL DE INTERFERÊNCIAS (NÃO INCLUI FORNECIMENTO). AF_03/2024", "M", 47),
  row("95568", "TUBO DE CONCRETO (SIMPLES) PARA REDES COLETORAS DE ÁGUAS PLUVIAIS, DIÂMETRO DE 400 MM, JUNTA RÍGIDA, INSTALADO EM LOCAL COM BAIXO NÍVEL DE INTERFERÊNCIAS - FORNECIMENTO E ASSENTAMENTO. AF_03/2024", "M", 130),
];

describe("pavimentação por camadas", () => {
  it("asfalto: sub-base, base e CBUQ em m³; meio-fio e sarjeta dos dois lados", () => {
    const { itens } = itensPavimentacao(extraido, defaultPremissas({ tipoPavimento: "CBUQ" }));
    assert.equal(qty(itens, "PAV_REGULARIZACAO"), 1000);
    assert.equal(qty(itens, "PAV_SUBBASE"), 150);
    assert.equal(qty(itens, "PAV_BASE"), 150);
    assert.equal(qty(itens, "PAV_REVESTIMENTO"), 40);
    assert.equal(qty(itens, "PAV_IMPRIMACAO"), 1000);
    assert.equal(qty(itens, "PAV_MEIO_FIO"), 200);
    assert.equal(qty(itens, "PAV_SARJETA"), 200);
  });

  it("lajota: sem imprimação nem sarjeta; espessuras informadas mudam o volume", () => {
    const { itens } = itensPavimentacao(
      extraido,
      defaultPremissas({ tipoPavimento: "LAJOTA", espessuraSubBaseCm: "25", espessuraBaseCm: "10" }),
    );
    assert.equal(qty(itens, "PAV_LAJOTA"), 1000);
    assert.equal(qty(itens, "PAV_SUBBASE"), 250);
    assert.equal(qty(itens, "PAV_BASE"), 100);
    assert.equal(qty(itens, "PAV_IMPRIMACAO"), undefined);
    assert.equal(qty(itens, "PAV_SARJETA"), undefined);
    assert.equal(qty(itens, "PAV_MEIO_FIO"), 200);
  });
});

describe("rede de esgoto automática", () => {
  it("rede pelos eixos, PVs a cada 80 m e nas pontas, vala e ligações", () => {
    const projeto = { eixos: [{ id: "a", comprimento: 100 }, { id: "b", comprimento: 200 }] } as never;
    const { itens } = itensEsgoto(extraido, defaultPremissas({ sistemaPublicoEsgoto: true }), projeto);
    assert.equal(qty(itens, "ESG_REDE"), 300);
    assert.equal(qty(itens, "ESG_PV"), 6);
    assert.equal(qty(itens, "ESG_LIGACAO"), 40);
    assert.ok(Math.abs((qty(itens, "ESG_ESCAVACAO") ?? 0) - 300 * 0.65 * 1.5) < 1e-6);
    assert.ok((qty(itens, "ESG_REATERRO") ?? 0) < (qty(itens, "ESG_ESCAVACAO") ?? 0));
  });
});

describe("vínculo SINAPI pela descrição", () => {
  const casos: Array<[string, string]> = [
    ["PAV_BASE", "96396"],
    ["PAV_SUBBASE", "96396"],
    ["PAV_MEIO_FIO", "94273"],
    ["PAV_REVESTIMENTO", "95995"],
    ["PAV_LAJOTA", "92404"],
    ["ESG_REDE", "90695"],
    ["DRE_TUBO_400", "92210"],
  ];
  for (const [interno, esperado] of casos) {
    it(`${interno} → ${esperado}`, () => {
      assert.equal(vincularSinapiPorDescricao(SINAPI, interno)?.row.codigo, esperado);
    });
  }

  it("bloco retangular de 6 cm é aceito quando é o único de via", () => {
    assert.equal(vincularSinapiPorDescricao(SINAPI, "PAV_BLOCO")?.row.codigo, "92397");
  });

  it("buscarPreco usa o vínculo e respeita desonerado / não desonerado", () => {
    const catalog: PriceCatalog = { sinapi: SINAPI, sicro: [], parametros: [], tipoSinapi: "NAO_DESONERADO" };
    const hit = buscarPreco(catalog, { categoria: "PAVIMENTACAO", codigo: "PAV_MEIO_FIO", uf: "SC", competencia: "2026-09" });
    assert.equal(hit.encontrado, true);
    if (hit.encontrado) {
      assert.equal(hit.codigo, "94273");
      assert.equal(hit.custoUnitario.toNumber(), 46 * 1.1);
      assert.equal(hit.vinculoAutomatico, true);
    }
  });

  it("sem composição compatível fica ausente (não inventa preço)", () => {
    const catalog: PriceCatalog = { sinapi: SINAPI, sicro: [], parametros: [], tipoSinapi: "DESONERADO" };
    const hit = buscarPreco(catalog, { categoria: "ESGOTO", codigo: "ESG_PV", uf: "SC", competencia: "2026-09" });
    assert.equal(hit.encontrado, false);
  });
});
