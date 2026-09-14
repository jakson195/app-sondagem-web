import "server-only";

import { fetchWmsMap, type Bbox4326, type MapImageResult } from "./fetch-map-image";
import { SIGEF_I3GEO_OGC, type SigefLayerKey, sigefTema } from "./sigef-layers";

export async function fetchSigefMapImage(
  layers: SigefLayerKey[],
  uf: string,
  bbox: Bbox4326,
  width: number,
  height: number,
): Promise<MapImageResult | "empty" | null> {
  if (layers.length === 0) return "empty";

  for (const key of layers) {
    const tema = sigefTema(key, uf);
    const url = new URL(SIGEF_I3GEO_OGC);
    url.searchParams.set("tema", tema);
    const result = await fetchWmsMap(url.toString(), tema, bbox, width, height);
    if (result) return result;
  }

  return null;
}
