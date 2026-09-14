import { NextResponse } from "next/server";
import { cadProjectFromRequest, jsonError, requireOwnedViabilidade, requireViabilidadeUser } from "@/lib/viabilidade/access";
import { persistirCalculo } from "@/lib/viabilidade/persist";
import { adaptCadProjectToLoteamentoInput } from "@/lib/viabilidade/project-adapter";
import { isRecord, parseAdapterOptions, parseCadMetricFallbacks, parseIndiretos, parsePremissas } from "@/lib/viabilidade/parse-body";
import { serializeEstudo } from "@/lib/viabilidade/estudo-dto";
import { montarEstudoFromCad } from "@/lib/viabilidade/calcular-from-cad";
import { emptyPriceCatalog } from "@/lib/viabilidade/custos";
import { loadPriceCatalog } from "@/lib/viabilidade/catalog-db";
import { isPrismaMissingTableError } from "@/lib/pg-error-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireViabilidadeUser(req);
    const { id } = await context.params;
    const { estudo, cad } = await requireOwnedViabilidade(user.id, id);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const bodyRec = isRecord(body) ? body : {};
    const novaVersao = bodyRec.novaVersao === true || cad.updatedAt.getTime() > estudo.updatedAt.getTime() + 1000;

    const premissas = parsePremissas(bodyRec.premissas ?? estudo.premissas);
    const indiretos = parseIndiretos({
      valorTerreno: bodyRec.valorTerreno ?? estudo.valorTerreno,
      custoProjetos: bodyRec.custoProjetos ?? estudo.custoProjetos,
      custoLicenciamento: bodyRec.custoLicenciamento ?? estudo.custoLicenciamento,
      custoRegistro: bodyRec.custoRegistro ?? estudo.custoRegistro,
      custoAdministrativo: bodyRec.custoAdministrativo ?? estudo.custoAdministrativo,
      custoComercial: bodyRec.custoComercial ?? estudo.custoComercial,
    });
    const project = cadProjectFromRequest(bodyRec, cad);
    if (!project) {
      return NextResponse.json({ error: "Projeto CAD sem geometria para extração." }, { status: 400 });
    }
    const adapter = parseAdapterOptions(bodyRec, cad.id);
    const metricasCad = parseCadMetricFallbacks(bodyRec);
    const projeto = adaptCadProjectToLoteamentoInput(project, adapter);

    let targetId = estudo.id;
    try {
      if (novaVersao) {
        const created = await prisma.viabilidade.create({
          data: {
            projetoId: estudo.projetoId,
            versao: estudo.versao + 1,
            uf: estudo.uf,
            municipio: estudo.municipio,
            competenciaSinapi: estudo.competenciaSinapi,
            premissas: premissas as object,
          },
        });
        targetId = created.id;
      }

      await persistirCalculo({
        viabilidadeId: targetId,
        projeto,
        uf: typeof bodyRec.uf === "string" && bodyRec.uf.trim() ? bodyRec.uf.trim().toUpperCase() : estudo.uf,
        competencia:
          typeof bodyRec.competenciaSinapi === "string"
            ? bodyRec.competenciaSinapi.trim() || null
            : estudo.competenciaSinapi,
        municipio: typeof bodyRec.municipio === "string" ? bodyRec.municipio : estudo.municipio,
        premissas,
        indiretos,
        metricasCad,
      });

      const fresh = await prisma.viabilidade.findUniqueOrThrow({
        where: { id: targetId },
        include: { itens: true, quantitativos: true, validacoes: true },
      });
      return NextResponse.json(serializeEstudo(fresh, cad));
    } catch (error) {
      if (!isPrismaMissingTableError(error, "viabilidade")) throw error;
      const uf = typeof bodyRec.uf === "string" && bodyRec.uf.trim() ? bodyRec.uf.trim().toUpperCase() : estudo.uf;
      const competencia =
        typeof bodyRec.competenciaSinapi === "string"
          ? bodyRec.competenciaSinapi.trim() || null
          : estudo.competenciaSinapi;
      let catalog = emptyPriceCatalog(premissas.tipoCustoSinapi);
      try {
        catalog = await loadPriceCatalog({ uf, competencia, tipoSinapi: premissas.tipoCustoSinapi });
      } catch {
        catalog = emptyPriceCatalog(premissas.tipoCustoSinapi);
      }
      return NextResponse.json(
        montarEstudoFromCad({
          project,
          projetoId: cad.id,
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
      );
    }
  } catch (error) {
    return jsonError(error);
  }
}
