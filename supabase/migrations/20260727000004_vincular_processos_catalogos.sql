-- Fase 3: vincula processos aos catalogos globais sem remover os campos legados.
-- A migration depende de 20260727000003_catalogo_tribunais_sistemas_crawlers.sql.

alter table public.processos
  add column if not exists tribunal_id uuid,
  add column if not exists sistema_id uuid,
  add column if not exists crawler_id uuid,
  add column if not exists origem_extracao text,
  add column if not exists endpoint text,
  add column if not exists versao_crawler text,
  add column if not exists status_extracao text,
  add column if not exists tempo_consulta_ms integer,
  add column if not exists data_extracao timestamptz,
  add column if not exists ultima_validacao timestamptz,
  add column if not exists confianca numeric(5,4),
  add column if not exists hash_origem text,
  add column if not exists observacao_extracao text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.processos'::regclass
      and conname = 'processos_tribunal_id_fkey'
  ) then
    alter table public.processos
      add constraint processos_tribunal_id_fkey
      foreign key (tribunal_id) references public.tribunais(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.processos'::regclass
      and conname = 'processos_sistema_id_fkey'
  ) then
    alter table public.processos
      add constraint processos_sistema_id_fkey
      foreign key (sistema_id) references public.sistemas(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.processos'::regclass
      and conname = 'processos_crawler_id_fkey'
  ) then
    alter table public.processos
      add constraint processos_crawler_id_fkey
      foreign key (crawler_id) references public.crawlers(id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.processos'::regclass
      and conname = 'processos_origem_extracao_check'
  ) then
    alter table public.processos
      add constraint processos_origem_extracao_check
      check (origem_extracao is null or origem_extracao in ('datajud', 'mural', 'pje_cs', 'manual', 'legado', 'teste'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.processos'::regclass
      and conname = 'processos_status_extracao_check'
  ) then
    alter table public.processos
      add constraint processos_status_extracao_check
      check (status_extracao is null or status_extracao in ('sucesso', 'sem_dados_novos', 'nao_encontrado', 'bloqueado', 'erro_transitorio', 'erro_permanente', 'legado_sem_rastreio'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.processos'::regclass
      and conname = 'processos_tempo_consulta_ms_check'
  ) then
    alter table public.processos
      add constraint processos_tempo_consulta_ms_check
      check (tempo_consulta_ms is null or tempo_consulta_ms >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.processos'::regclass
      and conname = 'processos_confianca_check'
  ) then
    alter table public.processos
      add constraint processos_confianca_check
      check (confianca is null or (confianca >= 0 and confianca <= 1));
  end if;
end $$;

create index if not exists processos_tenant_tribunal_idx
  on public.processos(tenant_id, tribunal_id);
create index if not exists processos_tenant_sistema_idx
  on public.processos(tenant_id, sistema_id);
create index if not exists processos_tenant_crawler_idx
  on public.processos(tenant_id, crawler_id);
create index if not exists processos_origem_status_idx
  on public.processos(tenant_id, origem_extracao, status_extracao);

-- Backfill seguro: so preenche vinculos quando a correspondencia e exata.
-- Os campos tribunal e sistema continuam sendo mantidos para compatibilidade.
update public.processos p
set tribunal_id = t.id
from public.tribunais t
where p.tribunal_id is null
  and p.tribunal is not null
  and upper(trim(p.tribunal)) = t.sigla;

update public.processos p
set sistema_id = s.id
from public.sistemas s
where p.sistema_id is null
  and p.sistema is not null
  and upper(trim(p.sistema)) = upper(s.nome);

-- Registros com sincronizacao conhecida recebem a fonte mais recente.
-- Quando nao existe evidencia de fonte, o processo fica explicitamente legado.
update public.processos
set origem_extracao = case
      when coalesce(ultima_sync_mural, '-infinity'::timestamptz) >= greatest(
        coalesce(ultima_sync_datajud, '-infinity'::timestamptz),
        coalesce(ultima_sync_pje, '-infinity'::timestamptz)
      ) and ultima_sync_mural is not null then 'mural'
      when coalesce(ultima_sync_pje, '-infinity'::timestamptz) >= coalesce(ultima_sync_datajud, '-infinity'::timestamptz)
        and ultima_sync_pje is not null then 'pje_cs'
      when ultima_sync_datajud is not null then 'datajud'
      when source_context = 'private_cs' then 'pje_cs'
      when source_context = 'public' then 'legado'
      else 'legado'
    end,
    status_extracao = case
      when ultima_sync_mural is not null
        or ultima_sync_datajud is not null
        or ultima_sync_pje is not null
        then 'sucesso'
      else 'legado_sem_rastreio'
    end,
    data_extracao = nullif(
      greatest(
        coalesce(ultima_sync_mural, '-infinity'::timestamptz),
        coalesce(ultima_sync_datajud, '-infinity'::timestamptz),
        coalesce(ultima_sync_pje, '-infinity'::timestamptz)
      ),
      '-infinity'::timestamptz
    )
where origem_extracao is null
   or status_extracao is null
   or data_extracao is null;

-- O crawler generico do Mural e usado quando a ultima fonte foi o Mural.
update public.processos p
set crawler_id = c.id,
    versao_crawler = coalesce(p.versao_crawler, c.versao)
from public.crawlers c
where p.crawler_id is null
  and p.origem_extracao = 'mural'
  and c.codigo = 'mural_cs';

-- O DataJud e publico e nao depende de tenant ou de um PJe privado.
update public.processos p
set crawler_id = c.id,
    versao_crawler = coalesce(p.versao_crawler, c.versao)
from public.crawlers c
where p.crawler_id is null
  and p.origem_extracao = 'datajud'
  and c.codigo = 'datajud_publico';

-- So associa o adaptador privado TRT9 quando o processo e do TRT9.
-- Nao infere suporte de CS para outros tribunais.
update public.processos p
set crawler_id = c.id,
    versao_crawler = coalesce(p.versao_crawler, c.versao)
from public.crawlers c
join public.tribunais t on t.id = c.tribunal_id
where p.crawler_id is null
  and p.origem_extracao = 'pje_cs'
  and p.tribunal_id = t.id
  and c.codigo = 'pje_trt9_cs';

comment on column public.processos.tribunal_id is
  'Vinculo normalizado ao catalogo global de tribunais; tribunal continua para exibicao/compatibilidade.';
comment on column public.processos.sistema_id is
  'Vinculo normalizado ao catalogo global de sistemas; sistema continua para exibicao/compatibilidade.';
comment on column public.processos.crawler_id is
  'Adaptador da ultima fonte de enriquecimento conhecida.';
comment on column public.processos.origem_extracao is
  'Ultima fonte que enriqueceu o processo: datajud, mural, pje_cs, manual, legado ou teste.';
comment on column public.processos.status_extracao is
  'Resultado do ultimo enriquecimento conhecido; legado_sem_rastreio indica ausencia de evidencia historica.';
