# MeuJudi CS (Cert Service)

> App desktop (Electron) que conecta o **MeuJudi Web** ao **PJe** via cert. A1 ou gov.br.

**Versão:** 0.1.0  
**Stack:** Electron + Next.js + TypeScript + Supabase  
**LGPD:** Criptografia AES-256-GCM + anonimização antes de IA

---

## 🎯 O que é

O **MeuJudi CS** é um tray app (fica na bandeja do Windows, perto do relógio) que:

1. Faz login no PJe via cert. A1 ou gov.br (OAuth-like window)
2. Guarda os cookies criptografados localmente
3. Roda polling 1x/hora em background (HTTP puro, 29 endpoints REST)
4. Baixa PDFs de peças, extrai valor da causa / CPF / OAB via regex + IA
5. Sincroniza tudo pro Supabase
6. O **MeuJudi Web** lê do Supabase (read-only, sem LGPD extra)

---

## 🚀 Quickstart (pra começar a testar AGORA)

### 1. Configurar Supabase (uma vez)

```bash
# Copie o .env.example pra .env
cp .env.example .env

# Edite o .env com suas credenciais do Supabase:
# - SUPABASE_URL=https://xxx.supabase.co
# - SUPABASE_SERVICE_KEY=eyJ... (chave "service_role", NÃO "anon")
```

### 2. Criar tabela no Supabase

No **SQL Editor** do Supabase, rode o conteúdo de:
```
docs/sql/20260715_diagnostic_reports.sql
```

### 3. Instalar dependências e rodar em dev

```bash
npm install
npm run dev
```

**Primeira execução:** vai rodar diagnóstico automático e notificar o resultado.

### 4. Testar fluxo de login

1. Clique 2x no ícone da bandeja do MeuJudi CS
2. Ou clique direito → "Conectar ao PJe"
3. Janela do PJe abre
4. Faça login (gov.br OU cert. A1)
5. Janela fecha sozinha quando logado
6. Status muda pra "● Conectado"

### 5. Ver relatório de diagnóstico

- **Pela UI:** Configurações de conexão → "Executar diagnóstico"
- **Pelo menu:** Botão direito na bandeja → "🔍 Executar diagnóstico"
- **Enviado pro Supabase:** automaticamente (se env vars configuradas)

### 6. Compilar instalador .exe

```bash
npm run dist:win
```

Gera: `release\MeuJudi-CS-Setup.exe` (~50 MB)

**Para testar com --first-run:**
```bash
release\MeuJudi-CS-Setup.exe --first-run
```

---

## 🏗️ Arquitetura (Fase 1)

```
┌─────────────────────────────────────────────────────────────┐
│  Windows do Advogado                                         │
│                                                              │
│  [Bandeja] MeuJudi CS (tray icon, fica ali 100% do tempo)  │
│     ↓                                                        │
│  [OAuth Window] (abre 30s, usuário loga, fecha)             │
│     ↓                                                        │
│  [Polling Engine] (invisível, 1x/hora)                      │
│     ↓                                                        │
│  [Extractor] (regex + Claude Haiku COM anonimização)        │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS + Service Key
                       ↓
┌─────────────────────────────────────────────────────────────┐
│  Supabase (Brasil, LGPD-compliant)                           │
│  - processos, movimentacoes, peca_pdf, audit_logs            │
│  - diagnostic_reports (relatórios automáticos do CS)        │
└──────────────────────┬──────────────────────────────────────┘
                       │ (read-only)
                       ↓
┌─────────────────────────────────────────────────────────────┐
│  MeuJudi Web (Next.js) — Lê do Supabase, mostra UI          │
└─────────────────────────────────────────────────────────────┘
```

---

## 📂 Estrutura do projeto

```
meujudi-cs/
├── src/
│   ├── main/                          # Processo principal Electron
│   │   ├── index.ts                   # Entry point + auto-diagnóstico 1ª vez
│   │   ├── tray.ts                    # Ícone na bandeja
│   │   ├── logger.ts                  # Pino estruturado
│   │   ├── pje-auth.ts                # OAuth-like login
│   │   ├── cookie-store.ts            # electron-store criptografado
│   │   ├── pje-api.ts                 # Cliente HTTP (29 endpoints)
│   │   ├── cert-detector.ts           # Detecta cert. A1 via PowerShell
│   │   ├── diagnostic.ts              # Roda 5 testes + gera relatório
│   │   ├── supabase-reporter.ts       # Envia relatório pro Supabase
│   │   ├── ipc-handlers.ts            # Registra todos os IPC
│   │   └── scheduler.ts               # Polling (stub Sprint 2)
│   ├── renderer/                      # UI Next.js
│   │   ├── pages/
│   │   │   ├── index.tsx              # Home
│   │   │   └── settings/
│   │   │       └── pje-connection.tsx # Tela de conexão
│   │   ├── components/
│   │   │   ├── StatusIndicator.tsx
│   │   │   ├── LogsViewer.tsx
│   │   │   └── DiagnosticViewer.tsx   # Mostra relatório + envia pro Supabase
│   │   ├── hooks/
│   │   │   ├── usePJeStatus.ts
│   │   │   └── useTimeAgo.ts
│   │   └── styles/globals.css
│   ├── preload/                       # IPC bridge seguro
│   └── shared/
│       ├── types.ts                   # PJeSession, DiagnosticReport, etc
│       ├── constants.ts               # URLs, timeouts, paths
│       ├── crypto.ts                  # AES-256-GCM
│       └── globals.d.ts               # window.meujudi types
├── assets/                            # Ícone (Caio: criar versão só do escudo p/ tray)
├── docs/
│   ├── sql/
│   │   └── 20260715_diagnostic_reports.sql  # Migration da tabela
│   └── setup-para-advogado.md         # Guia pro advogado leigo
├── installer.iss                      # Inno Setup
├── .env                               # Credenciais Supabase (NÃO commitar)
├── .env.example                       # Template
├── package.json
├── tsconfig.json / main / renderer
└── README.md
```

---

## 🔐 Segurança & LGPD

- **Cookies PJe:** criptografados com AES-256-GCM, chave única por máquina
- **PDFs em cache:** salvos temporariamente, deletados após extração
- **Texto pra IA:** Claude Haiku recebe texto **anonimizado** (CPF/CNPJ/OAB removidos)
- **Logs:** salvos em `%APPDATA%\meujudi-cs\logs\` (sem dados sensíveis)
- **Diagnóstico:** enviado pro Supabase sem cookie values nem senha do cert
- **Auto-start:** opt-in (configurável pelo usuário)

---

## 📋 Status do desenvolvimento

- [x] **Dia 1**: Setup Electron + Next.js + tray icon
- [x] **Dia 1.5**: UI da tela "Conectar PJe"
- [x] **Dia 2**: OAuth-like window + login (PJeAuth)
- [x] **Dia 2**: Cookie store persistente (CookieStore)
- [x] **Dia 2**: PJeAPI client com 29 endpoints
- [x] **Dia 2.5**: Modo diagnóstico (cert-detector + diagnostic + supabase-reporter)
- [x] **Dia 2.5**: UI do DiagnosticViewer
- [x] **Dia 2.5**: Diagnóstico automático na 1ª execução
- [x] **Dia 2.5**: Migration SQL da tabela `diagnostic_reports`
- [x] **Dia 2.5**: Guia de setup pro advogado
- [ ] **Dia 3**: Teste com cert. A1 real (precisa `npm install` + PC com cert)
- [ ] **Sprint 2**: Polling + download (dias 4-6)
- [ ] **Sprint 3**: Extração PDF + IA (dias 7-8)
- [ ] **Sprint 4**: LGPD + piloto (dias 9-10)

---

## 🧪 Como testar (3 cenários)

### Cenário 1: gov.br (mais fácil, sem cert. A1)

1. Abra o MeuJudi CS
2. Clique "🔌 Conectar ao PJe"
3. Na janela do PJe, clique "gov.br"
4. Faça login com CPF + senha
5. Janela fecha → "● Conectado"

### Cenário 2: cert. A1 (precisa do cert instalado)

1. Instale o cert. A1 no Windows (clique 2x no .pfx)
2. Abra o MeuJudi CS
3. Clique "🔌 Conectar ao PJe"
4. Na janela do PJe, clique "Certificado A1"
5. **Popup do Windows aparece** pedindo o cert
6. Selecione seu cert. A1
7. Marque "Sempre usar este certificado" (se aparecer)
8. Janela fecha → "● Conectado"

### Cenário 3: Diagnóstico automático (1ª execução)

1. Instale o MeuJudi CS com `--first-run`
2. App abre e roda diagnóstico automaticamente após 3s
3. Notificação: "Diagnóstico concluído!"
4. Relatório vai pro Supabase (se configurado)
5. Você vê no Supabase SQL Editor:
   ```sql
   select * from diagnostic_reports order by created_at desc limit 5;
   ```

---

## ✅ Validação pré-build (88 checks automáticos)

Antes de compilar o .exe, rode o validador:

```bash
node tests/validate-pre-build.js
```

**Resultado esperado:** 85+ checks ✅, 0 ❌

**O que ele valida:**
- ✅ Todos os 41 arquivos obrigatórios existem
- ✅ `package.json` tem nome, scripts, electron-builder config corretos
- ✅ `.env` tem Supabase configurado e está no `.gitignore`
- ✅ `pje-auth.ts` tem TODAS as proteções do cert. A1:
  - `select-client-certificate` (popup do cert)
  - `certificate-error` (erros de TLS)
  - `did-fail-load` (com tratamento de `ERR_BAD_SSL_CLIENT_AUTH_CERT`)
  - `did-navigate-in-page` (pushState do Angular)
  - Polling de URL a cada 1s (fallback)
  - Auto-seleção de cert único
  - Extração de userId do JWT Keycloak
  - 20+ logs detalhados
  - Timeout de 60s
- ✅ `cert-detector.ts` usa PowerShell pra detectar cert. A1
- ✅ `diagnostic.ts` roda 5 testes + sanitiza dados + envia pro Supabase
- ✅ `supabase-reporter.ts` tem timeout e trata erros
- ✅ `installer.iss` gera `MeuJudi-CS-Setup.exe`
- ✅ Doc do advogado explica cert. A1 + popup + troubleshooting + LGPD
- ✅ SQL cria tabela com RLS + índices

---

## 📚 Documentação

- [`docs/setup-para-advogado.md`](docs/setup-para-advogado.md) — Guia pro advogado leigo
- [`docs/sql/20260715_diagnostic_reports.sql`](docs/sql/20260715_diagnostic_reports.sql) — Migration Supabase
- [`MeuJudi/docs/roadmap/09-cert-a1.md`](../docs/roadmap/09-cert-a1.md) — Arquitetura v3
- [`MeuJudi/docs/roadmap/14-plano-teste-cert-a1.md`](../docs/roadmap/14-plano-teste-cert-a1.md) — Validação dos HARs
- [`MeuJudi/docs/roadmap/16-implementacao-cert-a1.md`](../docs/roadmap/16-implementacao-cert-a1.md) — Plano de execução (10 dias)
- [`MeuJudi/Investigação/Descoberta-API-PJe-TRT9.md`](../Investigação/Descoberta-API-PJe-TRT9.md) — Análise dos HARs

---

## 🏢 MeuJudi CS é uma vertical

```
verticals (MeuJudi, Game, ...)
└── meujudi
    ├── meujudi-web/         ← App Next.js (SaaS principal)
    ├── meujudi-cs/          ← Tray app Electron (este projeto)
    └── meujudi-super-admin/ ← Painel Caio
```

---

**Última atualização:** 15/07/2026 — Sprint 1, Dia 2.5
