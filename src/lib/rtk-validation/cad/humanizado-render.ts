/**
 * Renderiza a VISTA HUMANIZADA como PNG (no navegador, com <canvas>) já alinhada a lat/lon,
 * para virar GroundOverlay no KMZ do Google Earth. Fora da gleba fica transparente, então
 * o satélite do Earth continua aparecendo em volta.
 */
import {
  anelDe,
  arvoresDoProjeto,
  casaDoLote,
  conversorLonLat,
  CORES_HUMANIZADO,
  encolher,
  loteOcupado,
  papelDaCamada,
  sorteio,
  type HumanizadoOverlay,
  type PapelHumanizado,
} from "./kml-humanizado";
import type { CadPolylineEntity, CadProject } from "./types";

type Pt = [number, number];

export type RenderHumanizadoOptions = {
  /** Resolução alvo (m por pixel). Padrão 0,25 m; aumenta sozinho para caber em `maxLadoPx`. */
  metrosPorPixel?: number;
  /** Maior lado da imagem (px). Padrão 4096. */
  maxLadoPx?: number;
  /** Fração de lotes com casa (0–1). Padrão 0,3, igual ao 3D. */
  ocupacao?: number;
};

function textura(base: string, claro: string, escuro: string, seed: string, tam = 96): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = tam;
  c.height = tam;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, tam, tam);
  for (let i = 0; i < tam * 6; i++) {
    g.fillStyle = sorteio(seed, i * 3) < 0.5 ? claro : escuro;
    g.globalAlpha = 0.18 + sorteio(seed, i * 3 + 1) * 0.25;
    const x = sorteio(seed, i * 3 + 2) * tam;
    const y = sorteio(seed, i * 7 + 5) * tam;
    g.fillRect(x, y, 1 + sorteio(seed, i) * 2, 1 + sorteio(seed, i + 9) * 2);
  }
  g.globalAlpha = 1;
  return c;
}

export async function renderHumanizadoOverlay(
  project: CadProject,
  opts: RenderHumanizadoOptions = {},
): Promise<HumanizadoOverlay | null> {
  if (typeof document === "undefined") return null;
  const ll = conversorLonLat(project);

  const aneis: Array<{ papel: Exclude<PapelHumanizado, null>; ring: Pt[]; entity: CadPolylineEntity }> = [];
  const eixos: Pt[][] = [];
  for (const e of project.entities) {
    if (e.type !== "polyline") continue;
    const papel = papelDaCamada(e.layerId);
    if (!papel) continue;
    if (papel === "eixo") {
      if (!e.closed && e.vertices.length >= 2) eixos.push(e.vertices.map((v) => [v.x, v.y] as Pt));
      continue;
    }
    if (!e.closed || e.vertices.length < 3) continue;
    const ring = anelDe(e);
    if (ring.length >= 3) aneis.push({ papel, ring, entity: e });
  }
  if (aneis.length === 0) return null;

  // Limites em lon/lat
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;
  const cache = new Map<string, { lon: number; lat: number }>();
  const conv = (p: Pt) => {
    const k = `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
    let r = cache.get(k);
    if (!r) {
      r = ll(p);
      cache.set(k, r);
    }
    return r;
  };
  for (const { ring } of aneis) {
    for (const p of ring) {
      const r = conv(p);
      north = Math.max(north, r.lat);
      south = Math.min(south, r.lat);
      east = Math.max(east, r.lon);
      west = Math.min(west, r.lon);
    }
  }
  const latMid = (north + south) / 2;
  const mLon = 111320 * Math.cos((latMid * Math.PI) / 180);
  const mLat = 110540;
  const margem = 4 / mLat;
  north += margem;
  south -= margem;
  east += margem * (mLat / mLon);
  west -= margem * (mLat / mLon);
  const largM = (east - west) * mLon;
  const altM = (north - south) * mLat;
  const maxLado = opts.maxLadoPx ?? 4096;
  const mpp = Math.max(opts.metrosPorPixel ?? 0.25, Math.max(largM, altM) / maxLado);
  const W = Math.max(1, Math.ceil(largM / mpp));
  const H = Math.max(1, Math.ceil(altM / mpp));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const px = (p: Pt): Pt => {
    const r = conv(p);
    return [((r.lon - west) / (east - west)) * W, ((north - r.lat) / (north - south)) * H];
  };
  const m = (metros: number) => Math.max(0.6, metros / mpp);
  const caminho = (ring: Pt[]) => {
    ctx.beginPath();
    ring.forEach((p, i) => {
      const [x, y] = px(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };
  const preencher = (ring: Pt[], fill: string | CanvasPattern, stroke?: string, lw = 1) => {
    caminho(ring);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  };
  const padrao = (base: string, claro: string, escuro: string, seed: string) =>
    ctx.createPattern(textura(base, claro, escuro, seed), "repeat") ?? base;

  /** Estilo "maquete clara": tons suaves, sombras difusas, ocupação parcial. */
  const C = CORES_HUMANIZADO;
  const sombraCor = "rgba(60,60,40,0.30)";
  const gramaLote = padrao(C.lote, "#f3f2d3", "#e2e0b4", "lote");
  const gramaVerde = padrao(C.verde, "#d8e2ab", "#bcca86", "verde");

  // sombra da gleba inteira (efeito maquete sobre a mesa)
  ctx.save();
  ctx.shadowColor = "rgba(80,80,60,0.28)";
  ctx.shadowBlur = m(4);
  ctx.shadowOffsetX = m(2.5);
  ctx.shadowOffsetY = m(3.5);
  for (const a of aneis) if (a.papel === "contorno") preencher(a.ring, C.grama);
  ctx.restore();

  const ordem: Array<Exclude<PapelHumanizado, null>> = ["contorno", "app", "verde", "util", "lote", "calcada", "via"];
  for (const papel of ordem) {
    for (const a of aneis) {
      if (a.papel !== papel) continue;
      if (papel === "contorno") continue;
      else if (papel === "verde" || papel === "app") preencher(a.ring, gramaVerde);
      else if (papel === "util") preencher(a.ring, C.util);
      else if (papel === "lote") preencher(a.ring, gramaLote, C.loteBorda, m(0.5));
      else if (papel === "calcada") preencher(a.ring, C.calcada);
      else if (papel === "via") preencher(a.ring, C.via);
    }
  }

  // limite tracejado das áreas públicas
  ctx.setLineDash([m(1.6), m(1.4)]);
  for (const a of aneis) {
    if (a.papel !== "verde" && a.papel !== "app" && a.papel !== "util") continue;
    caminho(a.ring);
    ctx.strokeStyle = a.papel === "util" ? "#b8a77a" : "#8e9a5a";
    ctx.lineWidth = m(0.5);
    ctx.stroke();
  }
  // faixa central branca, fina
  ctx.strokeStyle = "rgba(242,242,238,0.85)";
  ctx.lineWidth = m(0.2);
  ctx.setLineDash([m(4), m(4)]);
  for (const linha of eixos) {
    ctx.beginPath();
    linha.forEach((p, i) => {
      const [x, y] = px(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // praça na área de utilidade pública: caminhos em cruz e espelho d'água
  for (const a of aneis) {
    if (a.papel !== "util") continue;
    const xs = a.ring.map((p) => p[0]);
    const ys = a.ring.map((p) => p[1]);
    const c: Pt = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    ctx.save();
    caminho(a.ring);
    ctx.clip();
    ctx.strokeStyle = "#d8cfae";
    ctx.lineWidth = m(1.6);
    ctx.beginPath();
    ctx.moveTo(...px([Math.min(...xs), c[1]]));
    ctx.lineTo(...px([Math.max(...xs), c[1]]));
    ctx.moveTo(...px([c[0], Math.min(...ys)]));
    ctx.lineTo(...px([c[0], Math.max(...ys)]));
    ctx.stroke();
    const [cx, cy] = px(c);
    ctx.fillStyle = "#d8cfae";
    ctx.beginPath();
    ctx.arc(cx, cy, m(10), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#bcd3d6";
    ctx.beginPath();
    ctx.arc(cx, cy, m(6), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // casas: só nos lotes ocupados, menores, sombra difusa, telhado em duas águas suave
  const meio = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const escurecer = (hex: string, f: number) => {
    const h = hex.replace("#", "");
    const c = [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * f));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  for (const a of aneis) {
    if (a.papel !== "lote" || !loteOcupado(a.entity.id, opts.ocupacao)) continue;
    const casa = casaDoLote(a.entity);
    if (!casa) continue;
    const r = encolher(casa.corpo, 0.62);
    ctx.save();
    ctx.shadowColor = sombraCor;
    ctx.shadowBlur = m(1.2);
    ctx.shadowOffsetX = m(casa.pavimentos === 2 ? 1.6 : 1);
    ctx.shadowOffsetY = m(casa.pavimentos === 2 ? 1.6 : 1);
    preencher(r, casa.corTelhado);
    ctx.restore();
    if (r.length === 4) {
      const curto01 = dist(r[0]!, r[1]!) + dist(r[2]!, r[3]!) < dist(r[1]!, r[2]!) + dist(r[3]!, r[0]!);
      const [i0, i1, i2, i3] = curto01 ? [0, 1, 2, 3] : [1, 2, 3, 0];
      preencher([meio(r[i0]!, r[i1]!), r[i1]!, r[i2]!, meio(r[i2]!, r[i3]!)], escurecer(casa.corTelhado, 0.82));
    }
  }

  // árvores: oliva, sombra difusa, copa com brilho
  const tons = ["#7f8c45", "#93a04f", "#6f7d3b"];
  for (const arv of arvoresDoProjeto(project)) {
    const [x, y] = px(arv.p);
    const raio = m(2.5 * arv.escala);
    ctx.save();
    ctx.shadowColor = "rgba(60,60,40,0.40)";
    ctx.shadowBlur = m(1.2);
    ctx.shadowOffsetX = raio * 0.5;
    ctx.shadowOffsetY = raio * 0.55;
    ctx.fillStyle = tons[Math.floor(sorteio(arv.id, 7) * tons.length)]!;
    ctx.beginPath();
    ctx.arc(x, y, raio, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(167,180,100,0.8)";
    ctx.beginPath();
    ctx.ellipse(x - raio * 0.25, y - raio * 0.3, raio * 0.62, raio * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(195,204,133,0.7)";
    ctx.beginPath();
    ctx.arc(x - raio * 0.28, y - raio * 0.38, raio * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;
  const png = new Uint8Array(await blob.arrayBuffer());
  return { png, north, south, east, west };
}
