import type { Metadata } from "next";
import { DiretorioBusca } from "@/components/diretorio/diretorio-busca";

export const metadata: Metadata = {
  title: "Empresas por região",
  description: "Encontre empresas de loteamento, topografia e projeto que usam o DataGeo Digital na sua cidade ou região.",
};

export default function EmpresasSitePage() {
  return (
    <section className="px-4 pb-20 pt-28 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <DiretorioBusca />
      </div>
    </section>
  );
}
