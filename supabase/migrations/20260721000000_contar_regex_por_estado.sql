-- IA + Regex: função auxiliar do dashboard do Super Admin (Parte 10).

create or replace function public.contar_regex_por_estado()
returns table(state text, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select state, count(*) from public.regex_metadata group by state;
$$;

revoke all on function public.contar_regex_por_estado() from public;
grant execute on function public.contar_regex_por_estado() to authenticated;
