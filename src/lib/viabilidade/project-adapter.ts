import { computePolygonMetrics } from "@/lib/rtk-validation/cad/polygon-utils";
import { polylineLengthM } from "@/lib/rtk-validation/cad/profile";
import {
  AREA_APP_LAYER_ID,
  AREA_RESERVA_LEGAL_LAYER_ID,
  AREA_UTIL_LAYER_ID,
} from "@/lib/rtk-validation/cad/loteamento-tools";
import {
  DRENAGEM_EMISSARIO_LAYER,
  listDrainageInlets,
  listDrainagePipes,
  listDrainagePvs,
} from "@/lib/rtk-validation/cad/loteamento-drainage";
import { computeLoteamentoCutFill } from "@/lib/rtk-validation/cad/loteamento-earthwork";
import { measureLotFrontAndDepth, type PolygonCoords } from "@/lib/rtk-validation/cad/lot-subdivision";
import {
  LOTEAMENTO_CALCADAS_LAYER_ID,
  LOTEAMENTO_EIXOS_LAYER_ID,
  LOTEAMENTO_LOTES_LAYER_ID,
  LOTEAMENTO_VIAS_LAYER_ID,
  listReurbLots,
} from "@/lib/rtk-validation/cad/reurb";
import type {
  CadPolylineEntity,
  CadProject,
} from "@/lib/rtk-validation/cad/types";
import type { StreetProfileDraft } from "@/lib/rtk-validation/cad/street-profile";
import type {
  DrenagemProjetoQuantidades,
  ProjetoLoteamentoInput,
  TerraplenagemVolumes,
} from "./types";
import { TERRAPLENAGEM_INDISPONIVEL } from "./types";

const GENERATED_LAYER_IDS = new Set([
  LOTEAMENTO_LOTES_LAYER_ID,
  LOTEAMENTO_VIAS_LAYER_ID,
  LOTEAMENTO_CALCADAS_LAYER_ID,
  LOTEAMENTO_EIXOS_LAYER_ID,
  AREA_APP_LAYER_ID,
  AREA_RESERVA_LEGAL_LAYER_ID,
  AREA_UTIL_LAYER_ID,
  "loteamento_quadras",
  "loteamento_pontos",
  "loteamento_tabelas",
  "loteamento_encontros",
  "loteamento_perfil",
  "loteamento_greide",
  "loteamento_secao",
  "drenagem_pv",
  "drenagem_bocas",
  "drenagem_tubos",
  "drenagem_contrib",
  "drenagem_emissario",
  "reurb_anotacoes",
  "text",
  "tin",
  "contours",
  "contour_labels",
  "locacao",
  "profile",
  "profile_transversal",
  "cutfill",
  "hypsometric",
  "orthophoto",
]);

const LOTES_LAYER_ALIASES = [LOTEAMENTO_LOTES_LAYER_ID, "LOTEAMENTO_LOTES"] as const;
const VIAS_LAYER_ALIASES = [LOTEAMENTO_VIAS_LAYER_ID, "LOTEAMENTO_VIAS"] as const;
const CALCADAS_LAYER_ALIASES = [LOTEAMENTO_CALCADAS_LAYER_ID, "LOTEAMENTO_CALCADAS"] as const;
const EIXOS_LAYER_ALIASES = [LOTEAMENTO_EIXOS_LAYER_ID, "LOTEAMENTO_EIXOS"] as const;
const APP_LAYER_ALIASES = [AREA_APP_LAYER_ID, "AREA_APP"] as const;
const RESERVA_LAYER_ALIASES = [AREA_RESERVA_LEGAL_LAYER_ID, "AREA_RESERVA_LEGAL"] as const;
const UTIL_LAYER_ALIASES = [AREA_UTIL_LAYER_ID, "AREA_UTIL"] as const;
const GLEBA_LAYER_ALIASES = ["gleba", "area_gleba", "perimetro_gleba"] as const;
const NON_LOT_LAYER_ALIASES = [
  ...VIAS_LAYER_ALIASES,
  ...CALCADAS_LAYER_ALIASES,
  ...EIXOS_LAYER_ALIASES,
  ...APP_LAYER_ALIASES,
  ...RESERVA_LAYER_ALIASES,
  ...UTIL_LAYER_ALIASES,
  ...GLEBA_LAYER_ALIASES,
  "loteamento_quadras",
] as const;

function normLayerToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function layerTokens(project: CadProject, layerId: string): string[] {
  const tokens = new Set<string>([normLayerToken(layerId)]);
  const layer = project.layers.find((item) => item.id === layerId);
  if (layer?.name) tokens.add(normLayerToken(layer.name));
  return [...tokens];
}

function layerMatches(project: CadProject, layerId: string, aliases: readonly string[]): boolean {
  const tokens = layerTokens(project, layerId);
  return aliases.some((alias) => tokens.includes(normLayerToken(alias)));
}

function isClosedRing(entity: CadPolylineEntity): boolean {
  if (entity.vertices.length < 3) return false;
  if (entity.closed) return true;
  const first = entity.vertices[0];
  const last = entity.vertices[entity.vertices.length - 1];
  if (!first || !last) return false;
  return Math.hypot(first.x - last.x, first.y - last.y) <= 0.05;
}

export type AdapterOptions = {
  projetoId: string;
  streetProfiles?: StreetProfileDraft[];
  plateauZ?: number | null;
  larguraViaFallbackM?: number;
  glebaId?: string | null;
};

function closedPolylinesOn(project: CadProject, aliases: readonly string[]): CadPolylineEntity[] {
  return project.entities.filter(
    (entity): entity is CadPolylineEntity =>
      entity.type === "polyline" &&
      isClosedRing(entity) &&
      layerMatches(project, entity.layerId, aliases),
  );
}

function openPolylinesOn(project: CadProject, aliases: readonly string[]): CadPolylineEntity[] {
  return project.entities.filter(
    (entity): entity is CadPolylineEntity =>
      entity.type === "polyline" &&
      !isClosedRing(entity) &&
      entity.vertices.length >= 2 &&
      layerMatches(project, entity.layerId, aliases),
  );
}

function listLotesDoProjeto(project: CadProject): CadPolylineEntity[] {
  const byLayer = closedPolylinesOn(project, LOTES_LAYER_ALIASES);
  if (byLayer.length > 0) return byLayer;
  return listReurbLots(project).filter((poly) => {
    if (!isClosedRing(poly)) return false;
    if (layerMatches(project, poly.layerId, NON_LOT_LAYER_ALIASES)) return false;
    if (GENERATED_LAYER_IDS.has(poly.layerId) && poly.layerId !== LOTEAMENTO_LOTES_LAYER_ID) return false;
    return true;
  });
}

function ringOf(poly: CadPolylineEntity): PolygonCoords {
  return poly.vertices.map((vertex) => [vertex.x, vertex.y]);
}

function areaOf(poly: CadPolylineEntity): number {
  return computePolygonMetrics(poly.vertices, true).areaM2;
}

function perimeterOf(poly: CadPolylineEntity): number {
  return computePolygonMetrics(poly.vertices, true).perimeterM;
}

function sumArea(polys: CadPolylineEntity[]): number {
  return polys.reduce((sum, poly) => sum + areaOf(poly), 0);
}

function viaMetrics(poly: CadPolylineEntity): { comprimento: number; largura: number; area: number } {
  const area = areaOf(poly);
  const perimeter = perimeterOf(poly);
  const comprimento = perimeter > 0 ? perimeter / 2 : 0;
  const largura = comprimento > 0.01 ? area / comprimento : 0;
  return { comprimento, largura, area };
}

function glebaArea(project: CadProject, glebaId?: string | null): number {
  const closed = project.entities.filter(
    (entity): entity is CadPolylineEntity =>
      entity.type === "polyline" && isClosedRing(entity),
  );
  if (glebaId) {
    const match = closed.find((poly) => poly.id === glebaId);
    if (match) return areaOf(match);
  }
  const named = closed.filter((poly) => layerMatches(project, poly.layerId, GLEBA_LAYER_ALIASES));
  if (named.length > 0) {
    return named.reduce((best, poly) => Math.max(best, areaOf(poly)), 0);
  }
  const candidates = closed.filter((poly) => {
    if (GENERATED_LAYER_IDS.has(poly.layerId)) return false;
    if (layerMatches(project, poly.layerId, LOTES_LAYER_ALIASES)) return false;
    if (layerMatches(project, poly.layerId, NON_LOT_LAYER_ALIASES)) return false;
    return true;
  });
  let best = 0;
  for (const poly of candidates) {
    const area = areaOf(poly);
    if (area > best) best = area;
  }
  return best;
}

function classifyPublicArea(
  poly: CadPolylineEntity,
  layerId: string,
): "verde" | "institucional" {
  const name = `${poly.name ?? ""} ${layerId}`.toLowerCase();
  if (
    layerId === AREA_RESERVA_LEGAL_LAYER_ID ||
    /reserva|verde|praça|praca|parque|bosque/.test(name)
  ) {
    return "verde";
  }
  return "institucional";
}

function extractDrenagem(project: CadProject): DrenagemProjetoQuantidades | undefined {
  const pipes = listDrainagePipes(project);
  const inlets = listDrainageInlets(project);
  const pvs = listDrainagePvs(project).filter(
    (node) =>
      node.drainage?.kind !== "inlet" &&
      node.layerId !== "drenagem_bocas",
  );
  if (pipes.length === 0 && inlets.length === 0 && pvs.length === 0) return undefined;

  const tubulacaoPorDiametroMm: Record<number, number> = {};
  for (const pipe of pipes) {
    const diameter = Math.round(pipe.drainage?.diameterMm ?? 0);
    const length = pipe.drainage?.lengthM ?? polylineLengthM(pipe.vertices);
    if (diameter > 0 && length > 0) {
      tubulacaoPorDiametroMm[diameter] = (tubulacaoPorDiametroMm[diameter] ?? 0) + length;
    } else if (length > 0) {
      tubulacaoPorDiametroMm[0] = (tubulacaoPorDiametroMm[0] ?? 0) + length;
    }
  }

  const dissipadores = project.entities.filter(
    (entity) =>
      entity.type === "point" &&
      (entity.layerId === DRENAGEM_EMISSARIO_LAYER.id || entity.drainage?.kind === "outfall"),
  ).length;

  return {
    tubulacaoPorDiametroMm,
    bocasDeLobo: inlets.length,
    pocosDeVisita: pvs.length,
    dissipadores,
    travessias: 0,
    origem: "PROJETO",
    confianca: "MEDIA",
  };
}

function extractTerraplenagem(
  project: CadProject,
  options: AdapterOptions,
  avisos: string[],
): TerraplenagemVolumes | null {
  const hasTerrainHint = project.entities.some(
    (entity) =>
      entity.layerId === "contours" ||
      entity.layerId === "tin" ||
      (entity.type === "point" && Number.isFinite(entity.z) && Math.abs(entity.z) > 0),
  );
  const hasDesign =
    (options.plateauZ != null && Number.isFinite(options.plateauZ)) ||
    (options.streetProfiles ?? []).some((profile) => profile.greide.length > 0);

  if (!hasTerrainHint || !hasDesign) {
    avisos.push(TERRAPLENAGEM_INDISPONIVEL);
    return null;
  }

  try {
    const result = computeLoteamentoCutFill({
      project,
      streetProfiles: options.streetProfiles,
      plateauZ: options.plateauZ,
    });
    const corte = result.cutM3;
    const aterro = result.fillM3;
    const balanco = corte - aterro;
    return {
      volumeCorte: corte,
      volumeAterro: aterro,
      balancoTerraplenagem: balanco,
      volumeBotaFora: balanco > 0 ? balanco : 0,
      volumeEmprestimo: balanco < 0 ? -balanco : 0,
      origem: "TOPOGRAFIA",
      confianca: "ALTA",
    };
  } catch {
    avisos.push(TERRAPLENAGEM_INDISPONIVEL);
    return null;
  }
}

function hasSurfaceFlag(project: CadProject, layerId: string): boolean {
  return project.entities.some((entity) => entity.layerId === layerId);
}

/** Converte o CadProject atual (camadas de loteamento) para a entrada do estudo. Não altera o desenho. */
export function adaptCadProjectToLoteamentoInput(
  project: CadProject,
  options: AdapterOptions,
): ProjetoLoteamentoInput {
  const avisos: string[] = [];
  const lots = listLotesDoProjeto(project);
  const vias = closedPolylinesOn(project, VIAS_LAYER_ALIASES);
  const calcadas = closedPolylinesOn(project, CALCADAS_LAYER_ALIASES);
  const eixos = openPolylinesOn(project, EIXOS_LAYER_ALIASES);
  const apps = closedPolylinesOn(project, APP_LAYER_ALIASES);
  const reservas = closedPolylinesOn(project, RESERVA_LAYER_ALIASES);
  const institucionais = closedPolylinesOn(project, UTIL_LAYER_ALIASES);

  const streetRings = vias.map((via) => ringOf(via));
  const lotes = lots.map((lot) => {
    const metrics = computePolygonMetrics(lot.vertices, true);
    let testada = 0;
    let profundidade: number | undefined;
    try {
      const front = measureLotFrontAndDepth(ringOf(lot), streetRings);
      testada = front.testadaM;
      profundidade = front.profundidadeM;
    } catch {
      testada = 0;
    }
    return {
      id: lot.id,
      area: metrics.areaM2,
      testada,
      profundidade,
      geometria: lot.vertices,
    };
  });

  const viaInputs = vias.map((via, index) => {
    const metrics = viaMetrics(via);
    const eixo = eixos[index];
    const comprimento = eixo ? polylineLengthM(eixo.vertices) : metrics.comprimento;
    const largura =
      metrics.largura > 0.2
        ? metrics.largura
        : comprimento > 0 && metrics.area > 0
          ? metrics.area / comprimento
          : options.larguraViaFallbackM ?? 0;
    return {
      id: via.id,
      comprimento,
      largura,
      area: metrics.area,
      geometria: via.vertices,
    };
  });

  const areasVerdes = reservas.map((poly) => ({ id: poly.id, area: areaOf(poly) }));
  const extraVerdes: { id: string; area: number }[] = [];
  const areasInstitucionais = institucionais
    .map((poly) => {
      const row = { id: poly.id, area: areaOf(poly) };
      if (classifyPublicArea(poly, AREA_UTIL_LAYER_ID) === "verde") {
        extraVerdes.push(row);
        return null;
      }
      return row;
    })
    .filter((row): row is { id: string; area: number } => row != null);

  const areaLotes = lotes.reduce((sum, lot) => sum + lot.area, 0);
  const areaVias = viaInputs.reduce((sum, via) => sum + (via.area ?? 0), 0);
  const areaCalcadas = sumArea(calcadas);
  const areaVerde = [...areasVerdes, ...extraVerdes].reduce((sum, row) => sum + row.area, 0);
  const areaInstitucional = areasInstitucionais.reduce((sum, row) => sum + row.area, 0);
  const areaApp = sumArea(apps);
  const gleba = glebaArea(project, options.glebaId);
  const areaTotal =
    gleba > 0 ? gleba : areaLotes + areaVias + areaCalcadas + areaVerde + areaInstitucional;

  const terraplenagem = extractTerraplenagem(project, options, avisos);
  const drenagemProjeto = extractDrenagem(project);

  return {
    projetoId: options.projetoId,
    nome: project.name,
    crs: project.crs,
    areaTotal,
    lotes,
    vias: viaInputs,
    areasVerdes: [...areasVerdes, ...extraVerdes],
    areasInstitucionais,
    app: { area: areaApp },
    superficieNatural: hasSurfaceFlag(project, "contours") || hasSurfaceFlag(project, "tin")
      ? { disponivel: true }
      : { disponivel: false },
    superficieProjeto:
      (options.plateauZ != null && Number.isFinite(options.plateauZ)) ||
      (options.streetProfiles ?? []).some((profile) => profile.greide.length > 0)
        ? { disponivel: true, plateauZ: options.plateauZ ?? null }
        : { disponivel: false },
    calcadas: calcadas.map((poly) => ({
      id: poly.id,
      area: areaOf(poly),
      comprimento: perimeterOf(poly) / 2,
    })),
    eixos: eixos.map((poly) => ({ id: poly.id, comprimento: polylineLengthM(poly.vertices) })),
    drenagemProjeto,
    terraplenagem,
    avisos,
  };
}

