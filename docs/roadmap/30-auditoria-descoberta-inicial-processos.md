# 30 — Auditoria: descoberta inicial de processos (onboarding de OAB nova)

> **Status (19/08/2026): tudo implementado no mesmo dia** — achado 1 (corrida
> do Mural), o disparo imediato de descoberta na liberação da OAB, e o
> aviso na tela de Monitoramento. Único ponto que ficou só como ideia
> registrada (não implementada): usar o DataJud como descobridor de
> bootstrap antes do CS parear — depende de confirmar se a API pública
> dele permite busca por OAB, o que não foi verificado.
>
> Pedido do Caio: como funciona a descoberta de processos quando um
> escritório novo cadastra uma OAB, agora que existem 3 fontes de dado
> (PDPJ, DataJud, Mural) — baixa tudo de uma vez? tem risco de duplicar?
> vai funcionar normal?

## 1. O que acontece quando uma OAB é cadastrada

**Nada acontece na hora.** Cadastrar uma OAB (tabela `escritorio_oabs`,
via onboarding ou em Configurações → `addOab`) não dispara nenhuma tarefa
de sincronização — não existe trigger de banco nessa tabela, nem chamada
de insert em `sync_tasks` nesses dois fluxos. A OAB só fica "elegível"
pros próximos ciclos dos crons.

## 2. As 3 fontes, o que cada uma faz de verdade

Só **2 das 3** descobrem processo novo — o DataJud nunca descobre:

| Fonte | Descobre CNJ novo? | Mecanismo |
|---|---|---|
| **PDPJ** | Sim | Cron `solicitar-pdpj` (a cada 6h, balde alinhado 00/06/12/18 UTC) cria tarefa `pdpj_oab`; o CS pareado varre a OAB inteira paginando a API do PDPJ e cria uma tarefa `pdpj_cnj` pra cada CNJ achado; cada `pdpj_cnj` busca detalhe+documentos e manda pro Web (`/api/cs/sync/pdpj`), que faz o insert/update em `processos`. |
| **Mural** | Sim | Cron `solicitar-mural` (mesmo ritmo de 6h) cria tarefa `mural_request`; o CS pagina intimações por OAB e manda lotes pro Web (`/api/cs/sync/mural`); cada intimação traz um CNJ — se o tenant nunca viu esse CNJ, cria a linha em `processos` na hora (`processar-comunicacao.ts`). |
| **DataJud** | **Não** | Só atualiza processos que **já existem** — lê direto da tabela `processos` (`process-datajud-sync/route.ts`) e só faz `.update()` (`sincronizar-processo.ts`), nunca `.insert()`. Disparado manualmente pelo usuário na tela de Monitoramento, não automaticamente ao cadastrar OAB. |

**Consequência pro escritório novo**: o primeiro retorno de dados de
verdade só chega no próximo balde de 6h do PDPJ/Mural — em média ~3h,
pior caso quase 6h, **sem nenhum aviso na tela** dizendo que os
processos estão a caminho.

## 3. [corrigido, 19/08/2026] Risco de duplicar processo — parcialmente coberto, um buraco real

A tabela `processos` tem `UNIQUE (tenant_id, cnj)` — protege contra
duplicata de verdade no banco em qualquer cenário. Mas nenhuma das fontes
faz upsert de verdade (`ON CONFLICT`) — todas fazem "SELECT, se não
achar faz INSERT", confiando na constraint só como rede de segurança
contra corrida (erro `23505`).

**O PDPJ já tratava essa corrida** (`src/app/api/cs/sync/pdpj/route.ts`):
se o insert colide, recaptura o id já criado pela outra fonte, sem
quebrar a tarefa.

**O Mural não tratava** (`src/lib/mural/processar-comunicacao.ts`) — um
insert colidindo (erro 23505) subia como exceção não tratada, derrubando
a tarefa `mural_request` inteira naquele item. Isso importa
especificamente no cenário de OAB nova: é o momento de maior chance de
PDPJ e Mural acharem o mesmo CNJ quase ao mesmo tempo, já que os dois
varrem a OAB pela primeira vez no mesmo balde de 6h.

**Correção aplicada**: mesmo tratamento do PDPJ — captura `error.code ===
"23505"`, refaz o SELECT pra pegar o id que a outra fonte já criou, só
lança exceção de verdade se o refetch também não achar nada (cenário
que não deveria acontecer, mas não fica silencioso se acontecer).

**Arquivo**: `src/lib/mural/processar-comunicacao.ts`.

## 4. Idempotência de tarefas (`sync_tasks`) — lacuna conhecida, já remendada

O PDPJ usa duas chaves diferentes pro mesmo CNJ dependendo de quem criou
a tarefa: `pdpj_cnj:{cnj}` (varredura por OAB, sem data) vs.
`pdpj_cnj:{cnj}:{data}` (cron de reescaneio diário, com data) — a
constraint `UNIQUE (tenant_id, idempotency_key)` não pega colisão entre
essas duas formas. Existe uma checagem manual extra antes do insert
(`src/app/api/cs/tasks/create/route.ts`: se já existe tarefa `pdpj_cnj`
aberta pra aquele CNJ, retorna `created:false` sem inserir) e uma rotina
de limpeza (`desduplicarTarefasAbertasPdpj`,
`src/lib/tribunais/pdpj-tarefas-abertas.ts`) que cancela duplicatas
remanescentes. Funciona, mas é remendo em vez de uma chave única
coerente — não corrigido nesta rodada (baixo risco prático, já coberto
por duas camadas de proteção manual), registrado aqui pra referência
futura.

DataJud não usa `sync_tasks` — usa a tabela separada `datajud_sync_jobs`
(um job por tenant), com idempotência própria (checa se já existe job
`pending`/`running` antes de criar um novo).

## 5. [implementado, 19/08/2026] Descoberta inicial mais rápida + aviso de instalação

Duas frentes implementadas, seguindo a divisão combinada com o Caio:

### 5.1 Disparo imediato (sem esperar o balde de 6h)

Novo módulo `src/lib/cs/descoberta-inicial.ts`, função
`dispararDescobertaInicial(tenantId, oabNumber, oabUf)` — cria exatamente
as mesmas tarefas `pdpj_oab`/`mural_request` que os crons criariam (mesmo
`idempotency_key`, mesmo `cursor`), só com `priority: 1` em vez de `5`
(os crons usam 5) — como a prioridade só ordena a fila do PRÓPRIO tenant
(claim já filtra por `tenant_id` do device), isso nunca compete com a
fila de outro escritório. Respeita o mesmo portão que os crons
(`tenants.access_status = 'liberado'` e `is_active`), e tolera 23505
(tarefa já existe) sem erro.

Conectado em dois pontos:
- **`src/app/api/cs/oab-validations/[validationId]/route.ts`** — logo
  após `finalize_oab_validation` ter sucesso. Esse é o "momento zero" de
  verdade: `access_status` só vira `'liberado'` aí (confirmado nas
  migrations — o onboarding sozinho deixa o tenant em `'preparacao'`, não
  liberado). Disparar na criação da OAB durante o onboarding teria sido
  cedo demais — o portão ainda estaria fechado nesse momento.
- **`src/app/(platform)/(tenant)/configuracoes/actions.ts`**, `addOab` —
  para OABs adicionais cadastradas depois, quando o tenant já está
  liberado.

Nos dois casos a chamada não bloqueia a resposta (`.catch()` só loga) —
uma falha aqui nunca deve impedir o cadastro da OAB ou a validação de
aparecer como concluída; o cron pega de qualquer forma no próximo ciclo.

### 5.2 Aviso na tela de Monitoramento

`InstallSyncBanner` em `monitoramento-view.tsx` — aparece no meio da tela
sempre que `processes.length === 0`, com o texto explicando que a busca
roda dentro do Sync, que precisa estar instalado/conectado, e que a
primeira varredura pode levar de minutos a horas. Link direto pra
`/configuracoes/meujudi-cs` (a página de download já existente).

### 5.3 Ainda em aberto (não implementado)

Cogitado usar o DataJud (roda no nosso servidor, não depende do CS
pareado) como descobridor de bootstrap pra ter algo antes do CS parear —
**não implementado**: não foi confirmado se a API pública do DataJud
permite busca por OAB de forma confiável (hoje o código só busca por CNJ
já conhecido). Precisa de pesquisa antes de virar plano.

Vale registrar o motivo de fundo que o 5.1 sozinho não resolve: se o CS
ainda não estiver pareado no momento do onboarding (cenário bem
provável — pareamento é um passo separado), PDPJ e Mural não têm como
rodar de jeito nenhum, não importa quão rápido a tarefa seja criada. É
exatamente esse buraco que o aviso do 5.2 cobre.
