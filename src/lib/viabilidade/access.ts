import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/server-auth";
import {
  CAD_PROJECT_FILE_KIND,
  parseCadProjectFile,
  splitStoredCadData,
} from "@/lib/rtk-validation/cad/project-file";
import type { CadProject } from "@/lib/rtk-validation/cad/types";

export class ViabilidadeHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireViabilidadeUser(req: Request) {
  const user = await getAuthUserFromRequest(req);
  if (!user) throw new ViabilidadeHttpError(401, "Não autenticado.");
  return user;
}

export async function requireOwnedCadProject(userId: number, projetoId: string) {
  const row = await prisma.cadUserProject.findFirst({
    where: { id: projetoId, userId },
    select: { id: true, name: true, data: true, updatedAt: true, createdAt: true },
  });
  if (!row) throw new ViabilidadeHttpError(404, "Projeto não encontrado.");
  return row;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function cadProjectFromUnknown(data: unknown, fallbackName = "Projeto CAD"): CadProject {
  if (isRecord(data) && Array.isArray(data.entities) && data.entities.length > 0 && !data.kind) {
    const parsed = splitStoredCadData(data, fallbackName).project;
    if (parsed.entities.length > 0) return parsed;
  }
  if (isRecord(data) && (data.kind === CAD_PROJECT_FILE_KIND || isRecord(data.project))) {
    try {
      return parseCadProjectFile(data).project;
    } catch {
      if (isRecord(data.project)) {
        return splitStoredCadData(data.project, fallbackName).project;
      }
    }
  }
  return splitStoredCadData(data, fallbackName).project;
}

export function cadProjectFromRow(row: { name: string; data: unknown }): CadProject {
  return cadProjectFromUnknown(row.data, row.name);
}

/** Prefere o desenho ao vivo do CAD; se vier vazio, usa o JSON salvo. */
export function cadProjectFromRequest(
  body: Record<string, unknown>,
  stored?: { name: string; data: unknown },
): CadProject | null {
  if (isRecord(body.project) && Array.isArray(body.project.entities) && body.project.entities.length > 0) {
    return cadProjectFromUnknown(body.project, stored?.name ?? "Projeto CAD");
  }
  if (stored) return cadProjectFromRow(stored);
  if (isRecord(body.project)) {
    return cadProjectFromUnknown(body.project, "Projeto CAD");
  }
  return null;
}

export async function requireOwnedViabilidade(userId: number, id: string) {
  const row = await prisma.viabilidade.findUnique({
    where: { id },
    include: {
      itens: true,
      quantitativos: true,
      validacoes: true,
    },
  });
  if (!row) throw new ViabilidadeHttpError(404, "Estudo não encontrado.");
  const cad = await prisma.cadUserProject.findFirst({
    where: { id: row.projetoId, userId },
    select: { id: true, name: true, data: true, updatedAt: true, createdAt: true },
  });
  if (!cad) throw new ViabilidadeHttpError(404, "Estudo não encontrado.");
  return { estudo: row, cad };
}

export function jsonError(error: unknown) {
  if (error instanceof ViabilidadeHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[viabilidade]", error);
  return NextResponse.json({ error: "Erro interno ao processar o estudo de viabilidade." }, { status: 500 });
}
