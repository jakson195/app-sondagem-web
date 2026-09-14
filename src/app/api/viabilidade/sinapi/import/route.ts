import { NextResponse } from "next/server";
import { jsonError, requireViabilidadeUser } from "@/lib/viabilidade/access";
import { parseCsv, parseTabularSinapi } from "@/lib/viabilidade/sinapi-import";
import { upsertSinapiRows } from "@/lib/viabilidade/sinapi-store";
import { parseCompetencia, SinapiSyncError } from "@/lib/viabilidade/sinapi-caixa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireViabilidadeUser(req);
    void user;
    const form = await req.formData();
    const file = form.get("arquivo");
    const uf = String(form.get("uf") ?? "SC").trim().toUpperCase();
    let competencia: string;
    try {
      competencia = parseCompetencia(String(form.get("competencia") ?? "")).label;
    } catch (error) {
      const message = error instanceof SinapiSyncError ? error.message : "Informe a competência (MM/AAAA).";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const tipo = String(form.get("tipo") ?? "").trim() || null;
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Envie o arquivo (XLSX ou CSV)." }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    let matrix: unknown[][] = [];
    if (name.endsWith(".csv") || name.endsWith(".txt")) {
      matrix = parseCsv(buffer.toString("utf8"));
    } else {
      const xlsx = await import("xlsx");
      const wb = xlsx.read(buffer, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
      if (!sheet) {
        return NextResponse.json({ error: "Planilha vazia." }, { status: 400 });
      }
      matrix = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false }) as unknown[][];
    }

    const parsed = parseTabularSinapi(matrix, tipo);
    const saved = await upsertSinapiRows({ rows: parsed.rows, uf, competencia });

    return NextResponse.json({
      imported: saved.imported,
      created: saved.created,
      updated: saved.updated,
      skipped: parsed.skipped,
      errors: parsed.errors,
      uf,
      competencia,
    });
  } catch (error) {
    return jsonError(error);
  }
}
