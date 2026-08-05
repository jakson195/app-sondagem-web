import {
  defaultColorScale,
  paletteColor,
  resolveLogBounds,
  rhoToNormalized,
  type ResistivityColorScale,
} from "./colormap";
import {
  buildAdaptiveContrastMapper,
  buildLogPercentileScale,
  cloneFloat64Array,
  makeHistogramEqualizeMapper,
  makeStdStretchMapper,
  resolveModelDisplayBounds,
  rhoToNormalizedLinear,
  validateModelForRender,
  type ModelContrastMode,
  type ModelDisplayScale,
} from "./model-visual-scale";
import {
  res2dinvLegendLabels,
  rhoToRes2dinvNormalized,
  RESIPY_RESULTS_LEGEND_BREAKS_OHM,
} from "./res2dinv-colormap";
import { RES2DINV_DISPLAY_SMOOTH_PASSES } from "./res2dinv-preset";
import {
  RES2DINV_MODEL_DEPTH_FACTOR,
} from "./model-depth";
import {
  buildModelZCoverProfile,
  buildSensitivityZCoverProfile,
  paintModelCellsOnCanvas,
  profileDisplayDepthMaxM,
  putRgbaOnCanvas,
  rasterizeModelSection,
  type ModelRenderMode,
} from "./model-section-render";
import {
  pathTrapezoidCoverage,
  strokeTrapezoidCoverage,
} from "./geotechnical-section-render";
import {
  drawElectrodeDotsOnSurface,
  formatDistTick,
  formatElevTick,
  pathTopographyTrapezoid,
  rasterizeModelWithTopography,
  resolveTopographyElevBounds,
  strokeTopographySurface,
  uniqueElectrodePositionsFromReadings,
} from "./model-topography-render";
import type { TopographyPoint } from "./topography-types";
import type { Dipolo2DReading } from "./types";

export type PseudoHit = {
  readingIndex: number;
  cx: number;
  cy: number;
  r: number;
};

/** Formata ρa para rótulos na pseudoseção. */
export function formatRhoApparentOhmM(rho: number): string {
  if (!Number.isFinite(rho) || rho <= 0) return "—";
  if (rho >= 1000) return rho.toFixed(0);
  if (rho >= 100) return rho.toFixed(1);
  if (rho >= 10) return rho.toFixed(2);
  return rho.toFixed(3);
}

function drawSelectedRhoLabel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rad: number,
  rho: number,
  canvasW: number,
  theme: CanvasPlotTheme,
) {
  const text = `${formatRhoApparentOhmM(rho)} Ω·m`;
  ctx.font = "600 11px system-ui,sans-serif";
  const tw = ctx.measureText(text).width;
  const padX = 5;
  const padY = 3;
  const boxW = tw + padX * 2;
  const boxH = 16 + padY * 2;
  let x = cx + rad + 8;
  if (x + boxW > canvasW - 6) x = cx - rad - 8 - boxW;
  const y = cy - boxH / 2;

  ctx.fillStyle = theme.isDark
    ? "rgba(15,23,42,0.94)"
    : "rgba(255,255,255,0.96)";
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = theme.text;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, cy);
  ctx.textBaseline = "alphabetic";
}

export type PseudoDrawOptions = {
  factorDepth: number;
  apparentOverride?: number[];
  excludedIndices?: Set<number>;
  selectedIndex?: number | null;
  colorScale?: ResistivityColorScale;
  title?: string;
};

export type ModelDrawOptions = {
  colorScale?: ResistivityColorScale;
  /** Leituras ativas para máscara trapezoidal e escala de cor. */
  readings?: Dipolo2DReading[];
  factorDepth?: number;
  iterations?: number;
  rmsLog10?: number;
  /** RMS relativo médio em % (Ω·m) — compatível com RES2DINV «Abs. error». */
  rmsPercent?: number;
  methodLabel?: string;
  /** Motor de inversão (ResIPy R2 ou proxy). */
  invertEngine?: "physics" | "proxy";
  /** Exagero horizontal do perfil (1 = natural). */
  scaleXM?: number;
  /** Exagero vertical / profundidade (1 = natural). */
  scaleZM?: number;
  /** Níveis discretos na paleta (RES2DINV ~16–24). */
  colorLevels?: number;
  /** Passes de suavização só na exibição (0 = células brutas, estilo RES2DINV). */
  displaySmoothPasses?: number;
  /** Contraste da paleta (P5–P95 recomendado). */
  logContrast?: ModelLogContrast;
  /** Escala de cor: log₁₀(ρ) (RES2DINV) ou linear em Ω·m. */
  displayScale?: ModelDisplayScale;
  /** full = sem trapézio (evita faixas brancas); coverage = máscara por profundidade. */
  maskMode?: "full" | "coverage";
  /** Células discretas vs bilinear (contour contínuo ResIPy). */
  renderMode?: ModelRenderMode;
  activeCells?: boolean[] | null;
  zCoverM?: number[] | null;
  /** Renderização off-screen (exportação PNG). */
  exportWidthPx?: number;
  exportHeightPx?: number;
  devicePixelRatio?: number;
  /** Largura do contentor (1:1) — evita que o canvas altere a referência ao mudar escala. */
  containerWidthPx?: number;
  /** Perfil topográfico (distância m, cota m). */
  topography?: TopographyPoint[];
  showTopography?: boolean;
  /** Título superior (ex.: «Geofisica - GARUVA (LINHA 10)»). */
  sectionTitle?: string;
  /** Fator profundidade máxima do modelo (× n × a) — trapézio / eixo Depth estilo RES2DINV. */
  modelDepthFactor?: number;
  /** Recorta eixo vertical à pseudoprofundidade (0,286·n·a); por defeito desligado. */
  cropToCoverage?: boolean;
  /** Proporção 1:1 entre distância e profundidade/cota (ResIPy «Equal»). Por defeito activo. */
  equalAspect?: boolean;
  /** Legenda vertical à direita (estilo ResIPy Results). */
  legendStyle?: "bottom" | "resipy";
  /** Rótulos «Distance [m]» / «Elevation [m]». */
  resipyAxisLabels?: boolean;
  /** Pontos nos eletrodos sobre a topografia. */
  showElectrodes?: boolean;
};

const MODEL_PAD_L = 52;
const MODEL_PAD_R = 24;
const MODEL_PAD_R_RESIPY = 88;
const MODEL_PAD_T = 28;
const MODEL_PAD_B = 108;
const MODEL_LEGEND_EXTRA = 56;
const MODEL_BASE_PLOT_ASPECT = 0.45;
/** Espaço para eixo de distância no topo (modo topografia). */
const MODEL_TOP_DIST_AXIS = 20;

function clampScale(v: number | undefined): number {
  const x = v ?? 1;
  return Math.max(0.25, Math.min(4, x));
}

function measureModelContainerWidth(canvas: HTMLCanvasElement): number {
  const parent = canvas.parentElement;
  if (parent && parent.clientWidth > 0) return parent.clientWidth;
  const rect = canvas.getBoundingClientRect();
  if (rect.width > 0) return rect.width;
  if (canvas.clientWidth > 0) return canvas.clientWidth;
  return 800;
}

function modelCanvasLayout(
  canvas: HTMLCanvasElement,
  scaleXM: number,
  scaleZM: number,
  opts: ModelDrawOptions,
): { ctx: CanvasRenderingContext2D; w: number; h: number; plotW: number; plotH: number; plotTop: number } | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const scaleX = clampScale(scaleXM);
  const scaleZ = clampScale(scaleZM);
  const padL = MODEL_PAD_L;
  const padR = opts.legendStyle === "resipy" ? MODEL_PAD_R_RESIPY : MODEL_PAD_R;
  const padT = MODEL_PAD_T;
  const padB = MODEL_PAD_B;
  const isExport = Boolean(opts.exportWidthPx && opts.exportWidthPx > 0);
  const topoMode =
    opts.showTopography &&
    opts.topography &&
    opts.topography.length >= 2;
  const plotTop = padT + (topoMode ? MODEL_TOP_DIST_AXIS : 0);

  let containerW: number;
  if (isExport) {
    containerW = opts.exportWidthPx!;
  } else if (opts.containerWidthPx && opts.containerWidthPx > 0) {
    containerW = opts.containerWidthPx;
  } else {
    containerW = Math.max(480, measureModelContainerWidth(canvas));
  }

  /** Moldura fixa — largura = contentor; escala horizontal altera proporção x:z (cabe na tela). */
  const frameW = containerW;
  const basePlotW = frameW - padL - padR;
  const basePlotH = basePlotW * MODEL_BASE_PLOT_ASPECT;

  let plotW: number;
  let plotH: number;
  let cssW: number;
  let cssH: number;

  if (isExport) {
    plotW = basePlotW * scaleX;
    plotH = basePlotH * scaleZ;
    cssW = Math.max(frameW, padL + padR + plotW);
    cssH =
      opts.exportHeightPx && opts.exportHeightPx > 0
        ? opts.exportHeightPx
        : Math.max(
            plotTop + padB + MODEL_LEGEND_EXTRA + basePlotH,
            plotTop + padB + MODEL_LEGEND_EXTRA + plotH,
          );
  } else {
    plotW = basePlotW;
    plotH = (basePlotH * scaleZ) / scaleX;
    cssW = frameW;
    cssH = plotTop + padB + MODEL_LEGEND_EXTRA + plotH;
  }

  const dpr =
    opts.devicePixelRatio ??
    (typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 2);
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);

  if (!isExport) {
    canvas.style.display = "block";
    canvas.style.verticalAlign = "top";
    canvas.style.width = "100%";
    canvas.style.maxWidth = "100%";
    canvas.style.height = `${Math.ceil(cssH)}px`;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cssW, cssH);

  return { ctx, w: cssW, h: cssH, plotW, plotH, plotTop };
}

/** Canvas 2D não resolve `var(--*)` — ler cores do tema explicitamente. */
export type CanvasPlotTheme = {
  surface: string;
  text: string;
  muted: string;
  border: string;
  isDark: boolean;
};

export function readCanvasPlotTheme(): CanvasPlotTheme {
  if (typeof document === "undefined") {
    return {
      surface: "#f8fafc",
      text: "#0f172a",
      muted: "#475569",
      border: "#cbd5e1",
      isDark: false,
    };
  }
  const root = getComputedStyle(document.documentElement);
  const surface = root.getPropertyValue("--surface").trim() || "#f8fafc";
  const text = root.getPropertyValue("--text").trim() || "#0f172a";
  const muted = root.getPropertyValue("--muted").trim() || "#64748b";
  const border = root.getPropertyValue("--border").trim() || "#e2e8f0";
  const isDark = /020617|0f172a/i.test(surface);
  return {
    surface,
    text,
    muted: isDark ? "#e2e8f0" : muted,
    border,
    isDark,
  };
}

function setupCanvas(canvas: HTMLCanvasElement, aspect = 0.45) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const w = canvas.clientWidth;
  const h = Math.min(480, Math.max(300, Math.floor(w * aspect)));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const theme = readCanvasPlotTheme();
  ctx.fillStyle = theme.surface;
  ctx.fillRect(0, 0, w, h);
  return { ctx, w, h, theme };
}

export function drawPseudoScatter(
  canvas: HTMLCanvasElement,
  readings: Dipolo2DReading[],
  opts: PseudoDrawOptions,
): PseudoHit[] {
  const hits: PseudoHit[] = [];
  const setup = setupCanvas(canvas);
  if (!setup || readings.length === 0) return hits;
  const { ctx, w, h, theme } = setup;
  const {
    factorDepth,
    apparentOverride,
    excludedIndices,
    selectedIndex,
    colorScale = defaultColorScale,
    title,
  } = opts;

  const xs = readings.map((r) => r.stationM);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const zMax = Math.max(
    ...readings.map((r) => factorDepth * r.n * r.aM),
    1e-6,
  );

  const rhoValues = readings.map(
    (r, i) => apparentOverride?.[i] ?? r.rhoApparentOhmM,
  );
  const { logLo, logHi } = resolveLogBounds(rhoValues, colorScale);

  const padL = 52;
  const padR = 56;
  const padT = 20;
  const padB = 28;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const sx = (x: number) => padL + ((x - xMin) / (xMax - xMin || 1)) * plotW;
  const sy = (z: number) => padT + (z / (zMax || 1)) * plotH;

  for (let i = 0; i < readings.length; i++) {
    const r = readings[i]!;
    const excluded = excludedIndices?.has(i) ?? false;
    const z = factorDepth * r.n * r.aM;
    const rhoUse = rhoValues[i]!;
    const t = rhoToNormalized(rhoUse, logLo, logHi);
    const [cr, cg, cb] = paletteColor(colorScale.palette, t);
    const cx = sx(r.stationM);
    const cy = sy(z);
    const rad = Math.max(5, Math.min(16, plotW / (readings.length * 0.32)));

    if (excluded) {
      ctx.fillStyle = "rgba(148,163,184,0.35)";
      ctx.strokeStyle = "rgba(100,116,139,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - rad * 0.55, cy - rad * 0.55);
      ctx.lineTo(cx + rad * 0.55, cy + rad * 0.55);
      ctx.moveTo(cx + rad * 0.55, cy - rad * 0.55);
      ctx.lineTo(cx - rad * 0.55, cy + rad * 0.55);
      ctx.stroke();
      if (selectedIndex === i) {
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, rad + 3, 0, Math.PI * 2);
        ctx.stroke();
        drawSelectedRhoLabel(ctx, cx, cy, rad, rhoUse, w, theme);
      }
    } else {
      ctx.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle =
        selectedIndex === i ? "rgb(15,23,42)" : "rgba(15,23,42,0.25)";
      ctx.lineWidth = selectedIndex === i ? 2.5 : 1;
      ctx.stroke();
      if (selectedIndex === i) {
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, rad + 3, 0, Math.PI * 2);
        ctx.stroke();
        drawSelectedRhoLabel(ctx, cx, cy, rad, rhoUse, w, theme);
      }
    }
    hits.push({ readingIndex: i, cx, cy, r: rad + 6 });
  }

  drawColorBar(
    ctx,
    w,
    h,
    padL,
    padR,
    padT,
    plotH,
    logLo,
    logHi,
    colorScale,
    theme,
  );

  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(padL, padT, plotW, plotH);
  ctx.font = "11px system-ui,sans-serif";
  ctx.fillStyle = theme.muted;
  ctx.fillText("Estação (m) →", padL + plotW * 0.3, h - 6);
  ctx.save();
  ctx.translate(14, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = theme.muted;
  ctx.fillText("Pseudo-prof. (m) ↓", -plotH * 0.35, 0);
  ctx.restore();
  if (title) {
    ctx.fillStyle = theme.text;
    ctx.font = "600 12px system-ui,sans-serif";
    ctx.fillText(title, padL, 14);
  }

  return hits;
}

function drawColorBar(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  padL: number,
  padR: number,
  padT: number,
  plotH: number,
  logLo: number,
  logHi: number,
  scale: ResistivityColorScale,
  theme: CanvasPlotTheme,
) {
  const barW = 14;
  const barX = w - padR + 18;
  const barY = padT;
  const steps = 64;
  for (let s = 0; s < steps; s++) {
    const t = 1 - s / (steps - 1);
    const [r, g, b] = paletteColor(scale.palette, t);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    const y0 = barY + (s / steps) * plotH;
    const y1 = barY + ((s + 1) / steps) * plotH;
    ctx.fillRect(barX, y0, barW, Math.max(1, y1 - y0));
  }
  ctx.strokeStyle = theme.border;
  ctx.strokeRect(barX, barY, barW, plotH);
  ctx.font = "10px system-ui,sans-serif";
  ctx.textAlign = "left";
  const rhoHi = 10 ** logHi;
  const rhoLo = 10 ** logLo;
  const labelX = barX + barW + 5;
  const hiStr = rhoHi >= 100 ? rhoHi.toFixed(0) : rhoHi.toFixed(1);
  const loStr = rhoLo >= 100 ? rhoLo.toFixed(0) : rhoLo.toFixed(1);
  ctx.fillStyle = theme.text;
  ctx.fillText(hiStr, labelX, barY + 10);
  ctx.fillText(loStr, labelX, barY + plotH);
  ctx.fillStyle = theme.muted;
  ctx.fillText("Ω·m", labelX, barY + plotH * 0.5);
  ctx.textAlign = "start";
}

export function findNearestPseudoHit(
  hits: PseudoHit[],
  px: number,
  py: number,
): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const h of hits) {
    const d = Math.hypot(px - h.cx, py - h.cy);
    if (d <= h.r && d < bestD) {
      bestD = d;
      best = h.readingIndex;
    }
  }
  return best;
}

/** Contraste da paleta no modelo invertido. */
export type ModelLogContrast = ModelContrastMode;

/** @deprecated Use resolveModelDisplayBounds */
export function resolveModelLogBounds(
  rhoCells: number[],
  contrast: ModelLogContrast = "percentile",
) {
  const mode =
    contrast === "res2dinv"
      ? "minmax"
      : contrast === "standard"
        ? "standard"
        : contrast;
  return resolveModelDisplayBounds(rhoCells, mode);
}

function maxPseudoDepthAtX(
  readings: Dipolo2DReading[],
  xCenter: number,
  halfWidth: number,
  factorDepth: number,
): number {
  let zMax = 0;
  for (const r of readings) {
    if (Math.abs(r.stationM - xCenter) > halfWidth) continue;
    zMax = Math.max(zMax, factorDepth * r.n * r.aM);
  }
  return zMax;
}

/** Mensagem no canvas quando o modelo não pode ser desenhado. */
export function drawModelCanvasMessage(
  canvas: HTMLCanvasElement,
  title: string,
  detail?: string,
) {
  const layout = modelCanvasLayout(canvas, 1, 1, {});
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#fef2f2";
  ctx.fillRect(0, 0, w, h);
  const cx = layout ? MODEL_PAD_L + layout.plotW / 2 : w / 2;
  const cy = layout ? layout.plotTop + layout.plotH / 2 : h / 2;
  ctx.fillStyle = "#991b1b";
  ctx.font = "bold 14px system-ui,sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(title, cx, cy - (detail ? 10 : 0));
  if (detail) {
    ctx.font = "12px system-ui,sans-serif";
    ctx.fillStyle = "#7f1d1d";
    const lines = detail.match(/.{1,72}(\s|$)/g) ?? [detail];
    let y = cy + 12;
    for (const line of lines.slice(0, 4)) {
      ctx.fillText(line.trim(), cx, y);
      y += 16;
    }
  }
  ctx.textAlign = "left";
}

export function drawModelSection(
  canvas: HTMLCanvasElement,
  mLogIn: Float64Array,
  nx: number,
  nz: number,
  xEdgesIn: Float64Array,
  zEdgesIn: Float64Array,
  colorScale: ResistivityColorScale = defaultColorScale,
  opts: ModelDrawOptions = {},
) {
  const mLog = mLogIn;
  const xEdges = xEdgesIn;
  const zEdges = zEdgesIn;

  const validationErr = validateModelForRender(
    mLog,
    nx,
    nz,
    xEdges,
    zEdges,
  );
  if (validationErr) {
    drawModelCanvasMessage(canvas, "Modelo inválido", validationErr);
    return;
  }

  const topoMode =
    opts.showTopography &&
    opts.topography &&
    opts.topography.length >= 2;
  const topography = opts.topography ?? [];

  const x0 = xEdges[0]!;
  const x1 = xEdges[nx]!;
  const z0 = 0;
  const z1 = zEdges[nz]!;

  const readings = opts.readings ?? [];
  const factorDepth = opts.factorDepth ?? 0.286;
  const maskMode =
    opts.maskMode ??
    (opts.invertEngine === "physics" ? "coverage" : "full");
  const renderMode: ModelRenderMode = opts.renderMode ?? "layer_smooth";
  const isBlockCells = renderMode === "cells";
  const isLayerRender =
    renderMode === "fem_smooth" || renderMode === "layer_smooth";
  const useStrictCover =
    (opts.invertEngine === "physics" && !isLayerRender) || isBlockCells;
  /** Trapézio RES2DINV: 1,0·n·a (não FMD 0,286). */
  const modelCoverFactor =
    opts.modelDepthFactor ?? RES2DINV_MODEL_DEPTH_FACTOR;
  const coverFactor = isLayerRender ? modelCoverFactor : factorDepth;
  const zCoverProfile =
    opts.zCoverM != null && opts.zCoverM.length === nx
      ? cloneFloat64Array(opts.zCoverM)
      : readings.length > 0
        ? useStrictCover
          ? buildSensitivityZCoverProfile(readings, x0, x1, nx, factorDepth)
          : buildModelZCoverProfile(readings, x0, x1, nx, z1, coverFactor)
        : null;
  const cropToCoverage = opts.cropToCoverage === true;
  const zPlotMax = profileDisplayDepthMaxM(
    z1,
    readings,
    factorDepth,
    zCoverProfile,
    cropToCoverage,
  );

  let scaleXM = opts.scaleXM ?? 1;
  const userScaleZ = opts.scaleZM ?? 1;
  let scaleZM = userScaleZ;
  /** Proporção real distância:profundidade (ou cota em modo topografia). */
  const useNaturalAspect = opts.equalAspect !== false;
  if (useNaturalAspect) {
    if (topoMode) {
      const earlyBounds = resolveTopographyElevBounds(topography, x0, x1, z1);
      const xSpan = earlyBounds.xPlot1 - earlyBounds.xPlot0;
      const zSpan = earlyBounds.elevTop - earlyBounds.elevBottom;
      if (xSpan > 0 && zSpan > 0) {
        scaleZM =
          ((zSpan / xSpan) * scaleXM) / MODEL_BASE_PLOT_ASPECT * userScaleZ;
      }
    } else {
      const xSpan = x1 - x0;
      const zSpan = zPlotMax - z0;
      if (xSpan > 0 && zSpan > 0) {
        scaleZM =
          ((zSpan / xSpan) * scaleXM) / MODEL_BASE_PLOT_ASPECT * userScaleZ;
      }
    }
  }

  const layout = modelCanvasLayout(canvas, scaleXM, scaleZM, opts);
  if (!layout) return;
  const { ctx, plotW, plotH, plotTop } = layout;
  const padL = MODEL_PAD_L;
  const padT = MODEL_PAD_T;
  const padB = MODEL_PAD_B;

  const dx = (x1 - x0) / Math.max(1, nx);
  const dz = (z1 - z0) / Math.max(1, nz);
  const nLevels = opts.colorLevels ?? 16;

  const visibleRhos: number[] = [];
  for (let i = 0; i < nx; i++) {
    const zCover =
      zCoverProfile != null
        ? zCoverProfile[i]!
        : z1;
    for (let j = 0; j < nz; j++) {
      const zCenter = z0 + (j + 0.5) * dz;
      if (maskMode === "coverage" && zCenter > zCover + dz * 0.5) continue;
      const rho = 10 ** mLog[i * nz + j]!;
      if (rho > 0 && Number.isFinite(rho)) visibleRhos.push(rho);
    }
  }
  const allRhos: number[] = [];
  for (let k = 0; k < mLog.length; k++) {
    const rho = 10 ** mLog[k]!;
    if (rho > 0 && Number.isFinite(rho)) allRhos.push(rho);
  }
  const rhoForScale = visibleRhos.length >= 4 ? visibleRhos : allRhos;
  const finiteRhos =
    rhoForScale.length > 0
      ? rhoForScale
      : allRhos.length > 0
        ? allRhos
        : [10, 100, 1000];
  const contrastMode: ModelContrastMode =
    opts.logContrast ??
    (opts.invertEngine === "physics" ? "log_percentile" : "auto");
  let displayScale: ModelDisplayScale = opts.displayScale ?? "log";
  let scaleAutoLabel: string;
  let normalizeRho: (rho: number) => number;
  let logLo: number;
  let logHi: number;
  let legendPercentileBreaks: number[] | undefined;
  let legendBounds = resolveModelDisplayBounds(finiteRhos, "percentile");

  if (!colorScale.auto) {
    legendBounds = resolveModelDisplayBounds(
      finiteRhos,
      "manual",
      colorScale.rhoMinOhmM,
      colorScale.rhoMaxOhmM,
    );
    logLo = legendBounds.logLo;
    logHi = legendBounds.logHi;
    scaleAutoLabel = legendBounds.scaleLabel;
    normalizeRho = (rho) =>
      displayScale === "linear"
        ? rhoToNormalizedLinear(
            rho,
            legendBounds.rhoMinOhmM,
            legendBounds.rhoMaxOhmM,
          )
        : rhoToNormalized(rho, logLo, logHi);
  } else if (contrastMode === "auto") {
    const adaptive = buildAdaptiveContrastMapper(finiteRhos);
    normalizeRho = adaptive.normalizeRho;
    scaleAutoLabel = adaptive.scaleLabel;
    displayScale = opts.displayScale ?? adaptive.displayScale;
    legendBounds = resolveModelDisplayBounds(finiteRhos, "percentile");
    logLo = legendBounds.logLo;
    logHi = legendBounds.logHi;
  } else if (contrastMode === "equalize") {
    normalizeRho = makeHistogramEqualizeMapper(finiteRhos);
    scaleAutoLabel = "equalização de histograma";
    legendBounds = resolveModelDisplayBounds(finiteRhos, "percentile");
    logLo = legendBounds.logLo;
    logHi = legendBounds.logHi;
  } else if (contrastMode === "stdstretch") {
    normalizeRho = makeStdStretchMapper(finiteRhos, 2);
    displayScale = "linear";
    scaleAutoLabel = "stretch ±2σ (linear)";
    legendBounds = resolveModelDisplayBounds(finiteRhos, "percentile");
    logLo = legendBounds.logLo;
    logHi = legendBounds.logHi;
  } else if (contrastMode === "log_percentile") {
    const lp = buildLogPercentileScale(finiteRhos);
    logLo = lp.logLo;
    logHi = lp.logHi;
    legendBounds = {
      logLo: lp.logLo,
      logHi: lp.logHi,
      rhoMinOhmM: lp.rhoMinOhmM,
      rhoMaxOhmM: lp.rhoMaxOhmM,
      scaleLabel: lp.scaleLabel,
    };
    scaleAutoLabel = lp.scaleLabel;
    displayScale = "log";
    normalizeRho = lp.normalizeRho;
    legendPercentileBreaks = lp.legendTicksOhmM;
  } else if (contrastMode === "res2dinv") {
    const pct = resolveModelDisplayBounds(finiteRhos, "percentile");
    const rhoMin = Math.min(10, pct.rhoMinOhmM);
    const rhoMax = Math.max(8000, pct.rhoMaxOhmM);
    legendBounds = resolveModelDisplayBounds(finiteRhos, "manual", rhoMin, rhoMax);
    logLo = legendBounds.logLo;
    logHi = legendBounds.logHi;
    scaleAutoLabel = "RES2DINV (classes discretas)";
    displayScale = "log";
    normalizeRho = (rho) => rhoToRes2dinvNormalized(rho);
  } else {
    legendBounds = resolveModelDisplayBounds(finiteRhos, contrastMode);
    logLo = legendBounds.logLo;
    logHi = legendBounds.logHi;
    scaleAutoLabel = legendBounds.scaleLabel;
    normalizeRho = (rho) =>
      displayScale === "linear"
        ? rhoToNormalizedLinear(
            rho,
            legendBounds.rhoMinOhmM,
            legendBounds.rhoMaxOhmM,
          )
        : rhoToNormalized(rho, logLo, logHi);
  }
  const rhoMinLabel = legendBounds.rhoMinOhmM;
  const rhoMaxLabel = legendBounds.rhoMaxOhmM;

  const rasterScale = isLayerRender ? 3 : 2;
  const rasterW = Math.max(64, Math.ceil(plotW * rasterScale));
  const rasterH = Math.max(64, Math.ceil(plotH * rasterScale));

  let elevBounds: ReturnType<typeof resolveTopographyElevBounds> | null = null;
  let sx: (x: number) => number;
  let syDepth: (z: number) => number;
  let syElev: ((elev: number) => number) | null = null;

  if (topoMode) {
    elevBounds = resolveTopographyElevBounds(topography, x0, x1, z1);
    sx = (x: number) =>
      padL +
      ((x - elevBounds!.xPlot0) /
        (elevBounds!.xPlot1 - elevBounds!.xPlot0 || 1)) *
        plotW;
    const elevSpan = elevBounds.elevTop - elevBounds.elevBottom;
    syElev = (elev: number) =>
      plotTop + ((elevBounds!.elevTop - elev) / (elevSpan || 1)) * plotH;
    syDepth = () => 0;
  } else {
    sx = (x: number) => padL + ((x - x0) / (x1 - x0 || 1)) * plotW;
    syDepth = (z: number) =>
      plotTop + ((z - z0) / (zPlotMax - z0 || 1)) * plotH;
  }

  /** Secção em profundidade (células discretas — independente do eixo de elevação). */
  const sxDepth = (x: number) => padL + ((x - x0) / (x1 - x0 || 1)) * plotW;
  const syDepthZ = (z: number) =>
    plotTop + ((z - z0) / (zPlotMax - z0 || 1)) * plotH;

  const rasterOpts = {
    logLo,
    logHi,
    normalizeRho,
    colorScale,
    colorLevels: nLevels,
    displaySmoothPasses:
      renderMode === "cells"
        ? 0
        : isLayerRender
          ? (opts.displaySmoothPasses ?? RES2DINV_DISPLAY_SMOOTH_PASSES)
          : (opts.displaySmoothPasses ?? 0),
    maskMode,
    renderMode,
    activeCells: opts.activeCells ?? null,
    zCoverProfile,
  };

  const paintCellsDirect = isBlockCells && !opts.exportWidthPx;

  if (paintCellsDirect) {
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(padL, plotTop, plotW, plotH);
    if (maskMode === "coverage" && zCoverProfile) {
      ctx.save();
      pathTrapezoidCoverage(
        ctx,
        zCoverProfile,
        x0,
        x1,
        nx,
        z0,
        sxDepth,
        syDepthZ,
      );
      ctx.clip();
    }
    paintModelCellsOnCanvas(
      ctx,
      mLog,
      nx,
      nz,
      xEdges,
      zEdges,
      sxDepth,
      syDepthZ,
      rasterOpts,
    );
    if (maskMode === "coverage" && zCoverProfile) {
      ctx.restore();
      strokeTrapezoidCoverage(
        ctx,
        zCoverProfile,
        x0,
        x1,
        nx,
        z0,
        sxDepth,
        syDepthZ,
      );
    }
    if (topoMode && elevBounds && syElev) {
      strokeTopographySurface(ctx, topography, elevBounds, sx, syElev);
      if (opts.showElectrodes && readings.length > 0) {
        drawElectrodeDotsOnSurface(
          ctx,
          uniqueElectrodePositionsFromReadings(readings),
          topography,
          sx,
          syElev,
        );
      }
    }
  } else {
    const rgba = topoMode
      ? rasterizeModelWithTopography(
          mLog,
          nx,
          nz,
          xEdges,
          zEdges,
          rasterW,
          rasterH,
          topography,
          elevBounds!,
          {
            ...rasterOpts,
            zCoverProfile,
            useCoverageMask:
              maskMode === "coverage" ||
              (topoMode && zCoverProfile != null),
          },
        )
      : rasterizeModelSection(
          mLog,
          nx,
          nz,
          xEdges,
          zEdges,
          rasterW,
          rasterH,
          rasterOpts,
        );

    const off = document.createElement("canvas");
    off.width = rasterW;
    off.height = rasterH;
    const octx = off.getContext("2d");
    if (octx) {
      putRgbaOnCanvas(octx, rgba, rasterW, rasterH);
      ctx.imageSmoothingEnabled = renderMode !== "cells";
      if (isLayerRender || renderMode === "bilinear") {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
      } else if (renderMode !== "cells") {
        ctx.imageSmoothingQuality = "high";
      }

      if (topoMode && elevBounds && syElev) {
        ctx.save();
        pathTopographyTrapezoid(
          ctx,
          topography,
          maskMode === "coverage" || zCoverProfile != null
            ? zCoverProfile
            : null,
          elevBounds,
          x0,
          x1,
          nx,
          z1,
          sx,
          syElev,
        );
        ctx.clip();
        ctx.drawImage(off, padL, plotTop, plotW, plotH);
        ctx.restore();
        strokeTopographySurface(ctx, topography, elevBounds, sx, syElev);
        if (opts.showElectrodes && readings.length > 0) {
          drawElectrodeDotsOnSurface(
            ctx,
            uniqueElectrodePositionsFromReadings(readings),
            topography,
            sx,
            syElev,
          );
        }
      } else if (maskMode === "coverage" && zCoverProfile) {
        ctx.save();
        pathTrapezoidCoverage(ctx, zCoverProfile, x0, x1, nx, z0, sx, syDepth);
        ctx.clip();
        ctx.drawImage(off, padL, plotTop, plotW, plotH);
        ctx.restore();
        strokeTrapezoidCoverage(ctx, zCoverProfile, x0, x1, nx, z0, sx, syDepth);
      } else {
        ctx.drawImage(off, padL, plotTop, plotW, plotH);
      }
    }
  }

  ctx.fillStyle = "#111827";
  ctx.font = "12px Arial,sans-serif";
  if (opts.sectionTitle) {
    ctx.font = "bold 13px Arial,sans-serif";
    ctx.fillText(opts.sectionTitle, padL, 14);
    ctx.font = "12px Arial,sans-serif";
    ctx.fillText(
      topoMode
        ? "Model resistivity with topography"
        : "Inverse Model Resistivity Section",
      padL,
      30,
    );
  } else {
    ctx.fillText(
      topoMode
        ? "Model resistivity with topography"
        : "Inverse Model Resistivity Section",
      padL,
      16,
    );
  }
  if (opts.methodLabel) {
    ctx.font = "10px Arial,sans-serif";
    ctx.fillStyle = "#4b5563";
    ctx.fillText(opts.methodLabel, padL + 280, 16);
  }
  if (opts.iterations != null && (opts.rmsPercent != null || opts.rmsLog10 != null)) {
    const rmsPct =
      opts.rmsPercent != null && Number.isFinite(opts.rmsPercent)
        ? Math.round(opts.rmsPercent * 10) / 10
        : null;
    ctx.font = "11px Arial,sans-serif";
    ctx.fillStyle = "#374151";
    const rmsLine =
      rmsPct != null
        ? `Abs. error = ${rmsPct}%`
        : `RMS log₁₀ = ${(opts.rmsLog10 ?? 0).toFixed(3)}`;
    ctx.fillText(
      topoMode
        ? `Iteration ${opts.iterations}  ·  ${rmsLine}`
        : `Iteration ${opts.iterations}  ·  ${rmsLine}  ·  log₁₀ residual = ${(opts.rmsLog10 ?? 0).toFixed(3)}`,
      padL,
      28,
    );
  }

  if (topoMode && elevBounds && syElev) {
    ctx.fillStyle = "#374151";
    ctx.font = "11px Arial,sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(
      opts.resipyAxisLabels ? "Elevation [m]" : "Elev.",
      8,
      plotTop + 14,
    );

    const tickCount = 6;
    for (let t = 0; t <= tickCount; t++) {
      const u = t / tickCount;
      const elev =
        elevBounds.elevBottom +
        (elevBounds.elevTop - elevBounds.elevBottom) * (1 - u);
      const yv = syElev(elev);

      ctx.strokeStyle = "rgba(17,24,39,0.75)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL - 4, yv);
      ctx.lineTo(padL, yv);
      ctx.stroke();

      ctx.fillStyle = "#111827";
      ctx.font = "10px Arial,sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(formatElevTick(elev), padL - 8, yv + 3);
    }

    for (let t = 0; t <= tickCount; t++) {
      const u = t / tickCount;
      const xVal =
        elevBounds.xPlot0 + (elevBounds.xPlot1 - elevBounds.xPlot0) * u;
      const xv = sx(xVal);

      ctx.strokeStyle = "rgba(17,24,39,0.75)";
      ctx.beginPath();
      ctx.moveTo(xv, plotTop - 4);
      ctx.lineTo(xv, plotTop);
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.fillStyle = "#111827";
      ctx.fillText(formatDistTick(xVal), xv, plotTop - 7);
    }

    if (opts.resipyAxisLabels) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#374151";
      ctx.font = "11px Arial,sans-serif";
      ctx.fillText("Distance [m]", padL + plotW / 2, plotTop - 18);
    }

    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 1;
    pathTopographyTrapezoid(
      ctx,
      topography,
      maskMode === "coverage" || zCoverProfile != null
        ? zCoverProfile
        : null,
      elevBounds,
      x0,
      x1,
      nx,
      z1,
      sx,
      syElev,
    );
    ctx.stroke();
  } else {
    ctx.fillStyle = "#374151";
    ctx.font = "11px Arial,sans-serif";
    ctx.fillText("Depth", 8, plotTop + 12);

    if (maskMode === "coverage" && zCoverProfile) {
      strokeTrapezoidCoverage(ctx, zCoverProfile, x0, x1, nx, z0, sx, syDepth);
    } else {
      ctx.strokeStyle = "#111827";
      ctx.strokeRect(padL, plotTop, plotW, plotH);
    }

    const tickCount = 6;
    for (let t = 0; t <= tickCount; t++) {
      const u = t / tickCount;
      const xv = padL + u * plotW;
      const xVal = x0 + (x1 - x0) * u;
      const yv = plotTop + u * plotH;
      const zVal = z0 + (zPlotMax - z0) * u;

      ctx.strokeStyle = "rgba(17,24,39,0.75)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xv, plotTop + plotH);
      ctx.lineTo(xv, plotTop + plotH + 4);
      ctx.stroke();

      ctx.fillStyle = "#111827";
      ctx.font = "10px Arial,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `${xVal >= 100 ? xVal.toFixed(0) : xVal.toFixed(1)}`,
        xv,
        plotTop + plotH + 16,
      );

      ctx.textAlign = "right";
      ctx.beginPath();
      ctx.moveTo(padL - 4, yv);
      ctx.lineTo(padL, yv);
      ctx.stroke();
      ctx.fillText(
        `${zVal >= 10 ? zVal.toFixed(1) : zVal.toFixed(2)}`,
        padL - 8,
        yv + 3,
      );
    }

    ctx.textAlign = "left";
    ctx.fillStyle = "#111827";
    ctx.fillText("m.", padL + plotW + 4, plotTop + plotH + 16);
  }

  const resipyLegend = opts.legendStyle === "resipy";
  const linearLegendBreaks =
    resipyLegend &&
    displayScale === "linear" &&
    !colorScale.auto &&
    colorScale.rhoMinOhmM != null &&
    colorScale.rhoMaxOhmM != null
      ? [...RESIPY_RESULTS_LEGEND_BREAKS_OHM]
      : undefined;

  if (resipyLegend) {
    drawRightVerticalColorBar(
      ctx,
      padL + plotW + 12,
      plotTop,
      18,
      plotH,
      legendBounds.rhoMinOhmM,
      legendBounds.rhoMaxOhmM,
      colorScale,
      nLevels,
      linearLegendBreaks,
    );
  } else {
    drawBottomDiscreteColorBar(
      ctx,
      padL,
      plotTop + plotH + 30,
      plotW,
      14,
      logLo,
      logHi,
      colorScale,
      nLevels,
      contrastMode === "res2dinv" ? res2dinvLegendLabels() : undefined,
    );
  }
  ctx.fillStyle = "#6b7280";
  ctx.font = "9px Arial,sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(
    colorScale.auto
      ? `Escala ${displayScale === "log" ? "log₁₀" : "linear"}: ${formatRhoLabel(rhoMinLabel)} – ${formatRhoLabel(rhoMaxLabel)} Ω·m (${scaleAutoLabel})`
      : `Escala ${displayScale === "log" ? "log₁₀" : "linear"}: ${formatRhoLabel(rhoMinLabel)} – ${formatRhoLabel(rhoMaxLabel)} Ω·m (manual)`,
    padL + (resipyLegend ? plotW : plotW),
    plotTop + plotH + (resipyLegend ? 8 : 52),
  );
  ctx.textAlign = "left";
}
export function renderModelSectionCanvas(
  mLog: Float64Array,
  nx: number,
  nz: number,
  xEdges: Float64Array,
  zEdges: Float64Array,
  colorScale: ResistivityColorScale,
  opts: ModelDrawOptions,
  exportWidthPx = 1400,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  drawModelSection(canvas, mLog, nx, nz, xEdges, zEdges, colorScale, {
    ...opts,
    exportWidthPx,
    devicePixelRatio: 2,
  });
  return canvas;
}

function drawRightVerticalColorBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rhoMin: number,
  rhoMax: number,
  scale: ResistivityColorScale,
  levels: number,
  legendRhoBreaks?: number[],
) {
  const span = Math.max(1e-6, rhoMax - rhoMin);
  const nSeg = Math.max(64, levels * 4);
  const segH = h / nSeg;
  for (let i = 0; i < nSeg; i++) {
    const u = 1 - i / Math.max(1, nSeg - 1);
    const [r, g, b] = paletteColor(scale.palette, u);
    const y0 = y + i * segH;
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    ctx.fillRect(x, y0, w, segH + 1);
  }
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  const breaks =
    legendRhoBreaks && legendRhoBreaks.length >= 2
      ? legendRhoBreaks
      : [rhoMin, rhoMax];
  ctx.fillStyle = "#111827";
  ctx.font = "10px Arial,sans-serif";
  ctx.textAlign = "left";
  for (const rho of breaks) {
    const u = Math.max(0, Math.min(1, (rho - rhoMin) / span));
    const yv = y + (1 - u) * h;
    ctx.fillText(formatRhoLabel(rho), x + w + 6, yv + 3);
  }
  ctx.font = "9px Arial,sans-serif";
  ctx.fillText("Resistivity (ohm.m)", x + w + 6, y + h + 14);
}

function drawBottomDiscreteColorBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  logLo: number,
  logHi: number,
  scale: ResistivityColorScale,
  levels: number,
  legendRhoBreaks?: number[],
  legendLogTicks?: { logLo: number; logHi: number },
) {
  const breaks =
    legendRhoBreaks && legendRhoBreaks.length >= 2
      ? legendRhoBreaks
      : null;
  const logLegend = legendLogTicks ?? null;

  if (breaks && logLegend) {
    const nSeg = Math.max(48, levels * 3);
    const segW = w / nSeg;
    for (let i = 0; i < nSeg; i++) {
      const u = i / Math.max(1, nSeg - 1);
      const [r, g, b] = paletteColor(scale.palette, u);
      const x0 = x + i * segW;
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.fillRect(x0, y, segW + 1, h);
    }
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    for (const rho of breaks) {
      const u = rhoToNormalized(rho, logLegend.logLo, logLegend.logHi);
      const xt = x + u * w;
      ctx.fillStyle = "#111827";
      ctx.font = "10px Arial,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(formatRhoLabel(rho), xt, y + h + 12);
    }
  } else if (breaks) {
    const n = breaks.length;
    const segW = w / Math.max(1, n - 1);
    for (let i = 0; i < n - 1; i++) {
      const rhoMid = Math.sqrt(Math.max(breaks[i]!, 1) * Math.max(breaks[i + 1]!, 1));
      const t = rhoToRes2dinvNormalized(rhoMid, breaks);
      const [r, g, b] = paletteColor(scale.palette, t);
      const x0 = x + i * segW;
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.fillRect(x0, y, segW + 1, h);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(x0, y, segW + 1, h);
    }
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    for (let i = 0; i < n; i++) {
      const xt = x + (i / Math.max(1, n - 1)) * w;
      ctx.fillStyle = "#111827";
      ctx.font = "10px Arial,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(formatRhoLabel(breaks[i]!), xt, y + h + 12);
    }
  } else {
    const n = Math.max(3, levels);
    const segW = w / n;
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      const [r, g, b] = paletteColor(scale.palette, t);
      const x0 = x + i * segW;
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.fillRect(x0, y, segW + 1, h);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(x0, y, segW + 1, h);
    }
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    const labelCount = Math.min(8, n);
    for (let j = 0; j < labelCount; j++) {
      const u = j / Math.max(1, labelCount - 1);
      const lv = logLo + (logHi - logLo) * u;
      const rho = 10 ** lv;
      const xt = x + u * w;
      ctx.fillStyle = "#111827";
      ctx.font = "10px Arial,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(formatRhoLabel(rho), xt, y + h + 12);
    }
  }
  ctx.textAlign = "left";
  ctx.fillText("Resistivity in ohm.m", x, y + h + 26);
}

function formatRhoLabel(v: number): string {
  if (v >= 1000) return `${Math.round(v)}`;
  if (v >= 100) return `${v.toFixed(0)}`;
  if (v >= 10) return `${v.toFixed(1)}`;
  return `${v.toFixed(2)}`;
}

export function drawResidualSection(
  canvas: HTMLCanvasElement,
  readings: Dipolo2DReading[],
  factorDepth: number,
  residuals: number[],
  excludedIndices?: Set<number>,
) {
  const setup = setupCanvas(canvas, 0.36);
  if (!setup || readings.length === 0 || residuals.length !== readings.length)
    return;
  const { ctx, w, h, theme } = setup;
  const padL = 52;
  const padT = 20;
  const plotW = w - padL - 12;
  const plotH = h - padT - 28;
  const xs = readings.map((r) => r.stationM);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const zMax = Math.max(...readings.map((r) => factorDepth * r.n * r.aM), 1e-6);
  const activeRes = residuals.filter(
    (_, i) => !excludedIndices?.has(i) && Number.isFinite(residuals[i]),
  );
  const rMax = Math.max(...activeRes.map((r) => Math.abs(r)), 1e-6);
  const sx = (x: number) => padL + ((x - xMin) / (xMax - xMin || 1)) * plotW;
  const sy = (z: number) => padT + (z / (zMax || 1)) * plotH;

  ctx.font = "11px system-ui,sans-serif";
  ctx.fillStyle = theme.text;
  ctx.fillText("Resíduo ρ_obs − ρ_syn (Ω·m)", padL, 14);

  for (let i = 0; i < readings.length; i++) {
    if (excludedIndices?.has(i)) continue;
    const r = readings[i]!;
    const res = residuals[i]!;
    const z = factorDepth * r.n * r.aM;
    const t = Math.min(1, Math.abs(res) / rMax);
    const rr = res >= 0 ? 220 : 70;
    const gg = Math.floor(120 + 80 * (1 - t));
    const bb = res >= 0 ? 70 : 220;
    ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
    const rad = 3 + 8 * t;
    ctx.beginPath();
    ctx.arc(sx(r.stationM), sy(z), rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(padL, padT, plotW, plotH);
  ctx.fillStyle = theme.muted;
  ctx.fillText(
    `max |Δρ| = ${rMax.toFixed(1)} Ω·m`,
    padL + plotW - 120,
    14,
  );
  ctx.fillText("Estação (m) →", padL + plotW * 0.25, h - 6);
  ctx.save();
  ctx.translate(14, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = theme.muted;
  ctx.fillText("Pseudo-prof. (m) ↓", -plotH * 0.35, 0);
  ctx.restore();
}
