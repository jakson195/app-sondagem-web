import type { CadPendingAction } from "./pending-action";

export type CadConversationState = {
  conversationId: string;
  quadraAtual: string | null;
  loteAtual: string | null;
  areaAlvo: number | null;
  preservarRuas: boolean;
  exigirAcesso: boolean;
  resumo: string;
  projectName: string;
  lotCount: number;
  lastContextLevel: number;
  pendingIntent: string | null;
  pendingEntity: string | null;
  pendingAction: CadPendingAction | null;
};

const sessions = new Map<string, CadConversationState>();

export function resetCadConversationState(conversationId?: string): void {
  if (conversationId) {
    sessions.delete(conversationId);
    return;
  }
  sessions.clear();
}

export function getCadConversationState(conversationId?: string): CadConversationState | null {
  if (!conversationId) return null;
  return sessions.get(conversationId) ?? null;
}

export function upsertCadConversationState(
  conversationId: string | undefined,
  patch: Partial<CadConversationState>,
): CadConversationState | null {
  if (!conversationId) return null;
  const prev = sessions.get(conversationId) ?? {
    conversationId,
    quadraAtual: null,
    loteAtual: null,
    areaAlvo: null,
    preservarRuas: true,
    exigirAcesso: true,
    resumo: "",
    projectName: "",
    lotCount: 0,
    lastContextLevel: 0,
    pendingIntent: null,
    pendingEntity: null,
    pendingAction: null,
  };
  const next: CadConversationState = { ...prev, ...patch, conversationId };
  sessions.set(conversationId, next);
  return next;
}

export function invalidateCadConversation(
  conversationId: string | undefined,
  scope: { lote?: string; quadra?: string; project?: boolean },
): void {
  if (!conversationId) return;
  const state = sessions.get(conversationId);
  if (!state) return;
  if (scope.project) {
    sessions.set(conversationId, {
      ...state,
      resumo: "",
      lotCount: 0,
      lastContextLevel: 0,
    });
    return;
  }
  if (scope.lote && state.loteAtual && sameRef(state.loteAtual, scope.lote)) {
    state.loteAtual = scope.lote;
  }
  if (scope.quadra && state.quadraAtual && sameRef(state.quadraAtual, scope.quadra)) {
    state.quadraAtual = scope.quadra;
  }
}

function sameRef(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function conversationSummary(state: CadConversationState | null): Record<string, unknown> | undefined {
  if (!state) return undefined;
  const out: Record<string, unknown> = {};
  if (state.quadraAtual) out.quadra = state.quadraAtual;
  if (state.loteAtual) out.lote = state.loteAtual;
  if (state.areaAlvo != null) out.areaAlvo = state.areaAlvo;
  if (state.preservarRuas) out.preservarRuas = true;
  if (state.exigirAcesso) out.exigirAcesso = true;
  if (state.resumo) out.resumo = state.resumo.slice(0, 160);
  if (state.pendingIntent) out.pendingIntent = state.pendingIntent;
  if (state.pendingAction) {
    if (state.pendingAction.type === "pending_modify") {
      out.pendingAction = {
        type: state.pendingAction.type,
        action: state.pendingAction.action,
        missing: state.pendingAction.missing,
        lote: state.pendingAction.lote,
      };
    } else {
      out.pendingAction = {
        type: state.pendingAction.type,
        targetLot:
          state.pendingAction.type === "confirm_redistribution"
            ? state.pendingAction.targetLot
            : state.pendingAction.previous.targetLot,
        targetArea:
          state.pendingAction.type === "confirm_redistribution"
            ? state.pendingAction.targetArea
            : state.pendingAction.previous.targetArea,
      };
    }
  }
  return Object.keys(out).length ? out : undefined;
}
