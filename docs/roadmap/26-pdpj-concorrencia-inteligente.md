# 26 — Concorrência inteligente do PDPJ (auto-ajuste, multi-PC, roteamento por OAB)

> **Status (04/08/2026): implementado.** Partes A, B e C foram implementadas
> nesta sessão, seguindo exatamente a sequência da seção 6. O resto do
> documento é o desenho original — mantido como referência, com anotações
> `[implementado]` marcando o que mudou de plano pra código real.

## 1. Objetivo

Hoje `MAX_CONCURRENCY_PERMITIDA`/`maxConcurrentPdpj` (`meujudi-cs/src/main/pdpj-concurrency.ts`)
é um número fixo por máquina, editado manualmente na tela de Diagnóstico. O
Caio quer três melhorias, que juntas viram um sistema de concorrência
"inteligente":

- **A. Auto-ajuste por máquina** — cada PC decide sozinho quantas janelas
  PDPJ consegue abrir, baseado nas próprias specs (RAM/CPU livres) e na
  quantidade de tarefas pendentes naquele momento. Menos tarefas → menos
  janelas; mais tarefas e máquina com folga → mais janelas, respeitando um
  teto de segurança.
- **B. Distribuição entre PCs do escritório** — se o escritório tem mais de
  um computador rodando o CS, o trabalho pendente deve se equilibrar entre
  eles em vez de um só PC carregar tudo.
- **C. Roteamento por OAB restritiva** — quando o PDPJ bloquear um processo
  específico dizendo "esse usuário não tem acesso" (`isAcessoNegadoProcessoEspecifico`,
  `meujudi-cs/src/main/pdpj-api-helpers.ts`), o sistema descobre qual OAB do
  escritório *tem* acesso àquele processo (via `processos.advogados`) e passa
  a mandar essa tarefa só pro PC/conta pareado com essa OAB, em vez de
  continuar falhando ou distribuir pra qualquer PC.

## 2. O que já existe (base que dá pra reaproveitar)

Levantamento do estado atual, pra não redesenhar o que já está pronto:

- **Concorrência por máquina** — `pdpj-concurrency.ts` já tem o conceito de
  "teto configurável + trava de segurança automática": `getMaxConcurrentPdpj()`,
  cooldown de 30min forçando concorrência 1 após um HTTP 429 real
  (`registrar429PDPJ()`), teto absoluto `MAX_CONCURRENCY_PERMITIDA = 10`. Isso
  **não muda** — o auto-ajuste (A) só troca *onde* o número configurado vem
  (arquivo estático → cálculo dinâmico), a trava de 429 continua sendo a
  autoridade final, sempre vencendo o que o algoritmo sugerir.
- **Multi-device já é nativo no modelo de fila** — `sync_tasks.device_id` e a
  tabela `cs_devices` (`id, tenant_id, user_id, device_name, status,
  last_heartbeat, pending_tasks`) já existem. O claim é *pull-based* e atômico
  por linha (`POST /api/cs/tasks/claim`, `src/app/api/cs/tasks/claim/route.ts`):
  cada device pede até `limit` tarefas (hoje um `DEFAULT_LIMIT = 5` fixo por
  request) e o `UPDATE ... WHERE status = <esperado>` garante que dois devices
  nunca fecham a mesma tarefa. **Isso já resolve boa parte do item B** — ver
  seção 4.
- **Padrão de claim pessoal por OAB já existe** — `oab_validations`
  (`src/app/api/cs/oab-validations/route.ts`) já faz exatamente o tipo de
  roteamento pessoal que o item C precisa: o claim ali é escopado por
  `(tenant_id, user_id)` do device, porque "a validação de OAB é pessoal: só
  o dispositivo pareado pelo próprio dono da OAB deve abrir a janela". O item
  C reaproveita essa mesma ideia, aplicada a `sync_tasks`.
- **A tarefa `pdpj_oab` já carrega a OAB pesquisada** —
  `cursor: { oabUf, oabNumber, ... }` em toda tarefa `pdpj_oab` (confirmado
  via linha real do banco: `cursor.oabNumber = "67553", cursor.oabUf = "PR"`).
- **`processos.advogados` já lista todas as OABs de cada processo** — array
  `[{ uf, oab, nome }]` por processo, alimentado pelo DataJud/PDPJ. É a fonte
  de "quais OABs teoricamente têm acesso a este CNJ", usada no item C.
- **Erro de acesso negado por processo específico já é diferenciado** —
  `isAcessoNegadoProcessoEspecifico()` (`pdpj-api-helpers.ts`) já separa esse
  caso de um 401 de sessão inválida, e `handlePdpjOab`/`handlePdpjCnj`
  (`pdpj-tasks.ts`) já tratam isso sem derrubar a sessão. Falta só decidir o
  que fazer *depois* de detectar — hoje vira `failed`/`sem_acesso_pdpj`
  terminal; o item C muda esse destino.

## 3. Parte A — Auto-ajuste por specs do PC + fila pendente

### 3.1 O que calcular

Trocar `lerConcorrenciaConfigurada()` (hoje só lê o JSON) por uma função que
combina três limites e usa o **menor** deles:

1. **Limite por RAM livre** — `os.freemem()` (Node built-in, sem custo). Cada
   janela PDPJ é um Chromium real e oculto, orçamento estimado de ~300–400MB
   por janela (a confirmar com medição real, ver seção 7). `limiteRam =
   floor(freemem / ORCAMENTO_POR_JANELA)`.
2. **Limite por CPU** — `os.cpus().length`. Regra simples pra não saturar o
   PC pro resto do que o usuário estiver fazendo: `limiteCpu = max(1,
   cores - 1)`.
3. **Limite pela fila** — não faz sentido abrir 6 janelas se só tem 2 tarefas
   pendentes. `limitePorFila = min(tarefasPendentesNoDevice, limiteRam,
   limiteCpu)`.

```
concorrenciaCalculada = clamp(
  min(limiteRam, limiteCpu, limitePorFila),
  1,
  MAX_CONCURRENCY_PERMITIDA   // teto de sanidade, continua existindo
)
```

O cooldown de 429 (`emCooldown()`) continua tendo prioridade máxima sobre
esse cálculo — se está em cooldown, é sempre 1, ponto final.

### 3.2 O que muda na UI de Diagnóstico

O painel `PdpjConcurrencyPanel.tsx` hoje edita um número fixo. Passa a:

- Mostrar o número **calculado agora** (RAM livre, CPUs, tarefas pendentes,
  resultado) — transparência de "por que o sistema escolheu X".
- O campo editável vira um **teto manual opcional** ("nunca passar de N"),
  não mais o valor exato usado. Se o Caio não configurar nada, o sistema usa
  só o cálculo automático. Preserva o controle manual que ele já tem hoje
  (importante manter, é a ferramenta que ele usa pra testar limites com
  segurança) sem obrigar micro-gerência constante.

### 3.3 Frequência de recálculo

Recalcular a cada ciclo de claim (o CS já faz polling periódico pra pegar
tarefas novas) em vez de só ler uma vez no início — RAM livre muda conforme o
Caio abre/fecha outros programas.

## 4. Parte B — Distribuição entre PCs do escritório

### 4.0 Garantia que já existe hoje: dois PCs nunca consultam o mesmo processo ao mesmo tempo

Ponto que o Caio levantou como preocupação central do item B: ele **já está
coberto pela arquitetura atual**, não é algo que precisa ser construído —
vale só deixar explícito e confirmado aqui:

- Existe **uma única linha** de tarefa por CNJ por dia — `unique (tenant_id,
  idempotency_key)` em `sync_tasks`
  (`supabase/migrations/20260729090000_sync_tasks.sql:42`), com
  `idempotency_key = "pdpj_cnj:<cnj>:<data>"`. Não existe (nem pode existir,
  o banco recusa) uma segunda tarefa pro mesmo processo no mesmo dia.
- O claim dessa linha é **atômico**: `UPDATE sync_tasks SET status =
  'claimed', device_id = ... WHERE id = X AND status = <status esperado>`
  (`src/app/api/cs/tasks/claim/route.ts:63-77`). Se dois PCs pedirem tarefas
  no mesmo instante e ambos "virem" a mesma linha `pending`, só o primeiro
  `UPDATE` a chegar no Postgres tem efeito — o `WHERE status = ...` do
  segundo já não bate mais (a linha virou `claimed`), então ele simplesmente
  não reserva nada e segue pra próxima da lista.
- Resultado prático: **é fisicamente impossível**, do jeito que o sistema já
  funciona hoje, dois PCs abrirem janela e consultarem o mesmo CNJ ao mesmo
  tempo. Isso não é um risco a mitigar no item B — é uma garantia que a
  Parte B só precisa **preservar**, não mudar nada da lógica de claim em si,
  só o número (`limit`) que cada PC pede.

### 4.1 Diagnóstico importante: já é distribuído, só falta o `limit` certo

O modelo atual já é *pull-based*: cada device pede tarefas quando tem
capacidade livre, não existe um "orquestrador central" empurrando trabalho
pra um PC específico — e isso é bom, é mais simples e resiliente (um device
offline não trava nada, só não pede mais nada). O gargalo real não é "falta
um algoritmo de distribuição", é que hoje o `limit` pedido em
`POST /api/cs/tasks/claim` é fixo (`DEFAULT_LIMIT = 5`, cliente também manda
um valor fixo hoje) — não reflete a capacidade real calculada na Parte A.

**Mudança proposta:** o CS, ao chamar `/api/cs/tasks/claim`, manda
`limit = getMaxConcurrentPdpj()` (o valor calculado na Parte A) em vez de um
número fixo. Cada PC automaticamente pede mais quando tem RAM/CPU livre e
fila grande, pede menos quando não tem — o balanceamento entre múltiplos PCs
emerge naturalmente disso, sem precisar de um sistema separado de "detectar
quantas pessoas estão ativas".

### 4.2 O que falta de fato

- **Visibilidade agregada** — hoje não existe uma tela mostrando "o
  escritório tem N devices online, cada um processando M tarefas". Dá pra
  montar isso com o que já existe em `cs_devices` (`status`, `last_heartbeat`,
  `pending_tasks`) — é só uma tela nova, sem mudança de modelo de dados.
- **Lease expirado como rede de segurança** — se um PC trava/fecha no meio de
  um lote, `lease_expires_at` (10min, já implementado em `claim/route.ts`)
  já devolve a tarefa pro pool geral automaticamente. Isso já cobre o caso
  "PC caiu, outro PC deveria pegar o trabalho" sem mudança nenhuma.

### 4.3 Não fazer (por enquanto)

Um sistema de "rebalanceamento ativo" (tirar tarefa já reservada de um PC
lento e realocar pra outro mais rápido) é bem mais complexo e o ganho é
questionável com poucos PCs por escritório. Recomendo não entrar nisso agora
— reavaliar só se, na prática, aparecer um caso real de fila desbalanceada
mesmo com o `limit` dinâmico.

## 5. Parte C — Roteamento por OAB restritiva

Esta é a parte nova de verdade — não tem equivalente pronto, mas reaproveita
o padrão de claim pessoal de `oab_validations`.

### 5.1 Fluxo

1. Uma tarefa `pdpj_cnj` falha com `isAcessoNegadoProcessoEspecifico(error) === true`.
2. Em vez de marcar `failed` direto, o CS busca (ou o backend já sabe, via
   `processos.advogados` do `processo_id` da tarefa) quais OABs constam
   naquele processo.
3. Cruza essa lista com as OABs *validadas e pareadas* no tenant — usar
   `oab_validations` (`status = 'validado'` ou equivalente) como fonte de
   verdade de "qual `user_id` deste escritório realmente controla esta OAB",
   já que é exatamente esse o propósito daquela tabela.
4. **Se achou um `user_id` dono de uma das OABs do processo:** a tarefa volta
   pra `pending`, mas marcada com um requisito de dono (`required_user_id` —
   ver schema abaixo). Ela só pode ser reivindicada por um device cujo
   `device.userId` bata com esse requisito.
5. **Se nenhuma OAB do processo está validada/pareada no tenant:** não tem
   pra quem rotear — marcar `failed` terminal como hoje, mas com mensagem
   diferenciada ("nenhuma OAB do escritório tem acesso a este processo"), pra
   não competir por atenção com os casos realmente acionáveis.
6. **Trava anti-loop:** se depois de N tentativas roteadas (ex.: 3) a tarefa
   continuar sem ser pega por ninguém (ex.: o dono da OAB nunca liga o PC
   dele), ela não fica pendente pra sempre — expira pra um estado tipo
   `paused_aguardando_oab`, visível na Fila, sem continuar tentando sozinha.
   **[implementado — simplificado]** Não criei um status novo pra isso: a
   tarefa fica em `pending` normal, mas com `error_message` explicando "só a
   OAB X/UF tem acesso... aguardando aquele dispositivo processar" — já
   visível no card de tarefa da Fila sem mudar `STATUS_LABEL`/`STATUS_CLASS`.
   Não fica "invisível": ela só nunca é reivindicada por quem não é dono da
   OAB, então simplesmente espera. O caso "ninguém tem essa OAB" (que
   *precisa* virar falha definitiva) já era coberto pelo passo 5 e continua
   igual. Se na prática aparecer tarefa esperando por muito tempo sem o
   dispositivo certo aparecer, aí sim vale reavaliar um estado dedicado —
   não quis adicionar um enum novo especulativamente.

### 5.2 Schema necessário (planejamento — não aplicar ainda)

Duas colunas novas em `sync_tasks`, mínimas e reaproveitando o padrão já
usado por `device_id`:

```sql
alter table public.sync_tasks
  add column required_user_id uuid references auth.users(id),
  add column required_oab_number text,
  add column required_oab_uf text;
```

**[implementado]** `required_user_id` referencia `public.users(id)`, não
`auth.users(id)` — é o mesmo padrão que `cs_devices.user_id` e
`oab_validations.user_id` já usam neste schema (confirmado lendo as
migrations existentes antes de aplicar). Migration real:
`supabase/migrations/20260804010000_sync_tasks_required_oab_routing.sql`.

- `required_user_id` — se preenchido, só esse usuário pode reivindicar a
  tarefa (equivalente ao escopo pessoal que `oab_validations` já usa).
- `required_oab_number`/`required_oab_uf` — guardados por rastreabilidade e
  pra mostrar na UI *por que* a tarefa está restrita ("só OAB 121236/PR
  consegue"), mesmo que `required_user_id` seja o campo realmente usado no
  filtro do claim.

### 5.3 Mudança em `/api/cs/tasks/claim`

Adicionar ao `WHERE` da query de candidatas: `required_user_id is null or
required_user_id = device.userId` — uma linha a mais na cláusula já existente
em `route.ts:44`, sem mudar a lógica de claim atômico por linha.

### 5.4 Mudança em `pdpj-tasks.ts` / backend

O ponto de decisão "recontextualizar em vez de falhar direto" precisa existir
em algum lugar — mais natural no backend (endpoint de `complete`/`fail` da
tarefa, `src/app/api/cs/tasks/[taskId]/complete/route.ts`), não no CS, porque
é lá que dá pra consultar `processos.advogados` e `oab_validations` com
uma única fonte de verdade pro tenant inteiro (evita cada PC ter uma visão
diferente de "quem tem qual OAB").

## 6. Sequência de implementação sugerida

Ordem por dependência e por risco (mais simples e mais seguro primeiro):

1. **Parte A** (auto-ajuste por PC) — isolado, não mexe em schema nem em
   outros devices, fácil de testar e reverter. Base pra tudo depois.
2. **Parte B, item 4.1** (mandar `limit` dinâmico no claim) — pequena mudança
   de um número fixo pra `getMaxConcurrentPdpj()`, só funciona bem depois da
   Parte A existir.
3. **Parte B, item 4.2** (tela de visibilidade agregada) — só UI, sem
   dependência técnica das outras partes, pode ser feito em paralelo se
   quiser.
4. **Parte C** (roteamento por OAB) — a mais trabalhosa (migration +
   claim + lógica de decisão no backend), fazer por último e com mais tempo
   de teste, porque envolve decidir o destino de tarefas que hoje já falham
   de um jeito conhecido — regressão aqui é mais visível.

## 7. Perguntas em aberto / a validar antes de implementar

- **Orçamento real de RAM por janela PDPJ** (usado no cálculo da Parte A) —
  hoje é uma estimativa (~300–400MB). Vale medir de verdade com o Gerenciador
  de Tarefas do Windows rodando 1, 3 e 5 janelas simultâneas antes de travar
  a fórmula, pra não errar o cálculo em nenhuma direção.
  **[implementado com a estimativa]** `RAM_ESTIMADA_POR_JANELA_MB = 350`
  (`pdpj-concurrency.ts`), com reserva mínima de 1GB de RAM livre nunca
  contada. Continua sendo estimativa — ainda vale medir de verdade no
  Gerenciador de Tarefas rodando 1/3/5 janelas e ajustar essa única
  constante se o número real for bem diferente.
- **Qual status usar em `oab_validations` como "OAB confirmadamente pareada
  a este usuário"** — confirmar o valor exato de `status` que representa
  "validado com sucesso" (visto no código: fluxo passa por
  `pendente → aguardando_cs → ... → validando`; falta confirmar o estado
  final de sucesso) antes de usar essa tabela como fonte de verdade no
  item C.
  **[respondido]** É `'validada'` — confirmado no `check` constraint de
  `supabase/migrations/20260723000010_oab_validations.sql:14-17`. É o valor
  usado no filtro de `encontrarDonoDeOabComAcesso()`
  (`complete/route.ts`).
- **O que fazer com tarefas `paused_aguardando_oab`** (item 5.1.6) na UI da
  Fila — hoje `TYPE_LABEL`/`STATUS_LABEL` (`queue.tsx`) não têm esse estado;
  precisa de rótulo e cor novos, e provavelmente entra na mesma lógica de
  "precisa de atenção" que hoje cobre `paused_login_required`/`paused_rate_limit`.
  **[resolvido ao simplificar]** Não existe mais esse status — ver nota
  "[implementado — simplificado]" na seção 5.1. `queue.tsx` não precisou de
  nenhuma mudança pra Parte C.
- **Escopo do teto manual da Parte A** — confirmar se o teto manual que sobra
  na UI de Diagnóstico deve ser por PC (como é hoje, arquivo local) ou se
  algum dia faz sentido ser por tenant (configurado uma vez, valendo pra
  todos os PCs do escritório). Recomendo manter por PC — mais simples e já é
  o modelo mental atual do Caio.
  **[implementado como planejado]** Continua por PC (arquivo local em
  `app.getPath('userData')`), agora como teto opcional em vez de valor fixo.

## 8. O que foi implementado de fato (04/08/2026)

- **Parte A** — `meujudi-cs/src/main/pdpj-concurrency.ts` reescrito:
  `getMaxConcurrentPdpj()` agora calcula `min(limiteRam, limiteCpu)` a cada
  chamada (RAM via `os.freemem()`, CPU via `os.cpus().length - 1`), limitado
  por um teto manual opcional (antes era o único valor usado) e pelo
  cooldown de 429 (inalterado). `PdpjConcurrencyStatus`
  (`meujudi-cs/src/shared/types.ts`) ganhou `automatico`, `limiteRam`,
  `limiteCpu`, `tetoManual` — `PdpjConcurrencyPanel.tsx` mostra o
  detalhamento do cálculo e o campo editável virou "Teto manual (opcional)",
  com botão "Remover teto".
- **Parte B — descoberta em vez de construída.** Verificando
  `sync-worker.ts:116-122` antes de mexer: o `slots` mandado pro claim já
  era `getMaxConcurrentPdpj() - running[source].size`, não um número fixo —
  então assim que a Parte A ficou dinâmica, o claim já passou a pedir a
  quantidade certa automaticamente, sem precisar tocar nesse arquivo. Item
  4.1 do desenho original já estava satisfeito antes da Parte C começar.
  A garantia da seção 4.0 (dois PCs nunca consultam o mesmo processo) segue
  intacta — nada nessa parte mexeu na lógica de claim atômico.
- **Parte C** — migration
  `supabase/migrations/20260804010000_sync_tasks_required_oab_routing.sql`
  (colunas `required_user_id`/`required_oab_number`/`required_oab_uf` em
  `sync_tasks`, **ainda não aplicada** — precisa rodar no SQL Editor do
  Supabase). `src/app/api/cs/tasks/[taskId]/complete/route.ts` ganhou
  `encontrarDonoDeOabComAcesso()`: quando uma tarefa falha com
  `errorCode = 'sem_acesso_pdpj'`, cruza `processos.advogados` (normalizando
  número/UF pra evitar falso-negativo por formatação) com
  `oab_validations` (`status = 'validada'`) do tenant; achando dono, a
  tarefa volta pra `pending` com `required_user_id` preenchido e uma
  `error_message` explicativa; não achando, mantém o comportamento antigo
  (`failed` + `processos.pdpj_acesso_negado_em`). `src/app/api/cs/tasks/claim/route.ts`
  ganhou o filtro `required_user_id.is.null,required_user_id.eq.<userId>`.

**Pendências antes disso rodar de verdade:**
1. Aplicar a nova migration no Supabase (SQL Editor).
2. Não há OAB validada (`status = 'validada'`) nesta tenant ainda (conferido
   via REST antes de implementar) — a Parte C não tem como ser testada
   ponta-a-ponta até existir pelo menos uma. Até lá, o comportamento é
   idêntico ao anterior (sempre cai no caminho "ninguém tem acesso").
3. Rodar `npm run typecheck` (CS) e `tsc --noEmit` (web) — já feito nesta
   sessão, ambos limpos.
