# 16 — Fluxo de Usuário, Menus e Navegação do MeuJudi

> Documento de UX/Produto. Define **como o usuário usa o app**, **o que cada role vê**, e **os fluxos críticos do dia-a-dia**.
>
> 📄 **Documento master técnico:** [`../../ESPECIFICACAO.md`](../../ESPECIFICACAO.md)
> 📄 **UI de cada tela (referência):** [`12-ui-app.md`](12-ui-app.md)
> 📅 **Decisões travadas em:** 15/07/2026

---

## 🎯 Objetivo

Definir o **fluxo completo do usuário** dentro do MeuJudi:

1. O que cada **role** (super_admin / owner / lawyer / staff) vê e pode fazer
2. Mapa de **todas as páginas** e quem acessa cada uma
3. **Header global** (topo, presente em toda página logada)
4. **Sidebar** (lateral, muda por role)
5. **Onboarding wizard** (4 passos + tour)
6. **Fluxos críticos** do dia-a-dia
7. Decisões pendentes

---

## 🧑‍⚖️ As 4 Personas e seus poderes

| Role | Quem é | Vê | Pode fazer |
|---|---|---|---|
| **super_admin** | Você (Caio) | TODOS os escritórios de TODAS as verticais | Tudo: suspender, mudar plano, ver billing, audit log, suporte |
| **owner** | Sócio/dono do escritório (ex: Dr. Luis Fellype OAB 67553) | Tudo **do próprio escritório** | Gerenciar equipe, ver billing, configurar polling, ver cert. A1, mudar OABs, deletar processo |
| **lawyer** | Advogado pleno/sênior do escritório | Processos, clientes, agenda, mural, cert. A1, anotações | Cadastrar processo, marcar favorito, criar anotação, ver cert. A1, **não** vê billing/equipe |
| **staff** | Estagiário/assistente (sem OAB ou OAB iniciante) | Só processos **atribuídos a ele** + clientes + agenda dele | Consultar processo, criar anotação em processo atribuído, **não** vê cert. A1 / billing / equipe |

**Princípio geral:** cada role vê um subconjunto de menus. Quem não pode fazer algo, nem vê o menu. **Não tem** "página de acesso negado" — é silencioso.

---

## 🗺️ Mapa completo de páginas (URLs)

### Rotas públicas (`(public)/`)

| URL | Quem vê | O que faz |
|---|---|---|
| `/` | Visitantes anônimos | Landing page (marketing do MeuJudi) |
| `/precos` | Visitantes anônimos | Tabela de planos |
| `/sobre` | Visitantes anônimos | História, equipe, valores |
| `/contato` | Visitantes anônimos | Formulário de contato → email pro Caio |
| `/termos` | Visitantes anônimos | Termos de uso |
| `/privacidade` | Visitantes anônimos | Política de privacidade (LGPD) |

### Rotas de autenticação (`(auth)/`)

| URL | Quem vê | O que faz |
|---|---|---|
| `/login` | Visitantes não logados | Login (email+senha ou magic link) |
| `/cadastro` | Visitantes não logados | Sign up (escritório + nome + OAB + email + senha) |
| `/esqueci-senha` | Visitantes não logados | Reset de senha via email |
| `/redefinir-senha` | Visitantes não logados (via link do email) | Cria nova senha |
| `/confirmar-email` | Visitantes não logados (via link do email) | Confirma cadastro → redireciona pro onboarding |
| `/auth/callback` | Sistema (OAuth, magic link) | Handler de callback do Supabase |

### Rotas do escritório (`(platform)/`)

| URL | Quem acessa | O que faz |
|---|---|---|
| `/onboarding` | Usuário recém-cadastrado | Wizard 4 passos (escritório → OABs → equipe → 1ºs CNJs) |
| `/dashboard` | Todos logados | Resumo: métricas, próximas audiências, prazos, mural pendente |
| `/processos` | owner, lawyer, staff | Lista de processos (filtros: status, tribunal, busca) |
| `/processos/novo` | owner, lawyer | Formulário pra cadastrar CNJ |
| `/processos/descobertos` | owner, lawyer | Lista de processos **descobertos pelo Mural** (pendentes aprovação) |
| `/processos/[cnj]` | owner, lawyer, staff (se atribuído) | Detalhe do processo (abas: Capa, Movimentações, Mural, Anotações) |
| `/clientes` | owner, lawyer, staff | Lista de clientes |
| `/clientes/novo` | owner, lawyer | Formulário de cadastro de cliente |
| `/clientes/[id]` | owner, lawyer, staff (se vinculado) | Detalhe do cliente (dados + processos vinculados) |
| `/agenda` | owner, lawyer, staff | Timeline de prazos + audiências + reuniões |
| `/agenda/novo` | owner, lawyer | Criar evento manual (reunião, lembrete) |
| `/equipe` | **owner only** | Lista de advogados do escritório |
| `/equipe/convidar` | **owner only** | Convidar novo advogado (email + OAB + role) |
| `/equipe/[id]` | **owner only** | Detalhe do advogado (role, OABs, processos atribuídos) |
| `/cert-a1` | owner, lawyer | Status e configuração do cert. A1 (instalação, download do app, último sync) |
| `/billing` | **owner only** | Plano atual, cartão, histórico de faturas, upgrade/downgrade |
| `/billing/checkout` | **owner only** | Stripe Checkout (criar nova assinatura) |
| `/suporte` | Todos logados | Meus tickets + widget "Ajuda" também disponível |
| `/suporte/novo` | Todos logados | Abrir novo ticket |
| `/suporte/[id]` | Todos logados | Detalhe de um ticket (conversa com super admin) |
| `/configuracoes` | Todos logados | Hub de configurações (escolhe subseção) |
| `/configuracoes/perfil` | Todos logados | Nome, foto, email, senha, 2FA (futuro) |
| `/configuracoes/oabs` | Todos logados | Minhas OABs (número + UF) |
| `/configuracoes/notificacoes` | Todos logados | Quais eventos geram notificação (toggle on/off por evento) |
| `/configuracoes/escritorio` | **owner only** | Nome do escritório, logo, endereço, CNPJ |
| `/configuracoes/polling` | **owner only** | Frequência de polling (se plano permite customizar) |
| `/configuracoes/integracoes` | **owner only** | API keys, MCP server (OAuth), webhooks |

### Rotas do super admin (`(super-admin)/admin/`)

| URL | Quem acessa | O que faz |
|---|---|---|
| `/admin` | super_admin | Dashboard: MRR, ARR, tenants ativos, em trial, inadimplência |
| `/admin/tenants` | super_admin | Lista de TODOS os escritórios (filtro por vertical, status) |
| `/admin/tenants/[id]` | super_admin | Detalhe de 1 tenant: usuários, plano, uso, billing, support |
| `/admin/tenants/[id]/editar` | super_admin | Editar tenant (mudar plano, suspender, etc) |
| `/admin/verticals/meujudi` | super_admin | Métricas específicas do MeuJudi (polling, IA, cert) |
| `/admin/billing` | super_admin | Receita consolidada, churn, MRR por vertical |
| `/admin/support` | super_admin | Inbox de tickets de todos os tenants |
| `/admin/support/[id]` | super_admin | Responder ticket |
| `/admin/features` | super_admin | Feature flags por vertical/tenant |
| `/admin/audit` | super_admin | Audit logs (LGPD) |

---

## 🎨 Header global (topo de toda página logada)

Presente em **todas** as páginas `(platform)/*` e `(super-admin)/*`.

```
┌────────────────────────────────────────────────────────────────────────────┐
│  [MeuJudi logo]   [🔍 Cmd+K buscar...]              [🔔 5]   [👤 Avatar▼]  │
└────────────────────────────────────────────────────────────────────────────┘
```

| Elemento | Sempre? | Função |
|---|---|---|
| **Logo MeuJudi** | Sim | Clica → `/dashboard` (ou `/admin` se super_admin) |
| **Busca global (Cmd+K)** | Sim | Abre modal de busca. Procura em: processos (CNJ, partes), clientes, OABs, agenda. Mostra resultados agrupados |
| **Sino de notificações** | Sim | Badge com contador de não lidas. Clica → dropdown com últimas 5 + "Ver todas" → `/notificacoes` |
| **Avatar do usuário** | Sim | Dropdown: Meu perfil, Configurações, Ajuda, Sair |
| **Badge do plano** | Sim (em `/dashboard` apenas) | Mostra "Pro · 200/1000 processos usados" — pro owner ter noção do limite |

### Modal de busca global (Cmd+K)

Acionado por `Ctrl+K` (Windows/Linux) ou `Cmd+K` (Mac). 80% da largura, centralizado.

```
┌─────────────────────────────────────────────────────────────────┐
│  🔍 Buscar processos, clientes, OABs...                         │
├─────────────────────────────────────────────────────────────────┤
│  PROCESSOS                                                     │
│  📁 0014336-19.2026.8.16.0182 — Emerson vs Município           │
│  📁 0021003-45.2025.8.16.0019 — João Silva vs Estado           │
│                                                                  │
│  CLIENTES                                                       │
│  👤 EMERSON DA SILVA (3 processos)                             │
│  👤 JOÃO SILVA SANTOS (1 processo)                              │
│                                                                  │
│  OABs CADASTRADAS                                               │
│  🏛️ OAB/PR 67553 — Luís Fellype de Araújo                      │
│                                                                  │
│  AGENDA                                                         │
│  📅 15/07 14:00 — Audiência — 4º Juizado                       │
└─────────────────────────────────────────────────────────────────┘
```

**Implementação:** lib `cmdk` do shadcn/ui. Indexação client-side (carrega primeiros 1000 processos + 500 clientes no mount, busca em memória). Para datasets grandes, índice é gerado em Edge Function KV do Supabase.

---

## 📐 Sidebar (lateral esquerda, muda por role)

### Sidebar do OWNER (sócio)

```
┌──────────────────────┐
│ MeuJudi              │  ← header
├──────────────────────┤
│ 📊 Dashboard         │
│ ⚖️ Processos         │
│    └ ✨ Descobertos  │  ← badge "5" se Mural descobriu novos
│ 👥 Clientes          │
│ 📅 Agenda            │
│ 📨 Mural Eletrônico  │  ← badge "3" se há comunicações pendentes
│ ────────────────     │
│ 👨‍⚖️ Minha Equipe     │  ← só owner
│ 🔐 Cert. A1          │
│ ────────────────     │
│ 💳 Billing           │  ← só owner
│ ⚙️ Configurações     │
│ ────────────────     │
│ ❓ Ajuda             │
└──────────────────────┘
```

### Sidebar do LAWYER (advogado)

```
┌──────────────────────┐
│ MeuJudi              │
├──────────────────────┤
│ 📊 Dashboard         │
│ ⚖️ Processos         │
│    └ ✨ Descobertos  │
│ 👥 Clientes          │
│ 📅 Agenda            │
│ 📨 Mural Eletrônico  │
│ ────────────────     │
│ 🔐 Cert. A1          │
│ ────────────────     │
│ ⚙️ Configurações     │
│ ❓ Ajuda             │
└──────────────────────┘
```

### Sidebar do STAFF (estagiário)

```
┌──────────────────────┐
│ MeuJudi              │
├──────────────────────┤
│ 📊 Dashboard         │  ← filtrado: só processos dele
│ ⚖️ Meus Processos    │  ← rótulo muda, mostra só atribuídos
│ 👥 Clientes          │  ← só dos processos dele
│ 📅 Agenda            │  ← só eventos dele
│ ────────────────     │
│ ⚙️ Configurações     │  ← só perfil, OABs, notificações
│ ❓ Ajuda             │
└──────────────────────┘
```

**Diferenças críticas:**
- Staff **NÃO vê** "Minha Equipe", "Cert. A1", "Billing", "Mural Eletrônico" (avaliação do advogado sênior antes), "Descobertos"
- Staff vê "Meus Processos" (não "Processos") — escopo é diferente
- Staff vê o **Mural só dos processos atribuídos a ele**, se implementado — por ora omitido pra MVP

### Sidebar do SUPER_ADMIN

```
┌──────────────────────┐
│ MeuJudi Admin        │
├──────────────────────┤
│ 🏠 Dashboard         │
│ 🏢 Escritórios       │  ← lista de tenants
│ 💰 Billing           │
│ 🎫 Suporte           │  ← inbox de tickets
│ ────────────────     │
│ 🧩 Features          │  ← feature flags
│ 📊 Métricas MeuJudi  │
│ 📜 Audit Logs        │
│ ────────────────     │
│ 🚪 Voltar pro app    │  ← link pro (platform)/
└──────────────────────┘
```

---

## 🚀 Fluxo de Onboarding (4 passos + tour)

### Trigger

Usuário se cadastra → recebe email de confirmação → clica no link → cai em `/onboarding` (ou se for a 1ª vez, força redirect).

### Passo 1 — Boas-vindas

```
┌──────────────────────────────────────────────────────────┐
│  Bem-vindo ao MeuJudi! 🎉                                │
│                                                          │
│  Você tem 7 dias grátis pra testar tudo. Sem cartão.    │
│                                                          │
│  Como vamos chamar seu escritório?                      │
│  ┌────────────────────────────────────┐                  │
│  │ Embrepoli Advocacia                │                  │
│  └────────────────────────────────────┘                  │
│                                                          │
│              [Continuar →]                               │
└──────────────────────────────────────────────────────────┘
```

- Cria registro em `tenants` (com `trial_until = now + 7 days`)
- Cria `users` com `role = owner`
- Cria `subscriptions` (status: trialing)

### Passo 2 — Suas OABs

```
┌──────────────────────────────────────────────────────────┐
│  Quais OABs você usa?                                    │
│                                                          │
│  Pra que servem: usaremos pra buscar processos           │
│  automaticamente no Mural Eletrônico toda semana.        │
│                                                          │
│  ┌──────────────┐  ┌──────┐  ┌───┐  [➕ Adicionar]     │
│  │ Luís Fellype │  │ 67553│  │ PR│      │              │
│  └──────────────┘  └──────┘  └───┘                       │
│                                                          │
│  [+ Adicionar outra OAB]                                 │
│                                                          │
│  [← Voltar]                       [Continuar →]           │
└──────────────────────────────────────────────────────────┘
```

- Salva em `escritorio_oabs` (vinculado ao user + tenant)
- Cada OAB é vinculada ao user logado
- Pode ter várias (advogado com OAB em 2 estados)

### Passo 3 — Convidar equipe

```
┌──────────────────────────────────────────────────────────┐
│  Quer convidar outros advogados agora?                   │
│                                                          │
│  Eles vão receber um email com link pra criar            │
│  a senha e entrar.                                       │
│                                                          │
│  ┌────────────────────────────────────┐                  │
│  │ email@escritorio.com               │ [➕]            │
│  └────────────────────────────────────┘                  │
│                                                          │
│  [ ] Pular por agora                                     │
│                                                          │
│  [← Voltar]                       [Continuar →]           │
└──────────────────────────────────────────────────────────┘
```

- Envia email via Resend com link único
- Quem clica no link → cria senha → entra no escritório com role `lawyer` (ou `staff` se owner escolher)
- Pode pular (pode convidar depois em `/equipe`)

### Passo 4 — Seus primeiros processos

```
┌──────────────────────────────────────────────────────────┐
│  Como você quer começar?                                 │
│                                                          │
│  ┌────────────────────┐  ┌────────────────────┐          │
│  │  🔍                │  │  ✏️                 │          │
│  │  Deixar o Mural    │  │  Cadastrar CNJs     │          │
│  │  descobrir         │  │  manualmente        │          │
│  │                    │  │                     │          │
│  │  Buscamos nas      │  │  Você digita os     │          │
│  │  últimas comunicações│ │  CNJs que já tem    │          │
│  │  com suas OABs     │  │                     │          │
│  └────────────────────┘  └────────────────────┘          │
│                                                          │
│  [← Voltar]              [Pular →]                        │
└──────────────────────────────────────────────────────────┘
```

**Se escolher "Deixar o Mural descobrir":**
- Dispara Edge Function `poll-mural` imediatamente (não espera o cron de 1x/semana)
- Mostra tela de loading com progresso: "Buscando 8.650 comunicações... 23%"
- Ao final, redireciona pro dashboard com banner "5 processos novos descobertos! [Revisar]"

**Se escolher "Cadastrar manualmente":**
- Vai pra `/processos/novo` com formulário
- Pode cadastrar vários em sequência

**Se pular:**
- Vai direto pro dashboard (vazio, com CTAs)

### Tour guiado (após wizard)

Acionado automaticamente na primeira visita ao dashboard. 5 tooltips, pode pular a qualquer momento.

```
1. "Aqui no dashboard você vê o resumo de tudo"
2. "Estes cards mostram suas métricas: processos, prazos, audiências"
3. "Aqui embaixo, as próximas audiências"
4. "Aqui os prazos fatais"
5. "Use Ctrl+K pra buscar qualquer coisa, em qualquer lugar"
```

Implementação: lib `shepherd.js` ou `react-joyride`. Salva flag `tour_completed = true` em `users.metadata` pra não mostrar de novo.

---

## 📅 Fluxos críticos do dia-a-dia

### Fluxo 1: Advogado abre o app pela manhã

```
[Login] → /dashboard
  ↓
Vê cards de resumo (4-5 cards)
Vê "Próximas audiências" (próximos 7 dias)
Vê "Prazos fatais" (badge vermelho se tem < 3 dias)
  ↓
Clica em 1 audiência → /processos/[cnj]
  ↓
Vê capa + movimentações novas (com badge "NOVO")
Marca como lido
  ↓
Vai pra agenda ver se tem mais coisa
```

### Fluxo 2: Mural descobre processo novo

```
[Segunda 6h, cron] → Edge Function poll-mural
  ↓
Pra cada OAB cadastrada:
  GET Mural com ?numeroOab=X&ufOab=Y
  ↓
Salva comunicações novas (dedupe por mural_id)
  ↓
Pra cada comunicação com CNJ:
    - CNJ existe? → vincula
    - CNJ novo? → cria processo (status "pendente_aprovacao")
  ↓
Edge function cria notificação pra owner
  ↓
[Owner abre o app] → vê badge "5" no sino + badge "5" no menu Descobertos
  ↓
Clica em "Descobertos" → /processos/descobertos
  ↓
Revisa cada 1 (CNJ, partes, OAB, tipo de comunicação)
  ↓
Aprova (vira "ativo") ou Ignora (vira "descartado")
```

### Fluxo 3: Advogado recebe notificação de movimentação

```
[Polling 8h, 12h, 16h, 20h] → Edge Function poll-datajud
  ↓
Pra cada processo ativo:
  GET DataJud com cnj
  ↓
Diff com snapshot anterior:
  - Tem movimentação nova? → salva + cria notificação
  - Mudou prazo? → recalcula evento na agenda + notifica
  ↓
Edge function envia:
  - Push notification (Web Push API)
  - Email (Resend)
  - Entrada in-app (tabela notifications)
  ↓
[Advogado] recebe push no navegador (mesmo com aba fechada)
  ↓
Clica na push → abre /processos/[cnj] direto na movimentação nova
```

### Fluxo 4: Advogado cria anotação em processo

```
[Advogado em /processos/[cnj]] → clica aba "Anotações" (lateral)
  ↓
Vê anotações anteriores (com autor + data)
  ↓
Escreve nova anotação: "Cliente pediu pra ligar quinta às 14h"
  ↓
[Privado?] toggle on/off (se on, só ele vê)
  ↓
Clica "Salvar" → POST /anotacoes
  ↓
Anotação aparece no topo da lista (com badge "você")
```

### Fluxo 5: Owner convida novo advogado

```
[Owner em /equipe/convidar]
  ↓
Preenche: email, nome, OAB, role (lawyer ou staff)
  ↓
Clica "Enviar convite"
  ↓
Backend:
  - INSERT em users (sem senha ainda, status "pending")
  - INSERT em escritorio_oabs
  - Envia email via Resend com link único
  ↓
[Advogado novo] recebe email
  ↓
Clica no link → /redefinir-senha?token=...
  ↓
Define senha → INSERT password
  ↓
Redirecionado pro dashboard (já logado)
  ↓
Owner vê na lista de equipe com badge "novo" (verde) por 7 dias
```

### Fluxo 6: Advogado instala cert. A1 (1ª vez)

```
[Advogado em /cert-a1]
  ↓
Vê tela de status: "Cert. A1 não configurado"
  ↓
Clica "Instalar MeuJudi Cert Service"
  ↓
Baixa instalador Windows (.exe assinado)
  ↓
Instala no PC (cria Windows Service, adiciona tray icon)
  ↓
Abre o app local (tray icon)
  ↓
Faz login com conta MeuJudi (mesmo email/senha)
  ↓
[1ª vez] pede pra selecionar cert. A1 do Windows Cert Store
  ↓
Seleciona, confirma, app testa conexão com PJe
  ↓
Sucesso → primeira sync roda em background (~5 min)
  ↓
Advogado volta pro app web /cert-a1 → vê "Última sync: há 2 min" + "23 processos sincronizados"
```

### Fluxo 7: Owner gerencia billing

```
[Owner em /billing]
  ↓
Vê plano atual + uso (ex: "Pro · 200/1000 processos")
  ↓
Vê próxima cobrança: "R$ 249 em 18/07"
  ↓
Ações:
  - "Atualizar cartão" → Stripe Customer Portal
  - "Mudar plano" → modal com planos + Stripe Checkout
  - "Cancelar" → modal de confirmação
  - "Ver faturas" → tabela de histórico
```

### Fluxo 8: Advogado pede ajuda

```
[Qualquer página logada] → clica botão ❓ "Ajuda" (canto inferior direito)
  ↓
Widget abre com:
  - FAQ (3-5 perguntas comuns)
  - "Não resolveu? Fale com a gente" → form
  ↓
Preenche: assunto + descrição (opcional: anexar print)
  ↓
Clica "Enviar"
  ↓
INSERT em support_tickets (status: open)
  ↓
Email pro Caio (super admin)
  ↓
Caio vê em /admin/support → responde → advogado recebe email + vê em /suporte/[id]
```

---

## 📍 Mapa feature → tela

| Feature | Tela principal | Telas relacionadas |
|---|---|---|
| Login/Cadastro | `/login`, `/cadastro` | `/esqueci-senha`, `/confirmar-email` |
| Dashboard | `/dashboard` | (header) |
| Cadastrar processo | `/processos/novo` | `/processos/[cnj]` (após criar) |
| Ver processo | `/processos/[cnj]` | (sidebar) |
| Buscar processo | Modal Cmd+K | (header) |
| Filtrar processos | `/processos` (filtros) | — |
| Processos descobertos (Mural) | `/processos/descobertos` | `/dashboard` (badge) |
| Anotação em processo | `/processos/[cnj]` aba Anotações | — |
| Cadastrar cliente | `/clientes/novo` | `/clientes` (lista) |
| Ver cliente | `/clientes/[id]` | `/processos` (vinculado) |
| Agenda unificada | `/agenda` | `/dashboard` (próximas) |
| Criar evento manual | `/agenda/novo` | `/agenda` |
| Convidar equipe | `/equipe/convidar` | `/equipe` (lista) |
| Configurar cert. A1 | `/cert-a1` | — |
| Status cert. A1 | `/cert-a1` (card "última sync") | — |
| Ver billing | `/billing` | `/billing/checkout` |
| Mudar plano | `/billing` → modal | `/billing/checkout` |
| Configurar perfil | `/configuracoes/perfil` | — |
| Configurar OABs | `/configuracoes/oabs` | `/onboarding` passo 2 |
| Configurar notificações | `/configuracoes/notificacoes` | (sino) |
| Configurar escritório | `/configuracoes/escritorio` | `/onboarding` passo 1 |
| Configurar polling | `/configuracoes/polling` | — |
| Buscar (Cmd+K) | Modal global | (header) |
| Notificações | Dropdown do sino | `/notificacoes` (todas) |
| Central de ajuda | Widget "Ajuda" (canto) | `/suporte` |
| Abrir ticket | Widget "Ajuda" ou `/suporte/novo` | `/suporte/[id]` |
| Sair | Avatar dropdown | — |
| Tour guiado | (primeira vez no dashboard) | — |

---

## 🔄 Decisões pendentes

### 1. Cert. A1 pra todos os planos — impacto na precificação

**Decisão tomada:** cert. A1 vai estar disponível em **todos os planos** (não só Business/Enterprise).

**Impacto financeiro:**
- Custo variável: R$ 11-17/tenant/mês (cert A1 ÷ 12)
- Planos atuais:
  - Starter R$ 99 → margem cai ~10pp
  - Pro R$ 249 → margem cai ~5pp
  - Business R$ 499 → margem cai ~3pp

**Opções a decidir:**

| Opção | Pro | Contra |
|---|---|---|
| **A) Manter preço, absorver custo** | Simples, advogado não vê mudança | Margem cai ~5pp no Pro |
| **B) Subir Starter pra R$ 129, Pro pra R$ 299** | Margem mantida, sinaliza que cert é premium | Risco de perder clientes sensíveis a preço |
| **C) Cert vira add-on de R$ 49/mês em qualquer plano** | Cobre o custo, opt-in | Mais complexo de explicar, fricciona venda |
| **D) Plano Pro inclui cert, Starter/Enterprise não** | Tiers claros | Caio disse que quer pra todos — descarta |

**Recomendação:** começar com **A** (manter preço) por 6 meses, ver churn e feedback, depois avaliar **B** se necessário.

### 2. Onboarding: o que pular se já tem conta?

- **Pergunta:** se o escritório é criado por convite (owner convida lawyer), o lawyer pula o wizard de "criar escritório"? Vai direto pro dashboard?
- **Sugestão:** sim, lawyer entra no escritório existente. Pula wizard. Owner é quem fez o wizard.

### 3. Mural "Descobertos" — quem aprova?

- Owner recebe a notificação de processo novo
- Owner pode aprovar OU pode **delegar** pra um lawyer (configuração futura)
- **MVP:** só owner aprova

### 4. Mobile — atalhos

- No mobile, sidebar vira menu hambúrguer
- Bottom bar fixa com 4 ícones: Dashboard, Processos, Agenda, Notificações
- Cmd+K vira ícone de busca no header

### 5. Notificações — granularidade

**Toggle por evento** (em `/configuracoes/notificacoes`):
- [ ] Nova movimentação em qualquer processo meu
- [ ] Nova movimentação só em processos atribuídos a mim
- [ ] Nova audiência detectada
- [ ] Prazo fatal se aproximando (1 dia antes, 3 dias antes, 7 dias antes)
- [ ] Processo novo descoberto pelo Mural
- [ ] Resumo diário por email (8h da manhã)

**Toggle por canal** (push / in-app / email) — definir depois no design.

---

## ✅ Checklist de implementação (UI do app)

### Fase 1: Estrutura básica
- [ ] Setup do Next.js com App Router + 3 grupos de rotas: `(public)`, `(auth)`, `(platform)`, `(super-admin)`
- [ ] Layout raiz com header global (busca Cmd+K + sino + avatar)
- [ ] Sidebar com diferenciação por role
- [ ] Middleware de proteção (auth + role)
- [ ] Página `/dashboard` (cards + próximas audiências + prazos)

### Fase 2: Funcionalidades core
- [ ] Lista de processos com filtros (`/processos`)
- [ ] Cadastro de processo (`/processos/novo`)
- [ ] Detalhe do processo com 4 abas (`/processos/[cnj]`)
- [ ] Aba Anotações com form de criação
- [ ] Lista de clientes (`/clientes`) + cadastro + detalhe
- [ ] Agenda unificada (`/agenda`)
- [ ] Modal de busca global (Cmd+K) com `cmdk`

### Fase 3: Configurações + equipe
- [ ] `/equipe` (lista) + `/equipe/convidar` + `/equipe/[id]`
- [ ] Email de convite (Resend) com fluxo de aceitar/definir senha
- [ ] `/configuracoes/perfil` + `/configuracoes/oabs` + `/configuracoes/notificacoes`
- [ ] `/configuracoes/escritorio` (owner only)
- [ ] `/configuracoes/polling` (owner only)

### Fase 4: Billing + cert. A1
- [ ] `/billing` com plano atual + Customer Portal do Stripe
- [ ] Fluxo de upgrade via Stripe Checkout
- [ ] Webhook do Stripe atualizando `subscriptions`
- [ ] `/cert-a1` com status + download do instalador
- [ ] Verificação de última sync (query na tabela)

### Fase 5: Onboarding + tour
- [ ] `/onboarding` wizard 4 passos
- [ ] Tour guiado no dashboard (lib `react-joyride` ou similar)
- [ ] Persistir `tour_completed` no profile

### Fase 6: Notificações + suporte
- [ ] Tabela `notifications` + Edge Function de envio
- [ ] Web Push API com VAPID keys
- [ ] Dropdown do sino com últimas notificações
- [ ] Página `/notificacoes` (todas)
- [ ] Widget "Ajuda" + `/suporte` + `/suporte/novo`
- [ ] Inbox de tickets no super admin (`/admin/support`)

### Fase 7: Super admin
- [ ] `/admin` dashboard com MRR/ARR/tenants
- [ ] `/admin/tenants` lista + detalhe + edição
- [ ] `/admin/verticals/meujudi` métricas específicas
- [ ] `/admin/billing` receita + churn
- [ ] `/admin/features` feature flags
- [ ] `/admin/audit` audit logs

### Fase 8: Mobile + polimento
- [ ] Layout responsivo (sidebar vira hambúrguer, bottom bar no mobile)
- [ ] PWA instalável (manifest + service worker)
- [ ] Empty states em todas as páginas
- [ ] Loading states (skeletons)
- [ ] Error boundaries
- [ ] Toasts consistentes

---

## 📚 Próximo passo

1. **Caio revisar este documento** e validar o fluxo
2. Decidir **Opção de precificação** do cert. A1 (A, B ou C da seção "Decisões pendentes")
3. Após validação, começar **Fase 1 do checklist** (estrutura básica + auth + middleware de role)

---

> 📄 **Documento master técnico:** [`../../ESPECIFICACAO.md`](../../ESPECIFICACAO.md)
> 📄 **UI de cada tela (referência):** [`12-ui-app.md`](12-ui-app.md)
> 📅 **Decisões travadas em:** 15/07/2026
> 🔄 **Próxima revisão:** após implementação da Fase 1
