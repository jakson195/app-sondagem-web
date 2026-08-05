import shpwrite from "@mapbox/shp-write";
import { CONTOUR_LAYER } from "./contour";
import { detectProjectUtmZone } from "./utm-zone";
import type { CadEntity, CadProject } from "./types";

function sirgas2000UtmPrj(zone: number): string {
  const lon0 = -183 + zone * 6;
  return `PROJCS["SIRGAS 2000 / UTM zone ${zone}S",GEOGCS["SIRGAS 2000",DATUM["SIRGAS_2000",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",${lon0}],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",10000000],UNIT["metre",1]]`;
}

function layerName(project: CadProject, layerId: string): string {
  return (project.layers.find((l) => l.id === layerId)?.name ?? "0").slice(0, 10);
}

function entityToFeatures(project: CadProject, entity: CadEntity): GeoJSON.Feature[] {
  const lyr = layerName(project, entity.layerId);

  if (entity.type === "point") {
    return [
      {
        type: "Feature",
        properties: {
          LAYER: lyr,
          LABEL: (entity.label ?? "").slice(0, 10),
          Z: Number(entity.z.toFixed(3)),
        },
        geometry: { type: "Point", coordinates: [entity.x, entity.y, entity.z] },
      },
    ];
  }

  if (entity.type === "line") {
    return [
      {
        type: "Feature",
        properties: { LAYER: lyr },
        geometry: {
          type: "LineString",
          coordinates: [
            [entity.start.x, entity.start.y, entity.start.z],
            [entity.end.x, entity.end.y, entity.end.z],
          ],
        },
      },
    ];
  }

  const coords = entity.vertices.map((v) => [v.x, v.y, v.z] as [number, number, number]);
  if (coords.length < 2) return [];

  const props: Record<string, string | number> = {
    LAYER: lyr,
    NAME: (entity.name ?? "").slice(0, 10),
  };
  if (entity.layerId === CONTOUR_LAYER.id) {
    props.COTA = Number((entity.vertices[0]?.z ?? 0).toFixed(3));
    props.MASTER = entity.contourMajor ? 1 : 0;
  }

  if (entity.closed && coords.length >= 3) {
    const ring = [...coords];
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
    return [
      {
        type: "Feature",
        properties: props,
        geometry: { type: "Polygon", coordinates: [ring] },
      },
    ];
  }

  return [
    {
      type: "Feature",
      properties: props,
      geometry: { type: "LineString", coordinates: coords },
    },
  ];
}

export function cadProjectToGeoJson(project: CadProject): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const entity of project.entities) {
    features.push(...entityToFeatures(project, entity));
  }
  return { type: "FeatureCollection", features };
}

export async function exportCadProjectShapefileZip(project: CadProject): Promise<ArrayBuffer> {
  const geojson = cadProjectToGeoJson(project);
  if (geojson.features.length === 0) {
    throw new Error("Nenhuma geometria para exportar.");
  }

  const utmZone = detectProjectUtmZone(project.entities);
  const zipBuffer = await shpwrite.zip<"arraybuffer">(geojson, {
    folder: project.name.replace(/[^\w\-]+/g, "_").slice(0, 40) || "cad_export",
    types: {
      point: "pontos",
      polygon: "poligonos",
      line: "linhas",
    },
    prj: sirgas2000UtmPrj(utmZone),
    compression: "DEFLATE",
    outputType: "arraybuffer",
  });

  return zipBuffer;
}
