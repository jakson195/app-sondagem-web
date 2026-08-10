import type { ProfilePoint } from "@/app/(app)/taludes/components/stability-engine";

export type AcadSlopeCandidate = {
  id: string;
  layerName: string;
  blockName: string;
  entityType: string;
  pointCount: number;
  length: number;
  profile: ProfilePoint[];
};

export type AcadSlopeImportResult = {
  fileName: string;
  format: "dwg" | "dxf";
  candidates: AcadSlopeCandidate[];
  recommendedId: string | null;
  warnings: string[];
};
