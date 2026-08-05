const faqs = [
  {
    q: "Preciso instalar algo no servidor?",
    a: "A app web corre na cloud (Vercel ou o seu host Node.js). Basta browser e ligação à internet para campo e escritório.",
  },
  {
    q: "Quantas obras posso ter no trial?",
    a: "O trial inclui até 2 obras e 90 dias grátis. Planos Pro ampliam limites conforme acordo comercial.",
  },
  {
    q: "Os dados ficam isolados por cliente?",
    a: "Sim. Cada conta tem as suas obras e dados separados dos restantes utilizadores.",
  },
  {
    q: "Como funciona o relatório SPT?",
    a: "Registo de campo, gráficos NSPT e exportação PDF alinhados ao fluxo técnico da consultoria.",
  },
];

export function SiteFaq() {
  return (
    <section id="faq" className="scroll-mt-24 border-t border-[var(--dg-border)] py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 className="text-center text-3xl font-bold">Perguntas frequentes</h2>
        <dl className="mt-12 space-y-6">
          {faqs.map((item) => (
            <div
              key={item.q}
              className="rounded-xl border border-[var(--dg-border)] bg-[var(--dg-card)] p-6"
            >
              <dt className="font-semibold">{item.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-[var(--dg-muted)]">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
