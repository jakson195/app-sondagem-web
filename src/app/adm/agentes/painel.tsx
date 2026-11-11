"use client";

import Script from "next/script";
import { useEffect } from "react";

declare global {
  interface Window {
    DgeoAgentesIniciar?: () => void;
  }
}

/** Monta o painel (script em /public/adm-agentes.js). Ao voltar para a página sem recarregar, reinicia. */
export default function PainelAgentes() {
  useEffect(() => {
    window.DgeoAgentesIniciar?.();
  }, []);
  return (
    <>
      <div id="ag-raiz" className="ag-escopo" />
      <Script src="/adm-agentes.js?v=1" strategy="afterInteractive" />
    </>
  );
}
