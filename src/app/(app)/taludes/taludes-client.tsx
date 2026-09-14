"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type SoilLayer, type ProfilePoint, type WaterTable,
  type SlipCircle, type AnalysisResult, type SearchConfig,
  generateSlices, bishopSimplified, fellenius, janbuSimplified,
  findCriticalCircle, analyzeAllMethods, classifyFS, sptToSoilParams,
} from "./components/stability-engine";
import {
  clearCadTaludesImport,
  defaultSlipCircleFromProfile,
  loadCadTaludesImport,
} from "@/lib/taludes/cad-profile-bridge";
import type { AcadSlopeCandidate, AcadSlopeImportResult } from "@/lib/taludes/acad-import-types";
import { canvasWorldFromEvent, canvasHitRadiusWorld, drawGeo5SlopeScene, findNearestPointIndex } from "./components/geo5-draw";
import { Geo5NormativePanel, Geo5ResultsSummary, Geo5SliceTable } from "./components/geo5-results";
import {
  createDefaultTaludesProject,
  createProjectFromProfile,
  getActiveProject,
  patchProject,
  projectNameFromFileName,
  removeProject,
  setActiveProject,
  type TaludesProject,
  type TaludesProjectSource,
  type TaludesWorkspace,
  uniqueProjectName,
} from "@/lib/taludes/taludes-project-types";
import { formatTaludesProjectDate, loadTaludesWorkspace, saveTaludesWorkspace } from "@/lib/taludes/taludes-project-store";

const SOIL_COLORS = [
  "#C4A882","#8B7355","#6B8E6B","#9B8B6B","#7B9B8B",
  "#A0836B","#6B7B8B","#8B6B7B","#7B8B6B","#9B7B6B",
];

type DwgImportDialog = {
  candidates: AcadSlopeCandidate[];
  fileName: string;
  target: "new" | "current";
  projectName: string;
};

function SlopeCanvas({
  profile, waterTable, circle, layers, result,
  onProfileChange, onWaterTableChange, onCircleChange, mode,
  showSlices, showFullCircle, fsColor,
}: {
  profile: ProfilePoint[];
  waterTable: WaterTable | null;
  circle: SlipCircle | null;
  layers: SoilLayer[];
  result: AnalysisResult | null;
  onProfileChange: (p: ProfilePoint[]) => void;
  onWaterTableChange: (wt: WaterTable | null) => void;
  onCircleChange: (c: SlipCircle) => void;
  mode: "view" | "edit-profile" | "edit-water" | "edit-circle";
  showSlices: boolean;
  showFullCircle: boolean;
  fsColor: string;
}) {
  const cvs = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<{
    type: "circle-center" | "circle-radius" | "profile-point" | "water-point";
    idx?: number;
  } | null>(null);

  useEffect(() => {
    const canvas = cvs.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawGeo5SlopeScene(ctx, canvas.width, canvas.height, {
      profile,
      layers,
      waterTable,
      circle,
      result,
      fsColor,
      showSlices,
      showFullCircle,
      editProfilePoints: mode === "edit-profile",
      editWaterPoints: mode === "edit-water" && !!waterTable,
    });
  }, [profile, waterTable, circle, layers, result, mode, showSlices, showFullCircle, fsColor]);

  const finishDrag = useCallback(() => {
    if (drag?.type === "profile-point") {
      onProfileChange([...profile].sort((a, b) => a.x - b.x));
    } else if (drag?.type === "water-point" && waterTable) {
      onWaterTableChange({
        points: [...waterTable.points].sort((a, b) => a.x - b.x),
      });
    }
    setDrag(null);
  }, [drag, onProfileChange, onWaterTableChange, profile, waterTable]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cvs.current || mode === "view") return;
    const canvas = cvs.current;
    const w = canvasWorldFromEvent(e.clientX, e.clientY, canvas, profile);
    const hit = canvasHitRadiusWorld(canvas, profile);

    if (mode === "edit-profile") {
      const idx = findNearestPointIndex(profile, w.x, w.y, hit);
      if (e.shiftKey && idx >= 0 && profile.length > 2) {
        onProfileChange(profile.filter((_, i) => i !== idx));
        return;
      }
      if (idx >= 0) {
        setDrag({ type: "profile-point", idx });
      } else {
        onProfileChange([...profile, { x: w.x, y: w.y }].sort((a, b) => a.x - b.x));
      }
    } else if (mode === "edit-water" && waterTable) {
      const idx = findNearestPointIndex(waterTable.points, w.x, w.y, hit);
      if (e.shiftKey && idx >= 0 && waterTable.points.length > 2) {
        onWaterTableChange({ points: waterTable.points.filter((_, i) => i !== idx) });
        return;
      }
      if (idx >= 0) {
        setDrag({ type: "water-point", idx });
      } else {
        onWaterTableChange({
          points: [...waterTable.points, { x: w.x, y: w.y }].sort((a, b) => a.x - b.x),
        });
      }
    } else if (mode === "edit-circle" && circle) {
      const dc = Math.hypot(w.x - circle.cx, w.y - circle.cy);
      if (Math.abs(dc - circle.r) < hit) setDrag({ type: "circle-radius" });
      else if (dc < hit * 1.5) setDrag({ type: "circle-center" });
      else onCircleChange({ ...circle, cx: w.x, cy: w.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drag || !cvs.current) return;
    const w = canvasWorldFromEvent(e.clientX, e.clientY, cvs.current, profile);
    if (drag.type === "profile-point" && drag.idx !== undefined) {
      onProfileChange(profile.map((p, i) => (i === drag.idx ? { x: w.x, y: w.y } : p)));
    } else if (drag.type === "water-point" && drag.idx !== undefined && waterTable) {
      onWaterTableChange({
        points: waterTable.points.map((p, i) => (i === drag.idx ? { x: w.x, y: w.y } : p)),
      });
    } else if (drag.type === "circle-center" && circle) {
      onCircleChange({ ...circle, cx: w.x, cy: w.y });
    } else if (drag.type === "circle-radius" && circle) {
      const r = Math.hypot(w.x - circle.cx, w.y - circle.cy);
      onCircleChange({ ...circle, r });
    }
  };

  return (
    <canvas
      ref={cvs}
      width={1100} height={480}
      className="w-full h-full block"
      style={{ cursor: mode === "view" ? "default" : "crosshair", background: "#f3f1eb" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={finishDrag}
      onMouseLeave={finishDrag}
    />
  );
}

export function TaludesClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [workspace, setWorkspace] = useState<TaludesWorkspace | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<"view" | "edit-profile" | "edit-water" | "edit-circle">("view");
  const [activeTab, setActiveTab] = useState<"layers" | "circle" | "results" | "projects">("layers");
  const [searchMethod, setSearchMethod] = useState<"bishop" | "fellenius" | "janbu">("bishop");
  const [showSlices, setShowSlices] = useState(true);
  const [showFullCircle, setShowFullCircle] = useState(false);
  const [resultMethod, setResultMethod] = useState<"bishop" | "fellenius" | "janbu">("bishop");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importingDwg, setImportingDwg] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importDialog, setImportDialog] = useState<DwgImportDialog | null>(null);
  const cadImportHandled = useRef(false);

  useEffect(() => {
    setWorkspace(loadTaludesWorkspace());
  }, []);

  useEffect(() => {
    if (!workspace) return;
    const timer = window.setTimeout(() => saveTaludesWorkspace(workspace), 400);
    return () => window.clearTimeout(timer);
  }, [workspace]);

  const activeProject = workspace ? getActiveProject(workspace) : null;

  const patchActive = useCallback((patch: Partial<Omit<TaludesProject, "id" | "createdAt">>) => {
    setWorkspace((ws) => (ws ? patchProject(ws, ws.activeId, patch) : ws));
  }, []);

  const createNewProject = useCallback(() => {
    setWorkspace((ws) => {
      if (!ws) return ws;
      const name = uniqueProjectName(ws.projects, `Projeto ${ws.projects.length + 1}`);
      const project = createDefaultTaludesProject(name);
      return { ...ws, activeId: project.id, projects: [...ws.projects, project] };
    });
    setResultMethod("bishop");
    setImportError(null);
  }, []);

  const applyCandidateImport = useCallback((
    candidate: AcadSlopeCandidate,
    fileName: string,
    target: "new" | "current",
    projectName: string,
    layersOverride?: SoilLayer[],
  ) => {
    const source: TaludesProjectSource = {
      kind: "dwg",
      fileName,
      layerName: candidate.layerName,
      entityType: candidate.entityType,
      pointCount: candidate.pointCount,
    };

    if (target === "new") {
      setWorkspace((ws) => {
        if (!ws) return ws;
        return createProjectFromProfile({
          workspace: ws,
          name: projectName,
          profile: candidate.profile,
          layers: layersOverride,
          source,
        });
      });
    } else {
      patchActive({
        name: projectName.trim() || activeProject?.name,
        profile: candidate.profile,
        layers: layersOverride ?? activeProject?.layers,
        waterTable: null,
        circle: defaultSlipCircleFromProfile(candidate.profile),
        results: {},
        source,
      });
    }

    setImportDialog(null);
    setImportError(null);
    setResultMethod("bishop");
  }, [activeProject?.layers, activeProject?.name, patchActive]);

  const handleDwgFile = useCallback(async (file: File) => {
    setImportingDwg(true);
    setImportError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/taludes/import", { method: "POST", body: form });
      const data = (await res.json()) as AcadSlopeImportResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha na importação.");

      setImportDialog({
        candidates: data.candidates,
        fileName: data.fileName,
        target: "new",
        projectName: projectNameFromFileName(data.fileName),
      });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Erro ao importar DWG/DXF.");
    } finally {
      setImportingDwg(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  useEffect(() => {
    if (searchParams?.get("from") !== "cad" || cadImportHandled.current || !workspace) return;

    const payload = loadCadTaludesImport();
    if (!payload) return;

    cadImportHandled.current = true;
    setWorkspace((ws) => {
      if (!ws) return ws;
      return createProjectFromProfile({
        workspace: ws,
        name: payload.profileName || payload.projectName,
        profile: payload.profile,
        layers: payload.layers,
        source: {
          kind: "cad",
          fileName: payload.projectName,
          profileName: payload.profileName,
          profileKind: payload.profileKind,
          pointCount: payload.profile.length,
        },
      });
    });
    clearCadTaludesImport();
    router.replace("/taludes", { scroll: false });
  }, [searchParams, router, workspace]);

  const runAnalysis = useCallback(async () => {
    if (!activeProject) return;
    setRunning(true);
    setProgress(0);
    await new Promise((r) => setTimeout(r, 10));
    const all = analyzeAllMethods(
      activeProject.profile,
      activeProject.layers,
      activeProject.waterTable,
      activeProject.circle,
    );
    patchActive({ results: all });
    setResultMethod("bishop");
    setRunning(false);
    setActiveTab("results");
  }, [activeProject, patchActive]);

  const findCritical = useCallback(async () => {
    if (!activeProject) return;
    setRunning(true);
    setProgress(0);

    const { profile, layers, waterTable } = activeProject;
    const xs = profile.map((p) => p.x);
    const ys = profile.map((p) => p.y);
    const xCenter = (Math.min(...xs) + Math.max(...xs)) / 2;
    const yTop = Math.max(...ys);

    const config: SearchConfig = {
      method: searchMethod,
      xMin: xCenter - 15, xMax: xCenter + 15,
      yMin: yTop + 5, yMax: yTop + 30,
      rMin: 10, rMax: 40,
      nPoints: 8,
    };

    await new Promise((r) => setTimeout(r, 10));
    const res = findCriticalCircle(profile, layers, waterTable, config, setProgress);
    patchActive({
      circle: res.circle,
      results: { [searchMethod]: res },
    });
    setResultMethod(searchMethod);
    setRunning(false);
    setActiveTab("results");
  }, [activeProject, patchActive, searchMethod]);

  const addLayer = () => {
    if (!activeProject) return;
    const id = Date.now().toString();
    patchActive({
      layers: [...activeProject.layers, {
        id, name: "Nova camada", color: SOIL_COLORS[activeProject.layers.length % SOIL_COLORS.length],
        c: 10, phi: 30, gamma: 18, gammaSat: 19, thickness: 5,
      }],
    });
  };

  const updateLayer = (id: string, field: keyof SoilLayer, value: string | number) => {
    if (!activeProject) return;
    patchActive({
      layers: activeProject.layers.map((l) => (l.id === id ? { ...l, [field]: value } : l)),
    });
  };

  const removeLayer = (id: string) => {
    if (!activeProject) return;
    patchActive({ layers: activeProject.layers.filter((l) => l.id !== id) });
  };

  if (!workspace || !activeProject) {
    return <div className="p-6 text-sm text-[var(--muted)]">A carregar projetos…</div>;
  }

  const { profile, layers, waterTable, circle, results } = activeProject;
  const bishop = results.bishop;
  const criticalResult = results[resultMethod] ?? Object.values(results).find((r) => r.critical) ?? bishop;
  const fsColor = criticalResult ? classifyFS(criticalResult.fs).color : "#c0392b";

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg)]">
      {importError ? (
        <div className="flex items-center justify-between gap-3 px-4 py-1.5 border-b border-red-500/30 bg-red-500/10 flex-shrink-0">
          <p className="text-[.65rem] text-red-800">{importError}</p>
          <button type="button" onClick={() => setImportError(null)} className="text-red-700 hover:text-red-900 text-sm leading-none" aria-label="Fechar erro">×</button>
        </div>
      ) : null}
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--b1)] bg-[var(--surf)] flex-shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-sm font-semibold text-[var(--tx)]">⛰ Estabilidade de Taludes</span>
          <select
            value={workspace.activeId}
            onChange={(e) => setWorkspace((ws) => (ws ? setActiveProject(ws, e.target.value) : ws))}
            className="max-w-[180px] text-[.65rem] bg-[var(--card)] border border-[var(--b1)] rounded px-2 py-1 text-[var(--tx)] truncate"
            title="Selecionar projeto"
          >
            {workspace.projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={createNewProject}
            className="px-2 py-1 text-[.62rem] font-semibold bg-[var(--card)] border border-[var(--b1)] rounded hover:border-[var(--bl)] text-[var(--tx)]"
            title="Criar projeto em branco"
          >
            + Novo projeto
          </button>
          <input
            value={activeProject.name}
            onChange={(e) => patchActive({ name: e.target.value })}
            className="hidden lg:block w-36 text-[.65rem] bg-[var(--card)] border border-[var(--b1)] rounded px-2 py-1 text-[var(--tx)]"
            aria-label="Nome do projeto"
          />
          <div className="flex gap-1 flex-wrap">
            {([
              { id: "view", label: "Secção" },
              { id: "edit-profile", label: "Perfil" },
              { id: "edit-water", label: "NA" },
              { id: "edit-circle", label: "Círculo" },
            ] as const).map(({ id, label }) => (
              <button key={id} onClick={() => setMode(id)}
                disabled={id === "edit-water" && !waterTable}
                className={`px-2 py-0.5 rounded text-[.6rem] font-semibold transition-colors disabled:opacity-40 ${
                  mode === id ? "bg-[#2c5282] text-white" : "bg-[var(--card)] text-[var(--mu)] hover:text-[var(--tx)]"
                }`}>
                {label}
              </button>
            ))}
          </div>
          <label className="hidden md:flex items-center gap-1 text-[10px] text-[var(--mu)] cursor-pointer">
            <input type="checkbox" checked={showSlices} onChange={e => setShowSlices(e.target.checked)} className="rounded" />
            Fatias
          </label>
          <label className="hidden md:flex items-center gap-1 text-[10px] text-[var(--mu)] cursor-pointer">
            <input type="checkbox" checked={showFullCircle} onChange={e => setShowFullCircle(e.target.checked)} className="rounded" />
            Círculo completo
          </label>
        </div>
        <div className="flex gap-2 items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".dwg,.dxf,application/acad,application/dxf,image/vnd.dwg,image/x-dwg"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleDwgFile(file);
            }}
          />
          <button
            type="button"
            disabled={importingDwg}
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1 text-[.65rem] font-semibold bg-[var(--card)] border border-[var(--b1)] text-[var(--tx)] rounded hover:border-[var(--bl)] disabled:opacity-50"
            title="Importar DWG/DXF — por padrão cria um novo projeto sem alterar os existentes"
          >
            {importingDwg ? "Importando…" : "📂 Importar DWG"}
          </button>
          <select value={searchMethod} onChange={e => setSearchMethod(e.target.value as typeof searchMethod)}
            className="text-[.65rem] bg-[var(--card)] border border-[var(--b1)] rounded px-1.5 py-0.5 text-[var(--tx)]">
            <option value="bishop">Bishop</option>
            <option value="fellenius">Fellenius</option>
            <option value="janbu">Janbu</option>
          </select>
          <button onClick={findCritical} disabled={running}
            className="px-3 py-1 text-[.65rem] font-semibold bg-[var(--am)] text-white rounded hover:opacity-90 disabled:opacity-50">
            {running ? `Buscando… ${(progress*100).toFixed(0)}%` : "🔍 Círculo Crítico"}
          </button>
          <button onClick={runAnalysis} disabled={running}
            className="px-3 py-1 text-[.65rem] font-semibold bg-[var(--bl)] text-white rounded hover:opacity-90 disabled:opacity-50">
            ▶ Calcular FS
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        <div className="w-72 flex-shrink-0 border-r border-[var(--b1)] bg-[var(--panel)] flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-[var(--b1)]">
            {(["layers","circle","results","projects"] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`flex-1 py-1.5 text-[.58rem] font-bold tracking-widest uppercase transition-colors ${
                  activeTab === t ? "text-[var(--bl)] border-b-2 border-[var(--bl)]" : "text-[var(--mu)] hover:text-[var(--tx)]"
                }`}>
                {t === "layers" ? "Camadas" : t === "circle" ? "Círculo" : t === "results" ? "Resultados" : "Projetos"}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* CAMADAS */}
            {activeTab === "layers" && (
              <div className="p-2 space-y-2">
                {layers.map((l, li) => (
                  <div key={l.id} className="bg-[var(--card)] rounded border border-[var(--b1)] p-2">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: l.color }} />
                      <input value={l.name} onChange={e => updateLayer(l.id, "name", e.target.value)}
                        className="flex-1 text-[.65rem] bg-transparent text-[var(--tx)] font-semibold outline-none" />
                      <button onClick={() => removeLayer(l.id)} className="text-[var(--mu)] hover:text-[var(--rd)] text-xs">×</button>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { label: "c (kPa)", key: "c" as const },
                        { label: "φ (°)", key: "phi" as const },
                        { label: "γ (kN/m³)", key: "gamma" as const },
                        { label: "γsat", key: "gammaSat" as const },
                        { label: "esp. (m)", key: "thickness" as const },
                      ].map(({ label, key }) => (
                        <div key={key}>
                          <div className="text-[.5rem] text-[var(--mu)] mb-0.5">{label}</div>
                          <input type="number" value={l[key] as number}
                            onChange={e => updateLayer(l.id, key, parseFloat(e.target.value) || 0)}
                            className="w-full text-[.65rem] bg-[var(--bg)] border border-[var(--b1)] rounded px-1 py-0.5 text-[var(--tx)]" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <button onClick={addLayer}
                  className="w-full py-1.5 text-[.62rem] border border-dashed border-[var(--b2)] rounded text-[var(--mu)] hover:text-[var(--tx)] hover:border-[var(--bl)] transition-colors">
                  + Adicionar camada
                </button>

                <div className="border-t border-[var(--b1)] pt-2 mt-2">
                  <div className="text-[.55rem] font-bold text-[var(--mu)] uppercase tracking-widest mb-1.5">Nível d&apos;água</div>
                  <div className="trow flex items-center justify-between">
                    <span className="text-[.62rem] text-[var(--mu)]">Ativar NA</span>
                    <label className="relative inline-flex cursor-pointer">
                      <input type="checkbox" checked={!!waterTable}
                        onChange={e => {
                          if (e.target.checked) {
                            patchActive({
                              waterTable: {
                                points: profile.map(p => ({ x: p.x, y: p.y - 2 })),
                              },
                            });
                            setMode("edit-water");
                          } else {
                            patchActive({ waterTable: null });
                            if (mode === "edit-water") setMode("view");
                          }
                        }}
                        className="sr-only peer" />
                      <div className="w-7 h-4 bg-[var(--b1)] peer-checked:bg-[var(--bl)] rounded-full transition-colors" />
                      <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full transition-all peer-checked:translate-x-3" />
                    </label>
                  </div>
                  {waterTable ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-[10px] text-[var(--mu)] leading-relaxed">
                        Modo <strong>NA</strong>: arraste os pontos azuis (X e Y). Clique vazio para adicionar; Shift+clique remove.
                      </p>
                      <div className="space-y-1">
                        {waterTable.points.map((pt, i) => (
                          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1 items-center">
                            <label className="text-[.55rem]">
                              <span className="text-[var(--mu)]">X</span>
                              <input
                                type="number"
                                step="0.1"
                                value={Number(pt.x.toFixed(2))}
                                onChange={e => {
                                  const x = parseFloat(e.target.value) || 0;
                                  const points = waterTable.points.map((p, j) =>
                                    j === i ? { ...p, x } : p,
                                  ).sort((a, b) => a.x - b.x);
                                  patchActive({ waterTable: { points } });
                                }}
                                className="mt-0.5 w-full text-[.62rem] bg-[var(--bg)] border border-[var(--b1)] rounded px-1 py-0.5"
                              />
                            </label>
                            <label className="text-[.55rem]">
                              <span className="text-[var(--mu)]">Y</span>
                              <input
                                type="number"
                                step="0.1"
                                value={Number(pt.y.toFixed(2))}
                                onChange={e => {
                                  const y = parseFloat(e.target.value) || 0;
                                  patchActive({
                                    waterTable: {
                                      points: waterTable.points.map((p, j) =>
                                        j === i ? { ...p, y } : p,
                                      ),
                                    },
                                  });
                                }}
                                className="mt-0.5 w-full text-[.62rem] bg-[var(--bg)] border border-[var(--b1)] rounded px-1 py-0.5"
                              />
                            </label>
                            <button
                              type="button"
                              disabled={waterTable.points.length <= 2}
                              onClick={() => patchActive({
                                waterTable: { points: waterTable.points.filter((_, j) => j !== i) },
                              })}
                              className="text-[var(--mu)] hover:text-[var(--rd)] text-xs disabled:opacity-30 mt-3"
                              title="Remover ponto"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const xs = profile.map(p => p.x);
                          const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
                          const midY = profile.reduce((s, p) => s + p.y, 0) / profile.length - 3;
                          patchActive({
                            waterTable: {
                              points: [...waterTable.points, { x: midX, y: midY }].sort((a, b) => a.x - b.x),
                            },
                          });
                        }}
                        className="w-full py-1 text-[.6rem] border border-dashed border-[var(--b2)] rounded text-[var(--mu)] hover:text-[var(--tx)]"
                      >
                        + Ponto NA
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-[var(--b1)] pt-2 mt-2">
                  <div className="text-[.55rem] font-bold text-[var(--mu)] uppercase tracking-widest mb-1.5">Perfil do talude</div>
                  <p className="text-[10px] text-[var(--mu)] leading-relaxed mb-2">
                    Modo <strong>Perfil</strong>: arraste os pontos laranja em X e Y. Clique vazio para adicionar; Shift+clique remove.
                  </p>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {profile.map((pt, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1 items-center">
                        <label className="text-[.55rem]">
                          <span className="text-[var(--mu)]">X</span>
                          <input
                            type="number"
                            step="0.1"
                            value={Number(pt.x.toFixed(2))}
                            onChange={e => {
                              const x = parseFloat(e.target.value) || 0;
                              patchActive({
                                profile: profile.map((p, j) =>
                                  j === i ? { ...p, x } : p,
                                ).sort((a, b) => a.x - b.x),
                              });
                            }}
                            className="mt-0.5 w-full text-[.62rem] bg-[var(--bg)] border border-[var(--b1)] rounded px-1 py-0.5"
                          />
                        </label>
                        <label className="text-[.55rem]">
                          <span className="text-[var(--mu)]">Y</span>
                          <input
                            type="number"
                            step="0.1"
                            value={Number(pt.y.toFixed(2))}
                            onChange={e => {
                              const y = parseFloat(e.target.value) || 0;
                              patchActive({
                                profile: profile.map((p, j) => (j === i ? { ...p, y } : p)),
                              });
                            }}
                            className="mt-0.5 w-full text-[.62rem] bg-[var(--bg)] border border-[var(--b1)] rounded px-1 py-0.5"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={profile.length <= 2}
                          onClick={() => patchActive({ profile: profile.filter((_, j) => j !== i) })}
                          className="text-[var(--mu)] hover:text-[var(--rd)] text-xs disabled:opacity-30 mt-3"
                          title="Remover ponto"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* CÍRCULO */}
            {activeTab === "circle" && (
              <div className="p-2 space-y-2">
                <div className="text-[.55rem] font-bold text-[var(--mu)] uppercase tracking-widest mb-1">Superfície circular (GEO5)</div>
                {[
                  { label: "Centro X (m)", key: "cx" as const },
                  { label: "Centro Y (m)", key: "cy" as const },
                  { label: "Raio R (m)", key: "r" as const },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <div className="text-[.58rem] text-[var(--mu)] mb-0.5">{label}</div>
                    <input type="number" step="0.5" value={circle[key].toFixed(1)}
                      onChange={e => patchActive({
                        circle: { ...circle, [key]: parseFloat(e.target.value) || 0 },
                      })}
                      className="w-full text-[.7rem] bg-[var(--card)] border border-[var(--b1)] rounded px-2 py-1 text-[var(--tx)] font-mono" />
                  </div>
                ))}
                <div className="rounded border border-[#c8c4bc] bg-[#f5f3ed] p-2 text-[10px] text-[#555] space-y-1">
                  <p><strong>Círculo crítico:</strong> use o botão no topo para busca automática de centro e raio.</p>
                  <p><strong>Modo Círculo:</strong> arraste o centro ou o raio diretamente na secção.</p>
                </div>
              </div>
            )}

            {activeTab === "results" && (
              <div className="p-2 space-y-2">
                {Object.keys(results).length === 0 ? (
                  <div className="text-[.65rem] text-[var(--mu)] text-center py-4">
                    Calcule o FS ou busque o círculo crítico para ver resultados.
                  </div>
                ) : (
                  <>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--mu)]">Método exibido</div>
                    <select
                      value={resultMethod}
                      onChange={e => setResultMethod(e.target.value as typeof resultMethod)}
                      className="w-full text-[.65rem] bg-[var(--card)] border border-[var(--b1)] rounded px-2 py-1"
                    >
                      {Object.keys(results).map(k => (
                        <option key={k} value={k}>{results[k].method}</option>
                      ))}
                    </select>
                    {criticalResult ? (
                      <Geo5NormativePanel fs={criticalResult.fs} />
                    ) : null}
                  </>
                )}
              </div>
            )}

            {activeTab === "projects" && (
              <div className="p-2 space-y-2">
                <button
                  type="button"
                  onClick={createNewProject}
                  className="w-full py-2 text-[.65rem] font-semibold bg-[var(--bl)] text-white rounded hover:opacity-90"
                >
                  + Novo projeto em branco
                </button>
                <div className="space-y-1.5">
                  {workspace.projects.map((p) => (
                    <div
                      key={p.id}
                      className={`rounded border p-2 ${p.id === workspace.activeId ? "border-[var(--bl)] bg-[var(--card)]" : "border-[var(--b1)]"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setWorkspace((ws) => (ws ? setActiveProject(ws, p.id) : ws))}
                          className="text-left flex-1 min-w-0"
                        >
                          <div className="text-[.68rem] font-semibold text-[var(--tx)] truncate">{p.name}</div>
                          <div className="text-[.58rem] text-[var(--mu)] mt-0.5">
                            {p.profile.length} pts · {formatTaludesProjectDate(p.updatedAt)}
                          </div>
                          {p.source ? (
                            <div className="text-[.55rem] text-sky-700 mt-0.5 truncate">
                              {p.source.kind === "dwg" ? `DWG: ${p.source.fileName}` : `CAD: ${p.source.profileName ?? p.source.fileName}`}
                            </div>
                          ) : null}
                        </button>
                        {workspace.projects.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm(`Excluir o projeto "${p.name}"?`)) return;
                              setWorkspace((ws) => (ws ? removeProject(ws, p.id) : ws));
                            }}
                            className="text-[var(--mu)] hover:text-[var(--rd)] text-xs px-1"
                            title="Excluir projeto"
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--mu)] leading-relaxed">
                  Importar DWG cria um novo projeto por padrão. Os projetos existentes permanecem intactos.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Área principal estilo GEO5 */}
        <div className="flex-1 min-w-0 flex flex-col bg-[#e8e6e0]">
          <div className="flex-1 min-h-0 relative border-b border-[#c8c4bc]">
            <SlopeCanvas
              profile={profile}
              waterTable={waterTable}
              circle={circle}
              layers={layers}
              result={criticalResult ?? null}
              onProfileChange={(p) => patchActive({ profile: p })}
              onWaterTableChange={(wt) => patchActive({ waterTable: wt })}
              onCircleChange={(c) => patchActive({ circle: c })}
              mode={mode}
              showSlices={showSlices}
              showFullCircle={showFullCircle}
              fsColor={fsColor}
            />
          </div>

          {Object.keys(results).length > 0 ? (
            <div className="flex-shrink-0 max-h-[42%] flex flex-col overflow-hidden">
              <Geo5ResultsSummary
                results={results}
                circle={circle}
                activeMethod={resultMethod}
              />
              <div className="text-[10px] font-bold uppercase tracking-wide text-[#555] px-3 py-1 bg-[#dfe6ef] border-t border-[#c8c4bc]">
                Tabela de fatias — {criticalResult?.method ?? ""}
              </div>
              <Geo5SliceTable result={criticalResult ?? null} />
            </div>
          ) : null}
        </div>
      </div>

      {importDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-[var(--b1)] bg-[var(--surf)] shadow-xl">
            <div className="border-b border-[var(--b1)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--tx)]">Importar DWG/DXF</h3>
              <p className="mt-1 text-[.65rem] text-[var(--mu)]">
                {importDialog.fileName} — escolha destino e perfil do talude.
              </p>
            </div>

            <div className="px-4 py-3 border-b border-[var(--b1)] space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--mu)]">Destino da importação</div>
              <label className="flex items-center gap-2 text-[.65rem] cursor-pointer">
                <input
                  type="radio"
                  name="import-target"
                  checked={importDialog.target === "new"}
                  onChange={() => setImportDialog({ ...importDialog, target: "new" })}
                />
                Criar novo projeto (recomendado — não altera os existentes)
              </label>
              <label className="flex items-center gap-2 text-[.65rem] cursor-pointer">
                <input
                  type="radio"
                  name="import-target"
                  checked={importDialog.target === "current"}
                  onChange={() => setImportDialog({ ...importDialog, target: "current" })}
                />
                Substituir projeto atual: {activeProject.name}
              </label>
              <label className="block text-[.65rem]">
                <span className="text-[var(--mu)]">Nome do projeto</span>
                <input
                  type="text"
                  value={importDialog.projectName}
                  onChange={(e) => setImportDialog({ ...importDialog, projectName: e.target.value })}
                  className="mt-1 w-full rounded border border-[var(--b1)] bg-[var(--card)] px-2 py-1 text-[var(--tx)]"
                />
              </label>
            </div>

            <ul className="max-h-72 overflow-y-auto divide-y divide-[var(--b1)]">
              {importDialog.candidates.map((candidate, index) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => applyCandidateImport(
                      candidate,
                      importDialog.fileName,
                      importDialog.target,
                      importDialog.target === "new"
                        ? importDialog.projectName
                        : activeProject.name,
                    )}
                    className="w-full px-4 py-3 text-left hover:bg-[var(--card)] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[.7rem] font-semibold text-[var(--tx)]">
                        {index === 0 ? "★ " : ""}
                        Camada {candidate.layerName}
                      </span>
                      <span className="text-[.6rem] text-[var(--mu)]">{candidate.length} m</span>
                    </div>
                    <p className="mt-0.5 text-[.6rem] text-[var(--mu)]">
                      {candidate.entityType} · {candidate.pointCount} pontos · bloco {candidate.blockName}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t border-[var(--b1)] px-4 py-3 flex justify-end">
              <button
                type="button"
                onClick={() => setImportDialog(null)}
                className="px-3 py-1 text-[.65rem] text-[var(--mu)] hover:text-[var(--tx)]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
