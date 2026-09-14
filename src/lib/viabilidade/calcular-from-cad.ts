import type { CadProject } from "@/lib/rtk-validation/cad/types";
import { adaptCadProjectToLoteamentoInput, type AdapterOptions } from "./project-adapter";
import { calcularEstudo, type CustosIndiretosInput } from "./pipeline";
import { serializeCalculo } from "./serialize";
import type { MetricasCadFallback } from "./extrator";
import type { PriceCatalog } from "./custos";
import { emptyPriceCatalog } from "./custos";
import { TITULO_ESTUDO } from "./types";
import type { ViabilidadePremissas } from "./types";

export function montarEstudoFromCad(input: {
  project: CadProject;
  projetoId: string;
  uf: string;
  competencia: string | null;
  premissas: ViabilidadePremissas;
  indiretos: CustosIndiretosInput;
  adapter: AdapterOptions;
  metricasCad?: MetricasCadFallback;
  catalog?: PriceCatalog;
  persistido?: boolean;
  projetoNome?: string;
}) {
  const projeto = adaptCadProjectToLoteamentoInput(input.project, {
    ...input.adapter,
    projetoId: input.projetoId,
  });
  const catalog = input.catalog ?? emptyPriceCatalog(input.premissas.tipoCustoSinapi);
  const calculo = calcularEstudo({
    projeto,
    premissas: input.premissas,
    uf: input.uf,
    competencia: input.competencia,
    catalog,
    indiretos: input.indiretos,
    metricasCad: input.metricasCad,
  });
  if (calculo.precosAusentes > 0 && catalog.sinapi.length === 0 && catalog.sicro.length === 0) {
    if (!calculo.alertaCompetencia) {
      calculo.avisos.push(
        "Não há composições SINAPI/SICRO carregadas para esta UF/competência. Importe ou sincronize a tabela — os quantitativos do projeto foram extraídos.",
      );
    }
  }
  return {
    id: null as string | null,
    persistido: input.persistido ?? false,
    titulo: TITULO_ESTUDO,
    projetoId: input.projetoId,
    projetoNome: input.projetoNome ?? projeto.nome ?? "Projeto local",
    uf: input.uf,
    municipio: input.premissas.municipio ?? null,
    competenciaSinapi: input.competencia,
    versao: 0,
    desatualizado: false,
    premissas: input.premissas,
    ...serializeCalculo(calculo),
  };
}
