/** Módulos configuráveis por obra (independentes do contrato da empresa). */
export const MODULOS_PROJETO = [
  "spt",
  "rotativa",
  "trado",
  "piezo",
  "resistividade",
  "geo",
  "relatorios",
  "digital_twin",
  "insar",
  "lidar",
] as const;

export type ModuloProjetoChave = (typeof MODULOS_PROJETO)[number];

export function isModuloProjetoChave(s: string): s is ModuloProjetoChave {
  return (MODULOS_PROJETO as readonly string[]).includes(s);
}

export const MODULO_PROJETO_META: Record<
  ModuloProjetoChave,
  { label: string; shortLabel: string }
> = {
  spt: { label: "Sondagem SPT", shortLabel: "SPT" },
  rotativa: { label: "Sondagem rotativa", shortLabel: "Rotativa" },
  trado: { label: "Sondagem trado", shortLabel: "Trado" },
  piezo: { label: "Poços / monitoramento", shortLabel: "Poços" },
  resistividade: { label: "Resistividade / geofísica", shortLabel: "Resistividade" },
  geo: { label: "GEO / mapas", shortLabel: "GEO" },
  relatorios: { label: "Relatórios", shortLabel: "Relatórios" },
  digital_twin: { label: "Digital Twin", shortLabel: "Twin" },
  insar: { label: "InSAR", shortLabel: "InSAR" },
  lidar: { label: "LiDAR", shortLabel: "LiDAR" },
};

/** Mapa inicial: todos ativos (comportamento ao criar obra sem payload). */
export function defaultModulosProjetoTodosAtivos(): Record<
  ModuloProjetoChave,
  boolean
> {
  return Object.fromEntries(
    MODULOS_PROJETO.map((k) => [k, true]),
  ) as Record<ModuloProjetoChave, boolean>;
}

export function modulosProjetoFromUnknown(
  input: unknown,
): Record<ModuloProjetoChave, boolean> | null {
  if (input === undefined) return null;
  if (typeof input !== "object" || input === null) return null;
  const o = input as Record<string, unknown>;
  const out = defaultModulosProjetoTodosAtivos();
  let any = false;
  for (const k of MODULOS_PROJETO) {
    if (k in o) {
      any = true;
      out[k] = Boolean(o[k]);
    }
  }
  if (!any) return null;
  return out;
}
