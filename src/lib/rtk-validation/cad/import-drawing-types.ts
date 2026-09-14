import type { CadVertex } from "./types";

export type ImportedCadLayer = {
  name: string;
  color: string;
};

export type ImportedCadGeom =
  | { kind: "point"; layer: string; x: number; y: number; z: number; label?: string }
  | { kind: "line"; layer: string; start: CadVertex; end: CadVertex }
  | { kind: "polyline"; layer: string; vertices: CadVertex[]; closed?: boolean; name?: string };

export type ImportedCadDrawing = {
  geoms: ImportedCadGeom[];
  layers: ImportedCadLayer[];
  warnings: string[];
  source: "dxf" | "dwg" | "kml" | "kmz";
};

export const DWG_CONVERT_HINT_PT =
  "Não foi possível ler o DWG binário. Importe DXF ou KMZ agora; para DWG, exporte como DXF no AutoCAD, BricsCAD ou LibreCAD.";

const ACI_BASIC: Record<number, string> = {
  1: "#ff0000",
  2: "#ffff00",
  3: "#00ff00",
  4: "#00ffff",
  5: "#0000ff",
  6: "#ff00ff",
  7: "#111827",
  8: "#808080",
  9: "#c0c0c0",
  10: "#ff0000",
  30: "#ff7f00",
  50: "#ffff00",
  90: "#00ff00",
  130: "#00ffff",
  150: "#007fff",
  170: "#0000ff",
  210: "#ff00ff",
  250: "#333333",
  251: "#666666",
  252: "#999999",
  253: "#cccccc",
  254: "#e5e5e5",
  255: "#ffffff",
};

const FALLBACK_PALETTE = [
  "#f59e0b",
  "#38bdf8",
  "#22c55e",
  "#a78bfa",
  "#f43f5e",
  "#14b8a6",
  "#eab308",
  "#64748b",
];

export function dxfAciToHex(index: number): string {
  if (index === 0 || index === 256) return "#fbbf24";
  if (ACI_BASIC[index]) return ACI_BASIC[index]!;
  return FALLBACK_PALETTE[Math.abs(index) % FALLBACK_PALETTE.length]!;
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

export function layerIdFromName(name: string): string {
  const slug =
    name
      .trim()
      .toUpperCase()
      .replace(/[^\w]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 48) || "0";
  return `imp_${slug}`;
}

export function newImportEntityId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
