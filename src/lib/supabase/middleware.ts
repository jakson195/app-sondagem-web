import type { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { assertSupabaseAuthConfigured, isSupabaseAuthConfigured } from "@/lib/supabase";
import {
  AUTH_REQUEST_TIMEOUT_MS,
  hasSupabaseAuthCookie,
  isAuthRemoteUnavailable,
  withAuthTimeout,
} from "@/lib/auth-timeout";
import { enableLocalSupabaseTlsWorkaround } from "@/lib/supabase/server-runtime";

export async function updateSupabaseSession(req: NextRequest, res: NextResponse) {
  if (!isSupabaseAuthConfigured() || isAuthRemoteUnavailable()) {
    return { response: res, user: null };
  }
  if (!hasSupabaseAuthCookie(req.cookies.getAll())) {
    return { response: res, user: null };
  }

  enableLocalSupabaseTlsWorkaround();
  const { url, anonKey } = assertSupabaseAuthConfigured();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          req.cookies.set(name, value);
          res.cookies.set(name, value, options);
        });
      },
    },
  });

  const result = await withAuthTimeout(
    supabase.auth.getUser(),
    "supabase.auth.getUser (middleware)",
    AUTH_REQUEST_TIMEOUT_MS,
    { tripCircuit: true },
  );
  if (!result) return { response: res, user: null };

  const { data } = result;
  return { response: res, user: data.user ?? null };
}
