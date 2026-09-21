import { getAssistenteIaStatus, postAssistenteIa } from "@/lib/rtk-validation/cad/assistente-ia-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Assistente CAD — mesmo handler de POST /api/assistente-ia. Aceita { message, conversationId, cadContext }. */
export const GET = getAssistenteIaStatus;
export const POST = postAssistenteIa;
