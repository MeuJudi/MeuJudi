-- O diretório alimentado pelo Mural serve apenas para reconhecimento e
-- enriquecimento visual de processos. Ele não valida inscrição da OAB.
drop index if exists public.lawyers_directory_validation_idx;

alter table public.lawyers_directory
  drop column if exists validation_status,
  drop column if exists official_name,
  drop column if exists official_status;

comment on table public.lawyers_directory is
  'Diretorio global de reconhecimento de advogados encontrados em fontes internas. Nao e fonte oficial de validacao de OAB.';
