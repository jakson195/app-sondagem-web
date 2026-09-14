import type { DemElevationSource } from "@/lib/geofisica/geodata/fetch-elevation-dem";
import {
  enToLatLonGeoref,
  latLonToVertexGeoref,
  vertexToEn,
  viewportBbox4326GeorefSafe,
  type CadGeorefContext,
} from "./georef";
import { isBboxInBrazil, isViewportSmallEnoughForImport } from "./map-bbox";
import { generateContoursFromGrid, type ContourGenerationResult } from "./contour";
import type { CadViewport } from "./viewport";

export type DemContourOptions = {
  interval: number;
  gridCols?: number;
  gridRows?: number;
  gridSmoothPasses?: number;
  lineSmoothIterations?: number;
  /** google = Google Earth/Maps; opentopo = SRTM 30 m; auto = Google se configurado */
  elevationSource?: DemElevationSource;
};

export type DemContourResult = ContourGenerationResult & {
  demSource: string;
  demDataset: string;
  gridCols: number;
  gridRows: number;
};

const MAX_DEM_SPAN_M = 25_000;

export type DemGridNode = {
  lat: number;
  lng: number;
  i: number;
  j: number;
  x: number;
  y: number;
};

/** Resolução da grelha DEM conforme extensão da área e fonte de cotas. */
export function demGridSizeForViewport(
  viewport: Pick<CadViewport, "minX" | "maxX" | "minY" | "maxY">,
  elevationSource: DemElevationSource = "opentopo",
) {
  const spanX = Math.abs(viewport.maxX - viewport.minX);
  const spanY = Math.abs(viewport.maxY - viewport.minY);
  const useGoogleGrid = elevationSource === "google" || elevationSource === "auto";
  // Google: ~50 m/célula, até 40×40 (1600 pts — limite Elevation API)
  // OpenTopo: ~120 m/célula, até 35×35 (rate limit OpenTopoData)
  const targetCellM = useGoogleGrid ? 50 : 120;
  const maxDim = useGoogleGrid ? 40 : 35;
  const minDim = useGoogleGrid ? 24 : 18;
  const cols = Math.min(maxDim, Math.max(minDim, Math.round(spanX / targetCellM)));
  const rows = Math.min(maxDim, Math.max(minDim, Math.round(spanY / targetCellM)));
  return { cols, rows };
}

export function isViewportSmallEnoughForDemContours(
  viewport: Pick<CadViewport, "minX" | "maxX" | "minY" | "maxY">,
): boolean {
  if (!isViewportSmallEnoughForImport(viewport)) return false;
  const spanX = Math.abs(viewport.maxX - viewport.minX);
  const spanY = Math.abs(viewport.maxY - viewport.minY);
  return spanX <= MAX_DEM_SPAN_M && spanY <= MAX_DEM_SPAN_M;
}

/**
 * Grelha georreferenciada nos cantos do viewport CAD.
 * j=0 → sul (minY), j=rows-1 → norte (maxY) — alinhado com d3-contour e Mapbox.
 */
export function buildDemGridNodes(
  viewport: CadViewport,
  georef: CadGeorefContext,
  cols: number,
  rows: number,
): DemGridNode[] {
  const bbox = viewportBbox4326GeorefSafe(viewport, georef);
  if (!bbox || !isBboxInBrazil(bbox)) {
    throw new Error("Área fora do Brasil ou viewport inválido para DEM.");
  }

  const corners = [
    { x: viewport.minX, y: viewport.minY },
    { x: viewport.maxX, y: viewport.minY },
    { x: viewport.maxX, y: viewport.maxY },
    { x: viewport.minX, y: viewport.maxY },
  ];

  const cornerLl = corners.map((c) => {
    const { e, n } = vertexToEn({ x: c.x, y: c.y, z: 0 }, georef);
    return enToLatLonGeoref(e, n, georef);
  });

  const nodes: DemGridNode[] = [];
  for (let j = 0; j < rows; j++) {
    const v = rows > 1 ? j / (rows - 1) : 0;
    for (let i = 0; i < cols; i++) {
      const u = cols > 1 ? i / (cols - 1) : 0;
      const lat =
        (1 - u) * (1 - v) * cornerLl[0]!.lat +
        u * (1 - v) * cornerLl[1]!.lat +
        u * v * cornerLl[2]!.lat +
        (1 - u) * v * cornerLl[3]!.lat;
      const lng =
        (1 - u) * (1 - v) * cornerLl[0]!.lon +
        u * (1 - v) * cornerLl[1]!.lon +
        u * v * cornerLl[2]!.lon +
        (1 - u) * v * cornerLl[3]!.lon;
      const vertex = latLonToVertexGeoref(lat, lng, 0, georef);
      nodes.push({ lat, lng, i, j, x: vertex.x, y: vertex.y });
    }
  }
  return nodes;
}

async function fetchDemElevationsForGrid(
  nodes: DemGridNode[],
  elevationSource: DemElevationSource = "auto",
) {
  const res = await fetch("/api/cad-map/elevation-grid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locations: nodes.map((s) => ({ lat: s.lat, lng: s.lng })),
      source: elevationSource,
    }),
  });

  const data = (await res.json()) as {
    ok?: boolean;
    points?: { lat: number; lng: number; elevationM: number | null }[];
    source?: string;
    dataset?: string;
    error?: string;
    detail?: string;
  };

  if (!res.ok || !data.ok || !data.points?.length) {
    const msg = [data.error, data.detail].filter(Boolean).join(" — ");
    throw new Error(msg || "Falha ao obter cotas DEM do mapa.");
  }

  return {
    points: data.points,
    source: data.source ?? "DEM",
    dataset: data.dataset ?? "SRTM",
  };
}

/** Gera curvas de nível a partir do DEM global (SRTM 30 m) na área visível. */
export async function generateContoursFromDem(
  viewport: CadViewport,
  georef: CadGeorefContext,
  options: DemContourOptions,
): Promise<DemContourResult> {
  if (!georef.isGeoreferenced) {
    throw new Error("Importe pontos georreferenciados ou enquadre a área em coordenadas UTM.");
  }
  if (!isViewportSmallEnoughForDemContours(viewport)) {
    throw new Error("Aproxime o zoom — área máxima ~25 km para curvas DEM (SRTM 30 m).");
  }

  const interval = options.interval;
  if (!Number.isFinite(interval) || interval <= 0) {
    throw new Error("Intervalo de curvas deve ser maior que zero.");
  }

  const elevationSource = options.elevationSource ?? "opentopo";
  const { cols, rows } =
    options.gridCols && options.gridRows
      ? { cols: options.gridCols, rows: options.gridRows }
      : demGridSizeForViewport(viewport, elevationSource);

  const nodes = buildDemGridNodes(viewport, georef, cols, rows);
  const dem = await fetchDemElevationsForGrid(nodes, elevationSource);

  const values = new Float64Array(cols * rows);
  const nodeX = new Float64Array(cols * rows);
  const nodeY = new Float64Array(cols * rows);
  let valid = 0;

  for (let idx = 0; idx < nodes.length; idx++) {
    const node = nodes[idx]!;
    nodeX[node.i + node.j * cols] = node.x;
    nodeY[node.i + node.j * cols] = node.y;

    const elev = dem.points[idx]?.elevationM;
    if (elev == null || !Number.isFinite(elev)) {
      values[node.i + node.j * cols] = NaN;
      continue;
    }
    values[node.i + node.j * cols] = elev;
    valid += 1;
  }

  if (valid < Math.max(12, Math.round((cols * rows) * 0.35))) {
    throw new Error("Poucas cotas DEM válidas — tente outra área ou aproxime o zoom.");
  }

  const result = generateContoursFromGrid(
    values,
    cols,
    rows,
    viewport.minX,
    viewport.maxX,
    viewport.minY,
    viewport.maxY,
    interval,
    {
      pointCount: valid,
      gridSmoothPasses: options.gridSmoothPasses,
      lineSmoothIterations: options.lineSmoothIterations,
      nodeX,
      nodeY,
    },
  );

  return {
    ...result,
    demSource: dem.source,
    demDataset: dem.dataset,
    gridCols: cols,
    gridRows: rows,
  };
}
