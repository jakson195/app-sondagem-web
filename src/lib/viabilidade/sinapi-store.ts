import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/pg-error-utils";
import { D } from "./money";
import type { SinapiImportRow } from "./sinapi-import";
import {
  aliasesCompetencia,
  escolherCompetenciaMaisProxima,
  mensagemFallbackCompetencia,
  mesmaCompetencia,
  parseCompetencia,
} from "./sinapi-caixa";
import { UFS_BRASIL } from "./sinapi-ufs";

export const SINAPI_TABLE_MISSING =
  "Tabela SinapiComposicao não existe no banco. Aplique a migration de viabilidade (prisma migrate) e tente de novo.";

export type SinapiCatalogItem = {
  codigo: string;
  descricao: string;
  unidade: string;
  uf: string;
  competencia: string;
  custoDesonerado: string | null;
  custoNaoDesonerado: string | null;
  fonte: string;
  ativo: boolean;
};

export type SinapiSearchResult = {
  items: SinapiCatalogItem[];
  total: number;
  shown: number;
  uf: string | null;
  competencia: string | null;
  competenciaSolicitada: string | null;
  competenciaNormalizada: string | null;
  emptyReason: string | null;
  availableCompetencias: { competencia: string; count: number }[];
  tableOk: boolean;
  fallbackUsado: boolean;
  fallbackCompetencia: string | null;
  avisoFallback: string | null;
};

type SinapiDbRow = {
  codigo: string;
  descricao: string;
  unidade: string;
  uf: string;
  competencia: string;
  custoDesonerado: unknown;
  custoNaoDesonerado: unknown;
  tipo?: string | null;
  fonte?: string | null;
  ativo?: boolean | null;
};

type SinapiDelegate = {
  findMany: (args: unknown) => Promise<SinapiDbRow[]>;
  count: (args: unknown) => Promise<number>;
  createMany: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  groupBy: (args: unknown) => Promise<Array<{ uf: string; _count: { _all: number } }>>;
};

export type SinapiUpsertPlan = {
  create: SinapiImportRow[];
  update: SinapiImportRow[];
  duplicatesInFile: number;
};

let ensurePromise: Promise<void> | null = null;

function sinapiDelegate(): SinapiDelegate | null {
  const del = (prisma as unknown as { sinapiComposicao?: SinapiDelegate }).sinapiComposicao;
  return del && typeof del.findMany === "function" ? del : null;
}

function isMissingDelegateError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cannot read propert(?:y|ies) of undefined/i.test(message) && /sinapi|groupby|findmany|createmany/i.test(message);
}

function rethrowIfMissingTable(error: unknown): never {
  if (isPrismaMissingTableError(error, "sinapi") || isMissingDelegateError(error)) {
    throw new Error(SINAPI_TABLE_MISSING);
  }
  throw error;
}

function asCostString(value: unknown): string | null {
  if (value == null || value === "") return null;
  return String(value);
}

function toCatalogItem(row: SinapiDbRow): SinapiCatalogItem {
  return {
    codigo: row.codigo,
    descricao: row.descricao,
    unidade: row.unidade,
    uf: row.uf,
    competencia: row.competencia,
    custoDesonerado: asCostString(row.custoDesonerado),
    custoNaoDesonerado: asCostString(row.custoNaoDesonerado),
    fonte: row.fonte ?? "SINAPI",
    ativo: row.ativo !== false,
  };
}

async function ensureSinapiTableInner(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SinapiComposicao" (
        "id" TEXT NOT NULL,
        "codigo" TEXT NOT NULL,
        "descricao" TEXT NOT NULL,
        "unidade" TEXT NOT NULL,
        "uf" TEXT NOT NULL,
        "competencia" TEXT NOT NULL,
        "custoDesonerado" DECIMAL,
        "custoNaoDesonerado" DECIMAL,
        "tipo" TEXT,
        "fonte" TEXT NOT NULL DEFAULT 'SINAPI',
        "ativo" BOOLEAN NOT NULL DEFAULT true,
        CONSTRAINT "SinapiComposicao_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "SinapiComposicao_codigo_idx" ON "SinapiComposicao"("codigo")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "SinapiComposicao_uf_competencia_idx" ON "SinapiComposicao"("uf", "competencia")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "SinapiComposicao_codigo_uf_competencia_key" ON "SinapiComposicao"("codigo", "uf", "competencia")`,
    );
  } catch (error) {
    if (isPrismaMissingTableError(error, "sinapi")) {
      throw new Error(SINAPI_TABLE_MISSING);
    }
    const probe = await probeSinapiTable();
    if (!probe.ok) {
      throw new Error(SINAPI_TABLE_MISSING);
    }
  }
}

async function probeSinapiTable(): Promise<{ ok: boolean }> {
  try {
    await prisma.$queryRaw`SELECT 1 FROM "SinapiComposicao" LIMIT 1`;
    return { ok: true };
  } catch (error) {
    if (isPrismaMissingTableError(error, "sinapi")) return { ok: false };
    const message = error instanceof Error ? error.message : String(error);
    if (/does not exist/i.test(message) && /sinapi/i.test(message)) return { ok: false };
    throw error;
  }
}

export async function ensureSinapiTable(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = ensureSinapiTableInner().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  await ensurePromise;
}

function competenciaWhereSql(raw?: string | null): Prisma.Sql | null {
  const aliases = aliasesCompetencia(raw);
  if (aliases.length === 0) return null;
  return Prisma.sql`competencia IN (${Prisma.join(aliases)})`;
}

function searchWhereSql(input: { uf?: string; competencia?: string; codigo?: string }): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`ativo = true`];
  if (input.uf) parts.push(Prisma.sql`uf = ${input.uf.toUpperCase()}`);
  const comp = competenciaWhereSql(input.competencia);
  if (comp) parts.push(comp);
  if (input.codigo) parts.push(Prisma.sql`codigo = ${input.codigo}`);
  return Prisma.join(parts, " AND ");
}

async function listViaRaw(input: {
  uf?: string;
  competencia?: string;
  codigo?: string;
  take?: number;
}): Promise<{ rows: SinapiCatalogItem[]; total: number }> {
  const where = searchWhereSql(input);
  const take = input.take ?? 500;
  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<SinapiDbRow[]>`
      SELECT codigo, descricao, unidade, uf, competencia,
             "custoDesonerado" AS "custoDesonerado",
             "custoNaoDesonerado" AS "custoNaoDesonerado",
             tipo, fonte, ativo
      FROM "SinapiComposicao"
      WHERE ${where}
      ORDER BY codigo ASC
      LIMIT ${take}
    `,
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM "SinapiComposicao" WHERE ${where}
    `,
  ]);
  return { rows: rows.map(toCatalogItem), total: Number(countRows[0]?.n ?? 0) };
}

async function availableCompetenciasRaw(uf?: string): Promise<{ competencia: string; count: number }[]> {
  const rows = uf
    ? await prisma.$queryRaw<Array<{ competencia: string; n: number }>>`
        SELECT competencia, COUNT(*)::int AS n
        FROM "SinapiComposicao"
        WHERE ativo = true AND uf = ${uf.toUpperCase()}
        GROUP BY competencia
        ORDER BY competencia DESC
      `
    : await prisma.$queryRaw<Array<{ competencia: string; n: number }>>`
        SELECT competencia, COUNT(*)::int AS n
        FROM "SinapiComposicao"
        WHERE ativo = true
        GROUP BY competencia
        ORDER BY competencia DESC
      `;
  return rows.map((row) => ({ competencia: row.competencia, count: Number(row.n) }));
}

function emptyReasonFor(
  uf: string | undefined,
  competencia: string | undefined,
  total: number,
  available: { competencia: string; count: number }[],
  tableOk: boolean,
): string | null {
  if (total > 0) return null;
  if (!tableOk) return SINAPI_TABLE_MISSING;
  const sigla = uf?.toUpperCase() || "UF";
  const comp = competencia?.trim() || null;
  if (available.length === 0) {
    return `Nenhuma composição no banco${comp ? ` para ${sigla} ${comp}` : uf ? ` para ${sigla}` : ""}. A sincronização com a Caixa não gravou linhas (arquivo 404/indisponível) ou ainda não houve importação do XLSX oficial.`;
  }
  const lista = available
    .slice(0, 6)
    .map((row) => `${row.competencia} (${row.count})`)
    .join(", ");
  if (comp) {
    return `Nenhuma composição para ${sigla} ${comp} nem nos 12 meses mais próximos. No banco há dados em: ${lista}.`;
  }
  return `Nenhuma composição para ${sigla}. No banco há dados em: ${lista}.`;
}

export async function listarCompetenciasDisponiveis(
  uf?: string,
): Promise<{ competencia: string; count: number }[]> {
  await ensureSinapiTable();
  try {
    return await availableCompetenciasRaw(uf);
  } catch {
    return [];
  }
}

/** Planeja upsert por chave única codigo+uf+competencia — nunca apaga competência antiga. */
export function planSinapiUpserts(
  existing: Array<{ codigo: string; uf: string; competencia: string }>,
  incoming: SinapiImportRow[],
  uf: string,
  competencia: string,
): SinapiUpsertPlan {
  const byKey = new Map<string, SinapiImportRow>();
  let duplicatesInFile = 0;
  for (const row of incoming) {
    const rowUf = (row.uf ?? uf).trim().toUpperCase();
    const key = `${row.codigo}::${rowUf}::${competencia}`;
    if (byKey.has(key)) duplicatesInFile += 1;
    byKey.set(key, { ...row, uf: rowUf });
  }

  const existingKeys = new Set(existing.map((row) => `${row.codigo}::${row.uf}::${row.competencia}`));
  const create: SinapiImportRow[] = [];
  const update: SinapiImportRow[] = [];
  for (const row of byKey.values()) {
    const rowUf = (row.uf ?? uf).trim().toUpperCase();
    const key = `${row.codigo}::${rowUf}::${competencia}`;
    if (existingKeys.has(key)) update.push(row);
    else create.push(row);
  }
  return { create, update, duplicatesInFile };
}

async function existingKeysViaRaw(
  rows: SinapiImportRow[],
  uf: string,
  competencia: string,
): Promise<Array<{ codigo: string; uf: string; competencia: string }>> {
  const codigos = [...new Set(rows.map((row) => row.codigo))];
  const ufs = [...new Set(rows.map((row) => (row.uf ?? uf).toUpperCase()))];
  if (codigos.length === 0) return [];
  return prisma.$queryRaw<Array<{ codigo: string; uf: string; competencia: string }>>`
    SELECT codigo, uf, competencia
    FROM "SinapiComposicao"
    WHERE competencia IN (${Prisma.join(aliasesCompetencia(competencia))})
      AND codigo IN (${Prisma.join(codigos)})
      AND uf IN (${Prisma.join(ufs)})
  `;
}

async function upsertViaRaw(
  rows: SinapiImportRow[],
  uf: string,
  competencia: string,
): Promise<void> {
  for (const row of rows) {
    const rowUf = (row.uf ?? uf).toUpperCase();
    const id = `${row.codigo}-${rowUf}-${competencia}`.replace(/[^A-Za-z0-9_-]/g, "_");
    await prisma.$executeRaw`
      INSERT INTO "SinapiComposicao"
        ("id", "codigo", "descricao", "unidade", "uf", "competencia", "custoDesonerado", "custoNaoDesonerado", "tipo", "fonte", "ativo")
      VALUES (
        ${id},
        ${row.codigo},
        ${row.descricao},
        ${row.unidade},
        ${rowUf},
        ${competencia},
        ${row.custoDesonerado != null ? row.custoDesonerado : null},
        ${row.custoNaoDesonerado != null ? row.custoNaoDesonerado : null},
        ${row.tipo},
        ${"SINAPI"},
        ${true}
      )
      ON CONFLICT ("codigo", "uf", "competencia") DO UPDATE SET
        "descricao" = EXCLUDED."descricao",
        "unidade" = EXCLUDED."unidade",
        "custoDesonerado" = COALESCE(EXCLUDED."custoDesonerado", "SinapiComposicao"."custoDesonerado"),
        "custoNaoDesonerado" = COALESCE(EXCLUDED."custoNaoDesonerado", "SinapiComposicao"."custoNaoDesonerado"),
        "tipo" = COALESCE(EXCLUDED."tipo", "SinapiComposicao"."tipo"),
        "ativo" = true
    `;
  }
}

export async function upsertSinapiRows(input: {
  rows: SinapiImportRow[];
  uf: string;
  competencia: string;
}): Promise<{ imported: number; created: number; updated: number; duplicatesInFile: number }> {
  const uf = input.uf.trim().toUpperCase();
  const competencia = parseCompetencia(input.competencia).label;
  await ensureSinapiTable();

  const del = sinapiDelegate();
  let existing: Array<{ codigo: string; uf: string; competencia: string }>;
  if (del) {
    try {
      existing = (await del.findMany({
        where: {
          competencia: { in: aliasesCompetencia(competencia) },
          codigo: { in: [...new Set(input.rows.map((row) => row.codigo))] },
          uf: { in: [...new Set(input.rows.map((row) => (row.uf ?? uf).toUpperCase()))] },
        },
        select: { codigo: true, uf: true, competencia: true },
      })) as Array<{ codigo: string; uf: string; competencia: string }>;
    } catch (error) {
      if (isPrismaMissingTableError(error, "sinapi") || isMissingDelegateError(error)) {
        existing = await existingKeysViaRaw(input.rows, uf, competencia);
      } else {
        rethrowIfMissingTable(error);
      }
    }
  } else {
    existing = await existingKeysViaRaw(input.rows, uf, competencia);
  }

  const plan = planSinapiUpserts(existing, input.rows, uf, competencia);

  if (del) {
    try {
      if (plan.create.length > 0) {
        const chunk = 400;
        for (let i = 0; i < plan.create.length; i += chunk) {
          await del.createMany({
            data: plan.create.slice(i, i + chunk).map((row) => ({
              codigo: row.codigo,
              descricao: row.descricao,
              unidade: row.unidade,
              uf: (row.uf ?? uf).toUpperCase(),
              competencia,
              custoDesonerado: row.custoDesonerado != null ? D(row.custoDesonerado) : null,
              custoNaoDesonerado: row.custoNaoDesonerado != null ? D(row.custoNaoDesonerado) : null,
              tipo: row.tipo,
              fonte: "SINAPI",
              ativo: true,
            })),
            skipDuplicates: true,
          });
        }
      }
      for (const row of plan.update) {
        const rowUf = (row.uf ?? uf).toUpperCase();
        await del.update({
          where: { codigo_uf_competencia: { codigo: row.codigo, uf: rowUf, competencia } },
          data: {
            descricao: row.descricao,
            unidade: row.unidade,
            ...(row.custoDesonerado != null ? { custoDesonerado: D(row.custoDesonerado) } : {}),
            ...(row.custoNaoDesonerado != null ? { custoNaoDesonerado: D(row.custoNaoDesonerado) } : {}),
            tipo: row.tipo ?? undefined,
            ativo: true,
          },
        });
      }
      return {
        imported: plan.create.length + plan.update.length,
        created: plan.create.length,
        updated: plan.update.length,
        duplicatesInFile: plan.duplicatesInFile,
      };
    } catch (error) {
      if (!isPrismaMissingTableError(error, "sinapi") && !isMissingDelegateError(error)) {
        throw error;
      }
    }
  }

  await upsertViaRaw([...plan.create, ...plan.update], uf, competencia);
  return {
    imported: plan.create.length + plan.update.length,
    created: plan.create.length,
    updated: plan.update.length,
    duplicatesInFile: plan.duplicatesInFile,
  };
}

function emptySearchResult(input: {
  uf: string | null;
  competencia: string | null;
  competenciaSolicitada: string | null;
  competenciaNormalizada: string | null;
  emptyReason: string | null;
  tableOk: boolean;
}): SinapiSearchResult {
  return {
    items: [],
    total: 0,
    shown: 0,
    uf: input.uf,
    competencia: input.competencia,
    competenciaSolicitada: input.competenciaSolicitada,
    competenciaNormalizada: input.competenciaNormalizada,
    emptyReason: input.emptyReason,
    availableCompetencias: [],
    tableOk: input.tableOk,
    fallbackUsado: false,
    fallbackCompetencia: null,
    avisoFallback: null,
  };
}

async function queryCatalogRows(input: {
  uf?: string;
  competencia?: string;
  codigo?: string;
  take: number;
}): Promise<{ rows: SinapiCatalogItem[]; total: number; tableOk: boolean }> {
  const del = sinapiDelegate();
  try {
    if (del) {
      const where = {
        ativo: true,
        ...(input.uf ? { uf: input.uf } : {}),
        ...(input.competencia ? { competencia: { in: aliasesCompetencia(input.competencia) } } : {}),
        ...(input.codigo ? { codigo: input.codigo } : {}),
      };
      const [found, count] = await Promise.all([
        del.findMany({
          where,
          take: input.take,
          orderBy: [{ codigo: "asc" }],
        }),
        del.count({ where }),
      ]);
      return { rows: found.map(toCatalogItem), total: count, tableOk: true };
    }
    const listed = await listViaRaw({
      uf: input.uf,
      competencia: input.competencia,
      codigo: input.codigo,
      take: input.take,
    });
    return { rows: listed.rows, total: listed.total, tableOk: true };
  } catch (error) {
    if (isPrismaMissingTableError(error, "sinapi") || isMissingDelegateError(error)) {
      try {
        const listed = await listViaRaw({
          uf: input.uf,
          competencia: input.competencia,
          codigo: input.codigo,
          take: input.take,
        });
        return { rows: listed.rows, total: listed.total, tableOk: true };
      } catch {
        return { rows: [], total: 0, tableOk: false };
      }
    }
    throw error;
  }
}

export async function searchSinapiCatalog(input: {
  uf?: string;
  competencia?: string;
  codigo?: string;
  q?: string;
  take?: number;
  allowFallback?: boolean;
}): Promise<SinapiSearchResult> {
  const uf = input.uf?.trim().toUpperCase() || undefined;
  const competenciaSolicitada = (() => {
    try {
      return input.competencia?.trim() ? parseCompetencia(input.competencia).label : null;
    } catch {
      return input.competencia?.trim() || null;
    }
  })();
  const competencia = input.competencia?.trim() || undefined;
  const allowFallback = input.allowFallback !== false;

  try {
    await ensureSinapiTable();
  } catch (error) {
    const message = error instanceof Error ? error.message : SINAPI_TABLE_MISSING;
    return emptySearchResult({
      uf: uf ?? null,
      competencia: competencia ?? null,
      competenciaSolicitada,
      competenciaNormalizada: competenciaSolicitada,
      emptyReason: message,
      tableOk: false,
    });
  }

  const take = input.take ?? 500;
  let queried = await queryCatalogRows({ uf, competencia, codigo: input.codigo, take });
  if (!queried.tableOk) {
    return emptySearchResult({
      uf: uf ?? null,
      competencia: competencia ?? null,
      competenciaSolicitada,
      competenciaNormalizada: competenciaSolicitada,
      emptyReason: SINAPI_TABLE_MISSING,
      tableOk: false,
    });
  }

  let used = competenciaSolicitada ?? competencia ?? null;
  let fallbackUsado = false;
  let fallbackCompetencia: string | null = null;
  let avisoFallback: string | null = null;
  let available: { competencia: string; count: number }[] = [];

  if (queried.total === 0 && competenciaSolicitada && allowFallback) {
    try {
      available = await availableCompetenciasRaw(uf);
    } catch {
      available = [];
    }
    const nearest = escolherCompetenciaMaisProxima(
      competenciaSolicitada,
      available.map((row) => row.competencia),
    );
    if (nearest && !mesmaCompetencia(nearest, competenciaSolicitada)) {
      const again = await queryCatalogRows({ uf, competencia: nearest, codigo: input.codigo, take });
      if (again.tableOk && again.total > 0) {
        queried = again;
        used = nearest;
        fallbackUsado = true;
        fallbackCompetencia = nearest;
        avisoFallback = mensagemFallbackCompetencia(competenciaSolicitada, nearest);
      }
    }
  }

  const q = input.q?.trim().toLowerCase();
  const filtered = q
    ? queried.rows.filter((row) => `${row.codigo} ${row.descricao}`.toLowerCase().includes(q))
    : queried.rows;

  if (filtered.length === 0 && available.length === 0) {
    try {
      available = await availableCompetenciasRaw(uf);
    } catch {
      available = [];
    }
  }

  return {
    items: filtered,
    total: queried.total,
    shown: filtered.length,
    uf: uf ?? null,
    competencia: used,
    competenciaSolicitada,
    competenciaNormalizada: used,
    emptyReason: emptyReasonFor(uf, used ?? competenciaSolicitada ?? competencia, queried.total, available, true),
    availableCompetencias: available,
    tableOk: true,
    fallbackUsado,
    fallbackCompetencia,
    avisoFallback,
  };
}

export async function findSinapiRowsForCatalog(input: {
  uf: string;
  competencia: string | null;
}): Promise<SinapiCatalogItem[]> {
  const result = await searchSinapiCatalog({
    uf: input.uf,
    competencia: input.competencia ?? undefined,
    take: 20000,
    allowFallback: false,
  });
  if (!result.tableOk) return [];
  return result.items;
}

export async function contagemSinapiPorUf(competencia: string, uf?: string) {
  const label = parseCompetencia(competencia).label;
  await ensureSinapiTable();
  const aliases = aliasesCompetencia(label);
  const del = sinapiDelegate();
  const mapa = Object.fromEntries(UFS_BRASIL.map((sigla) => [sigla, 0]));

  try {
    if (del) {
      const grouped = await del.groupBy({
        by: ["uf"],
        where: {
          ativo: true,
          competencia: { in: aliases },
          ...(uf ? { uf: uf.toUpperCase() } : {}),
        },
        _count: { _all: true },
      });
      for (const row of grouped) {
        mapa[row.uf] = row._count._all;
      }
      const total = grouped.reduce((acc, row) => acc + row._count._all, 0);
      return {
        competencia: label,
        total,
        ufsComDados: grouped.filter((row) => row._count._all > 0).length,
        porUf: mapa,
      };
    }
  } catch (error) {
    if (!isPrismaMissingTableError(error, "sinapi") && !isMissingDelegateError(error)) {
      rethrowIfMissingTable(error);
    }
  }

  const rows = uf
    ? await prisma.$queryRaw<Array<{ uf: string; n: number }>>`
        SELECT uf, COUNT(*)::int AS n
        FROM "SinapiComposicao"
        WHERE ativo = true
          AND competencia IN (${Prisma.join(aliases)})
          AND uf = ${uf.toUpperCase()}
        GROUP BY uf
      `
    : await prisma.$queryRaw<Array<{ uf: string; n: number }>>`
        SELECT uf, COUNT(*)::int AS n
        FROM "SinapiComposicao"
        WHERE ativo = true
          AND competencia IN (${Prisma.join(aliases)})
        GROUP BY uf
      `;
  for (const row of rows) {
    mapa[row.uf] = Number(row.n);
  }
  const total = rows.reduce((acc, row) => acc + Number(row.n), 0);
  return {
    competencia: label,
    total,
    ufsComDados: rows.filter((row) => Number(row.n) > 0).length,
    porUf: mapa,
  };
}
