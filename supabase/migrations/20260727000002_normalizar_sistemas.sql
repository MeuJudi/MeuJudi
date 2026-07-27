-- Padroniza nomes de sistemas conhecidos.
-- NULL significa que o sistema ainda nao foi identificado.

create or replace function public.normalizar_sistema_nome(valor text)
returns text
language plpgsql
immutable
as $$
declare
  chave text;
begin
  if valor is null or btrim(valor) = '' then
    return null;
  end if;

  chave := lower(replace(replace(btrim(valor), ' ', ''), '_', ''));

  if chave in ('invalido', 'inválido') then return null; end if;
  if chave = 'eproc' then return 'EPROC'; end if;
  if chave = 'pje' then return 'PJe'; end if;
  if chave = 'projudi' then return 'Projudi'; end if;
  if chave in ('saj', 'esaj', 'e-saj') then return 'SAJ'; end if;

  return btrim(valor);
end;
$$;

update public.processos
set sistema = public.normalizar_sistema_nome(sistema)
where sistema is distinct from public.normalizar_sistema_nome(sistema);

create or replace function public.normalizar_sistema_processos_trigger()
returns trigger
language plpgsql
as $$
begin
  new.sistema := public.normalizar_sistema_nome(new.sistema);
  return new;
end;
$$;

drop trigger if exists processos_normalizar_sistema on public.processos;
create trigger processos_normalizar_sistema
before insert or update of sistema on public.processos
for each row execute function public.normalizar_sistema_processos_trigger();

comment on function public.normalizar_sistema_nome(text) is
  'Padroniza EPROC, PJe, Projudi e SAJ; converte sistema invalido para NULL.';
