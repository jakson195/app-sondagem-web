import { Prisma } from "@prisma/client";

/** Prisma P2021 — tabela inexistente (migração em falta). */
export function isPrismaMissingTableError(e: unknown, tableHint?: string): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") {
    const table = String((e.meta as { table?: string } | undefined)?.table ?? "");
    if (!tableHint) return true;
    return table.toLowerCase().includes(tableHint.toLowerCase());
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (!/does not exist in the current database/i.test(msg)) return false;
  if (!tableHint) return true;
  return msg.toLowerCase().includes(tableHint.toLowerCase());
}

/** PostgreSQL 42703 — coluna ou relação inexistente (esquema desatualizado). */
export function isPgUndefinedColumnError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2010") {
    const meta = e.meta as { code?: string | number; message?: string } | undefined;
    const code = meta?.code;
    const combined = `${code ?? ""} ${meta?.message ?? ""} ${e.message}`;
    return (
      code === "42703" ||
      code === 42703 ||
      /42703/.test(combined) ||
      /column .* does not exist/i.test(combined)
    );
  }
  const msg = e instanceof Error ? e.message : String(e);
  return /42703/.test(msg) || /column .* does not exist/i.test(msg);
}

/** PostgreSQL 42883 — função desconhecida (PostGIS não instalado / ST_GeomFromGeoJSON em falta). */
export function isPostgisFunctionMissingError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2010") {
    const meta = e.meta as { code?: string | number; message?: string } | undefined;
    const code = meta?.code;
    const combined = `${code ?? ""} ${meta?.message ?? ""} ${e.message}`;
    return (
      code === "42883" ||
      code === 42883 ||
      /42883/.test(combined) ||
      ((/st_geomfromgeojson|st_makevalid|st_asgeojson/i.test(combined)) &&
        /does not exist|could not find/i.test(combined))
    );
  }
  const msg = e instanceof Error ? e.message : String(e);
  return (
    /42883/.test(msg) ||
    (/function .* does not exist/i.test(msg) &&
      /st_geomfromgeojson|st_makevalid|st_asgeojson/i.test(msg))
  );
}

/** Gravar geometria PostGIS falhou — usar coluna JSON da obra. */
export function shouldPersistObraAoiAsGeoJsonOnly(e: unknown): boolean {
  return isPostgisFunctionMissingError(e) || isPgUndefinedColumnError(e);
}
