import type { CadProject } from "@/lib/rtk-validation/cad/types";
import type { StreetProfileDraft } from "@/lib/rtk-validation/cad/street-profile";
import { adaptCadProjectToLoteamentoInput } from "./project-adapter";
import { extrairQuantitativosProjeto } from "./extrator";
import { VIABILIDADE_LOCAL_KEY } from "./types";

const DROP_LAYER_IDS = new Set([
  "contours",
  "contour_labels",
  "contours_interpolated",
  "tin",
  "orthophoto",
  "hypsometric",
  "cutfill",
  "rtk_points",
  "ctrl_known",
  "ctrl_obs",
  "residuals",
]);

const KEEP_LAYER_PREFIX = /^(loteamento_|area_|drenagem_)/i;

export type ViabilidadeSessionPayload = {
  projetoId: string | null;
  project?: CadProject;
  streetProfiles?: StreetProfileDraft[];
  plateauZ?: number | null;
  glebaId?: string | null;
  larguraViaFallbackM?: number;
  larguraCalcadaM?: number;
  areaTotal: number;
  quantidadeLotes: number;
  areaLotes: number;
  savedAt: string;
};

function slimCadProject(project: CadProject): CadProject {
  return {
    name: project.name,
    crs: project.crs,
    layers: project.layers,
    entities: project.entities.filter((entity) => {
      if (DROP_LAYER_IDS.has(entity.layerId)) return false;
      if (KEEP_LAYER_PREFIX.test(entity.layerId)) return true;
      return entity.type === "polyline";
    }),
    ...(project.adjustment ? { adjustment: project.adjustment } : {}),
  };
}

export function buildViabilidadeSessionPayload(input: {
  project: CadProject;
  savedProjectId?: string | null;
  streetProfiles?: StreetProfileDraft[];
  plateauZ?: number | null;
  glebaId?: string | null;
  larguraViaFallbackM?: number;
  larguraCalcadaM?: number;
}): ViabilidadeSessionPayload {
  const adapter = adaptCadProjectToLoteamentoInput(input.project, {
    projetoId: input.savedProjectId ?? "local",
    streetProfiles: input.streetProfiles,
    plateauZ: input.plateauZ,
    glebaId: input.glebaId,
    larguraViaFallbackM: input.larguraViaFallbackM,
  });
  const extraido = extrairQuantitativosProjeto(adapter);
  return {
    projetoId: input.savedProjectId ?? null,
    project: slimCadProject(input.project),
    streetProfiles: input.streetProfiles,
    plateauZ: input.plateauZ ?? null,
    glebaId: input.glebaId ?? null,
    larguraViaFallbackM: input.larguraViaFallbackM,
    larguraCalcadaM: input.larguraCalcadaM,
    areaTotal: extraido.areaTotal,
    quantidadeLotes: extraido.quantidadeLotes,
    areaLotes: extraido.areaLotes,
    savedAt: new Date().toISOString(),
  };
}

export function writeViabilidadeSession(payload: ViabilidadeSessionPayload): { ok: boolean } {
  const attempts: ViabilidadeSessionPayload[] = [
    payload,
    { ...payload, project: payload.project ? slimCadProject(payload.project) : undefined },
    {
      projetoId: payload.projetoId,
      streetProfiles: payload.streetProfiles,
      plateauZ: payload.plateauZ,
      glebaId: payload.glebaId,
      larguraViaFallbackM: payload.larguraViaFallbackM,
      larguraCalcadaM: payload.larguraCalcadaM,
      areaTotal: payload.areaTotal,
      quantidadeLotes: payload.quantidadeLotes,
      areaLotes: payload.areaLotes,
      savedAt: payload.savedAt,
    },
  ];
  for (const attempt of attempts) {
    try {
      sessionStorage.setItem(VIABILIDADE_LOCAL_KEY, JSON.stringify(attempt));
      return { ok: true };
    } catch {
      /* quota — try a smaller payload */
    }
  }
  return { ok: false };
}

export function readViabilidadeSession(): ViabilidadeSessionPayload | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(VIABILIDADE_LOCAL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ViabilidadeSessionPayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
