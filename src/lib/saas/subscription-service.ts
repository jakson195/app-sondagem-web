import type { SaasPlanSlug, SubscriptionStatus } from "@prisma/client";
import { isAuthBypassEnabled } from "@/lib/auth-bypass";
import { isPrismaMissingTableError } from "@/lib/pg-error-utils";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/saas/plan-limits";

const TRIAL_DAYS = 90;

export function trialEndsAtFromNow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + TRIAL_DAYS);
  return d;
}

export async function provisionSubscriptionForCompany(
  companyId: number,
  plan: SaasPlanSlug,
  options?: { status?: SubscriptionStatus; trialEndsAt?: Date | null },
) {
  const limits = PLAN_LIMITS[plan];
  const status = options?.status ?? (plan === "trial" ? "TRIAL" : "ACTIVE");
  const trialEndsAt =
    options?.trialEndsAt !== undefined
      ? options.trialEndsAt
      : plan === "trial"
        ? trialEndsAtFromNow()
        : null;

  return prisma.subscription.upsert({
    where: { companyId },
    create: {
      companyId,
      plan,
      status,
      trialEndsAt,
      maxObras: limits.maxObras,
      maxUsers: limits.maxUsers,
      billingProvider: plan === "trial" ? "manual" : null,
    },
    update: {
      plan,
      status,
      trialEndsAt,
      maxObras: limits.maxObras,
      maxUsers: limits.maxUsers,
    },
  });
}

export async function syncCompanyPlanFields(companyId: number) {
  const sub = await prisma.subscription.findUnique({ where: { companyId } });
  if (!sub) return;
  await prisma.company.update({
    where: { id: companyId },
    data: {
      plan: sub.plan,
      status: sub.status,
    },
  });
}

export type SubscriptionAccessResult =
  | { ok: true }
  | { ok: false; code: "TRIAL_EXPIRED" | "SUSPENDED" | "CANCELLED" | "MISSING"; message: string };

type SubscriptionRow = Awaited<ReturnType<typeof prisma.subscription.findUnique>>;

function companyPlanToSlug(plan: string | null | undefined): SaasPlanSlug {
  if (plan === "pro" || plan === "enterprise") return plan;
  return "trial";
}

async function companySubscriptionFallback(companyId: number) {
  return prisma.company.findUnique({
    where: { id: companyId },
    select: { plan: true, status: true },
  });
}

function evaluateCompanyStatusAccess(
  status: SubscriptionStatus,
): SubscriptionAccessResult {
  if (status === "SUSPENDED") {
    return {
      ok: false,
      code: "SUSPENDED",
      message: "Assinatura suspensa. Regularize o pagamento em Assinatura.",
    };
  }
  if (status === "CANCELLED") {
    return {
      ok: false,
      code: "CANCELLED",
      message: "Assinatura cancelada. Renove o plano para continuar.",
    };
  }
  return { ok: true };
}

/** Obtém assinatura; cria a partir de `Company` se a linha ainda não existir. */
export async function getOrProvisionSubscription(companyId: number): Promise<SubscriptionRow> {
  try {
    const existing = await prisma.subscription.findUnique({ where: { companyId } });
    if (existing) return existing;
  } catch (e) {
    if (isPrismaMissingTableError(e, "Subscription")) {
      console.warn(
        "[subscription] Tabela Subscription em falta — execute scripts/sql/neon-subscription-table.sql na Neon.",
      );
      return null;
    }
    console.error("[subscription] findUnique failed", e);
    return null;
  }

  const company = await companySubscriptionFallback(companyId);
  if (!company) return null;

  try {
    return await provisionSubscriptionForCompany(companyId, companyPlanToSlug(company.plan), {
      status: company.status,
    });
  } catch (e) {
    if (isPrismaMissingTableError(e, "Subscription")) {
      return null;
    }
    console.error("[subscription] provision failed", e);
    return null;
  }
}

function evaluateSubscriptionAccess(sub: NonNullable<SubscriptionRow>): SubscriptionAccessResult {

  if (sub.status === "SUSPENDED") {
    return {
      ok: false,
      code: "SUSPENDED",
      message: "Assinatura suspensa. Regularize o pagamento em Assinatura.",
    };
  }

  if (sub.status === "CANCELLED") {
    return {
      ok: false,
      code: "CANCELLED",
      message: "Assinatura cancelada. Renove o plano para continuar.",
    };
  }

  if (sub.status === "TRIAL" && sub.trialEndsAt && sub.trialEndsAt < new Date()) {
    return {
      ok: false,
      code: "TRIAL_EXPIRED",
      message: "Trial expirado. Assine o plano Pro para continuar.",
    };
  }

  if (
    sub.status === "ACTIVE" &&
    sub.currentPeriodEnd &&
    sub.currentPeriodEnd < new Date() &&
    !sub.cancelAtPeriodEnd
  ) {
    return {
      ok: false,
      code: "SUSPENDED",
      message: "Período de assinatura expirado. Actualize o pagamento.",
    };
  }

  return { ok: true };
}

export async function assertSubscriptionAllowsAccess(
  companyId: number,
): Promise<SubscriptionAccessResult> {
  const sub = await getOrProvisionSubscription(companyId);
  if (!sub) {
    if (isAuthBypassEnabled()) {
      return { ok: true };
    }
    const company = await companySubscriptionFallback(companyId);
    if (company) {
      return evaluateCompanyStatusAccess(company.status);
    }
    return {
      ok: false,
      code: "MISSING",
      message:
        "Assinatura não configurada. Execute na Neon: scripts/sql/neon-subscription-table.sql (ou npm run db:push).",
    };
  }
  return evaluateSubscriptionAccess(sub);
}

export async function activatePaidSubscription(input: {
  companyId: number;
  plan: SaasPlanSlug;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  currentPeriodEnd?: Date | null;
}) {
  const limits = PLAN_LIMITS[input.plan];
  const now = new Date();
  const sub = await prisma.subscription.upsert({
    where: { companyId: input.companyId },
    create: {
      companyId: input.companyId,
      plan: input.plan,
      status: "ACTIVE",
      trialEndsAt: null,
      currentPeriodStart: now,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      billingProvider: "stripe",
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      stripePriceId: input.stripePriceId ?? null,
      maxObras: limits.maxObras,
      maxUsers: limits.maxUsers,
    },
    update: {
      plan: input.plan,
      status: "ACTIVE",
      trialEndsAt: null,
      currentPeriodStart: now,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      billingProvider: "stripe",
      stripeCustomerId: input.stripeCustomerId ?? undefined,
      stripeSubscriptionId: input.stripeSubscriptionId ?? undefined,
      stripePriceId: input.stripePriceId ?? undefined,
      maxObras: limits.maxObras,
      maxUsers: limits.maxUsers,
    },
  });
  await syncCompanyPlanFields(input.companyId);
  return sub;
}

export async function countCompanyObras(companyId: number) {
  return prisma.obra.count({ where: { companyId } });
}

export async function countCompanyUsers(companyId: number) {
  return prisma.orgMembership.count({ where: { empresaId: companyId } });
}
