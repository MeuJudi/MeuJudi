-- ============================================================
--  MeuJudi CS — Tabela de Diagnóstico
--  Armazena relatórios de diagnóstico enviados pelo CS
-- ============================================================

create table if not exists diagnostic_reports (
  id uuid primary key,
  created_at timestamptz not null default now(),

  -- Metadata do ambiente
  meu_judi_version text not null,
  electron_version text,
  windows_version text,
  hostname text,

  -- Resultado geral
  overall_success boolean not null default false,

  -- Cert. A1
  cert_a1_found boolean not null default false,
  cert_a1_cpf text,                           -- null se não achou
  cert_a1_expired boolean,                    -- null se não conseguiu detectar

  -- PJe
  pje_reachable boolean,
  pje_login_succeeded boolean,
  pje_user_id bigint,                         -- id do advogado logado

  -- Popup do cert. A1
  cert_popup_appeared boolean,
  cert_popup_cancelled boolean,

  -- Cookies
  cookies_count integer,
  cookies_has_session boolean,
  cookies_has_xsrf boolean,

  -- Resumo
  total_errors integer not null default 0,
  total_warnings integer not null default 0,

  -- Relatório completo (jsonb)
  report_json jsonb not null,

  -- Auditoria
  tenant_id uuid                              -- null se for usuário free / não logado
);

-- Índices pra queries rápidas no painel Caio
create index if not exists idx_diagnostic_created_at on diagnostic_reports(created_at desc);
create index if not exists idx_diagnostic_overall_success on diagnostic_reports(overall_success);
create index if not exists idx_diagnostic_cert_a1_found on diagnostic_reports(cert_a1_found);
create index if not exists idx_diagnostic_pje_reachable on diagnostic_reports(pje_reachable);
create index if not exists idx_diagnostic_hostname on diagnostic_reports(hostname);

-- RLS: só Caio (super_admin) vê
alter table diagnostic_reports enable row level security;

create policy "super_admin_only" on diagnostic_reports
  for all
  using (
    -- Por enquanto, qualquer um lê (Caio vai restringir quando tiver mais usuários)
    -- Trocar pra: current_setting('app.is_super_admin')::boolean = true
    true
  );

-- Comentários
comment on table diagnostic_reports is 'Relatórios de diagnóstico enviados pelo MeuJudi CS (app desktop)';
comment on column diagnostic_reports.report_json is 'JSON completo do DiagnosticReport (inclui errors, warnings, recommendations)';
comment on column diagnostic_reports.overall_success is 'true se todos os testes passaram';
