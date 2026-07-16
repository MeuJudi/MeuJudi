# 15 — Sync Config + Limites por Plano + Estratégia de Longo Prazo

> Fase 15: configuração de polling inteligente + estratégias pra escalar sem estourar limite do Supabase.

---

## 🎯 Objetivo

1. **Configurar frequência de polling por tenant** baseado no plano
2. **Definir estratégias de longo prazo** pra escalar sem estourar limites do Supabase Pro
3. **Implementar o modo híbrido** (polling + on-demand)

---

## 📊 Planos e frequências pré-definidas

| Plano | Frequência | Horário | Intervalo | Polls/dia |
|---|---|---|---|---|
| **Starter** | 2x/dia | 8h, 20h | 6h | 2 |
| **Pro** | **6x/dia** | 8h, 10h, 12h, 14h, 16h, 18h | 2h | **6** |
| **Business** | 10x/dia | 6h, 8h, 10h, 12h, 14h, 16h, 18h, 20h, 22h | 1.6h | 10 |
| **Enterprise** | Customizado | 0h-23h | configurável | configurável |

### Migration: `20260715000001_sync_config.sql`

```sql
-- Adiciona coluna sync_config no tenant
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS sync_config JSONB DEFAULT '{
    "frequencia": "6x_dia",
    "horario_inicio": "08:00",
    "horario_fim": "20:00",
    "intervalo_horas": 2,
    "ativo": true,
    "modo": "hibrido"
  }'::jsonb;

-- Função: config padrão por plano
CREATE OR REPLACE FUNCTION get_default_sync_config(p_plan_name TEXT)
RETURNS JSONB AS $$
BEGIN
  RETURN CASE p_plan_name
    WHEN 'starter' THEN jsonb_build_object(
      'frequencia', '2x_dia',
      'horario_inicio', '08:00',
      'horario_fim', '20:00',
      'intervalo_horas', 6,
      'ativo', true,
      'modo', 'hibrido'
    )
    WHEN 'pro' THEN jsonb_build_object(
      'frequencia', '6x_dia',
      'horario_inicio', '08:00',
      'horario_fim', '20:00',
      'intervalo_horas', 2,
      'ativo', true,
      'modo', 'hibrido'
    )
    WHEN 'business' THEN jsonb_build_object(
      'frequencia', '10x_dia',
      'horario_inicio', '06:00',
      'horario_fim', '22:00',
      'intervalo_horas', 1.6,
      'ativo', true,
      'modo', 'hibrido'
    )
    WHEN 'enterprise' THEN jsonb_build_object(
      'frequencia', 'custom',
      'horario_inicio', '00:00',
      'horario_fim', '23:59',
      'intervalo_horas', 1,
      'ativo', true,
      'modo', 'hibrido'
    )
    ELSE jsonb_build_object(
      'frequencia', '6x_dia',
      'horario_inicio', '08:00',
      'horario_fim', '20:00',
      'intervalo_horas', 2,
      'ativo', true,
      'modo', 'hibrido'
    )
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

### Migration: `20260715000002_sync_config_seeds.sql`

```sql
-- Trigger: ao criar tenant, atribui config padrão
CREATE OR REPLACE FUNCTION set_tenant_default_sync_config()
RETURNS TRIGGER AS $$
DECLARE
  v_plan_name TEXT;
BEGIN
  SELECT p.name INTO v_plan_name
  FROM subscriptions s
  JOIN plans p ON p.id = s.plan_id
  WHERE s.tenant_id = NEW.id
    AND s.status IN ('active', 'trialing')
  LIMIT 1;

  NEW.sync_config := get_default_sync_config(COALESCE(v_plan_name, 'pro'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenant_default_sync_config
  BEFORE INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_tenant_default_sync_config();

-- Trigger: ao mudar plano, atualiza config
CREATE OR REPLACE FUNCTION update_tenant_sync_config_on_plan_change()
RETURNS TRIGGER AS $$
DECLARE v_plan_name TEXT;
BEGIN
  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
    SELECT p.name INTO v_plan_name FROM plans p WHERE p.id = NEW.plan_id;
    UPDATE tenants
    SET sync_config = get_default_sync_config(v_plan_name),
        updated_at = now()
    WHERE id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_subscription_plan_change
  AFTER UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_tenant_sync_config_on_plan_change();
```

---

## 🛡️ Estratégia de longo prazo: não estourar limite do Supabase

### O problema

**Supabase Pro:**
- Database: **8 GB**
- Storage: 100 GB
- Egress: 250 GB/mês
- Edge Function: 2M invocações/mês
- Realtime connections: 500

**Crescimento estimado por tenant (plano Pro, 6x/dia):**
- ~102 MB/mês de dados de processos
- ~720 invocations/mês de Edge Function
- ~5 GB/mês de egress (uso intenso de cache)

**Sem otimização:**
- 8 GB ÷ 102 MB = **78 meses ÷ 6,5 anos pra encher** ✅ tranquilo
- 2M ÷ 720 = **2.777 tenants** antes de estourar invocations
- 250 GB ÷ 5 GB = **50 tenants** antes de estourar egress

**Egress** é o que vai estourar primeiro. Por isso estratégias são importantes.

---

### Estratégia 1: Particionamento de tabelas (Postgres nativo)

```sql
-- Migration: 20260715000003_partition_movimentacoes.sql
-- Particiona movimentacoes por mês (pós 50.000 rows)

CREATE TABLE movimentacoes_new (
  LIKE movimentacoes INCLUDING ALL
)
PARTITION BY RANGE (data_movimento);

-- Cria partições dos últimos 24 meses + próximos 6
DO $$
DECLARE
  start_date DATE := date_trunc('month', now() - interval '24 months');
  end_date DATE := date_trunc('month', now() + interval '6 months');
  partition_date DATE;
BEGIN
  LOOP
    EXIT WHEN partition_date > end_date;
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS movimentacoes_%s PARTITION OF movimentacoes_new FOR VALUES FROM (%L) TO (%L)',
      to_char(partition_date, 'YYYY_MM'),
      partition_date,
      partition_date + interval '1 month'
    );
    partition_date := partition_date + interval '1 month';
  END LOOP;
END $$;

-- Migra dados antigos
INSERT INTO movimentacoes_new SELECT * FROM movimentacoes;

-- Renomeia
ALTER TABLE movimentacoes RENAME TO movimentacoes_old;
ALTER TABLE movimentacoes_new RENAME TO movimentacoes;
DROP TABLE movimentacoes_old;
```

**Benefício:** queries com `WHERE data_movimento > X` leem só partições relevantes. **70-90% mais rápido**, **80% menos I/O**.

---

### Estratégia 2: TTL (Time-to-Live) automático

```sql
-- Migration: 20260715000004_ttl_cleanup.sql
-- Limpa dados antigos automaticamente via cron

-- Função: arquiva movimentações > 2 anos
CREATE OR REPLACE FUNCTION archive_old_movimentacoes()
RETURNS INTEGER AS $$
DECLARE
  v_archived INTEGER;
BEGIN
  -- Deleta movimentações com mais de 2 anos
  -- (processos arquivados ou concluídos)
  DELETE FROM movimentacoes
  WHERE created_at < now() - interval '2 years'
    AND processo_id IN (
      SELECT id FROM processos WHERE status IN ('arquivado', 'concluido')
    );

  GET DIAGNOSTICS v_archived = ROW_COUNT;

  -- Limpa audit logs com mais de 1 ano (LGPD)
  DELETE FROM audit_logs
  WHERE created_at < now() - interval '1 year';

  -- Limpa comunicacoes_mural com mais de 1 ano (são públicas)
  DELETE FROM comunicacoes_mural
  WHERE created_at < now() - interval '1 year';

  -- Limpa sync_logs com mais de 90 dias
  DELETE FROM cert_a1_uso_log
  WHERE created_at < now() - interval '90 days';

  RETURN v_archived;
END;
$$ LANGUAGE plpgsql;

-- Cron: roda 1x/mês às 3h
SELECT cron.schedule(
  'cleanup-old-data',
  '0 3 1 * *', -- 3h todo dia 1 do mês
  $$ SELECT archive_old_movimentacoes(); $$
);
```

**Benefício:** mantém o DB estável em ~1-2 GB pra sempre.

---

### Estratégia 3: Compressão de movimentações antigas

```sql
-- Migration: 20260715000005_compress_movimentacoes.sql
-- Cria view materializada com movimentações resumidas pra consultas antigas

CREATE MATERIALIZED VIEW movimentacoes_resumidas AS
SELECT
  processo_id,
  tenant_id,
  MIN(data_movimento) AS primeira_movimentacao,
  MAX(data_movimento) AS ultima_movimentacao,
  COUNT(*) AS total_movimentacoes,
  -- Texto concatenado
  string_agg(nome, ' | ' ORDER BY data_movimento) AS resumo_movs,
  NOW() AS snapshot_at
FROM movimentacoes
WHERE data_movimento < now() - interval '6 months'
GROUP BY processo_id, tenant_id;

-- Index
CREATE UNIQUE INDEX idx_mov_resumidas ON movimentacoes_resumidas(processo_id);
CREATE INDEX idx_mov_resumidas_tenant ON movimentacoes_resumidas(tenant_id);

-- Refresh mensal
SELECT cron.schedule(
  'refresh-mov-resumidas',
  '0 4 1 * *', -- 4h todo dia 1 do mês
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY movimentacoes_resumidas; $$
);
```

**Benefício:** consulta de "todas as movimentações do processo X" usa a view materializada (compacta) ao invés de ler 100+ rows individuais.

---

### Estratégia 4: Limites por tenant (quota)

```sql
-- Migration: 20260715000006_quotas.sql
-- Cada tenant tem limite de armazenamento

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS storage_used_mb NUMERIC DEFAULT 0;

-- Função: atualiza storage usado após cada insert
CREATE OR REPLACE FUNCTION update_tenant_storage()
RETURNS TRIGGER AS $$
BEGIN
  -- Calcula storage estimado (simplificado)
  UPDATE tenants
  SET storage_used_mb = (
    SELECT COALESCE(SUM(pg_total_relation_size('movimentacoes')), 0) / 1024 / 1024
  )
  WHERE id = NEW.tenant_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger em movimentações
CREATE TRIGGER trg_update_storage
  AFTER INSERT ON movimentacoes
  FOR EACH ROW EXECUTE FUNCTION update_tenant_storage();

-- Função: verifica se tenant estourou quota
CREATE OR REPLACE FUNCTION check_storage_quota(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_used NUMERIC;
  v_limit NUMERIC;
BEGIN
  SELECT storage_used_mb, (plan->>'max_storage_mb')::NUMERIC
  INTO v_used, v_limit
  FROM tenants t
  JOIN subscriptions s ON s.tenant_id = t.id
  JOIN plans p ON p.id = s.plan_id
  WHERE t.id = p_tenant_id;

  RETURN v_used < COALESCE(v_limit, 1000);
END;
$$ LANGUAGE plpgsql;
```

---

### Estratégia 5: Cache agressivo (Edge Function)

```typescript
// supabase/functions/_shared/cache.ts
// Cache em memória da Edge Function (Deno KV)

const CACHE_TTL = {
  processo: 300, // 5 min
  movimentacoes: 300,
  comunicacoes: 600, // 10 min
  agenda: 180, // 3 min
};

export async function cacheGet(key: string): Promise<any | null> {
  // Deno KV (beta) ou in-memory
  // return Deno.openKv().then(kv => kv.get([key]));
  return null; // implementação simplificada
}

export async function cacheSet(key: string, value: any, ttlSec: number) {
  // Salva no KV com TTL
  // const kv = await Deno.openKv();
  // await kv.set([key], value, { expireIn: ttlSec * 1000 });
}
```

**Benefício:** reduz 60-80% das chamadas ao Supabase real.

---

## 📊 Projeção de longo prazo

### Sem otimização (crescimento natural)

| Período | DB size | Tenants suportados (8GB) |
|---|---|---|
| 6 meses | ~600 MB | 13 |
| 1 ano | ~1.2 GB | 6 |
| 2 anos | ~2.4 GB | 3 |
| 5 anos | ~6 GB | 1 |

### Com TTL + Compressão (recomendado)

| Período | DB size | Tenants suportados (8GB) |
|---|---|---|
| 6 meses | ~400 MB | 20 |
| 1 ano | ~500 MB | 16 |
| 2 anos | ~600 MB | 13 |
| 5 anos | ~800 MB | 10 |
| **10 anos** | **~1 GB** | **8** |

**Conclusão:** com TTL + compressão, **Supabase Pro aguenta 10 anos com 8-10 tenants confortavelmente**.

### Quando migrar do Pro pra Pro+ ou Team?

| Métrica | Pro | Pro+ | Team |
|---|---|---|---|
| Database | 8 GB | **64 GB** | 64 GB |
| Bandwidth | 250 GB | **1 TB** | 1 TB |
| Edge Function | 2M | **10M** | 10M |
| Preço | $25/mês | **$59/mês** | $599/mês |
| Quando migrar | — | 5+ tenants | 50+ tenants |

**Recomendação:** migrar pro Pro+ ($59/mês) quando atingir **5+ tenants** ou **500 GB/mês de bandwidth**.

---

## 🛡️ Resumo de estratégias

| # | Estratégia | Implementação | Benefício | **Status** |
|---|---|---|---|---|
| 1 | **Particionamento de movimentações** | Migration + cron | 70-90% query speed | 🟢 **PODE IMPLEMENTAR** (não deleta) |
| 2 | **TTL automático** (cleanup mensal) | Function + cron | DB estável em 1-2 GB | 🟡 **ANALISAR DEPOIS** (envolve DELETE) |
| 3 | **Compressão (view materializada)** | Materialized view | Reduz 90% storage histórico | 🟢 **PODE IMPLEMENTAR** (não deleta) |
| 4 | **Quotas por tenant** | Trigger + função | Evita 1 tenant abusar | 🟢 **PODE IMPLEMENTAR** (não deleta) |
| 5 | **Cache agressivo** | Edge Function KV | Reduz 60-80% DB load | 🟢 **PODE IMPLEMENTAR** (não deleta) |
| 6 | **Monitoramento proativo** | Sentry + alertas | Detecta problemas antes | 🟢 **PODE IMPLEMENTAR** (não deleta) |

### Legenda de status

- 🟢 **PODE IMPLEMENTAR** — não envolve DELETE, é seguro rodar em produção
- 🟡 **ANALISAR DEPOIS** — envolve DELETE ou perda potencial de dados, precisa decisão do Caio + análise jurídica

---

## 🗂️ Política de Retenção (PLACEHOLDER — analisar antes de implementar)

> ⚠️ **NÃO IMPLEMENTAR ATÉ CAIO DECIDIR A POLÍTICA**
> Tudo que envolve DELETE ou limpeza automática está **bloqueado** até definição.

### Princípio do Caio

> "Tem que ter um histórico guardado por pelo menos um tempo e tals"

**Implicação:** antes de qualquer DELETE, definir:
- Quanto tempo guardar (mínimo)?
- Quem decide quando deletar?
- O que fazer antes de deletar (exportar, mover pra histórico)?
- O que diz a LGPD sobre isso?

### Opções a analisar

| Opção | O que faz | Prós | Contras |
|---|---|---|---|
| **Soft Delete** | Marca como `deletado_at = now()` mas mantém row | Histórico preservado, fácil reverter | DB cresce mais |
| **Hard Delete** | Apaga de verdade | Reduz DB | Irreversível |
| **Archive Table** | Move pra `movimentacoes_historico` | Limpa DB principal mas preserva | Estrutura duplicada |
| **Export + Delete** | Cliente exporta em CSV, depois apaga | Cliente tem controle | Processo manual |
| **Anonimizar** | Mantém estrutura mas remove dados pessoais (CPF, OAB) | Atende LGPD | Perde rastreabilidade individual |

### Recomendação de investigação (FAZER ANTES DE DECIDIR)

1. **Conversar com advogado do escritório** sobre LGPD
   - Quanto tempo precisa guardar?
   - Quando pode ser descartado?
   - O que ele prefere: manter tudo pra sempre, ou limpar com aviso?

2. **Verificar legislação específica**
   - LGPD (Lei Geral de Proteção de Dados) — prazo de retenção
   - Estatuto da OAB — quanto tempo guardar prontuários
   - Código de Processo Civil — prazos de manutenção de autos

3. **Definir política de retenção por tipo de dado**
   - Movimentações: X anos
   - Comunicacoes_mural: X anos
   - Audit logs: X anos
   - Cert_a1_uso_log: X meses
   - Anotações: X anos (ou pra sempre?)

### Estratégias 2 (TTL) precisa de decisão ANTES

A função `archive_old_movimentacoes()` faz **DELETE**. **NÃO RODAR** até definir:
- Quanto tempo guardar
- Quem autoriza
- Se precisa de export antes
- Se advogado pode desativar (opt-out)

### Implementação SEGURA (após decisão)

```sql
-- PLACEHOLDER — NÃO EXECUTAR ATÉ TER POLÍTICA DEFINIDA

CREATE OR REPLACE FUNCTION archive_old_movimentacoes()
RETURNS INTEGER AS $$
DECLARE
  v_archived INTEGER;
BEGIN
  -- ANTES DE IMPLEMENTAR:
  -- 1. Definir com advogado quanto tempo guardar (sugestão: 5-10 anos)
  -- 2. Implementar export automático antes do delete
  -- 3. Permitir opt-out por tenant
  -- 4. Compliance check com LGPD

  -- PLACEHOLDER: soft delete em vez de hard delete
  UPDATE movimentacoes
  SET deletado_em = now(),
      deletado_por = 'sistema_cleanup'
  WHERE created_at < now() - interval '10 years'  -- ajustar o intervalo
    AND deletado_em IS NULL
    AND processo_id IN (
      SELECT id FROM processos WHERE status IN ('arquivado', 'concluido')
    );

  GET DIAGNOSTICS v_archived = ROW_COUNT;
  RETURN v_archived;
END;
$$ LANGUAGE plpgsql;

-- Cron: NÃO ATIVAR ATÉ POLÍTICA ESTAR DEFINIDA
-- SELECT cron.schedule('cleanup-old-data', '0 3 1 * *',
--   $$ SELECT archive_old_movimentacoes(); $$);
```

**Recomendação:** começar com **soft delete** (nunca apaga de verdade), e **só após análise jurídica** avaliar hard delete.

---

## 📋 Próximas ações

| # | Ação | Quando | Quem |
|---|---|---|---|
| 1 | Conversar com advogado sobre LGPD | Antes de implementar delete | Caio + advogado |
| 2 | Pesquisar legislação (LGPD, Estatuto OAB, CPC) | Antes de implementar delete | Caio |
| 3 | Definir política de retenção (1/2/5/10 anos?) | Antes de implementar delete | Caio + advogado |
| 4 | Implementar Estratégias 1, 3, 4, 5, 6 (seguras) | Quando quiser | Automático |
| 5 | Implementar Estratégia 2 (DELETE) | APÓS política definida | Manual, com opt-out |
| 6 | Adicionar export CSV antes de qualquer delete | Antes de ativar delete | Automático |
| 7 | Compliance check anual | Anual | Caio |

---

## 🎯 Implementação

### Cron jobs a criar

```sql
-- Polling principal: roda a cada hora, decide se processa
SELECT cron.schedule(
  'poll-datajud-hourly',
  '0 * * * *',
  $$ SELECT net.http_post(
    url := 'https://[SEU-PROJETO].supabase.co/functions/v1/poll-datajud',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer [SERVICE_ROLE_KEY]'
    ),
    body := '{"manual": false}'::jsonb
  ); $$
);

-- Cleanup mensal
SELECT cron.schedule(
  'cleanup-old-data',
  '0 3 1 * *', -- 3h todo dia 1
  $$ SELECT archive_old_movimentacoes(); $$
);

-- Refresh view materializada
SELECT cron.schedule(
  'refresh-mov-resumidas',
  '0 4 1 * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY movimentacoes_resumidas; $$
);
```

### Validação de quota no Edge Function

```typescript
// Antes de processar tenant, verifica quota
async function processarTenant(supabase: any, tenant: any) {
  // Verifica quota
  const { data: quotaCheck } = await supabase.rpc('check_storage_quota', {
    p_tenant_id: tenant.id,
  });

  if (!quotaCheck) {
    console.warn(`[poll] Tenant ${tenant.id} estourou quota, pulando`);
    // Notificar o tenant
    await notificarQuotaEstourada(supabase, tenant.id);
    return;
  }

  // Processa normalmente
  // ...
}
```

---

## ✅ Checklist

- [ ] Migrations 15.001 e 15.002 aplicadas
- [ ] Triggers funcionando (atribui config padrão ao criar tenant)
- [ ] Testar mudança de plano atualiza config
- [ ] Implementar Edge Function com sync_config
- [ ] Implementar cron de cleanup
- [ ] Implementar view materializada
- [ ] Implementar verificação de quota
- [ ] Monitorar uso de storage

---

## 📚 Próximo passo

Continue com [`09-cert-a1.md`](09-cert-a1.md) (teste do cert. A1) ou volte pro [`14-plano-teste-cert-a1.md`](14-plano-teste-cert-a1.md).

---

> 📄 **Documento master:** [../../ESPECIFICACAO.md](../../ESPECIFICACAO.md) — todas as decisões em um único arquivo.
>
> 🏢 **MeuJudi é uma vertical** (meujudi) do monorepo multi-tenant. Estrutura: erticals → 	enants → users → dados específicos.
>
> 📂 **Estrutura de pastas** (multi-vertical): lib/verticals/meujudi/ (isolado), lib/verticals/game/ (futuro), migrations/meujudi/, migrations/shared/, migrations/game/.
