import { NextResponse } from "next/server";
import { jsonError, requireOwnedViabilidade, requireViabilidadeUser } from "@/lib/viabilidade/access";
import { calcularCenarios } from "@/lib/viabilidade/financeiros";
import { D } from "@/lib/viabilidade/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireViabilidadeUser(req);
    const { id } = await context.params;
    const { estudo } = await requireOwnedViabilidade(user.id, id);
    const cenarios = calcularCenarios(D(estudo.receitaEstimada ?? 0), D(estudo.custoTotal));
    return NextResponse.json({
      id: estudo.id,
      cenarios: cenarios.map((cenario) => ({
        nome: cenario.nome,
        receita: cenario.receita.toString(),
        custo: cenario.custo.toString(),
        lucro: cenario.lucro.toString(),
        margem: cenario.margem.toString(),
        roi: cenario.roi.toString(),
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

