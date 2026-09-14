import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireViabilidadeUser } from "@/lib/viabilidade/access";
import { filtrarSicro } from "@/lib/viabilidade/custos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireViabilidadeUser(req);
    const url = new URL(req.url);
    const uf = url.searchParams.get("uf") ?? undefined;
    const competencia = url.searchParams.get("competencia") ?? undefined;
    const codigo = url.searchParams.get("codigo") ?? undefined;
    const q = url.searchParams.get("q") ?? undefined;

    const rows = await prisma.sicroComposicao.findMany({
      where: {
        ativo: true,
        ...(uf ? { uf: uf.toUpperCase() } : {}),
        ...(competencia ? { competencia } : {}),
        ...(codigo ? { codigo } : {}),
      },
      take: 200,
      orderBy: { codigo: "asc" },
    });
    const filtered = filtrarSicro(
      rows.map((row) => ({ ...row })),
      { uf, competencia, codigo, q },
    );
    return NextResponse.json({
      items: filtered.slice(0, 100).map((row) => ({
        codigo: row.codigo,
        descricao: row.descricao,
        unidade: row.unidade,
        uf: row.uf,
        competencia: row.competencia,
        custo: row.custo?.toString() ?? null,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
