-- ============================================================
-- PARTE 1: Deduplicar processos com mesmo CNJ
-- ============================================================

-- 1. Tabela temporária: qual processo MANTER por CNJ (o mais completo)
CREATE TEMPORARY TABLE processos_para_manter AS
SELECT DISTINCT ON (cnj)
  id AS processo_id, cnj
FROM public.processos
ORDER BY cnj,
  (CASE WHEN valor_causa IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN autor IS NOT NULL AND autor != '' THEN 1 ELSE 0 END +
   CASE WHEN reu IS NOT NULL AND reu != '' THEN 1 ELSE 0 END +
   CASE WHEN orgao_julgador IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN classe_nome IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN tribunal IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN data_ultima_movimentacao IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN advogados != '[]'::jsonb THEN 1 ELSE 0 END +
   CASE WHEN assuntos != '[]'::jsonb THEN 1 ELSE 0 END
  ) DESC, created_at ASC;

-- 2. IDs para DELETAR
CREATE TEMPORARY TABLE processos_para_deletar AS
SELECT id AS processo_id
FROM public.processos
WHERE id NOT IN (SELECT processo_id FROM processos_para_manter)
  AND cnj IN (SELECT cnj FROM public.processos GROUP BY cnj HAVING COUNT(*) > 1);

-- 3. Copiar participações dos duplicados para o keeper (ignorar conflitos)
INSERT INTO public.processo_participantes (processo_id, tenant_id, oab_number, oab_uf, source, discovered_at)
SELECT m.processo_id, pp.tenant_id, pp.oab_number, pp.oab_uf, pp.source, pp.discovered_at
FROM public.processo_participantes pp
JOIN processos_para_deletar pd ON pd.processo_id = pp.processo_id
JOIN processos_para_manter m ON m.cnj = (SELECT cnj FROM public.processos WHERE id = pd.processo_id)
ON CONFLICT (processo_id, oab_number, oab_uf) DO NOTHING;

-- 4. Deletar processos duplicados (CASCADE remove filhos: docs, movimentações, mural, etc.)
DELETE FROM public.processos
WHERE id IN (SELECT processo_id FROM processos_para_deletar);

-- Limpar
DROP TABLE processos_para_deletar;
DROP TABLE processos_para_manter;

-- ============================================================
-- PARTE 2: Corrigir FK e constraints
-- ============================================================

-- 5. Unique constraint antiga
ALTER TABLE public.processos DROP CONSTRAINT IF EXISTS processos_tenant_id_cnj_key;

-- 6. Nova unique: cnj único no sistema
ALTER TABLE public.processos ADD CONSTRAINT processos_cnj_unique UNIQUE (cnj);

-- 7. FK: ON DELETE CASCADE → ON DELETE SET NULL
ALTER TABLE public.processos DROP CONSTRAINT IF EXISTS processos_tenant_id_fkey;
ALTER TABLE public.processos
  ADD CONSTRAINT processos_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;
