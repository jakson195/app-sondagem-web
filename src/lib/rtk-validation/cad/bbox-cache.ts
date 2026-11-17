import type { CadVertex } from "./types";

export type Caixa = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Caixa envolvente de uma lista de vértices, guardada por identidade do array.
 * As entidades do CAD são imutáveis (editar cria um array novo), então o cache nunca fica velho.
 */
const cache = new WeakMap<readonly CadVertex[], Caixa>();

export function caixaDe(vertices: readonly CadVertex[]): Caixa {
  const hit = cache.get(vertices);
  if (hit) return hit;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }
  const c = { minX, minY, maxX, maxY };
  cache.set(vertices, c);
  return c;
}

export function caixasSeTocam(a: Caixa, b: Caixa, folga = 0): boolean {
  return a.minX - folga <= b.maxX && b.minX - folga <= a.maxX && a.minY - folga <= b.maxY && b.minY - folga <= a.maxY;
}

export function pontoNaCaixa(x: number, y: number, c: Caixa, folga = 0): boolean {
  return x >= c.minX - folga && x <= c.maxX + folga && y >= c.minY - folga && y <= c.maxY + folga;
}
