"use client";

import type { ChangeEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJsonObject } from "geojson";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Circle,
  GeoJSON as LeafletGeoJSON,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMapEvents,
} from "react-leaflet";

const MAP_HEIGHT = 380;
const PAD = 56;
const DEFAULT_CENTER = { lat: -14.235004, lng: -51.92528 };

type ToolbarTool = "nav" | "measure" | "draw";

function formatDistanceMeters(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

export type { FieldFuroPin, FieldMapMode } from "@/components/field-campaign-map-types";
import type { FieldFuroPin, FieldMapMode } from "@/components/field-campaign-map-types";

type Props = {
  className?: string;
  hint?: ReactNode;
  /** Barra de ferramentas (ponto / medir / desenhar / importar GeoJSON). */
  showToolbar?: boolean;
  /**
   * Mapa a 100vh com `#map` no contentor; barra em coluna, absoluta (esq. 10px, topo 50px),
   * fundo branco — como o layout clássico em HTML/CSS.
   */
  fullViewport?: boolean;
  obraPosition: { lat: number; lng: number } | null;
  furos: FieldFuroPin[];
  mapMode: FieldMapMode;
  selectedFuroId: number | null;
  userPosition: { lat: number; lng: number } | null;
  /** Tooltip do marcador azul (ex.: última posição guardada no dispositivo). */
  userPositionTitle?: string;
  /** Incrementar para recentrar / ajustar zoom a todos os pontos. */
  recenterKey: number;
  onObraMapClick: (lng: number, lat: number) => void;
  onFuroMapClick: (furoId: number, lng: number, lat: number) => void;
};

function collectPoints(
  obraPosition: { lat: number; lng: number } | null,
  furos: FieldFuroPin[],
  userPosition: { lat: number; lng: number } | null,
  includeUserInBounds = false,
): Array<{ lat: number; lng: number }> {
  const pts: Array<{ lat: number; lng: number }> = [];
  if (obraPosition) pts.push(obraPosition);
  for (const f of furos) {
    if (
      f.latitude != null &&
      f.longitude != null &&
      Number.isFinite(f.latitude) &&
      Number.isFinite(f.longitude)
    ) {
      pts.push({ lat: f.latitude, lng: f.longitude });
    }
  }
  if (includeUserInBounds && userPosition) pts.push(userPosition);
  return pts;
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function measureLengthMeters(path: Array<{ lat: number; lng: number }>): number {
  if (path.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += distanceMeters(path[i - 1]!, path[i]!);
  }
  return total;
}

function ClickCapture({
  mapTool,
  mapMode,
  selectedFuroId,
  onMapClick,
}: {
  mapTool: ToolbarTool;
  mapMode: FieldMapMode;
  selectedFuroId: number | null;
  onMapClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (mapTool !== "nav" && mapTool !== "measure" && mapTool !== "draw") return;
      if (mapTool === "nav" && mapMode === "furo" && selectedFuroId == null) return;
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function FieldCampaignMap({
  className = "",
  hint,
  showToolbar = true,
  fullViewport = false,
  obraPosition,
  furos,
  mapMode,
  selectedFuroId,
  userPosition,
  userPositionTitle,
  recenterKey,
  onObraMapClick,
  onFuroMapClick,
}: Props) {
  const [mapTool, setMapTool] = useState<ToolbarTool>("nav");
  const [measurePath, setMeasurePath] = useState<Array<{ lat: number; lng: number }>>([]);
  const [drawPath, setDrawPath] = useState<Array<{ lat: number; lng: number }>>([]);
  const [importedGeoJson, setImportedGeoJson] = useState<GeoJsonObject | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const initialFitDone = useRef(false);
  const lastRecenter = useRef(-1);

  const effectiveTool: ToolbarTool = showToolbar ? mapTool : "nav";

  const resetTools = useCallback(() => {
    setMapTool("nav");
    setMeasurePath([]);
    setDrawPath([]);
    setImportError(null);
    setImportedGeoJson(null);
  }, []);

  const applyBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts = collectPoints(obraPosition, furos, userPosition, false);
    if (pts.length === 0) {
      map.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 5, { animate: false });
      return;
    }
    if (pts.length === 1) {
      map.setView([pts[0]!.lat, pts[0]!.lng], 17, { animate: false });
      return;
    }
    const bounds = L.latLngBounds(pts.map((p) => [p.lat, p.lng] as L.LatLngTuple));
    map.fitBounds(bounds, { padding: [PAD, PAD], maxZoom: 17, animate: false });
    if (map.getZoom() < 10) {
      map.setZoom(10, { animate: false });
    }
  }, [obraPosition, furos, userPosition]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!initialFitDone.current) {
      const pts = collectPoints(obraPosition, furos, userPosition, false);
      if (pts.length > 0) {
        initialFitDone.current = true;
        applyBounds();
      }
    }
  }, [obraPosition, furos, userPosition, applyBounds]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (recenterKey !== lastRecenter.current) {
      lastRecenter.current = recenterKey;
      applyBounds();
    }
  }, [recenterKey, applyBounds]);

  const center = useMemo(() => {
    if (obraPosition) return obraPosition;
    for (const f of furos) {
      if (
        f.latitude != null &&
        f.longitude != null &&
        Number.isFinite(f.latitude) &&
        Number.isFinite(f.longitude)
      ) {
        return { lat: f.latitude, lng: f.longitude };
      }
    }
    return DEFAULT_CENTER;
  }, [obraPosition, furos]);

  const measureLengthM = useMemo(() => {
    if (measurePath.length < 2) return null;
    return measureLengthMeters(measurePath);
  }, [measurePath]);

  const onMapClick = useCallback(
    (lat: number, lng: number) => {
      if (effectiveTool === "measure") {
        setMeasurePath((prev) => [...prev, { lat, lng }]);
        return;
      }
      if (effectiveTool === "draw") {
        setDrawPath((prev) => [...prev, { lat, lng }]);
        return;
      }

      if (mapMode === "obra") {
        onObraMapClick(lng, lat);
      } else if (selectedFuroId != null) {
        onFuroMapClick(selectedFuroId, lng, lat);
      }
    },
    [
      effectiveTool,
      mapMode,
      selectedFuroId,
      onObraMapClick,
      onFuroMapClick,
    ],
  );

  const onImportFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setImportError(null);
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = String(reader.result ?? "");
          const parsed: unknown = JSON.parse(text);
          if (
            typeof parsed !== "object" ||
            parsed === null ||
            !("type" in parsed) ||
            typeof (parsed as { type?: unknown }).type !== "string"
          ) {
            setImportError("Ficheiro inválido.");
            return;
          }
          const geo = parsed as GeoJsonObject;
          const bounds = L.geoJSON(geo).getBounds();
          if (!bounds.isValid()) {
            setImportError("GeoJSON sem coordenadas.");
            return;
          }
          setImportedGeoJson(geo);
          mapRef.current?.fitBounds(bounds, { padding: [PAD, PAD] });
        } catch {
          setImportError("Não foi possível ler o GeoJSON.");
        }
      };
      reader.readAsText(file, "UTF-8");
    },
    [],
  );
  useEffect(() => {
    void import("@/lib/leaflet-setup").then((m) => m.ensureLeafletSetup());
  }, []);

  const userIcon = L.divIcon({
    className: "geo-user-location-icon",
    html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:#1a73e8;border:2px solid #fff;box-shadow:0 0 0 5px rgba(26,115,232,0.28)"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

  const furoMarkerIcon = (selected: boolean) =>
    L.divIcon({
      className: "field-furo-pin-icon",
      html: `<span style="display:block;width:${selected ? 16 : 12}px;height:${selected ? 16 : 12}px;border-radius:9999px;background:${selected ? "#0d9488" : "#64748b"};border:${selected ? 3 : 2}px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>`,
      iconSize: [selected ? 16 : 12, selected ? 16 : 12],
      iconAnchor: [selected ? 8 : 6, selected ? 8 : 6],
    });

  const toolbarBtn =
    "rounded-lg border px-3 py-2 text-sm font-medium transition-colors";
  const toolbarBtnIdle =
    "border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--surface)]";
  const toolbarBtnActive =
    "border-teal-600 bg-teal-50 text-teal-900 ring-2 ring-teal-500/40 dark:border-teal-500 dark:bg-teal-950/50 dark:text-teal-100";

  const toolbarBtnFull =
    "w-full min-w-0 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm font-medium text-neutral-900 shadow-sm transition-colors hover:bg-neutral-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700";
  const toolbarBtnFullActive =
    "w-full min-w-0 rounded-lg border border-teal-600 bg-teal-50 px-3 py-2 text-left text-sm font-semibold text-teal-900 ring-2 ring-teal-500/30 dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-50";

  const mapContainerClassResolved = fullViewport
    ? "absolute inset-0 h-full w-full overflow-hidden"
    : "overflow-hidden rounded-lg border border-[var(--border)]";

  const measureHelp = (
    <>
      Clique no mapa para marcar vértices da polilinha.
      {measureLengthM != null && (
        <span
          className={
            fullViewport
              ? "mt-1 block font-medium text-neutral-900 dark:text-zinc-100"
              : "ml-2 font-medium text-[var(--text)]"
          }
        >
          Distância: {formatDistanceMeters(measureLengthM)}
        </span>
      )}
    </>
  );

  const drawHelp = (
    <>
      Clique no mapa para desenhar uma polilinha simples. «Ponto» remove desenhos e importação.
    </>
  );

  return (
    <div
      className={`${className ?? ""} ${fullViewport ? "relative h-[100vh] min-h-0 w-full" : ""}`.trim()}
    >
      {!fullViewport && showToolbar && (
        <div
          className="mb-2 flex flex-wrap gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
          role="toolbar"
          aria-label="Ferramentas do mapa"
        >
          <button
            type="button"
            className={`${toolbarBtn} ${effectiveTool === "nav" ? toolbarBtnActive : toolbarBtnIdle}`}
            onClick={resetTools}
          >
            📍 Ponto
          </button>
          <button
            type="button"
            className={`${toolbarBtn} ${effectiveTool === "measure" ? toolbarBtnActive : toolbarBtnIdle}`}
            onClick={() => {
              setImportError(null);
              setMapTool("measure");
              setMeasurePath([]);
            }}
          >
            📏 Medir
          </button>
          <button
            type="button"
            className={`${toolbarBtn} ${effectiveTool === "draw" ? toolbarBtnActive : toolbarBtnIdle}`}
            onClick={() => {
              setImportError(null);
              setMeasurePath([]);
              setDrawPath([]);
              setMapTool("draw");
            }}
          >
            ✏️ Desenhar
          </button>
          <button
            type="button"
            className={`${toolbarBtn} ${toolbarBtnIdle}`}
            onClick={() => importInputRef.current?.click()}
          >
            🗺️ Importar
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,.geojson,application/geo+json"
            className="sr-only"
            aria-hidden
            onChange={onImportFileChange}
          />
          {effectiveTool === "measure" && measurePath.length > 0 && (
            <button
              type="button"
              className={`${toolbarBtn} ${toolbarBtnIdle}`}
              onClick={() => setMeasurePath([])}
            >
              Limpar medida
            </button>
          )}
        </div>
      )}
      {!fullViewport && showToolbar && effectiveTool === "measure" && (
        <p className="mb-2 text-xs text-[var(--muted)]">{measureHelp}</p>
      )}
      {!fullViewport && showToolbar && effectiveTool === "draw" && (
        <p className="mb-2 text-xs text-[var(--muted)]">{drawHelp}</p>
      )}
      {!fullViewport && importError && (
        <p className="mb-2 text-sm text-red-600 dark:text-red-400" role="alert">
          {importError}
        </p>
      )}
      <div
        className={mapContainerClassResolved}
        style={fullViewport ? undefined : { height: MAP_HEIGHT }}
      >
        <MapContainer
          id={fullViewport ? "map" : undefined}
          center={[center.lat, center.lng]}
          zoom={16}
          minZoom={5}
          maxZoom={19}
          worldCopyJump={false}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
          className="z-0"
          ref={mapRef}
        >
          <ClickCapture
            mapTool={effectiveTool}
            mapMode={mapMode}
            selectedFuroId={selectedFuroId}
            onMapClick={onMapClick}
          />
          <TileLayer
            attribution="Imagem © Esri (Maxar, Earthstar Geographics, etc.)"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
            maxNativeZoom={19}
          />
          <TileLayer
            attribution="Nomes © Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
            maxNativeZoom={19}
            opacity={0.95}
          />
          {importedGeoJson && (
            <LeafletGeoJSON
              data={importedGeoJson}
              style={{
                color: "#ea580c",
                weight: 2,
                fillOpacity: 0.12,
              }}
            />
          )}
          {measurePath.length > 0 && (
            <Polyline
              positions={measurePath.map((p) => [p.lat, p.lng])}
              pathOptions={{ color: "#0d9488", weight: 3 }}
            />
          )}
          {drawPath.length > 0 && (
            <Polyline
              positions={drawPath.map((p) => [p.lat, p.lng])}
              pathOptions={{ color: "#ea580c", weight: 3, dashArray: "6 4" }}
            />
          )}
        {obraPosition && (
          <Marker
            position={[obraPosition.lat, obraPosition.lng]}
            title="Referência da obra"
          >
            <Tooltip permanent direction="top" offset={[0, -8]}>
              Obra
            </Tooltip>
          </Marker>
        )}
        {furos.map((f) => {
          if (
            f.latitude == null ||
            f.longitude == null ||
            !Number.isFinite(f.latitude) ||
            !Number.isFinite(f.longitude)
          ) {
            return null;
          }
          const emEdicao =
            mapMode === "furo" &&
            selectedFuroId != null &&
            f.id === selectedFuroId;
          return (
            <Marker
              key={f.id}
              position={[f.latitude, f.longitude]}
              title={`Furo ${f.codigo}`}
              icon={furoMarkerIcon(emEdicao)}
              zIndexOffset={emEdicao ? 400 : 0}
            >
              <Tooltip permanent direction="top" offset={[0, -10]}>
                {f.codigo.length > 12 ? `${f.codigo.slice(0, 11)}…` : f.codigo}
              </Tooltip>
            </Marker>
          );
        })}
        {userPosition && (
          <>
            <Circle
              center={[userPosition.lat, userPosition.lng]}
              radius={18}
              interactive={false}
              pathOptions={{ color: "#60a5fa", weight: 1, fillColor: "#93c5fd", fillOpacity: 0.25 }}
            />
            <Marker
              position={[userPosition.lat, userPosition.lng]}
              title={userPositionTitle ?? "A sua posição (GPS)"}
              icon={userIcon}
              interactive={false}
            />
          </>
        )}
        </MapContainer>
      </div>
      {fullViewport && showToolbar && (
        <div
          className="toolbar absolute left-[10px] top-[50px] z-20 flex min-w-[152px] max-w-[min(260px,calc(100vw-24px))] flex-col gap-[10px] rounded-[10px] bg-white p-[10px] shadow-lg dark:border dark:border-zinc-600 dark:bg-zinc-900"
          role="toolbar"
          aria-label="Ferramentas do mapa"
        >
          <button
            type="button"
            className={
              effectiveTool === "nav" ? toolbarBtnFullActive : toolbarBtnFull
            }
            onClick={resetTools}
          >
            📍 Ponto
          </button>
          <button
            type="button"
            className={
              effectiveTool === "measure"
                ? toolbarBtnFullActive
                : toolbarBtnFull
            }
            onClick={() => {
              setImportError(null);
              setMapTool("measure");
              setMeasurePath([]);
            }}
          >
            📏 Medir
          </button>
          <button
            type="button"
            className={
              effectiveTool === "draw" ? toolbarBtnFullActive : toolbarBtnFull
            }
            onClick={() => {
              setImportError(null);
              setMeasurePath([]);
              setDrawPath([]);
              setMapTool("draw");
            }}
          >
            ✏️ Desenhar
          </button>
          <button
            type="button"
            className={toolbarBtnFull}
            onClick={() => importInputRef.current?.click()}
          >
            🗺️ Importar
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,.geojson,application/geo+json"
            className="sr-only"
            aria-hidden
            onChange={onImportFileChange}
          />
          {effectiveTool === "measure" && measurePath.length > 0 && (
            <button
              type="button"
              className={toolbarBtnFull}
              onClick={() => setMeasurePath([])}
            >
              Limpar medida
            </button>
          )}
          {effectiveTool === "measure" && (
            <p className="text-xs leading-snug text-neutral-600 dark:text-zinc-300">
              {measureHelp}
            </p>
          )}
          {effectiveTool === "draw" && (
            <p className="text-xs leading-snug text-neutral-600 dark:text-zinc-300">
              {drawHelp}
            </p>
          )}
          {importError && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
              {importError}
            </p>
          )}
        </div>
      )}
      {fullViewport && hint && (
        <div className="absolute bottom-3 left-3 right-3 z-10 max-w-lg rounded-[10px] border border-neutral-200/80 bg-white/95 p-3 text-xs text-neutral-700 shadow-md dark:border-zinc-600 dark:bg-zinc-900/95 dark:text-zinc-200 md:right-auto">
          {hint}
        </div>
      )}
      {!fullViewport && hint}
    </div>
  );
}
