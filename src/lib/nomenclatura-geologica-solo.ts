/**
 * Nomenclatura geológica / geotécnica para descrição de solos em sondagens (SPT).
 * Base: prática brasileira (DNER, ABNT NBR 6484), USCS adaptado e terminologia de campo.
 */

export type GrupoNomenclatura =
  | "tipo_principal"
  | "origem"
  | "granulometria"
  | "plasticidade"
  | "consistencia"
  | "compacidade"
  | "cor"
  | "umidade"
  | "estrutura"
  | "inclusoes"
  | "alteracao_rocha"
  | "classificacao_uscs";

export type EntradaNomenclatura = {
  id: string;
  termo: string;
  grupo: GrupoNomenclatura;
  /** Cor de barra no PDF (tipos principais). */
  corPdf?: string;
};

/** Tipos principais — valor gravado em `solo`. */
export const TIPOS_SOLO_PRINCIPAIS = [
  "Argila mole",
  "Argila média",
  "Argila rija",
  "Argila muito rija",
  "Argila siltosa mole",
  "Argila siltosa média",
  "Argila siltosa rija",
  "Argila arenosa mole",
  "Argila arenosa média",
  "Argila arenosa rija",
  "Silte mole",
  "Silte médio",
  "Silte rijo",
  "Silte arenoso",
  "Silte argiloso",
  "Areia muito fina fofa",
  "Areia fina fofa",
  "Areia fina média",
  "Areia fina compacta",
  "Areia fina pouco argilosa",
  "Areia fina argilosa",
  "Areia fina silto-argilosa",
  "Areia fina silto-argilosa pouco compacta",
  "Areia média fofa",
  "Areia média média",
  "Areia média compacta",
  "Areia grossa fofa",
  "Areia grossa média",
  "Areia grossa compacta",
  "Areia muito grossa",
  "Areia siltosa",
  "Areia argilosa",
  "Pedregulho",
  "Cascalho",
  "Solo gravoso",
  "Bloco / matacão",
  "Solo orgânico",
  "Aterro homogêneo",
  "Aterro heterogêneo",
  "Saprolito arenoso",
  "Saprolito argiloso",
  "Colúvio",
  "Alúvio",
  "Solo residual",
  "Rocha alterada",
  "Rocha sã",
] as const;

export type TipoSoloPrincipal = (typeof TIPOS_SOLO_PRINCIPAIS)[number];

const COR_ARGILA = "#8D6E63";
const COR_SILTE = "#FFAB91";
const COR_AREIA = "#FFEE58";
const COR_CASCALHO = "#90A4AE";
const COR_ROCHA = "#263238";
const COR_ORGANICO = "#2E7D32";
const COR_ATERRO = "#7E57C2";

function entrada(
  id: string,
  termo: string,
  grupo: GrupoNomenclatura,
  corPdf?: string,
): EntradaNomenclatura {
  return { id, termo, grupo, corPdf };
}

/** Catálogo completo de termos por grupo. */
export const NOMENCLATURA_GEOLOGICA: readonly EntradaNomenclatura[] = [
  ...TIPOS_SOLO_PRINCIPAIS.map((t) => {
    const cor = corTipoPrincipal(t);
    return entrada(`tp-${slug(t)}`, t, "tipo_principal", cor);
  }),

  ...[
    "Residual de granito",
    "Residual de gnaisse",
    "Residual de basalto",
    "Residual de xisto",
    "Residual não identificado",
    "Coluvial",
    "Aluvial",
    "Fluvial",
    "Lacustre",
    "Marinho / transgressivo",
    "Eólico",
    "Antropizado (aterro)",
    "Depósito não identificado",
  ].map((t) => entrada(`or-${slug(t)}`, t, "origem")),

  ...[
    "Muito fina",
    "Fina",
    "Média",
    "Grossa",
    "Muito grossa",
    "Mal graduada",
    "Bem graduada",
  ].map((t) => entrada(`gr-${slug(t)}`, t, "granulometria")),

  ...[
    "Baixa plasticidade (LP)",
    "Média plasticidade",
    "Alta plasticidade (HP)",
    "Não plástico (NP)",
  ].map((t) => entrada(`pl-${slug(t)}`, t, "plasticidade")),

  ...[
    "Mole",
    "Média",
    "Rija",
    "Muito rija",
    "Firme",
  ].map((t) => entrada(`co-${slug(t)}`, t, "consistencia")),

  ...[
    "Fofa",
    "Média",
    "Compacta",
    "Densa",
    "Muito densa",
  ].map((t) => entrada(`cp-${slug(t)}`, t, "compacidade")),

  ...[
    "Branca",
    "Cinza clara",
    "Cinza",
    "Cinza escura",
    "Cinza azulada",
    "Cinza esverdeada",
    "Marrom clara",
    "Marrom",
    "Marrom escura",
    "Avermelhada",
    "Amarelada",
    "Alaranjada",
    "Preta",
    "Esverdeada",
    "Manchas ferruginosas",
    "Manchas esverdeadas",
  ].map((t) => entrada(`cr-${slug(t)}`, t, "cor")),

  ...[
    "Seca",
    "Úmida",
    "Muito úmida",
    "Saturada",
    "Supersaturada (lama)",
  ].map((t) => entrada(`um-${slug(t)}`, t, "umidade")),

  ...[
    "Maciça",
    "Laminada",
    "Fissurada",
    "Blocos angulares",
    "Blocos arredondados",
    "Estratificada fina",
    "Estratificada grossa",
    "Com bandas",
    "Homogênea",
    "Heterogênea",
  ].map((t) => entrada(`es-${slug(t)}`, t, "estrutura")),

  ...[
    "Raízes",
    "Restos orgânicos",
    "Matéria orgânica",
    "Resíduos de carvão",
    "Carvão",
    "Pedregulhos dispersos",
    "Concreções ferruginosas",
    "Concreções calcáreas",
    "Blocos isolados",
    "Fragmentos de rocha",
    "Matacões",
    "Vazios",
    "Cavidades",
  ].map((t) => entrada(`in-${slug(t)}`, t, "inclusoes")),

  ...[
    "Rocha sã (RS)",
    "Altamente alterada (W5)",
    "Completamente alterada (W4)",
    "Muito alterada (W3)",
    "Moderadamente alterada (W2)",
    "Pouco alterada (W1)",
    "Intemperizada",
  ].map((t) => entrada(`al-${slug(t)}`, t, "alteracao_rocha")),

  ...[
    "GW — Areia grossa bem graduada",
    "GP — Areia grossa mal graduada",
    "GM — Areia grossa siltosa",
    "GC — Areia grossa argilosa",
    "SW — Areia fina bem graduada",
    "SP — Areia fina mal graduada",
    "SM — Areia fina siltosa",
    "SC — Areia fina argilosa",
    "ML — Silte de baixa plasticidade",
    "CL — Argila de baixa plasticidade",
    "MH — Silte de alta plasticidade",
    "CH — Argila de alta plasticidade",
    "OL — Orgânico de baixa plasticidade",
    "OH — Orgânico de alta plasticidade",
    "Pt — Turfa",
    "RO — Rocha",
  ].map((t) => entrada(`us-${slug(t)}`, t, "classificacao_uscs")),
] as const;

export const GRUPOS_NOMENCLATURA_LABEL: Record<GrupoNomenclatura, string> = {
  tipo_principal: "Tipo principal de solo",
  origem: "Origem / depósito",
  granulometria: "Granulometria",
  plasticidade: "Plasticidade",
  consistencia: "Consistência (coesivos)",
  compacidade: "Compacidade (granulares)",
  cor: "Cor",
  umidade: "Umidade",
  estrutura: "Estrutura / fabric",
  inclusoes: "Inclusões",
  alteracao_rocha: "Alteração (rocha)",
  classificacao_uscs: "Classificação USCS",
};

export type ComplementosDescricaoSolo = {
  origem?: string;
  granulometria?: string;
  plasticidade?: string;
  consistencia?: string;
  compacidade?: string;
  cor?: string;
  umidade?: string;
  estrutura?: string;
  inclusoes?: string[];
  alteracao?: string;
  uscs?: string;
  observacao?: string;
};

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function corTipoPrincipal(tipo: string): string | undefined {
  const n = tipo.toLowerCase();
  if (n.includes("argila")) return COR_ARGILA;
  if (n.includes("silte")) return COR_SILTE;
  if (n.includes("areia")) return COR_AREIA;
  if (n.includes("pedregulho") || n.includes("cascalho") || n.includes("gravoso"))
    return COR_CASCALHO;
  if (n.includes("rocha") || n.includes("bloco") || n.includes("matacão"))
    return COR_ROCHA;
  if (n.includes("orgânico") || n.includes("organico")) return COR_ORGANICO;
  if (n.includes("aterro")) return COR_ATERRO;
  if (n.includes("saprolito") || n.includes("colúvio") || n.includes("alúvio"))
    return "#A1887F";
  return undefined;
}

export function termosDoGrupo(grupo: GrupoNomenclatura): EntradaNomenclatura[] {
  return NOMENCLATURA_GEOLOGICA.filter((e) => e.grupo === grupo);
}

export function corPdfTipoPrincipal(tipo: string): string | undefined {
  const e = NOMENCLATURA_GEOLOGICA.find(
    (x) => x.grupo === "tipo_principal" && x.termo === tipo.trim(),
  );
  return e?.corPdf ?? corTipoPrincipal(tipo);
}

/** Monta texto de detalhe (complementos) para `soloDetalhe`. */
export function montarDetalheSolo(c: ComplementosDescricaoSolo): string {
  const partes: string[] = [];
  if (c.origem?.trim()) partes.push(`origem ${c.origem.trim()}`);
  if (c.granulometria?.trim()) partes.push(c.granulometria.trim());
  if (c.plasticidade?.trim()) partes.push(c.plasticidade.trim());
  if (c.consistencia?.trim()) partes.push(`consistência ${c.consistencia.trim()}`);
  if (c.compacidade?.trim()) partes.push(`compacidade ${c.compacidade.trim()}`);
  if (c.cor?.trim()) partes.push(`cor ${c.cor.trim()}`);
  if (c.umidade?.trim()) partes.push(c.umidade.trim());
  if (c.estrutura?.trim()) partes.push(c.estrutura.trim());
  if (c.inclusoes?.length) partes.push(c.inclusoes.join(", "));
  if (c.alteracao?.trim()) partes.push(c.alteracao.trim());
  if (c.uscs?.trim()) partes.push(c.uscs.trim());
  if (c.observacao?.trim()) partes.push(c.observacao.trim());
  return partes.join("; ");
}

/** Texto completo para PDF (tipo + detalhe, maiúsculas no relatório). */
export function textoCompletoDescricaoSolo(
  tipoPrincipal: string,
  detalhe: string,
): string {
  const t = tipoPrincipal.trim();
  const d = detalhe.trim();
  if (!t) return d || "—";
  if (!d) return t;
  return `${t}, ${d}`;
}

/** Analisa `soloDetalhe` guardado e tenta repor complementos (melhor esforço). */
export function parseDetalheSolo(detalhe: string): ComplementosDescricaoSolo {
  const out: ComplementosDescricaoSolo = { inclusoes: [] };
  if (!detalhe.trim()) return out;
  const obsMatch = detalhe.match(/(?:^|;\s*)obs\.?\s*(.+)$/i);
  let rest = detalhe;
  if (obsMatch) {
    out.observacao = obsMatch[1].trim();
    rest = detalhe.slice(0, obsMatch.index).trim();
  }
  const partes = rest.split(/;\s*/).filter(Boolean);
  for (const p of partes) {
    const low = p.toLowerCase();
    if (low.startsWith("origem ")) {
      out.origem = p.slice(7).trim();
      continue;
    }
    if (low.startsWith("consistência ") || low.startsWith("consistencia ")) {
      out.consistencia = p.replace(/^consist[eê]ncia\s+/i, "").trim();
      continue;
    }
    if (low.startsWith("compacidade ")) {
      out.compacidade = p.slice(12).trim();
      continue;
    }
    if (low.startsWith("cor ")) {
      out.cor = p.slice(4).trim();
      continue;
    }
    const uscs = NOMENCLATURA_GEOLOGICA.find(
      (e) => e.grupo === "classificacao_uscs" && p.includes(e.termo.split("—")[0]?.trim() ?? ""),
    );
    if (uscs || /^[A-Z]{2}\s*—/.test(p)) {
      out.uscs = p;
      continue;
    }
    const hit = (grupo: GrupoNomenclatura) =>
      NOMENCLATURA_GEOLOGICA.find((e) => e.grupo === grupo && e.termo === p);
    if (hit("origem")) {
      out.origem = p;
      continue;
    }
    if (hit("granulometria")) {
      out.granulometria = p;
      continue;
    }
    if (hit("plasticidade")) {
      out.plasticidade = p;
      continue;
    }
    if (hit("consistencia")) {
      out.consistencia = p;
      continue;
    }
    if (hit("compacidade")) {
      out.compacidade = p;
      continue;
    }
    if (hit("cor")) {
      out.cor = p;
      continue;
    }
    if (hit("umidade")) {
      out.umidade = p;
      continue;
    }
    if (hit("estrutura")) {
      out.estrutura = p;
      continue;
    }
    if (hit("alteracao_rocha")) {
      out.alteracao = p;
      continue;
    }
    if (hit("inclusoes")) {
      out.inclusoes = [...(out.inclusoes ?? []), p];
      continue;
    }
    if (!out.observacao) out.observacao = p;
  }
  return out;
}

/** Agrupa tipos principais para `<optgroup>`. */
export const TIPOS_SOLO_POR_FAMILIA: { label: string; tipos: readonly string[] }[] = [
  {
    label: "Argilas",
    tipos: TIPOS_SOLO_PRINCIPAIS.filter((t) => t.startsWith("Argila")),
  },
  {
    label: "Siltes",
    tipos: TIPOS_SOLO_PRINCIPAIS.filter((t) => t.startsWith("Silte")),
  },
  {
    label: "Areias",
    tipos: TIPOS_SOLO_PRINCIPAIS.filter((t) => t.startsWith("Areia")),
  },
  {
    label: "Granulares grossos",
    tipos: ["Pedregulho", "Cascalho", "Solo gravoso", "Bloco / matacão"],
  },
  {
    label: "Especiais / depósitos",
    tipos: TIPOS_SOLO_PRINCIPAIS.filter(
      (t) =>
        t.includes("orgânico") ||
        t.includes("Aterro") ||
        t.includes("Saprolito") ||
        t.includes("Colúvio") ||
        t.includes("Alúvio") ||
        t.includes("residual"),
    ),
  },
  {
    label: "Rochas",
    tipos: ["Rocha alterada", "Rocha sã"],
  },
];
