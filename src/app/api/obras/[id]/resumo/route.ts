import { NextResponse } from "next/server";
import { requireObraAccessFromRequest } from "@/lib/obra-access";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const obra = await prisma.obra.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      cliente: true,
      local: true,
      status: true,
      companyId: true,
      createdByUserId: true,
      latitude: true,
      longitude: true,
      _count: { select: { furos: true } },
    },
  });
  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  const access = await requireObraAccessFromRequest(req, obra);
  if (!access.ok) return access.response;

  const [furosByTipo, furosComGps, sptExecutados, resistividadeCount, equipeCount] =
    await Promise.all([
      prisma.furo.groupBy({
        by: ["tipo"],
        where: { obraId: id },
        _count: { _all: true },
      }),
      prisma.furo.count({
        where: { obraId: id, latitude: { not: null }, longitude: { not: null } },
      }),
      prisma.sPT.count({ where: { furo: { obraId: id } } }),
      (
        (prisma as unknown as { vESProject?: typeof prisma.vESProject }).vESProject
          ? prisma.vESProject.count({ where: { projectId: id } })
          : Promise.resolve(0)
      ),
      prisma.orgMembership.count({ where: { empresaId: obra.companyId } }),
    ]);

  const byTipo: Record<string, number> = {
    spt: 0,
    rotativa: 0,
    trado: 0,
    piezo: 0,
  };
  for (const row of furosByTipo) byTipo[row.tipo] = row._count._all;

  const mapas = {
    referenciaObra:
      obra.latitude != null &&
      obra.longitude != null &&
      Number.isFinite(obra.latitude) &&
      Number.isFinite(obra.longitude),
    pontosFuro: furosComGps,
    totalPontos:
      furosComGps +
      (obra.latitude != null && obra.longitude != null ? 1 : 0),
  };

  const progressoChecks = [
    byTipo.spt > 0,
    byTipo.rotativa > 0,
    byTipo.trado > 0,
    byTipo.piezo > 0,
    resistividadeCount > 0,
  ];
  const progressoConcluido = progressoChecks.filter(Boolean).length;
  const progressoTotal = progressoChecks.length;
  const progressoPercent = Math.round((progressoConcluido / progressoTotal) * 100);

  return NextResponse.json({
    obra: {
      id: obra.id,
      nome: obra.nome,
      cliente: obra.cliente,
      local: obra.local,
      status: obra.status,
    },
    contadores: {
      furos: obra._count.furos,
      sptExecutados,
      rotativa: byTipo.rotativa,
      pocos: byTipo.piezo,
      resistividade: resistividadeCount,
      mapas: mapas.totalPontos,
      equipe: equipeCount,
    },
    mapas,
    progresso: {
      concluido: progressoConcluido,
      total: progressoTotal,
      percent: progressoPercent,
    },
  });
}

