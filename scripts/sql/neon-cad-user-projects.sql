-- Tabela de projetos CAD por utilizador (Ambiente CAD)
CREATE TABLE IF NOT EXISTS cad_user_projects (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  dwg BYTEA,
  dwg_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cad_user_projects ADD COLUMN IF NOT EXISTS dwg BYTEA;
ALTER TABLE cad_user_projects ADD COLUMN IF NOT EXISTS dwg_name TEXT;

CREATE INDEX IF NOT EXISTS cad_user_projects_user_id_idx ON cad_user_projects(user_id);
CREATE INDEX IF NOT EXISTS cad_user_projects_updated_at_idx ON cad_user_projects(updated_at);
