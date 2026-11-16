import { NextResponse } from "next/server";
import { buscarEmpresas, isServicoDiretorio, municipioPorCodigo } from "@/lib/diretorio/core";
import { carregarPerfisPerto } from "@/lib/diretorio/db";
import { isPrismaMissingTableError } from "@/lib/pg-error-utils";
import { getAuthUserFromRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** Empresas que usam o app perto de uma cidade: ?ibge=4204608&raio=80&servico=topografia */
export async function GET(req: Request) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const cidade = municipioPorCodigo(Number(sp.get("ibge")));
  if (!cidade) return NextResponse.json({ error: "Escolha uma cidade da lista." }, { status: 400 });
  const raio = Number(sp.get("raio")) || 80;
  const servicoRaw = sp.get("servico")?.trim() || null;
  const servico = servicoRaw && isServicoDiretorio(servicoRaw) ? servicoRaw : null;
  try {
    const perfis = await carregarPerfisPerto(cidade, raio);
    const empresas = buscarEmpresas(perfis, cidade, { raioBuscaKm: raio, servico });
    return NextResponse.json({ cidade, raioKm: raio, servico, empresas });
  } catch (error) {
    if (isPrismaMissingTableError(error)) {
      return NextResponse.json({ cidade, raioKm: raio, servico, empresas: [], aviso: "Diretório ainda não ativado no banco." });
    }
    console.error(error);
    return NextResponse.json({ error: "Falha na busca." }, { status: 500 });
  }
}
