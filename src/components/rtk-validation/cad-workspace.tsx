"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runQueuedInEffect } from "@/lib/react/queue-in-effect";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import { useRouter } from "next/navigation";
import {
  buildCadProjectFromPayload,
  exportCadProjectOds,
  exportCadProjectShapefileZip,
  loadCadImportPayload,
  clearCadImportPayload,
  computeViewportBoundsSafe,
  screenToWorld,
  worldToScreen,
  gridDataForViewport,
  formatGridLabel,
  computePolygonMetrics,
  hitTestPolyline,
  hitTestPolylineVertexIndex,
  findPolylineEdgeInsert,
  generateMemorialDocx,
  downloadBlob,
  extractSurveyElevationPoints,
  generateContoursFromPoints,
  removeContourEntities,
  findPointAtScreen,
  listPointEntities,
  CONTOUR_LAYER,
  CONTOUR_COLOR_MAJOR,
  CONTOUR_COLOR_MINOR,
  formatContourElevationLabel,
  parseContourElevation,
  pickContourLabelVertex,
  vertexLabelsPn,
  loadMemorialFormDefaults,
  saveMemorialFormDefaults,
  defaultMemorialForm,
  DEFAULT_MEMORIAL_FOOTER,
  resolveDrawVertex,
  vertexFromPolar,
  vertexFromDistance,
  parseDrawNumber,
  segmentLengthM,
  segmentAzimuthDeg,
  listSavedCadProjects,
  saveCadProject,
  loadCadProject,
  deleteCadProject,
  getLastOpenedCadProjectId,
  setLastOpenedCadProjectId,
  clearLastOpenedCadProjectId,
  saveCadDraft,
  loadCadDraft,
  clearCadDraft,
  formatSavedDate,
  appendPolygonCenterLabel,
  formatAreaBr,
  polygonCentroid,
  generateTinEntities,
  removeTinEntities,
  TIN_LAYER,
  generateHypsometricRaster,
  importSurveyPointsToProject,
  detectCadGeorefFromProject,
  ensureRasterLayerInProject,
  removeRasterLayerFromProject,
  rastersWithLayerVisibility,
  countRasterLayerItems,
  createUserLayer,
  defaultDrawLayerStyles,
  getLayerFillColor,
  getLayerLineColor,
  getLayerLineWidth,
  getLayerTextColor,
  mergeLayerStyles,
  normalizeCadLayers,
} from "@/lib/rtk-validation/cad";
import { isCoordLabelEntity, resolveCoordLabelLayout } from "@/lib/rtk-validation/cad/label-layout";
import { parseSurveyUpload } from "@/lib/rtk-validation/parsers";
import type { MemorialFormDefaults, MemorialKind, SavedCadProjectRecord } from "@/lib/rtk-validation/cad";
import type {
  CadEntity,
  CadLayer,
  CadPointEntity,
  CadPolylineEntity,
  CadProject,
  CadRasterOverlay,
  CadTool,
  CadVertex,
} from "@/lib/rtk-validation/cad/types";
import { downloadOdsBlob } from "@/lib/rtk-validation/ods-writer";
import { CadPrintLayout } from "@/components/rtk-validation/cad-print-layout";
import {
  CadBasemapAttribution,
  CadBasemapLayer,
  DEFAULT_CAD_BASEMAP_OVERLAYS,
  type AnmSigmineLayerKey,
  type CadBasemapOverlays,
} from "@/components/rtk-validation/cad-basemap-layer";
import { CadRasterLegend, CadRasterSvgLayer } from "@/components/rtk-validation/cad-raster-overlay";
import { CadAiChat } from "@/components/rtk-validation/cad-ai-chat";
import { CadCommandsPanel } from "@/components/rtk-validation/cad-commands-panel";
import { CadLayersPanel } from "@/components/rtk-validation/cad-layers-panel";
import { CadPointObservations } from "@/components/rtk-validation/cad-point-observations";
import { CadToolsSidebar, type CadToolsTab } from "@/components/rtk-validation/cad-tools-sidebar";
import { CadSvgMultilineText } from "@/components/rtk-validation/cad-svg-multiline-text";
import { CadProfileView } from "@/components/rtk-validation/cad-profile-view";

const Cad3dView = dynamic(
  () => import("@/components/rtk-validation/cad-3d-view").then((m) => m.Cad3dView),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[560px] items-center justify-center bg-[#0b1220] text-sm text-[#94a3b8]">
        Carregando vista 3D…
      </div>
    ),
  },
);
import type { CadAiSideEffect } from "@/lib/rtk-validation/cad/ai-command-types";
import { executeCadAiCommand } from "@/lib/rtk-validation/cad/ai-command-executor";
import { isTerrainProfileLayer } from "@/lib/rtk-validation/cad/profile";
import { ORTHOPHOTO_LAYER } from "@/lib/rtk-validation/cad/raster-layers";
import { isViewportSmallEnoughForImport } from "@/lib/rtk-validation/cad/map-tiles";
import { viewportBbox4326Georef } from "@/lib/rtk-validation/cad/georef";
import {
  ANM_SIGMINE_LAYER_KEYS,
  ANM_SIGMINE_LAYERS,
} from "@/lib/cad-map/overlay-sources";
import {
  mergeAnmLayerImport,
  type OverlayImportSource,
} from "@/lib/rtk-validation/cad/import-map-overlay";
import { anyAnmSigmineOverlay } from "@/lib/cad-map/anm-sigmine-layers";

type CadTabId = "desenho" | "layout";

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function emptyProject(name: string): CadProject {
  return {
    name,
    crs: "EPSG:4674",
    layers: [
      { id: "draw", name: "DESENHO", color: "#fbbf24", visible: true, locked: false, ...defaultDrawLayerStyles() },
    ],
    entities: [],
  };
}

function vertexLabels(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const base = String.fromCharCode(65 + (i % 26));
    return i >= 26 ? `${base}${Math.floor(i / 26)}` : base;
  });
}

type ViewBounds = ReturnType<typeof computeViewportBoundsSafe>;

const ZOOM_IN_FACTOR = 0.88;
const ZOOM_OUT_FACTOR = 1.12;
const MIN_VIEW_SPAN_M = 2;
const MAX_VIEW_SPAN_M = 50_000_000;

export function CadWorkspace({ userId }: { userId: string }) {
  const t = useTranslations("rtkCad");
  const t3d = useTranslations("rtkCad.view3d");
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [project, setProject] = useState<CadProject>(() => emptyProject("Projeto CAD"));
  const [activeLayerId, setActiveLayerId] = useState("draw");
  const [tool, setTool] = useState<CadTool>("select");
  const [viewMode, setViewMode] = useState<"plan" | "3d">("plan");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewBounds, setViewBounds] = useState<ViewBounds | null>(null);
  const [draft, setDraft] = useState<CadVertex[]>([]);
  const [panning, setPanning] = useState<{ startX: number; startY: number; bounds: ViewBounds } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number; z: number } | null>(null);
  const [imported, setImported] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [coordLabelsVisible, setCoordLabelsVisible] = useState(false);
  const [memorialForm, setMemorialForm] = useState<MemorialFormDefaults>(() => defaultMemorialForm());
  const [memorialFooterOpen, setMemorialFooterOpen] = useState(true);
  const [generatingMemorial, setGeneratingMemorial] = useState(false);
  const [contourInterval, setContourInterval] = useState("1");
  const [generatingContours, setGeneratingContours] = useState(false);
  const [contourInfo, setContourInfo] = useState<string | null>(null);
  const [contourError, setContourError] = useState<string | null>(null);
  const [generatingTin, setGeneratingTin] = useState(false);
  const [tinInfo, setTinInfo] = useState<string | null>(null);
  const [tinError, setTinError] = useState<string | null>(null);
  const [rasters, setRasters] = useState<CadRasterOverlay[]>([]);
  const [showHypsometricLegend, setShowHypsometricLegend] = useState(true);
  const [generatingHypsometric, setGeneratingHypsometric] = useState(false);
  const [hypsometricInfo, setHypsometricInfo] = useState<string | null>(null);
  const [hypsometricError, setHypsometricError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [importingPoints, setImportingPoints] = useState(false);
  const [pointEditZ, setPointEditZ] = useState("");
  const [pointActionNotice, setPointActionNotice] = useState<string | null>(null);
  const surveyFileRef = useRef<HTMLInputElement>(null);
  const excelFileRef = useRef<HTMLInputElement>(null);
  const [hoverSnapId, setHoverSnapId] = useState<string | null>(null);
  const [drawHint, setDrawHint] = useState<string | null>(null);
  const [pointSearch, setPointSearch] = useState("");
  const [activeTab, setActiveTab] = useState<CadTabId>("desenho");
  const [snapToRtkPoints, setSnapToRtkPoints] = useState(true);
  const [orthogonalMode, setOrthogonalMode] = useState(false);
  const [polarDistance, setPolarDistance] = useState("");
  const [polarAngle, setPolarAngle] = useState("");
  const [keyboardDistance, setKeyboardDistance] = useState("");
  const [drawPreview, setDrawPreview] = useState<CadVertex | null>(null);
  const [basemapOverlays, setBasemapOverlays] = useState<CadBasemapOverlays>(() => ({
    ...DEFAULT_CAD_BASEMAP_OVERLAYS,
    anmSigmine: { ...DEFAULT_CAD_BASEMAP_OVERLAYS.anmSigmine },
  }));
  const [importingOverlay, setImportingOverlay] = useState<string | null>(null);
  const [overlayNotice, setOverlayNotice] = useState<string | null>(null);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const [savedProjects, setSavedProjects] = useState<SavedCadProjectRecord[]>([]);
  const [openProjectsPanel, setOpenProjectsPanel] = useState(false);
  const [projectNotice, setProjectNotice] = useState<string | null>(null);
  const [savingProject, setSavingProject] = useState(false);
  const skipDraftSaveRef = useRef(false);
  const cursorAzimuthRef = useRef(0);

  const [exportingFormat, setExportingFormat] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [areaPickMode, setAreaPickMode] = useState(false);
  const [areaPickResult, setAreaPickResult] = useState<string | null>(null);
  const [distancePickMode, setDistancePickMode] = useState(false);
  const [distancePickIds, setDistancePickIds] = useState<string[]>([]);
  const [distancePickResult, setDistancePickResult] = useState<string | null>(null);
  const [profilePickMode, setProfilePickMode] = useState(false);
  const [profilePickIds, setProfilePickIds] = useState<string[]>([]);
  const [toolsTab, setToolsTab] = useState<CadToolsTab>("draw");
  const [profilePickResult, setProfilePickResult] = useState<string | null>(null);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  const [vertexDragIndex, setVertexDragIndex] = useState<number | null>(null);
  const [polygonEditNotice, setPolygonEditNotice] = useState<string | null>(null);
  const [vertexEditE, setVertexEditE] = useState("");
  const [vertexEditN, setVertexEditN] = useState("");
  const [vertexEditZ, setVertexEditZ] = useState("");

  const exportBaseName = useMemo(
    () => project.name.replace(/[^\w\-]+/g, "_").slice(0, 80) || "projeto_cad",
    [project.name],
  );

  const handleExportCad = useCallback(
    async (format: "dxf" | "dwg" | "shp", projectOverride?: CadProject) => {
      const src = projectOverride ?? project;
      const baseName = src.name.replace(/[^\w\-]+/g, "_").slice(0, 80) || "projeto_cad";
      if (src.entities.length === 0) {
        setExportError(t("export.empty"));
        return;
      }
      setExportError(null);
      setExportingFormat(format);
      try {
        if (format === "shp") {
          const zip = await exportCadProjectShapefileZip(src);
          downloadBlob(new Blob([zip], { type: "application/zip" }), `${baseName}_cad.zip`);
          return;
        }
        const res = await fetch("/api/cad/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project: src, format }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error || t("export.error"));
        }
        const blob = await res.blob();
        downloadBlob(blob, `${baseName}.${format}`);
      } catch (err) {
        setExportError(err instanceof Error ? err.message : t("export.error"));
      } finally {
        setExportingFormat(null);
      }
    },
    [project, t],
  );

  const width = 960;
  const height = 560;
  const padding = 40;

  const visibleEntities = useMemo(
    () =>
      project.entities.filter((e) => {
        if (isTerrainProfileLayer(e.layerId)) return false;
        if (!coordLabelsVisible && e.type === "point" && isCoordLabelEntity(e)) return false;
        const layer = project.layers.find((l) => l.id === e.layerId);
        return layer?.visible !== false;
      }),
    [project.entities, project.layers, coordLabelsVisible],
  );

  const hasTinLayer = useMemo(
    () => project.entities.some((e) => e.layerId === "tin"),
    [project.entities],
  );

  const layerMap = useMemo(
    () => new Map(project.layers.map((l) => [l.id, l])),
    [project.layers],
  );

  const layerEntityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const layer of project.layers) {
      counts[layer.id] =
        countRasterLayerItems(layer.id, rasters) ??
        project.entities.filter((e) => e.layerId === layer.id).length;
    }
    return counts;
  }, [project.layers, project.entities, rasters]);

  function resolveDrawLayerId(): string {
    const active = project.layers.find((l) => l.id === activeLayerId);
    if (active && !active.locked && active.visible !== false) return active.id;
    const draw = project.layers.find((l) => l.id === "draw" && !l.locked);
    if (draw) return draw.id;
    return project.layers.find((l) => !l.locked)?.id ?? "draw";
  }

  const displayRasters = useMemo(
    () =>
      rastersWithLayerVisibility(rasters, project.layers).filter((r) => r.kind !== "orthophoto"),
    [rasters, project.layers],
  );

  const visibleCadLayers = useMemo(
    () => normalizeCadLayers(project.layers).filter((l) => l.id !== ORTHOPHOTO_LAYER.id),
    [project.layers],
  );

  const bounds = viewBounds ?? computeViewportBoundsSafe(visibleEntities);

  const viewport = useMemo(
    () => ({ ...bounds, width, height, padding }),
    [bounds, width, height, padding],
  );

  const hasBasemap =
    basemapOverlays.satellite ||
    anyAnmSigmineOverlay(basemapOverlays.anmSigmine);
  const hasUnderlay = hasBasemap || displayRasters.some((r) => r.visible);

  const projectGeoref = useMemo(
    () => detectCadGeorefFromProject(project, bounds),
    [project, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY],
  );

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (!projectGeoref.isGeoreferenced) return;
        setMemorialForm((prev) => {
          const trimmed = prev.projectionNote.trim();
          const isGeneric =
            !trimmed ||
            trimmed === DEFAULT_MEMORIAL_FOOTER.projectionNote ||
            trimmed.toLowerCase() === "plano de projeção utm";
          if (!isGeneric) return prev;
          if (prev.projectionNote === projectGeoref.utmProjectionLabel) return prev;
          return { ...prev, projectionNote: projectGeoref.utmProjectionLabel };
        });
      }),
    [projectGeoref.isGeoreferenced, projectGeoref.utmProjectionLabel],
  );

  const handleImportOverlay = useCallback(
    async (source: OverlayImportSource, anmLayer?: AnmSigmineLayerKey) => {
      const importKey = source === "anm" && anmLayer ? `anm:${anmLayer}` : source;
      setImportingOverlay(importKey);
      setOverlayNotice(null);
      try {
        if (!projectGeoref.isGeoreferenced) {
          setOverlayNotice(t("basemap.needGeoref"));
          return;
        }
        if (!isViewportSmallEnoughForImport(bounds)) {
          setOverlayNotice(t("basemap.importTooLarge"));
          return;
        }
        const bbox = viewportBbox4326Georef(bounds, projectGeoref);
        const bboxStr = [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat]
          .map((n) => n.toFixed(6))
          .join(",");
        const swapEn = projectGeoref.eastingAxis === "y" ? "1" : "0";
        const params = new URLSearchParams({
          source,
          bbox: bboxStr,
          utmZone: String(projectGeoref.utmZone),
          swapEn,
        });
        if (source === "anm" && anmLayer) {
          params.set("anmLayer", anmLayer);
        }
        const res = await fetch(`/api/cad-map/import?${params.toString()}`);
        const data = (await res.json()) as {
          error?: string;
          entities?: CadEntity[];
          features?: number;
          anmLayer?: AnmSigmineLayerKey;
        };
        if (!res.ok || !data.entities?.length) {
          setOverlayNotice(data.error ?? t("basemap.importEmpty"));
          return;
        }
        setProject((prev) => {
          if (!data.anmLayer) return prev;
          const merged = mergeAnmLayerImport(
            prev.layers,
            prev.entities,
            data.anmLayer,
            data.entities!,
          );
          return { ...prev, layers: merged.layers, entities: merged.entities };
        });
        const sourceLabel = data.anmLayer
          ? t(`basemap.anmLayers.${data.anmLayer}`)
          : t("basemap.anm");
        setOverlayNotice(t("basemap.importDone", { count: data.entities.length, source: sourceLabel }));
      } catch {
        setOverlayNotice(t("basemap.importError"));
      } finally {
        setImportingOverlay(null);
      }
    },
    [bounds, visibleEntities, projectGeoref, project.crs, t],
  );

  useEffect(() => {
    if (!overlayNotice) return;
    const timer = window.setTimeout(() => setOverlayNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [overlayNotice]);

  function patchBasemapOverlay(key: "satellite", value: boolean) {
    if (value && !projectGeoref.isGeoreferenced) {
      setOverlayNotice(t("basemap.needGeoref"));
      return;
    }
    setBasemapOverlays((prev) => ({ ...prev, [key]: value }));
  }

  function patchAnmSigmineOverlay(key: AnmSigmineLayerKey, value: boolean) {
    if (value && !projectGeoref.isGeoreferenced) {
      setOverlayNotice(t("basemap.needGeoref"));
      return;
    }
    setBasemapOverlays((prev) => ({
      ...prev,
      anmSigmine: { ...prev.anmSigmine, [key]: value },
    }));
  }

  const grid = useMemo(() => gridDataForViewport(viewport), [viewport]);

  const elevationSamples = useMemo(
    () => extractSurveyElevationPoints(project.entities),
    [project.entities],
  );

  const pickablePoints = useMemo(() => listPointEntities(visibleEntities), [visibleEntities]);

  const filteredPickablePoints = useMemo(() => {
    const q = pointSearch.trim().toLowerCase();
    if (!q) return pickablePoints;
    return pickablePoints.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        p.vertex.x.toFixed(3).includes(q) ||
        p.vertex.y.toFixed(3).includes(q),
    );
  }, [pickablePoints, pointSearch]);

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (pickablePoints.length === 0) {
          setSnapToRtkPoints(false);
        }
      }),
    [pickablePoints.length],
  );

  useEffect(() => {
    if (!polygonEditNotice) return;
    const timer = window.setTimeout(() => setPolygonEditNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [polygonEditNotice]);

  useEffect(
    () => runQueuedInEffect(() => setSelectedVertexIndex(null)),
    [selectedId, tool],
  );

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (!selectedId || selectedVertexIndex === null) {
          setVertexEditE("");
          setVertexEditN("");
          setVertexEditZ("");
          return;
        }
        const entity = project.entities.find((e) => e.id === selectedId);
        if (entity?.type !== "polyline") return;
        const vertex = entity.vertices[selectedVertexIndex];
        if (!vertex) return;
        setVertexEditE(vertex.x.toFixed(4));
        setVertexEditN(vertex.y.toFixed(4));
        setVertexEditZ(vertex.z.toFixed(4));
      }),
    [selectedId, selectedVertexIndex, project.entities],
  );

  function isEditablePolyline(entity: CadPolylineEntity): boolean {
    const layer = layerMap.get(entity.layerId);
    if (layer?.locked) return false;
    if (entity.layerId === CONTOUR_LAYER.id || entity.layerId === TIN_LAYER.id) return false;
    return true;
  }

  function patchSelectedPolyline(
    patch: Partial<CadPolylineEntity> | ((entity: CadPolylineEntity) => CadPolylineEntity),
  ) {
    if (!selectedId) return;
    setProject((prev) => ({
      ...prev,
      entities: prev.entities.map((e) => {
        if (e.id !== selectedId || e.type !== "polyline") return e;
        return typeof patch === "function" ? patch(e) : { ...e, ...patch };
      }),
    }));
  }

  function updatePolylineVertex(polyId: string, index: number, vertex: CadVertex) {
    setProject((prev) => ({
      ...prev,
      entities: prev.entities.map((e) => {
        if (e.id !== polyId || e.type !== "polyline") return e;
        const vertices = e.vertices.map((v, i) => (i === index ? vertex : v));
        return { ...e, vertices };
      }),
    }));
  }

  function insertPolylineVertex(polyId: string, afterIndex: number, vertex: CadVertex) {
    setProject((prev) => ({
      ...prev,
      entities: prev.entities.map((e) => {
        if (e.id !== polyId || e.type !== "polyline") return e;
        const vertices = [...e.vertices];
        vertices.splice(afterIndex + 1, 0, vertex);
        return { ...e, vertices };
      }),
    }));
  }

  function removeSelectedPolylineVertex() {
    if (!selectedId || selectedVertexIndex === null) return;
    const entity = project.entities.find((e) => e.id === selectedId);
    if (entity?.type !== "polyline") return;
    const minVertices = entity.closed ? 3 : 2;
    if (entity.vertices.length <= minVertices) {
      setPolygonEditNotice(t("polygon.edit.minVertices"));
      return;
    }
    patchSelectedPolyline((poly) => ({
      ...poly,
      vertices: poly.vertices.filter((_, i) => i !== selectedVertexIndex),
    }));
    setSelectedVertexIndex(null);
    setPolygonEditNotice(t("polygon.edit.vertexRemoved"));
  }

  function applySelectedVertexCoords(eText: string, nText: string, zText: string) {
    if (!selectedId || selectedVertexIndex === null) return;
    const entity = project.entities.find((e) => e.id === selectedId);
    if (entity?.type !== "polyline") return;
    const x = Number(eText.replace(",", "."));
    const y = Number(nText.replace(",", "."));
    const z = Number(zText.replace(",", "."));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      setPolygonEditNotice(t("polygon.edit.invalidCoords"));
      return;
    }
    updatePolylineVertex(selectedId, selectedVertexIndex, { x, y, z });
    setPolygonEditNotice(t("polygon.edit.vertexSaved"));
  }

  const isDrawWithPoints = tool === "polyline" || tool === "line";
  const isDrawTool = isDrawWithPoints;
  const drawReference = draft.length > 0 ? draft[draft.length - 1] : null;
  const canUsePolar = isDrawTool && draft.length >= 1;

  function resolveClickVertex(sx: number, sy: number): CadVertex {
    return resolveDrawVertex(sx, sy, viewport, project.entities, {
      snapToPoints: snapToRtkPoints,
      orthogonalMode,
      reference: drawReference,
    });
  }

  function updateDrawPreview(sx: number, sy: number) {
    if (!isDrawTool || draft.length === 0) {
      setDrawPreview(null);
      return;
    }
    setDrawPreview(resolveClickVertex(sx, sy));
  }

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (!isDrawTool || !drawReference || !keyboardDistance.trim()) return;
        const typed = parseDrawNumber(keyboardDistance);
        if (typed === null || typed <= 0) return;
        setDrawPreview(vertexFromDistance(drawReference, typed, resolveDrawAzimuth(), orthogonalMode));
      }),
    [keyboardDistance, drawReference, orthogonalMode, polarAngle, isDrawTool, draft.length],
  );

  function resolveDrawAzimuth(): number {
    const typedAngle = polarAngle.trim() ? parseDrawNumber(polarAngle) : null;
    if (typedAngle !== null) return typedAngle;
    if (drawPreview && drawReference) {
      return segmentAzimuthDeg(drawReference, drawPreview);
    }
    if (draft.length >= 2) {
      return segmentAzimuthDeg(draft[draft.length - 2], draft[draft.length - 1]);
    }
    return cursorAzimuthRef.current;
  }

  function commitDrawVertex(vertex: CadVertex) {
    setDrawHint(null);

    if (tool === "line" && draft.length === 1) {
      addEntity({
        id: newId("ln"),
        type: "line",
        layerId: resolveDrawLayerId(),
        start: draft[0],
        end: vertex,
      });
      setDraft([]);
      setDrawPreview(null);
      setPolarDistance("");
      setPolarAngle("");
      setKeyboardDistance("");
      return;
    }

    addDraftVertex(vertex);
    setPolarDistance("");
    setPolarAngle("");
    setKeyboardDistance("");
  }

  function applyPolarVertex(overrides?: { distance?: number; angle?: number }) {
    if (!drawReference) return;
    const distance = overrides?.distance ?? parseDrawNumber(polarDistance);
    const angle = overrides?.angle ?? parseDrawNumber(polarAngle);
    if (distance === null || distance <= 0 || angle === null) {
      setDrawHint(t("draw.polarInvalid"));
      return;
    }
    commitDrawVertex(vertexFromPolar(drawReference, distance, angle));
  }

  function applyKeyboardDistance() {
    if (!drawReference) return;
    const distance = parseDrawNumber(keyboardDistance);
    if (distance === null || distance <= 0) {
      setDrawHint(t("draw.distanceInvalid"));
      return;
    }
    commitDrawVertex(vertexFromDistance(drawReference, distance, resolveDrawAzimuth(), orthogonalMode));
  }

  const refreshSavedProjects = useCallback(async () => {
    try {
      const projects = await listSavedCadProjects();
      setSavedProjects(projects);
    } catch {
      setSavedProjects([]);
    }
  }, []);

  useEffect(() => {
    skipDraftSaveRef.current = true;

    async function bootstrapProject() {
      const payload = loadCadImportPayload();
      if (payload) {
        const built = buildCadProjectFromPayload(payload);
        clearCadImportPayload();
        clearCadDraft(userId);
        setProject(built);
        setSavedProjectId(null);
        setViewBounds(computeViewportBoundsSafe(built.entities));
        setImported(built.entities.length > 0);
        if (built.entities.length > 0) {
          setImportNotice(t("import.rtkOk", { count: built.entities.length, name: built.name }));
        }
        await refreshSavedProjects();
        skipDraftSaveRef.current = false;
        return;
      }

      const draft = loadCadDraft(userId);
      if (draft?.project) {
        setProject(draft.project);
        setSavedProjectId(draft.savedId);
        setViewBounds(computeViewportBoundsSafe(draft.project.entities));
        setImported(draft.project.entities.length > 0);
        await refreshSavedProjects();
        skipDraftSaveRef.current = false;
        return;
      }

      const lastId = getLastOpenedCadProjectId(userId);
      if (lastId) {
        try {
          const saved = await loadCadProject(lastId);
          if (saved) {
            setProject(saved.project);
            setSavedProjectId(saved.id);
            setViewBounds(computeViewportBoundsSafe(saved.project.entities));
            setImported(saved.project.entities.length > 0);
            await refreshSavedProjects();
            skipDraftSaveRef.current = false;
            return;
          }
        } catch {
          clearLastOpenedCadProjectId(userId);
        }
      }

      setImported(false);
      await refreshSavedProjects();
      skipDraftSaveRef.current = false;
    }

    void bootstrapProject();
  }, [refreshSavedProjects, userId]);

  useEffect(() => {
    if (skipDraftSaveRef.current) return;
    const timer = window.setTimeout(() => {
      saveCadDraft(userId, project, savedProjectId);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [project, savedProjectId, userId]);

  useEffect(() => {
    if (!projectNotice) return;
    const timer = window.setTimeout(() => setProjectNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [projectNotice]);

  const handleSaveProject = useCallback(async () => {
    setSavingProject(true);
    try {
      const record = await saveCadProject(project.name, project, savedProjectId);
      setSavedProjectId(record.id);
      setProject(record.project);
      setLastOpenedCadProjectId(userId, record.id);
      await refreshSavedProjects();
      setProjectNotice(t("project.saved"));
    } catch {
      setProjectNotice(t("project.saveFailed"));
    } finally {
      setSavingProject(false);
    }
  }, [project, savedProjectId, refreshSavedProjects, t, userId]);

  const resetWorkspaceModes = useCallback(() => {
    setAreaPickMode(false);
    setAreaPickResult(null);
    setDistancePickMode(false);
    setDistancePickIds([]);
    setDistancePickResult(null);
    setProfilePickMode(false);
    setProfilePickIds([]);
    setProfilePickResult(null);
    setSelectedVertexIndex(null);
    setVertexDragIndex(null);
    setPolygonEditNotice(null);
    setTool("select");
    setDraft([]);
    setDrawHint(null);
    setKeyboardDistance("");
    setExportError(null);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (areaPickMode || distancePickMode || profilePickMode) {
        resetWorkspaceModes();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [areaPickMode, distancePickMode, profilePickMode, resetWorkspaceModes]);

  const handleOpenProject = useCallback(
    async (id: string) => {
      try {
        const record = savedProjects.find((p) => p.id === id) ?? (await loadCadProject(id));
        if (!record) {
          setProjectNotice(t("project.openFailed"));
          return;
        }
        skipDraftSaveRef.current = true;
        clearCadImportPayload();
        setProject(record.project);
        setSavedProjectId(record.id);
        setLastOpenedCadProjectId(userId, record.id);
        setViewBounds(computeViewportBoundsSafe(record.project.entities));
        setImported(record.project.entities.length > 0);
        setSelectedId(null);
        setRasters([]);
        setBasemapOverlays({
          ...DEFAULT_CAD_BASEMAP_OVERLAYS,
          anmSigmine: { ...DEFAULT_CAD_BASEMAP_OVERLAYS.anmSigmine },
        });
        resetWorkspaceModes();
        setOpenProjectsPanel(false);
        setActiveTab("desenho");
        setProjectNotice(t("project.opened", { name: record.name }));
        saveCadDraft(userId, record.project, record.id);
        window.setTimeout(() => {
          skipDraftSaveRef.current = false;
        }, 200);
      } catch {
        setProjectNotice(t("project.openFailed"));
      }
    },
    [resetWorkspaceModes, savedProjects, t, userId],
  );

  const handleDeleteProject = useCallback(
    async (id: string, name: string) => {
      if (!window.confirm(t("project.confirmDelete", { name }))) return;
      try {
        await deleteCadProject(id);
        if (savedProjectId === id) setSavedProjectId(null);
        if (getLastOpenedCadProjectId(userId) === id) clearLastOpenedCadProjectId(userId);
        await refreshSavedProjects();
        setProjectNotice(t("project.deleted"));
      } catch {
        setProjectNotice(t("project.deleteFailed"));
      }
    },
    [savedProjectId, refreshSavedProjects, t, userId],
  );

  const handleNewProject = useCallback(() => {
    const hasWork =
      project.entities.length > 0 || rasters.length > 0 || Boolean(project.adjustment);
    if (hasWork && !window.confirm(t("project.confirmNew"))) return;

    skipDraftSaveRef.current = true;
    try {
      clearCadDraft(userId);
      clearLastOpenedCadProjectId(userId);
      clearCadImportPayload();

      const fresh = emptyProject("Projeto CAD");
      setProject(fresh);
      setSavedProjectId(null);
      setImported(true);
      setSnapToRtkPoints(false);
      setSelectedId(null);
      setViewBounds(computeViewportBoundsSafe([]));
      setRasters([]);
      setBasemapOverlays({
        ...DEFAULT_CAD_BASEMAP_OVERLAYS,
        anmSigmine: { ...DEFAULT_CAD_BASEMAP_OVERLAYS.anmSigmine },
      });
      setImportNotice(null);
      setImportingPoints(false);
      setContourInfo(null);
      setContourError(null);
      setTinInfo(null);
      setTinError(null);
      setHypsometricInfo(null);
      setHypsometricError(null);
      resetWorkspaceModes();
      setOpenProjectsPanel(false);
      setActiveTab("desenho");
      setProjectNotice(t("project.createdNew"));

      saveCadDraft(userId, fresh, null);
    } finally {
      window.setTimeout(() => {
        skipDraftSaveRef.current = false;
      }, 200);
    }
  }, [project.entities.length, project.adjustment, rasters.length, resetWorkspaceModes, t, userId]);

  useEffect(() => {
    if (activeTab !== "desenho" || !isDrawTool || !drawReference) return;

    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      if (e.key === "Escape") {
        setKeyboardDistance("");
        setDrawHint(null);
        return;
      }

      if (e.key === "Enter" && keyboardDistance.trim()) {
        e.preventDefault();
        applyKeyboardDistance();
        return;
      }

      if (e.key === "Backspace") {
        if (!keyboardDistance) return;
        e.preventDefault();
        setKeyboardDistance((prev) => prev.slice(0, -1));
        return;
      }

      if (/^[0-9.,]$/.test(e.key)) {
        e.preventDefault();
        setKeyboardDistance((prev) => {
          const next = prev + (e.key === "," ? "." : e.key);
          if ((next.match(/\./g) ?? []).length > 1) return prev;
          return next;
        });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, isDrawTool, drawReference, keyboardDistance, orthogonalMode, polarAngle]);

  useEffect(() => runQueuedInEffect(() => setMemorialForm(loadMemorialFormDefaults())), []);

  const patchMemorialForm = useCallback((patch: Partial<MemorialFormDefaults>) => {
    setMemorialForm((prev) => {
      const next = { ...prev, ...patch };
      saveMemorialFormDefaults(next);
      return next;
    });
  }, []);

  const resetView = useCallback(() => {
    setViewBounds(computeViewportBoundsSafe(project.entities));
  }, [project.entities]);

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (!viewBounds && project.entities.length > 0) {
          setViewBounds(computeViewportBoundsSafe(project.entities));
        }
      }),
    [project.entities, viewBounds],
  );

  /** Corrige zoom distorcido (ex.: após gerar perfil distância×cota). */
  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (project.entities.length === 0) return;
        const safe = computeViewportBoundsSafe(project.entities);
        setViewBounds((prev) => {
          if (!prev) return safe;
          const prevSpan = Math.max(prev.maxX - prev.minX, prev.maxY - prev.minY);
          const safeSpan = Math.max(safe.maxX - safe.minX, safe.maxY - safe.minY);
          if (safeSpan > 0 && prevSpan > safeSpan * 100) return safe;
          return prev;
        });
      }),
    [project.entities],
  );

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (!selectedId) {
          setPointEditZ("");
          setPointActionNotice(null);
          return;
        }
        const pt = project.entities.find((e) => e.id === selectedId && e.type === "point");
        if (pt && pt.type === "point") {
          setPointEditZ(pt.z.toFixed(4));
        } else {
          setPointEditZ("");
        }
        setPointActionNotice(null);
      }),
    [selectedId, project.entities],
  );

  function toggleLayer(layerId: string) {
    setProject((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l)),
    }));
  }

  function addLayer() {
    const index = project.layers.filter((l) => l.id.startsWith("lyr_")).length + 1;
    const layer = createUserLayer(`CAMADA_${index}`);
    setProject((prev) => ({
      ...prev,
      layers: [...prev.layers, layer],
    }));
    setActiveLayerId(layer.id);
  }

  function updateLayerStyles(layerId: string, patch: Partial<CadLayer>) {
    setProject((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === layerId ? mergeLayerStyles(l, patch) : l)),
    }));
  }

  function deleteLayer(layerId: string) {
    const layer = project.layers.find((l) => l.id === layerId);
    if (!layer || layer.locked) return;
    const fallbackId = project.layers.find((l) => l.id === "draw")?.id ?? "draw";
    setProject((prev) => ({
      ...prev,
      layers: prev.layers.filter((l) => l.id !== layerId),
      entities: prev.entities.map((e) => (e.layerId === layerId ? { ...e, layerId: fallbackId } : e)),
    }));
    setActiveLayerId((current) => (current === layerId ? fallbackId : current));
    setPointActionNotice(t("layers.deleted"));
  }

  function moveEntityToLayer(entityId: string, layerId: string) {
    if (!project.layers.some((l) => l.id === layerId)) return;
    setProject((prev) => ({
      ...prev,
      entities: prev.entities.map((e) => (e.id === entityId ? { ...e, layerId } : e)),
    }));
  }

  function addEntity(entity: CadEntity) {
    setProject((prev) => ({ ...prev, entities: [...prev.entities, entity] }));
  }

  function updateEntity(id: string, patch: Partial<CadPolylineEntity>) {
    setProject((prev) => ({
      ...prev,
      entities: prev.entities.map((e) => (e.id === id && e.type === "polyline" ? { ...e, ...patch } : e)),
    }));
  }

  function updatePoint(id: string, patch: Partial<Pick<CadPointEntity, "label" | "x" | "y" | "z">>) {
    setProject((prev) => ({
      ...prev,
      entities: prev.entities.map((e) =>
        e.id === id && e.type === "point" ? { ...e, ...patch } : e,
      ),
    }));
  }

  function updatePointLabel(id: string, label: string) {
    updatePoint(id, { label: label.trim() || undefined });
  }

  function updatePointZ(id: string, zText: string) {
    const z = Number(zText.replace(",", "."));
    if (!Number.isFinite(z)) {
      setPointActionNotice(t("point.invalidElevation"));
      return;
    }
    updatePoint(id, { z });
    setPointActionNotice(t("point.elevationSaved", { z: z.toFixed(3) }));
  }

  function applySelectedPointElevation() {
    if (!selectedId) return;
    updatePointZ(selectedId, pointEditZ);
  }

  function deleteSelectedEntity(force = false) {
    if (!selectedId) return;
    const entity = project.entities.find((e) => e.id === selectedId);
    if (!entity) return;
    if (entity.type === "point" && entity.locked && !force) {
      const name = entity.label ?? entity.id;
      if (!window.confirm(t("point.confirmDeleteLocked", { name }))) return;
    }
    setProject((prev) => ({
      ...prev,
      entities: prev.entities.filter((e) => e.id !== selectedId),
    }));
    setSelectedId(null);
    setPointActionNotice(t("point.deleted"));
  }

  function finishPolyline(closed = false) {
    if (draft.length < 2) {
      setDraft([]);
      return;
    }
    const polyCount = project.entities.filter((e) => e.type === "polyline").length;
    const entity: CadPolylineEntity = {
      id: newId("pl"),
      type: "polyline",
      layerId: resolveDrawLayerId(),
      vertices: draft,
      closed,
      name: closed ? `Polígono ${polyCount + 1}` : `Polilinha ${polyCount + 1}`,
    };
    setProject((prev) => {
      let next: CadProject = { ...prev, entities: [...prev.entities, entity] };
      if (closed && entity.vertices.length >= 3) {
        next = appendPolygonCenterLabel(next, entity);
      }
      return next;
    });
    if (closed) setSelectedId(entity.id);
    setDraft([]);
  }

  function addDraftVertex(vertex: CadVertex) {
    setDraft((prev) => {
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        if (Math.hypot(last.x - vertex.x, last.y - vertex.y) < 1e-4) return prev;
      }
      return [...prev, vertex];
    });
    setDrawHint(null);
  }

  function pickPointFromList(pointId: string) {
    const pt = pickablePoints.find((p) => p.id === pointId);
    if (!pt) return;
    addDraftVertex(pt.vertex);
    setHoverSnapId(pointId);
  }

  function closeSelectedPolygon() {
    if (!selectedId) return;
    const entity = project.entities.find((e) => e.id === selectedId);
    if (entity?.type !== "polyline" || entity.vertices.length < 3) return;
    const polyCount = project.entities.filter((e) => e.type === "polyline" && e.closed).length;
    const closedName = entity.name?.startsWith("Polilinha")
      ? `Polígono ${polyCount + 1}`
      : (entity.name ?? `Polígono ${polyCount + 1}`);
    setProject((prev) => {
      const entities = prev.entities.map((e) =>
        e.id === selectedId && e.type === "polyline" ? { ...e, closed: true, name: closedName } : e,
      );
      const closed = entities.find(
        (e): e is CadPolylineEntity => e.id === selectedId && e.type === "polyline",
      );
      let next: CadProject = { ...prev, entities };
      if (closed) next = appendPolygonCenterLabel(next, closed);
      return next;
    });
  }

  function handleCanvasClick(sx: number, sy: number) {
    if (tool === "editPolygon") {
      if (!selectedId) {
        const wts = (x: number, y: number) => worldToScreen(x, y, viewport);
        for (const entity of [...visibleEntities].reverse()) {
          if (entity.type !== "polyline" || !isEditablePolyline(entity)) continue;
          if (hitTestPolyline(sx, sy, entity.vertices, Boolean(entity.closed), wts)) {
            setSelectedId(entity.id);
            setPolygonEditNotice(t("polygon.edit.ready"));
            return;
          }
        }
        setDrawHint(t("polygon.edit.selectFirst"));
        setTimeout(() => setDrawHint(null), 3000);
        return;
      }

      const entity = project.entities.find((e) => e.id === selectedId);
      if (entity?.type !== "polyline" || !isEditablePolyline(entity)) return;

      const wts = (x: number, y: number) => worldToScreen(x, y, viewport);
      const wst = (px: number, py: number): CadVertex => {
        const w = screenToWorld(px, py, viewport);
        return { x: w.x, y: w.y, z: 0 };
      };
      const vertexIndex = hitTestPolylineVertexIndex(sx, sy, entity.vertices, wts);
      if (vertexIndex !== null) {
        setSelectedVertexIndex(vertexIndex);
        return;
      }

      const insert = findPolylineEdgeInsert(
        sx,
        sy,
        entity.vertices,
        Boolean(entity.closed),
        wts,
        wst,
      );
      if (insert) {
        insertPolylineVertex(selectedId, insert.afterIndex, insert.vertex);
        setSelectedVertexIndex(insert.afterIndex + 1);
        setPolygonEditNotice(t("polygon.edit.vertexAdded"));
        return;
      }

      setSelectedVertexIndex(null);
      return;
    }

    if (distancePickMode) {
      const hit = findPointAtScreen(sx, sy, project.entities, viewport, 16);
      if (!hit) {
        setDrawHint(t("commands.distanceOps.pickMiss"));
        setTimeout(() => setDrawHint(null), 3000);
        return;
      }
      const nextIds = distancePickIds.includes(hit.entityId)
        ? distancePickIds
        : [...distancePickIds, hit.entityId].slice(-2);
      setDistancePickIds(nextIds);
      setSelectedId(hit.entityId);

      if (nextIds.length < 2) return;

      const labels = nextIds.map((id) => {
        const entity = project.entities.find((e) => e.id === id);
        return entity?.type === "point" ? (entity.label ?? entity.id) : id;
      });
      setDistancePickMode(false);
      setDistancePickIds([]);
      try {
        const result = executeCadAiCommand(
          project,
          { acao: "medir_distancia", pontos: labels },
          { selectedId: hit.entityId, memorialForm },
        );
        if (result.ok === false) {
          setDistancePickResult(result.message);
          return;
        }
        setProject(result.project);
        if (result.selectedId !== undefined) setSelectedId(result.selectedId);
        for (const effect of result.sideEffects ?? []) {
          handleAiSideEffect(effect);
        }
        setDistancePickResult(result.message);
      } catch (err) {
        setDistancePickResult(err instanceof Error ? err.message : t("commands.error"));
      }
      return;
    }

    if (profilePickMode) {
      const hit = findPointAtScreen(sx, sy, project.entities, viewport, 16);
      if (!hit) {
        setDrawHint(t("commands.profileOps.pickMiss"));
        setTimeout(() => setDrawHint(null), 3000);
        return;
      }
      const nextIds = profilePickIds.includes(hit.entityId)
        ? profilePickIds
        : [...profilePickIds, hit.entityId].slice(-2);
      setProfilePickIds(nextIds);
      setSelectedId(hit.entityId);

      if (nextIds.length < 2) return;

      const labels = nextIds.map((id) => {
        const entity = project.entities.find((e) => e.id === id);
        return entity?.type === "point" ? (entity.label ?? entity.id) : id;
      });
      setProfilePickMode(false);
      setProfilePickIds([]);
      try {
        const result = executeCadAiCommand(
          project,
          { acao: "perfil_longitudinal", pontos: labels },
          { selectedId: hit.entityId, memorialForm },
        );
        if (result.ok === false) {
          setProfilePickResult(result.message);
          return;
        }
        setProject(result.project);
        if (result.selectedId !== undefined) setSelectedId(result.selectedId);
        for (const effect of result.sideEffects ?? []) {
          handleAiSideEffect(effect);
        }
        setProfilePickResult(result.message);
      } catch (err) {
        setProfilePickResult(err instanceof Error ? err.message : t("commands.error"));
      }
      return;
    }

    if (areaPickMode) {
      let hitId: string | null = null;
      const wts = (x: number, y: number) => worldToScreen(x, y, viewport);
      for (const entity of [...visibleEntities].reverse()) {
        if (entity.type === "polyline" && entity.closed) {
          if (hitTestPolyline(sx, sy, entity.vertices, true, wts)) {
            hitId = entity.id;
            break;
          }
        }
      }
      setAreaPickMode(false);
      if (hitId) {
        try {
          const result = executeCadAiCommand(
            project,
            { acao: "medir_area", entidade_id: hitId },
            { selectedId: hitId, memorialForm },
          );
          if (result.ok === false) {
            setAreaPickResult(result.message);
            return;
          }
          setProject(result.project);
          setSelectedId(hitId);
          for (const effect of result.sideEffects ?? []) {
            handleAiSideEffect(effect);
          }
          setAreaPickResult(result.message);
        } catch (err) {
          setAreaPickResult(err instanceof Error ? err.message : t("commands.error"));
        }
      } else {
        setDrawHint(t("commands.areaOps.pickMiss"));
        setTimeout(() => setDrawHint(null), 3000);
      }
      return;
    }

    if (tool === "polyline") {
      if (snapToRtkPoints) {
        const hit = findPointAtScreen(sx, sy, project.entities, viewport, 16);
        if (!hit) {
          setDrawHint(t("draw.pointRequired"));
          return;
        }
        let vertex = hit.vertex;
        if (orthogonalMode && drawReference) {
          vertex = resolveDrawVertex(sx, sy, viewport, project.entities, {
            snapToPoints: true,
            orthogonalMode: true,
            reference: drawReference,
          });
        }
        addDraftVertex(vertex);
        setHoverSnapId(hit.entityId);
        return;
      }

      const point = resolveClickVertex(sx, sy);
      addDraftVertex(point);
      setHoverSnapId(null);
      return;
    }

    const point = resolveClickVertex(sx, sy);

    if (tool === "select") {
      let hit: string | null = null;
      for (const entity of [...visibleEntities].reverse()) {
        if (entity.type === "point") {
          const { sx: px, sy: py } = worldToScreen(entity.x, entity.y, viewport);
          if (Math.hypot(px - sx, py - sy) < 10) {
            hit = entity.id;
            break;
          }
        }
        if (entity.type === "polyline") {
          const wts = (x: number, y: number) => worldToScreen(x, y, viewport);
          if (hitTestPolyline(sx, sy, entity.vertices, Boolean(entity.closed), wts)) {
            hit = entity.id;
            break;
          }
        }
      }
      setSelectedId(hit);
      return;
    }

    if (tool === "line") {
      if (draft.length === 0) {
        setDraft([point]);
        return;
      }
      addEntity({
        id: newId("ln"),
        type: "line",
        layerId: resolveDrawLayerId(),
        start: draft[0],
        end: point,
      });
      setDraft([]);
      return;
    }
  }

  async function exportMemorialWord(entityId?: string | null, projectSnapshot?: CadProject) {
    const source = projectSnapshot ?? project;
    const targetId = entityId ?? selectedId;
    const entity = source.entities.find((e) => e.id === targetId);
    if (entity?.type !== "polyline" || !entity.closed || entity.vertices.length < 3) return;

    setGeneratingMemorial(true);
    try {
      const labels = vertexLabelsPn(entity.vertices.length);
      const blob = await generateMemorialDocx({
        memorialKind: memorialForm.memorialKind,
        memorialKindCustom: memorialForm.memorialKindCustom,
        registration: memorialForm.registration,
        municipality: memorialForm.municipality,
        state: memorialForm.state,
        owner: memorialForm.owner,
        crsLabel: memorialForm.crsLabel,
        projectionNote: memorialForm.projectionNote,
        appNote: memorialForm.appNote,
        lawFirmName: memorialForm.lawFirmName,
        lawFirmCnpj: memorialForm.lawFirmCnpj,
        technicalName: memorialForm.technicalName,
        technicalCrea: memorialForm.technicalCrea,
        vertices: entity.vertices,
        vertexLabels: labels,
      });
      const safeName = (entity.name ?? "poligono").replace(/\s+/g, "_");
      downloadBlob(blob, `${source.name}_${safeName}_memorial.docx`);
    } finally {
      setGeneratingMemorial(false);
    }
  }

  const handleAiSideEffect = useCallback(
    (effect: CadAiSideEffect) => {
      if (effect.type === "fit_view") {
        setViewBounds(computeViewportBoundsSafe(effect.entities));
      }
      if (effect.type === "download_memorial") {
        void exportMemorialWord(effect.entityId, effect.project);
      }
      if (effect.type === "download_text") {
        downloadBlob(
          new Blob([effect.content], { type: effect.mime ?? "text/plain" }),
          effect.filename,
        );
      }
      if (effect.type === "download_binary") {
        downloadBlob(
          new Blob([new Uint8Array(effect.bytes)], { type: effect.mime ?? "application/octet-stream" }),
          effect.filename,
        );
      }
      if (effect.type === "export_cad") {
        if (effect.format === "ods") {
          downloadOdsBlob(exportCadProjectOds(effect.project), `${effect.project.name}.ods`);
        } else {
          void handleExportCad(effect.format, effect.project);
        }
      }
      if (effect.type === "print_pdf") {
        setActiveTab("layout");
        setTimeout(() => window.print(), 400);
      }
      if (effect.type === "add_raster") {
        setProject((prev) => ensureRasterLayerInProject(prev, effect.raster.kind));
        setRasters((prev) => [
          ...prev.filter((r) => r.kind !== effect.raster.kind),
          effect.raster,
        ]);
        if (effect.raster.kind === "hypsometric") {
          setViewBounds((prev) => {
            const b = prev ?? computeViewportBoundsSafe(project.entities);
            const r = effect.raster;
            return {
              minX: Math.min(b.minX, r.minX),
              maxX: Math.max(b.maxX, r.maxX),
              minY: Math.min(b.minY, r.minY),
              maxY: Math.max(b.maxY, r.maxY),
            };
          });
        }
      }
      if (effect.type === "remove_rasters") {
        setRasters((prev) => {
          const next = effect.kind ? prev.filter((r) => r.kind !== effect.kind) : [];
          return next;
        });
        if (effect.kind) {
          setProject((prev) => removeRasterLayerFromProject(prev, effect.kind!));
        }
      }
    },
    [handleExportCad],
  );

  const toggleCoordLabels = useCallback(() => {
    setPointActionNotice(null);

    if (coordLabelsVisible) {
      setCoordLabelsVisible(false);
      setPointActionNotice(t("tools.coordsHidden"));
      return;
    }

    const hasLabels = project.entities.some(
      (e) => e.type === "point" && isCoordLabelEntity(e),
    );
    if (hasLabels) {
      setCoordLabelsVisible(true);
      setPointActionNotice(t("tools.coordsShown"));
      return;
    }

    try {
      const result = executeCadAiCommand(
        project,
        { acao: "inserir_coordenadas" },
        { selectedId, memorialForm },
      );
      if (result.ok === false) {
        setPointActionNotice(result.message);
        return;
      }
      setProject(result.project);
      if (result.selectedId !== undefined) setSelectedId(result.selectedId);
      for (const effect of result.sideEffects ?? []) {
        handleAiSideEffect(effect);
      }
      setCoordLabelsVisible(true);
      setPointActionNotice(result.message);
    } catch (err) {
      setPointActionNotice(err instanceof Error ? err.message : t("commands.error"));
    }
  }, [coordLabelsVisible, project, selectedId, memorialForm, handleAiSideEffect, t]);

  function generateContours() {
    setContourError(null);
    setContourInfo(null);
    setGeneratingContours(true);
    try {
      const interval = Number(contourInterval.replace(",", "."));
      const result = generateContoursFromPoints(elevationSamples, { interval });

      setProject((prev) => {
        const withoutOld = removeContourEntities(prev.entities);
        const hasLayer = prev.layers.some((l) => l.id === CONTOUR_LAYER.id);
        return {
          ...prev,
          layers: hasLayer ? prev.layers : [...prev.layers, { ...CONTOUR_LAYER }],
          entities: [...withoutOld, ...result.polylines],
        };
      });

      setContourInfo(
        t("contour.generated", {
          count: result.polylines.length,
          levels: result.levels.length,
          zMin: result.zMin.toFixed(2),
          zMax: result.zMax.toFixed(2),
        }),
      );
    } catch (err) {
      setContourError(err instanceof Error ? err.message : t("contour.error"));
    } finally {
      setGeneratingContours(false);
    }
  }

  function clearContours() {
    setProject((prev) => ({
      ...prev,
      entities: removeContourEntities(prev.entities),
    }));
    setContourInfo(null);
    setContourError(null);
  }

  function generateTin() {
    setTinError(null);
    setTinInfo(null);
    setGeneratingTin(true);
    try {
      const result = generateTinEntities(project);
      setProject((prev) => {
        const hasLayer = prev.layers.some((l) => l.id === TIN_LAYER.id);
        return {
          ...prev,
          layers: hasLayer ? prev.layers : [...prev.layers, { ...TIN_LAYER }],
          entities: [...removeTinEntities(prev.entities), ...result.lines],
        };
      });
      setTinInfo(
        t("tin.generated", {
          triangles: result.triangleCount,
          edges: result.lines.length,
          points: result.pointCount,
        }),
      );
    } catch (err) {
      setTinError(err instanceof Error ? err.message : t("tin.error"));
    } finally {
      setGeneratingTin(false);
    }
  }

  function clearTin() {
    setProject((prev) => ({
      ...prev,
      entities: removeTinEntities(prev.entities),
    }));
    setTinInfo(null);
    setTinError(null);
  }

  function generateHypsometric() {
    setHypsometricError(null);
    setHypsometricInfo(null);
    setGeneratingHypsometric(true);
    try {
      const raster = generateHypsometricRaster(elevationSamples);
      setProject((prev) => ensureRasterLayerInProject(prev, "hypsometric"));
      setRasters((prev) => [...prev.filter((r) => r.kind !== "hypsometric"), raster]);
      setViewBounds((prev) => {
        const b = prev ?? computeViewportBoundsSafe(project.entities);
        return {
          minX: Math.min(b.minX, raster.minX),
          maxX: Math.max(b.maxX, raster.maxX),
          minY: Math.min(b.minY, raster.minY),
          maxY: Math.max(b.maxY, raster.maxY),
        };
      });
      setHypsometricInfo(
        t("hypsometric.generated", {
          points: elevationSamples.length,
          zMin: raster.zMin?.toFixed(1) ?? "—",
          zMax: raster.zMax?.toFixed(1) ?? "—",
        }),
      );
    } catch (err) {
      setHypsometricError(err instanceof Error ? err.message : t("hypsometric.error"));
    } finally {
      setGeneratingHypsometric(false);
    }
  }

  function clearHypsometric() {
    setProject((prev) => removeRasterLayerFromProject(prev, "hypsometric"));
    setRasters((prev) => prev.filter((r) => r.kind !== "hypsometric"));
    setHypsometricInfo(null);
    setHypsometricError(null);
  }

  function handleImportSurveyPoints(file: File) {
    setImportNotice(null);
    setImportingPoints(true);
    const isExcel = /\.xlsx?$/i.test(file.name);
    const reader = new FileReader();
    reader.onerror = () => {
      setImportingPoints(false);
      setImportNotice(t("import.error"));
    };
    reader.onload = () => {
      void (async () => {
        try {
          const data = reader.result;
          if (data == null) {
            setImportNotice(t("import.error"));
            return;
          }
          const parsed = await parseSurveyUpload(
            file.name,
            isExcel ? (data as ArrayBuffer) : String(data),
          );
          if (parsed.points.length === 0) {
            setImportNotice(parsed.warnings.join(" ") || t("import.noPoints"));
            return;
          }
          setProject((prev) => {
            const layerName = isExcel ? "PONTOS_EXCEL" : "PONTOS_TXT";
            const next = importSurveyPointsToProject(prev, parsed.points, layerName);
            setViewBounds(computeViewportBoundsSafe(next.entities));
            return next;
          });
          setImported(true);
          setImportNotice(t("import.pointsOk", { count: parsed.points.length, name: file.name }));
        } catch (err) {
          setImportNotice(err instanceof Error ? err.message : t("import.error"));
        } finally {
          setImportingPoints(false);
        }
      })();
    };
    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file, "utf-8");
  }

  function openSurveyImport() {
    window.requestAnimationFrame(() => surveyFileRef.current?.click());
  }

  function openExcelImport() {
    window.requestAnimationFrame(() => excelFileRef.current?.click());
  }

  function toViewBoxCoords(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { sx: width / 2, sy: height / 2 };
    return {
      sx: ((clientX - rect.left) / rect.width) * width,
      sy: ((clientY - rect.top) / rect.height) * height,
    };
  }

  function applyZoom(factor: number, anchorSx = width / 2, anchorSy = height / 2) {
    const before = screenToWorld(anchorSx, anchorSy, viewport);
    setViewBounds((prev) => {
      const b = prev ?? bounds;
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      let halfW = ((b.maxX - b.minX) / 2) * factor;
      let halfH = ((b.maxY - b.minY) / 2) * factor;
      const minHalf = MIN_VIEW_SPAN_M / 2;
      const maxHalf = MAX_VIEW_SPAN_M / 2;
      halfW = Math.max(minHalf, Math.min(maxHalf, halfW));
      halfH = Math.max(minHalf, Math.min(maxHalf, halfH));
      const next = {
        minX: cx - halfW,
        maxX: cx + halfW,
        minY: cy - halfH,
        maxY: cy + halfH,
      };
      const after = screenToWorld(anchorSx, anchorSy, { ...next, width, height, padding });
      return {
        minX: next.minX + (before.x - after.x),
        maxX: next.maxX + (before.x - after.x),
        minY: next.minY + (before.y - after.y),
        maxY: next.maxY + (before.y - after.y),
      };
    });
  }

  function zoomIn() {
    applyZoom(ZOOM_IN_FACTOR);
  }

  function zoomOut() {
    applyZoom(ZOOM_OUT_FACTOR);
  }

  const applyZoomRef = useRef(applyZoom);
  applyZoomRef.current = applyZoom;

  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el || viewMode === "3d") return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const { sx, sy } = toViewBoxCoords(e.clientX, e.clientY);
      applyZoomRef.current(e.deltaY > 0 ? ZOOM_OUT_FACTOR : ZOOM_IN_FACTOR, sx, sy);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [viewMode]);

  function renderCoordinateGrid() {
    if (!showGrid) return null;

    const items: React.ReactNode[] = [];

    for (const e of grid.eLines) {
      const top = worldToScreen(e, viewport.maxY, viewport);
      const bottom = worldToScreen(e, viewport.minY, viewport);
      const major = grid.eLines.indexOf(e) % 5 === 0;
      items.push(
        <line
          key={`ge-${e}`}
          x1={top.sx}
          y1={top.sy}
          x2={bottom.sx}
          y2={bottom.sy}
          stroke={major ? "#475569" : "#1e293b"}
          strokeWidth={major ? 1 : 0.5}
          opacity={major ? 0.6 : 0.35}
        />,
      );
      items.push(
        <text key={`gel-${e}`} x={bottom.sx + 2} y={bottom.sy - 4} fill="#94a3b8" fontSize={9} fontFamily="monospace">
          E {formatGridLabel(e, grid.stepE)}
        </text>,
      );
    }

    for (const n of grid.nLines) {
      const left = worldToScreen(viewport.minX, n, viewport);
      const right = worldToScreen(viewport.maxX, n, viewport);
      const major = grid.nLines.indexOf(n) % 5 === 0;
      items.push(
        <line
          key={`gn-${n}`}
          x1={left.sx}
          y1={left.sy}
          x2={right.sx}
          y2={right.sy}
          stroke={major ? "#475569" : "#1e293b"}
          strokeWidth={major ? 1 : 0.5}
          opacity={major ? 0.6 : 0.35}
        />,
      );
      items.push(
        <text key={`gnl-${n}`} x={left.sx + 4} y={left.sy - 2} fill="#94a3b8" fontSize={9} fontFamily="monospace">
          N {formatGridLabel(n, grid.stepN)}
        </text>,
      );
    }

    return <g>{items}</g>;
  }

  function renderEntity(entity: CadEntity) {
    const layer = layerMap.get(entity.layerId);
    const lineColor = getLayerLineColor(layer);
    const textColor = getLayerTextColor(layer);
    const selected = entity.id === selectedId;

    if (entity.type === "point") {
      const { sx, sy } = worldToScreen(entity.x, entity.y, viewport);
      const isPickable = isDrawWithPoints && snapToRtkPoints;
      const isHovered = hoverSnapId === entity.id;
      const inDraft = draft.some(
        (v) => Math.hypot(v.x - entity.x, v.y - entity.y) < 1e-4,
      );
      const coordLayout = resolveCoordLabelLayout(
        entity,
        project.entities,
        (x, y) => worldToScreen(x, y, viewport),
        width,
        height,
        10,
      );
      const showMarker = !isCoordLabelEntity(entity);

      return (
        <g key={entity.id}>
          {isPickable ? (
            <circle
              cx={sx}
              cy={sy}
              r={isHovered ? 14 : 11}
              fill={isHovered ? "rgba(0,200,240,0.25)" : "rgba(0,200,240,0.08)"}
              stroke={isHovered ? "#00c8f0" : "#38bdf8"}
              strokeWidth={isHovered ? 2 : 1}
              strokeDasharray={inDraft ? "3 2" : undefined}
            />
          ) : null}
          {showMarker ? (
            <circle
              cx={sx}
              cy={sy}
              r={selected ? 7 : 5}
              fill={lineColor}
              stroke={selected || isHovered ? "#fff" : "#0f172a"}
              strokeWidth={selected || isHovered ? 2 : 1}
            />
          ) : null}
          {entity.label ? (
            <CadSvgMultilineText
              x={coordLayout?.labelSx ?? sx + 8}
              y={coordLayout?.labelSy ?? sy - 2}
              label={entity.label}
              fill={textColor}
              fontSize={10}
            />
          ) : null}
        </g>
      );
    }

    if (entity.type === "line") {
      const a = worldToScreen(entity.start.x, entity.start.y, viewport);
      const b = worldToScreen(entity.end.x, entity.end.y, viewport);
      return (
        <line
          key={entity.id}
          x1={a.sx}
          y1={a.sy}
          x2={b.sx}
          y2={b.sy}
          stroke={lineColor}
          strokeWidth={getLayerLineWidth(layer, selected)}
          strokeDasharray={entity.layerId === "residuals" ? "4 3" : undefined}
        />
      );
    }

    const pts = entity.vertices
      .map((v) => worldToScreen(v.x, v.y, viewport))
      .map((p) => `${p.sx},${p.sy}`)
      .join(" ");

    const isContour = entity.layerId === CONTOUR_LAYER.id;
    const isMajorContour = isContour && entity.contourMajor === true;
    const contourStroke = isMajorContour ? CONTOUR_COLOR_MAJOR : CONTOUR_COLOR_MINOR;
    const labelVertex = isMajorContour ? pickContourLabelVertex(entity.vertices) : null;
    const contourElevation =
      isMajorContour && labelVertex ? parseContourElevation(entity) : null;
    const contourLabel =
      contourElevation !== null ? formatContourElevationLabel(contourElevation) : null;

    const isClosed = !isContour && Boolean(entity.closed) && entity.vertices.length >= 3;
    const strokeColor = selected ? "#fff" : isContour ? contourStroke : lineColor;
    const strokeW = isContour ? (isMajorContour ? 1.6 : 1) : getLayerLineWidth(layer, selected);
    const fillColor = getLayerFillColor(layer, selected);

    return (
      <g key={entity.id}>
        {isClosed ? (
          <polygon
            points={pts}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeW}
          />
        ) : (
          <polyline
            points={pts}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeW}
            opacity={isContour ? (isMajorContour ? 1 : 0.85) : 1}
          />
        )}
        {isMajorContour && labelVertex && contourLabel ? (
          <text
            x={worldToScreen(labelVertex.x, labelVertex.y, viewport).sx + 4}
            y={worldToScreen(labelVertex.x, labelVertex.y, viewport).sy - 4}
            fill={contourStroke}
            fontSize={10}
            fontWeight={700}
            fontFamily="Arial, sans-serif"
            stroke="#fff"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {contourLabel}
          </text>
        ) : null}
        {!isContour && entity.closed ? (() => {
          const metrics = computePolygonMetrics(entity.vertices, true);
          const c = polygonCentroid(entity.vertices);
          const { sx, sy } = worldToScreen(c.x, c.y, viewport);
          const polyName = entity.name ?? t("polygon.defaultName");
          return (
            <text
              x={sx}
              y={sy}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={textColor}
              fontSize={10}
              fontWeight={600}
              fontFamily="Arial, sans-serif"
            >
              <tspan x={sx} dy="-6">{polyName}</tspan>
              <tspan x={sx} dy="14">{formatAreaBr(metrics.areaM2)}</tspan>
            </text>
          );
        })() : null}
      </g>
    );
  }

  const selectedEntity = project.entities.find((e) => e.id === selectedId) ?? null;
  const selectedPolyline =
    selectedEntity?.type === "polyline" ? (selectedEntity as CadPolylineEntity) : null;
  const selectedMetrics =
    selectedPolyline && selectedPolyline.closed && selectedPolyline.vertices.length >= 3
      ? computePolygonMetrics(selectedPolyline.vertices, true, vertexLabels(selectedPolyline.vertices.length))
      : null;
  const canEditSelectedPolyline = selectedPolyline ? isEditablePolyline(selectedPolyline) : false;

  const cadTabs: { id: CadTabId; label: string }[] = [
    { id: "desenho", label: t("tabs.draw") },
    { id: "layout", label: t("tabs.printLayout") },
  ];

  return (
    <div className="cad-workspace space-y-4 text-[#111827]">
      <CadPointObservations
        entities={project.entities}
        layers={project.layers}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onUpdatePoint={updatePoint}
      />
      <div className="cad-interface flex flex-col gap-3 rounded-xl border border-[#e5e7eb] bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <label className="text-xs font-medium text-[#6b7280]">{t("project.nameLabel")}</label>
          <input
            value={project.name}
            onChange={(e) => setProject((prev) => ({ ...prev, name: e.target.value }))}
            className="mt-1 block w-full max-w-md rounded-lg border border-[#d1d5db] px-3 py-2 text-sm font-semibold text-[#0f2848]"
          />
          <p className="mt-1 text-xs text-[#6b7280]">
            {project.crs}
            {project.adjustment
              ? ` · ${t("meta.adjusted")} RMS ${project.adjustment.rmsAfter.toFixed(4)} m (${project.adjustment.method})`
              : ""}
            {savedProjectId ? ` · ID ${savedProjectId.slice(-8)}` : ""}
          </p>
          {projectNotice ? (
            <p className="mt-1 text-xs font-medium text-emerald-700">{projectNotice}</p>
          ) : (
            <p className="mt-1 text-[10px] text-[#9ca3af]">{t("project.autoDraft")}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSaveProject}
            disabled={savingProject}
            className="rounded-lg bg-[#0f2848] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {savingProject ? t("project.saved") + "…" : t("actions.saveProject")}
          </button>
          <button
            type="button"
            onClick={() => {
              void refreshSavedProjects();
              setOpenProjectsPanel((v) => !v);
            }}
            className="rounded-lg border border-[#0f2848] px-4 py-2 text-sm font-medium text-[#0f2848]"
          >
            {t("actions.openProject")}
          </button>
          <button
            type="button"
            onClick={handleNewProject}
            className="rounded-lg border border-[#d1d5db] px-3 py-2 text-sm"
          >
            {t("actions.newProject")}
          </button>
          <button
            type="button"
            onClick={() => setAiChatOpen((v) => !v)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              aiChatOpen
                ? "bg-[#7c3aed] text-white"
                : "border border-[#7c3aed] text-[#7c3aed] hover:bg-[#faf5ff]"
            }`}
          >
            {t("ai.openChat")}
          </button>
          <label className="flex items-center gap-2 rounded-lg border border-[#d1d5db] px-3 py-2 text-sm">
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
            {t("grid.show")}
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-[#d1d5db] px-3 py-2 text-sm" title={t("basemap.satelliteHint")}>
            <input
              type="checkbox"
              checked={basemapOverlays.satellite}
              onChange={(e) => patchBasemapOverlay("satellite", e.target.checked)}
            />
            {t("basemap.satellite")}
          </label>
          <button
            type="button"
            onClick={() => router.push("/digital-twin/gnss-rtk")}
            className="rounded-lg border border-[#d1d5db] px-3 py-2 text-sm"
          >
            {t("actions.backValidation")}
          </button>
          <button type="button" onClick={resetView} className="rounded-lg border border-[#d1d5db] px-3 py-2 text-sm">
            {t("actions.fitView")}
          </button>
          <div className="flex overflow-hidden rounded-lg border border-[#d1d5db]">
            <button
              type="button"
              onClick={zoomOut}
              title={t("actions.zoomOut")}
              aria-label={t("actions.zoomOut")}
              className="border-r border-[#d1d5db] px-3 py-2 text-sm font-semibold hover:bg-[#f3f4f6]"
            >
              −
            </button>
            <button
              type="button"
              onClick={zoomIn}
              title={t("actions.zoomIn")}
              aria-label={t("actions.zoomIn")}
              className="px-3 py-2 text-sm font-semibold hover:bg-[#f3f4f6]"
            >
              +
            </button>
          </div>
          {(["dxf", "dwg", "shp"] as const).map((format) => (
            <button
              key={format}
              type="button"
              disabled={exportingFormat !== null}
              onClick={() => void handleExportCad(format)}
              className={
                format === "dxf"
                  ? "rounded-lg bg-[#0f2848] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  : "rounded-lg border border-[#0f2848] px-3 py-2 text-sm font-medium text-[#0f2848] disabled:opacity-50"
              }
            >
              {exportingFormat === format
                ? t("export.working")
                : format === "dxf"
                  ? t("actions.exportDxf")
                  : format === "dwg"
                    ? t("actions.exportDwg")
                    : t("actions.exportShp")}
            </button>
          ))}
          <button
            type="button"
            onClick={() => downloadOdsBlob(exportCadProjectOds(project), `${project.name}.ods`)}
            className="rounded-lg border border-[#0f2848] px-4 py-2 text-sm font-medium text-[#0f2848]"
          >
            {t("actions.exportOds")}
          </button>
        </div>
        {exportError ? <p className="text-xs font-medium text-red-600">{exportError}</p> : null}
      </div>

      {importNotice ? (
        <div
          className={`cad-interface rounded-xl border px-4 py-3 text-sm ${
            importNotice.includes("Falha") ||
            importNotice.includes("Nenhum") ||
            importNotice.includes("GDAL")
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {importNotice}
        </div>
      ) : null}

      {openProjectsPanel ? (
        <section className="cad-interface relative z-20 rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[#0f2848]">{t("project.openTitle")}</h3>
              <p className="mt-1 text-xs text-[#6b7280]">{t("project.openHint")}</p>
            </div>
            <button
              type="button"
              onClick={handleNewProject}
              className="rounded-lg border border-[#d1d5db] px-3 py-2 text-xs font-medium text-[#0f2848] hover:bg-[#f9fafb]"
            >
              {t("actions.newProject")}
            </button>
          </div>
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {savedProjects.length === 0 ? (
              <li className="rounded-lg border border-dashed border-[#d1d5db] px-4 py-6 text-center text-xs text-[#6b7280]">
                {t("project.emptyList")}
              </li>
            ) : (
              savedProjects.map((item) => (
                <li
                  key={item.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                    item.id === savedProjectId ? "border-[#00c8f0] bg-[#f0fdff]" : "border-[#e5e7eb]"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#0f2848]">{item.name}</p>
                    <p className="text-[10px] text-[#6b7280]">
                      {t("project.lastSaved", { date: formatSavedDate(item.updatedAt) })}
                      {" · "}
                      {t("project.entities", { count: item.project.entities.length })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenProject(item.id)}
                      className="rounded-md bg-[#0f2848] px-3 py-1.5 text-xs font-medium text-white"
                    >
                      {t("project.open")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProject(item.id, item.name)}
                      className="rounded-md border border-[#d1d5db] px-3 py-1.5 text-xs text-[#6b7280]"
                    >
                      {t("project.remove")}
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      ) : null}

      <div className="cad-interface flex flex-wrap gap-1 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-1">
        {cadTabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium ${
              activeTab === item.id ? "bg-white text-[#0f2848] shadow-sm" : "text-[#6b7280]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {activeTab === "layout" ? (
        <CadPrintLayout
          project={project}
          memorialForm={memorialForm}
          selectedPolyline={selectedPolyline}
          rasters={displayRasters}
        />
      ) : null}

      {activeTab === "desenho" ? (
        <>
          {!imported && project.entities.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#d1d5db] bg-white p-4 sm:p-6">
              <p className="text-sm text-[#6b7280]">{t("empty.description")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={importingPoints}
                  onClick={openSurveyImport}
                  className="rounded-lg border border-[#38bdf8] px-4 py-2 text-sm font-medium text-[#0369a1] hover:bg-[#f0f9ff] disabled:opacity-50"
                >
                  {importingPoints ? t("import.working") : t("import.pointsFile")}
                </button>
                <button
                  type="button"
                  disabled={importingPoints}
                  onClick={openExcelImport}
                  className="rounded-lg border border-[#0f2848] px-4 py-2 text-sm font-medium text-[#0f2848] hover:bg-[#f0f4f8] disabled:opacity-50"
                >
                  {importingPoints ? t("import.working") : t("import.excel")}
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/digital-twin/gnss-rtk")}
                  className="rounded-lg bg-[#00c8f0] px-4 py-2 text-sm font-semibold text-[#0f2848]"
                >
                  {t("empty.goValidation")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSnapToRtkPoints(false);
                    setImported(true);
                  }}
                  className="rounded-lg border border-[#0f2848] px-4 py-2 text-sm font-medium text-[#0f2848]"
                >
                  {t("empty.startBlank")}
                </button>
              </div>
              {importNotice ? (
                <p className={`mt-3 text-xs ${importNotice.includes("Falha") || importNotice.includes("Nenhum") ? "text-red-600" : "text-emerald-700"}`}>
                  {importNotice}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="cad-interface grid gap-4 xl:grid-cols-[240px_1fr_280px]">
          <CadToolsSidebar
            activeTab={toolsTab}
            onTabChange={setToolsTab}
            sections={{
              draw: (
                <div className="space-y-4">
                  <section>
                    <h3 className="text-sm font-semibold text-[#0f2848]">{t("import.title")}</h3>
                    <p className="mt-1 text-xs text-[#6b7280]">{t("import.hint")}</p>
                    <div className="mt-3 flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={importingPoints}
                        onClick={openSurveyImport}
                        className="rounded-lg border border-[#38bdf8] px-3 py-2 text-xs font-medium text-[#0369a1] hover:bg-[#f0f9ff] disabled:opacity-50"
                      >
                        {importingPoints ? t("import.working") : t("import.pointsFile")}
                      </button>
                      <button
                        type="button"
                        disabled={importingPoints}
                        onClick={openExcelImport}
                        className="rounded-lg border border-[#0f2848] px-3 py-2 text-xs font-medium text-[#0f2848] hover:bg-[#f0f4f8] disabled:opacity-50"
                      >
                        {importingPoints ? t("import.working") : t("import.excel")}
                      </button>
                    </div>
                    <p className="mt-2 text-[10px] text-[#9ca3af]">{t("import.excelHint")}</p>
                  </section>
                  <section>
                    <h3 className="text-sm font-semibold text-[#0f2848]">{t("draw.optionsTitle")}</h3>
                    <div className="mt-3 space-y-2">
                      <label className="flex items-center gap-2 text-xs text-[#374151]">
                        <input
                          type="checkbox"
                          checked={snapToRtkPoints}
                          onChange={(e) => {
                            setSnapToRtkPoints(e.target.checked);
                            setDrawHint(null);
                          }}
                        />
                        {t("draw.snapRtk")}
                      </label>
                      <label className="flex items-center gap-2 text-xs text-[#374151]">
                        <input
                          type="checkbox"
                          checked={orthogonalMode}
                          onChange={(e) => setOrthogonalMode(e.target.checked)}
                        />
                        {t("draw.orthogonal")}
                      </label>
                    </div>
                    {canUsePolar ? (
                      <div className="mt-4 space-y-2 border-t border-[#e5e7eb] pt-4">
                        <p className="text-xs font-medium text-[#374151]">{t("draw.polarTitle")}</p>
                        <p className="text-[10px] text-[#6b7280]">{t("draw.polarHint")}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-[10px] text-[#6b7280]">
                            {t("draw.distance")}
                            <input
                              type="text"
                              inputMode="decimal"
                              value={polarDistance}
                              onChange={(e) => setPolarDistance(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") applyPolarVertex();
                              }}
                              placeholder="10.00"
                              className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 font-mono text-xs"
                            />
                          </label>
                          <label className="text-[10px] text-[#6b7280]">
                            {t("draw.angle")}
                            <input
                              type="text"
                              inputMode="decimal"
                              value={polarAngle}
                              onChange={(e) => setPolarAngle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") applyPolarVertex();
                              }}
                              placeholder="45"
                              className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 font-mono text-xs"
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          onClick={() => applyPolarVertex()}
                          className="w-full rounded-lg bg-[#0f2848] px-3 py-2 text-xs font-medium text-white"
                        >
                          {t("draw.applyPolar")}
                        </button>
                      </div>
                    ) : (
                      <p className="mt-3 text-[10px] text-[#9ca3af]">{t("draw.polarNeedReference")}</p>
                    )}
                  </section>
                  {tool === "polyline" && snapToRtkPoints ? (
                    <section>
                      <h3 className="text-sm font-semibold text-[#0f2848]">{t("draw.pointPicker")}</h3>
                      <p className="mt-1 text-xs text-[#6b7280]">{t("draw.pickerHint")}</p>
                      <input
                        type="search"
                        value={pointSearch}
                        onChange={(e) => setPointSearch(e.target.value)}
                        placeholder={t("draw.searchPlaceholder")}
                        className="mt-3 w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-xs"
                      />
                      <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
                        {filteredPickablePoints.length === 0 ? (
                          <li className="text-xs text-[#9ca3af]">{t("draw.noPoints")}</li>
                        ) : (
                          filteredPickablePoints.map((p) => {
                            const inDraft = draft.some(
                              (v) => Math.hypot(v.x - p.vertex.x, v.y - p.vertex.y) < 1e-4,
                            );
                            return (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  onClick={() => pickPointFromList(p.id)}
                                  className={`w-full rounded-lg border px-2 py-2 text-left text-xs transition ${
                                    hoverSnapId === p.id
                                      ? "border-[#00c8f0] bg-[#f0fdff]"
                                      : "border-[#e5e7eb] hover:border-[#00c8f0]/50"
                                  } ${inDraft ? "opacity-70" : ""}`}
                                >
                                  <span className="font-medium text-[#0f2848]">{p.label}</span>
                                  <span className="mt-0.5 block font-mono text-[10px] text-[#6b7280]">
                                    E {p.vertex.x.toFixed(3)} · N {p.vertex.y.toFixed(3)} · Z{" "}
                                    {p.vertex.z.toFixed(3)}
                                  </span>
                                </button>
                              </li>
                            );
                          })
                        )}
                      </ul>
                    </section>
                  ) : null}
                </div>
              ),
              layers: (
                <CadLayersPanel
                  layers={visibleCadLayers}
                  activeLayerId={activeLayerId}
                  entityCounts={layerEntityCounts}
                  onToggleVisibility={toggleLayer}
                  onSetActive={setActiveLayerId}
                  onAddLayer={addLayer}
                  onUpdateLayer={updateLayerStyles}
                  onDeleteLayer={deleteLayer}
                />
              ),
              properties: (
                <section>
                  <h3 className="text-sm font-semibold text-[#0f2848]">{t("properties.title")}</h3>
                  {selectedEntity ? (
                    <dl className="mt-3 space-y-2 text-xs">
                      <div>
                        <dt className="text-[#6b7280]">Tipo</dt>
                        <dd className="font-medium">{selectedEntity.type}</dd>
                      </div>
                      <div>
                        <dt className="text-[#6b7280]">{t("layers.entityLayer")}</dt>
                        <dd>
                          <select
                            value={selectedEntity.layerId}
                            onChange={(e) => moveEntityToLayer(selectedEntity.id, e.target.value)}
                            className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                          >
                            {project.layers.map((layer) => (
                              <option key={layer.id} value={layer.id}>
                                {layer.name}
                              </option>
                            ))}
                          </select>
                        </dd>
                      </div>
                      {selectedEntity.type === "point" ? (
                        <>
                          <div>
                            <dt className="text-[#6b7280]">{t("point.label")}</dt>
                            <dd>
                              <input
                                type="text"
                                value={selectedEntity.label ?? ""}
                                onChange={(e) => updatePointLabel(selectedEntity.id, e.target.value)}
                                className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                              />
                            </dd>
                          </div>
                          <div><dt className="text-[#6b7280]">E</dt><dd className="font-mono">
                            <input
                              type="text"
                              inputMode="decimal"
                              defaultValue={selectedEntity.x.toFixed(4)}
                              key={`${selectedEntity.id}-e`}
                              onBlur={(e) => {
                                const x = Number(e.target.value.replace(",", "."));
                                if (Number.isFinite(x)) updatePoint(selectedEntity.id, { x });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                              }}
                              className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                            />
                          </dd></div>
                          <div><dt className="text-[#6b7280]">N</dt><dd className="font-mono">
                            <input
                              type="text"
                              inputMode="decimal"
                              defaultValue={selectedEntity.y.toFixed(4)}
                              key={`${selectedEntity.id}-n`}
                              onBlur={(e) => {
                                const y = Number(e.target.value.replace(",", "."));
                                if (Number.isFinite(y)) updatePoint(selectedEntity.id, { y });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                              }}
                              className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                            />
                          </dd></div>
                          <div>
                            <dt className="text-[#6b7280]">Z ({t("point.elevation")})</dt>
                            <dd className="space-y-1.5">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={pointEditZ}
                                onChange={(e) => setPointEditZ(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") applySelectedPointElevation();
                                }}
                                className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                              />
                              <button
                                type="button"
                                onClick={applySelectedPointElevation}
                                className="w-full rounded-lg bg-[#0f2848] px-2 py-1.5 text-xs font-medium text-white"
                              >
                                {t("point.applyElevation")}
                              </button>
                            </dd>
                          </div>
                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => deleteSelectedEntity()}
                              className="w-full rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                            >
                              {t("point.delete")}
                            </button>
                            {selectedEntity.locked ? (
                              <p className="mt-1 text-[10px] text-amber-700">{t("point.deleteLockedHint")}</p>
                            ) : null}
                          </div>
                          {pointActionNotice ? (
                            <p
                              className={`text-xs ${
                                pointActionNotice.includes("válida") || pointActionNotice.includes("bloqueado")
                                  ? "text-amber-700"
                                  : "text-emerald-700"
                              }`}
                            >
                              {pointActionNotice}
                            </p>
                          ) : null}
                        </>
                      ) : null}
                      {selectedPolyline ? (
                        <>
                          <div>
                            <dt className="text-[#6b7280]">{t("polygon.name")}</dt>
                            <dd>
                              <input
                                type="text"
                                value={selectedPolyline.name ?? ""}
                                onChange={(e) => patchSelectedPolyline({ name: e.target.value })}
                                className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 text-xs"
                              />
                            </dd>
                          </div>
                          <div><dt className="text-[#6b7280]">{t("polygon.vertices")}</dt><dd>{selectedPolyline.vertices.length}</dd></div>
                          <div><dt className="text-[#6b7280]">{t("polygon.closed")}</dt><dd>{selectedPolyline.closed ? t("polygon.yes") : t("polygon.no")}</dd></div>
                          {selectedMetrics ? (
                            <>
                              <div><dt className="text-[#6b7280]">{t("polygon.area")}</dt><dd className="font-mono">{selectedMetrics.areaM2.toFixed(2)} m²</dd></div>
                              <div><dt className="text-[#6b7280]">{t("polygon.perimeter")}</dt><dd className="font-mono">{selectedMetrics.perimeterM.toFixed(2)} m</dd></div>
                            </>
                          ) : null}
                          {canEditSelectedPolyline ? (
                            <div className="space-y-2 border-t border-[#e5e7eb] pt-3">
                              <button
                                type="button"
                                onClick={() => setTool("editPolygon")}
                                className={`w-full rounded-lg px-3 py-2 text-xs font-medium ${
                                  tool === "editPolygon"
                                    ? "bg-[#00c8f0] text-[#0f2848]"
                                    : "border border-[#0f2848] text-[#0f2848]"
                                }`}
                              >
                                {t("polygon.edit.start")}
                              </button>
                              {tool === "editPolygon" && selectedVertexIndex !== null ? (
                                <>
                                  <p className="text-[10px] text-[#6b7280]">
                                    {t("polygon.edit.vertexLabel", {
                                      label: vertexLabels(selectedPolyline.vertices.length)[selectedVertexIndex] ?? `#${selectedVertexIndex + 1}`,
                                    })}
                                  </p>
                                  <label className="block text-[10px] text-[#6b7280]">
                                    E (m)
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={vertexEditE}
                                      onChange={(e) => setVertexEditE(e.target.value)}
                                      className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                                    />
                                  </label>
                                  <label className="block text-[10px] text-[#6b7280]">
                                    N (m)
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={vertexEditN}
                                      onChange={(e) => setVertexEditN(e.target.value)}
                                      className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                                    />
                                  </label>
                                  <label className="block text-[10px] text-[#6b7280]">
                                    Z (m)
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={vertexEditZ}
                                      onChange={(e) => setVertexEditZ(e.target.value)}
                                      className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                                    />
                                  </label>
                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => applySelectedVertexCoords(vertexEditE, vertexEditN, vertexEditZ)}
                                      className="rounded-lg bg-[#0f2848] px-2 py-1.5 text-xs font-medium text-white"
                                    >
                                      {t("polygon.edit.applyVertex")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={removeSelectedPolylineVertex}
                                      className="rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700"
                                    >
                                      {t("polygon.edit.removeVertex")}
                                    </button>
                                  </div>
                                </>
                              ) : tool === "editPolygon" ? (
                                <p className="text-[10px] text-[#6b7280]">{t("polygon.edit.pickVertex")}</p>
                              ) : null}
                              {polygonEditNotice ? (
                                <p className="text-xs text-emerald-700">{polygonEditNotice}</p>
                              ) : null}
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </dl>
                  ) : (
                    <p className="mt-3 text-xs text-[#6b7280]">{t("properties.none")}</p>
                  )}
                </section>
              ),
              contour: (
                <section>
                  <h3 className="text-sm font-semibold text-[#0f2848]">{t("contour.title")}</h3>
                  <p className="mt-1 text-xs text-[#6b7280]">{t("contour.hint")}</p>
                  <p className="mt-2 text-xs font-medium text-[#374151]">
                    {t("contour.points", { count: elevationSamples.length })}
                  </p>
                  <label className="mt-3 block text-xs text-[#6b7280]">
                    {t("contour.interval")}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={contourInterval}
                      onChange={(e) => setContourInterval(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-2 font-mono text-sm text-[#111827]"
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={generatingContours || elevationSamples.length < 3}
                      onClick={generateContours}
                      className="flex-1 rounded-lg bg-[#7c3aed] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      {generatingContours ? t("contour.generating") : t("contour.generate")}
                    </button>
                    <button
                      type="button"
                      onClick={clearContours}
                      className="rounded-lg border border-[#d1d5db] px-3 py-2 text-xs"
                    >
                      {t("contour.clear")}
                    </button>
                  </div>
                  {contourError ? <p className="mt-2 text-xs text-red-600">{contourError}</p> : null}
                  {contourInfo ? <p className="mt-2 text-xs text-emerald-700">{contourInfo}</p> : null}
                  {elevationSamples.length < 3 ? (
                    <p className="mt-2 text-xs text-amber-700">{t("contour.needPoints")}</p>
                  ) : null}
                </section>
              ),
              tin: (
                <section>
                  <h3 className="text-sm font-semibold text-[#0f2848]">{t("tin.title")}</h3>
                  <p className="mt-1 text-xs text-[#6b7280]">{t("tin.hint")}</p>
                  <p className="mt-2 text-xs font-medium text-[#374151]">
                    {t("contour.points", { count: elevationSamples.length })}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={generatingTin || elevationSamples.length < 3}
                      onClick={generateTin}
                      className="flex-1 rounded-lg bg-[#6366f1] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      {generatingTin ? t("tin.generating") : t("tin.generate")}
                    </button>
                    <button
                      type="button"
                      onClick={clearTin}
                      className="rounded-lg border border-[#d1d5db] px-3 py-2 text-xs"
                    >
                      {t("tin.clear")}
                    </button>
                  </div>
                  {tinError ? <p className="mt-2 text-xs text-red-600">{tinError}</p> : null}
                  {tinInfo ? <p className="mt-2 text-xs text-emerald-700">{tinInfo}</p> : null}
                  {elevationSamples.length < 3 ? (
                    <p className="mt-2 text-xs text-amber-700">{t("tin.needPoints")}</p>
                  ) : null}
                </section>
              ),
              hypsometric: (
                <section>
                  <h3 className="text-sm font-semibold text-[#0f2848]">{t("hypsometric.title")}</h3>
                  <p className="mt-1 text-xs text-[#6b7280]">{t("hypsometric.hint")}</p>
                  <p className="mt-2 text-xs font-medium text-[#374151]">
                    {t("contour.points", { count: elevationSamples.length })}
                  </p>
                  <label className="mt-3 flex items-center gap-2 text-xs text-[#374151]">
                    <input
                      type="checkbox"
                      checked={showHypsometricLegend}
                      onChange={(e) => setShowHypsometricLegend(e.target.checked)}
                    />
                    {t("hypsometric.showLegend")}
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={generatingHypsometric || elevationSamples.length < 3}
                      onClick={generateHypsometric}
                      className="flex-1 rounded-lg bg-[#059669] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      {generatingHypsometric ? t("hypsometric.generating") : t("hypsometric.generate")}
                    </button>
                    <button
                      type="button"
                      onClick={clearHypsometric}
                      className="rounded-lg border border-[#d1d5db] px-3 py-2 text-xs"
                    >
                      {t("hypsometric.clear")}
                    </button>
                  </div>
                  {hypsometricError ? <p className="mt-2 text-xs text-red-600">{hypsometricError}</p> : null}
                  {hypsometricInfo ? <p className="mt-2 text-xs text-emerald-700">{hypsometricInfo}</p> : null}
                </section>
              ),
              profile: (
                <div className="space-y-3">
                  <CadCommandsPanel
                    variant="profileOnly"
                    project={project}
                    selectedId={selectedId}
                    memorialForm={memorialForm}
                    onProjectChange={setProject}
                    onSelectedIdChange={setSelectedId}
                    onSideEffect={handleAiSideEffect}
                    profilePickActive={profilePickMode}
                    onStartProfilePick={() => {
                      setAreaPickMode(false);
                      setDistancePickMode(false);
                      setDistancePickIds([]);
                      setProfilePickMode(true);
                      setProfilePickIds([]);
                      setProfilePickResult(null);
                    }}
                    onCancelProfilePick={() => {
                      setProfilePickMode(false);
                      setProfilePickIds([]);
                    }}
                    profilePickResult={profilePickResult}
                    onClearProfilePickResult={() => setProfilePickResult(null)}
                  />
                  <p className="text-[10px] text-[#6b7280]">{t("commands.profileOps.chartHint")}</p>
                </div>
              ),
              anm: (
                <section>
                  <h3 className="text-sm font-semibold text-[#0f2848]">{t("basemap.anmSectionTitle")}</h3>
                  <p className="mt-1 text-xs text-[#6b7280]">{t("basemap.anmSectionHint")}</p>
                  <ul className="mt-3 space-y-2">
                    {ANM_SIGMINE_LAYER_KEYS.map((layerKey) => {
                      const def = ANM_SIGMINE_LAYERS[layerKey];
                      const importKey = `anm:${layerKey}`;
                      return (
                        <li
                          key={layerKey}
                          className="rounded-lg border border-[#f3f4f6] px-3 py-2"
                        >
                          <label className="flex items-start gap-2 text-xs">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={basemapOverlays.anmSigmine[layerKey]}
                              onChange={(e) => patchAnmSigmineOverlay(layerKey, e.target.checked)}
                            />
                            <span>
                              <span className="font-medium" style={{ color: def.color }}>
                                {t(`basemap.anmLayers.${layerKey}`)}
                              </span>
                              <span className="mt-0.5 block text-[10px] text-[#9ca3af]">
                                {t(`basemap.anmLayersHint.${layerKey}`)}
                              </span>
                            </span>
                          </label>
                          <button
                            type="button"
                            disabled={importingOverlay !== null}
                            onClick={() => void handleImportOverlay("anm", layerKey)}
                            className="mt-2 w-full rounded border px-2 py-1.5 text-[11px] font-medium disabled:opacity-50"
                            style={{ borderColor: def.color, color: def.color }}
                          >
                            {importingOverlay === importKey
                              ? "…"
                              : t("basemap.importAnmLayer", { layer: t(`basemap.anmLayers.${layerKey}`) })}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {overlayNotice ? (
                    <p className="mt-2 text-xs text-[#374151]">{overlayNotice}</p>
                  ) : null}
                  <p className="mt-2 text-[10px] text-[#9ca3af]">
                    {t("basemap.anmOpenDataCredit")}
                  </p>
                </section>
              ),
            }}
          />

          <div className="flex min-w-0 flex-col gap-4">
          <div className="overflow-hidden rounded-xl border border-[#1e293b] bg-[#0b1220]">
            <div className="flex flex-wrap gap-1 border-b border-[#1e293b] p-2">
              {(
                [
                  ["select", t("tools.select")],
                  ["pan", t("tools.pan")],
                  ["line", t("tools.line")],
                  ["polyline", t("tools.polyline")],
                  ["editPolygon", t("tools.editPolygon")],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setTool(id);
                    setDraft([]);
                    setDrawHint(null);
                    setHoverSnapId(null);
                    setDrawPreview(null);
                    setKeyboardDistance("");
                    if (id !== "editPolygon") setSelectedVertexIndex(null);
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    tool === id ? "bg-[#00c8f0] text-[#0f2848]" : "text-[#94a3b8] hover:bg-[#1e293b]"
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={toggleCoordLabels}
                title={coordLabelsVisible ? t("tools.hideCoords") : t("tools.insertCoords")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  coordLabelsVisible
                    ? "bg-[#00c8f0] text-[#0f2848]"
                    : "text-[#94a3b8] hover:bg-[#1e293b]"
                }`}
              >
                {coordLabelsVisible ? t("tools.hideCoords") : t("tools.insertCoords")}
              </button>
              {tool === "polyline" && draft.length >= 2 ? (
                <>
                  <button
                    type="button"
                    onClick={() => finishPolyline(false)}
                    className="rounded-md border border-[#334155] px-3 py-1.5 text-xs font-medium text-[#e2e8f0]"
                  >
                    {t("tools.finishPolyline")}
                  </button>
                  <button
                    type="button"
                    onClick={() => finishPolyline(true)}
                    disabled={draft.length < 3}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                  >
                    {t("tools.closePolygon")}
                  </button>
                </>
              ) : null}
              {selectedPolyline && !selectedPolyline.closed && selectedPolyline.vertices.length >= 3 ? (
                <button
                  type="button"
                  onClick={closeSelectedPolygon}
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
                >
                  {t("tools.closeSelected")}
                </button>
              ) : null}
              <div className="ml-auto flex items-center gap-2">
              <div className="flex overflow-hidden rounded-md border border-[#334155]">
                <button
                  type="button"
                  onClick={() => setViewMode("plan")}
                  title={t3d("plan")}
                  className={`border-r border-[#334155] px-3 py-1.5 text-xs font-medium ${
                    viewMode === "plan" ? "bg-[#00c8f0] text-[#0f2848]" : "text-[#e2e8f0] hover:bg-[#1e293b]"
                  }`}
                >
                  2D
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode("3d");
                    setTool("pan");
                    setDraft([]);
                    setDrawHint(null);
                  }}
                  title={t3d("scene")}
                  className={`px-3 py-1.5 text-xs font-medium ${
                    viewMode === "3d" ? "bg-[#00c8f0] text-[#0f2848]" : "text-[#e2e8f0] hover:bg-[#1e293b]"
                  }`}
                >
                  3D
                </button>
              </div>
              <div className="flex overflow-hidden rounded-md border border-[#334155]">
                <button
                  type="button"
                  onClick={zoomOut}
                  title={t("actions.zoomOut")}
                  aria-label={t("actions.zoomOut")}
                  className="border-r border-[#334155] px-2.5 py-1.5 text-sm font-semibold text-[#e2e8f0] hover:bg-[#1e293b]"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={zoomIn}
                  title={t("actions.zoomIn")}
                  aria-label={t("actions.zoomIn")}
                  className="px-2.5 py-1.5 text-sm font-semibold text-[#e2e8f0] hover:bg-[#1e293b]"
                >
                  +
                </button>
              </div>
              </div>
            </div>

            {tool === "polyline" ? (
              <div className="border-b border-[#1e293b] bg-[#0f172a] px-3 py-2 text-xs text-[#94a3b8]">
                {drawHint ? (
                  <span className="text-amber-400">{drawHint}</span>
                ) : snapToRtkPoints ? (
                  <span>{t("draw.selectPoint")}</span>
                ) : (
                  <span>{t("draw.freeClick")}</span>
                )}
                {orthogonalMode ? (
                  <span className="ml-2 text-emerald-400">· {t("draw.orthogonalOn")}</span>
                ) : null}
                {draft.length > 0 ? (
                  <span className="ml-2 text-[#00c8f0]">
                    · {t("draw.pointsInPolyline", { count: draft.length })}
                  </span>
                ) : null}
                {drawPreview && drawReference ? (
                  <span className="ml-2 font-mono text-[#cbd5e1]">
                    · {t("draw.segmentPreview", {
                      dist: segmentLengthM(drawReference, drawPreview).toFixed(2),
                      az: segmentAzimuthDeg(drawReference, drawPreview).toFixed(1),
                    })}
                  </span>
                ) : null}
                {keyboardDistance ? (
                  <span className="ml-2 font-mono text-[#00c8f0]">
                    · {t("draw.typedDistance", { value: keyboardDistance })}
                  </span>
                ) : null}
              </div>
            ) : tool === "line" ? (
              <div className="border-b border-[#1e293b] bg-[#0f172a] px-3 py-2 text-xs text-[#94a3b8]">
                {drawHint ? <span className="text-amber-400">{drawHint}</span> : null}
                {!drawHint ? (
                  <span>{draft.length === 0 ? t("draw.lineStart") : t("draw.lineEnd")}</span>
                ) : null}
                {orthogonalMode ? (
                  <span className="ml-2 text-emerald-400">· {t("draw.orthogonalOn")}</span>
                ) : null}
                {drawPreview && drawReference ? (
                  <span className="ml-2 font-mono text-[#cbd5e1]">
                    · {t("draw.segmentPreview", {
                      dist: segmentLengthM(drawReference, drawPreview).toFixed(2),
                      az: segmentAzimuthDeg(drawReference, drawPreview).toFixed(1),
                    })}
                  </span>
                ) : null}
                {keyboardDistance ? (
                  <span className="ml-2 font-mono text-[#00c8f0]">
                    · {t("draw.typedDistance", { value: keyboardDistance })}
                  </span>
                ) : null}
              </div>
            ) : tool === "editPolygon" ? (
              <div className="border-b border-[#1e293b] bg-[#0f172a] px-3 py-2 text-xs text-[#94a3b8]">
                <span className="text-emerald-400">{t("polygon.edit.hint")}</span>
              </div>
            ) : distancePickMode ? (
              <div className="flex items-center justify-between border-b border-[#1e293b] bg-[#0f172a] px-3 py-2 text-xs text-[#94a3b8]">
                <span className="text-amber-400">
                  {distancePickIds.length === 0
                    ? t("commands.distanceOps.pickFirst")
                    : t("commands.distanceOps.pickSecond", { count: distancePickIds.length })}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDistancePickMode(false);
                    setDistancePickIds([]);
                  }}
                  className="rounded border border-[#334155] px-2 py-0.5 text-[10px] text-[#cbd5e1] hover:bg-[#1e293b]"
                >
                  {t("commands.distanceOps.cancelPick")}
                </button>
              </div>
            ) : profilePickMode ? (
              <div className="flex items-center justify-between border-b border-[#1e293b] bg-[#0f172a] px-3 py-2 text-xs text-[#94a3b8]">
                <span className="text-amber-400">
                  {profilePickIds.length === 0
                    ? t("commands.profileOps.pickFirst")
                    : t("commands.profileOps.pickSecond", { count: profilePickIds.length })}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setProfilePickMode(false);
                    setProfilePickIds([]);
                  }}
                  className="rounded border border-[#334155] px-2 py-0.5 text-[10px] text-[#cbd5e1] hover:bg-[#1e293b]"
                >
                  {t("commands.profileOps.cancelPick")}
                </button>
              </div>
            ) : areaPickMode ? (
              <div className="flex items-center justify-between border-b border-[#1e293b] bg-[#0f172a] px-3 py-2 text-xs text-[#94a3b8]">
                <span className="text-amber-400">{t("commands.areaOps.pickHint")}</span>
                <button
                  type="button"
                  onClick={() => setAreaPickMode(false)}
                  className="rounded border border-[#334155] px-2 py-0.5 text-[10px] text-[#cbd5e1] hover:bg-[#1e293b]"
                >
                  {t("commands.areaOps.cancelPick")}
                </button>
              </div>
            ) : null}

            <div ref={canvasContainerRef} className="relative">
            {viewMode === "3d" ? (
              <Cad3dView
                entities={visibleEntities}
                layers={project.layers}
                preferTin={hasTinLayer}
              />
            ) : (
            <>
            {hasBasemap ? (
              <CadBasemapLayer
                viewport={viewport}
                entities={visibleEntities}
                overlays={basemapOverlays}
                crs={project.crs}
                georef={projectGeoref}
              />
            ) : null}
            {displayRasters.some((r) => r.visible && r.kind === "hypsometric") ? (
              <CadRasterLegend
                rasters={displayRasters}
                showHypsometricLegend={showHypsometricLegend}
              />
            ) : null}
            <svg
              ref={svgRef}
              width="100%"
              viewBox={`0 0 ${width} ${height}`}
              className={`relative z-10 ${areaPickMode || distancePickMode || profilePickMode || tool === "editPolygon" || tool !== "pan" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
              style={{ background: hasUnderlay ? "transparent" : undefined }}
              onMouseMove={(e) => {
                const rect = svgRef.current?.getBoundingClientRect();
                if (!rect) return;
                const sx = ((e.clientX - rect.left) / rect.width) * width;
                const sy = ((e.clientY - rect.top) / rect.height) * height;
                const w = screenToWorld(sx, sy, viewport);
                setCursor({ x: w.x, y: w.y, z: 0 });

                if (isDrawWithPoints && snapToRtkPoints) {
                  const hit = findPointAtScreen(sx, sy, project.entities, viewport, 16);
                  setHoverSnapId(hit?.entityId ?? null);
                } else {
                  setHoverSnapId(null);
                }

                updateDrawPreview(sx, sy);
                if (isDrawTool && draft.length > 0) {
                  const preview = keyboardDistance.trim()
                    ? (() => {
                        const typed = parseDrawNumber(keyboardDistance);
                        if (typed !== null && typed > 0 && drawReference) {
                          return vertexFromDistance(
                            drawReference,
                            typed,
                            resolveDrawAzimuth(),
                            orthogonalMode,
                          );
                        }
                        return resolveClickVertex(sx, sy);
                      })()
                    : resolveClickVertex(sx, sy);
                  if (drawReference) {
                    cursorAzimuthRef.current = segmentAzimuthDeg(drawReference, preview);
                  }
                }

                if (panning) {
                  const dx = sx - panning.startX;
                  const dy = sy - panning.startY;
                  const innerW = width - padding * 2;
                  const innerH = height - padding * 2;
                  const worldDx =
                    (dx / innerW) * (panning.bounds.maxX - panning.bounds.minX);
                  const worldDy =
                    (dy / innerH) * (panning.bounds.maxY - panning.bounds.minY);
                  setViewBounds({
                    minX: panning.bounds.minX - worldDx,
                    maxX: panning.bounds.maxX - worldDx,
                    minY: panning.bounds.minY + worldDy,
                    maxY: panning.bounds.maxY + worldDy,
                  });
                }

                if (vertexDragIndex !== null && selectedId) {
                  const entity = project.entities.find((e) => e.id === selectedId);
                  if (entity?.type === "polyline") {
                    const current = entity.vertices[vertexDragIndex];
                    const world = screenToWorld(sx, sy, viewport);
                    updatePolylineVertex(selectedId, vertexDragIndex, {
                      x: world.x,
                      y: world.y,
                      z: current?.z ?? 0,
                    });
                  }
                }
              }}
              onMouseDown={(e) => {
                const rect = svgRef.current?.getBoundingClientRect();
                if (!rect) return;
                const sx = ((e.clientX - rect.left) / rect.width) * width;
                const sy = ((e.clientY - rect.top) / rect.height) * height;
                if (tool === "pan") {
                  setPanning({ startX: sx, startY: sy, bounds: { ...bounds } });
                  return;
                }
                if (tool === "editPolygon" && selectedId) {
                  const entity = project.entities.find((e) => e.id === selectedId);
                  if (entity?.type === "polyline" && isEditablePolyline(entity)) {
                    const wts = (x: number, y: number) => worldToScreen(x, y, viewport);
                    const idx = hitTestPolylineVertexIndex(sx, sy, entity.vertices, wts);
                    if (idx !== null) {
                      setVertexDragIndex(idx);
                      setSelectedVertexIndex(idx);
                      return;
                    }
                  }
                }
                handleCanvasClick(sx, sy);
              }}
              onMouseUp={() => {
                setPanning(null);
                setVertexDragIndex(null);
              }}
              onMouseLeave={() => {
                setPanning(null);
                setVertexDragIndex(null);
                setHoverSnapId(null);
                setDrawPreview(null);
              }}
              onDoubleClick={() => {
                if (tool === "polyline" && draft.length >= 3) finishPolyline(true);
                else if (tool === "polyline" && draft.length >= 2) finishPolyline(false);
              }}
            >
              {!hasUnderlay ? (
                <rect width={width} height={height} fill="#0b1220" />
              ) : null}
              <CadRasterSvgLayer rasters={displayRasters} viewport={viewport} />
              {renderCoordinateGrid()}
              {visibleEntities.map(renderEntity)}

              {tool === "editPolygon" && selectedPolyline && canEditSelectedPolyline ? (
                <g>
                  {selectedPolyline.vertices.map((vertex, index) => {
                    const point = worldToScreen(vertex.x, vertex.y, viewport);
                    const active = index === selectedVertexIndex;
                    const size = active ? 12 : 10;
                    return (
                      <rect
                        key={`edit-v-${index}`}
                        x={point.sx - size / 2}
                        y={point.sy - size / 2}
                        width={size}
                        height={size}
                        fill={active ? "#00c8f0" : "#fbbf24"}
                        stroke="#ffffff"
                        strokeWidth={1.2}
                      />
                    );
                  })}
                </g>
              ) : null}

              {draft.length > 0 ? (
                <g>
                  {draft.map((v, i) => {
                    const p = worldToScreen(v.x, v.y, viewport);
                    return (
                      <g key={`d-${i}`}>
                        <circle cx={p.sx} cy={p.sy} r={4} fill="#fbbf24" />
                        <text x={p.sx + 6} y={p.sy - 4} fill="#fde68a" fontSize={9}>
                          {vertexLabels(draft.length)[i]}
                        </text>
                      </g>
                    );
                  })}
                  {draft.length > 1 ? (
                    <polyline
                      points={draft
                        .map((v) => worldToScreen(v.x, v.y, viewport))
                        .map((p) => `${p.sx},${p.sy}`)
                        .join(" ")}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                    />
                  ) : null}
                  {draft.length >= 3 ? (
                    <line
                      x1={worldToScreen(draft[draft.length - 1].x, draft[draft.length - 1].y, viewport).sx}
                      y1={worldToScreen(draft[draft.length - 1].x, draft[draft.length - 1].y, viewport).sy}
                      x2={worldToScreen(draft[0].x, draft[0].y, viewport).sx}
                      y2={worldToScreen(draft[0].x, draft[0].y, viewport).sy}
                      stroke="#22c55e"
                      strokeWidth={1.2}
                      strokeDasharray="4 3"
                      opacity={0.75}
                    />
                  ) : null}
                  {draft.length >= 3 ? (
                    <polygon
                      points={draft
                        .map((v) => worldToScreen(v.x, v.y, viewport))
                        .map((p) => `${p.sx},${p.sy}`)
                        .join(" ")}
                      fill="rgba(34,197,94,0.08)"
                      stroke="none"
                    />
                  ) : null}
                  {drawPreview && drawReference ? (
                    <line
                      x1={worldToScreen(drawReference.x, drawReference.y, viewport).sx}
                      y1={worldToScreen(drawReference.x, drawReference.y, viewport).sy}
                      x2={worldToScreen(drawPreview.x, drawPreview.y, viewport).sx}
                      y2={worldToScreen(drawPreview.y, drawPreview.y, viewport).sy}
                      stroke="#38bdf8"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />
                  ) : null}
                </g>
              ) : null}
            </svg>
            <CadBasemapAttribution overlays={basemapOverlays} />
            </>
            )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1e293b] px-3 py-2 text-[10px] text-[#94a3b8]">
              <span>
                E: {cursor ? cursor.x.toFixed(3) : "—"} · N: {cursor ? cursor.y.toFixed(3) : "—"}
                {showGrid ? ` · ${t("grid.step")} ${grid.stepE.toFixed(2)} m` : ""}
              </span>
              <span>{viewMode === "3d" ? t3d("statusHint") : t("hints.zoomPan")}</span>
              {isDrawTool && drawReference ? (
                <span className="text-[#00c8f0]">{t("draw.keyboardHint")}</span>
              ) : null}
            </div>
          </div>

          <CadProfileView project={project} selectedId={selectedId} />
          </div>

          <aside className="space-y-4">
            <CadCommandsPanel
              project={project}
              selectedId={selectedId}
              memorialForm={memorialForm}
              onProjectChange={setProject}
              onSelectedIdChange={setSelectedId}
              onSideEffect={handleAiSideEffect}
              onOpenAiChat={() => setAiChatOpen(true)}
              areaPickActive={areaPickMode}
              onStartAreaPick={() => {
                setDistancePickMode(false);
                setDistancePickIds([]);
                setProfilePickMode(false);
                setProfilePickIds([]);
                setAreaPickMode(true);
              }}
              onCancelAreaPick={() => setAreaPickMode(false)}
              areaPickResult={areaPickResult}
              onClearAreaPickResult={() => setAreaPickResult(null)}
              distancePickActive={distancePickMode}
              onStartDistancePick={() => {
                setAreaPickMode(false);
                setProfilePickMode(false);
                setProfilePickIds([]);
                setDistancePickMode(true);
                setDistancePickIds([]);
                setDistancePickResult(null);
              }}
              onCancelDistancePick={() => {
                setDistancePickMode(false);
                setDistancePickIds([]);
              }}
              distancePickResult={distancePickResult}
              onClearDistancePickResult={() => setDistancePickResult(null)}
            />

            <section className="rounded-xl border border-[#e5e7eb] bg-white p-4">
              <h3 className="text-sm font-semibold text-[#0f2848]">{t("memorial.title")}</h3>
              <p className="mt-1 text-xs text-[#6b7280]">{t("memorial.hint")}</p>
              <div className="mt-3 space-y-2">
                <label className="block text-xs font-medium text-[#374151]">{t("memorial.kind")}</label>
                <select
                  value={memorialForm.memorialKind}
                  onChange={(e) =>
                    patchMemorialForm({ memorialKind: e.target.value as MemorialKind })
                  }
                  className="w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-xs"
                >
                  <option value="retificacao">{t("memorial.kindRetificacao")}</option>
                  <option value="desmembramento">{t("memorial.kindDesmembramento")}</option>
                  <option value="demarcacao">{t("memorial.kindDemarcacao")}</option>
                  <option value="unificacao">{t("memorial.kindUnificacao")}</option>
                  <option value="outro">{t("memorial.kindOutro")}</option>
                </select>
                {memorialForm.memorialKind === "outro" ? (
                  <input
                    value={memorialForm.memorialKindCustom}
                    onChange={(e) => patchMemorialForm({ memorialKindCustom: e.target.value })}
                    placeholder={t("memorial.kindCustom")}
                    className="w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-xs"
                  />
                ) : null}
                <input
                  value={memorialForm.registration}
                  onChange={(e) => patchMemorialForm({ registration: e.target.value })}
                  placeholder={t("memorial.registration")}
                  className="w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-xs"
                />
                <div className="grid grid-cols-[1fr_4rem] gap-2">
                  <input
                    value={memorialForm.municipality}
                    onChange={(e) => patchMemorialForm({ municipality: e.target.value })}
                    placeholder={t("memorial.municipality")}
                    className="w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-xs"
                  />
                  <input
                    value={memorialForm.state}
                    onChange={(e) => patchMemorialForm({ state: e.target.value.toUpperCase() })}
                    placeholder={t("memorial.state")}
                    maxLength={2}
                    className="w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-xs uppercase"
                  />
                </div>
                <input
                  value={memorialForm.owner}
                  onChange={(e) => patchMemorialForm({ owner: e.target.value })}
                  placeholder={t("memorial.owner")}
                  className="w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-xs"
                />
                <label className="block text-xs font-medium text-[#374151]">{t("memorial.appNote")}</label>
                <textarea
                  value={memorialForm.appNote}
                  onChange={(e) => patchMemorialForm({ appNote: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-xs"
                />
                <button
                  type="button"
                  onClick={() => setMemorialFooterOpen((v) => !v)}
                  className="flex w-full items-center justify-between rounded-lg border border-[#d1d5db] px-3 py-2 text-xs font-medium text-[#374151]"
                >
                  {t("memorial.footerSection")}
                  <span>{memorialFooterOpen ? "−" : "+"}</span>
                </button>
                {memorialFooterOpen ? (
                  <div className="space-y-2 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-3">
                    <input
                      value={memorialForm.lawFirmName}
                      onChange={(e) => patchMemorialForm({ lawFirmName: e.target.value })}
                      placeholder={t("memorial.lawFirmName")}
                      className="w-full rounded-lg border border-[#d1d5db] bg-white px-3 py-2 text-xs"
                    />
                    <input
                      value={memorialForm.lawFirmCnpj}
                      onChange={(e) => patchMemorialForm({ lawFirmCnpj: e.target.value })}
                      placeholder={t("memorial.lawFirmCnpj")}
                      className="w-full rounded-lg border border-[#d1d5db] bg-white px-3 py-2 text-xs"
                    />
                    <input
                      value={memorialForm.technicalName}
                      onChange={(e) => patchMemorialForm({ technicalName: e.target.value })}
                      placeholder={t("memorial.technicalName")}
                      className="w-full rounded-lg border border-[#d1d5db] bg-white px-3 py-2 text-xs"
                    />
                    <input
                      value={memorialForm.technicalCrea}
                      onChange={(e) => patchMemorialForm({ technicalCrea: e.target.value })}
                      placeholder={t("memorial.technicalCrea")}
                      className="w-full rounded-lg border border-[#d1d5db] bg-white px-3 py-2 text-xs"
                    />
                    <input
                      value={memorialForm.crsLabel}
                      onChange={(e) => patchMemorialForm({ crsLabel: e.target.value })}
                      placeholder={t("memorial.crsLabel")}
                      className="w-full rounded-lg border border-[#d1d5db] bg-white px-3 py-2 text-xs"
                    />
                    <input
                      value={memorialForm.projectionNote}
                      onChange={(e) => patchMemorialForm({ projectionNote: e.target.value })}
                      placeholder={t("memorial.projectionNote")}
                      className="w-full rounded-lg border border-[#d1d5db] bg-white px-3 py-2 text-xs"
                    />
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                disabled={
                  generatingMemorial ||
                  !selectedPolyline?.closed ||
                  (selectedPolyline?.vertices.length ?? 0) < 3
                }
                onClick={() => void exportMemorialWord(selectedId)}
                className="mt-4 w-full rounded-lg bg-[#0f2848] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {generatingMemorial ? t("memorial.generating") : t("memorial.generateWord")}
              </button>
              {selectedPolyline && !selectedPolyline.closed ? (
                <p className="mt-2 text-xs text-amber-700">{t("memorial.needClosed")}</p>
              ) : null}
            </section>
          </aside>
        </div>
        </>
      ) : null}

      <CadAiChat
        project={project}
        selectedId={selectedId}
        memorialForm={memorialForm}
        open={aiChatOpen}
        onOpenChange={setAiChatOpen}
        onProjectChange={setProject}
        onSelectedIdChange={setSelectedId}
        onSideEffect={handleAiSideEffect}
      />
      <input
        ref={surveyFileRef}
        type="file"
        accept=".txt,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleImportSurveyPoints(file);
        }}
      />
      <input
        ref={excelFileRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleImportSurveyPoints(file);
        }}
      />
    </div>
  );
}
