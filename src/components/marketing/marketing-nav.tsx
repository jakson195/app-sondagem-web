"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";

const NAV = [
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/#galeria-sondagens", label: "Sondagens" },
  { href: "/#setores", label: "Setores" },
  { href: "/funcionalidades", label: "Módulos" },
  { href: "/#planos", label: "Planos" },
  { href: "/#faq", label: "FAQ" },
  { href: "/contato", label: "Contato" },
] as const;

export function MarketingNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-dg-border/80 bg-dg-black/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <BrandLogo href="/" height={36} />

        <nav className="hidden items-center gap-6 text-sm text-dg-muted md:flex" aria-label="Principal">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`transition-colors hover:text-dg-text ${
                pathname === item.href ? "text-dg-cyan" : ""
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 sm:flex">
          <Link href="/dashboard" className="site-btn-outline px-4 py-2">
            Entrar
          </Link>
          <Link href="/cadastro?plan=trial" className="site-btn-primary px-4 py-2">
            Trial 90 dias
          </Link>
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-dg-text md:hidden"
          aria-expanded={open}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-dg-border bg-dg-card px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3" aria-label="Mobile">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-dg-text hover:bg-dg-cyan/10"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <hr className="border-dg-border" />
            <Link href="/dashboard" className="px-3 py-2 text-sm" onClick={() => setOpen(false)}>
              Entrar
            </Link>
            <Link
              href="/cadastro?plan=trial"
              className="site-btn-primary px-3 py-2 text-center text-sm"
              onClick={() => setOpen(false)}
            >
              Trial 90 dias
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
