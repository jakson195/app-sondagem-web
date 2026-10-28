import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  filterModulesByProductMode,
  filterNavByProductMode,
  getProductMode,
  isLoteamentoProductMode,
  isSondagemProductMode,
  isProductVisibleHref,
  isProductVisibleMarketingHref,
} from "./product-mode";

const original = process.env.NEXT_PUBLIC_PRODUCT_MODE;

afterEach(() => {
  if (original === undefined) {
    delete process.env.NEXT_PUBLIC_PRODUCT_MODE;
  } else {
    process.env.NEXT_PUBLIC_PRODUCT_MODE = original;
  }
});

describe("product-mode", () => {
  it("trata omitido como LOTEAMENTO e FULL como catálogo completo", () => {
    delete process.env.NEXT_PUBLIC_PRODUCT_MODE;
    assert.equal(getProductMode(), "LOTEAMENTO");
    assert.equal(isLoteamentoProductMode(), true);
    assert.equal(isSondagemProductMode(), false);
    assert.equal(isProductVisibleHref("/spt"), false);

    process.env.NEXT_PUBLIC_PRODUCT_MODE = "FULL";
    assert.equal(getProductMode(), "FULL");
    assert.equal(isProductVisibleHref("/geofisica"), true);
    assert.equal(isProductVisibleHref("/spt"), true);
  });

  it("em LOTEAMENTO só deixa CAD, GEO, viabilidade e o painel", () => {
    process.env.NEXT_PUBLIC_PRODUCT_MODE = "LOTEAMENTO";
    assert.equal(isLoteamentoProductMode(), true);
    assert.equal(isProductVisibleHref("/cad"), true);
    assert.equal(isProductVisibleHref("/cadastro"), false);
    assert.equal(isProductVisibleHref("/cad/foo"), true);
    assert.equal(isProductVisibleHref("/geo?tab=midia"), true);
    assert.equal(isProductVisibleHref("/geo/temporal"), true);
    assert.equal(isProductVisibleHref("/viabilidade"), true);
    assert.equal(isProductVisibleHref("/dashboard"), true);
    assert.equal(isProductVisibleHref("/spt"), false);
    assert.equal(isProductVisibleHref("/ntrip"), false);
    assert.equal(isProductVisibleHref("/geofisica"), false);
    assert.equal(isProductVisibleHref("/digital-twin"), false);
    assert.equal(isProductVisibleHref("/obra"), false);

    const nav = filterNavByProductMode([
      { href: "/geo", label: "🧭 GEO" },
      { href: "/spt", label: "📊 Sondagem SPT" },
      { href: "/cad", label: "📐 Ambiente CAD" },
    ]);
    assert.deepEqual(
      nav.map((item) => item.href),
      ["/geo", "/cad"],
    );

    const cards = filterModulesByProductMode([
      { id: "spt" },
      { id: "cad" },
      { id: "geo" },
      { id: "viabilidade" },
      { id: "digital-twin" },
    ]);
    assert.deepEqual(
      cards.map((item) => item.id),
      ["cad", "geo", "viabilidade"],
    );

    assert.equal(isProductVisibleMarketingHref("/#galeria-sondagens"), false);
    assert.equal(isProductVisibleMarketingHref("/#como-funciona"), false);
    assert.equal(isProductVisibleMarketingHref("/funcionalidades"), true);
  });

  it("em SONDAGEM deixa campo, obras e relatórios e esconde loteamento e twin", () => {
    process.env.NEXT_PUBLIC_PRODUCT_MODE = "SONDAGEM";
    assert.equal(isSondagemProductMode(), true);
    assert.equal(isLoteamentoProductMode(), false);
    assert.equal(isProductVisibleHref("/spt"), true);
    assert.equal(isProductVisibleHref("/spt/12"), true);
    assert.equal(isProductVisibleHref("/rotativa"), true);
    assert.equal(isProductVisibleHref("/trado"), true);
    assert.equal(isProductVisibleHref("/pocos"), true);
    assert.equal(isProductVisibleHref("/relatorio"), true);
    assert.equal(isProductVisibleHref("/obra"), true);
    assert.equal(isProductVisibleHref("/obra/4"), true);
    assert.equal(isProductVisibleHref("/obras"), true);
    assert.equal(isProductVisibleHref("/geofisica"), true);
    assert.equal(isProductVisibleHref("/dashboard"), true);
    assert.equal(isProductVisibleHref("/cad"), false);
    assert.equal(isProductVisibleHref("/geo"), false);
    assert.equal(isProductVisibleHref("/viabilidade"), false);
    assert.equal(isProductVisibleHref("/digital-twin"), false);
    assert.equal(isProductVisibleHref("/taludes"), false);
    assert.equal(isProductVisibleHref("/hidrologia/hidrogeo-brasil"), false);

    const nav = filterNavByProductMode([
      { href: "/geo", label: "🧭 GEO" },
      { href: "/spt", label: "📊 Sondagem SPT" },
      { href: "/cad", label: "📐 Ambiente CAD" },
      { href: "/rotativa", label: "🌀 Sondagem Rotativa" },
    ]);
    assert.deepEqual(
      nav.map((item) => item.href),
      ["/spt", "/rotativa"],
    );

    const cards = filterModulesByProductMode([
      { id: "spt" },
      { id: "cad" },
      { id: "geo" },
      { id: "viabilidade" },
      { id: "digital-twin" },
      { id: "relatorios" },
      { id: "obras" },
    ]);
    assert.deepEqual(
      cards.map((item) => item.id),
      ["spt", "relatorios", "obras"],
    );

    assert.equal(isProductVisibleMarketingHref("/#galeria-sondagens"), true);
  });
});
