/**
 * Rede coletora de esgoto do loteamento (NBR 9649 / NBR 14486).
 *
 * Traçado: um coletor no eixo de cada rua, PVs nos cruzamentos, nas pontas e a cada ≤ 80 m.
 * A malha vira uma árvore até o ponto de lançamento (o PV mais baixo das pontas); trechos que
 * fechariam anel começam numa ponta seca (PS/TL). Cada lote liga no trecho mais próximo.
 *
 * Cálculo por trecho, de montante para jusante:
 *  Qmed = hab · q · C / 86400;  Qi = K2·Qmed_ini + Qinf;  Qf = K1·K2·Qmed + Qinf  (mín. 1,5 L/s)
 *  Imin = 0,0055 · Qi^-0,47 (m/m);  DN ≥ 150 mm;  y/D ≤ 0,75 com Qf;  σ = γ·Rh·I ≥ 1,0 Pa com Qi
 *  recobrimento mínimo sobre a geratriz superior; se V > Vc = 6·√(g·Rh), y/D ≤ 0,50.
 * É um pré-dimensionamento: o projeto executivo segue as regras da concessionária.
 */
import { extractSurveyElevationPoints } from "./contour";
import { listReservaRings, pipeIntersectsReserva, placePvsAlongVia, pointInAnyReserva, sampleGroundZ, streetAxes, type DrainageStation } from "./loteamento-drainage";
import { pointInPolygon } from "./polygon-utils";
import { LOTEAMENTO_LOTES_LAYER_ID } from "./reurb";
import { buildStreetAlignments } from "./street-profile";
import type { CadEsgotoStatus, CadLayer, CadPointEntity, CadPolylineEntity, CadProject } from "./types";

export const ESGOTO_PV_LAYER: CadLayer = {
  id: "esgoto_pv",
  name: "ESGOTO_PV",
  color: "#7c2d12",
  textColor: "#7c2d12",
  textSize: 10,
  lineWidth: 2,
  visible: true,
  locked: false,
};
export const ESGOTO_REDE_LAYER: CadLayer = {
  id: "esgoto_rede",
  name: "ESGOTO_REDE",
  color: "#9a3412",
  textColor: "#9a3412",
  textSize: 10,
  lineWidth: 3,
  visible: true,
  locked: false,
};
export const ESGOTO_LIGACOES_LAYER: CadLayer = {
  id: "esgoto_ligacoes",
  name: "ESGOTO_LIGACOES",
  color: "#ea580c",
  textColor: "#9a3412",
  textSize: 8,
  lineWidth: 0.9,
  lineType: "dashed",
  visible: true,
  locked: false,
};
export const ESGOTO_LAYER_IDS = new Set([ESGOTO_PV_LAYER.id, ESGOTO_REDE_LAYER.id, ESGOTO_LIGACOES_LAYER.id]);

export const ESGOTO_DIAMETROS_MM = [150, 200, 250, 300, 350, 400, 450, 500, 600] as const;

export type EsgotoParams = {
  /** Habitantes por lote. */
  habPorLote: number;
  /** Consumo per capita (L/hab·dia). */
  perCapitaLhd: number;
  /** Coeficiente de retorno. */
  coefRetorno: number;
  k1: number;
  k2: number;
  /** Taxa de infiltração (L/s·km). */
  infiltracaoLsKm: number;
  /** Ocupação dos lotes no início de plano (0–1). */
  ocupacaoInicial: number;
  diametroMinMm: number;
  /** Recobrimento mínimo sobre o tubo (m). */
  recobrimentoMinM: number;
  /** Distância máxima entre PVs (m). */
  distMaxPvM: number;
  laminaMax: number;
  tensaoMinPa: number;
  nManning: number;
  profundidadeMaxM: number;
  material: string;
};

export const DEFAULT_ESGOTO_PARAMS: EsgotoParams = {
  habPorLote: 3.5,
  perCapitaLhd: 160,
  coefRetorno: 0.8,
  k1: 1.2,
  k2: 1.5,
  infiltracaoLsKm: 0.1,
  ocupacaoInicial: 0.5,
  diametroMinMm: 150,
  recobrimentoMinM: 0.9,
  distMaxPvM: 80,
  laminaMax: 0.75,
  tensaoMinPa: 1.0,
  nManning: 0.013,
  profundidadeMaxM: 4.5,
  material: "PVC ocre",
};

const Q_MIN_LPS = 1.5;
const GAMA = 10000; // N/m³

// ------------------------------------------------------------------ hidráulica da seção circular
export type SecaoParcial = { yOverD: number; areaM2: number; rhM: number; velocityMs: number };

function geometria(D: number, yOverD: number) {
  const theta = 2 * Math.acos(1 - 2 * yOverD);
  const A = ((D * D) / 8) * (theta - Math.sin(theta));
  const P = (D * theta) / 2;
  return { A, Rh: P > 0 ? A / P : 0 };
}

/** Lâmina y/D para escoar Q (L/s) num tubo D (mm) com declividade I (m/m). null se não cabe. */
export function laminaParaVazao(qLps: number, diametroMm: number, I: number, n: number): SecaoParcial | null {
  const D = diametroMm / 1000;
  const Q = qLps / 1000;
  const qDe = (y: number) => {
    const { A, Rh } = geometria(D, y);
    return (1 / n) * A * Math.pow(Rh, 2 / 3) * Math.sqrt(Math.max(I, 1e-9));
  };
  const yMax = 0.938;
  if (qDe(yMax) < Q) return null;
  let lo = 1e-4;
  let hi = yMax;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (qDe(mid) < Q) lo = mid;
    else hi = mid;
  }
  const y = (lo + hi) / 2;
  const { A, Rh } = geometria(D, y);
  return { yOverD: y, areaM2: A, rhM: Rh, velocityMs: A > 0 ? Q / A : 0 };
}

export function declividadeMinima(qiLps: number): number {
  return 0.0055 * Math.pow(Math.max(Q_MIN_LPS, qiLps), -0.47);
}

export function tensaoTrativaPa(rhM: number, I: number): number {
  return GAMA * rhM * I;
}

// ------------------------------------------------------------------ rede
type No = {
  id: string;
  code: string;
  x: number;
  y: number;
  groundZ: number;
  invertZ: number;
  kind: "pv" | "ps" | "outfall";
};
type Aresta = { a: string; b: string; L: number };
type Trecho = {
  id: string;
  code: string;
  from: string;
  to: string;
  L: number;
  lotes: number;
  qmedProprio: number;
  qinfProprio: number;
  // calculados
  qiLps: number;
  qfLps: number;
  habitantes: number;
  lotesAcum: number;
  diametroMm: number;
  I: number;
  invIn: number;
  invOut: number;
  yOverD: number;
  velocityMs: number;
  tensaoPa: number;
  vcMs: number;
  status: CadEsgotoStatus;
};

let seq = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const pad = (p: string, i: number) => `${p}-${String(i + 1).padStart(2, "0")}`;
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay);

function projetarNoSegmento(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { x, y, d: Math.hypot(px - x, py - y) };
}

function centroide(vs: { x: number; y: number }[]) {
  return { x: vs.reduce((s, v) => s + v.x, 0) / vs.length, y: vs.reduce((s, v) => s + v.y, 0) / vs.length };
}

export function isEsgotoLayer(layerId: string): boolean {
  return ESGOTO_LAYER_IDS.has(layerId);
}
export function isEsgotoPipeEntity(e: { type: string; layerId: string }): e is CadPolylineEntity {
  return e.type === "polyline" && e.layerId === ESGOTO_REDE_LAYER.id;
}
export function isEsgotoNoEntity(e: { type: string; layerId: string }): e is CadPointEntity {
  return e.type === "point" && e.layerId === ESGOTO_PV_LAYER.id;
}
export function listEsgotoTrechos(project: CadProject): CadPolylineEntity[] {
  return project.entities.filter((e): e is CadPolylineEntity => isEsgotoPipeEntity(e));
}
export function clearEsgoto(project: CadProject): CadProject {
  return {
    ...project,
    entities: project.entities.filter((e) => !isEsgotoLayer(e.layerId)),
  };
}

export type GerarEsgotoResult = {
  project: CadProject;
  pvs: number;
  pontasSecas: number;
  trechos: number;
  ligacoes: number;
  extensaoM: number;
  foraDoCriterio: number;
  lancamento: string | null;
  vazaoFinalLps: number;
  message: string;
};

export function gerarRedeEsgoto(project: CadProject, entrada: Partial<EsgotoParams> = {}): GerarEsgotoResult {
  const cfg: EsgotoParams = { ...DEFAULT_ESGOTO_PARAMS, ...entrada };
  const axes = streetAxes(project);
  if (axes.length === 0) throw new Error("Gere o loteamento com vias/eixos antes de criar a rede de esgoto.");
  const reserva = listReservaRings(project);
  const amostras = extractSurveyElevationPoints(project.entities);
  const alinhamentos = buildStreetAlignments(axes);
  const linhas =
    alinhamentos.length > 0
      ? alinhamentos
      : axes.map((a) => ({ id: a.id, name: a.name ?? a.id, vertices: a.vertices, intersections: [] }));

  // 1) PVs ao longo dos eixos (cruzamentos, pontas e no máximo a cada distMaxPvM)
  const snapM = 3;
  const nos: No[] = [];
  const arestas: Aresta[] = [];
  const achaOuCria = (x: number, y: number, z: number): No => {
    const hit = nos.find((n) => dist(n.x, n.y, x, y) < snapM);
    if (hit) return hit;
    const groundZ = sampleGroundZ(x, y, z, amostras);
    const n: No = { id: newId("epv"), code: "", x, y, groundZ, invertZ: groundZ, kind: "pv" };
    nos.push(n);
    return n;
  };
  for (const al of linhas) {
    const anchors: DrainageStation[] = (al.intersections ?? []).map((h: { x: number; y: number; stationM?: number }) => ({
      x: h.x,
      y: h.y,
      z: 0,
      stationM: h.stationM ?? 0,
    }));
    const estacoes = placePvsAlongVia(al.vertices, cfg.distMaxPvM, { snapM, anchors, reservaRings: reserva });
    const fila = estacoes.map((st) => achaOuCria(st.x, st.y, st.z));
    for (let i = 0; i + 1 < fila.length; i++) {
      const a = fila[i]!;
      const b = fila[i + 1]!;
      if (a.id === b.id) continue;
      if (pipeIntersectsReserva(a.x, a.y, b.x, b.y, reserva)) continue;
      const L = dist(a.x, a.y, b.x, b.y);
      if (L < 0.5) continue;
      if (arestas.some((e) => (e.a === a.id && e.b === b.id) || (e.a === b.id && e.b === a.id))) continue;
      arestas.push({ a: a.id, b: b.id, L });
    }
  }
  // ruas soltas (sem cruzamento) são ligadas pela ponta mais próxima: coletor de interligação
  {
    const comp = new Map<string, number>();
    const vizinhos = new Map<string, string[]>();
    for (const e of arestas) {
      vizinhos.set(e.a, [...(vizinhos.get(e.a) ?? []), e.b]);
      vizinhos.set(e.b, [...(vizinhos.get(e.b) ?? []), e.a]);
    }
    let nc = 0;
    for (const id of vizinhos.keys()) {
      if (comp.has(id)) continue;
      const pilha = [id];
      comp.set(id, nc);
      while (pilha.length) {
        const cur = pilha.pop()!;
        for (const v of vizinhos.get(cur) ?? []) {
          if (comp.has(v)) continue;
          comp.set(v, nc);
          pilha.push(v);
        }
      }
      nc++;
    }
    const pontasDe = () => {
      const g = new Map<string, number>();
      for (const e of arestas) {
        g.set(e.a, (g.get(e.a) ?? 0) + 1);
        g.set(e.b, (g.get(e.b) ?? 0) + 1);
      }
      return nos.filter((n) => comp.has(n.id) && (g.get(n.id) ?? 0) <= 1);
    };
    for (let rodada = 0; rodada < 50; rodada++) {
      const grupos = new Set(comp.values());
      if (grupos.size <= 1) break;
      const pts = pontasDe();
      let melhor: { a: No; b: No; d: number } | null = null;
      for (const a of pts) {
        for (const b of nos) {
          if (!comp.has(b.id) || comp.get(a.id) === comp.get(b.id)) continue;
          const d = dist(a.x, a.y, b.x, b.y);
          if (d < 0.5 || pipeIntersectsReserva(a.x, a.y, b.x, b.y, reserva)) continue;
          if (!melhor || d < melhor.d) melhor = { a, b, d };
        }
      }
      if (!melhor) break;
      arestas.push({ a: melhor.a.id, b: melhor.b.id, L: melhor.d });
      const de = comp.get(melhor.b.id)!;
      const para = comp.get(melhor.a.id)!;
      for (const [k, v] of comp) if (v === de) comp.set(k, para);
    }
  }
  const usados = new Set(arestas.flatMap((e) => [e.a, e.b]));
  const pvs = nos.filter((n) => usados.has(n.id) && !pointInAnyReserva(n.x, n.y, reserva));
  if (pvs.length < 2) throw new Error("Não foi possível posicionar PVs nas vias (verifique eixos e área verde).");
  const byId = new Map(pvs.map((n) => [n.id, n]));

  // 2) lançamento = ponta (grau 1) mais baixa; árvore por menor custo (penaliza subir)
  const grau = new Map<string, number>();
  for (const e of arestas) {
    grau.set(e.a, (grau.get(e.a) ?? 0) + 1);
    grau.set(e.b, (grau.get(e.b) ?? 0) + 1);
  }
  const pontas = pvs.filter((n) => (grau.get(n.id) ?? 0) <= 1);
  const lanc = [...(pontas.length > 0 ? pontas : pvs)].sort((a, b) => a.groundZ - b.groundZ || a.y - b.y)[0]!;
  lanc.kind = "outfall";
  const adj = new Map<string, Aresta[]>();
  for (const e of arestas) {
    adj.set(e.a, [...(adj.get(e.a) ?? []), e]);
    adj.set(e.b, [...(adj.get(e.b) ?? []), e]);
  }
  const custo = new Map<string, number>([[lanc.id, 0]]);
  const pai = new Map<string, string>();
  const abertos = new Set([lanc.id]);
  const fechados = new Set<string>();
  while (abertos.size > 0) {
    let cur = "";
    let best = Infinity;
    for (const id of abertos) {
      const c = custo.get(id) ?? Infinity;
      if (c < best) {
        best = c;
        cur = id;
      }
    }
    abertos.delete(cur);
    fechados.add(cur);
    const nCur = byId.get(cur)!;
    for (const e of adj.get(cur) ?? []) {
      const outro = e.a === cur ? e.b : e.a;
      if (fechados.has(outro)) continue;
      const nOut = byId.get(outro);
      if (!nOut) continue;
      // o esgoto vai de "outro" para "cur": subir custa caro
      const subida = Math.max(0, nCur.groundZ - nOut.groundZ);
      const c = best + e.L + 60 * subida;
      if (c < (custo.get(outro) ?? Infinity)) {
        custo.set(outro, c);
        pai.set(outro, cur);
        abertos.add(outro);
      }
    }
  }

  // 3) trechos: árvore + pontas secas para os trechos que fechariam anel
  const trechos: Trecho[] = [];
  const novoTrecho = (from: string, to: string, L: number): Trecho => ({
    id: newId("ets"),
    code: "",
    from,
    to,
    L,
    lotes: 0,
    qmedProprio: 0,
    qinfProprio: (L / 1000) * cfg.infiltracaoLsKm,
    qiLps: 0,
    qfLps: 0,
    habitantes: 0,
    lotesAcum: 0,
    diametroMm: cfg.diametroMinMm,
    I: 0,
    invIn: 0,
    invOut: 0,
    yOverD: 0,
    velocityMs: 0,
    tensaoPa: 0,
    vcMs: 0,
    status: "ok",
  });
  const naArvore = (e: Aresta) => pai.get(e.a) === e.b || pai.get(e.b) === e.a;
  for (const e of arestas) {
    if (!byId.has(e.a) || !byId.has(e.b)) continue;
    if (naArvore(e)) {
      const from = pai.get(e.a) === e.b ? e.a : e.b;
      trechos.push(novoTrecho(from, pai.get(from)!, e.L));
    } else {
      const a = byId.get(e.a)!;
      const b = byId.get(e.b)!;
      const [alto, baixo] = a.groundZ >= b.groundZ ? [a, b] : [b, a];
      // ponta seca a 1 m do PV de cima, dentro do trecho
      const f = Math.min(1, e.L * 0.1) / e.L;
      const ps: No = {
        id: newId("eps"),
        code: "",
        x: alto.x + (baixo.x - alto.x) * f,
        y: alto.y + (baixo.y - alto.y) * f,
        groundZ: alto.groundZ,
        invertZ: alto.groundZ,
        kind: "ps",
      };
      pvs.push(ps);
      byId.set(ps.id, ps);
      trechos.push(novoTrecho(ps.id, baixo.id, dist(ps.x, ps.y, baixo.x, baixo.y)));
    }
  }
  // nós que não chegaram ao lançamento (rede desconectada) ficam de fora
  const chegaAoLanc = (id: string) => {
    let cur: string | undefined = id;
    for (let k = 0; k < 10000 && cur; k++) {
      if (cur === lanc.id) return true;
      cur = trechos.find((t) => t.from === cur)?.to;
    }
    return false;
  };
  const validos = trechos.filter((t) => chegaAoLanc(t.to));

  // 4) ligações prediais: cada lote no trecho mais próximo
  const lotes = project.entities.filter(
    (e): e is CadPolylineEntity => e.type === "polyline" && Boolean(e.closed) && e.layerId === LOTEAMENTO_LOTES_LAYER_ID,
  );
  const ligacoes: CadPolylineEntity[] = [];
  const qmedLote = (cfg.habPorLote * cfg.perCapitaLhd * cfg.coefRetorno) / 86400;
  for (const lote of lotes) {
    const c = centroide(lote.vertices);
    let melhor: { t: Trecho; x: number; y: number; d: number } | null = null;
    for (const t of validos) {
      const a = byId.get(t.from)!;
      const b = byId.get(t.to)!;
      const p = projetarNoSegmento(c.x, c.y, a.x, a.y, b.x, b.y);
      if (!melhor || p.d < melhor.d) melhor = { t, ...p };
    }
    if (!melhor || melhor.d > 80) continue;
    melhor.t.lotes += 1;
    melhor.t.qmedProprio += qmedLote;
    // ponto da testada mais perto do coletor
    let frente = lote.vertices[0]!;
    let df = Infinity;
    for (let i = 0; i < lote.vertices.length; i++) {
      const v = lote.vertices[i]!;
      const w = lote.vertices[(i + 1) % lote.vertices.length]!;
      const p = projetarNoSegmento(melhor.x, melhor.y, v.x, v.y, w.x, w.y);
      if (p.d < df) {
        df = p.d;
        frente = { x: p.x, y: p.y, z: v.z };
      }
    }
    // caixa de inspeção 1 m para dentro do lote
    const ux = c.x - frente.x;
    const uy = c.y - frente.y;
    const ul = Math.hypot(ux, uy) || 1;
    const ci = { x: frente.x + (ux / ul) * 1, y: frente.y + (uy / ul) * 1 };
    if (!pointInPolygon(ci.x, ci.y, lote.vertices)) Object.assign(ci, frente);
    ligacoes.push({
      id: newId("elg"),
      type: "polyline",
      layerId: ESGOTO_LIGACOES_LAYER.id,
      closed: false,
      vertices: [
        { x: ci.x, y: ci.y, z: 0 },
        { x: melhor.x, y: melhor.y, z: 0 },
      ],
      name: `Ligação ${lote.name ?? ""}`.trim(),
      esgoto: { kind: "ligacao", fromId: lote.id, toId: melhor.t.id, diameterMm: 100 },
    });
  }

  // 5) vazões acumuladas e dimensionamento, de montante para jusante
  const entram = new Map<string, Trecho[]>();
  for (const t of validos) entram.set(t.to, [...(entram.get(t.to) ?? []), t]);
  const ordem: Trecho[] = [];
  const visto = new Set<string>();
  const visitar = (t: Trecho) => {
    if (visto.has(t.id)) return;
    visto.add(t.id);
    for (const m of entram.get(t.from) ?? []) visitar(m);
    ordem.push(t);
  };
  for (const t of validos) visitar(t);

  const qmedAcum = new Map<string, number>();
  const qinfAcum = new Map<string, number>();
  const lotesAcum = new Map<string, number>();
  for (const t of ordem) {
    const montantes = entram.get(t.from) ?? [];
    const qm = t.qmedProprio + montantes.reduce((s, m) => s + (qmedAcum.get(m.id) ?? 0), 0);
    const qi = t.qinfProprio + montantes.reduce((s, m) => s + (qinfAcum.get(m.id) ?? 0), 0);
    const nl = t.lotes + montantes.reduce((s, m) => s + (lotesAcum.get(m.id) ?? 0), 0);
    qmedAcum.set(t.id, qm);
    qinfAcum.set(t.id, qi);
    lotesAcum.set(t.id, nl);
    t.lotesAcum = nl;
    t.habitantes = nl * cfg.habPorLote;
    t.qfLps = Math.max(Q_MIN_LPS, cfg.k1 * cfg.k2 * qm + qi);
    t.qiLps = Math.max(Q_MIN_LPS, cfg.k2 * qm * cfg.ocupacaoInicial + qi);
  }

  const invSaida = new Map<string, number>(); // geratriz inferior de chegada no nó (menor)
  for (const t of ordem) {
    const up = byId.get(t.from)!;
    const dn = byId.get(t.to)!;
    const L = Math.max(t.L, 0.5);
    const iTerreno = (up.groundZ - dn.groundZ) / L;
    const iMin = declividadeMinima(t.qiLps);
    const dnMontante = Math.max(cfg.diametroMinMm, ...(entram.get(t.from) ?? []).map((m) => m.diametroMm));
    type Dim = Pick<Trecho, "diametroMm" | "I" | "invIn" | "invOut" | "yOverD" | "velocityMs" | "tensaoPa" | "vcMs">;
    let escolhido: Dim | null = null;
    let ultimo: Dim | null = null;
    for (const dnMm of ESGOTO_DIAMETROS_MM) {
      if (dnMm < dnMontante) continue;
      const D = dnMm / 1000;
      const chegadas = (entram.get(t.from) ?? []).map((m) => m.invOut);
      const pelaCobertura = up.groundZ - cfg.recobrimentoMinM - D;
      const invIn = chegadas.length > 0 ? Math.min(pelaCobertura, ...chegadas) : pelaCobertura;
      let I = Math.max(iMin, iTerreno);
      // tensão trativa com a vazão inicial
      for (let k = 0; k < 40; k++) {
        const s = laminaParaVazao(t.qiLps, dnMm, I, cfg.nManning);
        if (!s || tensaoTrativaPa(s.rhM, I) >= cfg.tensaoMinPa) break;
        I *= 1.15;
      }
      let invOut = invIn - I * L;
      const coberturaJus = dn.groundZ - cfg.recobrimentoMinM - D;
      if (invOut > coberturaJus) {
        invOut = coberturaJus;
        I = (invIn - invOut) / L;
      }
      if (I < iMin) {
        I = iMin;
        invOut = invIn - I * L;
      }
      const sf = laminaParaVazao(t.qfLps, dnMm, I, cfg.nManning);
      const si = laminaParaVazao(t.qiLps, dnMm, I, cfg.nManning);
      if (!sf || !si) continue;
      const vc = 6 * Math.sqrt(9.81 * sf.rhM);
      const limite = sf.velocityMs > vc ? Math.min(0.5, cfg.laminaMax) : cfg.laminaMax;
      const cand: Dim = {
        diametroMm: dnMm,
        I,
        invIn,
        invOut,
        yOverD: sf.yOverD,
        velocityMs: sf.velocityMs,
        tensaoPa: tensaoTrativaPa(si.rhM, I),
        vcMs: vc,
      };
      ultimo = cand;
      if (sf.yOverD <= limite) {
        escolhido = cand;
        break;
      }
    }
    const r = escolhido ?? ultimo;
    if (!r) {
      t.status = "lamina";
      continue;
    }
    Object.assign(t, r);
    const profMont = up.groundZ - t.invIn;
    const profJus = dn.groundZ - t.invOut;
    t.status = !escolhido
      ? "lamina"
      : t.tensaoPa < cfg.tensaoMinPa - 1e-6
        ? "tensao"
        : Math.max(profMont, profJus) > cfg.profundidadeMaxM
          ? "profundidade"
          : "ok";
    up.invertZ = Math.min(up.invertZ, t.invIn);
    invSaida.set(t.to, Math.min(invSaida.get(t.to) ?? Infinity, t.invOut));
  }
  for (const n of pvs) {
    const chegada = invSaida.get(n.id);
    if (chegada != null) n.invertZ = Math.min(n.invertZ, chegada);
    if (n.invertZ >= n.groundZ) n.invertZ = n.groundZ - cfg.recobrimentoMinM - cfg.diametroMinMm / 1000;
  }

  // 6) códigos e entidades
  const usadosNos = new Set(validos.flatMap((t) => [t.from, t.to]));
  const nosFinais = pvs.filter((n) => usadosNos.has(n.id));
  let iPv = 0;
  let iPs = 0;
  for (const n of nosFinais) n.code = n.kind === "ps" ? pad("PS", iPs++) : pad("PVE", iPv++);
  ordem.forEach((t, i) => (t.code = pad("TE", i)));

  const pontos: CadPointEntity[] = nosFinais.map((n) => ({
    id: n.id,
    type: "point",
    layerId: ESGOTO_PV_LAYER.id,
    x: n.x,
    y: n.y,
    z: n.groundZ,
    label: n.kind === "ps" ? `${n.code} (TL)` : `${n.code}\nCT ${n.groundZ.toFixed(2)}\nCF ${n.invertZ.toFixed(2)}`,
    textColor: ESGOTO_PV_LAYER.color,
    esgoto: {
      kind: n.kind,
      code: n.code,
      groundZ: n.groundZ,
      invertZ: n.invertZ,
      depthM: n.groundZ - n.invertZ,
    },
  }));
  const tubos: CadPolylineEntity[] = ordem.map((t) => {
    const a = byId.get(t.from)!;
    const b = byId.get(t.to)!;
    return {
      id: t.id,
      type: "polyline",
      layerId: ESGOTO_REDE_LAYER.id,
      closed: false,
      vertices: [
        { x: a.x, y: a.y, z: t.invIn },
        { x: b.x, y: b.y, z: t.invOut },
      ],
      name: `${t.code} DN${t.diametroMm} ${t.L.toFixed(1)}m i=${(t.I * 100).toFixed(2)}%`,
      esgoto: {
        kind: "pipe",
        code: t.code,
        fromId: t.from,
        toId: t.to,
        lengthM: t.L,
        slopePct: t.I * 100,
        diameterMm: t.diametroMm,
        invertInZ: t.invIn,
        invertOutZ: t.invOut,
        qiLps: t.qiLps,
        qfLps: t.qfLps,
        lotes: t.lotesAcum,
        habitantes: t.habitantes,
        yOverD: t.yOverD,
        velocityMs: t.velocityMs,
        tensaoPa: t.tensaoPa,
        velocidadeCriticaMs: t.vcMs,
        depthUpM: a.groundZ - t.invIn,
        depthDownM: b.groundZ - t.invOut,
        status: t.status,
      },
    };
  });

  const base = clearEsgoto(project);
  const layers = [...base.layers];
  for (const l of [ESGOTO_LIGACOES_LAYER, ESGOTO_REDE_LAYER, ESGOTO_PV_LAYER]) {
    if (!layers.some((x) => x.id === l.id)) layers.push(l);
  }
  const next: CadProject = { ...base, layers, entities: [...base.entities, ...ligacoes, ...tubos, ...pontos] };
  const fora = ordem.filter((t) => t.status !== "ok").length;
  const extensao = ordem.reduce((s, t) => s + t.L, 0);
  const chegando = ordem.filter((t) => t.to === lanc.id);
  const qFinal = chegando.length > 0 ? Math.max(...chegando.map((t) => t.qfLps)) : 0;
  const nPv = nosFinais.filter((n) => n.kind !== "ps").length;
  const nPs = nosFinais.length - nPv;
  return {
    project: next,
    pvs: nPv,
    pontasSecas: nPs,
    trechos: ordem.length,
    ligacoes: ligacoes.length,
    extensaoM: extensao,
    foraDoCriterio: fora,
    lancamento: lanc.code || null,
    vazaoFinalLps: qFinal,
    message: `Esgoto: ${nPv} PV(s), ${nPs} ponta(s) seca(s), ${ordem.length} trecho(s) (${extensao.toFixed(0)} m), ${ligacoes.length} ligação(ões). Lançamento em ${lanc.code} com Qf = ${qFinal.toFixed(2)} L/s. ${fora === 0 ? "Todos os trechos atendem a NBR 9649." : `${fora} trecho(s) fora do critério.`}`,
  };
}
