import { NextResponse } from "next/server";
import { assinaturaAtiva, isServicoDiretorio, municipioPorCodigo } from "@/lib/diretorio/core";
import { RAIO_ATUACAO_MAX_KM } from "@/lib/diretorio/db";
import { resolveGestorEmpresa } from "@/lib/empresa-gestao-auth";
import { isPrismaMissingTableError } from "@/lib/pg-error-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ empresaId: string }> };

async function situacao(empresaId: number) {
  const company = await prisma.company.findUnique({
    where: { id: empresaId },
    select: { status: true, subscription: { select: { status: true, trialEndsAt: true, currentPeriodEnd: true } } },
  });
  return assinaturaAtiva(company?.subscription ?? null, company?.status);
}

/** Perfil no diretório + pedidos de contato recebidos. */
export async function GET(req: Request, ctx: Ctx) {
  const empresaId = Number((await ctx.params).empresaId);
  const gate = await resolveGestorEmpresa(req, empresaId);
  if (!gate.ok) return gate.response;
  try {
    const [perfil, leads, ativa] = await Promise.all([
      prisma.empresaDiretorio.findUnique({ where: { empresaId } }),
      prisma.diretorioLead.findMany({ where: { empresaId }, orderBy: { createdAt: "desc" }, take: 50 }),
      situacao(empresaId),
    ]);
    return NextResponse.json({ perfil, leads, assinaturaAtiva: ativa });
  } catch (e) {
    if (isPrismaMissingTableError(e)) {
      return NextResponse.json({ perfil: null, leads: [], assinaturaAtiva: false, aviso: "Diretório ainda não ativado no banco." });
    }
    console.error(e);
    return NextResponse.json({ error: "Erro ao carregar o diretório." }, { status: 500 });
  }
}

/** Corpo: { visivel, codigoIbge, raioKm, servicos[], descricao?, registroProfissional? } */
export async function PUT(req: Request, ctx: Ctx) {
  const empresaId = Number((await ctx.params).empresaId);
  const gate = await resolveGestorEmpresa(req, empresaId);
  if (!gate.ok) return gate.response;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const cidade = municipioPorCodigo(Number(body.codigoIbge));
  if (!cidade) return NextResponse.json({ error: "Escolha a cidade sede na lista." }, { status: 400 });
  const raioKm = Math.round(Math.max(5, Math.min(RAIO_ATUACAO_MAX_KM, Number(body.raioKm) || 80)));
  const servicos = Array.isArray(body.servicos)
    ? [...new Set(body.servicos.map(String).filter(isServicoDiretorio))]
    : [];
  if (Boolean(body.visivel) && servicos.length === 0) {
    return NextResponse.json({ error: "Marque ao menos um serviço para aparecer na busca." }, { status: 400 });
  }
  const descricao = String(body.descricao ?? "").trim().slice(0, 600) || null;
  const registro = String(body.registroProfissional ?? "").trim().slice(0, 60) || null;
  const atual = await prisma.empresaDiretorio.findUnique({ where: { empresaId }, select: { registroProfissional: true } });
  const dados = {
    visivel: Boolean(body.visivel),
    codigoIbge: cidade.codigoIbge,
    cidade: cidade.nome,
    uf: cidade.uf,
    latitude: cidade.lat,
    longitude: cidade.lon,
    raioKm,
    servicos,
    descricao,
    registroProfissional: registro,
    /** Trocou o registro: o selo precisa ser conferido de novo. */
    ...(atual && atual.registroProfissional !== registro ? { registroVerificado: false } : {}),
  };
  try {
    const perfil = await prisma.empresaDiretorio.upsert({
      where: { empresaId },
      create: { empresaId, ...dados },
      update: dados,
    });
    return NextResponse.json({ perfil, assinaturaAtiva: await situacao(empresaId) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao salvar o perfil." }, { status: 500 });
  }
}

/** Marca pedidos como lidos: { leadIds: number[] } */
export async function PATCH(req: Request, ctx: Ctx) {
  const empresaId = Number((await ctx.params).empresaId);
  const gate = await resolveGestorEmpresa(req, empresaId);
  if (!gate.ok) return gate.response;
  const body = (await req.json().catch(() => null)) as { leadIds?: unknown } | null;
  const ids = Array.isArray(body?.leadIds) ? body.leadIds.map(Number).filter((n) => Number.isFinite(n)) : [];
  await prisma.diretorioLead.updateMany({ where: { empresaId, id: { in: ids } }, data: { lido: true } });
  return NextResponse.json({ ok: true });
}
