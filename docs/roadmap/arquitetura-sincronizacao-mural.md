# Arquitetura de Sincronização Mural — CS como Serviço

> **Status:** Fases 1 a 4 implementadas no código; migration pendente de aplicação no Supabase
> **Autor:** Caio + Claude
> **Data:** 24/07/2026
> **Versão do doc:** 1.0

---

## 1. Problema

O MeuJudi tem duas fontes de dados judiciais:

| Fonte | O que traz | Pode consultar do Vercel? |
|---|---|---|
| **DataJud** | Movimentações, metadata de processos | ✅ Sim (API pública) |
| **Mural Eletrônico** | Prazos, audiências, comunicações, processos novos | ❌ Não (WAF bloqueia datacenters) |

**O Mural é a fonte mais urgente** — dele vêm prazos e audiências. Se o advogado não vê um prazo, ele perde o direito.

**Limitação técnica:** A API do Mural (`comunicaapi.pje.jus.br`) bloqueia requisições vindas de datacenters como Vercel (HTTP 403). Só pode ser acessada de redes residenciais/comerciais — ou seja, do PC do escritório via MeuJudi CS.

**Consequência:** Se o CS não estiver rodando, o sistema não recebe dados do Mural. Sem prazos, sem audiências, sem processos novos.

---

## 2. Objetivo

Criar uma arquitetura onde:

1. O CS funcione como **serviço autônomo** — roda sozinho, sem precisar de botão
2. O Web **saiba quando o CS está online** e avise o advogado quando não estiver
3. Exista uma **fila de tarefas** bem definida no CS
4. Os dados do Mural cheguem o mais rápido possível

---

## 3. Visão Geral da Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│                      SERVIDOR (Vercel)                        │
│                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ Heartbeat Store  │  │ Task Requests   │  │ Web UI       │ │
│  │ (cs_devices)     │  │ (cs_mural_      │  │ (detecta CS  │ │
│  │                  │  │  requests)      │  │  online/off) │ │
│  └────────┬─────────┘  └────────┬────────┘  └──────┬───────┘ │
│           │                     │                   │          │
└───────────┼─────────────────────┼───────────────────┼──────────┘
            │                     │                   │
     ┌──────▼─────────────────────▼───────────────────▼──────┐
     │                    CS (Electron)                        │
     │                                                         │
     │  ┌──────────────────────────────────────────────────┐  │
     │  │              TASK QUEUE                           │  │
     │  │                                                   │  │
     │  │  Tipo 1: Heartbeat (a cada 5 min)                │  │
     │  │  Tipo 2: Mural Push (a cada 30 min)              │  │
     │  │  Tipo 3: Mural Requests (a cada 5 min)           │  │
     │  │  Tipo 4: Mural Sweep (1x/dia)                    │  │
     │  │  Tipo 5: Mural Historical (1x/semana)            │  │
     │  └──────────────────────────────────────────────────┘  │
     │                                                         │
     │  ┌──────────────────────────────────────────────────┐  │
     │  │              SCHEDULER                            │  │
     │  │  Gerencia a fila e executa tarefas               │  │
     │  └──────────────────────────────────────────────────┘  │
     │                                                         │
     └─────────────────────────────────────────────────────────┘
```

---

## 4. Peças da Arquitetura

### 4.1 Heartbeat (CS → Servidor)

O CS envia um "estou vivo" pro servidor a cada 5 minutos.

**Por quê?** O Web precisa saber se o CS está online pra mostrar aviso ao advogado.

**Fluxo:**
```
CS (a cada 5 min):
  POST /api/cs/heartbeat
  { status: "online", lastActivity: "...", pendingTasks: 3, version: "0.3.0" }

Servidor:
  UPDATE cs_devices SET last_heartbeat = NOW(), status = 'online'
  WHERE device_token = '...'

Web (quando advogado abre /validacao-oab):
  GET /api/cs/status?tenant_id=...
  → Se último heartbeat > 10 min: "CS offline — dados podem estar desatualizados"
  → Se último heartbeat < 10 min: "CS online — tudo atualizado"
```

### 4.2 Task Queue (Fila de Tarefas do CS)

Uma fila centralizada que gerencia todas as tarefas com prioridade.

**Tarefas:**

| Tipo | Prioridade | Frequência | O que faz |
|---|---|---|---|
| `heartbeat` | 1 (máxima) | A cada 5 min | Envia "estou vivo" pro servidor |
| `mural_request` | 2 | A cada 5 min | Pega pedidos pendentes do servidor |
| `mural_push` | 3 | A cada 30 min | Detecta comunicações novas e envia |
| `mural_sweep` | 4 | 1x/dia (3h) | Busca últimas 24h no Mural |
| `mural_historical` | 5 (mínima) | 1x/semana (dom 3h) | Importa últimos 12 meses |

**Estrutura de uma tarefa:**
```typescript
interface Task {
  id: string;
  type: TaskType;
  priority: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  payload: Record<string, unknown>;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  retryCount: number;
  maxRetries: number;
}
```

### 4.3 Scheduler (Agendador do CS)

O agendador verifica a fila e executa tarefas na ordem de prioridade.

**Regras:**
- Só executa tarefa se o CS estiver pareado (device token existe)
- Só executa tarefa tipo `mural_*` se o PJe estiver conectado (sessão válida)
- Máximo 1 tarefa rodando por vez (não paraleliza)
- Se tarefa falhar, retenta com backoff exponencial (máx 3 vezes)

### 4.4 Status Reporter (Web detecta CS)

O Web verifica o status do CS antes de mostrar funcionalidades que dependem dele.

**Endpoints:**
- `POST /api/cs/heartbeat` — CS envia heartbeat
- `GET /api/cs/status` — Web consulta status do CS

**Lógica no Web:**
```
Se CS offline E não tem solicitação ativa:
  → Mostra CsPairingGate (bloqueante)
  → "Conecte o MeuJudi CS para sincronizar dados do Mural"

Se CS offline E tem solicitação ativa:
  → Mostra StatusCard (acompanhar)
  → "CS ficou offline durante a sincronização"

Se CS online:
  → Mostra form normally
```

---

## 5. Implementação — CS (Electron)

### Parte 1: Status Reporter (Heartbeat)

**Arquivo:** `meujudi-cs/src/main/status-reporter.ts` (novo)

**O que faz:**
- Envia heartbeat pro servidor a cada 5 minutos
- Registra última atividade (qual tarefa rodou por último)
- Reporta versão do CS e tarefas pendentes

**Dependências:**
- `Pairing` (pra obter device token)
- `MEUJUDI_WEB_URL` (constante)

**Interface:**
```typescript
class StatusReporter {
  constructor(private pairing: Pairing) {}
  start(): void                          // Inicia timer de 5 min
  stop(): void                           // Para timer
  reportNow(): Promise<void>             // Envia heartbeat imediato
  setLastActivity(activity: string): void // Registra última atividade
}
```

**Endpoint no servidor:** `POST /api/cs/heartbeat`

**Tabela:** `cs_devices` (colunas `last_heartbeat`, `status`, `app_version`)

---

### Parte 2: Task Queue

**Arquivo:** `meujudi-cs/src/main/task-queue.ts` (novo)

**O que faz:**
- Mantém fila de tarefas em memória (persiste em disco via electron-store)
- Adiciona/remove tarefas
- Retorna próxima tarefa por prioridade
- Marca tarefa como running/completed/failed

**Dependências:**
- `electron-store` (persistência local)

**Interface:**
```typescript
class TaskQueue {
  add(task: Omit<Task, 'id' | 'status' | 'retryCount' | 'createdAt'>): Task
  getNext(): Task | null                 // Próxima tarefa pending por prioridade
  markRunning(taskId: string): void
  markCompleted(taskId: string): void
  markFailed(taskId: string, error: string): void
  getPendingCount(): number
  getRunningCount(): number
  cleanup(): void                        // Remove tarefas completed/failed > 24h
}
```

**Persistência:**
- Salva em `electron-store` com nome `cs-task-queue`
- Serializa como JSON
- Limpa tarefas antigas a cada 24h

---

### Parte 3: Scheduler

**Arquivo:** `meujudi-cs/src/main/scheduler.ts` (refatorar)

**O que faz:**
- Inicia os crons de verificação de fila
- Executa tarefas na ordem de prioridade
- Limita concorrência (1 tarefa por vez)

**Crons:**

| Cron | O que faz |
|---|---|
| `*/5 * * * *` | Verifica pending requests do servidor |
| `*/30 * * * *` | Push de comunicações novas |
| `0 3 * * *` | Sweep das últimas 24h |
| `0 3 * * 0` | Importação histórica (12 meses) |

**Fluxo:**
```
A cada tick do cron:
  1. Verifica se CS está pareado → senão, skip
  2. Verifica se PJe está conectado → senão, skip (pra tarefas mural)
  3. Pega próxima tarefa da fila (por prioridade)
  4. Se tem tarefa rodando → skip
  5. Executa tarefa
  6. Marca como completed ou failed
  7. Atualiza status reporter
```

---

### Parte 4: Mural Push (Detectar comunicações novas)

**Arquivo:** `meujudi-cs/src/main/mural-push.ts` (novo)

**O que faz:**
- A cada 30 minutos, consulta o Mural pra ver se tem comunicação nova
- Janela: desde a última comunicação vista
- Envia pro servidor via batch

**Fluxo:**
```
1. Lê última data de comunicação vista (electron-store)
2. Consulta Mural: dataInicio = última data vista, dataFim = agora
3. Se tem coisa nova:
   a. Envia batch: POST /api/cs/sync/mural
   b. Atualiza última data vista
4. Se não tem nada → skip
```

**Diferença do `mural-sync.ts` atual:**
- O `mural-sync.ts` espera o servidor criar um pedido (`cs_mural_requests`)
- O `mural-push.ts` detecta por conta própria (sem pedido do servidor)
- São complementares: push detecta em tempo real, requests pega o que o servidor pediu

---

### Parte 5: Integração com módulos existentes

**Arquivos modificados:**
- `meujudi-cs/src/main/index.ts` — Inicia scheduler + status reporter
- `meujudi-cs/src/main/tray.ts` — Adiciona indicador de tarefas pendentes

**Mudanças no `index.ts`:**
```typescript
// ADICIONAR após initTray:
const scheduler = new Scheduler(pairing);
scheduler.start();

const statusReporter = new StatusReporter(pairing);
statusReporter.start();
```

**Mudanças no `tray.ts`:**
- Menu mostra: "Tarefas pendentes: 3"
- Menu mostra: "Última sincronização: há 15 min"
- Menu mostra: "CS: Online ✓" ou "CS: Offline ✗"

---

## 6. Implementação — Web (Vercel)

### Parte 1: Heartbeat Endpoint

**Arquivo:** `src/app/api/cs/heartbeat/route.ts` (novo)

**O que faz:**
- Recebe heartbeat do CS
- Atualiza `cs_devices.last_heartbeat` e `cs_devices.status`

**Request:**
```typescript
POST /api/cs/heartbeat
Headers: Authorization: Bearer <device_token>
Body: {
  status: "online",
  lastActivity: "mural_push",
  pendingTasks: 3,
  version: "0.3.0"
}
```

**Response:**
```typescript
{ ok: true, serverTime: "2026-07-24T17:00:00Z" }
```

**RLS:** Apenas device autenticado pode atualizar próprio registro.

---

### Parte 2: CS Status Endpoint

**Arquivo:** `src/app/api/cs/status/route.ts` (novo)

**O que faz:**
- Retorna status do CS pra um tenant

**Request:**
```typescript
GET /api/cs/status?tenant_id=...
```

**Response:**
```typescript
{
  online: true,
  lastHeartbeat: "2026-07-24T16:55:00Z",
  minutesSinceLastHeartbeat: 5,
  appVersion: "0.3.0",
  pendingTasks: 2,
  deviceName: "DESKTOP-IS6I73M"
}
```

---

### Parte 3: Atualizar `cs_devices` table

**Migration:** `20260725000001_cs_devices_heartbeat.sql`

```sql
-- Adiciona colunas de heartbeat
ALTER TABLE cs_devices
  ADD COLUMN IF NOT EXISTS last_heartbeat timestamptz,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS app_version text;

-- Índice para consultas de status
CREATE INDEX IF NOT EXISTS cs_devices_tenant_idx
  ON cs_devices (tenant_id, last_heartbeat DESC);
```

---

### Parte 4: CsPairingGate com status real

**Arquivo:** `src/app/(platform)/(tenant)/validacao-oab/cs-pairing-gate.tsx` (modificar)

**Mudança:**
- Em vez de só verificar se tem device pareado, verificar se o CS está **online**
- Se offline: mostrar aviso + botão "Verificar novamente"
- Se online: mostrar "CS conectado — sincronizando..."

**Lógica:**
```typescript
// No CsPairingGate:
const status = await checarCsStatus(tenantId);

if (!status.online) {
  return (
    <Card>
      <h2>MeuJudi CS está offline</h2>
      <p>Para sincronizar dados do Mural, o CS precisa estar rodando no PC do escritório.</p>
      <Button onClick={refresh}>Verificar novamente</Button>
    </Card>
  );
}

// Se online, mostra form normalmente
```

---

### Parte 5: Aviso global no layout

**Arquivo:** `src/app/(platform)/(tenant)/layout.tsx` (modificar)

**Mudança:**
- Adiciona banner no topo quando CS está offline
- Banner aparece em todas as páginas do tenant
- Sumirá quando CS ficar online

**Visual:**
```
┌─────────────────────────────────────────────────────┐
│ ⚠️ MeuJudi CS está offline. Dados do Mural podem    │
│ estar desatualizados. Última sincronização: há 2h.  │
└─────────────────────────────────────────────────────┘
```

---

## 7. Tabelas Afetadas

### `cs_devices` (modificar)

| Coluna | Tipo | Novo? | Descrição |
|---|---|---|---|
| `id` | uuid | — | PK |
| `tenant_id` | uuid | — | FK tenants |
| `device_name` | text | — | Nome do PC |
| `device_token` | text | — | Token SHA-256 |
| `revoked_at` | timestamptz | — | Quando foi despareado |
| `created_at` | timestamptz | — | Quando foi pareado |
| `last_heartbeat` | timestamptz | ✅ | Último heartbeat recebido |
| `status` | text | ✅ | "online" / "offline" / "error" |
| `app_version` | timestamptz | ✅ | Versão do CS |

### `cs_mural_requests` (já existe, sem mudanças)

Usada pra servidor criar pedidos que o CS pega.

---

## 8. Fluxos Completo

### Fluxo 1 — CS ligado, tudo funcionando

```
09:00 — CS inicia com o Windows
  → Scheduler.start()
  → StatusReporter.start()
  → Primeiro heartbeat enviado

09:05 — Heartbeat
  → POST /api/cs/heartbeat
  → Servidor atualiza cs_devices: status='online', last_heartbeat=now

09:30 — Mural Push (30 min)
  → CS consulta Mural: últimas 30 min
  → Encontra 2 comunicações novas
  → POST /api/cs/sync/mural (batch)
  → Servidor processa: cria processos, extrai prazos, agenda audiências
  → Advogado vê dados na tela ✅

10:00 — Heartbeat
  → Servidor registra: CS online, última atividade: mural_push

10:05 — Web: advogado abre /validacao-oab
  → GET /api/cs/status
  → Resposta: online, último heartbeat há 5 min
  → Mostra form normalmente ✅
```

### Fluxo 2 — CS offline, Web avisa

```
09:00 — CS estava ligado, último heartbeat: 08:55
09:10 — Advogado desliga o PC

09:15 — Heartbeat não chega (CS desligado)
09:20 — Heartbeat não chega
09:25 — Heartbeat não chega
  → Servidor: último heartbeat há 30 min → status='offline'

09:30 — Web: advogado abre /validacao-oab (em outro PC ou celular)
  → GET /api/cs/status
  → Resposta: offline, último heartbeat há 35 min
  → Mostra CsPairingGate: "CS está offline" ⚠️

10:00 — Advogado liga o PC novamente
  → CS inicia, envia heartbeat
  → Servidor: status='online'
  → Web (se aberto): auto-refresh detecta CS online ✅
```

### Fluxo 3 — Servidor cria pedido, CS pega

```
08:00 — Cron no Vercel: solicitar-mural
  → Cria pedido em cs_mural_requests: OAB 67553/PR, último sync = ontem
  → Status: pending

08:05 — CS (a cada 5 min): verifica pending requests
  → GET /api/cs/mural-requests
  → Encontra pedido pendente
  → Consulta Mural: ontem até hoje
  → Encontra 5 comunicações
  → POST /api/cs/sync/mural (batch de 5)
  → POST /api/cs/mural-requests/{id} (marca completed)
  → Advogado vê 5 comunicações novas ✅
```

---

## 9. Ordem de Implementação

### Fase 1 — Heartbeat + Status (1-2 dias)

| # | Arquivo | O que faz |
|---|---|---|
| 1.1 | `status-reporter.ts` (CS) | Envia heartbeat a cada 5 min |
| 1.2 | `api/cs/heartbeat/route.ts` (Web) | Recebe e registra heartbeat |
| 1.3 | `api/cs/status/route.ts` (Web) | Retorna status do CS |
| 1.4 | Migration `cs_devices_heartbeat.sql` | Adiciona colunas |
| 1.5 | `index.ts` (CS) | Inicia StatusReporter |

**Resultado:** Web sabe se CS está online/offline.

**Estado atual (24/07/2026):** implementada e validada com `typecheck` e `build` no Web e no CS. Para ativar no ambiente compartilhado, aplicar `supabase/migrations/20260725000001_cs_devices_heartbeat.sql`.

### Fase 2 — Scheduler Automático (1-2 dias)

| # | Arquivo | O que faz |
|---|---|---|
| 2.1 | `scheduler.ts` (CS) | Refatora com crons reais |
| 2.2 | `index.ts` (CS) | Inicia Scheduler automaticamente |
| 2.3 | `tray.ts` (CS) | Mostra status de tarefas no menu |

**Resultado:** CS funciona sozinho sem botão.

**Estado atual (24/07/2026):** implementada no `Scheduler`, com execução única por vez, verificação de pareamento/PJe, encerramento dos crons no fechamento do CS e preservação do fluxo manual. A fila persistente e o retry por tarefa ficam para a Fase 3.

### Fase 3 — Task Queue (2-3 dias)

| # | Arquivo | O que faz |
|---|---|---|
| 3.1 | `task-queue.ts` (CS) | Fila com prioridade + persistência |
| 3.2 | `mural-push.ts` (CS) | Detecta comunicações novas sem pedido |
| 3.3 | `scheduler.ts` (CS) | Usa fila em vez de lógica avulsa |

**Resultado:** Tarefas organizadas com prioridade.

**Estado atual (24/07/2026):** implementada com persistência local via `electron-store`, prioridades, retomada após reinício, retry progressivo limitado a três tentativas e `mural-push` com cursores por OAB.

### Fase 4 — Web UI (1-2 dias)

| # | Arquivo | O que faz |
|---|---|---|
| 4.1 | `cs-pairing-gate.tsx` | Mostra status real do CS |
| 4.2 | Layout do tenant | Banner global quando CS offline |
| 4.3 | Página de configurações | Status detalhado do CS |

**Resultado:** Advogado vê quando CS está offline e o que isso afeta.

**Estado atual (24/07/2026):** implementada com endpoint de status, atualização automática na configuração do CS, distinção entre dispositivo pareado/offline/online na validação OAB e banner global para dispositivos pareados que ficaram offline.

### Validação final

- CS: `npm run typecheck`, `npm run test` e `npm run build:main` aprovados.
- Web: `npm run typecheck` e `npm run build` aprovados.
- Pendência operacional: aplicar `supabase/migrations/20260725000001_cs_devices_heartbeat.sql` no projeto Supabase antes de usar o status ao vivo.
- Teste de ambiente: abrir o CS pareado, confirmar heartbeat em `cs_devices` e então validar a sincronização pelo Mural.

---

## 10. Riscos e Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| CS ficou offline eWeb não sabe | Advogado vê dados desatualizados | Heartbeat + aviso no Web |
| Heartbeat perde (rede ruim) | CS aparece offline falsamente | Janela de 10 min (não imediato) |
| Task queue corrompida | CS perde tarefas | Persistência em electron-store + rebuild |
| Mural API muda | CS quebra | Retry + tratamento de erro + versão |
| CS antigo sem heartbeat | Web sempre mostra offline | Compatibilidade: se não tem heartbeat, assume online |

---

## 11. Perguntas em Aberto

1. **O CS deve rodar como serviço do Windows?** (inicia sem login do usuário)
   - Atualmente: inicia com login (auto-start)
   - Serviço: roda mesmo sem ninguém logar
   - Custo: mais complexo de instalar

2. **Quantas OABs o CS deve gerenciar?**
   - Atualmente: 1 por tenant
   - Futuro: múltiplas OABs por escritório

3. **O CS deve ter UI própria?**
   - Atualmente: tray icon + janela básica
   - Futuro: dashboard de tarefas, logs, configurações

4. **Timeout do heartbeat: 10 min é suficiente?**
   - Se o CS travar por 11 min, Web mostra offline
   - Se o CS demorar 9 min pra reiniciar, Web ainda mostra online
