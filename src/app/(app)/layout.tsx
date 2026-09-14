import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ObraModulosProvider } from "@/components/obra-context";
import { isAuthBypassEnabled } from "@/lib/auth-bypass";
import { getActiveCompanyContext } from "@/lib/auth/active-company";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";
import { AUTH_REQUEST_TIMEOUT_MS, withAuthTimeout } from "@/lib/auth-timeout";
import { assertSubscriptionAllowsAccess } from "@/lib/saas/subscription-service";
import { getAuthUserFromCookies } from "@/lib/server-auth";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user: Awaited<ReturnType<typeof getAuthUserFromCookies>> = null;
  try {
    user = await withAuthTimeout(
      getAuthUserFromCookies(),
      "app-layout getAuthUserFromCookies",
      AUTH_REQUEST_TIMEOUT_MS + 800,
      { tripCircuit: true },
    );
  } catch (e) {
    console.error("[app-layout] auth failed; redirecting to login", e);
  }
  if (!user) {
    redirect("/login");
  }

  const isPlatformAdmin = isPlatformSuperAdmin(user.systemRole);
  let access: Awaited<ReturnType<typeof assertSubscriptionAllowsAccess>> = {
    ok: true,
  };
  try {
    const company = await withAuthTimeout(
      getActiveCompanyContext(user),
      "getActiveCompanyContext",
    );
    access =
      isAuthBypassEnabled() || company == null
        ? { ok: true as const }
        : await assertSubscriptionAllowsAccess(company.companyId);
  } catch (e) {
    console.error("[app-layout] company/subscription check failed; loading app anyway", e);
  }

  return (
    <ObraModulosProvider>
      {!access.ok && isPlatformAdmin ? (
        <div className="cad-app-chrome border-b border-amber-400/50 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950 dark:bg-amber-950/50 dark:text-amber-100">
          {access.message}{" "}
          <Link href="/assinatura" className="font-semibold underline">
            Gerir assinatura
          </Link>
        </div>
      ) : !access.ok ? (
        <div className="cad-app-chrome border-b border-amber-400/50 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950 dark:bg-amber-950/50 dark:text-amber-100">
          Acesso limitado. Contacte o suporte DataGeo para activar a sua conta.
        </div>
      ) : null}
      <AppShell isPlatformAdmin={isPlatformAdmin}>{children}</AppShell>
    </ObraModulosProvider>
  );
}
