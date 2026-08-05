-- Tabela de projetos CAD por utilizador (Ambiente CAD copiado do DatageoNTRIP)
CREATE TABLE IF NOT EXISTS cad_user_projects (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cad_user_projects_user_id_idx ON cad_user_projects(user_id);
CREATE INDEX IF NOT EXISTS cad_user_projects_updated_at_idx ON cad_user_projects(updated_at);
