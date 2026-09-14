import { NextResponse } from "next/server";
import { getSession } from "@/lib/cad-auth";
import { isPrismaMissingTableError } from "@/lib/pg-error-utils";
import { prisma } from "@/lib/prisma";
import { toCadApiRecord, storedRecordHasDwg } from "@/lib/rtk-validation/cad/project-file";
import {
  CAD_TABLE_HINT,
  MAX_DWG_BYTES,
  buildCloudStoredData,
  cadProjectScalarSelect,
  decodeDwgBase64,
  updateCadUserProject,
} from "../persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function findOwnedProject(id: string, userId: number) {
  return prisma.cadUserProject.findFirst({
    where: { id, userId },
    select: cadProjectScalarSelect,
  });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await context.params;
  try {
    const row = await findOwnedProject(id, session.id);
    if (!row) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
    return NextResponse.json({ project: toCadApiRecord(row, "full") });
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
  try {
    const existing = await findOwnedProject(id, session.id);
    if (!existing) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });

    const body = (await request.json()) as {
      name?: string;
      project?: unknown;
      dwgBase64?: string;
      dwgFilename?: string;
    };
    const name = body.name?.trim() || existing.name;
    if (!body.project) {
      return NextResponse.json({ error: "Dados do projeto são obrigatórios." }, { status: 400 });
    }

    const dwg = decodeDwgBase64(body.dwgBase64);
    if (dwg && dwg.length > MAX_DWG_BYTES) {
      return NextResponse.json(
        { error: `DWG excede o limite de ${Math.round(MAX_DWG_BYTES / (1024 * 1024))} MB.` },
        { status: 400 },
      );
    }
    const dwgName =
      typeof body.dwgFilename === "string" && body.dwgFilename.trim()
        ? body.dwgFilename.trim().slice(0, 120)
        : dwg
          ? `${name.replace(/[^\w\-]+/g, "_").slice(0, 80) || "projeto_cad"}.dwg`
          : null;
    const data = buildCloudStoredData(body.project, name, {
      hasDwg: Boolean(dwg) || storedRecordHasDwg(existing.data),
    });

    const row = await updateCadUserProject({
      id,
      name,
      data,
      dwg,
      dwgName,
    });

    return NextResponse.json({ success: true, project: toCadApiRecord(row, "full") });
  } catch (e) {
    if (isPrismaMissingTableError(e, "cad_user_projects")) {
      return NextResponse.json({ error: CAD_TABLE_HINT }, { status: 503 });
    }
    throw e;
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await context.params;
  try {
    const existing = await findOwnedProject(id, session.id);
    if (!existing) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });

    await prisma.cadUserProject.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (isPrismaMissingTableError(e, "cad_user_projects")) {
      return NextResponse.json({ error: CAD_TABLE_HINT }, { status: 503 });
    }
    throw e;
  }
}
