"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import { buildCadAiContext } from "@/lib/rtk-validation/cad/ai-context";
import { resolveCadAiCommands } from "@/lib/rtk-validation/cad/ai-command-resolver";
import { parseLocalCadCommand, parseLocalCadCommandChain } from "@/lib/rtk-validation/cad/local-command-parser";
import { importKmzIntoProject } from "@/lib/rtk-validation/cad/ai-command-executor";
import { executeCadAiCommandChain } from "@/lib/rtk-validation/cad/ai-interpreter";
import type {
  CadAiCommand,
  CadAiHistoryMessage,
  CadAiSideEffect,
  CadCommandExecutionResult,
} from "@/lib/rtk-validation/cad/ai-command-types";
import type { CadProject } from "@/lib/rtk-validation/cad/types";
import { listClosedPolygons } from "@/lib/rtk-validation/cad/polygon-utils";
import type { MemorialFormDefaults } from "@/lib/rtk-validation/cad/memorial-types";
import { useCadSpeech } from "@/hooks/use-cad-speech";

export interface CadAiChatProps {
  project: CadProject;
  selectedId: string | null;
  memorialForm: MemorialFormDefaults;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectChange: (project: CadProject) => void;
  onSelectedIdChange: (id: string | null) => void;
  onSideEffect: (effect: CadAiSideEffect) => void;
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
  memorialForm,
  open,
  onOpenChange,
  onProjectChange,
  onSelectedIdChange,
  onSideEffect,
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

  const pushMessage = useCallback((role: ChatMessage["role"], text: string, actions?: string[]) => {
    setMessages((prev) => [...prev, { id: msgId(), role, text, timestamp: Date.now(), actions }]);
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

  const executeResolved = useCallback(
    (commands: CadAiCommand[], context: ReturnType<typeof buildCadAiContext>, userText: string) => {
      const resolved = resolveCadAiCommands(commands, context);
      const actionLabels = resolved.map((c) => c.acao);
      const result = executeCadAiCommandChain(project, resolved, {
        selectedId,
        memorialForm,
        pendingProfileStart,
      });
      applyResult(result, userText, actionLabels);
    },
    [project, selectedId, memorialForm, pendingProfileStart, applyResult],
  );

  const runCommands = useCallback(
    (commands: CadAiCommand[], userLabel?: string) => {
      const label = userLabel ?? "";
      if (label) pushMessage("user", label);
      setProcessing(true);
      try {
        const context = buildCadAiContext(project, selectedId, pendingProfileStart);
        executeResolved(commands, context, label);
      } catch (err) {
        const text = err instanceof Error ? err.message : t("interpretError");
        pushMessage("error", text);
      } finally {
        setProcessing(false);
        setInput("");
      }
    },
    [project, selectedId, pendingProfileStart, executeResolved, pushMessage, t],
  );

  const runDirect = useCallback(
    (command: CadAiCommand, userLabel?: string) => {
      runCommands([command], userLabel);
    },
    [runCommands],
  );

  const runCommand = useCallback(
    async (commandText: string) => {
      const trimmed = commandText.trim();
      if (!trimmed) return;

      pushMessage("user", trimmed);
      setProcessing(true);

      try {
        if (fileBinary && fileName?.toLowerCase().endsWith(".kmz") && /import/i.test(trimmed)) {
          const result = importKmzIntoProject(project, fileBinary);
          applyResult(result, trimmed, ["importar"]);
          return;
        }

        const context = buildCadAiContext(project, selectedId, pendingProfileStart);

        const localChain = parseLocalCadCommandChain(trimmed, context);
        if (localChain?.length) {
          const commands = localChain.map((cmd) =>
            fileContent && cmd.acao === "importar"
              ? {
                  ...cmd,
                  conteudo: fileContent,
                  arquivo: cmd.arquivo ?? fileName?.split(".").pop()?.toLowerCase(),
                }
              : cmd,
          );
          executeResolved(commands, context, trimmed);
          return;
        }

        const localCommand = parseLocalCadCommand(trimmed, context);
        if (localCommand) {
          const cmd =
            fileContent && localCommand.acao === "importar"
              ? {
                  ...localCommand,
                  conteudo: fileContent,
                  arquivo: localCommand.arquivo ?? fileName?.split(".").pop()?.toLowerCase(),
                }
              : localCommand;
          executeResolved([cmd], context, trimmed);
          return;
        }

        const res = await fetch("/api/assistente-ia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: trimmed,
            context,
            history: conversationHistory,
            fileContent: fileContent ?? undefined,
            fileName: fileName ?? undefined,
          }),
        });

        const data = (await res.json()) as {
          commands?: CadAiCommand[];
          error?: string;
          resposta?: string;
        };

        if (!res.ok || !data.commands?.length) {
          throw new Error(data.error || t("interpretError"));
        }

        executeResolved(data.commands, context, trimmed);
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
      memorialForm,
      pendingProfileStart,
      conversationHistory,
      fileContent,
      fileName,
      fileBinary,
      applyResult,
      executeResolved,
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
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#7c3aed]/20 text-xs text-[#c4b5fd]">✦</span>
            <h2 className="text-sm font-semibold text-[#e2e8f0]">{t("title")}</h2>
          </div>
          <p className="mt-1 text-[10px] text-[#64748b]">{t("subtitle")}</p>
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
            <p>{t("welcome")}</p>
            <p className="text-[10px] text-[#475569]">{t("contextHint")}</p>
            <ul className="space-y-1.5">
              <li className="rounded-lg bg-[#1a1d27] px-3 py-2 text-[#94a3b8]">{t("example1")}</li>
              <li className="rounded-lg bg-[#1a1d27] px-3 py-2 text-[#94a3b8]">{t("example2")}</li>
              <li className="rounded-lg bg-[#1a1d27] px-3 py-2 text-[#94a3b8]">{t("example3")}</li>
              <li className="rounded-lg bg-[#1a1d27] px-3 py-2 text-[#94a3b8]">{t("example4")}</li>
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
        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("placeholder")}
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
