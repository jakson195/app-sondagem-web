import { isLoteamentoProductMode } from "@/lib/product-mode";
import { CtaSection } from "./cta-section";
import { HeroSection } from "./hero-section";
import { PricingSection } from "./pricing-section";
import { SiteFaq } from "./site-faq";
import { SiteIndustries } from "./site-industries";
import { SitePlatformSection } from "./site-platform-section";
import { SiteServiceGuide } from "./site-service-guide";
import { SondagemGallerySection } from "./sondagem-gallery-section";
import { SiteStatsBar } from "./site-stats-bar";

/** Landing no estilo Datageo Ntrip (APP-SOLODATANTRIP). */
export function MarketingHome() {
  const loteamento = isLoteamentoProductMode();

  return (
    <>
      <HeroSection />
      <SiteStatsBar />
      {!loteamento && <SiteServiceGuide />}
      {!loteamento && <SondagemGallerySection />}
      <SiteIndustries />
      <SitePlatformSection />
      <PricingSection />
      <SiteFaq />
      <CtaSection />
    </>
  );
}
