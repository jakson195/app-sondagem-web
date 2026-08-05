import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/cad-auth";
import type { CadProject } from "@/lib/rtk-validation/cad/types";

export const runtime = "nodejs";

function safeFilename(name: string) {
  return name.replace(/[^\w\-]+/g, "_").slice(0, 80) || "projeto_cad";
}

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { project?: CadProject; format?: string };
    const project = body.project;
    const format = body.format?.toLowerCase();

    if (!project?.entities || !Array.isArray(project.entities)) {
      return NextResponse.json({ error: "Projeto inválido." }, { status: 400 });
    }

    if (project.entities.length === 0) {
      return NextResponse.json({ error: "Projeto sem geometrias para exportar." }, { status: 400 });
    }

    const filename = safeFilename(project.name || "projeto_cad");
    const { exportCadProjectDxfBytes, exportCadProjectDwgBytes } = await import(
      "@/lib/rtk-validation/cad/export-acad"
    );

    if (format === "dxf") {
      const bytes = exportCadProjectDxfBytes(project);
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/dxf",
          "Content-Disposition": `attachment; filename="${filename}.dxf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (format === "dwg") {
      const bytes = exportCadProjectDwgBytes(project);
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/acad",
          "Content-Disposition": `attachment; filename="${filename}.dwg"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json({ error: "Formato inválido. Use dxf ou dwg." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha na exportação.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
