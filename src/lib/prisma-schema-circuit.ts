import { isPrismaMissingTableError } from "@/lib/pg-error-utils";

const TTL_MS = process.env.NODE_ENV === "development" ? 60_000 : 15_000;
const missingUntil = new Map<string, number>();

export function markPrismaTableMissing(table: string) {
  missingUntil.set(table.toLowerCase(), Date.now() + TTL_MS);
}

export function isPrismaTableKnownMissing(table: string): boolean {
  return Date.now() < (missingUntil.get(table.toLowerCase()) ?? 0);
}

/** Se o erro for tabela em falta, memoriza e devolve true. */
export function rememberIfMissingTable(e: unknown, table: string): boolean {
  if (!isPrismaMissingTableError(e, table)) return false;
  markPrismaTableMissing(table);
  return true;
}
