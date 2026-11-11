import { NextResponse } from "next/server";
import { n8nAcao } from "@/lib/agentes-dgeo/motor";

/** n8n → agentes da DataGeo. Exige o cabeçalho x-dgeo-key (= DGEO_AGENTES_KEY). Ações: agentes_rodada | agentes_contatos */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const acao = new URL(req.url).searchParams.get("acao") || "";
  let corpo: Record<string, unknown> = {};
  try {
    const j: unknown = await req.json();
    if (j && typeof j === "object" && !Array.isArray(j)) corpo = j as Record<string, unknown>;
  } catch {
    corpo = {};
  }
  const r = await n8nAcao(req.headers.get("x-dgeo-key"), acao, corpo);
  return NextResponse.json(r.json, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
