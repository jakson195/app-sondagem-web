import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assinaturaAtiva,
  buscarEmpresas,
  buscarMunicipios,
  distanciaKm,
  municipioPorCodigo,
  type PerfilDiretorio,
} from "./core";

const CRICIUMA = 4204608;
const cidade = (codigo: number) => {
  const m = municipioPorCodigo(codigo);
  assert.ok(m, `município ${codigo}`);
  return m;
};
const busca = (nome: string, uf: string) => buscarMunicipios(`${nome} ${uf}`, 1)[0]!;

let seq = 1;
function perfil(nome: string, codigoIbge: number, extra: Partial<PerfilDiretorio> = {}): PerfilDiretorio {
  const m = cidade(codigoIbge);
  return {
    empresaId: seq++,
    nome,
    visivel: true,
    codigoIbge,
    cidade: m.nome,
    uf: m.uf,
    latitude: m.lat,
    longitude: m.lon,
    raioKm: 50,
    servicos: ["topografia", "projeto_urbanistico"],
    registroVerificado: false,
    ativa: true,
    ...extra,
  };
}

describe("municípios do IBGE", () => {
  it("acha Criciúma com ou sem acento/UF e pelo começo do nome", () => {
    assert.equal(cidade(CRICIUMA).nome, "Criciúma");
    assert.equal(buscarMunicipios("criciuma")[0]?.codigoIbge, CRICIUMA);
    assert.equal(buscarMunicipios("Criciúma/SC")[0]?.codigoIbge, CRICIUMA);
    assert.equal(buscarMunicipios("crici")[0]?.codigoIbge, CRICIUMA);
  });

  it("filtra por UF quando informada", () => {
    const r = buscarMunicipios("bom jesus sc", 20);
    assert.ok(r.length > 0 && r.every((m) => m.uf === "SC"));
  });

  it("distâncias plausíveis: Criciúma–Içara < 15 km, Criciúma–Florianópolis 130–210 km", () => {
    assert.ok(distanciaKm(cidade(CRICIUMA), busca("Içara", "SC")) < 15);
    const d = distanciaKm(cidade(CRICIUMA), busca("Florianópolis", "SC"));
    assert.ok(d > 130 && d < 210, `${d}`);
  });
});

describe("assinatura ativa", () => {
  const agora = new Date("2026-11-16T12:00:00Z");
  it("ACTIVE no período (3 dias de tolerância) e TRIAL válido entram", () => {
    assert.equal(assinaturaAtiva({ status: "ACTIVE", currentPeriodEnd: "2026-11-30" }, null, agora), true);
    assert.equal(assinaturaAtiva({ status: "ACTIVE", currentPeriodEnd: "2026-11-14" }, null, agora), true);
    assert.equal(assinaturaAtiva({ status: "TRIAL", trialEndsAt: "2026-11-20" }, null, agora), true);
  });
  it("vencida, teste expirado, suspensa ou cancelada saem", () => {
    assert.equal(assinaturaAtiva({ status: "ACTIVE", currentPeriodEnd: "2026-11-01" }, null, agora), false);
    assert.equal(assinaturaAtiva({ status: "TRIAL", trialEndsAt: "2026-11-10" }, null, agora), false);
    assert.equal(assinaturaAtiva({ status: "SUSPENDED" }, null, agora), false);
    assert.equal(assinaturaAtiva({ status: "CANCELLED" }, "ACTIVE", agora), false);
  });
  it("conta antiga sem assinatura usa o status da empresa", () => {
    assert.equal(assinaturaAtiva(null, "ACTIVE", agora), true);
    assert.equal(assinaturaAtiva(null, "SUSPENDED", agora), false);
  });
});

describe("busca por região", () => {
  const icara = busca("Içara", "SC");
  const tubarao = busca("Tubarão", "SC");
  const floripa = busca("Florianópolis", "SC");
  const portoAlegre = busca("Porto Alegre", "RS");
  const perfis = [
    perfil("Longe RS", portoAlegre.codigoIbge),
    perfil("Floripa que atende o estado", floripa.codigoIbge, { raioKm: 250 }),
    perfil("Tubarão", tubarao.codigoIbge),
    perfil("Içara verificada", icara.codigoIbge, { registroVerificado: true }),
    perfil("Criciúma", CRICIUMA),
    perfil("Oculta", CRICIUMA, { visivel: false }),
    perfil("Assinatura vencida", CRICIUMA, { ativa: false }),
    perfil("Só sondagem", CRICIUMA, { servicos: ["sondagem"] }),
  ];

  it("só visíveis e ativas, perto ou com atuação que cobre a cidade", () => {
    const nomes = buscarEmpresas(perfis, cidade(CRICIUMA), { raioBuscaKm: 80 }).map((e) => e.nome);
    assert.ok(!nomes.includes("Oculta"));
    assert.ok(!nomes.includes("Assinatura vencida"));
    assert.ok(!nomes.includes("Longe RS"));
    assert.ok(nomes.includes("Floripa que atende o estado"), "raio de atuação 250 km cobre Criciúma");
    assert.ok(nomes.includes("Tubarão"));
  });

  it("ordem: mesma cidade, quem atende, verificada, distância", () => {
    const r = buscarEmpresas(perfis, cidade(CRICIUMA), { raioBuscaKm: 80 });
    assert.equal(r[0]?.mesmaCidade, true);
    const i = r.findIndex((e) => e.nome === "Içara verificada");
    const t = r.findIndex((e) => e.nome === "Tubarão");
    assert.ok(i > -1 && i < t);
  });

  it("filtra por serviço", () => {
    const r = buscarEmpresas(perfis, cidade(CRICIUMA), { raioBuscaKm: 80, servico: "sondagem" });
    assert.deepEqual(r.map((e) => e.nome), ["Só sondagem"]);
  });
});
