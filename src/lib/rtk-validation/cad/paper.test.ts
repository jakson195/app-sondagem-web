import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cadPaperFill,
  cadPaperScreenStroke,
  cadPaperSelectStroke,
  parseCadPaperTone,
} from "./paper";

describe("fundo do canvas CAD", () => {
  it("aceita branco ou preto", () => {
    assert.equal(parseCadPaperTone("white"), "white");
    assert.equal(parseCadPaperTone("black"), "black");
    assert.equal(parseCadPaperTone(null), "black");
    assert.equal(cadPaperFill("white"), "#ffffff");
    assert.equal(cadPaperFill("black"), "#000000");
  });

  it("clareia traço cadastral no fundo preto e mantém no branco", () => {
    assert.equal(cadPaperScreenStroke("#111827", "white"), "#111827");
    assert.equal(cadPaperScreenStroke("#111827", "black"), "#f1f5f9");
    assert.equal(cadPaperScreenStroke("#4ade80", "black"), "#4ade80");
    assert.equal(cadPaperSelectStroke("white"), "#0f2848");
    assert.equal(cadPaperSelectStroke("black"), "#ffffff");
  });
});
