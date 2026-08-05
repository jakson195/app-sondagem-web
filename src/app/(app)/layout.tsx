import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ObraModulosProvider } from "@/components/obra-context";
import { isAuthBypassEnabled } from "@/lib/auth-bypass";
import { getActiveCompanyContext } from "@/lib/auth/active-company";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";
import { assertSubscriptionAllowsAccess } from "@/lib/saas/subscription-service";
import { getAuthUserFromCookies } from "@/lib/server-auth";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const company = await getActiveCompanyContext(user);
  const isPlatformAdmin = isPlatformSuperAdmin(user.systemRole);
  const access =
    isAuthBypassEnabled() || company == null
      ? { ok: true as const }
      : await assertSubscriptionAllowsAccess(company.companyId);

  return (
    <ObraModulosProvider>
      {!access.ok && isPlatformAdmin ? (
        <div className="border-b border-amber-400/50 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950 dark:bg-amber-950/50 dark:text-amber-100">
          {access.message}{" "}
          <Link href="/assinatura" className="font-semibold underline">
            Gerir assinatura
          </Link>
        </div>
      ) : !access.ok ? (
        <div className="border-b border-amber-400/50 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950 dark:bg-amber-950/50 dark:text-amber-100">
          Acesso limitado. Contacte o suporte DataGeo para activar a sua conta.
        </div>
      ) : null}
      <AppShell isPlatformAdmin={isPlatformAdmin}>{children}</AppShell>
    </ObraModulosProvider>
  );
}
