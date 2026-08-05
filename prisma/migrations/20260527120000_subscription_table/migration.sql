-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "SaasPlanSlug" AS ENUM ('trial', 'pro', 'enterprise');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Subscription" (
    "id" SERIAL NOT NULL,
    "empresa_id" INTEGER NOT NULL,
    "plan" "SaasPlanSlug" NOT NULL DEFAULT 'trial',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "trial_ends_at" TIMESTAMP(3),
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "billing_provider" TEXT,
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "stripe_price_id" TEXT,
    "external_subscription_id" TEXT,
    "max_obras" INTEGER NOT NULL DEFAULT 2,
    "max_users" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_empresa_id_key" ON "Subscription"("empresa_id");

DO $$ BEGIN
    ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_empresa_id_fkey"
        FOREIGN KEY ("empresa_id") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Remove migração fantasma que bloqueia `prisma migrate deploy` (ficheiro já não existe no repo)
DELETE FROM "_prisma_migrations"
WHERE migration_name = '20250604120000_rtk_validation_module'
  AND finished_at IS NULL;
