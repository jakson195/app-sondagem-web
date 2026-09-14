"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Box,
  Download,
  Layers,
  Map,
  Mountain,
  Upload,
} from "lucide-react";
import {
  exportUrl,
  listSurveys,
  runCompare,
  uploadSurvey,
} from "@/lib/taludes/api";
import { isSupportedRasterFile, RASTER_FILE_ACCEPT, RASTER_FORMAT_HINT } from "@/lib/taludes/raster-formats";
import { riskBgClass, riskLabel } from "@/lib/taludes/risk";
import type { AnalysisResult, SurveyRecord, TemporalDashboardPoint } from "@/lib/taludes/types";

const TaludeMapboxPanel = dynamic(
  () =>
    import("./talude-mapbox-panel").then((m) => ({ default: m.TaludeMapboxPanel })),
  { ssr: false, loading: () => <MapSkeleton label="Mapa 2D…" /> },
);

const TaludeCesiumPanel = dynamic(
  () =>
    import("./talude-cesium-panel").then((m) => ({ default: m.TaludeCesiumPanel })),
  { ssr: false, loading: () => <MapSkeleton label="Cesium 3D…" /> },
);

function MapSkeleton({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[420px] items-center justify-center rounded-xl border border-slate-700 bg-slate-950/60 text-sm text-slate-400">
      {label}
    </div>
  );
}

type ViewMode = "2d" | "3d";

export function TaludeMonitoringApp() {
  const [surveys, setSurveys] = useState<SurveyRecord[]>([]);
  const [t0Id, setT0Id] = useState("");
  const [t1Id, setT1Id] = useState("");
  const [dsmT0, setDsmT0] = useState("");
  const [dsmT1, setDsmT1] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("2d");
  const [layers, setLayers] = useState({
    heatmap: true,
    vectors: true,
    polygons: true,
  });
  const [history, setHistory] = useState<TemporalDashboardPoint[]>([]);

  const refresh = useCallback(async () => {
    try {
      const list = await listSurveys();
      setSurveys(list);
      const ortho = list.filter((s) => s.kind === "ortho");
      if (!t0Id && ortho.length >= 2) {
        setT0Id(ortho[ortho.length - 2]!.id);
        setT1Id(ortho[ortho.length - 1]!.id);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "API indisponível");
    }
  }, [t0Id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const orthoSurveys = useMemo(
    () => surveys.filter((s) => s.kind === "ortho").sort((a, b) => a.captured_at.localeCompare(b.captured_at)),
    [surveys],
  );
  const dsmSurveys = useMemo(() => surveys.filter((s) => s.kind === "dsm"), [surveys]);

  const onUpload = async (file: File, kind: "ortho" | "dsm") => {
    if (!isSupportedRasterFile(file)) {
      setMsg(`Formato não suportado. Use ${RASTER_FORMAT_HINT}.`);
      return;
    }
    const isEcw = file.name.toLowerCase().endsWith(".ecw");
    setLoading(true);
    setMsg(isEcw ? "A processar ECW (pode demorar vários minutos)…" : null);
    try {
      await uploadSurvey(file, { kind, label: file.name });
      await refresh();
      setMsg(`${kind === "ortho" ? "Ortofoto" : "DSM"} carregado: ${file.name}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Upload falhou");
    } finally {
      setLoading(false);
    }
  };

  const onAnalyze = async () => {
    if (!t0Id || !t1Id) {
      setMsg("Selecione duas ortofotos (T0 e T1).");
      return;
    }
    setLoading(true);
    setMsg("A processar análise (ECW grande pode demorar na 1.ª vez)…");
    try {
      const res = await runCompare({
        survey_t0_id: t0Id,
        survey_t1_id: t1Id,
        dsm_t0_id: dsmT0 || undefined,
        dsm_t1_id: dsmT1 || undefined,
        enable_optical_flow: true,
        enable_dsm_diff: Boolean(dsmT0 && dsmT1),
        enable_segmentation: true,
      });
      setResult(res);
      const t1 = orthoSurveys.find((s) => s.id === t1Id);
      setHistory((h) => [
        ...h,
        {
          date: t1?.captured_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
          label: t1?.label ?? "T1",
          risk_score: res.overall_score,
          risk_level: res.overall_risk,
          change_area_pct: res.change_area_pct,
        },
      ]);
      setMsg(`Análise concluída — ${res.point_count} pontos · risco ${riskLabel(res.overall_risk)}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Análise falhou");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-stone-950 text-slate-100">
      <header className="border-b border-amber-500/20 bg-slate-950/90 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-500/90">
              DataGeo · Geotecnia · Mineração
            </p>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              Monitoramento temporal de taludes
            </h1>
            <p className="mt-0.5 text-xs text-slate-400">
              Ortofotos drone · Optical Flow · DSM · segmentação IA · previsão de
              deslizamento
            </p>
          </div>
          <div
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              result ? riskBgClass(result.overall_risk) : "border-slate-600 text-slate-400"
            }`}
          >
            {result ? (
              <>
                <AlertTriangle className="mr-1 inline h-4 w-4" />
                Risco global: {riskLabel(result.overall_risk)} ({(result.overall_score * 100).toFixed(0)}%)
              </>
            ) : (
              "Aguardando análise"
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-3 overflow-y-auto lg:max-h-[calc(100vh-120px)]">
          <section className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-400">
              <Upload className="h-4 w-4" />
              Upload raster (TIFF / ECW)
            </h2>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              GeoTIFF (.tif) ou ECW (.ecw). ECW é processado automaticamente no servidor (sem driver GDAL).
            </p>
            <div className="mt-3 grid gap-2">
              <label className="cursor-pointer rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-3 text-center text-xs hover:bg-amber-500/10">
                Ortofoto ({RASTER_FORMAT_HINT})
                <input
                  type="file"
                  accept={RASTER_FILE_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onUpload(f, "ortho");
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <label className="cursor-pointer rounded-lg border border-dashed border-sky-500/40 bg-sky-500/5 px-3 py-3 text-center text-xs hover:bg-sky-500/10">
                DSM ({RASTER_FORMAT_HINT}) — opcional
                <input
                  type="file"
                  accept={RASTER_FILE_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onUpload(f, "dsm");
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-4">
            <h2 className="text-sm font-semibold text-slate-200">Comparação temporal</h2>
            <div className="mt-2 space-y-2 text-xs">
              <label className="block">
                T0 (referência)
                <select
                  value={t0Id}
                  onChange={(e) => setT0Id(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5"
                >
                  <option value="">—</option>
                  {orthoSurveys.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label} ({s.captured_at.slice(0, 10)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                T1 (atual)
                <select
                  value={t1Id}
                  onChange={(e) => setT1Id(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5"
                >
                  <option value="">—</option>
                  {orthoSurveys.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label} ({s.captured_at.slice(0, 10)})
                    </option>
                  ))}
                </select>
              </label>
              {dsmSurveys.length > 0 && (
                <>
                  <label className="block">
                    DSM T0
                    <select
                      value={dsmT0}
                      onChange={(e) => setDsmT0(e.target.value)}
                      className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1"
                    >
                      <option value="">—</option>
                      {dsmSurveys.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    DSM T1
                    <select
                      value={dsmT1}
                      onChange={(e) => setDsmT1(e.target.value)}
                      className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1"
                    >
                      <option value="">—</option>
                      {dsmSurveys.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => void onAnalyze()}
              className="mt-3 w-full rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-500 disabled:opacity-50"
            >
              {loading ? "A processar…" : "Executar análise completa"}
            </button>
          </section>

          {result && (
            <section className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-4 text-xs">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Activity className="h-4 w-4 text-emerald-400" />
                Métricas
              </h2>
              <ul className="mt-2 space-y-1 text-slate-300">
                <li>Área alterada: {result.change_area_pct.toFixed(1)}%</li>
                <li>Desloc. máx. (px): {result.max_displacement_px.toFixed(2)}</li>
                <li>Pontos: {result.point_count} · Vetores: {result.vector_count}</li>
                <li>
                  Risco: baixo {result.risk_summary.baixo} · médio{" "}
                  {result.risk_summary.medio} · alto {result.risk_summary.alto}
                </li>
                <li>IA segmentação: {result.segmentation_method ?? "—"}</li>
              </ul>
              <div className="mt-3 flex flex-wrap gap-1">
                <a
                  href={exportUrl(result.job_id, "points.geojson")}
                  className="inline-flex items-center gap-1 rounded border border-slate-600 px-2 py-1 hover:bg-slate-800"
                >
                  <Download className="h-3 w-3" /> GeoJSON
                </a>
                <a
                  href={exportUrl(result.job_id, "risk_heatmap.tif")}
                  className="inline-flex items-center gap-1 rounded border border-slate-600 px-2 py-1 hover:bg-slate-800"
                >
                  <Download className="h-3 w-3" /> GeoTIFF
                </a>
                <a
                  href={exportUrl(result.job_id, "surface.las")}
                  className="inline-flex items-center gap-1 rounded border border-slate-600 px-2 py-1 hover:bg-slate-800"
                >
                  <Download className="h-3 w-3" /> LAS
                </a>
                <a
                  href={exportUrl(result.job_id, "surface.obj")}
                  className="inline-flex items-center gap-1 rounded border border-slate-600 px-2 py-1 hover:bg-slate-800"
                >
                  <Download className="h-3 w-3" /> OBJ
                </a>
              </div>
            </section>
          )}

          {history.length > 0 && (
            <section className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-4">
              <h2 className="text-sm font-semibold">Dashboard temporal</h2>
              <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs">
                {history.map((h, i) => (
                  <li
                    key={i}
                    className={`rounded px-2 py-1 ${riskBgClass(h.risk_level)}`}
                  >
                    {h.date} · {h.label} · {(h.risk_score * 100).toFixed(0)}% ·{" "}
                    {h.change_area_pct.toFixed(1)}% área
                  </li>
                ))}
              </ul>
            </section>
          )}

          {msg && (
            <p className="rounded-lg border border-slate-600 bg-slate-950/80 px-3 py-2 text-xs text-slate-300">
              {msg}
            </p>
          )}
        </aside>

        <main className="flex min-h-[520px] flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setView("2d")}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm ${
                view === "2d" ? "bg-amber-600 text-slate-950" : "bg-slate-800 text-slate-300"
              }`}
            >
              <Map className="h-4 w-4" /> Mapa 2D
            </button>
            <button
              type="button"
              onClick={() => setView("3d")}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm ${
                view === "3d" ? "bg-amber-600 text-slate-950" : "bg-slate-800 text-slate-300"
              }`}
            >
              <Box className="h-4 w-4" /> Cesium 3D
            </button>
            <span className="mx-2 h-5 w-px bg-slate-600" />
            <label className="flex items-center gap-1 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={layers.heatmap}
                onChange={(e) => setLayers((l) => ({ ...l, heatmap: e.target.checked }))}
              />
              Heatmap
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={layers.vectors}
                onChange={(e) => setLayers((l) => ({ ...l, vectors: e.target.checked }))}
              />
              Fluxo
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={layers.polygons}
                onChange={(e) => setLayers((l) => ({ ...l, polygons: e.target.checked }))}
              />
              Instabilidade
            </label>
          </div>

          <div className="relative min-h-0 flex-1">
            {view === "2d" ? (
              <TaludeMapboxPanel
                heatmapUrl={result?.heatmap_url}
                bounds={result?.bounds}
                points={result?.points_geojson}
                vectors={result?.vectors_geojson}
                segmentation={result?.segmentation_geojson}
                showHeatmap={layers.heatmap}
                showVectors={layers.vectors}
                showPolygons={layers.polygons}
              />
            ) : (
              <TaludeCesiumPanel
                bounds={result?.bounds}
                points={result?.points_geojson}
                heatmapUrl={layers.heatmap ? result?.heatmap_url : null}
              />
            )}
          </div>

          <div className="grid gap-2 rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 text-[10px] text-slate-500 sm:grid-cols-5">
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" /> Reprojeção + ECC
            </span>
            <span className="flex items-center gap-1">
              <Mountain className="h-3 w-3" /> Optical Flow Farneback
            </span>
            <span>DSM difference</span>
            <span>Segmentação IA / CV</span>
            <span>Classificação risco</span>
          </div>
        </main>
      </div>
    </div>
  );
}
