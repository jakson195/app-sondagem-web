"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { apiUrl } from "@/lib/api-url";
import { useObraModulos } from "@/components/obra-context";
import { AppSidebarNav } from "@/components/sidebar/app-sidebar-nav";
import { CompanySwitcher } from "@/components/saas/company-switcher";
import { useModuleNav } from "@/hooks/use-module-nav";
import { isPlatformAdminNavHref } from "@/lib/platform-admin-nav";

/** Rotas ocultas no menu (módulos permanecem acessíveis por URL directa). */
const hiddenNavPathPrefixes = [
  "/geofisica",
  "/hidrologia/chuvas-sc",
  "/hidrologia/chuvas-br",
] as const;

function isHiddenNavHref(href: string): boolean {
  const path = href.split("?")[0] ?? href;
  return hiddenNavPathPrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

const coreNav = [
  { href: "/dashboard", label: "📊 Painel" },
  { href: "/cad", label: "📐 Ambiente CAD" },
  { href: "/hidrologia/hidrogeo-brasil", label: "🗺️ HidroGeo Brasil (CPRM + ANM)" },
  { href: "/mineracao/leilao-anm", label: "⛏️ ANM · Leilão SOPLE" },
  { href: "/obras", label: "📁 Obras · mapas" },
  { href: "/obra", label: "🏗️ Nova obra" },
  { href: "/gestao-empresa", label: "🏢 Gestão · empresas" },
  { href: "/assinatura", label: "💳 Assinatura" },
  { href: "/admin/companies", label: "🏛️ Empresas · admin" },
] as const;

function hrefWithObra(base: string, obraId: number | null) {
  if (obraId == null) return base;
  return `${base}?obraId=${obraId}`;
}

async function sair() {
  try {
    await fetch(apiUrl("/api/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* limpar cookie mesmo assim */
  }
  window.location.href = "/login";
}

function ObraContextCard({
  selectedObraId,
  obraNome,
  onClear,
}: {
  selectedObraId: number;
  obraNome: string | null;
  onClear: () => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-dg-border bg-dg-card/80 px-3 py-2 text-xs text-dg-muted">
      <p className="truncate font-medium text-dg-text" title={obraNome ?? ""}>
        {obraNome ?? `Obra #${selectedObraId}`}
      </p>
      <p className="mt-0.5 text-[10px] text-dg-muted">Menu filtrado por esta obra</p>
      <button
        type="button"
        onClick={onClear}
        className="dg-btn-outline mt-2 w-full py-1 text-[11px]"
      >
        Limpar obra do menu
      </button>
    </div>
  );
}

function LogoutButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        void sair();
      }}
      className="dg-nav-item flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium"
    >
      <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} />
      Sair
    </button>
  );
}

function GlobalQuickActions({
  selectedObraId,
  setObraContext,
  pathname,
  search,
  isPlatformAdmin,
}: {
  selectedObraId: number | null;
  setObraContext: (id: number | null) => void;
  pathname: string;
  search: string;
  isPlatformAdmin: boolean;
}) {
  const [obras, setObras] = useState<Array<{ id: number; nome: string }>>([]);
  const [loadingObras, setLoadingObras] = useState(false);
  const [obrasHint, setObrasHint] = useState<string | null>(null);
  const obraHref = hrefWithObra("/obra", selectedObraId);
  const empresaHref = hrefWithObra("/gestao-empresa", selectedObraId);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingObras(true);
    void (async () => {
      try {
        const response = await fetch(apiUrl("/api/obra"), { credentials: "include" });
        const data = (await response.json().catch(() => [])) as
          | Array<{ id: number; nome: string }>
          | { error?: string };
        if (cancelled) return;
        if (!response.ok || !Array.isArray(data)) {
          setObras([]);
          const errMsg =
            typeof data === "object" &&
            data !== null &&
            !Array.isArray(data) &&
            "error" in data &&
            typeof (data as { error?: string }).error === "string"
              ? (data as { error: string }).error
              : response.status === 401
                ? "Sessão expirada — faça login."
                : "Não foi possível carregar obras.";
          setObrasHint(errMsg);
          return;
        }
        setObras(data.map((item) => ({ id: item.id, nome: item.nome })));
        setObrasHint(
          data.length === 0
            ? "Nenhuma obra cadastrada — use «Criar obra»."
            : null,
        );
      } catch {
        if (!cancelled) {
          setObras([]);
          setObrasHint("Falha de rede ao carregar obras.");
        }
      } finally {
        if (!cancelled) setLoadingObras(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const copyLink = useCallback(async (includeObra: boolean) => {
    const url = new URL(window.location.origin + pathname);
    const params = new URLSearchParams(search);
    if (includeObra && selectedObraId != null) {
      params.set("obraId", String(selectedObraId));
    }
    url.search = params.toString();
    await navigator.clipboard.writeText(url.toString());
    setCopyMsg(includeObra ? "Weblink da aba + obra copiado." : "Weblink da aba copiado.");
    window.setTimeout(() => setCopyMsg(null), 2500);
  }, [pathname, search, selectedObraId]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
      <label className="flex min-w-[18rem] flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
        <span className="text-xs font-medium text-[var(--muted)]">Obra (projeto)</span>
        <select
          value={selectedObraId ?? ""}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!event.target.value || !Number.isFinite(next)) {
              setObraContext(null);
              return;
            }
            setObraContext(next);
          }}
          disabled={loadingObras}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text)]"
        >
          <option value="">— Escolher obra —</option>
          {obras.map((obra) => (
            <option key={obra.id} value={obra.id}>
              {obra.nome}
            </option>
          ))}
        </select>
        {obrasHint && (
          <span className="text-[11px] text-amber-700 dark:text-amber-300">
            {obrasHint}
          </span>
        )}
      </label>
      {isPlatformAdmin && (
        <Link
          href={empresaHref}
          className="dg-btn-outline"
        >
          Cadastrar empresa
        </Link>
      )}
      <Link href={obraHref} className="dg-btn-primary">
        Criar obra
      </Link>
      <button
        type="button"
        onClick={() => void copyLink(false)}
        className="dg-btn-outline"
      >
        Copiar weblink da aba
      </button>
      <button
        type="button"
        onClick={() => void copyLink(true)}
        disabled={selectedObraId == null}
        className="dg-btn-outline disabled:cursor-not-allowed disabled:opacity-60"
      >
        Copiar weblink aba + projeto
      </button>
      {copyMsg && <span className="text-xs text-[var(--muted)]">{copyMsg}</span>}
    </div>
  );
}

export function AppShell({
  children,
  isPlatformAdmin = false,
}: {
  children: React.ReactNode;
  isPlatformAdmin?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const {
    selectedObraId,
    obraNome,
    modules,
    modulesLoading,
    setObraContext,
  } = useObraModulos();

  const moduleNav = useModuleNav({
    obraId: selectedObraId,
    obraModules: modules,
    modulesLoading,
  });

  const flatNavItems = useMemo(() => {
    const mod = moduleNav.map((item) => ({
      href: hrefWithObra(item.href, selectedObraId),
      label: item.label,
    }));
    const insertAt = 1;
    return [
      ...coreNav.slice(0, insertAt).map((x) => ({
        href: hrefWithObra(x.href, selectedObraId),
        label: x.label,
      })),
      ...mod,
      ...coreNav.slice(insertAt).map((x) => ({
        href: hrefWithObra(x.href, selectedObraId),
        label: x.label,
      })),
    ].filter(
      (item) =>
        !isHiddenNavHref(item.href) &&
        (isPlatformAdmin || !isPlatformAdminNavHref(item.href)),
    );
  }, [moduleNav, selectedObraId, isPlatformAdmin]);

  return (
    <div className="dg-mesh-bg flex min-h-screen bg-[var(--surface)]">
      {/* Desktop sidebar */}
      <aside className="dg-sidebar hidden w-64 shrink-0 p-5 print:hidden md:flex md:flex-col">
        <div className="mb-6">
          <BrandLogo href="/dashboard" height={36} />
        </div>
        <CompanySwitcher isPlatformAdmin={isPlatformAdmin} />
        <AppSidebarNav pathname={pathname} flatItems={flatNavItems} />
        {selectedObraId != null && (
          <ObraContextCard
            selectedObraId={selectedObraId}
            obraNome={obraNome}
            onClear={() => setObraContext(null)}
          />
        )}
        <div className="mt-auto border-t border-dg-border pt-4">
          <LogoutButton />
        </div>
      </aside>

      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200 print:hidden md:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!mobileOpen}
        onClick={() => setMobileOpen(false)}
      />
      <aside
        className={`dg-sidebar fixed inset-y-0 left-0 z-50 flex w-[min(100%-3rem,18rem)] flex-col p-5 shadow-xl transition-transform duration-300 ease-out print:hidden md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center justify-between gap-2">
          <BrandLogo href="/dashboard" height={32} />
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="dg-nav-item rounded-lg p-2"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <CompanySwitcher isPlatformAdmin={isPlatformAdmin} />
        <AppSidebarNav
          pathname={pathname}
          flatItems={flatNavItems}
          onNavigate={() => setMobileOpen(false)}
        />
        {selectedObraId != null && (
          <ObraContextCard
            selectedObraId={selectedObraId}
            obraNome={obraNome}
            onClear={() => {
              setMobileOpen(false);
              setObraContext(null);
            }}
          />
        )}
        <div className="border-t border-dg-border pt-4">
          <LogoutButton onClick={() => setMobileOpen(false)} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/90 px-4 backdrop-blur-md print:hidden md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="dg-nav-item rounded-lg p-2 text-[var(--text)]"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <BrandLogo href="/dashboard" height={28} />
        </header>
        <main className="dg-grid-bg flex-1 px-4 py-6 print:bg-white print:px-2 print:py-2 sm:px-6 lg:px-8">
          <GlobalQuickActions
            selectedObraId={selectedObraId}
            setObraContext={setObraContext}
            pathname={pathname}
            search={searchParams?.toString() ?? ""}
            isPlatformAdmin={isPlatformAdmin}
          />
          {children}
        </main>
      </div>
    </div>
  );
}
