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

// ── PALETA ────────────────────────────────────────────────────
const SOIL_COLORS = [
  "#C4A882","#8B7355","#6B8E6B","#9B8B6B","#7B9B8B",
  "#A0836B","#6B7B8B","#8B6B7B","#7B8B6B","#9B7B6B",
];

const DEFAULT_LAYERS: SoilLayer[] = [
  { id:"1", name:"Aterro", color:"#C4A882", c:5, phi:28, gamma:18, gammaSat:19, thickness:3 },
  { id:"2", name:"Solo residual", color:"#8B7355", c:15, phi:32, gamma:19, gammaSat:20, thickness:8 },
  { id:"3", name:"Rocha alterada", color:"#6B8E6B", c:30, phi:38, gamma:22, gammaSat:23, thickness:15 },
];

const DEFAULT_PROFILE: ProfilePoint[] = [
  {x:0,y:20},{x:5,y:20},{x:10,y:18},{x:20,y:14},{x:30,y:10},
  {x:40,y:8},{x:50,y:8},{x:60,y:8},
];

// ── CANVAS DE TALUDE ──────────────────────────────────────────
function SlopeCanvas({
  profile, waterTable, circle, layers, result, onProfileChange, onCircleChange, mode,
}: {
  profile: ProfilePoint[];
  waterTable: WaterTable | null;
  circle: SlipCircle | null;
  layers: SoilLayer[];
  result: AnalysisResult | null;
  onProfileChange: (p: ProfilePoint[]) => void;
  onCircleChange: (c: SlipCircle) => void;
  mode: "view" | "edit-profile" | "edit-circle";
}) {
  const cvs = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<{ type: "circle-center" | "circle-radius" | "profile-point"; idx?: number } | null>(null);

  const toWorld = useCallback((ex: number, ey: number, canvas: HTMLCanvasElement) => {
    const r = canvas.getBoundingClientRect();
    const pad = { l: 50, r: 20, t: 20, b: 40 };
    const W = canvas.width - pad.l - pad.r;
    const H = canvas.height - pad.t - pad.b;
    const xs = profile.map(p => p.x);
    const ys = profile.map(p => p.y);
    const xMin = Math.min(...xs) - 5, xMax = Math.max(...xs) + 5;
    const yMin = Math.min(...ys) - 5, yMax = Math.max(...ys) + 10;
    const px = ex - r.left - pad.l;
    const py = ey - r.top - pad.t;
    return {
      x: xMin + (px / W) * (xMax - xMin),
      y: yMax - (py / H) * (yMax - yMin),
    };
  }, [profile]);

  const toCanvas = useCallback((wx: number, wy: number, canvas: HTMLCanvasElement) => {
    const pad = { l: 50, r: 20, t: 20, b: 40 };
    const W = canvas.width - pad.l - pad.r;
    const H = canvas.height - pad.t - pad.b;
    const xs = profile.map(p => p.x);
    const ys = profile.map(p => p.y);
    const xMin = Math.min(...xs) - 5, xMax = Math.max(...xs) + 5;
    const yMin = Math.min(...ys) - 5, yMax = Math.max(...ys) + 10;
    return {
      cx: pad.l + ((wx - xMin) / (xMax - xMin)) * W,
      cy: pad.t + ((yMax - wy) / (yMax - yMin)) * H,
    };
  }, [profile]);

  useEffect(() => {
    const canvas = cvs.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const pad = { l: 50, r: 20, t: 20, b: 40 };
    const xs = profile.map(p => p.x);
    const ys = profile.map(p => p.y);
    const xMin = Math.min(...xs) - 5, xMax = Math.max(...xs) + 5;
    const yMin = Math.min(...ys) - 5, yMax = Math.max(...ys) + 10;

    const tc = (wx: number, wy: number) => ({
      cx: pad.l + ((wx - xMin) / (xMax - xMin)) * (W - pad.l - pad.r),
      cy: pad.t + ((yMax - wy) / (yMax - yMin)) * (H - pad.t - pad.b),
    });

    // Grade
    ctx.strokeStyle = "rgba(148,163,184,.12)";
    ctx.lineWidth = 1;
    const xSteps = Math.ceil((xMax - xMin) / 10);
    for (let i = 0; i <= xSteps; i++) {
      const x = xMin + i * 10;
      const { cx } = tc(x, 0);
      ctx.beginPath(); ctx.moveTo(cx, pad.t); ctx.lineTo(cx, H - pad.b); ctx.stroke();
    }

    // Camadas de solo
    const layerTops = [yMax];
    let cumDepth = yMax;
    for (const l of layers) {
      cumDepth -= l.thickness;
      layerTops.push(cumDepth);
    }
    for (let li = 0; li < layers.length; li++) {
      const l = layers[li];
      const yTop = layerTops[li];
      const yBot = layerTops[li + 1] ?? yMin;
      const { cy: cyTop } = tc(xMin, yTop);
      const { cy: cyBot } = tc(xMin, yBot);
      ctx.fillStyle = l.color + "40";
      ctx.fillRect(pad.l, cyTop, W - pad.l - pad.r, cyBot - cyTop);
      ctx.strokeStyle = l.color + "60";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(pad.l, cyBot); ctx.lineTo(W - pad.r, cyBot); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Perfil do talude
    ctx.beginPath();
    for (let i = 0; i < profile.length; i++) {
      const { cx, cy } = tc(profile[i].x, profile[i].y);
      i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
    }
    const { cy: cyBot } = tc(0, yMin - 2);
    ctx.lineTo(tc(xMax, yMin - 2).cx, cyBot);
    ctx.lineTo(tc(xMin, yMin - 2).cx, cyBot);
    ctx.closePath();
    ctx.fillStyle = "#92400e22";
    ctx.fill();
    ctx.strokeStyle = "#92400e";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Nível d'água
    if (waterTable && waterTable.points.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < waterTable.points.length; i++) {
        const { cx, cy } = tc(waterTable.points[i].x, waterTable.points[i].y);
        i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
      }
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Círculo de ruptura
    if (circle) {
      const { cx: ccx, cy: ccy } = tc(circle.cx, circle.cy);
      const scaleX = (W - pad.l - pad.r) / (xMax - xMin);
      const cr = circle.r * scaleX;

      // Fatias
      if (result?.slices) {
        for (const s of result.slices) {
          const { cx: sx1, cy: sy1 } = tc(s.x - s.b / 2, profileY(profile, s.x - s.b / 2));
          const { cx: sx2 } = tc(s.x + s.b / 2, 0);
          ctx.fillStyle = "rgba(239,68,68,.08)";
          ctx.fillRect(sx1, sy1, sx2 - sx1, H - pad.b - sy1);
        }
      }

      // Arco
      ctx.beginPath();
      ctx.arc(ccx, ccy, cr, 0, Math.PI * 2);
      const fsColor = result ? classifyFS(result.fs).color : "#ef4444";
      ctx.strokeStyle = fsColor;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.stroke();

      // Centro
      ctx.beginPath();
      ctx.arc(ccx, ccy, 5, 0, Math.PI * 2);
      ctx.fillStyle = fsColor;
      ctx.fill();

      // FS label
      if (result) {
        ctx.font = "bold 14px sans-serif";
        ctx.fillStyle = fsColor;
        ctx.textAlign = "center";
        ctx.fillText(`FS = ${result.fs.toFixed(2)}`, ccx, ccy - cr - 8);
      }
    }

    // Eixos
    ctx.fillStyle = "#64748b";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    const ySteps = Math.ceil((yMax - yMin) / 5);
    for (let i = 0; i <= ySteps; i++) {
      const y = yMin + i * 5;
      const { cy } = tc(0, y);
      ctx.fillText(y.toFixed(0) + "m", pad.l - 4, cy + 3);
    }
    ctx.textAlign = "center";
    for (let i = 0; i <= Math.ceil((xMax - xMin) / 10); i++) {
      const x = xMin + i * 10;
      const { cx } = tc(x, 0);
      ctx.fillText(x.toFixed(0), cx, H - pad.b + 14);
    }

    // Pontos editáveis
    if (mode === "edit-profile") {
      for (const p of profile) {
        const { cx, cy } = tc(p.x, p.y);
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#f59e0b";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }, [profile, waterTable, circle, layers, result, mode]);

  function profileY(prof: ProfilePoint[], x: number): number {
    for (let i = 0; i < prof.length - 1; i++) {
      if (x >= prof[i].x && x <= prof[i + 1].x) {
        const t = (x - prof[i].x) / (prof[i + 1].x - prof[i].x);
        return prof[i].y + t * (prof[i + 1].y - prof[i].y);
      }
    }
    return x <= prof[0].x ? prof[0].y : prof[prof.length - 1].y;
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cvs.current || mode === "view") return;
    const w = toWorld(e.clientX, e.clientY, cvs.current);

    if (mode === "edit-profile") {
      // Encontra ponto mais próximo
      let minD = Infinity; let idx = -1;
      profile.forEach((p, i) => {
        const d = Math.sqrt((p.x - w.x) ** 2 + (p.y - w.y) ** 2);
        if (d < 2 && d < minD) { minD = d; idx = i; }
      });
      if (idx >= 0) setDrag({ type: "profile-point", idx });
      else {
        // Adiciona ponto
        const newP = [...profile, { x: w.x, y: w.y }];
        newP.sort((a, b) => a.x - b.x);
        onProfileChange(newP);
      }
    } else if (mode === "edit-circle" && circle) {
      const dc = Math.sqrt((w.x - circle.cx) ** 2 + (w.y - circle.cy) ** 2);
      if (Math.abs(dc - circle.r) < 2) setDrag({ type: "circle-radius" });
      else if (dc < 3) setDrag({ type: "circle-center" });
      else onCircleChange({ ...circle, cx: w.x, cy: w.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drag || !cvs.current) return;
    const w = toWorld(e.clientX, e.clientY, cvs.current);
    if (drag.type === "profile-point" && drag.idx !== undefined) {
      const newP = profile.map((p, i) => i === drag.idx ? { x: p.x, y: w.y } : p);
      onProfileChange(newP);
    } else if (drag.type === "circle-center" && circle) {
      onCircleChange({ ...circle, cx: w.x, cy: w.y });
    } else if (drag.type === "circle-radius" && circle) {
      const r = Math.sqrt((w.x - circle.cx) ** 2 + (w.y - circle.cy) ** 2);
      onCircleChange({ ...circle, r });
    }
  };

  return (
    <canvas
      ref={cvs}
      width={900} height={420}
      className="w-full h-full"
      style={{ cursor: mode === "view" ? "default" : "crosshair" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={() => setDrag(null)}
      onMouseLeave={() => setDrag(null)}
    />
  );
}

// ── COMPONENTE PRINCIPAL ───────────────────────────────────────
export function TaludesClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfilePoint[]>(DEFAULT_PROFILE);
  const [layers, setLayers] = useState<SoilLayer[]>(DEFAULT_LAYERS);
  const [waterTable, setWaterTable] = useState<WaterTable | null>(null);
  const [circle, setCircle] = useState<SlipCircle>({ cx: 25, cy: 25, r: 20 });
  const [results, setResults] = useState<Record<string, AnalysisResult>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<"view" | "edit-profile" | "edit-circle">("view");
  const [activeTab, setActiveTab] = useState<"layers" | "circle" | "results">("layers");
  const [searchMethod, setSearchMethod] = useState<"bishop" | "fellenius" | "janbu">("bishop");
  const [cadImport, setCadImport] = useState<{
    projectName: string;
    profileName: string;
    profileKind: "longitudinal" | "transversal";
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importingDwg, setImportingDwg] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingCandidates, setPendingCandidates] = useState<AcadSlopeCandidate[] | null>(null);
  const [pendingFileName, setPendingFileName] = useState("");
  const [dwgImport, setDwgImport] = useState<{
    fileName: string;
    layerName: string;
    entityType: string;
    pointCount: number;
  } | null>(null);

  const applyAcadCandidate = useCallback((candidate: AcadSlopeCandidate, fileName: string) => {
    setProfile(candidate.profile);
    setWaterTable(null);
    setCircle(defaultSlipCircleFromProfile(candidate.profile));
    setResults({});
    setCadImport(null);
    setDwgImport({
      fileName,
      layerName: candidate.layerName,
      entityType: candidate.entityType,
      pointCount: candidate.pointCount,
    });
    setPendingCandidates(null);
    setPendingFileName("");
  }, []);

  const handleDwgFile = useCallback(async (file: File) => {
    setImportingDwg(true);
    setImportError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/taludes/import", { method: "POST", body: form });
      const data = (await res.json()) as AcadSlopeImportResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha na importação.");

      if (data.candidates.length === 1) {
        applyAcadCandidate(data.candidates[0], data.fileName);
        return;
      }

      setPendingCandidates(data.candidates);
      setPendingFileName(data.fileName);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Erro ao importar DWG/DXF.");
    } finally {
      setImportingDwg(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [applyAcadCandidate]);

  useEffect(() => {
    if (searchParams?.get("from") !== "cad") return;

    const payload = loadCadTaludesImport();
    if (!payload) return;

    setProfile(payload.profile);
    if (payload.layers?.length) setLayers(payload.layers);
    setWaterTable(null);
    setCircle(defaultSlipCircleFromProfile(payload.profile));
    setResults({});
    setCadImport({
      projectName: payload.projectName,
      profileName: payload.profileName,
      profileKind: payload.profileKind,
    });
    clearCadTaludesImport();
    router.replace("/taludes", { scroll: false });
  }, [searchParams, router]);

  const runAnalysis = useCallback(async () => {
    setRunning(true);
    setProgress(0);

    await new Promise(r => setTimeout(r, 10));
    const all = analyzeAllMethods(profile, layers, waterTable, circle);
    setResults(all);
    setRunning(false);
    setActiveTab("results");
  }, [profile, layers, waterTable, circle]);

  const findCritical = useCallback(async () => {
    setRunning(true);
    setProgress(0);

    const xs = profile.map(p => p.x);
    const ys = profile.map(p => p.y);
    const xCenter = (Math.min(...xs) + Math.max(...xs)) / 2;
    const yTop = Math.max(...ys);

    const config: SearchConfig = {
      method: searchMethod,
      xMin: xCenter - 15, xMax: xCenter + 15,
      yMin: yTop + 5, yMax: yTop + 30,
      rMin: 10, rMax: 40,
      nPoints: 8,
    };

    await new Promise(r => setTimeout(r, 10));
    const res = findCriticalCircle(profile, layers, waterTable, config, setProgress);
    setCircle(res.circle);
    setResults({ [searchMethod]: res });
    setRunning(false);
    setActiveTab("results");
  }, [profile, layers, waterTable, searchMethod]);

  const addLayer = () => {
    const id = Date.now().toString();
    setLayers(prev => [...prev, {
      id, name: "Nova camada", color: SOIL_COLORS[prev.length % SOIL_COLORS.length],
      c: 10, phi: 30, gamma: 18, gammaSat: 19, thickness: 5,
    }]);
  };

  const updateLayer = (id: string, field: keyof SoilLayer, value: string | number) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const removeLayer = (id: string) => setLayers(prev => prev.filter(l => l.id !== id));

  const bishop = results.bishop;
  const criticalResult = Object.values(results).find(r => r.critical) ?? bishop;

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg)]">
      {cadImport ? (
        <div className="flex items-center justify-between gap-3 px-4 py-1.5 border-b border-emerald-500/30 bg-emerald-500/10 flex-shrink-0">
          <p className="text-[.65rem] text-emerald-800">
            Perfil importado do CAD: <strong>{cadImport.profileName}</strong>
            {" · "}
            {cadImport.projectName}
            {" · "}
            {cadImport.profileKind === "transversal" ? "seção transversal" : "seção longitudinal"}
            {" — ajuste camadas geotécnicas e calcule o FS."}
          </p>
          <button
            type="button"
            onClick={() => setCadImport(null)}
            className="text-emerald-700 hover:text-emerald-900 text-sm leading-none"
            aria-label="Fechar aviso"
          >
            ×
          </button>
        </div>
      ) : null}
      {dwgImport ? (
        <div className="flex items-center justify-between gap-3 px-4 py-1.5 border-b border-sky-500/30 bg-sky-500/10 flex-shrink-0">
          <p className="text-[.65rem] text-sky-900">
            Perfil importado de <strong>{dwgImport.fileName}</strong>
            {" · camada "}
            <strong>{dwgImport.layerName}</strong>
            {" · "}
            {dwgImport.pointCount} pontos ({dwgImport.entityType})
            {" — ajuste camadas geotécnicas e calcule o FS."}
          </p>
          <button
            type="button"
            onClick={() => setDwgImport(null)}
            className="text-sky-800 hover:text-sky-950 text-sm leading-none"
            aria-label="Fechar aviso"
          >
            ×
          </button>
        </div>
      ) : null}
      {importError ? (
        <div className="flex items-center justify-between gap-3 px-4 py-1.5 border-b border-red-500/30 bg-red-500/10 flex-shrink-0">
          <p className="text-[.65rem] text-red-800">{importError}</p>
          <button
            type="button"
            onClick={() => setImportError(null)}
            className="text-red-700 hover:text-red-900 text-sm leading-none"
            aria-label="Fechar erro"
          >
            ×
          </button>
        </div>
      ) : null}
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--b1)] bg-[var(--surf)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[var(--tx)]">⛰ Estabilidade de Taludes</span>
          <div className="flex gap-1">
            {(["view","edit-profile","edit-circle"] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-2 py-0.5 rounded text-[.6rem] font-semibold transition-colors ${
                  mode === m ? "bg-[var(--bl)] text-white" : "bg-[var(--card)] text-[var(--mu)] hover:text-[var(--tx)]"
                }`}>
                {m === "view" ? "👁 Ver" : m === "edit-profile" ? "✏ Perfil" : "○ Círculo"}
              </button>
            ))}
          </div>
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
            title="Importar perfil de talude de arquivo AutoCAD (.dwg ou .dxf)"
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
            {(["layers","circle","results"] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`flex-1 py-1.5 text-[.58rem] font-bold tracking-widest uppercase transition-colors ${
                  activeTab === t ? "text-[var(--bl)] border-b-2 border-[var(--bl)]" : "text-[var(--mu)] hover:text-[var(--tx)]"
                }`}>
                {t === "layers" ? "Camadas" : t === "circle" ? "Círculo" : "Resultados"}
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

                {/* Nível d'água */}
                <div className="border-t border-[var(--b1)] pt-2 mt-2">
                  <div className="text-[.55rem] font-bold text-[var(--mu)] uppercase tracking-widest mb-1.5">Nível d'água</div>
                  <div className="trow flex items-center justify-between">
                    <span className="text-[.62rem] text-[var(--mu)]">Ativar NA</span>
                    <label className="relative inline-flex cursor-pointer">
                      <input type="checkbox" checked={!!waterTable}
                        onChange={e => setWaterTable(e.target.checked ? {
                          points: profile.map(p => ({ x: p.x, y: p.y - 2 }))
                        } : null)}
                        className="sr-only peer" />
                      <div className="w-7 h-4 bg-[var(--b1)] peer-checked:bg-[var(--bl)] rounded-full transition-colors" />
                      <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full transition-all peer-checked:translate-x-3" />
                    </label>
                  </div>
                  {waterTable && (
                    <div className="mt-1 text-[.6rem] text-[var(--bl)]">
                      NA ativo — arraste os pontos no canvas (modo editar perfil)
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CÍRCULO */}
            {activeTab === "circle" && (
              <div className="p-2 space-y-2">
                <div className="text-[.55rem] font-bold text-[var(--mu)] uppercase tracking-widest mb-1">Parâmetros do círculo</div>
                {[
                  { label: "Centro X (m)", key: "cx" as const },
                  { label: "Centro Y (m)", key: "cy" as const },
                  { label: "Raio (m)", key: "r" as const },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <div className="text-[.58rem] text-[var(--mu)] mb-0.5">{label}</div>
                    <input type="number" step="0.5" value={circle[key].toFixed(1)}
                      onChange={e => setCircle(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                      className="w-full text-[.7rem] bg-[var(--card)] border border-[var(--b1)] rounded px-2 py-1 text-[var(--tx)]" />
                  </div>
                ))}
                <div className="text-[.58rem] text-[var(--mu)] mt-2">
                  💡 Clique e arraste no canvas (modo ○ Círculo) para ajustar visualmente
                </div>
              </div>
            )}

            {/* RESULTADOS */}
            {activeTab === "results" && (
              <div className="p-2 space-y-2">
                {Object.keys(results).length === 0 ? (
                  <div className="text-[.65rem] text-[var(--mu)] text-center py-4">
                    Clique em "Calcular FS" para ver os resultados
                  </div>
                ) : (
                  <>
                    {Object.entries(results).map(([key, res]) => {
                      const cls = classifyFS(res.fs);
                      return (
                        <div key={key} className="bg-[var(--card)] rounded border border-[var(--b1)] p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[.62rem] font-semibold text-[var(--tx)]">{res.method}</span>
                            <span className="text-[.55rem] px-1.5 py-0.5 rounded font-bold"
                              style={{ background: cls.color + "22", color: cls.color }}>
                              {cls.label}
                            </span>
                          </div>
                          <div className="text-2xl font-bold" style={{ color: cls.color }}>
                            {res.fs.toFixed(3)}
                          </div>
                          <div className="text-[.55rem] text-[var(--mu)] mt-0.5">
                            {res.slices.length} fatias · {res.iterations} iterações
                            {res.converged ? " · convergiu" : " · não convergiu"}
                          </div>
                        </div>
                      );
                    })}

                    {/* Critérios normativos */}
                    <div className="border-t border-[var(--b1)] pt-2 mt-1">
                      <div className="text-[.55rem] font-bold text-[var(--mu)] uppercase tracking-widest mb-1.5">
                        Critérios ABNT NBR 11682
                      </div>
                      {[
                        { label: "Obras definitivas", min: 1.5, color: "#22c55e" },
                        { label: "Obras temporárias", min: 1.3, color: "#eab308" },
                        { label: "Crítico", min: 1.1, color: "#ef4444" },
                      ].map(({ label, min, color }) => {
                        const fs = bishop?.fs ?? 1;
                        const ok = fs >= min;
                        return (
                          <div key={label} className="flex items-center justify-between py-0.5">
                            <span className="text-[.6rem] text-[var(--mu)]">{label} (FS ≥ {min})</span>
                            <span className="text-[.6rem] font-bold" style={{ color: ok ? "#22c55e" : "#ef4444" }}>
                              {ok ? "✔ OK" : "✗ NÃO"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 min-w-0 bg-[var(--bg)] relative">
          <SlopeCanvas
            profile={profile}
            waterTable={waterTable}
            circle={circle}
            layers={layers}
            result={criticalResult ?? null}
            onProfileChange={setProfile}
            onCircleChange={setCircle}
            mode={mode}
          />
          {/* FS badge */}
          {criticalResult && (
            <div className="absolute top-3 right-3 px-3 py-1.5 rounded bg-[var(--card)] border border-[var(--b1)] text-center">
              <div className="text-[.5rem] text-[var(--mu)] uppercase tracking-widest">FS Bishop</div>
              <div className="text-xl font-bold" style={{ color: classifyFS(criticalResult.fs).color }}>
                {criticalResult.fs.toFixed(2)}
              </div>
              <div className="text-[.55rem]" style={{ color: classifyFS(criticalResult.fs).color }}>
                {classifyFS(criticalResult.fs).label}
              </div>
            </div>
          )}
        </div>
      </div>

      {pendingCandidates && pendingCandidates.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-[var(--b1)] bg-[var(--surf)] shadow-xl">
            <div className="border-b border-[var(--b1)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--tx)]">Selecionar perfil do desenho</h3>
              <p className="mt-1 text-[.65rem] text-[var(--mu)]">
                {pendingFileName} — escolha a polilinha que representa a superfície do talude.
              </p>
            </div>
            <ul className="max-h-80 overflow-y-auto divide-y divide-[var(--b1)]">
              {pendingCandidates.map((candidate, index) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => applyAcadCandidate(candidate, pendingFileName)}
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
                onClick={() => {
                  setPendingCandidates(null);
                  setPendingFileName("");
                }}
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
