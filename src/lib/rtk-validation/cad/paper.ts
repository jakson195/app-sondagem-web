export type CadPaperTone = "white" | "black";

export const CAD_PAPER_STORAGE_KEY = "datageo.cad.paper";

export function parseCadPaperTone(raw: string | null | undefined): CadPaperTone {
  return raw === "white" ? "white" : "black";
}

export function cadPaperFill(tone: CadPaperTone): string {
  return tone === "white" ? "#ffffff" : "#000000";
}

export function cadPaperGridLine(tone: CadPaperTone, major: boolean): string {
  if (tone === "white") return major ? "#94a3b8" : "#e5e7eb";
  return major ? "#64748b" : "#1e293b";
}

export function cadPaperGridLabel(tone: CadPaperTone): string {
  return tone === "white" ? "#475569" : "#94a3b8";
}

export function cadPaperSelectStroke(tone: CadPaperTone): string {
  return tone === "white" ? "#0f2848" : "#ffffff";
}

function hexLuminance(color: string): number | null {
  const m = color.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Traço quase preto some no fundo preto — clareia só na tela. */
export function cadPaperScreenStroke(color: string, tone: CadPaperTone): string {
  if (tone === "white") return color;
  const lum = hexLuminance(color);
  if (lum != null && lum < 0.28) return "#f1f5f9";
  return color;
}
