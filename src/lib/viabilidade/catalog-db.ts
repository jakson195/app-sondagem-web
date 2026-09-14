import { prisma } from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/pg-error-utils";
import { PARAMETROS_CATALOGO } from "./catalog";
import { emptyPriceCatalog, type PriceCatalog } from "./custos";
import { D } from "./money";
import { findSinapiRowsForCatalog } from "./sinapi-store";
import type { TipoCustoSinapi } from "./types";

export async function ensureViabilidadeParametros() {
  const paramDel = (prisma as unknown as { viabilidadeParametro?: { findFirst: Function; create: Function; update: Function } }).viabilidadeParametro;
  if (!paramDel) return;
  for (const row of PARAMETROS_CATALOGO) {
    const existing = (await paramDel.findFirst({
      where: { categoria: row.categoria, codigo: row.codigo },
    })) as { id: string } | null;
    if (existing) {
      await paramDel.update({
        where: { id: existing.id },
        data: { descricao: row.descricao, unidade: row.unidade, fonte: row.fonte },
      });
      continue;
    }
    await paramDel.create({
      data: {
        categoria: row.categoria,
        codigo: row.codigo,
        descricao: row.descricao,
        unidade: row.unidade,
        fonte: row.fonte,
        ativo: true,
      },
    });
  }
}

export async function loadPriceCatalog(input: {
  uf: string;
  competencia: string | null;
  tipoSinapi: TipoCustoSinapi;
}): Promise<PriceCatalog> {
  try {
    await ensureViabilidadeParametros();
  } catch (error) {
    if (
      !(
        isPrismaMissingTableError(error) ||
        /viabilidade|sinapi|sicro|undefined/i.test(error instanceof Error ? error.message : "")
      )
    ) {
      throw error;
    }
  }
  try {
  const sinapi = await findSinapiRowsForCatalog({ uf: input.uf, competencia: input.competencia });
  const sicroDel = (prisma as unknown as { sicroComposicao?: { findMany: (args: unknown) => Promise<unknown[]> } }).sicroComposicao;
  const paramDel = (prisma as unknown as { viabilidadeParametro?: { findMany: (args: unknown) => Promise<unknown[]> } }).viabilidadeParametro;
  const [sicro, parametros] = await Promise.all([
    sicroDel
      ? sicroDel.findMany({
          where: {
            ativo: true,
            uf: input.uf,
            ...(input.competencia ? { competencia: input.competencia } : {}),
          },
        }).catch(() => [])
      : Promise.resolve([]),
    paramDel
      ? paramDel.findMany({ where: { ativo: true } }).catch(() => [])
      : Promise.resolve([]),
  ]);

  return {
    tipoSinapi: input.tipoSinapi,
    sinapi: sinapi.map((row) => ({
      codigo: row.codigo,
      descricao: row.descricao,
      unidade: row.unidade,
      uf: row.uf,
      competencia: row.competencia,
      custoDesonerado: row.custoDesonerado,
      custoNaoDesonerado: row.custoNaoDesonerado,
      ativo: row.ativo,
    })),
    sicro: (sicro as Array<Record<string, unknown>>).map((row) => ({
      codigo: String(row.codigo ?? ""),
      descricao: String(row.descricao ?? ""),
      unidade: String(row.unidade ?? ""),
      uf: String(row.uf ?? ""),
      competencia: String(row.competencia ?? ""),
      custo: row.custo as PriceCatalog["sicro"][number]["custo"],
      ativo: row.ativo !== false,
    })),
    parametros: (parametros as Array<Record<string, unknown>>).map((row) => ({
      categoria: String(row.categoria ?? ""),
      codigo: row.codigo != null ? String(row.codigo) : null,
      descricao: String(row.descricao ?? ""),
      unidade: String(row.unidade ?? ""),
      valorUnitario: row.valorUnitario ? D(String(row.valorUnitario)) : null,
      percentual: row.percentual ? D(String(row.percentual)) : null,
      fonte: row.fonte != null ? String(row.fonte) : null,
      codigoReferencia: row.codigoReferencia != null ? String(row.codigoReferencia) : null,
      uf: row.uf != null ? String(row.uf) : null,
      competencia: row.competencia != null ? String(row.competencia) : null,
      ativo: row.ativo !== false,
    })),
  };
  } catch (error) {
    if (isPrismaMissingTableError(error) || /viabilidade|sinapi|sicro/i.test(error instanceof Error ? error.message : "")) {
      return emptyPriceCatalog(input.tipoSinapi);
    }
    throw error;
  }
}
