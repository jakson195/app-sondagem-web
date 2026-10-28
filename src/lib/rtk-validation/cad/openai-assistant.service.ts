import OpenAI from "openai";
import {
  DEFAULT_OPENAI_MODEL,
  hasOpenAIKey,
  logOpenAiKeyStatus,
  resolveOpenAIApiKey,
  resolveOpenAIModel,
  useSystemCertificateAuthorities,
} from "@/lib/cad-ai/openai-env";
import { logCadAi } from "@/lib/cad-ai/log";
import { selectCadAiOpenAiToolkit } from "./ai-command-catalog";
import { parseCadAiResponse, parseOpenAiResponsesOutput } from "./ai-interpreter";
import { cadCommandRouter } from "@/lib/cad-ai/command-router";
import { classifyCadIntent, logCadAiIntent, validateCadCommand, validateIntent } from "@/lib/cad-ai/intent";
import { getCadConversationState } from "@/lib/cad-ai/conversation-state";
import { isCadPendingAction, type CadPendingAction } from "@/lib/cad-ai/pending-action";
import { compactCadContext, contextContainsGeometry, isFollowUpCommand } from "@/lib/cad-ai/minimal-context";
import {
  conversationSummary,
  invalidateCadConversation,
  upsertCadConversationState,
} from "@/lib/cad-ai/conversation-state";
import { invalidateCadContextCache } from "@/lib/cad-ai/context-cache";
import { recordCadAiLocalRoute, recordCadAiOpenAiRoute } from "@/lib/cad-ai/cost-metrics";
import { parseLocalCadCommand, parseLocalCadCommandChain } from "./local-command-parser";
import { validateCadAiCommands } from "./ai-command-validator";
import type { CadAiCommand, CadAiHistoryMessage, CadAiProjectContext } from "./ai-command-types";

export interface AssistenteIaRequest {
  command: string;
  context: CadAiProjectContext;
  history?: CadAiHistoryMessage[];
  fileContent?: string;
  fileName?: string;
  conversationId?: string;
  pendingAction?: CadPendingAction | null;
}

export interface AssistenteIaResponse {
  commands: CadAiCommand[];
  source: "local" | "openai";
  resposta?: string;
  openaiCalled?: boolean;
  contextLevel?: number;
  contextSize?: number;
  intent?: string;
  entity?: string;
  pendingAction?: CadPendingAction | null;
  applyImmediately?: boolean;
  incomingCommand?: string;
}

export const ASSISTENTE_IA_UNAVAILABLE =
  "Assistente IA indisponível: OPENAI_API_KEY não configurada.";

export const ASSISTENTE_IA_INVALID_KEY = "Chave OpenAI inválida ou não autorizada.";

export const ASSISTENTE_IA_TIMEOUT = "Não foi possível obter resposta da IA. Tente novamente.";

export const ASSISTENTE_IA_NAO_ENTENDI =
  "Não entendi o comando. Tente novamente ou reformule o pedido.";

export const ASSISTENTE_IA_SAUDACAO =
  "Olá. Posso ajudar com o loteamento, os lotes e o desenho CAD. O que você precisa?";

function attachFileToImport(command: CadAiCommand, fileContent: string, fileName?: string): CadAiCommand {
  if (command.acao !== "importar" || command.conteudo) return command;
  return {
    ...command,
    conteudo: fileContent,
    arquivo: command.arquivo ?? fileName?.split(".").pop()?.toLowerCase(),
  };
}

function withFile(commands: CadAiCommand[], fileContent: string, fileName?: string): CadAiCommand[] {
  if (!fileContent) return commands;
  return commands.map((cmd) => attachFileToImport(cmd, fileContent, fileName));
}

function extractResposta(commands: CadAiCommand[]): string | undefined {
  return commands.find((c) => c.resposta?.trim())?.resposta;
}

function interpretLocally(
  command: string,
  context: CadAiProjectContext,
  fileContent: string,
  fileName?: string,
  history?: CadAiHistoryMessage[],
): AssistenteIaResponse | null {
  const localChain = parseLocalCadCommandChain(command, context, history);
  if (localChain?.length) {
    const commands = withFile(localChain, fileContent, fileName);
    return { commands, source: "local", resposta: extractResposta(commands) };
  }
  const local = parseLocalCadCommand(command, context, history);
  if (!local) return null;
  const commands = withFile([local], fileContent, fileName);
  return { commands, source: "local", resposta: extractResposta(commands) };
}

function finalizeOpenAiCommands(
  commands: CadAiCommand[],
  fileContent: string,
  fileName: string | undefined,
  fallbackResposta?: string,
): AssistenteIaResponse {
  const withAttachment = withFile(commands, fileContent, fileName);
  const validated = validateCadAiCommands(withAttachment);
  if (!validated.ok) {
    return { commands: [], source: "openai", resposta: validated.message };
  }
  return {
    commands: validated.commands,
    source: "openai",
    resposta: extractResposta(validated.commands) ?? fallbackResposta,
  };
}

type OpenAiFailureKind = "auth" | "timeout" | "other";

function classifyOpenAiError(error: unknown): { kind: OpenAiFailureKind; message: string; technical: string } {
  const status = typeof (error as { status?: unknown })?.status === "number"
    ? (error as { status: number }).status
    : undefined;
  const code = String((error as { code?: unknown })?.code ?? "");
  const raw = redactSecrets(error instanceof Error ? error.message : String(error ?? ""));
  const technical = [`status=${status ?? "n/a"}`, code ? `code=${code}` : "", raw].filter(Boolean).join(" | ");
  if (status === 401 || /invalid[-_ ]?api[-_ ]?key|unauthorized|incorrect api key/i.test(`${code} ${raw}`)) {
    return { kind: "auth", message: ASSISTENTE_IA_INVALID_KEY, technical };
  }
  if (status === 403) {
    return { kind: "auth", message: `${ASSISTENTE_IA_INVALID_KEY} (${technical})`, technical };
  }
  if (
    status === 408 ||
    status === 429 ||
    status === 504 ||
    /timeout|ETIMEDOUT|timed out|deadline|rate limit/i.test(`${code} ${raw}`)
  ) {
    const friendly = status === 429 ? `Limite da OpenAI atingido. ${technical}` : ASSISTENTE_IA_TIMEOUT;
    return { kind: status === 429 ? "other" : "timeout", message: status === 429 ? friendly : `${ASSISTENTE_IA_TIMEOUT} (${technical})`, technical };
  }
  return { kind: "other", message: `${ASSISTENTE_IA_TIMEOUT} (${technical})`, technical };
}

function redactSecrets(text: string): string {
  return text.replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]");
}

function modelAllowsTemperature(model: string): boolean {
  return !/gpt-5|o1|o3|o4|luna|reason/i.test(model);
}

function isModelUnavailableError(error: unknown): boolean {
  const status = typeof (error as { status?: unknown })?.status === "number"
    ? (error as { status: number }).status
    : undefined;
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return (
    status === 404 ||
    /model[_\s-]?not[_\s-]?found|does not exist|invalid model|unknown model|unsupported.*temperature/i.test(raw)
  );
}

type CadAiOpenAiResponse = {
  output?: Parameters<typeof parseOpenAiResponsesOutput>[0];
  output_text?: string;
};

async function createCadAiResponse(
  client: OpenAI,
  model: string,
  command: string,
  input: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<CadAiOpenAiResponse> {
  const toolkit = selectCadAiOpenAiToolkit(command);
  const payload: Record<string, unknown> = {
    model,
    instructions: toolkit.instructions,
    input,
    tools: toolkit.tools,
    tool_choice: "auto",
    store: false,
    stream: false,
    max_output_tokens: 500,
  };
  if (modelAllowsTemperature(model)) {
    payload.temperature = 0.1;
  }
  return client.responses.create(payload as never) as Promise<CadAiOpenAiResponse>;
}

async function interpretWithOpenAI(body: AssistenteIaRequest): Promise<AssistenteIaResponse> {
  useSystemCertificateAuthorities();
  const apiKey = resolveOpenAIApiKey();
  const configured = Boolean(apiKey);
  console.info("[CAD AI] Mensagem recebida");
  console.info(`[CAD AI] OpenAI configured: ${configured}`);
  if (!apiKey) {
    throw Object.assign(new Error(ASSISTENTE_IA_UNAVAILABLE), { kind: "auth" as const });
  }

  const command = body.command.trim();
  const fileContent = body.fileContent ?? "";
  const state = body.conversationId
    ? upsertCadConversationState(body.conversationId, {
        projectName: body.context.projectName,
        lotCount: body.context.loteamento?.lotes.length ?? 0,
      })
    : null;
  const compact = compactCadContext(body.context, command, state);
  const followUp = isFollowUpCommand(command);
  const userPayload: Record<string, unknown> = {
    mensagem: command,
  };
  if (followUp) {
    userPayload.contextoAnterior = conversationSummary(state);
  } else {
    userPayload.cad = compact.payload;
    const prev = conversationSummary(state);
    if (prev) userPayload.contextoAnterior = prev;
  }
  if (fileContent && /import/i.test(command)) {
    userPayload.arquivo = { nome: body.fileName ?? "arquivo", trecho: fileContent.slice(0, 500) };
  }
  const userMessage = JSON.stringify(userPayload);

  let model = resolveOpenAIModel();
  const baseFetch = globalThis.fetch.bind(globalThis);
  const client = new OpenAI({
    apiKey,
    timeout: 45_000,
    maxRetries: 0,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input).split("?")[0];
      const res = await baseFetch(input, init);
      if (url.includes("api.openai.com")) {
        console.info(`[CAD AI] OpenAI HTTP ${res.status} ${res.statusText} ${url}`);
      }
      return res;
    }) as typeof fetch,
  });

  console.info(`[CAD AI] Modelo: ${model}`);
  logCadAi({ usuario: command, intencao: "openai-responses" });

  const input = [{ role: "user" as const, content: userMessage }];
  let response;
  try {
    response = await createCadAiResponse(client, model, command, input);
  } catch (error) {
    if (isModelUnavailableError(error) && model !== DEFAULT_OPENAI_MODEL) {
      console.info(`[CAD AI] Modelo indisponível, usando fallback: ${DEFAULT_OPENAI_MODEL}`);
      model = DEFAULT_OPENAI_MODEL;
      console.info(`[CAD AI] Modelo: ${model}`);
      response = await createCadAiResponse(client, model, command, input);
    } else {
      throw error;
    }
  }

  const parsed = parseOpenAiResponsesOutput(
    response.output,
    typeof response.output_text === "string" ? response.output_text : "",
  );

  const toolNames = parsed.commands.map((cmd) => cmd.acao);
  recordCadAiOpenAiRoute({
    contextLevel: compact.level,
    contextSize: userMessage.length,
    tool: toolNames.join(",") || (parsed.text ? "text" : ""),
    geometrySent: compact.geometrySent || contextContainsGeometry(userPayload),
  });
  console.info(`[CAD AI] Tool escolhida: ${toolNames.join(", ") || "(nenhuma)"}`);
  logCadAi({
    tool: toolNames.join(",") || undefined,
    parametros: parsed.commands.map((cmd) => ({ acao: cmd.acao, lote: cmd.lote, quadra: cmd.quadra, area_alvo_m2: cmd.area_alvo_m2, percentual: cmd.percentual, tipo: cmd.tipo })),
    resultado: parsed.text || undefined,
  });

  const withMeta = (result: AssistenteIaResponse): AssistenteIaResponse => ({
    ...result,
    openaiCalled: true,
    contextLevel: compact.level,
    contextSize: userMessage.length,
  });

  if (parsed.commands.length) {
    return withMeta(finalizeOpenAiCommands(parsed.commands, fileContent, body.fileName, parsed.text || undefined));
  }
  if (parsed.text) {
    const looksLikeJson = /[{[]/.test(parsed.text);
    if (looksLikeJson) {
      return withMeta(finalizeOpenAiCommands(parseCadAiResponse(parsed.text), fileContent, body.fileName, parsed.text));
    }
    return withMeta({ commands: [], source: "openai", resposta: parsed.text });
  }
  return withMeta({ commands: [], source: "openai", resposta: ASSISTENTE_IA_NAO_ENTENDI });
}

function rememberConversation(body: AssistenteIaRequest, commands: CadAiCommand[], intentName?: string, entity?: string): void {
  const first = commands[0];
  const patch: Parameters<typeof upsertCadConversationState>[1] = {
    resumo: `${body.command.slice(0, 80)} → ${first?.acao ?? ""}`.trim(),
    lastContextLevel: first?.quadra ? 2 : first?.lote ? 1 : 0,
    pendingIntent: first?.acao === "renomear_quadra" && !first.nomes?.length && !first.novo_id ? "renomear_quadra" : null,
    pendingEntity: first?.acao === "renomear_quadra" ? "quadra" : entity ?? null,
  };
  void intentName;
  if (first?.lote) patch.loteAtual = first.lote;
  if (first?.quadra) patch.quadraAtual = first.quadra;
  if (first?.area_alvo_m2 != null) patch.areaAlvo = first.area_alvo_m2;
  if (first?.preservar_ruas != null) patch.preservarRuas = first.preservar_ruas;
  upsertCadConversationState(body.conversationId, patch);
  if (first?.acao === "ajustar_lote") {
    invalidateCadConversation(body.conversationId, { lote: first.lote, quadra: first.quadra });
    invalidateCadContextCache(body.conversationId, { lote: first.lote, quadra: first.quadra });
  } else if (first?.acao === "otimizar_quadra" || first?.acao === "redistribuir_lotes") {
    invalidateCadConversation(body.conversationId, { quadra: first.quadra });
    invalidateCadContextCache(body.conversationId, { quadra: first.quadra });
  } else if (first?.acao === "gerar_loteamento") {
    invalidateCadContextCache(body.conversationId, { project: true });
  }
}

function applyIntentGuard(commands: CadAiCommand[], userText: string, body: AssistenteIaRequest): CadAiCommand[] {
  const intent = classifyCadIntent(
    userText,
    body.context,
    body.history,
    getCadConversationState(body.conversationId),
  );
  const guarded = commands.map((command) => {
    const checked = validateIntent(intent, command);
    if (!checked.ok) {
      logCadAiIntent(intent, checked.command.acao);
      return checked.command;
    }
    return checked.command;
  });
  return validateCadCommand(guarded);
}

export async function interpretAssistenteIaCommand(body: AssistenteIaRequest): Promise<AssistenteIaResponse> {
  const command = body.command?.trim();
  if (!command) {
    throw new Error("Comando vazio.");
  }

  const fileContent = body.fileContent ?? "";
  if (body.pendingAction && isCadPendingAction(body.pendingAction) && body.conversationId) {
    upsertCadConversationState(body.conversationId, { pendingAction: body.pendingAction });
  }
  const state = getCadConversationState(body.conversationId);
  const intent = classifyCadIntent(command, body.context, body.history, state);
  const routed = cadCommandRouter(command, body.context, body.history, state);
  const local = () => interpretLocally(command, body.context, fileContent, body.fileName, body.history);
  const withIntent = (result: AssistenteIaResponse, tool = result.commands[0]?.acao ?? ""): AssistenteIaResponse => {
    logCadAiIntent(routed.intent ?? intent, tool);
    return {
      ...result,
      intent: (routed.intent ?? intent).intent,
      entity: (routed.intent ?? intent).entity,
    };
  };

  if (routed.route === "local" && (routed.commands.length || routed.resposta)) {
    const commands = withFile(routed.commands, fileContent, body.fileName);
    recordCadAiLocalRoute(commands.map((cmd) => cmd.acao).join(",") || routed.reason, routed.contextLevel);
    if (routed.pendingAction !== undefined) {
      upsertCadConversationState(body.conversationId, { pendingAction: routed.pendingAction });
    }
    if (commands.length && routed.reason !== "pending-confirm") {
      rememberConversation(body, commands, intent.intent, intent.entity);
    }
    if (routed.reason === "pending-confirm" || routed.reason === "pending-cancel" || routed.reason === "pending-switch-confirmed") {
      upsertCadConversationState(body.conversationId, { pendingAction: null });
    }
    return withIntent({
      commands,
      source: "local",
      resposta: extractResposta(commands) ?? routed.resposta,
      openaiCalled: false,
      contextLevel: routed.contextLevel,
      contextSize: 0,
      pendingAction: routed.pendingAction ?? null,
      applyImmediately: routed.applyImmediately,
      incomingCommand: routed.incomingCommand,
    });
  }

  if (!hasOpenAIKey()) {
    const fallback = local();
    if (fallback) {
      const guarded = applyIntentGuard(fallback.commands, command, body);
      recordCadAiLocalRoute(guarded.map((cmd) => cmd.acao).join(","), routed.contextLevel);
      return withIntent({
        ...fallback,
        commands: guarded,
        resposta: extractResposta(guarded) ?? fallback.resposta,
        openaiCalled: false,
        contextLevel: routed.contextLevel,
        contextSize: 0,
      });
    }
    recordCadAiLocalRoute("", routed.contextLevel);
    return withIntent({
      commands: [],
      source: "local",
      resposta: ASSISTENTE_IA_UNAVAILABLE,
      openaiCalled: false,
      contextLevel: routed.contextLevel,
      contextSize: 0,
    });
  }

  try {
    const openaiResult = await interpretWithOpenAI(body);
    if (openaiResult.commands.length || openaiResult.resposta?.trim()) {
      const guarded = applyIntentGuard(openaiResult.commands, command, body);
      rememberConversation(body, guarded, intent.intent, intent.entity);
      return withIntent({
        ...openaiResult,
        commands: guarded,
        resposta: extractResposta(guarded) ?? openaiResult.resposta,
      }, guarded[0]?.acao ?? "");
    }
  } catch (error) {
    const failure = classifyOpenAiError(error);
    console.error("[CAD AI] OpenAI request failed");
    console.error("[CAD AI] OpenAI error:", failure.technical);
    if (failure.kind === "auth") {
      return withIntent({ commands: [], source: "openai", resposta: failure.message, openaiCalled: true });
    }
    const fallback = local();
    if (fallback) {
      const guarded = applyIntentGuard(fallback.commands, command, body);
      recordCadAiLocalRoute(guarded.map((cmd) => cmd.acao).join(","), routed.contextLevel);
      rememberConversation(body, guarded, intent.intent, intent.entity);
      return withIntent({
        ...fallback,
        commands: guarded,
        resposta: extractResposta(guarded) ?? fallback.resposta,
        openaiCalled: true,
        contextLevel: routed.contextLevel,
      });
    }
    return withIntent({ commands: [], source: "openai", resposta: failure.message, openaiCalled: true });
  }

  const fallback = local();
  if (fallback) {
    const guarded = applyIntentGuard(fallback.commands, command, body);
    recordCadAiLocalRoute(guarded.map((cmd) => cmd.acao).join(","), routed.contextLevel);
    rememberConversation(body, guarded, intent.intent, intent.entity);
    return withIntent({
      ...fallback,
      commands: guarded,
      resposta: extractResposta(guarded) ?? fallback.resposta,
      openaiCalled: true,
      contextLevel: routed.contextLevel,
    });
  }
  return withIntent({ commands: [], source: "openai", resposta: ASSISTENTE_IA_NAO_ENTENDI, openaiCalled: true });
}

export function reportOpenAiConfiguration(): boolean {
  const configured = hasOpenAIKey();
  logOpenAiKeyStatus();
  return configured;
}
