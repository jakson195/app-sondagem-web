"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { CadGoogleMapType } from "@/lib/google-maps-config";
import {
  latLonToTileXY,
  tileLatLonBounds,
  type MapTileRef,
} from "@/lib/rtk-validation/cad/map-tiles";
import type { CadViewport } from "@/lib/rtk-validation/cad/viewport";
import { worldToScreen } from "@/lib/rtk-validation/cad/viewport";
import {
  latLonToVertexGeoref,
  viewportBbox4326GeorefSafe,
  type CadGeorefContext,
} from "@/lib/rtk-validation/cad/georef";

type Props = {
  viewport: CadViewport;
  georef: CadGeorefContext;
  mapTypeId?: CadGoogleMapType;
};

const MAX_TILES = 24;

function zoomForBbox(
  bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number },
  cssWidth: number,
) {
  const lonSpan = Math.max(bbox.maxLon - bbox.minLon, 1e-9);
  const targetPx = Math.max(cssWidth, 256);
  const z = Math.round(Math.log2((targetPx / 256) * (360 / lonSpan)));
  return Math.max(3, Math.min(18, z));
}

function tileRange(
  bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number },
  zoom: number,
) {
  const { x: x0, y: y0 } = latLonToTileXY(bbox.maxLat, bbox.minLon, zoom);
  const { x: x1, y: y1 } = latLonToTileXY(bbox.minLat, bbox.maxLon, zoom);
  return {
    minX: Math.min(x0, x1),
    maxX: Math.max(x0, x1),
    minY: Math.min(y0, y1),
    maxY: Math.max(y0, y1),
  };
}

function tileCount(
  bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number },
  zoom: number,
) {
  const r = tileRange(bbox, zoom);
  return (r.maxX - r.minX + 1) * (r.maxY - r.minY + 1);
}

function fitZoom(
  bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number },
  cssWidth: number,
) {
  let z = zoomForBbox(bbox, cssWidth);
  while (z > 3 && tileCount(bbox, z) > MAX_TILES) z -= 1;
  return z;
}

function listTiles(
  bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number },
  zoom: number,
): MapTileRef[] {
  const r = tileRange(bbox, zoom);
  const tiles: MapTileRef[] = [];
  const maxIndex = 2 ** zoom;
  for (let x = r.minX; x <= r.maxX; x++) {
    for (let y = r.minY; y <= r.maxY; y++) {
      const xx = ((x % maxIndex) + maxIndex) % maxIndex;
      if (y < 0 || y >= maxIndex) continue;
      tiles.push({ x: xx, y, z: zoom });
      if (tiles.length >= MAX_TILES) return tiles;
    }
  }
  return tiles;
}

function tileStyle(
  tile: MapTileRef,
  viewport: CadViewport,
  georef: CadGeorefContext,
): CSSProperties | null {
  const b = tileLatLonBounds(tile.x, tile.y, tile.z);
  const nw = latLonToVertexGeoref(b.latMax, b.lonMin, 0, georef);
  const se = latLonToVertexGeoref(b.latMin, b.lonMax, 0, georef);
  const tl = worldToScreen(nw.x, nw.y, viewport);
  const br = worldToScreen(se.x, se.y, viewport);
  const x = Math.min(tl.sx, br.sx);
  const y = Math.min(tl.sy, br.sy);
  const width = Math.abs(br.sx - tl.sx);
  const height = Math.abs(br.sy - tl.sy);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  return {
    left: `${(x / viewport.width) * 100}%`,
    top: `${(y / viewport.height) * 100}%`,
    width: `${(width / viewport.width) * 100}%`,
    height: `${(height / viewport.height) * 100}%`,
  };
}

function tileUrl(tile: MapTileRef, mapTypeId: CadGoogleMapType, fallback: boolean) {
  const source = fallback ? "esri" : "google";
  return `/api/cad-map/tile?z=${tile.z}&x=${tile.x}&y=${tile.y}&source=${source}&type=${mapTypeId}`;
}

function CadMapTile({
  tile,
  mapTypeId,
  style,
}: {
  tile: MapTileRef;
  mapTypeId: CadGoogleMapType;
  style: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [tile.z, tile.x, tile.y, mapTypeId]);
  return (
    <img
      src={tileUrl(tile, mapTypeId, failed)}
      alt=""
      draggable={false}
      className="pointer-events-none absolute block max-w-none"
      style={{ ...style, objectFit: "fill" }}
      onError={() => {
        if (!failed) setFailed(true);
      }}
    />
  );
}

export function GoogleSatelliteMap({ viewport, georef, mapTypeId = "satellite" }: Props) {
  const bbox = useMemo(
    () => viewportBbox4326GeorefSafe(viewport, georef),
    [
      viewport.minX,
      viewport.maxX,
      viewport.minY,
      viewport.maxY,
      georef.utmZone,
      georef.eastingAxis,
      georef.northingAxis,
      georef.coordMode,
      georef.isGeoreferenced,
    ],
  );

  const nextTiles = useMemo(() => {
    if (!bbox || !georef.isGeoreferenced) return [];
    return listTiles(bbox, fitZoom(bbox, viewport.width));
  }, [bbox, georef.isGeoreferenced, viewport.width]);

  const [tiles, setTiles] = useState<MapTileRef[]>(nextTiles);
  const shownRef = useRef(nextTiles.length > 0);

  useEffect(() => {
    if (!shownRef.current) {
      shownRef.current = nextTiles.length > 0;
      setTiles(nextTiles);
      return;
    }
    const timer = window.setTimeout(() => setTiles(nextTiles), 180);
    return () => window.clearTimeout(timer);
  }, [nextTiles]);

  if (!bbox || tiles.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
      style={{ isolation: "isolate" }}
    >
      {tiles.map((tile) => {
        const style = tileStyle(tile, viewport, georef);
        if (!style) return null;
        return (
          <CadMapTile
            key={`${tile.z}-${tile.x}-${tile.y}`}
            tile={tile}
            mapTypeId={mapTypeId}
            style={style}
          />
        );
      })}
    </div>
  );
}
