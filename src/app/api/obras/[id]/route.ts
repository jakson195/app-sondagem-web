import type { ObraStatus, Prisma } from "@prisma/client";
import type { Polygon } from "geojson";
import { nextResponseDbFailure } from "@/lib/db-route-error";
import { requireObraAccessFromRequest } from "@/lib/obra-access";
import { serializeObraApi } from "@/lib/obra-api-serialize";
import { modulosProjetoFromUnknown } from "@/lib/modulos-projeto";
import { parsePolygonBody, polygonCentroidLngLat } from "@/lib/obra-aoi-polygon";
import {
  clearObraPolygon4326,
  getObraPolygonGeoJson,
  setObraPolygon4326,
} from "@/lib/obra-area-postgis";
import { setObraTipoMonitoramentoSql } from "@/lib/obra-tipo-monitoramento-sql";
import { parseObraStatus } from "@/lib/obra-status";
import { syncProjectModules } from "@/lib/project-modules-db";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);

  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const obra = await prisma.obra.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      projectModules: { select: { module: true, active: true } },
    },
  });

  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  const access = await requireObraAccessFromRequest(req, obra);
  if (!access.ok) return access.response;

  let areaOfInterestGeojson: Polygon | null = null;
  try {
    areaOfInterestGeojson = await getObraPolygonGeoJson(prisma, id);
  } catch {
    areaOfInterestGeojson = null;
  }

  return NextResponse.json({
    ...serializeObraApi(obra),
    ...(areaOfInterestGeojson ? { areaOfInterestGeojson } : {}),
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);

  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const existing = await prisma.obra.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  const access = await requireObraAccessFromRequest(req, existing, {
    write: true,
  });
  if (!access.ok) return access.response;

  const modulesPayload = modulosProjetoFromUnknown(body.modules);

  type PolygonPatch =
    | { kind: "none" }
    | { kind: "clear" }
    | { kind: "set"; polygon: Polygon };

  let polygonPatch: PolygonPatch = { kind: "none" };
  const polyKeyHit =
    "aoi_geojson" in body ||
    "aoiGeojson" in body ||
    "areaOfInterestGeojson" in body;
  if (polyKeyHit) {
    const raw =
      body.aoi_geojson ?? body.aoiGeojson ?? body.areaOfInterestGeojson;
    if (raw === null || raw === "") {
      polygonPatch = { kind: "clear" };
    } else {
      const p = parsePolygonBody(raw);
      if (!p) {
        return NextResponse.json(
          {
            error:
              "aoi_geojson inválido (esperado GeoJSON Polygon com anel fechado)",
          },
          { status: 400 },
        );
      }
      polygonPatch = { kind: "set", polygon: p };
    }
  }

  const data: {
    nome?: string;
    cliente?: string;
    local?: string;
    description?: string | null;
    status?: ObraStatus;
    latitude?: number | null;
    longitude?: number | null;
    company?: { connect: { id: number } };
  } = {};

  if ("nome" in body && body.nome !== undefined) {
    if (typeof body.nome !== "string" || !body.nome.trim()) {
      return NextResponse.json(
        { error: "nome deve ser texto não vazio" },
        { status: 400 },
      );
    }
    data.nome = body.nome.trim();
  }

  if ("cliente" in body && body.cliente !== undefined) {
    if (typeof body.cliente !== "string" || !body.cliente.trim()) {
      return NextResponse.json(
        { error: "cliente deve ser texto não vazio" },
        { status: 400 },
      );
    }
    data.cliente = body.cliente.trim();
  }

  if ("local" in body && body.local !== undefined) {
    if (typeof body.local !== "string" || !body.local.trim()) {
      return NextResponse.json(
        { error: "local deve ser texto não vazio" },
        { status: 400 },
      );
    }
    data.local = body.local.trim();
  }

  if ("description" in body) {
    if (body.description === null || body.description === "") {
      data.description = null;
    } else if (typeof body.description === "string") {
      data.description = body.description.trim() || null;
    } else {
      return NextResponse.json({ error: "description inválida" }, { status: 400 });
    }
  }

  if ("status" in body && body.status !== undefined) {
    const st = parseObraStatus(
      typeof body.status === "string" ? body.status : null,
    );
    if (!st) {
      return NextResponse.json({ error: "status inválido" }, { status: 400 });
    }
    data.status = st;
  }

  let tipoMonitoramentoPatch: string | null | undefined = undefined;
  if ("tipo_monitoramento" in body || "tipoMonitoramento" in body) {
    const raw =
      body.tipo_monitoramento !== undefined
        ? body.tipo_monitoramento
        : body.tipoMonitoramento;
    if (raw === null || raw === "") {
      tipoMonitoramentoPatch = null;
    } else if (typeof raw === "string") {
      tipoMonitoramentoPatch = raw.trim().slice(0, 128) || null;
    } else {
      return NextResponse.json(
        { error: "tipo_monitoramento inválido" },
        { status: 400 },
      );
    }
  }

  const rawCid =
    body.companyId !== undefined ? body.companyId : body.empresaId;
  if (rawCid !== undefined) {
    const cid = Number(rawCid);
    if (!Number.isFinite(cid)) {
      return NextResponse.json({ error: "companyId inválido" }, { status: 400 });
    }
    const c = await prisma.company.findUnique({
      where: { id: cid },
      select: { id: true },
    });
    if (!c) {
      return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
    }
    data.company = { connect: { id: Number(cid) } };
  }

  const coordExplicitPatch =
    "latitude" in body || "longitude" in body;
  if (polygonPatch.kind === "set" && !coordExplicitPatch) {
    const c = polygonCentroidLngLat(polygonPatch.polygon);
    data.latitude = c.lat;
    data.longitude = c.lng;
  }

  const hasCoords = "latitude" in body || "longitude" in body;
  if (hasCoords) {
    if (!("latitude" in body) || !("longitude" in body)) {
      return NextResponse.json(
        {
          error:
            "Para atualizar coordenadas, envie latitude e longitude (ou null para limpar)",
        },
        { status: 400 },
      );
    }

    const clear =
      body.latitude === null ||
      body.latitude === "" ||
      body.longitude === null ||
      body.longitude === "";

    if (clear) {
      data.latitude = null;
      data.longitude = null;
    } else {
      const lat = Number(body.latitude);
      const lng = Number(body.longitude);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        return NextResponse.json(
          { error: "latitude deve ser um número entre -90 e 90" },
          { status: 400 },
        );
      }
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        return NextResponse.json(
          { error: "longitude deve ser um número entre -180 e 180" },
          { status: 400 },
        );
      }
      data.latitude = lat;
      data.longitude = lng;
    }
  }

  if (
    Object.keys(data).length === 0 &&
    !modulesPayload &&
    polygonPatch.kind === "none" &&
    tipoMonitoramentoPatch === undefined
  ) {
    return NextResponse.json(
      { error: "Nada para atualizar" },
      { status: 400 },
    );
  }

  if (Object.keys(data).length > 0) {
    await prisma.obra.update({
      where: { id },
      data,
    });
  }

  if (modulesPayload) {
    await syncProjectModules(id, modulesPayload);
  }

  try {
    if (tipoMonitoramentoPatch !== undefined) {
      await setObraTipoMonitoramentoSql(prisma, id, tipoMonitoramentoPatch);
    }
    if (polygonPatch.kind === "set") {
      await setObraPolygon4326(prisma, id, polygonPatch.polygon);
    } else if (polygonPatch.kind === "clear") {
      await clearObraPolygon4326(prisma, id);
    }
  } catch (e) {
    return nextResponseDbFailure(e);
  }

  const obra = await prisma.obra.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      projectModules: { select: { module: true, active: true } },
    },
  });

  if (!obra) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  let areaOfInterestGeojson = null;
  try {
    areaOfInterestGeojson = await getObraPolygonGeoJson(prisma, id);
  } catch {
    areaOfInterestGeojson = null;
  }

  return NextResponse.json({
    ...serializeObraApi(obra),
    ...(tipoMonitoramentoPatch !== undefined
      ? { tipoMonitoramento: tipoMonitoramentoPatch }
      : {}),
    ...(areaOfInterestGeojson ? { areaOfInterestGeojson } : {}),
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id: idStr } = await ctx.params;
  const id = Number(idStr);

  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const existing = await prisma.obra.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  const access = await requireObraAccessFromRequest(_req, existing, {
    write: true,
  });
  if (!access.ok) return access.response;

  try {
    const resultado = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const furos = await tx.furo.findMany({
        where: { obraId: id },
        select: { id: true },
      });
      const furoIds = furos.map((f: { id: number }) => f.id);

      let sptApagados = 0;
      if (furoIds.length > 0) {
        const spt = await tx.sPT.deleteMany({
          where: { furoId: { in: furoIds } },
        });
        sptApagados = spt.count;
      }

      const furosDelete = await tx.furo.deleteMany({ where: { obraId: id } });
      await tx.obra.delete({ where: { id } });

      return {
        furosApagados: furosDelete.count,
        sptApagados,
      };
    });

    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    return nextResponseDbFailure(e);
  }
}
