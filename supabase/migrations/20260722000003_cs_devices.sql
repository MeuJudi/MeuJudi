-- Pareamento seguro do MeuJudi CS por tenant.
-- O token puro existe somente no CS; o banco armazena apenas SHA-256.

create table public.cs_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  codigo text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.cs_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  device_name text,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create index cs_pairing_codes_lookup_idx on public.cs_pairing_codes(codigo, expires_at)
  where used_at is null;
create index cs_devices_tenant_idx on public.cs_devices(tenant_id)
  where revoked_at is null;

alter table public.cs_pairing_codes enable row level security;
alter table public.cs_devices enable row level security;

create policy "cs_pairing_codes_tenant_all" on public.cs_pairing_codes
  for all to authenticated
  using (tenant_id = public.current_user_tenant_id() or public.is_super_admin())
  with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create policy "cs_devices_tenant_all" on public.cs_devices
  for all to authenticated
  using (tenant_id = public.current_user_tenant_id() or public.is_super_admin())
  with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

revoke all on public.cs_pairing_codes from anon;
revoke all on public.cs_devices from anon;
grant select, insert, update, delete on public.cs_pairing_codes to authenticated;
grant select, insert, update, delete on public.cs_devices to authenticated;
