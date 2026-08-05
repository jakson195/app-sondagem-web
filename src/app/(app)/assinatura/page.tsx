import { SubscriptionPanel } from "@/components/saas/subscription-panel";
import { requirePlatformAdminPage } from "@/lib/platform-admin-page-guard";

type Props = {
  searchParams?: Promise<{ checkout?: string }>;
};

export default async function AssinaturaPage({ searchParams }: Props) {
  await requirePlatformAdminPage();
  const params = (await searchParams) ?? {};
  const checkoutHint =
    params.checkout === "success" || params.checkout === "cancel"
      ? params.checkout
      : undefined;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-[var(--text)]">Assinatura</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Plano, limites de uso e pagamento da empresa activa.
      </p>
      <div className="mt-8">
        <SubscriptionPanel checkoutHint={checkoutHint} />
      </div>
    </div>
  );
}
