import { NextResponse } from "next/server";
import { isServicoDiretorio, municipioPorCodigo } from "@/lib/diretorio/core";
import { carregarPerfisPerto } from "@/lib/diretorio/db";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const LIMITE_POR_DIA = 10;

/**
 * Pedido de contato para uma empresa do diretório. O cliente não vê telefone/e-mail da empresa:
 * a empresa recebe o pedido na gestão (lead) e responde. Corpo:
 * { empresaId, mensagem, telefone?, codigoIbge?, servico? }
 */
export async function POST(req: Request) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const empresaId = Number(body?.empresaId);
  const mensagem = String(body?.mensagem ?? "").trim().slice(0, 2000);
  const telefone = String(body?.telefone ?? "").trim().slice(0, 40) || null;
  const cidade = municipioPorCodigo(Number(body?.codigoIbge));
  const servicoRaw = String(body?.servico ?? "").trim();
  if (!Number.isFinite(empresaId) || empresaId < 1) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }
  if (mensagem.length < 10) {
    return NextResponse.json({ error: "Descreva o que você precisa (mínimo 10 caracteres)." }, { status: 400 });
  }

  const perfil = await prisma.empresaDiretorio.findUnique({ where: { empresaId } });
  if (!perfil?.visivel) return NextResponse.json({ error: "Empresa não disponível no diretório." }, { status: 404 });
  /** Só empresa ativa recebe contato: confere pela mesma regra da busca. */
  const base = municipioPorCodigo(perfil.codigoIbge);
  const ativa = base ? (await carregarPerfisPerto(base, 1)).some((p) => p.empresaId === empresaId && p.ativa) : false;
  if (!ativa) return NextResponse.json({ error: "Empresa não disponível no diretório." }, { status: 404 });

  const desde = new Date(Date.now() - 86400000);
  const recentes = await prisma.diretorioLead.count({ where: { userId: user.id, createdAt: { gte: desde } } });
  if (recentes >= LIMITE_POR_DIA) {
    return NextResponse.json({ error: "Limite de pedidos por dia atingido. Tente amanhã." }, { status: 429 });
  }

  await prisma.diretorioLead.create({
    data: {
      empresaId,
      userId: user.id,
      nome: user.name?.trim() || user.email,
      email: user.email,
      telefone,
      codigoIbge: cidade?.codigoIbge ?? null,
      cidade: cidade ? `${cidade.nome}/${cidade.uf}` : null,
      servico: isServicoDiretorio(servicoRaw) ? servicoRaw : null,
      mensagem,
    },
  });
  return NextResponse.json({ ok: true });
}
