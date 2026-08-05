import { prisma } from "@/lib/prisma";
import { requireObraAccessFromRequest } from "@/lib/obra-access";
import {
  initialInsarJobQueuedProperties,
  kickInsarPipelineJob,
} from "@/services/insar";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function parseObraId(idStr: string): number | null {
  const id = Number(idStr);
  return Number.isFinite(id) ? id : null;
}

function serializeRaster(r: {
  id: number;
  jobId: number;
  rasterKind: string;
  epochDate: Date | null;
  relativePath: string;
  fileSizeBytes: bigint | null;
  crsEpsg: number | null;
  width: number | null;
  height: number | null;
  minValue: number | null;
  maxValue: number | null;
  meanValue: number | null;
  nodataValue: number | null;
  units: string;
  footprintGeoJson: unknown;
  metadata: unknown;
  createdAt: Date;
}) {
  return {
    ...r,
    fileSizeBytes: r.fileSizeBytes?.toString() ?? null,
  };
}

function serializeJob(
  job: {
    id: number;
    obraId: number;
    name: string;
    status: string;
    dateFrom: Date;
    dateTo: Date;
    referenceDate: Date | null;
    orbitDirection: string | null;
    aoiWkt: string | null;
    masterCopernicusId: string | null;
    slaveCopernicusId: string | null;
    sceneCount: number;
    errorMessage: string | null;
    properties: unknown;
    createdAt: Date;
    updatedAt: Date;
    rasters?: Array<Parameters<typeof serializeRaster>[0]>;
  },
  opts?: { includeRasters?: boolean },
) {
  const base = {
    id: job.id,
    obraId: job.obraId,
    name: job.name,
    status: job.status,
    dateFrom: job.dateFrom.toISOString(),
    dateTo: job.dateTo.toISOString(),
    referenceDate: job.referenceDate?.toISOString() ?? null,
    orbitDirection: job.orbitDirection,
    aoiWkt: job.aoiWkt,
    masterCopernicusId: job.masterCopernicusId,
    slaveCopernicusId: job.slaveCopernicusId,
    sceneCount: job.sceneCount,
    errorMessage: job.errorMessage,
    properties: job.properties,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
  if (opts?.includeRasters && job.rasters) {
    return {
      ...base,
      rasters: job.rasters.map(serializeRaster),
    };
  }
  return base;
}

export async function GET(req: Request, ctx: Ctx) {
  const obraId = parseObraId((await ctx.params).id);
  if (obraId === null) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
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
      obraId: true,
      name: true,
      status: true,
      dateFrom: true,
      dateTo: true,
      referenceDate: true,
      orbitDirection: true,
      aoiWkt: true,
      masterCopernicusId: true,
      slaveCopernicusId: true,
      sceneCount: true,
      errorMessage: true,
      properties: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    jobs: jobs.map((j: (typeof jobs)[number]) => serializeJob(j)),
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const obraId = parseObraId((await ctx.params).id);
  if (obraId === null) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
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

  const dateFrom =
    typeof body.dateFrom === "string" ? new Date(body.dateFrom) : null;
  const dateTo =
    typeof body.dateTo === "string" ? new Date(body.dateTo) : null;

  if (!dateFrom || Number.isNaN(dateFrom.getTime())) {
    return NextResponse.json({ error: "dateFrom inválido (ISO 8601)" }, { status: 400 });
  }
  if (!dateTo || Number.isNaN(dateTo.getTime())) {
    return NextResponse.json({ error: "dateTo inválido (ISO 8601)" }, { status: 400 });
  }
  if (dateFrom > dateTo) {
    return NextResponse.json(
      { error: "dateFrom não pode ser posterior a dateTo" },
      { status: 400 },
    );
  }

  const referenceDate =
    typeof body.referenceDate === "string"
      ? new Date(body.referenceDate)
      : null;
  if (
    body.referenceDate !== undefined &&
    body.referenceDate !== null &&
    referenceDate &&
    Number.isNaN(referenceDate.getTime())
  ) {
    return NextResponse.json({ error: "referenceDate inválido" }, { status: 400 });
  }

  const orbitRaw = body.orbitDirection;
  let orbitDirection: string | null = null;
  if (orbitRaw === "ASC" || orbitRaw === "DESC") {
    orbitDirection = orbitRaw;
  } else if (
    orbitRaw !== undefined &&
    orbitRaw !== null &&
    orbitRaw !== ""
  ) {
    return NextResponse.json(
      { error: "orbitDirection deve ser ASC ou DESC" },
      { status: 400 },
    );
  }

  const aoiWkt =
    typeof body.aoiWkt === "string" && body.aoiWkt.trim()
      ? body.aoiWkt.trim()
      : null;

  const masterCopernicusId =
    typeof body.masterCopernicusId === "string" && body.masterCopernicusId.trim()
      ? body.masterCopernicusId.trim()
      : null;
  const slaveCopernicusId =
    typeof body.slaveCopernicusId === "string" && body.slaveCopernicusId.trim()
      ? body.slaveCopernicusId.trim()
      : null;

  const runImmediately = body.runImmediately !== false;

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
      obraId: true,
      name: true,
      status: true,
      dateFrom: true,
      dateTo: true,
      referenceDate: true,
      orbitDirection: true,
      aoiWkt: true,
      masterCopernicusId: true,
      slaveCopernicusId: true,
      sceneCount: true,
      errorMessage: true,
      properties: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (runImmediately) {
    kickInsarPipelineJob(job.id, req);
  }

  return NextResponse.json(
    {
      job: serializeJob(job),
      scheduled: runImmediately,
    },
    { status: 201 },
  );
}
