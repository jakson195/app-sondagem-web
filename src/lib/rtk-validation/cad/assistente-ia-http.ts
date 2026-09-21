import { NextRequest, NextResponse } from "next/server";
import { logCadAi } from "@/lib/cad-ai/log";
import { resolveOpenAIModel } from "@/lib/cad-ai/openai-env";
import { getSession } from "@/lib/cad-auth";
import { getCadAiCostMetrics } from "@/lib/cad-ai/cost-metrics";
import {
  ASSISTENTE_IA_UNAVAILABLE,
  interpretAssistenteIaCommand,
  reportOpenAiConfiguration,
} from "@/lib/rtk-validation/cad/openai-assistant.service";
import type { AssistenteIaRequest } from "@/lib/rtk-validation/cad/openai-assistant.service";

type AssistenteIaBody = AssistenteIaRequest & {
  message?: string;
  cadContext?: AssistenteIaRequest["context"];
  conversationId?: string;
};

function publicErrorMessage(err: unknown): { message: string; status: number } {
  const raw = err instanceof Error ? err.message : "Erro interno ao processar comando.";
  if (raw === "Comando vazio.") return { message: raw, status: 400 };
  if (raw === ASSISTENTE_IA_UNAVAILABLE || /OPENAI_API_KEY/i.test(raw)) {
    return { message: ASSISTENTE_IA_UNAVAILABLE, status: 503 };
  }
  return { message: raw.replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]"), status: 400 };
}

export async function getAssistenteIaStatus() {
  const openaiConfigured = reportOpenAiConfiguration();
  const cost = getCadAiCostMetrics();
  return NextResponse.json({
    openaiConfigured,
    envKeyLoaded: Boolean(process.env["OPENAI_API_KEY"]),
    model: resolveOpenAIModel(),
    openAIRequests: cost.openAIRequests,
    localRequests: cost.localRequests,
    lastRoute: cost.lastRoute,
    lastContextLevel: cost.lastContextLevel,
    lastContextSize: cost.lastContextSize,
  });
}

export async function postAssistenteIa(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body: AssistenteIaBody;
  try {
    body = (await request.json()) as AssistenteIaBody;
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const command = (body.command ?? body.message ?? "").trim();
  const context = body.context ?? body.cadContext;
  if (!context) {
    return NextResponse.json({ error: "Contexto do CAD ausente." }, { status: 400 });
  }

  reportOpenAiConfiguration();
  logCadAi({ usuario: command, intencao: "interpretar", parametros: { conversationId: body.conversationId } });

  try {
    const result = await interpretAssistenteIaCommand({
      command,
      context,
      history: body.history,
      fileContent: body.fileContent,
      fileName: body.fileName,
      conversationId: body.conversationId,
    });
    console.info(
      `[CAD AI] route: ${result.source} | openaiCalled: ${Boolean(result.openaiCalled)} | contextLevel: ${result.contextLevel ?? ""} | contextSize: ${result.contextSize ?? 0}`,
    );
    logCadAi({
      tool: result.commands.map((cmd) => cmd.acao).join(","),
      parametros: result.commands.map((cmd) => ({
        acao: cmd.acao,
        lote: cmd.lote,
        quadra: cmd.quadra,
        area_alvo_m2: cmd.area_alvo_m2,
      })),
      resultado: result.resposta,
    });
    return NextResponse.json({
      commands: result.commands,
      command: result.commands[0],
      source: result.source,
      resposta: result.resposta,
      conversationId: body.conversationId,
      openaiCalled: result.openaiCalled,
      contextLevel: result.contextLevel,
      contextSize: result.contextSize,
      intent: result.intent,
      entity: result.entity,
    });
  } catch (err) {
    const { message, status } = publicErrorMessage(err);
    return NextResponse.json({ error: message }, { status });
  }
}
