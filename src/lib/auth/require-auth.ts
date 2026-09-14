import { NextResponse } from "next/server";
import { withAuthTimeout } from "@/lib/auth-timeout";
import { getAuthUserFromRequest } from "@/lib/server-auth";
import { getActiveCompanyContext } from "@/lib/auth/active-company";
import { assertSubscriptionAllowsAccess } from "@/lib/saas/subscription-service";

export async function requireAuth(req: Request) {
  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return {
      user: null as null,
      company: null as null,
      response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
    };
  }
  const company = await withAuthTimeout(
    getActiveCompanyContext(user),
    "requireAuth.getActiveCompanyContext",
  );
  return { user, company, response: null as null };
}

export async function requireAuthWithActiveSubscription(req: Request) {
  const base = await requireAuth(req);
  if (base.response) return base;

  const companyId = base.company?.companyId;
  if (!companyId) {
    return {
      ...base,
      response: NextResponse.json(
        { error: "Nenhuma empresa activa. Seleccione uma empresa." },
        { status: 403 },
      ),
    };
  }

  const gate = await assertSubscriptionAllowsAccess(companyId);
  if (!gate.ok) {
    return {
      ...base,
      response: NextResponse.json(
        { error: gate.message, code: gate.code },
        { status: 402 },
      ),
    };
  }

  return base;
}
