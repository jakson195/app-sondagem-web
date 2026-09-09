import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { isLoteamentoProductMode } from "@/lib/product-mode";

const loteamento = isLoteamentoProductMode();

export const metadata: Metadata = {
  title: {
    default: loteamento
      ? "DataGeo Digital — CAD, GEO e viabilidade"
      : "DataGeo Digital — Geotecnia e mineração em SaaS",
    template: "%s · DataGeo Digital",
  },
  description: loteamento
    ? "Ambiente CAD, mapas GEO e estudo de viabilidade para loteamento. Trial grátis 90 dias."
    : "Plataforma SaaS para geotecnia e mineração — SPT, relatórios técnicos e portal do cliente. Trial grátis 90 dias.",
  openGraph: {
    title: "DataGeo Digital",
    description: loteamento
      ? "CAD, GEO e estudo de viabilidade para loteamento."
      : "Geotecnia e mineração — do registo ao relatório.",
    locale: "pt_BR",
    type: "website",
  },
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>;
}
