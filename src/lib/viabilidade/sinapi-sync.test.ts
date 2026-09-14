import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { parseCsv, parseTabularSinapi } from "./sinapi-import";
import { planSinapiUpserts } from "./sinapi-store";
import {
  aliasesCompetencia,
  candidatosCompetenciaProxima,
  competenciaAtual,
  detectarCompetenciaNoTexto,
  escolherCompetenciaMaisProxima,
  mensagemFallbackCompetencia,
  mesmaCompetencia,
  normalizeTipoSinapi,
  parseCompetencia,
  resolverCompetenciaMaisProximaComDados,
  urlsOficiaisCaixa,
} from "./sinapi-caixa";
import { ordenarUfsComPrioridade, UFS_BRASIL } from "./sinapi-ufs";

const fixtureDir = dirname(fileURLToPath(import.meta.url));

describe("UFs SINAPI", () => {
  it("lista as 27 UFs e prioriza a do estudo", () => {
    assert.equal(UFS_BRASIL.length, 27);
    assert.ok(UFS_BRASIL.includes("SC"));
    assert.ok(UFS_BRASIL.includes("AM"));
    assert.deepEqual(ordenarUfsComPrioridade("SC").slice(0, 3), ["SC", "AC", "AL"]);
  });
});

describe("parse da planilha oficial (fixture)", () => {
  it("lê cabeçalho Caixa e não inventa preços", () => {
    const csv = readFileSync(join(fixtureDir, "fixtures/sinapi-caixa-sintetico.csv"), "utf8");
    const parsed = parseTabularSinapi(parseCsv(csv), "DESONERADO");
    assert.equal(parsed.rows.length, 4);
    assert.equal(parsed.rows[0]?.codigo, "87208");
    assert.equal(parsed.rows[0]?.descricao, "REGULARIZACAO DE SUBLEITO");
    assert.equal(parsed.rows[0]?.unidade, "M2");
    assert.equal(parsed.rows[0]?.custoDesonerado, "10.5");
    assert.equal(parsed.rows[0]?.custoNaoDesonerado, null);
    assert.equal(detectarCompetenciaNoTexto(csv), "09/2026");
  });

  it("tipo não desonerado preenche só a coluna correspondente", () => {
    const parsed = parseTabularSinapi(
      parseCsv("codigo;descricao;unidade;custo\n10;Item;m2;15,2"),
      "NAO_DESONERADO",
    );
    assert.equal(parsed.rows[0]?.custoNaoDesonerado, "15.2");
    assert.equal(parsed.rows[0]?.custoDesonerado, null);
  });
});

describe("upsert codigo+uf+competencia", () => {
  it("atualiza o mesmo código na mesma UF/competência e cria outra competência", () => {
    const incoming = [
      {
        codigo: "87208",
        descricao: "REGULARIZACAO",
        unidade: "M2",
        custoDesonerado: "10.5",
        custoNaoDesonerado: null,
        tipo: "DESONERADO",
      },
      {
        codigo: "87208",
        descricao: "REGULARIZACAO (dup)",
        unidade: "M2",
        custoDesonerado: "11",
        custoNaoDesonerado: null,
        tipo: "DESONERADO",
      },
    ];
    const first = planSinapiUpserts([], incoming, "SC", "09/2026");
    assert.equal(first.create.length, 1);
    assert.equal(first.update.length, 0);
    assert.equal(first.duplicatesInFile, 1);
    assert.equal(first.create[0]?.custoDesonerado, "11");

    const second = planSinapiUpserts(
      [{ codigo: "87208", uf: "SC", competencia: "09/2026" }],
      incoming.slice(0, 1),
      "SC",
      "09/2026",
    );
    assert.equal(second.create.length, 0);
    assert.equal(second.update.length, 1);

    const otherMonth = planSinapiUpserts(
      [{ codigo: "87208", uf: "SC", competencia: "09/2026" }],
      incoming.slice(0, 1),
      "SC",
      "08/2026",
    );
    assert.equal(otherMonth.create.length, 1);
    assert.equal(otherMonth.update.length, 0);

    const otherUf = planSinapiUpserts(
      [{ codigo: "87208", uf: "SC", competencia: "09/2026" }],
      incoming.slice(0, 1),
      "AM",
      "09/2026",
    );
    assert.equal(otherUf.create.length, 1);
  });
});

describe("aliases e parse de competência", () => {
  it("não troca o mês só porque outro aparece no arquivo", () => {
    const pedida = parseCompetencia("01/2020");
    assert.equal(pedida.label, "01/2020");
    assert.notEqual(pedida.label, competenciaAtual());
    const hint = detectarCompetenciaNoTexto("arquivo 09/2026");
    assert.equal(hint, "09/2026");
    assert.notEqual(hint, pedida.label);
  });

  it("trata 09/2026, 202609 e 2026-09 como a mesma competência", () => {
    assert.deepEqual(aliasesCompetencia("09/2026").sort(), ["09/2026", "2026-09", "202609"].sort());
    assert.equal(mesmaCompetencia("09/2026", "202609"), true);
    assert.equal(mesmaCompetencia("09/2026", "08/2026"), false);
  });

  it("monta URLs oficiais da Caixa com UF e YYYYMM", () => {
    const urls = urlsOficiaisCaixa("SC", "09/2026", "DESONERADO");
    assert.ok(urls.some((url) => url.includes("caixa.gov.br/Downloads/")));
    assert.ok(urls.some((url) => url.includes("SC_202609_Desonerado")));
    assert.ok(!urls.some((url) => url.includes("202608")));
    assert.equal(normalizeTipoSinapi("nao"), "NAO_DESONERADO");
    assert.equal(normalizeTipoSinapi("desonerado"), "DESONERADO");
  });
});

describe("competência mais próxima com dados", () => {
  it("escolhe 08/2026 quando 09/2026 está vazio e a mensagem inclui as duas datas", () => {
    const chosen = escolherCompetenciaMaisProxima("09/2026", ["08/2026"]);
    assert.equal(chosen, "08/2026");
    const msg = mensagemFallbackCompetencia("09/2026", "08/2026");
    assert.match(msg, /09\/2026/);
    assert.match(msg, /08\/2026/);
    assert.match(msg, /mais próxima com dados/);
  });

  it("requested 09/2026 empty, 08/2026 has rows → selects 08/2026", async () => {
    const result = await resolverCompetenciaMaisProximaComDados("09/2026", (comp) => comp === "08/2026");
    assert.ok(result);
    assert.equal(result?.competencia, "08/2026");
    assert.equal(result?.fallbackUsado, true);
    assert.match(result?.avisoFallback ?? "", /09\/2026/);
    assert.match(result?.avisoFallback ?? "", /08\/2026/);
  });

  it("prefere o mês anterior mais recente ao posterior", () => {
    assert.deepEqual(candidatosCompetenciaProxima("09/2026").slice(0, 3), ["08/2026", "07/2026", "06/2026"]);
    assert.equal(candidatosCompetenciaProxima("09/2026")[12], "10/2026");
    assert.equal(escolherCompetenciaMaisProxima("09/2026", ["07/2026", "10/2026"]), "07/2026");
  });

  it("usa o mês seguinte se não houver anterior na janela", () => {
    assert.equal(escolherCompetenciaMaisProxima("09/2026", ["10/2026"]), "10/2026");
  });

  it("não inventa competência fora da janela de 12 meses", () => {
    assert.equal(escolherCompetenciaMaisProxima("09/2026", ["08/2025"]), null);
  });

  it("aceita aliases 202608 no banco", () => {
    assert.equal(escolherCompetenciaMaisProxima("202609", ["202608"]), "08/2026");
  });
});
