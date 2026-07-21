-- ============================================================
-- Migration: cs_releases — Tabela para versionamento do MeuJudi CS
-- Armazena informações sobre cada versão disponível para download
-- ============================================================

CREATE TABLE IF NOT EXISTS cs_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,                          -- ex: "1.2.0"
  file_url TEXT NOT NULL,                         -- URL pública do arquivo no Storage
  file_name TEXT NOT NULL,                        -- nome original do arquivo
  file_size_bytes BIGINT,                         -- tamanho em bytes
  changelog TEXT,                                 -- descrição das mudanças
  uploaded_by UUID REFERENCES auth.users(id),     -- quem fez upload
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true         -- apenas uma versão ativa por vez
);

-- Índice para buscar a versão ativa mais recente
CREATE INDEX IF NOT EXISTS idx_cs_releases_active
  ON cs_releases (is_active, uploaded_at DESC);

-- RLS: apenas super admin pode gerenciar, qualquer autenticado pode ler
ALTER TABLE cs_releases ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado pode ver a versão ativa
CREATE POLICY "cs_releases_select_auth"
  ON cs_releases FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Insert/Update/Delete: apenas super admin
CREATE POLICY "cs_releases_insert_super_admin"
  ON cs_releases FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'super_admin'
    )
  );

CREATE POLICY "cs_releases_update_super_admin"
  ON cs_releases FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'super_admin'
    )
  );

CREATE POLICY "cs_releases_delete_super_admin"
  ON cs_releases FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'super_admin'
    )
  );
