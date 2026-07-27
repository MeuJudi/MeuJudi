-- Padroniza siglas de tribunais sem alterar os slugs usados pelos endpoints.
-- Exibicao e armazenamento: TJPR/TRT9/TRF4.
-- Integracoes continuam usando seus codigos proprios (tjpr/trt9/trf4).

create or replace function public.normalizar_tribunal_sigla(valor text)
returns text
language sql
immutable
as $$
  select case
    when valor is null then null
    else upper(trim(valor))
  end;
$$;

update public.processos
set tribunal = public.normalizar_tribunal_sigla(tribunal)
where tribunal is not null
  and tribunal <> public.normalizar_tribunal_sigla(tribunal);

update public.comunicacoes_mural
set sigla_tribunal = public.normalizar_tribunal_sigla(sigla_tribunal)
where sigla_tribunal is not null
  and sigla_tribunal <> public.normalizar_tribunal_sigla(sigla_tribunal);

create or replace function public.normalizar_tribunal_processos_trigger()
returns trigger
language plpgsql
as $$
begin
  new.tribunal := public.normalizar_tribunal_sigla(new.tribunal);
  return new;
end;
$$;

create or replace function public.normalizar_tribunal_mural_trigger()
returns trigger
language plpgsql
as $$
begin
  new.sigla_tribunal := public.normalizar_tribunal_sigla(new.sigla_tribunal);
  return new;
end;
$$;

drop trigger if exists processos_normalizar_tribunal on public.processos;
create trigger processos_normalizar_tribunal
before insert or update of tribunal on public.processos
for each row execute function public.normalizar_tribunal_processos_trigger();

drop trigger if exists comunicacoes_mural_normalizar_tribunal on public.comunicacoes_mural;
create trigger comunicacoes_mural_normalizar_tribunal
before insert or update of sigla_tribunal on public.comunicacoes_mural
for each row execute function public.normalizar_tribunal_mural_trigger();

comment on function public.normalizar_tribunal_sigla(text) is
  'Normaliza a sigla exibida do tribunal em caixa alta; nao converte para slug de endpoint.';
