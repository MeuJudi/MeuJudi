-- Compartilhamento de processos por OAB (Fase 3 do plano de implementação).
-- Ver docs/roadmap/planos-implementacao.md seção 3.
--
-- Um processo (CNJ) agora é único no sistema. Quando um processo vem com
-- várias OABs vinculadas, se qualquer uma bater com outro escritório, ele
-- herda o processo existente sem baixar tudo do zero.

-- 1. Nova tabela de participação — vincula tenant + OAB ao processo
create table public.processo_participantes (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.processos(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  oab_number text not null,
  oab_uf text not null,
  source text not null default 'pdpj'
    check (source in ('pdpj', 'mural', 'manual')),
  discovered_at timestamptz not null default now(),
  unique (processo_id, oab_number, oab_uf)
);

create index idx_pp_processo on public.processo_participantes(processo_id);
create index idx_pp_tenant on public.processo_participantes(tenant_id);
create index idx_pp_oab on public.processo_participantes(oab_number, oab_uf);

alter table public.processo_participantes enable row level security;

-- Participantes seguem o mesmo RLS dos processos (acesso via tenant)
create policy "processo_participantes_tenant_all" on public.processo_participantes
for all to authenticated
using (
  tenant_id = public.current_user_tenant_id()
  or public.is_super_admin()
)
with check (
  tenant_id = public.current_user_tenant_id()
  or public.is_super_admin()
);

-- 2. Tornar processos.tenant_id nullable (processo pode ser compartilhado)
-- e adicionar created_by_tenant para rastrear quem criou primeiro.
-- Nota: esta migration NÃO remove tenant_id — ele continua existindo para
-- retrocompatibilidade e para-processos que só pertencem a um escritório.
-- A mudança real é: queries passam a usar processo_participantes para
-- descobrir acesso, em vez de filtrar direto por tenant_id.
ALTER TABLE public.processos ADD COLUMN IF NOT EXISTS created_by_tenant uuid
  REFERENCES public.tenants(id) ON DELETE SET NULL;

-- 3. Preencher created_by_tenant com o tenant atual (quem já existe foi criado por ele)
UPDATE public.processos SET created_by_tenant = tenant_id WHERE created_by_tenant IS NULL;

-- 4. Migrar dados existentes: cada processo existente vira uma participação
-- do tenant dono, com a primeira OAB ativa do escritório.
INSERT INTO public.processo_participantes (processo_id, tenant_id, oab_number, oab_uf, source, discovered_at)
SELECT DISTINCT ON (p.id, eo.oab_number, eo.oab_uf)
  p.id,
  p.tenant_id,
  eo.oab_number,
  eo.oab_uf,
  'manual'::text,
  p.created_at
FROM public.processos p
JOIN public.escritorio_oabs eo ON eo.tenant_id = p.tenant_id
WHERE eo.is_active = true
  AND p.tenant_id IS NOT NULL
ON CONFLICT (processo_id, oab_number, oab_uf) DO NOTHING;

-- 5. Trigger para auto-vincular: quando um processo é criado sem participação,
-- cria automaticamente com a primeira OAB ativa do tenant.
CREATE OR REPLACE FUNCTION public.auto_link_process_participant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Só executa se o processo foi criado com tenant_id (modo legado)
  IF NEW.tenant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.processo_participantes
    WHERE processo_id = NEW.id
  ) THEN
    INSERT INTO public.processo_participantes (processo_id, tenant_id, oab_number, oab_uf, source)
    SELECT NEW.id, NEW.tenant_id, eo.oab_number, eo.oab_uf, 'pdpj'
    FROM public.escritorio_oabs eo
    WHERE eo.tenant_id = NEW.tenant_id AND eo.is_active = true
    ORDER BY eo.is_primary DESC, eo.created_at ASC
    LIMIT 1
    ON CONFLICT (processo_id, oab_number, oab_uf) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_auto_link_process_participant
AFTER INSERT ON public.processos
FOR EACH ROW
EXECUTE FUNCTION public.auto_link_process_participant();
