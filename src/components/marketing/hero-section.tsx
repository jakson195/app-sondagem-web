import Link from "next/link";
import { HeroVideoBackground } from "./hero-video-background";

const highlights = [
  { value: "SPT", label: "Sondagem & relatórios" },
  { value: "CAD", label: "Ambiente técnico" },
  { value: "SaaS", label: "Multi-empresa" },
  { value: "PDF", label: "Portal do cliente" },
];

export function HeroSection() {
  return (
    <section className="relative min-h-[min(88vh,860px)] overflow-hidden pt-24 sm:pt-28">
      <HeroVideoBackground />

      <div className="relative z-10 mx-auto flex min-h-[min(72vh,720px)] max-w-3xl flex-col justify-center px-4 py-16 sm:px-6 lg:py-20">
        <div className="rounded-2xl border border-white/10 bg-dg-card/55 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md sm:p-8 lg:p-10">
          <p className="text-center text-xs font-medium uppercase tracking-[0.2em] text-dg-cyan sm:text-left">
            [ Campo · Escritório · Cliente — num só lugar ]
          </p>
          <h1 className="mt-4 text-center text-3xl font-bold leading-tight tracking-tight sm:text-left sm:text-4xl lg:text-5xl">
            Plataforma SaaS para{" "}
            <span className="text-gradient-brand">geotecnia e mineração</span>
          </h1>
          <p className="mt-5 text-center text-base leading-relaxed text-dg-muted sm:text-left sm:text-lg">
            SPT, mapas GEO, relatórios PDF e portal white-label — do registo no furo
            à entrega ao cliente.
          </p>

          <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-4">
            {highlights.map((h) => (
              <li
                key={h.label}
                className="rounded-xl border border-dg-border/80 bg-dg-black/50 px-3 py-3 text-center sm:px-4"
              >
                <p className="text-lg font-bold text-dg-cyan sm:text-xl">{h.value}</p>
                <p className="mt-0.5 text-[11px] text-dg-muted sm:text-xs">{h.label}</p>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/cadastro?plan=trial" className="site-btn-primary px-6 py-3.5 text-center">
              Trial grátis 90 dias
            </Link>
            <Link href="/funcionalidades" className="site-btn-outline px-6 py-3.5 text-center">
              Ver módulos
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
