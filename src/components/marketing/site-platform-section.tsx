import Link from "next/link";
import { MARKETING_MODULES } from "@/lib/saas/modules";

export function SitePlatformSection() {
  const preview = MARKETING_MODULES.slice(0, 6);

  return (
    <section id="plataforma" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Campo + escritório num só lugar
            </h2>
            <p className="mt-4 leading-relaxed text-[var(--dg-muted)]">
              Sondagem SPT, mapas, relatórios PDF e portal do cliente — com dados
              guardados por obra na cloud.
            </p>
            <ul className="mt-8 space-y-3 text-sm">
              {[
                "Registo de furos e ensaios SPT em campo",
                "Contas isoladas por utilizador",
                "Relatórios PDF e portal do cliente",
                "Deploy cloud e acesso por browser",
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-0.5 text-[var(--dg-cyan)]">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-[var(--dg-border)] bg-[var(--dg-card)] p-6 sm:p-8">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--dg-cyan)]">
              Módulos activos
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {preview.map((mod) => {
                const Icon = mod.icon;
                return (
                  <li
                    key={mod.id}
                    className="flex gap-3 rounded-xl border border-[var(--dg-border)] bg-[var(--dg-black)]/60 p-3"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--dg-cyan)]/10 text-[var(--dg-cyan)]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">{mod.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-[var(--dg-muted)]">
                        {mod.description}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Link
              href="/funcionalidades"
              className="mt-4 inline-block text-sm text-[var(--dg-cyan)] hover:underline"
            >
              Ver catálogo completo →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
