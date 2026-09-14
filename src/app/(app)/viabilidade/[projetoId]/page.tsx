import { EstudoViabilidadeClient } from "@/components/viabilidade/estudo-viabilidade-client";

export const metadata = {
  title: "Estudo de viabilidade preliminar | DataGeo Digital",
  description: "Estudo de viabilidade técnica e econômica a partir do loteamento CAD.",
};

export default async function ViabilidadeProjetoPage({
  params,
}: {
  params: Promise<{ projetoId: string }>;
}) {
  const { projetoId } = await params;
  return (
    <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
      <EstudoViabilidadeClient projetoId={projetoId} />
    </div>
  );
}
