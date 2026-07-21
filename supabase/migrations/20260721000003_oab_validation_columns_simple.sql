-- Migration manual: garantir que as colunas validado_* existem na tabela escritorio_oabs.
-- Rode este SQL no Supabase Dashboard > SQL Editor caso a migration
-- 20260721000002_oab_validation_columns.sql tenha falhado silenciosamente.

alter table public.escritorio_oabs
  add column if not exists validado_em timestamptz,
  add column if not exists validado_nome text,
  add column if not exists validado_situacao text,
  add column if not exists validado_tipo text,
  add column if not exists validado_match boolean;

-- RLS: as policies existentes já cobrem SELECT/UPDATE/DELETE via tenant_id.
-- Adicionamos policy específica de UPDATE apenas se não existir.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'escritorio_oabs'
      and policyname = 'escritorio_oabs_update'
  ) then
    create policy escritorio_oabs_update on public.escritorio_oabs
      for update to authenticated
      using (
        tenant_id = (select tenant_id from public.users where id = auth.uid())
      )
      with check (
        tenant_id = (select tenant_id from public.users where id = auth.uid())
      );
  end if;
end $$;
