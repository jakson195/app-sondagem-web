import { NextResponse } from "next/server";
import { jsonError, requireOwnedViabilidade, requireViabilidadeUser } from "@/lib/viabilidade/access";
import { prisma } from "@/lib/prisma";
import { calcularItem, D } from "@/lib/viabilidade/money";
import { serializeEstudo } from "@/lib/viabilidade/estudo-dto";
import { isRecord } from "@/lib/viabilidade/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireViabilidadeUser(req);
    const { id } = await context.params;
    const { estudo, cad } = await requireOwnedViabilidade(user.id, id);
    const body = await req.json().catch(() => ({}));
    const items = isRecord(body) && Array.isArray(body.itens) ? body.itens : Array.isArray(body) ? body : [];

    for (const raw of items) {
      if (!isRecord(raw) || typeof raw.id !== "string") continue;
      const owned = estudo.itens.find((row) => row.id === raw.id);
      if (!owned) continue;
      const unit = raw.custoUnitario != null ? D(String(raw.custoUnitario)) : owned.custoUnitario;
      const qty = raw.quantidade != null ? D(String(raw.quantidade)) : owned.quantidade;
      await prisma.viabilidadeItem.update({
        where: { id: raw.id },
        data: {
          quantidade: qty,
          custoUnitario: unit,
          custoTotal: calcularItem(qty, unit),
          origemValor: "MANUAL",
          observacao: typeof raw.observacao === "string" ? raw.observacao : owned.observacao,
          fonte: "MANUAL",
        },
      });
    }

    const fresh = await prisma.viabilidade.findUniqueOrThrow({
      where: { id: estudo.id },
      include: { itens: true, quantitativos: true, validacoes: true },
    });
    return NextResponse.json(serializeEstudo(fresh, cad));
  } catch (error) {
    return jsonError(error);
  }
}
