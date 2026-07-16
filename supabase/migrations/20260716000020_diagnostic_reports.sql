-- Diagnostic reports sent by MeuJudi CS.
-- The desktop app uses the public publishable key to insert reports.
-- Reading is restricted to Super Admin users by RLS.

create table if not exists public.diagnostic_reports (
  id uuid primary key,
  tenant_id uuid references public.tenants(id) on delete set null,
  created_at timestamptz not null default now(),
  meu_judi_version text not null,
  electron_version text,
  node_version text,
  windows_version text,
  arch text,
  hostname text,
  overall_success boolean not null default false,
  cert_a1_found boolean not null default false,
  cert_a1_cpf text,
  cert_a1_expired boolean,
  pje_reachable boolean,
  pje_login_succeeded boolean,
  pje_user_id bigint,
  cert_popup_appeared boolean,
  cert_popup_cancelled boolean,
  cookies_count integer,
  cookies_has_session boolean,
  cookies_has_xsrf boolean,
  total_errors integer not null default 0,
  total_warnings integer not null default 0,
  source text not null default 'meujudi-cs',
  trigger_reason text,
  report_json jsonb not null
);

create index if not exists diagnostic_reports_created_at_idx
on public.diagnostic_reports(created_at desc);

create index if not exists diagnostic_reports_overall_success_idx
on public.diagnostic_reports(overall_success);

create index if not exists diagnostic_reports_hostname_idx
on public.diagnostic_reports(hostname);

create index if not exists diagnostic_reports_tenant_idx
on public.diagnostic_reports(tenant_id, created_at desc);

alter table public.diagnostic_reports enable row level security;

drop policy if exists "diagnostic_reports_insert_from_cs" on public.diagnostic_reports;
create policy "diagnostic_reports_insert_from_cs" on public.diagnostic_reports
for insert
to anon, authenticated
with check (
  source = 'meujudi-cs'
  and jsonb_typeof(report_json) = 'object'
);

drop policy if exists "diagnostic_reports_super_admin_read" on public.diagnostic_reports;
create policy "diagnostic_reports_super_admin_read" on public.diagnostic_reports
for select
to authenticated
using (public.is_super_admin());

drop policy if exists "diagnostic_reports_super_admin_delete" on public.diagnostic_reports;
create policy "diagnostic_reports_super_admin_delete" on public.diagnostic_reports
for delete
to authenticated
using (public.is_super_admin());

comment on table public.diagnostic_reports is 'Diagnostic reports sent by MeuJudi CS.';
comment on column public.diagnostic_reports.report_json is 'Sanitized complete DiagnosticReport payload.';
