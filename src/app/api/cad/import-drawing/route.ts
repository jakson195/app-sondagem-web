import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/cad-auth";
import { DWG_CONVERT_HINT_PT } from "@/lib/rtk-validation/cad/import-drawing-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 40 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Envie o arquivo DWG ou DXF." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "Arquivo muito grande (máximo 40 MB)." }, { status: 413 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { parseCadBytesWithAcadTs } = await import("@/lib/rtk-validation/cad/acad-import");
    const drawing = parseCadBytesWithAcadTs(bytes, file.name);
    if (drawing.geoms.length === 0) {
      return NextResponse.json(
        { ok: false, error: drawing.warnings.join(" ") || DWG_CONVERT_HINT_PT, drawing },
        { status: 422 },
      );
    }
    return NextResponse.json({ ok: true, drawing });
  } catch (err) {
    const message = err instanceof Error ? err.message : DWG_CONVERT_HINT_PT;
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
