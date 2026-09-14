import type { TaludesWorkspace } from "./taludes-project-types";
import { createDefaultTaludesProject } from "./taludes-project-types";

const STORAGE_KEY = "datageo:taludes-projects-v1";

export function loadTaludesWorkspace(): TaludesWorkspace {
  if (typeof window === "undefined") {
    const p = createDefaultTaludesProject();
    return { version: 1, activeId: p.id, projects: [p] };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const p = createDefaultTaludesProject();
      const ws: TaludesWorkspace = { version: 1, activeId: p.id, projects: [p] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
      return ws;
    }
    const parsed = JSON.parse(raw) as TaludesWorkspace;
    if (parsed.version !== 1 || !Array.isArray(parsed.projects) || parsed.projects.length === 0) {
      throw new Error("invalid workspace");
    }
    if (!parsed.projects.some((p) => p.id === parsed.activeId)) {
      parsed.activeId = parsed.projects[0].id;
    }
    return parsed;
  } catch {
    const p = createDefaultTaludesProject();
    const ws: TaludesWorkspace = { version: 1, activeId: p.id, projects: [p] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
    return ws;
  }
}

export function saveTaludesWorkspace(workspace: TaludesWorkspace): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

export function formatTaludesProjectDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
