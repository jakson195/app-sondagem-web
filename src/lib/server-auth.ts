import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import type { SystemRole } from "@prisma/client";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth-constants";
import { getLocalBypassAuthUser } from "@/lib/auth-bypass";
import { syncUserFromSupabase } from "@/lib/auth-user-sync";
import { prisma } from "@/lib/prisma";
import {
  assertSupabaseAuthConfigured,
  createSupabaseClient,
  isSupabaseAuthConfigured,
} from "@/lib/supabase";
import { enableLocalSupabaseTlsWorkaround } from "@/lib/supabase/server-runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type JwtAuthPayload = {
  userId: number;
  systemRole: SystemRole;
};

export function getJwtSecret(): string | null {
  const s = process.env.JWT_SECRET;
  return s && s.length > 0 ? s : null;
}

/** Assina token com o mesmo formato do login (7d). */
export function signAuthToken(payload: JwtAuthPayload): string {
  const secret = getJwtSecret();
  if (!secret) throw new Error("JWT_SECRET não definido");
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

export function verifyAuthToken(token: string): JwtAuthPayload | null {
  const secret = getJwtSecret();
  if (!secret) return null;
  try {
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload & Partial<JwtAuthPayload>;
    if (
      typeof decoded.userId !== "number" ||
      (decoded.systemRole !== "MASTER_ADMIN" &&
        decoded.systemRole !== "SUPER_ADMIN" &&
        decoded.systemRole !== "USER")
    ) {
      return null;
    }
    return {
      userId: decoded.userId,
      systemRole: decoded.systemRole,
    };
  } catch {
    return null;
  }
}

/** Lê Bearer ou cookie httpOnly definido no login. */
export async function getBearerOrCookieToken(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  const jar = await cookies();
  const c = jar.get(AUTH_TOKEN_COOKIE)?.value;
  return c && c.length > 0 ? c : null;
}

export async function getAuthPayloadFromRequest(
  req: Request,
): Promise<JwtAuthPayload | null> {
  const token = await getBearerOrCookieToken(req);
  if (!token) return null;
  return verifyAuthToken(token);
}

export async function getAuthPayloadFromCookies(): Promise<JwtAuthPayload | null> {
  const jar = await cookies();
  const token = jar.get(AUTH_TOKEN_COOKIE)?.value;
  if (!token) return null;
  return verifyAuthToken(token);
}

export async function getAuthUserFromRequest(req: Request) {
  const bypassUser = await getLocalBypassAuthUser();
  if (bypassUser) return bypassUser;
  const supabaseUser = await getSupabaseUserFromRequest(req);
  if (supabaseUser) {
    return syncUserFromSupabase(supabaseUser);
  }
  const payload = await getAuthPayloadFromRequest(req);
  return getAuthUserFromPayload(payload);
}

export async function getAuthUserFromCookies() {
  const bypassUser = await getLocalBypassAuthUser();
  if (bypassUser) return bypassUser;
  const supabaseUser = await getSupabaseUserFromCookies();
  if (supabaseUser) {
    return syncUserFromSupabase(supabaseUser);
  }
  const payload = await getAuthPayloadFromCookies();
  return getAuthUserFromPayload(payload);
}

async function getSupabaseUserFromRequest(req: Request) {
  if (!isSupabaseAuthConfigured()) return null;

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token) {
      enableLocalSupabaseTlsWorkaround();
      const supabase = createSupabaseClient();
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data.user) return data.user;
    }
  }

  return getSupabaseUserFromCookies();
}

async function getSupabaseUserFromCookies() {
  if (!isSupabaseAuthConfigured()) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user ?? null;
  } catch {
    return null;
  }
}

async function getAuthUserFromPayload(payload: JwtAuthPayload | null) {
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      name: true,
      systemRole: true,
    },
  });
  if (!user) return null;
  if (user.systemRole !== payload.systemRole) return null;
  return user;
}

export function authCookieName(): typeof AUTH_TOKEN_COOKIE {
  return AUTH_TOKEN_COOKIE;
}

export async function loginWithLocalPassword(email: string, password: string) {
  const secret = getJwtSecret();
  if (!secret) {
    return { ok: false as const, error: "JWT_SECRET não definido no servidor." };
  }

  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) {
    return { ok: false as const, error: "Email e senha são obrigatórios." };
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      name: true,
      systemRole: true,
      password: true,
    },
  });

  if (!user?.password) {
    return { ok: false as const, error: "Credenciais inválidas." };
  }

  const bcrypt = await import("bcrypt");
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return { ok: false as const, error: "Credenciais inválidas." };
  }

  const token = signAuthToken({
    userId: user.id,
    systemRole: user.systemRole,
  });

  return {
    ok: true as const,
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      systemRole: user.systemRole,
    },
  };
}

export function authCookieOptions(): {
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
    maxAge: 60 * 60 * 24 * 7,
  };
}
