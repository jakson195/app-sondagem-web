/**
 * Renderização do modelo invertido estilo RES2DINV:
 * células discretas (sem bilinear), máscara de sensibilidade, quantização em níveis.
 */

import { paletteColor, rhoToNormalized } from "./colormap";
import type { ResistivityColorScale } from "./colormap";
import { quantizeDisplayT } from "./res2dinv-colormap";
import { cloneFloat64Array } from "./model-visual-scale";
import type { Dipolo2DReading } from "./types";

type Float64Grid = Float64Array<ArrayBufferLike>;

/** Perfil de cobertura estrito (sem ganho nem suavização) — inversão física. */
export function buildSensitivityZCoverProfile(
  readings: Dipolo2DReading[],
  x0: number,
  x1: number,
  nx: number,
  factorDepth: number,
): Float64Array {
  const dx = (x1 - x0) / Math.max(1, nx);
  const out = new Float64Array(nx);
  for (let i = 0; i < nx; i++) {
    const xc = x0 + (i + 0.5) * dx;
    let zMaxCol = 0;
    for (const r of readings) {
      const zd = factorDepth * r.n * r.aM;
      const half = r.n * r.aM * 0.5;
      if (Math.abs(r.stationM - xc) <= half + dx * 0.5) {
        zMaxCol = Math.max(zMaxCol, zd);
      }
    }
    out[i] = zMaxCol;
  }
  return out;
}

function maxPseudoDepthAtX(
  readings: Dipolo2DReading[],
  xCenter: number,
  halfWidth: number,
  factorDepth: number,
  zLimit: number,
): number {
  let zMax = 0;
  for (const r of readings) {
    if (Math.abs(r.stationM - xCenter) > halfWidth) continue;
    zMax = Math.max(zMax, factorDepth * r.n * r.aM);
  }
  return Math.min(zLimit, zMax);
}

/**
 * Profundidade de cobertura por coluna, com janela ampla e interpolação nos vazios
 * (evita faixas brancas verticais entre estações dipolo-dipolo).
 */
export function buildModelZCoverProfile(
  readings: Dipolo2DReading[],
  x0: number,
  x1: number,
  nx: number,
  zMax: number,
  factorDepth: number,
): Float64Array {
  const dx = (x1 - x0) / Math.max(1, nx);
  const stations = [...readings.map((r) => r.stationM)].sort((a, b) => a - b);
  let meanSpacing = dx * 2;
  if (stations.length > 1) {
    let span = 0;
    for (let k = 1; k < stations.length; k++) span += stations[k]! - stations[k - 1]!;
    meanSpacing = span / (stations.length - 1);
  }
  const halfWidth = Math.max(dx * 2.5, meanSpacing * 1.1);

  const raw = new Float64Array(nx);
  for (let i = 0; i < nx; i++) {
    const xc = x0 + (i + 0.5) * dx;
    raw[i] = maxPseudoDepthAtX(readings, xc, halfWidth, factorDepth, zMax);
  }

  for (let i = 0; i < nx; i++) {
    if (raw[i]! > 0) continue;
    let lo = -1;
    let hi = -1;
    for (let k = i - 1; k >= 0; k--) {
      if (raw[k]! > 0) {
        lo = k;
        break;
      }
    }
    for (let k = i + 1; k < nx; k++) {
      if (raw[k]! > 0) {
        hi = k;
        break;
      }
    }
    if (lo >= 0 && hi >= 0) {
      raw[i] = raw[lo]! + ((raw[hi]! - raw[lo]!) * (i - lo)) / (hi - lo);
    } else if (lo >= 0) {
      raw[i] = raw[lo]!;
    } else if (hi >= 0) {
      raw[i] = raw[hi]!;
    } else {
      raw[i] = zMax;
    }
  }

  const smooth = cloneFloat64Array(raw);
  for (let i = 1; i < nx - 1; i++) {
    smooth[i] = (raw[i - 1]! + raw[i]! * 2 + raw[i + 1]!) / 4;
  }
  return smooth;
}

/**
 * Profundidade máxima no eixo Depth.
 * Por defeito = fundo da malha (estilo RES2DINV, ex. ~109 m com ESP 8 m).
 * Com cropToCoverage=true limita à pseudoprofundidade FMD (0,286·n·a).
 */
export function profileDisplayDepthMaxM(
  modelZMax: number,
  readings: Dipolo2DReading[],
  factorDepth: number,
  zCoverProfile: Float64Array | null,
  cropToCoverage: boolean,
): number {
  if (!cropToCoverage || !(modelZMax > 0)) return modelZMax;

  let zCov = 0;
  for (const r of readings) {
    if (r.aM > 0 && r.n >= 1) {
      zCov = Math.max(zCov, factorDepth * r.n * r.aM);
    }
  }
  if (zCoverProfile) {
    for (let i = 0; i < zCoverProfile.length; i++) {
      const v = zCoverProfile[i]!;
      if (v > 0 && Number.isFinite(v)) zCov = Math.max(zCov, v);
    }
  }
  if (zCov <= 0) return modelZMax;
  const padded = Math.max(zCov * 1.02, zCov + 0.5);
  return Math.min(modelZMax, padded);
}

export function zCoverInterpolated(
  profile: Float64Array,
  xM: number,
  x0: number,
  dx: number,
  nx: number,
): number {
  const fi = (xM - x0) / dx - 0.5;
  const i0 = Math.max(0, Math.min(nx - 1, Math.floor(fi)));
  const i1 = Math.min(nx - 1, i0 + 1);
  const t = Math.max(0, Math.min(1, fi - i0));
  return profile[i0]! * (1 - t) + profile[i1]! * t;
}

function idx(i: number, j: number, nz: number) {
  return i * nz + j;
}

/** Suavização só na direção x (preserva contactos horizontais entre camadas). */
export function smoothLogModelHorizontalForDisplay(
  mLog: Float64Array,
  nx: number,
  nz: number,
  passes = 2,
  alpha = 0.22,
): Float64Array {
  let cur: Float64Grid = cloneFloat64Array(mLog);
  let next: Float64Grid = new Float64Array(cur.length);
  const a = Math.max(0, Math.min(0.4, alpha));

  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const u = idx(i, j, nz);
        let sum = 0;
        let n = 0;
        if (i > 0) {
          sum += cur[idx(i - 1, j, nz)]!;
          n++;
        }
        if (i + 1 < nx) {
          sum += cur[idx(i + 1, j, nz)]!;
          n++;
        }
        const avg = n > 0 ? sum / n : cur[u]!;
        next[u] = cur[u]! * (1 - a) + avg * a;
      }
    }
    const swap = cur;
    cur = next;
    next = swap;
  }
  return cur;
}

/** Suavização Laplaciana leve só para exibição (não altera dados exportados). */
export function smoothLogModelForDisplay(
  mLog: Float64Array,
  nx: number,
  nz: number,
  passes = 2,
  alpha = 0.24,
): Float64Array {
  let cur: Float64Grid = cloneFloat64Array(mLog);
  let next: Float64Grid = new Float64Array(cur.length);
  const a = Math.max(0, Math.min(0.45, alpha));

  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const u = idx(i, j, nz);
        let sum = 0;
        let n = 0;
        if (i > 0) {
          sum += cur[idx(i - 1, j, nz)]!;
          n++;
        }
        if (i + 1 < nx) {
          sum += cur[idx(i + 1, j, nz)]!;
          n++;
        }
        if (j > 0) {
          sum += cur[idx(i, j - 1, nz)]!;
          n++;
        }
        if (j + 1 < nz) {
          sum += cur[idx(i, j + 1, nz)]!;
          n++;
        }
        const avg = n > 0 ? sum / n : cur[u]!;
        next[u] = cur[u]! * (1 - a) + avg * a;
      }
    }
    const swap = cur;
    cur = next;
    next = swap;
  }
  return cur;
}

/** log₁₀(ρ) da célula discreta (vizinho mais próximo — estilo pcolormesh). */
export function cellLogRhoAt(
  mLog: Float64Array,
  nx: number,
  nz: number,
  fi: number,
  fj: number,
): number {
  const i = Math.max(0, Math.min(nx - 1, Math.floor(fi)));
  const j = Math.max(0, Math.min(nz - 1, Math.floor(fj)));
  return mLog[idx(i, j, nz)]!;
}

/** log₁₀(ρ) em coordenadas contínuas de célula (interpolação — só preview proxy). */
export function bilinearLogRho(
  mLog: Float64Array,
  nx: number,
  nz: number,
  fi: number,
  fj: number,
): number {
  const i0 = Math.max(0, Math.min(nx - 1, Math.floor(fi)));
  const j0 = Math.max(0, Math.min(nz - 1, Math.floor(fj)));
  const i1 = Math.min(nx - 1, i0 + 1);
  const j1 = Math.min(nz - 1, j0 + 1);
  const tx = fi - i0;
  const ty = fj - j0;

  const v00 = mLog[idx(i0, j0, nz)]!;
  const v10 = mLog[idx(i1, j0, nz)]!;
  const v01 = mLog[idx(i0, j1, nz)]!;
  const v11 = mLog[idx(i1, j1, nz)]!;

  const v0 = v00 * (1 - tx) + v10 * tx;
  const v1 = v01 * (1 - tx) + v11 * tx;
  return v0 * (1 - ty) + v1 * ty;
}

/**
 * Interpolação horizontal + transição suave entre camadas em z.
 * Cada linha z interpola em x; depois blend vertical entre linhas adjacentes.
 */
export function horizontalLayerLogRho(
  mLog: Float64Array,
  nx: number,
  nz: number,
  fi: number,
  fj: number,
): number {
  const j0 = Math.max(0, Math.min(nz - 1, Math.floor(fj)));
  const j1 = Math.min(nz - 1, j0 + 1);
  const ty = Math.max(0, Math.min(1, fj - j0));

  const sampleRow = (j: number): number => {
    const i0 = Math.max(0, Math.min(nx - 1, Math.floor(fi)));
    const i1 = Math.min(nx - 1, i0 + 1);
    const tx = Math.max(0, Math.min(1, fi - i0));
    const v0 = mLog[idx(i0, j, nz)]!;
    const v1 = mLog[idx(i1, j, nz)]!;
    return v0 * (1 - tx) + v1 * tx;
  };

  if (j0 === j1) return sampleRow(j0);
  const r0 = sampleRow(j0);
  const r1 = sampleRow(j1);
  return r0 * (1 - ty) + r1 * ty;
}

/** Suavização leve só em z (preserva contactos horizontais, remove degraus). */
export function featherHorizontalLayersVertically(
  mLog: Float64Array,
  nx: number,
  nz: number,
  passes = 1,
  alpha = 0.14,
): Float64Array {
  let cur: Float64Grid = cloneFloat64Array(mLog);
  let next: Float64Grid = new Float64Array(cur.length);
  const a = Math.max(0, Math.min(0.35, alpha));

  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const u = idx(i, j, nz);
        let sum = cur[u]!;
        let n = 1;
        if (j > 0) {
          sum += cur[idx(i, j - 1, nz)]!;
          n++;
        }
        if (j + 1 < nz) {
          sum += cur[idx(i, j + 1, nz)]!;
          n++;
        }
        const avg = sum / n;
        next[u] = cur[u]! * (1 - a) + avg * a;
      }
    }
    const swap = cur;
    cur = next;
    next = swap;
  }
  return cur;
}

export type ModelRasterMask = {
  isVisible: (xM: number, zM: number) => boolean;
};

export type ModelRenderMode = "cells" | "bilinear" | "fem_smooth" | "layer_smooth";

export type ModelRasterOptions = {
  logLo: number;
  logHi: number;
  /** Se definido, substitui rhoToNormalized(logLo, logHi). */
  normalizeRho?: (rhoOhmM: number) => number;
  colorScale: ResistivityColorScale;
  colorLevels?: number;
  displaySmoothPasses?: number;
  mask?: ModelRasterMask;
  maskRgb?: [number, number, number];
  maskMode?: "full" | "coverage";
  /** Células reais (RES2DINV) vs bilinear (preview). */
  renderMode?: ModelRenderMode;
  /** row-major i*nz+j; false = fora do modelo (topo / inactivo). */
  activeCells?: boolean[] | null;
  zCoverProfile?: Float64Array | null;
};

function preprocessHorizontalLayers(
  mLog: Float64Array,
  nx: number,
  nz: number,
  passes: number,
): Float64Array {
  const px = Math.max(2, passes);
  let s = smoothLogModelHorizontalForDisplay(mLog, nx, nz, px, 0.26);
  s = featherHorizontalLayersVertically(
    s,
    nx,
    nz,
    Math.max(2, Math.ceil(px / 2)),
    0.16,
  );
  return s;
}

function sampleLogRho(
  mLog: Float64Array,
  nx: number,
  nz: number,
  fi: number,
  fj: number,
  mode: ModelRenderMode,
): number {
  if (mode === "cells") return cellLogRhoAt(mLog, nx, nz, fi, fj);
  if (mode === "fem_smooth") {
    return horizontalLayerLogRho(mLog, nx, nz, fi, fj);
  }
  if (mode === "layer_smooth" || mode === "bilinear") {
    return bilinearLogRho(mLog, nx, nz, fi, fj);
  }
  return bilinearLogRho(mLog, nx, nz, fi, fj);
}

function cellVisible(
  i: number,
  j: number,
  nx: number,
  nz: number,
  zCenter: number,
  opts: ModelRasterOptions,
  zCoverProfile: Float64Array | null,
  dz: number,
): boolean {
  const k = idx(i, j, nz);
  if (opts.activeCells && opts.activeCells.length === nx * nz && !opts.activeCells[k]) {
    return false;
  }
  if (opts.maskMode === "coverage" && zCoverProfile) {
    const zCov = zCoverProfile[i] ?? 0;
    if (zCenter > zCov + dz * 0.02) return false;
  }
  return true;
}

/**
 * Desenha células rectangulares no canvas (malha FDM/FEM — sem interpolação).
 */
export function paintModelCellsOnCanvas(
  ctx: CanvasRenderingContext2D,
  mLog: Float64Array,
  nx: number,
  nz: number,
  xEdges: Float64Array,
  zEdges: Float64Array,
  sx: (xM: number) => number,
  sy: (zM: number) => number,
  opts: ModelRasterOptions,
): void {
  const levels = Math.max(8, opts.colorLevels ?? 24);
  const { logLo, logHi } = opts;
  const zCoverProfile = opts.zCoverProfile ?? null;
  const z0 = zEdges[0]!;
  const dz =
    (zEdges[nz]! - z0) / Math.max(1, nz);

  ctx.imageSmoothingEnabled = false;

  for (let i = 0; i < nx; i++) {
    const xL = sx(xEdges[i]!);
    const xR = sx(xEdges[i + 1]!);
    const w = Math.max(1, xR - xL);
    for (let j = 0; j < nz; j++) {
      const zCenter = z0 + (j + 0.5) * dz;
      if (!cellVisible(i, j, nx, nz, zCenter, opts, zCoverProfile, dz)) {
        continue;
      }
      const yT = sy(zEdges[j]!);
      const yB = sy(zEdges[j + 1]!);
      const h = Math.max(1, yB - yT);
      const logR = mLog[idx(i, j, nz)]!;
      const rho = 10 ** logR;
      const tRaw = opts.normalizeRho
        ? opts.normalizeRho(rho)
        : rhoToNormalized(rho, logLo, logHi);
      const t = quantizeDisplayT(tRaw, levels);
      const [r, g, b] = paletteColor(opts.colorScale.palette, t);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(xL, yT, w, h);
    }
  }

  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= nx; i++) {
    const x = sx(xEdges[i]!);
    ctx.beginPath();
    ctx.moveTo(x, sy(z0));
    ctx.lineTo(x, sy(zEdges[nz]!));
    ctx.stroke();
  }
  for (let j = 0; j <= nz; j++) {
    const y = sy(zEdges[j]!);
    ctx.beginPath();
    ctx.moveTo(sx(xEdges[0]!), y);
    ctx.lineTo(sx(xEdges[nx]!), y);
    ctx.stroke();
  }
}

/**
 * Gera RGBA (modo células ou bilinear).
 */
export function rasterizeModelSection(
  mLog: Float64Array,
  nx: number,
  nz: number,
  xEdges: Float64Array,
  zEdges: Float64Array,
  widthPx: number,
  heightPx: number,
  opts: ModelRasterOptions,
): Uint8ClampedArray {
  const w = Math.max(2, Math.floor(widthPx));
  const h = Math.max(2, Math.floor(heightPx));
  const rgba = new Uint8ClampedArray(w * h * 4);

  const x0 = xEdges[0]!;
  const x1 = xEdges[nx]!;
  const z0 = zEdges[0]!;
  const z1 = zEdges[nz]!;
  const dx = (x1 - x0) / Math.max(1, nx);
  const dz = (z1 - z0) / Math.max(1, nz);

  const smoothPasses = opts.displaySmoothPasses ?? 0;
  const renderMode = opts.renderMode ?? "layer_smooth";
  const isLayerRender =
    renderMode === "fem_smooth" || renderMode === "layer_smooth";
  let smoothed = mLog;
  if (isLayerRender) {
    const px = Math.max(2, smoothPasses || 3);
    smoothed = preprocessHorizontalLayers(mLog, nx, nz, px);
  } else if (smoothPasses > 0) {
    smoothed = smoothLogModelForDisplay(mLog, nx, nz, smoothPasses);
  }

  const levels = Math.max(8, opts.colorLevels ?? 24);
  const maskRgb = opts.maskRgb ?? [248, 250, 252];
  const { logLo, logHi } = opts;
  const zCoverProfile = opts.zCoverProfile ?? null;

  for (let py = 0; py < h; py++) {
    const zM = z0 + ((py + 0.5) / h) * (z1 - z0);
    const fj = zM / dz - 0.5;

    for (let px = 0; px < w; px++) {
      const xM = x0 + ((px + 0.5) / w) * (x1 - x0);
      const fi = (xM - x0) / dx - 0.5;
      const o = (py * w + px) * 4;

      if (
        opts.maskMode !== "full" &&
        opts.mask &&
        !opts.mask.isVisible(xM, zM)
      ) {
        rgba[o] = maskRgb[0]!;
        rgba[o + 1] = maskRgb[1]!;
        rgba[o + 2] = maskRgb[2]!;
        rgba[o + 3] = 255;
        continue;
      }

      const iCell = Math.max(0, Math.min(nx - 1, Math.floor(fi)));
      const jCell = Math.max(0, Math.min(nz - 1, Math.floor(fj)));
      const zCenter = z0 + (jCell + 0.5) * dz;
      const zCov =
        zCoverProfile != null ? (zCoverProfile[iCell] ?? z1) : z1;
      const coverSlack = renderMode === "layer_smooth" ? dz * 0.85 : dz * 0.02;
      if (opts.maskMode === "coverage" && zCoverProfile && zCenter > zCov + coverSlack) {
        rgba[o] = maskRgb[0]!;
        rgba[o + 1] = maskRgb[1]!;
        rgba[o + 2] = maskRgb[2]!;
        rgba[o + 3] = 255;
        continue;
      }

      if (
        !cellVisible(
          iCell,
          jCell,
          nx,
          nz,
          zCenter,
          { ...opts, zCoverProfile },
          zCoverProfile,
          dz,
        ) &&
        renderMode !== "layer_smooth" &&
        renderMode !== "fem_smooth"
      ) {
        rgba[o] = maskRgb[0]!;
        rgba[o + 1] = maskRgb[1]!;
        rgba[o + 2] = maskRgb[2]!;
        rgba[o + 3] = 255;
        continue;
      }

      const logR = sampleLogRho(smoothed, nx, nz, fi, fj, renderMode);
      const rho = 10 ** logR;
      const tRaw = opts.normalizeRho
        ? opts.normalizeRho(rho)
        : rhoToNormalized(rho, logLo, logHi);
      const t =
        isLayerRender && levels >= 16
          ? Math.max(0, Math.min(1, tRaw))
          : quantizeDisplayT(tRaw, levels);
      const [r, g, b] = paletteColor(opts.colorScale.palette, t);
      rgba[o] = r | 0;
      rgba[o + 1] = g | 0;
      rgba[o + 2] = b | 0;
      rgba[o + 3] = 255;
    }
  }

  return rgba;
}

/**
 * Escreve RGBA no canvas sem TypedArray.set nem ImageData(data, w, h).
 * Evita "buffer source array is read-only" com buffers partilhados/imutáveis.
 */
export function putRgbaOnCanvas(
  ctx: CanvasRenderingContext2D,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  destX = 0,
  destY = 0,
): void {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const nbytes = w * h * 4;
  const n = Math.min(nbytes, rgba.length);

  const off =
    ctx.canvas.width === w && ctx.canvas.height === h
      ? ctx.canvas
      : document.createElement("canvas");
  const octx =
    off === ctx.canvas
      ? ctx
      : (() => {
          (off as HTMLCanvasElement).width = w;
          (off as HTMLCanvasElement).height = h;
          return (off as HTMLCanvasElement).getContext("2d");
        })();
  if (!octx) return;

  const img = octx.createImageData(w, h);
  const dest = img.data;
  for (let i = 0; i < n && i < dest.length; i++) dest[i] = rgba[i]!;
  octx.putImageData(img, 0, 0);

  if (octx !== ctx) {
    ctx.drawImage(off as HTMLCanvasElement, destX, destY);
  }
}
