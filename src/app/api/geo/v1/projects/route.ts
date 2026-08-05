import { NextResponse } from "next/server";

import { scopeWhereObrasForUser } from "@/lib/obra-access";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const DEMO_ITEM = {
  id: "00000000-0000-4000-8000-000000000001",
  code: "DEMO-01",
  name: "Demonstração",
  description: "Projeto demo (configure GEO_DATABASE_URL)",
  crs_epsg: 4326,
  properties: {},
};

async function prismaObraProjects(req: Request): Promise<typeof DEMO_ITEM[]> {
  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) return [];

    const where = await scopeWhereObrasForUser(user);
    const obras = await prisma.obra.findMany({
      where,
      orderBy: { id: "desc" },
      take: 100,
      select: { id: true, nome: true, cliente: true, description: true },
    });
    return obras.map((o) => ({
      id: String(o.id),
      code: `OBRA-${o.id}`,
      name: o.nome,
      description:
        (o.description ?? "").trim() ||
        (o.cliente ? `Cliente: ${o.cliente}` : "") ||
        `Obra ${o.id}`,
      crs_epsg: 4326,
      properties: { source: "obra", obraId: o.id },
    }));
  } catch (e) {
    console.error("[geo/v1/projects] prisma obras:", e);
    return [];
  }
}

/** Lista projetos do gêmeo digital (obras na BD principal quando não há GEO_DATABASE_URL). */
export async function GET(req: Request) {
  const url = process.env.GEO_DATABASE_URL;
  if (!url) {
    const obraItems = await prismaObraProjects(req);
    if (obraItems.length > 0) {
      return NextResponse.json({ items: obraItems });
    }
    return NextResponse.json({ items: [DEMO_ITEM] });
  }

  try {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url.replace("postgresql+asyncpg://", "postgresql://") });
    const r = await pool.query(
      `SELECT id::text, code, name, description, crs_epsg, properties, created_at, updated_at
       FROM geotech.projects ORDER BY code LIMIT 100`,
    );
    await pool.end();
    return NextResponse.json({ items: r.rows });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao listar projetos." }, { status: 500 });
  }
}
