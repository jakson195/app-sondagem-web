import { requireObraAccessFromRequest } from "@/lib/obra-access";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("furoId");
  const furoId = raw === null || raw === "" ? NaN : Number(raw);

  if (!Number.isFinite(furoId)) {
    return NextResponse.json(
      { error: "Query furoId é obrigatória e deve ser numérica" },
      { status: 400 },
    );
  }

  const furo = await prisma.furo.findUnique({
    where: { id: furoId },
    include: {
      obra: true,
      spt: { orderBy: { prof: "asc" } },
    },
  });

  if (!furo) {
    return NextResponse.json({ error: "Furo não encontrado" }, { status: 404 });
  }

  const access = await requireObraAccessFromRequest(req, furo.obra);
  if (!access.ok) return access.response;

  return NextResponse.json(furo);
}
