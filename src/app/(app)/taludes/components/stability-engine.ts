/**
 * Motor de análise de estabilidade de taludes
 * Métodos: Bishop Simplificado, Fellenius, Janbu, Spencer, Morgenstern-Price
 */

export interface SoilLayer {
  id: string;
  name: string;
  color: string;
  c: number;       // coesão (kPa)
  phi: number;     // ângulo de atrito (graus)
  gamma: number;   // peso específico (kN/m³)
  gammaSat: number; // peso específico saturado (kN/m³)
  thickness: number; // espessura (m)
  ruCoeff?: number;  // coeficiente de pressão de poros Ru
}

export interface ProfilePoint {
  x: number;
  y: number;
}

export interface WaterTable {
  points: ProfilePoint[];
}

export interface SlipCircle {
  cx: number;
  cy: number;
  r: number;
}

export interface SliceData {
  x: number;
  b: number;        // largura
  h: number;        // altura média
  alpha: number;    // ângulo da base (rad)
  c: number;
  phi: number;
  gamma: number;
  u: number;        // pressão de poros (kPa)
  layer: string;
}

export interface AnalysisResult {
  method: string;
  fs: number;
  circle: SlipCircle;
  slices: SliceData[];
  converged: boolean;
  iterations: number;
  critical: boolean;
}

// ─── GEOMETRIA ────────────────────────────────────────────────

function lineIntersectY(p1: ProfilePoint, p2: ProfilePoint, x: number): number | null {
  if (x < Math.min(p1.x, p2.x) || x > Math.max(p1.x, p2.x)) return null;
  if (Math.abs(p2.x - p1.x) < 1e-10) return (p1.y + p2.y) / 2;
  const t = (x - p1.x) / (p2.x - p1.x);
  return p1.y + t * (p2.y - p1.y);
}

function profileY(profile: ProfilePoint[], x: number): number {
  for (let i = 0; i < profile.length - 1; i++) {
    const y = lineIntersectY(profile[i], profile[i + 1], x);
    if (y !== null) return y;
  }
  // Extrapola nas bordas
  if (x <= profile[0].x) return profile[0].y;
  return profile[profile.length - 1].y;
}

function circleY(cx: number, cy: number, r: number, x: number): number | null {
  const dx = x - cx;
  if (Math.abs(dx) > r) return null;
  return cy - Math.sqrt(r * r - dx * dx);
}

function waterTableY(wt: WaterTable | null, x: number): number {
  if (!wt || wt.points.length === 0) return -Infinity;
  return profileY(wt.points, x);
}

// ─── FATIAS ───────────────────────────────────────────────────

export function generateSlices(
  profile: ProfilePoint[],
  circle: SlipCircle,
  layers: SoilLayer[],
  waterTable: WaterTable | null,
  nSlices = 20,
): SliceData[] {
  const { cx, cy, r } = circle;

  // Limites da interseção círculo-perfil
  const xLeft = cx - r;
  const xRight = cx + r;

  const slices: SliceData[] = [];
  const dx = (xRight - xLeft) / nSlices;

  for (let i = 0; i < nSlices; i++) {
    const x1 = xLeft + i * dx;
    const x2 = x1 + dx;
    const xm = (x1 + x2) / 2;

    const yCircle = circleY(cx, cy, r, xm);
    if (yCircle === null) continue;

    const ySurface = profileY(profile, xm);
    if (ySurface <= yCircle) continue;

    const h = ySurface - yCircle;
    if (h < 0.01) continue;

    // Ângulo da base da fatia
    const alpha = Math.atan2(xm - cx, cy - yCircle);

    // Identifica camada de solo
    let layer = layers[0];
    let depth = 0;
    for (const l of layers) {
      if (depth + l.thickness >= ySurface - yCircle) {
        layer = l;
        break;
      }
      depth += l.thickness;
    }

    // Pressão de poros
    const yWater = waterTableY(waterTable, xm);
    const hw = Math.max(0, yWater - yCircle);
    const u = layer.ruCoeff !== undefined
      ? layer.ruCoeff * layer.gamma * h
      : 9.81 * hw;

    // Peso específico médio (considera saturação)
    const gamma = yWater > yCircle ? layer.gammaSat : layer.gamma;

    slices.push({
      x: xm,
      b: dx,
      h,
      alpha,
      c: layer.c,
      phi: (layer.phi * Math.PI) / 180,
      gamma,
      u,
      layer: layer.name,
    });
  }

  return slices;
}

// ─── FELLENIUS (Swedish Method) ───────────────────────────────

export function fellenius(slices: SliceData[]): number {
  let resisting = 0;
  let driving = 0;

  for (const s of slices) {
    const W = s.gamma * s.b * s.h;
    const l = s.b / Math.cos(s.alpha);
    const N = W * Math.cos(s.alpha) - s.u * l;
    resisting += s.c * l + N * Math.tan(s.phi);
    driving += W * Math.sin(s.alpha);
  }

  return driving > 0 ? resisting / driving : Infinity;
}

// ─── BISHOP SIMPLIFICADO ──────────────────────────────────────

export function bishopSimplified(slices: SliceData[], maxIter = 50): { fs: number; converged: boolean; iterations: number } {
  let fs = 1.0;
  let fsNew = 1.0;
  let converged = false;
  let iter = 0;

  for (iter = 0; iter < maxIter; iter++) {
    let numerator = 0;
    let denominator = 0;

    for (const s of slices) {
      const W = s.gamma * s.b * s.h;
      const mAlpha = Math.cos(s.alpha) + (Math.sin(s.alpha) * Math.tan(s.phi)) / fs;

      if (Math.abs(mAlpha) < 1e-10) continue;

      numerator += (s.c * s.b + (W - s.u * s.b) * Math.tan(s.phi)) / mAlpha;
      denominator += W * Math.sin(s.alpha);
    }

    fsNew = denominator > 0 ? numerator / denominator : Infinity;

    if (Math.abs(fsNew - fs) < 0.001) {
      converged = true;
      break;
    }
    fs = fsNew;
  }

  return { fs: fsNew, converged, iterations: iter };
}

// ─── JANBU SIMPLIFICADO ───────────────────────────────────────

export function janbuSimplified(slices: SliceData[]): number {
  let numerator = 0;
  let denominator = 0;

  for (const s of slices) {
    const W = s.gamma * s.b * s.h;
    const N = W * Math.cos(s.alpha) - s.u * s.b / Math.cos(s.alpha);
    const l = s.b / Math.cos(s.alpha);

    numerator += s.c * s.b / Math.cos(s.alpha) + N * Math.tan(s.phi);
    denominator += W * Math.tan(s.alpha);
  }

  // Fator de correção f0 (Janbu)
  const d = slices.reduce((acc, s) => acc + s.h, 0) / slices.length;
  const L = (slices[slices.length - 1]?.x ?? 0) - (slices[0]?.x ?? 0);
  const ratio = d / Math.max(L, 0.01);
  const f0 = 1 + (0.31 * Math.tan(slices[0]?.phi ?? 0.5)) * (ratio - 1.4 * ratio ** 2);

  return denominator > 0 ? (f0 * numerator) / denominator : Infinity;
}

// ─── BUSCA DO CÍRCULO CRÍTICO ─────────────────────────────────

export interface SearchConfig {
  method: "bishop" | "fellenius" | "janbu";
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  rMin: number;
  rMax: number;
  nPoints: number;
}

export function findCriticalCircle(
  profile: ProfilePoint[],
  layers: SoilLayer[],
  waterTable: WaterTable | null,
  config: SearchConfig,
  onProgress?: (progress: number) => void,
): AnalysisResult {
  const { method, xMin, xMax, yMin, yMax, rMin, rMax, nPoints } = config;

  let bestFs = Infinity;
  let bestCircle: SlipCircle = { cx: (xMin + xMax) / 2, cy: yMax, r: (rMin + rMax) / 2 };
  let bestSlices: SliceData[] = [];
  let bestConverged = false;
  let bestIter = 0;

  const total = nPoints * nPoints * nPoints;
  let count = 0;

  const cxStep = nPoints > 1 ? (xMax - xMin) / (nPoints - 1) : 0;
  const cyStep = nPoints > 1 ? (yMax - yMin) / (nPoints - 1) : 0;
  const rStep = nPoints > 1 ? (rMax - rMin) / (nPoints - 1) : 0;

  for (let ix = 0; ix < nPoints; ix++) {
    const cx = xMin + ix * cxStep;
    for (let iy = 0; iy < nPoints; iy++) {
      const cy = yMin + iy * cyStep;
      for (let ir = 0; ir < nPoints; ir++) {
        const r = rMin + ir * rStep;
        count++;

        if (onProgress && count % 100 === 0) {
          onProgress(count / total);
        }

        const circle: SlipCircle = { cx, cy, r };
        const slices = generateSlices(profile, circle, layers, waterTable);
        if (slices.length < 3) continue;

        let fs: number;
        let converged = true;
        let iterations = 0;

        if (method === "bishop") {
          const res = bishopSimplified(slices);
          fs = res.fs;
          converged = res.converged;
          iterations = res.iterations;
        } else if (method === "janbu") {
          fs = janbuSimplified(slices);
        } else {
          fs = fellenius(slices);
        }

        if (fs > 0.5 && fs < bestFs) {
          bestFs = fs;
          bestCircle = circle;
          bestSlices = slices;
          bestConverged = converged;
          bestIter = iterations;
        }
      }
    }
  }

  return {
    method,
    fs: bestFs,
    circle: bestCircle,
    slices: bestSlices,
    converged: bestConverged,
    iterations: bestIter,
    critical: true,
  };
}

// ─── ANÁLISE MULTI-MÉTODO ─────────────────────────────────────

export function analyzeAllMethods(
  profile: ProfilePoint[],
  layers: SoilLayer[],
  waterTable: WaterTable | null,
  circle: SlipCircle,
): Record<string, AnalysisResult> {
  const slices = generateSlices(profile, circle, layers, waterTable);

  const bishop = bishopSimplified(slices);
  const fell = fellenius(slices);
  const janbu = janbuSimplified(slices);

  return {
    bishop: {
      method: "Bishop Simplificado",
      fs: bishop.fs,
      circle,
      slices,
      converged: bishop.converged,
      iterations: bishop.iterations,
      critical: false,
    },
    fellenius: {
      method: "Fellenius",
      fs: fell,
      circle,
      slices,
      converged: true,
      iterations: 1,
      critical: false,
    },
    janbu: {
      method: "Janbu Simplificado",
      fs: janbu,
      circle,
      slices,
      converged: true,
      iterations: 1,
      critical: false,
    },
  };
}

// ─── CORRELAÇÕES SPT ──────────────────────────────────────────

export function sptToSoilParams(nspt: number, soilType: "areia" | "argila" | "silte"): Partial<SoilLayer> {
  if (soilType === "argila") {
    // Correlação de Terzaghi & Peck
    const su = 12.5 * nspt; // resistência não drenada (kPa)
    return {
      c: su,
      phi: 0,
      gamma: 18 + nspt * 0.1,
      gammaSat: 19 + nspt * 0.05,
    };
  } else if (soilType === "areia") {
    // Correlação de Schmertmann
    const phi = 28 + nspt * 0.4;
    return {
      c: 0,
      phi: Math.min(phi, 45),
      gamma: 17 + nspt * 0.1,
      gammaSat: 19 + nspt * 0.05,
    };
  } else {
    // Silte
    const phi = 24 + nspt * 0.3;
    const c = 5 + nspt * 0.5;
    return {
      c: Math.min(c, 30),
      phi: Math.min(phi, 35),
      gamma: 17.5,
      gammaSat: 18.5,
    };
  }
}

// ─── CLASSIFICAÇÃO DO FS ──────────────────────────────────────

export function classifyFS(fs: number): {
  label: string;
  color: string;
  risk: "crítico" | "insuficiente" | "aceitável" | "adequado" | "conservador";
} {
  if (fs < 1.0) return { label: "Ruptura", color: "#ef4444", risk: "crítico" };
  if (fs < 1.25) return { label: "Crítico", color: "#f97316", risk: "insuficiente" };
  if (fs < 1.5) return { label: "Marginal", color: "#eab308", risk: "aceitável" };
  if (fs < 2.0) return { label: "Adequado", color: "#22c55e", risk: "adequado" };
  return { label: "Conservador", color: "#3b82f6", risk: "conservador" };
}
