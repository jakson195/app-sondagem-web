import type { Metadata } from "next";
import { isLoteamentoProductMode } from "@/lib/product-mode";
import "./globals.css";

const loteamento = isLoteamentoProductMode();

export const metadata: Metadata = {
  title: {
    default: "DataGeo Digital",
    template: "%s · DataGeo Digital",
  },
  description: loteamento
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
