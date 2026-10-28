export { buildCadContext } from "./context";
export type { CadAssistantContext } from "./context";
export {
  parseLoteamentoAssistantCommand,
  parseLoteamentoFollowUp,
  isConfirmPhrase,
  isCancelPhrase,
  isUndoPhrase,
  isGreetingPhrase,
} from "./parse";
export {
  isAffirmativeResponse,
  isNegativeResponse,
  resolvePendingUserMessage,
  createRedistributionPending,
  createTopicSwitchPending,
  isCadPendingAction,
} from "./pending-action";
export type { CadPendingAction, CadPendingRedistribution, CadPendingTopicSwitch, CadPendingModify } from "./pending-action";
export {
  isReadOnlyAssistantAction,
  isMutatingAssistantAction,
  isDestructiveAssistantAction,
  requiresConfirmation,
  isApplyIntentAction,
  isUndoIntentAction,
  CAD_ASSISTANT_TOOL_NAMES,
} from "./tools";
export { logCadAi } from "./log";
export { cadCommandRouter } from "./command-router";
export { classifyCadIntent, validateIntent, validateCadCommand, commandFromIntent, detectCadEntity } from "./intent";
export { buildMinimalCadContext, compactCadContext, detectCadContextLevel } from "./minimal-context";
export { getCadAiCostMetrics, resetCadAiCostMetrics } from "./cost-metrics";
export { getCadConversationState, resetCadConversationState } from "./conversation-state";
export { getCadContextCache, invalidateCadContextCache, resetCadContextCache } from "./context-cache";
export { cloneCadProject, pushUndo, popUndo } from "./session";
export type { CadAssistantPending, CadAssistantUndoEntry } from "./session";
export {
  consultarProjeto,
  consultarQuadras,
  consultarQuadra,
  consultarLotes,
  consultarLote,
  calcularTestada,
  calcularAreaRemanescente,
  otimizarQuadra,
  ajustarLote,
  redistribuirLotes,
  executeRedistributionPending,
  countChangedLots,
  analisarLoteamento,
  paramsFromCommand,
  renomearQuadra,
} from "./execute";
export { resolveQuadraRef, resolveLotRef, formatQuadraId, formatLotId } from "./resolve";
export { validarLoteamento, formatValidacao } from "./validate";
