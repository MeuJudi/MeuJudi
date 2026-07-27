# Raspador de dados públicos — arquitetura geral

> **Status: RASCUNHO / PLANEJAMENTO — não pronto para implementar.**
> Este documento descreve a arquitetura geral acordada entre Caio e Claude
> (27/07/2026), depois da pesquisa registrada em
> `raspador-dados-publicos.md` (que continua sendo a fonte de verdade dos
> achados técnicos por sistema/tribunal — captcha, formato de dado, se
> precisa de sessão, etc.). Este documento não repete a pesquisa, só
> organiza as decisões de arquitetura em cima dela.
>
> **Próximo passo combinado**: depois deste documento geral, criar um
> documento por sistema (e-SAJ, eproc, Projudi, PJe), cada um discutido
> antes de escrito — este documento é a base que todos eles vão seguir.

---

## 1. O problema, resumido

DataJud e Mural cobrem bem metadado processual, mas não trazem documento
completo, e o Mural não cobre todos os tribunais. A ideia é ter um
**banco próprio, sempre atualizado**, alimentado por raspagem das
consultas públicas dos 4 sistemas processuais brasileiros (e-SAJ, eproc,
Projudi, PJe) — escopado aos processos e OABs que já são clientes do
MeuJudi, não o Brasil inteiro (decisão já registrada em
`raspador-dados-publicos.md`, seção "Escopo do banco próprio").

A pesquisa técnica (mesmo documento) já mapeou, com testes ao vivo, como
cada sistema se comporta — captcha real só confirmado em 1 tribunal
(TJMG) de todos os testados; na maioria, a barreira não é captcha, é
gerenciamento de sessão/cookie ou variação de configuração por tribunal.

## 2. Onde isso roda: dentro do MeuJudi CS, não num worker central

Decisão importante que muda o desenho original: em vez de um worker
externo centralizado (ex: um Raspberry Pi do Caio raspando por todo
mundo), **a raspagem roda distribuída, dentro do próprio MeuJudi CS de
cada escritório**.

### Por que

- O CS já resolve o motivo original de precisar de um worker fora da
  Vercel: roda numa rede residencial/comercial, não datacenter — mesma
  razão que fez o CS existir pro Mural.
- Cada CS já sabe, pelo pareamento, quais OABs/processos são do próprio
  escritório — a raspagem fica **automaticamente escopada por tenant**,
  sem precisar de lógica extra de isolamento.
- Tráfego de raspagem fica **distribuído em muitas redes diferentes**, com
  volume baixo cada uma (só os processos daquele escritório) — perfil bem
  mais parecido com uso humano normal do que um único IP central gerando
  volume alto continuamente, o que reduz o risco de qualquer tribunal
  notar e reagir com bloqueio novo.
- Reaproveita infraestrutura que o CS já tem: fila de tarefas, scheduler,
  pareamento/autenticação com o Web — mesmo desenho de
  `arquitetura-sincronizacao-mural.md` (Heartbeat, Task Queue, Scheduler),
  só com mais um tipo de tarefa.

### O trade-off, e por que ele já é aceitável

A raspagem só acontece com o CS daquele escritório ligado. Isso não é um
risco novo — é **a mesma dependência que o Mural já tem hoje**, que o
MeuJudi já aceita como trade-off de produto.

### Fallback: tenants sem CS pareado

Quem não tem CS pareado (não usa Cert A1, por exemplo) não tem quem
raspe por ele. Pra esses casos, um worker central (Raspberry Pi do Caio,
ou outro) serve de **fallback**, não de arquitetura principal. Ele reusa
o mesmo desenho descrito abaixo, só rodando fora de um escritório
específico.

## 3. Como a extração roda: em background, sem tela nenhuma

Diferente do login de Cert A1 ou da validação de OAB via ConfirmADV (que
abrem uma janela porque precisam de um humano resolvendo algo), a
raspagem **não abre nenhuma janela**. Em nenhum tribunal testado (fora o
TJMG, que fica de fora do escopo) foi necessária interação humana — é só
chamada HTTP, às vezes em 2 passos (sessão → busca), nunca um clique.
O advogado não percebe que está acontecendo, igual o `MuralSync` de hoje.

## 4. A fila de trabalho

Uma tabela nova no Supabase (ex: `raspagem_fila`), populada por um cron
no Web (mesmo padrão do `solicitar-mural`), com uma linha por "coisa a
verificar":

| Campo | Uso |
|---|---|
| `tenant_id` | de qual escritório é essa tarefa — o CS daquele tenant é quem processa |
| `tipo` | `atualizar_processo` (processo já conhecido) ou `descobrir_oab` (achar processo novo de uma OAB) |
| `sistema` | e-SAJ / eproc / Projudi / PJe |
| `tribunal` | qual instância específica |
| `identificador` | número do processo, ou OAB+UF |
| `status` | pendente / processando / concluído / erro |
| `proxima_tentativa` | controla a cadência (não fica tentando toda hora) |

O CS de cada tenant consulta essa fila **filtrada pelo próprio
`tenant_id`** (mesmo padrão que `cs_mural_requests` já usa), pega uma
tarefa por vez, processa, e posta o resultado de volta.

## 5. Os adaptadores: 4 sistemas, configuração por tribunal

Não são 90 tribunais, são **4 sistemas**. Um adaptador por sistema, cada
um sabendo "como pedir um processo/OAB" e "como devolver isso no formato
padrão". O que muda de tribunal pra tribunal dentro do mesmo sistema é
**configuração, não lógica nova**:

- **Domínio** daquela instância específica.
- **Tipo de fluxo**: sem-estado (1 requisição — a maioria: e-SAJ, a
  maior parte do Projudi, PJe/TJDFT) ou com-estado (2 passos, sessão —
  Projudi/TJPR, PJe/TRF3). Um cliente HTTP com "cookie jar" cobre os dois
  casos com o mesmo código.
- **Nomes de campo específicos** daquele tribunal (formulário/parâmetros).

Adicionar um tribunal novo normalmente é **adicionar uma linha de
configuração**, não escrever adaptador novo — a menos que o tribunal
tenha algo fora do padrão (captcha real como o TJMG, WAF como o TJAM),
aí vira exceção documentada, tratada à parte ou simplesmente deixada de
fora da lista suportada.

## 6. Normalização: tudo vira a mesma entrada do motor de extração

Cada adaptador, depois de buscar, traduz o resultado pro **mesmo formato
que `processar-comunicacao.ts` e o `pipeline.ts` já esperam** — partes,
classe, andamentos, datas. A partir daí é o motor de extração que já
existe (regex, camadas de IA, agenda) que assume, sem saber se a origem
foi Mural, DataJud ou o raspador. **O raspador não é um sistema paralelo,
é mais uma entrada pro cano que já existe.**

## 7. Duas tarefas, prioridade diferente

- **Atualizar processo conhecido** (já veio do DataJud/cadastro manual) —
  roda pra todos os sistemas, sem exceção conhecida até agora. Compara com
  o que já está salvo, grava só o que mudou (dedupe, mesma lógica de
  `agenda_eventos`).
- **Descobrir processo novo de uma OAB** — só pras OABs que já são
  clientes do MeuJudi (escopo já decidido). Roda nos sistemas sem
  barreira real confirmada (e-SAJ, Projudi, PJe); fica de fora nos que
  têm barreira real (TJMG) até decisão com a Julia. Onde há limite de
  janela de tempo por consulta (ex: PJe/TJDFT, 12 meses), o histórico
  completo é buscado em lotes de janelas sucessivas — mesmo padrão que o
  CS já usa hoje pro backfill histórico do Mural.

## 8. Cadência e bom senso de volume

Segue o padrão do `MuralSync`: um `setInterval` checando a fila de tempos
em tempos, processando um item por vez, com intervalo educado entre
requisições ao mesmo tribunal — mesmo sem captcha, evita parecer tráfego
de bot em rajada.

## 9. Erros e retentativas

Tribunal fora do ar, timeout, formato mudou → tarefa volta pra fila com
status de erro, tenta de novo mais tarde. Só nos casos de bloqueio
confirmado e permanente (TJMG, TJAM) a tarefa fica marcada como "não
suportado", sem ficar tentando à toa.

## 10. O que ainda está em aberto

- **MNI**: as seções 5.1/6.1 de `raspador-dados-publicos.md` (pesquisa de
  uma API oficial nacional que apareceu no documento sem ter sido
  verificada nesta conversa) ainda precisam de confirmação do Caio antes
  de virar premissa de arquitetura. Se confirmado, pode substituir
  scraping por API oficial em parte dos tribunais — mudaria o adaptador
  daquele sistema, não a arquitetura geral (fila, CS distribuído,
  normalização continuam iguais).
- **Julia**: só a fatia "descobrir processo por OAB de terceiro" nos
  tribunais com barreira real (hoje, só TJMG) ainda depende dela.
- **PJe**: ainda falta decidir, sistema por sistema, se cada tribunal
  usa API JSON (como o TJDFT) ou precisa de scraping de HTML com sessão
  (como o TRF3) — isso vai pro documento específico do PJe.

## 11. Próximo passo

Discutir e escrever um documento por sistema (e-SAJ, eproc, Projudi, PJe),
detalhando o adaptador de cada um: quais tribunais suportados de saída,
config por tribunal, formato de resposta, casos excepcionais. Este
documento geral é a base que todos eles seguem — fila, CS distribuído,
normalização, duas tarefas, cadência.
