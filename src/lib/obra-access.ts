import type { OrgMembership, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  requireCompanyAccessFromRequest,
  scopeWhereCompanyIdsForUser,
} from "@/lib/client-portal-auth";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";
import type { getAuthUserFromRequest } from "@/lib/server-auth";

type AuthUser = NonNullable<Awaited<ReturnType<typeof getAuthUserFromRequest>>>;

export type ObraOwnershipFields = {
  companyId: number;
  createdByUserId: number | null;
};

/** Filtro Prisma: utilizadores normais só veem obras que criaram. */
export async function scopeWhereObrasForUser(
  user: AuthUser,
): Promise<Prisma.ObraWhereInput> {
  if (isPlatformSuperAdmin(user.systemRole)) {
    return {};
  }
  const companyScope = await scopeWhereCompanyIdsForUser(user);
  return {
    AND: [companyScope, { createdByUserId: user.id }],
  };
}

export function userOwnsObra(
  user: AuthUser,
  obra: { createdByUserId: number | null },
): boolean {
  if (isPlatformSuperAdmin(user.systemRole)) return true;
  return obra.createdByUserId === user.id;
}

export function obraAccessDeniedResponse(): NextResponse {
  return NextResponse.json({ error: "Sem acesso a esta obra." }, { status: 403 });
}

/** Empresa + propriedade da obra (criador). */
export async function requireObraAccessFromRequest(
  req: Request,
  obra: ObraOwnershipFields,
  options?: { write?: boolean },
): Promise<
  | { ok: true; user: AuthUser; membership: OrgMembership | null }
  | { ok: false; response: NextResponse }
> {
  const access = await requireCompanyAccessFromRequest(req, obra.companyId, options);
  if (!access.ok) return access;
  if (!userOwnsObra(access.user, obra)) {
    return { ok: false, response: obraAccessDeniedResponse() };
  }
  return access;
}
