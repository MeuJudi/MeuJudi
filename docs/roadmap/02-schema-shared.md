# 02 — Schema Shared (Multi-tenant)

> Dependências: Fase 01 (Setup) + **Fase 02a (Schema Verticals)**
> Duração estimada: 1-2 dias
> Prioridade: 🔴 Alta

> ⚠️ **IMPORTANTE:** Antes desta fase, leia [`02a-schema-verticals.md`](02a-schema-verticals.md) que cria a tabela `verticals` (a raiz da hierarquia do monorepo).

---

## 🎯 Objetivo

Criar as tabelas **compartilhadas** (shared) entre todas as verticais — tenants, users, billing, audit, feature flags, support — com RLS e migrations.

**Hierarquia:**
```
verticals (Micro SaaS: meujudi, game, novo)
  └── tenants (escritórios clientes)
        └── users (advogados, funcionários)
```

---

## 📋 Tabelas criadas

| Tabela | Descrição |
|---|---|
| `tenants` | Escritório de advocacia (cliente do SaaS) |
| `users` | Usuários do sistema (advogados, funcionários) |
| `plans` | Planos do SaaS (Starter, Pro, Business) |
| `subscriptions` | Assinatura do tenant |
| `payments` | Pagamentos registrados via Stripe |
| `feature_flags` | Features habilitadas/desabilitadas |
| `support_tickets` | Tickets de suporte |
| `audit_logs` | Logs de auditoria (LGPD) |

---

## 🗂️ Migrations

### 001 — Create tenants

`supabase/migrations/shared/20260709000000_create_tenants.sql`

```sql
-- =============================================
-- TENANTS (escritórios de advocacia)
-- =============================================
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  vertical TEXT NOT NULL DEFAULT 'meujudi',

  -- Dados do escritório
  cnpj TEXT,
  oab_principal TEXT,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  telefone TEXT,
  email TEXT,
  website TEXT,
  logo_url TEXT,

  -- Configuração
  primary_color TEXT DEFAULT '#1e40af',
  secondary_color TEXT DEFAULT '#ffffff',
  features JSONB DEFAULT '{}',
  config JSONB DEFAULT '{}',

  -- Stripe
  stripe_customer_id TEXT UNIQUE,
  subscription_id UUID, -- FK adicionada depois

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_trial BOOLEAN DEFAULT true,
  trial_ends_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  suspension_reason TEXT,

  -- Auditoria
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT tenants_vertical_check CHECK (vertical IN ('meujudi', 'game', 'novo'))
);

-- Índices
CREATE INDEX idx_tenants_vertical ON tenants(vertical);
CREATE INDEX idx_tenants_is_active ON tenants(is_active);
CREATE INDEX idx_tenants_stripe_customer ON tenants(stripe_customer_id);

-- Trigger: atualiza updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 002 — Create plans

`supabase/migrations/shared/20260709000001_create_plans.sql`

```sql
-- =============================================
-- PLANS (planos do SaaS)
-- =============================================
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'brl',
  interval TEXT DEFAULT 'month',

  -- Limites
  max_advogados INTEGER,
  max_processos INTEGER,
  max_oabs INTEGER,

  -- Features
  features JSONB DEFAULT '[]',
  has_ia BOOLEAN DEFAULT false,
  has_cert_a1 BOOLEAN DEFAULT false,

  -- Stripe
  stripe_price_id TEXT UNIQUE,
  stripe_product_id TEXT,

  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed: 4 planos padrão
INSERT INTO plans (name, display_name, description, price_cents, max_advogados, max_processos, max_oabs, has_ia, has_cert_a1, sort_order, features) VALUES
  ('starter', 'Starter', 'Ideal para escritórios pequenos começando a digitalizar', 9900, 2, 200, 1, false, false, 1,
   '["dashboard_basico", "polling_datajud", "suporte_email"]'::jsonb),
  ('pro', 'Pro', 'Para escritórios em crescimento com mais processos', 24900, 5, 1000, 5, true, false, 2,
   '["dashboard_avancado", "polling_datajud", "polling_mural", "ia_regex", "notificacoes_push", "suporte_prioritario"]'::jsonb),
  ('business', 'Business', 'Para escritórios consolidados com alto volume', 49900, 15, 5000, 15, true, true, 3,
   '["dashboard_avancado", "polling_datajud", "polling_mural", "ia_regex", "cert_a1_service", "notificacoes_push", "suporte_dedicado"]'::jsonb),
  ('enterprise', 'Enterprise', 'Solução personalizada para grandes bancas', 0, NULL, NULL, NULL, true, true, 4,
   '["tudo_incluso", "sla_personalizado", "suporte_24_7"]'::jsonb);
```

### 003 — Create users

`supabase/migrations/shared/20260709000002_create_users.sql`

```sql
-- =============================================
-- USERS (advogados e funcionários)
-- =============================================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'lawyer',
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,

  -- Dados OAB
  oab_number TEXT,
  oab_uf TEXT,

  -- Cert. A1 (criptografado em produção)
  cert_a1_encrypted TEXT,
  cert_a1_password_hash TEXT,
  cert_a1_installed_at TIMESTAMPTZ,
  cert_a1_last_used_at TIMESTAMPTZ,
  cert_a1_fingerprint TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_owner BOOLEAN DEFAULT false,
  last_login_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT users_role_check CHECK (role IN ('owner', 'lawyer', 'staff', 'super_admin')),
  CONSTRAINT users_oab_format CHECK (oab_number IS NULL OR oab_number ~ '^[0-9]+$'),
  CONSTRAINT users_oab_uf_format CHECK (oab_uf IS NULL OR length(oab_uf) = 2)
);

-- Trigger: cria user quando auth.users é criado
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'lawyer'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_oab ON users(oab_number, oab_uf);
```

### 004 — Create subscriptions

`supabase/migrations/shared/20260709000003_create_subscriptions.sql`

```sql
-- =============================================
-- SUBSCRIPTIONS (assinatura do tenant)
-- =============================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  plan_id UUID REFERENCES plans(id) NOT NULL,

  -- Stripe
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  stripe_price_id TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'trialing',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(tenant_id),
  CONSTRAINT subscriptions_status_check CHECK (status IN (
    'trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid'
  ))
);

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- Adiciona FK em tenants.subscription_id
ALTER TABLE tenants
  ADD CONSTRAINT tenants_subscription_id_fkey
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL;
```

### 005 — Create payments

`supabase/migrations/shared/20260709000004_create_payments.sql`

```sql
-- =============================================
-- PAYMENTS (pagamentos)
-- =============================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,

  -- Stripe
  stripe_payment_id TEXT UNIQUE,
  stripe_invoice_id TEXT,
  stripe_charge_id TEXT,

  -- Dados
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'brl',
  status TEXT NOT NULL,
  payment_method TEXT, -- 'card', 'pix', 'boleto'
  payment_method_details JSONB,

  description TEXT,
  receipt_url TEXT,
  metadata JSONB DEFAULT '{}',

  -- Refund
  refunded_amount_cents INTEGER DEFAULT 0,
  refunded_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT payments_status_check CHECK (status IN (
    'pending', 'succeeded', 'failed', 'refunded', 'partially_refunded', 'canceled'
  ))
);

CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created ON payments(created_at DESC);
```

### 006 — Create feature_flags

`supabase/migrations/shared/20260709000005_create_feature_flags.sql`

```sql
-- =============================================
-- FEATURE FLAGS
-- =============================================
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  is_enabled BOOLEAN DEFAULT false,
  rollout_percentage INTEGER DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),

  -- Targeting
  target_verticals TEXT[] DEFAULT '{}',
  target_plans TEXT[] DEFAULT '{}',
  target_tenants UUID[] DEFAULT '{}',

  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed: features padrão
INSERT INTO feature_flags (name, description, is_enabled, target_verticals) VALUES
  ('mural_polling', 'Habilita polling do Mural Eletrônico', true, ARRAY['meujudi']),
  ('ia_extraction', 'Habilita extração com IA (Claude)', true, ARRAY['meujudi']),
  ('cert_a1_service', 'Habilita serviço de cert. A1', true, ARRAY['meujudi']),
  ('regex_auto_learn', 'Habilita aprendizado automático de regex', true, ARRAY['meujudi']);

CREATE TRIGGER update_feature_flags_updated_at BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 007 — Create support_tickets

`supabase/migrations/shared/20260709000006_create_support_tickets.sql`

```sql
-- =============================================
-- SUPPORT TICKETS
-- =============================================
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'normal',

  -- Atribuição
  assigned_to UUID REFERENCES users(id),

  -- Metadata
  source TEXT DEFAULT 'app', -- 'app', 'email', 'whatsapp'
  tags TEXT[] DEFAULT '{}',

  -- Datas
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT support_tickets_status_check CHECK (status IN (
    'open', 'in_progress', 'waiting_customer', 'resolved', 'closed'
  )),
  CONSTRAINT support_tickets_priority_check CHECK (priority IN (
    'low', 'normal', 'high', 'urgent'
  ))
);

CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_support_tickets_tenant ON support_tickets(tenant_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);

-- Tabela para mensagens do ticket
CREATE TABLE support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id),
  message TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_support_ticket_messages_ticket ON support_ticket_messages(ticket_id);
```

### 008 — Create audit_logs

`supabase/migrations/shared/20260709000007_create_audit_logs.sql`

```sql
-- =============================================
-- AUDIT LOGS (rastreamento LGPD)
-- =============================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Ação
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,

  -- Dados
  old_data JSONB,
  new_data JSONB,
  diff JSONB,

  -- Contexto
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,

  -- Categorização
  category TEXT DEFAULT 'general', -- 'auth', 'data', 'billing', 'admin'
  severity TEXT DEFAULT 'info', -- 'info', 'warning', 'error', 'critical'
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity, entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_category ON audit_logs(category, created_at DESC);

-- Particionamento por mês (opcional, recomendado em produção)
-- CREATE TABLE audit_logs_2026_07 PARTITION OF audit_logs ...
```

### 009 — Create escritorio_oabs

`supabase/migrations/shared/20260709000008_create_escritorio_oabs.sql`

```sql
-- =============================================
-- ESCRITORIO OABS (cada advogado pode ter múltiplas OABs)
-- =============================================
CREATE TABLE escritorio_oabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  oab_number TEXT NOT NULL,
  oab_uf TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(tenant_id, oab_number, oab_uf),
  CONSTRAINT escritorio_oabs_uf_check CHECK (length(oab_uf) = 2),
  CONSTRAINT escritorio_oabs_number_check CHECK (oab_number ~ '^[0-9]+$')
);

CREATE INDEX idx_escritorio_oabs_tenant ON escritorio_oabs(tenant_id);
CREATE INDEX idx_escritorio_oabs_user ON escritorio_oabs(user_id);
CREATE INDEX idx_escritorio_oabs_oab ON escritorio_oabs(oab_number, oab_uf);
```

---

## 🛠️ Funções auxiliares

### `src/lib/supabase/getUserTenant.ts`

```typescript
import { createClient } from './server';

export async function getUserTenant() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('users')
    .select('*, tenant:tenants(*)')
    .eq('id', user.id)
    .single();

  return data;
}
```

### `src/lib/supabase/isSuperAdmin.ts`

```typescript
import { createClient } from './server';

export async function isSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  return data?.role === 'super_admin';
}
```

---

## ✅ Checklist

- [ ] Todas migrations aplicadas com sucesso
- [ ] Tabelas criadas no Supabase
- [ ] Seed dos 4 planos executado
- [ ] Feature flags padrão inseridas
- [ ] Trigger `handle_new_user` funcionando
- [ ] Tipos TypeScript gerados (`npm run supabase:types`)
- [ ] Testar query: `SELECT * FROM plans;` retorna 4 linhas
- [ ] Testar: criar usuário no Auth deve criar linha em `users` automaticamente

---

## 📚 Próximo passo

Continue com [`03-schema-meujudi.md`](03-schema-meujudi.md).

---

> 📄 **Documento master:** [../../ESPECIFICACAO.md](../../ESPECIFICACAO.md) — todas as decisões em um único arquivo.
>
> 🏢 **MeuJudi é uma vertical** (meujudi) do monorepo multi-tenant. Estrutura: erticals → 	enants → users → dados específicos.
>
> 📂 **Estrutura de pastas** (multi-vertical): lib/verticals/meujudi/ (isolado), lib/verticals/game/ (futuro), migrations/meujudi/, migrations/shared/, migrations/game/.
