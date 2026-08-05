export type SurveyPoint = {
  id: string;
  code?: string;
  name: string;
  description?: string;
  e: number;
  n: number;
  z: number;
  eCorr?: number;
  nCorr?: number;
  zCorr?: number;
  properties?: Record<string, unknown>;
};

export type ControlPointWithStats = {
  name: string;
  eKnown: number;
  nKnown: number;
  zKnown: number;
  eObserved: number;
  nObserved: number;
  zObserved: number;
};

export type AdjustmentResult = {
  params: { method: string };
  rmsBefore: number;
  rmsAfter: number;
  surveyPoints: SurveyPoint[];
  controlPoints: ControlPointWithStats[];
};

export type ParseResult = {
  points: SurveyPoint[];
  format: string;
  warnings: string[];
  crs?: string;
};
