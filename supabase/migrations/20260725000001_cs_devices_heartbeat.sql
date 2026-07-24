-- Presenca e metadados operacionais enviados pelo MeuJudi CS.
-- O token do dispositivo continua armazenado apenas como hash.

alter table public.cs_devices
  add column if not exists last_heartbeat timestamptz,
  add column if not exists status text not null default 'offline',
  add column if not exists app_version text,
  add column if not exists last_activity text,
  add column if not exists pending_tasks integer not null default 0;

alter table public.cs_devices
  drop constraint if exists cs_devices_status_check;

alter table public.cs_devices
  add constraint cs_devices_status_check
  check (status in ('online', 'offline', 'error'));

alter table public.cs_devices
  add constraint cs_devices_pending_tasks_check
  check (pending_tasks >= 0);

create index if not exists cs_devices_tenant_heartbeat_idx
  on public.cs_devices (tenant_id, last_heartbeat desc)
  where revoked_at is null;
