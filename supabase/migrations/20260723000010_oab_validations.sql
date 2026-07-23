-- Validação profissional de OAB via ConfirmADV (Fase 1 — banco + bloqueio).
-- Ver docs/roadmap/validacao-oab-confirmadv-cs.md. Schema exatamente como
-- sugerido no doc, seção "Modelo de dados sugerido".

create table public.oab_validations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  oab_number text not null,
  oab_uf text not null,
  professional_email text not null,
  requester_name text not null,
  provider text not null default 'confirmadv',
  status text not null default 'pendente' check (status in (
    'pendente', 'aguardando_cs', 'recaptcha_em_andamento', 'aguardando_codigo',
    'validando', 'validada', 'recusada', 'expirada', 'erro', 'cancelada'
  )),
  external_request_id text,
  returned_name text,
  returned_status text,
  returned_email text,
  is_validation boolean,
  requested_at timestamptz not null default now(),
  verified_at timestamptz,
  expires_at timestamptz,
  last_error text,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index oab_validations_tenant_idx on public.oab_validations(tenant_id, status);
create index oab_validations_user_idx on public.oab_validations(user_id);

create trigger update_oab_validations_updated_at
before update on public.oab_validations
for each row execute function public.update_updated_at_column();

alter table public.oab_validations enable row level security;

-- Usuário comum vê só as próprias solicitações; owner vê as do tenant inteiro.
create policy "oab_validations_select" on public.oab_validations
for select to authenticated
using (
  user_id = auth.uid()
  or (tenant_id = public.current_user_tenant_id() and public.is_owner())
  or public.is_super_admin()
);

create policy "oab_validations_insert" on public.oab_validations
for insert to authenticated
with check (
  tenant_id = public.current_user_tenant_id()
  and user_id = auth.uid()
);

-- Update (avançar status, cancelar) — o próprio solicitante ou o owner do tenant.
create policy "oab_validations_update" on public.oab_validations
for update to authenticated
using (
  user_id = auth.uid()
  or (tenant_id = public.current_user_tenant_id() and public.is_owner())
  or public.is_super_admin()
)
with check (
  user_id = auth.uid()
  or (tenant_id = public.current_user_tenant_id() and public.is_owner())
  or public.is_super_admin()
);

-- Auditoria técnica, sem segredos. Escrita fica só para service role (Fases 2-3).
create table public.oab_validation_events (
  id uuid primary key default gen_random_uuid(),
  validation_id uuid not null references public.oab_validations(id) on delete cascade,
  event_type text not null check (event_type in (
    'created', 'cs_received', 'browser_opened', 'captcha_completed',
    'request_created', 'code_pending', 'verified', 'rejected', 'expired',
    'failed', 'cancelled'
  )),
  status_code integer,
  message text,
  created_at timestamptz not null default now()
);

create index oab_validation_events_validation_idx on public.oab_validation_events(validation_id, created_at);

alter table public.oab_validation_events enable row level security;

create policy "oab_validation_events_select" on public.oab_validation_events
for select to authenticated
using (
  exists (
    select 1 from public.oab_validations v
    where v.id = validation_id
      and (
        v.user_id = auth.uid()
        or (v.tenant_id = public.current_user_tenant_id() and public.is_owner())
        or public.is_super_admin()
      )
  )
);
