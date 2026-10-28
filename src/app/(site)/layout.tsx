import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { getProductMode } from "@/lib/product-mode";

const productMode = getProductMode();

export const metadata: Metadata = {
  title: {
    default:
      productMode === "SONDAGEM"
        ? "DataGeo Digital — Sondagem de campo"
        : productMode === "LOTEAMENTO"
          ? "DataGeo Digital — CAD, GEO e viabilidade"
          : "DataGeo Digital — Geotecnia e mineração em SaaS",
    template: "%s · DataGeo Digital",
  },
  description:
    productMode === "SONDAGEM"
      ? "SPT, rotativa, trado, poços e relatórios técnicos. Trial grátis 90 dias."
      : productMode === "LOTEAMENTO"
        ? "Ambiente CAD, mapas GEO e estudo de viabilidade para loteamento. Trial grátis 90 dias."
        : "Plataforma SaaS para geotecnia e mineração — SPT, relatórios técnicos e portal do cliente. Trial grátis 90 dias.",
  openGraph: {
    title: "DataGeo Digital",
    description:
      productMode === "SONDAGEM"
        ? "Sondagem de campo — do registo no furo ao relatório."
        : productMode === "LOTEAMENTO"
          ? "CAD, GEO e estudo de viabilidade para loteamento."
          : "Geotecnia e mineração — do registo ao relatório.",
    locale: "pt_BR",
    type: "website",
  },
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>;
}
