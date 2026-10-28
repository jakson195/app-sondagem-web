"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isApplyIntentAction,
  isCancelPhrase,
  isConfirmPhrase,
  isDestructiveAssistantAction,
  isMutatingAssistantAction,
  isUndoIntentAction,
  isUndoPhrase,
  logCadAi,
  paramsFromCommand,
  cloneCadProject,
  popUndo,
  pushUndo,
  validateCadCommand,
  executeRedistributionPending,
  isCadPendingAction,
  resolvePendingUserMessage,
  createTopicSwitchPending,
  type CadAssistantPending,
  type CadAssistantUndoEntry,
  type CadPendingAction,
} from "@/lib/cad-ai";
import {
  cancelPendingMessage,
  logPendingAction,
  pendingRedistributionOf,
  pendingStillOpenMessage,
  topicSwitchQuestion,
  understoodRedistribution,
} from "@/lib/cad-ai/pending-action";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import { buildCadAiContext } from "@/lib/rtk-validation/cad/ai-context";
import { resolveCadAiCommands } from "@/lib/rtk-validation/cad/ai-command-resolver";
import { validateCadAiCommands } from "@/lib/rtk-validation/cad/ai-command-validator";
import { parseLocalCadCommand, parseLocalCadCommandChain } from "@/lib/rtk-validation/cad/local-command-parser";
import { importKmzIntoProject } from "@/lib/rtk-validation/cad/ai-command-executor";
import { executeCadAiCommandChain } from "@/lib/rtk-validation/cad/ai-interpreter";
import type {
  CadAiCommand,
  CadAiHistoryMessage,
  CadAiSideEffect,
  CadCommandExecutionResult,
} from "@/lib/rtk-validation/cad/ai-command-types";
import type { CadEntity, CadProject } from "@/lib/rtk-validation/cad/types";
import { listClosedPolygons } from "@/lib/rtk-validation/cad/polygon-utils";
import type { MemorialFormDefaults } from "@/lib/rtk-validation/cad/memorial-types";
import { useCadSpeech } from "@/hooks/use-cad-speech";

export interface CadAiChatProps {
  project: CadProject;
  selectedId: string | null;
  selectedVertexIndex?: number | null;
  selectedSegmentIndex?: number | null;
  memorialForm: MemorialFormDefaults;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectChange: (project: CadProject) => void;
  onSelectedIdChange: (id: string | null) => void;
  onSideEffect: (effect: CadAiSideEffect) => void;
  hideLauncher?: boolean;
  onPreviewEntities?: (entities: CadEntity[]) => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  timestamp: number;
  actions?: string[];
}

const ACCEPT_FILES = ".csv,.txt,.xlsx,.xls,.dxf,.geojson,.json,.kml,.kmz,.shp,.tif,.tiff,.ecw";
const HISTORY_KEY_PREFIX = "datageo:assistente-ia:";
const CONVERSATION_ID_KEY = "datageo:cad-ai-conversation";
const PENDING_KEY_PREFIX = "datageo:cad-ai-pending:";

function getOrCreateConversationId(): string {
  if (typeof window === "undefined") return "cad-ai";
  const existing = sessionStorage.getItem(CONVERSATION_ID_KEY);
  if (existing) return existing;
  const id = `cad_${Date.now().toString(36)}`;
  sessionStorage.setItem(CONVERSATION_ID_KEY, id);
  return id;
}

function loadPendingAction(conversationId: string): CadPendingAction | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${PENDING_KEY_PREFIX}${conversationId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isCadPendingAction(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function persistPendingAction(conversationId: string, action: CadPendingAction | null) {
  if (typeof window === "undefined") return;
  const key = `${PENDING_KEY_PREFIX}${conversationId}`;
  if (!action) {
    sessionStorage.removeItem(key);
    return;
  }
  try {
    sessionStorage.setItem(key, JSON.stringify(action));
  } catch {
    /* quota */
  }
}

function msgId() {
  return `m_${Math.random().toString(36).slice(2, 10)}`;
}

function historyStorageKey(project: CadProject) {
  return `${HISTORY_KEY_PREFIX}${project.name}`;
}

function loadHistory(project: CadProject): CadAiHistoryMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(historyStorageKey(project));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CadAiHistoryMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(project: CadProject, history: CadAiHistoryMessage[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(historyStorageKey(project), JSON.stringify(history.slice(-40)));
  } catch {
    /* quota */
  }
}

export function CadAiChat({
  project,
  selectedId,
  selectedVertexIndex = null,
  selectedSegmentIndex = null,
  memorialForm,
  open,
  onOpenChange,
  onProjectChange,
  onSelectedIdChange,
  onSideEffect,
  hideLauncher = false,
  onPreviewEntities,
}: CadAiChatProps) {
  const t = useTranslations("rtkCad.ai");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationHistory, setConversationHistory] = useState<CadAiHistoryMessage[]>([]);
  const [processing, setProcessing] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [pendingProfileStart, setPendingProfileStart] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileBinary, setFileBinary] = useState<ArrayBuffer | null>(null);
  const [pending, setPending] = useState<CadAssistantPending | null>(null);
  const conversationIdRef = useRef(getOrCreateConversationId());
  const [pendingAction, setPendingActionState] = useState<CadPendingAction | null>(() =>
    loadPendingAction(conversationIdRef.current),
  );
  const [canUndo, setCanUndo] = useState(false);
  const undoStackRef = useRef<CadAssistantUndoEntry[]>([]);
  const lastOptimizeRef = useRef<ReturnType<typeof paramsFromCommand> | null>(null);
  const pendingRef = useRef<CadAssistantPending | null>(null);
  const pendingActionRef = useRef<CadPendingAction | null>(pendingAction);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyBootstrapped = useRef(false);
  const { isListening, speechSupported, startListening, stopListening, speak, setTranscript } =
    useCadSpeech("pt-BR");

  useEffect(() => {
    if (historyBootstrapped.current) return;
    historyBootstrapped.current = true;
    setConversationHistory(loadHistory(project));
  }, [project]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, processing]);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!onPreviewEntities) return;
    if (!pending) {
      onPreviewEntities([]);
      return;
    }
    const before = new Map(pending.snapshot.entities.map((entity) => [entity.id, entity]));
    onPreviewEntities(
      pending.nextProject.entities.filter((entity) => {
        const prev = before.get(entity.id);
        return !prev || JSON.stringify(prev) !== JSON.stringify(entity);
      }),
    );
  }, [pending, onPreviewEntities]);

  const pushMessage = useCallback((role: ChatMessage["role"], text: string, actions?: string[]) => {
    setMessages((prev) => [...prev, { id: msgId(), role, text, timestamp: Date.now(), actions }]);
  }, []);

  const storePendingAction = useCallback((action: CadPendingAction | null) => {
    pendingActionRef.current = action;
    setPendingActionState(action);
    persistPendingAction(conversationIdRef.current, action);
  }, []);

  const appendHistory = useCallback(
    (userText: string, assistantText: string) => {
      setConversationHistory((prev) => {
        const next: CadAiHistoryMessage[] = [
          ...prev,
          { role: "user", content: userText },
          { role: "assistant", content: assistantText },
        ];
        saveHistory(project, next);
        return next;
      });
    },
    [project],
  );

  const makeContext = useCallback(
    () =>
      buildCadAiContext(project, selectedId, pendingProfileStart, {
        selectedVertexIndex,
        selectedSegmentIndex,
      }),
    [project, selectedId, pendingProfileStart, selectedVertexIndex, selectedSegmentIndex],
  );

  const applyResult = useCallback(
    (
      result: CadCommandExecutionResult & { meta?: { pendingProfileStart?: string | null } },
      userText: string,
      actionLabels?: string[],
    ) => {
      onProjectChange(result.project);
      if (result.selectedId !== undefined) onSelectedIdChange(result.selectedId);
      if (result.meta?.pendingProfileStart !== undefined) {
        setPendingProfileStart(result.meta.pendingProfileStart);
      }
      for (const effect of result.sideEffects ?? []) {
        onSideEffect(effect);
      }
      pushMessage("assistant", result.message, actionLabels);
      appendHistory(userText, result.message);
      speak(result.message, ttsEnabled);
      setFileContent(null);
      setFileName(null);
      setFileBinary(null);
    },
    [onProjectChange, onSelectedIdChange, onSideEffect, pushMessage, appendHistory, speak, ttsEnabled],
  );

  const runRedistributionPending = useCallback(
    (userText: string) => {
      const action = pendingRedistributionOf(pendingActionRef.current);
      if (!action) {
        pushMessage("assistant", "Não há alteração pendente para aplicar.");
        return;
      }
      logPendingAction("user response", userText);
      logPendingAction("pendingAction resolved", action.type);
      logPendingAction("executing", "redistribute_lots");
      const start = understoodRedistribution(action);
      pushMessage("assistant", start);
      appendHistory(userText, start);
      speak(start, ttsEnabled);
      pushUndo(undoStackRef.current, { project, selectedId });
      setCanUndo(true);
      const result = executeRedistributionPending(project, action, selectedId);
      storePendingAction(null);
      pendingRef.current = null;
      setPending(null);
      logPendingAction("pendingAction cleared");
      if (result.ok === false) {
        pushMessage("error", result.message);
        speak(result.message, ttsEnabled);
        return;
      }
      onProjectChange(result.project);
      if (result.selectedId !== undefined) onSelectedIdChange(result.selectedId);
      for (const effect of result.sideEffects ?? []) {
        onSideEffect(effect);
      }
      pushMessage("assistant", result.message);
      appendHistory(userText, result.message);
      speak(result.message, ttsEnabled);
    },
    [
      project,
      selectedId,
      onProjectChange,
      onSelectedIdChange,
      onSideEffect,
      pushMessage,
      appendHistory,
      speak,
      ttsEnabled,
      storePendingAction,
    ],
  );

  const applyPending = useCallback(() => {
    if (pendingRedistributionOf(pendingActionRef.current)) {
      runRedistributionPending("sim");
      return;
    }
    const current = pendingRef.current;
    if (!current) {
      pushMessage("assistant", "Não há alteração pendente para aplicar.");
      return;
    }
    pushUndo(undoStackRef.current, { project, selectedId });
    setCanUndo(true);
    onProjectChange(current.nextProject);
    if (current.selectedId) onSelectedIdChange(current.selectedId);
    pendingRef.current = null;
    setPending(null);
    const text = "Alteração aplicada. Use Desfazer se precisar voltar.";
    pushMessage("assistant", text);
    appendHistory("Aplicar", text);
    speak(text, ttsEnabled);
    logCadAi({ intencao: "aplicar", tool: current.commands.map((cmd) => cmd.acao).join(","), resultado: text });
  }, [
    project,
    selectedId,
    onProjectChange,
    onSelectedIdChange,
    pushMessage,
    appendHistory,
    speak,
    ttsEnabled,
    runRedistributionPending,
  ]);

  const cancelPending = useCallback(() => {
    if (pendingActionRef.current) {
      logPendingAction("user response", "não");
      logPendingAction("pendingAction cleared");
      storePendingAction(null);
      pendingRef.current = null;
      setPending(null);
      const text = cancelPendingMessage();
      pushMessage("assistant", text);
      appendHistory("não", text);
      speak(text, ttsEnabled);
      return;
    }
    if (!pendingRef.current) {
      pushMessage("assistant", "Não há prévia para cancelar.");
      return;
    }
    pendingRef.current = null;
    setPending(null);
    const text = "Alteração cancelada. O desenho não foi modificado.";
    pushMessage("assistant", text);
    speak(text, ttsEnabled);
  }, [pushMessage, speak, ttsEnabled, storePendingAction, appendHistory]);

  const undoLast = useCallback(() => {
    const prev = popUndo(undoStackRef.current);
    setCanUndo(undoStackRef.current.length > 0);
    if (!prev) {
      pushMessage("assistant", "Não há alteração para desfazer.");
      return;
    }
    pendingRef.current = null;
    setPending(null);
    storePendingAction(null);
    onProjectChange(prev.project);
    onSelectedIdChange(prev.selectedId);
    const text = "Última alteração desfeita.";
    pushMessage("assistant", text);
    appendHistory("Desfazer", text);
    speak(text, ttsEnabled);
    logCadAi({ intencao: "desfazer", resultado: text });
  }, [onProjectChange, onSelectedIdChange, pushMessage, appendHistory, speak, ttsEnabled, storePendingAction]);

  const executeResolved = useCallback(
    (commands: CadAiCommand[], context: ReturnType<typeof buildCadAiContext>, userText: string) => {
      const hydrated = validateCadCommand(commands.map((cmd) => {
        if (cmd.acao !== "otimizar_quadra" || cmd.area_alvo_m2 != null) return cmd;
        const last = lastOptimizeRef.current;
        if (!last?.areaAlvo) return cmd;
        return { ...cmd, area_alvo_m2: last.areaAlvo, preservar_ruas: cmd.preservar_ruas ?? last.preservarRuas ?? true };
      }));
      if (hydrated.some((cmd) => cmd.applyImmediately)) {
        if (pendingRedistributionOf(pendingActionRef.current)) {
          runRedistributionPending(userText);
          return;
        }
        pushUndo(undoStackRef.current, { project, selectedId });
        setCanUndo(true);
        const immediate = executeCadAiCommandChain(project, hydrated, {
          selectedId,
          memorialForm,
          pendingProfileStart,
          selectedSegmentIndex,
        });
        storePendingAction(null);
        applyResult(immediate, userText, hydrated.map((cmd) => cmd.acao));
        return;
      }
      if (hydrated.some((cmd) => isApplyIntentAction(cmd.acao)) || isConfirmPhrase(userText)) {
        applyPending();
        return;
      }
      if (hydrated.some((cmd) => isUndoIntentAction(cmd.acao)) || isUndoPhrase(userText)) {
        undoLast();
        return;
      }
      if (isCancelPhrase(userText)) {
        cancelPending();
        return;
      }

      const resolved = resolveCadAiCommands(hydrated, context);
      const actionLabels = resolved.map((cmd) => cmd.acao);
      logCadAi({ usuario: userText, intencao: actionLabels.join(","), tool: actionLabels.join(","), parametros: resolved });
      const mutating = resolved.filter((cmd) => isMutatingAssistantAction(cmd.acao) && !isApplyIntentAction(cmd.acao));
      const readonly = resolved.filter((cmd) => !mutating.includes(cmd));

      if (readonly.length) {
        const readResult = executeCadAiCommandChain(project, readonly, {
          selectedId,
          memorialForm,
          pendingProfileStart,
          selectedSegmentIndex,
        });
        if (!mutating.length) {
          applyResult(readResult, userText, actionLabels);
          return;
        }
        pushMessage("assistant", readResult.message, readonly.map((cmd) => cmd.acao));
      }

      if (mutating.length) {
        const result = executeCadAiCommandChain(project, mutating, {
          selectedId,
          memorialForm,
          pendingProfileStart,
          selectedSegmentIndex,
        });
        if (result.ok === false) {
          if (result.pendingAction?.type === "pending_modify") {
            storePendingAction(result.pendingAction);
            logPendingAction("pendingAction created", "pending_modify");
            pushMessage("assistant", result.message);
            return;
          }
          if (result.pendingAction?.type === "confirm_redistribution") {
            const action = {
              ...result.pendingAction,
              originalCommand: userText || result.pendingAction.originalCommand,
            };
            storePendingAction(action);
            logPendingAction("pendingAction created", action.type);
            pushMessage("assistant", result.message);
          } else if (result.redistributionOffer) {
            storePendingAction({
              type: "confirm_redistribution",
              status: "pending",
              originalCommand: userText,
              intent: "ajustar_lote",
              scope: "single_lot",
              targetLot: result.redistributionOffer.lote,
              targetArea: result.redistributionOffer.areaAlvo,
              allowRedistribution: false,
              affectedLots: [],
              createdAt: new Date().toISOString(),
            });
            logPendingAction("pendingAction created", "confirm_redistribution");
            pushMessage("assistant", result.message);
          } else {
            pushMessage("error", result.message);
          }
          appendHistory(userText, result.message);
          speak(result.message, ttsEnabled);
          return;
        }
        storePendingAction(null);
        for (const cmd of mutating) {
          if (cmd.acao === "otimizar_quadra") lastOptimizeRef.current = paramsFromCommand(cmd, selectedId);
        }
        const iaReply = mutating.map((cmd) => cmd.resposta?.trim()).find(Boolean);
        const previewText = iaReply
          ? iaReply.includes("Deseja aplicar")
            ? iaReply
            : `${iaReply} Deseja aplicar?`
          : `${result.message} Deseja aplicar?`;
        const nextPending: CadAssistantPending = {
          snapshot: cloneCadProject(project),
          nextProject: result.project,
          selectedId: result.selectedId ?? null,
          commands: mutating,
          preview: previewText,
          destructive: mutating.some((cmd) => isDestructiveAssistantAction(cmd.acao)),
        };
        pendingRef.current = nextPending;
        setPending(nextPending);
        pushMessage("assistant", previewText, mutating.map((cmd) => cmd.acao));
        appendHistory(userText, previewText);
        speak(result.message, ttsEnabled);
        logCadAi({ tool: mutating.map((cmd) => cmd.acao).join(","), resultado: "prévia aguardando confirmação" });
      }
    },
    [
      project,
      selectedId,
      memorialForm,
      pendingProfileStart,
      selectedSegmentIndex,
      applyResult,
      applyPending,
      undoLast,
      cancelPending,
      pushMessage,
      appendHistory,
      speak,
      ttsEnabled,
      runRedistributionPending,
      storePendingAction,
    ],
  );

  const runCommands = useCallback(
    (commands: CadAiCommand[], userLabel?: string) => {
      const label = userLabel ?? "";
      if (label) pushMessage("user", label);
      setProcessing(true);
      try {
        const context = makeContext();
        executeResolved(commands, context, label);
      } catch (err) {
        const text = err instanceof Error ? err.message : t("interpretError");
        pushMessage("error", text);
      } finally {
        setProcessing(false);
        setInput("");
      }
    },
    [makeContext, executeResolved, pushMessage, t],
  );

  const runDirect = useCallback(
    (command: CadAiCommand, userLabel?: string) => {
      runCommands([command], userLabel);
    },
    [runCommands],
  );

  const runCommand = useCallback(
    async (commandText: string, options?: { skipUserMessage?: boolean }) => {
      const trimmed = commandText.trim();
      if (!trimmed) return;

      if (!options?.skipUserMessage) pushMessage("user", trimmed);
      setProcessing(true);

      try {
        const conversationPending = pendingActionRef.current;
        if (conversationPending) {
          const resolution = resolvePendingUserMessage(trimmed, conversationPending);
          if (resolution.kind === "confirm" || resolution.kind === "continue_pending") {
            runRedistributionPending(trimmed);
            return;
          }
          if (resolution.kind === "cancel") {
            cancelPending();
            return;
          }
          if (resolution.kind === "switch_confirmed") {
            const incoming = resolution.action.incomingCommand;
            storePendingAction(null);
            pendingRef.current = null;
            setPending(null);
            const cancelled = cancelPendingMessage();
            pushMessage("assistant", cancelled);
            appendHistory(trimmed, cancelled);
            if (incoming) {
              await runCommand(incoming, { skipUserMessage: true });
            }
            return;
          }
          if (resolution.kind === "topic_switch") {
            const next = createTopicSwitchPending(resolution.action, resolution.incomingCommand);
            storePendingAction(next);
            logPendingAction("pendingAction created", next.type);
            const text = topicSwitchQuestion(next);
            pushMessage("assistant", text);
            appendHistory(trimmed, text);
            speak(text, ttsEnabled);
            return;
          }
          if (resolution.kind === "remind") {
            const text = pendingStillOpenMessage(resolution.action);
            pushMessage("assistant", text);
            speak(text, ttsEnabled);
            return;
          }
        }
        if (pendingRef.current && isConfirmPhrase(trimmed)) {
          applyPending();
          return;
        }
        if (isUndoPhrase(trimmed)) {
          undoLast();
          return;
        }
        if (pendingRef.current && isCancelPhrase(trimmed)) {
          cancelPending();
          return;
        }
        if (fileBinary && fileName?.toLowerCase().endsWith(".kmz") && /import/i.test(trimmed)) {
          const result = importKmzIntoProject(project, fileBinary);
          applyResult(result, trimmed, ["importar"]);
          return;
        }

        const context = makeContext();
        const conversationId = conversationIdRef.current;

        const res = await fetch("/api/cad/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            command: trimmed,
            conversationId,
            cadContext: context,
            context,
            history: conversationHistory,
            fileContent: fileContent ?? undefined,
            fileName: fileName ?? undefined,
            pendingAction: pendingActionRef.current,
          }),
        });

        const data = (await res.json()) as {
          commands?: CadAiCommand[];
          error?: string;
          resposta?: string;
          source?: string;
          pendingAction?: CadPendingAction | null;
          applyImmediately?: boolean;
          incomingCommand?: string;
        };
        if (data.pendingAction !== undefined) {
          storePendingAction(data.pendingAction);
        }

        const tryLocalFallback = () => {
          const localChain = parseLocalCadCommandChain(trimmed, context, conversationHistory);
          const localCommand = localChain?.length
            ? localChain
            : parseLocalCadCommand(trimmed, context, conversationHistory);
          return Array.isArray(localCommand) ? localCommand : localCommand ? [localCommand] : [];
        };

        if (!res.ok) {
          const openaiDown = res.status >= 500 || res.status === 408 || res.status === 429;
          if (openaiDown) {
            const fallback = tryLocalFallback();
            if (fallback.length) {
              executeResolved(fallback, context, trimmed);
              return;
            }
          }
          const raw = data.error || "";
          if (res.status === 503 || /OPENAI_API_KEY/i.test(raw)) {
            throw new Error(raw || "Assistente IA indisponível: OPENAI_API_KEY não configurada.");
          }
          throw new Error(raw || t("interpretError"));
        }

        if (!data.commands?.length) {
          if (data.source !== "openai") {
            const fallback = tryLocalFallback();
            if (fallback.length) {
              executeResolved(fallback, context, trimmed);
              return;
            }
          }
          const text = data.resposta?.trim() || t("interpretError");
          pushMessage(data.resposta?.trim() ? "assistant" : "error", text);
          speak(text, ttsEnabled);
          if (data.resposta?.trim()) appendHistory(trimmed, data.resposta.trim());
          return;
        }

        const validated = validateCadAiCommands(data.commands);
        if (!validated.ok) {
          pushMessage("error", t("validationError", { details: validated.message }));
          speak(validated.message, ttsEnabled);
          return;
        }

        executeResolved(validated.commands, context, trimmed);
      } catch (err) {
        const text = err instanceof Error ? err.message : t("interpretError");
        pushMessage("error", text);
        speak(text, ttsEnabled);
      } finally {
        setProcessing(false);
        setInput("");
        setTranscript("");
      }
    },
    [
      project,
      selectedId,
      selectedVertexIndex,
      selectedSegmentIndex,
      memorialForm,
      pendingProfileStart,
      conversationHistory,
      fileContent,
      fileName,
      fileBinary,
      applyResult,
      applyPending,
      undoLast,
      cancelPending,
      executeResolved,
      makeContext,
      runRedistributionPending,
      storePendingAction,
      appendHistory,
      pushMessage,
      speak,
      ttsEnabled,
      setTranscript,
      t,
    ],
  );

  const clearHistory = () => {
    setMessages([]);
    setConversationHistory([]);
    storePendingAction(null);
    sessionStorage.removeItem(historyStorageKey(project));
  };

  const handleImportKml = useCallback(() => {
    fileRef.current?.click();
    setInput(t("quick.importKmlCmd"));
  }, [t]);

  const quickActions = [
    {
      label: t("quick.area"),
      run: () => {
        const closed = listClosedPolygons(project.entities);
        const id = selectedId && closed.some((p) => p.id === selectedId) ? selectedId : null;
        if (!id) {
          pushMessage("error", t("quick.areaNeedPolygon"));
          return;
        }
        runDirect({ acao: "medir_area", entidade_id: id, resposta: "" }, t("quick.area"));
      },
    },
    { label: t("quick.distance"), run: () => runDirect({ acao: "medir_distancia", resposta: "" }, t("quick.distance")) },
    { label: t("quick.renamePoint"), run: () => runDirect({ acao: "alterar_id", resposta: "" }, t("quick.renamePoint")) },
    { label: t("quick.hypsometric"), run: () => runDirect({ acao: "mapa_hipsometrico", resposta: "" }, t("quick.hypsometric")) },
    { label: t("quick.coords"), run: () => runDirect({ acao: "inserir_coordenadas", resposta: "" }, t("quick.coords")) },
    { label: t("quick.text"), run: () => runDirect({ acao: "inserir_texto", texto: "Lote 01", resposta: "" }, t("quick.text")) },
    { label: t("quick.measure"), run: () => runDirect({ acao: "medir", resposta: "" }, t("quick.measure")) },
    { label: t("quick.pointId"), run: () => runDirect({ acao: "renumerar_pontos", resposta: "" }, t("quick.pointId")) },
    { label: t("quick.exportKml"), run: () => runDirect({ acao: "exportar", formato: "kml", resposta: "" }, t("quick.exportKml")) },
    { label: t("quick.exportKmz"), run: () => runDirect({ acao: "exportar", formato: "kmz", resposta: "" }, t("quick.exportKmz")) },
    { label: t("quick.tin"), run: () => runDirect({ acao: "triangulacao", resposta: "" }, t("quick.tin")) },
    { label: t("quick.removeTin"), run: () => runDirect({ acao: "remover_tin", resposta: "" }, t("quick.removeTin")) },
    { label: t("quick.contourLabel"), run: () => runDirect({ acao: "cota_curva", resposta: "" }, t("quick.contourLabel")) },
  ];

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    void runCommand(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleVoice = () => {
    if (isListening) {
      stopListening();
      return;
    }
    startListening((text) => {
      setInput(text);
      void runCommand(text);
    }) || pushMessage("error", t("speechUnsupported"));
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".kmz")) {
      const reader = new FileReader();
      reader.onload = () => {
        setFileBinary(reader.result as ArrayBuffer);
        setFileContent(null);
        setFileName(file.name);
        pushMessage("assistant", t("fileAttached", { name: file.name }));
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        setFileContent(String(reader.result ?? ""));
        setFileBinary(null);
        setFileName(file.name);
        pushMessage("assistant", t("fileAttached", { name: file.name }));
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  if (!open) {
    if (hideLauncher) return null;
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-[#7c3aed] px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-[#6d28d9]"
        title={t("title")}
      >
        <span aria-hidden>✦</span>
        {t("openChat")}
      </button>
    );
  }

  return (
    <aside className="cad-ai-chat fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-[#1e293b] bg-[#0f1117] shadow-2xl">
      <header className="flex shrink-0 items-center justify-between border-b border-[#1e293b] px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#7c3aed]/20 text-xs text-[#c4b5fd]">✨</span>
            <h2 className="text-sm font-semibold text-[#e2e8f0]">Assistente CAD</h2>
          </div>
          <p className="mt-1 text-[10px] text-[#64748b]">Linguagem natural · loteamento e desenho</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clearHistory}
            className="rounded-md px-2 py-1 text-[10px] text-[#64748b] hover:bg-[#1e293b] hover:text-[#94a3b8]"
            title={t("clearHistory")}
          >
            {t("clearHistoryShort")}
          </button>
          <label className="flex items-center gap-1 text-[10px] text-[#94a3b8]" title={t("tts")}>
            <input
              type="checkbox"
              checked={ttsEnabled}
              onChange={(e) => setTtsEnabled(e.target.checked)}
              className="rounded"
            />
            TTS
          </label>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md px-2 py-1 text-[#94a3b8] hover:bg-[#1e293b] hover:text-white"
            aria-label={t("close")}
          >
            ✕
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="space-y-3 text-xs text-[#64748b]">
            <p className="text-sm text-[#cbd5e1]">🤖 Olá! O que você deseja fazer?</p>
            <p>Fale em português: consultar áreas, otimizar quadras, validar o loteamento ou desfazer.</p>
            <ul className="space-y-1.5">
              <li className="rounded-lg bg-[#1a1d27] px-3 py-2 text-[#94a3b8]">Na quadra G quero lotes com 300 m².</li>
              <li className="rounded-lg bg-[#1a1d27] px-3 py-2 text-[#94a3b8]">Qual a área da quadra G?</li>
              <li className="rounded-lg bg-[#1a1d27] px-3 py-2 text-[#94a3b8]">Mostre os lotes abaixo de 250 m².</li>
              <li className="rounded-lg bg-[#1a1d27] px-3 py-2 text-[#94a3b8]">Analise esse loteamento.</li>
            </ul>
          </div>
        ) : (
          <ul className="space-y-4">
            {messages.map((m) => (
              <li key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    m.role === "user"
                      ? "bg-[#7c3aed] text-white"
                      : m.role === "error"
                        ? "border border-red-500/40 bg-red-950/40 text-red-300"
                        : "bg-[#1a1d27] text-[#cbd5e1]"
                  }`}
                >
                  {m.text}
                  {m.actions?.length ? (
                    <p className="mt-1.5 border-t border-[#334155]/60 pt-1.5 text-[10px] text-[#64748b]">
                      {t("actionsRun")}: {m.actions.join(" → ")}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
            {processing ? (
              <li className="flex justify-start">
                <div className="rounded-xl bg-[#1a1d27] px-3 py-2 text-xs text-[#64748b]">
                  {t("processing")}
                </div>
              </li>
            ) : null}
          </ul>
        )}
      </div>

      <footer className="shrink-0 border-t border-[#1e293b] p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {quickActions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={processing}
              onClick={action.run}
              className="rounded-full border border-[#334155] bg-[#1a1d27] px-2.5 py-1 text-[10px] text-[#94a3b8] hover:border-[#7c3aed] hover:text-[#c4b5fd] disabled:opacity-40"
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            disabled={processing}
            onClick={handleImportKml}
            className="rounded-full border border-[#334155] bg-[#1a1d27] px-2.5 py-1 text-[10px] text-[#94a3b8] hover:border-[#7c3aed] hover:text-[#c4b5fd] disabled:opacity-40"
          >
            {t("quick.importKml")}
          </button>
        </div>
        {fileName ? (
          <p className="mb-2 truncate text-[10px] text-emerald-400">{t("fileReady", { name: fileName })}</p>
        ) : null}
        {pendingAction?.type === "pending_modify" ? (
          <div className="mb-2 space-y-2 rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-3 py-2 text-[11px] text-cyan-100">
            <p>{pendingStillOpenMessage(pendingAction)}</p>
            <button
              type="button"
              disabled={processing}
              onClick={() => {
                pushMessage("user", "cancelar");
                storePendingAction(null);
                pushMessage("assistant", cancelPendingMessage());
              }}
              className="rounded-lg border border-[#334155] px-2 py-1.5 text-[11px] text-[#cbd5e1] disabled:opacity-40"
            >
              Cancelar operação
            </button>
          </div>
        ) : null}
        {pendingAction?.type === "confirm_redistribution" ? (
          <div className="mb-2 space-y-2 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-100">
            <p>Deseja permitir a redistribuição dos lotes afetados?</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={processing}
                onClick={() => {
                  pushMessage("user", "sim");
                  runRedistributionPending("sim");
                }}
                className="rounded-lg bg-amber-600 px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
              >
                SIM, CONTINUAR
              </button>
              <button
                type="button"
                disabled={processing}
                onClick={() => {
                  pushMessage("user", "não");
                  cancelPending();
                }}
                className="rounded-lg border border-[#334155] px-2 py-1.5 text-[11px] text-[#cbd5e1] disabled:opacity-40"
              >
                NÃO, CANCELAR
              </button>
            </div>
          </div>
        ) : null}
        {pendingAction?.type === "confirm_topic_switch" ? (
          <div className="mb-2 space-y-2 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-100">
            <p>{topicSwitchQuestion(pendingAction)}</p>
            <div className="grid grid-cols-1 gap-1.5">
              <button
                type="button"
                disabled={processing}
                onClick={() => {
                  const incoming = pendingAction.incomingCommand;
                  pushMessage("user", "sim");
                  storePendingAction(null);
                  pendingRef.current = null;
                  setPending(null);
                  const cancelled = cancelPendingMessage();
                  pushMessage("assistant", cancelled);
                  if (incoming) void runCommand(incoming, { skipUserMessage: true });
                }}
                className="rounded-lg bg-amber-600 px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
              >
                {`Cancelar operação e ${pendingAction.incomingSummary}`}
              </button>
              <button
                type="button"
                disabled={processing}
                onClick={() => {
                  pushMessage("user", "continuar operação pendente");
                  runRedistributionPending("continuar operação pendente");
                }}
                className="rounded-lg border border-[#334155] px-2 py-1.5 text-[11px] text-[#cbd5e1] disabled:opacity-40"
              >
                Continuar operação pendente
              </button>
            </div>
          </div>
        ) : null}
        {pending ? (
          <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-100">
            {pending.destructive
              ? "Operação destrutiva. Confirme para aplicar no desenho."
              : "Prévia pronta. Confirme para aplicar no desenho."}
          </div>
        ) : null}
        <div className="mb-2 grid grid-cols-3 gap-1.5">
          <button
            type="button"
            disabled={!pending}
            onClick={applyPending}
            className="rounded-lg bg-emerald-600 px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-35"
          >
            Aplicar
          </button>
          <button
            type="button"
            disabled={!pending}
            onClick={cancelPending}
            className="rounded-lg border border-[#334155] px-2 py-1.5 text-[11px] text-[#cbd5e1] disabled:opacity-35"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canUndo}
            onClick={undoLast}
            className="rounded-lg border border-[#334155] px-2 py-1.5 text-[11px] text-[#cbd5e1] disabled:opacity-35"
          >
            Desfazer
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="💬 Digite um comando..."
            rows={3}
            disabled={processing}
            className="w-full resize-none rounded-lg border border-[#334155] bg-[#1a1d27] px-3 py-2 text-xs text-[#e2e8f0] placeholder:text-[#64748b] focus:border-[#7c3aed] focus:outline-none disabled:opacity-50"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={processing || !input.trim()}
              className="flex-1 rounded-lg bg-[#7c3aed] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              {t("send")}
            </button>
            {speechSupported ? (
              <button
                type="button"
                onClick={handleVoice}
                disabled={processing}
                className={`rounded-lg border px-3 py-2 text-xs disabled:opacity-40 ${
                  isListening
                    ? "border-red-500 bg-red-950/50 text-red-300"
                    : "border-[#334155] text-[#94a3b8] hover:border-[#7c3aed]"
                }`}
                title={t("voice")}
              >
                {isListening ? "●" : "🎤"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={processing}
              className="rounded-lg border border-[#334155] px-3 py-2 text-xs text-[#94a3b8] hover:border-[#7c3aed] disabled:opacity-40"
              title={t("attach")}
            >
              📎
            </button>
            <input ref={fileRef} type="file" accept={ACCEPT_FILES} className="hidden" onChange={handleFile} />
          </div>
          <p className="text-[10px] text-[#475569]">{t("enterHint")}</p>
        </form>
      </footer>
    </aside>
  );
}
