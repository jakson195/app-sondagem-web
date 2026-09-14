import { postAssistenteIa } from "@/lib/rtk-validation/cad/assistente-ia-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** @deprecated Use POST /api/assistente-ia — mesmo handler. */
export const POST = postAssistenteIa;
