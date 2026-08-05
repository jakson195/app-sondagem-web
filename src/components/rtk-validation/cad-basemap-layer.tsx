"use client";

import { useEffect, useMemo, useState } from "react";
import { runQueuedInEffect } from "@/lib/react/queue-in-effect";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import { worldToScreen, type CadViewport } from "@/lib/rtk-validation/cad/viewport";
import {
  detectCadGeoref,
  enToLatLonGeoref,
  latLonToVertexGeoref,
  vertexToEn,
  viewportBbox4326Georef,
  viewportBbox4326GeorefSafe,
  type CadGeorefContext,
} from "@/lib/rtk-validation/cad/georef";
import { isBboxInBrazil } from "@/lib/rtk-validation/cad/map-bbox";
import {
  latLonToTileXY,
  pickTileZoom,
  tileLatLonBounds,
  viewportScreenBounds,
  type MapTileRef,
} from "@/lib/rtk-validation/cad/map-tiles";
import type { CadEntity } from "@/lib/rtk-validation/cad/types";
import {
  activeAnmMapLayerIds,
  anyAnmSigmineOverlay,
  DEFAULT_ANM_SIGMINE_OVERLAY,
  type AnmSigmineLayerKey,
  type AnmSigmineOverlayState,
} from "@/lib/cad-map/overlay-sources";

export type { AnmSigmineLayerKey, AnmSigmineOverlayState };

export type CadBasemapOverlays = {
  satellite: boolean;
  anmSigmine: AnmSigmineOverlayState;
};

export const DEFAULT_CAD_BASEMAP_OVERLAYS: CadBasemapOverlays = {
  satellite: false,
  anmSigmine: { ...DEFAULT_ANM_SIGMINE_OVERLAY },
};

type CadBasemapLayerProps = {
  viewport: CadViewport;
  entities: CadEntity[];
  overlays: CadBasemapOverlays;
  crs?: string;
  georef?: CadGeorefContext;
};

const ANM_OVERLAY = { apiPath: "/api/cad-map/anm", opacity: 0.88, zIndex: 2 };

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

function buildSatelliteTileUrl(tile: MapTileRef) {
  const params = new URLSearchParams({
    z: String(tile.z),
    x: String(tile.x),
    y: String(tile.y),
    source: "esri",
  });
  return `/api/cad-map/tile?${params.toString()}`;
}

function listSatelliteTiles(viewport: CadViewport, georef: CadGeorefContext, zoom: number): MapTileRef[] {
  const bbox = viewportBbox4326Georef(viewport, georef);
  const { x: x0, y: y0 } = latLonToTileXY(bbox.maxLat, bbox.minLon, zoom);
  const { x: x1, y: y1 } = latLonToTileXY(bbox.minLat, bbox.maxLon, zoom);
  const tiles: MapTileRef[] = [];
  const maxTiles = 48;
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      tiles.push({ x, y, z: zoom });
      if (tiles.length >= maxTiles) return tiles;
    }
  }
  return tiles;
}

function tileScreenBoundsGeoref(
  tile: MapTileRef,
  viewport: CadViewport,
  georef: CadGeorefContext,
) {
  const bounds = tileLatLonBounds(tile.x, tile.y, tile.z);
  const nw = latLonToVertexGeoref(bounds.latMax, bounds.lonMin, 0, georef);
  const se = latLonToVertexGeoref(bounds.latMin, bounds.lonMax, 0, georef);
  const tl = worldToScreen(nw.x, nw.y, viewport);
  const br = worldToScreen(se.x, se.y, viewport);
  const x = Math.min(tl.sx, br.sx);
  const y = Math.min(tl.sy, br.sy);
  const width = Math.abs(br.sx - tl.sx);
  const height = Math.abs(br.sy - tl.sy);
  if (width < 1 || height < 1) return null;
  return { x, y, width, height };
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
  const [satelliteFailed, setSatelliteFailed] = useState(false);

  const anmActive = anyAnmSigmineOverlay(overlays.anmSigmine);

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (!anmActive && !overlays.satellite) return;
        if (anmActive) setAnmFailed(null);
        if (overlays.satellite) setSatelliteFailed(false);
      }),
    [
      overlays.anmSigmine.processos,
      overlays.anmSigmine.protecaoFonte,
      overlays.anmSigmine.arrendamentos,
      overlays.anmSigmine.bloqueio,
      overlays.anmSigmine.reservasGarimpeiras,
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

  const satelliteTiles = useMemo(() => {
    if (!overlays.satellite || !georef.isGeoreferenced) return [];
    const centerVertex = {
      x: (viewport.minX + viewport.maxX) / 2,
      y: (viewport.minY + viewport.maxY) / 2,
      z: 0,
    };
    const { e, n } = vertexToEn(centerVertex, georef);
    const center = enToLatLonGeoref(e, n, georef);
    const zoom = pickTileZoom(viewport, center.lat);
    return listSatelliteTiles(viewport, georef, zoom)
      .map((tile) => ({
        tile,
        bounds: tileScreenBoundsGeoref(tile, viewport, georef),
        url: buildSatelliteTileUrl(tile),
      }))
      .filter((item): item is { tile: MapTileRef; bounds: { x: number; y: number; width: number; height: number }; url: string } =>
        item.bounds != null,
      );
  }, [overlays.satellite, viewport, georef]);

  if (!anmActive && !overlays.satellite) return null;

  const viewW = viewport.width;
  const viewH = viewport.height;
  const wmsStyle = rectToPercent(viewportScreenBounds(viewport, worldToScreen), viewW, viewH);

  return (
    <div
      className="cad-basemap pointer-events-none absolute inset-0 overflow-hidden"
      style={{ background: overlays.satellite ? "#1a1a1a" : "#e8eef4" }}
      aria-hidden
    >
      {overlays.satellite && georef.isGeoreferenced
        ? satelliteTiles.map(({ tile, bounds, url }) => {
            const style = rectToPercent(bounds, viewW, viewH);
            return (
              <WmsOverlayImage
                key={`sat-${tile.z}-${tile.x}-${tile.y}`}
                url={url}
                style={{ ...style, zIndex: 0 }}
                opacity={1}
                onFailed={() => setSatelliteFailed(true)}
              />
            );
          })
        : null}

      {overlays.satellite && !georef.isGeoreferenced ? (
        <div
          className="absolute left-2 top-2 z-20 rounded bg-amber-600/90 px-2 py-1 text-[10px] text-white"
          style={{ pointerEvents: "none" }}
        >
          {t("needGeoref")}
        </div>
      ) : null}

      {overlays.satellite && georef.isGeoreferenced && satelliteFailed ? (
        <div
          className="absolute left-2 top-2 z-20 rounded bg-amber-600/90 px-2 py-1 text-[10px] text-white"
          style={{ pointerEvents: "none" }}
        >
          {t("satelliteUnavailable")}
        </div>
      ) : null}

      {anmActive && !georef.isGeoreferenced ? (
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
    </div>
  );
}

export function CadBasemapAttribution({ overlays }: { overlays: CadBasemapOverlays }) {
  const t = useTranslations("rtkCad.basemap");
  const labels: string[] = [];
  if (overlays.satellite) labels.push(t("satelliteCredit"));
  if (anyAnmSigmineOverlay(overlays.anmSigmine)) labels.push(t("anmCredit"));
  if (labels.length === 0) return null;

  return (
    <div className="pointer-events-none absolute bottom-10 right-2 z-20 max-w-[280px] rounded bg-black/60 px-2 py-1 text-[9px] leading-snug text-white/90">
      {labels.join(" · ")}
    </div>
  );
}
