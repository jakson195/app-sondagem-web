export type CadEntityType = "point" | "polyline" | "line";

export interface CadVertex {
  x: number;
  y: number;
  z: number;
}

export interface CadPointEntity {
  id: string;
  type: "point";
  layerId: string;
  x: number;
  y: number;
  z: number;
  label?: string;
  sourceId?: string;
  locked?: boolean;
}

export interface CadLineEntity {
  id: string;
  type: "line";
  layerId: string;
  start: CadVertex;
  end: CadVertex;
}

export interface CadPolylineEntity {
  id: string;
  type: "polyline";
  layerId: string;
  vertices: CadVertex[];
  closed?: boolean;
  name?: string;
  /** Curva de nível mestra (índice) vs secundária. */
  contourMajor?: boolean;
}

export type CadEntity = CadPointEntity | CadLineEntity | CadPolylineEntity;

export interface CadLayer {
  id: string;
  name: string;
  /** Cor de traço (linhas e contorno de polígonos). */
  color: string;
  visible: boolean;
  locked: boolean;
  /** Espessura da linha no desenho (px SVG). */
  lineWidth?: number;
  /** Cor base do preenchimento de polígonos (alpha aplicado na renderização). */
  fillColor?: string;
  /** Cor de rótulos de texto associados à camada. */
  textColor?: string;
}

export interface CadAdjustmentMeta {
  method: string;
  rmsBefore: number;
  rmsAfter: number;
  importedAt: string;
}

export interface CadProject {
  name: string;
  crs: string;
  layers: CadLayer[];
  entities: CadEntity[];
  adjustment?: CadAdjustmentMeta;
}

export type CadRasterKind = "orthophoto" | "hypsometric";

/** Camada raster georreferenciada (ortofoto ou mapa hipsométrico). */
export interface CadRasterOverlay {
  id: string;
  name: string;
  kind: CadRasterKind;
  imageDataUrl: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  opacity: number;
  visible: boolean;
  zMin?: number;
  zMax?: number;
}

export type CadTool = "select" | "pan" | "line" | "polyline" | "editPolygon" | "deletePoint" | "editElevation";

export const CAD_IMPORT_STORAGE_KEY = "datageo:rtk-cad-import";

export interface CadImportPayload {
  projectName: string;
  crs?: string;
  surveyPoints: import("../types").SurveyPoint[];
  controlPoints: import("../types").ControlPointWithStats[];
  adjustmentResult: import("../types").AdjustmentResult | null;
}
