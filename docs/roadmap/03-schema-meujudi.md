# 03 — Schema MeuJudi (Vertical específico)

> Dependências: Fase 02 (Schema Shared)
> Duração estimada: 1-2 dias
> Prioridade: 🔴 Alta

---

## 🎯 Objetivo

Criar as tabelas **específicas do MeuJudi** — clientes, processos, movimentações, comunicações do Mural, agenda de eventos, regex metadata, logs de cert. A1.

---

## 📋 Tabelas criadas

| Tabela | Descrição |
|---|---|
| `clientes` | Clientes do escritório (parte autora/ré) |
| `processos` | Processos monitorados |
| `movimentacoes` | Movimentações vindas do DataJud |
| `comunicacoes_mural` | Comunicações vindas do Mural Eletrônico |
| `agenda_eventos` | Prazos + audiências unificados |
| `anotacoes_processo` | Anotações internas dos advogados |
| `regex_metadata` | Metadata dos regex com auto-correção |
| `regex_historico_validacoes` | Histórico de validações dos regex |
| `cert_a1_uso_log` | Logs de uso do cert. A1 |

---

## 🗂️ Migrations

### 001 — Create clientes

`supabase/migrations/meujudi/20260710000000_create_clientes.sql`

```sql
-- =============================================
-- CLIENTES (parte do escritório)
-- =============================================
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,

  -- Identificação
  tipo_pessoa TEXT NOT NULL DEFAULT 'fisica', -- 'fisica' | 'juridica'
  nome TEXT NOT NULL,
  cpf_cnpj TEXT, -- criptografar em produção
  cpf_cnpj_hash TEXT, -- hash pra busca (LGPD-safe)
  email TEXT,
  telefone TEXT,
  celular TEXT,

  -- Endereço
  cep TEXT,
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,

  -- Metadados
  observacoes TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',

  -- Auditoria
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT clientes_tipo_pessoa_check CHECK (tipo_pessoa IN ('fisica', 'juridica'))
);

CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_clientes_tenant ON clientes(tenant_id);
CREATE INDEX idx_clientes_nome ON clientes(tenant_id, nome);
CREATE INDEX idx_clientes_cpf_cnpj_hash ON clientes(tenant_id, cpf_cnpj_hash);
CREATE INDEX idx_clientes_tags ON clientes USING GIN (tenant_id, tags);

-- Função: criptografar CPF/CNPJ (pseudocódigo, usar pgcrypto em produção)
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- CREATE OR REPLACE FUNCTION encrypt_cpf(cpf TEXT) RETURNS TEXT AS $$
--   SELECT encode(pgp_sym_encrypt($1, current_setting('app.encryption_key')), 'base64');
-- $$ LANGUAGE SQL;
```

### 002 — Create processos

`supabase/migrations/meujudi/20260710000001_create_processos.sql`

```sql
-- =============================================
-- PROCESSOS
-- =============================================
CREATE TABLE processos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,

  -- Identificação
  cnj TEXT NOT NULL, -- 20 dígitos sem pontuação
  tribunal TEXT NOT NULL, -- 'tjpr', 'tjsp', 'stj', 'trf4', etc
  grau TEXT, -- 'G1', 'G2', 'G3', 'JE', 'TR'
  sistema TEXT, -- 'pje', 'eproc', 'projudi', 'esaj', 'outros'

  -- Capa (DataJud)
  classe_codigo INTEGER,
  classe_nome TEXT,
  assuntos JSONB DEFAULT '[]', -- [{codigo, nome}]
  formato TEXT, -- 'eletronico', 'fisico'
  nivel_sigilo INTEGER DEFAULT 0, -- 0 = público, >0 = sigiloso
  orgao_julgador TEXT,
  orgao_julgador_codigo INTEGER,
  municipio_ibge INTEGER,
  data_ajuizamento DATE,

  -- Partes (vindas do Mural)
  autor TEXT,
  autor_documento TEXT,
  reu TEXT,
  reu_documento TEXT,
  outros_envolvidos JSONB DEFAULT '[]', -- [{nome, documento, polo}]

  -- Advogados (vindas do Mural)
  advogados JSONB DEFAULT '[]', -- [{nome, oab, uf, polo}]

  -- Valor (vindas do PJe + Mural)
  valor_causa NUMERIC(15, 2),

  -- Prazos e audiências
  prazo_proxima_resposta DATE,
  proxima_audiencia DATE,
  proxima_audiencia_tipo TEXT, -- 'conciliacao', 'instrucao', 'julgamento', 'una'
  proxima_audiencia_local TEXT, -- sala, fórum, "online"

  -- Controle interno
  status TEXT DEFAULT 'ativo', -- 'ativo', 'suspenso', 'arquivado', 'concluido'
  tipo_processo TEXT, -- 'novo', 'recurso', 'execucao', 'outros'
  tags TEXT[] DEFAULT '{}',
  responsavel_id UUID REFERENCES users(id),
  observacoes TEXT,

  -- UX
  is_favorito BOOLEAN DEFAULT false,
  cor_etiqueta TEXT, -- pra UI destacar

  -- Sync
  ultima_sync_datajud TIMESTAMPTZ,
  ultima_sync_mural TIMESTAMPTZ,
  ultima_sync_pje TIMESTAMPTZ,
  data_ultima_movimentacao TIMESTAMPTZ, -- denormalizado pra queries rápidas

  -- Detecção de novidade
  ultima_movimentacao_vista_em TIMESTAMPTZ,
  ultima_movimentacao_vista_por UUID REFERENCES users(id),

  -- Auditoria
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(tenant_id, cnj),
  CONSTRAINT processos_cnj_format CHECK (cnj ~ '^[0-9]{20}$'),
  CONSTRAINT processos_nivel_sigilo_check CHECK (nivel_sigilo >= 0),
  CONSTRAINT processos_status_check CHECK (status IN ('ativo', 'suspenso', 'arquivado', 'concluido'))
);

CREATE TRIGGER update_processos_updated_at BEFORE UPDATE ON processos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Índices
CREATE INDEX idx_processos_tenant ON processos(tenant_id);
CREATE INDEX idx_processos_cnj ON processos(tenant_id, cnj);
CREATE INDEX idx_processos_cliente ON processos(cliente_id);
CREATE INDEX idx_processos_tribunal ON processos(tenant_id, tribunal);
CREATE INDEX idx_processos_status ON processos(tenant_id, status);
CREATE INDEX idx_processos_responsavel ON processos(responsavel_id);
CREATE INDEX idx_processos_data_ultima_mov ON processos(tenant_id, data_ultima_movimentacao DESC);
CREATE INDEX idx_processos_audiencia ON processos(tenant_id, proxima_audiencia)
  WHERE proxima_audiencia IS NOT NULL;
CREATE INDEX idx_processos_prazo ON processos(tenant_id, prazo_proxima_resposta)
  WHERE prazo_proxima_resposta IS NOT NULL;
CREATE INDEX idx_processos_favoritos ON processos(tenant_id, is_favorito)
  WHERE is_favorito = true;
CREATE INDEX idx_processos_tags ON processos USING GIN (tenant_id, tags);

-- Função helper: formatar CNJ com pontuação
CREATE OR REPLACE FUNCTION format_cnj(cnj TEXT)
RETURNS TEXT AS $$
  SELECT SUBSTRING(cnj, 1, 7) || '-' ||
         SUBSTRING(cnj, 8, 2) || '.' ||
         SUBSTRING(cnj, 10, 4) || '.' ||
         SUBSTRING(cnj, 14, 1) || '.' ||
         SUBSTRING(cnj, 15, 2) || '.' ||
         SUBSTRING(cnj, 17, 4);
$$ LANGUAGE SQL IMMUTABLE;
```

### 003 — Create movimentacoes

`supabase/migrations/meujudi/20260710000002_create_movimentacoes.sql`

```sql
-- =============================================
-- MOVIMENTAÇÕES (DataJud + Mural)
-- =============================================
CREATE TABLE movimentacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  processo_id UUID REFERENCES processos(id) ON DELETE CASCADE NOT NULL,

  -- Dados da movimentação
  data_movimento TIMESTAMPTZ NOT NULL,
  codigo INTEGER NOT NULL, -- código nacional CNJ
  nome TEXT NOT NULL, -- "JUNTADA DE PETIÇÃO", "CONCLUSOS PARA DESPACHO"
  texto_completo TEXT,
  complementos JSONB DEFAULT '[]', -- [{codigo, descricao, valor, nome}]

  -- Órgão (pode mudar entre movimentações)
  orgao_julgador TEXT,
  orgao_julgador_codigo INTEGER,

  -- Origem
  fonte TEXT NOT NULL DEFAULT 'datajud', -- 'datajud' | 'mural' | 'pje' | 'manual'
  fonte_id TEXT, -- ID original (mural_id, etc)

  -- Status de leitura
  is_novo BOOLEAN DEFAULT true,
  visto_por UUID REFERENCES users(id),
  visto_em TIMESTAMPTZ,

  -- Metadata extraído
  prazo_dias INTEGER, -- extraído por regex/IA
  prazo_horas INTEGER,
  prazo_fatal DATE, -- calculado
  tem_anexo BOOLEAN DEFAULT false,
  link_acesso TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(processo_id, data_movimento, codigo, nome)
);

CREATE INDEX idx_movimentacoes_processo ON movimentacoes(processo_id, data_movimento DESC);
CREATE INDEX idx_movimentacoes_tenant ON movimentacoes(tenant_id);
CREATE INDEX idx_movimentacoes_novas ON movimentacoes(tenant_id, is_novo) WHERE is_novo = true;
CREATE INDEX idx_movimentacoes_fonte ON movimentacoes(fonte);
CREATE INDEX idx_movimentacoes_prazo ON movimentacoes(prazo_fatal) WHERE prazo_fatal IS NOT NULL;
```

### 004 — Create comunicacoes_mural

`supabase/migrations/meujudi/20260710000003_create_comunicacoes_mural.sql`

```sql
-- =============================================
-- COMUNICAÇÕES MURAL (Mural Eletrônico)
-- =============================================
CREATE TABLE comunicacoes_mural (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  processo_id UUID REFERENCES processos(id) ON DELETE SET NULL,

  -- ID do Mural (único, evita duplicação)
  mural_id BIGINT UNIQUE NOT NULL,

  -- Dados da comunicação
  data_disponibilizacao DATE NOT NULL,
  sigla_tribunal TEXT NOT NULL,
  tipo_comunicacao TEXT NOT NULL, -- 'Intimação', 'Edital', 'Pauta de Julgamento', etc
  nome_orgao TEXT,
  texto TEXT NOT NULL,
  meio TEXT, -- 'D' = Diário, 'E' = Mural Eletrônico
  link_processo TEXT, -- URL pro PJe/Projudi com token JWT

  -- Dados extraídos
  destinatarios JSONB DEFAULT '[]', -- [{nome, polo}]
  advogados JSONB DEFAULT '[]', -- [{nome, oab, uf, polo}]

  -- Prazo extraído (regex + IA)
  prazo_dias INTEGER,
  prazo_horas INTEGER,
  data_prazo_fatal DATE,
  prazo_extraido_por TEXT, -- 'regex' | 'ia' | 'manual'
  prazo_regex_id UUID, -- FK adicionada depois
  prazo_confianca TEXT DEFAULT 'alta', -- 'alta', 'media', 'baixa'

  -- Audiência extraída
  data_audiencia DATE,
  tipo_audiencia TEXT, -- 'conciliacao', 'instrucao', 'julgamento'
  sala_audiencia TEXT,
  audiencia_extraida_por TEXT,
  audiencia_confianca TEXT,

  -- Valor extraído
  valor_causa_extraido NUMERIC(15, 2),

  -- Auditoria
  fetched_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_comunicacoes_mural_tenant ON comunicacoes_mural(tenant_id);
CREATE INDEX idx_comunicacoes_mural_processo ON comunicacoes_mural(processo_id);
CREATE INDEX idx_comunicacoes_mural_data ON comunicacoes_mural(tenant_id, data_disponibilizacao DESC);
CREATE INDEX idx_comunicacoes_mural_tipo ON comunicacoes_mural(tenant_id, tipo_comunicacao);
CREATE INDEX idx_comunicacoes_mural_tribunal ON comunicacoes_mural(tenant_id, sigla_tribunal);
CREATE INDEX idx_comunicacoes_mural_prazo ON comunicacoes_mural(tenant_id, data_prazo_fatal)
  WHERE data_prazo_fatal IS NOT NULL;
CREATE INDEX idx_comunicacoes_mural_audiencia ON comunicacoes_mural(tenant_id, data_audiencia)
  WHERE data_audiencia IS NOT NULL;
```

### 005 — Create agenda_eventos

`supabase/migrations/meujudi/20260710000004_create_agenda_eventos.sql`

```sql
-- =============================================
-- AGENDA (prazos + audiências + eventos manuais)
-- =============================================
CREATE TABLE agenda_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  processo_id UUID REFERENCES processos(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- responsável

  -- Tipo e descrição
  tipo TEXT NOT NULL, -- 'audiencia', 'prazo', 'reuniao', 'outro'
  titulo TEXT NOT NULL,
  descricao TEXT,

  -- Data/hora
  data_inicio TIMESTAMPTZ NOT NULL,
  data_fim TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT false,
  timezone TEXT DEFAULT 'America/Sao_Paulo',

  -- Local
  local TEXT, -- sala, fórum, "online"
  link_reuniao TEXT,

  -- Origem
  fonte TEXT NOT NULL DEFAULT 'manual', -- 'mural', 'datajud', 'pje', 'manual'
  fonte_id TEXT, -- mural_id, movimentacao_id
  mural_id BIGINT, -- se veio do mural

  -- Status
  status TEXT DEFAULT 'pendente', -- 'pendente', 'concluido', 'cancelado'
  concluido_em TIMESTAMPTZ,
  concluido_por UUID REFERENCES users(id),

  -- Lembrete
  notificar_em TIMESTAMPTZ,
  notificado BOOLEAN DEFAULT false,
  notificado_em TIMESTAMPTZ,

  -- Recorrência (opcional, futuro)
  recorrente BOOLEAN DEFAULT false,
  recorrencia_tipo TEXT, -- 'diaria', 'semanal', 'mensal'
  recorrencia_config JSONB,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT agenda_eventos_tipo_check CHECK (tipo IN ('audiencia', 'prazo', 'reuniao', 'outro')),
  CONSTRAINT agenda_eventos_status_check CHECK (status IN ('pendente', 'concluido', 'cancelado'))
);

CREATE TRIGGER update_agenda_eventos_updated_at BEFORE UPDATE ON agenda_eventos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_agenda_tenant_data ON agenda_eventos(tenant_id, data_inicio);
CREATE INDEX idx_agenda_processo ON agenda_eventos(processo_id);
CREATE INDEX idx_agenda_user ON agenda_eventos(user_id, data_inicio);
CREATE INDEX idx_agenda_tipo ON agenda_eventos(tenant_id, tipo);
CREATE INDEX idx_agenda_pendentes ON agenda_eventos(tenant_id, status, data_inicio)
  WHERE status = 'pendente';
CREATE INDEX idx_agenda_notificar ON agenda_eventos(notificar_em)
  WHERE notificado = false;
```

### 006 — Create anotacoes_processo

`supabase/migrations/meujudi/20260710000005_create_anotacoes_processo.sql`

```sql
-- =============================================
-- ANOTAÇÕES INTERNAS
-- =============================================
CREATE TABLE anotacoes_processo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  processo_id UUID REFERENCES processos(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL NOT NULL,

  texto TEXT NOT NULL,
  is_privado BOOLEAN DEFAULT false, -- só o autor vê

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_anotacoes_processo_updated_at BEFORE UPDATE ON anotacoes_processo
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_anotacoes_processo ON anotacoes_processo(processo_id, created_at DESC);
CREATE INDEX idx_anotacoes_user ON anotacoes_processo(user_id, created_at DESC);
```

### 007 — Create regex_metadata

`supabase/migrations/meujudi/20260710000006_create_regex_metadata.sql`

```sql
-- =============================================
-- REGEX METADATA (sistema de auto-correção)
-- =============================================
CREATE TABLE regex_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL = regex global (compartilhada)

  nome TEXT NOT NULL,
  descricao TEXT,
  regex TEXT NOT NULL,
  flags TEXT DEFAULT '', -- ex: 'i' para case insensitive

  -- Estado
  estado TEXT NOT NULL DEFAULT 'novo', -- 'novo' | 'quente' | 'confiavel' | 'desativada'

  -- Métricas
  total_usos INTEGER DEFAULT 0,
  total_acertos INTEGER DEFAULT 0,
  total_erros INTEGER DEFAULT 0,
  taxa_acerto NUMERIC(5, 4) GENERATED ALWAYS AS (
    CASE WHEN total_usos > 0
         THEN total_acertos::NUMERIC / total_usos
         ELSE 0
    END
  ) STORED,

  -- Auditoria
  criado_por TEXT DEFAULT 'sistema', -- 'sistema' | 'desenvolvedor'
  ultima_validacao_ia TIMESTAMPTZ,
  ultimo_erro TIMESTAMPTZ,
  texto_exemplo TEXT, -- texto onde regex acertou (pra debug)

  -- Versão
  versao INTEGER DEFAULT 1,
  regex_anterior TEXT,
  motivo_mudanca TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT regex_metadata_estado_check CHECK (estado IN ('novo', 'quente', 'confiavel', 'desativada'))
);

CREATE TRIGGER update_regex_metadata_updated_at BEFORE UPDATE ON regex_metadata
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_regex_metadata_tenant ON regex_metadata(tenant_id);
CREATE INDEX idx_regex_metadata_estado ON regex_metadata(estado);
CREATE INDEX idx_regex_metadata_nome ON regex_metadata(nome);

-- Tabela de validações
CREATE TABLE regex_historico_validacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regex_id UUID REFERENCES regex_metadata(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Contexto
  texto TEXT NOT NULL,
  match_regex TEXT,
  match_ia TEXT,

  -- Resultado
  correto BOOLEAN NOT NULL,
  regex_sugerida TEXT,
  contexto JSONB DEFAULT '{}',

  -- Custo
  tokens_usados INTEGER,
  custo_usd NUMERIC(10, 6),

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_regex_historico_regex ON regex_historico_validacoes(regex_id, created_at DESC);
CREATE INDEX idx_regex_historico_tenant ON regex_historico_validacoes(tenant_id);
CREATE INDEX idx_regex_historico_incorretas ON regex_historico_validacoes(regex_id, correto)
  WHERE correto = false;

-- Seed: regex iniciais
INSERT INTO regex_metadata (nome, descricao, regex, estado, criado_por) VALUES
  ('prazo_dias_explicito', 'Captura "Prazo: 15 dias"', 'Prazo:?\s+(\d+)\s+dias?', 'confiavel', 'desenvolvedor'),
  ('prazo_dias_generico', 'Captura "em 15 dias"', 'em\s+(\d+)\s+dias', 'confiavel', 'desenvolvedor'),
  ('prazo_horas', 'Captura "em 48 horas"', 'em\s+(\d+)\s+horas?', 'quente', 'desenvolvedor'),
  ('valor_causa', 'Captura "Valor da Causa: R$ X"', '[Vv]alor\s+da\s+Causa:?\s+R\$\s*([\d.,]+)', 'quente', 'desenvolvedor'),
  ('audiencia_data', 'Captura "audiência para DD/MM/AAAA"', 'audiência\s+(?:de\s+\w+\s+)?(?:designada\s+)?para\s+(?:o\s+dia\s+)?(\d{2}/\d{2}/\d{4})', 'quente', 'desenvolvedor'),
  ('oab_pr', 'Captura OAB do Paraná', 'OAB/?PR\s*(\d+)', 'confiavel', 'desenvolvedor'),
  ('oab_generica', 'Captura OAB qualquer UF', 'OAB/?([A-Z]{2})\s*(\d+)', 'quente', 'desenvolvedor');
```

### 008 — Create cert_a1_uso_log

`supabase/migrations/meujudi/20260710000007_create_cert_a1_uso_log.sql`

```sql
-- =============================================
-- CERT. A1 LOGS (auditoria de uso)
-- =============================================
CREATE TABLE cert_a1_uso_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL NOT NULL,

  -- Ação
  acao TEXT NOT NULL, -- 'login_pje', 'sync_processos', 'download_pdf', 'instalar_cert'

  -- Contexto
  processo_cnj TEXT,
  url_destino TEXT,
  parametros JSONB DEFAULT '{}',

  -- Resultado
  sucesso BOOLEAN NOT NULL,
  erro TEXT,
  duracao_ms INTEGER,

  -- Auditoria
  ip_address INET,
  user_agent TEXT,
  servico_versao TEXT, -- versão do app local

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cert_a1_log_tenant ON cert_a1_uso_log(tenant_id, created_at DESC);
CREATE INDEX idx_cert_a1_log_user ON cert_a1_log(user_id, created_at DESC);
CREATE INDEX idx_cert_a1_log_sucesso ON cert_a1_uso_log(sucesso, created_at DESC)
  WHERE sucesso = false;
```

---

## 🔗 Foreign keys de comunicação

Adicionar FK em `comunicacoes_mural` para `regex_metadata`:

```sql
ALTER TABLE comunicacoes_mural
  ADD CONSTRAINT comunicacoes_mural_prazo_regex_id_fkey
  FOREIGN KEY (prazo_regex_id) REFERENCES regex_metadata(id) ON DELETE SET NULL;
```

---

## ✅ Checklist

- [ ] Todas as 8 migrations aplicadas
- [ ] Tabelas criadas com sucesso
- [ ] Seed dos 7 regex iniciais executado
- [ ] Foreign key `comunicacoes_mural.prazo_regex_id` → `regex_metadata.id` funcionando
- [ ] Tipos TypeScript regenerados
- [ ] Testar insert: criar cliente, criar processo, criar movimentação

---

## 📚 Próximo passo

Continue com [`04-rls-policies.md`](04-rls-policies.md).

---

> 📄 **Documento master:** [../../ESPECIFICACAO.md](../../ESPECIFICACAO.md) — todas as decisões em um único arquivo.
>
> 🏢 **MeuJudi é uma vertical** (meujudi) do monorepo multi-tenant. Estrutura: erticals → 	enants → users → dados específicos.
>
> 📂 **Estrutura de pastas** (multi-vertical): lib/verticals/meujudi/ (isolado), lib/verticals/game/ (futuro), migrations/meujudi/, migrations/shared/, migrations/game/.
