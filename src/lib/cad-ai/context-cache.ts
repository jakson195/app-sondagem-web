import type { CadAiProjectContext } from "@/lib/rtk-validation/cad/ai-command-types";

export type CachedLotSummary = {
  id: string;
  quadra: string;
  area: number;
  testada: number;
};

export type CachedQuadraSummary = {
  id: string;
  area: number;
  quantidadeLotes: number;
  areaMedia: number;
};

export type CachedProjectSummary = {
  nome: string;
  quantidadeLotes: number;
  quantidadeQuadras: number;
  ruas: number;
  remanescenteM2: number;
};

type CacheBucket = {
  fingerprint: string;
  project: CachedProjectSummary;
  lots: Map<string, CachedLotSummary>;
  quadras: Map<string, CachedQuadraSummary>;
};

const buckets = new Map<string, CacheBucket>();

function fingerprint(context: CadAiProjectContext): string {
  const loteamento = context.loteamento;
  return [
    context.projectName,
    loteamento?.lotes.length ?? 0,
    loteamento?.quadras.length ?? 0,
    loteamento?.remanescenteM2 ?? 0,
    (loteamento?.lotes ?? []).map((lot) => `${lot.id}:${lot.area}:${lot.testada}`).join(","),
    (loteamento?.quadras ?? []).map((row) => `${row.id}:${row.area}:${row.quantidadeLotes}`).join(","),
  ].join("|");
}

function buildBucket(context: CadAiProjectContext): CacheBucket {
  const loteamento = context.loteamento;
  const lots = new Map<string, CachedLotSummary>();
  const quadras = new Map<string, CachedQuadraSummary>();
  for (const lot of loteamento?.lotes ?? []) {
    lots.set(lot.id.toLowerCase(), {
      id: lot.id,
      quadra: lot.quadra,
      area: lot.area,
      testada: lot.testada,
    });
  }
  for (const row of loteamento?.quadras ?? []) {
    quadras.set(row.id.toUpperCase(), {
      id: row.id,
      area: row.area,
      quantidadeLotes: row.quantidadeLotes,
      areaMedia: row.areaMedia,
    });
  }
  return {
    fingerprint: fingerprint(context),
    project: {
      nome: loteamento?.projeto.nome || context.projectName,
      quantidadeLotes: loteamento?.lotes.length ?? 0,
      quantidadeQuadras: loteamento?.quadras.length ?? 0,
      ruas: loteamento?.ruas.length ?? 0,
      remanescenteM2: loteamento?.remanescenteM2 ?? 0,
    },
    lots,
    quadras,
  };
}

export function getCadContextCache(
  conversationId: string | undefined,
  context: CadAiProjectContext,
): CacheBucket {
  const key = conversationId ?? "anon";
  const prev = buckets.get(key);
  const nextFp = fingerprint(context);
  if (prev && prev.fingerprint === nextFp) return prev;
  const built = buildBucket(context);
  buckets.set(key, built);
  return built;
}

export function lookupCachedLot(
  conversationId: string | undefined,
  context: CadAiProjectContext,
  ref: string,
): CachedLotSummary | undefined {
  const bucket = getCadContextCache(conversationId, context);
  const norm = ref.replace(/^lote\s+/i, "").trim().toLowerCase();
  return (
    bucket.lots.get(norm) ??
    [...bucket.lots.values()].find((lot) => {
      const num = lot.id.split("-").pop()?.toLowerCase();
      return num === norm || num === norm.padStart(2, "0") || lot.id.toLowerCase().endsWith(`-${norm.padStart(2, "0")}`);
    })
  );
}

export function invalidateCadContextCache(
  conversationId: string | undefined,
  scope: { lote?: string; quadra?: string; project?: boolean },
): void {
  if (!conversationId) return;
  if (scope.project) {
    buckets.delete(conversationId);
    return;
  }
  const bucket = buckets.get(conversationId);
  if (!bucket) return;
  if (scope.lote) bucket.lots.delete(scope.lote.toLowerCase());
  if (scope.quadra) bucket.quadras.delete(scope.quadra.toUpperCase());
  bucket.fingerprint = "";
}

export function resetCadContextCache(): void {
  buckets.clear();
}
