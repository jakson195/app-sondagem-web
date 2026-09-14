import { NextResponse } from "next/server";
import { getSession } from "@/lib/cad-auth";
import { isPrismaMissingTableError } from "@/lib/pg-error-utils";
import { CAD_TABLE_HINT, loadCadUserProjectDwg } from "../../persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await context.params;
  try {
    const file = await loadCadUserProjectDwg(id, session.id);
    if (!file) {
      return NextResponse.json({ error: "DWG não encontrado neste projeto." }, { status: 404 });
    }
    const filename = file.filename.replace(/[^\w.\-]+/g, "_") || "projeto.dwg";
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": "application/acad",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (isPrismaMissingTableError(e, "cad_user_projects")) {
      return NextResponse.json({ error: CAD_TABLE_HINT }, { status: 503 });
    }
    throw e;
  }
}
