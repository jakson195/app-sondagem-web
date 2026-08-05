"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getLeilaoANMDirectUrl,
  getLeilaoANMViewerUrl,
  getLeilaoANMViteDirectUrl,
} from "@/lib/anm-leilao-url";
import { checkAnmLeilaoApiHealth, HIDROGEO_START_HINT } from "@/lib/hidrogeo-health";
import { useAnmLeilaoIframeReady } from "@/hooks/use-anm-leilao-iframe-ready";

export function LeilaoANMClient() {
  const viewerUrl = getLeilaoANMViewerUrl();
  const directUrl = getLeilaoANMDirectUrl();
  const viteDirectUrl = getLeilaoANMViteDirectUrl();
  const { status, slowHint, onIframeLoad } = useAnmLeilaoIframeReady(viewerUrl);
  const [apiOk, setApiOk] = useState<boolean | null>(null);

  useEffect(() => {
    void checkAnmLeilaoApiHealth().then(setApiOk);
  }, []);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <header className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 shadow-sm sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              DataGeo Digital · Mineração
            </p>
            <h1 className="mt-1 text-xl font-semibold text-[var(--text)] sm:text-2xl">
              ANM · Leilão SOPLE
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
              Áreas minerárias SIGMINE por rodada de leilão — módulo ANM independente.
            </p>
          </div>
          <a
            href={viteDirectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-amber-600/40 bg-amber-600/10 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-600/20 dark:text-amber-300"
          >
            Ecrã completo
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </header>

      {status === "failed" ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm">
          <p className="font-medium">Viewer ANM Leilão indisponível</p>
          <p className="mt-2 text-[var(--muted)]">
            Reinicie o DataGeo — o mapa ANM usa o mesmo bundle estático do HidroGeo.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-black/20 p-3 text-xs text-slate-200">
            {HIDROGEO_START_HINT}
          </pre>
        </div>
      ) : (
        <>
          {apiOk === false && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
              <p className="font-medium">API ANM offline — camadas SIGMINE/leilão indisponíveis.</p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-black/15 p-3 text-xs text-slate-300">
                {HIDROGEO_START_HINT}
              </pre>
            </div>
          )}
        <div className="relative min-h-[min(82vh,920px)] overflow-hidden rounded-xl border border-[var(--border)] bg-slate-950 shadow-sm">
          {status !== "ready" && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-950/90 text-sm text-slate-300">
              <span>
                {status === "checking" ? "A verificar ANM Leilão…" : "A carregar mapa ANM…"}
              </span>
              {slowHint && (
                <span className="max-w-md px-4 text-center text-xs text-amber-300">
                  Mapa lento — confirme PostGIS (:5434), tiles (:7800) e API (:8010), depois Ctrl+F5.
                </span>
              )}
            </div>
          )}
          <iframe
            key={viewerUrl}
            title="ANM Leilão SOPLE"
            src={viewerUrl}
            className="h-[min(82vh,920px)] w-full border-0 bg-slate-950"
            allow="fullscreen; webgl"
            onLoad={onIframeLoad}
          />
        </div>
        </>
      )}

      <p className="text-center text-xs text-[var(--muted)]">
        Viewer ANM: <code className="text-[10px]">{viewerUrl}</code>
      </p>
    </div>
  );
}
