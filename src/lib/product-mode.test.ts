import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  filterModulesByProductMode,
  filterNavByProductMode,
  getProductMode,
  isLoteamentoProductMode,
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
  it("trata unset e FULL como catálogo completo", () => {
    delete process.env.NEXT_PUBLIC_PRODUCT_MODE;
    assert.equal(getProductMode(), "FULL");
    assert.equal(isLoteamentoProductMode(), false);
    assert.equal(isProductVisibleHref("/spt"), true);

    process.env.NEXT_PUBLIC_PRODUCT_MODE = "FULL";
    assert.equal(getProductMode(), "FULL");
    assert.equal(isProductVisibleHref("/geofisica"), true);
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
});
