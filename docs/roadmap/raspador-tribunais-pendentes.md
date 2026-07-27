# Raspador — Tribunais pendentes de validação

> **Status: RASCUNHO / PLANEJAMENTO — não pronto para implementar.**
> Lista de trabalho gerada em 27/07/2026 a partir da tabela real
> `tribunal_coverage` do Supabase do MeuJudi (criada em outra sessão,
> migrations `20260727000003/06/07`), cruzada com `processos` e
> `comunicacoes_mural` reais. Complementa `raspador-dados-publicos.md`
> (pesquisa técnica por sistema) e os documentos por sistema
> (`raspador-esaj.md`, e os que vierem depois).

---

## 1. Os 70 tribunais sem nenhuma evidência de uso real

Consultado direto no banco: tribunais com status `nao_testado` em **todas**
as linhas de `tribunal_coverage` **e** zero processos/comunicações de
cliente associados. Ou seja, nenhum cliente do MeuJudi tem processo nesses
tribunais hoje — precisam ser testados e validados antes de entrarem em
qualquer prioridade de implementação, mas sem urgência de cliente real por
trás.

⚠️ A coluna "sistema" desta tabela **não é confiável** — foi semeada de
forma genérica, não validada tribunal por tribunal. Já pegamos ela errada
2 vezes nesta pesquisa (TJMG marcado como `pje` quando é eproc; TJGO
marcado como `eproc` quando é Projudi). Tratar como palpite, não fato, até
testar.

### Estaduais (14)

TJAC, TJAL, TJAM, TJAP, TJBA, TJCE, TJPA, TJPE, TJPI, TJRN, TJRO, TJRR,
TJSE, TJTO

### Federais (4)

TRF1, TRF3 (já testado parcialmente — ver `raspador-dados-publicos.md`
seção 8, PJe sem API JSON confirmada), TRF5, TRF6

### Trabalhistas (19) — ver seção 2, já pesquisados nesta rodada

TRT1, TRT3, TRT4, TRT5, TRT6, TRT7, TRT8, TRT10, TRT11, TRT13, TRT14,
TRT17, TRT18, TRT19, TRT20, TRT21, TRT22, TRT23, TRT24

### Eleitorais (27) — baixa prioridade

TRE-AC, TRE-AL, TRE-AM, TRE-AP, TRE-BA, TRE-CE, TRE-DF, TRE-ES, TRE-GO,
TRE-MA, TRE-MG, TRE-MS, TRE-MT, TRE-PA, TRE-PB, TRE-PE, TRE-PI, TRE-PR,
TRE-RJ, TRE-RN, TRE-RO, TRE-RR, TRE-RS, TRE-SC, TRE-SE, TRE-SP, TRE-TO

Segmento de nicho pra um SaaS de advocacia geral — sem sinal de demanda,
não vale testar agora.

### Militares estaduais (3) — baixa prioridade

TJM-MG, TJM-RS, TJM-SP

### Superiores (3) — baixa prioridade

STF, STM, TSE

---

## 2. Trabalhistas (TRTs) — sistema identificado

Pesquisa + 1 teste ao vivo em 27/07/2026. **Achado principal: Justiça do
Trabalho é nacionalmente padronizada em PJe desde 2010** — acordo entre
CNJ, TST e CSJT trouxe o TST e os 24 TRTs pro PJe ao mesmo tempo, ao
contrário da Justiça Estadual (que ainda tem e-SAJ/eproc/Projudi/PJe
convivendo). Isso muda a expectativa: aqui não deveria haver a mesma
fragmentação de sistema que vimos nos outros segmentos.

### Testado ao vivo: TRT4 (Rio Grande do Sul)

- URL: `https://pje.trt4.jus.br/consultaprocessual/`
- **Sistema confirmado: PJe**, versão "Consulta Processual Unificada 2.5"
  (nome do manual oficial, ligado pelo CSJT — sugere front-end/back-end
  **compartilhado entre todos os TRTs**, não uma implementação própria de
  cada um, diferente do que vimos nos outros sistemas).
- **Nenhum captcha** encontrado no formulário (só campo de número do
  processo).
- Confirmei via rede que existe um namespace de API dedicado:
  `pje.trt4.jus.br/pje-consulta-api/api/...` — mesmo padrão do que
  achamos no TJDFT (API JSON por trás de uma SPA Angular), reforça que
  não deveria precisar de Playwright pra uso do dia a dia, só pra
  descobrir a chamada exata (mesma técnica já validada).
- **Não cheguei a capturar a chamada de busca em si** — cliquei em
  "Pesquisar" com um número de teste e não veio resposta capturada (o
  formulário pode ter alguma validação de máscara que rejeitou o valor
  usado, ou a navegação não é via fetch/XHR). Fica pendente confirmar a
  chamada de busca de verdade, só a de propriedades/config foi capturada.

### Teste com processo real: TRT9, tentativa em 27/07/2026 — parcial, não concluído

A pedido do Caio, peguei um número de processo **real** de cliente do
MeuJudi direto do banco (`0001769-92.2025.5.09.0001`, tenant real, tribunal
TRT9) pra tentar extrair o dado de verdade, não um número de teste.

- Confirmado: mesmo sistema do TRT4 (PJe, "Consulta Processual Unificada
  2.5"), mesma API dedicada (`pje.trt9.jus.br/pje-consulta-api/api/...`).
- Achei também o link "PJe 1° Grau" (`pje.trt9.jus.br/primeirograu`) —
  **não é consulta pública, é a tela de login** do PJe. Caminho errado,
  não usar.
- **Não consegui completar a busca.** Tentei preencher o campo "Número
  do processo" de duas formas (preenchimento direto e digitação
  simulada, tecla por tecla) e clicar em "Pesquisar" — nas duas vezes a
  tela voltou pro estado inicial vazio, sem nenhuma chamada de rede nova
  capturada. O campo parece ser um input com máscara em Angular que não
  reagiu do jeito esperado à automação usada.
- **Causa raiz encontrada (27/07/2026, verificação final)**: inspecionei
  o HTML real do campo — ele usa uma diretiva Angular customizada de
  máscara (`pjemask="9999999-99.9999.9.99.9999"`). Tentei 4 técnicas
  diferentes (preencher direto, digitar tecla por tecla, setar o valor
  nativo do input + disparar eventos `input`/`change`/`blur`, e clicar no
  botão via JavaScript) — em todas, o valor aparece corretamente no HTML,
  mas a classe do campo continua `ng-untouched ng-pristine`, ou seja, **o
  formulário reativo do Angular nunca reconhece que o campo foi
  preenchido**, mesmo com o valor visível no DOM. É a diretiva de máscara
  customizada que não reage a nenhuma dessas formas de simulação — precisa
  de uma sequência de eventos de teclado bem específica que essa sessão
  não conseguiu reproduzir.
- **Isso não significa que o TRT9/TRT4 tenha alguma proteção real** — é uma
  limitação da ferramenta de automação usada nesta sessão com esse campo
  específico, não uma barreira do tribunal. A mesma técnica manual que o
  Caio já usou antes (abrir o F12 de verdade, digitar manualmente) tem
  boa chance de funcionar onde a automação não conseguiu — vale ele
  tentar isso pessoalmente pra fechar esse caso, já que é o tribunal
  trabalhista de maior volume real de cliente.

### Tribunais já com evidência real de cliente (não fazem parte da lista dos 70)

Do levantamento anterior no Supabase — já sabemos que são usados por
clientes reais, mas ainda não testamos tecnicamente:

| TRT | Processos de cliente | Comunicações Mural |
|---|---|---|
| TRT9 | 131 | 959 |
| TRT2 | 4 | 45 |
| TRT12 | 2 | 11 |
| TRT15 | 4 | 16 |
| TRT16 | 1 | 4 |

**TRT9 é a maior prioridade de todo o segmento trabalhista** (131
processos, 959 comunicações — mais que qualquer estadual/federal
individual, exceto TJPR). Ainda não testado tecnicamente apesar do
volume alto.

### Todos os 24 TRTs, com sistema inferido pelo padrão nacional

| TRT | Sistema | Confiança |
|---|---|---|
| TRT1 (RJ) | PJe | Alta (padrão nacional) |
| TRT2 (SP) | PJe | Alta (padrão nacional + evidência de cliente) |
| TRT3 (MG) | PJe | Alta (padrão nacional) |
| **TRT4 (RS)** | **PJe** | **Confirmado ao vivo** |
| TRT5 (BA) | PJe | Alta (padrão nacional) |
| TRT6 (PE) | PJe | Alta (padrão nacional) |
| TRT7 (CE) | PJe | Alta (padrão nacional) |
| TRT8 (PA/AP) | PJe | Alta (padrão nacional) |
| TRT9 (PR) | PJe | Alta (padrão nacional + maior evidência de cliente do segmento) |
| TRT10 (DF/TO) | PJe | Alta (padrão nacional) |
| TRT11 (AM/RR) | PJe | Alta (padrão nacional) |
| TRT12 (SC) | PJe | Alta (padrão nacional + evidência de cliente) |
| TRT13 (PB) | PJe | Alta (padrão nacional) |
| TRT14 (RO/AC) | PJe | Alta (padrão nacional) |
| TRT15 (Campinas/SP) | PJe | Alta (padrão nacional + evidência de cliente) |
| TRT16 (MA) | PJe | Alta (padrão nacional + evidência de cliente) |
| TRT17 (ES) | PJe | Alta (padrão nacional) |
| TRT18 (GO) | PJe | Alta (padrão nacional) |
| TRT19 (AL) | PJe | Alta (padrão nacional) |
| TRT20 (SE) | PJe | Alta (padrão nacional) |
| TRT21 (RN) | PJe | Alta (padrão nacional) |
| TRT22 (PI) | PJe | Alta (padrão nacional) |
| TRT23 (MT) | PJe | Alta (padrão nacional) |
| TRT24 (MS) | PJe | Alta (padrão nacional) |

**Ressalva**: "alta confiança" aqui é baseada no acordo nacional de 2010 +
1 tribunal confirmado ao vivo (TRT4) com sistema unificado — não é o
mesmo nível de certeza que temos pro e-SAJ (3 tribunais testados
individualmente). Antes de implementar de verdade, vale pelo menos
confirmar TRT9 (maior uso real) e mais 1-2 tribunais grandes ao vivo,
igual fizemos nos outros sistemas.

### Achado novo (27/07/2026): a consulta pública do PJe-JT não tem busca por OAB

Testado em TRT4 e TRT9, nas duas telas públicas disponíveis ("Consulta
de processos" e "Consulta Cidadão"): **o único campo de busca é "Número
do processo"**. Não existe campo de OAB, nome ou CPF em nenhuma das duas
— diferente do PJe da Justiça Comum (TJDFT/TRF3), que tem formulário
completo com OAB.

**Implicação prática**: a tarefa "descobrir processo novo por OAB"
(seção 7 do `raspador-arquitetura-geral.md`) **não é viável pro
segmento trabalhista via consulta pública** — só dá pra fazer
"atualizar processo já conhecido" (por número). Como é a mesma
plataforma nacional compartilhada nos dois tribunais testados, essa
conclusão vale por generalização pros outros 22 TRTs — não é necessário
testar um por um só pra confirmar a ausência do mesmo campo.

---

## 3. Teste de busca por OAB nos 70 tribunais sem evidência

Objetivo: usar uma OAB real de cliente do MeuJudi (`67553/PR`, única
cadastrada no sistema hoje) pra testar se a busca funciona nos tribunais
que ainda não têm nenhum processo registrado. **Ressalva importante**:
como essa OAB é registrada no PR, é esperado que a maioria dos tribunais
fora do PR devolva "sem resultado" mesmo com a busca funcionando
perfeitamente (registro de OAB é por estado) — o teste aqui valida se
**o mecanismo de busca funciona**, não necessariamente se acha processo
novo.

| Tribunal | Sistema | Resultado | O que isso confirma |
|---|---|---|---|
| **TJCE** | e-SAJ | `"Não existem informações disponíveis para os parâmetros informados"` — sem captcha, sem erro | Busca por OAB funciona normalmente no TJCE; ausência de resultado é esperada (OAB é do PR) |
| **TJBA** | e-SAJ (não confirmado) | Erro de conexão: `SSL routines:OPENSSL_internal:UNSUPPORTED_PROTOCOL` | **O e-SAJ do TJBA está tecnicamente fora do ar/inacessível via HTTPS moderno** — bate com o aviso da Softplan de que o TJBA não é cliente ativo há anos. Tribunal a excluir da lista de candidatos até confirmar se existe alternativa |
| TRT4, TRT9 (trabalhista) | PJe-JT | Sem campo de OAB disponível (ver seção 3 acima) | Busca por OAB não é aplicável a este segmento via consulta pública |
| **TJAC** | e-SAJ | `"Não existem informações disponíveis para os parâmetros informados"` — sem captcha, sem erro | Busca por OAB funciona normalmente no TJAC |
| **TJAM** | e-SAJ | `"Não existem informações disponíveis para os parâmetros informados"` — sem captcha, sem erro (na segunda tentativa) | Busca funciona; **domínio real é `consultasaj.tjam.jus.br`**, diferente do padrão `esaj.tjam.jus.br` (que deu 404) — mais um caso de domínio fora do padrão, igual o TJAL (`www2.tjal.jus.br`) |

### Achado à parte: TJAP não é nenhum dos 4 sistemas mapeados

O TJAP usa um **quinto sistema, o Tucujuris**, próprio dele — não é
e-SAJ, eproc, Projudi nem PJe. Fora do escopo desta pesquisa até agora;
se algum cliente aparecer com processo lá, precisa de um 5º adaptador,
não mapeado em nenhum documento ainda.

### Mais estaduais testados (27/07/2026) — TJPA/TJPE/TJPI não são e-SAJ

Tentativa no padrão `esaj.tj{uf}.jus.br` pros restantes da lista:

| Tribunal | Resultado | Interpretação |
|---|---|---|
| **TJPA** | DNS não resolve (`ENOTFOUND`) | Não é e-SAJ nesse domínio — bate com o catálogo (marcado `pje`) |
| **TJPE** | DNS não resolve (`ENOTFOUND`) | Idem — provável PJe |
| **TJPI** | DNS não resolve (`ENOTFOUND`) | Idem — provável PJe |
| **TJRN** | HTTP 403 → investigado ao vivo, ver abaixo | **Resolvido**: e-SAJ foi oficialmente desligado |
| **TJRO** | DNS não resolve (`ENOTFOUND`) | Não é e-SAJ — provável PJe |
| **TJRR** | DNS não resolve (`ENOTFOUND`) | Idem |
| **TJSE** | DNS não resolve (`ENOTFOUND`) | Idem |
| **TJTO** | DNS não resolve (`ENOTFOUND`) | Idem |

### TJRN — resolvido: e-SAJ foi desligado oficialmente

Abri a página real (`esaj.tjrn.jus.br/cpopg/open.do`) no navegador — ela
redireciona pra um aviso oficial do TJRN:

> **"O SAJ, Sistema de Automação do Judiciário, foi desligado."**
> "Caso a informação desejada não esteja disponível [nos links de
> arquivo histórico], a partir de 5 de junho, o usuário externo poderá
> buscá-la [...] acessar o sistema PJe e procurar pelo seu processo."

Não é WAF, não é bloqueio técnico — é decisão do próprio tribunal. O
sistema vivo do TJRN hoje é **PJe** (a página lista "Consulta pública
PJe 1º Grau/2º Grau" com destaque). Também lista "Projudi" no menu,
então TJRN pode ter mais de um sistema ativo simultaneamente — não
investigado a fundo.

**Com isso, a lista de estaduais em e-SAJ fecha em 5 confirmados**: TJSP,
TJCE, TJAL, TJAC, TJAM. Todos os outros testados (TJPA, TJPE, TJPI, TJRN,
TJRO, TJRR, TJSE, TJTO, + TJBA fora do ar) não são e-SAJ hoje.

### Federais testados (27/07/2026) — achado corrigido sobre o TRF5

| Tribunal | Campo de OAB? | Proteção? | Observação |
|---|---|---|---|
| **TRF1** | Sim | Nenhuma visível | Mesmo padrão do TRF3/TRF6 — formulário tradicional, sem captcha |
| **TRF5** | Sim (visto por fora) | **Bloqueio de borda, tipo Cloudflare/WAF** | Testado ao vivo no navegador: a página real não chega a mostrar o formulário do PJe — mostra uma interstitial genérica *"This question is for testing whether you are a human visitor and to prevent automated spam submission"*, com "Support ID". **Correção do achado anterior**: isso não é o captcha do formulário do PJe (como pensei antes, baseado só em descrição por fora) — é proteção de infraestrutura, mesma categoria do bloqueio do TJAM no Projudi. Mais sério que os captchas "decorativos" que vimos no e-SAJ |
| **TRF6** | Sim | Nenhuma visível | Mesmo padrão do TRF1/TRF3 |

**TRF5 vira o segundo caso confirmado (depois do TJAM) de bloqueio de
infraestrutura antes mesmo do formulário** — categoria diferente e mais
séria que captcha de formulário.

### Verificação final (27/07/2026): TRF5 confirmado com proteção real, não é só falta de header

Testei de novo, dessa vez via requisição HTTP com header de `User-Agent`
de navegador real (Chrome 126) + `Accept`/`Accept-Language` de navegador —
igual um cliente HTTP bem-comportado faria. **Resultado: continua
bloqueado**, e agora dá pra ver exatamente por quê — a resposta (HTTP 200,
mas com conteúdo de desafio) contém `window["loaderConfig"] = "/TSPD/..."`
e um script com nome de variável ofuscado. **`TSPD` é a assinatura do F5
Distributed Cloud / BIG-IP (antigo Shape Security)** — um produto de
proteção anti-bot corporativo de verdade, que exige executar JavaScript
pra calcular um token antes de liberar o conteúdo real. **Não é resolvível
só com headers** — precisaria de um navegador de verdade rodando o
desafio, e mesmo assim não há garantia (esses produtos são desenhados
justamente pra detectar automação). Diferente do TJAM (que pode ser só
filtro de user-agent), aqui é proteção de nível mais alto — tratar o TRF5
como candidato a ficar de fora do escopo inicial, junto com o TJMG.

### Verificação final: TJRN não tem mais nem Projudi nem e-SAJ

Confirmado por busca: o Projudi do TJRN também foi **desativado, em
julho de 2022**, na mesma migração que desligou o e-SAJ — o tribunal
consolidou tudo em PJe. URL real da consulta pública:
`pje1gconsulta.tjrn.jus.br/consultapublica/ConsultaPublica/listView.seam`
(ainda não testada ao vivo).

### Verificação final: por que não conseguimos capturar a busca do TRT4/TRT9

Root cause encontrada (ver seção 2 acima, dentro do teste do TRT9) — é
uma diretiva de máscara customizada do Angular (`pjemask`) que não
reconhece nenhuma das 4 formas de simulação de input tentadas nesta
sessão. Não é bloqueio do tribunal, é limitação da automação disponível
aqui — fica como o item que mais se beneficiaria da técnica manual do
Caio (F12, digitar de verdade).

---

## 5. Fechamento dos últimos estaduais "prováveis PJe" (27/07/2026)

Testado os que só tinham sido descartados do e-SAJ (DNS não resolveu),
agora confirmando o PJe deles de verdade:

| Tribunal | Resultado |
|---|---|
| **TJPE** | PJe funciona — `pje.cloud.tjpe.jus.br/1g/ConsultaPublica/listView.seam`, campo de OAB, sem captcha |
| **TJRO** | PJe funciona — `pjepg-consulta.tjro.jus.br/consulta/ConsultaPublica/listView.seam`, campo de OAB, sem captcha (o 403 visto antes era específico do WebFetch; via navegador passou normal) |
| **TJRR** | PJe funciona, tem campo de OAB, **mas tem captcha visível** — `pje.tjrr.jus.br/pje/ConsultaPublica/listView.seam`, formulário antigo com Ajax4jsf (a4j), mesma estrutura do TJMG. **Não testado ainda se o captcha é validado pelo servidor** (precisa do mesmo teste "deixar em branco" que fizemos no TJMG) |
| **TJPI** | Redireciona pra `portaldeservicos.pdpj.jus.br/consulta` — não é mais uma instância própria de PJe, foi pra uma plataforma nacional (ver seção 6) |
| **TJPA, TJSE, TJTO** | Confirmado que existem em PJe (URLs institucionais encontradas), mas não fechei a URL exata de consulta pública nem testei o conteúdo |

### TJBA — problema resolvido

O e-SAJ do TJBA tinha SSL quebrado (seção 4). Achei que o TJBA **também
tem PJe** — `consultapublicapje.tjba.jus.br/pje/ConsultaPublica/listView.seam`
— testado e **funciona normal**, com campo de OAB, sem captcha. **Não
precisa insistir no e-SAJ quebrado — usa o PJe do TJBA.**

## 6. Ideias de solução pros casos travados

| Problema | Tribunal | Ideias registradas |
|---|---|---|
| Captcha real, bloqueia envio no cliente | TJMG (eproc) | (1) Checar se existe canal oficial tipo MNI/webservice, como no TJPR; (2) serviço de resolução de captcha — depende da conversa com a Julia; (3) aceitar fora do escopo por agora |
| WAF / bloqueio de borda | TJAM (Projudi) | (1) **Testar via IP residencial** (Raspberry Pi) — mesma lógica que resolveu o Mural, WAF costuma liberar tráfego "de gente comum" e bloquear datacenter — ainda não testado; (2) tentar com headers de navegador mais realistas — ainda não testado nesse caso específico |
| Proteção corporativa (F5 TSPD) | TRF5 (PJe) | Caso mais difícil — produto desenhado pra pegar automação mesmo em navegador real. (1) Checar MNI alternativo; (2) aceitar fora do escopo, revisitar só se aparecer cliente |
| SSL quebrado / sistema fora do ar | TJBA (e-SAJ) | **Resolvido** — usar o PJe do TJBA (funciona) em vez do e-SAJ (quebrado) |
| Limitação da automação desta sessão (não é bloqueio do tribunal) | TRT4, TRT9 (PJe-JT) | Uma implementação de produção (Playwright de verdade) tende a resolver sem problema — ou teste manual do Caio pra confirmar rápido |
| Captcha visível, ainda não sabemos se real | TJRR (PJe) | Repetir o teste que fizemos no TJMG (campo em branco, ver se a requisição sai) |

---

## 7. Próximos passos

1. Testar TRT9 ao vivo (maior volume real do segmento trabalhista) —
   confirmar captcha/API/captura da chamada de busca de verdade.
2. Completar a captura da chamada de busca no TRT4 (só pegamos a de
   propriedades/config, não a de pesquisa em si).
3. Decidir se os 70 tribunais sem evidência entram em alguma rodada de
   teste, ou ficam arquivados até aparecer demanda real de cliente —
   recomendação: deixar eleitoral/militar/superior de fora por completo,
   focar estaduais/federais restantes só se algum cliente pedir.
4. Atualizar a tabela `tribunal_coverage` no Supabase com os resultados
   conforme forem sendo confirmados (campo `status`, `meujudi_validado`,
   `evidencia`) — mantém o banco como fonte de verdade operacional, este
   documento como registro de raciocínio.
