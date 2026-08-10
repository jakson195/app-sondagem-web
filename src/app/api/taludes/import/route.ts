import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/cad-auth";

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Envie um arquivo DWG ou DXF." }, { status: 400 });
    }

    const name = file.name.trim();
    const lower = name.toLowerCase();
    if (!lower.endsWith(".dwg") && !lower.endsWith(".dxf")) {
      return NextResponse.json({ error: "Formato não suportado. Use .dwg ou .dxf." }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Arquivo muito grande (máx. 20 MB)." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { parseAcadSlopeFile } = await import("@/lib/taludes/parse-acad-slope");
    const result = parseAcadSlopeFile(bytes, name);

    if (result.candidates.length === 0) {
      return NextResponse.json(
        { error: result.warnings[0] ?? "Nenhum perfil de talude encontrado no desenho.", warnings: result.warnings },
        { status: 422 },
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao importar o desenho.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
