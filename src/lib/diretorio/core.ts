/**
 * Diretório "Empresas por região" — regras puras (sem banco), testáveis em Node.
 * Só empresas que usam o app: perfil visível + assinatura ativa.
 */
import municipiosRaw from "./municipios-ibge.json";
import { SERVICOS_DIRETORIO, type ServicoDiretorio } from "./servicos";

export { SERVICOS_DIRETORIO, type ServicoDiretorio };

/** [codigoIbge, nome, uf, lat, lon] */
type MunicipioRow = [number, string, string, number, number];
export type Municipio = { codigoIbge: number; nome: string; uf: string; lat: number; lon: number };

const LISTA: Municipio[] = (municipiosRaw as MunicipioRow[]).map(([codigoIbge, nome, uf, lat, lon]) => ({
  codigoIbge,
  nome,
  uf,
  lat,
  lon,
}));
const POR_CODIGO = new Map(LISTA.map((m) => [m.codigoIbge, m]));

export function isServicoDiretorio(v: string): v is ServicoDiretorio {
  return Object.prototype.hasOwnProperty.call(SERVICOS_DIRETORIO, v);
}

export function municipioPorCodigo(codigo: number): Municipio | null {
  return POR_CODIGO.get(codigo) ?? null;
}

function semAcento(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
const NOMES = LISTA.map((m) => semAcento(m.nome));

/**
 * Autocompletar: "crici", "Criciúma", "criciuma sc", "Criciúma/SC". Começo do nome primeiro,
 * depois "contém"; no empate, ordem alfabética.
 */
export function buscarMunicipios(q: string, limite = 8): Municipio[] {
  const m = semAcento(q).match(/^(.*?)(?:[\s/,-]+([a-z]{2}))?$/);
  let termo = (m?.[1] ?? "").trim();
  let uf = m?.[2]?.toUpperCase();
  if (!termo && uf) {
    termo = uf.toLowerCase();
    uf = undefined;
  }
  if (termo.length < 2) return [];
  const comeco: Municipio[] = [];
  const contem: Municipio[] = [];
  for (let i = 0; i < LISTA.length; i++) {
    const mun = LISTA[i]!;
    if (uf && mun.uf !== uf) continue;
    const n = NOMES[i]!;
    if (n.startsWith(termo)) comeco.push(mun);
    else if (n.includes(termo)) contem.push(mun);
  }
  return [...comeco, ...contem].slice(0, limite);
}

/** Distância em km (haversine). */
export function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Situação de assinatura que mantém a empresa no diretório. */
export type AssinaturaInfo = {
  status: "ACTIVE" | "TRIAL" | "SUSPENDED" | "CANCELLED" | string;
  trialEndsAt?: Date | string | null;
  currentPeriodEnd?: Date | string | null;
} | null;

/**
 * Assinatura ativa: ACTIVE (dentro do período, se houver fim) ou TRIAL ainda válido.
 * Sem registro de assinatura usa o status da empresa (contas antigas).
 */
export function assinaturaAtiva(
  assinatura: AssinaturaInfo,
  statusEmpresa: string | null | undefined,
  agora: Date = new Date(),
): boolean {
  const data = (v: Date | string | null | undefined) => (v ? new Date(v) : null);
  if (!assinatura) return statusEmpresa === "ACTIVE";
  if (assinatura.status === "ACTIVE") {
    const fim = data(assinatura.currentPeriodEnd);
    /** 3 dias de tolerância para renovação/boleto. */
    return !fim || fim.getTime() + 3 * 86400000 >= agora.getTime();
  }
  if (assinatura.status === "TRIAL") {
    const fim = data(assinatura.trialEndsAt);
    return !fim || fim.getTime() >= agora.getTime();
  }
  return false;
}

export type PerfilDiretorio = {
  empresaId: number;
  nome: string;
  logo?: string | null;
  visivel: boolean;
  codigoIbge: number;
  cidade: string;
  uf: string;
  latitude: number;
  longitude: number;
  raioKm: number;
  servicos: string[];
  descricao?: string | null;
  registroVerificado: boolean;
  ativa: boolean;
};

export type ResultadoDiretorio = {
  empresaId: number;
  nome: string;
  logo: string | null;
  cidade: string;
  uf: string;
  distanciaKm: number;
  /** A cidade buscada está dentro do raio de atuação da empresa. */
  atendeACidade: boolean;
  mesmaCidade: boolean;
  servicos: string[];
  descricao: string | null;
  verificada: boolean;
};

/**
 * Busca: empresas visíveis e ativas que ficam até `raioBuscaKm` da cidade OU cuja atuação a cobre.
 * Ordem: mesma cidade, atende a cidade, verificada, distância.
 */
export function buscarEmpresas(
  perfis: PerfilDiretorio[],
  cidade: Municipio,
  opts: { raioBuscaKm?: number; servico?: string | null; limite?: number } = {},
): ResultadoDiretorio[] {
  const raioBusca = Math.max(5, Math.min(500, opts.raioBuscaKm ?? 80));
  const out: ResultadoDiretorio[] = [];
  for (const p of perfis) {
    if (!p.visivel || !p.ativa) continue;
    if (opts.servico && !p.servicos.includes(opts.servico)) continue;
    const d = distanciaKm(cidade, { lat: p.latitude, lon: p.longitude });
    const atende = d <= p.raioKm;
    if (d > raioBusca && !atende) continue;
    out.push({
      empresaId: p.empresaId,
      nome: p.nome,
      logo: p.logo ?? null,
      cidade: p.cidade,
      uf: p.uf,
      distanciaKm: Math.round(d * 10) / 10,
      atendeACidade: atende,
      mesmaCidade: p.codigoIbge === cidade.codigoIbge,
      servicos: p.servicos.filter(isServicoDiretorio),
      descricao: p.descricao ?? null,
      verificada: p.registroVerificado,
    });
  }
  out.sort(
    (a, b) =>
      Number(b.mesmaCidade) - Number(a.mesmaCidade) ||
      Number(b.atendeACidade) - Number(a.atendeACidade) ||
      Number(b.verificada) - Number(a.verificada) ||
      a.distanciaKm - b.distanciaKm,
  );
  return out.slice(0, opts.limite ?? 50);
}
