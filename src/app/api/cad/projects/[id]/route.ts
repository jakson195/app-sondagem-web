import { NextResponse } from "next/server";
import { getSession } from "@/lib/cad-auth";
import { isPrismaMissingTableError } from "@/lib/pg-error-utils";
import { prisma } from "@/lib/prisma";
import type { CadProject } from "@/lib/rtk-validation/cad/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAD_TABLE_HINT =
  "Execute scripts/sql/neon-cad-user-projects.sql no SQL Editor da Neon (ou npx prisma migrate deploy).";

function toRecord(row: {
  id: string;
  name: string;
  data: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  const project = row.data as CadProject;
  return {
    id: row.id,
    name: row.name,
    savedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    project: { ...project, name: row.name },
  };
}

async function findOwnedProject(id: string, userId: number) {
  return prisma.cadUserProject.findFirst({ where: { id, userId } });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await context.params;
  try {
    const row = await findOwnedProject(id, session.id);
    if (!row) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
    return NextResponse.json({ project: toRecord(row) });
  } catch (e) {
    if (isPrismaMissingTableError(e, "cad_user_projects")) {
      return NextResponse.json({ error: CAD_TABLE_HINT }, { status: 503 });
    }
    throw e;
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await context.params;
  const existing = await findOwnedProject(id, session.id);
  if (!existing) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });

  const body = (await request.json()) as { name?: string; project?: CadProject };
  const name = body.name?.trim() || body.project?.name?.trim() || existing.name;
  if (!body.project) {
    return NextResponse.json({ error: "Dados do projeto são obrigatórios." }, { status: 400 });
  }

  const row = await prisma.cadUserProject.update({
    where: { id },
    data: {
      name,
      data: { ...body.project, name } as object,
    },
  });

  return NextResponse.json({ success: true, project: toRecord(row) });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await context.params;
  const existing = await findOwnedProject(id, session.id);
  if (!existing) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });

  await prisma.cadUserProject.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
