import { getProductMode } from "@/lib/product-mode";

const statsFull = [
  { value: "90 dias", label: "Trial grátis" },
  { value: "SPT", label: "Sondagem de campo" },
  { value: "Multi", label: "Empresa & obras" },
  { value: "PDF", label: "Relatórios Soilsul" },
];

const statsLoteamento = [
  { value: "90 dias", label: "Trial grátis" },
  { value: "CAD", label: "Ambiente técnico" },
  { value: "GEO", label: "Mapas e imagens" },
  { value: "VIAB", label: "Estudo de viabilidade" },
];

const statsSondagem = [
  { value: "90 dias", label: "Trial grátis" },
  { value: "SPT", label: "Sondagem à percussão" },
  { value: "Rotativa", label: "Sondagem rotativa" },
  { value: "PDF", label: "Relatórios de campo" },
];

export function SiteStatsBar() {
  const productMode = getProductMode();
  const stats =
    productMode === "SONDAGEM" ? statsSondagem : productMode === "LOTEAMENTO" ? statsLoteamento : statsFull;
  return (
    <section className="border-y border-[var(--dg-border)] bg-[var(--dg-card)]/50 py-12">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 sm:grid-cols-4 sm:px-6">
        {stats.map((s) => (
          <div key={s.label} className="text-center sm:text-left">
            <p className="text-2xl font-bold text-[var(--dg-cyan)] sm:text-3xl">{s.value}</p>
            <p className="mt-1 text-sm text-[var(--dg-muted)]">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
