declare module "shpjs" {
  type ShpFeatureCollection = {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      geometry: { type: string; coordinates: unknown } | null;
      properties?: Record<string, unknown> | null;
    }>;
  };

  function shp(data: ArrayBuffer | string | object): Promise<ShpFeatureCollection | ShpFeatureCollection[]>;
  export default shp;
}
