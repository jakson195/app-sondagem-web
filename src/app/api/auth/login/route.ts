import { syncUserFromSupabase } from "@/lib/auth-user-sync";
import { clientIpFromRequest, checkRateLimit } from "@/lib/auth/rate-limit";
import {
  applyActiveCompanyCookie,
  syncActiveCompanyCookieForUser,
} from "@/lib/auth/active-company";
import {
  authCookieName,
  authCookieOptions,
  loginWithLocalPassword,
} from "@/lib/server-auth";
import {
  isSupabaseAuthConfigured,
  missingSupabaseAuthEnv,
  supabaseAuthSetupMessage,
} from "@/lib/supabase";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function isSupabaseUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  const cause = (error as Error & { cause?: { code?: string } }).cause;
  return (
    msg.includes("fetch failed") ||
    cause?.code === "ENOTFOUND" ||
    cause?.code === "ECONNREFUSED" ||
    cause?.code === "ETIMEDOUT"
  );
}

export async function POST(req: Request) {
  const ip = clientIpFromRequest(req);
  const limited = checkRateLimit(`login:${ip}`, 20, 15 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: `Muitas tentativas. Aguarde ${limited.retryAfterSec}s.` },
      { status: 429 },
    );
  }
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email e senha são obrigatórios" },
      { status: 400 },
    );
  }

  if (isSupabaseAuthConfigured()) {
    try {
      const { supabase, applyCookies } = await createSupabaseRouteHandlerClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (!error && data.user) {
        const user = await syncUserFromSupabase(data.user);
        const response = NextResponse.json({
          systemRole: user.systemRole,
          email: user.email,
          name: user.name,
          authProvider: "supabase",
        });
        const companyId = await syncActiveCompanyCookieForUser(user);
        applyActiveCompanyCookie(response, companyId);
        return applyCookies(response);
      }
      if (error && !isSupabaseUnavailableError(error)) {
        return NextResponse.json(
          { error: error.message ?? "Credenciais inválidas." },
          { status: 401 },
        );
      }
    } catch (error) {
      if (!isSupabaseUnavailableError(error)) {
        console.error(error);
        return NextResponse.json(
          { error: "Falha ao autenticar com Supabase Auth." },
          { status: 500 },
        );
      }
      console.warn(
        "[auth/login] Supabase indisponível; a usar login local JWT.",
        error,
      );
    }
  }

  const local = await loginWithLocalPassword(email, password);
  if (!local.ok) {
    if (!isSupabaseAuthConfigured()) {
      return NextResponse.json(
        {
          error: supabaseAuthSetupMessage(),
          missing: missingSupabaseAuthEnv(),
          localError: local.error,
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: local.error }, { status: 401 });
  }

  const response = NextResponse.json({
    token: local.token,
    systemRole: local.user.systemRole,
    email: local.user.email,
    name: local.user.name,
    authProvider: "local-jwt",
  });
  response.cookies.set(authCookieName(), local.token, authCookieOptions());
  const companyId = await syncActiveCompanyCookieForUser(local.user);
  applyActiveCompanyCookie(response, companyId);
  return response;
}
