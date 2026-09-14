import { NextResponse } from "next/server";
import { jsonError, requireOwnedViabilidade, requireViabilidadeUser } from "@/lib/viabilidade/access";
import { prisma } from "@/lib/prisma";
import { parseIndiretos, parsePremissas } from "@/lib/viabilidade/parse-body";
import { serializeEstudo } from "@/lib/viabilidade/estudo-dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireViabilidadeUser(req);
    const { id } = await context.params;
    const { estudo, cad } = await requireOwnedViabilidade(user.id, id);
    return NextResponse.json(serializeEstudo(estudo, cad));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireViabilidadeUser(req);
    const { id } = await context.params;
    const { estudo, cad } = await requireOwnedViabilidade(user.id, id);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const premissas = parsePremissas(body.premissas ?? estudo.premissas);
    const indiretos = parseIndiretos(body);
    const updated = await prisma.viabilidade.update({
      where: { id: estudo.id },
      data: {
        uf: typeof body.uf === "string" && body.uf.trim() ? body.uf.trim().toUpperCase() : estudo.uf,
        municipio: typeof body.municipio === "string" ? body.municipio.trim() || null : estudo.municipio,
        competenciaSinapi:
          typeof body.competenciaSinapi === "string" ? body.competenciaSinapi.trim() || null : estudo.competenciaSinapi,
        premissas: premissas as object,
        valorTerreno: indiretos.valorTerreno ?? estudo.valorTerreno,
        custoProjetos: indiretos.custoProjetos ?? estudo.custoProjetos,
        custoLicenciamento: indiretos.custoLicenciamento ?? estudo.custoLicenciamento,
        custoRegistro: indiretos.custoRegistro ?? estudo.custoRegistro,
        custoAdministrativo: indiretos.custoAdministrativo ?? estudo.custoAdministrativo,
        custoComercial: indiretos.custoComercial ?? estudo.custoComercial,
      },
      include: { itens: true, quantitativos: true, validacoes: true },
    });
    return NextResponse.json(serializeEstudo(updated, cad));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireViabilidadeUser(req);
    const { id } = await context.params;
    const { estudo } = await requireOwnedViabilidade(user.id, id);
    await prisma.viabilidade.delete({ where: { id: estudo.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}

