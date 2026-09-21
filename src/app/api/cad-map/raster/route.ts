import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 180;

const execFileAsync = promisify(execFile);
const MAX_ECW_BYTES = 400 * 1024 * 1024;

async function fileReady(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.size > 0;
  } catch {
    return false;
  }
}

async function runCommand(command: string, args: string[], timeout: number) {
  if (process.platform === "win32") {
    const quoted = [command, ...args].map((part) => `"${part.replace(/"/g, '\\"')}"`).join(" ");
    await execFileAsync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", quoted], {
      timeout,
      windowsHide: true,
    });
    return;
  }
  await execFileAsync(command, args, { timeout });
}

async function convertEcwToTiff(inputPath: string, outputPath: string) {
  const errors: string[] = [];

  try {
    await runCommand("npx", ["--yes", "ecw2tiff", inputPath, outputPath], 180_000);
    if (await fileReady(outputPath)) return;
    errors.push("ecw2tiff não gerou o GeoTIFF de saída.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`ecw2tiff: ${msg.slice(0, 280)}`);
  }

  try {
    await runCommand("gdal_translate", ["-of", "GTiff", "-co", "COMPRESS=DEFLATE", "-co", "TILED=YES", inputPath, outputPath], 180_000);
    if (await fileReady(outputPath)) return;
    errors.push("gdal_translate não gerou o GeoTIFF de saída.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`gdal_translate: ${msg.slice(0, 280)}`);
  }

  throw new Error(errors.join(" "));
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
      return NextResponse.json({ error: "Envie um arquivo .ecw georreferenciado." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_ECW_BYTES) {
      return NextResponse.json(
        { error: "Arquivo ECW maior que 400 MB. Converta para GeoTIFF (.tif) e importe diretamente." },
        { status: 413 },
      );
    }

    const dir = await mkdtemp(join(tmpdir(), "cad-ecw-"));
    const inputPath = join(dir, name.replace(/[^\w.\-]+/g, "_"));
    const outputPath = join(dir, "converted.tif");
    const fileName = name.replace(/\.ecw$/i, ".tif");

    try {
      await writeFile(inputPath, buffer);
      await convertEcwToTiff(inputPath, outputPath);
      const tiff = await readFile(outputPath);

      return new NextResponse(new Uint8Array(tiff), {
        headers: {
          "Content-Type": "image/tiff",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "X-Converted-Name": fileName,
        },
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    const needsTool =
      msg.includes("ENOENT") ||
      msg.includes("gdal_translate") ||
      msg.includes("ecw2tiff") ||
      msg.includes("not found") ||
      msg.includes("não é reconhecido");

    return NextResponse.json(
      {
        error: needsTool
          ? "Conversão ECW requer Node.js (npx ecw2tiff) ou GDAL (gdal_translate) no servidor. Você também pode converter para GeoTIFF (.tif) e importar diretamente."
          : `Falha ao converter ECW: ${msg}`,
      },
      { status: needsTool ? 501 : 500 },
    );
  }
}
