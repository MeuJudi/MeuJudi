# Implementacao do cliente API PDPJ no MeuJudi CS

## 1. Objetivo

Criar no MeuJudi CS um cliente dedicado para consultar a API do Portal de Servicos PDPJ depois que o usuario concluir o login no Jus.br.

O cliente substitui o uso dos endpoints privados do PJe/TRT9. O CS consulta o Portal PDPJ, processa resultados em lotes e envia ao MeuJudi Web somente dados vinculados ao tenant correto.

O usuario participa apenas das etapas que exigirem autenticacao, certificado, GOV.BR ou MFA. A pesquisa e a sincronizacao devem ser automaticas.

## 2. Principios

- PDPJ e uma fonte propria, separada do Mural e do DataJud.
- Nenhum endpoint privado do PJe deve ser reutilizado pelo novo cliente.
- Bearer, cookies, refresh token e dados de autenticacao ficam somente no CS.
- Credenciais nunca sao enviadas para Supabase, logs, diagnosticos ou Web.
- Cada consulta e vinculada a um tenant e a uma OAB autorizada.
- A fila sobrevive ao fechamento, reinicio ou perda de internet.
- Falha de autenticacao pausa a tarefa e preserva o progresso.
- Repetir uma pagina nao pode duplicar processos ou movimentos.

## 3. Arquitetura

```text
Usuario
  |
PdpjAuth / janela Electron
  |
Sessao local cifrada
  |
PdpjApiClient
  |
PdpjSyncQueue
  |
PdpjNormalizer
  |
MeuJudi Web / Supabase
```

## 4. Fase 1 - Modelo da sessao PDPJ

### 4.1 Estrutura local

Criar um modelo especifico para o PDPJ. Ele nao deve reutilizar o modelo antigo de sessao privada do PJe.

```ts
interface PdpjSession {
  provider: 'pdpj';
  accessToken?: string;
  refreshToken?: string;
  tokenType: 'Bearer';
  createdAt: string;
  expiresAt: string;
  refreshExpiresAt?: string;
  lastUsedAt: string;
  authenticatedUser?: {
    subject?: string;
    name?: string;
    email?: string;
  };
}
```

Os tokens ficam em arquivo local cifrado. O CS nunca deve exibir ou enviar esses valores.

### 4.2 Validade

Os HARs analisados indicam `expires_in` de aproximadamente 28.800 segundos, ou 8 horas. Esse valor deve ser lido da resposta OIDC quando possivel, usando 8 horas somente como fallback.

A sessao deve ser considerada expirada quando:

- `expiresAt` for atingido;
- a API responder HTTP 401;
- a API informar token invalido ou expirado;
- o refresh token perder a validade;
- o usuario desconectar manualmente.

## 5. Fase 2 - Captura segura do Bearer

Durante a janela Electron autenticada, o CS observa requisicoes do Portal PDPJ. Quando uma requisicao autorizada contiver `Authorization: Bearer ...`, o valor e capturado apenas na memoria do processo principal e salvo cifrado localmente.

O token nunca pode ser escrito em:

- logger;
- relatorio de diagnostico;
- Supabase;
- renderer;
- notificacoes do Windows;
- arquivos HAR gerados pelo CS.

Se nenhum token aparecer, o CS deve abrir a pagina autenticada do Portal, aguardar as requisicoes iniciais e verificar novamente `userinfo` e `/api/v2/processos`. Login visual sem sessao utilizavel deve aparecer como “login concluido, API ainda nao validada”.

## 6. Fase 3 - Cliente HTTP PDPJ

Criar `meujudi-cs/src/main/pdpj-api.ts`.

```ts
const PDPJ_PORTAL_URL = 'https://portaldeservicos.pdpj.jus.br';
const PDPJ_API_URL = `${PDPJ_PORTAL_URL}/api/v2`;
type SessionProvider = () => PdpjSession | null;
```

O cliente deve receber uma funcao de sessao para detectar expiracao sem recriar a fila.

### 6.1 Metodos iniciais

```ts
buscarPorOab(oab: string, uf: string, cursor?: string[])
buscarPorCnj(cnj: string)
buscarDetalhes(cnj: string)
buscarPorCpfCnpj(documento: string)
```

Rotas descobertas nos HARs:

```text
GET /api/v2/processos?oabRepresentante=...
GET /api/v2/processos/{numeroCNJ}
GET /api/v2/processos?numeroProcesso=...
GET /api/v2/processos?cpfCnpjParte=...
```

O filtro de CPF/CNPJ deve ser opcional, pois o Portal pode responder que nao encontrou registros.

### 6.2 Requisicoes

Cabecalhos esperados:

```http
Accept: application/json
Authorization: Bearer <token>
User-Agent: MeuJudi-CS/<versao>
```

Cada requisicao deve ter timeout de 30 segundos, no maximo tres tentativas para falhas temporarias e backoff progressivo. Nao repetir automaticamente 401, 403 ou 404. No MVP, usar uma requisicao PDPJ por vez.

## 7. Fase 4 - Paginacao por cursor

As respostas por OAB possuem estrutura semelhante a:

```json
{
  "total": 988,
  "numberOfElements": 100,
  "maxElementsSize": 100,
  "searchAfter": ["...", "..."],
  "content": []
}
```

O `searchAfter` e o cursor da proxima pagina. Ele deve ser salvo depois que a pagina for processada com sucesso.

Algoritmo:

```text
cursor = null
enquanto houver pagina:
    buscar por OAB usando cursor
    validar resposta
    normalizar itens
    enviar lote ao Web
    salvar estatisticas e cursor
    se searchAfter estiver vazio: finalizar
```

Nao usar apenas `page=2`. Se o CS fechar depois de salvar o cursor, a proxima execucao continua daquele ponto. Se fechar antes, a pagina pode repetir, mas o upsert por CNJ evita duplicidade.

## 8. Fase 5 - Fila persistente

### 8.1 Estados

```text
pending
processing
paused_login_required
paused_rate_limit
paused_network
completed
failed
cancelled
```

### 8.2 Modelo sugerido

```ts
interface PdpjSyncJob {
  id: string;
  tenantId: string;
  oabId: string;
  oabNumber: string;
  oabUf: string;
  type: 'oab_full' | 'cnj_detail' | 'process_refresh';
  status: SyncJobStatus;
  cursor?: string[];
  totalEstimated?: number;
  receivedCount: number;
  importedCount: number;
  updatedCount: number;
  failedCount: number;
  currentCnj?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  lastError?: string;
}
```

Regras:

- uma tarefa PDPJ por vez no MVP;
- tarefa `processing` antiga volta para `pending` apos timeout de heartbeat;
- cursor avanca somente depois da persistencia do lote;
- tarefa pausada por login nao e erro definitivo;
- usuario pode cancelar sem apagar dados ja importados.

## 9. Fase 6 - Expiracao e retomada

Ao receber 401:

1. bloquear novas consultas PDPJ;
2. salvar a tarefa como `paused_login_required`;
3. preservar cursor e CNJ atual;
4. atualizar status visual para “Login necessario”;
5. notificar o usuario;
6. permitir abrir novamente o login PDPJ.

Depois do novo login:

1. validar a nova sessao;
2. substituir o token local cifrado;
3. recuperar a tarefa pausada;
4. repetir apenas a unidade incompleta;
5. continuar pelo cursor salvo;
6. registrar a retomada sem expor credenciais.

O CS nao deve tentar login silencioso quando houver GOV.BR, MFA ou certificado.

## 10. Fase 7 - Normalizacao dos dados

O cliente nao deve enviar a resposta PDPJ bruta diretamente ao Web. Criar um normalizador que mapeie:

- CNJ;
- sigla, nome, segmento e grau do tribunal;
- classe e assuntos;
- valor da causa;
- data de ajuizamento;
- orgao julgador;
- partes e polos;
- representantes encontrados;
- nivel de sigilo;
- movimentos;
- documentos disponiveis;
- data da ultima movimentacao.

### 10.1 Idempotencia

Usar o CNJ normalizado para deduplicacao:

- processo inexistente: inserir;
- processo existente: atualizar campos novos;
- movimento existente: nao duplicar;
- movimento novo: inserir;
- documento existente: atualizar apenas metadados alterados.

## 11. Fase 8 - Tenant e seguranca

Cada job deve carregar `tenantId` e `oabId`. O CS nao pode aceitar um tenant livremente informado pela interface.

No Web/Supabase:

- aplicar RLS por `tenant_id`;
- rejeitar tenant inexistente;
- registrar `source_context = pdpj`;
- impedir uso de OAB de outro tenant;
- auditar inicio, pausa, retomada e conclusao.

O token PDPJ nunca participa das chamadas CS-Web. O CS usa o pareamento do dispositivo e credenciais proprias.

## 12. Fase 9 - Comunicacao com o Web

Endpoints sugeridos:

```text
POST /api/cs/pdpj/jobs
GET  /api/cs/pdpj/jobs/:id
POST /api/cs/pdpj/jobs/:id/progress
POST /api/cs/pdpj/results
POST /api/cs/pdpj/jobs/:id/complete
POST /api/cs/pdpj/jobs/:id/fail
```

O endpoint de resultados deve aceitar lotes idempotentes. Repetir uma chamada nao pode duplicar processos ou movimentos.

O Web deve exibir progresso mesmo depois de recarregar a pagina, lendo o estado persistido da tarefa.

## 13. Fase 10 - Interface do CS

Exibir:

- status do PDPJ;
- usuario autenticado, quando disponivel;
- horario do login;
- validade estimada e tempo restante;
- ultima consulta;
- tarefas pendentes;
- pagina atual e total estimado;
- processos recebidos, novos e atualizados;
- motivo da pausa;
- botao “Entrar novamente no PDPJ”.

Exemplo:

```text
Consultando processos PDPJ
Pagina 4 de aproximadamente 10
Processos recebidos: 387
Novos: 42 | Atualizados: 345
```

## 14. Fase 11 - Diagnostico

Eventos permitidos:

```text
pdpj_login_started
pdpj_login_detected
pdpj_session_saved
pdpj_session_expired
pdpj_job_created
pdpj_page_started
pdpj_page_completed
pdpj_job_paused_login_required
pdpj_job_completed
pdpj_job_failed
```

Enviar apenas horario, duracao, status HTTP, host, rota sem query sensivel, quantidade de itens e cursor mascarado.

Nunca enviar Bearer, refresh token, cookies, CPF completo, dados do certificado ou query completa com documentos pessoais.

## 15. Ordem de implementacao

### Parte A - Limpeza do fluxo antigo

- remover chamadas ao cliente privado do PJe;
- manter somente a entrada PDPJ;
- separar nomes, constantes e armazenamento;
- atualizar diagnosticos e textos;
- compilar o CS.

### Parte B - Sessao PDPJ

- criar `PdpjSession`;
- implementar armazenamento cifrado;
- ler expiracao OIDC;
- detectar sessao invalida;
- testar expiracao.

### Parte C - Cliente minimo

- consulta individual por CNJ;
- tratamento de 200, 401, 403, 404 e 429;
- metricas sanitizadas.

### Parte D - OAB e paginacao

- consulta `oabRepresentante`;
- persistencia do `searchAfter`;
- teste com mais de 100 resultados.

### Parte E - Fila

- estados locais;
- cursor persistente;
- retomada apos reinicio;
- progresso no CS.

### Parte F - Integracao Web

- jobs PDPJ no Supabase;
- recebimento pelo CS;
- lotes idempotentes;
- RLS e auditoria;
- vinculo tenant/OAB.

### Parte G - Enriquecimento

- detalhes por CNJ;
- movimentos;
- partes e representantes;
- documentos e metadados;
- cruzamento com DataJud e Mural.

### Parte H - Producao

- tenant piloto;
- limites de requisicao;
- monitoramento de 401, 403 e 429;
- instalador;
- rollback;
- documentacao de uso.

## 16. Testes de aceitacao

- login PDPJ concluido e sessao cifrada;
- nenhum endpoint privado do TRT9 chamado;
- consulta individual por CNJ funcionando;
- consulta por OAB percorrendo todas as paginas;
- retomada pelo cursor apos reinicio;
- HTTP 401 pausando a fila;
- novo login retomando a tarefa;
- HTTP 429 aplicando espera;
- reprocessamento sem duplicidade;
- tenant A sem acesso aos dados do tenant B;
- nenhum token nos logs ou Supabase;
- progresso visivel depois de recarregar o Web.

## 17. Estado atual

O login PDPJ, o armazenamento separado da sessao, o cliente HTTP dedicado, a captura do Bearer, a paginacao `searchAfter`, o checkpoint local e o snapshot cifrado foram implementados na primeira parte.

O extrator esta disponivel na tela de conexao do CS para uma consulta manual por OAB. Nesta etapa ele nao envia processos para o Web e nao substitui dados existentes. A comparacao com MeuJudi, Mural e DataJud, a fila visual completa e o envio controlado ao Web continuam pendentes para as proximas partes.

### Regra de inicio da extracao

O usuario nao deve digitar OAB ou UF. Depois do pareamento, o CS consulta as OABs vinculadas ao escritorio pelo endpoint protegido do Web e usa essa configuracao para iniciar a extracao. A janela do Jus/PDPJ e fechada automaticamente assim que a sessao Bearer for capturada e validada; o usuario nao precisa navegar manualmente no portal depois do login.
