-- Fase 5: matriz global de cobertura por tribunal e fonte.
-- Encontrar um processo nao significa validar o acesso privado do PJe/CS.

create table if not exists public.tribunal_coverage (
  id uuid primary key default gen_random_uuid(),
  tribunal_id uuid not null references public.tribunais(id) on delete cascade,
  crawler_id uuid references public.crawlers(id) on delete set null,
  sistema_id uuid references public.sistemas(id) on delete set null,
  status text not null default 'nao_testado',
  meujudi_validado boolean not null default false,
  processo_encontrado_no_teste boolean not null default false,
  advogado_confirmou_processos boolean,
  data_validacao timestamptz,
  responsavel text,
  evidencia jsonb not null default '{}'::jsonb,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tribunal_coverage_status_check
    check (status in ('nao_testado', 'parcial', 'validado', 'bloqueado'))
);

create unique index if not exists tribunal_coverage_tribunal_crawler_uidx
  on public.tribunal_coverage(tribunal_id, coalesce(crawler_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists tribunal_coverage_status_idx
  on public.tribunal_coverage(status, updated_at desc);
create index if not exists tribunal_coverage_crawler_idx
  on public.tribunal_coverage(crawler_id, status);
create index if not exists tribunal_coverage_system_idx
  on public.tribunal_coverage(sistema_id, status);
create index if not exists tribunal_coverage_tribunal_idx
  on public.tribunal_coverage(tribunal_id, updated_at desc);

-- Uma linha inicial por tribunal e fonte catalogada.
-- O status permanece nao_testado ate existir uma validacao real.
insert into public.tribunal_coverage (tribunal_id, crawler_id, sistema_id, status, evidencia, observacoes)
select t.id,
       c.id,
       t.sistema_principal_id,
       'nao_testado',
       jsonb_build_object('seed', true, 'seed_at', now(), 'processos', 0, 'comunicacoes_mural', 0),
       case c.codigo
         when 'datajud_publico' then 'Consulta publica por CNJ; nao representa descoberta de processos novos.'
         when 'mural_cs' then 'Fonte sincronizada pelo MeuJudi CS; requer teste real por escritorio.'
         when 'pje_trt9_cs' then 'Adaptador privado TRT9 ainda depende de login, sessao e certificado testados.'
         else null
       end
from public.tribunais t
cross join public.crawlers c
where c.codigo in ('datajud_publico', 'mural_cs')
  and not exists (
    select 1
    from public.tribunal_coverage existing
    where existing.tribunal_id = t.id
      and existing.crawler_id = c.id
  )
on conflict do nothing;

insert into public.tribunal_coverage (tribunal_id, crawler_id, sistema_id, status, evidencia, observacoes)
select t.id,
       c.id,
       t.sistema_principal_id,
       'nao_testado',
       jsonb_build_object('seed', true, 'seed_at', now(), 'processos', 0, 'comunicacoes_mural', 0),
       'Adaptador privado TRT9; nao usar esta linha como evidencia para outros tribunais.'
from public.tribunais t
join public.crawlers c on c.codigo = 'pje_trt9_cs'
where t.codigo = 'trt9'
  and not exists (
    select 1
    from public.tribunal_coverage existing
    where existing.tribunal_id = t.id
      and existing.crawler_id = c.id
  )
on conflict do nothing;

-- Alimenta apenas a evidencia observada nos dados atuais.
-- A origem do processo continua sendo a fonte real; esta etapa nao promove
-- automaticamente um conector para validado.
with process_stats as (
  select tribunal_id,
         count(*)::integer as total_processos,
         count(*) filter (where crawler_id is not null)::integer as processos_com_crawler,
         count(*) filter (where origem_extracao = 'datajud')::integer as processos_datajud,
         count(*) filter (where origem_extracao = 'mural')::integer as processos_mural,
         count(*) filter (where origem_extracao = 'pje_cs')::integer as processos_pje_cs
  from public.processos
  where tribunal_id is not null
  group by tribunal_id
),
mural_stats as (
  select t.id as tribunal_id,
         count(cm.*)::integer as total_comunicacoes
  from public.tribunais t
  left join public.comunicacoes_mural cm
    on upper(trim(cm.sigla_tribunal)) = t.sigla
  group by t.id
)
update public.tribunal_coverage coverage
set processo_encontrado_no_teste = coalesce(process_stats.total_processos, 0) > 0,
    status = case
      when coverage.meujudi_validado then 'validado'
      when coverage.status = 'bloqueado' then 'bloqueado'
      when coalesce(process_stats.total_processos, 0) > 0
        or coalesce(mural_stats.total_comunicacoes, 0) > 0 then 'parcial'
      else coverage.status
    end,
    evidencia = coverage.evidencia || jsonb_build_object(
      'processos', coalesce(process_stats.total_processos, 0),
      'processos_com_crawler', coalesce(process_stats.processos_com_crawler, 0),
      'processos_datajud', coalesce(process_stats.processos_datajud, 0),
      'processos_mural', coalesce(process_stats.processos_mural, 0),
      'processos_pje_cs', coalesce(process_stats.processos_pje_cs, 0),
      'comunicacoes_mural', coalesce(mural_stats.total_comunicacoes, 0),
      'evidencia_atualizada_em', now()
    ),
    updated_at = now()
from process_stats
full join mural_stats on mural_stats.tribunal_id = process_stats.tribunal_id
where coverage.tribunal_id = coalesce(process_stats.tribunal_id, mural_stats.tribunal_id);

alter table public.tribunal_coverage enable row level security;

drop policy if exists tribunal_coverage_authenticated_read on public.tribunal_coverage;
create policy tribunal_coverage_authenticated_read on public.tribunal_coverage
for select to authenticated
using (true);

drop policy if exists tribunal_coverage_super_admin_write on public.tribunal_coverage;
create policy tribunal_coverage_super_admin_write on public.tribunal_coverage
for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists tribunal_coverage_service_write on public.tribunal_coverage;
create policy tribunal_coverage_service_write on public.tribunal_coverage
for all to service_role
using (true)
with check (true);

revoke all on public.tribunal_coverage from anon;
grant select on public.tribunal_coverage to authenticated;

comment on table public.tribunal_coverage is
  'Matriz global de cobertura por tribunal e conector; nao e dado de um tenant.';
comment on column public.tribunal_coverage.processo_encontrado_no_teste is
  'Indica evidencia de processo no banco, sem afirmar que o conector privado funciona.';
comment on column public.tribunal_coverage.evidencia is
  'Contagens e evidencias operacionais sem secrets, cookies, certificados ou chaves.';
