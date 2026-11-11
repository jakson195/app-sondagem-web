import { NextResponse } from "next/server";
import { requireMasterAdminApi } from "@/lib/require-master-admin";
import { painelAcao } from "@/lib/agentes-dgeo/motor";

/** Agentes comerciais da DataGeo (painel /adm/agentes). Só SUPER_ADMIN. Dados na área "dgeo" do Supabase de agentes. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function tratar(req: Request, metodo: "GET" | "POST") {
  const { user, response } = await requireMasterAdminApi(req);
  if (!user) return response;
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  let corpo: Record<string, unknown> = {};
  if (metodo === "POST") {
    try {
      const j: unknown = await req.json();
      if (j && typeof j === "object" && !Array.isArray(j)) corpo = j as Record<string, unknown>;
    } catch {
      corpo = {};
    }
  }
  const quem = String((user as { email?: string | null }).email || "admin");
  const r = await painelAcao(metodo, String(q.acao || ""), q, corpo, quem);
  return NextResponse.json(r.json, { status: r.status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  return tratar(req, "GET");
}
export async function POST(req: Request) {
  return tratar(req, "POST");
}
