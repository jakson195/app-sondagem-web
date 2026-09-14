/** Camadas SIGEF/INCRA — Acervo Fundiário (i3geo OGC). */

export const SIGEF_I3GEO_OGC = "https://acervofundiario.incra.gov.br/i3geo/ogc.php";

export const SIGEF_PORTAL = "https://sigef.incra.gov.br";
export const SIGEF_CONSULTA = "https://sigef.incra.gov.br/consultar/parcelas/";
export const SIGEF_MODELO_ODS = "https://sigef.incra.gov.br/static/sigef_planilha_modelo_1.4_rc5.ods";
export const SIGEF_EXTENSAO_OXT = "https://sigef.incra.gov.br/static/sigef_extensao_1.2_rc2.oxt";

export const SIGEF_UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA",
  "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
  "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

export type SigefUf = (typeof SIGEF_UFS)[number];

export type SigefLayerKey = "particular" | "publico";

export const SIGEF_LAYER_KEYS: SigefLayerKey[] = ["particular", "publico"];

export type SigefLayerDef = {
  key: SigefLayerKey;
  cadLayerId: string;
  label: string;
  color: string;
  temaPrefix: string;
};

export const SIGEF_LAYERS: Record<SigefLayerKey, SigefLayerDef> = {
  particular: {
    key: "particular",
    cadLayerId: "sigef_particular",
    label: "Parcelas certificadas (particular)",
    color: "#16a34a",
    temaPrefix: "certificada_sigef_particular",
  },
  publico: {
    key: "publico",
    cadLayerId: "sigef_publico",
    label: "Parcelas certificadas (público)",
    color: "#2563eb",
    temaPrefix: "certificada_sigef_publico",
  },
};

export type SigefOverlayState = {
  particular: boolean;
  publico: boolean;
  uf: string;
};

export const DEFAULT_SIGEF_OVERLAY: SigefOverlayState = {
  particular: false,
  publico: false,
  uf: "SC",
};

export function isSigefLayerKey(value: string | null | undefined): value is SigefLayerKey {
  return value === "particular" || value === "publico";
}

export function isSigefUf(value: string | null | undefined): value is SigefUf {
  return Boolean(value && (SIGEF_UFS as readonly string[]).includes(value.toUpperCase()));
}

export function normalizeSigefUf(value: string | null | undefined, fallback = "SC"): string {
  const uf = value?.trim().toUpperCase() ?? "";
  return isSigefUf(uf) ? uf : fallback;
}

export function sigefTema(kind: SigefLayerKey, uf: string): string {
  const def = SIGEF_LAYERS[kind];
  return `${def.temaPrefix}_${normalizeSigefUf(uf).toLowerCase()}`;
}

export function anySigefOverlay(state: SigefOverlayState): boolean {
  return state.particular || state.publico;
}

export function activeSigefLayerKeys(state: SigefOverlayState): SigefLayerKey[] {
  return SIGEF_LAYER_KEYS.filter((key) => state[key]);
}

export function parseSigefMapLayerKeys(raw: string | null | undefined): SigefLayerKey[] {
  if (!raw?.trim()) return ["particular"];
  const keys = raw
    .split(",")
    .map((part) => part.trim())
    .filter(isSigefLayerKey);
  return keys.length ? keys : ["particular"];
}
