import { NextResponse } from "next/server";
import { buscarMunicipios } from "@/lib/diretorio/core";
import { getAuthUserFromRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** Autocompletar de municípios do IBGE: ?q=crici */
export async function GET(req: Request) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json({ municipios: buscarMunicipios(q, 10) });
}
