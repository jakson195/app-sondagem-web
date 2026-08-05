import { prisma } from "@/lib/prisma";
import { CAMPO_TIPO, isCampoTipo, type CampoTipo } from "@/lib/campo-sondagem-tipo";
import { requireObraAccessFromRequest } from "@/lib/obra-access";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseTipoCampo(v: unknown): CampoTipo {
  if (typeof v !== "string" || !isCampoTipo(v)) return CAMPO_TIPO.spt;
  return v;
}

export async function POST(req: Request) {
  let body: {
    codigo?: unknown;
    obraId?: unknown;
    projectId?: unknown;
    tipo?: unknown;
    /** legado */
    tipoCampo?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const codigo = typeof body.codigo === "string" ? body.codigo.trim() : "";
  const obraId = Number(body.obraId ?? body.projectId);
  const tipoRaw = body.tipo ?? body.tipoCampo;
  const tipo = parseTipoCampo(tipoRaw);

  if (!codigo || !Number.isFinite(obraId)) {
    return NextResponse.json(
      { error: "codigo e obraId/projectId válidos são obrigatórios" },
      { status: 400 },
    );
  }

  const obra = await prisma.obra.findUnique({
    where: { id: obraId },
    select: { companyId: true, createdByUserId: true },
  });
  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  const access = await requireObraAccessFromRequest(req, obra, { write: true });
  if (!access.ok) return access.response;

  try {
    const furo = await prisma.furo.create({
      data: { codigo, obraId, tipo },
    });
    return NextResponse.json(furo);
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: unknown }).code)
        : "";
    const msg =
      code === "P2002"
        ? "Já existe um furo com este código nesta obra."
        : e instanceof Error
          ? e.message
          : "Erro ao criar furo na base de dados.";
    console.error("[POST /api/furo]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const furoIdRaw = searchParams.get("furoId");

  if (furoIdRaw !== null && furoIdRaw !== "") {
    const furoId = Number(furoIdRaw);
    if (!Number.isFinite(furoId)) {
      return NextResponse.json({ error: "furoId inválido" }, { status: 400 });
    }

    const furo = await prisma.furo.findUnique({
      where: { id: furoId },
      include: {
        obra: true,
        spt: {
          orderBy: { prof: "asc" },
        },
      },
    });
    if (!furo) {
      return NextResponse.json({ error: "Furo não encontrado" }, { status: 404 });
    }

    const access = await requireObraAccessFromRequest(req, furo.obra);
    if (!access.ok) return access.response;

    return NextResponse.json(furo);
  }

  const raw = searchParams.get("obraId") ?? searchParams.get("projectId");
  const obraId = raw === null || raw === "" ? NaN : Number(raw);

  if (!Number.isFinite(obraId)) {
    return NextResponse.json(
      { error: "Query obraId/projectId ou furoId é obrigatória e deve ser numérica" },
      { status: 400 },
    );
  }

  const obra = await prisma.obra.findUnique({
    where: { id: obraId },
    select: { companyId: true, createdByUserId: true },
  });
  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  const access = await requireObraAccessFromRequest(req, obra);
  if (!access.ok) return access.response;

  const tipoQ =
    searchParams.get("tipo") ?? searchParams.get("tipoCampo");
  const tipoFiltrado =
    tipoQ !== null && tipoQ !== "" && isCampoTipo(tipoQ) ? tipoQ : undefined;

  const furos = await prisma.furo.findMany({
    where: {
      obraId,
      ...(tipoFiltrado != null ? { tipo: tipoFiltrado } : {}),
    },
    orderBy: { id: "asc" },
  });

  return NextResponse.json(furos);
}
