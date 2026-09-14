-- AlterTable
ALTER TABLE "cad_user_projects" ADD COLUMN IF NOT EXISTS "dwg" BYTEA;
ALTER TABLE "cad_user_projects" ADD COLUMN IF NOT EXISTS "dwg_name" TEXT;
