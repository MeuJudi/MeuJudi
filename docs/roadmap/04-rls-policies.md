# 04 — RLS Policies (Isolamento por Tenant)

> Dependências: Fases 02 e 03 (schemas)
> Duração estimada: 1 dia
> Prioridade: 🔴 Crítica (segurança)

---

## 🎯 Objetivo

Implementar **Row Level Security** em TODAS as tabelas. Cada tenant só vê seus próprios dados, sem exceção. Super Admin vê tudo.

---

## 🛡️ Princípios de segurança

1. **Default deny**: sem policy = ninguém acessa
2. **Tenant isolation**: advogado A nunca vê dados do advogado B
3. **Super admin bypass**: você (Caio) vê tudo
4. **Audit sempre**: ações sensíveis geram log

---

## 🛠️ Funções auxiliares

`supabase/migrations/shared/20260709000010_helper_functions.sql`

```sql
-- =============================================
-- FUNÇÕES AUXILIARES PARA RLS
-- =============================================

-- Retorna o tenant_id do usuário logado
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
  SELECT (
    SELECT tenant_id FROM public.users WHERE id = auth.uid()
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Verifica se é super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Verifica se o tenant está ativo
CREATE OR REPLACE FUNCTION is_tenant_active()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = get_user_tenant_id() AND is_active = true
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Verifica se o tenant está em trial
CREATE OR REPLACE FUNCTION is_tenant_trial()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = get_user_tenant_id() AND is_trial = true
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Verifica se o tenant tem uma feature habilitada
CREATE OR REPLACE FUNCTION tenant_has_feature(feature_name TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.feature_flags
    WHERE name = feature_name
      AND is_enabled = true
      AND (
        target_tenants = '{}' OR
        get_user_tenant_id() = ANY(target_tenants)
      )
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;
```

---

## 🔐 Policies — Schema Shared

`supabase/migrations/shared/20260709000011_rls_shared.sql`

```sql
-- =============================================
-- RLS: SHARED TABLES
-- =============================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE escritorio_oabs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- TENANTS
-- =============================================

-- Usuário vê seu próprio tenant
CREATE POLICY "user_own_tenant" ON tenants
  FOR SELECT
  USING (id = get_user_tenant_id());

-- Super admin vê tudo
CREATE POLICY "super_admin_all_tenants" ON tenants
  FOR ALL
  USING (is_super_admin());

-- Owner pode atualizar seu próprio tenant
CREATE POLICY "owner_update_tenant" ON tenants
  FOR UPDATE
  USING (id = get_user_tenant_id())
  WITH CHECK (id = get_user_tenant_id());

-- =============================================
-- USERS
-- =============================================

-- Usuário vê outros usuários do mesmo tenant
CREATE POLICY "users_tenant_isolation" ON users
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Usuário pode editar seu próprio perfil
CREATE POLICY "users_update_own" ON users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND tenant_id = get_user_tenant_id());

-- Owner pode criar usuários no seu tenant
CREATE POLICY "owner_insert_user" ON users
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Owner pode desativar usuários do seu tenant
CREATE POLICY "owner_delete_user" ON users
  FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND id != auth.uid());

-- Super admin
CREATE POLICY "super_admin_all_users" ON users
  FOR ALL
  USING (is_super_admin());

-- =============================================
-- PLANS
-- =============================================

CREATE POLICY "plans_public_read" ON plans
  FOR SELECT
  USING (is_public = true);

CREATE POLICY "super_admin_plans" ON plans
  FOR ALL
  USING (is_super_admin());

-- =============================================
-- SUBSCRIPTIONS
-- =============================================

CREATE POLICY "users_own_subscription" ON subscriptions
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "super_admin_subscriptions" ON subscriptions
  FOR ALL
  USING (is_super_admin());

-- =============================================
-- PAYMENTS
-- =============================================

CREATE POLICY "users_own_payments" ON payments
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "super_admin_payments" ON payments
  FOR ALL
  USING (is_super_admin());

-- =============================================
-- FEATURE FLAGS
-- =============================================

-- Usuário vê feature flags habilitadas
CREATE POLICY "users_read_features" ON feature_flags
  FOR SELECT
  USING (is_enabled = true);

CREATE POLICY "super_admin_features" ON feature_flags
  FOR ALL
  USING (is_super_admin());

-- =============================================
-- SUPPORT TICKETS
-- =============================================

CREATE POLICY "users_own_tickets" ON support_tickets
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "super_admin_tickets" ON support_tickets
  FOR ALL
  USING (is_super_admin());

-- Mensagens dos tickets
CREATE POLICY "ticket_messages" ON support_ticket_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = support_ticket_messages.ticket_id
      AND (t.tenant_id = get_user_tenant_id() OR is_super_admin())
    )
  );

-- =============================================
-- AUDIT LOGS
-- =============================================

-- Apenas super admin lê audit logs
CREATE POLICY "super_admin_audit" ON audit_logs
  FOR ALL
  USING (is_super_admin());

-- Usuários podem inserir seus próprios logs
CREATE POLICY "users_insert_audit" ON audit_logs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- =============================================
-- ESCRITORIO OABS
-- =============================================

CREATE POLICY "escritorio_oabs_tenant" ON escritorio_oabs
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "super_admin_oabs" ON escritorio_oabs
  FOR ALL
  USING (is_super_admin());
```

---

## 🔐 Policies — Schema MeuJudi

`supabase/migrations/meujudi/20260710000010_rls_meujudi.sql`

```sql
-- Habilitar RLS
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE processos ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comunicacoes_mural ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE anotacoes_processo ENABLE ROW LEVEL SECURITY;
ALTER TABLE regex_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE regex_historico_validacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cert_a1_uso_log ENABLE ROW LEVEL SECURITY;

-- =============================================
-- CLIENTES
-- =============================================

CREATE POLICY "clientes_tenant" ON clientes
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "super_admin_clientes" ON clientes
  FOR ALL
  USING (is_super_admin());

-- =============================================
-- PROCESSOS
-- =============================================

CREATE POLICY "processos_tenant" ON processos
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "super_admin_processos" ON processos
  FOR ALL
  USING (is_super_admin());

-- =============================================
-- MOVIMENTAÇÕES (via processo)
-- =============================================

CREATE POLICY "movimentacoes_via_processo" ON movimentacoes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM processos p
      WHERE p.id = movimentacoes.processo_id
      AND p.tenant_id = get_user_tenant_id()
    )
  );

CREATE POLICY "super_admin_movimentacoes" ON movimentacoes
  FOR ALL
  USING (is_super_admin());

-- =============================================
-- COMUNICAÇÕES MURAL
-- =============================================

CREATE POLICY "comunicacoes_mural_tenant" ON comunicacoes_mural
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "super_admin_comunicacoes" ON comunicacoes_mural
  FOR ALL
  USING (is_super_admin());

-- =============================================
-- AGENDA EVENTOS
-- =============================================

CREATE POLICY "agenda_tenant" ON agenda_eventos
  FOR ALL
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "super_admin_agenda" ON agenda_eventos
  FOR ALL
  USING (is_super_admin());

-- =============================================
-- ANOTAÇÕES PROCESSO
-- =============================================

-- Usuário vê anotações públicas OU suas próprias privadas
CREATE POLICY "anotacoes_public_or_own" ON anotacoes_processo
  FOR SELECT
  USING (
    tenant_id = get_user_tenant_id()
    AND (is_privado = false OR user_id = auth.uid())
  );

CREATE POLICY "anotacoes_insert_own" ON anotacoes_processo
  FOR INSERT
  WITH CHECK (user_id = auth.uid() AND tenant_id = get_user_tenant_id());

CREATE POLICY "anotacoes_update_own" ON anotacoes_processo
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "anotacoes_delete_own" ON anotacoes_processo
  FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "super_admin_anotacoes" ON anotacoes_processo
  FOR ALL
  USING (is_super_admin());

-- =============================================
-- REGEX METADATA
-- =============================================

-- Regex globais (tenant_id IS NULL) são visíveis pra todos
CREATE POLICY "regex_global_or_tenant" ON regex_metadata
  FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id());

CREATE POLICY "regex_insert_own" ON regex_metadata
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() OR is_super_admin());

CREATE POLICY "regex_update_own" ON regex_metadata
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id() OR is_super_admin());

CREATE POLICY "super_admin_regex" ON regex_metadata
  FOR ALL
  USING (is_super_admin());

-- Histórico de validações
CREATE POLICY "regex_hist_own" ON regex_historico_validacoes
  FOR ALL
  USING (tenant_id = get_user_tenant_id() OR is_super_admin());

-- =============================================
-- CERT A1 LOGS
-- =============================================

CREATE POLICY "cert_a1_own" ON cert_a1_uso_log
  FOR ALL
  USING (user_id = auth.uid() OR tenant_id = get_user_tenant_id());

CREATE POLICY "super_admin_cert" ON cert_a1_uso_log
  FOR ALL
  USING (is_super_admin());
```

---

## 🧪 Teste de isolamento

Criar 2 tenants de teste e verificar que um não vê o outro:

```sql
-- Criar 2 tenants de teste
INSERT INTO tenants (name, slug, vertical) VALUES
  ('Escritório A', 'escritorio-a', 'meujudi'),
  ('Escritório B', 'escritorio-b', 'meujudi');

-- Tenant A: criar um processo
-- (assumindo que você está logado como usuário do Tenant A)
INSERT INTO processos (tenant_id, cnj, tribunal)
SELECT id, '00000000000000000001', 'tjpr' FROM tenants WHERE slug = 'escritorio-a';

-- Tenant B: criar um processo
INSERT INTO processos (tenant_id, cnj, tribunal)
SELECT id, '00000000000000000002', 'tjpr' FROM tenants WHERE slug = 'escritorio-b';

-- Teste 1: como usuário do Tenant A, quantos processos vejo?
SET LOCAL request.jwt.claims TO '{"sub": "user-a", "tenant_id": "tenant-a-id"}';
SELECT COUNT(*) FROM processos; -- deve ser 1

-- Teste 2: como super admin, quantos processos vejo?
SET LOCAL request.jwt.claims TO '{"sub": "admin-id", "role": "super_admin"}';
SELECT COUNT(*) FROM processos; -- deve ser 2
```

---

## 📋 Checklist de segurança

- [ ] RLS habilitado em **TODAS** as tabelas
- [ ] Funções auxiliares criadas (`get_user_tenant_id`, `is_super_admin`, etc)
- [ ] Policy de **isolamento** em cada tabela com `tenant_id`
- [ ] Policy de **super admin** em cada tabela
- [ ] Teste: tenant A não vê dados do tenant B
- [ ] Teste: usuário não-super-admin não tem acesso a audit_logs
- [ ] Teste: anotações privadas só visíveis pelo autor
- [ ] Tipos TypeScript regenerados

---

## 📚 Próximo passo

Continue com [`05-auth.md`](05-auth.md).

---

> 📄 **Documento master:** [../../ESPECIFICACAO.md](../../ESPECIFICACAO.md) — todas as decisões em um único arquivo.
>
> 🏢 **MeuJudi é uma vertical** (meujudi) do monorepo multi-tenant. Estrutura: erticals → 	enants → users → dados específicos.
>
> 📂 **Estrutura de pastas** (multi-vertical): lib/verticals/meujudi/ (isolado), lib/verticals/game/ (futuro), migrations/meujudi/, migrations/shared/, migrations/game/.
