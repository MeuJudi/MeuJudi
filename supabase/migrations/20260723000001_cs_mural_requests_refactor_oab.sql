-- Migration: refatora cs_mural_requests para consultar Mural por OAB (não por processo).
-- A API do Mural (comunicaapi.pje.jus.br) é consultada por OAB, não por CNJ.
-- O CS recebe a OAB + UF e busca todas as comunicações daquele escritório.

-- 1. Adiciona colunas OAB (nullable inicialmente)
ALTER TABLE public.cs_mural_requests
  ADD COLUMN IF NOT EXISTS oab_number text,
  ADD COLUMN IF NOT EXISTS oab_uf text;

-- 2. Migra dados existentes: popula oab_number/oab_uf a partir do processo
UPDATE public.cs_mural_requests cmr
SET
  oab_number = u.oab_number,
  oab_uf = u.oab_uf
FROM public.processos p
JOIN public.users u ON u.tenant_id = cmr.tenant_id
WHERE cmr.process_id = p.id
  AND cmr.oab_number IS NULL
  AND u.oab_number IS NOT NULL
  AND u.oab_uf IS NOT NULL
  AND u.is_owner = true;

-- 3. Dropa process_id (não faz sentido pra consulta por OAB)
DROP INDEX IF EXISTS public.cs_mural_requests_process_idx;
ALTER TABLE public.cs_mural_requests
  DROP CONSTRAINT IF EXISTS cs_mural_requests_process_id_fkey,
  DROP COLUMN IF EXISTS process_id;

-- 4. Torna oab_number e oab_uf NOT NULL (agora todos os registros migrados têm)
-- Se algum registro não tinha owner com OAB, ele fica sem OAB e será descartado
-- em queries futuras (WHERE oab_number IS NOT NULL).
ALTER TABLE public.cs_mural_requests
  ALTER COLUMN oab_number SET NOT NULL,
  ALTER COLUMN oab_uf SET NOT NULL;

-- 5. Validação
ALTER TABLE public.cs_mural_requests
  ADD CONSTRAINT cs_mural_requests_oab_number_check
    CHECK (oab_number ~ '^[0-9]+$'),
  ADD CONSTRAINT cs_mural_requests_oab_uf_check
    CHECK (length(oab_uf) = 2);

-- 6. Novo índice para polling por OAB
CREATE INDEX cs_mural_requests_oab_idx
  ON public.cs_mural_requests(oab_number, oab_uf, status, created_at)
  WHERE status IN ('pending', 'processing');

-- 7. Remove a FK pra processos (já dropada acima)
-- e atualiza a política RLS (mantida, só muda a query)

-- 8. Comentário atualizado
COMMENT ON TABLE public.cs_mural_requests IS 'Solicitações do Web para consulta do Mural via CS. O CS recebe OAB+UF e busca no PJe.';
