-- Pedido sob demanda de binário de documento PDPJ (visualizar/baixar no
-- Web) — só o CS tem sessão autenticada com o Portal, então o Web pede e o
-- CS busca. Realtime avisa o CS instantaneamente (em vez do poll de 30s da
-- fila normal); a linha aqui serve só de "campainha" pro CS, nunca de canal
-- de mutação — claim/complete continuam pelas rotas /api/cs/* de sempre,
-- autenticadas por device_token (mesmo padrão de sync_tasks).
--
-- O PDF em si nunca é gravado aqui — o CS sobe o binário pro bucket privado
-- documentos-temp (ver mais abaixo), e um cron apaga tudo depois de ~15min.
-- Isso é uma cópia efêmera pra uma sessão de visualização, não
-- armazenamento permanente — mantém o princípio de processo_documentos de
-- nunca guardar o PDF de forma duradoura.

create table public.document_fetch_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  device_id uuid references public.cs_devices(id) on delete set null,
  processo_documento_id uuid not null references public.processo_documentos(id) on delete cascade,
  cnj text not null,
  pdpj_documento_id text not null,

  status text not null default 'pending' check (status in (
    'pending', 'claimed', 'fetching', 'done', 'failed', 'expired'
  )),
  storage_path text,
  error_message text,

  requested_by uuid not null references public.users(id) on delete cascade,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

comment on table public.document_fetch_requests is
  'Pedido sob demanda (um documento por vez, disparado por clique) pro CS buscar o PDF binário via hrefBinario e subir pro Storage temporário. Realtime (INSERT) avisa o CS; claim/complete passam pelas rotas /api/cs/document-requests/* com device_token, nunca por RLS de escrita direta.';
comment on column public.document_fetch_requests.pdpj_documento_id is
  'UUID do documento no Codex do PDPJ, extraído do path de hrefBinario/hrefTexto (ver processo_documentos.pdpj_documento_id).';
comment on column public.document_fetch_requests.storage_path is
  'Path dentro do bucket privado documentos-temp — só existe enquanto status=done e antes do cron de limpeza apagar.';
comment on column public.document_fetch_requests.expires_at is
  'Prazo pro cron de limpeza apagar a linha e o objeto no Storage (~15min), completo ou não — nunca vira armazenamento permanente do PDF.';

create index document_fetch_requests_tenant_pending_idx
  on public.document_fetch_requests(tenant_id, created_at)
  where status = 'pending';
create index document_fetch_requests_expires_idx
  on public.document_fetch_requests(expires_at);
create index document_fetch_requests_processo_documento_idx
  on public.document_fetch_requests(processo_documento_id);

alter table public.document_fetch_requests enable row level security;

-- Usuário real do tenant: cria o pedido e acompanha o próprio (pra
-- assinar Realtime UPDATE na linha e saber quando storage_path aparece).
create policy "document_fetch_requests_tenant_select" on public.document_fetch_requests
  for select to authenticated
  using (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create policy "document_fetch_requests_tenant_insert" on public.document_fetch_requests
  for insert to authenticated
  with check (tenant_id = public.current_user_tenant_id() and requested_by = auth.uid());

-- JWT de device (assinado pelo Web com SUPABASE_JWT_SECRET, claim custom
-- tenant_id — NÃO é uma sessão de public.users, por isso não dá pra usar
-- current_user_tenant_id() aqui). Só leitura: é a "campainha" que acorda o
-- CS via Realtime; claim/complete continuam nas rotas /api/cs/* com
-- service role, nunca por RLS de escrita do device.
create policy "document_fetch_requests_device_select" on public.document_fetch_requests
  for select to authenticated
  using (tenant_id = ((auth.jwt() ->> 'tenant_id'))::uuid);

revoke all on public.document_fetch_requests from anon;
grant select, insert on public.document_fetch_requests to authenticated;

-- Documento PDPJ ganha o UUID dele no Codex como coluna própria — evita
-- re-parsear a URL toda vez que precisarmos buscar o binário sob demanda.
alter table public.processo_documentos
  add column if not exists pdpj_documento_id text;

comment on column public.processo_documentos.pdpj_documento_id is
  'UUID do documento no Codex do PDPJ, extraído do path de hrefBinario/hrefTexto (ex: /processos/{cnj}/documentos/{id}/binario).';

-- Backfill pra linhas já coletadas antes desta coluna existir — mesmo
-- regex de extração que meujudi-cs/src/main/pdpj-api-helpers.ts usa
-- (\/documentos\/([^/]+)\/) aplicado sobre a url já salva.
update public.processo_documentos
set pdpj_documento_id = (regexp_match(url, '/documentos/([^/]+)/'))[1]
where pdpj_documento_id is null
  and url ~ '/documentos/[^/]+/';

-- Bucket privado pro binário temporário. Diferente de avatars/tenant-logos
-- (públicos, nunca versionados em migration) — este é privado e criado
-- aqui de propósito: nenhuma policy pra authenticated/anon, só o service
-- role (rotas /api/cs/document-requests/* e o cron de limpeza) acessa; o
-- navegador só recebe uma signed URL de vida curta.
insert into storage.buckets (id, name, public)
values ('documentos-temp', 'documentos-temp', false)
on conflict (id) do nothing;
