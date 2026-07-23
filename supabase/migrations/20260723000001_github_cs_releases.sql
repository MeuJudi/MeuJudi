-- Guarda a referencia da release/asset no GitHub.
ALTER TABLE cs_releases
  ADD COLUMN IF NOT EXISTS github_release_id BIGINT,
  ADD COLUMN IF NOT EXISTS github_asset_id BIGINT,
  ADD COLUMN IF NOT EXISTS github_tag_name TEXT;

CREATE INDEX IF NOT EXISTS idx_cs_releases_github_release
  ON cs_releases (github_release_id);

-- Super Admin precisa consultar o historico completo; tenants continuam vendo
-- somente a release ativa pela policy existente.
DROP POLICY IF EXISTS "cs_releases_select_auth" ON cs_releases;
CREATE POLICY "cs_releases_select_auth"
  ON cs_releases FOR SELECT
  TO authenticated
  USING (
    is_active = true
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'super_admin'
    )
  );
