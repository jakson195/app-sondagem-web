import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/marketing-shell";

export const metadata: Metadata = {
  title: {
    default: "DataGeo Digital — Geotecnia e mineração em SaaS",
    template: "%s · DataGeo Digital",
  },
  description:
    "Plataforma SaaS para geotecnia e mineração — SPT, relatórios técnicos e portal do cliente. Trial grátis 90 dias.",
  openGraph: {
    title: "DataGeo Digital",
    description: "Geotecnia e mineração — do registo ao relatório.",
    locale: "pt_BR",
    type: "website",
  },
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>;
}
