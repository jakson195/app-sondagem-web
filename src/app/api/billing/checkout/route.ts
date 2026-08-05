import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";
import { getBillingProvider } from "@/lib/billing/mercadopago-config";
import { appBaseUrl, getStripe, isStripeConfigured, stripePriceIdForPlan } from "@/lib/billing/stripe-config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const provider = getBillingProvider();
  if (provider === "mercadopago") {
    return NextResponse.json(
      {
        error:
          "Checkout Mercado Pago em preparação. Use BILLING_PROVIDER=stripe ou contacte vendas.",
        provider: "mercadopago",
      },
      { status: 501 },
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe não configurado. Defina STRIPE_SECRET_KEY e STRIPE_PRICE_ID_PRO." },
      { status: 503 },
    );
  }

  const { user, company, response } = await requireAuth(req);
  if (response) return response;
  if (!user || !isPlatformSuperAdmin(user.systemRole)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  if (!company) {
    return NextResponse.json({ error: "Empresa activa não definida." }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* default pro */
  }

  const plan = body.plan === "pro" ? "pro" : "pro";
  const priceId = stripePriceIdForPlan(plan);
  if (!priceId) {
    return NextResponse.json({ error: "Preço Stripe não configurado." }, { status: 503 });
  }

  const stripe = getStripe();
  const base = appBaseUrl(req);

  let sub = await prisma.subscription.findUnique({
    where: { companyId: company.companyId },
  });

  let customerId = sub?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user!.email,
      name: company.companyName,
      metadata: {
        companyId: String(company.companyId),
        userId: String(user!.id),
      },
    });
    customerId = customer.id;
    sub = await prisma.subscription.upsert({
      where: { companyId: company.companyId },
      create: {
        companyId: company.companyId,
        plan: "trial",
        status: "TRIAL",
        stripeCustomerId: customerId,
        billingProvider: "stripe",
      },
      update: { stripeCustomerId: customerId, billingProvider: "stripe" },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/assinatura?checkout=success`,
    cancel_url: `${base}/assinatura?checkout=cancel`,
    metadata: {
      companyId: String(company.companyId),
      plan,
      userId: String(user!.id),
    },
    subscription_data: {
      metadata: {
        companyId: String(company.companyId),
        plan,
      },
    },
  });

  return NextResponse.json({ url: session.url });
}
