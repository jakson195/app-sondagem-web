import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";
import { appBaseUrl, getStripe, isStripeConfigured } from "@/lib/billing/stripe-config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe não configurado." }, { status: 503 });
  }

  const { user, company, response } = await requireAuth(req);
  if (response) return response;
  if (!user || !isPlatformSuperAdmin(user.systemRole)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  if (!company) {
    return NextResponse.json({ error: "Empresa activa não definida." }, { status: 400 });
  }

  const sub = await prisma.subscription.findUnique({
    where: { companyId: company.companyId },
  });
  if (!sub?.stripeCustomerId) {
    return NextResponse.json(
      { error: "Cliente Stripe ainda não criado. Inicie o checkout Pro." },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${appBaseUrl(req)}/assinatura`,
  });

  return NextResponse.json({ url: session.url });
}
