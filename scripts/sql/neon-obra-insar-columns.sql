-- =====================================================================
-- Neon / Postgres — alinhar tabela "Obra" ao schema Prisma do app-web
-- =====================================================================
-- Executar no SQL Editor da MESMA base que DATABASE_URL na Vercel.
-- Idempotente (IF NOT EXISTS / duplicate_object ignorado).
--
-- Se não conseguir criar obra por "Assinatura não configurada", execute
-- ANTES ou DEPOIS: scripts/sql/neon-subscription-table.sql
--
-- Opcional (AOI geométrico): na Neon ative a extensão «postgis», depois:
--   CREATE EXTENSION IF NOT EXISTS postgis;
--   ALTER TABLE "Obra" ADD COLUMN IF NOT EXISTS "area_of_interest" geometry(Polygon, 4326);
-- =====================================================================

DO $$
BEGIN
    CREATE TYPE "ObraStatus" AS ENUM (
        'DRAFT',
        'ACTIVE',
        'ON_HOLD',
        'COMPLETED',
        'ARCHIVED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "Obra" ADD COLUMN IF NOT EXISTS "description" TEXT;

ALTER TABLE "Obra" ADD COLUMN IF NOT EXISTS "status" "ObraStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "Obra" ADD COLUMN IF NOT EXISTS "tipo_monitoramento" TEXT;

ALTER TABLE "Obra" ADD COLUMN IF NOT EXISTS "area_of_interest_geojson" JSONB;
