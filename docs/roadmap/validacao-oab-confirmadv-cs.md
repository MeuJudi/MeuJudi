# Validacao profissional da OAB pelo ConfirmADV e MeuJudi CS

## Objetivo

Impedir a entrada e a sincronizacao de dados externos no MeuJudi antes que o responsavel profissional do escritorio tenha sua identidade validada por meio do ConfirmADV.

O cadastro da conta pode ser criado normalmente. O usuario tambem pode terminar o onboarding basico e parear o MeuJudi CS. Entretanto, processos, clientes, Mural, DataJud, PJe, Agenda importada e IA ficam bloqueados ate a validacao ser concluida.

O MeuJudi CS sera o componente responsavel por abrir o ConfirmADV em uma janela interna, permitir que a pessoa resolva o reCAPTCHA e acompanhe o fluxo de confirmacao. O Web continuara sendo a fonte da sessao, do tenant, do estado da validacao e da liberacao de acesso.

## Principios

- O reCAPTCHA nunca sera contornado, reproduzido por engenharia reversa ou resolvido automaticamente.
- A pessoa sempre devera interagir com o reCAPTCHA e com o codigo enviado ao e-mail profissional.
- O sistema nao armazenara token de reCAPTCHA, cookies, senha, codigo de e-mail ou sessao do ConfirmADV.
- A validacao devera ser individual, com OAB e UF informadas pelo usuario.
- O MeuJudi nao montara uma base nacional de advogados.
- O vinculo de uma OAB a uma conta sera registrado somente depois de um resultado positivo.
- O resultado sera usado para liberar o escritorio, nao para substituir a autorizacao de acesso aos dados do tenant.
- A integracao deve ser tratada como adaptador experimental ate existir autorizacao ou API oficial da OAB.

## Escopo da validacao

O ConfirmADV usa os dados profissionais informados para iniciar uma solicitacao e envia uma confirmacao adicional ao e-mail profissional cadastrado no CNA.

Dados informados no fluxo:

- numero de inscricao na OAB;
- UF da seccional;
- e-mail profissional cadastrado no CNA;
- nome do solicitante;
- reCAPTCHA resolvido pela pessoa.

Dados esperados no resultado:

- nome retornado pela OAB;
- numero de registro;
- situacao profissional;
- e-mail usado na validacao;
- resultado da validacao;
- data e hora da verificacao;
- identificador da solicitacao;
- tempo restante de validade, quando fornecido.

O campo `nome do solicitante` nao deve ser tratado como o nome completo do advogado consultado. Ele identifica quem esta solicitando a verificacao. A validacao profissional deve ser baseada na combinacao de OAB, UF, e-mail profissional e confirmacao enviada pelo ConfirmADV.

## Papeis que exigem validacao

### Validacao obrigatoria

- socio ou socia responsavel pelo escritorio;
- advogado ou advogada que cadastrar uma OAB;
- usuario que fizer o primeiro pareamento do CS;
- usuario definido como responsavel pela sincronizacao do escritorio.

### Validacao opcional

- staff administrativo;
- estagiario sem OAB cadastrada;
- usuario convidado que nao realizara sincronizacao nem administrara OABs.

Se um estagiario possuir inscricao na OAB e quiser usa-la no sistema, a validacao passa a ser obrigatoria para aquela OAB.

## Estados do usuario e do tenant

O bloqueio nao deve depender de uma variavel no navegador. O estado precisa ser calculado no servidor a partir do banco.

### Estados da validacao

```text
pendente
aguardando_cs
recaptcha_em_andamento
aguardando_codigo
validando
validada
recusada
expirada
erro
cancelada
```

### Estados do acesso do tenant

```text
preparacao
aguardando_validacao
liberado
suspenso
```

O tenant somente passa para `liberado` quando existir pelo menos uma validacao ativa do responsavel exigido.

### Regras de transicao

```text
conta criada
  -> aguardando_validacao

CS pareado
  -> aguardando_cs deixa de ser exibido

ConfirmADV iniciado
  -> recaptcha_em_andamento

reCAPTCHA concluido e solicitacao criada
  -> aguardando_codigo

codigo confirmado
  -> validando

resultado positivo
  -> validada / tenant liberado

resultado negativo
  -> recusada

tempo excedido
  -> expirada

falha tecnica
  -> erro, com opcao de tentar novamente
```

## Fluxo completo do usuario

### 1. Cadastro da conta

O usuario informa nome, e-mail e senha. A confirmacao de e-mail do MeuJudi continua sendo independente da confirmacao da OAB.

Depois de confirmar o e-mail, ele escolhe:

- criar um novo escritorio;
- entrar em um escritorio existente por convite.

### 2. Onboarding inicial

O usuario pode concluir os dados basicos do escritorio:

- nome do escritorio;
- dados de contato;
- perfil do responsavel;
- equipe inicial;
- preferencias.

O onboarding nao deve puxar processos, clientes ou comunicacoes nessa etapa.

### 3. Cadastro da OAB

Para o responsavel, a tela mostra:

- numero da OAB;
- UF;
- e-mail profissional cadastrado na OAB;
- nome do solicitante;
- status da validacao.

A tela deve explicar que o e-mail informado precisa ser o e-mail profissional existente no cadastro da OAB. O e-mail de login do MeuJudi pode ser diferente.

### 4. Pareamento com o CS

O Web gera um codigo de pareamento de uso unico e validade curta. O usuario informa o codigo no MeuJudi CS.

O pareamento pode ocorrer antes da validacao porque ele nao importa dados. Ele apenas cria um canal autorizado para que o CS execute a etapa local do ConfirmADV.

O CS deve confirmar:

- tenant autorizado;
- usuario responsavel;
- dispositivo;
- data do pareamento;
- versao do CS.

### 5. Execucao no MeuJudi CS

O CS abre uma janela interna com a pagina oficial do ConfirmADV. Essa janela deve ser a pagina real do ConfirmADV, e nao uma copia visual do formulario.

Fluxo local:

1. O Web envia ao CS uma solicitacao pendente.
2. O CS abre o ConfirmADV.
3. O usuario preenche os dados e resolve o reCAPTCHA.
4. O ConfirmADV cria a solicitacao.
5. O usuario confirma o codigo recebido no e-mail profissional.
6. O CS acompanha a resposta.
7. O CS envia ao Web somente o resultado sanitizado.

O CS nunca deve enviar ao Web cookies, token de reCAPTCHA, codigo de e-mail ou cabecalhos de sessao.

### 6. Liberacao

Quando o Web recebe um resultado positivo:

- marca a validacao como `validada`;
- associa a OAB ao usuario;
- registra a data da verificacao;
- libera o tenant;
- libera o uso do CS para sincronizacao;
- inicia a sincronizacao somente mediante acao autorizada ou cron configurado.

Se o resultado for negativo, o tenant permanece bloqueado para entrada de dados.

## Arquitetura Web-CS

### Web

Responsabilidades:

- cadastro e autenticacao;
- onboarding;
- criacao da solicitacao de validacao;
- exibicao de status;
- criacao e revogacao do pareamento;
- persistencia do resultado;
- bloqueio de rotas e jobs;
- auditoria;
- liberacao do tenant.

### MeuJudi CS

Responsabilidades:

- manter o pareamento local;
- consultar solicitacoes pendentes;
- abrir a pagina oficial do ConfirmADV;
- permitir a interacao humana com o reCAPTCHA;
- acompanhar o resultado da verificacao;
- enviar o resultado minimo ao Web;
- exibir diagnostico local sem armazenar segredos no Web.

### Supabase

Responsabilidades:

- armazenar estado da solicitacao;
- aplicar RLS por tenant;
- guardar o resultado minimo da validacao;
- registrar auditoria;
- impedir que jobs rodem antes da liberacao.

## Modelo de dados sugerido

### `oab_validations`

Tabela por solicitacao de validacao:

```text
id uuid primary key
tenant_id uuid not null
user_id uuid not null
oab_number text not null
oab_uf text not null
professional_email text not null
requester_name text not null
provider text not null default 'confirmadv'
status text not null
external_request_id text
returned_name text
returned_status text
returned_email text
is_validation boolean
requested_at timestamptz not null
verified_at timestamptz
expires_at timestamptz
last_error text
attempt_count integer not null default 0
created_at timestamptz not null
updated_at timestamptz not null
```

### `oab_validation_events`

Tabela opcional para auditoria tecnica, sem guardar segredos:

```text
id uuid primary key
validation_id uuid not null
event_type text not null
status_code integer
message text
created_at timestamptz not null
```

Eventos possiveis:

```text
created
cs_received
browser_opened
captcha_completed
request_created
code_pending
verified
rejected
expired
failed
cancelled
```

### `cs_pairings`

O pareamento existente deve ser aproveitado, acrescentando o minimo necessario:

```text
validation_allowed boolean not null default false
last_seen_at timestamptz
cs_version text
device_name text
revoked_at timestamptz
```

## RLS e autorizacao

As tabelas de validacao devem ter RLS ativo.

Regras principais:

- usuario comum ve apenas suas solicitacoes;
- owner ve as validacoes do proprio tenant;
- super admin acessa por fluxo separado e auditado;
- o CS nao recebe acesso amplo ao banco;
- endpoints do CS aceitam somente pareamento ativo e token de dispositivo;
- um CS nao pode enviar resultado para outro tenant;
- resultado recebido deve conferir `tenant_id`, `user_id`, OAB e solicitacao pendente;
- validacao expirada nao libera sincronizacao.

O sistema nunca deve confiar em `role` ou `tenant_id` enviados pelo cliente. Tudo deve ser confirmado no servidor.

## Gate de acesso

Criar uma funcao de servidor semelhante a:

```text
requireTenantDataAccess()
```

Ela deve:

1. validar a sessao;
2. localizar o tenant do usuario;
3. confirmar que o tenant nao esta suspenso;
4. confirmar que existe validacao ativa;
5. permitir ou negar a consulta.

Esse gate deve ser usado em:

- monitoramento;
- agenda com eventos importados;
- clientes importados;
- mural;
- DataJud;
- CS/PJe;
- jobs de sincronizacao;
- processamento de IA com dados do escritorio.

Rotas liberadas durante o bloqueio:

- login;
- confirmacao de e-mail;
- onboarding;
- configuracoes da conta;
- pareamento do CS;
- tela de validacao;
- suporte e diagnostico sem dados processuais.

## Tratamento de falhas

### Dados incorretos

Exibir mensagem simples:

> Nao foi possivel confirmar esses dados. Confira a OAB, UF e o e-mail profissional cadastrado na OAB.

Nao informar qual campo individual falhou, para nao revelar dados do cadastro.

### ReCAPTCHA nao concluido

Exibir:

> Conclua a verificacao de seguranca para continuar.

### Codigo nao confirmado

Permitir:

- reenviar solicitacao depois do intervalo minimo;
- informar novo codigo;
- cancelar a tentativa;
- voltar para corrigir os dados.

### Solicitacao expirada

Marcar como `expirada` e exigir uma nova solicitacao. Nunca reutilizar token ou codigo antigo.

### CS desconectado

Salvar o estado como `aguardando_cs` ou `erro`. Quando o CS voltar, ele consulta a solicitacao pendente e continua do ponto permitido pelo ConfirmADV.

### ConfirmADV indisponivel

O tenant continua bloqueado para dados externos. O usuario deve receber uma mensagem com a ultima tentativa e a opcao de tentar novamente depois.

## Seguranca e LGPD

- Minimizar o armazenamento de dados profissionais.
- Criptografar dados sensiveis antes do uso amplo em producao.
- Nao enviar tokens do ConfirmADV para a IA.
- Nao guardar o codigo recebido por e-mail.
- Nao guardar cookies ou dados de sessao do ConfirmADV.
- Registrar auditoria de inicio, sucesso, falha e cancelamento.
- Permitir revogar uma validacao.
- Permitir substituir a OAB do usuario somente com nova validacao.
- Manter historico de quem iniciou a validacao.
- Informar no aceite de cadastro a finalidade da verificacao profissional.
- Definir prazo de retencao para logs tecnicos.
- Tratar o resultado da OAB como dado profissional vinculado a uma pessoa identificavel.

## Endpoints internos do ConfirmADV

Durante um teste autorizado, foram observadas rotas usadas pela propria aplicacao:

```text
POST /api/lawyer/confirm
GET  /api/lawyer/{id}/verification
PATCH /api/lawyer/{id}/verify
```

O `POST /confirm` usa campos semelhantes a:

```text
register
state
email
recaptcha
customerName
```

Essas rotas nao devem ser tratadas como API publica ou contrato estavel. O uso em producao deve ficar protegido por uma feature flag e ser revisado caso a OAB forneca autorizacao ou documentacao oficial.

O MeuJudi nao deve tentar obter, reutilizar ou falsificar o reCAPTCHA. A interacao deve ocorrer na pagina oficial aberta pelo usuario.

## UX proposta

### Tela de bloqueio

Titulo:

> Valide sua identidade profissional

Texto:

> Antes de sincronizar os dados do escritorio, precisamos confirmar a OAB do responsavel. Essa verificacao protege o escritorio e evita que dados sejam importados para a conta errada.

Estados visuais:

- aguardando configuracao: formulario de OAB;
- aguardando CS: codigo para parear o dispositivo;
- em verificacao: janela do ConfirmADV aberta;
- aguardando codigo: instrucoes para verificar o e-mail profissional;
- validada: selo verde e botao para continuar;
- recusada: explicacao curta e botao corrigir dados;
- expirada: botao iniciar nova validacao;
- erro tecnico: diagnostico e tentar novamente.

### Feedback de progresso

```text
1. Dados profissionais
2. Conectar MeuJudi CS
3. Confirmar no ConfirmADV
4. Liberar escritorio
```

O usuario nunca deve ficar olhando uma tela vazia. O status precisa mostrar ultima tentativa, horario, etapa atual e proxima acao.

## Implementacao em fases

### Fase 1 - Banco e bloqueio

- criar migration de `oab_validations`;
- criar RLS e indices;
- criar status derivado do tenant;
- implementar `requireTenantDataAccess`;
- bloquear sincronizadores e consultas de dados externos;
- criar auditoria.

### Fase 2 - Web

- criar tela de validacao;
- criar solicitacao pendente;
- exibir status em tempo real;
- criar codigo de pareamento especifico para validacao;
- impedir duplicacao de solicitacoes ativas;
- permitir cancelamento e nova tentativa.

### Fase 3 - CS

- adicionar modulo ConfirmADV;
- abrir pagina oficial em janela interna;
- registrar apenas eventos de etapa;
- acompanhar a solicitacao sem salvar segredos;
- enviar resultado sanitizado ao Web;
- adicionar diagnostico local.

### Fase 4 - Integracao

- validar assinatura/autorizacao do resultado recebido;
- atualizar o tenant para `liberado`;
- liberar Mural, DataJud, PJe e IA;
- iniciar sincronizacao somente depois da liberacao;
- atualizar o painel com o status da fonte.

### Fase 5 - Testes controlados

- validacao positiva;
- OAB inexistente;
- UF incorreta;
- e-mail nao correspondente;
- reCAPTCHA nao concluido;
- codigo incorreto;
- codigo expirado;
- janela do CS fechada;
- CS desconectado;
- tentativa em tenant diferente;
- usuario sem permissao;
- duas solicitacoes simultaneas;
- revogacao da validacao;
- RLS entre tenants.

## Criterios de aceite

- Conta nova consegue concluir cadastro sem importar dados.
- Tenant sem validacao nao recebe processos, clientes, Mural ou DataJud.
- Usuario consegue parear o CS mesmo antes da validacao.
- CS abre o ConfirmADV oficial.
- Pessoa resolve o reCAPTCHA manualmente.
- Resultado positivo aparece no Web sem recarregar manualmente.
- Resultado negativo nao libera o tenant.
- Codigo e token nao aparecem no Supabase.
- CS nao consegue enviar resultado para outro tenant.
- Validacao expirada bloqueia novas sincronizacoes.
- Apos validacao positiva, o primeiro sync ocorre somente com autorizacao e fica registrado na auditoria.

## Decisao recomendada

Implementar o bloqueio para o responsavel profissional do escritorio, mantendo o cadastro e o onboarding acessiveis. O CS sera o ponto local de interacao com o ConfirmADV, e o Web sera o ponto central de autorizacao.

Essa arquitetura permite evoluir para uma API oficial futuramente sem mudar o fluxo do usuario: basta trocar o adaptador do ConfirmADV, mantendo os mesmos estados, tabela, gate de acesso e telas.

## Operacao

S7 — auditoria: como o sistema funciona no dia a dia. Para suporte e
debug, este e o guia de referencia.

### Ciclo de vida do token do CS

O token do CS e gerado quando o advogado pareia o MeuJudi CS com o escritorio via `/configuracoes/meujudi-cs`. Ele e:

1. **Gerado** no pareamento (`POST /api/cs/pair`) — o Web gera um device_token e guarda o hash em `cs_devices.token_hash` (sha256 do token, nao o token em si).
2. **Criptografado** localmente em `cs-pairing` (electron-store) usando a chave derivada de `node-machine-id` da maquina.
3. **Enviado** em toda request do CS via `Authorization: Bearer <token>`.
4. **Validado** no servidor por `autenticarDevice()` em `src/lib/cs/device-auth.ts` — busca pelo hash, checa `revoked_at is null`, atualiza `last_seen_at`.
5. **Revogado** quando o advogado clica "Desconectar dispositivo" no Web — o Web atualiza `revoked_at = now()` na `cs_devices`.

### Onde cada coisa vive

| Componente | Arquivo | Responsabilidade |
|------------|---------|------------------|
| Tabela de validacoes | `supabase/migrations/20260723000010_oab_validations.sql` | Persistir estado da solicitacao + RLS |
| Tabela de eventos | mesma migration | Auditoria tecnica (sem segredos) |
| RPC transacional | `supabase/migrations/20260723000014_finalize_oab_validation_rpc.sql` | Atualizar users + tenants atomicamente |
| Gate de acesso | `src/lib/auth/tenant-access.ts` | Bloquear dados externos ate liberacao |
| API de claim | `src/app/api/cs/oab-validations/route.ts` | CS faz GET para pegar solicitacao pendente |
| API de report | `src/app/api/cs/oab-validations/[validationId]/route.ts` | CS posta eventos de lifecycle |
| Polling do CS | `MeuJudi-CS/src/main/confirmadv.ts` | A cada 15s, busca solicitacao pendente |
| Janela do ConfirmADV | mesmo arquivo | BrowserWindow isolada com partition fixa |
| Tela de validacao | `src/app/(platform)/(tenant)/validacao-oab/` | UI Web da Fase 2 + 4 + C3 |
| Metricas admin | `src/app/(super-admin)/admin/oab-stats/` | Dashboard de saude do sistema |

### Debug

- **CS logs**: `%APPDATA%/meujudi-cs/logs/` — rotação diária, últimos 200 mantidos em memória.
- **Lifecycle estruturado**: cada evento importante (cs_received, browser_opened, navigate_*, timeout, close) gera uma entrada em `diagnostic_events` no Supabase com `name='oab_validation_lifecycle'`. Use `select * from diagnostic_events where name = 'oab_validation_lifecycle' order by created_at desc limit 50` para reconstruir a sequência.
- **Auditoria de validacoes**: `oab_validation_events` guarda todos os eventos reportados pelo CS.
- **Status do tenant**: `select access_status from tenants where id = '<tenant_id>'` — deve ser `liberado` após sucesso.

### Dispositivo perdido

1. Acesse `/configuracoes/meujudi-cs` no Web (com outra sessão ou após recadastro)
2. Clique em "Desconectar dispositivo" — o Web marca `cs_devices.revoked_at = now()`
3. Próxima tentativa do CS perdido com o mesmo token retorna 401
4. O advogado pareia novamente com um código novo

### ConfirmADV indisponível

O tenant continua bloqueado para dados externos (gate `requireTenantDataAccess` falha). O CS continua polling, mas as requests falham. Quando o ConfirmADV voltar, o ciclo normal continua.

## Referencias

- [ConfirmADV](https://confirmadv.oab.org.br/)
- [Noticia oficial da OAB sobre o ConfirmADV](https://www.oab.org.br/noticia/64127/plataforma-confirmadv-completa-um-ano-com-mais-de-32-mil-verificacoes-contra-falsos-advogados)
- [Politica de privacidade do CNA Mobile](https://www.oab.org.br/Servicos/lgpdCNAMobile)
- [Cadastro Nacional dos Advogados](https://cna.oab.org.br/)

