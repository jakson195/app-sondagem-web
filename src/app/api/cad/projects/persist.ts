import { Prisma } from "@prisma/client";
import { isPgUndefinedColumnError, isPrismaMissingTableError } from "@/lib/pg-error-utils";
import { prisma } from "@/lib/prisma";
import {
  CAD_DWG_EMBED_KEY,
  CAD_DWG_NAME_KEY,
  extractEmbeddedDwgBase64,
  sanitizeCloudCadWriteData,
} from "@/lib/rtk-validation/cad/project-file";

export const CAD_TABLE_HINT =
  "Execute scripts/sql/neon-cad-user-projects.sql no SQL Editor da Neon (ou npx prisma migrate deploy).";

export const MAX_DWG_BYTES = 12 * 1024 * 1024;

/** Omit binary columns so list/get still work before `dwg` exists. */
export const cadProjectScalarSelect = {
  id: true,
  name: true,
  data: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type CadProjectRow = {
  id: string;
  name: string;
  data: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export function decodeDwgBase64(raw: unknown): Buffer | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const cleaned = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  try {
    const buf = Buffer.from(cleaned, "base64");
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

export function buildCloudStoredData(
  projectRaw: unknown,
  name: string,
  opts: { hasDwg: boolean },
): Record<string, unknown> {
  const sanitized = sanitizeCloudCadWriteData(projectRaw, name);
  return { ...sanitized, name, hasDwg: opts.hasDwg };
}

function embedDwgInData(data: Record<string, unknown>, dwg: Buffer, dwgName: string | null) {
  return {
    ...data,
    hasDwg: true,
    [CAD_DWG_EMBED_KEY]: dwg.toString("base64"),
    [CAD_DWG_NAME_KEY]: dwgName,
  };
}

function dwgFilenameFor(name: string, dwgName: string | null) {
  return dwgName?.trim() || `${name.replace(/[^\w\-]+/g, "_").slice(0, 80) || "projeto_cad"}.dwg`;
}

async function attachDwgColumn(id: string, dwg: Buffer, dwgName: string | null): Promise<boolean> {
  try {
    await prisma.$executeRaw`
      UPDATE cad_user_projects
      SET dwg = ${dwg}, dwg_name = ${dwgName}
      WHERE id = ${id}
    `;
    return true;
  } catch (e) {
    if (isPrismaMissingTableError(e, "cad_user_projects")) throw e;
    return false;
  }
}

async function persistDwgFallback(
  id: string,
  data: Record<string, unknown>,
  dwg: Buffer,
  dwgName: string | null,
): Promise<CadProjectRow> {
  return prisma.cadUserProject.update({
    where: { id },
    data: { data: embedDwgInData(data, dwg, dwgName) as Prisma.InputJsonValue },
    select: cadProjectScalarSelect,
  });
}

export async function createCadUserProject(args: {
  userId: number;
  name: string;
  data: Record<string, unknown>;
  dwg: Buffer | null;
  dwgName: string | null;
}): Promise<CadProjectRow> {
  const row = await prisma.cadUserProject.create({
    data: {
      userId: args.userId,
      name: args.name,
      data: args.data as Prisma.InputJsonValue,
    },
    select: cadProjectScalarSelect,
  });
  if (!args.dwg) return row;
  const ok = await attachDwgColumn(row.id, args.dwg, args.dwgName);
  if (ok) return row;
  return persistDwgFallback(row.id, args.data, args.dwg, args.dwgName);
}

export async function updateCadUserProject(args: {
  id: string;
  name: string;
  data: Record<string, unknown>;
  dwg: Buffer | null;
  dwgName: string | null;
}): Promise<CadProjectRow> {
  const row = await prisma.cadUserProject.update({
    where: { id: args.id },
    data: {
      name: args.name,
      data: args.data as Prisma.InputJsonValue,
    },
    select: cadProjectScalarSelect,
  });
  if (!args.dwg) return row;
  const ok = await attachDwgColumn(row.id, args.dwg, args.dwgName);
  if (ok) return row;
  return persistDwgFallback(row.id, args.data, args.dwg, args.dwgName);
}

export async function loadCadUserProjectDwg(
  id: string,
  userId: number,
): Promise<{ bytes: Buffer; filename: string } | null> {
  try {
    const rows = await prisma.$queryRaw<
      { name: string; data: unknown; dwg: Uint8Array | Buffer | null; dwg_name: string | null }[]
    >`
      SELECT name, data, dwg, dwg_name
      FROM cad_user_projects
      WHERE id = ${id} AND user_id = ${userId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    if (row.dwg && row.dwg.length > 0) {
      return { bytes: Buffer.from(row.dwg), filename: dwgFilenameFor(row.name, row.dwg_name) };
    }
    const embedded = extractEmbeddedDwgBase64(row.data);
    if (!embedded) return null;
    return { bytes: Buffer.from(embedded.base64, "base64"), filename: dwgFilenameFor(row.name, embedded.filename) };
  } catch (e) {
    if (!isPgUndefinedColumnError(e) && !/column .* does not exist|42703/i.test(e instanceof Error ? e.message : String(e))) {
      throw e;
    }
    const row = await prisma.cadUserProject.findFirst({
      where: { id, userId },
      select: { name: true, data: true },
    });
    if (!row) return null;
    const embedded = extractEmbeddedDwgBase64(row.data);
    if (!embedded) return null;
    return { bytes: Buffer.from(embedded.base64, "base64"), filename: dwgFilenameFor(row.name, embedded.filename) };
  }
}
