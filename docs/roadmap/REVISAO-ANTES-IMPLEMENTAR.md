# Revisao antes de implementar o Web

Esta revisao aponta inconsistencias nos documentos de planejamento que devem ser corrigidas antes de transformar os exemplos em codigo, migrations ou deploy.

## Bloqueios

### 1. Ordem do schema `verticals` x `tenants`

Arquivos: `02a-schema-verticals.md`, `02-schema-shared.md`.

Problema:
- `02a-schema-verticals.md` diz que depende da fase 02.
- `02-schema-shared.md` diz que depende da fase 02a.
- O SQL de `02a` tenta alterar `tenants`, mas `tenants` ainda nao existe se `02a` vier primeiro.
- O trigger de `verticals` usa `update_updated_at_column()`, que so e criado em `02-schema-shared.md`.

Correcao recomendada:
- Transformar `02a` em uma migration inicial pura: cria `update_updated_at_column()`, cria `verticals`, insere seeds.
- Em `02-schema-shared.md`, criar `tenants.vertical_id UUID NOT NULL REFERENCES verticals(id)` desde o inicio.
- Remover o modelo intermediario `tenants.vertical TEXT`, a menos que exista uma base legada real para migrar.

### 2. Cadastro de usuario quebra por `tenant_id NOT NULL`

Arquivo: `02-schema-shared.md`.

Problema:
- A tabela `users` define `tenant_id UUID ... NOT NULL`.
- O trigger `handle_new_user()` insere apenas `id`, `email`, `name`, `role`.
- Resultado: criar usuario no Supabase Auth falha ou a linha em `public.users` nao e criada.

Correcao recomendada:
- Escolher um fluxo unico:
  - Opcao A: cadastro cria tenant e user no mesmo trigger.
  - Opcao B, mais segura: `users.tenant_id` fica nullable ate o onboarding criar o escritorio e vincular o usuario como owner.
- Para MVP, recomendo Opcao B, porque evita confiar em `raw_user_meta_data` para criar tenant automaticamente.

### 3. RLS com `SECURITY DEFINER` precisa endurecimento

Arquivo: `04-rls-policies.md`.

Problema:
- Funcoes `SECURITY DEFINER` em `public` podem virar superficie sensivel se nao tiverem `search_path` fixo e grants revisados.
- Algumas policies usam `FOR ALL` com `USING`, mas sem `WITH CHECK` explicito para inserts/updates.
- O documento master ainda mostra exemplo baseado em `auth.jwt()->>'tenant_id'`, mas o plano real busca tenant em `public.users`.

Correcao recomendada:
- Usar `set search_path = public, auth` nas funcoes.
- Revogar execute publico quando a funcao nao deve ser chamada diretamente.
- Escrever policies separadas por operacao, ou sempre incluir `WITH CHECK` nas policies de escrita.
- Padronizar tenant source: preferir `public.users.tenant_id` em RLS, nao JWT editavel ou metadata de usuario.

### 4. Billing usa `user.tenant_id`, mas Auth User nao tem isso

Arquivo: `10-stripe-billing.md`.

Problema:
- `requireUser()` retorna usuario do Supabase Auth, que nao possui `tenant_id` como propriedade direta.
- O codigo de checkout/portal chama `.eq('id', user.tenant_id)`.

Correcao recomendada:
- Trocar para `requireProfile()` ou helper equivalente que busca `public.users` + `tenant`.
- Bloquear checkout se o usuario ainda nao completou onboarding.

### 5. `payments.subscription_id` recebe ID errado

Arquivo: `10-stripe-billing.md`.

Problema:
- Schema: `payments.subscription_id UUID REFERENCES subscriptions(id)`.
- Webhook: insere `subscription_id: invoice.subscription`, que e string do Stripe (`sub_...`), nao UUID local.

Correcao recomendada:
- Buscar a assinatura local por `stripe_subscription_id = invoice.subscription`.
- Inserir `subscription_id: localSubscription.id`.
- Opcionalmente adicionar coluna `stripe_subscription_id` em `payments` para auditoria.

### 6. Migrations reais de Fase 15 dependem de tabelas inexistentes

Arquivos: `supabase/migrations/20260715000001_sync_config.sql`, `20260715000002_sync_config_seeds.sql`.

Problema:
- Essas migrations ja existem, mas dependem de `tenants`, `subscriptions` e `plans`.
- No repo ainda nao existem migrations reais que criem essas tabelas.

Correcao recomendada:
- Antes de aplicar no Supabase limpo, criar as migrations base em ordem.
- Manter Fase 15 depois de shared schema e billing schema.
- Corrigido em `20260715000001_sync_config.sql`: `p.plan_name` foi trocado por `p.name`.

## Ajustes SQL importantes

### Indices GIN invalidos ou frageis

Arquivos: `02-schema-shared.md`, `03-schema-meujudi.md`.

Problema:
- Exemplos como `CREATE INDEX ... USING GIN (tenant_id, tags)` tendem a falhar sem `btree_gin`, porque `tenant_id` e UUID e `tags` e array.

Correcao recomendada:
- Criar indice btree separado para `tenant_id`.
- Criar indice GIN apenas em `tags`.
- Se quiser indice composto GIN, habilitar `CREATE EXTENSION IF NOT EXISTS btree_gin;` explicitamente.

### Nome de tabela errado no indice de cert A1

Arquivo: `03-schema-meujudi.md`.

Problema:
- `CREATE INDEX idx_cert_a1_log_user ON cert_a1_log(...)`
- A tabela criada chama `cert_a1_uso_log`.

Correcao recomendada:
- Trocar para `CREATE INDEX idx_cert_a1_log_user ON cert_a1_uso_log(user_id, created_at DESC);`.

### `mural_id` global unico pode bloquear multi-tenant

Arquivo: `03-schema-meujudi.md`.

Problema:
- `mural_id BIGINT UNIQUE NOT NULL` impede que a mesma comunicacao publica seja relacionada a mais de um tenant/OAB.

Correcao recomendada:
- Usar `UNIQUE(tenant_id, mural_id)` para isolamento por escritorio.

### `support_tickets.assigned_to` referencia `users`

Arquivo: `02-schema-shared.md`.

Risco:
- Se super admin for usuario global sem tenant, a modelagem atual pode ficar estranha.

Correcao recomendada:
- Definir se super admin mora em `users` com `tenant_id NULL`, ou em tabela separada `admin_users`.

## Ajustes de produto/arquitetura

### Decisoes registradas em conversa

- Web e CS ficam no mesmo diretorio raiz do projeto, mas o CS e instalador/local e nao deve ir para o Git.
- O Git deve ignorar `meujudi-cs/`, instaladores, releases, arquivos locais e pastas aleatorias que nao fazem parte do Web.
- O Web sera organizado na raiz `C:\Caio\MeuJudi`, nao em uma pasta `meujudi-web`.
- Manter arquitetura de verticais. Implementar apenas `meujudi` no MVP; `game` e `novo` ficam como registros inativos.
- Criar Supabase novo e limpo para o Web: `meujudi-prod`.
- MVP sera gratuito, usado inicialmente por apenas um escritorio. Stripe de planos fica para depois.
- Planos comerciais serao definidos depois do MVP.
- Cadastro cria escritorio automaticamente ou permite pedir vinculo a escritorio existente.
- Primeiro usuario do escritorio vira `owner`.
- Socio/owner pode convidar por email. Se o convite existir antes do cadastro, o usuario que cadastrar com aquele email entra direto no escritorio.
- Onboarding inicial em abas simples: Escritorio, Equipe, OABs, Processos, Preferencias, Finalizar.
- Linguagem do onboarding deve ser simples, sem termos como tenant/workspace ou termos juridicos desnecessarios.
- Super admin fica em `users` com `role = 'super_admin'`, adicionada manualmente por Caio; usuario comum nunca pode se cadastrar com essa role.
- IA entra no MVP para deteccao/extracao de informacoes, usando Regex + IA.
- CS pode ser conectado desde o inicio, mas sem prioridade sobre schema, RLS, cadastro e Web.
- PJe/CS envia dados para o Supabase; Web le esses dados do Supabase.
- Area Web deve ter campo/tela para baixar o EXE do CS e explicar como conectar.
- Desenvolvimento local pode iniciar sem criptografia completa, mas antes de uso real dados sensiveis precisam estar criptografados.
- Nao criar limites internos de uso no MVP.
- Aceite de termos/politica de privacidade deve existir no cadastro.
- Auditoria e obrigatoria: registrar acessos e acoes sensiveis.
- Definir papeis/permissoes com cuidado antes de fechar RLS.
- Registrar plano de incidente de seguranca para futuro.
- Processos sigilosos devem ter protecao extra.

- Nao implementar recarga automatica de creditos diretamente na conta OpenAI/Anthropic do Caio.

### PJe em multiplos tribunais

Decisao atual:
- Manter o modelo atual do CS com login OAuth-like por janela Electron.
- Comecar com o PJe ja testado/validado.
- Registrar que futuramente sera necessario estudar como lidar com varios PJEs por tribunal/dominio/grau.

Hipotese tecnica:
- O mesmo gov.br/certificado pode autenticar o advogado, mas a sessao/cookies tendem a ser por dominio/ambiente do PJe.
- Portanto, o sistema provavelmente precisara gerenciar conexoes por tribunal/ambiente, em vez de assumir um login universal para todos os PJEs.

### LGPD: decisoes atuais

Prioridades para o MVP:
- RLS forte por escritorio/tenant.
- Auditoria de acoes sensiveis.
- Aceite de termos e politica de privacidade no cadastro.
- Definir papeis/permissoes antes da RLS final.
- Registrar plano futuro de incidente de seguranca.
- Processos sigilosos com protecao extra.

Para depois, antes de uso real amplo:
- Criptografia de dados sensiveis.
- Anonimizacao/mascaramento antes de enviar conteudo para IA sempre que possivel.
- Politica de retencao LGPD.
- Documentacao juridica mais completa: termos, politica de privacidade, fornecedores/suboperadores e procedimento de exclusao/exportacao.

### Roteamento de textos longos/PDFs entre tenants

Regra de seguranca:
- Dados obtidos dentro do contexto privado de um tenant (ex: CS/PJe logado com cookies/certificado de um escritorio) nao devem ser compartilhados automaticamente com outro tenant, mesmo que o texto/PDF mencione outro processo ou outro advogado.
- Dados de fonte publica/global (ex: Mural, DataJud, diario/comunicacao publica) podem ser analisados e roteados para tenants diferentes, desde que o vinculo seja confirmado por CNJ/OAB cadastrados naquele tenant.

Modelo recomendado:
- Extrair entidades do texto/PDF: CNJs, OABs, partes, prazos, audiencias.
- Comparar CNJs/OABs extraidos com os dados cadastrados por tenant.
- Criar registros apenas para tenants que tenham vinculo confirmado.
- Nao exibir para um tenant trechos que pertencem claramente a outro tenant.
- Em fontes publicas/globais, se um item nao tiver vinculo com nenhum tenant, ele deve ser descartado/deletado apos o processamento.
- Para LGPD, guardar o texto bruto completo somente quando a fonte e o contexto autorizarem; caso contrario, guardar apenas trechos/metadados vinculados ao tenant.

Decisao pendente:
- Para fontes publicas, fazer uma unica pesquisa global/cacheada e distribuir para cada tenant apenas o que tiver vinculo confirmado.
- Definir, para o Mural, se uma comunicacao publica com multiplos CNJs/OABs deve gerar copias separadas por tenant ou uma fonte global temporaria com vinculos por tenant.

### Monorepo multi-vertical pode ser pesado para o MVP

Arquivos: `00-visao-geral.md`, `ESPECIFICACAO.md`.

Risco:
- O conceito de `verticals` e bom, mas criar tudo ja multi-SaaS aumenta o trabalho antes do MeuJudi vender.

Recomendacao:
- Manter `verticals` no banco, mas implementar so a vertical `meujudi` no frontend.
- Nao criar rotas/features de `game` agora, apenas seeds inativos.

### Retencao/LGPD ainda esta indefinida

Arquivo: `15-sync-config-limites.md`.

Bom ponto:
- O documento ja bloqueia hard delete ate decisao juridica.

Recomendacao:
- Antes de qualquer cleanup automatico, adicionar colunas de soft delete e politica de exportacao.
- Nao ativar cron `cleanup-old-data` no MVP.

### Service role em cron SQL

Arquivos: `06-edge-datajud.md`, `07-edge-mural.md`, `15-sync-config-limites.md`.

Risco:
- Os exemplos colocam `Bearer [SERVICE_ROLE_KEY]` direto em SQL de cron. Funciona, mas aumenta risco operacional.

Recomendacao:
- Preferir Edge Function protegida por segredo especifico de job (`CRON_SECRET`) ou armazenar segredo com mecanismo seguro do Supabase.
- Nunca commitar service role em migrations.

## Ordem recomendada antes de codar

1. Consolidar um unico schema SQL real, com migrations em ordem.
2. Corrigir o fluxo de cadastro/onboarding.
3. Corrigir RLS e testar isolamento com dois tenants reais.
4. Criar Web app somente para MeuJudi primeiro.
5. Depois adicionar DataJud/Mural.
6. Depois Stripe.
7. Depois Cert Service integrado ao Web.
