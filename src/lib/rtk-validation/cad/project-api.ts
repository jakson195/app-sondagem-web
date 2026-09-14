import type { CadProject, CadRasterOverlay } from "./types";
import {
  buildCloudSaveBody,
  cadProjectFileBasename,
  cloudPayloadHasRasterBytes,
  splitStoredCadData,
  stripRasterImageData,
  toCloudCadProject,
} from "./project-file";

export interface SavedCadProjectRecord {
  id: string;
  name: string;
  savedAt: string;
  updatedAt: string;
  project: CadProject;
  rasters?: CadRasterOverlay[];
  entityCount?: number;
  hasDwg?: boolean;
}

const FETCH_OPTS: RequestInit = { cache: "no-store", credentials: "same-origin" };
const FETCH_TIMEOUT_MS = 4000;

function cadFetch(input: string, init?: RequestInit) {
  return fetch(input, {
    ...FETCH_OPTS,
    ...init,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}
const DRAFT_IDB_NAME = "datageo-cad-drafts";
const DRAFT_IDB_STORE = "rasters";
const LOCAL_RASTER_INLINE_MAX = 200_000;

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? `Erro ${res.status}`;
  } catch {
    return `Erro ${res.status}`;
  }
}

export async function listSavedCadProjects(): Promise<SavedCadProjectRecord[]> {
  const res = await cadFetch("/api/cad/projects");
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { projects: SavedCadProjectRecord[] };
  return data.projects ?? [];
}

export async function loadCadProject(id: string): Promise<SavedCadProjectRecord | null> {
  const res = await cadFetch(`/api/cad/projects/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { project: SavedCadProjectRecord };
  return data.project;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? "");
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o DWG."));
    reader.readAsDataURL(blob);
  });
}

async function exportDwgBase64(project: CadProject): Promise<{ base64: string; filename: string }> {
  const cloudProject = toCloudCadProject(project);
  const res = await fetch("/api/cad/export", {
    ...FETCH_OPTS,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: cloudProject, format: "dwg" }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const blob = await res.blob();
  const filename = `${cadProjectFileBasename(project.name).replace(/\.cad\.json$/i, "")}.dwg`;
  return { base64: await blobToBase64(blob), filename };
}

export async function saveCadDwgToCloud(
  name: string,
  project: CadProject,
  existingId?: string | null,
): Promise<SavedCadProjectRecord> {
  if (project.entities.length === 0) {
    throw new Error("Nenhuma geometria para exportar.");
  }
  const trimmedName = name.trim() || project.name || "Projeto CAD";
  const { base64, filename } = await exportDwgBase64({ ...project, name: trimmedName });
  const payload = buildCloudSaveBody(trimmedName, project, base64, filename);
  if (cloudPayloadHasRasterBytes(payload.project)) {
    throw new Error("Ortofotos não são enviadas à nuvem. Salve no computador.");
  }

  async function parseOk(res: Response): Promise<SavedCadProjectRecord> {
    if (!res.ok) throw new Error(await parseError(res));
    const data = (await res.json()) as { project: SavedCadProjectRecord };
    return data.project;
  }

  if (existingId) {
    const res = await fetch(`/api/cad/projects/${existingId}`, {
      ...FETCH_OPTS,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 404) {
      const createRes = await fetch("/api/cad/projects", {
        ...FETCH_OPTS,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return parseOk(createRes);
    }
    return parseOk(res);
  }

  const res = await fetch("/api/cad/projects", {
    ...FETCH_OPTS,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseOk(res);
}

/** @deprecated Use saveCadDwgToCloud. Rasters are never uploaded. */
export async function saveCadProject(
  name: string,
  project: CadProject,
  existingId?: string | null,
  _rasters: CadRasterOverlay[] = [],
): Promise<{ record: SavedCadProjectRecord; rastersOmitted: boolean }> {
  void _rasters;
  const record = await saveCadDwgToCloud(name, project, existingId);
  return { record, rastersOmitted: true };
}

export async function downloadCadProjectDwg(id: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`/api/cad/projects/${id}/dwg`, FETCH_OPTS);
  if (!res.ok) throw new Error(await parseError(res));
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(cd);
  return { blob, filename: match?.[1] ?? "projeto.dwg" };
}

export async function deleteCadProject(id: string): Promise<void> {
  const res = await fetch(`/api/cad/projects/${id}`, { ...FETCH_OPTS, method: "DELETE" });
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
  rasters?: CadRasterOverlay[];
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

function writeDraft(userId: string, draft: CadDraftRecord): boolean {
  try {
    localStorage.setItem(draftKey(userId), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DRAFT_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DRAFT_IDB_STORE)) {
        db.createObjectStore(DRAFT_IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB indisponível."));
  });
}

async function writeDraftRastersIdb(userId: string, rasters: CadRasterOverlay[]): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDraftDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DRAFT_IDB_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Falha ao gravar rascunho local."));
    tx.objectStore(DRAFT_IDB_STORE).put(rasters, userId);
  });
  db.close();
}

async function readDraftRastersIdb(userId: string): Promise<CadRasterOverlay[] | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDraftDb();
    const rasters = await new Promise<CadRasterOverlay[] | null>((resolve, reject) => {
      const tx = db.transaction(DRAFT_IDB_STORE, "readonly");
      const req = tx.objectStore(DRAFT_IDB_STORE).get(userId);
      req.onsuccess = () => resolve((req.result as CadRasterOverlay[] | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error("Falha ao ler rascunho local."));
    });
    db.close();
    return rasters;
  } catch {
    return null;
  }
}

async function clearDraftRastersIdb(userId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDraftDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DRAFT_IDB_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao limpar rascunho local."));
      tx.objectStore(DRAFT_IDB_STORE).delete(userId);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

export function saveCadDraft(
  userId: string,
  project: CadProject,
  savedId: string | null,
  rasters: CadRasterOverlay[] = [],
) {
  if (typeof window === "undefined") return;
  const updatedAt = new Date().toISOString();
  const huge = rasters.some((r) => (r.imageDataUrl?.length ?? 0) > LOCAL_RASTER_INLINE_MAX);
  if (!huge && writeDraft(userId, { project, rasters, savedId, updatedAt })) {
    if (rasters.length > 0) void writeDraftRastersIdb(userId, rasters);
    return;
  }
  const stubs = stripRasterImageData(rasters);
  writeDraft(userId, { project, rasters: stubs, savedId, updatedAt });
  if (rasters.length > 0) void writeDraftRastersIdb(userId, rasters);
}

export async function loadCadDraft(userId: string): Promise<CadDraftRecord | null> {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CadDraftRecord;
    if (!parsed?.project) return null;
    const snap = splitStoredCadData(parsed.project, parsed.project.name);
    let rasters = parsed.rasters && parsed.rasters.length > 0 ? parsed.rasters : snap.rasters;
    const missingImages = rasters.length === 0 || rasters.some((r) => !r.imageDataUrl);
    if (missingImages) {
      const fromIdb = await readDraftRastersIdb(userId);
      if (fromIdb && fromIdb.length > 0) rasters = fromIdb;
    }
    return {
      project: snap.project,
      rasters,
      savedId: parsed.savedId ?? null,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export function clearCadDraft(userId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(draftKey(userId));
  void clearDraftRastersIdb(userId);
}
