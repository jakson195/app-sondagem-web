import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Building2,
  FolderKanban,
  MapPin,
} from "lucide-react";
import { listAccessibleCompanyIdsForUser } from "@/lib/client-portal-auth";
import { scopeWhereObrasForUser, userOwnsObra } from "@/lib/obra-access";
import { prisma } from "@/lib/prisma";
import { OBRA_STATUS_LABEL, OBRA_STATUS_ORDER } from "@/lib/obra-status";
import { getAuthUserFromCookies } from "@/lib/server-auth";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ obraId?: string; projectId?: string }>;
}) {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const q = (await searchParams) ?? {};
  const filtroObraRaw = q.obraId ?? q.projectId ?? "";
  const filtroObraId = Number(filtroObraRaw);
  const accessibleCompanyIds = await listAccessibleCompanyIdsForUser(user);
  const obraScope =
    user.systemRole === "USER" ? await scopeWhereObrasForUser(user) : {};

  const [empresaCount, obraCount, companiesWithObras, statusRows, recent] =
    await Promise.all([
      prisma.company.count({
        where:
          user.systemRole === "USER"
            ? { id: { in: accessibleCompanyIds.length > 0 ? accessibleCompanyIds : [-1] } }
            : undefined,
      }),
      prisma.obra.count({ where: obraScope }),
      prisma.company.count({
        where:
          user.systemRole === "USER"
            ? {
                id: { in: accessibleCompanyIds.length > 0 ? accessibleCompanyIds : [-1] },
                obras: { some: { createdByUserId: user.id } },
              }
            : { obras: { some: {} } },
      }),
      prisma.obra.groupBy({
        by: ["status"],
        where: obraScope,
        _count: { _all: true },
      }),
      prisma.obra.findMany({
        take: 10,
        orderBy: { id: "desc" },
        where: obraScope,
        include: {
          company: { select: { id: true, name: true } },
        },
      }),
    ]);

  const obraResumo =
    Number.isFinite(filtroObraId) && filtroObraId > 0
      ? await prisma.obra.findUnique({
          where: { id: filtroObraId },
          include: {
            _count: { select: { furos: true } },
          },
        })
      : null;

  if (
    obraResumo &&
    user.systemRole === "USER" &&
    (!accessibleCompanyIds.includes(obraResumo.companyId) ||
      !userOwnsObra(user, obraResumo))
  ) {
    redirect("/dashboard");
  }

  const [furosByTipo, sptRowsCount, vesCount] =
    obraResumo != null
      ? await Promise.all([
          prisma.furo.groupBy({
            by: ["tipo"],
            where: { obraId: obraResumo.id },
            _count: { _all: true },
          }),
          prisma.sPT.count({ where: { furo: { obraId: obraResumo.id } } }),
          prisma.vESProject.count({ where: { projectId: obraResumo.id } }),
        ])
      : [[], 0, 0];

  const byStatus = new Map(
    statusRows.map((r) => [r.status, r._count._all]),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-3xl">
            Painel DataGeo Digital
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {user.systemRole === "USER"
              ? "Resumo das suas obras de campo."
              : "Visão multiempresa: empresas contratantes e obras de campo."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/obra"
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-500"
          >
            Nova obra
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/obras"
            className="inline-flex items-center rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface)]"
          >
            Todas as obras
          </Link>
        </div>
      </div>

      <div className={`grid gap-4 ${user.systemRole === "USER" ? "sm:grid-cols-1" : "sm:grid-cols-3"}`}>
        {user.systemRole !== "USER" && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-400">
                <Building2 className="h-5 w-5" strokeWidth={2} />
              </span>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-[var(--text)]">
                  {empresaCount}
                </p>
                <p className="text-sm text-[var(--muted)]">Empresas</p>
              </div>
            </div>
          </div>
        )}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent)]">
              <FolderKanban className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-[var(--text)]">
                {obraCount}
              </p>
              <p className="text-sm text-[var(--muted)]">Obras (projetos)</p>
            </div>
          </div>
        </div>
        {user.systemRole !== "USER" && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <MapPin className="h-5 w-5" strokeWidth={2} />
              </span>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-[var(--text)]">
                  {companiesWithObras}
                </p>
                <p className="text-sm text-[var(--muted)]">Empresas com obras</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {obraResumo && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm lg:col-span-2">
            <h2 className="text-base font-semibold text-[var(--text)]">
              Dashboard da obra: {obraResumo.nome}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Filtro por obra ativo para visão técnica e contadores.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["SPT", furosByTipo.find((x) => x.tipo === "spt")?._count._all ?? 0],
                ["Rotativa", furosByTipo.find((x) => x.tipo === "rotativa")?._count._all ?? 0],
                ["Trado", furosByTipo.find((x) => x.tipo === "trado")?._count._all ?? 0],
                ["Poços", furosByTipo.find((x) => x.tipo === "piezo")?._count._all ?? 0],
                ["Resistividade", vesCount],
                ["Amostras SPT", sptRowsCount],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg bg-[var(--surface)] px-3 py-2">
                  <p className="text-xs text-[var(--muted)]">{label}</p>
                  <p className="text-lg font-semibold text-[var(--text)]">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Obras por estado
          </h2>
          <ul className="mt-3 space-y-2">
            {OBRA_STATUS_ORDER.map((s) => (
              <li
                key={s}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-[var(--text)]">{OBRA_STATUS_LABEL[s]}</span>
                <span className="tabular-nums font-medium text-[var(--muted)]">
                  {byStatus.get(s) ?? 0}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
          <div className="flex flex-col gap-1 border-b border-[var(--border)] px-5 py-4">
            <h2 className="text-base font-semibold text-[var(--text)]">
              Obras recentes
            </h2>
            <p className="text-sm text-[var(--muted)]">
              Cada obra está ligada a uma empresa.
            </p>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {recent.length === 0 ? (
              <li className="px-5 py-8 text-center text-sm text-[var(--muted)]">
                Ainda não há obras.{" "}
                <Link href="/obra" className="font-medium text-teal-600 hover:underline">
                  Criar a primeira
                </Link>
              </li>
            ) : (
              recent.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/obra/${o.id}`}
                      className="font-medium text-teal-600 hover:underline dark:text-teal-400"
                    >
                      {o.nome}
                    </Link>
                    <p className="truncate text-sm text-[var(--muted)]">
                      <span className="text-[var(--text)]">{o.company.name}</span>
                      {" · "}
                      {o.cliente}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--surface)] px-2.5 py-0.5 text-xs font-medium text-[var(--muted)]">
                    {OBRA_STATUS_LABEL[o.status]}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
