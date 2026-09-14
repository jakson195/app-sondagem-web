import { redirect } from "next/navigation";
import { CadWorkspace } from "@/components/rtk-validation/cad-workspace";
import { getAuthUserFromCookies } from "@/lib/server-auth";

export const metadata = {
  title: "Ambiente CAD | DataGeo Digital",
  description:
    "Desenho técnico, curvas de nível, ANM SIGMINE, SIGEF/INCRA, loteamento, REURB, exportação DXF/SHP e memorial descritivo.",
};

export default async function CadPage() {
  const user = await getAuthUserFromCookies();
  if (!user) redirect("/login?next=/cad");

  return (
    <div className="cad-page flex min-h-0 flex-1 flex-col">
      <header className="cad-page-title mb-2 flex shrink-0 items-baseline gap-2">
        <h1 className="text-base font-semibold text-[var(--text)]">Ambiente CAD</h1>
      </header>
      <CadWorkspace userId={String(user.id)} />
    </div>
  );
}
