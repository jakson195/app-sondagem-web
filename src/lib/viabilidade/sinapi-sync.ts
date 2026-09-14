import {
  baixarArquivoCaixa,
  candidatosCompetenciaProxima,
  competenciaAtual,
  descobrirCompetenciaPublicada,
  escolherCompetenciaMaisProxima,
  mensagemFallbackCompetencia,
  mesmaCompetencia,
  normalizeTipoSinapi,
  parseArquivoSinapi,
  parseCompetencia,
  SinapiSyncError,
} from "./sinapi-caixa";
import { listarCompetenciasDisponiveis, upsertSinapiRows } from "./sinapi-store";
import { isUfBrasil } from "./sinapi-ufs";
import type { TipoCustoSinapi } from "./types";

export type SinapiSyncInput = {
  uf: string;
  competencia?: string | null;
  tipo?: string | null;
};

export type SinapiSyncResult = {
  uf: string;
  competencia: string;
  competenciaSolicitada: string;
  tipo: TipoCustoSinapi;
  imported: number;
  created: number;
  updated: number;
  skipped: number;
  fonteUrl: string;
  fonteArquivo: string;
  errors: string[];
  fallbackUsado: boolean;
  avisoFallback: string | null;
};

export async function resolverCompetenciaSync(raw?: string | null): Promise<string> {
  if (raw && raw.trim()) {
    return parseCompetencia(raw).label;
  }
  const publicada = await descobrirCompetenciaPublicada();
  if (publicada) return publicada;
  return competenciaAtual();
}

async function importarCaixaMes(
  uf: string,
  competencia: string,
  tipo: TipoCustoSinapi,
): Promise<Omit<SinapiSyncResult, "competenciaSolicitada" | "fallbackUsado" | "avisoFallback"> | null> {
  try {
    const downloaded = await baixarArquivoCaixa(uf, competencia, tipo);
    const parsed = await parseArquivoSinapi(downloaded.buffer, downloaded.filename, tipo, competencia);
    if (parsed.rows.length === 0) return null;
    const saved = await upsertSinapiRows({ rows: parsed.rows, uf, competencia });
    return {
      uf,
      competencia,
      tipo,
      imported: saved.imported,
      created: saved.created,
      updated: saved.updated,
      skipped: parsed.skipped,
      fonteUrl: downloaded.url,
      fonteArquivo: downloaded.filename,
      errors: parsed.errors,
    };
  } catch (error) {
    if (error instanceof SinapiSyncError && (error.code === "ARQUIVO" || error.code === "VAZIO" || error.code === "CAIXA")) {
      return null;
    }
    throw error;
  }
}

function resultadoBanco(
  uf: string,
  solicitada: string,
  usada: string,
  tipo: TipoCustoSinapi,
): SinapiSyncResult {
  const fallbackUsado = !mesmaCompetencia(solicitada, usada);
  return {
    uf,
    competencia: usada,
    competenciaSolicitada: solicitada,
    tipo,
    imported: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    fonteUrl: "",
    fonteArquivo: "banco",
    errors: [],
    fallbackUsado,
    avisoFallback: fallbackUsado ? mensagemFallbackCompetencia(solicitada, usada) : null,
  };
}

export async function sincronizarSinapiUf(input: SinapiSyncInput): Promise<SinapiSyncResult> {
  const uf = input.uf.trim().toUpperCase();
  if (!isUfBrasil(uf)) {
    throw new SinapiSyncError(`UF inválida: ${input.uf}.`, "UF");
  }
  const tipo = normalizeTipoSinapi(input.tipo);
  const solicitada = await resolverCompetenciaSync(input.competencia);

  const direto = await importarCaixaMes(uf, solicitada, tipo);
  if (direto) {
    return {
      ...direto,
      competenciaSolicitada: solicitada,
      fallbackUsado: false,
      avisoFallback: null,
    };
  }

  const noBanco = await listarCompetenciasDisponiveis(uf);
  const nearestDb = escolherCompetenciaMaisProxima(
    solicitada,
    noBanco.filter((row) => row.count > 0).map((row) => row.competencia),
  );
  if (nearestDb) {
    return resultadoBanco(uf, solicitada, nearestDb, tipo);
  }

  const urlsTentadas: string[] = [];
  for (const candidate of candidatosCompetenciaProxima(solicitada)) {
    const imported = await importarCaixaMes(uf, candidate, tipo);
    if (imported) {
      return {
        ...imported,
        competenciaSolicitada: solicitada,
        fallbackUsado: true,
        avisoFallback: mensagemFallbackCompetencia(solicitada, imported.competencia),
      };
    }
    urlsTentadas.push(candidate);
  }

  throw new SinapiSyncError(
    `Não existem preços disponíveis para ${solicitada} — ${uf} nem nos 12 meses mais próximos. Importe o XLSX oficial da Caixa.`,
    "VAZIO",
    urlsTentadas,
  );
}
