# MeuJudi — Especificação Completa do Sistema

> Documento definitivo do MeuJudi: tudo o que foi decidido em 14/07/2026.
> Este é o documento de referência. Para detalhes técnicos, veja `docs/roadmap/`.

---

## 🎯 Contexto: o que é uma "Vertical"

Antes de tudo, é importante entender que **MeuJudi é uma vertical** dentro de um monorepo multi-SaaS.

**Vertical** = um Micro SaaS dentro do mesmo monorepo. Cada vertical tem seu próprio conjunto de features, tabelas, e (futuramente) frontend, mas compartilha a infraestrutura base (auth, billing, super admin, etc).

```
monorepo/
├── vertical "meujudi"  ← ESSE É O PROJETO ATUAL
├── vertical "game"     ← outro Micro SaaS (futuro)
└── vertical "novo"     ← template pra futuras verticais
```

**Por que isso importa:**
- Estrutura do banco tem tabela `verticals` que é a RAIZ
- Cada `tenant` (escritório) está vinculado a uma vertical
- Caio é o super admin de TODAS as verticais
- Quando game voltar, vai ser uma vertical separada, mesmo banco

**Nome da vertical MeuJudi: `meujudi`** (slug usado no banco e no código)

---

## 📑 Índice

1. [Visão Geral](#1-visão-geral)
2. [Contexto: o que é uma Vertical](#-contexto-o-que-é-uma-vertical)
3. [Personas e Casos de Uso](#3-personas-e-casos-de-uso)
4. [Arquitetura de Alto Nível](#4-arquitetura-de-alto-nível)
5. [Stack Tecnológico](#5-stack-tecnológico)
6. [Schema do Banco (decisões principais)](#6-schema-do-banco-decisões-principais)
7. [Os 3 Motores de Captação de Dados](#7-os-3-motores-de-captação-de-dados)
8. [Sistema de Polling Configurável](#8-sistema-de-polling-configurável)
9. [IA + Regex (sistema inteligente)](#9-ia--regex-sistema-inteligente)
10. [Cert. A1 Service (3º motor)](#10-cert-a1-service-3-motor)
11. [Sistema de Auth e Multi-tenancy](#11-sistema-de-auth-e-multi-tenancy)
12. [UI/UX do App](#12-uiux-do-app)
13. [Super Admin (painel central)](#13-super-admin-painel-central)
14. [Stripe Billing (SaaS)](#14-stripe-billing-saas)
15. [MCP Integration (diferencial competitivo)](#15-mcp-integration-diferencial-competitivo)
16. [Estratégias de Longo Prazo](#16-estratégias-de-longo-prazo)
17. [Custos e Projeção Financeira](#17-custos-e-projeção-financeira)
18. [Riscos e Mitigações](#18-riscos-e-mitigações)
19. [Decisões Arquiteturais (com justificativas)](#19-decisões-arquiteturais-com-justificativas)
20. [Roadmap de Implementação](#20-roadmap-de-implementação)
21. [Resalvas Importantes (DELETE)](#21-resalvas-importantes-delete)
22. [Próximos Passos](#22-próximos-passos)

---

## 1. Visão Geral

### O que é

**MeuJudi** (slug: `meujudi`) é uma **vertical** dentro de um **monorepo multi-SaaS** do Caio. Mais especificamente, é um **SaaS multi-tenant** para **escritórios de advocacia** que centraliza o acompanhamento de processos jurídicos. Combina fontes públicas gratuitas (DataJud + Mural Eletrônico) com **Inteligência Artificial** para entregar informações completas que o advogado normalmente teria que buscar em vários sites diferentes.

### Hierarquia do monorepo

```
verticals (tabela)             ← raiz do monorepo
├── meujudi (vertical ATIVA)  ← ESSE PROJETO
│   ├── tenants (escritórios clientes)
│   │   ├── users (advogados)
│   │   │   └── processos, movimentações, mural, etc.
│   └── ...
├── game (vertical INATIVA, futuro)  ← outro Micro SaaS do Caio
│   └── ...
└── novo (template pra futuras verticais)
    └── ...
```

### Funcionalidades principais (do MeuJudi)

- ✅ **Polling automático 6x/dia** (configurável por plano) em todos os processos do escritório via DataJud (CNJ)
- ✅ **Descoberta automática de processos novos** via Mural Eletrônico (filtro por OAB)
- ✅ **Partes, advogados, OABs, próxima audiência** via Mural
- ✅ **Prazos processuais** calculados automaticamente (com tabela de feriados)
- ✅ **Cert. A1 integrado** (serviço local opcional pra PJe/Projudi)
- ✅ **Multi-tenant SaaS** com billing via Stripe
- ✅ **Super Admin** pra você gerenciar todos os escritórios clientes
- ✅ **MCP nativo** — IAs externas (Claude, ChatGPT) conectam ao escritório

### Custo operacional (estimado para 1 escritório)

| Item | Custo mensal |
|---|---|
| Supabase Pro | R$ 130 |
| Vercel Hobby | R$ 0 |
| IA (Claude Haiku) | R$ 5-30 |
| Mural + DataJud | R$ 0 |
| Cert. A1 (anual ÷ 12) | R$ 11-17 |
| **Total** | **R$ 146-177/mês** |

---

## 3. Personas e Casos de Uso

### Personas

| Persona | Quem é | Necessidades |
|---|---|---|
| **Advogado** (Dr. Luis Fellype, OAB 67553) | Usuário final (vertical MeuJudi) | Ver processos atualizados, partes, prazos, audiências, sigilosos |
| **Estagiário** | Usuário final (vertical MeuJudi) | Acompanhar processos sem mexer no cert. A1 |
| **Sócio/Dono** | Admin do escritório (vertical MeuJudi) | Ver faturamento, equipe, status geral |
| **Você (Caio)** | **Super Admin (todas verticais)** | Gerenciar todos os escritórios + SaaS de todas verticais |

### Casos de uso principais

1. **Advogado consulta 1 processo** (vertical MeuJudi)
   - Abre no app
   - Vê capa + partes + advogados + movimentações + próximas audiências
   - Cache retorna em <100ms se foi atualizado há <30min
   - Refresh on-demand se tem mais de 2h

2. **Polling em background** (vertical MeuJudi)
   - Roda N vezes por dia (N depende do plano)
   - Atualiza todos os processos ativos
   - Detecta mudanças e notifica

3. **Descoberta de processos novos** (vertical MeuJudi)
   - Varre Mural por OAB do advogado
   - Lista comunicações dos últimos 7 dias
   - Cria processos novos automaticamente
   - Advogado revisa e confirma

4. **Detecção de audiências e prazos** (vertical MeuJudi)
   - Regex captura padrão "designada para DD/MM/YYYY"
   - Cria evento na agenda
   - Notifica advogado 1 semana antes

5. **Você (super admin) gerencia tudo** (todas verticais)
   - Vê MRR, tenants ativos, alertas
   - Filtra por vertical (meujudi, game, etc)
   - Suspende/reativa tenants
   - Responde tickets de suporte
   - Configura feature flags por vertical

---

## 4. Arquitetura de Alto Nível

```
┌──────────────────────────────────────────────────────────────────────┐
│                        SUPER ADMIN (VOCÊ)                              │
│  Painel em /admin - gerencia todos os escritórios                     │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
┌──────▼────────┐      ┌──────▼────────┐      ┌──────▼────────┐
│  Escritório  │      │  Escritório  │      │  Escritório  │
│  Tenant 1    │      │  Tenant 2    │      │  Tenant 3    │
└──────┬───────┘      └──────┬───────┘      └──────┬───────┘
       │                      │                      │
       └──────────────────────┼──────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  SUPABASE PRO     │
                    │  (R$ 130/mês)     │
                    │                   │
                    │  Schema:          │
                    │  ├── shared/      │ ← tenants, users, billing
                    │  └── meujudi/     │ ← processos, mural
                    │                   │
                    │  RLS por tenant_id │
                    └─────────┬─────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
┌──────▼────────┐      ┌──────▼────────┐      ┌──────▼────────┐
│   DataJud    │      │     Mural    │      │  IA (Claude)  │
│  (CNJ pub)   │      │  Eletrônico  │      │  Haiku/Sonnet│
│    Grátis    │      │    Grátis    │      │  R$ 5-30/mês│
│              │      │              │      │              │
│  Edge Func   │      │  Edge Func   │      │  Edge Func   │
│  6x/dia      │      │  1x/semana   │      │  on-demand   │
└──────────────┘      └──────────────┘      └──────────────┘

              ┌──────────────────────┐
              │  PC DO ADVOGADO       │  (opcional, premium)
              │                      │
              │  ┌────────────────┐  │
              │  │  Cert Service  │  │
              │  │  (Electron)    │  │
              │  │                │  │
              │  │  • Playwright  │  │
              │  │  • cert. A1    │  │
              │  │  • 1x/dia sync │  │
              │  └────────────────┘  │
              └──────────────────────┘
```

### Hierarquia do monorepo

```
vertical (MeuJudi, Game, ...)      ← raiz do monorepo
  └── tenants (escritórios)        ← clientes do SaaS
        └── users (advogados)      ← usuários finais
              └── dados específicos  (processos, movimentações, etc)
```

---

## 4. Stack Tecnológico

| Camada | Tecnologia | Por quê |
|---|---|---|
| **Frontend** | Next.js 14+ (App Router) | SSR, RSC, ecossistema maduro |
| **Estilização** | Tailwind CSS v4 + shadcn/ui | Padrão SaaS moderno |
| **Backend** | Supabase (Postgres + Auth + Edge Functions + Storage) | Tudo integrado |
| **Linguagem** | TypeScript | Type safety, melhor DX |
| **Auth** | Supabase Auth (JWT) | RLS nativo, magic link |
| **Banco de dados** | PostgreSQL (via Supabase) | Robusto, RLS, JSONB |
| **API externas (grátis)** | DataJud + Mural Eletrônico | Cobertura nacional |
| **IA** | Claude Haiku + Sonnet (Anthropic) | Melhor PT-BR, barato |
| **Pagamento** | Stripe (Subscriptions) | Padrão SaaS, PIX + cartão |
| **Email** | Resend | 100 emails/dia grátis |
| **Monitoramento** | Sentry | Free tier 5K erros/mês |
| **Deploy Frontend** | Vercel (Hobby) | Edge, free |
| **Deploy Backend** | Supabase Cloud (Pro) | Tudo na nuvem |
| **Cert Service** (opcional) | Electron + Playwright + node-forge | Acesso PJe/Projudi |
| **MCP Server** (opcional) | Node.js + @modelcontextprotocol/sdk | IAs externas |
| **CI/CD** | GitHub Actions | Lint + typecheck |

---

## 5. Schema do Banco (decisões principais)

### Hierarquia corrigida

```
verticals (MeuJudi, Game, ...)      ← tabela própria
  └── tenants (escritórios)        ← cada tenant = 1 escritório
        └── users (advogados)       ← cada advogado = 1 user
```

### Tabelas shared (todas as verticais)

| Tabela | Função |
|---|---|
| `verticals` | Lista Micro SaaS do monorepo (MeuJudi, Game, ...) |
| `tenants` | Escritório cliente do SaaS |
| `users` | Advogados e funcionários do tenant |
| `escritorio_oabs` | Cada advogado tem 1+ OABs |
| `plans` | Planos do SaaS (Starter, Pro, Business, Enterprise) |
| `subscriptions` | Vínculo tenant-plano |
| `payments` | Pagamentos Stripe |
| `feature_flags` | Features habilitadas por vertical/tenant |
| `support_tickets` | Suporte entre tenant e super admin |
| `audit_logs` | Auditoria (LGPD) |

### Tabelas MeuJudi (específicas)

| Tabela | Função |
|---|---|
| `clientes` | Clientes do escritório |
| `processos` | Processos monitorados (com capa + partes + advogados) |
| `movimentacoes` | Histórico de movimentações (DataJud) |
| `comunicacoes_mural` | Comunicações do Mural Eletrônico |
| `destinatarios_mural` | Partes das comunicações (separado pra query) |
| `advogados_mural` | Advogados das comunicações (separado) |
| `agenda_eventos` | Prazos + audiências (unificado) |
| `anotacoes_processo` | Anotações internas dos advogados |
| `regex_metadata` | Sistema de regex com 3 estados |
| `regex_historico_validacoes` | Histórico de validações de regex |
| `cert_a1_uso_log` | Logs de uso do cert. A1 |

### Decisões importantes do schema

- **`tenants.vertical` é FK** (não string) → facilita queries
- **`movimentacoes.is_novo`** → advogado vê o que ainda não viu
- **`regex_metadata` tem 3 estados** (novo/quente/confiável) → auto-correção
- **`agenda_eventos` unifica** prazos e audiências → uma única timeline
- **`comunicacoes_mural` tem `mural_id` UNIQUE** → evita duplicação

### RLS (Row Level Security) — A peça-chave

```sql
-- Função helper: pegar tenant do user logado
CREATE FUNCTION get_user_tenant_id() RETURNS UUID AS $$
  SELECT (auth.jwt() ->> 'tenant_id')::uuid
$$ LANGUAGE SQL STABLE;

-- Política padrão: cada user só vê seu próprio tenant
CREATE POLICY "tenant_isolation" ON processos
  FOR ALL USING (tenant_id = get_user_tenant_id() OR is_super_admin());
```

**Impossível** advogado A ver dados do advogado B, mesmo com SQL injection.

---

## 6. Os 3 Motores de Captação de Dados

### Motor 1: DataJud (CNJ) — Grátis, oficial

- **API**: `https://api-publica.datajud.cnj.jus.br/api_publica_{sigla}/_search`
- **Auth**: APIKey compartilhada (wiki do CNJ)
- **Cobertura**: 23 de 24 tribunais (STF não tem)
- **Rate limit**: ~30 req/min (não documentado)
- **Latência**: 1-8s por request
- **Custo**: R$ 0

**Dados que retorna:**
- Capa do processo (classe, assunto, sistema, formato)
- Movimentações (com data, código, nome)
- Última atualização

**Não retorna:**
- Partes (autor/réu)
- Advogados
- Valor da causa
- Audiências futuras
- PDFs

### Motor 2: Mural Eletrônico (comunica.pje.jus.br) — Grátis, oficial

- **API**: `https://comunicaapi.pje.jus.br/api/v1/comunicacao`
- **Auth**: Nenhuma (público)
- **Cobertura**: TODOS os tribunais (incluindo juizados, federais, trabalhistas, eleitorais)
- **Rate limit**: ~60 RPM
- **Latência**: 100-500ms por request
- **Custo**: R$ 0

**Dados que retorna (EM JSON ESTRUTURADO):**
- `destinatarios[]` — partes com nome e polo (A/P)
- `destinatarioadvogados[]` — advogados com nome, OAB e UF
- `texto` — texto completo da intimação
- `data_disponibilizacao` — data da publicação
- `tipoComunicacao` — Intimação, Edital, Pauta, etc
- `link` — URL pro PJe/Projudi com token JWT

**Permite buscar por:**
- CNJ específico
- OAB do advogado
- Nome da parte
- UF da OAB
- Range de data
- Tipo de comunicação

### Motor 3: cert. A1 (PJe/Projudi) — Opcional, premium

- **Tecnologia**: Playwright + Windows Cert Store
- **Cobertura**: 100% dos dados do PJe/Projudi (com cert do advogado)
- **Custo**: R$ 130-200/ano (cert) + manutenção do serviço local

**Dados exclusivos (que os outros não têm):**
- Valor da causa (100% dos casos)
- Próximas audiências (campo estruturado)
- Histórico de audiências realizadas
- Processos sigilosos (do próprio advogado)
- PDFs de peças (download direto)
- Texto integral de movimentações
- Partes com CPF/CNPJ

### Como os 3 motores se complementam

| Dado | DataJud | Mural | cert. A1 |
|---|---|---|---|
| Capa (classe, assunto) | ✅ | ❌ | ✅ |
| Movimentações | ✅ | ❌ | ✅ (mais detalhado) |
| Partes (autor/réu) | ❌ | ✅ | ✅ (com CPF) |
| Advogados (OAB) | ❌ | ✅ | ✅ |
| Prazos | ❌ | ✅ (regex) | ✅ (campo) |
| Audiências | ❌ | ✅ (regex) | ✅ (campo) |
| Valor da causa | ❌ | ⚠️ raro | ✅ |
| Sigilosos (próprios) | ❌ | ❌ | ✅ |
| PDFs | ❌ | ❌ | ✅ |

**Cobertura combinada: ~98%** dos dados que o escritório precisa.

### Estratégia do Mural (descoberta por OAB)

```
Advogado cadastra OAB 67553/PR
        ↓
Edge function semanal: ?numeroOab=67553&ufOab=PR
        ↓
8.650 comunicações encontradas
        ↓
Para cada uma:
  - Verifica mural_id (evita duplicação)
  - CNJ existe? Vincula ao processo
  - CNJ novo? Cria processo
  - Extrai prazo (regex)
  - Extrai audiência (regex)
  - Salva destinatários + advogados
        ↓
Processos novos descobertos automaticamente!
```

---

## 7. Sistema de Polling Configurável

### Decisão: Polling 2x/dia → Configurável por plano (escolhido)

| Plano | Frequência | Horário | Polls/dia | Espaço/mês |
|---|---|---|---|---|
| **Starter** | 2x/dia | 8h, 20h | 2 | ~17 MB |
| **Pro** ⭐ | **6x/dia** | 8h-20h, cada 2h | **6** | **~102 MB** |
| **Business** | 10x/dia | 6h-22h, cada 1.6h | 10 | ~170 MB |
| **Enterprise** | Custom | 0h-23h | configurável | variável |

### Modo híbrido (polling + on-demand)

```
┌─────────────────────────────────────────────────────────────┐
│  ARQUITETURA HÍBRIDA                                         │
│                                                              │
│  POLLING EM BACKGROUND (6x/dia)                              │
│  • Atualiza TODOS os processos                              │
│  • Edge Function no Supabase                                │
│  • Sem depender do advogado online                          │
│  • Dados sempre frescos em 4h                              │
│                                                              │
│  +                                                            │
│                                                              │
│  TEMPO REAL (on-demand)                                       │
│  • Advogado abre processo                                    │
│  • Se última sync > 30 min, busca on-demand               │
│  • Cache serve 90% das consultas                            │
│  • IA valida se dados estão "frescos"                       │
│                                                              │
│  +                                                            │
│                                                              │
│  CACHE INTELIGENTE                                            │
│  • < 30 min: usa banco (instantâneo)                       │
│  • 30min-2h: 30% chance de refresh                       │
│  • > 2h: refresh on-demand                                │
│  • Fallback: se rate limit, mostra antigo                  │
└─────────────────────────────────────────────────────────────┘
```

### Cron configurado

```sql
-- Cron: roda a cada hora, Edge Function decide se processa
SELECT cron.schedule(
  'poll-datajud-hourly',
  '0 * * * *',
  $$ SELECT net.http_post(url, body); $$
);
```

A Edge Function verifica o `sync_config.horario_inicio` e `horario_fim` do tenant, e só processa se tá na hora certa. Economiza invocações.

---

## 8. IA + Regex (sistema inteligente)

### Arquitetura em 5 camadas

```
[Texto da intimação]
        ↓
[CAMADA 1: Regex Múltiplos]          ← rápido, grátis
        ↓
[CAMADA 2: Validação de Consistência] ← R$ 0
        ↓
[CAMADA 3: IA Confirmadora (Haiku)]   ← R$ 0,002
        ↓
[CAMADA 4: IA Generalista (Sonnet)]   ← R$ 0,008
        ↓
[CAMADA 5: Auto-correção de Regex]      ← IA sugere novos regex
```

### Sistema de 3 estados dos regex

```
NOVO (100% validado pela IA)
  ↓ (50 usos com >90% acerto)
QUENTE (30% validado - sampling)
  ↓ (200 usos com >98% acerto)
CONFIÁVEL (1% validado - só monitora)
```

### Regex V2 (expandida) — Testada e validada

**Extrai:** data + tipo + horário + local + plataforma + período

**Exemplo de output:**

```typescript
{
  regex_usado: 'audiência tipo + data + horário + plataforma',
  tipo: 'Audiência de instrução',
  data: '29/07/2026',
  data_iso: '2026-07-29',
  hora: '15',
  min: '40',
  plataforma: 'Zoom'
}
```

### Custo mensal estimado

| Cenário | Volume | Custo |
|---|---|---|
| 700 processos × 6x polling | 4.200 polling/dia | R$ 0 (regex resolve) |
| 30% precisa IA camada 3 | 1.260 chamadas/dia | R$ 2,5/dia |
| 5% precisa IA camada 4 | 210 chamadas/dia | R$ 0,6/dia |
| **Total mensal** | ~44.000 chamadas IA | **R$ 10-30/mês** |

---

## 9. Cert. A1 Service (3º motor)

### Arquitetura: Tray icon + Windows Service

```
┌─────────────────────────────────────────────────────────────┐
│  PC DO ADVOGADO (Windows)                                    │
│                                                              │
│  ┌────────────────────────────────────┐                     │
│  │  MeuJudi Cert Service              │                     │
│  │  (Electron + Tray Icon)            │                     │
│  │                                    │                     │
│  │  • Roda em background              │                     │
│  │  • Lê cert. A1 do Windows Store    │                     │
│  │  • 1x/dia: sync com PJe/Projudi    │                     │
│  │  • Envia dados pro Supabase         │                     │
│  │  • Logs locais                     │                     │
│  └────────────────┬───────────────────┘                     │
│                   │                                          │
│  ┌────────────────▼───────────────────┐                     │
│  │  Windows Cert Store                │                     │
│  │  Cert. A1 do advogado (cripto)     │                     │
│  └────────────────────────────────────┘                     │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS + JWT
                       ▼
              ┌────────────────────┐
              │     Supabase        │
              │   - processos       │
              │   - cert_a1_uso_log │
              │   - Edge Functions  │
              └────────────────────┘
```

### Stack do Cert Service

- **Electron** (não Tauri) — Playwright funciona melhor
- **Playwright** — automação do PJe/Projudi
- **node-forge** — leitura do cert. A1
- **Windows Service** — auto-start com Windows
- **Tray icon** — controle visual discreto

### Fluxo de sync (1x/dia às 4h)

```
1. Lê cert. A1 do Windows Cert Store
2. Abre Playwright + Chrome
3. Login automático no PJe/Projudi (mTLS)
4. Navega "Meus processos"
5. Para cada processo:
   - Captura valor da causa
   - Captura partes (autor, réu, advogados)
   - Captura próximas audiências
   - Captura PDFs (se houver)
   - POSTa no Supabase
6. Logout do PJe
7. Atualiza tray icon
```

### Status do cert. A1: TESTE pendente

Caio vai testar com cert. A1 real antes de implementar. 3 fases:
1. POC (login) — 2h
2. Extração (valor, audiências, sigilosos, PDFs) — 4h
3. Stress (10-50 processos) — 3h

---

## 10. Sistema de Auth e Multi-tenancy

### Auth (Supabase Auth)

- Email + senha (mínimo 8 caracteres)
- Magic link (login sem senha)
- Email confirmation no cadastro
- Recuperação de senha via email
- JWT com `tenant_id` no payload
- 7 dias de trial automático

### Multi-tenancy (via tenant_id)

- Cada tenant = 1 escritório
- Todos os dados têm `tenant_id`
- RLS ativa: `USING (tenant_id = get_user_tenant_id())`
- Usuário só vê seus próprios dados
- Super admin vê TUDO via `is_super_admin()`

### Hierarquia de roles

```sql
CONSTRAINT users_role_check CHECK (role IN (
  'super_admin',  -- você (Caio)
  'owner',        -- dono do escritório
  'lawyer',      -- advogado
  'staff'        -- estagiário/assistente
));
```

---

## 11. UI/UX do App

### Páginas principais

```
(platform)/
├── onboarding/        # Setup inicial
├── dashboard/         # Resumo (cards com métricas)
├── processos/
│   ├── page.tsx       # Lista com filtros
│   ├── novo/          # Cadastrar CNJ
│   └── [cnj]/         # Detalhe (capa + movimentações + mural)
├── clientes/          # Cadastro
├── agenda/            # Prazos + audiências unificados
├── equipe/            # Advogados do escritório
├── cert-a1/           # Configurar cert. A1
└── settings/          # OABs, preferências
```

### Layout do Detalhe do Processo (o coração do app)

```
┌──────────────────────────────────────────────────────────────┐
│  0014336-19.2026.8.16.0182                       ⭐           │
│  Procedimento do Juizado Especial da Fazenda Pública         │
│  TJPR · 4º Juizado Especial da Fazenda Pública - Curitiba   │
│                                                              │
│  [Atualizar agora]  [Ver no Projudi]  [⋮ Mais]              │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ CAPA             │  │ PARTES          │                   │
│  │ Classe: 14695    │  │ Autor: EMERSON  │                   │
│  │ Sistema: Eproc   │  │ Réu: MUNICÍPIO  │                   │
│  │ Ajuiz: 14/04/26 │  │                 │                   │
│  │ Última sinc:     │  │ Adv: LUÍS FEL.  │                   │
│  │ 08/07 14:33     │  │ OAB 67553/PR    │                   │
│  └─────────────────┘  └─────────────────┘                   │
│                                                              │
│  ┌──────────────────────────────────────────┐               │
│  │ PRÓXIMOS EVENTOS                         │               │
│  │ 15/07 14:00 - Audiência - 4º Juizado   │               │
│  └──────────────────────────────────────────┘               │
│                                                              │
│  ┌──────────────────────────────────────────┐               │
│  │ MOVIMENTAÇÕES (15)                       │               │
│  │ ● 21/06 [NOVO] Confirmada                │               │
│  │ ● 10/06 Expedição de documento          │               │
│  │ ● 13/05 Petição (Contestação)           │               │
│  │ ...                                       │               │
│  └──────────────────────────────────────────┘               │
│                                                              │
│  ┌──────────────────────────────────────────┐               │
│  │ COMUNICAÇÕES MURAL                       │               │
│  │ [Intimação] 19/06 - JUNTADA CONTESTAÇÃO │               │
│  │ ...                                       │               │
│  └──────────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────────┘
```

### Stack UI

- **Next.js 14+** (App Router, RSC)
- **Tailwind CSS v4** + **shadcn/ui**
- **Lucide** (ícones)
- **Recharts** (gráficos no admin)
- **Sonner** (toasts)
- **Tippy/Hover** (tooltips)

---

## 12. Super Admin (painel central)

### Páginas do Super Admin

```
(super-admin)/
└── admin/
    ├── page.tsx           # Dashboard
    ├── tenants/           # Lista de escritórios
    │   └── [id]/          # Detalhe
    ├── billing/            # Receita
    ├── support/            # Tickets
    ├── features/           # Feature flags
    └── verticals/meujudi/  # Métricas específicas
```

### Dashboard

| Card | Dado |
|---|---|
| **MRR** | R$ X.XXX/mês (soma dos planos ativos) |
| **ARR** | MRR × 12 (projeção anual) |
| **Tenants Ativos** | X escritórios |
| **Em Trial** | X escritórios |
| **Tickets Abertos** | X |
| **Inadimplência** | X (em past_due) |
| **IA Custo Mês** | R$ X,XX |
| **MRR por Vertical** | Gráfico de pizza |

### Ações do Super Admin

- Ver detalhes de qualquer tenant
- Suspender/reativar tenant
- Mudar plano
- Ver audit log
- Responder tickets
- Criar/editar feature flags
- Ver métricas por vertical

---

## 13. Stripe Billing (SaaS)

### Planos

| Plano | Preço | Advogados | Processos | OABs | IA | cert. A1 |
|---|---|---|---|---|---|---|
| Starter | R$ 99/mês | 2 | 200 | 1 | ❌ | ❌ |
| **Pro** ⭐ | **R$ 249/mês** | 5 | 1.000 | 5 | ✅ | ❌ |
| Business | R$ 499/mês | 15 | 5.000 | 15 | ✅ | ✅ |
| Enterprise | Custom | Ilimitado | Ilimitado | Ilimitado | ✅ | ✅ |

### Add-ons

- Advogado extra: R$ 49/mês
- Processos extras (a cada 500): R$ 29/mês
- OABs extras (a cada 5): R$ 19/mês
- Cert. A1 service (suporte): R$ 99/mês (Business é obrigatório)

### Fluxo Stripe

1. Cliente cadastra → trial 7 dias (sem cartão)
2. Após trial, escolhe plano → Stripe Checkout
3. Webhook atualiza `subscriptions` + `tenants.is_active`
4. Renovação automática mensal
5. Em caso de inadimplência: 3 tentativas, depois pausa
6. Customer Portal: cliente gerencia próprio cartão

---

## 14. MCP Integration (diferencial competitivo)

### O que é MCP

**Model Context Protocol** = protocolo aberto (criado pela Anthropic) que padroniza como IAs se conectam a ferramentas externas. É como um "USB-C" pra IAs.

### Servidor MCP do MeuJudi

**Endpoint**: `https://mcp.meujudi.com.br/sse`

**Tools disponíveis:**
- `listar_processos` — lista processos do escritório
- `buscar_processo(cnj)` — busca 1 processo específico
- `resumo_processo(cnj)` — gera resumo executivo com IA
- `listar_movimentacoes(cnj)` — movimentações recentes
- `listar_agenda(periodo)` — prazos + audiências
- `criar_anotacao(cnj, texto)` — cria anotação

**Auth**: OAuth 2.0

**Custo**: R$ 0-5/mês (Fly.io free + IA sob demanda)

### Exemplo de uso pelo advogado

```
Advogado: "Quais audiências eu tenho essa semana?"

Claude (via MCP):
  → chama listar_agenda(data_inicio=hoje, data_fim=+7dias)
  → retorna:
    - 15/07 14:00 - Audiência - 4º Juizado
    - 18/07 10:00 - Pauta de Julgamento - 6ª Câmara
```

**Diferencial**: primeira plataforma de advocacia brasileira com MCP nativo.

---

## 15. Estratégias de Longo Prazo

### Status de cada estratégia

| # | Estratégia | Status | Benefício |
|---|---|---|---|
| 1 | **Particionamento de movimentações** (por mês) | 🟢 **PODE IMPLEMENTAR** | 70-90% query speed |
| 2 | **TTL automático** (cleanup) | 🟡 **ANALISAR DEPOIS** | DB estável em 1-2 GB |
| 3 | **Compressão (view materializada)** | 🟢 **PODE IMPLEMENTAR** | Reduz 90% storage histórico |
| 4 | **Quotas por tenant** | 🟢 **PODE IMPLEMENTAR** | Evita abuso de 1 tenant |
| 5 | **Cache agressivo** (Edge Function KV) | 🟢 **PODE IMPLEMENTAR** | Reduz 60-80% DB load |
| 6 | **Monitoramento** (Sentry + alertas) | 🟢 **PODE IMPLEMENTAR** | Detecta problemas antes |

### Projeção

**Sem otimização:**
- 8 GB aguenta ~6.5 anos (1 tenant)
- Estoura em ~5 anos com 1 tenant

**Com otimização (1, 3, 4, 5, 6):**
- 8 GB aguenta **10+ anos com 8-10 tenants**
- DB fica em 1-2 GB pra sempre

### Roadmap de upgrade do Supabase

| Quando | Plano | Custo | Tenants suportados |
|---|---|---|---|
| 0-5 tenants | **Pro** | $25/mês | 8-10 |
| 5-20 tenants | Pro+ | $59/mês | 30+ |
| 20-50 tenants | Team | $599/mês | 100+ |

---

## 16. Custos e Projeção Financeira

### Custos fixos mensais

| Item | Custo |
|---|---|
| Supabase Pro | R$ 130 |
| Vercel Hobby | R$ 0 |
| Total fixo | **R$ 130** |

### Custos variáveis (por tenant)

| Item | Por tenant/mês |
|---|---|
| IA (Claude Haiku) | R$ 5-30 |
| Mural + DataJud | R$ 0 |
| Cert. A1 (anual ÷ 12) | R$ 11-17 |
| Egress Supabase (intenso) | R$ 5-15 |
| **Total variável** | **R$ 21-62** |

### Custo total por tenant (todos os planos)

| Plano | Preço | Custo operacional | **Margem** |
|---|---|---|---|
| Starter | R$ 99 | R$ 21-62 | **R$ 37-78** (37-79%) |
| Pro | R$ 249 | R$ 21-62 | **R$ 187-228** (75-92%) |
| Business | R$ 499 | R$ 30-80 | **R$ 419-469** (84-94%) |

### Projeção de receita

| # Tenants | Receita mensal | Custo total | Margem |
|---|---|---|---|
| 5 (Pro) | R$ 1.245 | R$ 235-440 | **~70%** |
| 10 (mix) | R$ 3.000 | R$ 470-880 | **~75%** |
| 20 (mix) | R$ 7.000 | R$ 940-1.760 | **~80%** |
| 50 (mix) | R$ 18.000 | R$ 2.350-4.400 | **~80%** |

---

## 17. Riscos e Mitigações

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| 1 | DataJud sair do ar / mudar API | Baixa | Alto | Polling 2x/dia + cache robusto |
| 2 | Mural Eletrônico mudar schema | Baixa | Alto | Abstração via repository pattern |
| 3 | Rate limit excessivo | Média | Médio | Limiter + retry com backoff |
| 4 | Supabase Pro ficar caro | Baixa | Médio | Estratégias de longo prazo definidas |
| 5 | cert. A1 mudar layout PJe | Alta (anual) | Médio | Manutenção mensal de 2h |
| 6 | Advogado esquecer cert no PC | Média | Baixo | Auto-update do serviço |
| 7 | LGPD exigir delete de dados | Alta (regulatória) | Alto | **Política de retenção pendente** |
| 8 | Stripe mudar preços | Baixa | Baixo | Plano Pro aguenta |
| 9 | Concorrente surgir | Média | Alto | Diferencial MCP + cert. A1 |
| 10 | Caio ficar sobrecarregado | Média | Alto | Documentação completa + MCP |

---

## 18. Decisões Arquiteturais (com justificativas)

### Por que monorepo multi-tenant?

**Decisão:** Monorepo multi-tenant com **tabela `verticals`** como raiz.

**Justificativa:** Caio é dev solo, 1 SaaS ativo (MeuJudi), game parado. Monorepo é 3-5x mais rápido de desenvolver. Estrutura de pastas isolada (`lib/verticals/meujudi/`, `lib/verticals/game/`) permite separar no futuro sem reescrever.

**Vantagens do modelo com verticals:**
- Super Admin gerencia TODAS as verticais numa tela só
- Billing compartilhado (Stripe) — game e meujudi usam o mesmo plano de assinatura
- Auth compartilhado — advogado pode ter conta em game e meujudi
- Schema versionado por vertical (migrations separadas)
- Cada vertical tem seus próprios preços, features, e regras

**Quando separar uma vertical:**
- 100+ tenants ativos
- 2+ SaaS com 50+ tenants cada
- Equipe de devs (não solo)
- Venda/spin-off
- Compliance específico

**Decisão registrada:** enquanto game não voltar, MeuJudi é a **única vertical ativa**. Mas a estrutura tá pronta pra game voltar.

### Por que Supabase Pro?

**Decisão:** Supabase Pro ($25/mês).

**Justificativa:** Backups diários (essencial pra dados jurídicos), 8GB DB, RLS nativo, Edge Functions, 250GB bandwidth. Mais barato que rodar Postgres + Auth + Storage separados.

### Por que Stripe?

**Decisão:** Stripe Subscriptions.

**Justificativa:** Padrão SaaS, PIX + cartão + boleto, Customer Portal, webhooks maduros, R$ 0 até começar a cobrar.

### Por que Electron (não Tauri)?

**Decisão:** Electron pro Cert Service.

**Justificativa:** Playwright funciona perfeito no Chromium embedded, comunidade grande, menos risco. Tauri seria melhor em produção com 100+ advogados, mas não é o caso.

### Por que DataJud + Mural (não Escavador)?

**Decisão:** APIs gratuitas primeiro, Escavador como upgrade opcional.

**Justificativa:** 90% dos dados cobertos por R$ 0/mês. Cobre 100% dos casos com cert. A1. Escavador (R$ 1.000+/mês) só pra casos extremos.

### Por que Claude Haiku (não GPT)?

**Decisão:** Claude Haiku como padrão, Sonnet para casos complexos.

**Justificativa:** Melhor PT-BR, menor custo, mesma família (fácil de escalar pra Sonnet). Custo: R$ 0,001-0,005 por chamada.

### Por que Next.js (não SvelteKit / Astro)?

**Decisão:** Next.js 14+ App Router.

**Justificativa:** Ecossistema maduro, RSC, deploy Vercel fácil, shadcn/ui integrado. SvelteKit seria mais leve mas tem menos componentes prontos.

---

## 19. Roadmap de Implementação (10 semanas)

| Semana | Fase | Entrega |
|---|---|---|
| 1 | 01-setup + 02a-verticals + 02-schema + 03-schema | Projeto rodando + DB configurado |
| 2 | 04-rls + 05-auth | RLS + login funcionando |
| 3 | 06-edge-datajud (v2.0 multi-tribunal) + 15-sync-config | Polling 6x/dia configurável |
| 4 | 07-edge-mural + 08-ia-regex (5 camadas) | Polling Mural + IA |
| 5 | 09-cert-a1 (teste POC) | Validar viabilidade do cert. A1 |
| 6 | 10-stripe-billing | Checkout + webhooks |
| 7 | 11-super-admin | Painel central funcionando |
| 8 | 12-ui-app | UI principal completa |
| 9 | 13-mcp-integration (opcional) | MCP server |
| 10 | Testes finais + deploy produção | MVP pronto |

---

## 20. Resalvas Importantes (DELETE)

### Princípio do Caio

> "Tem que ter um histórico guardado por pelo menos um tempo e tals"

**Implicação:** antes de qualquer DELETE automático, definir:
- Quanto tempo guardar (mínimo)?
- Quem decide quando deletar?
- O que fazer antes de deletar (exportar, mover pra histórico)?
- O que diz a LGPD sobre isso?

### Ações ANTES de qualquer DELETE

1. ✅ Conversar com advogado sobre LGPD (quanto tempo guardar)
2. ✅ Pesquisar legislação (LGPD, Estatuto OAB, CPC)
3. ✅ Definir política de retenção (1/2/5/10 anos?)
4. ✅ Implementar export CSV ANTES de qualquer delete
5. ✅ Adicionar opt-out por tenant
6. ✅ Implementar **soft delete** como padrão (não hard delete)
7. ✅ Compliance check anual

### O que NÃO pode ser implementado ainda

- ❌ Função `archive_old_movimentacoes()` — só rodar após definir política
- ❌ Cron de cleanup — NÃO AGENDAR
- ❌ Qualquer DELETE automático — bloqueado até decisão

### O que PODE ser implementado agora

- 🟢 Particionamento de movimentações
- 🟢 Compressão (view materializada)
- 🟢 Quotas por tenant
- 🟢 Cache agressivo
- 🟢 Monitoramento (Sentry + alertas)

---

## 21. Próximos Passos

### Imediato (essa semana)

1. [ ] Definir advogado que vai ceder cert. A1 pro teste
2. [ ] Validar OABs reais do escritório (adicionar ao test-cnj-list.js)
3. [ ] Começar Fase 0 (setup do projeto)

### Curto prazo (2-4 semanas)

4. [ ] Implementar Schema + RLS (fase 02-04)
5. [ ] Implementar Auth (fase 05)
6. [ ] Implementar Edge DataJud v2.0 (fase 06)
7. [ ] Implementar Edge Mural (fase 07)

### Médio prazo (1-2 meses)

8. [ ] Testar cert. A1 (fase 14) — antes de implementar
9. [ ] Implementar IA + Regex (fase 08)
10. [ ] Implementar Cert Service (fase 09)
11. [ ] Implementar Stripe Billing (fase 10)

### Longo prazo (2-3 meses)

12. [ ] Implementar Super Admin (fase 11)
13. [ ] Implementar UI principal (fase 12)
14. [ ] Implementar MCP (fase 13)
15. [ ] Deploy em produção
16. [ ] Onboarding dos primeiros clientes
17. [ ] Definir política de retenção (LGPD)
18. [ ] Implementar estratégias de longo prazo

---

## 📚 Documentação detalhada

Para detalhes técnicos de cada fase, consulte `docs/roadmap/`:

- `00-visao-geral.md` — arquitetura visual
- `01-setup.md` — setup do projeto
- `02a-schema-verticals.md` — tabela verticals
- `02-schema-shared.md` — schema multi-tenant
- `03-schema-meujudi.md` — schema específico
- `04-rls-policies.md` — segurança
- `05-auth.md` — autenticação
- `06-edge-datajud.md` — polling multi-tribunal v2.0
- `07-edge-mural.md` — polling Mural
- `08-ia-regex.md` — IA + regex (5 camadas, regex V2)
- `09-cert-a1.md` — service de cert. A1
- `10-stripe-billing.md` — billing SaaS
- `11-super-admin.md` — painel central
- `12-ui-app.md` — UI do app
- `13-mcp-integration.md` — integração MCP
- `14-plano-teste-cert-a1.md` — plano de teste do cert. A1
- `15-sync-config-limites.md` — config por plano + estratégias longo prazo

---

## 📝 Histórico de decisões (14/07/2026)

| Hora | Decisão |
|---|---|
| 09h-12h | Pesquisa das APIs (DataJud, Mural, Escavador, Judid) |
| 12h | Descoberta da API REST do Mural (comunicaapi.pje.jus.br) |
| 14h | DataJud + Mural cobrem 90% do que o escritório precisa |
| 15h | Plano Opção B (configurável por tenant) com 6x/dia no Pro |
| 16h | Cert. A1 service: Electron (não Tauri) |
| 16h | Arquitetura híbrida (polling + on-demand com cache) |
| 17h | 5 estratégias de longo prazo + soft delete como padrão |
| 17h | Resalva do Caio: tudo que envolve DELETE precisa análise antes |

---

**Documento fechado em 14/07/2026.**
**Próxima revisão:** após Fase 1 (setup) e teste do cert. A1.
