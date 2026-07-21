-- Colunas para cache do resultado da validação OAB na própria linha

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'escritorio_oabs'
      and column_name = 'validado_em'
  ) then
    alter table public.escritorio_oabs
      add column validado_em timestamptz,
      add column validado_nome text,
      add column validado_situacao text,
      add column validado_tipo text,
      add column validado_match boolean;
  end if;
end $$;
