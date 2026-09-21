/** Chaves de módulos para `EmpresaModulo` e gates na UI/API. */
export const MODULOS_PLATAFORMA = [
  "spt",
  "geo",
  "ves",
  "rotativa",
  "trado",
  "piezo",
  "relatorios",
  "digital_twin",
  "insar",
  "lidar",
] as const;

export type ModuloPlataformaChave = (typeof MODULOS_PLATAFORMA)[number];

export function isModuloPlataformaChave(s: string): s is ModuloPlataformaChave {
  return (MODULOS_PLATAFORMA as readonly string[]).includes(s);
}

/** Rótulos para UI / relatórios. */
export const MODULO_ROTULO: Record<ModuloPlataformaChave, string> = {
  spt: "Sondagem SPT",
  geo: "GEO / mapas",
  ves: "Geofísica (VES)",
  rotativa: "Sondagem rotativa",
  trado: "Sondagem trado",
  piezo: "Poços / piezometria",
  relatorios: "Relatórios",
  digital_twin: "Digital Twin",
  insar: "InSAR",
  lidar: "LiDAR",
};
