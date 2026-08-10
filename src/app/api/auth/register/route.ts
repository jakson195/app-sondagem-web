import { NextResponse } from "next/server";
import { createClientSignupAccount, createJwtSignupAccount } from "@/lib/auth-user-sync";
import { isSupabaseUnavailableError } from "@/lib/auth/supabase-errors";
import { clientIpFromRequest, checkRateLimit } from "@/lib/auth/rate-limit";
import { applyActiveCompanyCookie } from "@/lib/auth/active-company";
import { authCookieName, authCookieOptions, signAuthToken } from "@/lib/server-auth";
import { provisionSubscriptionForCompany } from "@/lib/saas/subscription-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

function defaultCompanyName(name: string, email: string): string {
  const trimmed = name.trim();
  if (trimmed) return trimmed;
  const local = email.split("@")[0]?.trim();
  return local ? `Conta ${local}` : "Minha conta";
}

async function registerWithLocalJwt(input: {
  name: string;
  email: string;
  password: string;
  companyName: string;
  plan?: unknown;
}) {
  const { localUser, company } = await createJwtSignupAccount({
    name: input.name,
    email: input.email,
    password: input.password,
    companyName: input.companyName,
    plan: input.plan,
  });

  let token: string;
  try {
    token = signAuthToken({
      userId: localUser.id,
      systemRole: localUser.systemRole,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Conta criada, mas JWT_SECRET não está configurado no servidor. Contacte o suporte.",
      },
      { status: 503 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    authProvider: "local-jwt",
    company: { id: company.id, slug: company.slug, name: company.name, plan: company.plan },
    user: { id: localUser.id, email: localUser.email, name: localUser.name },
    checkoutRequired: false,
  });
  response.cookies.set(authCookieName(), token, authCookieOptions());
  applyActiveCompanyCookie(response, company.id);
  return response;
}

function registerLocalErrorResponse(e: unknown) {
  const msg = e instanceof Error ? e.message : "Falha ao criar conta.";
  const status = msg === "EMAIL_IN_USE" ? 409 : 400;
  return NextResponse.json(
    { error: msg === "EMAIL_IN_USE" ? "Este email já está registado." : msg },
    { status },
  );
}

export async function POST(req: Request) {
  const ip = clientIpFromRequest(req);
  const limited = checkRateLimit(`register:${ip}`, 8, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: `Muitas tentativas. Aguarde ${limited.retryAfterSec}s.` },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const plan = body.plan;
  const companyNameInput =
    typeof body.companyName === "string" ? body.companyName.trim() : "";
  const companyName = companyNameInput || defaultCompanyName(name, email);

  if (!name || !email || password.length < 8) {
    return NextResponse.json(
      {
        error: "Informe nome, email e uma senha com pelo menos 8 caracteres.",
      },
      { status: 400 },
    );
  }

  const common = {
    companyName,
    plan,
    cnpj: typeof body.cnpj === "string" ? body.cnpj.trim() || null : null,
    phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
    address:
      typeof body.address === "string" ? body.address.trim() || null : null,
    companyEmail:
      typeof body.companyEmail === "string" ? body.companyEmail.trim() || null : null,
  };

  if (!isSupabaseAdminConfigured()) {
    try {
      return await registerWithLocalJwt({ name, email, password, companyName, plan });
    } catch (e) {
      return registerLocalErrorResponse(e);
    }
  }

  const admin = createSupabaseAdminClient();
  let createdAuthUserId: string | null = null;

  try {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (error || !data.user) {
      if (isSupabaseUnavailableError(error)) {
        console.warn("[auth/register] Supabase indisponível; a usar cadastro local JWT.");
        try {
          return await registerWithLocalJwt({ name, email, password, companyName, plan });
        } catch (e) {
          return registerLocalErrorResponse(e);
        }
      }
      return NextResponse.json(
        { error: error?.message ?? "Não foi possível criar a conta." },
        { status: 400 },
      );
    }
    createdAuthUserId = data.user.id;

    const { company, localUser } = await createClientSignupAccount({
      authUser: data.user,
      ...common,
      email: common.companyEmail,
    });

    await provisionSubscriptionForCompany(company.id, "trial");

    const { supabase, applyCookies } = await createSupabaseRouteHandlerClient();
    const signIn = await supabase.auth.signInWithPassword({ email, password });
    if (signIn.error) {
      if (isSupabaseUnavailableError(signIn.error)) {
        try {
          if (createdAuthUserId) {
            await admin.auth.admin.deleteUser(createdAuthUserId).catch(() => undefined);
          }
          return await registerWithLocalJwt({ name, email, password, companyName, plan });
        } catch (e) {
          return registerLocalErrorResponse(e);
        }
      }
      return NextResponse.json(
        { error: "Conta criada, mas o login automático falhou." },
        { status: 500 },
      );
    }

    const response = NextResponse.json({
      ok: true,
      authProvider: "supabase",
      company: { id: company.id, slug: company.slug, name: company.name, plan: company.plan },
      user: { id: localUser.id, email: localUser.email, name: localUser.name },
      checkoutRequired: plan === "pro",
    });
    applyActiveCompanyCookie(response, company.id);
    return applyCookies(response);
  } catch (e) {
    if (createdAuthUserId) {
      try {
        await admin.auth.admin.deleteUser(createdAuthUserId);
      } catch {
        /* cleanup */
      }
    }
    if (isSupabaseUnavailableError(e)) {
      console.warn("[auth/register] Supabase indisponível; a usar cadastro local JWT.", e);
      try {
        return await registerWithLocalJwt({ name, email, password, companyName, plan });
      } catch (err) {
        return registerLocalErrorResponse(err);
      }
    }
    console.error(e);
    return NextResponse.json(
      { error: "Falha ao criar conta no sistema." },
      { status: 500 },
    );
  }
}
