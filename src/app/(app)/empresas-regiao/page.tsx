import { redirect } from "next/navigation";

/** A busca de empresas mudou para o site público (/empresas). */
export default function EmpresasRegiaoPage() {
  redirect("/empresas");
}
