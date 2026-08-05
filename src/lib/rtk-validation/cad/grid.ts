import type { CadViewport } from "./viewport";

export function autoGridStep(span: number, targetLines = 8): number {
  if (span <= 0) return 1;
  const raw = span / targetLines;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  if (norm <= 1) return mag;
  if (norm <= 2) return 2 * mag;
  if (norm <= 5) return 5 * mag;
  return 10 * mag;
}

export function buildCoordinateGrid(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  step?: number,
): { stepE: number; stepN: number; eLines: number[]; nLines: number[] } {
  const stepE = step ?? autoGridStep(maxX - minX);
  const stepN = step ?? autoGridStep(maxY - minY);

  const eLines: number[] = [];
  const nLines: number[] = [];

  const eStart = Math.ceil(minX / stepE) * stepE;
  for (let e = eStart; e <= maxX; e += stepE) eLines.push(e);

  const nStart = Math.ceil(minY / stepN) * stepN;
  for (let n = nStart; n <= maxY; n += stepN) nLines.push(n);

  return { stepE, stepN, eLines, nLines };
}

export function formatGridLabel(value: number, step: number): string {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function gridDataForViewport(viewport: CadViewport, step?: number) {
  return buildCoordinateGrid(viewport.minX, viewport.maxX, viewport.minY, viewport.maxY, step);
}
