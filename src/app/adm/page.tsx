import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdmHomePage() {
  const [
    empresas,
    users,
    obras,
    furos,
    memberships,
    equipes,
    modulos,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.user.count(),
    prisma.obra.count(),
    prisma.furo.count(),
    prisma.orgMembership.count(),
    prisma.equipe.count(),
    prisma.empresaModulo.count(),
  ]);

  const cards: { label: string; value: number; href?: string }[] = [
    { label: "Empresas", value: empresas, href: "/admin/companies" },
    { label: "Utilizadores", value: users, href: "/admin/users" },
    { label: "Obras", value: obras },
    { label: "Furos", value: furos },
    { label: "Vínculos org.", value: memberships },
    { label: "Equipas", value: equipes },
    { label: "Módulos (linhas)", value: modulos },
  ];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        Controlo da plataforma
      </h1>
      <p className="mb-8 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        Este painel é a base para gerir empresas, obras, equipas, permissões,
        módulos por contrato e, mais tarde, planos e assinaturas. As contagens
        abaixo refletem o estado atual da base de dados; as ações de CRUD podem
        ser acrescentadas por secção.
      </p>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const inner = (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {c.label}
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                {c.value}
              </p>
              {c.href && (
                <p className="mt-2 text-xs font-medium text-teal-600 dark:text-teal-400">
                  Ver lista →
                </p>
              )}
            </>
          );
          return (
            <li key={c.label}>
              {c.href ? (
                <Link
                  href={c.href}
                  className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-800"
                >
                  {inner}
                </Link>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
