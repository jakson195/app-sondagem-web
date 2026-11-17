/**
 * Benchmark do custo de CPU por quadro do desenho do CAD (o que roda a cada render:
 * pan, zoom, seleção, arrasto). Gera loteamentos sintéticos com 100, 1.000 e 10.000 lotes
 * e mede as funções que o renderEntity chama para cada entidade.
 *
 * Uso: npx tsx scripts/bench/cad-render-bench.ts
 */
import { buildCadastralLotPlanTexts, lotMinSpanM } from "../../src/lib/rtk-validation/cad/plan-annotation-labels";
import { listReurbLots } from "../../src/lib/rtk-validation/cad/reurb";
import { findLoteamentoLotAtPoint } from "../../src/lib/rtk-validation/cad/loteamento-tools";
import type { CadPolylineEntity, CadProject } from "../../src/lib/rtk-validation/cad/types";

export function loteamentoSintetico(nLotes: number): CadProject {
  const testada = 12;
  const prof = 25;
  const via = 12;
  const porFila = 20; // lotes por fileira; quadra = 2 fileiras
  const porQuadra = porFila * 2;
  const nQuadras = Math.ceil(nLotes / porQuadra);
  const colunas = Math.ceil(Math.sqrt(nQuadras));
  const larguraQuadra = porFila * testada;
  const alturaQuadra = prof * 2;
  const ox = 600000;
  const oy = 7000000;
  const entities: CadPolylineEntity[] = [];
  let n = 0;
  for (let q = 0; q < nQuadras && n < nLotes; q++) {
    const qx = ox + (q % colunas) * (larguraQuadra + via);
    const qy = oy + Math.floor(q / colunas) * (alturaQuadra + via);
    for (let fila = 0; fila < 2; fila++) {
      for (let i = 0; i < porFila && n < nLotes; i++) {
        const x0 = qx + i * testada;
        const y0 = qy + fila * prof;
        entities.push({
          id: `lote-${n}`,
          type: "polyline",
          layerId: "loteamento_lotes",
          closed: true,
          name: `Quadra ${q + 1} — ${fila * porFila + i + 1}`,
          vertices: [
            { x: x0, y: y0, z: 0 },
            { x: x0 + testada, y: y0, z: 0 },
            { x: x0 + testada, y: y0 + prof, z: 0 },
            { x: x0, y: y0 + prof, z: 0 },
          ],
        });
        n++;
      }
    }
    // via acima da quadra
    entities.push({
      id: `via-${q}`,
      type: "polyline",
      layerId: "loteamento_vias",
      closed: true,
      name: `Rua ${q + 1}`,
      vertices: [
        { x: qx, y: qy + alturaQuadra, z: 0 },
        { x: qx + larguraQuadra, y: qy + alturaQuadra, z: 0 },
        { x: qx + larguraQuadra, y: qy + alturaQuadra + via, z: 0 },
        { x: qx, y: qy + alturaQuadra + via, z: 0 },
      ],
    });
  }
  return {
    name: `bench-${nLotes}`,
    crs: "EPSG:31982",
    layers: [
      { id: "loteamento_lotes", name: "LOTES", color: "#fff", visible: true, locked: false },
      { id: "loteamento_vias", name: "VIAS", color: "#fff", visible: true, locked: false },
    ],
    entities,
  } as CadProject;
}

/** O que o render faz hoje para desenhar os lotes, sem cache (como no código atual). */
export function quadroAtual(project: CadProject) {
  const lots = listReurbLots(project);
  const lotIndexById = new Map(lots.map((lot, i) => [lot.id, i]));
  const streets = project.entities.filter(
    (e): e is CadPolylineEntity => e.type === "polyline" && Boolean(e.closed) && e.layerId === "loteamento_vias",
  );
  let textos = 0;
  for (const e of project.entities) {
    if (e.type !== "polyline" || !e.closed) continue;
    lotMinSpanM(e.vertices);
    if (e.layerId === "loteamento_lotes") {
      textos += buildCadastralLotPlanTexts(e, lotIndexById.get(e.id) ?? 0, { streets }).length;
      lotMinSpanM(e.vertices);
    }
  }
  return textos;
}

import { caixaDe, caixasSeTocam } from "../../src/lib/rtk-validation/cad/bbox-cache";

/** Mesma lógica do CAD otimizado: caches por identidade + recorte da vista + nível de detalhe. */
const cacheTextos = new WeakMap<CadPolylineEntity, { vias: CadPolylineEntity[]; index: number; n: number }>();
const cacheVias = new WeakMap<object, CadPolylineEntity[]>();
export function quadroOtimizado(project: CadProject, vista: { minX: number; minY: number; maxX: number; maxY: number }, larguraPx = 1400) {
  const lots = listReurbLots(project);
  const idx = new Map(lots.map((lot, i) => [lot.id, i]));
  let vias = cacheVias.get(project.entities);
  if (!vias) {
    vias = project.entities.filter((e): e is CadPolylineEntity => e.type === "polyline" && Boolean(e.closed) && e.layerId === "loteamento_vias");
    cacheVias.set(project.entities, vias);
  }
  const pxPorM = larguraPx / (vista.maxX - vista.minX);
  let desenhados = 0;
  let textos = 0;
  for (const e of project.entities) {
    if (e.type !== "polyline" || !e.closed) continue;
    const cx = caixaDe(e.vertices);
    if (!caixasSeTocam(cx, vista)) continue;
    desenhados++;
    if (e.layerId !== "loteamento_lotes") continue;
    if (Math.min(cx.maxX - cx.minX, cx.maxY - cx.minY) * pxPorM < 14) continue;
    const i = idx.get(e.id) ?? 0;
    const hit = cacheTextos.get(e);
    if (hit && hit.vias === vias && hit.index === i) {
      textos += hit.n;
      continue;
    }
    const n = buildCadastralLotPlanTexts(e, i, { streets: vias }).length;
    cacheTextos.set(e, { vias, index: i, n });
    textos += n;
  }
  return { desenhados, textos };
}

function medir(nome: string, fn: () => unknown, repeticoes: number) {
  fn(); // aquece
  const t0 = performance.now();
  for (let i = 0; i < repeticoes; i++) fn();
  const ms = (performance.now() - t0) / repeticoes;
  return { nome, ms };
}

if (process.argv[1]?.includes("cad-render-bench")) {
  for (const n of [100, 1000, 10000]) {
    const p = loteamentoSintetico(n);
    const rep = n >= 10000 ? 2 : n >= 1000 ? 5 : 30;
    const q = medir("quadro (lotes + textos)", () => quadroAtual(p), rep);
    const lot = p.entities.find((e): e is CadPolylineEntity => e.type === "polyline" && e.layerId === "loteamento_lotes")!;
    const hover = medir("lote sob o mouse (findLoteamentoLotAtPoint)", () => findLoteamentoLotAtPoint(p, lot.vertices[0]!.x + 1, lot.vertices[0]!.y + 1), rep * 5);
    // otimizado: vista inteira (lotes pequenos, sem texto) e vista aproximada (~250 m)
    const tudo = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const e of p.entities) if (e.type === "polyline") { const c = caixaDe(e.vertices); tudo.minX = Math.min(tudo.minX, c.minX); tudo.minY = Math.min(tudo.minY, c.minY); tudo.maxX = Math.max(tudo.maxX, c.maxX); tudo.maxY = Math.max(tudo.maxY, c.maxY); }
    const perto = { minX: tudo.minX, minY: tudo.minY, maxX: tudo.minX + 250, maxY: tudo.minY + 160 };
    const frioPerto = medir("frio perto", () => { const c = loteamentoSintetico(0); void c; }, 1); void frioPerto;
    const t0 = performance.now(); const r1 = quadroOtimizado(p, perto); const frio = performance.now() - t0;
    const quentePerto = medir("perto", () => quadroOtimizado(p, perto), rep * 4);
    const quenteTudo = medir("tudo", () => quadroOtimizado(p, tudo), rep * 4);
    const rTudo = quadroOtimizado(p, tudo);
    console.log(`         otimizado | vista inteira: ${quenteTudo.ms.toFixed(2)} ms (${rTudo.desenhados} desenhados, ${rTudo.textos} textos) | aproximado: 1º quadro ${frio.toFixed(1)} ms, pan ${quentePerto.ms.toFixed(2)} ms (${r1.desenhados} desenhados)`);
    console.log(
      `${String(n).padStart(6)} lotes | ${p.entities.length} entidades | quadro: ${q.ms.toFixed(1)} ms (${(1000 / q.ms).toFixed(1)} quadros/s máx) | hover: ${hover.ms.toFixed(2)} ms`,
    );
  }
}
