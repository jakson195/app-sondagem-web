import { NextResponse } from "next/server";
import { jsonError, requireViabilidadeUser } from "@/lib/viabilidade/access";
import { SinapiSyncError } from "@/lib/viabilidade/sinapi-caixa";
import { contagemSinapiPorUf, SINAPI_TABLE_MISSING } from "@/lib/viabilidade/sinapi-store";
import { resolverCompetenciaSync, sincronizarSinapiUf } from "@/lib/viabilidade/sinapi-sync";
import { isUfBrasil, UFS_BRASIL } from "@/lib/viabilidade/sinapi-ufs";

function tableMissingResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === SINAPI_TABLE_MISSING) {
    return NextResponse.json({ error: message, items: [], total: 0, count: 0 }, { status: 503 });
  }
  return null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET(req: Request) {
  try {
    await requireViabilidadeUser(req);
    const url = new URL(req.url);
    const competenciaRaw = url.searchParams.get("competencia");
    const uf = url.searchParams.get("uf")?.trim().toUpperCase() || undefined;
    const competencia = competenciaRaw?.trim()
      ? (await resolverCompetenciaSync(competenciaRaw))
      : url.searchParams.get("descobrir") === "1"
        ? await resolverCompetenciaSync(null)
        : null;
    if (!competencia) {
      return NextResponse.json({
        competencia: null,
        total: 0,
        ufsComDados: 0,
        porUf: Object.fromEntries(UFS_BRASIL.map((sigla) => [sigla, 0])),
        ufs: UFS_BRASIL,
      });
    }
    const status = await contagemSinapiPorUf(competencia, uf);
    return NextResponse.json({
      ...status,
      uf: uf ?? null,
      count: uf ? status.porUf[uf] ?? 0 : status.total,
      ufs: UFS_BRASIL,
    });
  } catch (error) {
    if (error instanceof SinapiSyncError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    return tableMissingResponse(error) ?? jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireViabilidadeUser(req);
    const body = await req.json().catch(() => ({}));
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
    }
    const uf = String(body.uf ?? "").trim().toUpperCase();
    if (!uf || !isUfBrasil(uf)) {
      return NextResponse.json(
        { error: "Informe uma UF válida. A UI percorre as 27 UFs uma a uma." },
        { status: 400 },
      );
    }
    const competencia = typeof body.competencia === "string" ? body.competencia.trim() || null : null;
    const tipo = typeof body.tipo === "string" ? body.tipo : null;
    const result = await sincronizarSinapiUf({ uf, competencia, tipo });
    return NextResponse.json({
      ok: true,
      ...result,
      fonteCustosLabel: `Fonte dos custos: SINAPI — ${result.uf} — competência ${result.competencia}`,
      avisoFallback: result.avisoFallback,
      fallbackUsado: result.fallbackUsado,
    });
  } catch (error) {
    if (error instanceof SinapiSyncError) {
      const status = error.code === "CAIXA" || error.code === "ARQUIVO" || error.code === "VAZIO" ? 502 : 400;
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          urlsTentadas: error.urlsTentadas.slice(0, 8),
        },
        { status },
      );
    }
    return tableMissingResponse(error) ?? jsonError(error);
  }
}
