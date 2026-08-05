import Link from "next/link";
import { SAAS_PLANS } from "@/lib/saas/plans";

type Props = {
  compact?: boolean;
};

export function PricingSection({ compact = false }: Props) {
  return (
    <section id="planos" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
        <h2 className="text-3xl font-bold sm:text-4xl">Planos flexíveis</h2>
        <p className="mx-auto mt-4 max-w-xl text-[var(--dg-muted)]">
          Trial 90 dias sem cartão. Valores Pro e Enterprise mediante contacto comercial.
        </p>

        <div className={`mt-12 grid gap-6 ${compact ? "md:grid-cols-3" : "lg:grid-cols-3"}`}>
          {SAAS_PLANS.map((plan) => (
            <article
              key={plan.id}
              className={`flex flex-col rounded-2xl border p-6 text-left ${
                plan.highlighted
                  ? "border-[var(--dg-cyan)] bg-[var(--dg-cyan)]/5 shadow-[0_0_40px_var(--site-accent-glow)]"
                  : "border-[var(--dg-border)] bg-[var(--dg-card)]"
              }`}
            >
              {plan.highlighted ? (
                <span className="mb-2 inline-block w-fit rounded-full bg-[var(--dg-cyan)] px-2 py-0.5 text-xs font-semibold text-[var(--dg-black)]">
                  Mais popular
                </span>
              ) : null}
              <h3 className="font-semibold">{plan.name}</h3>
              <p className="mt-4">
                <span className="text-3xl font-bold">{plan.priceLabel}</span>
                {plan.priceDetail ? (
                  <span className="text-[var(--dg-muted)]"> {plan.priceDetail}</span>
                ) : null}
              </p>
              <p className="mt-3 text-sm text-[var(--dg-muted)]">{plan.description}</p>
              <ul className="mt-6 flex-1 space-y-2 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-[var(--dg-cyan)]">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.ctaHref}
                className={`mt-8 block rounded-full py-3 text-center text-sm font-medium transition ${
                  plan.highlighted
                    ? "bg-[var(--dg-cyan)] text-[var(--dg-black)] hover:bg-[var(--dg-blue)]"
                    : "border border-[var(--dg-border)] hover:border-[var(--dg-cyan)]/40"
                }`}
              >
                {plan.cta}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
