# Extracao PDPJ e Fila de Tarefas do MeuJudi CS

## 1. Objetivo

Definir como o MeuJudi CS consultara o Portal PDPJ/Jus, como os dados serao
enviados ao MeuJudi Web e como a fila de tarefas sera executada, retomada e
monitorada.

O CS sera responsavel por autenticacao e coleta local. O Web sera responsavel
por Regex, IA, regras de negocio e consolidacao. O Supabase sera responsavel
por persistencia, fila, progresso, resultados e auditoria.

O fluxo nao utilizara PJe.

## 2. Divisao de responsabilidades

### MeuJudi CS

- autenticar no Portal PDPJ/Jus;
- manter a sessao autenticada localmente e criptografada;
- executar consultas do PDPJ;
- controlar paginas e cursores durante a consulta;
- enviar textos, metadados e links ao Supabase;
- atualizar o progresso das tarefas;
- pausar quando a sessao expirar;
- retomar tarefas interrompidas.

O CS nao deve decidir se um texto contem prazo, audiencia ou decisao.

### MeuJudi Web/Vercel

- executar todos os Regex;
- classificar documentos;
- extrair campos e evidencias;
- chamar IA quando o Regex nao for suficiente;
- consolidar dados das fontes;
- remover duplicidades;
- atualizar processos, agenda e tarefas;
- encaminhar itens para revisao humana.

### Supabase

- armazenar a fila;
- armazenar o progresso;
- armazenar textos e metadados processuais;
- armazenar resultados de Regex e IA;
- armazenar evidencias e erros;
- controlar o historico;
- aplicar RLS por tenant.

## 3. Formatos de extracao PDPJ

### 3.1 Extracao por OAB

Ja implementada e usada para localizar processos vinculados a uma OAB.

```text
OAB + UF
  -> consulta paginada
  -> processos encontrados
  -> normalizacao do CNJ
  -> comparacao com o Web
  -> novos processos ou atualizacoes
```

Depois que a OAB localizar os processos, cada CNJ deve gerar tarefas de
detalhamento automaticamente.

### 3.2 Extracao por CNJ

A extracao por CNJ nao sera somente manual. Ela sera criada automaticamente
quando:

- um processo novo for encontrado pela OAB;
- DataJud encontrar uma movimentacao nova;
- o Mural receber uma comunicacao nova;
- o PDPJ informar alteracao no processo;
- existir documento novo;
- houver prazo ou audiencia relacionada;
- o processo precisar de reprocessamento;
- o usuario solicitar sincronizacao individual.

O CNJ sera usado para consultar:

- dados basicos;
- tribunal e grau;
- classe e assuntos;
- distribuicao;
- orgao julgador;
- partes;
- representantes e advogados;
- movimentacoes;
- documentos;
- processos relacionados;
- permissao para peticionar;
- nivel de sigilo.

### 3.3 Extracao de movimentacoes

O CS deve buscar somente movimentacoes novas quando a fonte permitir. O
controle sera feito por:

- ultima data recebida;
- identificador da movimentacao;
- pagina ou cursor;
- hash do conteudo;
- ultima sincronizacao concluida.

### 3.4 Extracao de documentos

O processo de documentos sera dividido:

1. localizar documentos;
2. salvar metadados e links;
3. identificar documentos relevantes;
4. buscar o texto do documento;
5. executar Regex;
6. chamar IA quando necessario;
7. atualizar processo, prazo, audiencia ou agenda.

O PDF original nao sera armazenado no MeuJudi. O advogado acessara o link e
baixara o arquivo diretamente para o proprio computador.

### 3.5 Extracao por periodo ou historico

Usada para:

- primeira importacao;
- busca dos ultimos 12 meses;
- reconstruir dados;
- comparar PDPJ e Web;
- reprocessar documentos antigos.

E uma operacao longa, executada em segundo plano, com lotes, cursor e retomada.

### 3.6 Consulta futura por CPF/CNPJ

Fica registrada como funcionalidade futura e manual.

Quando implementada:

- o cadastro do cliente tera um botao para consultar processos;
- a consulta sera feita por CPF ou CNPJ;
- o resultado mostrara quantos processos foram encontrados;
- o usuario podera selecionar quais processos importar;
- essa consulta nao participara da sincronizacao automatica inicial.

## 4. Frequencia automatica da extracao por CNJ

### Ciclo rapido - aproximadamente a cada hora

- processos prioritarios;
- prazos proximos;
- audiencias proximas;
- processos com comunicacao nova;
- processos novos.

### Ciclo operacional - aproximadamente a cada seis horas

- detalhes dos processos ativos;
- movimentacoes novas;
- documentos novos ou alterados;
- partes e advogados atualizados.

### Ciclo longo - diariamente ou semanalmente

- textos dos documentos novos;
- documentos relevantes ainda nao analisados;
- historico antigo;
- reconciliacao entre fontes;
- reprocessamento de falhas;
- deduplicacao profunda.

### Sincronizacao individual

Quando solicitada pelo usuario, cria tarefas prioritarias para:

1. DataJud;
2. Mural via CS;
3. detalhes do PDPJ;
4. movimentacoes;
5. documentos relevantes.

O resultado sera exibido parcialmente conforme cada fonte terminar.

## 5. Fila de tarefas do CS

O CS buscara tarefas persistidas no Supabase. Nenhuma informacao processual
deve depender de arquivo local.

### Tipos de tarefa

- `pdpj_oab`;
- `pdpj_cnj`;
- `pdpj_detalhes`;
- `pdpj_movimentacoes`;
- `pdpj_documentos`;
- `pdpj_texto_documento`;
- `pdpj_reprocessar_falha`.

### Tarefas encadeadas

Uma tarefa grande sera dividida em tarefas menores relacionadas:

```text
Importar OAB
  -> Consultar processo A
  -> Consultar processo B
  -> Consultar processo C

Consultar processo A
  -> Listar documentos
  -> Ler documento 1
  -> Ler documento 2
  -> Aplicar extracao
  -> Atualizar processo
```

Cada tarefa filha so fica disponivel quando a tarefa anterior entregar o dado
necessario. Se uma tarefa falhar, somente ela sera repetida.

Isso permite:

- pausar a fila;
- retomar depois;
- priorizar prazos urgentes;
- reprocessar somente um documento;
- nao repetir uma OAB inteira;
- acompanhar o progresso real.

### Prioridades

1. Processo com prazo proximo;
2. Processo com audiencia proxima;
3. Sincronizacao individual;
4. Nova comunicacao do Mural;
5. Processo novo;
6. Processo ativo alterado;
7. Documento recente;
8. Historico antigo;
9. Reprocessamento de falhas nao urgentes.

### Estados

- `pending`: aguardando;
- `claimed`: reservado por um CS;
- `running`: em execucao;
- `waiting_external`: aguardando resposta de fonte;
- `paused_login_required`: requer novo login;
- `paused_rate_limit`: aguardando limite da fonte;
- `completed`: concluida;
- `completed_with_warnings`: concluida parcialmente;
- `failed`: falhou;
- `cancelled`: cancelada.

## 6. Reserva, retry e retomada

Quando o CS assumir uma tarefa, ele deve registrar:

- CS responsavel;
- horario da reserva;
- ultima atividade;
- tentativa atual;
- pagina ou cursor atual;
- quantidade processada.

Se o CS fechar ou perder a conexao, a reserva expira e a tarefa volta para
`pending`.

Erros temporarios devem usar espera progressiva. Erros de autenticacao devem
pausar a fila. Erros permanentes devem registrar motivo e permitir
reprocessamento manual.

## 7. Armazenamento

### O que fica no Supabase

- tarefas;
- progresso;
- status;
- cursores;
- processos encontrados;
- movimentacoes;
- metadados de documentos;
- links de texto e PDF;
- textos extraidos;
- resultados de Regex;
- resultados de IA;
- trechos de evidencia;
- erros;
- historico e auditoria.

### O que nao fica no Supabase

- PDF original;
- instalador do CS;
- snapshot local de processos;
- arquivos temporarios de extracao.

### Excecao: sessao autenticada

Cookies e tokens necessarios para manter a sessao do PDPJ precisam permanecer
localmente no CS, criptografados e protegidos pelo sistema operacional. Eles
nao devem ser enviados ao Supabase.

Essa e a unica parte operacional que permanece local. Dados processuais,
resultados e progresso ficam no Supabase.

## 8. Revisao e limpeza dos textos

O texto recebido do CS passa por uma triagem antes de permanecer no banco.

### Manter

- despachos;
- decisoes;
- sentencas;
- peticoes;
- intimacoes;
- documentos com prazo;
- documentos com audiencia;
- documentos com valor;
- documentos com partes;
- documentos com pagamento, penhora ou arrematacao;
- textos usados como evidencia de uma extracao.

### Descartar

- texto vazio;
- resposta incompleta;
- erro de consulta;
- conteudo duplicado;
- cabecalho repetido sem informacao nova;
- pagina generica do tribunal;
- documento sem vinculo confirmado;
- texto sem informacao processual util.

Para itens descartados, pode ser mantido somente:

- identificador;
- data;
- hash;
- motivo do descarte;
- tarefa de origem.

## 9. Regex e IA

Todos os Regex ficam no Web/Vercel, seguindo o padrao ja usado no Mural.

O CS coleta e envia. O Web processa.

### Ordem de processamento

1. dado estruturado;
2. Regex especifico do formato PDPJ;
3. Regex generico;
4. IA para contexto ambiguo;
5. revisao humana para baixa confianca.

### Campos PDPJ iniciais

- tipo do documento;
- classe;
- assunto;
- valor da causa;
- orgao julgador;
- magistrado;
- partes e polos;
- prazos;
- audiencias;
- decisoes;
- pagamentos;
- penhora;
- arrematacao;
- cumprimento de determinacoes.

Cada resultado deve preservar a evidencia, a fonte, o documento, o Regex ou
modelo usado e o nivel de confianca.

Uma mencao historica a audiencia nao deve criar uma audiencia futura. O motor
deve identificar se a audiencia foi designada, redesignada, realizada,
cancelada ou retirada de pauta.

## 10. Resultado no Web

O usuario vera uma sincronizacao unica:

```text
Sincronizacao em andamento
DataJud: atualizado
PDPJ: processando documentos
Mural: aguardando CS
```

O Web atualizara os dados conforme cada etapa terminar. Uma fonte com erro nao
deve apagar os resultados das outras.

O modal do processo mostrara:

- dados principais;
- acao necessaria;
- proximo prazo;
- proxima audiencia;
- ultima movimentacao;
- movimentacoes recentes;
- Mural formatado;
- documentos e links;
- agenda vinculada.

Todas as movimentacoes permanecem armazenadas, mas a tela inicial mostrara as
10 ou 20 mais recentes, com pagina, filtros e busca para consultar o restante.

## 11. Super Admin

O Super Admin tera uma area de observabilidade da fila PDPJ/CS mostrando:

- tarefas pendentes;
- tarefas em execucao;
- tarefas pausadas;
- tarefas com erro;
- CS conectado;
- pagina e cursor atuais;
- processos encontrados;
- documentos lidos;
- textos processados;
- Regex executados;
- itens descartados;
- itens enviados para revisao;
- ultima atividade;
- proxima tentativa.

Cada tarefa podera abrir uma pagina de detalhe com sua linha do tempo e seus
erros, sem expor tokens ou cookies.

## 12. Tabelas recomendadas

- `extraction_requests`;
- `extraction_tasks`;
- `extraction_task_events`;
- `extraction_errors`;
- `process_documents`;
- `document_extractions`.

As tabelas relacionadas a processos terao `tenant_id` e RLS. Os dados globais
de saude da fila devem ficar separados dos textos processuais.

## 13. Ordem de implementacao

1. Criar o contrato canonico dos resultados PDPJ.
2. Criar as tabelas de solicitacoes, tarefas e eventos.
3. Criar a reserva, retry e retomada da fila.
4. Transformar a extracao por OAB em tarefas encadeadas.
5. Criar tarefas automaticas por CNJ.
6. Criar consulta automatica de detalhes e movimentacoes.
7. Criar descoberta de documentos.
8. Criar armazenamento de metadados, links e textos.
9. Integrar os Regex PDPJ no Web.
10. Criar limpeza, deduplicacao e descarte de textos.
11. Integrar resultados a prazos, audiencias e agenda.
12. Criar o painel de fila no Super Admin.
13. Criar a consulta futura manual por CPF/CNPJ.
14. Testar retomada, expiracao de sessao, duplicidade e falhas parciais.

## 14. Criterios de aceite

- A extracao por OAB cria tarefas de CNJ automaticamente.
- A extracao por CNJ ocorre em ciclos automaticos.
- Detalhes, movimentacoes e documentos sao tarefas separadas.
- O CS retoma a fila apos reinicio.
- Uma falha nao repete todo o lote.
- O progresso fica no Supabase.
- Dados de processo nao ficam em snapshots locais.
- PDFs nao sao armazenados pelo MeuJudi.
- O advogado recebe o link para baixar o PDF diretamente.
- Textos irrelevantes sao descartados e auditados.
- Regex fica centralizado no Web.
- Resultados guardam evidencia e confianca.
- O Web mostra resultado parcial por fonte.
- O Super Admin mostra a fila, etapas e historico.
- Cookies e tokens permanecem criptografados localmente no CS.
