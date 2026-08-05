import type { SystemRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AuthUser = {
  id: number;
  email: string;
  name: string | null;
  systemRole: SystemRole;
};

/** Bypass temporário sem login. Desactivar em produção: AUTH_REQUIRE_LOGIN=1 */
export function isAuthBypassEnabled(): boolean {
  if (process.env.AUTH_REQUIRE_LOGIN === "1") return false;
  if (process.env.AUTH_BYPASS === "1") return true;
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.AUTH_BYPASS_LOCAL === "1"
  ) {
    return true;
  }
  // Produção: bypass só se AUTH_BYPASS_PRODUCTION=1 (isolamento multi-tenant por omissão)
  return process.env.AUTH_BYPASS_PRODUCTION === "1";
}

/** @deprecated Prefer isAuthBypassEnabled */
export function isLocalAuthBypassEnabled(): boolean {
  return isAuthBypassEnabled();
}

const LOCAL_BYPASS_FALLBACK_USER: AuthUser = {
  id: 1,
  email: "local-auth-bypass@datageodigital.local",
  name: "Local Auth Bypass",
  systemRole: "MASTER_ADMIN",
};

export async function getLocalBypassAuthUser(): Promise<AuthUser | null> {
  if (!isAuthBypassEnabled()) return null;

  try {
    return await resolveLocalBypassAuthUser();
  } catch (err) {
    console.warn(
      "[auth-bypass] Base de dados indisponível; a usar utilizador local de fallback.",
      err,
    );
    return LOCAL_BYPASS_FALLBACK_USER;
  }
}

async function resolveLocalBypassAuthUser(): Promise<AuthUser> {
  const admin = await prisma.user.findFirst({
    where: {
      systemRole: {
        in: ["MASTER_ADMIN", "SUPER_ADMIN"],
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      systemRole: true,
    },
    orderBy: { id: "asc" },
  });
  if (admin) return admin;

  const firstUser = await prisma.user.findFirst({
    select: {
      id: true,
      email: true,
      name: true,
      systemRole: true,
    },
    orderBy: { id: "asc" },
  });
  if (firstUser) {
    return {
      ...firstUser,
      systemRole: "MASTER_ADMIN",
    };
  }

  return prisma.user.create({
    data: {
      email: LOCAL_BYPASS_FALLBACK_USER.email,
      name: LOCAL_BYPASS_FALLBACK_USER.name,
      password: null,
      systemRole: "MASTER_ADMIN",
    },
    select: {
      id: true,
      email: true,
      name: true,
      systemRole: true,
    },
  });
}
