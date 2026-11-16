import { NextResponse } from "next/server";
import { buscarMunicipios } from "@/lib/diretorio/core";

export const dynamic = "force-dynamic";

/** Autocompletar de municípios do IBGE: ?q=crici */
export async function GET(req: Request) {
  // Público: o site mostra só empresas com perfil visível e assinatura ativa.
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json({ municipios: buscarMunicipios(q, 10) });
}
