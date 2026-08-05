import type { CadVertex } from "./types";

export type MemorialKind =
  | "retificacao"
  | "desmembramento"
  | "demarcacao"
  | "unificacao"
  | "outro";

export interface MemorialDocInput {
  memorialKind: MemorialKind;
  memorialKindCustom?: string;
  registration: string;
  municipality: string;
  state: string;
  owner: string;
  crsLabel: string;
  projectionNote: string;
  appNote: string;
  lawFirmName: string;
  lawFirmCnpj: string;
  technicalName: string;
  technicalCrea: string;
  vertices: CadVertex[];
  vertexLabels?: string[];
}

export const DEFAULT_MEMORIAL_FOOTER = {
  crsLabel: "Sistema Geodésico Brasileiro Sirgas 2000",
  projectionNote: "plano de projeção UTM",
  appNote: "Não consta área de APP.",
  lawFirmName: "CAMARGO E BALISTA ADVOGADOS",
  lawFirmCnpj: "55.942.371/0001-84",
  technicalName: "ENGENHEIRO AGRIMENSOR JAKSON DA SILVA",
  technicalCrea: "CREA-SC n° 110.669-1",
} as const;

export const MEMORIAL_KIND_TITLE: Record<MemorialKind, string> = {
  retificacao: "retificação de área",
  desmembramento: "desmembramento de área",
  demarcacao: "demarcação",
  unificacao: "unificação de área",
  outro: "outro",
};

export const MEMORIAL_KIND_SECTION: Record<MemorialKind, string> = {
  retificacao: "DESCRIÇÃO DA SITUAÇÃO RETIFICADA",
  desmembramento: "DESCRIÇÃO DA SITUAÇÃO DESMEMBRADA",
  demarcacao: "DESCRIÇÃO DA DEMARCAÇÃO",
  unificacao: "DESCRIÇÃO DA UNIFICAÇÃO",
  outro: "DESCRIÇÃO DO PERÍMETRO",
};

export function memorialKindTitle(kind: MemorialKind, custom?: string): string {
  if (kind === "outro" && custom?.trim()) return custom.trim();
  return MEMORIAL_KIND_TITLE[kind];
}

export function memorialSectionTitle(kind: MemorialKind): string {
  return MEMORIAL_KIND_SECTION[kind];
}

export interface MemorialFormDefaults {
  memorialKind: MemorialKind;
  memorialKindCustom: string;
  registration: string;
  municipality: string;
  state: string;
  owner: string;
  appNote: string;
  crsLabel: string;
  projectionNote: string;
  lawFirmName: string;
  lawFirmCnpj: string;
  technicalName: string;
  technicalCrea: string;
  showFooter: boolean;
}

export const MEMORIAL_DEFAULTS_STORAGE_KEY = "datageo:cad-memorial-defaults";

export function defaultMemorialForm(): MemorialFormDefaults {
  return {
    memorialKind: "retificacao",
    memorialKindCustom: "",
    registration: "",
    municipality: "",
    state: "SC",
    owner: "",
    appNote: DEFAULT_MEMORIAL_FOOTER.appNote,
    crsLabel: DEFAULT_MEMORIAL_FOOTER.crsLabel,
    projectionNote: DEFAULT_MEMORIAL_FOOTER.projectionNote,
    lawFirmName: DEFAULT_MEMORIAL_FOOTER.lawFirmName,
    lawFirmCnpj: DEFAULT_MEMORIAL_FOOTER.lawFirmCnpj,
    technicalName: DEFAULT_MEMORIAL_FOOTER.technicalName,
    technicalCrea: DEFAULT_MEMORIAL_FOOTER.technicalCrea,
    showFooter: true,
  };
}

export function loadMemorialFormDefaults(): MemorialFormDefaults {
  if (typeof window === "undefined") return defaultMemorialForm();
  try {
    const raw = sessionStorage.getItem(MEMORIAL_DEFAULTS_STORAGE_KEY);
    if (!raw) return defaultMemorialForm();
    return { ...defaultMemorialForm(), ...JSON.parse(raw) };
  } catch {
    return defaultMemorialForm();
  }
}

export function saveMemorialFormDefaults(values: MemorialFormDefaults) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(MEMORIAL_DEFAULTS_STORAGE_KEY, JSON.stringify(values));
}
