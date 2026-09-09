import type { Metadata } from "next";
import Link from "next/link";
import { ModulesSection } from "@/components/marketing/modules-section";
import { SondagemGallerySection } from "@/components/marketing/sondagem-gallery-section";
import { SiteServiceGuide } from "@/components/marketing/site-service-guide";
import { isLoteamentoProductMode } from "@/lib/product-mode";

export const metadata: Metadata = {
  title: "Funcionalidades",
};

export default function FuncionalidadesPage() {
  const loteamento = isLoteamentoProductMode();
  return (
    <>
      <section className="border-b border-[var(--dg-border)] px-4 pb-12 pt-28 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--dg-cyan)]">
            Módulos
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">Funcionalidades</h1>
          <p className="mt-4 max-w-2xl text-[var(--dg-muted)]">
            {loteamento
              ? "Ambiente CAD, GEO e estudo de viabilidade para loteamento — do desenho à análise de custos."
              : "Catálogo completo de módulos DataGeo Digital — active por empresa o que precisar."}
          </p>
        </div>
      </section>
      <ModulesSection
        showCta={false}
        title={loteamento ? "Módulos do produto" : "Catálogo de módulos"}
        subtitle=""
      />
      {!loteamento && <SondagemGallerySection />}
      {!loteamento && <SiteServiceGuide />}
      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-6xl text-center">
          <Link
            href="/cadastro?plan=trial"
            className="inline-flex rounded-full bg-[var(--dg-cyan)] px-8 py-3 text-sm font-semibold text-[var(--dg-black)] hover:bg-[var(--dg-blue)]"
          >
            Começar trial grátis (90 dias)
          </Link>
        </div>
      </section>
    </>
  );
}
