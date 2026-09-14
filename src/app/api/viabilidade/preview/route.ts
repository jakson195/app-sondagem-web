import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/server-auth";
import { cadProjectFromRequest, jsonError } from "@/lib/viabilidade/access";
import {
  isRecord,
  parseAdapterOptions,
  parseCadMetricFallbacks,
  parseIndiretos,
  parsePremissas,
} from "@/lib/viabilidade/parse-body";
import { montarEstudoFromCad } from "@/lib/viabilidade/calcular-from-cad";
import { emptyPriceCatalog } from "@/lib/viabilidade/custos";
import { loadPriceCatalog } from "@/lib/viabilidade/catalog-db";
import { VIABILIDADE_LOCAL_ID } from "@/lib/viabilidade/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    void (await getAuthUserFromRequest(req).catch(() => null));
    const body = await req.json().catch(() => ({}));
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Envie o projeto CAD para extração local." }, { status: 400 });
    }
    const project = cadProjectFromRequest(body);
    if (!project) {
      return NextResponse.json({ error: "Envie o projeto CAD para extração local." }, { status: 400 });
    }
    const uf = (typeof body.uf === "string" && body.uf.trim() ? body.uf : "SC").toUpperCase();
    const competencia = typeof body.competenciaSinapi === "string" ? body.competenciaSinapi.trim() || null : null;
    const premissas = parsePremissas(body.premissas);
    const indiretos = parseIndiretos(body);
    let catalog = emptyPriceCatalog(premissas.tipoCustoSinapi);
    try {
      catalog = await loadPriceCatalog({
        uf,
        competencia,
        tipoSinapi: premissas.tipoCustoSinapi,
      });
    } catch {
      catalog = emptyPriceCatalog(premissas.tipoCustoSinapi);
    }
    return NextResponse.json(
      montarEstudoFromCad({
        project,
        projetoId: typeof body.projetoId === "string" && body.projetoId.trim() ? body.projetoId.trim() : VIABILIDADE_LOCAL_ID,
        uf,
        competencia,
        premissas,
        indiretos,
        adapter: parseAdapterOptions(body, VIABILIDADE_LOCAL_ID),
        metricasCad: parseCadMetricFallbacks(body),
        catalog,
        persistido: false,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
