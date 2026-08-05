import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";
import { getAuthUserFromCookies } from "@/lib/server-auth";

type SearchParams = Promise<{ q?: string }>;

const roleLabel: Record<string, string> = {
  USER: "Utilizador",
  SUPER_ADMIN: "Super admin",
  MASTER_ADMIN: "ADM mestre",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getAuthUserFromCookies();
  if (!user) redirect("/login?next=/admin/users");
  if (!isPlatformSuperAdmin(user.systemRole)) redirect("/dashboard");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { id: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      systemRole: true,
      supabaseAuthId: true,
      companies: { select: { id: true, name: true, slug: true } },
      _count: {
        select: {
          memberships: true,
          obrasCreated: true,
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            <Users className="h-7 w-7 text-teal-600" />
            Utilizadores
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Contas registadas na plataforma ({users.length}).
          </p>
        </div>
        <Link
          href="/admin/companies"
          className="text-sm font-medium text-teal-700 hover:underline dark:text-teal-400"
        >
          Ver empresas →
        </Link>
      </div>

      <form
        method="get"
        className="mt-8 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/50 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label htmlFor="q" className="text-xs font-medium text-slate-500">
            Busca
          </label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={sp.q ?? ""}
              placeholder="Email ou nome…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-teal-500/20 focus:ring-2 dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        </div>
        <button
          type="submit"
          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          Filtrar
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Utilizador</th>
              <th className="hidden px-4 py-3 md:table-cell">Papel</th>
              <th className="hidden px-4 py-3 lg:table-cell">Empresa(s) dono</th>
              <th className="px-4 py-3 text-right">Obras</th>
              <th className="px-4 py-3 text-right">Vínculos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  Nenhum utilizador encontrado.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr
                  key={u.id}
                  className="transition-colors hover:bg-teal-50/50 dark:hover:bg-teal-950/20"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {u.name ?? "—"}
                    </p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                    <p className="text-[10px] text-slate-400">ID {u.id}</p>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {roleLabel[u.systemRole] ?? u.systemRole}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {u.companies.length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <ul className="space-y-1">
                        {u.companies.map((c) => (
                          <li key={c.id}>
                            <Link
                              href={`/admin/companies/${c.id}`}
                              className="text-teal-700 hover:underline dark:text-teal-400"
                            >
                              {c.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                    {u._count.obrasCreated}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                    {u._count.memberships}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
