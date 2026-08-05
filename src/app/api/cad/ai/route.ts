import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/cad-auth";
import { interpretAssistenteIaCommand } from "@/lib/rtk-validation/cad/openai-assistant.service";
import type { AssistenteIaRequest } from "@/lib/rtk-validation/cad/openai-assistant.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** @deprecated Use /api/assistente-ia — mantido por compatibilidade. */
export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body: AssistenteIaRequest;
  try {
    body = (await request.json()) as AssistenteIaRequest;
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  try {
    const result = await interpretAssistenteIaCommand(body);
    return NextResponse.json({
      commands: result.commands,
      command: result.commands[0],
      source: result.source,
      resposta: result.resposta,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno ao processar comando.";
    const status = message.includes("OPENAI_API_KEY") ? 503 : message.includes("Comando vazio") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
