import Link from "next/link";
import { filterModulesByProductMode } from "@/lib/product-mode";
import { MARKETING_MODULES } from "@/lib/saas/modules";

type Props = {
  showCta?: boolean;
  title?: string;
  subtitle?: string;
};

export function ModulesSection({
  showCta = true,
  title = "Módulos do sistema",
  subtitle = "Tudo o que a sua equipa precisa em campo e no escritório.",
}: Props) {
  return (
    <section id="modulos" className="py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--dg-text)] sm:text-4xl">
            {title}
          </h2>
          {subtitle ? <p className="mt-4 text-lg text-[var(--dg-muted)]">{subtitle}</p> : null}
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {filterModulesByProductMode(MARKETING_MODULES).map((mod) => {
            const Icon = mod.icon;
            return (
              <article
                key={mod.id}
                className="group rounded-2xl border border-[var(--dg-border)] bg-[var(--dg-card)] p-6 transition hover:border-[var(--dg-cyan)] hover:shadow-[0_12px_40px_rgba(0,194,168,0.08)]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--dg-cyan)]/10 text-[var(--dg-cyan)] transition group-hover:bg-[var(--dg-cyan)] group-hover:text-[var(--dg-black)]">
                  <Icon className="h-5 w-5" />
                </div>
                {mod.tag ? (
                  <span className="mt-4 inline-block rounded-md bg-[var(--dg-black)] px-2 py-0.5 text-xs font-medium text-[var(--dg-muted)]">
                    {mod.tag}
                  </span>
                ) : null}
                <h3 className="mt-3 font-semibold text-[var(--dg-text)]">{mod.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--dg-muted)]">
                  {mod.description}
                </p>
              </article>
            );
          })}
        </div>

        {showCta ? (
          <p className="mt-10 text-center text-sm text-[var(--dg-muted)]">
            <Link href="/funcionalidades" className="font-semibold text-[var(--dg-cyan)] hover:underline">
              Ver detalhes de todos os módulos →
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
