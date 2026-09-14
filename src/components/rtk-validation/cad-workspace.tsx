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
  worldMetersPerPixel,
  clientToViewBox,
  annotationFontSizePx,
  cadastralLotFontSizePx,
  gridDataForViewport,
  formatGridLabel,
  computePolygonMetrics,
  hitTestPolyline,
  hitTestPolylineVertexIndex,
  hitTestPolylineSegmentIndex,
  findPolylineEdgeInsert,
  normalizeConfrontations,
  insertConfrontationAt,
  removeConfrontationAt,
  confrontationScreenLabels,
  generateMemorialDocx,
  downloadBlob,
  extractSurveyElevationPoints,
  generateContoursFromPoints,
  removeContourEntities,
  generateContoursFromDem,
  isViewportSmallEnoughForDemContours,
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
  saveCadDwgToCloud,
  loadCadProject,
  deleteCadProject,
  downloadCadProjectDwg,
  getLastOpenedCadProjectId,
  setLastOpenedCadProjectId,
  clearLastOpenedCadProjectId,
  saveCadDraft,
  loadCadDraft,
  clearCadDraft,
  formatSavedDate,
  serializeCadProjectFile,
  parseCadProjectFileText,
  cadProjectFileBasename,
  snapshotFromSavedRecord,
  appendPolygonCenterLabel,
  CAD_TEXT_LAYER,
  formatAreaBr,
  polygonCentroid,
  pointInPolygon,
  applyReservaLegalToProject,
  applyAreaUtilToProject,
  applyAppBufferToProject,
  RESERVA_LEGAL_NEED_POLYGON,
  AREA_UTIL_NEED_POLYGON,
  AREA_UTIL_NEED_AREA,
  AREA_UTIL_NEED_RESERVA,
  APP_NEED_LINE,
  translateRingInsideHost,
  clampPointInsideHost,
  parseReservaCanto,
  AREA_RESERVA_LEGAL_LAYER_ID,
  AREA_APP_LAYER_ID,
  AREA_UTIL_LAYER_ID,
  computeLoteamentoAreaUtilBreakdown,
  EIXO_NEED_LOTEAMENTO,
  EIXO_TWO_POINT_NEED_DISTINCT,
  EIXO_TWO_POINT_NEED_HIT,
  EIXO_TWO_POINT_NEED_SAME,
  applyEixoTwoPointEdit,
  applyLoteamentoLotSize,
  findLoteamentoLotAtPoint,
  hitTestEixoEditPoint,
  isLoteamentoEixoPolyline,
  isLoteamentoLotEntity,
  loteamentoSizeTarget,
  rebuildLoteamentoFromEixos,
  syncReservaLegalLabel,
  syncAreaUtilLabel,
  syncAppLabel,
  isAppSourceEntity,
  type AppBufferSide,
  generateTinEntities,
  removeTinEntities,
  TIN_LAYER,
  INTERPOLATED_CONTOUR_LAYER,
  generateInterpolatedContours,
  removeInterpolatedContourEntities,
  extractImportedContourTerrain,
  computeLoteamentoCutFill,
  tryGenerateLoteamentoCutFillRaster,
  type ContourInterpolateMethod,
  buildContourElevationLabels,
  CONTOUR_LABEL_LAYER,
  removeContourLabelEntities,
  listClosedPolygons,
  closedPolygonLabel,
  formatCoordBr,
  generateHypsometricRaster,
  importSurveyPointsToProject,
  createCadGeorefContext,
  detectCadGeorefFromProject,
  detectUtmZoneFromCoordinates,
  latLonToVertexGeoref,
  sirgasUtmEpsgCode,
  utmZoneFromLongitude,
  importCadDrawingFile,
  ensureRasterLayerInProject,
  removeRasterLayerFromProject,
  rastersWithLayerVisibility,
  countRasterLayerItems,
  createUserLayer,
  defaultDrawLayerStyles,
  getLayerLineColor,
  getLayerLineWidth,
  getLayerPolygonFill,
  getLayerStrokeDasharray,
  getLayerTextColor,
  getLayerTextSize,
  resolvePointTextStyle,
  mergeLayerStyles,
  normalizeCadLayers,
  parseEcwViaApi,
  parseGeoTiffBuffer,
  parseImageFileToRasterOverlay,
  applyLoteamentoStakePoints,
  applyLoteamentoTables,
  buildLoteamentoTablesBlob,
  loteamentoTablesFilename,
  applyReurbLotLabels,
  classifyLot,
  DEFAULT_PERCENTUAL_ESQUINA,
  formatLoteEsquinaTooltip,
  listLoteamentoStreetPolys,
  lotEsquinaTooltipOf,
  resolveAreaMinimaInterno,
  applyStandaloneSecaoTipo,
  applyStreetProfilesToProject,
  addGreidePiv,
  buildReurbTabularMemorialBlob,
  buildStreetProfiles,
  clearLoteamentoAnnotations,
  cloneProjectForLot,
  defaultSecaoTipo,
  secaoTipoFromInputs,
  exportCadProjectKml,
  listLoteamentoEixos,
  loteamentoMaqueteReadiness,
  drainageNetwork3dReadiness,
  generateLoteamentoDrainage,
  insertDrainagePv,
  insertDrainageInlet,
  insertDrainagePipe,
  setDrainageOutfall,
  deleteDrainagePv,
  deleteDrainagePipe,
  moveDrainagePv,
  updateDrainagePipe,
  updateDrainagePv,
  recalculateDrainageHydraulics,
  clearDrainageEntities,
  listDrainagePvs,
  listDrainagePipes,
  hitDrainagePvAtScreen,
  DRAINAGE_MATERIALS,
  DRAINAGE_PIPE_DIAMETERS_MM,
  DRAINAGE_LAMINA_RELATIVA_MAX,
  DRAINAGE_VELOCITY_MAX_MS,
  DRAINAGE_VELOCITY_MIN_MS,
  DEFAULT_DRAINAGE_PARAMS,
  exportDrainageSwmmInp,
  importDrainageSwmmInp,
  drainageSwmmFilename,
  runoffCFromImpervious,
  isDrainageAlertStatus,
  isUsableIdf,
  classifyDrainageFlowDepthRatio,
  isDrainagePipeEntity,
  isDrainagePvEntity,
  isDrainageStructureLayer,
  DRENAGEM_TUBOS_LAYER,
  CAD_PLAN_BLUE,
  CAD_PLAN_FONT,
  CAD_PLAN_INK,
  SKIP_POLYGON_CENTER_LABEL_LAYERS,
  buildCadastralLotPlanTexts,
  buildStreetPlanText,
  polylineLabelPose,
  isPlanTextOnlyPoint,
  isStoredLotPlanAnnotation,
  inferPlanTextRole,
  planLotTitleCircleRadius,
  planTextFillColor,
  planTextFontWeight,
  planTextHaloWidth,
  lotMinSpanM,
  LOTEAMENTO_LOTES_LAYER_ID,
  LOTEAMENTO_QUADRAS_LAYER_ID,
  LOTEAMENTO_VIAS_LAYER_ID,
  REURB_ANNOTATION_LAYER,
  drainageCalcFilename,
  drainageEntityHasRedError,
  exportDrainageCalcWorkbook,
  isDrainageSelectableEntity,
  selectDrainageCalcParams,
  listReurbLots,
  loteamentoKmlFilename,
  loteamentoStakePointsCsv,
  loteamentoStakePointsFilename,
  reurbLotSlug,
  reurbPlantasZipFilename,
  reurbTabularFilename,
  updateGreidePiv,
  zipReurbPlantas,
  interpolateGreideZ,
  isStreetProfileChartLayer,
  LOTEAMENTO_SECAO_LAYER,
  type ReservaCanto,
  type StreetProfileDraft,
} from "@/lib/rtk-validation/cad";
import { isCoordLabelEntity, resolveCoordLabelLayout } from "@/lib/rtk-validation/cad/label-layout";
import { parseSurveyUpload } from "@/lib/rtk-validation/parsers";
import { resolveBrazilCitySearch } from "@/lib/geofisica/dipolo2d/city-geocode";
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
import type { PrintSheetContent } from "@/components/rtk-validation/cad-print-street-sheets";
import {
  CadBasemapAttribution,
  CadBasemapLayer,
  cloneDefaultBasemapOverlays,
  type AnmSigmineLayerKey,
  type CadBasemapOverlays,
  type SigefLayerKey,
} from "@/components/rtk-validation/cad-basemap-layer";
import { CadRasterLegend, CadRasterSvgLayer } from "@/components/rtk-validation/cad-raster-overlay";
import { CadAiChat } from "@/components/rtk-validation/cad-ai-chat";
import { CadCommandsPanel } from "@/components/rtk-validation/cad-commands-panel";
import { CadLayersPanel } from "@/components/rtk-validation/cad-layers-panel";
import { CadPointObservations } from "@/components/rtk-validation/cad-point-observations";
import { CadConfrontationLabels } from "@/components/rtk-validation/cad-confrontation-labels";
import { CadConfrontationTable } from "@/components/rtk-validation/cad-confrontation-table";
import {
  CAD_TOOLS_PANEL_WIDTH_PX,
  CadToolsSidebar,
  type CadToolsTab,
} from "@/components/rtk-validation/cad-tools-sidebar";
import { CadHatchDefs } from "@/components/rtk-validation/cad-hatch-defs";
import { CadSvgMultilineText } from "@/components/rtk-validation/cad-svg-multiline-text";
import { buildViabilidadeSessionPayload, writeViabilidadeSession } from "@/lib/viabilidade/cad-session";
import { CadProfileView } from "@/components/rtk-validation/cad-profile-view";
import { CadDrainageWaterProfileChart } from "@/components/rtk-validation/cad-drainage-water-profile-chart";
import { CadDrainagePlanilha } from "@/components/rtk-validation/cad-drainage-planilha";
import { StreetProfileChart } from "@/components/rtk-validation/street-profile-chart";
import { SecaoTipoPreview } from "@/components/rtk-validation/secao-tipo-preview";

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

const CadLoteamentoMaquete = dynamic(
  () => import("@/components/rtk-validation/cad-loteamento-maquete").then((m) => m.CadLoteamentoMaquete),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0b1220] text-sm text-[#94a3b8]">
        Montando maquete…
      </div>
    ),
  },
);

const CadDrenagem3d = dynamic(
  () => import("@/components/rtk-validation/cad-drenagem-3d").then((m) => m.CadDrenagem3d),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0b1220] text-sm text-[#94a3b8]">
        Montando drenagem 3D…
      </div>
    ),
  },
);
import type { CadAiSideEffect } from "@/lib/rtk-validation/cad/ai-command-types";
import { executeCadAiCommand } from "@/lib/rtk-validation/cad/ai-command-executor";
import {
  generateLongitudinalProfileAlongPolyline,
  generateTypicalCrossSections,
  isSelectableAlignmentEntity,
  isTerrainProfileLayer,
  PROFILE_LAYER,
  TRANSVERSAL_PROFILE_LAYER,
} from "@/lib/rtk-validation/cad/profile";
import {
  buildServiceNotesOdsBlob,
  buildStakeoutOdsBlob,
  buildStakeoutRows,
  buildVolumeOdsBlob,
  computeEarthworkVolume,
  computeStreetEarthwork,
  designSurfaceFromLayer,
  findAlignmentPolyline,
  formatVolumeM3,
  listElevationPointLayers,
  meanElevation,
  planeFromHorizontalZ,
  planeFromStrikeDip,
  planeFromThreePoints,
  planeFromTwoElevations,
  removeStakeoutEntities,
  serviceNotesOdsFilename,
  serviceNotesSheets,
  sheetsToCsv,
  STAKEOUT_LAYER,
  stakeoutEntities,
  stakeoutOdsFilename,
  stakeoutSheets,
  volumeOdsFilename,
  volumeSummarySheets,
  type DesignSurface,
  type EarthworkVolumeResult,
  type StakeoutRow,
  type StreetEarthworkResult,
} from "@/lib/rtk-validation/cad/earthwork";
import { buildReurbLotPdfBytes } from "@/lib/rtk-validation/cad/reurb-pdf";
import { isViewportSmallEnoughForImport } from "@/lib/rtk-validation/cad/map-tiles";
import { viewportBbox4326Georef } from "@/lib/rtk-validation/cad/georef";
import {
  ANM_SIGMINE_LAYER_KEYS,
  ANM_SIGMINE_LAYERS,
  SIGEF_CONSULTA,
  SIGEF_EXTENSAO_OXT,
  SIGEF_LAYER_KEYS,
  SIGEF_LAYERS,
  SIGEF_MODELO_ODS,
  SIGEF_UFS,
  anySigefOverlay,
  normalizeSigefUf,
} from "@/lib/cad-map/overlay-sources";
import {
  mergeAnmLayerImport,
  mergeSigefLayerImport,
  removeAnmLayerImport,
  removeAllAnmImports,
  removeSigefLayerImport,
  removeAllSigefImports,
  countAnmLayerEntities,
  countAllAnmEntities,
  countSigefLayerEntities,
  countAllSigefEntities,
  type OverlayImportSource,
} from "@/lib/rtk-validation/cad/import-map-overlay";
import { anyAnmSigmineOverlay } from "@/lib/cad-map/anm-sigmine-layers";
import { buildSigefOdsBlob, sigefOdsFilename } from "@/lib/rtk-validation/cad/export-sigef-ods";

type CadTabId = "desenho" | "layout" | "planilha";
type VolDesignMode = "flat" | "inclined3" | "strikeDip" | "twoElev" | "mdt";

function parseMeters(raw: string): number | null {
  const n = Number(String(raw).replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

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
const CAD_FULLSCREEN_CLASS = "cad-fullscreen";

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenHtmlElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function getFullscreenElement(): Element | null {
  const doc = document as FullscreenDocument;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

async function requestElementFullscreen(el: HTMLElement): Promise<void> {
  const node = el as FullscreenHtmlElement;
  if (el.requestFullscreen) {
    await el.requestFullscreen();
    return;
  }
  if (node.webkitRequestFullscreen) {
    await Promise.resolve(node.webkitRequestFullscreen());
  }
}

async function exitDocumentFullscreen(): Promise<void> {
  const doc = document as FullscreenDocument;
  if (getFullscreenElement() == null) return;
  if (document.exitFullscreen) {
    await document.exitFullscreen();
    return;
  }
  if (doc.webkitExitFullscreen) {
    await Promise.resolve(doc.webkitExitFullscreen());
  }
}

function setCadFullscreenClass(on: boolean) {
  document.documentElement.classList.toggle(CAD_FULLSCREEN_CLASS, on);
}

export function CadWorkspace({ userId }: { userId: string }) {
  const t = useTranslations("rtkCad");
  const t3d = useTranslations("rtkCad.view3d");
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const workspaceRootRef = useRef<HTMLDivElement>(null);
  const isCadFullscreenRef = useRef(false);
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
  const [interpMethod, setInterpMethod] = useState<ContourInterpolateMethod>("tin");
  const [interpAssignZ, setInterpAssignZ] = useState("");
  const [interpUsePoints, setInterpUsePoints] = useState(true);
  const [generatingInterp, setGeneratingInterp] = useState(false);
  const [interpInfo, setInterpInfo] = useState<string | null>(null);
  const [interpError, setInterpError] = useState<string | null>(null);
  const [contourSmooth, setContourSmooth] = useState(true);
  const [generatingContours, setGeneratingContours] = useState(false);
  const [generatingDemContours, setGeneratingDemContours] = useState(false);
  const [googleElevationAvailable, setGoogleElevationAvailable] = useState(false);
  const [googleElevationNotice, setGoogleElevationNotice] = useState<string | null>(null);
  const [googleTestElevationM, setGoogleTestElevationM] = useState<number | null>(null);
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
  const [importingDrawing, setImportingDrawing] = useState(false);
  const [pointEditZ, setPointEditZ] = useState("");
  const [pointActionNotice, setPointActionNotice] = useState<string | null>(null);
  const surveyFileRef = useRef<HTMLInputElement>(null);
  const excelFileRef = useRef<HTMLInputElement>(null);
  const orthoFileRef = useRef<HTMLInputElement>(null);
  const projectFileRef = useRef<HTMLInputElement>(null);
  const drawingFileRef = useRef<HTMLInputElement>(null);
  const drenagemInpRef = useRef<HTMLInputElement>(null);
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
  const [basemapOverlays, setBasemapOverlays] = useState<CadBasemapOverlays>(cloneDefaultBasemapOverlays);
  const [sigefCns, setSigefCns] = useState("");
  const [sigefCodigoImovel, setSigefCodigoImovel] = useState("");
  const [importingOverlay, setImportingOverlay] = useState<string | null>(null);
  const [overlayNotice, setOverlayNotice] = useState<string | null>(null);
  const [importingOrtho, setImportingOrtho] = useState(false);
  const [reurbNotice, setReurbNotice] = useState<string | null>(null);
  const [reurbIncludeArea, setReurbIncludeArea] = useState(true);
  const [reurbBusy, setReurbBusy] = useState<null | "labels" | "tabular" | "plantas">(null);
  const [loteamentoGlebaId, setLoteamentoGlebaId] = useState("");
  const [loteamentoLarguraVia, setLoteamentoLarguraVia] = useState("12");
  const [loteamentoLarguraCalcada, setLoteamentoLarguraCalcada] = useState("2");
  const [loteamentoEixoRua, setLoteamentoEixoRua] = useState(true);
  const [loteamentoAjusteEixo, setLoteamentoAjusteEixo] = useState(true);
  const [loteamentoRaioEsquina, setLoteamentoRaioEsquina] = useState("3");
  const [loteamentoProfundidade, setLoteamentoProfundidade] = useState("50");
  const [loteamentoTestada, setLoteamentoTestada] = useState("10");
  const [loteamentoPercentualEsquina, setLoteamentoPercentualEsquina] = useState("20");
  const [hoverLotId, setHoverLotId] = useState<string | null>(null);
  const [loteamentoAreaQuadra, setLoteamentoAreaQuadra] = useState("2000");
  const [loteamentoQuadraModo, setLoteamentoQuadraModo] = useState<"area" | "medidas">("area");
  const [loteamentoLarguraQuadra, setLoteamentoLarguraQuadra] = useState("80");
  const [loteamentoDistanciaQuadra, setLoteamentoDistanciaQuadra] = useState("50");
  const [loteamentoOrientacao, setLoteamentoOrientacao] = useState("");
  const [loteamentoPrefixo, setLoteamentoPrefixo] = useState("Quadra");
  const [loteamentoViasExistentes, setLoteamentoViasExistentes] = useState(false);
  const [loteamentoEixoIds, setLoteamentoEixoIds] = useState<string[]>([]);
  const [loteamentoLados, setLoteamentoLados] = useState<number[]>([]);
  const [loteamentoPickLado, setLoteamentoPickLado] = useState(false);
  const [loteamentoAlterarEixo, setLoteamentoAlterarEixo] = useState<
    | null
    | { phase: "a" }
    | {
        phase: "b";
        eixoId: string;
        pointA: CadVertex;
        stationA: number;
        pointB?: CadVertex;
        stationB?: number;
        dragging?: boolean;
      }
  >(null);
  const [loteamentoAlterarEixoPreview, setLoteamentoAlterarEixoPreview] = useState<CadVertex | null>(null);
  const loteamentoAlterarEixoRef = useRef(loteamentoAlterarEixo);
  loteamentoAlterarEixoRef.current = loteamentoAlterarEixo;
  const alterarEixoIgnoreUpRef = useRef(false);
  const [loteamentoNotice, setLoteamentoNotice] = useState<string | null>(null);
  const [loteamentoError, setLoteamentoError] = useState<string | null>(null);
  const [loteamentoBusy, setLoteamentoBusy] = useState(false);
  const [ajusteTestada, setAjusteTestada] = useState("");
  const [ajusteProfundidade, setAjusteProfundidade] = useState("");
  const [ajusteArea, setAjusteArea] = useState("");
  const [drenagemC, setDrenagemC] = useState("0.70");
  const [drenagemIntensity, setDrenagemIntensity] = useState("150");
  const [drenagemTr, setDrenagemTr] = useState("10");
  const [drenagemSpacing, setDrenagemSpacing] = useState("60");
  const [drenagemAutoInlets, setDrenagemAutoInlets] = useState(true);
  const [drenagemInletSpacing, setDrenagemInletSpacing] = useState("25");
  const [drenagemInletAtIntersections, setDrenagemInletAtIntersections] = useState(true);
  const [drenagemConnectInlets, setDrenagemConnectInlets] = useState(true);
  const [drenagemMinSlope, setDrenagemMinSlope] = useState("0.5");
  const [drenagemMaterial, setDrenagemMaterial] = useState("Concreto");
  const [drenagemImperv, setDrenagemImperv] = useState("");
  const [drenagemIdfK, setDrenagemIdfK] = useState("");
  const [drenagemIdfA, setDrenagemIdfA] = useState("");
  const [drenagemIdfB, setDrenagemIdfB] = useState("");
  const [drenagemIdfC, setDrenagemIdfC] = useState("");
  const [drenagemPick, setDrenagemPick] = useState<null | "pv" | "inlet" | "pipe" | "outfall">(null);
  const [drenagemPipeFromId, setDrenagemPipeFromId] = useState<string | null>(null);
  const [drenagemNotice, setDrenagemNotice] = useState<string | null>(null);
  const [drenagemError, setDrenagemError] = useState<string | null>(null);
  const [drenagemBusy, setDrenagemBusy] = useState(false);
  const [drenagemPlanilhaOpen, setDrenagemPlanilhaOpen] = useState(false);
  const [pvDrag, setPvDrag] = useState<{
    id: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [maqueteOpen, setMaqueteOpen] = useState(false);
  const [drenagem3dOpen, setDrenagem3dOpen] = useState(false);
  const [loteamentoAreaUtil, setLoteamentoAreaUtil] = useState("15");
  const [reservaPercent, setReservaPercent] = useState("20");
  const [reservaCanto, setReservaCanto] = useState<ReservaCanto>("superior_direita");
  const [areaUtilCanto, setAreaUtilCanto] = useState<ReservaCanto>("superior_direita");
  const [appWidth, setAppWidth] = useState("30");
  const [appSide, setAppSide] = useState<AppBufferSide>("both");
  const [appPickMode, setAppPickMode] = useState(false);
  const [appApplyAfterPick, setAppApplyAfterPick] = useState(false);
  const [entityMove, setEntityMove] = useState<{
    id: string;
    originX: number;
    originY: number;
    vertices: CadVertex[];
    labels: Array<{ id: string; x: number; y: number }>;
    hostVertices?: CadVertex[];
  } | null>(null);
  const [streetProfiles, setStreetProfiles] = useState<StreetProfileDraft[]>([]);
  const [streetProfileId, setStreetProfileId] = useState("");
  const [secaoPista, setSecaoPista] = useState("8");
  const [secaoCalcada, setSecaoCalcada] = useState("2");
  const [secaoMeioFio, setSecaoMeioFio] = useState("0.15");
  const [secaoDeclive, setSecaoDeclive] = useState("2");
  const [secaoDecliveCalcada, setSecaoDecliveCalcada] = useState("2");
  const [secaoTaludeCorte, setSecaoTaludeCorte] = useState("1.5");
  const [secaoTaludeAterro, setSecaoTaludeAterro] = useState("2");
  const [secaoExtensaoTalude, setSecaoExtensaoTalude] = useState("4");
  const [secaoIntervalo, setSecaoIntervalo] = useState("20");
  const [printSheetContent, setPrintSheetContent] = useState<PrintSheetContent>("planta");
  const [secaoTipoApplied, setSecaoTipoApplied] = useState(false);
  const secaoViewRef = useRef<HTMLDivElement>(null);
  const [cityQuery, setCityQuery] = useState("");
  const [cityHits, setCityHits] = useState<Array<{ lat: number; lng: number; label: string }>>([]);
  const [cityBusy, setCityBusy] = useState(false);
  const [cityNotice, setCityNotice] = useState<string | null>(null);
  const [volDesignMode, setVolDesignMode] = useState<VolDesignMode>("flat");
  const [volPlateauZ, setVolPlateauZ] = useState("");
  const [volStrike, setVolStrike] = useState("90");
  const [volDip, setVolDip] = useState("2");
  const [volZStart, setVolZStart] = useState("");
  const [volZEnd, setVolZEnd] = useState("");
  const [volDesignLayerId, setVolDesignLayerId] = useState("");
  const [volClipToPolygon, setVolClipToPolygon] = useState(true);
  const [volGridStep, setVolGridStep] = useState("10");
  const [volResult, setVolResult] = useState<EarthworkVolumeResult | null>(null);
  const [volStakeout, setVolStakeout] = useState<StakeoutRow[] | null>(null);
  const [volNotice, setVolNotice] = useState<string | null>(null);
  const [volError, setVolError] = useState<string | null>(null);
  const [volBusy, setVolBusy] = useState(false);
  const [streetInterval, setStreetInterval] = useState("20");
  const [streetHalfWidth, setStreetHalfWidth] = useState("10");
  const [streetZStart, setStreetZStart] = useState("");
  const [streetZEnd, setStreetZEnd] = useState("");
  const [streetNotes, setStreetNotes] = useState<StreetEarthworkResult | null>(null);
  const [sectionInterval, setSectionInterval] = useState("20");
  const [sectionHalfWidth, setSectionHalfWidth] = useState("10");
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const [savedProjects, setSavedProjects] = useState<SavedCadProjectRecord[]>([]);
  const [openProjectsPanel, setOpenProjectsPanel] = useState(false);
  const [projectNotice, setProjectNotice] = useState<string | null>(null);
  const [projectNoticeError, setProjectNoticeError] = useState(false);
  const [savingLocal, setSavingLocal] = useState(false);
  const [savingCloud, setSavingCloud] = useState(false);
  const skipDraftSaveRef = useRef(false);
  const cadHydratedRef = useRef(false);
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
  const [alignmentPickMode, setAlignmentPickMode] = useState(false);
  const [toolsTab, setToolsTab] = useState<CadToolsTab>("draw");
  const [toolsSidebarOpen, setToolsSidebarOpen] = useState(true);
  const [drawingChartsOpen, setDrawingChartsOpen] = useState(false);
  const [isCadFullscreen, setIsCadFullscreen] = useState(false);
  const [profilePickResult, setProfilePickResult] = useState<string | null>(null);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);
  const [vertexDragIndex, setVertexDragIndex] = useState<number | null>(null);
  const eixoEditActiveRef = useRef(false);
  const loteamentoRebuildInFlightRef = useRef(false);
  const loteamentoRebuildTimerRef = useRef<number | null>(null);
  const cursorRafRef = useRef<number | null>(null);
  const pendingCursorRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const projectLiveRef = useRef(project);
  projectLiveRef.current = project;
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
        if (isTerrainProfileLayer(e.layerId) || isStreetProfileChartLayer(e.layerId)) return false;
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

  const visibleCadLayers = useMemo(
    () => normalizeCadLayers(project.layers),
    [project.layers],
  );

  const layerMap = useMemo(
    () => new Map(visibleCadLayers.map((l) => [l.id, l])),
    [visibleCadLayers],
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

  const allRasters = useMemo(
    () => rastersWithLayerVisibility(rasters, project.layers),
    [rasters, project.layers],
  );

  const displayRasters = useMemo(
    () => allRasters.filter((r) => r.kind !== "orthophoto"),
    [allRasters],
  );

  const canvasRasters = useMemo(
    () => [
      ...allRasters.filter((r) => r.kind === "orthophoto"),
      ...allRasters.filter((r) => r.kind !== "orthophoto"),
    ],
    [allRasters],
  );

  const bounds = viewBounds ?? computeViewportBoundsSafe(visibleEntities);

  const viewport = useMemo(
    () => ({ ...bounds, width, height, padding }),
    [bounds, width, height, padding],
  );

  const basemapViewport = useMemo(() => {
    if (!panning) return viewport;
    return { ...panning.bounds, width, height, padding };
  }, [panning, viewport, width, height, padding]);

  const basemapPanStyle = useMemo(() => {
    if (!panning) return undefined;
    const spanX = panning.bounds.maxX - panning.bounds.minX;
    const spanY = panning.bounds.maxY - panning.bounds.minY;
    const innerW = width - padding * 2;
    const innerH = height - padding * 2;
    const dx = spanX > 1e-9 ? ((panning.bounds.minX - bounds.minX) / spanX) * innerW : 0;
    const dy = spanY > 1e-9 ? ((bounds.minY - panning.bounds.minY) / spanY) * innerH : 0;
    return {
      transform: `translate(${(dx / width) * 100}%, ${(dy / height) * 100}%)`,
      willChange: "transform" as const,
    };
  }, [panning, bounds.minX, bounds.minY, width, height, padding]);

  const hasBasemap =
    basemapOverlays.satellite ||
    anyAnmSigmineOverlay(basemapOverlays.anmSigmine) ||
    anySigefOverlay(basemapOverlays.sigef);
  const hasUnderlay = hasBasemap || canvasRasters.some((r) => r.visible);

  const projectGeoref = useMemo(
    () => detectCadGeorefFromProject(project, bounds),
    [project, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY],
  );

  const zoneDetection = useMemo(
    () => detectUtmZoneFromCoordinates(project.entities, bounds, project.crs),
    [project.entities, project.crs, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY],
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

  useEffect(
    () =>
      runQueuedInEffect(() => {
        const uf = normalizeSigefUf(memorialForm.state);
        setBasemapOverlays((prev) =>
          prev.sigef.uf === uf ? prev : { ...prev, sigef: { ...prev.sigef, uf } },
        );
      }),
    [memorialForm.state],
  );

  const handleImportOverlay = useCallback(
    async (source: OverlayImportSource, layer?: AnmSigmineLayerKey | SigefLayerKey) => {
      const importKey =
        source === "anm" && layer
          ? `anm:${layer}`
          : source === "sigef" && layer
            ? `sigef:${layer}`
            : source;
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
        if (source === "anm" && layer) {
          params.set("anmLayer", layer);
        }
        if (source === "sigef" && layer) {
          params.set("sigefLayer", layer);
          params.set("uf", basemapOverlays.sigef.uf);
        }
        const res = await fetch(`/api/cad-map/import?${params.toString()}`);
        const data = (await res.json()) as {
          error?: string;
          entities?: CadEntity[];
          features?: number;
          anmLayer?: AnmSigmineLayerKey;
          sigefLayer?: SigefLayerKey;
        };
        if (!res.ok || !data.entities?.length) {
          setOverlayNotice(data.error ?? t("basemap.importEmpty"));
          return;
        }
        setProject((prev) => {
          if (source === "anm" && data.anmLayer) {
            const merged = mergeAnmLayerImport(
              prev.layers,
              prev.entities,
              data.anmLayer,
              data.entities!,
            );
            return { ...prev, layers: merged.layers, entities: merged.entities };
          }
          if (source === "sigef" && data.sigefLayer) {
            const merged = mergeSigefLayerImport(
              prev.layers,
              prev.entities,
              data.sigefLayer,
              data.entities!,
            );
            return { ...prev, layers: merged.layers, entities: merged.entities };
          }
          return prev;
        });
        const sourceLabel =
          data.sigefLayer
            ? t(`basemap.sigefLayers.${data.sigefLayer}`)
            : data.anmLayer
              ? t(`basemap.anmLayers.${data.anmLayer}`)
              : t("basemap.anm");
        setOverlayNotice(t("basemap.importDone", { count: data.entities.length, source: sourceLabel }));
      } catch {
        setOverlayNotice(t("basemap.importError"));
      } finally {
        setImportingOverlay(null);
      }
    },
    [bounds, visibleEntities, projectGeoref, project.crs, t, basemapOverlays.sigef.uf],
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

  function patchSigefOverlay(key: SigefLayerKey, value: boolean) {
    if (value && !projectGeoref.isGeoreferenced) {
      setOverlayNotice(t("basemap.needGeoref"));
      return;
    }
    setBasemapOverlays((prev) => ({
      ...prev,
      sigef: { ...prev.sigef, [key]: value },
    }));
  }

  function patchSigefUf(uf: string) {
    const next = normalizeSigefUf(uf);
    setBasemapOverlays((prev) => ({ ...prev, sigef: { ...prev.sigef, uf: next } }));
    setMemorialForm((prev) => (prev.state === next ? prev : { ...prev, state: next }));
  }

  function clearAnmLayerImport(anmLayer: AnmSigmineLayerKey) {
    setProject((prev) => {
      const { layers, entities, removed } = removeAnmLayerImport(
        prev.layers,
        prev.entities,
        anmLayer,
      );
      if (removed === 0) return prev;
      setOverlayNotice(
        t("basemap.clearAnmLayerDone", {
          count: removed,
          layer: t(`basemap.anmLayers.${anmLayer}`),
        }),
      );
      return { ...prev, layers, entities };
    });
  }

  function clearAllAnmImports() {
    setProject((prev) => {
      const { layers, entities, removed } = removeAllAnmImports(prev.layers, prev.entities);
      if (removed === 0) return prev;
      setOverlayNotice(t("basemap.clearAnmAllDone", { count: removed }));
      return { ...prev, layers, entities };
    });
  }

  function clearSigefLayerImport(sigefLayer: SigefLayerKey) {
    setProject((prev) => {
      const { layers, entities, removed } = removeSigefLayerImport(
        prev.layers,
        prev.entities,
        sigefLayer,
      );
      if (removed === 0) return prev;
      setOverlayNotice(
        t("basemap.clearSigefLayerDone", {
          count: removed,
          layer: t(`basemap.sigefLayers.${sigefLayer}`),
        }),
      );
      return { ...prev, layers, entities };
    });
  }

  function clearAllSigefImports() {
    setProject((prev) => {
      const { layers, entities, removed } = removeAllSigefImports(prev.layers, prev.entities);
      if (removed === 0) return prev;
      setOverlayNotice(t("basemap.clearSigefAllDone", { count: removed }));
      return { ...prev, layers, entities };
    });
  }

  function exportSigefOds() {
    const entity = project.entities.find((e) => e.id === selectedId);
    if (entity?.type !== "polyline" || !entity.closed || entity.vertices.length < 3) {
      setOverlayNotice(t("basemap.sigefNeedPolygon"));
      return;
    }
    if (!projectGeoref.isGeoreferenced) {
      setOverlayNotice(t("basemap.needGeoref"));
      return;
    }
    const blob = buildSigefOdsBlob(project, entity, memorialForm, {
      cns: sigefCns,
      codigoImovel: sigefCodigoImovel,
    });
    downloadOdsBlob(blob, sigefOdsFilename(project, entity));
    setOverlayNotice(t("basemap.sigefExportDone"));
  }

  const reurbLotCount = listReurbLots(project).length;

  async function handleImportReurbOrtho(file: File) {
    setImportingOrtho(true);
    setReurbNotice(null);
    try {
      const name = file.name.toLowerCase();
      let raster;
      if (name.endsWith(".ecw")) {
        raster = await parseEcwViaApi(file, projectGeoref);
      } else if (/\.(tif|tiff)$/i.test(name)) {
        const buffer = await file.arrayBuffer();
        raster = await parseGeoTiffBuffer(buffer, file.name, projectGeoref);
      } else if (/\.(jpe?g|png)$/i.test(name)) {
        raster = await parseImageFileToRasterOverlay(file, bounds);
      } else {
        setReurbNotice(t("import.orthoFormat"));
        return;
      }
      setProject((prev) => ensureRasterLayerInProject(prev, "orthophoto"));
      setRasters((prev) => [...prev.filter((r) => r.kind !== "orthophoto"), raster]);
      setViewBounds({
        minX: raster.minX,
        maxX: raster.maxX,
        minY: raster.minY,
        maxY: raster.maxY,
      });
      setImported(true);
      setSnapToRtkPoints(false);
      setReurbNotice(t("import.orthoOk", { name: raster.name }));
    } catch (err) {
      setReurbNotice(err instanceof Error ? err.message : t("import.error"));
    } finally {
      setImportingOrtho(false);
    }
  }

  function applyReurbLabels() {
    const result = applyReurbLotLabels(project, {
      includeCotas: true,
      includeArea: reurbIncludeArea,
    });
    if (result.lotCount === 0) {
      setReurbNotice(t("reurb.lotesEmpty"));
      return;
    }
    setProject(result.project);
    setReurbNotice(t("reurb.lotesDone", { count: result.lotCount }));
  }

  function exportReurbTabular() {
    const lots = listReurbLots(project);
    if (lots.length === 0) {
      setReurbNotice(t("reurb.memorialsTabularEmpty"));
      return;
    }
    const blob = buildReurbTabularMemorialBlob(project, memorialForm);
    downloadOdsBlob(blob, reurbTabularFilename(project));
    setReurbNotice(t("reurb.memorialsTabularDone", { count: lots.length }));
  }

  async function generateReurbPlantas(projectSnapshot?: CadProject) {
    const source = projectSnapshot ?? project;
    const lots = listReurbLots(source);
    if (lots.length === 0) {
      setReurbNotice(t("reurb.plantasEmpty"));
      return;
    }
    setReurbBusy("plantas");
    setReurbNotice(t("reurb.plantasProgress", { current: 0, total: lots.length }));
    const files: Record<string, Uint8Array> = {};
    const warnings: string[] = [];
    try {
      for (let i = 0; i < lots.length; i++) {
        const lot = lots[i];
        const slug = reurbLotSlug(i);
        setReurbNotice(t("reurb.plantasProgress", { current: i + 1, total: lots.length }));
        try {
          files[`${slug}.pdf`] = buildReurbLotPdfBytes(source, lot, i, memorialForm);
        } catch (err) {
          warnings.push(`${slug}.pdf: ${err instanceof Error ? err.message : "falha"}`);
        }
        const clone = cloneProjectForLot(source, lot, i);
        if (clone.entities.length > 0) {
          try {
            const res = await fetch("/api/cad/export", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ project: clone, format: "dwg" }),
            });
            if (!res.ok) {
              const data = (await res.json().catch(() => null)) as { error?: string } | null;
              throw new Error(data?.error || t("export.error"));
            }
            files[`${slug}.dwg`] = new Uint8Array(await res.arrayBuffer());
          } catch (err) {
            warnings.push(`${slug}.dwg: ${err instanceof Error ? err.message : "falha"}`);
          }
        }
      }
      if (Object.keys(files).length === 0) {
        setReurbNotice(t("export.error"));
        return;
      }
      const zip = zipReurbPlantas(files);
      downloadBlob(new Blob([new Uint8Array(zip)], { type: "application/zip" }), reurbPlantasZipFilename(source));
      setReurbNotice(
        warnings.length
          ? t("reurb.plantasPartial", { detail: warnings.slice(0, 3).join("; ") })
          : t("reurb.plantasDone", { count: lots.length }),
      );
    } catch (err) {
      setReurbNotice(err instanceof Error ? err.message : t("export.error"));
    } finally {
      setReurbBusy(null);
    }
  }

  const totalAnmImported = useMemo(
    () => countAllAnmEntities(project.entities),
    [project.entities],
  );

  const totalSigefImported = useMemo(
    () => countAllSigefEntities(project.entities),
    [project.entities],
  );

  const grid = useMemo(() => gridDataForViewport(viewport), [viewport]);

  const elevationSamples = useMemo(
    () => extractSurveyElevationPoints(project.entities),
    [project.entities],
  );

  const importedContourTerrain = useMemo(
    () =>
      extractImportedContourTerrain(project, {
        selectedId,
        assignedZ: interpAssignZ.trim() ? parseMeters(interpAssignZ) : null,
        usePointElevations: interpUsePoints,
      }),
    [project, selectedId, interpAssignZ, interpUsePoints],
  );

  const volDesignLayers = useMemo(() => listElevationPointLayers(project), [project]);

  const loteamentoGlebas = useMemo(() => {
    const locked = new Set(project.layers.filter((layer) => layer.locked).map((layer) => layer.id));
    return listClosedPolygons(project.entities).filter((poly) => {
      if (poly.vertices.length < 3) return false;
      if (
        poly.layerId === "loteamento_vias" ||
        poly.layerId === "loteamento_lotes" ||
        poly.layerId === "loteamento_calcadas" ||
        poly.layerId === "loteamento_eixos" ||
        poly.layerId === AREA_RESERVA_LEGAL_LAYER_ID ||
        poly.layerId === AREA_APP_LAYER_ID ||
        poly.layerId === AREA_UTIL_LAYER_ID ||
        poly.layerId === "area_institucional"
      ) {
        return false;
      }
      if (locked.has(poly.layerId)) return false;
      return true;
    });
  }, [project.entities, project.layers]);

  const loteamentoEixosCandidatos = useMemo(() => {
    const glebaIds = new Set(loteamentoGlebas.map((poly) => poly.id));
    const locked = new Set(project.layers.filter((layer) => layer.locked).map((layer) => layer.id));
    return project.entities.filter((entity): entity is CadPolylineEntity => {
      if (entity.type !== "polyline") return false;
      if (entity.vertices.length < 2) return false;
      if (glebaIds.has(entity.id)) return false;
      if (entity.layerId.startsWith("loteamento_")) return false;
      if (entity.layerId === AREA_APP_LAYER_ID) return false;
      if (entity.layerId === AREA_UTIL_LAYER_ID) return false;
      if (locked.has(entity.layerId)) return false;
      return true;
    });
  }, [project.entities, project.layers, loteamentoGlebas]);

  const areaUtilBreakdown = useMemo(() => {
    const glebaId = loteamentoGlebaId.trim() || selectedId;
    const gleba = glebaId
      ? project.entities.find((entity) => entity.id === glebaId)
      : null;
    if (!gleba || gleba.type !== "polyline" || !gleba.closed || gleba.vertices.length < 3) return null;
    const raw = loteamentoAreaUtil.trim();
    const pct = raw === "" ? 15 : parseDrawNumber(raw);
    if (pct === null || pct < 0 || pct >= 100) return null;
    return computeLoteamentoAreaUtilBreakdown(project, gleba.vertices, pct);
  }, [project, loteamentoGlebaId, selectedId, loteamentoAreaUtil]);

  const maqueteReady = useMemo(() => loteamentoMaqueteReadiness(project), [project]);
  const drenagem3dReady = useMemo(() => drainageNetwork3dReadiness(project), [project]);

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

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (!selectedId) return;
        if (loteamentoGlebas.some((poly) => poly.id === selectedId)) {
          setLoteamentoGlebaId(selectedId);
        }
      }),
    [selectedId, loteamentoGlebas],
  );

  const ajusteTarget = useMemo(
    () => loteamentoSizeTarget(project, selectedId),
    [project, selectedId],
  );

  const hasLoteamentoLots = useMemo(
    () => project.entities.some(isLoteamentoLotEntity),
    [project.entities],
  );

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (!ajusteTarget) return;
        const fmt = (n: number) => {
          if (!Number.isFinite(n) || n <= 0) return "";
          return Math.abs(n - Math.round(n)) < 0.02 ? String(Math.round(n)) : n.toFixed(2);
        };
        setAjusteTestada(fmt(ajusteTarget.testadaM));
        setAjusteProfundidade(fmt(ajusteTarget.profundidadeM));
        setAjusteArea(ajusteTarget.kind === "lote" ? fmt(ajusteTarget.areaM2) : "");
      }),
    [ajusteTarget],
  );

  useEffect(() => {
    if (!polygonEditNotice) return;
    const timer = window.setTimeout(() => setPolygonEditNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [polygonEditNotice]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/cad-map/elevation-grid?test=1")
      .then(async (r) => {
        const data = (await r.json()) as {
          googleConfigured?: boolean;
          googleTest?: { ok?: boolean; message?: string; elevationM?: number | null };
        };
        if (cancelled) return;
        const configured = Boolean(data.googleConfigured);
        const tested = Boolean(data.googleTest?.ok);
        setGoogleElevationAvailable(configured && tested);
        setGoogleTestElevationM(
          tested && data.googleTest?.elevationM != null ? data.googleTest.elevationM : null,
        );
        if (!configured) {
          setGoogleElevationNotice("missing_key");
          return;
        }
        if (tested) {
          setGoogleElevationNotice("ready");
          return;
        }
        setGoogleElevationNotice(data.googleTest?.message ?? "test_failed");
      })
      .catch(() => {
        if (!cancelled) {
          setGoogleElevationAvailable(false);
          setGoogleTestElevationM(null);
          setGoogleElevationNotice("fetch_failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => runQueuedInEffect(() => setSelectedVertexIndex(null)),
    [selectedId, tool],
  );

  useEffect(
    () => runQueuedInEffect(() => setSelectedSegmentIndex(null)),
    [selectedId],
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
    if (
      entity.layerId === CONTOUR_LAYER.id ||
      entity.layerId === INTERPOLATED_CONTOUR_LAYER.id ||
      entity.layerId === TIN_LAYER.id
    ) {
      return false;
    }
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

  function setPolylineConfrontation(index: number, value: string) {
    patchSelectedPolyline((poly) => {
      const n = poly.closed ? poly.vertices.length : Math.max(poly.vertices.length - 1, 0);
      const confrontations = normalizeConfrontations(n, poly.confrontations);
      if (index < 0 || index >= confrontations.length) return poly;
      confrontations[index] = value;
      return { ...poly, confrontations };
    });
  }

  function updatePolylineVertex(polyId: string, index: number, vertex: CadVertex) {
    setProject((prev) => {
      const next = {
        ...prev,
        entities: prev.entities.map((e) => {
          if (e.id !== polyId || e.type !== "polyline") return e;
          const vertices = e.vertices.map((v, i) => (i === index ? vertex : v));
          return { ...e, vertices };
        }),
      };
      projectLiveRef.current = next;
      return next;
    });
  }

  function insertPolylineVertex(polyId: string, afterIndex: number, vertex: CadVertex) {
    setProject((prev) => {
      const next = {
        ...prev,
        entities: prev.entities.map((e) => {
          if (e.id !== polyId || e.type !== "polyline") return e;
          const vertices = [...e.vertices];
          vertices.splice(afterIndex + 1, 0, vertex);
          const confrontations = e.closed
            ? insertConfrontationAt(e.confrontations, afterIndex, vertices.length)
            : e.confrontations;
          return { ...e, vertices, confrontations };
        }),
      };
      projectLiveRef.current = next;
      return next;
    });
    setSelectedSegmentIndex((prev) => {
      if (prev === null) return prev;
      return prev > afterIndex ? prev + 1 : prev;
    });
  }

  function rebuildIfEditedEixo(entity: CadEntity | undefined) {
    if (!loteamentoAjusteEixo || !entity || !isLoteamentoEixoPolyline(entity)) return;
    if (loteamentoRebuildTimerRef.current != null) {
      window.clearTimeout(loteamentoRebuildTimerRef.current);
    }
    loteamentoRebuildTimerRef.current = window.setTimeout(() => {
      loteamentoRebuildTimerRef.current = null;
      applyEditedEixosToLoteamento(projectLiveRef.current);
    }, 50);
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
    const removedIndex = selectedVertexIndex;
    patchSelectedPolyline((poly) => ({
      ...poly,
      vertices: poly.vertices.filter((_, i) => i !== removedIndex),
      confrontations: poly.closed
        ? removeConfrontationAt(poly.confrontations, removedIndex, poly.vertices.length)
        : poly.confrontations,
    }));
    setSelectedVertexIndex(null);
    setSelectedSegmentIndex((prev) => {
      if (prev === null) return prev;
      if (prev === removedIndex) return null;
      return prev > removedIndex ? prev - 1 : prev;
    });
    setPolygonEditNotice(t("polygon.edit.vertexRemoved"));
    rebuildIfEditedEixo(entity);
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
    rebuildIfEditedEixo(entity);
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
    let cancelled = false;
    skipDraftSaveRef.current = true;
    cadHydratedRef.current = false;

    async function bootstrapProject() {
      const payload = loadCadImportPayload();
      if (payload) {
        const built = buildCadProjectFromPayload(payload);
        clearCadImportPayload();
        clearCadDraft(userId);
        if (cancelled) return;
        setProject(built);
        setRasters([]);
        setSavedProjectId(null);
        setViewBounds(computeViewportBoundsSafe(built.entities));
        setImported(built.entities.length > 0);
        if (built.entities.length > 0) {
          setImportNotice(t("import.rtkOk", { count: built.entities.length, name: built.name }));
        }
        await refreshSavedProjects();
        if (cancelled) return;
        cadHydratedRef.current = true;
        skipDraftSaveRef.current = false;
        return;
      }

      const draft = await loadCadDraft(userId);
      if (draft?.project) {
        if (cancelled) return;
        setProject(draft.project);
        setRasters(draft.rasters ?? []);
        setSavedProjectId(draft.savedId);
        setViewBounds(computeViewportBoundsSafe(draft.project.entities));
        setImported(true);
        await refreshSavedProjects();
        if (cancelled) return;
        cadHydratedRef.current = true;
        skipDraftSaveRef.current = false;
        return;
      }

      const lastId = getLastOpenedCadProjectId(userId);
      if (lastId) {
        try {
          const saved = await loadCadProject(lastId);
          if (cancelled) return;
          if (saved) {
            const snap = snapshotFromSavedRecord(saved);
            setProject(snap.project);
            setRasters(snap.rasters);
            setSavedProjectId(saved.id);
            setViewBounds(computeViewportBoundsSafe(snap.project.entities));
            setImported(true);
            await refreshSavedProjects();
            if (cancelled) return;
            cadHydratedRef.current = true;
            skipDraftSaveRef.current = false;
            return;
          }
        } catch {
          if (!cancelled) clearLastOpenedCadProjectId(userId);
        }
      }

      if (cancelled) return;
      setImported(false);
      await refreshSavedProjects();
      if (cancelled) return;
      cadHydratedRef.current = true;
      skipDraftSaveRef.current = false;
    }

    void bootstrapProject();
    return () => {
      cancelled = true;
      skipDraftSaveRef.current = true;
    };
  }, [refreshSavedProjects, userId]);

  useEffect(() => {
    if (skipDraftSaveRef.current || !cadHydratedRef.current) return;
    const timer = window.setTimeout(() => {
      saveCadDraft(userId, project, savedProjectId, rasters);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [project, rasters, savedProjectId, userId]);

  useEffect(() => {
    if (!projectNotice) return;
    const timer = window.setTimeout(() => setProjectNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [projectNotice]);

  useEffect(() => {
    return () => {
      if (cursorRafRef.current != null) window.cancelAnimationFrame(cursorRafRef.current);
      if (loteamentoRebuildTimerRef.current != null) window.clearTimeout(loteamentoRebuildTimerRef.current);
    };
  }, []);

  const resetWorkspaceModes = useCallback(() => {
    setAreaPickMode(false);
    setAreaPickResult(null);
    setDistancePickMode(false);
    setDistancePickIds([]);
    setDistancePickResult(null);
    setProfilePickMode(false);
    setProfilePickIds([]);
    setProfilePickResult(null);
    setAlignmentPickMode(false);
    setAppPickMode(false);
    setAppApplyAfterPick(false);
    setLoteamentoPickLado(false);
    setLoteamentoAlterarEixo(null);
    setLoteamentoAlterarEixoPreview(null);
    setDrenagemPick(null);
    setDrenagemPipeFromId(null);
    setPvDrag(null);
    setEntityMove(null);
    setSelectedVertexIndex(null);
    setSelectedSegmentIndex(null);
    setVertexDragIndex(null);
    setPolygonEditNotice(null);
    setTool("select");
    setDraft([]);
    setDrawHint(null);
    setKeyboardDistance("");
    setExportError(null);
  }, []);

  const applyCadFullscreenState = useCallback((on: boolean) => {
    isCadFullscreenRef.current = on;
    setIsCadFullscreen(on);
    setCadFullscreenClass(on);
  }, []);

  const exitCadFullscreen = useCallback(async () => {
    applyCadFullscreenState(false);
    try {
      await exitDocumentFullscreen();
    } catch {
      /* CSS fallback already applied */
    }
  }, [applyCadFullscreenState]);

  const enterCadFullscreen = useCallback(async () => {
    applyCadFullscreenState(true);
    const el = workspaceRootRef.current;
    if (!el) return;
    try {
      if (getFullscreenElement() !== el) {
        await requestElementFullscreen(el);
      }
    } catch {
      /* App chrome already hidden via html.cad-fullscreen */
    }
  }, [applyCadFullscreenState]);

  const toggleCadFullscreen = useCallback(() => {
    if (isCadFullscreenRef.current) {
      void exitCadFullscreen();
      return;
    }
    void enterCadFullscreen();
  }, [enterCadFullscreen, exitCadFullscreen]);

  useEffect(() => {
    function syncFromBrowserFullscreen() {
      const active = getFullscreenElement();
      if (active == null) {
        if (isCadFullscreenRef.current) applyCadFullscreenState(false);
        return;
      }
      if (active === workspaceRootRef.current) applyCadFullscreenState(true);
    }
    document.addEventListener("fullscreenchange", syncFromBrowserFullscreen);
    document.addEventListener("webkitfullscreenchange", syncFromBrowserFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncFromBrowserFullscreen);
      document.removeEventListener("webkitfullscreenchange", syncFromBrowserFullscreen);
      applyCadFullscreenState(false);
      void exitDocumentFullscreen();
    };
  }, [applyCadFullscreenState]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (areaPickMode || distancePickMode || profilePickMode || alignmentPickMode || appPickMode || loteamentoPickLado || loteamentoAlterarEixo || drenagemPick) {
        resetWorkspaceModes();
        return;
      }
      if (keyboardDistance || drawHint) return;
      if (isCadFullscreenRef.current && !getFullscreenElement()) {
        void exitCadFullscreen();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    areaPickMode,
    distancePickMode,
    profilePickMode,
    alignmentPickMode,
    appPickMode,
    loteamentoPickLado,
    loteamentoAlterarEixo,
    drenagemPick,
    resetWorkspaceModes,
    exitCadFullscreen,
    keyboardDistance,
    drawHint,
  ]);

  const applyCadSnapshot = useCallback(
    (opts: {
      project: CadProject;
      rasters?: CadRasterOverlay[];
      savedId: string | null;
      notice: string;
      noticeError?: boolean;
    }) => {
      skipDraftSaveRef.current = true;
      cadHydratedRef.current = true;
      clearCadImportPayload();
      setProject(opts.project);
      setRasters(opts.rasters ?? []);
      setSavedProjectId(opts.savedId);
      if (opts.savedId) setLastOpenedCadProjectId(userId, opts.savedId);
      setViewBounds(computeViewportBoundsSafe(opts.project.entities));
      setImported(true);
      setSelectedId(null);
      setBasemapOverlays(cloneDefaultBasemapOverlays());
      resetWorkspaceModes();
      setOpenProjectsPanel(false);
      setActiveTab("desenho");
      setProjectNoticeError(Boolean(opts.noticeError));
      setProjectNotice(opts.notice);
      saveCadDraft(userId, opts.project, opts.savedId, opts.rasters ?? []);
      window.setTimeout(() => {
        skipDraftSaveRef.current = false;
      }, 200);
    },
    [resetWorkspaceModes, userId],
  );

  const handleSaveLocal = useCallback(async () => {
    setSavingLocal(true);
    setProjectNoticeError(false);
    const filename = cadProjectFileBasename(project.name);
    try {
      const json = serializeCadProjectFile({ project, rasters });
      downloadBlob(new Blob([json], { type: "application/json;charset=utf-8" }), filename);
      saveCadDraft(userId, project, savedProjectId, rasters);
      setProjectNotice(
        rasters.length > 0
          ? t("project.savedFileWithRasters", { filename, count: rasters.length })
          : t("project.savedFile", { filename }),
      );
    } catch {
      setProjectNoticeError(true);
      setProjectNotice(t("project.saveFailed"));
    } finally {
      setSavingLocal(false);
    }
  }, [project, rasters, savedProjectId, t, userId]);

  const handleSaveCloudDwg = useCallback(async () => {
    setSavingCloud(true);
    setProjectNoticeError(false);
    try {
      const record = await saveCadDwgToCloud(project.name, project, savedProjectId);
      setSavedProjectId(record.id);
      setLastOpenedCadProjectId(userId, record.id);
      saveCadDraft(userId, project, record.id, rasters);
      await refreshSavedProjects();
      const extra = rasters.length > 0 ? ` ${t("project.savedCloudHint")}` : "";
      setProjectNotice(`${t("project.savedCloud")}${extra}`);
    } catch (err) {
      saveCadDraft(userId, project, savedProjectId, rasters);
      const error = err instanceof Error ? err.message : t("project.saveFailed");
      setProjectNoticeError(true);
      setProjectNotice(t("project.saveCloudFailed", { error }));
    } finally {
      setSavingCloud(false);
    }
  }, [project, rasters, savedProjectId, refreshSavedProjects, t, userId]);

  const handleDownloadCloudDwg = useCallback(
    async (id: string) => {
      try {
        const { blob, filename } = await downloadCadProjectDwg(id);
        downloadBlob(blob, filename);
      } catch {
        setProjectNoticeError(true);
        setProjectNotice(t("project.downloadDwgFailed"));
      }
    },
    [t],
  );

  const handleOpenProject = useCallback(
    async (id: string) => {
      try {
        const record = await loadCadProject(id);
        if (!record) {
          setProjectNoticeError(true);
          setProjectNotice(t("project.openFailed"));
          return;
        }
        const snap = snapshotFromSavedRecord(record);
        applyCadSnapshot({
          project: snap.project,
          rasters: snap.rasters,
          savedId: record.id,
          notice:
            snap.rasters.some((r) => Boolean(r.imageDataUrl))
              ? t("project.opened", { name: record.name })
              : t("project.openedCloud", { name: record.name }),
        });
      } catch {
        setProjectNoticeError(true);
        setProjectNotice(t("project.openFailed"));
      }
    },
    [applyCadSnapshot, t],
  );

  const handleOpenProjectFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const snap = parseCadProjectFileText(text);
        applyCadSnapshot({
          project: snap.project,
          rasters: snap.rasters,
          savedId: null,
          notice: t("project.opened", { name: snap.project.name }),
        });
      } catch {
        setProjectNoticeError(true);
        setProjectNotice(t("project.openFileFailed"));
      }
    },
    [applyCadSnapshot, t],
  );

  const handleDeleteProject = useCallback(
    async (id: string, name: string) => {
      if (!window.confirm(t("project.confirmDelete", { name }))) return;
      try {
        await deleteCadProject(id);
        if (savedProjectId === id) setSavedProjectId(null);
        if (getLastOpenedCadProjectId(userId) === id) clearLastOpenedCadProjectId(userId);
        await refreshSavedProjects();
        setProjectNoticeError(false);
        setProjectNotice(t("project.deleted"));
      } catch {
        setProjectNoticeError(true);
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
      setBasemapOverlays(cloneDefaultBasemapOverlays());
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
      setProjectNoticeError(false);
      setProjectNotice(t("project.createdNew"));

      saveCadDraft(userId, fresh, null, []);
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
        if (keyboardDistance || drawHint) {
          setKeyboardDistance("");
          setDrawHint(null);
        }
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

  useEffect(
    () =>
      runQueuedInEffect(() => {
        const uf = normalizeSigefUf(memorialForm.state, "");
        if (!uf) return;
        setBasemapOverlays((prev) =>
          prev.sigef.uf === uf ? prev : { ...prev, sigef: { ...prev.sigef, uf } },
        );
      }),
    [memorialForm.state],
  );

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

  const CITY_VIEW_SPAN_M = 6000;

  function zoomToCityHit(hit: { lat: number; lng: number; label: string }) {
    const zone = utmZoneFromLongitude(hit.lng);
    const georef = createCadGeorefContext(zone);
    const center = latLonToVertexGeoref(hit.lat, hit.lng, 0, georef);
    const half = CITY_VIEW_SPAN_M / 2;
    const current = detectCadGeorefFromProject(project, viewBounds ?? undefined);
    if (project.entities.length === 0 || !current.isGeoreferenced) {
      setProject((prev) => ({ ...prev, crs: sirgasUtmEpsgCode(zone) }));
    }
    setViewBounds({
      minX: center.x - half,
      maxX: center.x + half,
      minY: center.y - half,
      maxY: center.y + half,
    });
    setBasemapOverlays((prev) => ({ ...prev, satellite: true }));
    setCityHits([]);
    setCityQuery(hit.label);
    setCityNotice(t("citySearch.done", { label: hit.label, zone }));
    const cityName = hit.label.split(",")[0]?.trim();
    const uf = hit.label.match(/,\s*([A-Z]{2})\s*$/i)?.[1];
    if (cityName) {
      patchMemorialForm({
        municipality: cityName,
        ...(uf ? { state: uf.toUpperCase() } : {}),
      });
    }
  }

  async function searchCityZoom() {
    const q = cityQuery.trim();
    if (q.length < 2) {
      setCityNotice(t("citySearch.empty"));
      return;
    }
    setCityBusy(true);
    setCityNotice(null);
    try {
      const { results } = await resolveBrazilCitySearch(q);
      if (results.length === 0) {
        setCityHits([]);
        setCityNotice(t("citySearch.none"));
        return;
      }
      if (results.length === 1 && results[0]) {
        zoomToCityHit(results[0]);
        return;
      }
      setCityHits(results);
    } catch {
      setCityNotice(t("citySearch.error"));
    } finally {
      setCityBusy(false);
    }
  }

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

  function addLayer(name?: string, color?: string) {
    const index = project.layers.filter((l) => l.id.startsWith("lyr_")).length + 1;
    const resolvedName = (name ?? "").trim() || `CAMADA_${index}`;
    const layer = createUserLayer(
      resolvedName,
      color ? { color, fillColor: color } : {},
    );
    setProject((prev) => ({
      ...prev,
      layers: [...prev.layers, layer],
    }));
    setActiveLayerId(layer.id);
    setPointActionNotice(t("layers.created", { name: layer.name }));
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

  function updatePoint(
    id: string,
    patch: Partial<Pick<CadPointEntity, "label" | "x" | "y" | "z" | "textColor" | "textSize">>,
  ) {
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
    const layer = project.layers.find((l) => l.id === entity.layerId);
    if (layer?.locked && !force) return;
    if (entity.type === "polyline" && !isEditablePolyline(entity) && !force) return;
    if (entity.type === "point" && entity.locked && !force) {
      const name = entity.label ?? entity.id;
      if (!window.confirm(t("point.confirmDeleteLocked", { name }))) return;
    }
    if (isDrainagePvEntity(entity)) {
      setProject(deleteDrainagePv(project, entity.id));
      setSelectedId(null);
      setPointActionNotice(t("point.deleted"));
      return;
    }
    if (isDrainagePipeEntity(entity)) {
      setProject(deleteDrainagePipe(project, entity.id));
      setSelectedId(null);
      setPointActionNotice(t("polygon.deleted"));
      return;
    }

    const target = entity as CadEntity;
    const extraIds = new Set<string>([selectedId]);
    if (target.type === "polyline" && target.closed && target.vertices.length >= 3) {
      const c = polygonCentroid(target.vertices);
      for (const other of project.entities) {
        if (other.id === target.id || other.type !== "point") continue;
        if (other.layerId !== CAD_TEXT_LAYER.id) continue;
        const label = other.label ?? "";
        const near = Math.hypot(other.x - c.x, other.y - c.y) < 12;
        if (Math.hypot(other.x - c.x, other.y - c.y) < 0.6) extraIds.add(other.id);
        if (
          near &&
          ((target.layerId === AREA_APP_LAYER_ID && label.startsWith("APP ")) ||
            (target.layerId === AREA_RESERVA_LEGAL_LAYER_ID && label.startsWith("Reserva legal")) ||
            (target.layerId === AREA_UTIL_LAYER_ID && label.startsWith("Área útil")))
        ) {
          extraIds.add(other.id);
        }
      }
    }

    setProject((prev) => ({
      ...prev,
      entities: prev.entities.filter((e) => !extraIds.has(e.id)),
    }));
    setSelectedId(null);
    setEntityMove(null);
    setPointActionNotice(target.type === "polyline" ? t("polygon.deleted") : t("point.deleted"));
  }

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (isDrawTool && (draft.length > 0 || keyboardDistance.trim())) return;
      if (!selectedId) return;
      const entity = project.entities.find((item) => item.id === selectedId);
      if (!entity) return;
      if (entity.type !== "polyline" && entity.type !== "point" && entity.type !== "line") return;
      e.preventDefault();
      deleteSelectedEntity();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, isDrawTool, draft.length, keyboardDistance, project.entities]);

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
      confrontations: closed ? normalizeConfrontations(draft.length) : undefined,
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
        e.id === selectedId && e.type === "polyline"
          ? {
              ...e,
              closed: true,
              name: closedName,
              confrontations: normalizeConfrontations(e.vertices.length, e.confrontations),
            }
          : e,
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
    if (loteamentoAlterarEixo) {
      const world = screenToWorld(sx, sy, viewport);
      if (loteamentoAlterarEixo.phase === "a") {
        const hit = snapAlterarEixoPoint(sx, sy);
        if (!hit) {
          setDrawHint(t("loteamento.alterarEixoMiss"));
          setTimeout(() => setDrawHint(t("loteamento.alterarEixoFirst")), 3000);
          return;
        }
        alterarEixoIgnoreUpRef.current = true;
        setLoteamentoAlterarEixo({
          phase: "b",
          eixoId: hit.eixoId,
          pointA: hit.point,
          stationA: hit.stationM,
        });
        setLoteamentoAlterarEixoPreview({ x: world.x, y: world.y, z: 0 });
        setSelectedId(hit.eixoId);
        setDrawHint(t("loteamento.alterarEixoSecond"));
        return;
      }
      const hit = snapAlterarEixoPoint(sx, sy, loteamentoAlterarEixo.eixoId);
      if (!hit || hit.eixoId !== loteamentoAlterarEixo.eixoId) {
        setDrawHint(t("loteamento.alterarEixoMiss"));
        setTimeout(() => setDrawHint(t("loteamento.alterarEixoSecond")), 3000);
        return;
      }
      setLoteamentoAlterarEixo({
        ...loteamentoAlterarEixo,
        pointB: hit.point,
        stationB: hit.stationM,
        dragging: true,
      });
      setLoteamentoAlterarEixoPreview(hit.point);
      return;
    }
    if (drenagemPick) {
      const wts = (x: number, y: number) => worldToScreen(x, y, viewport);
      const world = screenToWorld(sx, sy, viewport);
      if (drenagemPick === "pv") {
        try {
          const next = insertDrainagePv(project, world.x, world.y, currentDrainageParams());
          const created = listDrainagePvs(next).find(
            (pv) => !project.entities.some((e) => e.id === pv.id),
          );
          setProject(next);
          setSelectedId(created?.id ?? null);
          setDrenagemError(null);
          setDrenagemNotice(t("drenagem.pvInserted", { code: created?.drainage?.code ?? created?.label ?? "PV" }));
          setDrenagemPick(null);
          setDrawHint(null);
        } catch (err) {
          setDrenagemError(err instanceof Error ? err.message : t("commands.error"));
        }
        return;
      }
      if (drenagemPick === "inlet") {
        try {
          const params = currentDrainageParams();
          const next = insertDrainageInlet(project, world.x, world.y, params);
          const created = listDrainagePvs(next).find(
            (pv) => !project.entities.some((e) => e.id === pv.id) && pv.drainage?.kind === "inlet",
          );
          const ramal = listDrainagePipes(next).find(
            (pipe) => !project.entities.some((e) => e.id === pipe.id) && pipe.drainage?.pipeRole === "ramal",
          );
          setProject(next);
          setSelectedId(created?.id ?? ramal?.id ?? null);
          setDrenagemError(null);
          if (ramal) {
            const toId = ramal.drainage?.toPvId === created?.id ? ramal.drainage?.fromPvId : ramal.drainage?.toPvId;
            const to = listDrainagePvs(next).find((p) => p.id === toId);
            setDrenagemNotice(
              t("drenagem.inletConnected", {
                code: created?.drainage?.code ?? "BL",
                to: to?.drainage?.code ?? "PV",
                pipe: ramal.drainage?.code ?? "RM",
              }),
            );
            setDrenagemPick(null);
            setDrawHint(null);
          } else if (!params.connectInletsToMain && created) {
            setDrenagemNotice(t("drenagem.inletInserted", { code: created.drainage?.code ?? created.label ?? "BL" }));
            setDrenagemPipeFromId(created.id);
            setDrenagemPick("pipe");
            setDrawHint(t("drenagem.connectInletOn"));
          } else {
            setDrenagemNotice(t("drenagem.inletInserted", { code: created?.drainage?.code ?? created?.label ?? "BL" }));
            setDrenagemPick(null);
            setDrawHint(null);
          }
        } catch (err) {
          setDrenagemError(err instanceof Error ? err.message : t("commands.error"));
        }
        return;
      }
      const hit = hitDrainagePvAtScreen(sx, sy, project, wts);
      if (!hit) {
        setDrawHint(t("drenagem.pickPvMiss"));
        setTimeout(() => setDrawHint(null), 3000);
        return;
      }
      setSelectedId(hit.id);
      if (drenagemPick === "outfall") {
        try {
          const next = setDrainageOutfall(project, hit.id);
          setProject(next);
          const code = hit.drainage?.code ?? hit.label ?? "PV";
          setDrenagemNotice(t("drenagem.outfallSet", { code }));
          setDrenagemError(null);
          setDrenagemPick(null);
          setDrawHint(null);
        } catch (err) {
          setDrenagemError(err instanceof Error ? err.message : t("commands.error"));
        }
        return;
      }
      if (!drenagemPipeFromId) {
        setDrenagemPipeFromId(hit.id);
        setDrawHint(t("drenagem.insertPipeOn"));
        return;
      }
      try {
        const next = insertDrainagePipe(project, drenagemPipeFromId, hit.id, currentDrainageParams());
        const created = listDrainagePipes(next).find(
          (pipe) => !project.entities.some((e) => e.id === pipe.id),
        );
        setProject(next);
        setSelectedId(created?.id ?? hit.id);
        setDrenagemNotice(t("drenagem.pipeInserted", { code: created?.drainage?.code ?? "TB" }));
        setDrenagemError(null);
      } catch (err) {
        setDrenagemError(err instanceof Error ? err.message : t("commands.error"));
      }
      setDrenagemPick(null);
      setDrenagemPipeFromId(null);
      setDrawHint(null);
      return;
    }
    if (loteamentoPickLado) {
      const glebaId = loteamentoGlebaId.trim() || selectedId;
      const gleba = glebaId
        ? project.entities.find((entity) => entity.id === glebaId)
        : null;
      const wts = (x: number, y: number) => worldToScreen(x, y, viewport);
      const target =
        gleba?.type === "polyline" && gleba.closed && gleba.vertices.length >= 3
          ? gleba
          : null;
      const hitOn = (entity: CadPolylineEntity) =>
        hitTestPolylineSegmentIndex(sx, sy, entity.vertices, true, wts, 14);

      let poly = target;
      let seg = poly ? hitOn(poly) : null;
      if (seg === null) {
        for (const entity of [...visibleEntities].reverse()) {
          if (entity.type !== "polyline" || !entity.closed || entity.vertices.length < 3) continue;
          const found = hitOn(entity);
          if (found === null) continue;
          poly = entity;
          seg = found;
          break;
        }
      }
      if (!poly || seg === null) {
        setDrawHint(t("loteamento.pickLadoMiss"));
        setTimeout(() => setDrawHint(null), 3000);
        return;
      }
      setLoteamentoGlebaId(poly.id);
      setSelectedId(poly.id);
      setLoteamentoViasExistentes(true);
      setLoteamentoLados((prev) =>
        prev.includes(seg) ? prev.filter((i) => i !== seg) : [...prev, seg].sort((a, b) => a - b),
      );
      return;
    }

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
        rebuildIfEditedEixo(entity);
        return;
      }

      setSelectedVertexIndex(null);
      return;
    }

    if (tool === "confrontacao") {
      const wts = (x: number, y: number) => worldToScreen(x, y, viewport);
      const selected = project.entities.find((e) => e.id === selectedId);
      if (selected?.type === "polyline" && selected.closed && selected.vertices.length >= 3) {
        const seg = hitTestPolylineSegmentIndex(sx, sy, selected.vertices, true, wts);
        if (seg !== null) {
          setSelectedSegmentIndex(seg);
          return;
        }
      }
      for (const entity of [...visibleEntities].reverse()) {
        if (entity.type !== "polyline" || !entity.closed || entity.vertices.length < 3) continue;
        const seg = hitTestPolylineSegmentIndex(sx, sy, entity.vertices, true, wts);
        if (seg === null) continue;
        setSelectedId(entity.id);
        setSelectedSegmentIndex(seg);
        return;
      }
      setDrawHint(t("tools.confrontacaoSelectFirst"));
      setTimeout(() => setDrawHint(null), 3000);
      return;
    }

    if (alignmentPickMode) {
      const wts = (x: number, y: number) => worldToScreen(x, y, viewport);
      let hitId: string | null = null;
      for (const entity of [...visibleEntities].reverse()) {
        if (!isSelectableAlignmentEntity(entity)) continue;
        if (entity.type === "polyline") {
          if (hitTestPolyline(sx, sy, entity.vertices, Boolean(entity.closed), wts)) {
            hitId = entity.id;
            break;
          }
        }
        if (entity.type === "line") {
          if (hitTestPolyline(sx, sy, [entity.start, entity.end], false, wts)) {
            hitId = entity.id;
            break;
          }
        }
      }
      setAlignmentPickMode(false);
      if (!hitId) {
        setDrawHint(t("commands.profileOps.pickAlignmentMiss"));
        setTimeout(() => setDrawHint(null), 3000);
        return;
      }
      setSelectedId(hitId);
      setProfilePickResult(t("commands.profileOps.pickAlignmentHint"));
      return;
    }

    if (appPickMode) {
      const wts = (x: number, y: number) => worldToScreen(x, y, viewport);
      let hitId: string | null = null;
      for (const entity of [...visibleEntities].reverse()) {
        if (!isAppSourceEntity(entity)) continue;
        if (entity.type === "polyline") {
          if (hitTestPolyline(sx, sy, entity.vertices, Boolean(entity.closed), wts)) {
            hitId = entity.id;
            break;
          }
        }
        if (entity.type === "line") {
          if (hitTestPolyline(sx, sy, [entity.start, entity.end], false, wts)) {
            hitId = entity.id;
            break;
          }
        }
      }
      if (!hitId) {
        setDrawHint(t("loteamento.appNeedLine"));
        setTimeout(() => setDrawHint(null), 3000);
        return;
      }
      setSelectedId(hitId);
      setAppPickMode(false);
      setDrawHint(null);
      if (appApplyAfterPick) {
        setAppApplyAfterPick(false);
        aplicarAppBuffer(hitId);
      }
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
        if (entity.type === "line") {
          const wts = (x: number, y: number) => worldToScreen(x, y, viewport);
          if (hitTestPolyline(sx, sy, [entity.start, entity.end], false, wts)) {
            hit = entity.id;
            break;
          }
        }
      }
      const lotAtClick = findLoteamentoLotAtPoint(project, point.x, point.y);
      if (lotAtClick) {
        const hitEntity = hit ? project.entities.find((e) => e.id === hit) : null;
        if (
          !hitEntity ||
          hitEntity.layerId === REURB_ANNOTATION_LAYER.id ||
          hitEntity.layerId === LOTEAMENTO_QUADRAS_LAYER_ID ||
          isLoteamentoLotEntity(hitEntity)
        ) {
          hit = lotAtClick.id;
        }
      }
      setSelectedId(hit);
      if (hit) {
        const hitEntity = project.entities.find((e) => e.id === hit);
        focusDrainageCalc(hit, Boolean(hitEntity && isDrainagePipeEntity(hitEntity)));
      }
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
        confrontations: entity.confrontations,
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
        if (
          effect.raster.kind === "hypsometric" ||
          effect.raster.kind === "orthophoto" ||
          effect.raster.kind === "cutfill"
        ) {
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
      if (effect.type === "generate_reurb_plantas") {
        void generateReurbPlantas(effect.project);
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
      if (effect.type === "enable_satellite") {
        setBasemapOverlays((prev) => ({ ...prev, satellite: true }));
      }
      if (effect.type === "set_tool") {
        setTool(effect.tool);
      }
      if (effect.type === "start_alterar_eixo") {
        startAlterarEixoTwoPoints();
      }
    },
    [handleExportCad, t],
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

  function parseLoteamentoRebuildInput():
    | { ok: true; input: Parameters<typeof rebuildLoteamentoFromEixos>[1] }
    | { ok: false; error: string } {
    const larguraViaM = parseDrawNumber(loteamentoLarguraVia);
    const profundidadeQuadraM = parseDrawNumber(loteamentoProfundidade);
    const testadaMinimaM = parseDrawNumber(loteamentoTestada);
    const areaQuadraRaw = loteamentoAreaQuadra.trim();
    const areaMinimaQuadraM2 = areaQuadraRaw === "" ? 2000 : parseDrawNumber(areaQuadraRaw);
    const larguraQuadraM = parseDrawNumber(loteamentoLarguraQuadra);
    const distanciaQuadraM = parseDrawNumber(loteamentoDistanciaQuadra);
    const larguraCalcadaRaw = loteamentoLarguraCalcada.trim();
    const larguraCalcadaM = larguraCalcadaRaw === "" ? 0 : parseDrawNumber(larguraCalcadaRaw);
    const raioRaw = loteamentoRaioEsquina.trim();
    const raioEsquinaM = raioRaw === "" ? 0 : parseDrawNumber(raioRaw);
    const areaUtilRaw = loteamentoAreaUtil.trim();
    const percentAreaUtil = areaUtilRaw === "" ? 15 : parseDrawNumber(areaUtilRaw);
    const medidasOk =
      loteamentoQuadraModo !== "medidas" ||
      (larguraQuadraM !== null && larguraQuadraM > 0 && distanciaQuadraM !== null && distanciaQuadraM > 0);
    if (
      larguraViaM === null ||
      larguraViaM <= 0 ||
      profundidadeQuadraM === null ||
      profundidadeQuadraM <= 0 ||
      testadaMinimaM === null ||
      testadaMinimaM <= 0 ||
      areaMinimaQuadraM2 === null ||
      areaMinimaQuadraM2 < 0 ||
      larguraCalcadaM === null ||
      larguraCalcadaM < 0 ||
      raioEsquinaM === null ||
      raioEsquinaM < 0 ||
      percentAreaUtil === null ||
      percentAreaUtil < 0 ||
      percentAreaUtil >= 100 ||
      !medidasOk
    ) {
      return {
        ok: false,
        error:
          percentAreaUtil !== null && (percentAreaUtil < 0 || percentAreaUtil >= 100)
            ? t("loteamento.areaUtilNeedPercent")
            : t("loteamento.paramsInvalid"),
      };
    }
    const orientacaoRaw = loteamentoOrientacao.trim();
    const orientacao = orientacaoRaw === "" ? undefined : parseDrawNumber(orientacaoRaw);
    if (orientacaoRaw !== "" && orientacao === null) {
      return { ok: false, error: t("loteamento.orientacaoInvalid") };
    }
    return {
      ok: true,
      input: {
        glebaId: loteamentoGlebaId.trim() || selectedId,
        larguraViaM,
        profundidadeQuadraM,
        testadaMinimaM,
        areaMinimaQuadraM2: loteamentoQuadraModo === "area" ? areaMinimaQuadraM2 : 0,
        larguraQuadraM: loteamentoQuadraModo === "medidas" ? larguraQuadraM ?? undefined : undefined,
        profundidadeBlocoM: loteamentoQuadraModo === "medidas" ? distanciaQuadraM ?? undefined : undefined,
        larguraCalcadaM,
        eixoRua: loteamentoEixoRua,
        raioEsquinaM,
        viasExistentesExtremidades: loteamentoViasExistentes || loteamentoLados.length > 0,
        ladosAresta: loteamentoLados.length > 0 ? loteamentoLados : undefined,
        orientacao: orientacao ?? undefined,
        prefixoQuadra: loteamentoPrefixo.trim() || "Quadra",
        percentAreaUtil: percentAreaUtil ?? undefined,
        cantoAreaUtil: parseReservaCanto(areaUtilCanto) ?? areaUtilCanto,
        percentualEsquina: parseEsquinaPercent(),
        areaMinimaM2: resolveCurrentAreaMinimaInterno(),
      },
    };
  }

  function parseEsquinaPercent(): number {
    const raw = loteamentoPercentualEsquina.trim();
    const n = raw === "" ? DEFAULT_PERCENTUAL_ESQUINA : parseDrawNumber(raw);
    if (n == null || !Number.isFinite(n) || n < 0 || n > 200) return DEFAULT_PERCENTUAL_ESQUINA;
    return n;
  }

  function resolveCurrentAreaMinimaInterno(): number {
    const testada = parseDrawNumber(loteamentoTestada) ?? 10;
    const profundidade = parseDrawNumber(loteamentoProfundidade) ?? 50;
    return resolveAreaMinimaInterno({ testadaM: testada, profundidadeM: profundidade });
  }

  function applyEditedEixosToLoteamento(source?: typeof project) {
    if (loteamentoRebuildInFlightRef.current) return;
    setLoteamentoNotice(null);
    setLoteamentoError(null);
    const parsed = parseLoteamentoRebuildInput();
    if (!parsed.ok) {
      setLoteamentoError(parsed.error);
      return;
    }
    const src = source ?? projectLiveRef.current;
    if (!src.entities.some(isLoteamentoEixoPolyline)) {
      setLoteamentoError(t("loteamento.eixoNeed"));
      return;
    }
    loteamentoRebuildInFlightRef.current = true;
    setLoteamentoBusy(true);
    try {
      const result = rebuildLoteamentoFromEixos(src, parsed.input);
      projectLiveRef.current = result.project;
      setProject(result.project);
      setLoteamentoNotice(t("loteamento.eixoApplied", { lots: result.lotCount, vias: result.viaCount }));
    } catch (err) {
      const raw = err instanceof Error ? err.message : t("commands.error");
      setLoteamentoError(
        raw === EIXO_NEED_LOTEAMENTO
          ? t("loteamento.eixoNeed")
          : raw === RESERVA_LEGAL_NEED_POLYGON
            ? t("loteamento.needPolygon")
            : raw,
      );
    } finally {
      loteamentoRebuildInFlightRef.current = false;
      setLoteamentoBusy(false);
    }
  }

  function cancelAlterarEixoTwoPoints() {
    setLoteamentoAlterarEixo(null);
    setLoteamentoAlterarEixoPreview(null);
    alterarEixoIgnoreUpRef.current = false;
    setDrawHint(null);
  }

  function startAlterarEixoTwoPoints() {
    setLoteamentoNotice(null);
    setLoteamentoError(null);
    if (!projectLiveRef.current.entities.some(isLoteamentoEixoPolyline)) {
      setLoteamentoError(t("loteamento.eixoNeed"));
      return;
    }
    setLoteamentoPickLado(false);
    setAppPickMode(false);
    setAppApplyAfterPick(false);
    setDrenagemPick(null);
    setTool("select");
    setToolsTab("loteamento");
    setLoteamentoAlterarEixo({ phase: "a" });
    setLoteamentoAlterarEixoPreview(null);
    setDrawHint(t("loteamento.alterarEixoFirst"));
  }

  function finishAlterarEixoTwoPoints(
    draft: {
      eixoId: string;
      pointA: CadVertex;
      stationA: number;
    },
    pointB: CadVertex,
    stationB: number,
  ) {
    setLoteamentoNotice(null);
    setLoteamentoError(null);
    try {
      const edited = applyEixoTwoPointEdit(projectLiveRef.current, {
        eixoId: draft.eixoId,
        pointA: draft.pointA,
        pointB,
        stationA: draft.stationA,
        stationB,
      });
      projectLiveRef.current = edited.project;
      setProject(edited.project);
      setSelectedId(draft.eixoId);
      cancelAlterarEixoTwoPoints();
      applyEditedEixosToLoteamento(edited.project);
    } catch (err) {
      setLoteamentoAlterarEixo((prev) =>
        prev && prev.phase === "b" ? { ...prev, dragging: false } : prev,
      );
      const raw = err instanceof Error ? err.message : t("commands.error");
      setLoteamentoError(
        raw === EIXO_NEED_LOTEAMENTO
          ? t("loteamento.eixoNeed")
          : raw === EIXO_TWO_POINT_NEED_DISTINCT || raw === EIXO_TWO_POINT_NEED_SAME
            ? t("loteamento.alterarEixoSame")
            : raw === EIXO_TWO_POINT_NEED_HIT
              ? t("loteamento.alterarEixoMiss")
              : raw,
      );
    }
  }

  function snapAlterarEixoPoint(sx: number, sy: number, preferEixoId?: string | null) {
    const world = screenToWorld(sx, sy, viewport);
    const maxDistM = Math.max(1.2, worldMetersPerPixel(viewport) * 14);
    return hitTestEixoEditPoint(projectLiveRef.current, world.x, world.y, maxDistM, preferEixoId);
  }

  function openEstudoViabilidade() {
    const live = projectLiveRef.current ?? project;
    const plateauRaw = volPlateauZ.trim().replace(",", ".");
    const plateau = plateauRaw ? Number(plateauRaw) : null;
    const calcadaRaw = loteamentoLarguraCalcada.trim().replace(",", ".");
    const viaRaw = parseDrawNumber(loteamentoLarguraVia);
    const glebaId = loteamentoGlebaId.trim() || selectedId || null;
    const payload = buildViabilidadeSessionPayload({
      project: live,
      savedProjectId,
      streetProfiles,
      plateauZ: plateau != null && Number.isFinite(plateau) ? plateau : null,
      glebaId,
      larguraViaFallbackM: viaRaw != null && viaRaw > 0 ? viaRaw : undefined,
      larguraCalcadaM: calcadaRaw ? Number(calcadaRaw) : undefined,
    });
    const stored = writeViabilidadeSession(payload);
    if (!stored.ok && !savedProjectId) {
      setLoteamentoError(
        "Salve o projeto CAD na nuvem antes de abrir o estudo (desenho grande demais para o armazenamento local).",
      );
      return;
    }
    router.push(savedProjectId ? `/viabilidade/${savedProjectId}` : "/viabilidade/local");
  }

  function generateLoteamentoFromPanel() {
    setLoteamentoNotice(null);
    setLoteamentoError(null);

    const glebaId = loteamentoGlebaId.trim() || selectedId;
    const gleba = glebaId
      ? project.entities.find((entity) => entity.id === glebaId)
      : null;
    if (
      !gleba ||
      gleba.type !== "polyline" ||
      !gleba.closed ||
      gleba.vertices.length < 3
    ) {
      setLoteamentoError(t("loteamento.needPolygon"));
      return;
    }

    const larguraViaM = parseDrawNumber(loteamentoLarguraVia);
    const profundidadeQuadraM = parseDrawNumber(loteamentoProfundidade);
    const testadaMinimaM = parseDrawNumber(loteamentoTestada);
    const areaQuadraRaw = loteamentoAreaQuadra.trim();
    const areaMinimaQuadraM2 = areaQuadraRaw === "" ? 2000 : parseDrawNumber(areaQuadraRaw);
    const larguraQuadraM = parseDrawNumber(loteamentoLarguraQuadra);
    const distanciaQuadraM = parseDrawNumber(loteamentoDistanciaQuadra);
    const larguraCalcadaRaw = loteamentoLarguraCalcada.trim();
    const larguraCalcadaM = larguraCalcadaRaw === "" ? 0 : parseDrawNumber(larguraCalcadaRaw);
    const raioRaw = loteamentoRaioEsquina.trim();
    const raioEsquinaM = raioRaw === "" ? 0 : parseDrawNumber(raioRaw);
    const areaUtilRaw = loteamentoAreaUtil.trim();
    const percentAreaUtil = areaUtilRaw === "" ? 15 : parseDrawNumber(areaUtilRaw);
    const medidasOk =
      loteamentoQuadraModo !== "medidas" ||
      (larguraQuadraM !== null && larguraQuadraM > 0 && distanciaQuadraM !== null && distanciaQuadraM > 0);
    if (
      larguraViaM === null ||
      larguraViaM <= 0 ||
      profundidadeQuadraM === null ||
      profundidadeQuadraM <= 0 ||
      testadaMinimaM === null ||
      testadaMinimaM <= 0 ||
      areaMinimaQuadraM2 === null ||
      areaMinimaQuadraM2 < 0 ||
      larguraCalcadaM === null ||
      larguraCalcadaM < 0 ||
      raioEsquinaM === null ||
      raioEsquinaM < 0 ||
      percentAreaUtil === null ||
      percentAreaUtil < 0 ||
      percentAreaUtil >= 100 ||
      !medidasOk
    ) {
      setLoteamentoError(
        percentAreaUtil !== null && (percentAreaUtil < 0 || percentAreaUtil >= 100)
          ? t("loteamento.areaUtilNeedPercent")
          : t("loteamento.paramsInvalid"),
      );
      return;
    }

    const orientacaoRaw = loteamentoOrientacao.trim();
    const orientacao = orientacaoRaw === "" ? undefined : parseDrawNumber(orientacaoRaw);
    if (orientacaoRaw !== "" && orientacao === null) {
      setLoteamentoError(t("loteamento.orientacaoInvalid"));
      return;
    }

    setLoteamentoBusy(true);
    try {
      const result = executeCadAiCommand(
        project,
        {
          acao: "gerar_loteamento",
          entidade_id: gleba.id,
          usarSelecao: true,
          largura_via_m: larguraViaM,
          profundidade_quadra_m: profundidadeQuadraM,
          testada_minima_m: testadaMinimaM,
          area_minima_quadra_m2: loteamentoQuadraModo === "area" ? areaMinimaQuadraM2 : 0,
          largura_quadra_m: loteamentoQuadraModo === "medidas" ? larguraQuadraM ?? undefined : undefined,
          distancia_quadra_m: loteamentoQuadraModo === "medidas" ? distanciaQuadraM ?? undefined : undefined,
          largura_calcada_m: larguraCalcadaM,
          eixo_rua: loteamentoEixoRua,
          raio_esquina_m: raioEsquinaM,
          vias_existentes_extremidades: loteamentoViasExistentes || loteamentoLados.length > 0,
          lados_aresta: loteamentoLados.length > 0 ? loteamentoLados : undefined,
          entidade_ids: loteamentoEixoIds.length > 0 ? loteamentoEixoIds : undefined,
          orientacao: orientacao ?? undefined,
          prefixo_quadra: loteamentoPrefixo.trim() || "Quadra",
          percentual_area_util: percentAreaUtil ?? undefined,
          canto_area_util: parseReservaCanto(areaUtilCanto) ?? areaUtilCanto,
          percentual_esquina: parseEsquinaPercent(),
        },
        { selectedId: gleba.id, memorialForm },
      );
      if (result.ok === false) {
        setLoteamentoError(result.message);
        return;
      }
      setProject(result.project);
      if (result.selectedId !== undefined) setSelectedId(result.selectedId);
      for (const effect of result.sideEffects ?? []) {
        handleAiSideEffect(effect);
      }
      setLoteamentoNotice(result.message);
    } catch (err) {
      setLoteamentoError(err instanceof Error ? err.message : t("commands.error"));
    } finally {
      setLoteamentoBusy(false);
    }
  }

  function applyLoteamentoLotSizeFromPanel(mode: "quadra" | "lote") {
    setLoteamentoNotice(null);
    setLoteamentoError(null);
    const target = loteamentoSizeTarget(project, selectedId);
    if (!target) {
      setLoteamentoError(t("loteamento.ajusteNeedSelection"));
      return;
    }
    if (mode === "lote" && target.kind !== "lote") {
      setLoteamentoError(t("loteamento.ajusteNeedSelection"));
      return;
    }
    const testadaM = ajusteTestada.trim() === "" ? undefined : parseDrawNumber(ajusteTestada);
    const profundidadeM = ajusteProfundidade.trim() === "" ? undefined : parseDrawNumber(ajusteProfundidade);
    const areaM2 = ajusteArea.trim() === "" ? undefined : parseDrawNumber(ajusteArea);
    const hasTestada = testadaM != null && testadaM > 0;
    const hasProf = profundidadeM != null && profundidadeM > 0;
    const hasArea = areaM2 != null && areaM2 > 0;
    if (!hasTestada && !hasProf && !hasArea) {
      setLoteamentoError(t("loteamento.ajusteNeedSize"));
      return;
    }
    if ((testadaM != null && testadaM <= 0) || (profundidadeM != null && profundidadeM <= 0) || (areaM2 != null && areaM2 <= 0)) {
      setLoteamentoError(t("loteamento.ajusteNeedSize"));
      return;
    }
    setLoteamentoBusy(true);
    try {
      const result = applyLoteamentoLotSize(project, {
        entityId: target.entityId,
        mode,
        testadaM: hasTestada ? testadaM : undefined,
        profundidadeM: hasProf ? profundidadeM : undefined,
        areaM2: hasArea ? areaM2 : undefined,
      });
      setProject(result.project);
      setSelectedId(result.selectedId);
      setLoteamentoNotice(t("loteamento.ajusteDone"));
    } catch (err) {
      const raw = err instanceof Error ? err.message : t("commands.error");
      setLoteamentoError(
        raw === "Selecione uma quadra ou um lote do loteamento."
          ? t("loteamento.ajusteNeedSelection")
          : raw === "Informe testada e profundidade (ou área em m²) maiores que zero."
            ? t("loteamento.ajusteNeedSize")
            : raw === "Gere o loteamento antes de ajustar os lotes."
              ? t("loteamento.ajusteNeedLoteamento")
              : raw,
      );
    } finally {
      setLoteamentoBusy(false);
    }
  }

  function definirReservaLegal() {
    setLoteamentoNotice(null);
    setLoteamentoError(null);
    const glebaId = loteamentoGlebaId.trim() || selectedId;
    const pct = parseDrawNumber(reservaPercent);
    if (pct === null || pct <= 0 || pct >= 100) {
      setLoteamentoError(t("loteamento.reservaNeedPercent"));
      return;
    }
    const canto = parseReservaCanto(reservaCanto) ?? reservaCanto;
    try {
      const result = applyReservaLegalToProject(project, {
        glebaId,
        percent: pct,
        canto,
      });
      setProject(result.project);
      setSelectedId(result.reserved.id);
      setTool("select");
      const gleba = project.entities.find((entity) => entity.id === glebaId);
      const fitEntities = gleba ? [gleba, result.reserved] : [result.reserved];
      const nextBounds = computeViewportBoundsSafe(fitEntities);
      setViewBounds((prev) => {
        if (!prev) return nextBounds;
        const c = polygonCentroid(result.reserved.vertices);
        const inside =
          c.x >= prev.minX && c.x <= prev.maxX && c.y >= prev.minY && c.y <= prev.maxY;
        return inside ? prev : nextBounds;
      });
      const done = t("loteamento.reservaDone", {
        area: formatAreaBr(result.reservedM2),
        pct: String(pct.toFixed(0)),
      });
      setLoteamentoNotice(`${done} ${t("loteamento.reservaDragHint")}`);
      setPointActionNotice(
        `Reservados ${formatAreaBr(result.reservedM2)} (${pct}%) — arraste o polígono verde para mover.`,
      );
    } catch (err) {
      const raw = err instanceof Error ? err.message : t("commands.error");
      setLoteamentoError(raw === RESERVA_LEGAL_NEED_POLYGON ? t("loteamento.reservaNeedPolygon") : raw);
    }
  }

  function definirAreaUtil() {
    setLoteamentoNotice(null);
    setLoteamentoError(null);
    const preferredGleba = loteamentoGlebaId.trim() || selectedId;
    const glebaId =
      loteamentoGlebas.find((poly) => poly.id === preferredGleba)?.id ??
      loteamentoGlebas.find((poly) => poly.id === loteamentoGlebaId.trim())?.id ??
      loteamentoGlebas[0]?.id ??
      preferredGleba;
    const areaUtilRaw = loteamentoAreaUtil.trim();
    const pct = areaUtilRaw === "" ? 15 : parseDrawNumber(areaUtilRaw);
    if (pct === null || pct <= 0 || pct >= 100) {
      setLoteamentoError(t("loteamento.areaUtilNeedPercent"));
      return;
    }
    const canto = parseReservaCanto(areaUtilCanto) ?? areaUtilCanto;
    try {
      const result = applyAreaUtilToProject(project, {
        glebaId,
        percent: pct,
        canto,
      });
      setProject(result.project);
      setSelectedId(result.util.id);
      setTool("select");
      const gleba = project.entities.find((entity) => entity.id === glebaId);
      const fitEntities = gleba ? [gleba, result.util] : [result.util];
      const nextBounds = computeViewportBoundsSafe(fitEntities);
      setViewBounds((prev) => {
        if (!prev) return nextBounds;
        const c = polygonCentroid(result.util.vertices);
        const inside =
          c.x >= prev.minX && c.x <= prev.maxX && c.y >= prev.minY && c.y <= prev.maxY;
        return inside ? prev : nextBounds;
      });
      const done = t("loteamento.areaUtilDone", {
        area: formatAreaBr(result.areaM2),
        pct: String(pct.toFixed(0)),
      });
      setLoteamentoNotice(`${done} ${t("loteamento.areaUtilDragHint")}`);
    } catch (err) {
      const raw = err instanceof Error ? err.message : t("commands.error");
      setLoteamentoError(
        raw === AREA_UTIL_NEED_POLYGON
          ? t("loteamento.areaUtilNeedPolygon")
          : raw === AREA_UTIL_NEED_RESERVA
            ? t("loteamento.areaUtilNeedReserva")
            : raw === AREA_UTIL_NEED_AREA
              ? t("loteamento.areaUtilNeedArea")
              : raw,
      );
    }
  }

  function aplicarAppBuffer(sourceId: string) {
    setLoteamentoNotice(null);
    setLoteamentoError(null);
    const width = parseDrawNumber(appWidth.trim() === "" ? "30" : appWidth);
    if (width === null || width <= 0) {
      setLoteamentoError(t("loteamento.appNeedWidth"));
      return false;
    }
    try {
      const result = applyAppBufferToProject(project, {
        sourceId,
        widthM: width,
        side: appSide,
      });
      setProject(result.project);
      setSelectedId(result.app.id);
      setTool("select");
      setAppPickMode(false);
      setAppApplyAfterPick(false);
      const nextBounds = computeViewportBoundsSafe([result.app]);
      setViewBounds((prev) => {
        if (!prev) return nextBounds;
        const c = polygonCentroid(result.app.vertices);
        const inside =
          c.x >= prev.minX && c.x <= prev.maxX && c.y >= prev.minY && c.y <= prev.maxY;
        return inside ? prev : nextBounds;
      });
      const done = t("loteamento.appDone", {
        width: String(Number.isInteger(width) ? width : width.toFixed(1).replace(".", ",")),
        area: formatAreaBr(result.areaM2),
      });
      setLoteamentoNotice(`${done} ${t("loteamento.appDragHint")}`);
      return true;
    } catch (err) {
      const raw = err instanceof Error ? err.message : t("commands.error");
      setLoteamentoError(raw === APP_NEED_LINE ? t("loteamento.appNeedLine") : raw);
      return false;
    }
  }

  function definirApp() {
    setLoteamentoNotice(null);
    setLoteamentoError(null);
    const sourceId = selectedId;
    const source = sourceId ? project.entities.find((entity) => entity.id === sourceId) : undefined;
    const glebaId = loteamentoGlebaId.trim();
    const isCurrentGleba =
      Boolean(source && glebaId && source.id === glebaId && source.type === "polyline" && source.closed);
    if (!source || !isAppSourceEntity(source) || isCurrentGleba) {
      setLoteamentoError(t("loteamento.appNeedLine"));
      setAppPickMode(true);
      setAppApplyAfterPick(true);
      setTool("select");
      setDrawHint(t("loteamento.appPickBanner"));
      return;
    }
    aplicarAppBuffer(source.id);
  }

  function applyLoteamentoCotas() {
    setLoteamentoError(null);
    const result = applyReurbLotLabels(project, { includeCotas: true, includeArea: true });
    if (result.lotCount === 0) {
      setLoteamentoError(t("loteamento.urbano.needLots"));
      return;
    }
    setProject(result.project);
    setLoteamentoNotice(t("loteamento.urbano.cotarDone", { count: result.lotCount }));
  }

  function limparLoteamentoAnotacoes() {
    setLoteamentoError(null);
    const result = clearLoteamentoAnnotations(project);
    if (result.removed === 0) {
      setLoteamentoError(t("loteamento.urbano.limparEmpty"));
      return;
    }
    setProject(result.project);
    setLoteamentoNotice(t("loteamento.urbano.limparDone", { count: result.removed }));
  }

  function exportarLoteamentoMemorial() {
    setLoteamentoError(null);
    const lots = listReurbLots(project);
    if (lots.length === 0) {
      setLoteamentoError(t("loteamento.urbano.needLots"));
      return;
    }
    downloadOdsBlob(buildReurbTabularMemorialBlob(project, memorialForm), reurbTabularFilename(project));
    setLoteamentoNotice(t("reurb.memorialsTabularDone", { count: lots.length }));
  }

  function gerarLoteamentoTabelas() {
    setLoteamentoError(null);
    const classified = applyLoteamentoTables(project, {
      percentualEsquina: parseEsquinaPercent(),
      areaMinimaInterno: resolveCurrentAreaMinimaInterno(),
    });
    if (classified.lotCount === 0) {
      setLoteamentoError(t("loteamento.urbano.needLots"));
      return;
    }
    setProject(classified.project);
    downloadOdsBlob(buildLoteamentoTablesBlob(classified.project), loteamentoTablesFilename(classified.project));
    setLoteamentoNotice(t("loteamento.urbano.tabelasDone", { count: classified.lotCount }));
  }

  function gerarLoteamentoPontos() {
    setLoteamentoError(null);
    const result = applyLoteamentoStakePoints(project);
    if (result.pointCount === 0) {
      setLoteamentoError(t("loteamento.urbano.needLots"));
      return;
    }
    setProject(result.project);
    downloadCsv(loteamentoStakePointsFilename(result.project), loteamentoStakePointsCsv(result.project));
    setLoteamentoNotice(t("loteamento.urbano.pontosDone", { count: result.pointCount }));
  }

  function exportarLoteamentoKml() {
    setLoteamentoError(null);
    const kml = exportCadProjectKml(project);
    if (!kml.includes("<Placemark>")) {
      setLoteamentoError(t("loteamento.urbano.kmlEmpty"));
      return;
    }
    downloadBlob(new Blob([kml], { type: "application/vnd.google-earth.kml+xml" }), loteamentoKmlFilename(project));
    setLoteamentoNotice(t("loteamento.urbano.kmlDone"));
  }

  function currentSecaoTipoParams() {
    return secaoTipoFromInputs({
      pistaM: parseDrawNumber(secaoPista) ?? 8,
      calcadaM: parseDrawNumber(secaoCalcada) ?? 2,
      declivePistaPct: parseDrawNumber(secaoDeclive) ?? 2,
      decliveCalcadaPct: parseDrawNumber(secaoDecliveCalcada) ?? 2,
      taludeCorteH: parseDrawNumber(secaoTaludeCorte) ?? 1.5,
      taludeAterroH: parseDrawNumber(secaoTaludeAterro) ?? 2,
      meioFioM: parseDrawNumber(secaoMeioFio) ?? 0.15,
      extensaoTaludeM: parseDrawNumber(secaoExtensaoTalude) ?? 4,
    });
  }

  function persistStreetProfiles(next: StreetProfileDraft[], applySecao: boolean) {
    const interval = parseDrawNumber(secaoIntervalo) ?? 20;
    const params = currentSecaoTipoParams();
    setProject((prev) =>
      applyStreetProfilesToProject(
        prev,
        next,
        applySecao ? { params, intervalM: interval } : undefined,
      ),
    );
  }

  function criarPerfisDasRuas() {
    setLoteamentoError(null);
    if (listLoteamentoEixos(project).length === 0) {
      setLoteamentoError(t("loteamento.perfil.needEixos"));
      return;
    }
    const profiles = buildStreetProfiles(project);
    if (profiles.length === 0) {
      setLoteamentoError(t("loteamento.perfil.needEixos"));
      return;
    }
    const via = parseDrawNumber(loteamentoLarguraVia) ?? 12;
    const calcada = parseDrawNumber(loteamentoLarguraCalcada) ?? 2;
    const seeded = defaultSecaoTipo(via, calcada);
    setSecaoPista(String(seeded.larguraPistaM));
    setSecaoCalcada(String(seeded.larguraCalcadaM));
    setSecaoMeioFio(String(seeded.meioFioM ?? 0.15));
    setSecaoDeclive(String(seeded.declivePistaPct));
    setSecaoDecliveCalcada(String(seeded.decliveCalcadaPct ?? 2));
    setSecaoTaludeCorte(String(seeded.taludeCorteH));
    setSecaoTaludeAterro(String(seeded.taludeAterroH));
    setSecaoExtensaoTalude(String(seeded.extensaoTaludeM ?? 4));
    setStreetProfiles(profiles);
    setStreetProfileId(profiles[0]?.streetId ?? "");
    persistStreetProfiles(profiles, false);
    const hits = new Set(
      profiles.flatMap((p) => p.intersections.map((h) => `${h.x.toFixed(2)},${h.y.toFixed(2)}`)),
    );
    setLoteamentoNotice(t("loteamento.perfil.done", { count: profiles.length, hits: hits.size }));
  }

  function aplicarSecaoTipoNasRuas() {
    setLoteamentoError(null);
    const params = currentSecaoTipoParams();
    const next = streetProfiles.length > 0 ? streetProfiles : buildStreetProfiles(project);
    setSecaoTipoApplied(true);
    if (next.length === 0) {
      setProject((prev) => applyStandaloneSecaoTipo(prev, params));
      setLoteamentoNotice(t("loteamento.perfil.secaoDoneStandalone"));
      window.requestAnimationFrame(() => secaoViewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
      return;
    }
    if (streetProfiles.length === 0) {
      setStreetProfiles(next);
      setStreetProfileId(next[0]?.streetId ?? "");
    }
    persistStreetProfiles(next, true);
    const interval = parseDrawNumber(secaoIntervalo) ?? 20;
    const stations = next.reduce((sum, p) => sum + Math.max(2, Math.floor((p.terrain.at(-1)?.x ?? 0) / interval) + 1), 0);
    setLoteamentoNotice(t("loteamento.perfil.secaoDone", { count: stations }));
    window.requestAnimationFrame(() => secaoViewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  function currentDrainageParams() {
    const runoffC = parseDrawNumber(drenagemC) ?? DEFAULT_DRAINAGE_PARAMS.runoffC;
    const intensityMmH = parseDrawNumber(drenagemIntensity) ?? DEFAULT_DRAINAGE_PARAMS.intensityMmH;
    const returnPeriodYears = parseDrawNumber(drenagemTr) ?? DEFAULT_DRAINAGE_PARAMS.returnPeriodYears;
    const pvSpacingM = parseDrawNumber(drenagemSpacing) ?? DEFAULT_DRAINAGE_PARAMS.pvSpacingM;
    const minSlopePct = parseDrawNumber(drenagemMinSlope) ?? DEFAULT_DRAINAGE_PARAMS.minSlopePct;
    const inletSpacingM = parseDrawNumber(drenagemInletSpacing) ?? DEFAULT_DRAINAGE_PARAMS.inletSpacingM;
    const nManning = DRAINAGE_MATERIALS[drenagemMaterial] ?? DEFAULT_DRAINAGE_PARAMS.nManning;
    const idfK = parseDrawNumber(drenagemIdfK);
    const idfA = parseDrawNumber(drenagemIdfA);
    const idfB = parseDrawNumber(drenagemIdfB);
    const idfC = parseDrawNumber(drenagemIdfC);
    const idf =
      idfK != null && idfA != null && idfB != null && idfC != null
        ? { K: idfK, a: idfA, b: idfB, c: idfC, fonte: "IDF do projeto" }
        : null;
    const imperviousPct = parseDrawNumber(drenagemImperv);
    return {
      runoffC,
      intensityMmH,
      returnPeriodYears,
      pvSpacingM,
      enableAutoInlets: drenagemAutoInlets,
      connectInletsToMain: drenagemConnectInlets,
      inletSpacingM,
      inletAtIntersections: drenagemInletAtIntersections,
      minSlopePct,
      material: drenagemMaterial,
      nManning,
      idf: isUsableIdf(idf) ? idf : null,
      imperviousPct: imperviousPct ?? undefined,
    };
  }

  function drenagemStatusLabel(status?: string | null) {
    if (status === "insuficiente") return t("drenagem.insuficiente");
    if (status === "velocidade_baixa") return t("drenagem.velBaixa");
    if (status === "velocidade_alta") return t("drenagem.velAlta");
    return t("drenagem.ok");
  }

  function focusDrainageCalc(entityId: string | null, openTab = false) {
    if (!entityId) return;
    const entity = project.entities.find((e) => e.id === entityId);
    if (!isDrainageSelectableEntity(entity)) return;
    setSelectedId(entityId);
    setToolsTab("drenagem");
    setDrenagemPlanilhaOpen(true);
    if (openTab) setActiveTab("planilha");
    const selected = selectDrainageCalcParams(project, entityId, currentDrainageParams());
    if (selected?.params) {
      setDrenagemNotice(
        `${selected.params.trecho} · I=${selected.params.I.toFixed(1)} mm/h · Q=${selected.params.Q.toFixed(1)} L/s · y/D=${selected.params.yOverD.toFixed(2)}`,
      );
    }
  }

  function exportarDrenagemPlanilha() {
    setDrenagemError(null);
    try {
      const buf = exportDrainageCalcWorkbook(project, currentDrainageParams());
      const filename = drainageCalcFilename(project);
      downloadBlob(
        new Blob([new Uint8Array(buf)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        filename,
      );
      setDrenagemNotice(t("drenagem.planilha.exportDone", { file: filename }));
    } catch (err) {
      setDrenagemError(err instanceof Error ? err.message : t("commands.error"));
    }
  }

  function gerarDrenagemAutomatica() {
    setDrenagemError(null);
    setDrenagemNotice(null);
    setDrenagemBusy(true);
    try {
      const params = currentDrainageParams();
      const result = generateLoteamentoDrainage(project, params);
      setProject(result.project);
      const firstPipe = listDrainagePipes(result.project)[0];
      if (firstPipe) setSelectedId(firstPipe.id);
      setDrenagemPlanilhaOpen(true);
      setDrawingChartsOpen(true);
      setDrenagemNotice(
        [
          t("drenagem.done", {
            pvs: result.pvCount,
            inlets: result.inletCount,
            ramais: result.ramalCount,
            pipes: result.pipeCount,
            outfall: result.outfallCode ?? "—",
          }),
          isUsableIdf(params.idf)
            ? t("drenagem.idfUsed", {
                i: result.intensityMmH.toFixed(1),
                tc: result.tcMin.toFixed(1),
                tr: params.returnPeriodYears,
              })
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
      setToolsTab("drenagem");
    } catch (err) {
      setDrenagemError(err instanceof Error ? err.message : t("drenagem.needVias"));
    } finally {
      setDrenagemBusy(false);
    }
  }

  function recalcularDrenagem() {
    setDrenagemError(null);
    setProject(recalculateDrainageHydraulics(project, currentDrainageParams()));
    setDrenagemNotice(t("drenagem.recalc"));
  }

  function limparDrenagem() {
    setProject(clearDrainageEntities(project));
    setDrenagemNotice(t("drenagem.cleared"));
    setDrenagemError(null);
  }

  function exportarDrenagemSwmm() {
    setDrenagemError(null);
    try {
      const params = currentDrainageParams();
      const inp = exportDrainageSwmmInp(project, {
        titulo: `Rede de drenagem — ${project.name}`,
        intensityMmH: params.intensityMmH,
        runoffC: params.runoffC,
      });
      const filename = drainageSwmmFilename(project);
      downloadBlob(new Blob([inp], { type: "text/plain;charset=utf-8" }), filename);
      setDrenagemNotice(t("drenagem.exportSwmmDone", { file: filename }));
    } catch (err) {
      setDrenagemError(err instanceof Error ? err.message : t("commands.error"));
    }
  }

  function importarDrenagemSwmm(file: File) {
    setDrenagemError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = importDrainageSwmmInp(project, String(reader.result ?? ""), currentDrainageParams());
        setProject(next);
        setDrenagemNotice(
          t("drenagem.importSwmmDone", {
            pvs: listDrainagePvs(next).length,
            pipes: listDrainagePipes(next).length,
          }),
        );
      } catch (err) {
        setDrenagemError(err instanceof Error ? err.message : t("commands.error"));
      }
    };
    reader.onerror = () => setDrenagemError(t("drenagem.importSwmmEmpty"));
    reader.readAsText(file);
  }

  function patchStreetGreide(streetId: string, next: StreetProfileDraft) {
    const profiles = streetProfiles.map((p) => (p.streetId === streetId ? next : p));
    setStreetProfiles(profiles);
    persistStreetProfiles(profiles, false);
  }

  function contourSmoothOptions() {
    return contourSmooth
      ? { gridSmoothPasses: 1, lineSmoothIterations: 2 }
      : { gridSmoothPasses: 0, lineSmoothIterations: 0 };
  }

  function generateContours() {
    setContourError(null);
    setContourInfo(null);
    setGeneratingContours(true);
    try {
      const interval = Number(contourInterval.replace(",", "."));
      const result = generateContoursFromPoints(elevationSamples, {
        interval,
        ...contourSmoothOptions(),
      });

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

  async function generateContoursFromMapDem(source: "google" | "opentopo" = "google") {
    setContourError(null);
    setContourInfo(null);
    setGeneratingDemContours(true);
    try {
      if (!projectGeoref.isGeoreferenced) {
        throw new Error(t("contour.demNeedGeoref"));
      }
      if (!isViewportSmallEnoughForDemContours(bounds)) {
        throw new Error(t("contour.demAreaTooLarge"));
      }
      if (source === "google" && !googleElevationAvailable) {
        throw new Error(t("contour.googleNotConfigured"));
      }
      const interval = Number(contourInterval.replace(",", "."));
      const result = await generateContoursFromDem(viewport, projectGeoref, {
        interval,
        elevationSource: source,
        ...contourSmoothOptions(),
      });

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
        t("contour.demGenerated", {
          count: result.polylines.length,
          levels: result.levels.length,
          zMin: result.zMin.toFixed(2),
          zMax: result.zMax.toFixed(2),
          dataset: result.demDataset,
          source: result.demSource,
          cols: result.gridCols,
          rows: result.gridRows,
        }),
      );
    } catch (err) {
      setContourError(err instanceof Error ? err.message : t("contour.demError"));
    } finally {
      setGeneratingDemContours(false);
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

  function generateInterpolatedContoursFromPanel() {
    setInterpError(null);
    setInterpInfo(null);
    setGeneratingInterp(true);
    try {
      const interval = Number(contourInterval.replace(",", "."));
      const assigned = interpAssignZ.trim() ? parseMeters(interpAssignZ) : null;
      const result = generateInterpolatedContours(project, {
        interval,
        method: interpMethod,
        selectedId,
        assignedZ: assigned,
        usePointElevations: interpUsePoints,
        ...contourSmoothOptions(),
      });
      setProject((prev) => {
        const withoutOld = removeInterpolatedContourEntities(prev.entities);
        const hasLayer = prev.layers.some((l) => l.id === INTERPOLATED_CONTOUR_LAYER.id);
        return {
          ...prev,
          layers: hasLayer ? prev.layers : [...prev.layers, { ...INTERPOLATED_CONTOUR_LAYER }],
          entities: [...withoutOld, ...result.polylines],
        };
      });
      setInterpInfo(
        t("contour.interpolateGenerated", {
          count: result.polylines.length,
          levels: result.levels.length,
          zMin: result.zMin.toFixed(2),
          zMax: result.zMax.toFixed(2),
          sources: result.sourceCount,
        }),
      );
    } catch (err) {
      setInterpError(err instanceof Error ? err.message : t("contour.error"));
    } finally {
      setGeneratingInterp(false);
    }
  }

  function clearInterpolatedContours() {
    setProject((prev) => ({
      ...prev,
      entities: removeInterpolatedContourEntities(prev.entities),
    }));
    setInterpInfo(null);
    setInterpError(null);
  }

  function calculateLoteamentoCutFill() {
    setVolError(null);
    setVolNotice(null);
    setVolBusy(true);
    try {
      const plateau = volPlateauZ.trim() ? parseMeters(volPlateauZ) : null;
      const result = computeLoteamentoCutFill({
        project,
        streetProfiles,
        plateauZ: plateau,
        selectedId,
      });
      setVolResult(result);
      setVolNotice(
        `${t("volumetria.cut", { value: formatVolumeM3(result.cutM3) })} · ${t("volumetria.fill", { value: formatVolumeM3(result.fillM3) })}`,
      );
      const raster = tryGenerateLoteamentoCutFillRaster({
        project,
        streetProfiles,
        plateauZ: plateau,
        selectedId,
      });
      if (raster) {
        setProject((prev) => ensureRasterLayerInProject(prev, "cutfill"));
        setRasters((prev) => [...prev.filter((r) => r.kind !== "cutfill"), raster]);
      }
    } catch (err) {
      setVolResult(null);
      setVolError(err instanceof Error ? err.message : t("volumetria.error"));
    } finally {
      setVolBusy(false);
    }
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

  function generateContourLabels() {
    setContourError(null);
    const contours = project.entities.filter(
      (e) =>
        e.type === "polyline" &&
        (e.layerId === CONTOUR_LAYER.id || e.layerId === INTERPOLATED_CONTOUR_LAYER.id),
    );
    if (contours.length === 0) {
      setVolError(t("volumetria.labelsNeedCurves"));
      return;
    }
    const labels = buildContourElevationLabels(project.entities);
    setProject((prev) => {
      const hasLayer = prev.layers.some((l) => l.id === CONTOUR_LABEL_LAYER.id);
      return {
        ...prev,
        layers: hasLayer ? prev.layers : [...prev.layers, { ...CONTOUR_LABEL_LAYER }],
        entities: [...removeContourLabelEntities(prev.entities), ...labels],
      };
    });
    setVolNotice(t("volumetria.labelsDone", { count: labels.length }));
    setVolError(null);
  }

  function clearContourLabels() {
    setProject((prev) => ({ ...prev, entities: removeContourLabelEntities(prev.entities) }));
  }

  function selectedClosedPolygon() {
    const entity = project.entities.find((e) => e.id === selectedId);
    if (entity?.type === "polyline" && entity.closed && entity.vertices.length >= 3) return entity;
    const closed = listClosedPolygons(project.entities);
    return closed[0] ?? null;
  }

  function resolveVolumeDesign(): { surface: DesignSurface; label: string } | null {
    if (volDesignMode === "flat") {
      const z = parseMeters(volPlateauZ) ?? (elevationSamples.length ? meanElevation(elevationSamples) : null);
      if (z == null) {
        setVolError(t("volumetria.needZ"));
        return null;
      }
      return { surface: planeFromHorizontalZ(z), label: `Platô plano Z=${z.toFixed(2)} m` };
    }
    if (volDesignMode === "inclined3") {
      const poly = project.entities.find((e) => e.id === selectedId);
      if (poly?.type !== "polyline" || poly.vertices.length < 3) {
        setVolError(t("volumetria.needPolygon"));
        return null;
      }
      const [a, b, c] = poly.vertices;
      return {
        surface: planeFromThreePoints(a, b, c),
        label: "Platô inclinado (3 pontos da polilinha)",
      };
    }
    if (volDesignMode === "strikeDip") {
      const originEntity = project.entities.find((e) => e.id === selectedId);
      const origin =
        originEntity?.type === "point"
          ? { x: originEntity.x, y: originEntity.y, z: originEntity.z }
          : originEntity?.type === "polyline" && originEntity.vertices[0]
            ? originEntity.vertices[0]
            : elevationSamples[0];
      const strike = parseMeters(volStrike);
      const dip = parseMeters(volDip);
      if (!origin || strike == null || dip == null) {
        setVolError(t("volumetria.needZ"));
        return null;
      }
      const z0 = parseMeters(volPlateauZ);
      const originZ = z0 ?? origin.z;
      return {
        surface: planeFromStrikeDip({ ...origin, z: originZ }, strike, dip),
        label: `Rumo ${strike}° / declive ${dip}°`,
      };
    }
    if (volDesignMode === "twoElev") {
      const line = findAlignmentPolyline(project.entities, selectedId);
      if (!line) {
        setVolError(t("volumetria.needPolyline"));
        return null;
      }
      const z0 = parseMeters(volZStart) ?? line.vertices[0].z;
      const z1 = parseMeters(volZEnd) ?? line.vertices[line.vertices.length - 1].z;
      const start = { ...line.vertices[0], z: z0 };
      const end = { ...line.vertices[line.vertices.length - 1], z: z1 };
      return {
        surface: planeFromTwoElevations(start, end),
        label: `Duas cotas ${z0.toFixed(2)}–${z1.toFixed(2)} m`,
      };
    }
    const layerId = volDesignLayerId || volDesignLayers[0]?.id;
    if (!layerId) {
      setVolError(t("volumetria.needDesignLayer"));
      return null;
    }
    return {
      surface: designSurfaceFromLayer(project, layerId),
      label: `MDT ${volDesignLayers.find((l) => l.id === layerId)?.name ?? layerId}`,
    };
  }

  function calculateVolume() {
    setVolError(null);
    setVolNotice(null);
    if (elevationSamples.length < 3) {
      setVolError(t("volumetria.needPoints"));
      return;
    }
    setVolBusy(true);
    try {
      const design = resolveVolumeDesign();
      if (!design) return;
      const clip = volClipToPolygon ? selectedClosedPolygon() : null;
      const result = computeEarthworkVolume({
        terrainSamples: elevationSamples,
        design: design.surface,
        clipPolygon: clip?.vertices ?? null,
        designLabel: design.label,
      });
      setVolResult(result);
      setVolNotice(
        `${t("volumetria.cut", { value: formatVolumeM3(result.cutM3) })} · ${t("volumetria.fill", { value: formatVolumeM3(result.fillM3) })}`,
      );
    } catch (err) {
      setVolResult(null);
      setVolError(err instanceof Error ? err.message : t("volumetria.error"));
    } finally {
      setVolBusy(false);
    }
  }

  function generateStakeout() {
    setVolError(null);
    if (elevationSamples.length < 3) {
      setVolError(t("volumetria.needPoints"));
      return;
    }
    try {
      const design = resolveVolumeDesign();
      if (!design) return;
      const clip = volClipToPolygon ? selectedClosedPolygon() : null;
      const step = parseMeters(volGridStep) ?? 0;
      const rows = buildStakeoutRows({
        terrainSamples: elevationSamples,
        design: design.surface,
        clipPolygon: clip?.vertices ?? null,
        gridStepM: step > 0 ? step : undefined,
      });
      setVolStakeout(rows);
      setProject((prev) => {
        const hasLayer = prev.layers.some((l) => l.id === STAKEOUT_LAYER.id);
        return {
          ...prev,
          layers: hasLayer ? prev.layers : [...prev.layers, { ...STAKEOUT_LAYER }],
          entities: [...removeStakeoutEntities(prev.entities), ...stakeoutEntities(rows)],
        };
      });
      setVolNotice(t("volumetria.stakeoutDone", { count: rows.length }));
    } catch (err) {
      setVolError(err instanceof Error ? err.message : t("volumetria.error"));
    }
  }

  function generateStreetNotes() {
    setVolError(null);
    const line = findAlignmentPolyline(project.entities, selectedId);
    if (!line) {
      setVolError(t("volumetria.needPolyline"));
      return;
    }
    if (elevationSamples.length < 3) {
      setVolError(t("volumetria.needPoints"));
      return;
    }
    const interval = parseMeters(streetInterval) ?? 20;
    const half = parseMeters(streetHalfWidth) ?? 10;
    const z0 = parseMeters(streetZStart) ?? line.vertices[0].z;
    const z1 = parseMeters(streetZEnd) ?? line.vertices[line.vertices.length - 1].z;
    try {
      const result = computeStreetEarthwork({
        alignment: line.vertices,
        terrainSamples: elevationSamples,
        intervalM: interval,
        halfWidthM: half,
        zStart: z0,
        zEnd: z1,
      });
      setStreetNotes(result);
      setVolNotice(
        t("volumetria.streetDone", {
          stations: result.stationCount,
          cut: formatVolumeM3(result.cutM3),
          fill: formatVolumeM3(result.fillM3),
        }),
      );
    } catch (err) {
      setStreetNotes(null);
      setVolError(err instanceof Error ? err.message : t("volumetria.error"));
    }
  }

  function generateVolLongProfileFromLine() {
    setVolError(null);
    const line = findAlignmentPolyline(project.entities, selectedId);
    if (!line) {
      setVolError(t("volumetria.needPolyline"));
      return;
    }
    try {
      const profile = generateLongitudinalProfileAlongPolyline(project.entities, line.vertices);
      setProject((prev) => {
        const hasLayer = prev.layers.some((l) => l.id === PROFILE_LAYER.id);
        return {
          ...prev,
          layers: hasLayer ? prev.layers : [...prev.layers, { ...PROFILE_LAYER }],
          entities: [...prev.entities, profile],
        };
      });
      setSelectedId(profile.id);
      setProfilePickResult(profile.name ?? t("volumetria.profileFromLine"));
    } catch (err) {
      setVolError(err instanceof Error ? err.message : t("volumetria.error"));
    }
  }

  function generateVolCrossSections() {
    setVolError(null);
    const line = findAlignmentPolyline(project.entities, selectedId);
    if (!line) {
      setVolError(t("volumetria.needPolyline"));
      return;
    }
    const interval = parseMeters(sectionInterval) ?? 20;
    const half = parseMeters(sectionHalfWidth) ?? 10;
    try {
      const sections = generateTypicalCrossSections(project.entities, line.vertices, interval, half);
      setProject((prev) => {
        const hasLayer = prev.layers.some((l) => l.id === TRANSVERSAL_PROFILE_LAYER.id);
        return {
          ...prev,
          layers: hasLayer ? prev.layers : [...prev.layers, { ...TRANSVERSAL_PROFILE_LAYER }],
          entities: [...prev.entities, ...sections],
        };
      });
      if (sections[0]) setSelectedId(sections[0].id);
      setVolNotice(t("volumetria.sectionsDone", { count: sections.length }));
    } catch (err) {
      setVolError(err instanceof Error ? err.message : t("volumetria.error"));
    }
  }

  function downloadCsv(filename: string, csv: string) {
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename.endsWith(".csv") ? filename : `${filename}.csv`);
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
            const det = detectUtmZoneFromCoordinates(next.entities, undefined, next.crs);
            if (det.isGeoreferenced && det.coordMode === "utm") {
              setImportNotice(
                t("import.pointsOkWithZone", {
                  count: parsed.points.length,
                  name: file.name,
                  zone: det.zone,
                  epsg: det.epsg,
                  confidence: Math.round(det.confidence * 100),
                }),
              );
            } else {
              setImportNotice(t("import.pointsOk", { count: parsed.points.length, name: file.name }));
            }
            return next;
          });
          setImported(true);
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

  async function handleImportCadDrawingFile(file: File) {
    setImportingDrawing(true);
    setImportNotice(null);
    try {
      const result = await importCadDrawingFile(file, project);
      if (result.error || result.count === 0) {
        setImportNotice(result.error || t("import.drawingEmpty", { name: file.name }));
        return;
      }
      setProject(result.project);
      setViewBounds(computeViewportBoundsSafe(result.importedEntities));
      setImported(true);
      if (result.enableSatellite) {
        setBasemapOverlays((prev) => ({ ...prev, satellite: true }));
      }
      setImportNotice(t("import.drawingOk", { count: result.count, name: file.name }));
    } catch (err) {
      setImportNotice(err instanceof Error ? err.message : t("import.error"));
    } finally {
      setImportingDrawing(false);
    }
  }

  function toViewBoxCoords(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { sx: width / 2, sy: height / 2 };
    return clientToViewBox(clientX, clientY, rect, width, height);
  }

  function scheduleCursor(x: number, y: number) {
    pendingCursorRef.current = { x, y, z: 0 };
    if (cursorRafRef.current != null) return;
    cursorRafRef.current = window.requestAnimationFrame(() => {
      cursorRafRef.current = null;
      const next = pendingCursorRef.current;
      if (next) setCursor(next);
    });
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

  const lotIndexById = new Map(listReurbLots(project).map((lot, i) => [lot.id, i]));
  const streetPolys = project.entities.filter(
    (entity): entity is CadPolylineEntity =>
      entity.type === "polyline" && Boolean(entity.closed) && entity.layerId === LOTEAMENTO_VIAS_LAYER_ID,
  );
  const viaIndexById = new Map(streetPolys.map((via, i) => [via.id, i]));

  function renderPlanTexts(
    texts: { x: number; y: number; label: string; rotationDeg: number; role: string }[],
    fill: string,
    spanM?: number,
  ) {
    return texts.map((text, i) => {
      const { sx, sy } = worldToScreen(text.x, text.y, viewport);
      const role = text.role as Parameters<typeof planTextFontWeight>[0];
      const heightM = role === "street" ? 2.2 : 0.9;
      const maxPx = role === "street" ? 10 : 5.5;
      const fontSize =
        role === "lot-title" || role === "lot-area" || role === "lot-edge"
          ? cadastralLotFontSizePx(viewport, role, spanM)
          : annotationFontSizePx(viewport, heightM, spanM, maxPx);
      const textFill = planTextFillColor(role, fill);
      const halo = planTextHaloWidth(fontSize, role);
      const label = (
        <CadSvgMultilineText
          key={`plan-${text.role}-${i}-${text.label}`}
          x={sx}
          y={sy}
          label={text.label}
          fill={textFill}
          fontSize={fontSize}
          fontFamily={CAD_PLAN_FONT}
          fontWeight={planTextFontWeight(role, text.label)}
          textAnchor="middle"
          dominantBaseline="middle"
          rotationDeg={role === "lot-title" ? undefined : text.rotationDeg}
          stroke="#fff"
          strokeWidth={halo}
          paintOrder="stroke"
        />
      );
      if (role !== "lot-title") return label;
      const r = planLotTitleCircleRadius(fontSize);
      return (
        <g key={`plan-${text.role}-${i}-${text.label}`} transform={`rotate(${text.rotationDeg} ${sx} ${sy})`}>
          <circle cx={sx} cy={sy} r={r} fill="none" stroke="#fff" strokeWidth={Math.max(2, fontSize * 0.2)} />
          <circle cx={sx} cy={sy} r={r} fill="none" stroke={textFill} strokeWidth={Math.max(1.1, fontSize * 0.08)} />
          {label}
        </g>
      );
    });
  }

  function renderEntity(entity: CadEntity) {
    const layer = layerMap.get(entity.layerId);
    const lineColor = getLayerLineColor(layer);
    const layerTextColor = getLayerTextColor(layer);
    const layerTextSize = getLayerTextSize(layer);
    const selected = entity.id === selectedId;
    const isLotAnnotation =
      entity.layerId.startsWith("loteamento_") ||
      entity.layerId.startsWith("drenagem_") ||
      entity.layerId === "reurb_anotacoes" ||
      entity.layerId === "text";
    let lotSpanM: number | undefined;
    if (isLotAnnotation && entity.type === "polyline" && entity.closed && entity.vertices.length >= 3) {
      lotSpanM = lotMinSpanM(entity.vertices);
    } else if (isLotAnnotation && entity.type === "point" && entity.layerId === "reurb_anotacoes") {
      const host = findLoteamentoLotAtPoint(project, entity.x, entity.y);
      if (host) lotSpanM = lotMinSpanM(host.vertices);
    }
    const annotationPx = isLotAnnotation
      ? annotationFontSizePx(viewport, undefined, lotSpanM) * (layerTextSize / 10)
      : layerTextSize;

    if (entity.type === "point") {
      if (isStoredLotPlanAnnotation(entity)) return null;
      const { color: textColor, size: pointTextSize } = resolvePointTextStyle(entity, layer);
      const labelFontSize = isLotAnnotation
        ? annotationFontSizePx(viewport, undefined, lotSpanM) * (pointTextSize / 10)
        : pointTextSize;
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
        labelFontSize,
      );
      const showMarker = !isCoordLabelEntity(entity) && !isPlanTextOnlyPoint(entity);
      const isStructure = isDrainageStructureLayer(entity.layerId);
      const planRole = inferPlanTextRole(entity);
      const structureR = selected ? 8 : 6;
      const planFill =
        isPlanTextOnlyPoint(entity) || isStructure
          ? planTextFillColor(planRole, entity.textColor ?? CAD_PLAN_BLUE)
          : textColor;
      const planFamily = isPlanTextOnlyPoint(entity) || isStructure ? CAD_PLAN_FONT : undefined;
      const nodeFontSize =
        planRole === "node" || isStructure
          ? annotationFontSizePx(viewport, 0.8, undefined, 6)
          : planRole === "lot-title" || planRole === "lot-area" || planRole === "lot-edge"
            ? cadastralLotFontSizePx(viewport, planRole, lotSpanM)
            : labelFontSize;
      const labelX = coordLayout?.labelSx ?? (isPlanTextOnlyPoint(entity) ? sx : isStructure ? sx + structureR + 5 : sx + 8);
      const labelY = coordLayout?.labelSy ?? (isPlanTextOnlyPoint(entity) ? sy : isStructure ? sy - 2 : sy - 2);

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
            isStructure ? (
              <rect
                x={sx - structureR}
                y={sy - structureR}
                width={structureR * 2}
                height={structureR * 2}
                fill={lineColor}
                stroke={selected || isHovered ? "#fff" : "#0f172a"}
                strokeWidth={selected || isHovered ? 2 : 1}
              />
            ) : (
              <circle
                cx={sx}
                cy={sy}
                r={selected ? 7 : 5}
                fill={lineColor}
                stroke={selected || isHovered ? "#fff" : "#0f172a"}
                strokeWidth={selected || isHovered ? 2 : 1}
              />
            )
          ) : null}
          {entity.label ? (
            <CadSvgMultilineText
              x={labelX}
              y={labelY}
              label={entity.label}
              fill={planFill}
              fontSize={nodeFontSize}
              fontFamily={planFamily}
              fontWeight={planTextFontWeight(planRole, entity.label)}
              textAnchor={isPlanTextOnlyPoint(entity) ? "middle" : "start"}
              dominantBaseline={isPlanTextOnlyPoint(entity) ? "middle" : undefined}
              rotationDeg={entity.rotationDeg}
              stroke={isPlanTextOnlyPoint(entity) || isStructure ? "#fff" : undefined}
              strokeWidth={isPlanTextOnlyPoint(entity) || isStructure ? Math.max(2, nodeFontSize * 0.28) : undefined}
              paintOrder={isPlanTextOnlyPoint(entity) || isStructure ? "stroke" : undefined}
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
          stroke={selected ? "#fff" : lineColor}
          strokeWidth={getLayerLineWidth(layer, selected)}
          strokeDasharray={getLayerStrokeDasharray(layer)}
        />
      );
    }

    const pts = entity.vertices
      .map((v) => worldToScreen(v.x, v.y, viewport))
      .map((p) => `${p.sx},${p.sy}`)
      .join(" ");

    const isContour =
      entity.layerId === CONTOUR_LAYER.id || entity.layerId === INTERPOLATED_CONTOUR_LAYER.id;
    const isMajorContour = isContour && entity.contourMajor === true;
    const contourStroke = isMajorContour ? CONTOUR_COLOR_MAJOR : CONTOUR_COLOR_MINOR;
    const labelVertex = isMajorContour ? pickContourLabelVertex(entity.vertices) : null;
    const contourElevation =
      isMajorContour && labelVertex ? parseContourElevation(entity) : null;
    const contourLabel =
      contourElevation !== null ? formatContourElevationLabel(contourElevation) : null;

    const isClosed = !isContour && Boolean(entity.closed) && entity.vertices.length >= 3;
    const pipeFail =
      isDrainagePipeEntity(entity) &&
      drainageEntityHasRedError(entity, {
        minSlopePct: parseDrawNumber(drenagemMinSlope) ?? DEFAULT_DRAINAGE_PARAMS.minSlopePct,
        minVelocityMs: DRAINAGE_VELOCITY_MIN_MS,
        maxVelocityMs: DRAINAGE_VELOCITY_MAX_MS,
        laminaMax: DRAINAGE_LAMINA_RELATIVA_MAX,
      });
    const strokeColor = selected ? "#fff" : pipeFail ? "#dc2626" : isContour ? contourStroke : lineColor;
    const strokeW = isContour ? (isMajorContour ? 1.6 : 1) : getLayerLineWidth(layer, selected) + (pipeFail ? 0.8 : 0);
    const fillColor = getLayerPolygonFill(layer, selected);
    const strokeDasharray = getLayerStrokeDasharray(layer);

    return (
      <g key={entity.id}>
        {isClosed ? (
          <polygon
            points={pts}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeW}
          >
            {entity.layerId === LOTEAMENTO_LOTES_LAYER_ID
              ? (() => {
                  const tip = lotEsquinaTooltipOf(entity);
                  return tip ? <title>{tip}</title> : null;
                })()
              : null}
          </polygon>
        ) : (
          <polyline
            points={pts}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeDasharray={strokeDasharray}
            opacity={isContour ? (isMajorContour ? 1 : 0.85) : 1}
          />
        )}
        {isMajorContour && labelVertex && contourLabel ? (
          <text
            x={worldToScreen(labelVertex.x, labelVertex.y, viewport).sx + 4}
            y={worldToScreen(labelVertex.x, labelVertex.y, viewport).sy - 4}
            fill={contourStroke}
            fontSize={layerTextSize}
            fontWeight={700}
            fontFamily="Arial, sans-serif"
            stroke="#fff"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {contourLabel}
          </text>
        ) : null}
        {!isClosed && entity.layerId === DRENAGEM_TUBOS_LAYER.id && entity.name ? (() => {
          const pose = polylineLabelPose(entity.vertices);
          if (!pose) return null;
          const { sx: mx, sy: my } = worldToScreen(pose.x, pose.y, viewport);
          const pipeSize = annotationFontSizePx(viewport, 0.9, undefined, 6.5);
          return (
            <CadSvgMultilineText
              x={mx}
              y={my}
              label={entity.name}
              fill={pipeFail ? "#dc2626" : CAD_PLAN_BLUE}
              fontSize={pipeSize}
              fontFamily={CAD_PLAN_FONT}
              fontWeight={600}
              textAnchor="middle"
              dominantBaseline="middle"
              rotationDeg={pose.rotationDeg}
              stroke="#fff"
              strokeWidth={Math.max(2, pipeSize * 0.28)}
              paintOrder="stroke"
            />
          );
        })() : null}
        {!isContour && entity.closed && entity.layerId === LOTEAMENTO_VIAS_LAYER_ID ? (() => {
          const street = buildStreetPlanText(entity, viaIndexById.get(entity.id) ?? 0);
          if (!street) return null;
          return renderPlanTexts([street], CAD_PLAN_INK, lotMinSpanM(entity.vertices));
        })() : null}
        {!isContour && entity.closed && entity.layerId === LOTEAMENTO_LOTES_LAYER_ID ? (() => {
          const texts = buildCadastralLotPlanTexts(entity, lotIndexById.get(entity.id) ?? 0, {
            streets: streetPolys,
          });
          return renderPlanTexts(texts, CAD_PLAN_INK, lotMinSpanM(entity.vertices));
        })() : null}
        {!isContour && entity.closed && !SKIP_POLYGON_CENTER_LABEL_LAYERS.has(entity.layerId) ? (() => {
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
              fill={layerTextColor}
              fontSize={annotationPx}
              fontWeight={600}
              fontFamily="Arial, sans-serif"
            >
              <tspan x={sx} dy={-annotationPx * 0.6}>{polyName}</tspan>
              <tspan x={sx} dy={annotationPx * 1.35}>{formatAreaBr(metrics.areaM2)}</tspan>
            </text>
          );
        })() : null}
      </g>
    );
  }

  const selectedEntity = project.entities.find((e) => e.id === selectedId) ?? null;
  const selectedLayer = selectedEntity
    ? project.layers.find((l) => l.id === selectedEntity.layerId)
    : null;
  const selectedPolyline =
    selectedEntity?.type === "polyline" ? (selectedEntity as CadPolylineEntity) : null;
  const selectedMetrics =
    selectedPolyline && selectedPolyline.closed && selectedPolyline.vertices.length >= 3
      ? computePolygonMetrics(selectedPolyline.vertices, true, vertexLabels(selectedPolyline.vertices.length))
      : null;

  function resolveLotEsquinaInfo(lot: CadPolylineEntity, index = 0) {
    if (lot.lote?.tipo === "ESQUINA") {
      return {
        ...lot.lote,
        tooltip: formatLoteEsquinaTooltip({
          name: lot.name,
          index,
          areaM2: lot.lote.areaM2,
          areaMinimaM2: lot.lote.areaMinimaM2,
          atende: lot.lote.atende,
        }),
      };
    }
    if (lot.lote?.tipo === "INTERNO") return null;
    const streets = listLoteamentoStreetPolys(project);
    if (streets.length === 0) return null;
    const classified = classifyLot({
      lot,
      streets,
      areaMinimaInterno: resolveCurrentAreaMinimaInterno(),
      percentualEsquina: parseEsquinaPercent(),
      index,
    });
    if (classified.tipo !== "ESQUINA") return null;
    return {
      ...classified,
      tooltip: formatLoteEsquinaTooltip({
        name: lot.name,
        index,
        areaM2: classified.areaM2,
        areaMinimaM2: classified.areaMinimaM2,
        atende: classified.atende,
      }),
    };
  }

  const hoverLot =
    hoverLotId != null
      ? project.entities.find((e): e is CadPolylineEntity => e.id === hoverLotId && e.type === "polyline")
      : null;
  const selectedLotInfo =
    selectedPolyline && isLoteamentoLotEntity(selectedPolyline)
      ? resolveLotEsquinaInfo(selectedPolyline)
      : null;
  const hoverLotInfo = hoverLot && isLoteamentoLotEntity(hoverLot) ? resolveLotEsquinaInfo(hoverLot) : null;
  const esquinaTooltip = hoverLotInfo?.tooltip ?? selectedLotInfo?.tooltip ?? null;
  const selectedConfrontationMetrics =
    selectedPolyline && selectedPolyline.closed && selectedPolyline.vertices.length >= 3
      ? computePolygonMetrics(
          selectedPolyline.vertices,
          true,
          vertexLabelsPn(selectedPolyline.vertices.length),
        )
      : null;
  const selectedConfrontations = selectedConfrontationMetrics
    ? normalizeConfrontations(
        selectedConfrontationMetrics.segments.length,
        selectedPolyline?.confrontations,
      )
    : [];
  const canEditSelectedPolyline = selectedPolyline ? isEditablePolyline(selectedPolyline) : false;

  const cadTabs: { id: CadTabId; label: string }[] = [
    { id: "desenho", label: t("tabs.draw") },
    { id: "planilha", label: t("tabs.planilha") },
    { id: "layout", label: t("tabs.printLayout") },
  ];

  return (
    <div
      ref={workspaceRootRef}
      className={`cad-workspace relative flex min-h-0 flex-1 flex-col gap-2 text-[#111827] ${
        isCadFullscreen
          ? "h-full w-full overflow-hidden bg-[#f3f4f6] p-2"
          : "overflow-y-auto xl:overflow-hidden"
      }`}
    >
      {isCadFullscreen ? (
        <button
          type="button"
          onClick={() => void exitCadFullscreen()}
          className="fixed bottom-4 right-4 z-[90] rounded-lg bg-[#0f2848] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1e3a5f]"
        >
          {t("actions.exitFullscreen")}
        </button>
      ) : null}
      {maqueteOpen ? (
        <CadLoteamentoMaquete
          project={project}
          secaoTipo={currentSecaoTipoParams()}
          sidewalkFallbackM={parseDrawNumber(loteamentoLarguraCalcada) ?? 2}
          georef={projectGeoref}
          onClose={() => setMaqueteOpen(false)}
        />
      ) : null}
      {drenagem3dOpen ? (
        <CadDrenagem3d
          project={project}
          coverM={DEFAULT_DRAINAGE_PARAMS.minCoverM}
          minSlopePct={parseDrawNumber(drenagemMinSlope) ?? DEFAULT_DRAINAGE_PARAMS.minSlopePct}
          onClose={() => setDrenagem3dOpen(false)}
        />
      ) : null}
      <CadPointObservations
        entities={project.entities}
        layers={project.layers}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onUpdatePoint={updatePoint}
      />
      <div className="cad-interface flex shrink-0 items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-2 py-1.5">
        <div className="min-w-[9rem] max-w-[13rem] shrink-0">
          <label className="sr-only">{t("project.nameLabel")}</label>
          <input
            value={project.name}
            onChange={(e) => setProject((prev) => ({ ...prev, name: e.target.value }))}
            className="block w-full rounded-md border border-[#d1d5db] px-2 py-1 text-sm font-semibold text-[#0f2848]"
          />
          <p className="mt-0.5 truncate text-[10px] text-[#6b7280]" title={[
            project.crs,
            projectGeoref.isGeoreferenced && zoneDetection.coordMode === "utm"
              ? t("meta.zoneDetected", { zone: zoneDetection.zone, epsg: zoneDetection.epsg, confidence: Math.round(zoneDetection.confidence * 100) })
              : projectGeoref.isGeoreferenced && zoneDetection.coordMode === "wgs84"
                ? t("meta.wgs84Detected", { zone: zoneDetection.zone })
                : "",
            projectGeoref.isGeoreferenced ? projectGeoref.utmProjectionLabel : "",
            project.adjustment
              ? `${t("meta.adjusted")} RMS ${project.adjustment.rmsAfter.toFixed(4)} m (${project.adjustment.method})`
              : "",
            savedProjectId ? `ID ${savedProjectId.slice(-8)}` : "",
          ].filter(Boolean).join(" · ")}>
            {project.crs}
            {projectGeoref.isGeoreferenced && zoneDetection.coordMode === "utm"
              ? ` · ${zoneDetection.zone}S`
              : projectGeoref.isGeoreferenced && zoneDetection.coordMode === "wgs84"
                ? ` · WGS84`
                : ""}
            {savedProjectId ? ` · ${savedProjectId.slice(-8)}` : ""}
          </p>
          {projectNotice ? (
            <p className={`truncate text-[10px] font-medium ${projectNoticeError ? "text-red-600" : "text-emerald-700"}`}>
              {projectNotice}
            </p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => void handleSaveLocal()}
            disabled={savingLocal}
            title={t("project.saveSplitHint")}
            className="rounded-lg bg-[#0f2848] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {savingLocal ? t("project.saving") : t("actions.saveLocal")}
          </button>
          <button
            type="button"
            onClick={() => void handleSaveCloudDwg()}
            disabled={savingCloud}
            title={t("project.saveSplitHint")}
            className="rounded-lg bg-[#0e7490] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {savingCloud ? t("project.savingCloud") : t("actions.saveCloudDwg")}
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
            onClick={() => projectFileRef.current?.click()}
            className="rounded-lg border border-[#0f2848] px-4 py-2 text-sm font-medium text-[#0f2848]"
          >
            {t("actions.openFile")}
          </button>
          <button
            type="button"
            onClick={() => drawingFileRef.current?.click()}
            disabled={importingDrawing}
            title={t("import.drawingHint")}
            className="rounded-lg border border-[#0e7490] px-4 py-2 text-sm font-medium text-[#0e7490] hover:bg-[#ecfeff] disabled:opacity-50"
          >
            {importingDrawing ? t("import.drawingWorking") : t("actions.importDrawing")}
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
          <form
            className="relative flex w-[18rem] max-w-full min-w-[12rem] items-center gap-1"
            title={t("citySearch.hint")}
            onSubmit={(e) => {
              e.preventDefault();
              void searchCityZoom();
            }}
          >
            <input
              type="search"
              value={cityQuery}
              onChange={(e) => {
                setCityQuery(e.target.value);
                setCityHits([]);
                setCityNotice(null);
              }}
              placeholder={t("citySearch.placeholder")}
              className="min-w-[12rem] flex-1 rounded-lg border border-[#d1d5db] px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={cityBusy}
              className="rounded-lg bg-[#0f2848] px-3 py-2 text-sm font-medium text-white hover:bg-[#1e3a5f] disabled:opacity-50"
            >
              {cityBusy ? t("citySearch.working") : t("citySearch.go")}
            </button>
            {cityHits.length > 1 ? (
              <ul className="absolute left-0 top-full z-30 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-[#d1d5db] bg-white py-1 text-sm shadow-lg">
                {cityHits.map((hit) => (
                  <li key={`${hit.lat}-${hit.lng}-${hit.label}`}>
                    <button
                      type="button"
                      className="w-full px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                      onClick={() => zoomToCityHit(hit)}
                    >
                      {hit.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {cityNotice ? (
              <span className="absolute left-0 top-full z-20 mt-1 text-[10px] text-[#374151]">{cityNotice}</span>
            ) : null}
          </form>
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
          <button
            type="button"
            onClick={toggleCadFullscreen}
            aria-pressed={isCadFullscreen}
            title={isCadFullscreen ? t("actions.exitFullscreen") : t("actions.fullscreen")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              isCadFullscreen
                ? "bg-[#0f2848] text-white"
                : "border border-[#0f2848] text-[#0f2848] hover:bg-[#f0f4f8]"
            }`}
          >
            {isCadFullscreen ? t("actions.exitFullscreen") : t("actions.fullscreen")}
          </button>
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
            importNotice.includes("GDAL") ||
            importNotice.includes("Não foi possível")
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => projectFileRef.current?.click()}
                className="rounded-lg border border-[#0f2848] px-3 py-2 text-xs font-medium text-[#0f2848] hover:bg-[#f0fdff]"
              >
                {t("actions.openFile")}
              </button>
              <button
                type="button"
                onClick={handleNewProject}
                className="rounded-lg border border-[#d1d5db] px-3 py-2 text-xs font-medium text-[#0f2848] hover:bg-[#f9fafb]"
              >
                {t("actions.newProject")}
              </button>
            </div>
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
                      {t("project.entities", {
                        count: item.entityCount ?? item.project.entities.length,
                      })}
                      {item.hasDwg ? ` · ${t("project.hasDwg")}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleOpenProject(item.id)}
                      className="rounded-md bg-[#0f2848] px-3 py-1.5 text-xs font-medium text-white"
                    >
                      {t("project.open")}
                    </button>
                    {item.hasDwg ? (
                      <button
                        type="button"
                        onClick={() => void handleDownloadCloudDwg(item.id)}
                        className="rounded-md border border-[#0e7490] px-3 py-1.5 text-xs font-medium text-[#0e7490]"
                      >
                        {t("project.downloadDwg")}
                      </button>
                    ) : null}
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

      <div className="cad-interface flex shrink-0 flex-wrap items-center gap-1 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-1">
        <button
          type="button"
          onClick={() => setToolsSidebarOpen((v) => !v)}
          title={toolsSidebarOpen ? t("sidebar.hide") : t("sidebar.show")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            toolsSidebarOpen
              ? "bg-[#0f2848] text-white shadow-sm"
              : "border border-[#0f2848] bg-white text-[#0f2848]"
          }`}
        >
          {t("sidebar.show")}
        </button>
        {cadTabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              activeTab === item.id ? "bg-white text-[#0f2848] shadow-sm" : "text-[#6b7280]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
          {activeTab === "desenho" && !imported && project.entities.length === 0 ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-dashed border-[#d1d5db] bg-white px-3 py-1.5">
              <p className="min-w-0 flex-1 text-xs text-[#6b7280]">{t("empty.description")}</p>
              <button
                type="button"
                disabled={importingDrawing}
                onClick={() => drawingFileRef.current?.click()}
                title={t("import.drawingHint")}
                className="rounded-md border border-[#0e7490] px-2.5 py-1 text-xs font-medium text-[#0e7490] hover:bg-[#ecfeff] disabled:opacity-50"
              >
                {importingDrawing ? t("import.drawingWorking") : t("actions.importDrawing")}
              </button>
              <button
                type="button"
                disabled={importingPoints}
                onClick={openSurveyImport}
                className="rounded-md border border-[#38bdf8] px-2.5 py-1 text-xs font-medium text-[#0369a1] hover:bg-[#f0f9ff] disabled:opacity-50"
              >
                {importingPoints ? t("import.working") : t("import.pointsFile")}
              </button>
              <button
                type="button"
                disabled={importingPoints}
                onClick={openExcelImport}
                className="rounded-md border border-[#0f2848] px-2.5 py-1 text-xs font-medium text-[#0f2848] hover:bg-[#f0f4f8] disabled:opacity-50"
              >
                {importingPoints ? t("import.working") : t("import.excel")}
              </button>
              <button
                type="button"
                onClick={() => router.push("/digital-twin/gnss-rtk")}
                className="rounded-md bg-[#00c8f0] px-2.5 py-1 text-xs font-semibold text-[#0f2848]"
              >
                {t("empty.goValidation")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSnapToRtkPoints(false);
                  setImported(true);
                }}
                className="rounded-md border border-[#0f2848] px-2.5 py-1 text-xs font-medium text-[#0f2848]"
              >
                {t("empty.startBlank")}
              </button>
              {importNotice ? (
                <p className={`w-full text-[10px] ${importNotice.includes("Falha") || importNotice.includes("Nenhum") ? "text-red-600" : "text-emerald-700"}`}>
                  {importNotice}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 gap-2">
          {toolsSidebarOpen ? (
            <div
              className="flex h-full min-h-0 shrink-0 flex-col"
              style={{ width: CAD_TOOLS_PANEL_WIDTH_PX }}
            >
          <CadToolsSidebar
            activeTab={toolsTab}
            onTabChange={setToolsTab}
            onHide={() => setToolsSidebarOpen(false)}
            sections={{
              draw: (
                <div className="space-y-4">
                  <section>
                    <h3 className="text-sm font-semibold text-[#0f2848]">{t("import.title")}</h3>
                    <p className="mt-1 text-xs text-[#6b7280]">{t("import.hint")}</p>
                    <div className="mt-3 flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={importingDrawing}
                        onClick={() => drawingFileRef.current?.click()}
                        title={t("import.drawingHint")}
                        className="rounded-lg border border-[#0e7490] px-3 py-2 text-xs font-medium text-[#0e7490] hover:bg-[#ecfeff] disabled:opacity-50"
                      >
                        {importingDrawing ? t("import.drawingWorking") : t("actions.importDrawing")}
                      </button>
                      <p className="text-[10px] text-[#9ca3af]">{t("import.drawingHint")}</p>
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
                          <div>
                            <dt className="text-[#6b7280]">{t("properties.textColor")}</dt>
                            <dd className="flex items-center justify-between gap-2">
                              <input
                                type="color"
                                value={(selectedEntity.textColor ?? selectedLayer?.textColor ?? "#e2e8f0").slice(0, 7)}
                                onChange={(e) => updatePoint(selectedEntity.id, { textColor: e.target.value })}
                                className="h-7 w-10 cursor-pointer rounded border border-[#d1d5db] bg-white p-0.5"
                              />
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[#6b7280]">{t("properties.textSize")}</dt>
                            <dd>
                              <div className="mt-0.5 flex items-center gap-2">
                                <input
                                  type="range"
                                  min={6}
                                  max={36}
                                  step={1}
                                  value={selectedEntity.textSize ?? selectedLayer?.textSize ?? 10}
                                  onChange={(e) =>
                                    updatePoint(selectedEntity.id, { textSize: Number(e.target.value) })
                                  }
                                  className="flex-1"
                                />
                                <span className="w-8 text-right font-mono text-[10px] text-[#374151]">
                                  {(selectedEntity.textSize ?? selectedLayer?.textSize ?? 10).toFixed(0)}
                                </span>
                              </div>
                              <p className="mt-1 text-[10px] text-[#9ca3af]">{t("properties.textStyleHint")}</p>
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
                          {isDrainagePvEntity(selectedEntity) ? (
                            <>
                              <div>
                                <dt className="text-[#6b7280]">{t("drenagem.propsKind")}</dt>
                                <dd className="font-medium">
                                  {selectedEntity.drainage?.kind === "outfall"
                                    ? t("drenagem.propsOutfall")
                                    : selectedEntity.drainage?.kind === "inlet"
                                      ? t("drenagem.propsInlet")
                                      : t("drenagem.propsPv")}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[#6b7280]">{t("drenagem.propsStation")}</dt>
                                <dd className="font-mono">
                                  {(selectedEntity.drainage?.stationM ?? 0).toFixed(1)} m
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[#6b7280]">{t("drenagem.propsInvert")}</dt>
                                <dd>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    defaultValue={(selectedEntity.drainage?.invertZ ?? selectedEntity.z).toFixed(3)}
                                    key={`${selectedEntity.id}-inv`}
                                    onBlur={(e) => {
                                      const invertZ = parseDrawNumber(e.target.value);
                                      if (invertZ == null) return;
                                      setProject(updateDrainagePv(project, selectedEntity.id, { invertZ }));
                                    }}
                                    className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                                  />
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[#6b7280]">{t("drenagem.propsCover")}</dt>
                                <dd className="font-mono">
                                  {(selectedEntity.drainage?.coverDepthM ?? 0).toFixed(2)} m
                                </dd>
                              </div>
                            </>
                          ) : null}
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
                          {isDrainagePipeEntity(selectedPolyline) ? (
                            <>
                              <div>
                                <dt className="text-[#6b7280]">{t("drenagem.propsKind")}</dt>
                                <dd className="font-medium">
                                  {selectedPolyline.drainage?.pipeRole === "ramal"
                                    ? t("drenagem.propsRamal")
                                    : t("drenagem.propsPipe")}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[#6b7280]">{t("drenagem.propsLength")}</dt>
                                <dd className="font-mono">{(selectedPolyline.drainage?.lengthM ?? 0).toFixed(2)}</dd>
                              </div>
                              <div>
                                <dt className="text-[#6b7280]">{t("drenagem.propsSlope")}</dt>
                                <dd>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    defaultValue={String(selectedPolyline.drainage?.slopePct ?? "")}
                                    key={`${selectedPolyline.id}-i`}
                                    onBlur={(e) => {
                                      const slopePct = parseDrawNumber(e.target.value);
                                      if (slopePct == null) return;
                                      setProject(updateDrainagePipe(project, selectedPolyline.id, { slopePct }));
                                    }}
                                    className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                                  />
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[#6b7280]">{t("drenagem.propsDiameter")}</dt>
                                <dd>
                                  <select
                                    value={selectedPolyline.drainage?.diameterMm ?? 300}
                                    onChange={(e) =>
                                      setProject(
                                        updateDrainagePipe(project, selectedPolyline.id, {
                                          diameterMm: Number(e.target.value),
                                        }),
                                      )
                                    }
                                    className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                                  >
                                    {DRAINAGE_PIPE_DIAMETERS_MM.map((d) => (
                                      <option key={d} value={d}>
                                        Ø{d}
                                      </option>
                                    ))}
                                  </select>
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[#6b7280]">{t("drenagem.propsMaterial")}</dt>
                                <dd>
                                  <select
                                    value={selectedPolyline.drainage?.material ?? "Concreto"}
                                    onChange={(e) =>
                                      setProject(
                                        updateDrainagePipe(project, selectedPolyline.id, {
                                          material: e.target.value,
                                          nManning: DRAINAGE_MATERIALS[e.target.value],
                                        }),
                                      )
                                    }
                                    className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 text-xs"
                                  >
                                    {Object.keys(DRAINAGE_MATERIALS).map((name) => (
                                      <option key={name} value={name}>
                                        {name} (n={DRAINAGE_MATERIALS[name]})
                                      </option>
                                    ))}
                                  </select>
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[#6b7280]">{t("drenagem.propsInvert")} in / out</dt>
                                <dd className="grid grid-cols-2 gap-1">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    defaultValue={(selectedPolyline.drainage?.invertInZ ?? 0).toFixed(3)}
                                    key={`${selectedPolyline.id}-in`}
                                    onBlur={(e) => {
                                      const invertInZ = parseDrawNumber(e.target.value);
                                      if (invertInZ == null) return;
                                      setProject(updateDrainagePipe(project, selectedPolyline.id, { invertInZ }));
                                    }}
                                    className="rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                                  />
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    defaultValue={(selectedPolyline.drainage?.invertOutZ ?? 0).toFixed(3)}
                                    key={`${selectedPolyline.id}-out`}
                                    onBlur={(e) => {
                                      const invertOutZ = parseDrawNumber(e.target.value);
                                      if (invertOutZ == null) return;
                                      setProject(updateDrainagePipe(project, selectedPolyline.id, { invertOutZ }));
                                    }}
                                    className="rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                                  />
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[#6b7280]">{t("drenagem.propsQin")}</dt>
                                <dd className="font-mono">
                                  {(selectedPolyline.drainage?.qContribLps ?? 0).toFixed(1)}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[#6b7280]">{t("drenagem.propsQcap")}</dt>
                                <dd className="font-mono">
                                  {(selectedPolyline.drainage?.qCapacityLps ?? 0).toFixed(1)}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[#6b7280]">{t("drenagem.propsVelocity")}</dt>
                                <dd className="font-mono">
                                  {(selectedPolyline.drainage?.velocityMs ?? 0).toFixed(2)}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[#6b7280]">{t("drenagem.propsLamina")}</dt>
                                <dd className="font-mono">
                                  {(() => {
                                    const ratio = selectedPolyline.drainage?.flowDepthRatio ?? 0;
                                    const cls = classifyDrainageFlowDepthRatio(ratio);
                                    return `${cls.label}`;
                                  })()}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[#6b7280]">{t("drenagem.propsTc")}</dt>
                                <dd className="font-mono">
                                  {(selectedPolyline.drainage?.tcMin ?? 0).toFixed(1)}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[#6b7280]">{t("drenagem.propsStatus")}</dt>
                                <dd
                                  className={
                                    isDrainageAlertStatus(selectedPolyline.drainage?.status)
                                      ? "font-semibold text-red-700"
                                      : "font-semibold text-emerald-700"
                                  }
                                >
                                  {drenagemStatusLabel(selectedPolyline.drainage?.status)}
                                </dd>
                              </div>
                            </>
                          ) : null}
                          {selectedLayer && !selectedLayer.locked ? (
                            <>
                              <div>
                                <dt className="text-[#6b7280]">{t("properties.textColor")}</dt>
                                <dd>
                                  <input
                                    type="color"
                                    value={(selectedLayer.textColor ?? "#e2e8f0").slice(0, 7)}
                                    onChange={(e) =>
                                      updateLayerStyles(selectedLayer.id, { textColor: e.target.value })
                                    }
                                    className="mt-0.5 h-7 w-10 cursor-pointer rounded border border-[#d1d5db] bg-white p-0.5"
                                  />
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[#6b7280]">{t("properties.textSize")}</dt>
                                <dd>
                                  <div className="mt-0.5 flex items-center gap-2">
                                    <input
                                      type="range"
                                      min={6}
                                      max={36}
                                      step={1}
                                      value={selectedLayer.textSize ?? 10}
                                      onChange={(e) =>
                                        updateLayerStyles(selectedLayer.id, {
                                          textSize: Number(e.target.value),
                                        })
                                      }
                                      className="flex-1"
                                    />
                                    <span className="w-8 text-right font-mono text-[10px] text-[#374151]">
                                      {(selectedLayer.textSize ?? 10).toFixed(0)}
                                    </span>
                                  </div>
                                </dd>
                              </div>
                            </>
                          ) : null}
                          <div><dt className="text-[#6b7280]">{t("polygon.vertices")}</dt><dd>{selectedPolyline.vertices.length}</dd></div>
                          <div><dt className="text-[#6b7280]">{t("polygon.closed")}</dt><dd>{selectedPolyline.closed ? t("polygon.yes") : t("polygon.no")}</dd></div>
                          {selectedMetrics ? (
                            <>
                              <div><dt className="text-[#6b7280]">{t("polygon.area")}</dt><dd className="font-mono">{selectedMetrics.areaM2.toFixed(2)} m²</dd></div>
                              <div><dt className="text-[#6b7280]">{t("polygon.perimeter")}</dt><dd className="font-mono">{selectedMetrics.perimeterM.toFixed(2)} m</dd></div>
                            </>
                          ) : null}
                          {selectedLotInfo ? (
                            <>
                              <div>
                                <dt className="text-[#6b7280]">{t("loteamento.tipoLote")}</dt>
                                <dd className="font-semibold">{t("loteamento.tipoEsquina")}</dd>
                              </div>
                              <div>
                                <dt className="text-[#6b7280]">{t("loteamento.areaMinimaLote")}</dt>
                                <dd className="font-mono">{selectedLotInfo.areaMinimaM2.toFixed(2)} m²</dd>
                              </div>
                              <div>
                                <dt className="text-[#6b7280]">{t("loteamento.statusLote")}</dt>
                                <dd className={selectedLotInfo.atende ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>
                                  {selectedLotInfo.atende ? t("loteamento.statusAtende") : t("loteamento.statusNaoAtende")}
                                </dd>
                              </div>
                            </>
                          ) : null}
                          {ajusteTarget ? (
                            <div className="space-y-2 border-t border-[#e5e7eb] pt-3">
                              <p className="text-[10px] font-medium text-[#0f2848]">{t("loteamento.ajusteTitle")}</p>
                              <label className="block text-[10px] text-[#6b7280]">
                                {t("loteamento.ajusteTestada")}
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={ajusteTestada}
                                  onChange={(e) => setAjusteTestada(e.target.value)}
                                  className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                                />
                              </label>
                              <label className="block text-[10px] text-[#6b7280]">
                                {t("loteamento.ajusteProfundidade")}
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={ajusteProfundidade}
                                  onChange={(e) => setAjusteProfundidade(e.target.value)}
                                  className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                                />
                              </label>
                              <label className="block text-[10px] text-[#6b7280]">
                                {t("loteamento.ajusteArea")}
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={ajusteArea}
                                  onChange={(e) => setAjusteArea(e.target.value)}
                                  className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                                />
                              </label>
                              <button
                                type="button"
                                disabled={loteamentoBusy}
                                onClick={() => applyLoteamentoLotSizeFromPanel("quadra")}
                                className="w-full rounded-lg bg-[#0f2848] px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                              >
                                {loteamentoBusy ? t("loteamento.ajusteWorking") : t("loteamento.ajusteAplicarQuadra")}
                              </button>
                              {ajusteTarget.kind === "lote" ? (
                                <button
                                  type="button"
                                  disabled={loteamentoBusy}
                                  onClick={() => applyLoteamentoLotSizeFromPanel("lote")}
                                  className="w-full rounded-lg border border-[#0f2848] px-2 py-1.5 text-xs font-medium text-[#0f2848] disabled:opacity-50"
                                >
                                  {loteamentoBusy ? t("loteamento.ajusteWorking") : t("loteamento.ajusteAplicarLote")}
                                </button>
                              ) : null}
                              {loteamentoNotice ? (
                                <p className="text-xs text-emerald-700">{loteamentoNotice}</p>
                              ) : null}
                              {loteamentoError ? (
                                <p className="text-xs text-red-600">{loteamentoError}</p>
                              ) : null}
                            </div>
                          ) : null}
                          {canEditSelectedPolyline ? (
                            <div className="pt-2">
                              <button
                                type="button"
                                onClick={() => deleteSelectedEntity()}
                                title={t("polygon.deleteHint")}
                                className="w-full rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                              >
                                {t("polygon.delete")}
                              </button>
                            </div>
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
                              {selectedPolyline.closed && selectedPolyline.vertices.length >= 3 ? (
                                <button
                                  type="button"
                                  onClick={() => setTool("confrontacao")}
                                  className={`w-full rounded-lg px-3 py-2 text-xs font-medium ${
                                    tool === "confrontacao"
                                      ? "bg-[#00c8f0] text-[#0f2848]"
                                      : "border border-[#0f2848] text-[#0f2848]"
                                  }`}
                                >
                                  {t("tools.confrontacao")}
                                </button>
                              ) : null}
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
                  <p className="mt-2 text-xs text-[#6b7280]">{t("contour.demHint")}</p>
                  {googleElevationAvailable ? (
                    <p className="mt-1 text-xs text-emerald-700">
                      {t("contour.googleReady", {
                        elev: googleTestElevationM?.toFixed(0) ?? "—",
                      })}
                    </p>
                  ) : googleElevationNotice === "missing_key" ? (
                    <p className="mt-1 text-xs text-amber-700">{t("contour.googleNotConfiguredHint")}</p>
                  ) : googleElevationNotice === "fetch_failed" ? (
                    <p className="mt-1 text-xs text-amber-700">{t("contour.googleFetchFailed")}</p>
                  ) : googleElevationNotice && googleElevationNotice !== "test_failed" ? (
                    <p className="mt-1 text-xs text-red-600">{googleElevationNotice}</p>
                  ) : googleElevationNotice === "test_failed" ? (
                    <p className="mt-1 text-xs text-red-600">{t("contour.googleNotConfigured")}</p>
                  ) : (
                    <p className="mt-1 text-xs text-[#6b7280]">{t("contour.googleChecking")}</p>
                  )}
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
                  <label className="mt-3 flex items-center gap-2 text-xs text-[#374151]">
                    <input
                      type="checkbox"
                      checked={contourSmooth}
                      onChange={(e) => setContourSmooth(e.target.checked)}
                    />
                    {t("contour.smooth")}
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
                      disabled={
                        generatingDemContours ||
                        !projectGeoref.isGeoreferenced ||
                        !isViewportSmallEnoughForDemContours(bounds) ||
                        !googleElevationAvailable
                      }
                      onClick={() => void generateContoursFromMapDem("google")}
                      className="flex-1 rounded-lg bg-[#2563eb] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                      title={t("contour.googleHint")}
                    >
                      {generatingDemContours ? t("contour.demGenerating") : t("contour.googleGenerate")}
                    </button>
                    <button
                      type="button"
                      disabled={
                        generatingDemContours ||
                        !projectGeoref.isGeoreferenced ||
                        !isViewportSmallEnoughForDemContours(bounds)
                      }
                      onClick={() => void generateContoursFromMapDem("opentopo")}
                      className="flex-1 rounded-lg bg-[#0d9488] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                      title={t("contour.demHint")}
                    >
                      {generatingDemContours ? t("contour.demGenerating") : t("contour.demGenerate")}
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
                  <div className="mt-4 space-y-2 rounded-lg border border-[#fed7aa] bg-[#fff7ed] px-3 py-2">
                    <h4 className="text-xs font-semibold text-[#9a3412]">{t("contour.interpolateTitle")}</h4>
                    <p className="text-[10px] text-[#6b7280]">{t("contour.interpolateHint")}</p>
                    <p className="text-[10px] font-medium text-[#374151]">
                      {t("contour.points", { count: importedContourTerrain.samples.length })}
                      {importedContourTerrain.usedPolylines.length > 0
                        ? ` · ${importedContourTerrain.usedPolylines.length} curva(s)`
                        : ""}
                    </p>
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("contour.interpolateInterval")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={contourInterval}
                        onChange={(e) => setContourInterval(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("contour.interpolateMethod")}
                      <select
                        value={interpMethod}
                        onChange={(e) => setInterpMethod(e.target.value as ContourInterpolateMethod)}
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 text-xs"
                      >
                        <option value="tin">{t("contour.interpolateTin")}</option>
                        <option value="idw">{t("contour.interpolateIdw")}</option>
                        <option value="linear">{t("contour.interpolateLinear")}</option>
                      </select>
                    </label>
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("contour.interpolateAssignZ")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={interpAssignZ}
                        onChange={(e) => setInterpAssignZ(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <p className="text-[10px] text-[#9ca3af]">{t("contour.interpolateAssignZHint")}</p>
                    <label className="flex items-start gap-2 text-[10px] text-[#6b7280]">
                      <input
                        type="checkbox"
                        checked={interpUsePoints}
                        onChange={(e) => setInterpUsePoints(e.target.checked)}
                        className="mt-0.5 rounded border-[#d1d5db]"
                      />
                      {t("contour.interpolateUsePoints")}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={generatingInterp}
                        onClick={generateInterpolatedContoursFromPanel}
                        className="flex-1 rounded-lg bg-[#c2410c] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
                      >
                        {generatingInterp ? t("contour.interpolateGenerating") : t("contour.interpolateGenerate")}
                      </button>
                      <button
                        type="button"
                        onClick={clearInterpolatedContours}
                        className="rounded-lg border border-[#d1d5db] px-3 py-1.5 text-[11px]"
                      >
                        {t("contour.interpolateClear")}
                      </button>
                    </div>
                    {interpError ? <p className="text-xs text-red-600">{interpError}</p> : null}
                    {interpInfo ? <p className="text-xs text-emerald-700">{interpInfo}</p> : null}
                    {importedContourTerrain.missingZ.length > 0 && importedContourTerrain.usedPolylines.length === 0 ? (
                      <p className="text-[10px] text-amber-700">{t("contour.interpolateNeedZ")}</p>
                    ) : null}
                  </div>
                  {projectGeoref.isGeoreferenced && !isViewportSmallEnoughForDemContours(bounds) ? (
                    <p className="mt-2 text-xs text-amber-700">{t("contour.demZoomIn")}</p>
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
                      setAlignmentPickMode(false);
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
                    alignmentPickActive={alignmentPickMode}
                    onStartAlignmentPick={() => {
                      setAreaPickMode(false);
                      setDistancePickMode(false);
                      setDistancePickIds([]);
                      setProfilePickMode(false);
                      setProfilePickIds([]);
                      setAlignmentPickMode(true);
                      setProfilePickResult(null);
                    }}
                    onCancelAlignmentPick={() => setAlignmentPickMode(false)}
                  />
                  <p className="text-[10px] text-[#6b7280]">{t("commands.profileOps.chartHint")}</p>
                </div>
              ),
              volumetria: (
                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[#0f2848]">{t("volumetria.title")}</h3>
                    <p className="mt-1 text-xs text-[#6b7280]">{t("volumetria.hint")}</p>
                    <p className="mt-1 text-[10px] text-[#9ca3af]">{t("volumetria.methodHint")}</p>
                  </div>

                  <div className="rounded-lg border border-[#e5e7eb] px-3 py-2">
                    <h4 className="text-xs font-semibold text-[#0f2848]">{t("volumetria.contoursTitle")}</h4>
                    <p className="mt-1 text-[10px] text-[#6b7280]">{t("volumetria.contoursHint")}</p>
                    <p className="mt-2 text-[10px] font-medium text-[#374151]">
                      {t("contour.points", { count: elevationSamples.length })}
                    </p>
                    <label className="mt-2 block text-[10px] text-[#6b7280]">
                      {t("contour.interval")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={contourInterval}
                        onChange={(e) => setContourInterval(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={generatingContours || elevationSamples.length < 3}
                        onClick={generateContours}
                        className="flex-1 rounded-lg bg-[#7c3aed] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
                      >
                        {generatingContours ? t("contour.generating") : t("contour.generate")}
                      </button>
                      <button
                        type="button"
                        onClick={generateTin}
                        disabled={generatingTin || elevationSamples.length < 3}
                        className="flex-1 rounded-lg bg-[#6366f1] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
                      >
                        {generatingTin ? t("tin.generating") : t("volumetria.mdtGenerate")}
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={generateContourLabels}
                        className="flex-1 rounded-lg bg-[#0f2848] px-3 py-1.5 text-[11px] font-medium text-white"
                      >
                        {t("volumetria.labels")}
                      </button>
                      <button
                        type="button"
                        onClick={clearContourLabels}
                        className="rounded-lg border border-[#d1d5db] px-3 py-1.5 text-[11px]"
                      >
                        {t("volumetria.labelsClear")}
                      </button>
                      <button
                        type="button"
                        onClick={clearContours}
                        className="rounded-lg border border-[#d1d5db] px-3 py-1.5 text-[11px]"
                      >
                        {t("contour.clear")}
                      </button>
                    </div>
                    <div className="mt-3 space-y-2 border-t border-[#e5e7eb] pt-2">
                      <h5 className="text-[11px] font-semibold text-[#9a3412]">{t("contour.interpolateTitle")}</h5>
                      <p className="text-[10px] text-[#6b7280]">{t("contour.interpolateHint")}</p>
                      <label className="block text-[10px] text-[#6b7280]">
                        {t("contour.interpolateInterval")}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={contourInterval}
                          onChange={(e) => setContourInterval(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                        />
                      </label>
                      <label className="flex items-start gap-2 text-[10px] text-[#6b7280]">
                        <input
                          type="checkbox"
                          checked={interpUsePoints}
                          onChange={(e) => setInterpUsePoints(e.target.checked)}
                          className="mt-0.5 rounded border-[#d1d5db]"
                        />
                        {t("contour.interpolateUsePoints")}
                      </label>
                      <label className="block text-[10px] text-[#6b7280]">
                        {t("contour.interpolateAssignZ")}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={interpAssignZ}
                          onChange={(e) => setInterpAssignZ(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={generatingInterp}
                          onClick={generateInterpolatedContoursFromPanel}
                          className="flex-1 rounded-lg bg-[#c2410c] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
                        >
                          {generatingInterp ? t("contour.interpolateGenerating") : t("contour.interpolateGenerate")}
                        </button>
                        <button
                          type="button"
                          onClick={clearInterpolatedContours}
                          className="rounded-lg border border-[#d1d5db] px-3 py-1.5 text-[11px]"
                        >
                          {t("contour.interpolateClear")}
                        </button>
                      </div>
                      {interpError ? <p className="text-xs text-red-600">{interpError}</p> : null}
                      {interpInfo ? <p className="text-xs text-emerald-700">{interpInfo}</p> : null}
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 space-y-2">
                    <h4 className="text-xs font-semibold text-[#7f1d1d]">{t("volumetria.loteamentoCutFillTitle")}</h4>
                    <p className="text-[10px] text-[#6b7280]">{t("volumetria.loteamentoCutFillHint")}</p>
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("volumetria.loteamentoPlateauZ")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={volPlateauZ}
                        onChange={(e) => setVolPlateauZ(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <p className="text-[10px] text-[#9ca3af]">{t("volumetria.loteamentoPlateauZHint")}</p>
                    <button
                      type="button"
                      disabled={volBusy}
                      onClick={calculateLoteamentoCutFill}
                      className="w-full rounded-lg bg-[#b91c1c] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
                    >
                      {volBusy ? t("volumetria.calculating") : t("volumetria.loteamentoCutFillCalculate")}
                    </button>
                    {volResult ? (
                      <div className="text-[11px] text-[#0f2848]">
                        <p>{t("volumetria.cut", { value: formatVolumeM3(volResult.cutM3) })}</p>
                        <p>{t("volumetria.fill", { value: formatVolumeM3(volResult.fillM3) })}</p>
                        <p>{t("volumetria.net", { value: formatVolumeM3(volResult.netM3) })}</p>
                      </div>
                    ) : null}
                    {volError ? <p className="text-xs text-red-600">{volError}</p> : null}
                    {volNotice ? <p className="text-xs text-emerald-700">{volNotice}</p> : null}
                  </div>

                  <div className="rounded-lg border border-[#e5e7eb] px-3 py-2">
                    <h4 className="text-xs font-semibold text-[#0f2848]">{t("volumetria.volumeTitle")}</h4>
                    <p className="mt-1 text-[10px] text-[#6b7280]">{t("volumetria.volumeHint")}</p>
                    <label className="mt-2 block text-[10px] font-medium text-[#374151]">
                      {t("volumetria.designMode")}
                      <select
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 text-xs"
                        value={volDesignMode}
                        onChange={(e) => setVolDesignMode(e.target.value as VolDesignMode)}
                      >
                        <option value="flat">{t("volumetria.modeFlat")}</option>
                        <option value="inclined3">{t("volumetria.modeInclined3")}</option>
                        <option value="strikeDip">{t("volumetria.modeStrikeDip")}</option>
                        <option value="twoElev">{t("volumetria.modeTwoElev")}</option>
                        <option value="mdt">{t("volumetria.modeMdt")}</option>
                      </select>
                    </label>
                    {volDesignMode === "flat" || volDesignMode === "strikeDip" ? (
                      <label className="mt-2 block text-[10px] text-[#6b7280]">
                        {t("volumetria.plateauZ")}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={volPlateauZ}
                          onChange={(e) => setVolPlateauZ(e.target.value)}
                          placeholder={
                            elevationSamples.length ? meanElevation(elevationSamples).toFixed(2) : ""
                          }
                          className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                        />
                      </label>
                    ) : null}
                    {volDesignMode === "strikeDip" ? (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="block text-[10px] text-[#6b7280]">
                          {t("volumetria.strike")}
                          <input
                            type="text"
                            value={volStrike}
                            onChange={(e) => setVolStrike(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 font-mono text-xs"
                          />
                        </label>
                        <label className="block text-[10px] text-[#6b7280]">
                          {t("volumetria.dip")}
                          <input
                            type="text"
                            value={volDip}
                            onChange={(e) => setVolDip(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 font-mono text-xs"
                          />
                        </label>
                      </div>
                    ) : null}
                    {volDesignMode === "twoElev" ? (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="block text-[10px] text-[#6b7280]">
                          {t("volumetria.zStart")}
                          <input
                            type="text"
                            value={volZStart}
                            onChange={(e) => setVolZStart(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 font-mono text-xs"
                          />
                        </label>
                        <label className="block text-[10px] text-[#6b7280]">
                          {t("volumetria.zEnd")}
                          <input
                            type="text"
                            value={volZEnd}
                            onChange={(e) => setVolZEnd(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 font-mono text-xs"
                          />
                        </label>
                      </div>
                    ) : null}
                    {volDesignMode === "mdt" ? (
                      <label className="mt-2 block text-[10px] font-medium text-[#374151]">
                        {t("volumetria.designLayer")}
                        <select
                          className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 text-xs"
                          value={volDesignLayerId}
                          onChange={(e) => setVolDesignLayerId(e.target.value)}
                        >
                          <option value="">{t("volumetria.needDesignLayer")}</option>
                          {volDesignLayers.map((layer) => (
                            <option key={layer.id} value={layer.id}>
                              {layer.name} ({layer.count})
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label className="mt-2 flex items-center gap-2 text-[11px] text-[#374151]">
                      <input
                        type="checkbox"
                        checked={volClipToPolygon}
                        onChange={(e) => setVolClipToPolygon(e.target.checked)}
                      />
                      {t("volumetria.clipRegion")}
                    </label>
                    <button
                      type="button"
                      disabled={volBusy || elevationSamples.length < 3}
                      onClick={calculateVolume}
                      className="mt-2 w-full rounded-lg bg-[#0f2848] px-3 py-2 text-xs font-medium text-white hover:bg-[#1e3a5f] disabled:opacity-50"
                    >
                      {volBusy ? t("volumetria.calculating") : t("volumetria.calculate")}
                    </button>
                    {volResult ? (
                      <div className="mt-2 space-y-1 text-[11px] text-[#374151]">
                        <p>{t("volumetria.cut", { value: formatVolumeM3(volResult.cutM3) })}</p>
                        <p>{t("volumetria.fill", { value: formatVolumeM3(volResult.fillM3) })}</p>
                        <p>{t("volumetria.net", { value: formatVolumeM3(volResult.netM3) })}</p>
                        <p>
                          {t("volumetria.area", {
                            value: formatCoordBr(volResult.areaM2, 2),
                            triangles: volResult.usedTriangleCount,
                          })}
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => downloadOdsBlob(buildVolumeOdsBlob(volResult), volumeOdsFilename(project))}
                            className="rounded-lg border border-[#0f2848] px-2 py-1 text-[10px] font-medium text-[#0f2848]"
                          >
                            {t("volumetria.downloadVolume")}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              downloadCsv(
                                volumeOdsFilename(project).replace(/\.ods$/, ".csv"),
                                sheetsToCsv(volumeSummarySheets(volResult)),
                              )
                            }
                            className="rounded-lg border border-[#d1d5db] px-2 py-1 text-[10px]"
                          >
                            {t("volumetria.downloadVolumeCsv")}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <h5 className="mt-3 text-[11px] font-semibold text-[#0f2848]">{t("volumetria.stakeoutTitle")}</h5>
                    <p className="mt-1 text-[10px] text-[#6b7280]">{t("volumetria.stakeoutHint")}</p>
                    <label className="mt-2 block text-[10px] text-[#6b7280]">
                      {t("volumetria.gridStep")}
                      <input
                        type="text"
                        value={volGridStep}
                        onChange={(e) => setVolGridStep(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={generateStakeout}
                      className="mt-2 w-full rounded-lg border border-[#0f2848] px-3 py-1.5 text-xs font-medium text-[#0f2848] hover:bg-[#f0f4f8]"
                    >
                      {t("volumetria.stakeoutGenerate")}
                    </button>
                    {volStakeout && volStakeout.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            downloadOdsBlob(buildStakeoutOdsBlob(volStakeout), stakeoutOdsFilename(project))
                          }
                          className="rounded-lg bg-[#0f2848] px-2 py-1 text-[10px] font-medium text-white"
                        >
                          {t("volumetria.downloadStakeout")}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadCsv(
                              stakeoutOdsFilename(project).replace(/\.ods$/, ".csv"),
                              sheetsToCsv(stakeoutSheets(volStakeout)),
                            )
                          }
                          className="rounded-lg border border-[#d1d5db] px-2 py-1 text-[10px]"
                        >
                          {t("volumetria.downloadStakeoutCsv")}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-[#e5e7eb] px-3 py-2">
                    <h4 className="text-xs font-semibold text-[#0f2848]">{t("volumetria.streetTitle")}</h4>
                    <p className="mt-1 text-[10px] text-[#6b7280]">{t("volumetria.streetHint")}</p>
                    <p className="mt-1 text-[10px] text-[#9ca3af]">{t("volumetria.streetMethodHint")}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="block text-[10px] text-[#6b7280]">
                        {t("volumetria.stationInterval")}
                        <input
                          type="text"
                          value={streetInterval}
                          onChange={(e) => setStreetInterval(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 font-mono text-xs"
                        />
                      </label>
                      <label className="block text-[10px] text-[#6b7280]">
                        {t("volumetria.halfWidth")}
                        <input
                          type="text"
                          value={streetHalfWidth}
                          onChange={(e) => setStreetHalfWidth(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 font-mono text-xs"
                        />
                      </label>
                      <label className="block text-[10px] text-[#6b7280]">
                        {t("volumetria.zStart")}
                        <input
                          type="text"
                          value={streetZStart}
                          onChange={(e) => setStreetZStart(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 font-mono text-xs"
                        />
                      </label>
                      <label className="block text-[10px] text-[#6b7280]">
                        {t("volumetria.zEnd")}
                        <input
                          type="text"
                          value={streetZEnd}
                          onChange={(e) => setStreetZEnd(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 font-mono text-xs"
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={generateStreetNotes}
                      className="mt-2 w-full rounded-lg bg-[#0f2848] px-3 py-2 text-xs font-medium text-white hover:bg-[#1e3a5f]"
                    >
                      {t("volumetria.streetGenerate")}
                    </button>
                    {streetNotes ? (
                      <>
                        <div className="mt-2 max-h-40 overflow-auto rounded border border-[#e5e7eb]">
                          <table className="w-full text-left text-[9px] text-[#374151]">
                            <thead className="sticky top-0 bg-[#f9fafb]">
                              <tr>
                                <th className="px-1 py-0.5">Estaca</th>
                                <th className="px-1 py-0.5">Off</th>
                                <th className="px-1 py-0.5">Zt</th>
                                <th className="px-1 py-0.5">Zp</th>
                                <th className="px-1 py-0.5">C</th>
                                <th className="px-1 py-0.5">A</th>
                              </tr>
                            </thead>
                            <tbody>
                              {streetNotes.rows
                                .filter((row) => row.offsetM === 0)
                                .slice(0, 40)
                                .map((row, i) => (
                                  <tr key={`${row.stationM}-${i}`} className="odd:bg-white even:bg-[#f9fafb]">
                                    <td className="px-1 py-0.5 font-mono">{row.stationM.toFixed(1)}</td>
                                    <td className="px-1 py-0.5 font-mono">{row.offsetM.toFixed(1)}</td>
                                    <td className="px-1 py-0.5 font-mono">{row.zTerrain.toFixed(2)}</td>
                                    <td className="px-1 py-0.5 font-mono">{row.zDesign.toFixed(2)}</td>
                                    <td className="px-1 py-0.5 font-mono">{row.cutM.toFixed(2)}</td>
                                    <td className="px-1 py-0.5 font-mono">{row.fillM.toFixed(2)}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              downloadOdsBlob(buildServiceNotesOdsBlob(streetNotes), serviceNotesOdsFilename(project))
                            }
                            className="rounded-lg bg-[#0f2848] px-2 py-1 text-[10px] font-medium text-white"
                          >
                            {t("volumetria.downloadNotes")}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              downloadCsv(
                                serviceNotesOdsFilename(project).replace(/\.ods$/, ".csv"),
                                sheetsToCsv(serviceNotesSheets(streetNotes)),
                              )
                            }
                            className="rounded-lg border border-[#d1d5db] px-2 py-1 text-[10px]"
                          >
                            {t("volumetria.downloadNotesCsv")}
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-[#e5e7eb] px-3 py-2">
                    <h4 className="text-xs font-semibold text-[#0f2848]">{t("volumetria.profileTitle")}</h4>
                    <p className="mt-1 text-[10px] text-[#6b7280]">{t("volumetria.profileHint")}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setAreaPickMode(false);
                        setDistancePickMode(false);
                        setDistancePickIds([]);
                        setProfilePickMode(true);
                        setProfilePickIds([]);
                        setProfilePickResult(null);
                        setVolNotice(t("volumetria.profilePickActive"));
                      }}
                      className="mt-2 w-full rounded-lg border border-[#0f2848] px-3 py-1.5 text-xs font-medium text-[#0f2848] hover:bg-[#f0f4f8]"
                    >
                      {profilePickMode ? t("volumetria.profilePickActive") : t("volumetria.profilePick")}
                    </button>
                    <button
                      type="button"
                      onClick={generateVolLongProfileFromLine}
                      className="mt-2 w-full rounded-lg bg-[#0f2848] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1e3a5f]"
                    >
                      {t("volumetria.profileFromLine")}
                    </button>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="block text-[10px] text-[#6b7280]">
                        {t("volumetria.stationInterval")}
                        <input
                          type="text"
                          value={sectionInterval}
                          onChange={(e) => setSectionInterval(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 font-mono text-xs"
                        />
                      </label>
                      <label className="block text-[10px] text-[#6b7280]">
                        {t("volumetria.halfWidth")}
                        <input
                          type="text"
                          value={sectionHalfWidth}
                          onChange={(e) => setSectionHalfWidth(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 font-mono text-xs"
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={generateVolCrossSections}
                      className="mt-2 w-full rounded-lg bg-[#7c3aed] px-3 py-2 text-xs font-medium text-white hover:bg-[#6d28d9]"
                    >
                      {t("volumetria.sectionsGenerate")}
                    </button>
                  </div>

                  {volError ? <p className="text-xs text-red-600">{volError}</p> : null}
                  {volNotice ? <p className="text-xs text-[#374151]">{volNotice}</p> : null}
                  {contourInfo && toolsTab === "volumetria" ? (
                    <p className="text-xs text-emerald-700">{contourInfo}</p>
                  ) : null}
                  {tinInfo && toolsTab === "volumetria" ? (
                    <p className="text-xs text-emerald-700">{tinInfo}</p>
                  ) : null}
                </section>
              ),
              anm: (
                <section>
                  <h3 className="text-sm font-semibold text-[#0f2848]">{t("basemap.anmSectionTitle")}</h3>
                  <p className="mt-1 text-xs text-[#6b7280]">{t("basemap.anmSectionHint")}</p>
                  <ul className="mt-3 space-y-2">
                    {ANM_SIGMINE_LAYER_KEYS.map((layerKey) => {
                      const def = ANM_SIGMINE_LAYERS[layerKey];
                      const importKey = `anm:${layerKey}`;
                      const importedCount = countAnmLayerEntities(project.entities, layerKey);
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
                              {importedCount > 0 ? (
                                <span className="mt-1 block text-[10px] font-medium text-[#374151]">
                                  {t("basemap.anmImportedCount", { count: importedCount })}
                                </span>
                              ) : null}
                            </span>
                          </label>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={importingOverlay !== null}
                              onClick={() => void handleImportOverlay("anm", layerKey)}
                              className="flex-1 rounded border px-2 py-1.5 text-[11px] font-medium disabled:opacity-50"
                              style={{ borderColor: def.color, color: def.color }}
                            >
                              {importingOverlay === importKey
                                ? "…"
                                : t("basemap.importAnmLayer", {
                                    layer: t(`basemap.anmLayers.${layerKey}`),
                                  })}
                            </button>
                            {importedCount > 0 ? (
                              <button
                                type="button"
                                onClick={() => clearAnmLayerImport(layerKey)}
                                className="rounded border border-[#d1d5db] px-2 py-1.5 text-[11px] text-[#6b7280] hover:bg-[#f9fafb]"
                              >
                                {t("basemap.clearAnmLayer")}
                              </button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {totalAnmImported > 0 ? (
                    <button
                      type="button"
                      onClick={clearAllAnmImports}
                      className="mt-3 w-full rounded-lg border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-xs font-medium text-[#b91c1c] hover:bg-[#fee2e2]"
                    >
                      {t("basemap.clearAnmAll", { count: totalAnmImported })}
                    </button>
                  ) : null}
                  {overlayNotice && toolsTab === "anm" ? (
                    <p className="mt-2 text-xs text-[#374151]">{overlayNotice}</p>
                  ) : null}
                  <p className="mt-2 text-[10px] text-[#9ca3af]">
                    {t("basemap.anmOpenDataCredit")}
                  </p>
                </section>
              ),
              sigef: (
                <section>
                  <h3 className="text-sm font-semibold text-[#0f2848]">{t("basemap.sigefSectionTitle")}</h3>
                  <p className="mt-1 text-xs text-[#6b7280]">{t("basemap.sigefSectionHint")}</p>
                  <label className="mt-3 block text-xs font-medium text-[#374151]">
                    {t("basemap.sigefUf")}
                    <select
                      className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 text-xs"
                      value={basemapOverlays.sigef.uf}
                      onChange={(e) => patchSigefUf(e.target.value)}
                    >
                      {SIGEF_UFS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-2 block text-xs font-medium text-[#374151]">
                    {t("basemap.sigefCodigoImovel")}
                    <input
                      className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 text-xs"
                      value={sigefCodigoImovel}
                      onChange={(e) => setSigefCodigoImovel(e.target.value)}
                    />
                  </label>
                  <label className="mt-2 block text-xs font-medium text-[#374151]">
                    {t("basemap.sigefCns")}
                    <input
                      className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 text-xs"
                      value={sigefCns}
                      onChange={(e) => setSigefCns(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={exportSigefOds}
                    className="mt-3 w-full rounded-lg bg-[#0f2848] px-3 py-2 text-xs font-medium text-white hover:bg-[#1e3a5f]"
                  >
                    {t("basemap.sigefExportOds")}
                  </button>
                  <ul className="mt-3 space-y-2">
                    {SIGEF_LAYER_KEYS.map((layerKey) => {
                      const def = SIGEF_LAYERS[layerKey];
                      const importKey = `sigef:${layerKey}`;
                      const importedCount = countSigefLayerEntities(project.entities, layerKey);
                      return (
                        <li
                          key={layerKey}
                          className="rounded-lg border border-[#f3f4f6] px-3 py-2"
                        >
                          <label className="flex items-start gap-2 text-xs">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={basemapOverlays.sigef[layerKey]}
                              onChange={(e) => patchSigefOverlay(layerKey, e.target.checked)}
                            />
                            <span>
                              <span className="font-medium" style={{ color: def.color }}>
                                {t(`basemap.sigefLayers.${layerKey}`)}
                              </span>
                              <span className="mt-0.5 block text-[10px] text-[#9ca3af]">
                                {t(`basemap.sigefLayersHint.${layerKey}`)}
                              </span>
                              {importedCount > 0 ? (
                                <span className="mt-1 block text-[10px] font-medium text-[#374151]">
                                  {t("basemap.sigefImportedCount", { count: importedCount })}
                                </span>
                              ) : null}
                            </span>
                          </label>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={importingOverlay !== null}
                              onClick={() => void handleImportOverlay("sigef", layerKey)}
                              className="flex-1 rounded border px-2 py-1.5 text-[11px] font-medium disabled:opacity-50"
                              style={{ borderColor: def.color, color: def.color }}
                            >
                              {importingOverlay === importKey
                                ? "…"
                                : t("basemap.importSigefLayer", {
                                    layer: t(`basemap.sigefLayers.${layerKey}`),
                                  })}
                            </button>
                            {importedCount > 0 ? (
                              <button
                                type="button"
                                onClick={() => clearSigefLayerImport(layerKey)}
                                className="rounded border border-[#d1d5db] px-2 py-1.5 text-[11px] text-[#6b7280] hover:bg-[#f9fafb]"
                              >
                                {t("basemap.clearSigefLayer")}
                              </button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {totalSigefImported > 0 ? (
                    <button
                      type="button"
                      onClick={clearAllSigefImports}
                      className="mt-3 w-full rounded-lg border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-xs font-medium text-[#b91c1c] hover:bg-[#fee2e2]"
                    >
                      {t("basemap.clearSigefAll", { count: totalSigefImported })}
                    </button>
                  ) : null}
                  {overlayNotice && toolsTab === "sigef" ? (
                    <p className="mt-2 text-xs text-[#374151]">{overlayNotice}</p>
                  ) : null}
                  <div className="mt-3 flex flex-col gap-1 text-[10px]">
                    <a
                      className="text-[#2563eb] hover:underline"
                      href={SIGEF_CONSULTA}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("basemap.sigefPortal")}
                    </a>
                    <a
                      className="text-[#2563eb] hover:underline"
                      href={SIGEF_MODELO_ODS}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("basemap.sigefModelo")}
                    </a>
                    <a
                      className="text-[#2563eb] hover:underline"
                      href={SIGEF_EXTENSAO_OXT}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("basemap.sigefExtensao")}
                    </a>
                  </div>
                  <p className="mt-2 text-[10px] text-[#9ca3af]">{t("basemap.sigefOfficialNote")}</p>
                </section>
              ),
              loteamento: (
                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[#0f2848]">{t("loteamento.title")}</h3>
                    <p className="mt-1 text-xs text-[#6b7280]">{t("loteamento.hint")}</p>
                    <p className="mt-1 text-xs text-[#0f2848]">{t("loteamento.eixoEditHint")}</p>
                  </div>
                  <div className="rounded-lg border border-[#e5e7eb] px-3 py-2">
                    <label className="block text-[10px] font-medium text-[#374151]">
                      {t("loteamento.gleba")}
                      {loteamentoGlebas.length === 0 ? (
                        <p className="mt-2 text-xs text-amber-700">{t("loteamento.glebaEmpty")}</p>
                      ) : (
                        <select
                          className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 text-xs"
                          value={loteamentoGlebaId}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            setLoteamentoGlebaId(nextId);
                            setLoteamentoError(null);
                            setLoteamentoLados([]);
                            setLoteamentoPickLado(false);
                            if (nextId) setSelectedId(nextId);
                          }}
                        >
                          <option value="">{t("loteamento.glebaPick")}</option>
                          {loteamentoGlebas.map((poly, index) => (
                            <option key={poly.id} value={poly.id}>
                                      {closedPolygonLabel(poly, index)} ({poly.vertices.length}{" "}
                              {t("loteamento.vertices")})
                            </option>
                          ))}
                        </select>
                      )}
                    </label>
                  </div>
                  <div className="rounded-lg border border-[#e5e7eb] px-3 py-2">
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("loteamento.larguraVia")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={loteamentoLarguraVia}
                        onChange={(e) => setLoteamentoLarguraVia(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <p className="mt-1 text-[10px] text-[#9ca3af]">{t("loteamento.larguraViaHint")}</p>
                    <label className="mt-2 block text-[10px] text-[#6b7280]">
                      {t("loteamento.larguraCalcada")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={loteamentoLarguraCalcada}
                        onChange={(e) => setLoteamentoLarguraCalcada(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <p className="mt-1 text-[10px] text-[#9ca3af]">{t("loteamento.larguraCalcadaHint")}</p>
                    <label className="mt-2 flex items-center gap-2 text-[10px] text-[#6b7280]">
                      <input
                        type="checkbox"
                        checked={loteamentoEixoRua}
                        onChange={(e) => setLoteamentoEixoRua(e.target.checked)}
                        className="rounded border-[#d1d5db]"
                      />
                      {t("loteamento.eixoRua")}
                    </label>
                    <label className="mt-2 block text-[10px] text-[#6b7280]">
                      {t("loteamento.raioEsquina")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={loteamentoRaioEsquina}
                        onChange={(e) => setLoteamentoRaioEsquina(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <p className="mt-1 text-[10px] text-[#9ca3af]">{t("loteamento.raioEsquinaHint")}</p>
                    <label className="mt-2 block text-[10px] text-[#6b7280]">
                      {t("loteamento.profundidadeQuadra")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={loteamentoProfundidade}
                        onChange={(e) => setLoteamentoProfundidade(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <p className="mt-1 text-[10px] text-[#9ca3af]">{t("loteamento.profundidadeQuadraHint")}</p>
                    <label className="mt-2 block text-[10px] text-[#6b7280]">
                      {t("loteamento.testadaMinima")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={loteamentoTestada}
                        onChange={(e) => setLoteamentoTestada(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <label className="mt-2 block text-[10px] text-[#6b7280]">
                      {t("loteamento.acrescimoEsquina")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={loteamentoPercentualEsquina}
                        onChange={(e) => setLoteamentoPercentualEsquina(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <p className="mt-1 text-[10px] text-[#9ca3af]">{t("loteamento.acrescimoEsquinaHint")}</p>
                    <fieldset className="mt-2 space-y-1.5 rounded-lg border border-[#e5e7eb] px-2 py-2">
                      <legend className="px-1 text-[10px] font-medium text-[#374151]">
                        {t("loteamento.quadraModo")}
                      </legend>
                      <label className="flex items-center gap-2 text-[10px] text-[#6b7280]">
                        <input
                          type="radio"
                          name="quadra-modo"
                          checked={loteamentoQuadraModo === "area"}
                          onChange={() => setLoteamentoQuadraModo("area")}
                          className="accent-[#0f2848]"
                        />
                        {t("loteamento.quadraModoArea")}
                      </label>
                      <label className="flex items-center gap-2 text-[10px] text-[#6b7280]">
                        <input
                          type="radio"
                          name="quadra-modo"
                          checked={loteamentoQuadraModo === "medidas"}
                          onChange={() => setLoteamentoQuadraModo("medidas")}
                          className="accent-[#0f2848]"
                        />
                        {t("loteamento.quadraModoMedidas")}
                      </label>
                      {loteamentoQuadraModo === "area" ? (
                        <>
                          <label className="mt-1 block text-[10px] text-[#6b7280]">
                            {t("loteamento.areaMinimaQuadra")}
                            <input
                              type="text"
                              inputMode="decimal"
                              value={loteamentoAreaQuadra}
                              onChange={(e) => setLoteamentoAreaQuadra(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                            />
                          </label>
                          <p className="text-[10px] text-[#9ca3af]">{t("loteamento.areaMinimaQuadraHint")}</p>
                        </>
                      ) : (
                        <>
                          <label className="mt-1 block text-[10px] text-[#6b7280]">
                            {t("loteamento.larguraQuadra")}
                            <input
                              type="text"
                              inputMode="decimal"
                              value={loteamentoLarguraQuadra}
                              onChange={(e) => setLoteamentoLarguraQuadra(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                            />
                          </label>
                          <label className="mt-1 block text-[10px] text-[#6b7280]">
                            {t("loteamento.distanciaQuadra")}
                            <input
                              type="text"
                              inputMode="decimal"
                              value={loteamentoDistanciaQuadra}
                              onChange={(e) => setLoteamentoDistanciaQuadra(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                            />
                          </label>
                          <p className="text-[10px] text-[#9ca3af]">{t("loteamento.distanciaQuadraHint")}</p>
                        </>
                      )}
                    </fieldset>
                    <label className="mt-2 block text-[10px] text-[#6b7280]">
                      {t("loteamento.orientacao")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={loteamentoOrientacao}
                        onChange={(e) => setLoteamentoOrientacao(e.target.value)}
                        placeholder="auto"
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <p className="mt-1 text-[10px] text-[#9ca3af]">{t("loteamento.orientacaoHint")}</p>
                    <label className="mt-2 flex items-start gap-2 text-[10px] text-[#6b7280]">
                      <input
                        type="checkbox"
                        checked={loteamentoViasExistentes || loteamentoLados.length > 0}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setLoteamentoViasExistentes(on);
                          if (!on) {
                            setLoteamentoLados([]);
                            setLoteamentoPickLado(false);
                          }
                        }}
                        className="mt-0.5 rounded border-[#d1d5db]"
                      />
                      <span>
                        {t("loteamento.viasExistentes")}
                        <span className="mt-0.5 block text-[10px] text-[#9ca3af]">
                          {t("loteamento.viasExistentesHint")}
                        </span>
                      </span>
                    </label>
                    <div className="mt-2 space-y-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const glebaId = loteamentoGlebaId.trim() || selectedId;
                          const gleba = glebaId
                            ? project.entities.find((entity) => entity.id === glebaId)
                            : null;
                          if (
                            !gleba ||
                            gleba.type !== "polyline" ||
                            !gleba.closed ||
                            gleba.vertices.length < 3
                          ) {
                            setLoteamentoError(t("loteamento.needPolygon"));
                            return;
                          }
                          setLoteamentoGlebaId(gleba.id);
                          setSelectedId(gleba.id);
                          setLoteamentoViasExistentes(true);
                          setLoteamentoPickLado((prev) => !prev);
                          setLoteamentoError(null);
                        }}
                        className={`w-full rounded-lg border px-3 py-1.5 text-xs font-medium ${
                          loteamentoPickLado
                            ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                            : "border-[#0f2848] text-[#0f2848] hover:bg-[#f0f4f8]"
                        }`}
                      >
                        {loteamentoPickLado ? t("loteamento.pickLadoOn") : t("loteamento.pickLado")}
                      </button>
                      {loteamentoLados.length > 0 ? (
                        <ul className="space-y-1">
                          {loteamentoLados.map((index) => {
                            const glebaId = loteamentoGlebaId.trim() || selectedId;
                            const gleba = glebaId
                              ? project.entities.find((entity) => entity.id === glebaId)
                              : null;
                            const verts =
                              gleba?.type === "polyline" ? gleba.vertices : [];
                            const a = verts[index];
                            const b = verts[(index + 1) % Math.max(verts.length, 1)];
                            const len =
                              a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
                            return (
                              <li
                                key={`lado-${index}`}
                                className="flex items-center justify-between rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-900"
                              >
                                <span>
                                  {t("loteamento.ladoMarked", {
                                    n: index + 1,
                                    len: len.toFixed(1),
                                  })}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLoteamentoLados((prev) => prev.filter((i) => i !== index))
                                  }
                                  className="text-emerald-800 hover:text-red-700"
                                >
                                  {t("loteamento.ladoRemove")}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="text-[10px] text-[#9ca3af]">{t("loteamento.pickLadoHint")}</p>
                      )}
                    </div>
                    <label className="mt-2 block text-[10px] text-[#6b7280]">
                      {t("loteamento.eixosExistentes")}
                      {loteamentoEixosCandidatos.length === 0 ? (
                        <p className="mt-1 text-[10px] text-[#9ca3af]">{t("loteamento.eixosExistentesEmpty")}</p>
                      ) : (
                        <select
                          multiple
                          className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 text-xs"
                          size={Math.min(5, loteamentoEixosCandidatos.length)}
                          value={loteamentoEixoIds}
                          onChange={(e) =>
                            setLoteamentoEixoIds(
                              Array.from(e.target.selectedOptions, (option) => option.value),
                            )
                          }
                        >
                          {loteamentoEixosCandidatos.map((line, index) => (
                            <option key={line.id} value={line.id}>
                              {line.name?.trim() || `Eixo ${index + 1}`} ({line.vertices.length}{" "}
                              {t("loteamento.vertices")})
                            </option>
                          ))}
                        </select>
                      )}
                    </label>
                    <p className="mt-1 text-[10px] text-[#9ca3af]">{t("loteamento.eixosExistentesHint")}</p>
                    <p className="mt-2 text-[10px] font-medium text-[#0f2848]">{t("loteamento.eixoEditHint")}</p>
                    <label className="mt-2 flex items-start gap-2 text-[10px] text-[#6b7280]">
                      <input
                        type="checkbox"
                        checked={loteamentoAjusteEixo}
                        onChange={(e) => setLoteamentoAjusteEixo(e.target.checked)}
                        className="mt-0.5 rounded border-[#d1d5db]"
                      />
                      <span>
                        {t("loteamento.ajusteEixo")}
                        <span className="mt-0.5 block text-[10px] text-[#9ca3af]">
                          {t("loteamento.ajusteEixoHint")}
                        </span>
                      </span>
                    </label>
                    <button
                      type="button"
                      disabled={loteamentoBusy}
                      onClick={() => applyEditedEixosToLoteamento()}
                      className="mt-2 w-full rounded-lg border border-[#0f2848] px-3 py-1.5 text-xs font-medium text-[#0f2848] hover:bg-[#f0f4f8] disabled:opacity-50"
                    >
                      {loteamentoBusy ? t("loteamento.aplicarEixoWorking") : t("loteamento.aplicarEixo")}
                    </button>
                    <button
                      type="button"
                      disabled={loteamentoBusy}
                      onClick={() =>
                        loteamentoAlterarEixo ? cancelAlterarEixoTwoPoints() : startAlterarEixoTwoPoints()
                      }
                      className={`mt-2 w-full rounded-lg border px-3 py-1.5 text-xs font-medium ${
                        loteamentoAlterarEixo
                          ? "border-amber-500 bg-amber-50 text-amber-900"
                          : "border-[#0f2848] text-[#0f2848] hover:bg-[#f0f4f8]"
                      } disabled:opacity-50`}
                    >
                      {loteamentoAlterarEixo ? t("loteamento.alterarEixoOn") : t("loteamento.alterarEixo")}
                    </button>
                    <p className="mt-1 text-[10px] text-[#9ca3af]">{t("loteamento.alterarEixoHint")}</p>
                    <label className="mt-2 block text-[10px] text-[#6b7280]">
                      {t("loteamento.prefixoQuadra")}
                      <input
                        type="text"
                        value={loteamentoPrefixo}
                        onChange={(e) => setLoteamentoPrefixo(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 text-xs"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={loteamentoBusy}
                      onClick={generateLoteamentoFromPanel}
                      className="mt-3 w-full rounded-lg bg-[#0f2848] px-3 py-2 text-xs font-medium text-white hover:bg-[#1e3a5f] disabled:opacity-50"
                    >
                      {loteamentoBusy ? t("loteamento.working") : t("loteamento.generate")}
                    </button>
                  </div>
                  {hasLoteamentoLots ? (
                    <div className="rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2 space-y-2">
                      <h4 className="text-xs font-semibold text-[#0f2848]">{t("loteamento.ajusteTitle")}</h4>
                      <p className="text-[10px] text-[#6b7280]">{t("loteamento.ajusteHint")}</p>
                      <label className="block text-[10px] text-[#6b7280]">
                        {t("loteamento.ajusteTestada")}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={ajusteTestada}
                          onChange={(e) => setAjusteTestada(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                        />
                      </label>
                      <label className="block text-[10px] text-[#6b7280]">
                        {t("loteamento.ajusteProfundidade")}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={ajusteProfundidade}
                          onChange={(e) => setAjusteProfundidade(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                        />
                      </label>
                      <label className="block text-[10px] text-[#6b7280]">
                        {t("loteamento.ajusteArea")}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={ajusteArea}
                          onChange={(e) => setAjusteArea(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                        />
                      </label>
                      <p className="text-[10px] text-[#9ca3af]">{t("loteamento.ajusteAreaHint")}</p>
                      <button
                        type="button"
                        disabled={loteamentoBusy || !ajusteTarget}
                        onClick={() => applyLoteamentoLotSizeFromPanel("quadra")}
                        className="w-full rounded-lg bg-[#0f2848] px-3 py-2 text-xs font-medium text-white hover:bg-[#1e3a5f] disabled:opacity-50"
                      >
                        {loteamentoBusy ? t("loteamento.ajusteWorking") : t("loteamento.ajusteAplicarQuadra")}
                      </button>
                      {ajusteTarget?.kind === "lote" ? (
                        <button
                          type="button"
                          disabled={loteamentoBusy}
                          onClick={() => applyLoteamentoLotSizeFromPanel("lote")}
                          className="w-full rounded-lg border border-[#0f2848] px-3 py-1.5 text-xs font-medium text-[#0f2848] hover:bg-[#f0f4f8] disabled:opacity-50"
                        >
                          {loteamentoBusy ? t("loteamento.ajusteWorking") : t("loteamento.ajusteAplicarLote")}
                        </button>
                      ) : null}
                      {loteamentoError ? (
                        <p className="text-xs text-red-600">{loteamentoError}</p>
                      ) : null}
                      {loteamentoNotice ? (
                        <p className="text-xs text-emerald-700">{loteamentoNotice}</p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 space-y-2">
                    <h4 className="text-xs font-semibold text-[#14532d]">{t("loteamento.reservaTitle")}</h4>
                    <p className="text-[10px] text-[#6b7280]">{t("loteamento.reservaHint")}</p>
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("loteamento.reservaPercent")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={reservaPercent}
                        onChange={(e) => setReservaPercent(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("loteamento.reservaCanto")}
                      <select
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 text-xs"
                        value={reservaCanto}
                        onChange={(e) => setReservaCanto(e.target.value as ReservaCanto)}
                      >
                        <option value="superior_direita">{t("loteamento.cantoSuperiorDireita")}</option>
                        <option value="superior_esquerda">{t("loteamento.cantoSuperiorEsquerda")}</option>
                        <option value="inferior_direita">{t("loteamento.cantoInferiorDireita")}</option>
                        <option value="inferior_esquerda">{t("loteamento.cantoInferiorEsquerda")}</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={definirReservaLegal}
                      className="w-full rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-800"
                    >
                      {t("loteamento.reservaApply")}
                    </button>
                    {loteamentoError ? (
                      <p className="text-xs text-red-600">{loteamentoError}</p>
                    ) : null}
                    {loteamentoNotice ? (
                      <p className="text-xs text-emerald-700">{loteamentoNotice}</p>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-orange-200 bg-orange-50/70 px-3 py-2 space-y-2">
                    <h4 className="text-xs font-semibold text-[#9a3412]">{t("loteamento.areaUtilTitle")}</h4>
                    <p className="text-[10px] text-[#6b7280]">{t("loteamento.areaUtilHint")}</p>
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("loteamento.areaUtilPercent")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={loteamentoAreaUtil}
                        onChange={(e) => setLoteamentoAreaUtil(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("loteamento.areaUtilCanto")}
                      <select
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 text-xs"
                        value={areaUtilCanto}
                        onChange={(e) => setAreaUtilCanto(e.target.value as ReservaCanto)}
                      >
                        <option value="superior_direita">{t("loteamento.cantoSuperiorDireita")}</option>
                        <option value="superior_esquerda">{t("loteamento.cantoSuperiorEsquerda")}</option>
                        <option value="inferior_direita">{t("loteamento.cantoInferiorDireita")}</option>
                        <option value="inferior_esquerda">{t("loteamento.cantoInferiorEsquerda")}</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={definirAreaUtil}
                      className="w-full rounded-lg bg-orange-700 px-3 py-2 text-xs font-medium text-white hover:bg-orange-800"
                    >
                      {t("loteamento.areaUtilApply")}
                    </button>
                    {areaUtilBreakdown ? (
                      <ul className="space-y-0.5 text-[10px] text-[#9a3412]">
                        <li>
                          {t("loteamento.areaUtilBreakdownTotal", {
                            area: formatAreaBr(areaUtilBreakdown.totalM2),
                          })}
                        </li>
                        <li>
                          {t("loteamento.areaUtilBreakdownRl", {
                            area: formatAreaBr(areaUtilBreakdown.reservaM2),
                            pct: areaUtilBreakdown.reservaPct.toFixed(1).replace(".", ","),
                          })}
                        </li>
                        <li>
                          {t("loteamento.areaUtilBreakdownRuas", {
                            area: formatAreaBr(areaUtilBreakdown.viasM2),
                            pct: areaUtilBreakdown.viasPct.toFixed(1).replace(".", ","),
                          })}
                        </li>
                        <li className="font-semibold">
                          {t("loteamento.areaUtilBreakdownCalc", {
                            pct: String(areaUtilBreakdown.percent.toFixed(0)),
                            area: formatAreaBr(areaUtilBreakdown.alvoM2),
                          })}
                        </li>
                      </ul>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-2 space-y-2">
                    <h4 className="text-xs font-semibold text-[#115e59]">{t("loteamento.appTitle")}</h4>
                    <p className="text-[10px] text-[#6b7280]">{t("loteamento.appHint")}</p>
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("loteamento.appWidth")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={appWidth}
                        onChange={(e) => setAppWidth(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <p className="text-[10px] text-[#9ca3af]">{t("loteamento.appWidthHint")}</p>
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("loteamento.appSide")}
                      <select
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 text-xs"
                        value={appSide}
                        onChange={(e) => setAppSide(e.target.value as AppBufferSide)}
                      >
                        <option value="both">{t("loteamento.appSideBoth")}</option>
                        <option value="left">{t("loteamento.appSideLeft")}</option>
                        <option value="right">{t("loteamento.appSideRight")}</option>
                      </select>
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setAppPickMode(true);
                          setAppApplyAfterPick(false);
                          setTool("select");
                          setDrawHint(t("loteamento.appPickBanner"));
                        }}
                        className="rounded-lg border border-teal-700 px-2 py-2 text-xs font-medium text-teal-800 hover:bg-teal-50"
                      >
                        {appPickMode ? t("loteamento.appPickOn") : t("loteamento.appPick")}
                      </button>
                      <button
                        type="button"
                        onClick={definirApp}
                        className="rounded-lg bg-teal-700 px-2 py-2 text-xs font-medium text-white hover:bg-teal-800"
                      >
                        {t("loteamento.appApply")}
                      </button>
                    </div>
                    {loteamentoError ? (
                      <p className="text-xs text-red-600">{loteamentoError}</p>
                    ) : null}
                    {loteamentoNotice ? (
                      <p className="text-xs text-teal-800">{loteamentoNotice}</p>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-[#0f2848]/20 bg-[#0f2848]/5 px-3 py-2 space-y-2">
                    <h4 className="text-xs font-semibold text-[#0f2848]">{t("loteamento.maquete.title")}</h4>
                    <p className="text-[10px] text-[#6b7280]">{t("loteamento.maquete.hint")}</p>
                    <button
                      type="button"
                      disabled={!maqueteReady.ok}
                      title={maqueteReady.ok ? t("loteamento.maquete.hint") : t("loteamento.maquete.needLayers")}
                      onClick={() => {
                        setDrenagem3dOpen(false);
                        setMaqueteOpen(true);
                      }}
                      className="w-full rounded-lg bg-[#0f2848] px-3 py-2 text-xs font-medium text-white hover:bg-[#1e3a5f] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t("loteamento.maquete.generate")}
                    </button>
                    {!maqueteReady.ok ? (
                      <p className="text-[10px] text-[#9ca3af]">{t("loteamento.maquete.needLayers")}</p>
                    ) : !maqueteReady.hasReserva ? (
                      <p className="text-[10px] text-amber-700">{t("loteamento.maquete.noReserva")}</p>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-[#dbeafe] bg-[#f8fafc] px-3 py-2 space-y-2">
                    <h4 className="text-xs font-semibold text-[#0f2848]">{t("loteamento.urbano.title")}</h4>
                    <p className="text-[10px] text-[#6b7280]">{t("loteamento.urbano.hint")}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">{t("loteamento.urbano.lotes")}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button type="button" title={t("loteamento.urbano.cotarHint")} onClick={applyLoteamentoCotas} className="rounded-lg bg-[#0f2848] px-2 py-1.5 text-[11px] font-medium text-white hover:bg-[#1e3a5f]">{t("loteamento.urbano.cotar")}</button>
                      <button type="button" title={t("loteamento.urbano.limparHint")} onClick={limparLoteamentoAnotacoes} className="rounded-lg border border-[#0f2848] px-2 py-1.5 text-[11px] font-medium text-[#0f2848] hover:bg-[#f0f4f8]">{t("loteamento.urbano.limpar")}</button>
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">{t("loteamento.urbano.legal")}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button type="button" title={t("loteamento.urbano.memorialsHint")} onClick={exportarLoteamentoMemorial} className="rounded-lg border border-[#0f2848] px-2 py-1.5 text-[11px] font-medium text-[#0f2848] hover:bg-[#f0f4f8]">{t("loteamento.urbano.memorials")}</button>
                      <button type="button" title={t("loteamento.urbano.plantasHint")} disabled={reurbBusy !== null} onClick={() => void generateReurbPlantas()} className="rounded-lg bg-[#7c3aed] px-2 py-1.5 text-[11px] font-medium text-white hover:bg-[#6d28d9] disabled:opacity-50">{t("loteamento.urbano.plantas")}</button>
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">{t("loteamento.urbano.gerar")}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button type="button" title={t("loteamento.urbano.tabelasHint")} onClick={gerarLoteamentoTabelas} className="rounded-lg bg-[#0f2848] px-2 py-1.5 text-[11px] font-medium text-white hover:bg-[#1e3a5f]">{t("loteamento.urbano.tabelas")}</button>
                      <button type="button" title={t("loteamento.urbano.pontosHint")} onClick={gerarLoteamentoPontos} className="rounded-lg bg-[#0f2848] px-2 py-1.5 text-[11px] font-medium text-white hover:bg-[#1e3a5f]">{t("loteamento.urbano.pontos")}</button>
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">{t("loteamento.urbano.exportar")}</p>
                    <button type="button" title={t("loteamento.urbano.kmlHint")} onClick={exportarLoteamentoKml} className="w-full rounded-lg border border-emerald-700 px-2 py-1.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50">{t("loteamento.urbano.kml")}</button>
                  </div>
                  <div className="rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2 space-y-2">
                    <h4 className="text-xs font-semibold text-[#0f2848]">{t("loteamento.perfil.title")}</h4>
                    <p className="text-[10px] text-[#6b7280]">{t("loteamento.perfil.hint")}</p>
                    <button
                      type="button"
                      onClick={criarPerfisDasRuas}
                      className="w-full rounded-lg bg-[#2563eb] px-3 py-2 text-xs font-medium text-white hover:bg-[#1d4ed8]"
                    >
                      {t("loteamento.perfil.create")}
                    </button>
                    {streetProfiles.length > 0 ? (
                      <label className="block text-[10px] text-[#6b7280]">
                        {t("loteamento.perfil.street")}
                        <select
                          className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 text-xs"
                          value={streetProfileId}
                          onChange={(e) => setStreetProfileId(e.target.value)}
                        >
                          {streetProfiles.map((p) => (
                            <option key={p.streetId} value={p.streetId}>
                              {p.streetName}
                              {p.intersections.length > 0 ? ` · ${p.intersections.length} encontro(s)` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <div className="rounded-md border border-[#c7d2fe] bg-white/70 px-2 py-2 space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#4c1d95]">{t("loteamento.perfil.secaoChartTitle")}</p>
                      <p className="text-[10px] text-[#6b7280]">{t("loteamento.perfil.secaoHint")}</p>
                      <SecaoTipoPreview
                        params={currentSecaoTipoParams()}
                        pistaLabel={t("loteamento.perfil.previewPista")}
                        calcadaLabel={t("loteamento.perfil.previewCalcada")}
                        corteLabel={t("loteamento.perfil.previewCorte")}
                        aterroLabel={t("loteamento.perfil.previewAterro")}
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <label className="text-[10px] text-[#6b7280]">
                          {t("loteamento.perfil.pista")}
                          <input className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs" value={secaoPista} onChange={(e) => setSecaoPista(e.target.value)} />
                        </label>
                        <label className="text-[10px] text-[#6b7280]">
                          {t("loteamento.perfil.calcada")}
                          <input className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs" value={secaoCalcada} onChange={(e) => setSecaoCalcada(e.target.value)} />
                        </label>
                        <label className="text-[10px] text-[#6b7280]">
                          {t("loteamento.perfil.meioFio")}
                          <input className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs" value={secaoMeioFio} onChange={(e) => setSecaoMeioFio(e.target.value)} />
                        </label>
                        <label className="text-[10px] text-[#6b7280]">
                          {t("loteamento.perfil.declive")}
                          <input className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs" value={secaoDeclive} onChange={(e) => setSecaoDeclive(e.target.value)} />
                        </label>
                        <label className="text-[10px] text-[#6b7280]">
                          {t("loteamento.perfil.decliveCalcada")}
                          <input className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs" value={secaoDecliveCalcada} onChange={(e) => setSecaoDecliveCalcada(e.target.value)} />
                        </label>
                        <label className="text-[10px] text-[#6b7280]">
                          {t("loteamento.perfil.intervalo")}
                          <input className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs" value={secaoIntervalo} onChange={(e) => setSecaoIntervalo(e.target.value)} />
                        </label>
                        <label className="text-[10px] text-[#6b7280]">
                          {t("loteamento.perfil.taludeCorte")}
                          <input className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs" value={secaoTaludeCorte} onChange={(e) => setSecaoTaludeCorte(e.target.value)} />
                        </label>
                        <label className="text-[10px] text-[#6b7280]">
                          {t("loteamento.perfil.taludeAterro")}
                          <input className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs" value={secaoTaludeAterro} onChange={(e) => setSecaoTaludeAterro(e.target.value)} />
                        </label>
                        <label className="col-span-2 text-[10px] text-[#6b7280]">
                          {t("loteamento.perfil.extensaoTalude")}
                          <input className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs" value={secaoExtensaoTalude} onChange={(e) => setSecaoExtensaoTalude(e.target.value)} />
                        </label>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={aplicarSecaoTipoNasRuas}
                      className="w-full rounded-lg bg-[#7c3aed] px-3 py-2 text-xs font-medium text-white hover:bg-[#6d28d9]"
                    >
                      {t("loteamento.perfil.applySecao")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPrintSheetContent("secao-tipo");
                        setActiveTab("layout");
                      }}
                      className="w-full rounded-lg border border-[#7c3aed] px-3 py-2 text-xs font-medium text-[#6d28d9] hover:bg-[#f5f3ff]"
                    >
                      {t("loteamento.perfil.openPrint")}
                    </button>
                    {project.entities.some((e) => e.layerId === LOTEAMENTO_SECAO_LAYER.id) ? (
                      <p className="text-[10px] text-emerald-800">{t("loteamento.perfil.secaoVisibleHint")}</p>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 space-y-2">
                    <h4 className="text-xs font-semibold text-[#7f1d1d]">{t("loteamento.cutFillTitle")}</h4>
                    <p className="text-[10px] text-[#6b7280]">{t("loteamento.cutFillHint")}</p>
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("contour.interpolateInterval")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={contourInterval}
                        onChange={(e) => setContourInterval(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("contour.interpolateAssignZ")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={interpAssignZ}
                        onChange={(e) => setInterpAssignZ(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <label className="flex items-start gap-2 text-[10px] text-[#6b7280]">
                      <input
                        type="checkbox"
                        checked={interpUsePoints}
                        onChange={(e) => setInterpUsePoints(e.target.checked)}
                        className="mt-0.5 rounded border-[#d1d5db]"
                      />
                      {t("contour.interpolateUsePoints")}
                    </label>
                    <button
                      type="button"
                      disabled={generatingInterp}
                      onClick={generateInterpolatedContoursFromPanel}
                      className="w-full rounded-lg bg-[#c2410c] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
                    >
                      {generatingInterp ? t("contour.interpolateGenerating") : t("contour.interpolateGenerate")}
                    </button>
                    {interpError ? <p className="text-xs text-red-600">{interpError}</p> : null}
                    {interpInfo ? <p className="text-xs text-emerald-700">{interpInfo}</p> : null}
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("loteamento.plateauZ")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={volPlateauZ}
                        onChange={(e) => setVolPlateauZ(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <p className="text-[10px] text-[#9ca3af]">{t("loteamento.plateauZHint")}</p>
                    <button
                      type="button"
                      disabled={volBusy}
                      onClick={calculateLoteamentoCutFill}
                      className="w-full rounded-lg bg-[#b91c1c] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
                    >
                      {volBusy ? t("volumetria.calculating") : t("loteamento.cutFillCalculate")}
                    </button>
                    {volResult ? (
                      <div className="text-[11px] text-[#0f2848]">
                        <p>{t("volumetria.cut", { value: formatVolumeM3(volResult.cutM3) })}</p>
                        <p>{t("volumetria.fill", { value: formatVolumeM3(volResult.fillM3) })}</p>
                        <p>{t("volumetria.net", { value: formatVolumeM3(volResult.netM3) })}</p>
                      </div>
                    ) : null}
                    {volError ? <p className="text-xs text-red-600">{volError}</p> : null}
                  </div>
                  <p className="text-[10px] text-[#6b7280]">{t("loteamento.splitHint")}</p>
                  <p className="text-[10px] text-[#6b7280]">{t("loteamento.layersHint")}</p>
                  <p className="text-[10px] text-[#6b7280]">{t("loteamento.reurbHint")}</p>
                  <button
                    type="button"
                    onClick={() => setToolsTab("drenagem")}
                    className="w-full rounded-lg bg-[#0369a1] px-3 py-2 text-xs font-medium text-white hover:bg-[#075985]"
                  >
                    {t("drenagem.title")}
                  </button>
                  <button
                    type="button"
                    onClick={openEstudoViabilidade}
                    className="w-full rounded-lg bg-teal-700 px-3 py-2 text-xs font-medium text-white hover:bg-teal-800"
                  >
                    {t("loteamento.estudoViabilidade")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setToolsTab("reurb")}
                    className="w-full rounded-lg border border-[#0f2848] px-3 py-2 text-xs font-medium text-[#0f2848] hover:bg-[#f0f4f8]"
                  >
                    {t("loteamento.openReurb")}
                  </button>
                  {loteamentoError ? (
                    <p className="text-xs text-red-600">{loteamentoError}</p>
                  ) : null}
                  {loteamentoNotice ? (
                    <p className="text-xs text-emerald-700">{loteamentoNotice}</p>
                  ) : null}
                </section>
              ),
              drenagem: (
                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#0f2848]">{t("drenagem.title")}</h3>
                    <p className="mt-1 text-xs text-[#6b7280]">{t("drenagem.hint")}</p>
                  </div>
                  <div className="rounded-lg border border-[#e5e7eb] px-3 py-2 space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#0369a1]">{t("drenagem.params")}</p>
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("drenagem.intensity")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={drenagemIntensity}
                        onChange={(e) => setDrenagemIntensity(e.target.value)}
                        className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                      />
                    </label>
                    <p className="text-[10px] text-[#9ca3af]">{t("drenagem.intensityHint")}</p>
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("drenagem.runoffC")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={drenagemC}
                        onChange={(e) => setDrenagemC(e.target.value)}
                        className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                      />
                    </label>
                    <p className="text-[10px] text-[#9ca3af]">{t("drenagem.runoffCHint")}</p>
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("drenagem.impervious")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={drenagemImperv}
                        onChange={(e) => {
                          setDrenagemImperv(e.target.value);
                          const pct = parseDrawNumber(e.target.value);
                          if (pct == null) return;
                          setDrenagemC(runoffCFromImpervious(pct).toFixed(2));
                        }}
                        className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                      />
                    </label>
                    <p className="text-[10px] text-[#9ca3af]">{t("drenagem.imperviousHint")}</p>
                    <div className="rounded border border-[#e0f2fe] bg-[#f0f9ff] px-2 py-1.5 space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#0369a1]">{t("drenagem.idfTitle")}</p>
                      <p className="text-[10px] text-[#6b7280]">{t("drenagem.idfHint")}</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        <label className="block text-[10px] text-[#6b7280]">
                          {t("drenagem.idfK")}
                          <input
                            type="text"
                            inputMode="decimal"
                            value={drenagemIdfK}
                            onChange={(e) => setDrenagemIdfK(e.target.value)}
                            className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                          />
                        </label>
                        <label className="block text-[10px] text-[#6b7280]">
                          {t("drenagem.idfA")}
                          <input
                            type="text"
                            inputMode="decimal"
                            value={drenagemIdfA}
                            onChange={(e) => setDrenagemIdfA(e.target.value)}
                            className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                          />
                        </label>
                        <label className="block text-[10px] text-[#6b7280]">
                          {t("drenagem.idfB")}
                          <input
                            type="text"
                            inputMode="decimal"
                            value={drenagemIdfB}
                            onChange={(e) => setDrenagemIdfB(e.target.value)}
                            className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                          />
                        </label>
                        <label className="block text-[10px] text-[#6b7280]">
                          {t("drenagem.idfC")}
                          <input
                            type="text"
                            inputMode="decimal"
                            value={drenagemIdfC}
                            onChange={(e) => setDrenagemIdfC(e.target.value)}
                            className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                          />
                        </label>
                      </div>
                    </div>
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("drenagem.returnPeriod")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={drenagemTr}
                        onChange={(e) => setDrenagemTr(e.target.value)}
                        className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                      />
                    </label>
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("drenagem.pvSpacing")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={drenagemSpacing}
                        onChange={(e) => setDrenagemSpacing(e.target.value)}
                        className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                      />
                    </label>
                    <p className="text-[10px] text-[#9ca3af]">{t("drenagem.pvSpacingHint")}</p>
                    <div className="space-y-2 rounded border border-[#e0f2fe] bg-[#f0f9ff] px-2 py-2">
                      <label className="flex items-center gap-2 text-[10px] text-[#6b7280]">
                        <input
                          type="checkbox"
                          checked={drenagemAutoInlets}
                          onChange={(e) => setDrenagemAutoInlets(e.target.checked)}
                        />
                        {t("drenagem.autoInlets")}
                      </label>
                      {drenagemAutoInlets ? (
                        <>
                          <label className="block text-[10px] text-[#6b7280]">
                            {t("drenagem.inletSpacing")}
                            <input
                              type="text"
                              inputMode="decimal"
                              value={drenagemInletSpacing}
                              onChange={(e) => setDrenagemInletSpacing(e.target.value)}
                              className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                            />
                          </label>
                          <p className="text-[10px] text-[#9ca3af]">{t("drenagem.inletSpacingHint")}</p>
                          <label className="flex items-center gap-2 text-[10px] text-[#6b7280]">
                            <input
                              type="checkbox"
                              checked={drenagemInletAtIntersections}
                              onChange={(e) => setDrenagemInletAtIntersections(e.target.checked)}
                            />
                            {t("drenagem.inletAtIntersections")}
                          </label>
                        </>
                      ) : null}
                      <label className="flex items-center gap-2 text-[10px] text-[#6b7280]">
                        <input
                          type="checkbox"
                          checked={drenagemConnectInlets}
                          onChange={(e) => setDrenagemConnectInlets(e.target.checked)}
                        />
                        {t("drenagem.connectInlets")}
                      </label>
                      <p className="text-[10px] text-[#9ca3af]">{t("drenagem.connectInletsHint")}</p>
                    </div>
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("drenagem.minSlope")}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={drenagemMinSlope}
                        onChange={(e) => setDrenagemMinSlope(e.target.value)}
                        className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 font-mono text-xs"
                      />
                    </label>
                    <p className="text-[10px] text-[#9ca3af]">{t("drenagem.minSlopeHint")}</p>
                    <label className="block text-[10px] text-[#6b7280]">
                      {t("drenagem.material")}
                      <select
                        value={drenagemMaterial}
                        onChange={(e) => setDrenagemMaterial(e.target.value)}
                        className="mt-0.5 w-full rounded border border-[#d1d5db] px-2 py-1 text-xs"
                      >
                        {Object.keys(DRAINAGE_MATERIALS).map((name) => (
                          <option key={name} value={name}>
                            {name} (n={DRAINAGE_MATERIALS[name]})
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={drenagemBusy}
                      onClick={gerarDrenagemAutomatica}
                      className="w-full rounded-lg bg-[#0369a1] px-3 py-2 text-xs font-medium text-white hover:bg-[#075985] disabled:opacity-50"
                    >
                      {drenagemBusy ? t("drenagem.working") : t("drenagem.generate")}
                    </button>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={recalcularDrenagem}
                        className="rounded-lg border border-[#0369a1] px-2 py-1.5 text-[11px] font-medium text-[#0369a1] hover:bg-[#f0f9ff]"
                      >
                        {t("drenagem.recalc")}
                      </button>
                      <button
                        type="button"
                        onClick={limparDrenagem}
                        className="rounded-lg border border-red-300 px-2 py-1.5 text-[11px] font-medium text-red-700 hover:bg-red-50"
                      >
                        {t("drenagem.clear")}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={exportarDrenagemSwmm}
                        className="rounded-lg border border-[#0f2848] px-2 py-1.5 text-[11px] font-medium text-[#0f2848] hover:bg-[#f0f4f8]"
                      >
                        {t("drenagem.exportSwmm")}
                      </button>
                      <button
                        type="button"
                        onClick={() => window.requestAnimationFrame(() => drenagemInpRef.current?.click())}
                        className="rounded-lg border border-[#0f2848] px-2 py-1.5 text-[11px] font-medium text-[#0f2848] hover:bg-[#f0f4f8]"
                      >
                        {t("drenagem.importSwmm")}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDrenagemPlanilhaOpen(true);
                        setActiveTab("planilha");
                      }}
                      className="w-full rounded-lg bg-[#0369a1] px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-[#075985]"
                    >
                      {t("drenagem.planilha.open")}
                    </button>
                    <button
                      type="button"
                      onClick={exportarDrenagemPlanilha}
                      className="w-full rounded-lg border border-[#15803d] px-2 py-1.5 text-[11px] font-medium text-[#15803d] hover:bg-[#f0fdf4]"
                    >
                      {t("drenagem.planilha.exportXlsx")}
                    </button>
                    <button
                      type="button"
                      disabled={!drenagem3dReady.ok}
                      title={drenagem3dReady.ok ? t("drenagem.view3dHint") : t("drenagem.view3dNeedNetwork")}
                      onClick={() => {
                        setMaqueteOpen(false);
                        setDrenagem3dOpen(true);
                      }}
                      className="w-full rounded-lg bg-[#1d4ed8] px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1e40af] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t("drenagem.view3d")}
                    </button>
                    {!drenagem3dReady.ok ? (
                      <p className="text-[10px] text-[#9ca3af]">{t("drenagem.view3dNeedNetwork")}</p>
                    ) : (
                      <p className="text-[10px] text-[#6b7280]">{t("drenagem.view3dHint")}</p>
                    )}
                    <p className="text-[10px] text-[#6b7280]">{t("drenagem.planilha.clickHint")}</p>
                  </div>
                  <div className="rounded-lg border border-[#e5e7eb] px-3 py-2 space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#0f2848]">{t("drenagem.manualTitle")}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setDrenagemPick("pv");
                        setDrenagemPipeFromId(null);
                        setTool("select");
                        setDrawHint(t("drenagem.insertPvOn"));
                      }}
                      className={`w-full rounded-lg px-2 py-1.5 text-[11px] font-medium ${
                        drenagemPick === "pv"
                          ? "bg-[#0f2848] text-white"
                          : "border border-[#0f2848] text-[#0f2848] hover:bg-[#f0f4f8]"
                      }`}
                    >
                      {t("drenagem.insertPv")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDrenagemPick("inlet");
                        setDrenagemPipeFromId(null);
                        setTool("select");
                        setDrawHint(t("drenagem.insertInletOn"));
                      }}
                      className={`w-full rounded-lg px-2 py-1.5 text-[11px] font-medium ${
                        drenagemPick === "inlet"
                          ? "bg-[#1d4ed8] text-white"
                          : "border border-[#1d4ed8] text-[#1d4ed8] hover:bg-[#eef2ff]"
                      }`}
                    >
                      {t("drenagem.insertInlet")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDrenagemPick("pipe");
                        setDrenagemPipeFromId(null);
                        setTool("select");
                        setDrawHint(t("drenagem.insertPipeOn"));
                      }}
                      className={`w-full rounded-lg px-2 py-1.5 text-[11px] font-medium ${
                        drenagemPick === "pipe"
                          ? "bg-[#0f2848] text-white"
                          : "border border-[#0f2848] text-[#0f2848] hover:bg-[#f0f4f8]"
                      }`}
                    >
                      {t("drenagem.insertPipe")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDrenagemPick("outfall");
                        setDrenagemPipeFromId(null);
                        setTool("select");
                        setDrawHint(t("drenagem.insertOutfallOn"));
                      }}
                      className={`w-full rounded-lg px-2 py-1.5 text-[11px] font-medium ${
                        drenagemPick === "outfall"
                          ? "bg-[#dc2626] text-white"
                          : "border border-[#dc2626] text-[#b91c1c] hover:bg-[#fef2f2]"
                      }`}
                    >
                      {t("drenagem.insertOutfall")}
                    </button>
                    {selectedId && listDrainagePvs(project).some((pv) => pv.id === selectedId) ? (
                      <button
                        type="button"
                        onClick={() => {
                          setProject(deleteDrainagePv(project, selectedId));
                          setSelectedId(null);
                        }}
                        className="w-full rounded-lg border border-red-300 px-2 py-1.5 text-[11px] font-medium text-red-700"
                      >
                        {t("drenagem.deletePv")}
                      </button>
                    ) : null}
                    {selectedId && listDrainagePipes(project).some((pipe) => pipe.id === selectedId) ? (
                      <button
                        type="button"
                        onClick={() => {
                          setProject(deleteDrainagePipe(project, selectedId));
                          setSelectedId(null);
                        }}
                        className="w-full rounded-lg border border-red-300 px-2 py-1.5 text-[11px] font-medium text-red-700"
                      >
                        {t("drenagem.deletePipe")}
                      </button>
                    ) : null}
                  </div>
                  {(() => {
                    const pvs = listDrainagePvs(project);
                    const pipes = listDrainagePipes(project);
                    if (pvs.length === 0 && pipes.length === 0) {
                      return <p className="text-[10px] text-[#9ca3af]">{t("drenagem.empty")}</p>;
                    }
                    return (
                      <>
                        <div className="rounded-lg border border-[#e5e7eb] px-2 py-2">
                          <p className="text-[10px] font-semibold text-[#0f2848]">{t("drenagem.pvTable")}</p>
                          <div className="mt-1 max-h-40 overflow-auto">
                            <table className="w-full text-[9px]">
                              <thead>
                                <tr className="text-left text-[#6b7280]">
                                  <th>{t("drenagem.colCode")}</th>
                                  <th>{t("drenagem.colStation")}</th>
                                  <th>{t("drenagem.colInvert")}</th>
                                  <th>{t("drenagem.colCover")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pvs.map((pv) => (
                                  <tr
                                    key={pv.id}
                                    className={`cursor-pointer ${selectedId === pv.id ? "bg-[#e0f2fe]" : ""}`}
                                    onClick={() => focusDrainageCalc(pv.id, false)}
                                  >
                                    <td className="py-0.5 font-medium">{pv.drainage?.code ?? pv.label}</td>
                                    <td>{(pv.drainage?.stationM ?? 0).toFixed(1)}</td>
                                    <td>
                                      <input
                                        className="w-14 rounded border border-[#e5e7eb] px-0.5 font-mono"
                                        defaultValue={(pv.drainage?.invertZ ?? pv.z).toFixed(2)}
                                        key={`${pv.id}-tinv`}
                                        onBlur={(e) => {
                                          const invertZ = parseDrawNumber(e.target.value);
                                          if (invertZ == null) return;
                                          setProject(updateDrainagePv(project, pv.id, { invertZ }));
                                        }}
                                      />
                                    </td>
                                    <td>{(pv.drainage?.coverDepthM ?? 0).toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        <div className="rounded-lg border border-[#e5e7eb] px-2 py-2">
                          <p className="text-[10px] font-semibold text-[#0f2848]">{t("drenagem.pipeTable")}</p>
                          <p className="text-[10px] text-[#6b7280]">{t("drenagem.reportHint")}</p>
                          <div className="mt-1 max-h-48 overflow-auto">
                            <table className="w-full text-[9px]">
                              <thead>
                                <tr className="text-left text-[#6b7280]">
                                  <th>{t("drenagem.colCode")}</th>
                                  <th>{t("drenagem.colLength")}</th>
                                  <th>{t("drenagem.colSlope")}</th>
                                  <th>{t("drenagem.colDiam")}</th>
                                  <th>{t("drenagem.colQin")}</th>
                                  <th>{t("drenagem.colQcap")}</th>
                                  <th>{t("drenagem.colLamina")}</th>
                                  <th>{t("drenagem.colStatus")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pipes.map((pipe) => (
                                  <tr
                                    key={pipe.id}
                                    className={`cursor-pointer ${
                                      selectedId === pipe.id
                                        ? "bg-[#e0f2fe]"
                                        : drainageEntityHasRedError(pipe)
                                          ? "bg-[#fee2e2]"
                                          : ""
                                    }`}
                                    onClick={() => focusDrainageCalc(pipe.id, true)}
                                  >
                                    <td className="py-0.5 font-medium">{pipe.drainage?.code ?? "TB"}</td>
                                    <td>{(pipe.drainage?.lengthM ?? 0).toFixed(1)}</td>
                                    <td>
                                      <input
                                        className="w-10 rounded border border-[#e5e7eb] px-0.5 font-mono"
                                        defaultValue={String(pipe.drainage?.slopePct ?? "")}
                                        key={`${pipe.id}-ts`}
                                        onClick={(e) => e.stopPropagation()}
                                        onBlur={(e) => {
                                          const slopePct = parseDrawNumber(e.target.value);
                                          if (slopePct == null) return;
                                          setProject(updateDrainagePipe(project, pipe.id, { slopePct }));
                                        }}
                                      />
                                    </td>
                                    <td>
                                      <select
                                        className="rounded border border-[#e5e7eb] font-mono"
                                        value={pipe.drainage?.diameterMm ?? 300}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) =>
                                          setProject(
                                            updateDrainagePipe(project, pipe.id, {
                                              diameterMm: Number(e.target.value),
                                            }),
                                          )
                                        }
                                      >
                                        {DRAINAGE_PIPE_DIAMETERS_MM.map((d) => (
                                          <option key={d} value={d}>
                                            {d}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                    <td>{(pipe.drainage?.qContribLps ?? 0).toFixed(1)}</td>
                                    <td>{(pipe.drainage?.qCapacityLps ?? 0).toFixed(1)}</td>
                                    <td
                                      className={
                                        classifyDrainageFlowDepthRatio(pipe.drainage?.flowDepthRatio ?? 0).class !==
                                        "Parcial"
                                          ? "font-semibold text-red-700"
                                          : "font-semibold text-emerald-700"
                                      }
                                    >
                                      {classifyDrainageFlowDepthRatio(pipe.drainage?.flowDepthRatio ?? 0).label}
                                    </td>
                                    <td
                                      className={
                                        isDrainageAlertStatus(pipe.drainage?.status)
                                          ? "font-semibold text-red-700"
                                          : "font-semibold text-emerald-700"
                                      }
                                    >
                                      {drenagemStatusLabel(pipe.drainage?.status)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                  {selectedId && project.entities.some((e) => e.id === selectedId && isDrainagePipeEntity(e)) ? (
                    <div className="mt-2">
                      <CadDrainageWaterProfileChart
                        project={project}
                        selectedPipeId={selectedId}
                        setProject={setProject}
                      />
                    </div>
                  ) : null}
                  <p className="text-[10px] text-[#6b7280]">{t("drenagem.layersHint")}</p>
                  {drenagemError ? <p className="text-xs text-red-600">{drenagemError}</p> : null}
                  {drenagemNotice ? <p className="text-xs text-emerald-700">{drenagemNotice}</p> : null}
                </section>
              ),
              reurb: (
                <section className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[#0f2848]">{t("reurb.title")}</h3>
                    <p className="mt-1 text-xs text-[#6b7280]">{t("reurb.hint")}</p>
                  </div>
                  <div className="rounded-lg border border-[#e5e7eb] px-3 py-2">
                    <h4 className="text-xs font-semibold text-[#0f2848]">{t("reurb.orthoTitle")}</h4>
                    <p className="mt-1 text-[10px] text-[#6b7280]">{t("reurb.orthoHint")}</p>
                    <button
                      type="button"
                      disabled={importingOrtho}
                      onClick={() => window.requestAnimationFrame(() => orthoFileRef.current?.click())}
                      className="mt-2 w-full rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      {importingOrtho ? t("reurb.orthoWorking") : t("reurb.orthoImport")}
                    </button>
                    <p className="mt-1 text-[10px] text-[#9ca3af]">{t("import.orthoFormats")}</p>
                  </div>
                  <div className="rounded-lg border border-[#e5e7eb] px-3 py-2">
                    <h4 className="text-xs font-semibold text-[#0f2848]">{t("reurb.lotesTitle")}</h4>
                    <p className="mt-1 text-[10px] text-[#6b7280]">{t("reurb.lotesHint")}</p>
                    <p className="mt-2 text-[10px] font-medium text-[#374151]">
                      {reurbLotCount > 0
                        ? t("reurb.lotesCount", { count: reurbLotCount })
                        : t("reurb.lotesEmpty")}
                    </p>
                    <label className="mt-2 flex items-center gap-2 text-[11px] text-[#374151]">
                      <input
                        type="checkbox"
                        checked={reurbIncludeArea}
                        onChange={(e) => setReurbIncludeArea(e.target.checked)}
                      />
                      {t("reurb.lotesIncludeArea")}
                    </label>
                    <button
                      type="button"
                      disabled={reurbBusy !== null}
                      onClick={applyReurbLabels}
                      className="mt-2 w-full rounded-lg bg-[#0f2848] px-3 py-2 text-xs font-medium text-white hover:bg-[#1e3a5f] disabled:opacity-50"
                    >
                      {reurbBusy === "labels" ? t("reurb.lotesWorking") : t("reurb.lotesApply")}
                    </button>
                  </div>
                  <div className="rounded-lg border border-[#e5e7eb] px-3 py-2">
                    <h4 className="text-xs font-semibold text-[#0f2848]">{t("reurb.memorialsTitle")}</h4>
                    <p className="mt-1 text-[10px] text-[#6b7280]">{t("reurb.memorialsHint")}</p>
                    <button
                      type="button"
                      disabled={generatingMemorial}
                      onClick={() => {
                        const entity = project.entities.find((e) => e.id === selectedId);
                        if (entity?.type !== "polyline" || !entity.closed || entity.vertices.length < 3) {
                          setReurbNotice(t("reurb.memorialsNeedSelection"));
                          return;
                        }
                        void exportMemorialWord(selectedId);
                      }}
                      className="mt-2 w-full rounded-lg border border-[#0f2848] px-3 py-2 text-xs font-medium text-[#0f2848] hover:bg-[#f0f4f8] disabled:opacity-50"
                    >
                      {generatingMemorial ? t("memorial.generating") : t("reurb.memorialsWord")}
                    </button>
                    <button
                      type="button"
                      disabled={reurbBusy !== null}
                      onClick={exportReurbTabular}
                      className="mt-2 w-full rounded-lg bg-[#0f2848] px-3 py-2 text-xs font-medium text-white hover:bg-[#1e3a5f] disabled:opacity-50"
                    >
                      {t("reurb.memorialsTabular")}
                    </button>
                  </div>
                  <div className="rounded-lg border border-[#e5e7eb] px-3 py-2">
                    <h4 className="text-xs font-semibold text-[#0f2848]">{t("reurb.plantasTitle")}</h4>
                    <p className="mt-1 text-[10px] text-[#6b7280]">{t("reurb.plantasHint")}</p>
                    <button
                      type="button"
                      disabled={reurbBusy !== null}
                      onClick={() => void generateReurbPlantas()}
                      className="mt-2 w-full rounded-lg bg-[#7c3aed] px-3 py-2 text-xs font-medium text-white hover:bg-[#6d28d9] disabled:opacity-50"
                    >
                      {reurbBusy === "plantas" ? t("reurb.plantasWorking") : t("reurb.plantasGenerate")}
                    </button>
                  </div>
                  {reurbNotice ? (
                    <p className="text-xs text-[#374151]">{reurbNotice}</p>
                  ) : null}
                </section>
              ),
              commands: (
                <CadCommandsPanel
                  variant="embedded"
                  project={project}
                  selectedId={selectedId}
                  selectedSegmentIndex={selectedSegmentIndex}
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
              ),
              memorial: (
                <section>
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
                    {selectedConfrontationMetrics ? (
                      <CadConfrontationTable
                        segments={selectedConfrontationMetrics.segments}
                        confrontations={selectedConfrontations}
                        selectedSegmentIndex={selectedSegmentIndex}
                        onSelectSegment={(index) => {
                          setSelectedSegmentIndex(index);
                          if (tool !== "confrontacao") setTool("confrontacao");
                        }}
                        onChangeConfrontation={setPolylineConfrontation}
                      />
                    ) : null}
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
              ),
            }}
          />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setToolsSidebarOpen(true)}
              title={t("sidebar.show")}
              className="flex h-full w-9 shrink-0 flex-col items-center justify-start rounded-xl border border-[#0f2848] bg-[#0f2848] px-1 py-3 text-white shadow-sm hover:bg-[#1e3a5f]"
            >
              <span className="text-[10px] font-semibold tracking-wide [writing-mode:vertical-rl]">
                {t("sidebar.show")}
              </span>
            </button>
          )}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {activeTab === "planilha" ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <CadDrainagePlanilha
                project={project}
                params={currentDrainageParams()}
                selectedId={selectedId}
                variant="page"
                onSelectId={(id) => {
                  setSelectedId(id);
                  setToolsTab("drenagem");
                }}
                onProjectChange={setProject}
                onRecalc={recalcularDrenagem}
                onExport={exportarDrenagemPlanilha}
                onHydrologyChange={(patch) => {
                  if (patch.runoffC != null) setDrenagemC(patch.runoffC);
                  if (patch.intensityMmH != null) setDrenagemIntensity(patch.intensityMmH);
                  if (patch.returnPeriodYears != null) setDrenagemTr(patch.returnPeriodYears);
                }}
              />
            </div>
          ) : activeTab === "layout" ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <CadPrintLayout
                project={project}
                memorialForm={memorialForm}
                selectedPolyline={selectedPolyline}
                rasters={displayRasters}
                streetProfiles={streetProfiles}
                secaoTipo={currentSecaoTipoParams()}
                initialSheetContent={printSheetContent}
                activeStreetProfileId={streetProfileId}
              />
            </div>
          ) : (
            <>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#1e293b] bg-[#0b1220]">
            <div className="flex shrink-0 flex-wrap gap-1 border-b border-[#1e293b] p-2">
              {(
                [
                  ["select", t("tools.select")],
                  ["pan", t("tools.pan")],
                  ["line", t("tools.line")],
                  ["polyline", t("tools.polyline")],
                  ["editPolygon", t("tools.editPolygon")],
                  ["confrontacao", t("tools.confrontacao")],
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
            ) : tool === "confrontacao" ? (
              <div className="border-b border-[#1e293b] bg-[#0f172a] px-3 py-2 text-xs text-[#94a3b8]">
                {drawHint ? (
                  <span className="text-amber-400">{drawHint}</span>
                ) : (
                  <span className="text-emerald-400">{t("tools.confrontacaoHint")}</span>
                )}
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
            ) : alignmentPickMode ? (
              <div className="flex items-center justify-between border-b border-[#1e293b] bg-[#0f172a] px-3 py-2 text-xs text-[#94a3b8]">
                <span className="text-amber-400">{t("commands.profileOps.pickAlignmentHint")}</span>
                <button
                  type="button"
                  onClick={() => setAlignmentPickMode(false)}
                  className="rounded border border-[#334155] px-2 py-0.5 text-[10px] text-[#cbd5e1] hover:bg-[#1e293b]"
                >
                  {t("commands.profileOps.cancelPick")}
                </button>
              </div>
            ) : appPickMode ? (
              <div className="flex items-center justify-between border-b border-[#1e293b] bg-[#0f172a] px-3 py-2 text-xs text-[#94a3b8]">
                <span className="text-amber-400">{t("loteamento.appPickBanner")}</span>
                <button
                  type="button"
                  onClick={() => {
                    setAppPickMode(false);
                    setAppApplyAfterPick(false);
                    setDrawHint(null);
                  }}
                  className="rounded border border-[#334155] px-2 py-0.5 text-[10px] text-[#cbd5e1] hover:bg-[#1e293b]"
                >
                  {t("commands.profileOps.cancelPick")}
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
            ) : loteamentoAlterarEixo ? (
              <div className="flex items-center justify-between border-b border-[#1e293b] bg-[#0f172a] px-3 py-2 text-xs text-[#94a3b8]">
                <span className="text-amber-400">
                  {loteamentoAlterarEixo.phase === "a"
                    ? t("loteamento.alterarEixoFirst")
                    : t("loteamento.alterarEixoSecond")}
                </span>
                <button
                  type="button"
                  onClick={() => cancelAlterarEixoTwoPoints()}
                  className="rounded border border-[#334155] px-2 py-0.5 text-[10px] text-[#cbd5e1] hover:bg-[#1e293b]"
                >
                  {t("commands.profileOps.cancelPick")}
                </button>
              </div>
            ) : loteamentoPickLado ? (
              <div className="flex items-center justify-between border-b border-[#1e293b] bg-[#0f172a] px-3 py-2 text-xs text-[#94a3b8]">
                <span className="text-amber-400">{t("loteamento.pickLadoBanner")}</span>
                <button
                  type="button"
                  onClick={() => setLoteamentoPickLado(false)}
                  className="rounded border border-[#334155] px-2 py-0.5 text-[10px] text-[#cbd5e1] hover:bg-[#1e293b]"
                >
                  {t("loteamento.pickLadoDone")}
                </button>
              </div>
            ) : drenagemPick ? (
              <div className="flex items-center justify-between border-b border-[#1e293b] bg-[#0f172a] px-3 py-2 text-xs text-[#94a3b8]">
                <span className="text-amber-400">
                  {drenagemPick === "pv"
                    ? t("drenagem.insertPvOn")
                    : drenagemPick === "outfall"
                      ? t("drenagem.insertOutfallOn")
                      : t("drenagem.insertPipeOn")}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDrenagemPick(null);
                    setDrenagemPipeFromId(null);
                    setDrawHint(null);
                  }}
                  className="rounded border border-[#334155] px-2 py-0.5 text-[10px] text-[#cbd5e1] hover:bg-[#1e293b]"
                >
                  {t("loteamento.pickLadoDone")}
                </button>
              </div>
            ) : null}

            <div
              ref={canvasContainerRef}
              className="relative min-h-0 w-full flex-1"
            >
            {viewMode === "3d" ? (
              <Cad3dView
                entities={visibleEntities}
                layers={project.layers}
                preferTin={hasTinLayer}
              />
            ) : (
            <>
            {hasBasemap ? (
              <div className="pointer-events-none absolute inset-0 overflow-hidden" style={basemapPanStyle}>
                <CadBasemapLayer
                  viewport={basemapViewport}
                  entities={visibleEntities}
                  overlays={basemapOverlays}
                  crs={project.crs}
                  georef={projectGeoref}
                />
              </div>
            ) : null}
            {displayRasters.some((r) => r.visible && (r.kind === "hypsometric" || r.kind === "cutfill")) ? (
              <CadRasterLegend
                rasters={displayRasters}
                showHypsometricLegend={showHypsometricLegend}
              />
            ) : null}
            <svg
              ref={svgRef}
              width="100%"
              height="100%"
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="xMidYMid meet"
              className={`relative z-10 ${areaPickMode || distancePickMode || profilePickMode || alignmentPickMode || appPickMode || loteamentoPickLado || loteamentoAlterarEixo || drenagemPick || tool === "editPolygon" || tool === "confrontacao" || tool !== "pan" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
              style={{ background: hasUnderlay ? "transparent" : undefined }}
              onMouseMove={(e) => {
                const { sx, sy } = toViewBoxCoords(e.clientX, e.clientY);
                const w = screenToWorld(sx, sy, viewport);
                scheduleCursor(w.x, w.y);

                if (isDrawWithPoints && snapToRtkPoints) {
                  const hit = findPointAtScreen(sx, sy, project.entities, viewport, 16);
                  setHoverSnapId(hit?.entityId ?? null);
                } else {
                  setHoverSnapId(null);
                }
                const lotHit = findLoteamentoLotAtPoint(project, w.x, w.y);
                setHoverLotId(lotHit?.id ?? null);

                if (loteamentoAlterarEixo?.phase === "b") {
                  const snap = loteamentoAlterarEixo.dragging
                    ? null
                    : snapAlterarEixoPoint(sx, sy, loteamentoAlterarEixo.eixoId);
                  const nextPoint = loteamentoAlterarEixo.dragging
                    ? w
                    : snap && snap.eixoId === loteamentoAlterarEixo.eixoId
                      ? snap.point
                      : w;
                  const nextVertex: CadVertex = {
                    x: nextPoint.x,
                    y: nextPoint.y,
                    z: "z" in nextPoint && typeof nextPoint.z === "number" ? nextPoint.z : 0,
                  };
                  setLoteamentoAlterarEixoPreview(nextVertex);
                  if (loteamentoAlterarEixo.dragging) {
                    setLoteamentoAlterarEixo((prev) =>
                      prev && prev.phase === "b"
                        ? { ...prev, pointB: nextVertex, stationB: prev.stationB ?? prev.stationA }
                        : prev,
                    );
                  }
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

                if (entityMove) {
                  const dx = w.x - entityMove.originX;
                  const dy = w.y - entityMove.originY;
                  const movedId = entityMove.id;
                  const nextVerts = (() => {
                    if (entityMove.hostVertices && entityMove.hostVertices.length >= 3) {
                      const moved = translateRingInsideHost(
                        entityMove.vertices.map((v) => [v.x, v.y] as [number, number]),
                        entityMove.hostVertices.map((v) => [v.x, v.y] as [number, number]),
                        dx,
                        dy,
                      );
                      return moved.map(([x, y], i) => ({
                        x,
                        y,
                        z: entityMove.vertices[i]?.z ?? 0,
                      }));
                    }
                    return entityMove.vertices.map((v) => ({
                      ...v,
                      x: v.x + dx,
                      y: v.y + dy,
                    }));
                  })();
                  const c0 = polygonCentroid(entityMove.vertices);
                  const c1 = polygonCentroid(nextVerts);
                  const ldx = c1.x - c0.x;
                  const ldy = c1.y - c0.y;
                  const labelMoves = entityMove.labels;
                  setProject((prev) => {
                    const next = {
                      ...prev,
                      entities: prev.entities.map((ent) => {
                        if (ent.id === movedId && ent.type === "polyline") {
                          return { ...ent, vertices: nextVerts };
                        }
                        const label = labelMoves.find((item) => item.id === ent.id);
                        if (label && ent.type === "point") {
                          return { ...ent, x: label.x + ldx, y: label.y + ldy };
                        }
                        return ent;
                      }),
                    };
                    projectLiveRef.current = next;
                    return next;
                  });
                }

                if (pvDrag) {
                  const nx = pvDrag.startX + (w.x - pvDrag.originX);
                  const ny = pvDrag.startY + (w.y - pvDrag.originY);
                  setProject((prev) => moveDrainagePv(prev, pvDrag.id, nx, ny));
                }

                if (vertexDragIndex !== null && selectedId) {
                  const entity = project.entities.find((e) => e.id === selectedId);
                  if (entity?.type === "polyline") {
                    const current = entity.vertices[vertexDragIndex];
                    const world = screenToWorld(sx, sy, viewport);
                    const isReserva =
                      Boolean(entity.closed) && entity.layerId === AREA_RESERVA_LEGAL_LAYER_ID;
                    const isAreaUtil =
                      Boolean(entity.closed) && entity.layerId === AREA_UTIL_LAYER_ID;
                    const isApp =
                      Boolean(entity.closed) && entity.layerId === AREA_APP_LAYER_ID;
                    let nx = world.x;
                    let ny = world.y;
                    if (isReserva || isAreaUtil) {
                      const c = polygonCentroid(entity.vertices);
                      const host =
                        (loteamentoGlebaId
                          ? project.entities.find(
                              (item) =>
                                item.id === loteamentoGlebaId &&
                                item.type === "polyline" &&
                                item.closed &&
                                item.vertices.length >= 3,
                            )
                          : null) ??
                        project.entities.find(
                          (item): item is CadPolylineEntity =>
                            item.type === "polyline" &&
                            Boolean(item.closed) &&
                            item.id !== entity.id &&
                            item.layerId !== AREA_RESERVA_LEGAL_LAYER_ID &&
                            item.layerId !== AREA_APP_LAYER_ID &&
                            item.layerId !== AREA_UTIL_LAYER_ID &&
                            item.vertices.length >= 3 &&
                            pointInPolygon(c.x, c.y, item.vertices),
                        );
                      if (host && host.type === "polyline") {
                        const clamped = clampPointInsideHost(
                          [world.x, world.y],
                          host.vertices.map((v) => [v.x, v.y]),
                        );
                        nx = clamped[0];
                        ny = clamped[1];
                      }
                    }
                    setProject((prev) => {
                      const updated = {
                        ...prev,
                        entities: prev.entities.map((ent) => {
                          if (ent.id !== selectedId || ent.type !== "polyline") return ent;
                          return {
                            ...ent,
                            vertices: ent.vertices.map((v, i) =>
                              i === vertexDragIndex ? { x: nx, y: ny, z: current?.z ?? 0 } : v,
                            ),
                          };
                        }),
                      };
                      const synced = isReserva
                        ? syncReservaLegalLabel(updated, selectedId)
                        : isAreaUtil
                          ? syncAreaUtilLabel(updated, selectedId)
                          : isApp
                            ? syncAppLabel(updated, selectedId)
                            : updated;
                      projectLiveRef.current = synced;
                      return synced;
                    });
                  }
                }
              }}
              onMouseDown={(e) => {
                const { sx, sy } = toViewBoxCoords(e.clientX, e.clientY);
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
                      if (isLoteamentoEixoPolyline(entity)) eixoEditActiveRef.current = true;
                      return;
                    }
                  }
                }
                if (
                  tool === "select" &&
                  !loteamentoPickLado &&
                  !loteamentoAlterarEixo &&
                  !drenagemPick &&
                  !areaPickMode &&
                  !distancePickMode &&
                  !profilePickMode &&
                  !alignmentPickMode &&
                  !appPickMode
                ) {
                  const wts = (x: number, y: number) => worldToScreen(x, y, viewport);
                  const world = screenToWorld(sx, sy, viewport);
                  const reservaCandidates = project.entities.filter(
                    (item): item is CadPolylineEntity =>
                      item.type === "polyline" &&
                      Boolean(item.closed) &&
                      (item.layerId === AREA_RESERVA_LEGAL_LAYER_ID ||
                        item.layerId === AREA_APP_LAYER_ID ||
                        item.layerId === AREA_UTIL_LAYER_ID) &&
                      item.vertices.length >= 3,
                  );
                  const selectedReserva =
                    selectedId && reservaCandidates.find((item) => item.id === selectedId);
                  const reservaVertexOrder = selectedReserva
                    ? [selectedReserva, ...reservaCandidates.filter((item) => item.id !== selectedReserva.id)]
                    : reservaCandidates;
                  for (const cand of reservaVertexOrder) {
                    const vtx = hitTestPolylineVertexIndex(sx, sy, cand.vertices, wts, 12);
                    if (vtx !== null) {
                      setSelectedId(cand.id);
                      setSelectedVertexIndex(vtx);
                      setVertexDragIndex(vtx);
                      return;
                    }
                  }
                  const hitReserva =
                    (selectedReserva &&
                      (pointInPolygon(world.x, world.y, selectedReserva.vertices) ||
                        hitTestPolyline(sx, sy, selectedReserva.vertices, true, wts)))
                      ? selectedReserva
                      : reservaCandidates.find(
                          (item) =>
                            pointInPolygon(world.x, world.y, item.vertices) ||
                            hitTestPolyline(sx, sy, item.vertices, true, wts),
                        );
                  if (hitReserva) {
                    const c = polygonCentroid(hitReserva.vertices);
                    const isAppPoly = hitReserva.layerId === AREA_APP_LAYER_ID;
                    const isUtilPoly = hitReserva.layerId === AREA_UTIL_LAYER_ID;
                    const labels = project.entities
                      .filter((item): item is CadPointEntity => {
                        if (item.type !== "point" || item.layerId !== CAD_TEXT_LAYER.id) return false;
                        const label = item.label ?? "";
                        if (isAppPoly) return label.startsWith("APP ");
                        if (isUtilPoly) return label.startsWith("Área útil");
                        return label.startsWith("Reserva legal");
                      })
                      .filter((item) => Math.hypot(item.x - c.x, item.y - c.y) < 12)
                      .map((item) => ({ id: item.id, x: item.x, y: item.y }));
                    const host = isAppPoly
                      ? undefined
                      : ((loteamentoGlebaId
                          ? project.entities.find(
                              (item) =>
                                item.id === loteamentoGlebaId &&
                                item.type === "polyline" &&
                                item.closed &&
                                item.vertices.length >= 3,
                            )
                          : null) ??
                        project.entities.find(
                          (item): item is CadPolylineEntity =>
                            item.type === "polyline" &&
                            Boolean(item.closed) &&
                            item.id !== hitReserva.id &&
                            item.layerId !== AREA_RESERVA_LEGAL_LAYER_ID &&
                            item.layerId !== AREA_APP_LAYER_ID &&
                            item.layerId !== AREA_UTIL_LAYER_ID &&
                            item.vertices.length >= 3 &&
                            pointInPolygon(c.x, c.y, item.vertices),
                        ));
                    setSelectedId(hitReserva.id);
                    setEntityMove({
                      id: hitReserva.id,
                      originX: world.x,
                      originY: world.y,
                      vertices: hitReserva.vertices.map((v) => ({ ...v })),
                      labels,
                      hostVertices:
                        host && host.type === "polyline"
                          ? host.vertices.map((v) => ({ ...v }))
                          : undefined,
                    });
                    return;
                  }
                }
                if (
                  tool === "select" &&
                  !loteamentoPickLado &&
                  !loteamentoAlterarEixo &&
                  !drenagemPick &&
                  !areaPickMode &&
                  !distancePickMode &&
                  !profilePickMode &&
                  !alignmentPickMode &&
                  !appPickMode
                ) {
                  const wts = (x: number, y: number) => worldToScreen(x, y, viewport);
                  const world = screenToWorld(sx, sy, viewport);
                  const eixoCandidates = project.entities.filter(isLoteamentoEixoPolyline);
                  const selectedEixo =
                    selectedId && eixoCandidates.find((item) => item.id === selectedId);
                  const eixoOrder = selectedEixo
                    ? [selectedEixo, ...eixoCandidates.filter((item) => item.id !== selectedEixo.id)]
                    : eixoCandidates;
                  for (const cand of eixoOrder) {
                    const vtx = hitTestPolylineVertexIndex(sx, sy, cand.vertices, wts, 12);
                    if (vtx !== null) {
                      setSelectedId(cand.id);
                      setSelectedVertexIndex(vtx);
                      setVertexDragIndex(vtx);
                      eixoEditActiveRef.current = true;
                      return;
                    }
                  }
                  const hitEixo =
                    (selectedEixo && hitTestPolyline(sx, sy, selectedEixo.vertices, false, wts)
                      ? selectedEixo
                      : eixoCandidates.find((item) =>
                          hitTestPolyline(sx, sy, item.vertices, false, wts),
                        )) ?? null;
                  if (hitEixo) {
                    setSelectedId(hitEixo.id);
                    setEntityMove({
                      id: hitEixo.id,
                      originX: world.x,
                      originY: world.y,
                      vertices: hitEixo.vertices.map((v) => ({ ...v })),
                      labels: [],
                    });
                    eixoEditActiveRef.current = true;
                    return;
                  }
                }
                if (tool === "select" && !drenagemPick && !loteamentoPickLado && !loteamentoAlterarEixo && !appPickMode) {
                  const wts = (x: number, y: number) => worldToScreen(x, y, viewport);
                  const hitPv = hitDrainagePvAtScreen(sx, sy, project, wts, 14);
                  if (hitPv) {
                    const world = screenToWorld(sx, sy, viewport);
                    setSelectedId(hitPv.id);
                    focusDrainageCalc(hitPv.id, false);
                    setPvDrag({
                      id: hitPv.id,
                      startX: hitPv.x,
                      startY: hitPv.y,
                      originX: world.x,
                      originY: world.y,
                    });
                    return;
                  }
                }
                handleCanvasClick(sx, sy);
              }}
              onMouseUp={() => {
                if (alterarEixoIgnoreUpRef.current) {
                  alterarEixoIgnoreUpRef.current = false;
                } else {
                  const draft = loteamentoAlterarEixoRef.current;
                  if (draft?.phase === "b" && draft.dragging && draft.pointB && draft.stationB != null) {
                    finishAlterarEixoTwoPoints(draft, draft.pointB, draft.stationB);
                  }
                }
                const shouldRebuildEixo = eixoEditActiveRef.current && loteamentoAjusteEixo;
                eixoEditActiveRef.current = false;
                setPanning(null);
                setVertexDragIndex(null);
                setEntityMove(null);
                setPvDrag(null);
                if (shouldRebuildEixo) applyEditedEixosToLoteamento();
              }}
              onMouseLeave={() => {
                if (alterarEixoIgnoreUpRef.current) {
                  alterarEixoIgnoreUpRef.current = false;
                } else {
                  const draft = loteamentoAlterarEixoRef.current;
                  if (draft?.phase === "b" && draft.dragging && draft.pointB && draft.stationB != null) {
                    finishAlterarEixoTwoPoints(draft, draft.pointB, draft.stationB);
                  }
                }
                const shouldRebuildEixo = eixoEditActiveRef.current && loteamentoAjusteEixo;
                eixoEditActiveRef.current = false;
                setPanning(null);
                setVertexDragIndex(null);
                setEntityMove(null);
                setPvDrag(null);
                setHoverSnapId(null);
                setHoverLotId(null);
                setDrawPreview(null);
                if (shouldRebuildEixo) applyEditedEixosToLoteamento();
              }}
              onDoubleClick={() => {
                if (tool === "polyline" && draft.length >= 3) finishPolyline(true);
                else if (tool === "polyline" && draft.length >= 2) finishPolyline(false);
              }}
            >
              {!hasUnderlay ? (
                <rect width={width} height={height} fill="#0b1220" />
              ) : null}
              <CadHatchDefs layers={visibleCadLayers} />
              <CadRasterSvgLayer rasters={canvasRasters} viewport={viewport} />
              {renderCoordinateGrid()}
              {visibleEntities.map(renderEntity)}

              {selectedPolyline &&
              ((tool === "editPolygon" && canEditSelectedPolyline) ||
                (selectedPolyline.closed &&
                  (selectedPolyline.layerId === AREA_RESERVA_LEGAL_LAYER_ID ||
                    selectedPolyline.layerId === AREA_APP_LAYER_ID ||
                    selectedPolyline.layerId === AREA_UTIL_LAYER_ID) &&
                  (tool === "select" || tool === "editPolygon")) ||
                (isLoteamentoEixoPolyline(selectedPolyline) &&
                  (tool === "select" || tool === "editPolygon"))) ? (
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

              {tool === "select"
                ? visibleEntities.filter(isLoteamentoEixoPolyline).map((eixo) => {
                    if (eixo.id === selectedId) return null;
                    return (
                      <g key={`eixo-grips-${eixo.id}`}>
                        {eixo.vertices.map((vertex, index) => {
                          const point = worldToScreen(vertex.x, vertex.y, viewport);
                          return (
                            <rect
                              key={`eixo-v-${eixo.id}-${index}`}
                              x={point.sx - 4}
                              y={point.sy - 4}
                              width={8}
                              height={8}
                              fill="#fbbf24"
                              stroke="#ffffff"
                              strokeWidth={1}
                            />
                          );
                        })}
                      </g>
                    );
                  })
                : null}

              {loteamentoAlterarEixo?.phase === "b" ? (
                <g>
                  {(() => {
                    const a = worldToScreen(
                      loteamentoAlterarEixo.pointA.x,
                      loteamentoAlterarEixo.pointA.y,
                      viewport,
                    );
                    const preview = loteamentoAlterarEixoPreview ?? loteamentoAlterarEixo.pointB;
                    const b = preview
                      ? worldToScreen(preview.x, preview.y, viewport)
                      : null;
                    return (
                      <>
                        <circle cx={a.sx} cy={a.sy} r={6} fill="#fbbf24" stroke="#ffffff" strokeWidth={1.4} />
                        {b ? (
                          <>
                            <line
                              x1={a.sx}
                              y1={a.sy}
                              x2={b.sx}
                              y2={b.sy}
                              stroke="#facc15"
                              strokeWidth={2.2}
                              strokeDasharray="7 5"
                              strokeLinecap="round"
                            />
                            <circle cx={b.sx} cy={b.sy} r={6} fill="#38bdf8" stroke="#ffffff" strokeWidth={1.4} />
                          </>
                        ) : null}
                      </>
                    );
                  })()}
                </g>
              ) : null}

              {visibleEntities.map((entity) => {
                if (entity.type !== "polyline" || !entity.closed || entity.vertices.length < 3) {
                  return null;
                }
                if (
                  entity.layerId === CONTOUR_LAYER.id ||
                  entity.layerId === INTERPOLATED_CONTOUR_LAYER.id
                ) {
                  return null;
                }
                const wts = (x: number, y: number) => worldToScreen(x, y, viewport);
                const labels = confrontationScreenLabels(
                  entity.vertices,
                  entity.confrontations,
                  true,
                  wts,
                  14,
                );
                const isSelected = entity.id === selectedId;
                return (
                  <g key={`conf-labels-${entity.id}`}>
                    {isSelected && selectedSegmentIndex !== null ? (() => {
                      const from = entity.vertices[selectedSegmentIndex];
                      const to = entity.vertices[(selectedSegmentIndex + 1) % entity.vertices.length];
                      if (!from || !to) return null;
                      const pa = wts(from.x, from.y);
                      const pb = wts(to.x, to.y);
                      return (
                        <line
                          x1={pa.sx}
                          y1={pa.sy}
                          x2={pb.sx}
                          y2={pb.sy}
                          stroke="#00c8f0"
                          strokeWidth={4}
                          strokeLinecap="round"
                        />
                      );
                    })() : null}
                    <CadConfrontationLabels
                      labels={labels}
                      fill="#fde68a"
                      fontSize={11}
                      stroke="#0b1220"
                      strokeWidth={3}
                    />
                  </g>
                );
              })}

              {(() => {
                const glebaId = loteamentoGlebaId.trim() || selectedId;
                const gleba = glebaId
                  ? project.entities.find((entity) => entity.id === glebaId)
                  : null;
                if (
                  !gleba ||
                  gleba.type !== "polyline" ||
                  !gleba.closed ||
                  loteamentoLados.length === 0
                ) {
                  return null;
                }
                const wts = (x: number, y: number) => worldToScreen(x, y, viewport);
                return (
                  <g className="loteamento-lados" pointerEvents="none">
                    {loteamentoLados.map((index) => {
                      const from = gleba.vertices[index];
                      const to = gleba.vertices[(index + 1) % gleba.vertices.length];
                      if (!from || !to) return null;
                      const pa = wts(from.x, from.y);
                      const pb = wts(to.x, to.y);
                      return (
                        <g key={`lado-via-${index}`}>
                          <line
                            x1={pa.sx}
                            y1={pa.sy}
                            x2={pb.sx}
                            y2={pb.sy}
                            stroke="#34d399"
                            strokeWidth={5}
                            strokeLinecap="round"
                          />
                          <text
                            x={(pa.sx + pb.sx) / 2}
                            y={(pa.sy + pb.sy) / 2 - 6}
                            fill="#bbf7d0"
                            fontSize={10}
                            textAnchor="middle"
                            stroke="#0b1220"
                            strokeWidth={3}
                            paintOrder="stroke"
                          >
                            {t("loteamento.ladoLabel")}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })()}

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
            {esquinaTooltip ? (
              <div className="pointer-events-none absolute left-3 top-3 z-20 max-w-xs rounded-lg border border-[#0f2848] bg-white/95 px-3 py-2 text-[11px] leading-5 text-[#0f2848] shadow-md whitespace-pre-line">
                {esquinaTooltip}
              </div>
            ) : null}
            <CadBasemapAttribution overlays={basemapOverlays} />
            </>
            )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#1e293b] px-3 py-2 text-[10px] text-[#94a3b8]">
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

          {drenagemPlanilhaOpen && listDrainagePipes(project).length > 0 ? (
            <div className="shrink-0">
              <CadDrainagePlanilha
                project={project}
                params={currentDrainageParams()}
                selectedId={selectedId}
                variant="dock"
                onSelectId={(id) => {
                  setSelectedId(id);
                  setToolsTab("drenagem");
                }}
                onProjectChange={setProject}
                onRecalc={recalcularDrenagem}
                onExport={exportarDrenagemPlanilha}
                onHydrologyChange={(patch) => {
                  if (patch.runoffC != null) setDrenagemC(patch.runoffC);
                  if (patch.intensityMmH != null) setDrenagemIntensity(patch.intensityMmH);
                  if (patch.returnPeriodYears != null) setDrenagemTr(patch.returnPeriodYears);
                }}
              />
            </div>
          ) : null}

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setDrawingChartsOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-medium text-[#0f2848] hover:bg-[#f9fafb]"
            >
              <span>{drawingChartsOpen ? t("drawingCharts.hide") : t("drawingCharts.show")}</span>
              <span aria-hidden>{drawingChartsOpen ? "▾" : "▸"}</span>
            </button>
            {drawingChartsOpen ? (
              <div className="mt-2 max-h-40 min-h-0 space-y-2 overflow-y-auto">
                {(() => {
                  const activeStreet = streetProfiles.find((p) => p.streetId === streetProfileId) ?? streetProfiles[0];
                  const secaoApplied =
                    secaoTipoApplied || project.entities.some((e) => e.layerId === LOTEAMENTO_SECAO_LAYER.id);
                  if (!activeStreet && !secaoApplied) return null;
                  const greideZ = activeStreet ? interpolateGreideZ(activeStreet.greide, 0) : 100;
                  return (
                    <div ref={secaoViewRef} className="space-y-2">
                    <div className={activeStreet ? "grid gap-3 lg:grid-cols-2" : "grid gap-3"}>
                      {activeStreet ? (
                      <StreetProfileChart
                        profile={activeStreet}
                        onGreideChange={(pivId, z) =>
                          patchStreetGreide(activeStreet.streetId, updateGreidePiv(activeStreet, pivId, z))
                        }
                        onAddPiv={(stationM, z) =>
                          patchStreetGreide(activeStreet.streetId, addGreidePiv(activeStreet, stationM, z))
                        }
                      />
                      ) : null}
                      <div className="rounded-lg border border-[#ddd6fe] bg-[#f5f3ff] p-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-[#0f2848]">{t("loteamento.perfil.secaoChartTitle")}</p>
                            {activeStreet ? (
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7c3aed]">
                              {activeStreet.streetName}
                            </p>
                            ) : null}
                            <p className="text-[10px] text-[#6b7280]">{t("loteamento.perfil.secaoChartHint")}</p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setPrintSheetContent("secao-tipo");
                                setActiveTab("layout");
                              }}
                              className="rounded-md border border-[#7c3aed] px-2 py-1 text-[10px] font-medium text-[#6d28d9] hover:bg-white"
                            >
                              {t("loteamento.perfil.openPrint")}
                            </button>
                            {activeStreet ? (
                            <button
                              type="button"
                              onClick={() => {
                                setPrintSheetContent("perfil");
                                setActiveTab("layout");
                              }}
                              className="rounded-md border border-[#2563eb] px-2 py-1 text-[10px] font-medium text-[#1d4ed8] hover:bg-white"
                            >
                              {t("loteamento.perfil.openPrintPerfil")}
                            </button>
                            ) : null}
                          </div>
                        </div>
                        <SecaoTipoPreview
                          variant="chart"
                          params={currentSecaoTipoParams()}
                          greideZ={greideZ}
                          title={t("loteamento.perfil.secaoChartTitle")}
                          streetName={activeStreet?.streetName}
                          pistaLabel={t("loteamento.perfil.previewPista")}
                          calcadaLabel={t("loteamento.perfil.previewCalcada")}
                          corteLabel={t("loteamento.perfil.previewCorte")}
                          aterroLabel={t("loteamento.perfil.previewAterro")}
                          axisLabel={t("loteamento.perfil.axis")}
                        />
                      </div>
                    </div>
                    </div>
                  );
                })()}
                <CadProfileView project={project} selectedId={selectedId} />
                {listDrainagePipes(project).length > 0 ? (
                  <CadDrainageWaterProfileChart
                    project={project}
                    selectedPipeId={
                      selectedId && listDrainagePipes(project).some((p) => p.id === selectedId)
                        ? selectedId
                        : listDrainagePipes(project)[0]?.id ?? null
                    }
                    setProject={setProject}
                  />
                ) : null}
                {listDrainagePipes(project).length > 0 ? (
                  <CadDrainageWaterProfileChart
                    project={project}
                    selectedPipeId={
                      selectedId && listDrainagePipes(project).some((p) => p.id === selectedId)
                        ? selectedId
                        : listDrainagePipes(project)[0]?.id ?? null
                    }
                    setProject={setProject}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
            </>
          )}
          </div>
        </div>
        </div>

      <CadAiChat
        project={project}
        selectedId={selectedId}
        selectedVertexIndex={selectedVertexIndex}
        selectedSegmentIndex={selectedSegmentIndex}
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
      <input
        ref={orthoFileRef}
        type="file"
        accept=".tif,.tiff,.jpg,.jpeg,.png,.ecw,image/tiff,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleImportReurbOrtho(file);
        }}
      />
      <input
        ref={projectFileRef}
        type="file"
        accept=".json,.cad.json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleOpenProjectFile(file);
        }}
      />
      <input
        ref={drawingFileRef}
        type="file"
        accept=".dwg,.dxf,.kmz,.kml,application/dxf,application/acad,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleImportCadDrawingFile(file);
        }}
      />
      <input
        ref={drenagemInpRef}
        type="file"
        accept=".inp,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) importarDrenagemSwmm(file);
        }}
      />
    </div>
  );
}
