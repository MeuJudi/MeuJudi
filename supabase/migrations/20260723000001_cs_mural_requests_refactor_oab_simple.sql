-- Migration simples: refatora cs_mural_requests para OAB
-- Tabela está vazia, então não precisa migrar dados

-- 1. Adiciona colunas OAB
ALTER TABLE public.cs_mural_requests
  ADD COLUMN IF NOT EXISTS oab_number text,
  ADD COLUMN IF NOT EXISTS oab_uf text;

-- 2. Dropa process_id (tabela vazia, sem FK concern)
ALTER TABLE public.cs_mural_requests
  DROP COLUMN IF EXISTS process_id;

-- 3. Torna NOT NULL
ALTER TABLE public.cs_mural_requests
  ALTER COLUMN oab_number SET NOT NULL,
  ALTER COLUMN oab_uf SET NOT NULL;

-- 4. Validação
ALTER TABLE public.cs_mural_requests
  ADD CONSTRAINT cs_mural_requests_oab_number_check
    CHECK (oab_number ~ '^[0-9]+$'),
  ADD CONSTRAINT cs_mural_requests_oab_uf_check
    CHECK (length(oab_uf) = 2);

-- 5. Novo índice para polling por OAB
CREATE INDEX IF NOT EXISTS cs_mural_requests_oab_idx
  ON public.cs_mural_requests(oab_number, oab_uf, status, created_at)
  WHERE status IN ('pending', 'processing');

-- 6. Comentário
COMMENT ON TABLE public.cs_mural_requests IS 'Solicitações do Web para consulta do Mural via CS. O CS recebe OAB+UF e busca no PJe.';
