import type { Metadata } from "next";
import { getProductMode } from "@/lib/product-mode";
import "./globals.css";

const productMode = getProductMode();

export const metadata: Metadata = {
  title: {
    default: "DataGeo Digital",
    template: "%s · DataGeo Digital",
  },
  description:
    productMode === "SONDAGEM"
      ? "Sondagem SPT, rotativa, trado e poços — do registo de campo ao relatório."
      : productMode === "LOTEAMENTO"
        ? "Ambiente CAD, mapas GEO e estudo de viabilidade para loteamento."
        : "Plataforma SaaS de geotecnia e mineração — SPT, relatórios e portal do cliente.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
