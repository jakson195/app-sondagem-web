import { NextResponse } from "next/server";
import { withAuthTimeout } from "@/lib/auth-timeout";
import { requireAuth } from "@/lib/auth/require-auth";
import { isPrismaTableKnownMissing } from "@/lib/prisma-schema-circuit";
import {
  assertSubscriptionAllowsAccess,
  getOrProvisionSubscription,
} from "@/lib/saas/subscription-service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, company, response } = await requireAuth(req);
  if (response) return response;

  const subscription =
    company && !isPrismaTableKnownMissing("Subscription")
      ? await withAuthTimeout(
          getOrProvisionSubscription(company.companyId),
          "auth.me.subscription",
        )
      : null;

  const access = company
    ? await assertSubscriptionAllowsAccess(company.companyId)
    : { ok: true as const };

  return NextResponse.json({
    user: {
      id: user!.id,
      email: user!.email,
      name: user!.name,
      systemRole: user!.systemRole,
    },
    activeCompany: company,
    subscription: subscription
      ? {
          plan: subscription.plan,
          status: subscription.status,
          trialEndsAt: subscription.trialEndsAt,
          currentPeriodEnd: subscription.currentPeriodEnd,
          maxObras: subscription.maxObras,
          maxUsers: subscription.maxUsers,
        }
      : null,
    subscriptionAccess: access,
  });
}
