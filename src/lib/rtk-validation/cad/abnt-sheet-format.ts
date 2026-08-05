/**
 * Formatos de papel e margens conforme NBR 10068 (ABNT, 1987).
 * Dimensões em milímetros.
 */
export type AbntSheetFormat = "A0" | "A1" | "A2" | "A3" | "A4";

export interface AbntSheetSpec {
  /** Largura × altura em retrato (mm). */
  widthMm: number;
  heightMm: number;
  /** Margem esquerda (encadernação). */
  marginLeftMm: number;
  /** Margens superior, direita e inferior. */
  marginOtherMm: number;
  /** Largura da linha do quadro (mm). */
  frameLineWidthMm: number;
  /** Comprimento da legenda / carimbo (mm). */
  legendLengthMm: number;
}

/** Largura legenda + margem direita = 185 mm (NBR 10068). */
export const ABNT_LEGEND_MARGIN_SUM_MM = 185;

/** Faixa inferior da prancha (tabelas + legenda). */
export const ABNT_BOTTOM_STRIP_HEIGHT_MM = 68;

/** Altura padrão da legenda ABNT (mm) — alinhada à faixa inferior. */
export const ABNT_LEGEND_HEIGHT_MM = ABNT_BOTTOM_STRIP_HEIGHT_MM;

const SUPPLEMENTARY_GAP_MM = 2;
const MIN_SUPPLEMENTARY_WIDTH_MM = 80;

/** Tabela 1 — Formato do papel e margens (NBR 10068). */
export const ABNT_SHEET_SPECS: Record<AbntSheetFormat, AbntSheetSpec> = {
  A0: {
    widthMm: 841,
    heightMm: 1189,
    marginLeftMm: 25,
    marginOtherMm: 10,
    frameLineWidthMm: 1.4,
    legendLengthMm: 175,
  },
  A1: {
    widthMm: 594,
    heightMm: 841,
    marginLeftMm: 25,
    marginOtherMm: 10,
    frameLineWidthMm: 1.0,
    legendLengthMm: 175,
  },
  A2: {
    widthMm: 420,
    heightMm: 594,
    marginLeftMm: 25,
    marginOtherMm: 7,
    frameLineWidthMm: 0.7,
    legendLengthMm: 178,
  },
  A3: {
    widthMm: 297,
    heightMm: 420,
    marginLeftMm: 25,
    marginOtherMm: 7,
    frameLineWidthMm: 0.5,
    legendLengthMm: 178,
  },
  A4: {
    widthMm: 210,
    heightMm: 297,
    marginLeftMm: 25,
    marginOtherMm: 7,
    frameLineWidthMm: 0.5,
    legendLengthMm: 178,
  },
};

export const ABNT_SHEET_FORMATS = Object.keys(ABNT_SHEET_SPECS) as AbntSheetFormat[];

export function getAbntSheetSpec(format: AbntSheetFormat): AbntSheetSpec {
  return ABNT_SHEET_SPECS[format];
}

export type SheetOrientation = "retrato" | "paisagem";

export function sheetDimensionsMm(format: AbntSheetFormat, orientacao: SheetOrientation) {
  const spec = getAbntSheetSpec(format);
  if (orientacao === "paisagem") {
    return { w: spec.heightMm, h: spec.widthMm };
  }
  return { w: spec.widthMm, h: spec.heightMm };
}

export interface AbntSheetLayoutMetrics {
  spec: AbntSheetSpec;
  sheetW: number;
  sheetH: number;
  marginLeft: number;
  marginOther: number;
  frameLineWidth: number;
  legendWidth: number;
  /** Área útil dentro do quadro (mm). */
  innerLeft: number;
  innerTop: number;
  innerRight: number;
  innerBottom: number;
  innerW: number;
  innerH: number;
  /** Área de desenho (mm). */
  drawingW: number;
  drawingH: number;
  /** Faixa inferior (mm). */
  bottomStripH: number;
  supplementaryW: number;
}

export function computeAbntSheetLayout(
  format: AbntSheetFormat,
  orientacao: SheetOrientation,
): AbntSheetLayoutMetrics {
  const spec = getAbntSheetSpec(format);
  const { w: sheetW, h: sheetH } = sheetDimensionsMm(format, orientacao);

  const marginLeft = spec.marginLeftMm;
  const marginOther = spec.marginOtherMm;
  const innerLeft = marginLeft;
  const innerTop = marginOther;
  const innerRight = marginOther;
  const innerBottom = marginOther;
  const innerW = sheetW - innerLeft - innerRight;
  const innerH = sheetH - innerTop - innerBottom;

  // NBR 10068: legenda + margem direita = 185 mm
  const legendWidth = spec.legendLengthMm;
  const bottomStripH = ABNT_BOTTOM_STRIP_HEIGHT_MM;
  const drawingH = Math.max(40, innerH - bottomStripH);
  const drawingW = innerW;

  const supplementaryW = Math.max(0, innerW - legendWidth - SUPPLEMENTARY_GAP_MM);
  const hasSupplementary = supplementaryW >= MIN_SUPPLEMENTARY_WIDTH_MM;

  return {
    spec,
    sheetW,
    sheetH,
    marginLeft,
    marginOther,
    frameLineWidth: spec.frameLineWidthMm,
    legendWidth,
    innerLeft,
    innerTop,
    innerRight,
    innerBottom,
    innerW,
    innerH,
    drawingW,
    drawingH,
    bottomStripH,
    supplementaryW: hasSupplementary ? supplementaryW : 0,
  };
}

/** @deprecated Layout lateral — use drawingW/drawingH do computeAbntSheetLayout. */
export function drawingAreaWidthMm(layout: AbntSheetLayoutMetrics): number {
  return layout.drawingW;
}

export const ABNT_SIDEBAR_GAP_MM = SUPPLEMENTARY_GAP_MM;
