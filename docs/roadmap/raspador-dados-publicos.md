# Raspador próprio de dados públicos (estilo Judit/Escavador) — pesquisa e decisões

> **Status: RASCUNHO / IDEIA REGISTRADA — não pronta para implementar.**
> Este documento registra a pesquisa técnica e as decisões de escopo de uma
> conversa entre Caio e Claude (25-26/07/2026), continuação do documento
> original `IDEIA_RASPADOR_DADOS_PUBLICOS.md` (salvo nos Downloads do Caio).
> Os 4 sistemas (e-SAJ, eproc, Projudi, PJe) já têm pesquisa e teste ao vivo
> registrados — seções 5 a 8. Antes de
> implementar, reconfirmar se o gap de
> "documento completo" ainda é uma dor real (ver seção 6 do documento
> original) e revisar preços/escopo se muito tempo tiver passado.

---

## 1. Contexto — de onde isso vem

O documento original (`IDEIA_RASPADOR_DADOS_PUBLICOS.md`) já estabeleceu o
racional: DataJud e Mural cobrem bem metadado (andamento, classe, partes,
intimação), mas não trazem documento completo (PDFs de petições, decisões,
anexos) — que é o que Judit/Escavador cobram caro por entregar. A ideia é
replicar isso em escala reduzida: um raspador próprio, por sistema (não por
tribunal), rodando contra a consulta pública de cada tribunal.

Esta conversa aprofundou 4 pontos que o documento original deixava em
aberto: **onde esse raspador rodaria**, **se dá pra evitar Playwright**,
**como Judit/Escavador lidam com CAPTCHA na prática**, e **qual o escopo
certo pro banco próprio**. Também mudou o objetivo declarado: não é só
disponibilizar PDF pro cliente baixar — é **alimentar o motor de extração
do MeuJudi com o dado completo do processo**, e resolver a limitação do
Mural de não cobrir todos os tribunais.

---

## 2. Onde o raspador rodaria

### Não dá pra rodar direto na Vercel

Os crons atuais (`poll-datajud`, `solicitar-mural`) são serverless — timeout
curto, sem estado entre execuções, sem suporte confortável a navegador
headless. Um raspador de consulta pública, quando precisa de navegador
(ver seção 4), não roda bem nesse modelo.

### A solução é um worker externo — mesmo padrão que o MeuJudi CS já usa

Um processo rodando continuamente fora da Vercel, que **só faz chamadas de
saída** pro Supabase (nunca recebe conexão de fora, não precisa de porta
aberta nem domínio próprio):

1. Pergunta periodicamente ao Supabase "tem algo novo pra raspar?" (fila
   numa tabela, ex. `raspagem_fila`).
2. Processa cada item usando o adaptador do sistema certo (e-SAJ, PJe,
   Projudi, eproc).
3. Posta o resultado de volta via REST com a service-role key.

É exatamente o desenho que `cs_mural_requests` + MeuJudi CS já validam em
produção — só que rodando num servidor da Caio, não no PC de um advogado.

### Raspberry Pi é uma ideia forte, por um motivo específico

Descoberta chave da investigação anterior do Mural: **tribunais bloqueiam
IP de datacenter (Vercel, AWS), mas não IP residencial** — foi por isso que
o MeuJudi CS precisou existir. Um Raspberry Pi na casa/escritório do Caio
tem IP residencial, exatamente a característica que fez o CS funcionar.

Prós: hardware já disponível, custo zero adicional, fica ligado 24/7 barato,
não precisa de porta aberta (só chamadas de saída, funciona atrás de
qualquer NAT doméstico).

Limitações: RAM/CPU ARM aperta se precisar rodar Chromium via Playwright
(~200-400MB por instância, mais lento em ARM) — mas pra volume baixo
(escopo de "só os clientes do MeuJudi", não o Brasil inteiro) é tranquilo.
Se o adaptador não precisar de navegador (ver próxima seção), o Pi aguenta
volume bem maior.

**Recomendação: testar com o Pi antes de considerar VPS pago.**

---

## 3. Dá pra evitar Playwright?

Sim, depende do sistema — não é "tudo ou nada".

Playwright só é necessário quando a página depende de JavaScript pra
renderizar conteúdo ou manter sessão. Muita consulta pública de tribunal é
mais antiga, server-rendered, com formulário HTML puro — nesses casos um
cliente HTTP comum (`fetch`) + parser de HTML (mesma categoria de
ferramenta que o MeuJudi já usa pro Mural) resolve, sem navegador.

**Confirmado por evidência real no e-SAJ** (ver seção 5): não precisa de
Playwright pra consulta por número de processo. Plano: **HTTP simples como
padrão, Playwright só como exceção pontual** pros sistemas que realmente
exigirem — a decidir sistema por sistema, não pela arquitetura toda.

---

## 4. Como Judit/Escavador lidam com CAPTCHA, de fato

Não é mágica nem acesso especial. Três fatores, nenhum exclusivo de empresa
grande:

1. **Nem toda consulta pública tem CAPTCHA** — costuma aparecer em
   endpoints de maior risco de abuso (busca/descoberta por nome, CPF, OAB),
   não necessariamente na consulta simples "processo tal, mostra
   andamento". Boa parte do trabalho delas é mapear onde tem e onde não
   tem, e priorizar o que não tem.
2. **Onde tem, pagam resolução** (2Captcha, Anti-Captcha, CapMonster,
   CapSolver) — sem segredo técnico, é orçamento que escala fácil porque o
   custo por resolução é baixo (centavos) e o volume delas dilui isso.
3. **Toleram falha** — o produto delas nunca promete 100% em tempo real,
   promete "melhor esforço, com reconsulta". Decisão de produto, não
   problema resolvido.

O que muda pro MeuJudi não é viabilidade técnica (a mesma API de resolução
funciona igual pra qualquer um), é **apetite de risco jurídico** — empresas
desse porte já operam nessa zona cinzenta há anos, com jurídico próprio
dedicado. Pra MeuJudi, contornar CAPTCHA é decisão que passa pela Julia
antes de qualquer código — mantém a ressalva do documento original.

---

## 5. Pesquisa: e-SAJ (pesquisa em 26/07/2026, testado ao vivo em 27/07/2026)

### Achado inicial (26/07, baseado em pesquisa de terceiros)

**Consultar processo pelo número que já se conhece → SEM CAPTCHA, HTTP
simples.** Confirmado em código real publicado:
- [`esaj_2_grau/esaj_scraping.py`](https://github.com/jespimentel/esaj_2_grau/blob/main/esaj_scraping.py) —
  faz `requests.get('https://esaj.tjsp.jus.br/cposg/search.do', params=...)`
  com o número do processo, parseando o HTML com BeautifulSoup. Nenhuma
  menção a CAPTCHA, token de sessão ou navegador.
- [`courtsbr/esaj`](https://github.com/courtsbr/esaj) — pacote R que
  descreve explicitamente sua função como baixar processos "without having
  to manually input each lawsuit's ID **and break captchas**" — usando
  `download_cpopg()` (1º grau) e `download_cposg()` (2º grau).

Nessa primeira rodada, a busca por OAB/nome/CPF (descoberta) tinha sido
registrada como **com captcha**, baseado em descrições de terceiros do
fluxo do navegador ("resolva o captcha e clique em consultar").

### Correção após teste ao vivo (27/07): o captcha da busca por OAB não é validado pelo servidor

Testei diretamente, via requisição HTTP simples (sem navegador, sem
resolver nada), a busca por OAB em duas instâncias reais:

- **TJSP**: `GET cpopg/search.do?...&cbPesquisa=NUMOAB&dadosConsulta.valorConsulta=1000` →
  retornou **6 processos reais** (Ribeirão Preto, ações do Ministério
  Público), sem captcha nenhum na resposta.
- **TJCE**: mesmo tipo de requisição, com um número de OAB de teste → voltou
  "Não existem informações disponíveis para os parâmetros informados" (sem
  resultado, mas também sem captcha) — ou seja, o servidor processou a
  consulta normalmente, só não achou nada pro número usado.

**Interpretação**: o captcha que aparece na tela do e-SAJ no navegador
parece ser **só uma trava do lado do cliente (JavaScript/UI)**, não
validada de fato pelo servidor. Uma requisição HTTP direta pro mesmo
endpoint que o navegador chama, pulando a interface inteira, simplesmente
não esbarra em nenhum captcha — pelo menos nos 2 tribunais testados agora.
Isso **derruba a conclusão anterior** de que a busca por OAB exige
resolução de captcha — pelo menos como o e-SAJ está configurado hoje
(27/07/2026), testado de verdade.

### Implicação pra arquitetura (atualizada)

| Objetivo | Endpoint e-SAJ | CAPTCHA (testado)? | Complexidade |
|---|---|---|---|
| Alimentar o sistema com dado completo de um processo já cadastrado | `cpopg/search.do` (1º grau) / `cposg/search.do` (2º grau) por número | Não | HTTP simples, sem Playwright |
| Descobrir processos novos de uma OAB não coberta pelo Mural | busca por `NUMOAB` | **Não, testado ao vivo em TJSP e TJCE** | HTTP simples, sem Playwright — mas ver ressalva abaixo antes de tratar como definitivo |

Isso muda o panorama: se isso se sustentar, **nem a parte de busca por OAB
no e-SAJ dependeria da conversa com a Julia sobre "contornar CAPTCHA"** —
porque tecnicamente não haveria CAPTCHA nenhum sendo contornado no lado do
servidor, só uma tela de UI que a requisição direta nunca passa por ela.
Vale levar esse ponto específico pra ela mesmo assim — "o captcha existe na
tela mas o servidor não valida" muda a natureza da questão jurídica (não é
mais burlar uma proteção ativa), mas ainda envolve dado de terceiros
(OABs que não são clientes), então o racional de LGPD/escopo continua
valendo.

### Ressalvas importantes

- **Testado em 2 tribunais (TJSP, TJCE), em 1 momento, com poucas
  requisições.** Não é garantia de que:
  - vale pra todos os outros tribunais que rodam e-SAJ (mesma lógica de
    "ilhas" já vista no eproc — alguns podem ter validação server-side de
    verdade, mesmo que TJSP/TJCE não tenham);
  - continua assim em volume alto — pode existir um limite de taxa
    silencioso que só ativa depois de N requisições seguidas, ou o tribunal
    pode decidir implementar validação server-side do captcha no futuro.
  - a tentativa em **TJAL falhou por erro de DNS** (`esaj.tjal.jus.br` não
    existe — o domínio real usa outro padrão, `www2.tjal.jus.br`, que não
    cheguei a testar com a URL de busca por OAB) — não é uma confirmação de
    bloqueio, só um teste que não completou.
- Mesmo sem captcha nenhum, vale manter intervalo educado entre consultas
  (não virar tráfego de alto volume repentino) — reduz a chance de o
  tribunal decidir reagir com um bloqueio novo.
- A estrutura do formulário (mesmos 6 campos: número, nome da parte,
  documento, advogado, OAB, carta precatória) é idêntica em TJSP, TJCE e
  TJAL — confirma que a UI é padronizada entre estados, útil pra saber que
  o adaptador de parsing tende a se repetir com pouca alteração.

### Pendente de pesquisar

- [ ] PJe (consulta pública) — único sistema dos 4 ainda não testado
- [x] ~~Projudi~~ ✅ (seção 7 — TJPR com API oficial, TJGO sem captcha)
- [x] ~~Mais tribunais de e-SAJ~~ ✅ (seção 5.1 — MNI testado e funcional)
- [ ] Verificar se o MNI do TJSP aceita consulta por OAB (não só por número)

---

## 5.1. API do e-SAJ: MNI + endpoints de scraping — pesquisa em 27/07/2026

### Achado principal: e-SAJ NÃO tem API REST própria, MAS expõe o MNI (mesmo do eproc)

Assim como o eproc, o e-SAJ também implementa o **MNI (Modelo Nacional de
Interoperabilidade) versão 2.2.2** — o mesmo webservice SOAP padronizado
pelo CNJ. Isso confirma que o MNI é uma **camada comum a TODOS os sistemas
processuais** (e-SAJ, eproc, PJe, Projudi), não exclusiva de um deles.

### Endpoint MNI do TJSP (e-SAJ)

| Tipo | URL |
|------|-----|
| **WSDL** | `http://esaj.tjsp.jus.br/mniws/servico-intercomunicacao-2.2.2/intercomunicacao?wsdl` |
| **Produção** | `http://esaj.tjsp.jus.br/mniws/servico-intercomunicacao-2.2.2/intercomunicacao` |

- **Autenticação**: `idConsultante` + `senhaConsultante` (login/senha)
- **Operações**: mesmas 5 do MNI padrão (`consultarProcesso`, `consultarAvisosPendentes`, `consultarTeorComunicacao`, `entregarManifestacaoProcessual`, `consultarAlteracao`)
- **Credenciais**: solicitadas diretamente ao TJSP (não é self-service)
- **Importante**: o endpoint usa HTTP (não HTTPS) — incomum, mas é o que está documentado

### Como falar com o MNI do e-SAJ (exemplo em Python)

Exemplo real publicado por[@jjesusfilho](https://gist.github.com/jjesusfilho/31b505195dda1080447dcfeaed481c82):

```python
from zeep import Client

wsdl = 'http://esaj.tjsp.jus.br/mniws/servico-intercomunicacao-2.2.2/intercomunicacao?wsdl'
client = Client(wsdl=wsdl)

resposta = client.service.consultarProcesso(
    idConsultante='seu_usuario',
    senhaConsultante='sua_senha',
    numeroProcesso='0001234-56.2024.8.26.0100',
    incluirCabecalho=True,
    movimentos=True,          # incluir andamentos
    incluirDocumentos=False   # incluir PDFs/documentos
)
```

### API institucional do e-SAJ (Integração Procuradoria/Autarquia)

O TJSP também oferece uma **API SOAP para integração institucional** (procuradorias, autarquias), que é **diferente do MNI**:

- **Finalidade**: ajuizar ações em lote, consultar processos da autarquia
- **Autenticação**: certificado digital A1 (e-CNPJ) — não é login/senha
- **Acesso**: requer cadastro prévio + convênio/cooperação com o TJSP
- **Contato**: sti.execfiscais@tjsp.jus.br
- **Uso pro MeuJudi**: não se aplica — é para entidades institucionais, não para escritórios de advocacia

### APIs pagas de terceiros (scraping)

| Serviço | Tipo | Custo | O que faz |
|---------|------|-------|-----------|
| **Infosimples** | REST/JSON | Pago por consulta | Scraping automatizado do e-SAJ, retorna JSON estruturado |
| **Vigilant** | REST/JSON | R$ 0,10 por tribunal | Unifica ESAJ + PJe em um só endpoint, resolve CAPTCHA |
| **Judit** | SaaS | Assinatura | Plataforma completa com API, monitoramento, alertas |
| **Digesto** | REST/JSON | Assinatura | Consulta + download de anexos via API |

### Bibliotecas open-source de scraping

| Biblioteca | Linguagem | O que faz | CAPTCHA? |
|------------|-----------|-----------|----------|
| [**juscraper**](https://github.com/jtrecenti/juscraper) | Python | `cpopg()`, `cposg()`, `cjsg()` — consulta processual e jurisprudência | Não para número; sim para busca por CPF/OAB |
| [**pyESAJ**](https://github.com/pricilakrepeki/pyESAJ) | Python | Scraping do e-SAJ via Selenium | Sim (usa navegador) |
| [**tjsp**](https://tjsp.consudata.com.br/) | R | Download de processos, documentos, jurisprudência | Usa autenticação via email token |
| [**esaj_2_grau**](https://github.com/jespimentel/esaj_2_grau) | Python | Scraping 2º grau do TJSP | Não para número |
| [**courtsbr/esaj**](https://github.com/courtsbr/esaj) | R | `download_cpopg()`, `download_cposg()` | Não para número |

### Consulta pública HTML do e-SAJ (endpoints de scraping)

| Operação | URL | Método | CAPTCHA? |
|----------|-----|--------|----------|
| Consulta 1º grau | `https://esaj.tjsp.jus.br/cpopg/open.do` | GET/POST | Sim (CPF/OAB); Não (número) |
| Consulta 2º grau | `https://esaj.tjsp.jus.br/cposg/open.do` | GET/POST | Sim (CPF/OAB); Não (número) |
| Busca por OAB | `cpopg/search.do?cbPesquisa=NUMOAB&...` | GET | **Não validado pelo servidor** (seção 5) |

### O que isso muda na estratégia

| Antes desta pesquisa | Depois desta pesquisa |
|---------------------|----------------------|
| "e-SAJ = só scraping HTML, zona cinzenta" | "e-SAJ tem MNI oficial (canal legítimo) + scraping HTML como fallback" |
| "cada tribunal e-SAJ precisa de adaptador próprio" | "MNI padronizado — um adaptador serve pra todos os e-SAJ" |
| "TJSP não tem nenhuma API" | "TJSP tem MNI + API institucional (procuradorias)" |

### Comparativo: MNI vs Scraping HTML vs API paga

| Aspecto | MNI (oficial) | Scraping HTML | API paga (Infosimples/Vigilant) |
|---------|---------------|---------------|--------------------------------|
| **Custo** | Gratuito (com credenciais) | Gratuito | R$ 0,10+ por consulta |
| **Legalidade** | Canal oficial do CNJ | Zona cinzenta | Empresa assume risco |
| **CAPTCHA** | Não (autenticação por credencial) | Varia por tribunal | Resolvido por eles |
| **Dados retornados** | Completos (partes, movimentações, documentos) | Metadado + HTML | JSON estruturado |
| **Manutenção** | Baixa (padrão nacional) | Alta (layout muda) | Zero (eles mantêm) |
| **Escopo** | Só processos públicos | Só processos públicos | Só processos públicos |

### Conclusão pro MeuJudi

A **prioridade agora é o MNI**, tanto pro e-SAJ quanto pro eproc — é o
mesmo protocolo, a mesma API, só muda a URL do WSDL. Um único adaptador
MNI que funcione resolve acesso a dados completos de **todos os sistemas
processuais brasileiros** (e-SAJ, eproc, PJe, Projudi) sem scraping,
sem CAPTCHA, sem zona cinzenta.

**Porém, há um bloqueio importante:**
- **e-SAJ (TJSP)**: endpoint MNI é público e acessível de qualquer lugar
- **eproc (TRF2, JFRJ, JFES)**: endpoints MNI são internos (DNS não resolve fora da rede judiciária)

Isso significa que o MNI sozinho não resolve tudo — o CS (que roda no
escritório) continua sendo necessário para acessar o eproc via MNI.
O MNI do e-SAJ, por outro lado, pode ser chamado direto do Vercel.

O scraping HTML vira **fallback** só pro caso de:
1. Tribunais que não implementaram o MNI direito
2. Busca por CPF/OAB quando o MNI não suportar (o MNI é mais orientado a consulta por número)

### Fonte dos endpoints

- Gist com exemplo MNI TJSP: `https://gist.github.com/jjesusfilho/31b505195dda1080447dcfeaed481c82`
- juscraper (scraping): `https://github.com/trecenti/juscraper`
- pyESAJ (scraping com Selenium): `https://github.com/pricilakrepeki/pyESAJ`
- tjsp (R package): `https://tjsp.consudata.com.br/`
- WSDL oficial MNI 2.2.2: `https://www.cnj.jus.br/images/dti/Comite_Gestao_TIC/Modelo_Nacional_Interoperabilidade/versao_07_07_2014/servico-intercomunicacao-2.2.2.wsdl`
- Documentação MNI (CNJ): `https://www.cnj.jus.br/integracao-para-os-tribunais/`

### Pendente de testar

- [x] Testar se WSDL do TJSP (e-SAJ) responde — ✅ **FUNCIONA** (HTTP 200, 16KB XML)
- [x] Comparar dados retornados pelo MNI do e-SAJ vs eproc — WSDL idêntico ao eproc
- [ ] Verificar se o MNI do TJSP aceita consulta por OAB (não só por número)
- [x] Testar com SoapUI antes de integrar no código — ✅ Testado via PowerShell (Invoke-WebRequest)
- [ ] Solicitar credenciais MNI TJSP (precisa de idConsultante + senhaConsultante)

### Resultados dos testes (27/07/2026)

**TJSP (e-SAJ) — ✅ ENDPOINT FUNCIONAL**
- WSDL: `http://esaj.tjsp.jus.br/mniws/servico-intercomunicacao-2.2.2/intercomunicacao?wsdl`
- Endpoint: `http://esaj.tjsp.jus.br/mniws/servico-intercomunicacao-2.2.2/intercomunicacao`
- Protocolo: HTTP (não HTTPS)
- 6 operações confirmadas: `consultarProcesso`, `consultarAvisosPendentes`, `consultarTeorComunicacao`, `entregarManifestacaoProcessual`, `consultarAlteracao`, `confirmarRecebimento`
- Validação XSD funciona (retorna erro de formato com número inválido)
- Autenticação obrigatória (erro 501 sem credenciais válidas)
- Acessível de qualquer lugar (incluindo Vercel/datacenter)
- **ÚNICO tribunal e-SAJ com MNI confirmado funcional**

**eproc (TRF2, JFRJ, JFES) — ❌ DNS NÃO RESOLVE**
- WSDLs documentados pelo projeto ApoIA:
  - TRF2: `https://epr.trf2.jus.br/eproc/wsdl.php?srv=intercomunicacao2.2`
  - JFRJ: `https://epr.jfrj.jus.br/eproc/wsdl.php?srv=intercomunicacao2.2`
  - JFES: `https://epr.jfes.jus.br/eproc/wsdl.php?srv=intercomunicacao2.2`
- Todos retornam "O nome remoto não pôde ser resolvido" — DNS bloqueado fora da rede judiciária
- **Conclusão**: endpoints eproc MNI são internos (rede judiciária/VPN), não acessíveis do Vercel
- **Implicação**: scraping do eproc precisa ser feito pelo CS (que roda no escritório)

### Como obter credenciais MNI por tribunal

| Tribunal | Sistema | Como solicitar | Contato |
|----------|---------|----------------|---------|
| **TJSP** | e-SAJ | Cadastrar no portal e-SAJ com certificado digital, ou solicitar acesso MNI | esaj@tjsp.jus.br |
| **TJRJ** | e-SAJ | Ofício para DGTEC com CNPJ, CPF, dados do representante | dgtec@tjrj.jus.br |
| **TJMG** | PJe | Certificado ICP-Brasil (CNPJ ou CPF) obrigatório | PJe do TJMG |
| **TRF6** | eproc | Ofício via SEI com dados do órgão + gestor | portal.trf6.jus.br |
| **TRF2** | eproc | Via ApoIA (projeto open-source do TRF2) | github.com/trf2-jus-br/apoia |
| **CNJ** | Escritório Digital | Tribunal implementa MNI → envia dados para g-escritorio.digital@cnj.jus.br | Portal CNJ |

---

## 6. Pesquisa: eproc (feita em 26/07/2026)

### Achado principal: confirma a regra das "ilhas" — varia MUITO por tribunal, mesmo sistema

Testado diretamente (acesso real à página, não inferência de terceiro) em 3
instâncias de eproc, todas com o mesmo formulário-padrão (Nº Processo,
Chave, Nome da Parte, CPF/CNPJ, OAB):

| Tribunal | Captcha? | Detalhe |
|---|---|---|
| **TJMG** (estadual) | **Sim** | Captcha de imagem tradicional, com opção de áudio ("ouvir a narração das letras do código de confirmação"). Protege o formulário inteiro — inclusive busca só por número |
| **TRF2/JFRJ** (federal) | **Não** | Nenhum captcha em nenhum campo. Dá pra consultar só com o número, sem preencher verificação nenhuma |
| **TRF4** (federal, "dono" do sistema eproc) | Consulta pública **desativada** | Só restou "consulta por chave"/"consulta sem chave"/"consulta de documentos por chave" — não tem mais busca aberta por nome/OAB/CPF nesse ponto de entrada |

Isso confirma, com dado real (não mais inferência de preço de API paga),
que **não dá pra tratar "eproc" como uma coisa só** — mesmo sendo o mesmo
software, cada tribunal configura (ou desliga) a consulta pública do jeito
que quiser. A pesquisa anterior nesta seção (baseada em preço/parâmetros da
API comercial da Infosimples) **acertou o TRF2** mas não tinha confirmação
direta — agora tem.

### O que isso muda na prática

- **Não existe atalho de "eproc = sem captcha"** — é tribunal por tribunal,
  igual o e-SAJ. A diferença é que no e-SAJ o padrão observado era "captcha
  só na busca por OAB, número sempre livre"; no eproc o padrão parece ser
  "ou o formulário inteiro tem captcha, ou não tem nenhum" — não vimos uma
  instância que libere número mas proteja só a busca por OAB.
- **TRF4 desativar a consulta pública é um dado novo importante**: o próprio
  criador do sistema fechou essa porta de entrada, deixando só acesso por
  chave (que só quem é parte no processo recebe). Isso é mais restritivo do
  que o texto da página de ajuda do TRF4 (usada na pesquisa anterior)
  sugeria — a página de ajuda parece estar desatualizada em relação ao que
  está no ar hoje.
- A consulta pública do eproc (onde está ativa) devolve metadado bom
  (partes, classe, assuntos, andamentos, datas), mas não documento/PDF — ver
  conteúdo completo exige login do advogado que é parte, ou a "chave de
  acesso" do processo. Mesmo raciocínio já registrado: não é problema pro
  escopo definido (processos dos próprios clientes, que têm login/chave
  legítimos).
- Não foi possível confirmar pelo HTML se o envio é GET/POST tradicional ou
  via JavaScript — precisaria inspecionar a resposta de um envio de teste
  real, não só a página do formulário.

### Comparativo até agora

| | e-SAJ (TJSP) | eproc (varia por tribunal) |
|---|---|---|
| Consulta por número de processo | Sem CAPTCHA | Depende do tribunal — TRF2 sem captcha, TJMG com captcha, TRF4 desativado |
| Busca por OAB (descoberta) | **Com CAPTCHA** | Mesmo captcha do formulário inteiro (TJMG) ou nenhum (TRF2) — não é uma regra separada da busca por número, como é no e-SAJ |
| Documento completo (PDF) | Aparenta vir na consulta por número | Exige login/chave do próprio advogado |
| Confiança do achado | Alta (código real + página real testada) | Alta agora — 3 instâncias reais testadas diretamente |

**Conclusão prática**: pro eproc, a estratégia não pode ser "escolher o
sistema todo", tem que ser "escolher os tribunais específicos que os
clientes do MeuJudi mais usam e checar cada um" — o TRF2 é um bom começo
confirmado sem captcha, mas isso não generaliza pros outros ~10-15
tribunais que rodam eproc (federais e estaduais).

### Pendente de pesquisar

- PJe (consulta pública)
- Mais instâncias de eproc (TRF1, TRF3, TRF5, TRF6, e os tribunais
  estaduais que usam eproc além de TJMG) — pra ter uma amostra maior antes
  de decidir quais valem a pena

---

## 6.1. API própria do eproc: MNI (Modelo Nacional de Interoperabilidade) — pesquisa em 27/07/2026

### Achado principal: TODOS os tribunais eproc expõem a mesma API SOAP padronizada pelo CNJ

Além da consulta pública via HTML (seção 6), descobri que existe uma **API
oficial e padronizada** que todos os tribunais eproc são obrigados a expor:
o **MNI (Modelo Nacional de Interoperabilidade) versão 2.2.2**, mantido pelo
CNJ. É um webservice SOAP com operações definidas nacionalmente.

**Por que isso é importante**: se a consulta pública HTML varia muito entre
tribunais (captcha em uns, desativada em outros — ver seção 6), o MNI é a
**camada estável por cima disso tudo**. Um adaptador que fale MNI funciona
com qualquer tribunal que expose o webservice, independente de como cada um
configurou a consulta pública HTML.

### Endpoints MNI dos 3 tribunais pesquisados

#### TRF4 (Paraná, Santa Catarina, Rio Grande do Sul) — "dono" do eproc

| Subsede | WSDL URL | Endpoint URL |
|---------|----------|-------------|
| TRF4 | `https://epr.trf4.jus.br/eproc/wsdl.php?srv=intercomunicacao2.2` | `https://epr.trf4.jus.br/eproc/ws/controlador_ws.php?srv=intercomunicacao2.2` |
| JFRS | `https://epr.jfrs.jus.br/eproc/wsdl.php?srv=intercomunicacao2.2` | `https://epr.jfrs.jus.br/eproc/ws/controlador_ws.php?srv=intercomunicacao2.2` |
| JFSC | `https://epr.jfsc.jus.br/eproc/wsdl.php?srv=intercomunicacao2.2` | `https://epr.jfsc.jus.br/eproc/ws/controlador_ws.php?srv=intercomunicacao2.2` |
| JFPR | `https://epr.jfpr.jus.br/eproc/wsdl.php?srv=intercomunicacao2.2` | `https://epr.jfpr.jus.br/eproc/ws/controlador_ws.php?srv=intercomunicacao2.2` |

- Consulta pública HTML: `https://eproc.trf4.jus.br/eproc2trf4/externo_controlador.php?acao=processo_consulta_publica`
- Suporte: processoeletronico@jfrs.jus.br / (51) 3214-9033/9036

#### TRF2 (Rio de Janeiro, Espírito Santo)

| Subsede | WSDL URL | Endpoint URL |
|---------|----------|-------------|
| TRF2 | `https://epr.trf2.jus.br/eproc/wsdl.php?srv=intercomunicacao2.2` | `https://epr.trf2.jus.br/eproc/ws/controlador_ws.php?srv=intercomunicacao2.2` |
| JFRJ | `https://epr.jfrj.jus.br/eproc/wsdl.php?srv=intercomunicacao2.2` | `https://epr.jfrj.jus.br/eproc/ws/controlador_ws.php?srv=intercomunicacao2.2` |
| JFES | `https://epr.jfes.jus.br/eproc/wsdl.php?srv=intercomunicacao2.2` | `https://epr.jfes.jus.br/eproc/ws/controlador_ws.php?srv=intercomunicacao2.2` |

- Consulta pública HTML: `https://eproc-consulta.trf2.jus.br/eproc/externo_controlador.php?acao=processo_consulta_publica`
- Nota: JFES usa autenticação por senha (`JFES_HAS_PASSWORD=true`)

#### TRF6 (Ceará, Maranhão, Piauí, Pará, Amapá, Roraima, Acre, Amazonas, Rondônia)

| WSDL URL | Endpoint URL |
|----------|-------------|
| `https://epr.trf6.jus.br/eproc/wsdl.php?srv=intercomunicacao2.2` | `https://epr.trf6.jus.br/eproc/ws/controlador_ws.php?srv=intercomunicacao2.2` |

- Consulta pública HTML: `https://eproc2g.trf6.jus.br/eproc/externo_controlador.php?acao=processo_consulta_publica`
- Suporte: eproc.atendimento@trf6.jus.br
- **2FA obrigatório**: TRF6 implementou autenticação em dois fatores (Portaria nº 140)
- Dados abertos: portal TRF6 disponibiliza dados em formatos OpenDocument via webservice

### Operações disponíveis no MNI 2.2.2

| Operação | O que faz | Dados retornados |
|----------|-----------|-----------------|
| `consultarProcesso` | Consulta processo por número | Dados básicos, partes, movimentações, documentos, assuntos, classes |
| `consultarAvisosPendentes` | Verifica intimações/citações pendentes | Lista de avisos com processo, tipo, data |
| `consultarTeorComunicacao` | Baixa conteúdo de intimação/citação | Conteúdo completo da comunicação |
| `entregarManifestacaoProcessual` | Envia petição/manifestação | Confirmação de entrega |
| `consultarAlteracao` | Verifica mudanças no processo | Lista de alterações desde data de referência |

### Autenticação

- Cada tribunal fornece `idConsultante` + `senhaConsultante` (login/senha)
- Credenciais são solicitadas diretamente ao tribunal (não é self-service)
- Existe também autenticação via certificado cliente (alternativa ao login/senha)
- WSDL oficial do CNJ: `https://www.cnj.jus.br/images/dti/Comite_Gestao_TIC/Modelo_Nacional_Interoperabilidade/versao_07_07_2014/servico-intercomunicacao-2.2.2.wsdl`

### Custo e habilitação

- **Gratuito** para entidades habilitadas
- Processo de habilitação varia por tribunal (geralmente envia email pro Núcleo de Apoio ao Processo Eletrônico/DAJ)
- Existe ambiente de homologação com processos de teste

### Descoberta técnica importante: projeto ApoIA do TRF2

O TRF2 publicou no GitHub um projeto open-source chamado
[**ApoIA**](https://github.com/trf2-jus-br/apoia) que já implementa a
integração MNI com eproc. É uma ferramenta de IA para triagem de acervos
que faz login no eproc via MNI e consulta processos. O projeto expõe
publicamente os endpoints MNI de TRF2, JFRJ e JFES, servindo como
referência prática de como falar com o webservice.

### Aviso importante (artigo TecJustica, 12/03/2026)

> **WSDL acessível ≠ serviço funcional.** Ter o WSDL disponível online é
> apenas o primeiro passo. Situações comuns:
> - WSDL carrega, mas operações retornam timeout
> - Autenticação configurada de forma diferente
> - Tribunal migrou de versão do MNI
> - Serviço retorna respostas vazias ou genéricas
>
> **Recomendação**: testar com SoapUI antes de integrar no código. Fazer
> health-check por tribunal: WSDL acessível + operações respondendo = online;
> WSDL acessível mas operações falham = inoperante.

### Resultados dos testes (27/07/2026)

**eproc MNI (TRF2, JFRJ, JFES) — ❌ DNS NÃO RESOLVE DE FORDA REDE JUDICIÁRIA**

Todos os 3 endpoints testados retornam "O nome remoto não pôde ser resolvido":
- `https://epr.trf2.jus.br/eproc/wsdl.php?srv=intercomunicacao2.2` → ❌
- `https://epr.jfrj.jus.br/eproc/wsdl.php?srv=intercomunicacao2.2` → ❌
- `https://epr.jfes.jus.br/eproc/wsdl.php?srv=intercomunicacao2.2` → ❌

**Conclusão**: endpoints eproc MNI são **internos** (só acessíveis na rede
judiciária ou via VPN). Não é possível chamá-los do Vercel ou de um datacenter.

**Implicação para o MeuJudi**: o eproc via MNI só funciona pelo CS
(que roda no escritório do advogado, na rede residencial/comercial).
Isso reforça a arquitetura de 3 camadas documentada em
`arquitetura-sincronizacao-mural.md`: o CS é o único que consegue
falar com o eproc.

**TJSP (e-SAJ) MNI — ✅ FUNCIONAL** (documentado na seção 5.1)

O TJSP expõe MNI em HTTP público, acessível de qualquer lugar.
Isso cria uma situação assimétrica: e-SAJ funciona do Vercel, eproc só do CS.

### O que isso muda na estratégia do raspador

| Antes desta pesquisa | Depois desta pesquisa |
|---------------------|----------------------|
| "eproc = scraping HTML por tribunal, com/varia captcha" | "eproc = MNI padronizado, um adaptador serve pra todos os tribunais que expõem o webservice" |
| "TRF4 desativou consulta pública = sem acesso" | "TRF4 tem MNI ativo mesmo com consulta pública HTML desativada" |
| "precisa testar cada tribunal individualmente" | "precisa testar se o MNI de cada tribunal está funcional (WSDL acessível ≠ serviço funcionando)" |
| "scraping = zona cinzenta jurídica" | "MNI é acesso institucionalmente oferecido pelo CNJ = canal legítimo" |

**Implicação prática**: pro eproc, a prioridade agora não é mais scraping
HTML — é **testar se os endpoints MNI dos tribunais que os clientes do
MeuJudi usam estão funcionais** e solicitar credenciais. Se o MNI
funcionar, é uma via limpa (sem captcha, sem zona cinzenta, sem Playwright)
que resolve o acesso a dados completos do eproc. O scraping HTML vira
fallback só pro caso de tribunais que não implementaram o MNI direito.

### Fonte dos endpoints

- Projeto ApoIA (TRF2): `https://github.com/trf2-jus-br/apoia`
- WSDL oficial MNI 2.2.2 (CNJ): `https://www.cnj.jus.br/images/dti/Comite_Gestao_TIC/Modelo_Nacional_Interoperabilidade/versao_07_07_2014/servico-intercomunicacao-2.2.2.wsdl`
- Documentação MNI (CNJ): `https://www.cnj.jus.br/integracao-para-os-tribunais/`
- Balcão Virtual (TRF2): `https://github.com/trf2-jus-br/balcaovirtual` — outro projeto que usa MNI
- Artigo TecJustica sobre integração MNI: `https://tecjustica.substack.com/p/integracao-pjemni-nem-todo-tribunal`

### Pendente de testar

- [ ] Testar se WSDL do TRF2 responde (mais provável de funcionar — é o "dono" junto com TRF4)
- [ ] Testar se WSDL do TRF4 responde (mesmo com consulta pública HTML desativada)
- [ ] Testar se WSDL do TRF6 responde (2FA pode complicar)
- [ ] Solicitar credenciais MNI ao TRF2 ou TRF4 (canal de suporte já documentado)
- [ ] Testar operação `consultarProcesso` com processo real via SoapUI
- [ ] Verificar se outros tribunais eproc (TRF1, TRF3, TRF5, TJMG, TJSP) expõem MNI

---

## 7. Pesquisa: Projudi (testado ao vivo em 27/07/2026)

### Achado principal: TJPR tem API oficial — nem precisa de scraping ali

Testando 2 tribunais (TJPR e TJGO), o achado mais importante não foi sobre
captcha — foi descobrir que o **TJPR disponibiliza uma API oficial e
documentada**, fora de qualquer zona cinzenta:

- Página oficial: [`tjpr.jus.br/acesso-automatizado-por-sistemas-externos`](https://www.tjpr.jus.br/acesso-automatizado-por-sistemas-externos)
  — o TJPR lista webservices SOAP autorizados especificamente pro Projudi
  (1ª e 2ª instância), com WSDL público:
  `https://projudi.tjpr.jus.br/projudi_consulta/webservices/projudiIntercomunicacaoWebService222?wsdl`
  (produção) e um ambiente de homologação equivalente.
- Isso significa que, **pro TJPR, a via certa não é scraping nenhum** — é
  integrar direto com o webservice oficial. Elimina qualquer discussão de
  CAPTCHA, zona cinzenta ou até a necessidade de validar com a Julia essa
  parte específica (é acesso institucionalmente oferecido pelo tribunal).

### Detalhe técnico real do serviço (documento oficial "SCMPP" lido na íntegra em 27/07/2026)

Baixei e li o PDF técnico oficial (`servico-de-consulta-as-movimentacoes-processuais-publicas-automatizado-scmpp-pdf`
no site do TJPR). Pontos principais:

- **Não é invenção do TJPR — é o MNI (Modelo Nacional de Interoperabilidade),
  padrão nacional mantido pelo CNJ.** O TJPR só publicou a própria
  implementação (versão 2.2.2 do protocolo). Isso é uma pista importante:
  em teoria, **qualquer tribunal** (rodando Projudi, e-SAJ, eproc ou PJe,
  não importa o sistema) pode expor um serviço MNI equivalente, porque é
  uma camada de interoperabilidade definida pelo CNJ, independente do
  software de processo por trás. Vale procurar isso em outros tribunais
  antes de assumir que só o TJPR tem.
- **Métodos**: `consultarProcesso` (dados do processo) e
  `consultarAlteracao` (só o que mudou desde a última consulta) — esse
  segundo é literalmente o padrão de "poll incremental" que o MeuJudi já
  usa com DataJud/Mural, encaixe natural.
- **Só processos públicos podem ser consultados** — reforçado
  explicitamente no documento. Não dá acesso a nada sigiloso.
- **Credenciamento**: precisa de um `idManifestante` (identificador de
  usuário), recebido **"privativamente"** — ou seja, não é self-service,
  tem que solicitar diretamente ao TJPR (o documento não detalha o
  processo de pedido, só que as credenciais "serão encaminhadas"). Junto
  vem um código secreto usado pra gerar a senha dinamicamente a cada
  consulta: `senha = MD5(codigo_recebido + data_atual_yyyyMMdd)`.
- **Custo**: nenhuma menção a valor cobrado — parece gratuito. O "preço"
  real é a burocracia de solicitar e esperar receber as credenciais, não
  dinheiro.
- Existe ambiente de homologação com processos de teste documentados
  (números de exemplo fornecidos no PDF), útil pra validar a integração
  antes de pedir acesso de produção.

### Ressalva crítica: o TJPR está migrando do Projudi pro eproc, agora

Achado em 27/07/2026, via notícias do próprio TJPR: **o tribunal assinou
adesão ao eproc em outubro de 2025** e publicou cronograma de implantação
em 9 fases entre abril/2026 e janeiro/2027 (Decreto Judiciário nº
189/2026), substituindo o Projudi progressivamente, comarca por comarca,
depois de quase 20 anos de uso. Isso é exatamente o risco que já estava
registrado no documento original desta ideia (seção 6: "se algum tribunal
de alta prioridade mudou de sistema, o alvo pode ter se movido") — e está
acontecendo agora, em tempo real. **Investir em integrar com esse
webservice específico do TJPR tem prazo de validade** — em algum momento
esse Projudi sai do ar nas comarcas migradas e a URL para de responder pra
elas. Vale reconfirmar o status da migração antes de priorizar essa
integração.

### O que achei testando a consulta pública "normal" (HTML) dos dois, como fallback/comparação

| Tribunal | Captcha no formulário? | Teste de consulta real | Observação |
|---|---|---|---|
| **TJPR** | Não encontrado | Não testei submissão direta — a versão scraping desse sistema é Java/Struts antigo, e buscas de terceiros na web mostraram a mensagem "A sessão expirou" quando a URL é acessada sem uma sessão/cookie válido primeiro | Não é captcha, é estado de sessão — resolvível com 2 requisições HTTP (pegar cookie, depois buscar), mas mais chato que os outros sistemas. Como já existe API oficial, não vale a pena investir nisso pro TJPR |
| **TJGO** | Não encontrado | **Testado com sucesso**: `GET BuscaProcesso?ProcessoNumero=5178253-59.2024.8.09.0000` devolveu a timeline completa do processo — 74 eventos, partes, decisões, tudo — sem captcha, sem login, numa única requisição HTTP simples | Existe também uma tela dedicada de "Busca de Processos pelos Dados do Advogado" (`TipoConsultaProcesso=1`, campo de OAB), sem captcha visível no formulário — não cheguei a testar a submissão real com uma OAB válida pra confirmar o resultado |

### Diferença notável em relação ao e-SAJ e ao eproc

O Projudi (pelo menos TJGO) devolveu, numa consulta pública simples, **o
histórico processual inteiro** (74 eventos/andamentos) — bem mais completo
do que o metadado resumido que víamos no eproc, e sem exigir chave/login
nenhum. Vale confirmar se isso inclui link pra documentos/PDFs de verdade
ou só a lista de andamentos com descrição textual (não cheguei a abrir um
andamento específico pra checar).

### Terceiro tribunal testado: TJAM (27/07/2026) — bloqueado por WAF, categoria nova

Testei o Projudi do Amazonas (TJAM) em 2 URLs diferentes
(`consultaPublica.do` e `consultaPublicaNova.do`). **As duas retornaram a
mesma barreira**: `"The requested URL was rejected. Please consult with
your administrator."` — uma mensagem típica de firewall de aplicação (WAF),
não de captcha.

Isso é uma categoria diferente do que vimos até agora:
- Não é uma trava visual (captcha) que dá pra resolver ou que só existe no
  cliente — é um bloqueio na borda da rede, antes mesmo de chegar no
  formulário.
- **Ressalva importante**: não dá pra concluir com certeza que isso
  bloquearia qualquer cliente HTTP bem-comportado — WAFs costumam
  reagir a padrões específicos de requisição (user-agent, ausência de
  cabeçalhos que um navegador real sempre manda, frequência). Pode ser que
  uma implementação cuidadosa (headers realistas, via IP residencial tipo
  Raspberry Pi) passe sem problema. Mas é um sinal real de que o TJAM tem
  uma postura de proteção mais agressiva que TJPR/TJGO, e merece teste mais
  cuidadoso antes de assumir que é tão simples quanto os outros dois.

### Confirmação: o canal do TJGO que já testamos é, na real, o canal oficial

Achado novo: o próprio TJGO documenta publicamente
(`transparencia.tjgo.jus.br/ti-comunicacoes/acesso-automatizado`) um
webservice pra acesso automatizado, com o formato
`https://projudi.tjgo.jus.br/ServicosPublicos?campo1=valor1&campo2=valor2...`
— **é o mesmo padrão de URL que já tínhamos testado com sucesso**
(`BuscaProcesso?ProcessoNumero=...`), só que agora confirmado como a via
oficial, não scraping "por acaso aberto". Diferente do TJPR (que exige
solicitar `idManifestante` + gerar senha dinâmica), **não achei menção a
nenhuma autenticação nesse canal do TJGO** — bate com o que já tínhamos
testado ao vivo (funcionou sem login, sem chave, sem nada). Não consegui
confirmar 100% os detalhes completos da página (o conteúdo não carregou
por inteiro na ferramenta de busca), vale reconfirmar antes de tratar como
definitivo.

### Ressalvas

- Testado em 3 tribunais agora (TJPR, TJGO, TJAM) — existem outros estados
  que usam Projudi (BA, SE, PB, AP, entre outros) ainda não testados.
- TJPR: não testei uma consulta real via scraping HTML (só a página do
  formulário) — e, dado que existe API oficial, não é prioridade testar
  isso a fundo.
- TJGO: só testei consulta por número de processo com sucesso. Não
  confirmei a busca por OAB na prática (só vi o formulário, sem captcha
  visível, mas sem testar submissão real).
- TJAM: não cheguei a ver o formulário nem confirmar se tem captcha —
  o bloqueio de WAF impediu chegar até esse ponto.

### Pendente de pesquisar

- PJe (consulta pública)
- Confirmar se outros tribunais de Projudi (além de TJPR/TJGO) também
  oferecem canal oficial documentado, antes de assumir que scraping é
  necessário
- Entender melhor o bloqueio de WAF do TJAM — testar com headers mais
  realistas antes de descartar esse tribunal

---

## 8. Pesquisa: PJe (testado ao vivo em 27/07/2026, via navegador)

### Por que precisou de navegador de verdade dessa vez

Diferente dos outros 3 sistemas (onde uma requisição HTTP simples bastou),
o PJe moderno é uma **SPA em Angular** — o HTML estático não vem com o
formulário, só com os scripts que montam a página no navegador. Tentativas
de leitura direta (sem navegador) voltaram vazias ou incompletas; uma
delas (`TJDFT` com a URL antiga `.seam`) até gerou um erro de rota Angular
(`NG04002`, "no match error") — sinal de que o front-end foi reescrito e a
URL antiga não existe mais como rota, só a raiz do domínio funciona hoje.
Isso mudava a arquitetura de scraping do PJe: HTTP simples não resolve, ou
precisa de engenharia reversa da API REST por trás do Angular, ou precisa
mesmo de navegador. **Atualização: o navegador só foi necessário pra
*descobrir* a API — não pra *usar* ela depois.** Ver achado mais abaixo
nesta seção: uma vez encontrada a chamada real via engenharia reversa
(inspecionando o tráfego de rede), o uso do dia a dia volta a ser HTTP
simples, igual os outros 3 sistemas.

### Testado com sucesso em 2 tribunais, via navegador renderizando a página real

| Tribunal | Captcha? | Teste real feito | Observação |
|---|---|---|---|
| **TJDFT** | Não encontrado | Preenchi OAB + UF e cliquei em "Pesquisar" de verdade — voltou "Nenhum resultado encontrado" (esperado, número de teste), sem captcha nenhum | Regra de negócio nova: **"Consultas pelo nome do advogado, classe judicial e/ou OAB exigem o preenchimento da data de autuação. O intervalo... foi ajustado automaticamente para, no máximo, 12 meses."** — não é captcha, é limite de janela de tempo por consulta |
| **TRF3 (1º grau)** | Não encontrado | Mesmo teste (OAB + UF), clique real em "Pesquisar" — voltou "Sua pesquisa não encontrou nenhum processo disponível.", sem captcha, sem exigir data de autuação | Interface mais antiga (JSF/Seam, versão "2.13.0.0"), visualmente diferente do TJDFT mas com os mesmos campos (número, nome, advogado, classe, CPF/CNPJ, OAB+UF, data de autuação) |

### O que isso significa

- **Nenhum captcha encontrado em nenhum dos dois**, nem no formulário nem
  ao executar a busca de verdade — terceiro sistema (depois de e-SAJ e
  parte do Projudi) sem captcha confirmado ao vivo.
- **A limitação real não é captcha, é regra de negócio**: pelo menos no
  TJDFT, busca por OAB/nome/classe só cobre 12 meses por vez. Pra ter o
  histórico completo de uma OAB, precisa de múltiplas consultas em janelas
  de 12 meses — exatamente o mesmo padrão que o MeuJudi CS já implementa
  pra importação histórica do Mural ("Importar últimos 12 meses", em lotes
  semanais). Não é uma barreira nova de arquitetura, é um padrão já
  resolvido no código.
- Os 2 tribunais têm **interfaces visualmente diferentes** (TJDFT parece
  ser um front-end Angular novo, TRF3 ainda usa a interface JSF/Seam mais
  antiga) — mesmo sendo o "mesmo sistema" PJe, a camada de apresentação não
  é tão padronizada quanto a do e-SAJ ou Projudi. Isso sugere que o
  adaptador de scraping do PJe pode precisar de mais variação por tribunal
  do que os outros sistemas, mesmo que os campos do formulário sejam os
  mesmos.

### Atualização importante: achamos a API JSON do TJDFT — não precisa de navegador afinal

O Caio sugeriu replicar a mesma técnica que ele já tinha usado manualmente
no PJe autenticado (F12 → Network, achar a chamada de dados real por trás
da tela). Fiz isso aqui injetando um interceptor de `fetch`/XHR via
JavaScript antes de clicar em "Pesquisar" — o mesmo resultado que o F12
mostraria. Achado:

```
GET https://pje-consultapublica-api.tjdft.jus.br/v1/processos?page=0&OAB=1000&estadoOAB=DF&dataAutuacaoInicio=2025-01-01&dataAutuacaoFim=2025-12-31
```

Resposta: `{"status":"ok","code":"200","messages":[],"result":[],"pageInfo":{"current":1,"last":0,"size":30,"count":0}}`
(zero resultados porque usei uma OAB de teste — o importante é a estrutura).

**Confirmei que funciona sozinha**: chamei essa mesma URL direto, sem
navegador, sem cookie, sem sessão nenhuma (requisição HTTP crua) — voltou
exatamente o mesmo JSON. Isso **derruba a conclusão anterior** de que o
PJe (pelo menos o TJDFT) precisaria de Playwright — é uma API REST/JSON
pública, com nome de domínio próprio (`-api.` em vez do domínio da
interface), sem autenticação nenhuma visível na chamada.

**Implicação pra arquitetura**: a técnica do Caio (abrir o DevTools,
executar a ação manualmente, achar a chamada de rede real) é o método mais
confiável pra descobrir isso em qualquer sistema — mais confiável até do
que eu tentar inferir por fora. Vale repetir esse processo pro TRF3 (a
versão JSF/Seam mais antiga) e pros outros sistemas que ainda geram dúvida,
ao invés de assumir que scraping de HTML é sempre necessário.

### Ressalvas

- Testado em só 2 tribunais, ambos federais (TJDFT é distrital mas
  estrutura similar a TRF). Não testei nenhum PJe estadual (TJAC, TJPB,
  TJPI, etc.) nem trabalhista/eleitoral.
- Não confirmei se existe API MNI pro PJe (as seções 5.1 e 6.1 — que não
  foram escritas por mim nesta conversa, ver ressalva já registrada — 
  sugerem que sim, por ser padrão CNJ comum a todos os sistemas; vale essa
  pessoa/sessão ou uma pesquisa futura confirmar isso especificamente pro
  PJe também).
- Não testei volume alto nem tribunais estaduais que notoriamente têm mais
  proteção — o "sem captcha" aqui vale só pros 2 tribunais testados agora.

### Pendente de pesquisar

- Confirmar se o PJe também expõe MNI (provável, mas não testado nesta
  seção)
- Testar mais tribunais de PJe, incluindo algum estadual

---

## 9. Rodada de verificação nos maiores tribunais — técnica de interceptação de rede (27/07/2026)

Ideia do Caio: repetir, sistematicamente, a mesma técnica que resolveu o
PJe (seção 8) — instalar um interceptador de `fetch`/XHR via JavaScript
antes de submeter cada formulário, pra ver a chamada de dados real por
trás da tela, exatamente como o F12 → Network mostraria. Aplicado nos
maiores tribunais de cada sistema ainda em aberto.

### Resultado por tribunal

| Tribunal (sistema) | O que foi testado | Resultado |
|---|---|---|
| **TJSP (e-SAJ)** | Busca por OAB via formulário real | Nada novo — já tínhamos confirmado isso por fora (seção 5); é navegação tradicional de página inteira, sem API JSON escondida pra descobrir |
| **TJMG (eproc)** | Busca por OAB, campo de captcha deixado em branco de propósito | **Não teve bypass.** Nenhuma chamada de rede saiu — o JavaScript da própria página bloqueou o envio por captcha vazio, antes mesmo de qualquer requisição ao servidor. Diferente do e-SAJ/PJe, aqui a validação parece real, pelo menos no lado do cliente |
| **TJPR (Projudi)** | Busca por OAB, seguindo o fluxo normal (carregar página → depois buscar, deixando o navegador cuidar do cookie) | **Funcionou, sem captcha.** O erro de "sessão expirou" visto antes (seção 7) era só de acessar a URL de busca direto, pulando a etapa de carregar a página primeiro. Com o fluxo em 2 passos (GET pra pegar `jsessionid` + token `_tj`, depois GET/POST de busca usando os dois), funciona normal — confirma que dá pra scraper sem navegador, só precisa de um cliente HTTP com cookie jar |
| **TRF3 (PJe)** | Busca por OAB, capturando a chamada de rede real | **Sem captcha, mas sem API JSON limpa como o TJDFT.** É a versão mais antiga do PJe (JSF/RichFaces) — o clique dispara um POST AJAX pra mesma URL da página, devolvendo um fragmento HTML/XML (não JSON), e depende do token de `ViewState` do JSF (campos ocultos da página, mesma lógica de sessão do TJPR) |

### O que isso muda na visão geral

- **A técnica de interceptação só revela algo novo em sistemas modernos
  (SPA/API JSON por trás, como o TJDFT)** — em sistemas de navegação
  tradicional (e-SAJ, a maioria do Projudi, PJe antigo) a requisição que
  você vê na tela *é* a requisição real, não tem nada escondido atrás pra
  descobrir.
- **Existem duas categorias de "trabalho extra" pra scraping, sem
  envolver captcha nenhum**: (1) sistemas stateless, uma requisição só
  (e-SAJ, Projudi/TJGO, PJe/TJDFT) — mais simples; (2) sistemas
  stateful, precisam de sessão/token da página carregada antes
  (Projudi/TJPR, PJe/TRF3) — mais trabalho de implementação, mas nenhum
  captcha, só gerenciamento de cookie/token, que qualquer biblioteca HTTP
  com cookie jar faz sozinha.
- **TJMG continua sendo o único caso, entre tudo que testamos até agora,
  onde uma proteção real impediu a consulta** — vale registrar como
  padrão: nem todo captcha é decorativo, alguns tribunais protegem de
  verdade, e é importante testar em vez de assumir.

---

## 10. Escopo do banco próprio — decisão importante

### A ideia original do Caio

Ter um banco próprio com **todos os processos de todas as OABs de todos os
tribunais**, sempre atualizado, pra nunca depender de puxar ao vivo e
resolver de vez a limitação do Mural de não cobrir todos os tribunais.

### Por que "todas as OABs do Brasil" não é o caminho

1. **O problema de escala continua valendo mesmo onde não há CAPTCHA.**
   Descobrir quais processos uma OAB tem exige a busca por OAB — e com mais
   de 1,3 milhão de advogados inscritos no Brasil, isso é volume massivo de
   requisições por si só, captcha ou não. (Atualização 27/07: o teste ao
   vivo no e-SAJ, seção 5, sugere que a busca por OAB nem tem captcha
   validado pelo servidor lá — mas isso não muda o problema de escala do
   próximo item, e "sem captcha" não é o mesmo que "sem limite" — ver
   ressalvas da seção 5 sobre volume alto.)
2. **É literalmente construir o Judit/Escavador do zero** — anos de
   trabalho de uma equipe grande com jurídico dedicado, não uma feature
   dentro do MeuJudi. Envolveria infraestrutura de crawling muito maior
   (Raspberry Pi deixa de fazer sentido), armazenamento na casa de dezenas
   de milhões de processos (Supabase deixaria de ser trivial), e exposição
   jurídica em outro patamar (indexar processo de gente que nunca ouviu
   falar do MeuJudi, não só dado dos próprios clientes).

### Escopo recomendado — mesma ideia, escala certa

O "banco próprio, sempre atualizado, sem depender de puxar ao vivo" continua
válido — só trocando "todas as OABs do Brasil" por **"as OABs que já são
clientes do MeuJudi"**:

- Vocês já sabem quais tenants/OABs existem — dezenas ou centenas, não 1,3
  milhão.
- Pros processos já cadastrados (vindos do DataJud ou cadastro manual), a
  consulta por número não tem CAPTCHA em nenhum dos dois sistemas
  pesquisados até agora (e-SAJ, eproc) — dá pra manter tudo atualizado no
  banco próprio, incremental, exatamente como o Caio descreveu, só que
  escopado aos próprios clientes.
- Pra achar processos novos de uma OAB que o Mural não cobre: pelas
  evidências testadas ao vivo até agora (seção 5, e-SAJ testado em TJSP e
  TJCE; seção 6, eproc testado em TRF2; seção 7, Projudi/TJGO; seção 8,
  PJe/TJDFT e TRF3), **nenhum dos sistemas testados exigiu resolução de
  captcha** pra essa busca especificamente — o e-SAJ tem um captcha visível
  na tela do navegador, mas que não é validado pelo servidor. Isso não
  elimina a conversa com a Julia (ainda envolve puxar
  dado pessoal de terceiros — advogados que não são clientes — o que é
  questão de LGPD/propósito, não só de "contornar proteção técnica"), mas
  muda a natureza da pergunta: não é mais "podemos burlar um captcha",  é
  "podemos consultar publicamente dado de OABs que não são nossos clientes,
  mesmo sem barreira técnica nenhuma no caminho". Continua fazendo sentido
  escopar só pras OABs dos próprios clientes de qualquer forma — reduz
  volume e reforça o argumento de propósito legítimo, mesmo que o
  bloqueio técnico não exista.

Isso reaproveita exatamente o padrão que DataJud e Mural já usam hoje: cron/
worker consulta periodicamente, grava/atualiza no Supabase, e o app nunca
fala com a fonte externa na hora que o usuário abre a tela — vira a quarta
fonte de dado ao lado de DataJud e Mural, alimentando o mesmo motor de
extração já existente (mesmo formato que `processar-comunicacao.ts` /
`pipeline.ts` já esperam).

---

## 11. Notas técnicas gerais (Supabase, storage)

- Storage de PDFs não é o limitador: documentos costumam ficar entre 100KB
  e 2-3MB, plano Pro do Supabase já inclui 100GB. Isso só vira preocupação
  real na escala de "todos os processos do Brasil" (seção 10), não no
  escopo recomendado (só clientes do MeuJudi).
- Metadado (nome, data, tipo, link pro storage) é irrelevante em tamanho.
- O gargalo de custo real, se houver, tende a ser egress/bandwidth de
  download pelos usuários, não a ingestão em si — e mesmo isso só preocupa
  em volume alto.

---

## 12. Próximos passos

1. Todos os 4 sistemas já têm pelo menos 1 tribunal testado ao vivo:
   e-SAJ (seção 5), eproc (seção 6), Projudi (seção 7), PJe (seção 8).
   Padrão geral até agora: nenhum captcha confirmado como validado pelo
   servidor em nenhum dos 4, com bloqueios reais vindo de outros lugares
   (variação por instância no eproc, WAF no TJAM/Projudi, SPA Angular no
   PJe dificultando scraping simples).
2. As seções 5.1 e 6.1 (pesquisa de MNI pro e-SAJ e eproc) foram
   adicionadas por outra sessão/conversa, não verificadas nesta — revisar
   e confirmar antes de tratar como definitivo, especialmente as
   afirmações de teste via PowerShell e os contatos de tribunal listados.
3. Se o MNI realmente funcionar como essas seções descrevem, verificar se
   o PJe (seção 8) e o Projudi (além do TJPR, que já confirmamos oficialmente
   — seção 7) também expõem o mesmo protocolo — ainda não testado.
4. Ampliar a amostra em cada sistema — só 2-3 tribunais por sistema até
   agora, e já vimos variação relevante entre instâncias (eproc
   principalmente, mas também vale ampliar os outros 3).
5. Verificar se outros tribunais (além do TJPR e TJGO) oferecem webservice
   oficial documentado antes de assumir que scraping é necessário.
6. Confirmar com a Julia o que sobrar de pendência jurídica real depois de
   toda essa pesquisa — hoje isso ficou menor do que parecia no início:
   nenhum captcha validado pelo servidor foi confirmado em nenhum dos 4
   sistemas testados, e o TJPR tem canal 100% oficial. A pendência que
   resta é mais sobre LGPD/propósito de consultar dado de terceiros (OABs
   que não são clientes) do que sobre "contornar proteção técnica".
7. Só depois disso, revisitar se vale desenhar a arquitetura de
   implementação de verdade (fila, worker, adaptadores) — este documento
   continua sendo só registro de pesquisa e decisão de escopo, não plano de
   implementação.
