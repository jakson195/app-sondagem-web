import { buildCadAiSystemPrompt } from "./ai-command-catalog";
import { parseCadAiResponse } from "./ai-interpreter";
import { parseLocalCadCommand, parseLocalCadCommandChain } from "./local-command-parser";
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
      'Comando não reconhecido localmente. Configure OPENAI_API_KEY em .env.local para linguagem natural livre.',
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
      response_format: { type: "json_object" },
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
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const commands = withFile(parseCadAiResponse(content), fileContent, body.fileName);

  let parsedRoot: Record<string, unknown> = {};
  try {
    parsedRoot = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Record<string, unknown>;
  } catch {
    /* ignore */
  }

  return {
    commands,
    source: "openai",
    resposta: typeof parsedRoot.resposta === "string" ? parsedRoot.resposta : extractResposta(commands),
  };
}
