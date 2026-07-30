# Sincronização automática do PDPJ — 3 crons

Documento de implementação (30/07/2026), definido em conversa com o Caio a
partir de `21-politica-sincronizacao-unificada.md` e `22-extracao-pdpj-e-fila-
cs.md`. Cobre exatamente o que estava faltando: hoje a fila unificada
(`sync_tasks`) já tem os handlers `pdpj_oab`/`pdpj_cnj` funcionando de ponta a
ponta (CS varre, extrai, manda pro Web, Web roda Regex e atualiza Agenda) —
mas **nada cria essas tarefas automaticamente**. O Mural tem um cron
(`solicitar-mural`) que faz isso a cada 6h; o PDPJ não tinha nenhum
equivalente. Este documento fecha esse buraco com 3 crons, cada um com um
papel bem separado.

## Por que 3, e não 1

Espelha os 3 ciclos que `21-politica-sincronizacao-unificada.md` já definia
(rápido / operacional / longo), cada um resolvendo um problema diferente:

| Cron | Resolve | Frequência |
| --- | --- | --- |
| 1. `solicitar-pdpj` | Descobrir processo **novo** | a cada 6h |
| 2. `poll-pdpj-detalhes` | Manter processo **já conhecido** atualizado | de hora em hora, 9h-16h |
| 3. `poll-pdpj-urgentes` | Processo com **prazo/audiência perto** não pode esperar o rodízio geral | a cada 15min, dia todo |

Nenhum dos três se sobrepõe: o 1 nunca toca processo existente, o 2 nunca
descobre processo novo, o 3 é só uma versão prioritária e mais frequente do
2 pra um grupo pequeno e sensível a tempo.

---

## Cron 1 — `solicitar-pdpj` (descoberta)

**Rota:** `POST /api/cron/solicitar-pdpj` — mesmo padrão de autenticação e
estrutura de `src/app/api/cron/solicitar-mural/route.ts` (copiar o
esqueleto).

**Frequência:** a cada 6 horas (mesmo cadenciamento do Mural).

**Lógica, por OAB ativa de tenant com `access_status = 'liberado'`:**

1. Busca o último `sync_tasks` do tipo `pdpj_oab` concluído pra aquela
   OAB+UF, pra saber se já rodou hoje/recentemente.
2. Se a janela de dedup ainda está "quente" (ver idempotency key abaixo),
   pula — evita recriar a mesma tarefa toda hora que o cron dispara.
3. Cria 1 tarefa:
   ```sql
   insert into sync_tasks (tenant_id, source, type, idempotency_key, priority, cursor)
   values (
     :tenant_id, 'pdpj', 'pdpj_oab',
     'pdpj_oab:' || :oab_number || ':' || :oab_uf || ':' || :data_hoje,
     5,
     jsonb_build_object('oabNumber', :oab_number, 'oabUf', :oab_uf)
   )
   ```
   **Idempotency key inclui a data** (`pdpj_oab:12345:PR:2026-07-30`) — assim
   o cron pode disparar de novo em ciclos futuros sem ficar bloqueado pra
   sempre (padrão diferente do que existia antes só pra essa tarefa-mãe; as
   tarefas-filha `pdpj_cnj` de processo **novo** continuam com key fixa por
   CNJ, sem data — um processo só precisa ser "descoberto" uma vez).
4. O MeuJudi Sync do escritório reserva essa tarefa na fila normal (poll de
   30s do `SyncWorker`), varre a OAB paginada, e pra cada CNJ que **ainda não
   existe** em `processos`, cria uma tarefa-filha `pdpj_cnj` — código já
   existe, sem mudança (`meujudi-cs/src/main/pdpj-tasks.ts::handlePdpjOab`).

**O que exatamente atualiza:** só cria processos que não existiam
(`processos.cnj` novo). **Não toca em processo já existente** — nem
documentos, nem campos, nem `ultima_sync_pdpj`.

**Sem mudança de banco.**

---

## Cron 2 — `poll-pdpj-detalhes` (atualização rotativa)

**Rota:** `POST /api/cron/poll-pdpj-detalhes`.

**Frequência:** de hora em hora, das 9h às 16h (horário de Brasília) — 8
disparos por dia. Mesmo padrão de janela horária que `poll-datajud` já usa
(`deveRodarAgora`, comparando `horaAtualBrasilia()` com config).

**Lógica, por tenant liberado, a cada disparo:**

1. Conta quantos processos **ativos** estão "devendo" reescaneio:
   ```sql
   select count(*) from processos
   where tenant_id = :tenant_id
     and status = 'ativo'
     and (ultima_sync_pdpj is null or ultima_sync_pdpj < now() - interval '7 days')
   ```
2. Se `pendentes = 0` → não faz nada nesse tenant, sai na hora (é o "acelera
   e vai pros outros" — zero custo quando não tem trabalho).
3. Senão, calcula quantos processar **agora**:
   ```text
   horasRestantes = 16 - horaAtual + 1   (ex.: às 9h → 8; às 15h → 2; às 16h → 1)
   loteDeHoje = ceil(pendentes / horasRestantes)
   ```
   Isso faz o ritmo se ajustar sozinho: lote grande de manhã se tiver muita
   coisa pendente, lote pequeno perto do fim do expediente — sempre tentando
   zerar o pendente por volta das 16h, nunca estourando num disparo só.
4. Seleciona os `loteDeHoje` processos com `ultima_sync_pdpj` mais antigo
   primeiro (`order by ultima_sync_pdpj nulls first limit loteDeHoje`).
5. Pra cada um, cria uma tarefa `pdpj_cnj`:
   ```text
   idempotency_key = 'pdpj_cnj:' || cnj || ':' || data_hoje
   ```
   **Muda o formato da key** (antes era `pdpj_cnj:${cnj}`, fixo pra sempre —
   por isso nenhum processo já sincronizado podia ser reprocessado; agora
   inclui a data, permitindo reprocessar em ciclos futuros sem duplicar no
   mesmo dia).

**O que exatamente atualiza, por processo processado:**
- Detalhe do processo (via `buscarDetalhes`, sempre — é a única forma de
  saber se tem documento novo).
- **Só se houver documento novo** (ver seção "Pulo inteligente" abaixo):
  texto do documento, e a partir dele — prazos e audiências novos na
  Agenda, e campos do processo ainda vazios (`orgao_julgador`,
  `magistrado_nome`, `valor_causa`, `autor`, `reu`) — mesmo pipeline que já
  existe em `src/app/api/cs/sync/pdpj/route.ts`, sem mudança de lógica ali.
- `processos.ultima_sync_pdpj = now()` sempre, mesmo sem documento novo —
  é o que tira o processo da frente da fila do próximo disparo.

**Mudança de banco:**
```sql
alter table processos add column ultima_sync_pdpj timestamptz;
```
E o `/api/cs/sync/pdpj` (ou uma variação da tarefa `pdpj_cnj`) passa a
gravar esse campo — hoje só grava `ultima_sync_pje`.

---

## Cron 3 — `poll-pdpj-urgentes` (fila prioritária)

**Rota:** `POST /api/cron/poll-pdpj-urgentes`.

**Frequência:** a cada 15 minutos, o dia todo (sem janela de horário — um
prazo não escolhe hora pra vencer).

**Lógica, por tenant liberado, a cada disparo:**

1. Seleciona processos ativos com `prazo_proxima_resposta` **ou**
   `proxima_audiencia` nos próximos 3 dias (colunas já existem direto em
   `processos`, sem precisar de join com a Agenda).
2. Cria `pdpj_cnj` pra cada um, com a **mesma idempotency key com data que
   o Cron 2 usa** (`pdpj_cnj:{cnj}:{data}`) — os dois competem pela mesma
   dedup, então um processo urgente que o Cron 2 já pegou hoje não é
   duplicado pelo Cron 3 (a tentativa colide com `23505` e é ignorada, sem
   query extra pra checar antes).

**O que exatamente atualiza:** exatamente a mesma coisa do Cron 2
(documentos novos, prazos, audiências, campos vazios, `ultima_sync_pdpj`) —
a única diferença é **quem entra na fila e com que prioridade** (`priority`
mais alta, ex. `2`, contra o `6` padrão do `pdpj_cnj` normal — a fila do CS
já respeita prioridade).

**Sem mudança de banco além da já feita no Cron 2** (reusa
`ultima_sync_pdpj` e o novo formato de idempotency key).

---

## Pulo inteligente (compartilhado entre Cron 2 e Cron 3)

Sem isso, todo processo reprocessado baixaria o texto de **todos** os
documentos de novo, mesmo sem nada de novo — caro e desnecessário.

**Fluxo dentro de `handlePdpjCnj` (CS):**

1. `buscarDetalhes(cnj)` — sempre, é a única forma de saber a lista atual
   de documentos (chamada leve, sem texto).
2. Calcula o hash de cada URL de documento encontrado (mesmo algoritmo que
   `POST /api/cs/sync/pdpj/route.ts::salvarDocumento` já usa —
   `sha256(url)`).
3. Chama uma rota nova, pequena: `POST /api/cs/sync/pdpj/documentos-
   conhecidos` — manda a lista de hashes, recebe de volta quais **já
   existem** em `processo_documentos` pra aquele `processo_id`.
4. Filtra fora os já conhecidos. Se a lista de novos ficar vazia →
   `handlePdpjCnj` retorna `completed` na hora, sem chamar
   `buscarTextoComTolerancia` nenhuma vez — é o "pula rápido".
5. Se sobrar algum novo, baixa texto só desses (não dos que já tinha) e
   segue o fluxo normal de sempre (`enviarResultadoPdpj`).

**Nova rota no Web:**
```
POST /api/cs/sync/pdpj/documentos-conhecidos
body: { cnj: string, urlHashes: string[] }
resposta: { conhecidos: string[] }  // subconjunto de urlHashes que já existe
```
Autenticada por device-token, igual as outras rotas `/api/cs/*`.

---

## Resumo — mudanças de banco (1 migration)

```sql
alter table processos add column ultima_sync_pdpj timestamptz;
create index if not exists idx_processos_ultima_sync_pdpj
  on processos (tenant_id, ultima_sync_pdpj)
  where status = 'ativo';
```

O índice existe porque os Crons 2 e 3 fazem `order by ultima_sync_pdpj` toda
hora/15min — sem índice, isso vira table scan conforme a base cresce.

## Resumo — mudanças de código

| Arquivo | Mudança |
| --- | --- |
| `src/app/api/cron/solicitar-pdpj/route.ts` (novo) | Cron 1 |
| `src/app/api/cron/poll-pdpj-detalhes/route.ts` (novo) | Cron 2 |
| `src/app/api/cron/poll-pdpj-urgentes/route.ts` (novo) | Cron 3 |
| `src/app/api/cs/sync/pdpj/documentos-conhecidos/route.ts` (novo) | Pré-checagem do pulo inteligente |
| `src/app/api/cs/sync/pdpj/route.ts` | Passa a gravar `ultima_sync_pdpj` |
| `meujudi-cs/src/main/pdpj-tasks.ts` | `handlePdpjCnj` ganha o passo de pré-checagem antes de baixar texto |
| `supabase/migrations/...pdpj_ultima_sync.sql` (novo) | coluna + índice |
| `supabase/manual/...cron_schedules.sql` | 3 agendamentos novos (cron-job.org) |

## Ordem de implementação sugerida

1. Migration (coluna + índice).
2. Rota `documentos-conhecidos` + ajuste em `pdpj-tasks.ts` (pulo
   inteligente) — testável isoladamente antes dos crons existirem.
3. `/api/cs/sync/pdpj` passa a gravar `ultima_sync_pdpj`.
4. Cron 1 (`solicitar-pdpj`) — mais simples, copia o padrão do Mural.
5. Cron 2 (`poll-pdpj-detalhes`) — ritmo adaptativo.
6. Cron 3 (`poll-pdpj-urgentes`) — reusa a mesma lógica do Cron 2, só muda
   a seleção (prazo/audiência perto) e a frequência.
7. Registrar os 3 agendamentos (cron-job.org, com `CRON_SECRET`).
8. Testar: OAB nova descoberta (Cron 1), processo antigo sem mudança
   (pula rápido), processo antigo com documento novo (atualiza certo),
   processo com prazo perto entrando pelo Cron 3 antes do Cron 2 chegar
   nele.

## Critérios de aceite

- Processo novo numa OAB aparece no sistema em até 6h, sem ação manual.
- Processo já existente é reescaneado pelo menos 1x por semana, mesmo sem
  crescimento do volume de processos ativos.
- Processo sem documento novo não gasta chamada de texto nenhuma.
- Processo com prazo em 3 dias é verificado a cada 15min, não espera o
  rodízio semanal do Cron 2.
- Nenhum dos 3 crons duplica tarefa (idempotency key sempre resolve).
- Um tenant sem nada pendente não gera carga nenhuma no CS.
