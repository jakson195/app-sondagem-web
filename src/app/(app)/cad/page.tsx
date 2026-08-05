import { redirect } from "next/navigation";
import { CadWorkspace } from "@/components/rtk-validation/cad-workspace";
import { getAuthUserFromCookies } from "@/lib/server-auth";

export const metadata = {
  title: "Ambiente CAD | DataGeo Digital",
  description:
    "Desenho técnico, curvas de nível, ANM SIGMINE, exportação DXF/SHP e memorial descritivo.",
};

export default async function CadPage() {
  const user = await getAuthUserFromCookies();
  if (!user) redirect("/login?next=/cad");

  return (
    <div className="cad-page -mx-2 px-2 pb-8 sm:-mx-4 sm:px-4">
      <header className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 shadow-sm sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
          DataGeo Digital · RTK / topografia
        </p>
        <h1 className="mt-1 text-xl font-semibold text-[var(--text)] sm:text-2xl">
          Ambiente CAD
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          Importe pontos de levantamento, desenhe polígonos e linhas, sobreponha ANM SIGMINE e
          exporte DXF, Shapefile ou ODS.
        </p>
      </header>
      <CadWorkspace userId={String(user.id)} />
    </div>
  );
}
