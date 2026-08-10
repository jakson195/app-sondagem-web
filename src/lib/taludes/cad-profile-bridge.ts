import type { ProfilePoint, SlipCircle, SoilLayer } from "@/app/(app)/taludes/components/stability-engine";
import { profileKindFromLayer } from "@/lib/rtk-validation/cad/profile";
import type { CadPolylineEntity, CadVertex } from "@/lib/rtk-validation/cad/types";

export const CAD_TALUDES_IMPORT_STORAGE_KEY = "datageo:cad-taludes-import";

export type CadTaludesImportPayload = {
  profile: ProfilePoint[];
  projectName: string;
  profileName: string;
  profileKind: "longitudinal" | "transversal";
  importedAt: string;
  layers?: SoilLayer[];
};

/** Converte vértices do perfil CAD (distância × cota) para o formato do módulo de taludes. */
export function cadVerticesToTaludesProfile(vertices: CadVertex[]): ProfilePoint[] {
  if (vertices.length < 2) return [];
  return vertices.map((v) => ({ x: v.x, y: v.z }));
}

export function defaultSlipCircleFromProfile(profile: ProfilePoint[]): SlipCircle {
  if (profile.length === 0) return { cx: 25, cy: 25, r: 20 };

  const xs = profile.map((p) => p.x);
  const ys = profile.map((p) => p.y);
  const xCenter = (Math.min(...xs) + Math.max(...xs)) / 2;
  const yTop = Math.max(...ys);
  const span = Math.max(...xs) - Math.min(...xs);
  const r = Math.max(10, Math.min(span * 0.4, 40));

  return { cx: xCenter, cy: yTop + r * 0.75, r };
}

export function buildCadTaludesImportFromProfile(
  profile: CadPolylineEntity,
  projectName: string,
  layers?: SoilLayer[],
): CadTaludesImportPayload {
  return {
    profile: cadVerticesToTaludesProfile(profile.vertices),
    projectName,
    profileName: profile.name ?? projectName,
    profileKind: profileKindFromLayer(profile.layerId),
    importedAt: new Date().toISOString(),
    layers,
  };
}

export function saveCadTaludesImport(payload: CadTaludesImportPayload): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(CAD_TALUDES_IMPORT_STORAGE_KEY, JSON.stringify(payload));
}

export function loadCadTaludesImport(): CadTaludesImportPayload | null {
  if (typeof sessionStorage === "undefined") return null;

  const raw = sessionStorage.getItem(CAD_TALUDES_IMPORT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CadTaludesImportPayload;
    if (!Array.isArray(parsed.profile) || parsed.profile.length < 2) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearCadTaludesImport(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(CAD_TALUDES_IMPORT_STORAGE_KEY);
}
