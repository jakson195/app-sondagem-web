import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth-constants";
import { isPublicPath, isAppRoute } from "@/lib/auth/public-routes";
import { isAuthBypassEnabled } from "@/lib/auth-bypass";
import { isSupabaseAuthConfigured } from "@/lib/supabase";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

const ADMIN_PREFIXES = ["/adm", "/admin"] as const;

function isAdminRoute(pathname: string) {
  return ADMIN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function hasLegacySession(req: NextRequest) {
  return Boolean(req.cookies.get(AUTH_TOKEN_COOKIE)?.value);
}

async function resolveAuth(req: NextRequest): Promise<{ authed: boolean; response?: NextResponse }> {
  if (isSupabaseAuthConfigured()) {
    const result = await updateSupabaseSession(req, NextResponse.next());
    return { authed: Boolean(result.user), response: result.response };
  }
  return { authed: hasLegacySession(req) };
}

export async function middleware(req: NextRequest) {
  if (isAuthBypassEnabled()) {
    return NextResponse.next();
  }

  const pathname = req.nextUrl.pathname;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const needsAuth = isAppRoute(pathname) || isAdminRoute(pathname);
  if (!needsAuth) {
    return NextResponse.next();
  }

  const { authed, response } = await resolveAuth(req);
  if (!authed) {
    const next = encodeURIComponent(`${pathname}${req.nextUrl.search || ""}`);
    return NextResponse.redirect(new URL(`/login?next=${next}`, req.url));
  }

  if (response) return response;

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)",
  ],
};
