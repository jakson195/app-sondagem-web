import { cadAiTools, buildCadAiSystemPrompt } from "./ai-command-catalog";
import { parseCadAiResponse, parseOpenAiToolCalls } from "./ai-interpreter";
import { parseLocalCadCommand, parseLocalCadCommandChain } from "./local-command-parser";
import { validateCadAiCommands } from "./ai-command-validator";
import type { CadAiCommand, CadAiHistoryMessage, CadAiProjectContext } from "./ai-command-types";

export interface AssistenteIaRequest {
  command: string;
  context: CadAiProjectContext;
  history?: CadAiHistoryMessage[];
  fileContent?: string;
  fileName?: string;
}

export interface AssistenteIaResponse {
  commands: CadAiCommand[];
  source: "local" | "openai";
  resposta?: string;
}

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

interface OpenAiChatMessage {
  role?: string;
  content?: string | null;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
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

export async function interpretAssistenteIaCommand(body: AssistenteIaRequest): Promise<AssistenteIaResponse> {
  const command = body.command?.trim();
  if (!command) {
    throw new Error("Comando vazio.");
  }

  const fileContent = body.fileContent ?? "";

  const localChain = parseLocalCadCommandChain(command, body.context);
  if (localChain?.length) {
    const commands = withFile(localChain, fileContent, body.fileName);
    return { commands, source: "local", resposta: extractResposta(commands) };
  }

  const local = parseLocalCadCommand(command, body.context);
  if (local) {
    const commands = withFile([local], fileContent, body.fileName);
    return { commands, source: "local", resposta: extractResposta(commands) };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Comando não reconhecido localmente. Configure OPENAI_API_KEY em .env.local para linguagem natural livre.",
    );
  }

  const historyMessages = (body.history ?? [])
    .slice(-12)
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));

  const userMessage = [
    `Comando do usuário: ${command}`,
    fileContent ? `\nArquivo anexado (${body.fileName ?? "arquivo"}):\n${fileContent.slice(0, 12000)}` : "",
    `\nContexto do desenho:\n${JSON.stringify(body.context, null, 2)}`,
  ].join("");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
      temperature: 0.1,
      tools: cadAiTools,
      tool_choice: "auto",
      messages: [
        { role: "system", content: buildCadAiSystemPrompt() },
        ...historyMessages,
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[assistente-ia] OpenAI error:", errText);
    throw new Error("Falha ao interpretar comando com a IA.");
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: OpenAiChatMessage }>;
  };
  const message = data.choices?.[0]?.message;
  const content = typeof message?.content === "string" ? message.content.trim() : "";
  const toolCalls = message?.tool_calls?.filter((tc) => tc.function?.name) ?? [];

  if (toolCalls.length) {
    return finalizeOpenAiCommands(parseOpenAiToolCalls(toolCalls), fileContent, body.fileName, content || undefined);
  }

  if (content) {
    const looksLikeJson = /[{[]/.test(content);
    if (looksLikeJson) {
      return finalizeOpenAiCommands(parseCadAiResponse(content), fileContent, body.fileName, content);
    }
    return { commands: [], source: "openai", resposta: content };
  }

  throw new Error("A IA não retornou ferramenta nem texto.");
}
