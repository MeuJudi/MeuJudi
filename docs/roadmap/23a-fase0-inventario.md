# Fase 0 — Inventário, nomenclatura e contratos (MeuJudi CS 0.3.0)

> **Status:** Fase 0 do [`23-meujudi-cs-v0.3.0-refatoracao.md`](23-meujudi-cs-v0.3.0-refatoracao.md) — executada em 27/07/2026.
> **Objetivo:** preparar a migração sem alterar comportamento de produção. Sem código novo nesta fase, só mapeamento.

---

## 0. Atualização de contexto (confirmado pelo Caio em 27/07/2026)

- **O login PDPJ está funcionando** — não é mais um bloqueio. O CS já
  autentica via `https://www.jus.br` (`pje-auth.ts` v4) e já existe um
  cliente real da **API oficial do PDPJ** (`pdpj-api.ts`, base
  `https://portaldeservicos.pdpj.jus.br/api/v2`), usado manualmente hoje.
- **O que falta é a extração**: por CNJ, dados do processo e documentos.
  Hoje existe `buscarPorOab`, `buscarPorCnj`, `buscarDetalhes` e
  `buscarPorCpfCnpj` em `pdpj-api.ts`, e `PdpjExtractor` com
  `extractByOab`/`fetchProcessDetails` — mas isso roda **fora da fila**,
  sem persistência no Supabase, sem retomada por checkpoint, sem
  documentos. É exatamente o gap que as Fases 3 e 6 do doc 23 resolvem.

---

## 1. Inventário de IPC, páginas, stores e jobs atuais

### 1.1 Canais IPC (main → preload → renderer)

| Canal | Prefixo | Handler em `ipc-handlers.ts` | Notas |
|---|---|---|---|
| `pje:show-login` | `pje:*` | `auth.showLoginWindow()` | Abre a janela de login (hoje já é PDPJ/Jus.br por baixo, nome do canal ficou desatualizado) |
| `pje:status` | `pje:*` | `auth.getStatus()` | |
| `pje:disconnect` | `pje:*` | `auth.disconnect()` | |
| `pje:sync-now` | `pje:*` | `scheduler.tickNow()` | Dispara só o ciclo do Mural hoje (scheduler não conhece PDPJ) |
| `pje:get-logs` | `pje:*` | `getRecentLogs()` | |
| `pje:open-jus` | `pje:*` | `auth.openJus()` | |
| `pje:validate-api` | `pje:*` | (valida sessão da API PDPJ) | Nome enganoso — já é sobre PDPJ, não PJe |
| `pdpj:extract-oab` | `pdpj:*` | `pdpjExtractor.extractByOab()` | Único fluxo de extração real hoje |
| `pdpj:process-details` | `pdpj:*` | `pdpjExtractor.fetchProcessDetails()` | |
| `pdpj:linked-oabs` | `pdpj:*` | `pdpjExtractor.getLinkedOabs()` | |
| `pdpj:extraction-status` | `pdpj:*` | `pdpjExtractor.getStatus()` | |
| `pdpj:cancel-extraction` | `pdpj:*` | `pdpjExtractor.cancel()` | |
| `pairing:submit-code` / `:status` / `:unpair` | `pairing:*` | `Pairing` | Já no formato-alvo, não precisa renomear |
| `mural:sync-historical` / `:history-status` / `:poll-now` / `:progress` / `:remote-status` | `mural:*` | `MuralSync` | Já no formato-alvo |
| `oab:get-current` / `:open-active` / `:check-and-open` | `oab:*` | `ConfirmADVService` | Já no formato-alvo (validação de OAB, não confundir com extração de processo por OAB) |
| `diagnostic:run` / `:send-to-supabase` / `:get-last` | `diagnostic:*` | `Diagnostic` | Já no formato-alvo |
| `app:get-version` / `:open-logs-folder` | `app:*` | — | Já no formato-alvo |

**Conclusão:** só o prefixo `pje:*` (7 canais) precisa de rename. Todo o
resto (`pdpj:*`, `pairing:*`, `mural:*`, `oab:*`, `diagnostic:*`, `app:*`)
já segue a convenção que o doc 23 pede — o CS já está mais perto do alvo do
que o documento supunha quando foi escrito.

### 1.2 Páginas do renderer hoje

| Rota atual | Rota-alvo (doc 23, seção 8.3) | Conteúdo hoje |
|---|---|---|
| `pages/index.tsx` | `/` | Home — status PJe, Mural |
| `pages/settings/pje-connection.tsx` | `/sources/pdpj` (redirect da rota antiga) | Conexão + Diagnóstico + Logs (tudo junto, sem separação avançado/comum) |
| `pages/settings/pairing.tsx` | `/settings` (ou seção própria) | Pareamento |
| `pages/settings/oab-validation.tsx` | mantém, fora do escopo de sync | Validação de OAB via ConfirmADV — não é extração processual, não faz parte do motor unificado |

**Faltam por completo** (não existem hoje, são todas novas): `/sync`
(sincronizações), `/queue` (fila de tarefas), `/sources/mural` (hoje é só
um card dentro da home, `MuralProgressPanel`), `/diagnostics` e `/logs`
como páginas próprias (hoje são componentes dentro de
`pje-connection.tsx`), `/about`.

### 1.3 Stores locais (`electron-store`) hoje

| Store (`name:`) | Arquivo | Conteúdo | Compatível com a política do doc 23 (seção 2.2)? |
|---|---|---|---|
| padrão (`cookie-store`) | `cookie-store.ts` | Sessão/cookies do PDPJ, criptografado | ✅ Sim — é sessão, não dado processual |
| `cs-mural-push` | `mural-push.ts` | Cursores de push do Mural | ✅ Sim — é checkpoint/cursor, não dado processual permanente |
| `cs-mural-history` | `mural-sync.ts` | Checkpoint da sincronização histórica | ✅ Sim — é progresso, migra pro Supabase na Fase 3 |
| `cs-mural-progress` | `mural-sync.ts` | Histórico recente de progresso (`recent: []`) | ⚠️ Zona cinzenta — é cache de UI, aceitável se curto, mas o histórico oficial deve vir do Supabase (Fase 3/9) |
| `cs-pairing` | `pairing.ts` | Device token + dados do pareamento | ✅ Sim — é credencial de dispositivo |
| **`pdpj-extraction`** | `pdpj-store.ts` | **`job` + `records: PdpjProcessRecord[]`** | ❌ **Não** — `records` é um snapshot de processos guardado localmente. Contraria diretamente a seção 2.2 do doc 23 ("Não devem permanecer como fonte oficial local: snapshot de processos"). Tem até um `snapshotPath` separado (`pdpj-extraction-snapshot.json.enc`) reforçando isso |
| `cs-task-queue` | `task-queue.ts` | Fila de tarefas do Mural (`tasks: []`) | ⚠️ É exatamente o que a Fase 3 substitui — hoje é a fila oficial, deveria virar só buffer de emergência |

**Achado principal da Fase 0:** `pdpj-store.ts` é o item que mais diverge
do plano. Ele guarda o resultado da extração (processos, presumivelmentos
dados de movimentação) localmente, sem persistir no Supabase — exatamente
o padrão antigo que o doc 23 quer eliminar. É o alvo natural da Fase 6.

### 1.4 Jobs do scheduler hoje

```
*/5  * * * *   → mural_request_poll
*/30 * * * *   → mural_push
0    3 * * *   → mural_sweep
0    3 * * 0   → mural_historical
```

`TaskType` (`task-queue.ts`) só conhece os 4 tipos acima — **nenhuma tarefa
de PDPJ passa pela fila/scheduler hoje**. A extração por OAB/CNJ é
disparada manualmente via IPC (`pdpj:extract-oab`) e roda direto, sem
prioridade, sem retry estruturado, sem lease. Confirma o gap que a Fase 4
(worker unificado) e Fase 6 (coleta PDPJ como tarefas) precisam fechar.

---

## 2. Mapa de aliases `pje:*` → `pdpj:*`

Só os 7 canais abaixo precisam de rename (o resto já está correto — ver
seção 1.1). Durante a transição (doc 23, seção 4.2), os canais antigos
ficam como alias interno, sem aparecer na UI:

| Canal antigo | Canal novo proposto |
|---|---|
| `pje:show-login` | `pdpj:show-login` |
| `pje:status` | `pdpj:status` |
| `pje:disconnect` | `pdpj:disconnect` |
| `pje:sync-now` | `pdpj:sync-now` *(ou fica genérico `sync:now` quando a Fase 4 unificar DataJud+Mural+PDPJ num só disparo)* |
| `pje:get-logs` | `diagnostic:get-logs` *(já existe namespace `diagnostic:*`, faz mais sentido mover pra lá do que criar `pdpj:get-logs`)* |
| `pje:open-jus` | `pdpj:open-jus` |
| `pje:validate-api` | `pdpj:validate-api` |

No preload (`window.meujudi.pje.*`) o grupo correspondente vira
`window.meujudi.pdpj.*` — hoje já existe um grupo `pdpj` separado
(`getLinkedOabs`, `extractByOab`, etc.), então o rename também é uma
oportunidade de **unificar os dois grupos** (`pje` + `pdpj` → um só
`pdpj`), já que a distinção entre "conexão" e "extração" não precisa virar
dois namespaces JS diferentes — é mais sobre a estrutura de páginas
(seção 8.7 do doc 23: Conexão do app / Login da fonte / Sessão da API /
Extração) do que sobre o IPC em si.

---

## 3. Contrato de tarefa, progresso e resultado (proposta)

Não existe hoje um contrato único — cada fluxo (Mural, PDPJ) tem seu
próprio formato ad hoc (`MuralRequestProgress`, `PdpjExtractionJob`,
`PdpjExtractionSummary` em `shared/types.ts`). A Fase 3 precisa de um
formato único. Proposta baseada no que o doc 23 já especifica (seções 6.2,
6.3, 7.1, 7.2) + nos campos que os formatos atuais já usam:

```ts
interface SyncTask {
  id: string;                 // uuid, gerado no Supabase
  tenantId: string;
  deviceId: string | null;    // null enquanto não reservada (claimed)
  parentTaskId: string | null;
  source: 'datajud' | 'mural' | 'pdpj';
  type: string;                // ex.: 'pdpj_oab' | 'pdpj_cnj' | 'pdpj_detalhes' | 'pdpj_movimentacoes' | 'pdpj_documentos' | 'mural_request_poll' | ...
  processoId: string | null;
  cnj: string | null;
  status: 'pending' | 'claimed' | 'running' | 'waiting_external'
    | 'paused_login_required' | 'paused_rate_limit'
    | 'completed' | 'completed_with_warnings' | 'failed' | 'cancelled';
  priority: number;            // 1 (mais urgente) a 9, ver doc 23 seção 6.4
  cursor: string | null;       // checkpoint/página, formato livre por source
  attempt: number;
  leaseExpiresAt: string | null;
  idempotencyKey: string;
  errorCode: string | null;
  errorMessage: string | null; // sempre sanitizado, nunca segredo
  startedAt: string | null;
  lastActivityAt: string | null;
  completedAt: string | null;
}

interface SyncTaskResult {
  taskId: string;
  source: 'datajud' | 'mural' | 'pdpj';
  data: Record<string, unknown>;   // dado canônico bruto (sem PDF)
  metadata: { fetchedAt: string; oab?: string; uf?: string; cnj?: string };
  officialLinks: string[];
  extractedText: string | null;    // só quando permitido, nunca o PDF
  nextCursor: string | null;
  counters: { recebidos: number; novos: number; atualizados: number; ignorados: number };
  warnings: string[];
  error: { code: string; message: string } | null;
}
```

Isso é proposta pra discussão na Fase 3, não implementação — registrado
aqui só pra fechar a entrega "contrato final" da Fase 0. `MuralRequestProgress`
e `PdpjExtractionJob`/`PdpjExtractionSummary` (hoje em `shared/types.ts`)
são os pontos de partida a migrar pra esse formato único.

---

## 4. Migrations existentes relacionadas

```
20260716210000_task_kanban.sql                       — kanban do Web, não é a fila do CS
20260719000002_fila_lote_e_classificacao_urgencia.sql — fila de lote do motor de IA/Regex (Web), não é a fila do CS
20260721000010_cs_releases.sql                        — releases do instalador
20260722000003_cs_devices.sql                         — pareamento (Fase 1-8 do doc 19, já em produção)
20260722000006_cs_mural_requests.sql                  — pedidos de Mural (versão inicial)
20260723000001_cs_mural_requests_refactor_oab.sql      — refactor pra OAB
20260723000001_cs_mural_requests_refactor_oab_simple.sql
20260723000001_github_cs_releases.sql
20260725000001_cs_devices_heartbeat.sql                — heartbeat (arquitetura-sincronizacao-mural.md Fase 1)
```

**Não existe ainda** nenhuma migration pra fila persistente unificada
(`sync_tasks` ou nome equivalente) nem pra resultado
(`sync_task_results`) — confirma que a Fase 3 parte do zero nesse ponto.
`cs_mural_requests` é o precedente mais próximo (já tem `status`,
`claimed_at`, `completed_at`) mas é específico de Mural/OAB, sem os campos
de tarefa pai/filha, cursor, lease, prioridade que a fila unificada
precisa.

---

## 5. Matriz: o que é local vs. o que vai pro Supabase

| Dado | Hoje | Deveria ser (doc 23, seção 2.2) |
|---|---|---|
| Cookies/tokens de sessão PDPJ | Local, criptografado (`cookie-store.ts`) | ✅ Já está certo — pode ficar local |
| Device token / pareamento | Local, criptografado (`pairing.ts`) | ✅ Já está certo |
| Preferências de janela/notificação | — (não existe ainda) | ✅ Pode ficar local quando existir |
| Checkpoint/cursor de sync (Mural) | Local (`cs-mural-history`, `cs-mural-push`) | ⚠️ Deveria ser Supabase (Fase 3) — local só como fallback curto |
| Fila de tarefas (Mural) | Local (`cs-task-queue`) | ❌ Deveria ser Supabase (Fase 3) — local vira buffer de emergência |
| **Snapshot de processos extraídos via PDPJ** | **Local (`pdpj-store.ts`, `records: PdpjProcessRecord[]`)** | ❌ **Não deveria existir local nenhum** — é exatamente o "snapshot de processos" que a seção 2.2 proíbe. Alvo direto da Fase 6 |
| PDF original | Não é baixado hoje (extração atual só pega metadados/detalhes via API) | ✅ Já está alinhado — nunca deve ser baixado pelo CS |
| Progresso de sincronização | Parcial local (`cs-mural-progress`), parcial nenhum (PDPJ não reporta progresso estruturado ainda) | ❌ Deveria ser 100% Supabase (Fase 3/9) |

---

## 6. Campos que não podem aparecer em logs/payloads

Já implementado hoje em dois lugares (`logger.ts` e `pdpj-api.ts`), acumulado
aqui como referência única pra Fase 9 (observabilidade):

- `XSRF-TOKEN=...` (cookie) — `logger.ts`
- `JSESSIONID=...` (cookie) — `logger.ts`
- `AUTH_SESSION_ID=...` (cookie) — `logger.ts`
- `KEYCLOAK_[A-Z_]+=...` (cookies do SSO) — `logger.ts`
- Strings que batem padrão de JWT (`eyJ...`) — `logger.ts`, trunca contexto >800 chars
- `Bearer <token>` — `pdpj-api.ts` (`.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, ...)`)
- `"access_token"`, `"refresh_token"`, `"token"` em JSON — `pdpj-api.ts`

**Gaps pra Fase 9 fechar:**
- CPF/CNPJ (usado em `buscarPorCpfCnpj`) — não tem máscara hoje em lugar
  nenhum, deveria ser tratado como dado pessoal sensível nos logs.
- Número de OAB isolado — o doc 23 (seção 8.6) já prevê "OAB mascarada
  quando necessário" na tela de fila; a mesma máscara devia valer pra logs.
- Nenhum `correlation id` por tarefa/sincronização existe ainda (doc 23,
  seção 9.1) — é o que amarra "esse erro pertence a essa tarefa" nos logs
  estruturados.

---

## 7. Aceite da Fase 0

Conferido: nenhum contrato duplicado (a fila de Mural e a de PDPJ são
incompatíveis entre si hoje, mas nenhuma delas conflita com o contrato
proposto na seção 3 — é greenfield). Nenhum segredo novo foi exposto neste
levantamento (só leitura de código, nenhuma execução).

**Pronto pra Fase 1** (shell visual e navegação) — que pode ser feita em
paralelo ou logo em seguida, já que não depende de resolver o gap de
`pdpj-store.ts` (isso é Fase 3/6).
