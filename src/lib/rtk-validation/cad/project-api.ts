import type { CadProject } from "./types";

export interface SavedCadProjectRecord {
  id: string;
  name: string;
  savedAt: string;
  updatedAt: string;
  project: CadProject;
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? `Erro ${res.status}`;
  } catch {
    return `Erro ${res.status}`;
  }
}

export async function listSavedCadProjects(): Promise<SavedCadProjectRecord[]> {
  const res = await fetch("/api/cad/projects", { cache: "no-store" });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { projects: SavedCadProjectRecord[] };
  return data.projects ?? [];
}

export async function loadCadProject(id: string): Promise<SavedCadProjectRecord | null> {
  const res = await fetch(`/api/cad/projects/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { project: SavedCadProjectRecord };
  return data.project;
}

export async function saveCadProject(
  name: string,
  project: CadProject,
  existingId?: string | null,
): Promise<SavedCadProjectRecord> {
  const trimmedName = name.trim() || project.name || "Projeto CAD";
  const payload = { name: trimmedName, project: { ...project, name: trimmedName } };

  if (existingId) {
    const res = await fetch(`/api/cad/projects/${existingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 404) {
      const createRes = await fetch("/api/cad/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!createRes.ok) throw new Error(await parseError(createRes));
      const data = (await createRes.json()) as { project: SavedCadProjectRecord };
      return data.project;
    }
    if (!res.ok) throw new Error(await parseError(res));
    const data = (await res.json()) as { project: SavedCadProjectRecord };
    return data.project;
  }

  const res = await fetch("/api/cad/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { project: SavedCadProjectRecord };
  return data.project;
}

export async function deleteCadProject(id: string): Promise<void> {
  const res = await fetch(`/api/cad/projects/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(await parseError(res));
}

export function formatSavedDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function draftKey(userId: string) {
  return `datageo:cad-draft:${userId}`;
}

function lastOpenedKey(userId: string) {
  return `datageo:cad-last-opened:${userId}`;
}

interface CadDraftRecord {
  project: CadProject;
  savedId: string | null;
  updatedAt: string;
}

export function getLastOpenedCadProjectId(userId: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(lastOpenedKey(userId));
}

export function setLastOpenedCadProjectId(userId: string, id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(lastOpenedKey(userId), id);
}

export function clearLastOpenedCadProjectId(userId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(lastOpenedKey(userId));
}

export function saveCadDraft(userId: string, project: CadProject, savedId: string | null) {
  if (typeof window === "undefined") return;
  const draft: CadDraftRecord = {
    project,
    savedId,
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(draftKey(userId), JSON.stringify(draft));
  } catch {
    /* quota exceeded */
  }
}

export function loadCadDraft(userId: string): CadDraftRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as CadDraftRecord;
  } catch {
    return null;
  }
}

export function clearCadDraft(userId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(draftKey(userId));
}
