"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { runQueuedInEffect } from "@/lib/react/queue-in-effect";
import type { LocationMapStyle } from "@/lib/cad-map/location-map-image";
import { isLocationMapBoundsValid } from "@/lib/cad-map/location-map-image";

export type LocationMapLoadStatus = "idle" | "loading" | "ready" | "error" | "needs_georef";

type UseLocationMapImageParams = {
  projectBounds: { minX: number; maxX: number; minY: number; maxY: number };
  utmZone: number;
  swapEn?: boolean;
  mapStyle?: LocationMapStyle;
  width: number;
  height: number;
  enabled?: boolean;
};

function buildLocationMapApiUrl(params: UseLocationMapImageParams): string {
  const search = new URLSearchParams({
    minX: String(params.projectBounds.minX),
    maxX: String(params.projectBounds.maxX),
    minY: String(params.projectBounds.minY),
    maxY: String(params.projectBounds.maxY),
    zone: String(params.utmZone),
    width: String(Math.round(params.width)),
    height: String(Math.round(params.height)),
    style: params.mapStyle ?? "satellite",
  });
  if (params.swapEn) search.set("swapEn", "1");
  return `/api/cad-map/location-image?${search.toString()}`;
}

/** Carrega imagem da planta de localização (URL da API + data URL para impressão). */
export function useLocationMapImage({
  projectBounds,
  utmZone,
  swapEn = false,
  mapStyle = "satellite",
  width,
  height,
  enabled = true,
}: UseLocationMapImageParams) {
  const [printImageUrl, setPrintImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<LocationMapLoadStatus>("idle");

  const boundsValid = useMemo(() => isLocationMapBoundsValid(projectBounds), [projectBounds]);

  const apiUrl = useMemo(
    () =>
      buildLocationMapApiUrl({
        projectBounds,
        utmZone,
        swapEn,
        mapStyle,
        width,
        height,
      }),
    [
      projectBounds.minX,
      projectBounds.maxX,
      projectBounds.minY,
      projectBounds.maxY,
      utmZone,
      swapEn,
      mapStyle,
      width,
      height,
    ],
  );

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (!enabled) {
          setPrintImageUrl(null);
          setStatus("idle");
          return;
        }

        if (!boundsValid) {
          setPrintImageUrl(null);
          setStatus("needs_georef");
          return;
        }

        setStatus("loading");
        setPrintImageUrl(null);
      }),
    [apiUrl, enabled, boundsValid],
  );

  const handleImageLoad = useCallback(() => {
    setStatus("ready");
  }, []);

  const handleImageError = useCallback(() => {
    setStatus("error");
    setPrintImageUrl(null);
  }, []);

  /** Converte PNG da API em data URL (necessário para impressão confiável). */
  useEffect(() => {
    if (status !== "ready" || !enabled || !boundsValid) return;

    let cancelled = false;
    void fetch(apiUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error("map unavailable");
        const blob = await response.blob();
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") resolve(reader.result);
            else reject(new Error("invalid data url"));
          };
          reader.onerror = () => reject(reader.error ?? new Error("read failed"));
          reader.readAsDataURL(blob);
        });
      })
      .then((dataUrl) => {
        if (!cancelled) setPrintImageUrl(dataUrl);
      })
      .catch(() => {
        /* Tela já exibe via apiUrl; impressão usa apiUrl se data URL falhar. */
      });

    return () => {
      cancelled = true;
    };
  }, [status, apiUrl, enabled, boundsValid]);

  const imageUrl = printImageUrl ?? (status === "ready" || status === "loading" ? apiUrl : null);

  return {
    imageUrl,
    apiUrl,
    status,
    onImageLoad: handleImageLoad,
    onImageError: handleImageError,
  };
}

/** Aguarda condição (ex.: mapa carregado) antes de imprimir. */
export function waitUntil(condition: () => boolean, timeoutMs = 20_000): Promise<void> {
  if (condition()) return Promise.resolve();

  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (condition() || Date.now() - started >= timeoutMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}
