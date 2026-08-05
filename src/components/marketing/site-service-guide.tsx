import Link from "next/link";
import type { ReactNode } from "react";

type GuideBlock = {
  id: string;
  title: string;
  subtitle: string;
  accent: "accent" | "drone";
  icon: ReactNode;
  items: { label: string; text: string }[];
};

const blocks: GuideBlock[] = [
  {
    id: "fluxo",
    title: "Do cadastro ao relatório",
    subtitle: "Fluxo em 4 etapas — da conta à entrega ao cliente",
    accent: "accent",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 12h4l2-4 4 8 2-4h4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    items: [
      { label: "01", text: "Crie a conta, convide a equipa e active os módulos (SPT, GEO, CAD)." },
      { label: "02", text: "Registe dados de campo: furos SPT, fotos e coordenadas por obra." },
      { label: "03", text: "Visualize mapas, perfis e resumos técnicos no painel da obra." },
      { label: "04", text: "Gere relatórios PDF e partilhe no portal do cliente com a sua marca." },
    ],
  },
  {
    id: "pacote",
    title: "O que a plataforma inclui",
    subtitle: "Módulos DataGeo Digital",
    accent: "drone",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    items: [
      { label: "SPT", text: "Registo de campo, gráficos NSPT e relatórios alinhados ao padrão Soilsul." },
      { label: "CAD", text: "Ambiente técnico para plantas, coordenadas e exportação." },
      { label: "GEO", text: "Mapas, InSAR, Landsat e camadas de contexto por obra." },
      { label: "Portal", text: "Área do cliente white-label por empresa." },
      { label: "SaaS", text: "Trial 90 dias e planos conforme acordo comercial." },
    ],
  },
  {
    id: "checklist",
    title: "Checklist antes de começar",
    subtitle: "Evite retrabalho no escritório",
    accent: "accent",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    items: [
      { label: "Obra", text: "Crie a obra com localização e módulos activos antes do campo." },
      { label: "Equipa", text: "Defina quem acede à conta e mantenha obras isoladas por utilizador." },
      { label: "Campo", text: "Registe furos com código, coordenadas e ensaios SPT no mesmo fluxo." },
      { label: "Plano", text: "Trial 90 dias grátis; contacte-nos para ampliar limites." },
    ],
  },
];

function accentClass(accent: GuideBlock["accent"]) {
  return accent === "drone"
    ? "border-[var(--dg-blue)] text-[var(--dg-blue)] bg-[var(--dg-blue)]/10"
    : "border-[var(--dg-cyan)] text-[var(--dg-cyan)] bg-[var(--dg-cyan)]/10";
}

export function SiteServiceGuide() {
  return (
    <section
      id="como-funciona"
      className="scroll-mt-24 border-y border-[var(--dg-border)] bg-[#0a0e14] py-20 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--dg-cyan)]">
            Guia da plataforma
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Geotecnia e mineração, explicados de forma directa
          </h2>
          <p className="mt-3 text-[var(--dg-muted)]">
            Estrutura pensada para consultorias que precisam de rigor técnico, isolamento
            por cliente e velocidade no dia a dia.
          </p>
        </div>

        <div className="mt-12 space-y-6">
          {blocks.map((block, index) => (
            <article
              key={block.id}
              className={`flex flex-col overflow-hidden rounded-2xl border border-[var(--dg-border)] bg-[var(--dg-card)]/80 ${
                index % 2 === 0 ? "lg:flex-row" : "lg:flex-row-reverse"
              }`}
            >
              <div
                className={`flex shrink-0 flex-col justify-center border-b border-[var(--dg-border)] px-6 py-8 lg:w-72 lg:border-b-0 ${
                  index % 2 === 1
                    ? "lg:border-l lg:border-[var(--dg-border)] lg:bg-[var(--dg-blue)]/5"
                    : "lg:border-r lg:border-[var(--dg-border)] lg:bg-[var(--dg-cyan)]/5"
                }`}
              >
                <div
                  className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border ${accentClass(block.accent)}`}
                >
                  {block.icon}
                </div>
                <h3 className="text-xl font-semibold">{block.title}</h3>
                <p className="mt-2 text-sm text-[var(--dg-muted)]">{block.subtitle}</p>
              </div>

              <ul className="flex flex-1 flex-col justify-center divide-y divide-[var(--dg-border)]/80 px-6 py-2 sm:px-8">
                {block.items.map((item) => (
                  <li key={item.label} className="flex gap-4 py-4">
                    <span
                      className={`mt-0.5 flex h-8 min-w-8 items-center justify-center rounded-md text-xs font-bold ${accentClass(block.accent)}`}
                    >
                      {item.label}
                    </span>
                    <p className="text-sm leading-relaxed text-[var(--dg-text)]/90">{item.text}</p>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/funcionalidades"
            className="rounded-full bg-[var(--dg-blue)] px-6 py-3 text-sm font-semibold text-[var(--dg-black)] transition hover:opacity-90"
          >
            Ver todos os módulos
          </Link>
          <Link
            href="/contato"
            className="rounded-full border border-[var(--dg-border)] px-6 py-3 text-sm font-medium transition hover:border-[var(--dg-cyan)]/50"
          >
            Falar com especialista
          </Link>
        </div>
      </div>
    </section>
  );
}
