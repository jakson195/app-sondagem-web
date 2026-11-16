-- Diretório "Empresas por região" (idempotente: o histórico local e o do banco divergem).
CREATE TABLE IF NOT EXISTS "EmpresaDiretorio" (
  "id" SERIAL PRIMARY KEY,
  "empresa_id" INTEGER NOT NULL,
  "visivel" BOOLEAN NOT NULL DEFAULT false,
  "codigo_ibge" INTEGER NOT NULL,
  "cidade" TEXT NOT NULL,
  "uf" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "raio_km" INTEGER NOT NULL DEFAULT 80,
  "servicos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "descricao" TEXT,
  "registro_profissional" TEXT,
  "registro_verificado" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmpresaDiretorio_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmpresaDiretorio_empresa_id_key" ON "EmpresaDiretorio"("empresa_id");
CREATE INDEX IF NOT EXISTS "EmpresaDiretorio_uf_idx" ON "EmpresaDiretorio"("uf");

CREATE TABLE IF NOT EXISTS "DiretorioLead" (
  "id" SERIAL PRIMARY KEY,
  "empresa_id" INTEGER NOT NULL,
  "user_id" INTEGER,
  "nome" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "telefone" TEXT,
  "codigo_ibge" INTEGER,
  "cidade" TEXT,
  "servico" TEXT,
  "mensagem" TEXT NOT NULL,
  "lido" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiretorioLead_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "DiretorioLead_empresa_id_created_at_idx" ON "DiretorioLead"("empresa_id", "created_at");
