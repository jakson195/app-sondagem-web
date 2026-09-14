import AdmZip from "adm-zip";
import type { TipoCustoSinapi } from "./types";
import { parseCsv, parseTabularSinapi, type SinapiImportResult } from "./sinapi-import";
import { isUfBrasil } from "./sinapi-ufs";

export class SinapiSyncError extends Error {
  constructor(
    message: string,
    public code: "COMPETENCIA" | "UF" | "CAIXA" | "ARQUIVO" | "VAZIO",
    public urlsTentadas: string[] = [],
  ) {
    super(message);
    this.name = "SinapiSyncError";
  }
}

const CAIXA_BASE = "https://www.caixa.gov.br/Downloads";

const PASTAS_CAIXA = [
  "sinapi-composicoes-a-partir-jul-2009-excel",
  "sinapi-a-partir-jul-2009",
  "sinapi-a-partir-jul-2009-txt",
  "sinapi-precos-referencia",
];

export function parseCompetencia(raw: string | null | undefined): { label: string; mm: string; yyyy: string; yyyymm: string } {
  const text = (raw ?? "").trim();
  const br = text.match(/^(\d{2})\/(\d{4})$/);
  if (br) {
    const mm = br[1]!;
    const yyyy = br[2]!;
    const month = Number(mm);
    if (month < 1 || month > 12) {
      throw new SinapiSyncError("Competência inválida. Use MM/AAAA.", "COMPETENCIA");
    }
    return { label: `${mm}/${yyyy}`, mm, yyyy, yyyymm: `${yyyy}${mm}` };
  }
  const iso = text.match(/^(\d{4})-(\d{2})$/);
  if (iso) {
    return parseCompetencia(`${iso[2]}/${iso[1]}`);
  }
  const compact = text.match(/^(\d{4})(\d{2})$/);
  if (compact) {
    return parseCompetencia(`${compact[2]}/${compact[1]}`);
  }
  throw new SinapiSyncError("Informe a competência no formato MM/AAAA.", "COMPETENCIA");
}

/** Formatos gravados/consultados para o mesmo mês: 09/2026, 202609, 2026-09. */
export function aliasesCompetencia(raw: string | null | undefined): string[] {
  const text = (raw ?? "").trim();
  if (!text) return [];
  try {
    const parsed = parseCompetencia(text);
    return [...new Set([parsed.label, parsed.yyyymm, `${parsed.yyyy}-${parsed.mm}`])];
  } catch {
    return [text];
  }
}

export function normalizarCompetenciaLabel(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  try {
    return parseCompetencia(text).label;
  } catch {
    return null;
  }
}

export function mesmaCompetencia(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = (a ?? "").trim();
  const right = (b ?? "").trim();
  if (!left || !right) return false;
  if (left === right) return true;
  try {
    return parseCompetencia(left).label === parseCompetencia(right).label;
  } catch {
    return false;
  }
}

export function competenciaAtual(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${mm}/${now.getFullYear()}`;
}

/** Janela para buscar competência com dados (meses para trás, depois para frente). */
export const JANELA_COMPETENCIA_MESES = 12;

export function addMonthsCompetencia(raw: string, delta: number): string {
  const parsed = parseCompetencia(raw);
  const monthIndex = Number(parsed.yyyy) * 12 + (Number(parsed.mm) - 1) + delta;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  return `${String(month).padStart(2, "0")}/${year}`;
}

/** Primeiro os meses anteriores (mais recente primeiro), depois os seguintes. */
export function candidatosCompetenciaProxima(
  raw: string,
  maxBack = JANELA_COMPETENCIA_MESES,
  maxForward = JANELA_COMPETENCIA_MESES,
): string[] {
  const origin = parseCompetencia(raw).label;
  const out: string[] = [];
  for (let i = 1; i <= maxBack; i++) out.push(addMonthsCompetencia(origin, -i));
  for (let i = 1; i <= maxForward; i++) out.push(addMonthsCompetencia(origin, i));
  return out;
}

export function mensagemFallbackCompetencia(solicitada: string, usada: string): string {
  const pedida = parseCompetencia(solicitada).label;
  const escolhida = parseCompetencia(usada).label;
  return `Sem preços em ${pedida}. Usando competência ${escolhida} (mais próxima com dados).`;
}

/**
 * Escolhe a competência com dados mais próxima da pedida.
 * Prefere o mês publicado mais recente anterior; se não houver, o mais próximo posterior.
 */
export function escolherCompetenciaMaisProxima(
  solicitada: string,
  disponiveis: string[],
): string | null {
  const have = new Set<string>();
  for (const raw of disponiveis) {
    try {
      have.add(parseCompetencia(raw).label);
    } catch {
      // ignora rótulos inválidos
    }
  }
  const pedida = parseCompetencia(solicitada).label;
  if (have.has(pedida)) return pedida;
  for (const candidate of candidatosCompetenciaProxima(pedida)) {
    if (have.has(candidate)) return candidate;
  }
  return null;
}

export async function resolverCompetenciaMaisProximaComDados(
  solicitada: string,
  temDados: (competencia: string) => boolean | Promise<boolean>,
): Promise<{ competencia: string; fallbackUsado: boolean; avisoFallback: string | null } | null> {
  const pedida = parseCompetencia(solicitada).label;
  if (await temDados(pedida)) {
    return { competencia: pedida, fallbackUsado: false, avisoFallback: null };
  }
  for (const candidate of candidatosCompetenciaProxima(pedida)) {
    if (await temDados(candidate)) {
      return {
        competencia: candidate,
        fallbackUsado: true,
        avisoFallback: mensagemFallbackCompetencia(pedida, candidate),
      };
    }
  }
  return null;
}

export function normalizeTipoSinapi(raw: string | null | undefined): TipoCustoSinapi {
  const n = (raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (n === "nao" || n === "nao_desonerado" || n === "nao_desonerado" || n.includes("nao")) {
    return "NAO_DESONERADO";
  }
  return "DESONERADO";
}

function sufixosTipo(tipo: TipoCustoSinapi): string[] {
  return tipo === "DESONERADO"
    ? ["Desonerado"]
    : ["NaoDesonerado", "Nao_Desonerado"];
}

export function urlsOficiaisCaixa(uf: string, competencia: string, tipo: TipoCustoSinapi): string[] {
  const sigla = uf.trim().toUpperCase();
  if (!isUfBrasil(sigla)) {
    throw new SinapiSyncError(`UF inválida: ${uf}.`, "UF");
  }
  const { mm, yyyy, yyyymm } = parseCompetencia(competencia);
  const urls: string[] = [];
  for (const pasta of PASTAS_CAIXA) {
    for (const sufixo of sufixosTipo(tipo)) {
      const nomes = [
        `SINAPI_Custo_Ref_Composicoes_Sintetico_${sigla}_${yyyymm}_${sufixo}.xlsx`,
        `SINAPI_Custo_Ref_Composicoes_Sintetico_${sigla}_${yyyymm}_${sufixo}.xls`,
        `SINAPI_Custo_Ref_Composicoes_Analitico_${sigla}_${yyyymm}_${sufixo}.xlsx`,
        `SINAPI_ref_Insumos_Composicoes_${sigla}_${yyyy}_${mm}_${sufixo}.zip`,
        `SINAPI_ref_Insumos_Composicoes_${sigla}_${yyyymm}_${sufixo}.zip`,
        `SINAPI_Preco_Ref_Insumos_${sigla}_${yyyymm}_${sufixo}.xlsx`,
      ];
      for (const nome of nomes) {
        urls.push(`${CAIXA_BASE}/${pasta}/${nome}`);
      }
    }
  }
  return urls;
}

function ehPlanilhaOuZip(buffer: Buffer, contentType: string, url: string): boolean {
  if (buffer.length < 8) return false;
  const zipMagic = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const xlsMagic = buffer[0] === 0xd0 && buffer[1] === 0xcf;
  if (zipMagic || xlsMagic) return true;
  const type = contentType.toLowerCase();
  if (type.includes("spreadsheet") || type.includes("excel") || type.includes("zip") || type.includes("octet-stream")) {
    return !buffer.toString("utf8", 0, 200).trim().toLowerCase().startsWith("<!doctype") &&
      !buffer.toString("utf8", 0, 200).trim().toLowerCase().startsWith("<html");
  }
  return /\.(xlsx|xls|zip)$/i.test(url);
}

export async function baixarArquivoCaixa(
  uf: string,
  competencia: string,
  tipo: TipoCustoSinapi,
  fetchImpl: typeof fetch = fetch,
): Promise<{ buffer: Buffer; url: string; filename: string }> {
  const urls = urlsOficiaisCaixa(uf, competencia, tipo);
  const falhas: string[] = [];
  for (const url of urls) {
    try {
      const res = await fetchImpl(url, {
        redirect: "follow",
        headers: {
          Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/zip,*/*",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
      });
      if (!res.ok) {
        falhas.push(`${res.status} ${url}`);
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") ?? "";
      if (!ehPlanilhaOuZip(buffer, contentType, url)) {
        falhas.push(`HTML/bloqueio ${url}`);
        continue;
      }
      const filename = decodeURIComponent(url.split("/").pop() ?? "sinapi.xlsx");
      return { buffer, url, filename };
    } catch (error) {
      falhas.push(`${error instanceof Error ? error.message : "rede"} ${url}`);
    }
  }
  const bloqueio = falhas.some((item) => /HTML|403|401|bloqueio/i.test(item));
  throw new SinapiSyncError(
    bloqueio
      ? `A Caixa não liberou o download automático do SINAPI ${uf} ${competencia}. Importe o XLSX oficial (Downloads da Caixa) como fallback.`
      : `Não existem preços disponíveis para esta competência (${competencia} — ${uf}). Nenhuma outra competência foi usada.`,
    bloqueio ? "CAIXA" : "ARQUIVO",
    urls,
  );
}

function preferenciaArquivoZip(name: string): number {
  const n = name.toLowerCase();
  if (n.includes("sintetico") && n.includes("composic")) return 0;
  if (n.includes("composic") && (n.endsWith(".xlsx") || n.endsWith(".xls"))) return 1;
  if (n.includes("insumo") && (n.endsWith(".xlsx") || n.endsWith(".xls"))) return 2;
  if (n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv")) return 3;
  return 99;
}

async function matrizDePlanilha(buffer: Buffer): Promise<unknown[][]> {
  const xlsx = await import("xlsx");
  const wb = xlsx.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!sheet) {
    throw new SinapiSyncError("Planilha SINAPI vazia.", "VAZIO");
  }
  return xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false }) as unknown[][];
}

export function detectarCompetenciaNoTexto(text: string): string | null {
  const br = text.match(/\b(\d{2})\/(\d{4})\b/);
  if (br) {
    try {
      return parseCompetencia(`${br[1]}/${br[2]}`).label;
    } catch {
      return null;
    }
  }
  const compact = text.match(/\b(20\d{2})(0[1-9]|1[0-2])\b/);
  if (compact) {
    return parseCompetencia(`${compact[1]}${compact[2]}`).label;
  }
  return null;
}

export async function parseArquivoSinapi(
  buffer: Buffer,
  filename: string,
  tipo: TipoCustoSinapi,
  competenciaSolicitada: string,
): Promise<SinapiImportResult> {
  const lower = filename.toLowerCase();
  let matrix: unknown[][];
  if (lower.endsWith(".zip")) {
    const zip = new AdmZip(buffer);
    const entries = zip
      .getEntries()
      .filter((entry) => !entry.isDirectory && preferenciaArquivoZip(entry.entryName) < 99)
      .sort((a, b) => preferenciaArquivoZip(a.entryName) - preferenciaArquivoZip(b.entryName));
    const chosen = entries[0] as
      | (typeof entries)[number] & { getData: () => Buffer }
      | undefined;
    if (!chosen) {
      throw new SinapiSyncError("O ZIP da Caixa não contém planilha SINAPI.", "ARQUIVO");
    }
    return parseArquivoSinapi(chosen.getData(), chosen.entryName, tipo, competenciaSolicitada);
  } else if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    matrix = parseCsv(buffer.toString("utf8"));
  } else {
    matrix = await matrizDePlanilha(buffer);
  }
  const parsed = parseTabularSinapi(matrix, tipo);
  const hint = detectarCompetenciaNoTexto(`${filename} ${matrix.slice(0, 8).flat().join(" ")}`);
  if (hint && hint !== competenciaSolicitada) {
    parsed.errors.unshift(
      `O arquivo indica competência ${hint}, diferente de ${competenciaSolicitada}. Nenhuma competência foi substituída.`,
    );
  }
  return parsed;
}

export async function descobrirCompetenciaPublicada(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const paginas = [
    `${CAIXA_BASE}/sinapi-composicoes-a-partir-jul-2009-excel/`,
    `${CAIXA_BASE}/sinapi-a-partir-jul-2009/`,
  ];
  const encontradas: string[] = [];
  for (const url of paginas) {
    try {
      const res = await fetchImpl(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
      });
      if (!res.ok) continue;
      const html = await res.text();
      for (const match of html.matchAll(/\b(20\d{2})(0[1-9]|1[0-2])\b/g)) {
        encontradas.push(parseCompetencia(`${match[1]}${match[2]}`).label);
      }
      for (const match of html.matchAll(/\b(0[1-9]|1[0-2])\/(20\d{2})\b/g)) {
        encontradas.push(parseCompetencia(`${match[1]}/${match[2]}`).label);
      }
    } catch {
      // listing page is optional
    }
  }
  if (encontradas.length === 0) return null;
  encontradas.sort((a, b) => {
    const pa = parseCompetencia(a);
    const pb = parseCompetencia(b);
    return pb.yyyymm.localeCompare(pa.yyyymm);
  });
  return encontradas[0] ?? null;
}
