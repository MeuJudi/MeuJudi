# Raspador — Adaptador e-SAJ

> **Status: RASCUNHO / PLANEJAMENTO — não pronto para implementar.**
> Documento específico do adaptador e-SAJ, seguindo a arquitetura geral
> definida em `raspador-arquitetura-geral.md` (fila no Supabase, execução
> dentro do MeuJudi CS de cada tenant, background, normalização pro mesmo
> formato de `processar-comunicacao.ts`/`pipeline.ts`). A pesquisa bruta
> que embasa este documento está em `raspador-dados-publicos.md`, seção 5.
> Escrito em 27/07/2026, com base em testes reais contra o e-SAJ do TJSP.

---

## 1. Por que o e-SAJ primeiro

Entre os 4 sistemas pesquisados, o e-SAJ foi o mais consistente entre
tribunais testados (TJSP, TJCE, TJAL — mesmo formulário, mesmo
comportamento) e o de maior cobertura (TJSP é o maior tribunal do
Brasil). Sem captcha validado pelo servidor confirmado em nenhuma das
buscas testadas (por número e por OAB), sem sessão/cookie necessário —
requisição HTTP simples, sem Playwright.

## 2. Tribunais que usam e-SAJ

Pesquisa feita em 27/07/2026, cruzando 3 fontes — nenhuma delas sozinha é
100% confiável (tribunais migram de sistema com o tempo, e às vezes rodam
mais de um em paralelo, um legado e um atual). Por isso a lista abaixo
vem com a origem e o nível de confiança de cada item, não como uma
verdade única.

### Confirmado ao vivo nesta pesquisa (maior confiança)

Testado diretamente contra a página real — formulário de 6 campos
idêntico (Número, Nome da Parte, Documento, Advogado, OAB, Carta
Precatória), sem captcha:

| Tribunal | Domínio confirmado |
|---|---|
| TJSP | `esaj.tjsp.jus.br` |
| TJCE | `esaj.tjce.jus.br` |
| TJAL | `www2.tjal.jus.br` (não segue o padrão `esaj.tjal.jus.br` — domínio próprio) |

### Segundo a Softplan (fabricante do e-SAJ, clientes atuais declarados)

Fonte: página de suporte da Softplan (`sajajuda.tribunais.softplan.com.br`).
Não testado ao vivo por mim, mas é a fonte mais provável de estar
atualizada, por vir do próprio fabricante:

- TJAC (Acre)
- TJAL (Alagoas) — confirmado acima
- TJAM (Amazonas)
- TJCE (Ceará) — confirmado acima
- TJMS (Mato Grosso do Sul)
- TJSP (São Paulo) — confirmado acima

### Segundo levantamento do CJF (⚠️ desatualizado — março de 2018)

Fonte: documento comparativo de sistemas de processo eletrônico do CJF.
**Tem 8 anos** — vários tribunais migraram de sistema desde então (o
próprio TJPR, de outro sistema, está migrando agora em 2026 — ver
`raspador-dados-publicos.md`, seção 7). Serve só como pista de tribunais
a checar, não como confirmação:

- TJAC, TJAL, TJAM, TJMS, TJSP — mesmos da lista Softplan acima
- TJSC (Santa Catarina) — só nesta fonte, não confirmado em outro lugar
- TJRN (Rio Grande do Norte) — listado com e-SAJ **e** PJe ao mesmo tempo
- TJRJ (Rio de Janeiro) — listado com e-SAJ, Projudi **e** PJe ao mesmo
  tempo (provavelmente sistemas diferentes por vara/instância, ou
  migração em andamento na época) — **atenção**: uma fonte comercial
  (Infosimples) citada em `raspador-dados-publicos.md` seção 6 lista o
  TJRJ como usuário de eproc hoje, não e-SAJ. Contraditório — não usar
  TJRJ como e-SAJ sem confirmar ao vivo primeiro.

### Ressalva encontrada: TJBA e TJRN podem estar com sistema legado sem suporte

A própria Softplan menciona que **TJBA e TJRN não são clientes ativos há
alguns anos** e não recebem mais atualização do e-SAJ — o sistema pode
ainda estar no ar (sem manutenção) ou ter sido descontinuado. Testar
antes de assumir qualquer coisa.

### Como fechar essa lista de verdade

A forma mais confiável não é pesquisa — é testar direto, tribunal por
tribunal, com o mesmo processo já usado nesta pesquisa: tentar
`esaj.tj{uf}.jus.br/cpopg/open.do` (e variações de domínio, como o caso
do TJAL) pra cada estado candidato, e ver se responde com o formulário
padrão do e-SAJ. Isso confirma de verdade, sem depender de fonte
terceira desatualizada — mas ainda não foi feito sistematicamente pra
todos os candidatos acima.

---

## 3. Os dois fluxos

### 2.1. Atualizar processo conhecido (o caso mais comum)

Uma única requisição resolve tudo — **a resposta já vem com o processo
completo**, sem precisar de um segundo passo:

```
GET {dominio}/cpopg/search.do?cbPesquisa=NUMPROC&dadosConsulta.valorConsulta={numero}...
GET {dominio}/cposg/search.do?cbPesquisa=NUMPROC&dadosConsulta.valorConsulta={numero}...
```

- `cpopg` = 1º grau, `cposg` = 2º grau. Como não dá pra saber de antemão
  em qual grau o processo está, o adaptador tenta os dois (ou só o
  segundo, se o primeiro já achou e o processo não tem recurso).
- Confirmado ao vivo: busca por número exato devolve a página de detalhe
  completa direto na resposta — partes, andamentos, tudo junto.

### 2.2. Descobrir processos novos de uma OAB

Dois passos, porque a busca por OAB devolve uma **lista**, não o detalhe:

**Passo 1 — buscar a lista:**
```
GET {dominio}/cpopg/search.do?cbPesquisa=NUMOAB&dadosConsulta.valorConsulta={oab}...
```
Devolve, por processo: número, classe, assunto (resumido), foro/vara,
data, e um link pro detalhe no formato:
```
/cpopg/show.do?processo.codigo={CODIGO_INTERNO}&processo.foro={CODIGO_FORO}
```
`CODIGO_INTERNO` é um identificador opaco do e-SAJ (ex: `E2Z105AAW0000`),
**diferente do número CNJ** — só existe depois da busca, não dá pra
montar essa URL sem passar pelo passo 1.

**Passo 2 — buscar o detalhe de cada processo novo:**
```
GET {dominio}/cpopg/show.do?processo.codigo={codigo}&processo.foro={foro}
```
Mesmo formato de resposta do fluxo 2.1 — a partir daqui os dois fluxos
convergem pro mesmo parser.

Cada processo novo encontrado vira uma tarefa "atualizar processo" na
fila, pra registrar no MeuJudi.

## 4. Campos extraídos (mapeado contra resposta real)

Testado em 27/07/2026 contra o processo `0016261-02.2008.8.26.0506`
(TJSP, Ribeirão Preto):

### Dados do processo

| Campo | Exemplo real | Observação |
|---|---|---|
| Número | 0016261-02.2008.8.26.0506 | |
| Situação | Suspenso | |
| Classe | Alvará Judicial | |
| Assunto | Família | |
| Foro / Vara | Foro de Ribeirão Preto / 2ª Vara de Família e Sucessões | |
| Juiz | Márcio Pelliciotti Violante | |
| Valor da ação | R$ 100,00 | |
| Data de distribuição | 07/04/2008 às 13:31 | |
| Outros números | vários formatos antigos | processo mais antigo tem numeração legada; nem todo processo tem |

### Partes

Lista de `{ tipo (Requerente/Requerido/etc.), nome, advogado }` — quantidade
variável por processo.

### Movimentações/andamentos

Lista de `{ data, descrição }`, do mais recente pro mais antigo. Essa
lista é o que alimenta o motor de extração já existente (mesmo raciocínio
que já se aplica às comunicações do Mural).

## 5. Documentos/PDFs — o que dá e o que não dá pra trazer

Verificado contra a orientação oficial do TJSP e contra a página real:

- **Decisões, sentenças, votos e acórdãos** (o que o juiz decide) — **são
  públicos**, mas só quando o andamento específico tiver link pra isso, e
  o acesso é por um **portal separado** do e-SAJ ("Consulta de Julgados
  de Primeiro Grau" / "Consulta de Jurisprudência"), não vem embutido na
  página do processo. Precisa de mais um passo de scraping, ainda não
  desenhado neste documento — fica como pendência (seção 7).
- **Petições das partes** (o que o próprio advogado protocola —
  inicial, contestação, recursos) — **não são públicas**. A seção
  "Petições diversas" existe na página, mas fica vazia/inacessível sem
  certificado digital do advogado ou senha do processo. Isso não muda:
  continua sendo função do Cert A1/CS, não do raspador.

**Implicação prática**: o adaptador do e-SAJ resolve "o que o tribunal
decidiu", não "tudo que foi protocolado". Isso já é mais que só
metadado resumido, mas é menos que "documento completo" no sentido mais
amplo do documento de ideia original — vale deixar essa expectativa clara
antes de qualquer decisão de produto em cima disso.

## 6. Casos de resposta que o parser precisa tratar

- **Resultado normal** — processo com todos os campos da seção 3.
- **Sem resultado** — mensagem "Não existem informações disponíveis para
  os parâmetros informados". Se foi busca por número, tentar o outro
  grau antes de desistir.
- **Segredo de justiça** — processo aparece listado (na busca por OAB) mas
  sem detalhe acessível; o parser precisa reconhecer isso e não tratar
  como erro nem como processo vazio.
- **Múltiplos resultados na busca por número** — pode acontecer com
  número antigo/não-unificado ambíguo; tratar como lista, igual à busca
  por OAB.

## 7. Config por tribunal

Como o formulário e o comportamento foram idênticos nos 3 estados
testados (TJSP, TJCE, TJAL — seção 2), a config por tribunal deve ser
enxuta:

| Campo | Exemplo |
|---|---|
| `dominio` | `esaj.tjsp.jus.br` |
| `nome` | TJSP |

Não identificamos, até agora, necessidade de código de foro/vara pra
busca por número ou OAB — só aparece como parte da resposta (não como
parâmetro de entrada obrigatório).

## 8. Pendências antes de implementar de verdade

- **Scraping de decisões/acórdãos públicos** (seção 4) — ainda não
  mapeado tecnicamente; é um scraping adicional, de outro portal do
  e-SAJ, fora do que já testamos.
- **Testar um segundo estado até o fim** — só testamos o mapeamento de
  campos completo no TJSP. TJCE/TJAL tiveram só o formulário confirmado,
  não uma extração de processo real ponta a ponta.
- **Confirmar MNI pro e-SAJ** (seção 5.1 de `raspador-dados-publicos.md`,
  ainda não verificada nesta conversa) — se for real, pode ser uma via
  melhor que scraping de HTML pro TJSP especificamente.
- **Rate limiting real** — ainda não definimos um número concreto de
  intervalo entre requisições, só o princípio de "ser educado".
- **Fechar a lista de tribunais de verdade** (seção 2) — testar ao vivo
  cada candidato (TJAC, TJAM, TJMS, TJSC, TJRN) e resolver a contradição
  do TJRJ (aparece como e-SAJ numa fonte e eproc noutra) antes de tratar
  a lista como definitiva.
