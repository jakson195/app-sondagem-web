-- Isolamento de obras por utilizador criador
ALTER TABLE "Obra" ADD COLUMN IF NOT EXISTS "created_by_user_id" INTEGER;

ALTER TABLE "Obra" DROP CONSTRAINT IF EXISTS "Obra_created_by_user_id_fkey";
ALTER TABLE "Obra" ADD CONSTRAINT "Obra_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Obras existentes: atribuir ao dono da empresa
UPDATE "Obra" o
SET "created_by_user_id" = e."userId"
FROM "Empresa" e
WHERE o."empresaId" = e.id
  AND o."created_by_user_id" IS NULL;

CREATE INDEX IF NOT EXISTS "Obra_created_by_user_id_idx" ON "Obra"("created_by_user_id");
