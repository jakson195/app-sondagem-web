import type { AnalysisResult, SurveyRecord } from "./types";

const BASE =
  typeof window !== "undefined"
    ? "/api/taludes"
    : process.env.TALUDES_API_URL ?? "http://localhost:8010";

function taludesUrl(path: string): string {
  if (path.startsWith("http")) return path;
  const base = BASE.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

const TALUDES_API_HINT =
  "API Taludes indisponível. Noutro terminal execute: cd app-web && npm run taludes:api";

async function taludesFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("network")) {
      throw new Error(TALUDES_API_HINT);
    }
    throw err;
  }
}

async function parseTaludesError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; detail?: string };
    return data.error ?? data.detail ?? fallback;
  } catch {
    return res.status === 502 ? TALUDES_API_HINT : fallback;
  }
}

export async function listSurveys(projectId = "default"): Promise<SurveyRecord[]> {
  const res = await taludesFetch(taludesUrl(`/surveys?project_id=${projectId}`));
  if (!res.ok) throw new Error(await parseTaludesError(res, "Falha ao listar levantamentos"));
  const data = (await res.json()) as { surveys: SurveyRecord[] };
  return data.surveys ?? [];
}

export async function uploadSurvey(
  file: File,
  opts: {
    label?: string;
    projectId?: string;
    capturedAt?: string;
    kind?: "ortho" | "dsm";
  },
): Promise<SurveyRecord> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("label", opts.label ?? file.name);
  fd.append("project_id", opts.projectId ?? "default");
  fd.append("captured_at", opts.capturedAt ?? new Date().toISOString());
  fd.append("kind", opts.kind ?? "ortho");
  const res = await taludesFetch(taludesUrl("/surveys/upload"), { method: "POST", body: fd });
  if (!res.ok) {
    throw new Error(await parseTaludesError(res, "Upload falhou"));
  }
  return res.json() as Promise<SurveyRecord>;
}

export async function runCompare(body: {
  survey_t0_id: string;
  survey_t1_id: string;
  project_id?: string;
  dsm_t0_id?: string;
  dsm_t1_id?: string;
  threshold?: number;
  enable_optical_flow?: boolean;
  enable_dsm_diff?: boolean;
  enable_segmentation?: boolean;
}): Promise<AnalysisResult> {
  const res = await taludesFetch(taludesUrl("/analysis/compare"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await parseTaludesError(res, "Análise falhou"));
  }
  const raw = await res.json();
  return normalizeAnalysis(raw);
}

export async function getJob(jobId: string): Promise<AnalysisResult> {
  const res = await taludesFetch(taludesUrl(`/analysis/jobs/${jobId}`));
  if (!res.ok) throw new Error(await parseTaludesError(res, "Job não encontrado"));
  return normalizeAnalysis(await res.json());
}

function normalizeAnalysis(raw: Record<string, unknown>): AnalysisResult {
  const jobId = String(raw.job_id ?? "");
  const heatmapPath = String(raw.heatmap_url ?? `/outputs/${jobId}/heatmap.png`);
  return {
    job_id: jobId,
    ok: Boolean(raw.ok),
    bounds: (raw.bounds as [number, number, number, number]) ?? [-47.9, -15.8, -47.8, -15.7],
    point_count: Number(raw.point_count ?? 0),
    vector_count: Number(raw.vector_count ?? 0),
    polygon_count: Number(raw.polygon_count ?? 0),
    risk_summary: (raw.risk_summary as AnalysisResult["risk_summary"]) ?? {
      baixo: 0,
      medio: 0,
      alto: 0,
    },
    overall_risk: (raw.overall_risk as AnalysisResult["overall_risk"]) ?? "baixo",
    overall_score: Number(raw.overall_score ?? 0),
    change_area_pct: Number(raw.change_area_pct ?? 0),
    max_displacement_px: Number(raw.max_displacement_px ?? 0),
    segmentation_method: raw.segmentation_method as string | undefined,
    heatmap_url: taludesUrl(heatmapPath),
    points_geojson: (raw.points_geojson ?? { type: "FeatureCollection", features: [] }) as AnalysisResult["points_geojson"],
    vectors_geojson: (raw.vectors_geojson ?? { type: "FeatureCollection", features: [] }) as AnalysisResult["vectors_geojson"],
    segmentation_geojson: (raw.segmentation_geojson ?? { type: "FeatureCollection", features: [] }) as AnalysisResult["segmentation_geojson"],
    outputs: raw.outputs as Record<string, string> | undefined,
  };
}

export function exportUrl(jobId: string, file: string): string {
  return taludesUrl(`/outputs/${jobId}/exports/${file}`);
}
