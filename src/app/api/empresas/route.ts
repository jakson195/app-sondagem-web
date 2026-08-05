import { nextResponseDbFailure } from "@/lib/db-route-error";
import { ensureUniqueCompanySlug, normalizeClientSlugInput } from "@/lib/client-slug";
import { listAccessibleCompaniesForUser } from "@/lib/client-portal-auth";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";
import { garantirModulosPadraoEmpresa } from "@/lib/seed-empresa-modulos";
import { getAuthUserFromRequest } from "@/lib/server-auth";
import { provisionSubscriptionForCompany } from "@/lib/saas/subscription-service";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Lista empresas acessíveis ao utilizador autenticado. */
export async function GET(req: Request) {
  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const rows = await listAccessibleCompaniesForUser(user);
    return NextResponse.json(
      rows.map((r) => ({ id: r.id, nome: r.name, slug: r.slug })),
    );
  } catch (e) {
    return nextResponseDbFailure(e);
  }
}

/** Cria cliente/empresa — apenas administrador de plataforma. */
export async function POST(req: Request) {
  const authUser = await getAuthUserFromRequest(req);
  if (!authUser) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!isPlatformSuperAdmin(authUser.systemRole)) {
    return NextResponse.json(
      { error: "Sem permissão para criar empresas." },
      { status: 403 },
    );
  }

  let body: { nome?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (!nome) {
    return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 });
  }

  try {
    const slug =
      normalizeClientSlugInput((body as Record<string, unknown>).slug) ??
      (await ensureUniqueCompanySlug(nome));

    const company = await prisma.company.create({
      data: { name: nome, slug, userId: authUser.id },
    });

    await prisma.orgMembership.upsert({
      where: {
        userId_empresaId: { userId: authUser.id, empresaId: company.id },
      },
      create: {
        userId: authUser.id,
        empresaId: company.id,
        orgRole: "ADMIN",
      },
      update: { orgRole: "ADMIN" },
    });

    await garantirModulosPadraoEmpresa(company.id);
    await provisionSubscriptionForCompany(company.id, "trial");

    return NextResponse.json({ id: company.id, nome: company.name, slug: company.slug });
  } catch (e) {
    return nextResponseDbFailure(e);
  }
}
