import Link from "next/link";

export function CtaSection() {
  return (
    <section id="contato" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-3xl border border-[var(--dg-cyan)]/30 bg-gradient-to-br from-[var(--dg-cyan)]/10 to-[var(--dg-blue)]/10 p-8 text-center sm:p-12">
          <h2 className="text-2xl font-bold sm:text-3xl">
            Comece com trial grátis de 90 dias
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[var(--dg-muted)]">
            Crie a sua conta, convide a equipa e teste SPT, mapas e relatórios.
            Sem cartão de crédito no trial.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/cadastro?plan=trial"
              className="rounded-full bg-[var(--dg-cyan)] px-8 py-3 text-sm font-semibold text-[var(--dg-black)] hover:bg-[var(--dg-blue)]"
            >
              Criar conta grátis
            </Link>
            <Link
              href="mailto:contato@datageodigital.com.br"
              className="rounded-full border border-[var(--dg-border)] px-8 py-3 text-sm font-medium hover:border-[var(--dg-cyan)]/40"
            >
              contato@datageodigital.com.br
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
