# 00 — Visão Geral da Arquitetura

> Documento principal de arquitetura do MeuJudi.
> Leia isso primeiro antes de qualquer outra coisa.
>
> 📄 **Documento master consolidado:** [`../../ESPECIFICACAO.md`](../../ESPECIFICACAO.md) — todas as decisões em um único arquivo.

---

## 🎯 O que é uma Vertical (contexto importante)

**MeuJudi é uma vertical** dentro de um monorepo multi-SaaS.

```
monorepo/
├── vertical "meujudi"  ← ESSE É O PROJETO ATUAL
├── vertical "game"     ← outro Micro SaaS (futuro)
└── vertical "novo"     ← template pra futuras verticais
```

**Vertical** = um Micro SaaS dentro do mesmo monorepo. Cada vertical tem seu próprio conjunto de features, tabelas, e (futuramente) frontend, mas compartilha a infraestrutura base (auth, billing, super admin, etc).

**Nome da vertical MeuJudi: `meujudi`** (slug usado no banco e no código)

**Por que isso importa:**
- Estrutura do banco tem tabela `verticals` que é a RAIZ
- Cada `tenant` (escritório) está vinculado a uma vertical
- Caio é o super admin de TODAS as verticais
- Quando game voltar, vai ser uma vertical separada, mesmo banco

### Hierarquia do monorepo

```
verticals (tabela)             ← raiz do monorepo
├── meujudi (vertical ATIVA)  ← ESSE PROJETO
│   ├── tenants (escritórios clientes)
│   │   ├── users (advogados)
│   │   │   └── processos, movimentações, mural, etc.
│   └── ...
├── game (vertical INATIVA, futuro)
│   └── ...
└── novo (template pra futuras verticais)
    └── ...
```

### Estrutura de pastas (monorepo multi-vertical)

```
src/
├── app/
│   ├── (auth)/              ← login, cadastro
│   ├── (public)/            ← landing pages
│   ├── (platform)/          ← app do MeuJudi (vertical meujudi)
│   │   ├── dashboard/
│   │   ├── processos/
│   │   └── ...
│   ├── (super-admin)/       ← painel central (todas verticais)
│   │   ├── admin/
│   │   ├── tenants/
│   │   ├── verticals/       ← métricas POR VERTICAL
│   │   │   ├── meujudi/    ← métricas do MeuJudi
│   │   │   └── game/       ← métricas do game (futuro)
│   │   └── ...
│   └── api/
└── lib/
    └── verticals/
        ├── meujudi/         ← TUDO do MeuJudi aqui (isolado)
        │   ├── datajud.ts
        │   ├── mural.ts
        │   ├── regex.ts
        │   └── ...
        └── game/            ← TUDO do game aqui (futuro)

supabase/
└── migrations/
    ├── shared/              ← tenants, users, verticals
    ├── meujudi/             ← processos, mural
    └── game/                ← (vazio, futuro)
```

---

## 🎯 Objetivo do MeuJudi

Sistema SaaS multi-tenant para escritórios de advocacia, com:
- Polling automático de processos via DataJud (gratuito)
- Complementação via Mural Eletrônico (gratuito)
- IA como fallback de regex pra extrair dados
- Service local opcional pra cert. A1
- Billing via Stripe
- Painel Super Admin pra gerenciar todos os clientes

---

## 🏗️ Visão geral

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│                         SUPER ADMIN (VOCÊ)                               │
│                  Painel: /admin ou /super-admin                         │
│                                                                           │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │  Verticals  │ │   Tenants   │ │  Billing     │ │   Métricas   │     │
│  │  (Micro SaaS)│ │ (escritórios│ │  (Stripe)    │ │  (MRR, etc)  │     │
│  └──────┬──────┘ └──────┬──────┘ └──────────────┘ └──────────────┘     │
│         │              │                                                 │
│         ▼              ▼                                                 │
│  meujudi ─┐    ┌─ tenant_1                                             │
│  game    ─┤    ├─ tenant_2                                             │
│  novo    ─┘    └─ tenant_3                                             │
│                                                                           │
└───────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   VERTICALS (tabela)    │
                    │   (MeuJudi, Game, ...)  │
                    └────────────┬───────────┘
                                 │
                ┌────────────────┴────────────────┐
                ▼                                  ▼
       ┌────────────────┐               ┌────────────────┐
       │   TENANTS      │               │    TENANTS     │
       │  (MeuJudi)     │               │    (Game)      │
       │                │               │  (futuro)      │
       │  tenant_1 ─┐  │               │  tenant_x ─┐  │
       │  tenant_2 ─┤  │               │            │  │
       │  tenant_3 ─┘  │               │            │  │
       └────────────────┘               └────────────────┘
                                 │
       ┌────────────────────────┼────────────────────────┐
       │                        │                        │
       ▼                        ▼                        ▼
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│  Escritório  │         │  Escritório  │         │  Escritório  │
│  Tenant 1     │         │  Tenant 2     │         │  Tenant 3     │
│              │         │              │         │              │
│  5 advogados │         │  12 advogados│         │  2 advogados │
│  700 proc.   │         │  2500 proc.  │         │  200 proc.   │
│              │         │              │         │              │
│  Plano: Pro  │         │  Plano: Busi │         │  Plano: Start│
└──────┬───────┘         └──────┬───────┘         └──────┬───────┘
       │                        │                        │
       └────────────────────────┼────────────────────────┘
                                │
                    ┌───────────▼────────────┐
                    │                       │
                    │    SUPABASE PRO        │
                    │    (R$ 130/mês)        │
                    │                       │
                    │  Schema:              │
                    │  ├── shared/          │ ← tenants, users, billing
                    │  └── meujudi/         │ ← processos, movimentações
                    │                       │
                    │  RLS: tenant_id       │
                    │  (isolamento total)  │
                    └───────────┬────────────┘
                                │
       ┌────────────────────────┼────────────────────────┐
       │                        │                        │
       ▼                        ▼                        ▼
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   DataJud    │         │    Mural     │         │  IA (Claude) │
│  (CNJ pub)   │         │  Eletrônico  │         │   Haiku      │
│              │         │  (CNJ pub)   │         │  ~$0.001/call│
│  Edge Func   │         │  Edge Func   │         │  Edge Func   │
│  2x/dia      │         │  1x/semana   │         │  on-demand   │
└──────────────┘         └──────────────┘         └──────────────┘
                                │
                                │
                    ┌───────────▼────────────┐
                    │  Cert. A1 Service     │ (OPCIONAL)
                    │  (PC do advogado)     │
                    │                       │
                    │  Windows Service      │
                    │  Playwright + PJe     │
                    │  Sync 1x/dia (4h)     │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  PJe / Projudi        │
                    │  (com cert. A1)       │
                    │                       │
                    │  Valor da causa       │
                    │  Processos sigilosos  │
                    │  PDFs de peças        │
                    └───────────────────────┘
```

---

## 🧩 Componentes principais

### 1. Web App (Next.js)

```
[app/]
├── (public)/              Landing pages, marketing
├── (auth)/                Login, cadastro, esqueci senha
├── (platform)/            App do escritório (tenant logado)
│   ├── dashboard/         Resumo: processos, prazos, audiências
│   ├── processos/         Lista + detalhe
│   ├── clientes/          Cadastro de clientes
│   ├── agenda/            Prazos + audiências unificados
│   ├── equipe/            Advogados do escritório
│   ├── cert-a1/           Configurar cert. A1
│   └── billing/           Plano + cartão
├── (super-admin)/         Seu painel de controle
└── api/                   Endpoints
```

### 2. Supabase (Backend + Auth + DB)

```
[supabase/]
├── migrations/
│   ├── shared/            tenants, users, billing, audit
│   ├── meujudi/           processos, movimentações, mural
│   └── game/              (vazio, futuro)
└── functions/             Edge Functions
    ├── poll-datajud/      Polling 2x/dia
    ├── poll-mural/        Polling 1x/semana
    ├── sync-pje/          Sync PJe (opcional)
    ├── regex-validate/    Validar match de regex
    └── ia-extract/        Extrair dados com IA
```

### 3. Cert. A1 Service (Local, opcional)

```
[Cert-A1-Service/]
├── service/               Windows Service (Node.js)
│   ├── pje-sync.js        Sync diário com PJe
│   └── cert-manager.js    Gerencia cert. A1 no Windows
└── api/                   API local (porta 3737)
    ├── POST /sync         Força sync
    └── GET /status        Status do cert
```

### 4. Super Admin (Você)

```
[/admin/]
├── dashboard/             MRR, tenants ativos, alertas
├── tenants/               Lista de todos os escritórios
├── verticals/meujudi/     Métricas específicas
├── billing/               Receita, churn
├── support/               Tickets
├── features/              Feature flags
└── audit/                 Audit logs
```

---

## 🔄 Fluxo de dados completo

### Fluxo 1: Cadastro inicial do escritório

```
[Usuário]                  [App]                    [Supabase]
    │                          │                          │
    ├── Acessa /register ──────►│                          │
    │                          ├── Cria auth user ────────►│
    │                          ├── Cria tenant ───────────►│
    │                          ├── Cria users (owner) ────►│
    │                          ├── Cria subscription ────►│
    │                          │    (trial 7 dias)        │
    │                          │                          │
    ├─ Faz login ──────────────►│                          │
    │                          ├── Onboarding wizard     │
    │                          │   (config OABs,         │
    │                          │    cad primeiros CNJs)  │
    │                          │                          │
    │                          ├── Polling DataJud  ──────►│
    │                          │   (busca CNJs)          │
    │                          │                          │
    │                          ├── Polling Mural  ───────►│
    │                          │   (busca por OAB)       │
    │                          │                          │
    │                          │   Resultado: processos  │
    │                          │   populados no banco    │
    │                          │                          │
    ├── Vê dashboard ◄─────────┤                          │
    │                          │                          │
```

### Fluxo 2: Polling automático (todo dia)

```
[Supabase Cron 8h, 20h]
        │
        ▼
[Edge Function: poll-datajud]
        │
        ├── Busca todos processos ativos
        │
        ├── Para cada processo:
        │   ├── Chama DataJud API
        │   ├── Compara dataHoraUltimaAtualizacao
        │   ├── Se mudou:
        │   │   ├── Salva novas movimentações
        │   │   ├── Detecta prazo via regex
        │   │   ├── Se regex falhou: chama IA
        │   │   ├── Atualiza processos
        │   │   └── Cria evento na agenda
        │   └── Marca como "sincronizado"
        │
        └── Notifica advogado (se houve mudanças)
```

### Fluxo 3: Descoberta por OAB (1x/semana)

```
[Supabase Cron: segunda 6h]
        │
        ▼
[Edge Function: poll-mural]
        │
        ├── Busca OABs dos advogados do tenant
        │
        ├── Para cada OAB:
        │   ├── Chama Mural: ?numeroOab=X&ufOab=PR
        │   ├── Para cada comunicação nova:
        │   │   ├── Cria/atualiza processo
        │   │   ├── Salva destinatários + advogados
        │   │   ├── Extrai prazo (regex + IA)
        │   │   ├── Salva como evento na agenda
        │   │   └── Notifica advogado
        │   └── Marca mural_id como processado
        │
        └── Auditoria: log tudo no audit_logs
```

### Fluxo 4: Cert. A1 (opcional, diário)

```
[PC do Advogado, 4h da manhã]
        │
        ▼
[Windows Service: pje-sync]
        │
        ├── Lê cert. A1 do Windows Cert Store
        ├── Abre PJe via Playwright
        │   ├── Login automático (mTLS)
        │   ├── Navega em "Meus processos"
        │   ├── Para cada processo:
        │   │   ├── Captura HTML
        │   │   ├── POSTa no Supabase
        │   │   └── Envia logs
        ├── Logout do PJe
        ├── Atualiza cert_a1_last_used_at
        └── Persiste logs de uso
                            │
                            ▼
[Supabase Edge Function: sync-pje]
        │
        ├── Recebe dados do PJe
        ├── Parseia HTML (cheerio)
        ├── Extrai valor, partes, sigiloso
        ├── Atualiza processos
        └── Log em cert_a1_uso_log
```

---

## 📊 Modelo de dados (resumo visual)

```
┌──────────────────────────────────────────────────────────────┐
│                                                                │
│  SHARED (todas as verticais)                                  │
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ tenants  │  │  users   │  │  plans   │  │  subs    │       │
│  │ (escrit.)│  │(advogado)│  │          │  │          │       │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └────┬─────┘       │
│       │              │                            │           │
│       │              │   ┌──────────┐              │           │
│       │              └──►│ feature_  │              │           │
│       │                  │   flags   │              │           │
│       │                  └──────────┘              │           │
│       │                                              │           │
│       │   ┌──────────┐  ┌──────────┐  ┌──────────┐   │           │
│       └──►│ payments │  │  audit  │  │ support  │◄──┘           │
│           └──────────┘  │  logs   │  │ tickets  │               │
│                          └──────────┘  └──────────┘               │
│                                                                │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                                                                │
│  MEUJUDI (vertical específico)                                 │
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ clientes │  │processos │  │moviment. │  │ mural    │       │
│  │          │  │          │  │          │  │ comunic. │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │              │              │              │           │
│       └──────────────┼──────────────┼──────────────┘           │
│                      │              │                          │
│                      │   ┌──────────▼──────────┐               │
│                      └──►│   agenda_eventos   │               │
│                          │ (prazos, audiências)│               │
│                          └─────────────────────┘               │
│                                                                │
│  ┌──────────┐  ┌──────────┐                                   │
│  │  regex   │  │ cert_a1  │                                   │
│  │ metadata │  │  uso_log │                                   │
│  └──────────┘  └──────────┘                                   │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

---

## 💰 Modelo de negócio (SaaS)

| Plano | Preço/mês | Advogados | Processos | OABs | IA | Cert. A1 |
|---|---|---|---|---|---|---|
| **Starter** | R$ 99 | 2 | 200 | 1 | ❌ | ❌ |
| **Pro** | R$ 249 | 5 | 1.000 | 5 | ✅ | ❌ |
| **Business** | R$ 499 | 15 | 5.000 | 15 | ✅ | ✅ |
| **Enterprise** | Custom | Ilimitado | Ilimitado | Ilimitado | ✅ | ✅ |

### Add-ons

- **Advogado extra**: R$ 49/mês
- **Processos extras** (a cada 500): R$ 29/mês
- **OABs extras** (a cada 5): R$ 19/mês
- **Cert. A1 service** (suporte): R$ 99/mês (Business é obrigatório)

---

## 🔐 Segurança

### RLS (Row Level Security) — Isolamento por tenant

```sql
-- Exemplo: advogados veem só seus processos
CREATE POLICY "tenant_isolation" ON processos
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

**Impossível** um advogado ver dados de outro escritório, mesmo com SQL injection.

### Auth

- Supabase Auth (JWT)
- Senha com hash bcrypt
- Refresh tokens automáticos
- 2FA opcional (preparado pra futuro)
- Email confirmation no cadastro

### Cert. A1

- Cert fica **no Windows do advogado** (nunca na nuvem)
- Acesso via PJe = mTLS (certificado digital)
- Logs de uso em `cert_a1_uso_log`
- Rotação de senha do cert criptografada

### API Keys (DataJud, Mural, IA)

- Armazenadas em Supabase Secrets
- Nunca expostas no client-side
- Rotação trimestral

---

## 🤖 Integração MCP (Model Context Protocol)

O MeuJudi é um dos primeiros sistemas jurídicos do Brasil a ter **MCP nativo**. Isso permite que IAs externas (Claude, ChatGPT, Gemini) se conectem ao escritório via OAuth e façam ações.

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Cliente (Advogado)                              │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐                          │
│  │  Claude Desktop  │  │  Cursor / ChatGPT│  ← IA do cliente        │
│  └────────┬─────────┘  └────────┬─────────┘                          │
│           │ MCP                  │                                   │
└───────────┼──────────────────────┼───────────────────────────────────┘
            │                      │
            ▼                      ▼
   ┌────────────────────────────────────────┐
   │  MCP Server MeuJudi                     │
   │  https://mcp.meujudi.com.br             │
   │                                        │
   │  Tools:                                 │
   │  ├── listar_processos                  │
   │  ├── buscar_processo(cnj)              │
   │  ├── resumo_processo(cnj)              │
   │  ├── listar_movimentacoes(cnj)         │
   │  ├── listar_agenda(periodo)            │
   │  ├── criar_anotacao(cnj, texto)        │
   │  └── ... (futuro: petições, etc)       │
   │                                        │
   │  Auth: OAuth 2.0                       │
   │  RLS: por tenant (isolamento total)    │
   └────────────────────────────────────────┘
```

**Diferencial competitivo:** o advogado pode perguntar "Quais audiências eu tenho essa semana?" pro Claude e ele consulta o MCP do MeuJudi.

Documentação completa em [`13-mcp-integration.md`](13-mcp-integration.md).

## 📈 Roadmap de implantação (10 semanas)

| Semana | Fase | Entrega |
|---|---|---|
| 1-2 | 01-setup, 02a-verticals, 02-schema, 03-schema | Projeto rodando + schema |
| 3-4 | 04-rls, 05-auth | RLS + login funcionando |
| 5-6 | 06-datajud, 07-mural | Polling automático |
| 7-8 | 08-ia-regex | IA como fallback |
| 9 | 09-cert-a1, 10-stripe | Billing + cert. A1 |
| 10 | 11-super-admin, 12-ui | Painel admin + UI final |
| 11+ | 13-mcp | Integração com IAs externas |

---

## ✅ Decisões arquiteturais

| Decisão | Escolha | Por quê |
|---|---|---|
| Monorepo vs separado | **Monorepo** | 1 dev solo, R$ 130/mês vs R$ 390/mês |
| Supabase | **Pro** (R$ 130/mês) | Backups diários, 8GB DB, 250GB bandwidth |
| ORM | **Não usar** (SQL direto) | Performance + controle RLS |
| UI Framework | **Tailwind + shadcn/ui** | Padrão moderno |
| Deploy | **Vercel** | Free tier, edge, fácil |
| Pagamento | **Stripe** | Padrão SaaS, PIX + cartão + boleto |
| Email | **Resend** | 100 emails/dia grátis, fácil |
| Monitoramento | **Sentry** | Free tier 5K erros/mês |
| IA primária | **Claude Haiku** | Barato e bom |
| IA complexa | **Claude Sonnet** | Quando precisa de raciocínio |
| Backup cert. A1 | **Vault criptografado no Supabase** | Segurança |

---

## 📚 Próximo passo

Leia o arquivo [`01-setup.md`](01-setup.md) pra começar a implementar.
