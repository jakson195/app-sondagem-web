export type CadEntityType = "point" | "polyline" | "line";

export interface CadVertex {
  x: number;
  y: number;
  z: number;
}

/** Metadados de drenagem urbana (PV / tubulação / sub-bacia), estilo C3D + SWMM lite. */
export type CadDrainageKind = "pv" | "outfall" | "inlet" | "pipe" | "contrib";
export type CadDrainageOrigin = "auto" | "manual";
export type CadDrainageStatus = "ok" | "insuficiente" | "velocidade_baixa" | "velocidade_alta";
export type CadDrainagePipeRole = "collector" | "ramal";

export interface CadDrainageProps {
  kind: CadDrainageKind;
  code?: string;
  origin?: CadDrainageOrigin;
  /** Coletor (rede principal) ou ramal da boca de lobo. */
  pipeRole?: CadDrainagePipeRole;
  /** Nó de T no coletor (junção de ramal no tronco). */
  tap?: boolean;
  stationM?: number;
  groundZ?: number;
  invertZ?: number;
  coverDepthM?: number;
  fromPvId?: string;
  toPvId?: string;
  lengthM?: number;
  slopePct?: number;
  diameterMm?: number;
  invertInZ?: number;
  invertOutZ?: number;
  material?: string;
  nManning?: number;
  contribAreaHa?: number;
  qContribLps?: number;
  qCapacityLps?: number;
  /** Velocidade a seção plena (m/s). */
  velocityMs?: number;
  /** Lâmina relativa aproximada (y/D ≈ Q/Qplena).
   *  Pode ser > 1 em casos extrapolando (cheio extrapolando).
   */
  flowDepthRatio?: number;
  /** Tempo de concentração de Kirpich usado na IDF (min). */
  tcMin?: number;
  /** C racional do trecho (C3DRENGS / bacia). */
  runoffC?: number;
  /** Intensidade de chuva do trecho (mm/h). */
  intensityMmH?: number;
  /** Tempo de retorno (anos) usado no trecho. */
  returnPeriodYears?: number;
  /** Tubo existente (PVEXIST). */
  existingPipe?: boolean;
  status?: CadDrainageStatus;
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
  /** Override de cor do rótulo (senão usa a camada). */
  textColor?: string;
  /** Override de tamanho do rótulo em px SVG (senão usa a camada). */
  textSize?: number;
  /** Rotação do rótulo em graus no SVG (Y para baixo), paralela à aresta/tubo. */
  rotationDeg?: number;
  drainage?: CadDrainageProps;
}

export interface CadLineEntity {
  id: string;
  type: "line";
  layerId: string;
  start: CadVertex;
  end: CadVertex;
}

export type CadLoteTipo = "INTERNO" | "ESQUINA";

/** Classificação cadastral do lote (passada após a geração; não altera o polígono). */
export interface CadLoteProps {
  tipo: CadLoteTipo;
  areaM2: number;
  areaMinimaM2: number;
  atende: boolean;
  /** Soma das testadas nas vias (m). */
  testadaM: number;
  profundidadeM: number;
  ruas: string[];
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
  /** Confrontante de cada lado: índice i = aresta do vértice i ao seguinte (fecha no 0). */
  confrontations?: string[];
  drainage?: CadDrainageProps;
  lote?: CadLoteProps;
}

export type CadEntity = CadPointEntity | CadLineEntity | CadPolylineEntity;

export type CadHatchPattern = "diagonal" | "cross" | "grass";
export type CadLineType = "solid" | "dashed";

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
  /** Opacidade do preenchimento (0–1). Padrão baixo para não tapar o desenho. */
  fillAlpha?: number;
  /** Cor de rótulos de texto associados à camada. */
  textColor?: string;
  /** Tamanho de rótulos de texto associados à camada (px SVG). */
  textSize?: number;
  /** Hachura de polígonos (linhas a 45°), além do preenchimento. */
  hatchPattern?: CadHatchPattern;
  /** Tipo de linha no desenho (tracejada = eixo de via, resíduos, etc.). */
  lineType?: CadLineType;
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

export type CadRasterKind = "orthophoto" | "hypsometric" | "cutfill";

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

export type CadTool =
  | "select"
  | "pan"
  | "line"
  | "polyline"
  | "editPolygon"
  | "confrontacao"
  | "deletePoint"
  | "editElevation";

export const CAD_IMPORT_STORAGE_KEY = "datageo:rtk-cad-import";

export interface CadImportPayload {
  projectName: string;
  crs?: string;
  surveyPoints: import("../types").SurveyPoint[];
  controlPoints: import("../types").ControlPointWithStats[];
  adjustmentResult: import("../types").AdjustmentResult | null;
}
