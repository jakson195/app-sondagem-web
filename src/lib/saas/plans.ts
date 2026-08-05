/**
 * Planos comerciais DataGeo Digital (site — valores sob consulta).
 */

export type SaasPlanId = "trial" | "pro" | "enterprise";

export type SaasPlan = {
  id: SaasPlanId;
  name: string;
  description: string;
  priceLabel: string;
  priceDetail?: string;
  highlighted?: boolean;
  cta: string;
  ctaHref: string;
  features: string[];
};

export const SAAS_PLANS: SaasPlan[] = [
  {
    id: "trial",
    name: "Trial",
    description: "Experimente a plataforma com a sua equipa.",
    priceLabel: "Grátis",
    priceDetail: "90 dias · 2 obras",
    cta: "Começar grátis",
    ctaHref: "/cadastro?plan=trial",
    features: [
      "SPT e relatórios básicos",
      "2 obras",
      "Suporte por e-mail",
      "Sem cartão de crédito",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "Para consultorias e equipas de campo em crescimento.",
    priceLabel: "Sob consulta",
    priceDetail: "contacte-nos",
    highlighted: true,
    cta: "Falar com vendas",
    ctaHref: "/contato?assunto=pro",
    features: [
      "Todos os módulos de geotecnia",
      "Mais obras e utilizadores",
      "Portal do cliente",
      "InSAR / GEO temporal (módulos)",
      "Prioridade no suporte",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Grandes volumes, SLA e integrações sob medida.",
    priceLabel: "Sob consulta",
    priceDetail: "contrato anual",
    cta: "Falar com vendas",
    ctaHref: "/contato?assunto=enterprise",
    features: [
      "Tudo do Pro",
      "SSO e API dedicada",
      "Implementação assistida",
      "Formação e implementação",
      "Gestor de conta dedicado",
    ],
  },
];
