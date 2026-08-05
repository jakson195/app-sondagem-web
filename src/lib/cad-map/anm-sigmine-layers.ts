/** Camadas SIGMINE/ANM — dados abertos e MapServer oficial. */

export const ANM_DADOS_ABERTOS_BASE =
  "https://dadosabertos.anm.gov.br/SIGMINE/PROCESSOS_MINERARIOS";

export const ANM_SIGMINE_MAPSERVER =
  "https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/dados_anm/MapServer";

export const ANM_SIGMINE_WMS = `${ANM_SIGMINE_MAPSERVER.replace("/rest/", "/")}/WMSServer`;

export type AnmSigmineLayerKey =
  | "processos"
  | "protecaoFonte"
  | "arrendamentos"
  | "bloqueio"
  | "reservasGarimpeiras";

export const ANM_SIGMINE_LAYER_KEYS: AnmSigmineLayerKey[] = [
  "processos",
  "protecaoFonte",
  "arrendamentos",
  "bloqueio",
  "reservasGarimpeiras",
];

export type AnmSigmineLayerDef = {
  key: AnmSigmineLayerKey;
  /** ID no MapServer ANM (0–4). */
  mapLayerId: string;
  /** Camada CAD bloqueada para importação vetorial. */
  cadLayerId: string;
  /** Nome legível da camada. */
  label: string;
  color: string;
  /** Campos ArcGIS Query. */
  outFields: string;
  /** URL shapefile ZIP (dados abertos ANM). */
  shpZipUrl: string;
};

export const ANM_SIGMINE_LAYERS: Record<AnmSigmineLayerKey, AnmSigmineLayerDef> = {
  processos: {
    key: "processos",
    mapLayerId: "0",
    cadLayerId: "anm_processos",
    label: "Processos minerários ativos",
    color: "#f97316",
    outFields: "PROCESSO,NOME,FASE,SUBS,UF,AREA_HA,USO",
    shpZipUrl: `${ANM_DADOS_ABERTOS_BASE}/BRASIL.zip`,
  },
  protecaoFonte: {
    key: "protecaoFonte",
    mapLayerId: "1",
    cadLayerId: "anm_protecao_fonte",
    label: "Áreas de proteção de fonte",
    color: "#06b6d4",
    outFields: "PROCESSO,NUMERO,ANO,AREA_HA",
    shpZipUrl: "https://dadosabertos.anm.gov.br/SIGMINE/PROTECAO_FONTE.zip",
  },
  arrendamentos: {
    key: "arrendamentos",
    mapLayerId: "2",
    cadLayerId: "anm_arrendamentos",
    label: "Arrendamentos",
    color: "#a855f7",
    outFields: "PROCESSO,NOME,FASE,SUBS,UF,AREA_HA",
    shpZipUrl: "https://dadosabertos.anm.gov.br/SIGMINE/ARRENDAMENTO.zip",
  },
  bloqueio: {
    key: "bloqueio",
    mapLayerId: "3",
    cadLayerId: "anm_bloqueio",
    label: "Áreas de bloqueio",
    color: "#ef4444",
    outFields: "PROCESSO,NOME,AREA_HA,UF",
    shpZipUrl: "https://dadosabertos.anm.gov.br/SIGMINE/BLOQUEIO.zip",
  },
  reservasGarimpeiras: {
    key: "reservasGarimpeiras",
    mapLayerId: "4",
    cadLayerId: "anm_reservas_garimpeiras",
    label: "Reservas garimpeiras",
    color: "#eab308",
    outFields: "PROCESSO,NOME,AREA_HA,UF",
    shpZipUrl: "https://dadosabertos.anm.gov.br/SIGMINE/RESERVAS_GARIMPEIRAS.zip",
  },
};

/** @deprecated use ANM_SIGMINE_LAYERS.processos.mapLayerId */
export const ANM_SIGMINE_LAYER_ID = ANM_SIGMINE_LAYERS.processos.mapLayerId;

/** @deprecated use ANM_SIGMINE_LAYERS.processos.mapLayerId */
export const ANM_SIGMINE_LAYERS_LEGACY = ANM_SIGMINE_LAYER_ID;

/** @deprecated use query URL for processos layer */
export const ANM_QUERY_LAYER = `${ANM_SIGMINE_MAPSERVER}/${ANM_SIGMINE_LAYERS.processos.mapLayerId}`;

export type AnmSigmineOverlayState = Record<AnmSigmineLayerKey, boolean>;

export const DEFAULT_ANM_SIGMINE_OVERLAY: AnmSigmineOverlayState = {
  processos: false,
  protecaoFonte: false,
  arrendamentos: false,
  bloqueio: false,
  reservasGarimpeiras: false,
};

export function anyAnmSigmineOverlay(active: AnmSigmineOverlayState): boolean {
  return ANM_SIGMINE_LAYER_KEYS.some((key) => active[key]);
}

export function activeAnmMapLayerIds(active: AnmSigmineOverlayState): string[] {
  return ANM_SIGMINE_LAYER_KEYS.filter((key) => active[key]).map(
    (key) => ANM_SIGMINE_LAYERS[key].mapLayerId,
  );
}

export function parseAnmMapLayerIds(raw: string | null): string[] {
  if (!raw?.trim()) return [ANM_SIGMINE_LAYERS.processos.mapLayerId];
  const allowed = new Set(
    ANM_SIGMINE_LAYER_KEYS.map((key) => ANM_SIGMINE_LAYERS[key].mapLayerId),
  );
  const ids = raw
    .split(",")
    .map((part) => part.trim())
    .filter((id) => allowed.has(id));
  return ids.length > 0 ? ids : [ANM_SIGMINE_LAYERS.processos.mapLayerId];
}

export function anmQueryLayerUrl(mapLayerId: string): string {
  return `${ANM_SIGMINE_MAPSERVER}/${mapLayerId}`;
}

export function isAnmSigmineLayerKey(value: string): value is AnmSigmineLayerKey {
  return (ANM_SIGMINE_LAYER_KEYS as string[]).includes(value);
}
