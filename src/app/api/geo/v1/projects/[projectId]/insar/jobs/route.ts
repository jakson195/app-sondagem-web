import { prisma } from "@/lib/prisma";
import { requireObraAccessFromRequest } from "@/lib/obra-access";
import { geoJsonPolygonToWkt } from "@/lib/geojson-polygon-wkt";
import { obraIdFromGeoProjectId } from "@/lib/geo-project-map";
import {
  initialInsarJobQueuedProperties,
  kickInsarPipelineJob,
} from "@/services/insar";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

function asFlatInsarJob(
  projectId: string,
  job: {
    id: number;
    name: string;
    status: string;
    dateFrom: Date;
    dateTo: Date;
    sceneCount: number;
    properties: unknown;
  },
) {
  const props =
    job.properties && typeof job.properties === "object"
      ? (job.properties as Record<string, unknown>)
      : {};
  return {
    id: String(job.id),
    project_id: projectId,
    name: job.name,
    status: job.status,
    date_from: job.dateFrom.toISOString(),
    date_to: job.dateTo.toISOString(),
    scene_count: job.sceneCount,
    properties: props,
  };
}

export async function GET(req: Request, ctx: Ctx) {
  const { projectId } = await ctx.params;
  const obraId = obraIdFromGeoProjectId(projectId);
  if (obraId === null) {
    return NextResponse.json({ error: "Projeto inválido" }, { status: 400 });
  }

  const obra = await prisma.obra.findUnique({
    where: { id: obraId },
    select: { id: true, companyId: true, createdByUserId: true },
  });
  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  const access = await requireObraAccessFromRequest(req, obra);
  if (!access.ok) return access.response;

  const jobs = await prisma.insarPipelineJob.findMany({
    where: { obraId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      dateFrom: true,
      dateTo: true,
      sceneCount: true,
      properties: true,
    },
  });

  return NextResponse.json({
    items: jobs.map((j) => asFlatInsarJob(projectId, j)),
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const { projectId } = await ctx.params;
  const obraId = obraIdFromGeoProjectId(projectId);
  if (obraId === null) {
    return NextResponse.json({ error: "Projeto inválido" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const obra = await prisma.obra.findUnique({
    where: { id: obraId },
    select: { id: true, companyId: true, createdByUserId: true },
  });
  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  const access = await requireObraAccessFromRequest(req, obra, { write: true });
  if (!access.ok) return access.response;

  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : "InSAR";

  const dateFromRaw = body.date_from ?? body.dateFrom;
  const dateToRaw = body.date_to ?? body.dateTo;
  const dateFrom =
    typeof dateFromRaw === "string" ? new Date(dateFromRaw) : null;
  const dateTo = typeof dateToRaw === "string" ? new Date(dateToRaw) : null;

  if (!dateFrom || Number.isNaN(dateFrom.getTime())) {
    return NextResponse.json({ error: "date_from inválido (ISO 8601)" }, { status: 400 });
  }
  if (!dateTo || Number.isNaN(dateTo.getTime())) {
    return NextResponse.json({ error: "date_to inválido (ISO 8601)" }, { status: 400 });
  }
  if (dateFrom > dateTo) {
    return NextResponse.json(
      { error: "date_from não pode ser posterior a date_to" },
      { status: 400 },
    );
  }

  const refRaw = body.reference_date ?? body.referenceDate;
  const referenceDate =
    typeof refRaw === "string" ? new Date(refRaw) : null;
  if (
    refRaw !== undefined &&
    refRaw !== null &&
    refRaw !== "" &&
    referenceDate &&
    Number.isNaN(referenceDate.getTime())
  ) {
    return NextResponse.json({ error: "reference_date inválido" }, { status: 400 });
  }

  const orbitRaw = body.orbit_direction ?? body.orbitDirection;
  let orbitDirection: string | null = null;
  if (orbitRaw === "ASC" || orbitRaw === "DESC") {
    orbitDirection = orbitRaw;
  } else if (
    orbitRaw !== undefined &&
    orbitRaw !== null &&
    orbitRaw !== ""
  ) {
    return NextResponse.json(
      { error: "orbit_direction deve ser ASC ou DESC" },
      { status: 400 },
    );
  }

  let aoiWkt: string | null = null;
  if (typeof body.aoiWkt === "string" && body.aoiWkt.trim()) {
    aoiWkt = body.aoiWkt.trim();
  } else if (body.aoi_geojson != null) {
    aoiWkt = geoJsonPolygonToWkt(body.aoi_geojson);
  }

  const masterCopernicusId =
    typeof body.masterCopernicusId === "string" && body.masterCopernicusId.trim()
      ? body.masterCopernicusId.trim()
      : null;
  const slaveCopernicusId =
    typeof body.slaveCopernicusId === "string" && body.slaveCopernicusId.trim()
      ? body.slaveCopernicusId.trim()
      : null;

  const runRaw = body.run_immediately ?? body.runImmediately;
  const runImmediately = runRaw !== false;

  const job = await prisma.insarPipelineJob.create({
    data: {
      obraId,
      name,
      dateFrom,
      dateTo,
      referenceDate:
        referenceDate && !Number.isNaN(referenceDate.getTime())
          ? referenceDate
          : null,
      orbitDirection,
      aoiWkt,
      masterCopernicusId,
      slaveCopernicusId,
      properties: initialInsarJobQueuedProperties(),
    },
    select: {
      id: true,
      name: true,
      status: true,
      dateFrom: true,
      dateTo: true,
      sceneCount: true,
      properties: true,
    },
  });

  if (runImmediately) {
    kickInsarPipelineJob(job.id, req);
  }

  return NextResponse.json(asFlatInsarJob(projectId, job), { status: 201 });
}
