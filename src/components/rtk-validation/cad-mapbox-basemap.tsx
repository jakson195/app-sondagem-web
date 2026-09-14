"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import Map, { type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { getMapboxAccessToken, MAPBOX_STYLE_SATELLITE_STREETS } from "@/lib/mapbox-config";
import type { CadViewport } from "@/lib/rtk-validation/cad/viewport";
import { viewBoxToCss, worldToScreen } from "@/lib/rtk-validation/cad/viewport";
import {
  enToLatLonGeoref,
  vertexToEn,
  viewportBbox4326GeorefSafe,
  type CadGeorefContext,
} from "@/lib/rtk-validation/cad/georef";

type Props = {
  viewport: CadViewport;
  georef: CadGeorefContext;
};

type Pt = { x: number; y: number };

function solveAffine3(from: [Pt, Pt, Pt], to: [Pt, Pt, Pt]): [number, number, number, number, number, number] | null {
  const A: [[number, number, number], [number, number, number], [number, number, number]] = [
    [from[0].x, from[0].y, 1],
    [from[1].x, from[1].y, 1],
    [from[2].x, from[2].y, 1],
  ];
  const det =
    A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
    A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
    A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-8) return null;

  const inv = [
    [
      (A[1][1] * A[2][2] - A[1][2] * A[2][1]) / det,
      (A[0][2] * A[2][1] - A[0][1] * A[2][2]) / det,
      (A[0][1] * A[1][2] - A[0][2] * A[1][1]) / det,
    ],
    [
      (A[1][2] * A[2][0] - A[1][0] * A[2][2]) / det,
      (A[0][0] * A[2][2] - A[0][2] * A[2][0]) / det,
      (A[0][2] * A[1][0] - A[0][0] * A[1][2]) / det,
    ],
    [
      (A[1][0] * A[2][1] - A[1][1] * A[2][0]) / det,
      (A[0][1] * A[2][0] - A[0][0] * A[2][1]) / det,
      (A[0][0] * A[1][1] - A[0][1] * A[1][0]) / det,
    ],
  ];

  const bx: [number, number, number] = [to[0].x, to[1].x, to[2].x];
  const by: [number, number, number] = [to[0].y, to[1].y, to[2].y];
  const colX = [
    inv[0][0] * bx[0] + inv[0][1] * bx[1] + inv[0][2] * bx[2],
    inv[1][0] * bx[0] + inv[1][1] * bx[1] + inv[1][2] * bx[2],
    inv[2][0] * bx[0] + inv[2][1] * bx[1] + inv[2][2] * bx[2],
  ];
  const colY = [
    inv[0][0] * by[0] + inv[0][1] * by[1] + inv[0][2] * by[2],
    inv[1][0] * by[0] + inv[1][1] * by[1] + inv[1][2] * by[2],
    inv[2][0] * by[0] + inv[2][1] * by[1] + inv[2][2] * by[2],
  ];
  // CSS matrix(a, b, c, d, tx, ty): x' = a x + c y + tx; y' = b x + d y + ty
  const a = colX[0];
  const c = colX[1];
  const tx = colX[2];
  const b = colY[0];
  const d = colY[1];
  const ty = colY[2];
  if (![a, b, c, d, tx, ty].every(Number.isFinite)) return null;
  return [a, b, c, d, tx, ty];
}

function viewportWorldCorners(viewport: CadViewport) {
  return [
    { x: viewport.minX, y: viewport.minY },
    { x: viewport.maxX, y: viewport.minY },
    { x: viewport.maxX, y: viewport.maxY },
    { x: viewport.minX, y: viewport.maxY },
  ];
}

export function CadMapboxBasemap({ viewport, georef }: Props) {
  const mapRef = useRef<MapRef>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const token = getMapboxAccessToken();

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

  useLayoutEffect(() => {
    const mapApi = mapRef.current;
    const wrap = wrapRef.current;
    if (!mapApi || !bbox || !wrap) return;
    const map = mapApi.getMap();

    const syncBounds = () => {
      const cssW = wrap.clientWidth;
      const cssH = wrap.clientHeight;
      if (cssW < 2 || cssH < 2) return;

      wrap.style.transform = "none";
      wrap.style.transformOrigin = "0 0";

      const padX = (viewport.padding / Math.max(viewport.width, 1)) * cssW;
      const padY = (viewport.padding / Math.max(viewport.height, 1)) * cssH;

      map.resize();
      map.fitBounds(
        [
          [bbox.minLon, bbox.minLat],
          [bbox.maxLon, bbox.maxLat],
        ],
        {
          padding: {
            top: padY,
            bottom: padY,
            left: padX,
            right: padX,
          },
          animate: false,
          linear: true,
          duration: 0,
          maxZoom: 22,
        },
      );

      const corners = viewportWorldCorners(viewport);
      const from: Pt[] = [];
      const to: Pt[] = [];
      for (const corner of corners) {
        const { e, n } = vertexToEn({ x: corner.x, y: corner.y, z: 0 }, georef);
        const ll = enToLatLonGeoref(e, n, georef);
        if (!Number.isFinite(ll.lon) || !Number.isFinite(ll.lat)) return;
        const projected = map.project([ll.lon, ll.lat]);
        from.push({ x: projected.x, y: projected.y });
        const screen = worldToScreen(corner.x, corner.y, viewport);
        to.push(viewBoxToCss(screen.sx, screen.sy, cssW, cssH, viewport.width, viewport.height));
      }

      const affine = solveAffine3(
        [from[0], from[1], from[3]] as [Pt, Pt, Pt],
        [to[0], to[1], to[3]] as [Pt, Pt, Pt],
      );
      if (!affine) return;
      const [a, b, c, d, tx, ty] = affine;
      wrap.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${tx}, ${ty})`;
    };

    const onLoad = () => syncBounds();
    if (map.isStyleLoaded()) syncBounds();
    else map.once("load", onLoad);
    map.on("resize", syncBounds);
    return () => {
      map.off("load", onLoad);
      map.off("resize", syncBounds);
    };
  }, [
    bbox,
    viewport.minX,
    viewport.maxX,
    viewport.minY,
    viewport.maxY,
    viewport.width,
    viewport.height,
    viewport.padding,
    georef,
  ]);

  if (!token) {
    return (
      <div className="absolute inset-0 z-0 flex items-center justify-center bg-[#1a1a1a] p-4 text-center text-[10px] text-amber-200">
        Defina <code className="text-amber-100">NEXT_PUBLIC_MAPBOX_TOKEN</code> no .env.local e
        reinicie o Next.js.
      </div>
    );
  }

  if (!bbox) return null;

  const cx = (bbox.minLon + bbox.maxLon) / 2;
  const cy = (bbox.minLat + bbox.maxLat) / 2;

  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      <div ref={wrapRef} className="absolute inset-0" style={{ transformOrigin: "0 0" }}>
        <Map
          ref={mapRef}
          mapboxAccessToken={token}
          mapStyle={MAPBOX_STYLE_SATELLITE_STREETS}
          initialViewState={{ longitude: cx, latitude: cy, zoom: 4, bearing: 0, pitch: 0 }}
          style={{ width: "100%", height: "100%" }}
          interactive={false}
          attributionControl={false}
          dragPan={false}
          scrollZoom={false}
          doubleClickZoom={false}
          touchZoomRotate={false}
          keyboard={false}
          boxZoom={false}
        />
      </div>
    </div>
  );
}
