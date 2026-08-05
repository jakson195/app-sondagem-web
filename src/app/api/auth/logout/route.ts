import { authCookieName, authCookieOptions } from "@/lib/server-auth";
import { clearActiveCompanyCookie } from "@/lib/auth/active-company";
import { isSupabaseAuthConfigured } from "@/lib/supabase";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  let applyCookies = <T extends NextResponse>(response: T) => response;
  if (isSupabaseAuthConfigured()) {
    try {
      const routeHandlerClient = await createSupabaseRouteHandlerClient();
      applyCookies = routeHandlerClient.applyCookies;
      const { supabase } = routeHandlerClient;
      await supabase.auth.signOut();
    } catch {
      // também limpamos o cookie legado abaixo
    }
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(authCookieName(), "", { ...authCookieOptions(), maxAge: 0 });
  clearActiveCompanyCookie(res);
  return applyCookies(res);
}
