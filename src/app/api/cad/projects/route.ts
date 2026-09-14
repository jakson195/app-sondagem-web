import { NextResponse } from "next/server";
import { withAuthTimeout } from "@/lib/auth-timeout";
import { getSession } from "@/lib/cad-auth";
import { isPrismaMissingTableError } from "@/lib/pg-error-utils";
import { isPrismaTableKnownMissing, rememberIfMissingTable } from "@/lib/prisma-schema-circuit";
import { prisma } from "@/lib/prisma";
import { toCadApiRecord } from "@/lib/rtk-validation/cad/project-file";
import {
  CAD_TABLE_HINT,
  MAX_DWG_BYTES,
  buildCloudStoredData,
  cadProjectScalarSelect,
  createCadUserProject,
  decodeDwgBase64,
} from "./persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PROJECTS = 50;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  if (isPrismaTableKnownMissing("cad_user_projects")) {
    return NextResponse.json({ projects: [], tableMissing: true, hint: CAD_TABLE_HINT });
  }

  try {
    const rows = await withAuthTimeout(
      prisma.cadUserProject.findMany({
        where: { userId: session.id },
        orderBy: { updatedAt: "desc" },
        take: MAX_PROJECTS,
        select: cadProjectScalarSelect,
      }),
      "cad.projects.findMany",
    );
    return NextResponse.json({
      projects: (rows ?? []).map((row) => toCadApiRecord(row, "summary")),
    });
  } catch (e) {
    if (rememberIfMissingTable(e, "cad_user_projects") || isPrismaMissingTableError(e, "cad_user_projects")) {
      return NextResponse.json({ projects: [], tableMissing: true, hint: CAD_TABLE_HINT });
    }
    throw e;
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  if (isPrismaTableKnownMissing("cad_user_projects")) {
    return NextResponse.json({ error: CAD_TABLE_HINT }, { status: 503 });
  }

  const body = (await request.json()) as {
    name?: string;
    project?: unknown;
    dwgBase64?: string;
    dwgFilename?: string;
  };
  const name = body.name?.trim() || "Projeto CAD";
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
  const data = buildCloudStoredData(body.project, name, { hasDwg: Boolean(dwg) });

  try {
    const count = await prisma.cadUserProject.count({ where: { userId: session.id } });
    if (count >= MAX_PROJECTS) {
      return NextResponse.json(
        { error: `Limite de ${MAX_PROJECTS} projetos salvos atingido. Exclua um projeto antigo.` },
        { status: 400 },
      );
    }

    const row = await createCadUserProject({
      userId: session.id,
      name,
      data,
      dwg,
      dwgName,
    });

    return NextResponse.json({ success: true, project: toCadApiRecord(row, "full") });
  } catch (e) {
    if (rememberIfMissingTable(e, "cad_user_projects") || isPrismaMissingTableError(e, "cad_user_projects")) {
      return NextResponse.json({ error: CAD_TABLE_HINT }, { status: 503 });
    }
    throw e;
  }
}
