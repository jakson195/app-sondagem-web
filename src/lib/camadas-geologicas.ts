import type { CamadaEstratigrafica } from "@/components/perfil-estratigrafico";
import { corTipoRocha, TIPOS_ROCHA } from "@/lib/tipos-rocha";

export const COR_PADRAO_CAMADA = "#cccccc";

export type CamadaGeol = {
  de: string;
  ate: string;
  tipo: string;
  cor: string;
  descricao: string;
};

export function parseProfundidadeCamadaM(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function camadasGeolToPerfil(rows: CamadaGeol[]): CamadaEstratigrafica[] {
  const out: CamadaEstratigrafica[] = [];
  for (const row of rows) {
    const a = parseProfundidadeCamadaM(row.de);
    const b = parseProfundidadeCamadaM(row.ate);
    if (a == null || b == null) continue;
    const topo = Math.min(a, b);
    const base = Math.max(a, b);
    if (!(base > topo)) continue;
    const material = (row.tipo || row.descricao || "").trim() || "—";
    out.push({
      topo,
      base,
      cor: row.cor?.trim() || COR_PADRAO_CAMADA,
      material,
    });
  }
  out.sort((x, y) => x.topo - y.topo);
  return out;
}

export function parseCamadaGeol(row: unknown): CamadaGeol | null {
  if (row == null || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  let tipo = typeof r.tipo === "string" ? r.tipo : "";
  let cor = typeof r.cor === "string" ? r.cor : COR_PADRAO_CAMADA;
  const descricao = typeof r.descricao === "string" ? r.descricao : "";
  if (!tipo && descricao) {
    const hit = TIPOS_ROCHA.find((t) => t.nome === descricao);
    if (hit) {
      tipo = hit.nome;
      cor = hit.cor;
    }
  }
  return {
    de: typeof r.de === "string" ? r.de : "",
    ate: typeof r.ate === "string" ? r.ate : "",
    tipo,
    cor: (tipo && corTipoRocha(tipo)) || cor,
    descricao,
  };
}

export function parseCamadasGeologicas(raw: unknown): CamadaGeol[] {
  if (!Array.isArray(raw)) return [];
  const out: CamadaGeol[] = [];
  for (const row of raw) {
    const p = parseCamadaGeol(row);
    if (p) out.push(p);
  }
  return out;
}

/** Nova camada sempre no final da lista (ordem de preenchimento). */
export function novaCamadaGeolNoFinal(
  prev: CamadaGeol[],
  opts?: { deSugerido?: string; ateSugerido?: string },
): CamadaGeol[] {
  return [
    ...prev,
    {
      de: opts?.deSugerido ?? "",
      ate: opts?.ateSugerido ?? "",
      tipo: "",
      cor: COR_PADRAO_CAMADA,
      descricao: "",
    },
  ];
}

export function removerCamadaGeol(prev: CamadaGeol[], index: number): CamadaGeol[] {
  return prev.filter((_, j) => j !== index);
}

export function atualizarCamadaGeolCampo(
  prev: CamadaGeol[],
  index: number,
  campo: keyof CamadaGeol,
  valor: string,
): CamadaGeol[] {
  const novo = [...prev];
  novo[index] = { ...novo[index], [campo]: valor };
  return novo;
}

export function selecionarTipoCamadaGeol(
  prev: CamadaGeol[],
  index: number,
  nome: string,
): CamadaGeol[] {
  const novo = [...prev];
  if (!nome) {
    novo[index] = {
      ...novo[index],
      tipo: "",
      cor: COR_PADRAO_CAMADA,
    };
    return novo;
  }
  const tipo = TIPOS_ROCHA.find((t) => t.nome === nome);
  if (!tipo) return prev;
  novo[index] = { ...novo[index], tipo: tipo.nome, cor: tipo.cor };
  return novo;
}
