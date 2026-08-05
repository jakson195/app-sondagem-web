import { cookies } from "next/headers";
import type { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  listAccessibleCompanyIdsForUser,
} from "@/lib/client-portal-auth";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";

export const ACTIVE_COMPANY_COOKIE = "dg_active_company";

type ListFilterUser = {
  id: number;
  systemRole: string;
};

export async function getActiveCompanyIdFromCookies(): Promise<number | null> {
  const jar = await cookies();
  const raw = jar.get(ACTIVE_COMPANY_COOKIE)?.value;
  if (!raw) return null;
  const id = Number.parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function resolveActiveCompanyForUser(
  userId: number,
  systemRole: string,
  preferredId?: number | null,
) {
  if (isPlatformSuperAdmin(systemRole as "MASTER_ADMIN" | "SUPER_ADMIN" | "USER")) {
    if (preferredId) {
      const c = await prisma.company.findUnique({ where: { id: preferredId } });
      if (c) return c;
    }
    const cookieId = await getActiveCompanyIdFromCookies();
    if (cookieId) {
      const c = await prisma.company.findUnique({ where: { id: cookieId } });
      if (c) return c;
    }
    return prisma.company.findFirst({ orderBy: { id: "asc" } });
  }

  const memberships = await prisma.orgMembership.findMany({
    where: { userId },
    include: { company: true },
    orderBy: { company: { name: "asc" } },
  });
  if (memberships.length === 0) return null;

  const cookieId = preferredId ?? (await getActiveCompanyIdFromCookies());
  if (cookieId) {
    const hit = memberships.find((m) => m.empresaId === cookieId);
    if (hit) return hit.company;
  }
  return memberships[0]!.company;
}

export type ActiveCompanyContext = {
  companyId: number;
  companyName: string;
  companySlug: string;
  orgRole: OrgRole | null;
  isPlatformAdmin: boolean;
};

export async function getActiveCompanyContext(
  user: { id: number; systemRole: string },
): Promise<ActiveCompanyContext | null> {
  const company = await resolveActiveCompanyForUser(user.id, user.systemRole);
  if (!company) return null;

  if (isPlatformSuperAdmin(user.systemRole as "MASTER_ADMIN" | "SUPER_ADMIN" | "USER")) {
    return {
      companyId: company.id,
      companyName: company.name,
      companySlug: company.slug,
      orgRole: null,
      isPlatformAdmin: true,
    };
  }

  const membership = await prisma.orgMembership.findUnique({
    where: { userId_empresaId: { userId: user.id, empresaId: company.id } },
  });
  if (!membership) return null;

  return {
    companyId: company.id,
    companyName: company.name,
    companySlug: company.slug,
    orgRole: membership.orgRole,
    isPlatformAdmin: false,
  };
}

/** Filtro de listagem de obras: query explícita > empresa activa (cookie) > 1.ª empresa do utilizador. */
export async function resolveObraListCompanyFilter(
  user: ListFilterUser,
  req: Request,
): Promise<number | null> {
  const { searchParams } = new URL(req.url);
  const rawCompany =
    searchParams.get("companyId") ?? searchParams.get("empresaId");
  const isAdmin = isPlatformSuperAdmin(
    user.systemRole as "MASTER_ADMIN" | "SUPER_ADMIN" | "USER",
  );

  if (rawCompany !== null && rawCompany !== "") {
    const explicit = Number(rawCompany);
    if (Number.isFinite(explicit) && explicit > 0) {
      return explicit;
    }
  }

  if (searchParams.get("all") === "1" && isAdmin) {
    return null;
  }

  const accessibleIds = isAdmin
    ? []
    : await listAccessibleCompanyIdsForUser(
        user as Parameters<typeof listAccessibleCompanyIdsForUser>[0],
      );

  const activeId = await getActiveCompanyIdFromCookies();
  if (activeId) {
    if (isAdmin) return activeId;
    if (accessibleIds.includes(activeId)) return activeId;
  }

  if (!isAdmin) {
    return accessibleIds[0] ?? null;
  }

  return null;
}

export function activeCompanyCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}

export function applyActiveCompanyCookie<T extends import("next/server").NextResponse>(
  response: T,
  companyId: number | null,
): T {
  if (companyId != null && companyId > 0) {
    response.cookies.set(
      ACTIVE_COMPANY_COOKIE,
      String(companyId),
      activeCompanyCookieOptions(),
    );
  }
  return response;
}

export function clearActiveCompanyCookie<T extends import("next/server").NextResponse>(
  response: T,
): T {
  response.cookies.set(ACTIVE_COMPANY_COOKIE, "", {
    ...activeCompanyCookieOptions(),
    maxAge: 0,
  });
  return response;
}

/** Define cookie da empresa activa com base nas memberships do utilizador (isolamento multi-tenant). */
export async function syncActiveCompanyCookieForUser(
  user: { id: number; systemRole: string },
): Promise<number | null> {
  const company = await resolveActiveCompanyForUser(user.id, user.systemRole);
  return company?.id ?? null;
}
