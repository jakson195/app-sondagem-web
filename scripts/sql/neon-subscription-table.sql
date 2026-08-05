-- =====================================================================
-- Neon — tabela Subscription (SaaS) + enum SaasPlanSlug
-- Executar no SQL Editor da MESMA base que DATABASE_URL na Vercel.
-- Idempotente.
-- =====================================================================

DO $$
BEGIN
    CREATE TYPE "SaasPlanSlug" AS ENUM ('trial', 'pro', 'enterprise');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

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

CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_empresa_id_key"
    ON "Subscription"("empresa_id");

CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_stripe_customer_id_key"
    ON "Subscription"("stripe_customer_id")
    WHERE "stripe_customer_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_stripe_subscription_id_key"
    ON "Subscription"("stripe_subscription_id")
    WHERE "stripe_subscription_id" IS NOT NULL;

DO $$
BEGIN
    ALTER TABLE "Subscription"
        ADD CONSTRAINT "Subscription_empresa_id_fkey"
        FOREIGN KEY ("empresa_id") REFERENCES "Empresa"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- Trial para empresas sem linha de assinatura
INSERT INTO "Subscription" (
    "empresa_id",
    "plan",
    "status",
    "trial_ends_at",
    "max_obras",
    "max_users",
    "billing_provider"
)
SELECT
    e."id",
    CASE
        WHEN e."planSlug" IN ('pro', 'enterprise') THEN e."planSlug"::"SaasPlanSlug"
        ELSE 'trial'::"SaasPlanSlug"
    END,
    COALESCE(e."subscriptionStatus", 'TRIAL'::"SubscriptionStatus"),
    CASE
        WHEN COALESCE(e."subscriptionStatus", 'TRIAL'::"SubscriptionStatus") = 'TRIAL'::"SubscriptionStatus"
        THEN (CURRENT_TIMESTAMP + INTERVAL '14 days')
        ELSE NULL
    END,
    CASE WHEN e."planSlug" = 'enterprise' THEN 999 WHEN e."planSlug" = 'pro' THEN 50 ELSE 2 END,
    CASE WHEN e."planSlug" = 'enterprise' THEN 999 WHEN e."planSlug" = 'pro' THEN 25 ELSE 5 END,
    'manual'
FROM "Empresa" e
WHERE NOT EXISTS (
    SELECT 1 FROM "Subscription" s WHERE s."empresa_id" = e."id"
);

-- Limpar migração fantasma que bloqueia `prisma migrate deploy` (opcional)
-- DELETE FROM "_prisma_migrations" WHERE migration_name = '20250604120000_rtk_validation_module';
