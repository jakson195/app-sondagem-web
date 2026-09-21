import {
  AREA_APP_LAYER_ID,
  AREA_REMANESCENTE_LAYER_ID,
  AREA_RESERVA_LEGAL_LAYER_ID,
  summarizeLoteamento,
} from "@/lib/rtk-validation/cad/loteamento-tools";
import { LOTEAMENTO_VIAS_LAYER_ID } from "@/lib/rtk-validation/cad/reurb";
import { computePolygonMetrics } from "@/lib/rtk-validation/cad/polygon-utils";
import type { CadPolylineEntity, CadProject } from "@/lib/rtk-validation/cad/types";
import { formatLotId, formatQuadraId, listProjectLots } from "./resolve";

export type CadAssistantQuadra = {
  id: string;
  area: number;
  quantidadeLotes: number;
  areaMedia: number;
  areaMin?: number;
  areaMax?: number;
  desvioPadrao?: number;
  coeficienteVariacao?: number;
};

export type CadAssistantLote = {
  id: string;
  quadra: string;
  area: number;
  testada: number;
  profundidade: number;
  tipo?: "INTERNO" | "ESQUINA";
};

export type CadAssistantNamedArea = {
  id: string;
  nome: string;
  area: number;
};

export type CadAssistantContext = {
  projeto: {
    nome: string;
    unidade: string;
    sistemaCoordenadas: string;
  };
  quadras: CadAssistantQuadra[];
  lotes: CadAssistantLote[];
  ruas: CadAssistantNamedArea[];
  areasInstitucionais: CadAssistantNamedArea[];
  areasVerdes: CadAssistantNamedArea[];
  restricoes: Array<CadAssistantNamedArea & { tipo: string }>;
  remanescenteM2: number;
};

function closedOnLayer(project: CadProject, layerId: string): CadPolylineEntity[] {
  return project.entities.filter(
    (entity): entity is CadPolylineEntity =>
      entity.type === "polyline" &&
      Boolean(entity.closed) &&
      entity.vertices.length >= 3 &&
      entity.layerId === layerId,
  );
}

function areaOf(entity: CadPolylineEntity): number {
  return computePolygonMetrics(entity.vertices, true).areaM2;
}

function namedAreas(project: CadProject, layerId: string): CadAssistantNamedArea[] {
  return closedOnLayer(project, layerId).map((entity) => ({
    id: entity.id,
    nome: entity.name?.trim() || layerId,
    area: Number(areaOf(entity).toFixed(2)),
  }));
}

/** Contexto resumido do loteamento — sem geometria bruta. */
export function buildCadContext(project: CadProject): CadAssistantContext {
  const summary = summarizeLoteamento(project);
  const lots = listProjectLots(project);
  const lotRowsById = new Map(summary.lotRows.map((row) => [row.name, row]));

  const lotes: CadAssistantLote[] = lots.map((lot) => {
    const row = lotRowsById.get(lot.entity.name?.trim() || lot.numero);
    return {
      id: formatLotId(lot),
      quadra: formatQuadraId(lot.quadra),
      area: Number((row?.areaM2 ?? areaOf(lot.entity)).toFixed(2)),
      testada: Number((row?.testadaM ?? lot.entity.lote?.testadaM ?? 0).toFixed(2)),
      profundidade: Number((row?.profundidadeM ?? lot.entity.lote?.profundidadeM ?? 0).toFixed(2)),
      tipo: row?.tipo ?? lot.entity.lote?.tipo,
    };
  });

  const quadras: CadAssistantQuadra[] = summary.quadras.map((row) => ({
    id: formatQuadraId(row.name),
    area: Number(row.areaM2.toFixed(2)),
    quantidadeLotes: row.lotCount,
    areaMedia: Number(row.areaMediaM2.toFixed(2)),
    areaMin: Number(row.areaMinM2.toFixed(2)),
    areaMax: Number(row.areaMaxM2.toFixed(2)),
    desvioPadrao: Number(row.desvioPadraoM2.toFixed(2)),
    coeficienteVariacao: Number(row.coeficienteVariacao.toFixed(4)),
  }));

  const verdes = namedAreas(project, AREA_RESERVA_LEGAL_LAYER_ID);
  const institucionais = namedAreas(project, "area_institucional");
  const app = namedAreas(project, AREA_APP_LAYER_ID);
  const remanescente = namedAreas(project, AREA_REMANESCENTE_LAYER_ID);

  return {
    projeto: {
      nome: project.name?.trim() || "CAD",
      unidade: "m / m²",
      sistemaCoordenadas: project.crs,
    },
    quadras,
    lotes,
    ruas: namedAreas(project, LOTEAMENTO_VIAS_LAYER_ID),
    areasInstitucionais: institucionais,
    areasVerdes: verdes,
    restricoes: [
      ...verdes.map((item) => ({ ...item, tipo: "area_verde" })),
      ...institucionais.map((item) => ({ ...item, tipo: "institucional" })),
      ...app.map((item) => ({ ...item, tipo: "faixa_ou_app" })),
    ],
    remanescenteM2: Number(remanescente.reduce((sum, item) => sum + item.area, 0).toFixed(2)),
  };
}
