import { buildOdsBlob, buildOdsBytes, type OdsSheet } from "../ods-writer";
import { computePolygonMetrics, formatAzimuthDmsInt, vertexLabelsPn } from "./polygon-utils";
import { detectCadGeorefFromProject, enToLatLonGeoref, vertexToEn } from "./georef";
import type { MemorialFormDefaults } from "./memorial-types";
import type { CadPolylineEntity, CadProject } from "./types";

export type SigefExportOptions = {
  metodoPosicionamento?: string;
  tipoLimite?: string;
  sigmaM?: number;
  codigoImovel?: string;
  cns?: string;
  lado?: "externo" | "interno";
};

function vertexCode(label: string | undefined, index: number): string {
  const raw = (label ?? `P${index + 1}`).trim().toUpperCase().replace(/\s+/g, "");
  return raw.slice(0, 10) || `P${index + 1}`;
}

export function buildSigefOdsSheets(
  project: CadProject,
  polygon: CadPolylineEntity,
  memorial: MemorialFormDefaults,
  options: SigefExportOptions = {},
): { sheets: OdsSheet[]; title: string } {
  const georef = detectCadGeorefFromProject(project);
  const labels = vertexLabelsPn(polygon.vertices.length);
  const metrics = computePolygonMetrics(polygon.vertices, true, labels);
  const metodo = options.metodoPosicionamento?.trim() || "RTK";
  const tipoLimite = options.tipoLimite?.trim() || "Convencional";
  const sigma = options.sigmaM ?? 0.05;
  const lado = options.lado ?? "externo";
  const denom = polygon.name?.trim() || project.name || "Parcela";
  const confrontations = polygon.confrontations ?? [];

  const identificacao: (string | number)[][] = [
    ["Campo", "Valor"],
    ["Natureza do serviço", "Georreferenciamento de imóvel rural"],
    ["Denominação", denom],
    ["Parcela", "1"],
    ["Detentor", memorial.owner],
    ["Município", memorial.municipality],
    ["UF", memorial.state],
    ["Matrícula", memorial.registration],
    ["CNS", options.cns?.trim() || ""],
    ["Código do imóvel (SNCR/INCRA)", options.codigoImovel?.trim() || ""],
    ["Responsável técnico", memorial.technicalName],
    ["CREA", memorial.technicalCrea],
    ["Sistema geodésico", "SIRGAS 2000"],
    ["Projeção", georef.utmProjectionLabel],
    ["Fuso UTM", georef.utmZone],
    ["EPSG UTM", georef.utmEpsg],
    ["Área (m²)", Number(metrics.areaM2.toFixed(4))],
    ["Área (ha)", Number(metrics.areaHa.toFixed(4))],
    ["Perímetro (m)", Number(metrics.perimeterM.toFixed(4))],
    ["Método de posicionamento (padrão)", metodo],
    ["Tipo de limite (padrão)", tipoLimite],
    ["Sigma plano (m)", sigma],
    [
      "Observação",
      "Planilha gerada pelo DataGeo CAD para conferência. Para certificação no SIGEF, copie os dados para a planilha modelo oficial e valide com a extensão LibreOffice (sigef.incra.gov.br).",
    ],
  ];

  const perimetro: (string | number)[][] = [
    [
      "Denominação",
      "Parcela",
      "Lado",
      "Vértice",
      "E (m)",
      "N (m)",
      "Longitude",
      "Latitude",
      "h (m)",
      "sigma_E (m)",
      "sigma_N (m)",
      "sigma_h (m)",
      "Método posicionamento",
      "Tipo de limite",
      "Confrontante (descritivo)",
      "Azimute vante",
      "Distância vante (m)",
    ],
  ];

  polygon.vertices.forEach((v, i) => {
    const { e, n } = vertexToEn(v, georef);
    const ll = enToLatLonGeoref(e, n, georef);
    const seg = metrics.segments[i];
    perimetro.push([
      denom,
      1,
      lado,
      vertexCode(labels[i], i),
      Number(e.toFixed(3)),
      Number(n.toFixed(3)),
      Number(ll.lon.toFixed(8)),
      Number(ll.lat.toFixed(8)),
      Number(v.z.toFixed(3)),
      sigma,
      sigma,
      sigma,
      metodo,
      tipoLimite,
      (confrontations[i] ?? "").trim(),
      seg ? formatAzimuthDmsInt(seg.azimuthDeg) : "",
      seg ? Number(seg.distance.toFixed(3)) : "",
    ]);
  });

  const limites: (string | number)[][] = [
    ["De", "Para", "Azimute", "Distância (m)", "Confrontante"],
    ...metrics.segments.map((seg, i) => [
      seg.fromLabel,
      seg.toLabel,
      formatAzimuthDmsInt(seg.azimuthDeg),
      Number(seg.distance.toFixed(3)),
      (confrontations[i] ?? "").trim(),
    ]),
  ];

  return {
    title: `SIGEF ${denom}`,
    sheets: [
      { name: "Identificacao", rows: identificacao },
      { name: "Perimetro", rows: perimetro },
      { name: "Limites", rows: limites },
    ],
  };
}

export function buildSigefOdsBytes(
  project: CadProject,
  polygon: CadPolylineEntity,
  memorial: MemorialFormDefaults,
  options: SigefExportOptions = {},
): Uint8Array {
  const { sheets, title } = buildSigefOdsSheets(project, polygon, memorial, options);
  return buildOdsBytes(sheets, title);
}

export function buildSigefOdsBlob(
  project: CadProject,
  polygon: CadPolylineEntity,
  memorial: MemorialFormDefaults,
  options: SigefExportOptions = {},
): Blob {
  const { sheets, title } = buildSigefOdsSheets(project, polygon, memorial, options);
  return buildOdsBlob(sheets, title);
}

export function sigefOdsFilename(project: CadProject, polygon: CadPolylineEntity): string {
  const base = (polygon.name ?? project.name ?? "parcela").replace(/[^\w\-]+/g, "_").slice(0, 60);
  return `${base}_SIGEF.ods`;
}
