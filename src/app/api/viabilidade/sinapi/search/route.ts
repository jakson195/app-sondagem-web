import { NextResponse } from "next/server";
import { jsonError, requireViabilidadeUser } from "@/lib/viabilidade/access";
import { searchSinapiCatalog } from "@/lib/viabilidade/sinapi-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET(req: Request) {
  try {
    await requireViabilidadeUser(req);
    const url = new URL(req.url);
    const result = await searchSinapiCatalog({
      uf: url.searchParams.get("uf") ?? undefined,
      competencia: url.searchParams.get("competencia") ?? undefined,
      codigo: url.searchParams.get("codigo") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      take: 500,
    });

    return NextResponse.json(
      {
        items: result.items.map((row) => ({
          codigo: row.codigo,
          descricao: row.descricao,
          unidade: row.unidade,
          uf: row.uf,
          competencia: row.competencia,
          custoDesonerado: row.custoDesonerado,
          custoNaoDesonerado: row.custoNaoDesonerado,
          fonte: row.fonte || "SINAPI",
        })),
        total: result.total,
        shown: result.shown,
        uf: result.uf,
        competencia: result.competencia,
        competenciaSolicitada: result.competenciaSolicitada,
        competenciaNormalizada: result.competenciaNormalizada,
        emptyReason: result.emptyReason,
        availableCompetencias: result.availableCompetencias,
        tableOk: result.tableOk,
        fallbackUsado: result.fallbackUsado,
        fallbackCompetencia: result.fallbackCompetencia,
        avisoFallback: result.avisoFallback,
      },
      { status: result.tableOk ? 200 : 503, headers: NO_STORE },
    );
  } catch (error) {
    return jsonError(error);
  }
}
