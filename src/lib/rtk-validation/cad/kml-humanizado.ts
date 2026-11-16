/**
 * Exportação HUMANIZADA para o Google Earth (KMZ).
 *
 * Três camadas, cada uma numa pasta que liga/desliga no Earth:
 *  1. Implantação: lotes, vias, calçadas, área verde e utilidade pública coloridos + nº dos lotes.
 *  2. Volumes 3D: uma casa por lote (recuo, 1 ou 2 pavimentos, telhado) e árvores em modelo 3D.
 *  3. Imagem humanizada (opcional): PNG renderizado no navegador, colado no terreno (GroundOverlay).
 *
 * Este módulo é puro (sem DOM): a imagem chega pronta em `overlay`. Geometria e sorteios são
 * determinísticos (mesmo projeto ⇒ mesmo KMZ).
 */
import { strToU8, zipSync } from "fflate";
import { detectCadGeorefFromProject, enToLatLonGeoref, vertexToEn } from "./georef";
import type { CadPolylineEntity, CadProject } from "./types";

export type HumanizadoOverlay = { png: Uint8Array; north: number; south: number; east: number; west: number };

export type HumanizadoOptions = {
  /** Casas 3D nos lotes (padrão true). */
  casas?: boolean;
  /**
   * Fração dos lotes com casa construída (0–1). Padrão 0,3 — visual de lançamento, como maquete
   * de vendas. 1 = bairro consolidado. Os mesmos lotes são ocupados na imagem e no 3D.
   */
  ocupacao?: number;
  /** Árvores 3D na área verde e na utilidade pública (padrão true). */
  arvores?: boolean;
  /** Pé-direito por pavimento (m). Padrão 3. */
  alturaPavimentoM?: number;
  /** Imagem humanizada pronta para colar no terreno. */
  overlay?: HumanizadoOverlay | null;
};

export type HumanizadoStats = { lotes: number; casas: number; arvores: number; overlay: boolean };

type Pt = [number, number];

/** Papel de cada camada na humanização. */
export type PapelHumanizado = "lote" | "via" | "calcada" | "eixo" | "verde" | "app" | "util" | "contorno" | null;

export function papelDaCamada(layerId: string): PapelHumanizado {
  const id = layerId.toLowerCase();
  if (id === "loteamento_lotes") return "lote";
  if (id === "loteamento_vias" || id === "via_existente") return "via";
  if (id === "loteamento_calcadas") return "calcada";
  if (id === "loteamento_eixos") return "eixo";
  if (id === "area_reserva_legal") return "verde";
  if (id === "area_app") return "app";
  if (id === "area_util") return "util";
  if (/^(loteamento_|drenagem_|reurb_|area_|text$|terrain|street_profile)/.test(id)) return null;
  return "contorno";
}

/** Hash determinístico 0..1 a partir de um texto. */
export function sorteio(seed: string, k = 0): number {
  let h = 2166136261 ^ k;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function area(ring: Pt[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function centroide(ring: Pt[]): Pt {
  const a = area(ring);
  if (Math.abs(a) < 1e-9) {
    return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f;
    cy += (p[1] + q[1]) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

export function dentro(p: Pt, ring: Pt[]): boolean {
  let ok = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
}

/** Centróide, ou — em lote irregular cujo centróide cai fora — o ponto interno mais próximo dele. */
export function pontoInterno(ring: Pt[]): Pt {
  const c = centroide(ring);
  if (dentro(c, ring)) return c;
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let melhor: Pt | null = null;
  let dMin = Infinity;
  const n = 24;
  for (let i = 1; i < n; i++) {
    for (let j = 1; j < n; j++) {
      const p: Pt = [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * j) / n];
      if (!dentro(p, ring)) continue;
      const d = Math.hypot(p[0] - c[0], p[1] - c[1]);
      if (d < dMin) {
        dMin = d;
        melhor = p;
      }
    }
  }
  return melhor ?? c;
}

export function anelDe(entity: CadPolylineEntity): Pt[] {
  const r = entity.vertices.map((v) => [v.x, v.y] as Pt);
  if (r.length > 1) {
    const a = r[0]!;
    const b = r[r.length - 1]!;
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) r.pop();
  }
  return r;
}

export type Casa = { corpo: Pt[]; telhado: Pt[]; pavimentos: 1 | 2; corTelhado: string; corParede: string };

const TELHADOS = ["#c27450", "#b3633f", "#8d6a55", "#5f6368", "#a8826a"];
const PAREDES = ["#f4ede1", "#efe6d2", "#e9e4dc", "#f6f1ea", "#e8dccb"];

/**
 * Casa do lote: o lote encolhido em torno do centróide (recuo proporcional), com pegada de até
 * 45% do lote e no máximo 180 m². Lotes pequenos/estreitos demais ficam sem casa.
 */
export function casaDoLote(entity: CadPolylineEntity): Casa | null {
  const ring = anelDe(entity);
  if (ring.length < 3) return null;
  const a = Math.abs(area(ring));
  if (a < 80) return null;
  const s = Math.min(Math.sqrt(0.45), Math.sqrt(180 / a));
  const c = centroide(ring);
  const escala = (k: number) => ring.map((p) => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k] as Pt);
  const corpo = escala(s);
  if (!corpo.every((p) => dentro(p, ring))) return null;
  /**
   * Lote de esquina muito irregular (L, trapézio torto): a casa sairia fina/estranha — fica sem.
   * Caixa orientada pela aresta mais longa, para funcionar em glebas giradas.
   */
  let maior = 0;
  let ang = 0;
  for (let i = 0; i < corpo.length; i++) {
    const p = corpo[i]!;
    const q = corpo[(i + 1) % corpo.length]!;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len > maior) {
      maior = len;
      ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
    }
  }
  const u = corpo.map((p) => p[0] * Math.cos(ang) + p[1] * Math.sin(ang));
  const v = corpo.map((p) => -p[0] * Math.sin(ang) + p[1] * Math.cos(ang));
  const w = Math.max(...u) - Math.min(...u);
  const h = Math.max(...v) - Math.min(...v);
  const caixa = w * h;
  if (caixa > 0 && Math.abs(area(corpo)) < caixa * 0.6) return null;
  if (Math.max(w, h) / Math.max(Math.min(w, h), 0.1) > 3.5) return null;
  const seed = entity.id;
  return {
    corpo,
    telhado: escala(s * 0.88),
    pavimentos: sorteio(seed, 1) < 0.35 ? 2 : 1,
    corTelhado: TELHADOS[Math.floor(sorteio(seed, 2) * TELHADOS.length)]!,
    corParede: PAREDES[Math.floor(sorteio(seed, 3) * PAREDES.length)]!,
  };
}

/** Lote com casa? Determinístico pelo id, para imagem e 3D ocuparem os mesmos lotes. */
export function loteOcupado(id: string, ocupacao = 0.3): boolean {
  return sorteio(id, 9) < Math.max(0, Math.min(1, ocupacao));
}

/** Casa menor que a pegada máxima: estilo maquete (≈ 40% da área de `casaDoLote`). */
export function encolher(ring: Pt[], k = 0.62): Pt[] {
  const c = centroide(ring);
  return ring.map((p) => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k] as Pt);
}

export type Arvore = { p: Pt; escala: number; rumo: number; id: string };

/**
 * Árvores em grade com variação: densa na área verde (≈ 7 m), esparsa na utilidade pública
 * (≈ 12 m, como praça). Determinístico. Limite de 2.500 árvores.
 */
export function arvoresDoProjeto(project: CadProject): Arvore[] {
  const out: Arvore[] = [];
  for (const e of project.entities) {
    if (e.type !== "polyline" || !e.closed) continue;
    const papel = papelDaCamada(e.layerId);
    if (papel !== "verde" && papel !== "util" && papel !== "app") continue;
    const ring = anelDe(e);
    if (ring.length < 3) continue;
    const passo = papel === "util" ? 12 : 8;
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    for (let x = x0 + passo / 2, i = 0; x < x1; x += passo, i++) {
      for (let y = y0 + passo / 2, j = 0; y < y1; y += passo, j++) {
        const seed = `${e.id}:${i}:${j}`;
        const p: Pt = [x + (sorteio(seed, 1) - 0.5) * passo * 0.7, y + (sorteio(seed, 2) - 0.5) * passo * 0.7];
        if (!dentro(p, ring)) continue;
        if (papel === "util" && sorteio(seed, 3) < 0.35) continue;
        /** Área verde em bosques: falhas largas dão aspecto de grupos de árvores, não mata fechada. */
        if (papel !== "util" && sorteio(`${e.id}:${Math.floor(i / 3)}:${Math.floor(j / 3)}`, 6) < 0.3) continue;
        out.push({ p, escala: 0.75 + sorteio(seed, 4) * 0.6, rumo: Math.floor(sorteio(seed, 5) * 360), id: seed });
        if (out.length >= 2500) return out;
      }
    }
  }
  return out;
}

/** Modelo COLLADA de árvore (tronco + copa em dois cones), em metros, Z para cima. */
export function arvoreDae(): string {
  const n = 8;
  const pos: number[] = [];
  const tri = { tronco: [] as number[], copa: [] as number[] };
  const add = (x: number, y: number, z: number) => {
    pos.push(x, y, z);
    return pos.length / 3 - 1;
  };
  // tronco: prisma quadrado 0,5 m, 0 → 2,8 m
  const t = 0.25;
  const base = [add(-t, -t, 0), add(t, -t, 0), add(t, t, 0), add(-t, t, 0)];
  const topo = [add(-t, -t, 2.8), add(t, -t, 2.8), add(t, t, 2.8), add(-t, t, 2.8)];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    tri.tronco.push(base[i]!, base[j]!, topo[j]!, base[i]!, topo[j]!, topo[i]!);
  }
  // copa: anel em 4,4 m (raio 2,6), ponta em 8 m e base em 2,4 m
  const anel: number[] = [];
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * Math.PI * 2;
    anel.push(add(Math.cos(ang) * 2.6, Math.sin(ang) * 2.6, 4.4));
  }
  const ponta = add(0, 0, 8);
  const fundo = add(0, 0, 2.4);
  for (let k = 0; k < n; k++) {
    const a = anel[k]!;
    const b = anel[(k + 1) % n]!;
    tri.copa.push(a, b, ponta, b, a, fundo);
  }
  const p = (idx: number[]) => idx.join(" ");
  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><unit name="meter" meter="1"/><up_axis>Z_UP</up_axis></asset>
<library_effects>
<effect id="fx_copa"><profile_COMMON><technique sid="c"><lambert><diffuse><color>0.27 0.52 0.20 1</color></diffuse></lambert></technique></profile_COMMON></effect>
<effect id="fx_tronco"><profile_COMMON><technique sid="c"><lambert><diffuse><color>0.42 0.29 0.17 1</color></diffuse></lambert></technique></profile_COMMON></effect>
</library_effects>
<library_materials>
<material id="mt_copa"><instance_effect url="#fx_copa"/></material>
<material id="mt_tronco"><instance_effect url="#fx_tronco"/></material>
</library_materials>
<library_geometries>
<geometry id="g_arvore"><mesh>
<source id="g_pos"><float_array id="g_pos_arr" count="${pos.length}">${pos.map((v) => v.toFixed(3)).join(" ")}</float_array>
<technique_common><accessor source="#g_pos_arr" count="${pos.length / 3}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<vertices id="g_vtx"><input semantic="POSITION" source="#g_pos"/></vertices>
<triangles material="m_tronco" count="${tri.tronco.length / 3}"><input semantic="VERTEX" source="#g_vtx" offset="0"/><p>${p(tri.tronco)}</p></triangles>
<triangles material="m_copa" count="${tri.copa.length / 3}"><input semantic="VERTEX" source="#g_vtx" offset="0"/><p>${p(tri.copa)}</p></triangles>
</mesh></geometry>
</library_geometries>
<library_visual_scenes><visual_scene id="cena"><node id="arvore"><instance_geometry url="#g_arvore"><bind_material><technique_common>
<instance_material symbol="m_tronco" target="#mt_tronco"/><instance_material symbol="m_copa" target="#mt_copa"/>
</technique_common></bind_material></instance_geometry></node></visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#cena"/></scene>
</COLLADA>`;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** "#rrggbb" + alfa → "aabbggrr" do KML. */
function cor(hex: string, alpha = 1): string {
  const h = hex.replace(/^#/, "");
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, "0");
  return `${a}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toLowerCase();
}

/** Cores da implantação humanizada (mesmas da imagem renderizada). */
export const CORES_HUMANIZADO = {
  lote: "#ecebc4",
  loteBorda: "#f8f7e6",
  via: "#7d8085",
  calcada: "#d6d4c2",
  eixo: "#f2f2ee",
  verde: "#cdd99c",
  app: "#b9c98a",
  util: "#e6e0c4",
  contorno: "#ffffff",
  grama: "#e4e2bf",
} as const;

/** Converte coordenadas do desenho em "lon,lat" (WGS84). Erro se não houver georreferência. */
export function conversorLonLat(project: CadProject): (p: Pt) => { lon: number; lat: number } {
  const georef = detectCadGeorefFromProject(project);
  if (!georef.isGeoreferenced) {
    throw new Error("Desenho sem coordenadas georreferenciadas (UTM SIRGAS 2000 ou WGS84). O Google Earth exige georreferência.");
  }
  return (p) => {
    const en = vertexToEn({ x: p[0], y: p[1], z: 0 }, georef);
    const ll = enToLatLonGeoref(en.e, en.n, georef);
    return { lon: ll.lon, lat: ll.lat };
  };
}

export function buildHumanizadoKml(
  project: CadProject,
  opts: HumanizadoOptions = {},
): { kml: string; stats: HumanizadoStats } {
  const ll = conversorLonLat(project);
  const coord = (p: Pt, z = 0) => {
    const r = ll(p);
    return `${r.lon.toFixed(8)},${r.lat.toFixed(8)},${z.toFixed(2)}`;
  };
  const anel = (ring: Pt[], z = 0) => [...ring, ring[0]!].map((p) => coord(p, z)).join(" ");
  const pe = opts.alturaPavimentoM && opts.alturaPavimentoM > 0 ? opts.alturaPavimentoM : 3;
  const temOverlay = Boolean(opts.overlay);

  const estilos: string[] = [
    `<Style id="lote"><LineStyle><color>${cor(CORES_HUMANIZADO.loteBorda, 0.9)}</color><width>1</width></LineStyle><PolyStyle><color>${cor(CORES_HUMANIZADO.lote, 0.85)}</color></PolyStyle></Style>`,
    `<Style id="via"><LineStyle><color>${cor(CORES_HUMANIZADO.via)}</color><width>0</width></LineStyle><PolyStyle><color>${cor(CORES_HUMANIZADO.via, 0.95)}</color></PolyStyle></Style>`,
    `<Style id="calcada"><LineStyle><color>${cor("#bdb6a6")}</color><width>1</width></LineStyle><PolyStyle><color>${cor(CORES_HUMANIZADO.calcada, 0.95)}</color></PolyStyle></Style>`,
    `<Style id="eixo"><LineStyle><color>${cor(CORES_HUMANIZADO.eixo)}</color><width>1.5</width></LineStyle></Style>`,
    `<Style id="verde"><LineStyle><color>${cor("#2f5f22")}</color><width>1.5</width></LineStyle><PolyStyle><color>${cor(CORES_HUMANIZADO.verde, 0.9)}</color></PolyStyle></Style>`,
    `<Style id="app"><LineStyle><color>${cor("#244d2c")}</color><width>1.5</width></LineStyle><PolyStyle><color>${cor(CORES_HUMANIZADO.app, 0.85)}</color></PolyStyle></Style>`,
    `<Style id="util"><LineStyle><color>${cor("#c89b5a")}</color><width>1.5</width></LineStyle><PolyStyle><color>${cor(CORES_HUMANIZADO.util, 0.9)}</color></PolyStyle></Style>`,
    `<Style id="contorno"><LineStyle><color>${cor(CORES_HUMANIZADO.contorno)}</color><width>2.5</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style>`,
    `<Style id="numero"><IconStyle><scale>0</scale></IconStyle><LabelStyle><color>ff202020</color><scale>0.7</scale></LabelStyle></Style>`,
  ];

  const piso: string[] = [];
  const numeros: string[] = [];
  const casas: string[] = [];
  const stats: HumanizadoStats = { lotes: 0, casas: 0, arvores: 0, overlay: temOverlay };
  const coresCasa = new Map<string, string>();
  const estiloCasa = (parede: string, telhado: string) => {
    const k = `${parede}${telhado}`;
    if (!coresCasa.has(k)) {
      const id = `casa${coresCasa.size}`;
      coresCasa.set(k, id);
      estilos.push(
        `<Style id="${id}_p"><LineStyle><color>${cor("#8a7f70")}</color><width>0.5</width></LineStyle><PolyStyle><color>${cor(parede)}</color></PolyStyle></Style>`,
        `<Style id="${id}_t"><LineStyle><color>${cor(telhado)}</color><width>0</width></LineStyle><PolyStyle><color>${cor(telhado)}</color></PolyStyle></Style>`,
      );
    }
    return coresCasa.get(k)!;
  };

  for (const e of project.entities) {
    const papel = papelDaCamada(e.layerId);
    if (!papel) continue;
    if (papel === "eixo" && e.type === "polyline" && !e.closed && e.vertices.length >= 2) {
      piso.push(
        `<Placemark><styleUrl>#eixo</styleUrl><LineString><tessellate>1</tessellate><coordinates>${e.vertices
          .map((v) => coord([v.x, v.y]))
          .join(" ")}</coordinates></LineString></Placemark>`,
      );
      continue;
    }
    if (e.type !== "polyline" || !e.closed || e.vertices.length < 3) continue;
    const ring = anelDe(e);
    if (ring.length < 3) continue;
    const nome = e.lote?.numero != null ? `${e.lote.quadra ? `Q${e.lote.quadra} ` : ""}L${e.lote.numero}` : (e.name ?? "");
    piso.push(
      `<Placemark><name>${esc(nome)}</name><styleUrl>#${papel}</styleUrl><Polygon><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><outerBoundaryIs><LinearRing><coordinates>${anel(
        ring,
      )}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`,
    );
    if (papel !== "lote") continue;
    stats.lotes += 1;
    const label = e.lote?.numero != null ? String(e.lote.numero) : "";
    if (label) {
      numeros.push(
        `<Placemark><name>${esc(label)}</name><styleUrl>#numero</styleUrl><Point><coordinates>${coord(pontoInterno(ring))}</coordinates></Point></Placemark>`,
      );
    }
    if (opts.casas === false) continue;
    if (!loteOcupado(e.id, opts.ocupacao)) continue;
    const casa = casaDoLote(e);
    if (!casa) continue;
    const alto = casa.pavimentos * pe;
    const id = estiloCasa(casa.corParede, casa.corTelhado);
    const poligono = (r: Pt[], z: number, estilo: string) =>
      `<Placemark><styleUrl>#${estilo}</styleUrl><Polygon><extrude>1</extrude><altitudeMode>relativeToGround</altitudeMode><outerBoundaryIs><LinearRing><coordinates>${anel(
        r,
        z,
      )}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
    casas.push(
      `<Folder><name>Casa ${esc(nome)}</name>${poligono(encolher(casa.corpo, 0.75), alto, `${id}_p`)}${poligono(encolher(casa.telhado, 0.75), alto + 1.6, `${id}_t`)}</Folder>`,
    );
    stats.casas += 1;
  }

  const arvores: string[] = [];
  if (opts.arvores !== false) {
    for (const a of arvoresDoProjeto(project)) {
      const r = ll(a.p);
      arvores.push(
        `<Placemark><Model><altitudeMode>relativeToGround</altitudeMode><Location><longitude>${r.lon.toFixed(8)}</longitude><latitude>${r.lat.toFixed(
          8,
        )}</latitude><altitude>0</altitude></Location><Orientation><heading>${a.rumo}</heading><tilt>0</tilt><roll>0</roll></Orientation><Scale><x>${a.escala.toFixed(
          2,
        )}</x><y>${a.escala.toFixed(2)}</y><z>${a.escala.toFixed(2)}</z></Scale><Link><href>modelos/arvore.dae</href></Link></Model></Placemark>`,
      );
    }
    stats.arvores = arvores.length;
  }

  const overlay = opts.overlay
    ? `<Folder><name>Imagem humanizada</name><GroundOverlay><name>Vista humanizada</name><drawOrder>1</drawOrder><Icon><href>imagens/humanizado.png</href></Icon><LatLonBox><north>${opts.overlay.north.toFixed(
        8,
      )}</north><south>${opts.overlay.south.toFixed(8)}</south><east>${opts.overlay.east.toFixed(8)}</east><west>${opts.overlay.west.toFixed(
        8,
      )}</west></LatLonBox></GroundOverlay></Folder>`
    : "";

  const pasta = (nome: string, conteudo: string[], visivel = true) =>
    conteudo.length > 0
      ? `<Folder><name>${esc(nome)}</name><visibility>${visivel ? 1 : 0}</visibility>${conteudo.join("\n")}</Folder>`
      : "";

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>${esc(project.name)} — humanizado</name>
<open>1</open>
${estilos.join("\n")}
${overlay}
${pasta("Implantação (piso)", piso, !temOverlay)}
${pasta("Números dos lotes", numeros)}
${pasta("Casas 3D", casas)}
${pasta("Árvores 3D", arvores)}
</Document>
</kml>`;
  return { kml, stats };
}

export function exportCadProjectKmzHumanizado(
  project: CadProject,
  opts: HumanizadoOptions = {},
): { kmz: Uint8Array<ArrayBuffer>; stats: HumanizadoStats } {
  const { kml, stats } = buildHumanizadoKml(project, opts);
  const files: Record<string, Uint8Array> = { "doc.kml": strToU8(kml) };
  if (stats.arvores > 0) files["modelos/arvore.dae"] = strToU8(arvoreDae());
  if (opts.overlay) files["imagens/humanizado.png"] = opts.overlay.png;
  return { kmz: zipSync(files) as Uint8Array<ArrayBuffer>, stats };
}
