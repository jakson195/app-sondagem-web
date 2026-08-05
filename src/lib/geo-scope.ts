import { requireCompanyAccessFromRequest } from "@/lib/client-portal-auth";
import { userOwnsObra, obraAccessDeniedResponse } from "@/lib/obra-access";
import { prisma } from "@/lib/prisma";

export type GeoScope = {
  companyId: number;
  obraId: number | null;
  uploadedByUserId: number | null;
};

export async function resolveGeoScopeFromRequest(
  req: Request,
  input: {
    companyId?: unknown;
    obraId?: unknown;
    requireWrite?: boolean;
  },
): Promise<
  | { ok: true; scope: GeoScope }
  | { ok: false; response: Response }
> {
  const obraIdRaw = input.obraId;
  const obraIdNum =
    obraIdRaw === undefined || obraIdRaw === null || obraIdRaw === ""
      ? null
      : Number(obraIdRaw);

  let resolvedCompanyId: number | null =
    input.companyId === undefined || input.companyId === null || input.companyId === ""
      ? null
      : Number(input.companyId);

  let resolvedObra: { companyId: number; createdByUserId: number | null } | null =
    null;

  if (obraIdNum !== null) {
    if (!Number.isFinite(obraIdNum) || obraIdNum < 1) {
      return {
        ok: false,
        response: Response.json({ error: "obraId inválido." }, { status: 400 }),
      };
    }
    const obra = await prisma.obra.findUnique({
      where: { id: obraIdNum },
      select: { id: true, companyId: true, createdByUserId: true },
    });
    if (!obra) {
      return {
        ok: false,
        response: Response.json({ error: "Obra não encontrada." }, { status: 404 }),
      };
    }
    resolvedObra = obra;
    resolvedCompanyId = obra.companyId;
  }

  if (!Number.isFinite(resolvedCompanyId) || (resolvedCompanyId ?? 0) < 1) {
    return {
      ok: false,
      response: Response.json(
        { error: "companyId ou obraId válido é obrigatório." },
        { status: 400 },
      ),
    };
  }

  const access = await requireCompanyAccessFromRequest(req, resolvedCompanyId!, {
    write: input.requireWrite,
  });
  if (!access.ok) {
    return { ok: false, response: access.response };
  }

  if (resolvedObra && !userOwnsObra(access.user, resolvedObra)) {
    return { ok: false, response: obraAccessDeniedResponse() };
  }

  return {
    ok: true,
    scope: {
      companyId: resolvedCompanyId!,
      obraId: obraIdNum,
      uploadedByUserId: access.user.id,
    },
  };
}
