"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { runQueuedInEffect } from "@/lib/react/queue-in-effect";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import { worldToScreen, type CadViewport } from "@/lib/rtk-validation/cad/viewport";
import {
  detectCadGeoref,
  viewportBbox4326GeorefSafe,
  type CadGeorefContext,
} from "@/lib/rtk-validation/cad/georef";
import { isBboxInBrazil } from "@/lib/rtk-validation/cad/map-bbox";
import { viewportScreenBounds } from "@/lib/rtk-validation/cad/map-tiles";
import type { CadEntity } from "@/lib/rtk-validation/cad/types";
import {
  activeAnmMapLayerIds,
  anyAnmSigmineOverlay,
  DEFAULT_ANM_SIGMINE_OVERLAY,
  activeSigefLayerKeys,
  anySigefOverlay,
  DEFAULT_SIGEF_OVERLAY,
  type AnmSigmineLayerKey,
  type AnmSigmineOverlayState,
  type SigefLayerKey,
  type SigefOverlayState,
} from "@/lib/cad-map/overlay-sources";

const CadMapboxBasemap = dynamic(
  () => import("./cad-mapbox-basemap").then((m) => ({ default: m.CadMapboxBasemap })),
  { ssr: false },
);

export type { AnmSigmineLayerKey, AnmSigmineOverlayState, SigefLayerKey, SigefOverlayState };

export type CadBasemapOverlays = {
  satellite: boolean;
  anmSigmine: AnmSigmineOverlayState;
  sigef: SigefOverlayState;
};

export const DEFAULT_CAD_BASEMAP_OVERLAYS: CadBasemapOverlays = {
  satellite: false,
  anmSigmine: { ...DEFAULT_ANM_SIGMINE_OVERLAY },
  sigef: { ...DEFAULT_SIGEF_OVERLAY },
};

export function cloneDefaultBasemapOverlays(): CadBasemapOverlays {
  return {
    satellite: DEFAULT_CAD_BASEMAP_OVERLAYS.satellite,
    anmSigmine: { ...DEFAULT_CAD_BASEMAP_OVERLAYS.anmSigmine },
    sigef: { ...DEFAULT_CAD_BASEMAP_OVERLAYS.sigef },
  };
}

type CadBasemapLayerProps = {
  viewport: CadViewport;
  entities: CadEntity[];
  overlays: CadBasemapOverlays;
  crs?: string;
  georef?: CadGeorefContext;
};

const ANM_OVERLAY = { apiPath: "/api/cad-map/anm", opacity: 0.88, zIndex: 2 };
const SIGEF_OVERLAY = { apiPath: "/api/cad-map/sigef", opacity: 0.82, zIndex: 3 };

function rectToPercent(
  rect: { x: number; y: number; width: number; height: number },
  viewW: number,
  viewH: number,
) {
  return {
    left: `${(rect.x / viewW) * 100}%`,
    top: `${(rect.y / viewH) * 100}%`,
    width: `${(rect.width / viewW) * 100}%`,
    height: `${(rect.height / viewH) * 100}%`,
  };
}

function buildMapUrl(apiPath: string, bboxStr: string, w: number, h: number, extra?: Record<string, string>) {
  const params = new URLSearchParams({
    bbox: bboxStr,
    width: String(w),
    height: String(h),
    ...extra,
  });
  return `${apiPath}?${params.toString()}`;
}

function canShowSatellite(georef: CadGeorefContext, viewport: CadViewport) {
  if (!georef.isGeoreferenced) return false;
  return viewportBbox4326GeorefSafe(viewport, georef) != null;
}

function WmsOverlayImage({
  url,
  style,
  opacity,
  onFailed,
}: {
  url: string;
  style: React.CSSProperties;
  opacity: number;
  onFailed: () => void;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      draggable={false}
      className="absolute block max-w-none"
      style={{ ...style, objectFit: "fill", opacity }}
      onError={onFailed}
    />
  );
}

export function CadBasemapLayer({ viewport, entities, overlays, crs, georef: georefProp }: CadBasemapLayerProps) {
  const t = useTranslations("rtkCad.basemap");
  const [anmFailed, setAnmFailed] = useState<"error" | "empty" | "outOfBrazil" | null>(null);
  const [anmImageUrl, setAnmImageUrl] = useState<string | null>(null);
  const [sigefFailed, setSigefFailed] = useState<"error" | "empty" | "outOfBrazil" | null>(null);
  const [sigefImageUrls, setSigefImageUrls] = useState<Partial<Record<SigefLayerKey, string>>>({});

  const anmActive = anyAnmSigmineOverlay(overlays.anmSigmine);
  const sigefActive = anySigefOverlay(overlays.sigef);

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (!anmActive && !sigefActive && !overlays.satellite) return;
        if (anmActive) setAnmFailed(null);
        if (sigefActive) setSigefFailed(null);
      }),
    [
      overlays.anmSigmine.processos,
      overlays.anmSigmine.protecaoFonte,
      overlays.anmSigmine.arrendamentos,
      overlays.anmSigmine.bloqueio,
      overlays.anmSigmine.reservasGarimpeiras,
      overlays.sigef.particular,
      overlays.sigef.publico,
      overlays.sigef.uf,
      overlays.satellite,
      viewport.minX,
      viewport.maxX,
      viewport.minY,
      viewport.maxY,
    ],
  );

  const georef = useMemo(
    () => georefProp ?? detectCadGeoref(entities, viewport, crs),
    [georefProp, entities, viewport.minX, viewport.maxX, viewport.minY, viewport.maxY, crs],
  );

  const showSatellite = overlays.satellite && canShowSatellite(georef, viewport);

  const anmBboxIssue = useMemo(() => {
    if (!anmActive || !georef.isGeoreferenced) return null;
    const bbox = viewportBbox4326GeorefSafe(viewport, georef);
    if (!bbox || !isBboxInBrazil(bbox)) return "outOfBrazil" as const;
    return null;
  }, [anmActive, georef, viewport.minX, viewport.maxX, viewport.minY, viewport.maxY]);

  const anmMapUrl = useMemo(() => {
    if (!georef.isGeoreferenced || !anmActive || anmBboxIssue) return null;
    const bbox = viewportBbox4326GeorefSafe(viewport, georef);
    if (!bbox) return null;
    const w = Math.min(1600, Math.max(512, Math.round(viewport.width * 2)));
    const h = Math.min(1600, Math.max(512, Math.round(viewport.height * 2)));
    const bboxStr = [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat]
      .map((n) => n.toFixed(6))
      .join(",");
    const anmLayerIds = activeAnmMapLayerIds(overlays.anmSigmine);
    if (anmLayerIds.length === 0) return null;
    return buildMapUrl(ANM_OVERLAY.apiPath, bboxStr, w, h, { layers: anmLayerIds.join(",") });
  }, [overlays.anmSigmine, viewport, georef, anmActive, anmBboxIssue]);

  const sigefBboxIssue = useMemo(() => {
    if (!sigefActive || !georef.isGeoreferenced) return null;
    const bbox = viewportBbox4326GeorefSafe(viewport, georef);
    if (!bbox || !isBboxInBrazil(bbox)) return "outOfBrazil" as const;
    return null;
  }, [sigefActive, georef, viewport.minX, viewport.maxX, viewport.minY, viewport.maxY]);

  const sigefMapRequests = useMemo(() => {
    if (!georef.isGeoreferenced || !sigefActive || sigefBboxIssue) return [];
    const bbox = viewportBbox4326GeorefSafe(viewport, georef);
    if (!bbox) return [];
    const w = Math.min(1600, Math.max(512, Math.round(viewport.width * 2)));
    const h = Math.min(1600, Math.max(512, Math.round(viewport.height * 2)));
    const bboxStr = [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat]
      .map((n) => n.toFixed(6))
      .join(",");
    return activeSigefLayerKeys(overlays.sigef).map((key) => ({
      key,
      url: buildMapUrl(SIGEF_OVERLAY.apiPath, bboxStr, w, h, {
        layers: key,
        uf: overlays.sigef.uf,
      }),
    }));
  }, [overlays.sigef, viewport, georef, sigefActive, sigefBboxIssue]);

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (!anmMapUrl || !anmActive || !georef.isGeoreferenced) {
          setAnmImageUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
          return;
        }

        let cancelled = false;
        setAnmFailed(null);

        void fetch(anmMapUrl)
          .then(async (res) => {
            if (cancelled) return;
            if (res.status === 404) {
              setAnmFailed("empty");
              setAnmImageUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
              });
              return;
            }
            if (res.status === 400) {
              setAnmFailed("outOfBrazil");
              setAnmImageUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
              });
              return;
            }
            if (!res.ok) {
              setAnmFailed("error");
              setAnmImageUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
              });
              return;
            }
            const blob = await res.blob();
            if (cancelled) return;
            const objectUrl = URL.createObjectURL(blob);
            setAnmImageUrl((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return objectUrl;
            });
          })
          .catch(() => {
            if (!cancelled) {
              setAnmFailed("error");
              setAnmImageUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
              });
            }
          });

        return () => {
          cancelled = true;
        };
      }),
    [anmMapUrl, anmActive, georef.isGeoreferenced],
  );

  useEffect(
    () => () => {
      if (anmImageUrl) URL.revokeObjectURL(anmImageUrl);
    },
    [anmImageUrl],
  );

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (sigefMapRequests.length === 0 || !sigefActive || !georef.isGeoreferenced) {
          setSigefImageUrls((prev) => {
            for (const url of Object.values(prev)) {
              if (url) URL.revokeObjectURL(url);
            }
            return {};
          });
          return;
        }

        let cancelled = false;
        setSigefFailed(null);

        void Promise.all(
          sigefMapRequests.map(async ({ key, url }) => {
            const res = await fetch(url);
            if (res.status === 404) return { key, status: "empty" as const, objectUrl: null };
            if (res.status === 400) return { key, status: "outOfBrazil" as const, objectUrl: null };
            if (!res.ok) return { key, status: "error" as const, objectUrl: null };
            const blob = await res.blob();
            return { key, status: "ok" as const, objectUrl: URL.createObjectURL(blob) };
          }),
        )
          .then((results) => {
            if (cancelled) {
              for (const result of results) {
                if (result.objectUrl) URL.revokeObjectURL(result.objectUrl);
              }
              return;
            }
            const next: Partial<Record<SigefLayerKey, string>> = {};
            let failed: "error" | "empty" | "outOfBrazil" | null = null;
            for (const result of results) {
              if (result.status === "ok" && result.objectUrl) {
                next[result.key] = result.objectUrl;
              } else if (!failed && result.status !== "ok") {
                failed = result.status;
              }
            }
            setSigefImageUrls((prev) => {
              for (const url of Object.values(prev)) {
                if (url) URL.revokeObjectURL(url);
              }
              return next;
            });
            setSigefFailed(Object.keys(next).length === 0 ? failed ?? "error" : null);
          })
          .catch(() => {
            if (!cancelled) setSigefFailed("error");
          });

        return () => {
          cancelled = true;
        };
      }),
    [sigefMapRequests, sigefActive, georef.isGeoreferenced],
  );

  useEffect(
    () => () => {
      for (const url of Object.values(sigefImageUrls)) {
        if (url) URL.revokeObjectURL(url);
      }
    },
    [sigefImageUrls],
  );

  if (!anmActive && !sigefActive && !overlays.satellite) return null;

  const viewW = viewport.width;
  const viewH = viewport.height;
  const wmsStyle = rectToPercent(viewportScreenBounds(viewport, worldToScreen), viewW, viewH);
  const sigefImages = Object.entries(sigefImageUrls) as Array<[SigefLayerKey, string]>;

  return (
    <div
      className="cad-basemap pointer-events-none absolute inset-0 overflow-hidden"
      style={{ background: overlays.satellite ? "#1a1a1a" : "#e8eef4" }}
      aria-hidden
    >
      {showSatellite ? <CadMapboxBasemap viewport={viewport} georef={georef} /> : null}

      {overlays.satellite && !showSatellite ? (
        <div
          className="absolute left-2 top-2 z-20 rounded bg-amber-600/90 px-2 py-1 text-[10px] text-white"
          style={{ pointerEvents: "none" }}
        >
          {t("needGeoref")}
        </div>
      ) : null}

      {(anmActive || sigefActive) && !georef.isGeoreferenced ? (
        <div
          className="absolute left-2 top-7 z-20 rounded bg-amber-600/90 px-2 py-1 text-[10px] text-white"
          style={{ pointerEvents: "none" }}
        >
          {t("needGeoref")}
        </div>
      ) : null}

      {anmActive && anmImageUrl && !anmFailed && !anmBboxIssue && georef.isGeoreferenced ? (
        <WmsOverlayImage
          key="anm-sigmine"
          url={anmImageUrl}
          style={{ ...wmsStyle, zIndex: ANM_OVERLAY.zIndex }}
          opacity={ANM_OVERLAY.opacity}
          onFailed={() => setAnmFailed("error")}
        />
      ) : null}

      {sigefActive && !sigefFailed && !sigefBboxIssue && georef.isGeoreferenced
        ? sigefImages.map(([key, url]) => (
            <WmsOverlayImage
              key={`sigef-${key}`}
              url={url}
              style={{ ...wmsStyle, zIndex: SIGEF_OVERLAY.zIndex }}
              opacity={SIGEF_OVERLAY.opacity}
              onFailed={() => setSigefFailed("error")}
            />
          ))
        : null}

      {anmActive && (anmFailed || anmBboxIssue) ? (
        <div
          className="absolute left-2 top-7 z-20 max-w-[240px] rounded bg-amber-600/90 px-2 py-1 text-[10px] leading-snug text-white"
          style={{ pointerEvents: "none" }}
        >
          {anmBboxIssue === "outOfBrazil" || anmFailed === "outOfBrazil"
            ? t("anmOutOfBrazil")
            : anmFailed === "empty"
              ? t("anmEmpty")
              : t("anmUnavailable")}
        </div>
      ) : null}

      {sigefActive && (sigefFailed || sigefBboxIssue) ? (
        <div
          className="absolute left-2 top-12 z-20 max-w-[240px] rounded bg-amber-600/90 px-2 py-1 text-[10px] leading-snug text-white"
          style={{ pointerEvents: "none" }}
        >
          {sigefBboxIssue === "outOfBrazil" || sigefFailed === "outOfBrazil"
            ? t("sigefOutOfBrazil")
            : sigefFailed === "empty"
              ? t("sigefEmpty")
              : t("sigefUnavailable")}
        </div>
      ) : null}
    </div>
  );
}

export function CadBasemapAttribution({ overlays }: { overlays: CadBasemapOverlays }) {
  const t = useTranslations("rtkCad.basemap");
  const labels: string[] = [];
  if (overlays.satellite) labels.push(t("satelliteCredit"));
  if (anyAnmSigmineOverlay(overlays.anmSigmine)) labels.push(t("anmCredit"));
  if (anySigefOverlay(overlays.sigef)) labels.push(t("sigefCredit"));
  if (labels.length === 0) return null;

  return (
    <div className="pointer-events-none absolute bottom-10 right-2 z-20 max-w-[280px] rounded bg-black/60 px-2 py-1 text-[9px] leading-snug text-white/90">
      {labels.join(" · ")}
    </div>
  );
}
