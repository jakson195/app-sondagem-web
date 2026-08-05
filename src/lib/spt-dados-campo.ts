import {
  parseCamadasGeologicas,
  type CamadaGeol,
} from "@/lib/camadas-geologicas";

export const SPT_DADOS_V = 1 as const;

export type SptDadosCampo = {
  v: typeof SPT_DADOS_V;
  camadasGeologicas: CamadaGeol[];
  fotosRelatorio: string[];
  dataInicio: string;
  dataFim: string;
  paginaPdf: number;
  totalPaginasPdf: number;
  amostradorExt: string;
  amostradorInt: string;
  revestimentoMeta: string;
  revestimentoComprimento: string;
  trado: string;
  alturaQueda: string;
  pesoMartelo: string;
  sistema: string;
  cota: string;
  nivelAgua: string;
  naProfundidade: string;
  sondador: string;
  responsavel: string;
  crea: string;
  rodapeContato: string;
  enderecoEmpresa: string;
  mapaRelLatStr: string;
  mapaRelLngStr: string;
};

function s(raw: Record<string, unknown>, k: string): string {
  return typeof raw[k] === "string" ? (raw[k] as string) : "";
}

function n(raw: Record<string, unknown>, k: string, d: number): number {
  const v = Number(raw[k]);
  return Number.isFinite(v) ? Math.max(1, Math.round(v)) : d;
}

export function normalizeSptDadosCampo(raw: unknown): Partial<SptDadosCampo> | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const fotos: string[] = [];
  if (Array.isArray(o.fotosRelatorio)) {
    for (const x of o.fotosRelatorio) {
      if (typeof x === "string" && x.length > 0) fotos.push(x);
    }
  }
  return {
    v: SPT_DADOS_V,
    camadasGeologicas: parseCamadasGeologicas(o.camadasGeologicas),
    fotosRelatorio: fotos,
    dataInicio: s(o, "dataInicio"),
    dataFim: s(o, "dataFim"),
    paginaPdf: n(o, "paginaPdf", 1),
    totalPaginasPdf: n(o, "totalPaginasPdf", 1),
    amostradorExt: s(o, "amostradorExt") || "50,8",
    amostradorInt: s(o, "amostradorInt") || "34,9",
    revestimentoMeta: s(o, "revestimentoMeta"),
    revestimentoComprimento: s(o, "revestimentoComprimento"),
    trado: s(o, "trado"),
    alturaQueda: s(o, "alturaQueda") || "75 cm",
    pesoMartelo: s(o, "pesoMartelo") || "65 kgf",
    sistema: s(o, "sistema") || "manual",
    cota: s(o, "cota"),
    nivelAgua: s(o, "nivelAgua"),
    naProfundidade: s(o, "naProfundidade"),
    sondador: s(o, "sondador"),
    responsavel: s(o, "responsavel"),
    crea: s(o, "crea"),
    rodapeContato: s(o, "rodapeContato"),
    enderecoEmpresa:
      s(o, "enderecoEmpresa") || "Rua Flávio Pires, 131, Araranguá - SC",
    mapaRelLatStr: s(o, "mapaRelLatStr"),
    mapaRelLngStr: s(o, "mapaRelLngStr"),
  };
}

export function buildSptDadosCampo(input: Omit<SptDadosCampo, "v">): SptDadosCampo {
  return { v: SPT_DADOS_V, ...input };
}
