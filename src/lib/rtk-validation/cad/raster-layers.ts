import type { CadLayer, CadProject, CadRasterKind, CadRasterOverlay } from "./types";

export const HYPSOMETRIC_LAYER: CadLayer = {
  id: "hypsometric",
  name: "MAPA_HIPSOMETRICO",
  color: "#059669",
  visible: true,
  locked: true,
};

export const ORTHOPHOTO_LAYER: CadLayer = {
  id: "orthophoto",
  name: "ORTOFOTO",
  color: "#22c55e",
  visible: true,
  locked: true,
};

const RASTER_LAYER_BY_KIND: Record<CadRasterKind, CadLayer> = {
  hypsometric: HYPSOMETRIC_LAYER,
  orthophoto: ORTHOPHOTO_LAYER,
};

export function rasterLayerId(kind: CadRasterKind): string {
  return RASTER_LAYER_BY_KIND[kind].id;
}

export function ensureRasterLayerInProject(project: CadProject, kind: CadRasterKind): CadProject {
  const layer = RASTER_LAYER_BY_KIND[kind];
  if (project.layers.some((l) => l.id === layer.id)) return project;
  return { ...project, layers: [...project.layers, { ...layer }] };
}

export function removeRasterLayerFromProject(project: CadProject, kind: CadRasterKind): CadProject {
  const id = rasterLayerId(kind);
  return { ...project, layers: project.layers.filter((l) => l.id !== id) };
}

/** Aplica visibilidade das camadas raster ao renderizar overlays. */
export function rastersWithLayerVisibility(
  rasters: CadRasterOverlay[],
  layers: CadLayer[],
): CadRasterOverlay[] {
  const visibility = new Map(layers.map((l) => [l.id, l.visible]));
  return rasters.map((r) => {
    const layerId = rasterLayerId(r.kind);
    const layerVisible = visibility.get(layerId);
    if (layerVisible === undefined) return r;
    return { ...r, visible: layerVisible };
  });
}

/** Visibilidade raster independente para o layout de impressão. */
export function rastersWithPrintLayerVisibility(
  rasters: CadRasterOverlay[],
  layerVisibility: Record<string, boolean>,
): CadRasterOverlay[] {
  return rasters.map((r) => {
    const layerId = rasterLayerId(r.kind);
    const visible = layerVisibility[layerId] !== false;
    return { ...r, visible };
  });
}

export function countRasterLayerItems(
  layerId: string,
  rasters: CadRasterOverlay[],
): number | null {
  if (layerId === HYPSOMETRIC_LAYER.id) {
    return rasters.some((r) => r.kind === "hypsometric") ? 1 : 0;
  }
  if (layerId === ORTHOPHOTO_LAYER.id) {
    return rasters.some((r) => r.kind === "orthophoto") ? 1 : 0;
  }
  return null;
}
