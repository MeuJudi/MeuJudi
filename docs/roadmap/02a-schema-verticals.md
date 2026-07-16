# 02a — Schema Verticals (Adição ao Shared)

> Dependências: Fase 02 (Schema Shared)
> Duração estimada: 30 min
> Prioridade: 🔴 Alta (corrigir arquitetura)

---

## 🎯 Objetivo

Adicionar a tabela **`verticals`** separada. A hierarquia correta é:

```
vertical (MeuJudi, game, novo)
  └── tenants (escritórios clientes)
        └── users (advogados)
              └── dados específicos
```

Antes, o `vertical` era só um campo string. Agora vira uma **tabela própria** com:
- id, slug, name
- Configurações específicas
- Planos disponíveis por vertical
- Features habilitadas

---

## 📋 Migration

### `supabase/migrations/shared/20260709000009_create_verticals.sql`

```sql
-- =============================================
-- VERTICALS (Micro SaaS do monorepo)
-- =============================================
-- Cada vertical é um Micro SaaS diferente.
-- Atualmente: 'meujudi' (advocacia)
-- Futuro: 'game', 'novo', etc.
-- =============================================

CREATE TABLE verticals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL, -- 'meujudi', 'game', 'novo'
  name TEXT NOT NULL, -- 'MeuJudi', 'Game de Investigação'
  description TEXT,

  -- Configuração
  logo_url TEXT,
  primary_color TEXT DEFAULT '#1e40af',
  config JSONB DEFAULT '{}',

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT true, -- visível na landing

  -- Planos disponíveis (referência aos plans compartilhados)
  -- Cada vertical tem seus próprios preços
  available_plans UUID[] DEFAULT '{}',

  -- Features específicas da vertical
  features JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT verticals_slug_format CHECK (slug ~ '^[a-z][a-z0-9-]*$')
);

CREATE TRIGGER update_verticals_updated_at BEFORE UPDATE ON verticals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_verticals_slug ON verticals(slug);
CREATE INDEX idx_verticals_is_active ON verticals(is_active);

-- Seed: MeuJudi (ativo) e Game (inativo, futuro)
INSERT INTO verticals (slug, name, description, primary_color, is_active, is_public, features) VALUES
  ('meujudi', 'MeuJudi', 'Gestão de processos jurídicos para escritórios de advocacia', '#1e40af', true, true,
   '["polling_datajud", "polling_mural", "ia_regex", "cert_a1", "agenda", "notificacoes"]'::jsonb),
  ('game', 'Game de Investigação', 'Jogo de mistério e puzzles (em construção)', '#7c3aed', false, false,
   '["casos", "capitulos", "cenas", "puzzles"]'::jsonb);

-- =============================================
-- ALTERAR TENANTS: vertical_id (FK)
-- =============================================

-- Adicionar coluna vertical_id
ALTER TABLE tenants
  ADD COLUMN vertical_id UUID REFERENCES verticals(id);

-- Popular com base no vertical antigo (string)
UPDATE tenants
SET vertical_id = (SELECT id FROM verticals WHERE slug = tenants.vertical);

-- Tornar NOT NULL
ALTER TABLE tenants
  ALTER COLUMN vertical_id SET NOT NULL;

-- Adicionar constraint UNIQUE (tenant_id, vertical_id é óbvio, mas garante)
CREATE INDEX idx_tenants_vertical_id ON tenants(vertical_id);

-- Dropar coluna antiga (vertical TEXT)
ALTER TABLE tenants DROP COLUMN vertical;

-- Renomear para deixar claro
COMMENT ON TABLE verticals IS 'Lista de Micro SaaS (verticais) disponíveis no monorepo';
COMMENT ON COLUMN tenants.vertical_id IS 'A qual vertical (Micro SaaS) este tenant pertence';
```

---

## 🔄 Como fica a hierarquia agora

```
┌─────────────────────────────────────────────────────────────────┐
│                         VERTICALS                                 │
│                                                                  │
│  meujudi ─┐                                                     │
│  game    ─┤                                                     │
│  novo    ─┘                                                     │
│           │                                                      │
│           ▼                                                      │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                      TENANTS                            │    │
│  │                                                          │    │
│  │  tenant_1 (escritório) ─┐                              │    │
│  │  tenant_2 (escritório) ─┤                              │    │
│  │  tenant_3 (escritório) ─┘                              │    │
│  │           │                                              │    │
│  │           ▼                                              │    │
│  │  ┌──────────────────────────────────────┐             │    │
│  │  │               USERS                  │             │    │
│  │  │                                      │             │    │
│  │  │  user_1 (advogado)                   │             │    │
│  │  │  user_2 (advogado)                   │             │    │
│  │  │  user_3 (estagiário)                │             │    │
│  │  └──────────────────────────────────────┘             │    │
│  │           │                                              │    │
│  │           ▼                                              │    │
│  │  ┌──────────────────────────────────────┐             │    │
│  │  │       DADOS ESPECÍFICOS              │             │    │
│  │  │  processos, movimentações,            │             │    │
│  │  │  clientes, agenda, etc.              │             │    │
│  │  └──────────────────────────────────────┘             │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Helpers de query

### `src/lib/verticals/manager.ts`

```typescript
import { createClient } from '@/lib/supabase/server';

export async function getVerticalBySlug(slug: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from('verticals')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();
  return data;
}

export async function listVerticals() {
  const supabase = createClient();
  const { data } = await supabase
    .from('verticals')
    .select('*')
    .eq('is_active', true)
    .eq('is_public', true)
    .order('name');
  return data || [];
}
```

---

## 🛡️ RLS pra verticals

```sql
ALTER TABLE verticals ENABLE ROW LEVEL SECURITY;

-- Qualquer um pode ler verticals ativas
CREATE POLICY "public_read_verticals" ON verticals
  FOR SELECT
  USING (is_active = true);

-- Super admin pode tudo
CREATE POLICY "super_admin_verticals" ON verticals
  FOR ALL
  USING (is_super_admin());

-- Atualizar RLS de tenants pra usar vertical_id
DROP POLICY IF EXISTS "user_own_tenant" ON tenants;
DROP POLICY IF EXISTS "super_admin_all_tenants" ON tenants;

CREATE POLICY "user_own_tenant" ON tenants
  FOR SELECT
  USING (id = get_user_tenant_id());

CREATE POLICY "super_admin_all_tenants" ON tenants
  FOR ALL
  USING (is_super_admin());
```

---

## 🔄 Migração de tenants existentes

Se você já tem tenants com `vertical TEXT`, rode este script:

```sql
-- Verificar se há inconsistências
SELECT t.id, t.name, t.vertical, v.id, v.slug
FROM tenants t
LEFT JOIN verticals v ON v.slug = t.vertical
WHERE v.id IS NULL;

-- Se aparecer, criar a vertical faltante
INSERT INTO verticals (slug, name) VALUES
  ('meujudi', 'MeuJudi')
ON CONFLICT (slug) DO NOTHING;

-- Re-rodar a migração acima
```

---

## ✅ Checklist

- [ ] Migration aplicada com sucesso
- [ ] Tabela `verticals` criada
- [ ] Seed: 'meujudi' e 'game' inseridos
- [ ] Coluna `tenants.vertical` removida
- [ ] Coluna `tenants.vertical_id` (FK) criada
- [ ] RLS atualizado
- [ ] Teste: query retorna tenants com vertical_id correto
- [ ] Teste: RLS ainda funciona (tenant A não vê tenant B)

---

## 📚 Próximo passo

Voltar para [`02-schema-shared.md`](02-schema-shared.md) e continuar.

---

> 📄 **Documento master:** [../../ESPECIFICACAO.md](../../ESPECIFICACAO.md) — todas as decisões em um único arquivo.
>
> 🏢 **MeuJudi é uma vertical** (meujudi) do monorepo multi-tenant. Estrutura: erticals → 	enants → users → dados específicos.
>
> 📂 **Estrutura de pastas** (multi-vertical): lib/verticals/meujudi/ (isolado), lib/verticals/game/ (futuro), migrations/meujudi/, migrations/shared/, migrations/game/.
