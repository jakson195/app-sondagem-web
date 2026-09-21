import { getAssistenteIaStatus, postAssistenteIa } from "@/lib/rtk-validation/cad/assistente-ia-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = getAssistenteIaStatus;
export const POST = postAssistenteIa;
