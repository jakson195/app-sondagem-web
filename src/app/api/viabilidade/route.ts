import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/pg-error-utils";
import { cadProjectFromRequest, jsonError, requireOwnedCadProject, requireViabilidadeUser } from "@/lib/viabilidade/access";
import { adaptCadProjectToLoteamentoInput } from "@/lib/viabilidade/project-adapter";
import { persistirCalculo } from "@/lib/viabilidade/persist";
import { montarEstudoFromCad } from "@/lib/viabilidade/calcular-from-cad";
import { emptyPriceCatalog } from "@/lib/viabilidade/custos";
import { loadPriceCatalog } from "@/lib/viabilidade/catalog-db";
import {
  asOptionalString,
  asString,
  isRecord,
  parseAdapterOptions,
  parseCadMetricFallbacks,
  parseIndiretos,
  parsePremissas,
} from "@/lib/viabilidade/parse-body";
import { TITULO_ESTUDO } from "@/lib/viabilidade/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireViabilidadeUser(req);
    const url = new URL(req.url);
    const projetoId = url.searchParams.get("projetoId");
    const cadIds = projetoId
      ? [(await requireOwnedCadProject(user.id, projetoId)).id]
      : (
          await prisma.cadUserProject.findMany({
            where: { userId: user.id },
            select: { id: true },
          })
        ).map((row) => row.id);

    let estudos: Awaited<ReturnType<typeof prisma.viabilidade.findMany>> = [];
    try {
      estudos = await prisma.viabilidade.findMany({
        where: { projetoId: { in: cadIds.length ? cadIds : ["__none__"] } },
        orderBy: [{ projetoId: "asc" }, { versao: "desc" }],
      });
    } catch (error) {
      if (!isPrismaMissingTableError(error, "viabilidade")) throw error;
    }

    return NextResponse.json({
      titulo: TITULO_ESTUDO,
      estudos: estudos.map((row) => ({
        id: row.id,
        projetoId: row.projetoId,
        versao: row.versao,
        uf: row.uf,
        municipio: row.municipio,
        competenciaSinapi: row.competenciaSinapi,
        quantidadeLotes: row.quantidadeLotes,
        custoTotal: row.custoTotal.toString(),
        receitaEstimada: row.receitaEstimada?.toString() ?? null,
        lucroEstimado: row.lucroEstimado.toString(),
        margemPercentual: row.margemPercentual.toString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireViabilidadeUser(req);
    const body = await req.json().catch(() => ({}));
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
    }
    const projetoId = asString(body.projetoId).trim();
    if (!projetoId) {
      return NextResponse.json({ error: "projetoId é obrigatório." }, { status: 400 });
    }
    const cad = await requireOwnedCadProject(user.id, projetoId);
    const uf = (asOptionalString(body.uf) ?? "SC").toUpperCase();
    const municipio = asOptionalString(body.municipio);
    const competencia = asOptionalString(body.competenciaSinapi);
    const premissas = parsePremissas(body.premissas);
    const indiretos = parseIndiretos(body);

    const project = cadProjectFromRequest(body, cad);
    if (!project) {
      return NextResponse.json({ error: "Projeto CAD sem geometria para extração." }, { status: 400 });
    }
    const adapter = parseAdapterOptions(body, projetoId);
    const metricasCad = parseCadMetricFallbacks(body);
    const projeto = adaptCadProjectToLoteamentoInput(project, adapter);

    try {
      const latest = await prisma.viabilidade.findFirst({
        where: { projetoId },
        orderBy: { versao: "desc" },
      });
      const versao = (latest?.versao ?? 0) + 1;

      const created = await prisma.viabilidade.create({
        data: {
          projetoId,
          versao,
          uf,
          municipio,
          competenciaSinapi: competencia,
          premissas: premissas as object,
          valorTerreno: indiretos.valorTerreno ?? 0,
          custoProjetos: indiretos.custoProjetos ?? 0,
          custoLicenciamento: indiretos.custoLicenciamento ?? 0,
          custoRegistro: indiretos.custoRegistro ?? 0,
          custoAdministrativo: indiretos.custoAdministrativo ?? 0,
          custoComercial: indiretos.custoComercial ?? 0,
        },
      });

      const { dto } = await persistirCalculo({
        viabilidadeId: created.id,
        projeto,
        uf,
        competencia,
        municipio,
        premissas,
        indiretos,
        metricasCad,
      });

      return NextResponse.json({
        id: created.id,
        versao,
        titulo: TITULO_ESTUDO,
        ...dto,
      });
    } catch (error) {
      if (!isPrismaMissingTableError(error, "viabilidade")) throw error;
      let catalog = emptyPriceCatalog(premissas.tipoCustoSinapi);
      try {
        catalog = await loadPriceCatalog({ uf, competencia, tipoSinapi: premissas.tipoCustoSinapi });
      } catch {
        catalog = emptyPriceCatalog(premissas.tipoCustoSinapi);
      }
      return NextResponse.json({
        ...montarEstudoFromCad({
          project,
          projetoId,
          uf,
          competencia,
          premissas,
          indiretos,
          adapter,
          metricasCad,
          catalog,
          persistido: false,
          projetoNome: cad.name,
        }),
      });
    }
  } catch (error) {
    return jsonError(error);
  }
}

