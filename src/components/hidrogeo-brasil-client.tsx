"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { getHidroGeoDirectUrl, getHidroGeoViewerUrl } from "@/lib/hidrogeo-url";
import { checkHidroGeoApiHealth, HIDROGEO_START_HINT } from "@/lib/hidrogeo-health";
import { useHidroGeoIframeReady } from "@/hooks/use-hidrogeo-iframe-ready";

export function HidroGeoBrasilClient() {
  const viewerUrl = getHidroGeoViewerUrl();
  const directUrl = getHidroGeoDirectUrl();
  const { status, slowHint, onIframeLoad } = useHidroGeoIframeReady(viewerUrl);
  const [apiOk, setApiOk] = useState<boolean | null>(null);

  useEffect(() => {
    void checkHidroGeoApiHealth().then(setApiOk);
  }, []);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <header className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 shadow-sm sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
              DataGeo Digital · Hidrologia &amp; geologia
            </p>
            <h1 className="mt-1 text-xl font-semibold text-[var(--text)] sm:text-2xl">
              HidroGeo Brasil — mapa nacional
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
              Hidrografia ANA, litologia CPRM, magnetometria SGB, medição Turf.js, exportação
              GeoJSON/KML/SHP e animação de vazão por bacia.
            </p>
          </div>
          <a
            href={directUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-teal-600/40 bg-teal-600/10 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-600/20 dark:text-teal-300"
          >
            Abrir mapa directo
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        <ul className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--muted)]">
          {[
            "Rios MVT",
            "Litologia CPRM",
            "Popup identify",
            "Medição distância/área",
            "Export SHP/KML",
            "Timeline vazão",
          ].map((tag) => (
            <li
              key={tag}
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5"
            >
              {tag}
            </li>
          ))}
        </ul>
      </header>

      {status === "failed" ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-[var(--text)]">
          <p className="font-medium">Mapa HidroGeo indisponível</p>
          <p className="mt-2 text-[var(--muted)]">
            O viewer não carregou. Reinicie o DataGeo (
            <code className="rounded bg-black/10 px-1 text-xs dark:bg-white/10">npm run dev</code>
            ) — o build estático é sincronizado automaticamente.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-black/20 p-3 text-xs text-slate-200">
            {HIDROGEO_START_HINT}
          </pre>
          <a
            href={directUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 font-semibold text-teal-600 dark:text-teal-400"
          >
            {directUrl}
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      ) : (
        <>
          {apiOk === false && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-[var(--text)]">
              <p className="font-medium">API HidroGeo offline — mapa base pode abrir sem camadas ANA/CPRM.</p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-black/15 p-3 text-xs text-slate-300">
                {HIDROGEO_START_HINT}
              </pre>
            </div>
          )}
        <div className="relative min-h-[min(82vh,920px)] overflow-hidden rounded-xl border border-[var(--border)] bg-slate-950 shadow-sm">
          {status !== "ready" && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-950/90 text-sm text-slate-300">
              <span>
                {status === "checking" ? "A verificar HidroGeo…" : "A carregar mapa…"}
              </span>
              {slowHint && (
                <span className="max-w-md px-4 text-center text-xs text-amber-300">
                  Mapa lento — confirme PostGIS (:5434), tiles (:7800) e API (:8010), depois Ctrl+F5.
                </span>
              )}
              <a
                href={directUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-teal-400 underline"
              >
                Abrir directo
              </a>
            </div>
          )}
          <iframe
            key={viewerUrl}
            title="HidroGeo Brasil — mapa"
            src={viewerUrl}
            className="h-[min(82vh,920px)] w-full border-0 bg-slate-950"
            allow="fullscreen; webgl"
            onLoad={onIframeLoad}
          />
        </div>
        </>
      )}

      <p className="text-center text-xs text-[var(--muted)]">
        Integrado: <code className="text-[10px]">{viewerUrl}</code>
        {" · "}
        Directo:{" "}
        <a href={directUrl} target="_blank" rel="noopener noreferrer" className="text-teal-600 underline">
          {directUrl}
        </a>
      </p>
    </div>
  );
}
