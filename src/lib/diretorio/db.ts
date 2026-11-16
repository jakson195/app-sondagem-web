import { prisma } from "@/lib/prisma";
import { assinaturaAtiva, type Municipio, type PerfilDiretorio } from "./core";

/** Raio de atuação máximo aceito no cadastro (km). Também limita a caixa de pré-filtro. */
export const RAIO_ATUACAO_MAX_KM = 300;

/**
 * Perfis visíveis numa caixa em volta da cidade (pré-filtro barato no banco); a distância exata,
 * o raio de atuação e a assinatura são conferidos em `buscarEmpresas`.
 */
export async function carregarPerfisPerto(cidade: Municipio, raioBuscaKm: number): Promise<PerfilDiretorio[]> {
  const alcance = Math.max(raioBuscaKm, RAIO_ATUACAO_MAX_KM);
  const dLat = alcance / 111;
  const dLon = alcance / (111 * Math.max(0.2, Math.cos((cidade.lat * Math.PI) / 180)));
  const rows = await prisma.empresaDiretorio.findMany({
    where: {
      visivel: true,
      latitude: { gte: cidade.lat - dLat, lte: cidade.lat + dLat },
      longitude: { gte: cidade.lon - dLon, lte: cidade.lon + dLon },
    },
    include: {
      company: {
        select: {
          name: true,
          logo: true,
          status: true,
          subscription: { select: { status: true, trialEndsAt: true, currentPeriodEnd: true } },
        },
      },
    },
    take: 2000,
  });
  const agora = new Date();
  return rows.map((r) => ({
    empresaId: r.empresaId,
    nome: r.company.name,
    logo: r.company.logo,
    visivel: r.visivel,
    codigoIbge: r.codigoIbge,
    cidade: r.cidade,
    uf: r.uf,
    latitude: r.latitude,
    longitude: r.longitude,
    raioKm: r.raioKm,
    servicos: r.servicos,
    descricao: r.descricao,
    registroVerificado: r.registroVerificado,
    ativa: assinaturaAtiva(r.company.subscription, r.company.status, agora),
  }));
}
