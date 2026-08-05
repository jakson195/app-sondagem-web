import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

async function convertEcwToTiff(inputPath: string, outputPath: string) {
  await execFileAsync("gdal_translate", ["-of", "GTiff", "-co", "COMPRESS=DEFLATE", inputPath, outputPath], {
    timeout: 120_000,
  });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Arquivo ECW não enviado." }, { status: 400 });
    }

    const name = file instanceof File ? file.name : "ortofoto.ecw";
    if (!name.toLowerCase().endsWith(".ecw")) {
      return NextResponse.json({ error: "Envie um arquivo .ecw." }, { status: 400 });
    }

    const dir = await mkdtemp(join(tmpdir(), "cad-ecw-"));
    const inputPath = join(dir, name);
    const outputPath = join(dir, "converted.tif");

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(inputPath, buffer);
      await convertEcwToTiff(inputPath, outputPath);
      const tiff = await readFile(outputPath);
      const base64 = tiff.toString("base64");

      return NextResponse.json({
        base64,
        fileName: name.replace(/\.ecw$/i, ".tif"),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    const needsGdal =
      msg.includes("ENOENT") ||
      msg.includes("gdal_translate") ||
      msg.includes("not found") ||
      msg.includes("não é reconhecido");

    return NextResponse.json(
      {
        error: needsGdal
          ? "Conversão ECW requer GDAL instalado no servidor (gdal_translate). Converta para GeoTIFF (.tif) e importe diretamente."
          : `Falha ao converter ECW: ${msg}`,
      },
      { status: needsGdal ? 501 : 500 },
    );
  }
}
