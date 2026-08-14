-- Envio de logs do MeuJudi Sync sob demanda, liberado por dispositivo pelo
-- painel de Super Admin (nunca automatico/continuo). O CS so mostra o botao
-- de enviar quando `cs_devices.log_upload_enabled` esta true para aquele
-- dispositivo especifico; o servidor tambem confere isso antes de aceitar o
-- upload (o toggle no cliente e so UX, nao e o gate de seguranca real).

alter table public.cs_devices
  add column if not exists log_upload_enabled boolean not null default false;

comment on column public.cs_devices.log_upload_enabled is
  'Liberado manualmente pelo Super Admin para esse dispositivo poder enviar logs locais sob demanda.';

create table if not exists public.cs_log_uploads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  device_id uuid not null references public.cs_devices(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  entry_count integer not null default 0,
  entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cs_log_uploads_tenant_idx
on public.cs_log_uploads(tenant_id, created_at desc);

create index if not exists cs_log_uploads_device_idx
on public.cs_log_uploads(device_id, created_at desc);

alter table public.cs_log_uploads enable row level security;

-- Sem policy de insert: a linha so e criada pela rota /api/cs/logs/upload
-- usando o service role (que ignora RLS), depois de conferir
-- log_upload_enabled no servidor. O CS nunca escreve direto no Supabase
-- pra essa tabela (diferente de diagnostic_reports, que usa a chave anon).

drop policy if exists "cs_log_uploads_super_admin_read" on public.cs_log_uploads;
create policy "cs_log_uploads_super_admin_read" on public.cs_log_uploads
for select
to authenticated
using (public.is_super_admin());

drop policy if exists "cs_log_uploads_super_admin_delete" on public.cs_log_uploads;
create policy "cs_log_uploads_super_admin_delete" on public.cs_log_uploads
for delete
to authenticated
using (public.is_super_admin());

comment on table public.cs_log_uploads is 'Logs locais do MeuJudi Sync enviados sob demanda, so quando liberado por dispositivo.';
comment on column public.cs_log_uploads.entries is 'Linhas WARN/ERROR + eventos importantes do periodo, ja com segredos mascarados no CS antes do envio.';
