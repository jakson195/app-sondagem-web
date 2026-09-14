import type { AnalysisResult, ProfilePoint, SlipCircle, SoilLayer, WaterTable } from "@/app/(app)/taludes/components/stability-engine";
import { defaultSlipCircleFromProfile } from "@/lib/taludes/cad-profile-bridge";

export type TaludesProjectSource = {
  kind: "dwg" | "cad";
  fileName?: string;
  layerName?: string;
  entityType?: string;
  pointCount?: number;
  profileName?: string;
  profileKind?: "longitudinal" | "transversal";
};

export type TaludesProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  profile: ProfilePoint[];
  layers: SoilLayer[];
  waterTable: WaterTable | null;
  circle: SlipCircle;
  results: Record<string, AnalysisResult>;
  source: TaludesProjectSource | null;
};

export type TaludesWorkspace = {
  version: 1;
  activeId: string;
  projects: TaludesProject[];
};

export const DEFAULT_LAYERS: SoilLayer[] = [
  { id: "1", name: "Aterro", color: "#C4A882", c: 5, phi: 28, gamma: 18, gammaSat: 19, thickness: 3 },
  { id: "2", name: "Solo residual", color: "#8B7355", c: 15, phi: 32, gamma: 19, gammaSat: 20, thickness: 8 },
  { id: "3", name: "Rocha alterada", color: "#6B8E6B", c: 30, phi: 38, gamma: 22, gammaSat: 23, thickness: 15 },
];

export const DEFAULT_PROFILE: ProfilePoint[] = [
  { x: 0, y: 20 }, { x: 5, y: 20 }, { x: 10, y: 18 }, { x: 20, y: 14 }, { x: 30, y: 10 },
  { x: 40, y: 8 }, { x: 50, y: 8 }, { x: 60, y: 8 },
];

function newId() {
  return `tal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultTaludesProject(name = "Projeto 1"): TaludesProject {
  const now = new Date().toISOString();
  return {
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    profile: DEFAULT_PROFILE.map((p) => ({ ...p })),
    layers: DEFAULT_LAYERS.map((l) => ({ ...l })),
    waterTable: null,
    circle: defaultSlipCircleFromProfile(DEFAULT_PROFILE),
    results: {},
    source: null,
  };
}

export function uniqueProjectName(projects: TaludesProject[], base: string): string {
  const trimmed = base.trim() || "Projeto";
  const names = new Set(projects.map((p) => p.name.toLowerCase()));
  if (!names.has(trimmed.toLowerCase())) return trimmed;
  let i = 2;
  while (names.has(`${trimmed} (${i})`.toLowerCase())) i += 1;
  return `${trimmed} (${i})`;
}

export function projectNameFromFileName(fileName: string): string {
  return fileName.replace(/\.(dwg|dxf)$/i, "").trim() || "Importação DWG";
}

export function getActiveProject(workspace: TaludesWorkspace): TaludesProject {
  return workspace.projects.find((p) => p.id === workspace.activeId) ?? workspace.projects[0];
}

export function patchProject(
  workspace: TaludesWorkspace,
  projectId: string,
  patch: Partial<Omit<TaludesProject, "id" | "createdAt">>,
): TaludesWorkspace {
  const updatedAt = new Date().toISOString();
  return {
    ...workspace,
    projects: workspace.projects.map((p) =>
      p.id === projectId ? { ...p, ...patch, updatedAt } : p,
    ),
  };
}

export function addProject(workspace: TaludesWorkspace, project: TaludesProject): TaludesWorkspace {
  return {
    ...workspace,
    activeId: project.id,
    projects: [...workspace.projects, project],
  };
}

export function removeProject(workspace: TaludesWorkspace, projectId: string): TaludesWorkspace {
  const remaining = workspace.projects.filter((p) => p.id !== projectId);
  if (remaining.length === 0) {
    const fallback = createDefaultTaludesProject("Projeto 1");
    return { version: 1, activeId: fallback.id, projects: [fallback] };
  }
  const activeId = workspace.activeId === projectId ? remaining[0].id : workspace.activeId;
  return { ...workspace, activeId, projects: remaining };
}

export function setActiveProject(workspace: TaludesWorkspace, projectId: string): TaludesWorkspace {
  if (!workspace.projects.some((p) => p.id === projectId)) return workspace;
  return { ...workspace, activeId: projectId };
}

export function createProjectFromProfile(input: {
  workspace: TaludesWorkspace;
  name: string;
  profile: ProfilePoint[];
  layers?: SoilLayer[];
  source?: TaludesProjectSource | null;
}): TaludesWorkspace {
  const now = new Date().toISOString();
  const project: TaludesProject = {
    id: newId(),
    name: uniqueProjectName(input.workspace.projects, input.name),
    createdAt: now,
    updatedAt: now,
    profile: input.profile.map((p) => ({ ...p })),
    layers: (input.layers ?? DEFAULT_LAYERS).map((l) => ({ ...l })),
    waterTable: null,
    circle: defaultSlipCircleFromProfile(input.profile),
    results: {},
    source: input.source ?? null,
  };
  return addProject(input.workspace, project);
}
