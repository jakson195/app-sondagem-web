"use client";

import type { MapLayerMouseEvent } from "mapbox-gl";
import { useCallback, useMemo, useState } from "react";
import Map, { Layer, Popup, Source } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { getMapboxAccessToken, MAPBOX_STYLE_SATELLITE_STREETS } from "@/lib/mapbox-config";
import { riskColor, riskLabel } from "@/lib/taludes/risk";
import type {
  ChangePointsGeoJSON,
  SegmentationGeoJSON,
  VectorsGeoJSON,
} from "@/lib/taludes/types";

type Props = {
  heatmapUrl?: string | null;
  bounds?: [number, number, number, number] | null;
  points?: ChangePointsGeoJSON | null;
  vectors?: VectorsGeoJSON | null;
  segmentation?: SegmentationGeoJSON | null;
  showHeatmap?: boolean;
  showVectors?: boolean;
  showPolygons?: boolean;
};

function boundsToCoords(bounds: [number, number, number, number]) {
  const [west, south, east, north] = bounds;
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ] as [[number, number], [number, number], [number, number], [number, number]];
}

export function TaludeMapboxPanel({
  heatmapUrl,
  bounds,
  points,
  vectors,
  segmentation,
  showHeatmap = true,
  showVectors = true,
  showPolygons = true,
}: Props) {
  const token = getMapboxAccessToken();
  const [popup, setPopup] = useState<{
    lng: number;
    lat: number;
    intensity: number;
    risk: string;
    tipo?: string;
  } | null>(null);

  const viewState = useMemo(() => {
    if (!bounds) return { longitude: -49.5, latitude: -27.5, zoom: 12 };
    const [w, s, e, n] = bounds;
    return { longitude: (w + e) / 2, latitude: (s + n) / 2, zoom: 15 };
  }, [bounds]);

  const onClick = useCallback((e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (!f || f.geometry.type !== "Point") {
      setPopup(null);
      return;
    }
    const [lng, lat] = f.geometry.coordinates as [number, number];
    const p = f.properties as { intensity?: number; risk?: string; tipo?: string };
    setPopup({
      lng,
      lat,
      intensity: p.intensity ?? 0,
      risk: p.risk ?? "baixo",
      tipo: p.tipo,
    });
  }, []);

  if (!token) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center rounded-xl border border-amber-500/30 bg-slate-950/80 p-6 text-center text-sm text-amber-200">
        Defina <code className="text-amber-100">NEXT_PUBLIC_MAPBOX_TOKEN</code> no
        .env.local para o mapa 2D.
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-xl border border-slate-700/80">
      <Map
        mapboxAccessToken={token}
        initialViewState={{ ...viewState, bearing: 0, pitch: 0 }}
        mapStyle={MAPBOX_STYLE_SATELLITE_STREETS}
        style={{ width: "100%", height: "100%" }}
        interactiveLayerIds={["talude-points"]}
        onClick={onClick}
      >
        {showHeatmap && heatmapUrl && bounds && (
          <Source
            id="heatmap"
            type="image"
            url={heatmapUrl}
            coordinates={boundsToCoords(bounds)}
          >
            <Layer id="heatmap-layer" type="raster" paint={{ "raster-opacity": 0.72 }} />
          </Source>
        )}

        {showPolygons && segmentation && (
          <Source id="seg" type="geojson" data={segmentation}>
            <Layer
              id="seg-fill"
              type="fill"
              paint={{ "fill-color": "#f97316", "fill-opacity": 0.35 }}
            />
            <Layer
              id="seg-line"
              type="line"
              paint={{ "line-color": "#fb923c", "line-width": 2 }}
            />
          </Source>
        )}

        {showVectors && vectors && (
          <Source id="flow" type="geojson" data={vectors}>
            <Layer
              id="flow-arrows"
              type="line"
              paint={{ "line-color": "#38bdf8", "line-width": 2 }}
            />
          </Source>
        )}

        {points && (
          <Source id="pts" type="geojson" data={points}>
            <Layer
              id="talude-points"
              type="circle"
              paint={{
                "circle-radius": 8,
                "circle-color": [
                  "match",
                  ["get", "risk"],
                  "alto",
                  "#ef4444",
                  "medio",
                  "#f59e0b",
                  "#22c55e",
                ],
                "circle-stroke-width": 2,
                "circle-stroke-color": "#fff",
              }}
            />
          </Source>
        )}

        {popup && (
          <Popup
            longitude={popup.lng}
            latitude={popup.lat}
            onClose={() => setPopup(null)}
            closeOnClick={false}
          >
            <div className="text-xs text-slate-900">
              <strong style={{ color: riskColor(popup.risk) }}>
                {riskLabel(popup.risk)}
              </strong>
              <br />
              Intensidade: {(popup.intensity * 100).toFixed(1)}%
              {popup.tipo && (
                <>
                  <br />
                  Tipo: {popup.tipo}
                </>
              )}
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}
