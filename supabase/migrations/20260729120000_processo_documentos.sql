-- Links de documentos/peças oficiais descobertos durante a coleta PDPJ —
-- Fase 8 de docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md.
--
-- Guarda só o link oficial (o advogado baixa direto do portal) e metadados
-- de evidência — nunca o PDF em si. O CS não baixa nem envia binário
-- nenhum; isso é reforçado aqui pela ausência de qualquer coluna de
-- conteúdo/arquivo.

create table public.processo_documentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  processo_id uuid not null references public.processos(id) on delete cascade,
  fonte text not null default 'pdpj' check (fonte in ('pdpj', 'datajud', 'mural')),
  url text not null,
  url_hash text not null,
  descoberto_em timestamptz not null default now(),
  unique (tenant_id, processo_id, url_hash)
);

comment on table public.processo_documentos is
  'Links oficiais de documentos/peças descobertos por fonte externa (hoje só PDPJ). Nunca armazena o arquivo — só o link pra download direto pelo advogado.';
comment on column public.processo_documentos.url_hash is
  'sha256(url) — usado pra deduplicação (unique por tenant+processo+hash), evita reprocessar o mesmo link em coletas repetidas.';

create index processo_documentos_processo_idx on public.processo_documentos(processo_id);

alter table public.processo_documentos enable row level security;

create policy "processo_documentos_tenant_read" on public.processo_documentos
  for select to authenticated
  using (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

revoke all on public.processo_documentos from anon;
grant select on public.processo_documentos to authenticated;
