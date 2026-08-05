import type { Metadata } from "next";
import { PricingSection } from "@/components/marketing/pricing-section";
import { CtaSection } from "@/components/marketing/cta-section";

export const metadata: Metadata = {
  title: "Planos",
};

export default function PlanosPage() {
  return (
    <>
      <section className="border-b border-[var(--dg-border)] px-4 pb-8 pt-28 sm:px-6">
        <div className="mx-auto max-w-6xl text-center">
          <h1 className="text-4xl font-bold tracking-tight">Planos</h1>
          <p className="mx-auto mt-4 max-w-xl text-[var(--dg-muted)]">
            Trial 90 dias grátis. Planos Pro e Enterprise sob consulta.
          </p>
        </div>
      </section>
      <PricingSection compact />
      <CtaSection />
    </>
  );
}
