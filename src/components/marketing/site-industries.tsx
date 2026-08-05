import Link from "next/link";

type Sector = {
  id: string;
  title: string;
  headline: string;
  body: string;
  tags: string[];
  gradient: string;
  pattern: string;
};

const sectors: Sector[] = [
  {
    id: "geotecnia",
    title: "Geotecnia",
    headline: "Sondagem sem retrabalho no escritório",
    body: "SPT, perfis estratigráficos e relatórios PDF com padrão Soilsul. Tudo ligado à obra e à empresa do cliente.",
    tags: ["SPT", "PDF"],
    gradient: "from-slate-800 via-slate-900 to-[#0a1628]",
    pattern: "radial-gradient(circle at 80% 20%, rgba(0,194,168,0.35), transparent 50%)",
  },
  {
    id: "obras",
    title: "Obras & infraestrutura",
    headline: "Multi-obra, multi-cliente",
    body: "Cada consultoria gere várias obras e empresas isoladas. Portal do cliente com a sua marca.",
    tags: ["SaaS", "Portal"],
    gradient: "from-amber-950/80 via-[#1a1408] to-[var(--dg-black)]",
    pattern: "radial-gradient(circle at 70% 60%, rgba(59,158,255,0.2), transparent 50%)",
  },
  {
    id: "monitoramento",
    title: "Monitoramento",
    headline: "GEO temporal e Digital Twin",
    body: "InSAR, Landsat, taludes e integração 3D para acompanhar obras e áreas de estudo ao longo do tempo.",
    tags: ["InSAR", "3D"],
    gradient: "from-emerald-950 via-[#0a1a12] to-[var(--dg-black)]",
    pattern: "radial-gradient(circle at 20% 80%, rgba(0,194,168,0.3), transparent 45%)",
  },
];

function TagBadge({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/90">
      {label}
    </span>
  );
}

export function SiteIndustries() {
  return (
    <section id="setores" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--dg-blue)]">
              Aplicações
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Onde o DataGeo Digital faz diferença
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-[var(--dg-muted)]">
            Consultorias de geotecnia, mineração e engenharia que precisam de campo,
            relatórios e entrega num só fluxo.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sectors.map((sector) => (
            <article
              key={sector.id}
              className={`group relative min-h-[280px] overflow-hidden rounded-2xl border border-[var(--dg-border)] bg-gradient-to-br ${sector.gradient} transition hover:border-[var(--dg-cyan)]/30 hover:shadow-[0_12px_40px_rgba(0,194,168,0.12)]`}
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-80"
                style={{ background: sector.pattern }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--dg-black)] via-[var(--dg-black)]/60 to-transparent" />

              <div className="relative flex h-full flex-col justify-between p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-lg font-bold text-white/95">{sector.title}</span>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {sector.tags.map((tag) => (
                      <TagBadge key={tag} label={tag} />
                    ))}
                  </div>
                </div>

                <div className="mt-auto">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition group-hover:border-[var(--dg-cyan)]/25 group-hover:bg-white/10">
                    <p className="text-sm font-semibold text-[var(--dg-cyan)]">{sector.headline}</p>
                    <p className="mt-2 text-sm leading-relaxed text-white/75">{sector.body}</p>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/cadastro?plan=trial"
            className="rounded-full bg-[var(--dg-cyan)] px-8 py-3 text-sm font-semibold text-[var(--dg-black)] transition hover:bg-[var(--dg-blue)]"
          >
            Trial grátis 90 dias
          </Link>
          <Link
            href="/funcionalidades"
            className="text-sm font-medium text-[var(--dg-blue)] underline-offset-4 hover:underline"
          >
            Ver módulos em detalhe →
          </Link>
        </div>
      </div>
    </section>
  );
}
