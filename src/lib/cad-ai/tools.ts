import type { CadAiAction } from "@/lib/rtk-validation/cad/ai-command-types";

export const CAD_ASSISTANT_READ_ACTIONS = [
  "consultar_projeto",
  "consultar_quadras",
  "consultar_quadra",
  "consultar_lotes",
  "consultar_lote",
  "calcular_area",
  "calcular_testada",
  "calcular_area_remanescente",
  "validar_loteamento",
  "selecionar_objetos",
  "zoom_objeto",
  "renomear_quadra",
  "medir_area",
  "medir_perimetro",
  "medir_distancia",
  "mostrar_coordenadas",
] as const;

export const CAD_ASSISTANT_MUTATE_ACTIONS = [
  "otimizar_quadra",
  "ajustar_lote",
  "redistribuir_lotes",
  "gerar_loteamento",
  "subdividir_quadra",
  "reservar_area",
  "aplicar_alteracao",
] as const;

export const CAD_ASSISTANT_DESTRUCTIVE_ACTIONS = [
  "apagar",
  "gerar_loteamento",
  "reservar_area",
] as const;

const READ_SET = new Set<string>(CAD_ASSISTANT_READ_ACTIONS);
const MUTATE_SET = new Set<string>(CAD_ASSISTANT_MUTATE_ACTIONS);
const DESTRUCTIVE_SET = new Set<string>(CAD_ASSISTANT_DESTRUCTIVE_ACTIONS);

export function isReadOnlyAssistantAction(acao: string): boolean {
  return READ_SET.has(acao);
}

export function isMutatingAssistantAction(acao: string): boolean {
  return MUTATE_SET.has(acao) || DESTRUCTIVE_SET.has(acao);
}

export function isDestructiveAssistantAction(acao: string): boolean {
  return DESTRUCTIVE_SET.has(acao);
}

export function requiresConfirmation(acoes: string[]): boolean {
  return acoes.some((acao) => isMutatingAssistantAction(acao) && acao !== "aplicar_alteracao");
}

export function isApplyIntentAction(acao: string): boolean {
  return acao === "aplicar_alteracao";
}

export function isUndoIntentAction(acao: string): boolean {
  return acao === "desfazer_alteracao";
}

export type CadAssistantToolName =
  | "consultar_projeto"
  | "consultar_quadras"
  | "consultar_quadra"
  | "consultar_lotes"
  | "consultar_lote"
  | "calcular_area"
  | "calcular_testada"
  | "selecionar_objetos"
  | "otimizar_quadra"
  | "ajustar_lote"
  | "redistribuir_lotes"
  | "validar_loteamento"
  | "calcular_area_remanescente"
  | "aplicar_alteracao"
  | "desfazer_alteracao"
  | "zoom_objeto"
  | "renomear_quadra";

export const CAD_ASSISTANT_TOOL_NAMES: CadAssistantToolName[] = [
  "consultar_projeto",
  "consultar_quadras",
  "consultar_quadra",
  "consultar_lotes",
  "consultar_lote",
  "calcular_area",
  "calcular_testada",
  "selecionar_objetos",
  "otimizar_quadra",
  "ajustar_lote",
  "redistribuir_lotes",
  "validar_loteamento",
  "calcular_area_remanescente",
  "aplicar_alteracao",
  "desfazer_alteracao",
  "zoom_objeto",
  "renomear_quadra",
];

export function toCadAiAction(name: CadAssistantToolName): CadAiAction {
  return name as CadAiAction;
}
