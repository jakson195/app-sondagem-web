import { NextResponse } from "next/server";
import { cadProjectFromRow, jsonError, requireOwnedViabilidade, requireViabilidadeUser } from "@/lib/viabilidade/access";
import { loadPriceCatalog } from "@/lib/viabilidade/catalog-db";
import { calcularEstudo } from "@/lib/viabilidade/pipeline";
import { adaptCadProjectToLoteamentoInput } from "@/lib/viabilidade/project-adapter";
import { premissasFromJson } from "@/lib/viabilidade/parse-body";
import { montarRelatorio } from "@/lib/viabilidade/relatorio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireViabilidadeUser(req);
    const { id } = await context.params;
    const { estudo, cad } = await requireOwnedViabilidade(user.id, id);
    const premissas = premissasFromJson(estudo.premissas);
    const catalog = await loadPriceCatalog({
      uf: estudo.uf,
      competencia: estudo.competenciaSinapi,
      tipoSinapi: premissas.tipoCustoSinapi,
    });
    const projeto = adaptCadProjectToLoteamentoInput(cadProjectFromRow(cad), { projetoId: cad.id });
    const calculo = calcularEstudo({
      projeto,
      premissas,
      uf: estudo.uf,
      competencia: estudo.competenciaSinapi,
      catalog,
      indiretos: {
        valorTerreno: estudo.valorTerreno,
        custoProjetos: estudo.custoProjetos,
        custoLicenciamento: estudo.custoLicenciamento,
        custoRegistro: estudo.custoRegistro,
        custoAdministrativo: estudo.custoAdministrativo,
        custoComercial: estudo.custoComercial,
      },
    });
    return NextResponse.json(
      montarRelatorio({
        projetoNome: cad.name,
        municipio: estudo.municipio,
        uf: estudo.uf,
        versao: estudo.versao,
        premissas,
        calculo,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
