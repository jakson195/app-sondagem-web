import { requireObraAccessFromRequest } from "@/lib/obra-access";
import { prisma } from "@/lib/prisma";
import { moduleMapFromRows } from "@/lib/project-modules-db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Resumo de módulos da obra (para menu contextual). */
export async function GET(req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const obra = await prisma.obra.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      companyId: true,
      createdByUserId: true,
      projectModules: { select: { module: true, active: true } },
    },
  });

  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  const access = await requireObraAccessFromRequest(req, obra);
  if (!access.ok) return access.response;

  return NextResponse.json({
    id: obra.id,
    nome: obra.nome,
    modules: moduleMapFromRows(obra.projectModules),
  });
}
