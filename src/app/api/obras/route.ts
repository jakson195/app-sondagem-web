import { nextResponseDbFailure } from "@/lib/db-route-error";
import { resolveObraListCompanyFilter } from "@/lib/auth/active-company";
import {
  listAccessibleCompanyIdsForUser,
  requireCompanyAccessFromRequest,
} from "@/lib/client-portal-auth";
import { scopeWhereObrasForUser } from "@/lib/obra-access";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";
import { serializeObraApi } from "@/lib/obra-api-serialize";
import {
  defaultModulosProjetoTodosAtivos,
  modulosProjetoFromUnknown,
} from "@/lib/modulos-projeto";
import { parsePolygonBody, polygonCentroidLngLat } from "@/lib/obra-aoi-polygon";
import { getObraPolygonGeoJson, setObraPolygon4326 } from "@/lib/obra-area-postgis";
import { setObraTipoMonitoramentoSql } from "@/lib/obra-tipo-monitoramento-sql";
import { parseObraStatus } from "@/lib/obra-status";
import { syncProjectModules } from "@/lib/project-modules-db";
import { prisma } from "@/lib/prisma";
import { assertCanCreateObra } from "@/lib/saas/enforce-limits";
import { getOrProvisionSubscription } from "@/lib/saas/subscription-service";
import { getAuthUserFromRequest } from "@/lib/server-auth";
import type { ObraStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const companyId = await resolveObraListCompanyFilter(user, req);

    const statusFilter = parseObraStatus(searchParams.get("status"));
    const q = (searchParams.get("q") ?? "").trim();

    const parts: Prisma.ObraWhereInput[] = [];
    const accessibleIds = await listAccessibleCompanyIdsForUser(user);
    const isAdmin = isPlatformSuperAdmin(user.systemRole);

    if (!isAdmin) {
      parts.push(await scopeWhereObrasForUser(user));
    }

    if (companyId !== null) {
      if (!isAdmin && !accessibleIds.includes(companyId)) {
        return NextResponse.json(
          { error: "Sem acesso a este cliente." },
          { status: 403 },
        );
      }
      parts.push({ companyId });
    } else if (!isAdmin && accessibleIds.length === 0) {
      parts.push({ companyId: -1 });
    }
    if (statusFilter) {
      parts.push({ status: statusFilter });
    }
    if (q) {
      parts.push({
        OR: [
          { nome: { contains: q, mode: "insensitive" } },
          { cliente: { contains: q, mode: "insensitive" } },
          { local: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    const where: Prisma.ObraWhereInput =
      parts.length > 0 ? { AND: parts } : {};

    const obras = await prisma.obra.findMany({
      where,
      orderBy: { id: "desc" },
      include: {
        company: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(obras.map((o) => serializeObraApi(o)));
  } catch (e) {
    return nextResponseDbFailure(e);
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;

  const rawCid =
    body.companyId !== undefined && body.companyId !== null
      ? body.companyId
      : body.empresaId;
  const companyId = Number(rawCid);

  const statusParsed = parseObraStatus(
    typeof body.status === "string" ? body.status : null,
  );
  const status: ObraStatus = statusParsed ?? "ACTIVE";

  const modMap =
    modulosProjetoFromUnknown(body.modules) ?? defaultModulosProjetoTodosAtivos();

  const tipoRaw =
    body.tipo_monitoramento ?? body.tipoMonitoramento ?? undefined;
  const tipoMonitoramento =
    typeof tipoRaw === "string" && tipoRaw.trim()
      ? tipoRaw.trim().slice(0, 128)
      : null;

  const polyPayload =
    body.aoi_geojson ?? body.aoiGeojson ?? body.areaOfInterestGeojson;
  const polygonParsed = parsePolygonBody(polyPayload);

  let latitude: number | undefined;
  let longitude: number | undefined;
  const coordTouch =
    "latitude" in body || "longitude" in body || "lat" in body || "lng" in body;

  if (coordTouch) {
    const latIn = body.latitude ?? body.lat;
    const lngIn = body.longitude ?? body.lng;
    const clear =
      latIn === null ||
      latIn === "" ||
      lngIn === null ||
      lngIn === "";
    if (clear) {
      latitude = undefined;
      longitude = undefined;
    } else {
      const lat = Number(latIn);
      const lng = Number(lngIn);
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
      latitude = lat;
      longitude = lng;
    }
  }

  if (
    polygonParsed &&
    (latitude === undefined || longitude === undefined)
  ) {
    const c = polygonCentroidLngLat(polygonParsed);
    latitude = latitude ?? c.lat;
    longitude = longitude ?? c.lng;
  }

  if (!nome || !Number.isFinite(companyId)) {
    return NextResponse.json(
      {
        error: "nome e companyId (ou empresaId) válidos são obrigatórios",
      },
      { status: 400 },
    );
  }

  try {
    const access = await requireCompanyAccessFromRequest(req, companyId, { write: true });
    if (!access.ok) return access.response;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
    }

    await getOrProvisionSubscription(companyId);

    const limitCheck = await assertCanCreateObra(companyId);
    if (!limitCheck.ok) return limitCheck.response;

    const cliente =
      typeof body.cliente === "string" && body.cliente.trim()
        ? body.cliente.trim()
        : company.name;
    const local =
      typeof body.local === "string" && body.local.trim()
        ? body.local.trim()
        : "Área de estudo InSAR";

    const obra = await prisma.obra.create({
      data: {
        nome,
        cliente,
        local,
        description,
        status,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        company: {
          connect: {
            id: Number(companyId),
          },
        },
        createdByUser: {
          connect: { id: access.user.id },
        },
      },
    });

    await syncProjectModules(obra.id, modMap);

    try {
      await setObraTipoMonitoramentoSql(prisma, obra.id, tipoMonitoramento);
    } catch (e) {
      await prisma.obra.delete({ where: { id: obra.id } });
      return nextResponseDbFailure(e);
    }

    if (polygonParsed) {
      try {
        await setObraPolygon4326(prisma, obra.id, polygonParsed);
      } catch (e) {
        await prisma.obra.delete({ where: { id: obra.id } });
        return nextResponseDbFailure(e);
      }
    }

    const full = await prisma.obra.findUnique({
      where: { id: obra.id },
      include: {
        company: { select: { id: true, name: true } },
        projectModules: { select: { module: true, active: true } },
      },
    });

    if (!full) {
      return NextResponse.json({ error: "Erro ao recarregar obra" }, { status: 500 });
    }

    let areaOfInterestGeojson = polygonParsed;
    if (!areaOfInterestGeojson) {
      try {
        areaOfInterestGeojson = await getObraPolygonGeoJson(prisma, obra.id);
      } catch {
        areaOfInterestGeojson = null;
      }
    }

    return NextResponse.json({
      ...serializeObraApi(full),
      tipoMonitoramento,
      ...(areaOfInterestGeojson
        ? { areaOfInterestGeojson }
        : {}),
    });
  } catch (e) {
    return nextResponseDbFailure(e);
  }
}
