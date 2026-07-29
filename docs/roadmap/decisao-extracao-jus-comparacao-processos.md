# Decisao: extracao completa do Jus e comparacao com o MeuJudi

## Decisao registrada

O MeuJudi vai implementar um extrator de dados do Jus/PDPJ. Depois que o
extrator estiver concluido e validado, sera executada uma extracao completa
dos processos da OAB utilizada nos testes.

Os resultados serao comparados com:

- processos ja existentes no MeuJudi;
- dados recebidos pelo Mural;
- dados recebidos pelo DataJud;
- informacoes identificadas por cada fonte.

Essa primeira execucao sera somente de auditoria e comparacao. Os dados do Jus
nao substituirão automaticamente os dados atuais.

## Objetivos do teste

O teste devera responder:

1. Quais processos aparecem no Jus e nao aparecem no MeuJudi?
2. Quais processos aparecem no MeuJudi e nao aparecem no Jus?
3. Quais processos aparecem nas duas fontes, mas possuem campos diferentes?
4. Quais processos foram encontrados pelo Mural e nao pelo Jus?
5. Quais processos foram encontrados pelo DataJud e nao pelo Jus?
6. Quais informacoes novas o Jus traz para processos ja existentes?
7. Existem duplicidades causadas por formatacao diferente do CNJ?
8. Existem processos sigilosos, antigos, encerrados ou sem OAB atual que
   expliquem a divergencia?

## Escopo do extrator

### Consulta inicial por OAB

O extrator usara a consulta do Portal PDPJ por representante:

```text
GET /api/v2/processos?oabRepresentante=...
```

Ele devera:

- autenticar pelo fluxo PDPJ;
- usar o Bearer somente localmente no CS;
- consultar todas as paginas;
- salvar o cursor `searchAfter`;
- registrar quantidade total informada pelo Jus;
- armazenar a resposta bruta somente em cache local temporario e protegido;
- normalizar os processos antes da comparacao.

### Consulta de detalhes

Para cada CNJ encontrado, o extrator podera consultar:

```text
GET /api/v2/processos/{numeroCNJ}
```

Essa etapa sera usada para comparar detalhes como partes, movimentos, valor da
causa, tribunal, classe, orgao julgador, documentos e representantes.

## Modelo do resultado da extracao

Cada execucao devera gerar um identificador unico e metadados:

```text
extracao_id
tenant_id
oab_id
oab_number
oab_uf
started_at
completed_at
status
total_informado_pelo_jus
total_paginas
total_recebido
total_normalizado
total_com_erro
```

O resultado nao deve ser misturado imediatamente com os processos oficiais do
tenant. Inicialmente, sera uma fotografia de auditoria.

## Normalizacao antes da comparacao

Antes de comparar, todos os registros devem passar pelas mesmas regras:

- remover pontuacao e espacos indevidos do CNJ;
- padronizar o CNJ para o formato oficial;
- normalizar siglas de tribunais;
- normalizar nomes de classes processuais;
- converter datas para ISO;
- converter valores numericos para o mesmo formato;
- normalizar nomes de pessoas sem alterar o valor original armazenado;
- ordenar movimentos por data;
- remover duplicidades dentro da propria resposta do Jus.

O CNJ normalizado sera a chave principal de comparacao.

## Grupos de comparacao

### Grupo A - Somente no Jus

Processos retornados pelo Jus que nao possuem CNJ correspondente no MeuJudi.

Possiveis explicacoes:

- processo novo ainda nao recebido pelo Mural;
- processo fora do periodo pesquisado por outra fonte;
- processo de tribunal ainda nao processado pelo DataJud;
- processo em que a OAB esta vinculada, mas nao houve comunicacao recente;
- divergencia de escopo entre as fontes.

### Grupo B - Somente no MeuJudi

Processos presentes no banco atual, mas ausentes na extracao do Jus.

Possiveis explicacoes:

- processo sigiloso ou restrito;
- processo encerrado ou arquivado;
- processo antigo fora do indice atual do Jus;
- OAB que deixou de ser representante;
- processo encontrado pelo Mural ou DataJud, mas nao pelo filtro do Jus;
- erro de paginacao ou consulta incompleta.

### Grupo C - Presentes nas duas fontes

Processos encontrados no Jus e no MeuJudi. Nesse grupo, comparar campo a campo:

- tribunal;
- grau e instancia;
- classe;
- assuntos;
- autor e reu;
- representantes;
- valor da causa;
- orgao julgador;
- data de ajuizamento;
- nivel de sigilo;
- movimentos;
- documentos;
- ultima atualizacao.

### Grupo D - Informacoes novas

Campos preenchidos pelo Jus que estao vazios no processo atual, por exemplo:

- valor da causa;
- orgao julgador;
- data de ajuizamento;
- representantes;
- partes adicionais;
- movimentos que o DataJud nao trouxe;
- documentos ou links de documentos;
- dados de tribunal, grau ou classe.

### Grupo E - Conflitos

Campos preenchidos nas duas fontes com valores diferentes. Cada conflito deve
mostrar:

```text
CNJ
campo
valor_atual
valor_jus
fonte_atual
data_atualizacao_atual
data_consulta_jus
recomendacao
```

Nenhum conflito sera resolvido automaticamente na primeira auditoria.

## Fontes e prioridade

O comparador nao deve assumir que uma fonte sempre esta correta para todos os
campos. A prioridade sera analisada por campo:

- Jus/PDPJ: processo vinculado a OAB, representantes e detalhes do Portal;
- Mural: comunicacoes, intimacoes, prazos e texto integral;
- DataJud: metadados publicos, movimentos e dados estruturados disponiveis;
- cadastro manual: informacoes inseridas pelo escritorio.

Quando houver conflito, o sistema apresentara as fontes lado a lado e indicara
qual fonte possui a atualizacao mais recente, sem apagar o valor anterior.

## Como sera executado o primeiro teste

1. Confirmar que o CS esta pareado com o tenant de teste.
2. Confirmar a OAB e UF que serao usadas.
3. Fazer login no PDPJ.
4. Executar a consulta completa por OAB.
5. Processar todas as paginas com `searchAfter`.
6. Consultar detalhes dos CNJs encontrados, respeitando limites.
7. Gerar uma fotografia da extracao.
8. Consultar os processos atuais do tenant.
9. Normalizar os dois conjuntos.
10. Gerar relatorio de inclusoes, ausencias, conflitos e campos novos.
11. Revisar os resultados antes de qualquer atualizacao oficial.

## Controle de limites

O teste deve ser executado em lotes:

- uma pagina por vez no MVP;
- limite de concorrencia igual a 1;
- espera configuravel entre paginas;
- retry somente para falhas temporarias;
- pausa automatica em 401, 403 ou 429;
- retomada pelo cursor salvo.

Se a API retornar erro, o resultado parcial sera preservado. A execucao nao
deve ser marcada como completa quando houver paginas nao consultadas.

## Seguranca e privacidade

- Bearer e cookies ficam somente no CS.
- Dados pessoais nao devem aparecer em logs de diagnostico.
- O relatorio Web deve mascarar CPF, documentos e tokens.
- A fotografia bruta deve ter prazo de expiracao e acesso restrito.
- O resultado deve ser vinculado ao tenant correto.
- Processos sem vinculo valido nao entram no banco oficial.
- A auditoria deve registrar quem iniciou a extracao e quando.

## Telas e relatorios previstos

O Super Admin podera visualizar:

- execucoes realizadas;
- status e duracao;
- total informado pelo Jus;
- total recebido;
- processos somente no Jus;
- processos somente no MeuJudi;
- conflitos por campo;
- campos novos encontrados;
- erros e paginas nao concluídas.

O tenant podera visualizar somente o resultado relacionado ao proprio tenant.

## Criterios para considerar a extracao confiavel

O extrator sera considerado pronto quando:

- percorrer todas as paginas;
- salvar e recuperar `searchAfter`;
- nao duplicar CNJs;
- retomar apos reinicio;
- pausar em expiracao de sessao;
- diferenciar erro parcial de conclusao;
- preservar a origem de cada campo;
- gerar relatorio comparativo reproducivel;
- passar pelo teste com a OAB utilizada nos testes.

## Decisao sobre atualizacao dos processos

Na primeira execucao, o Jus sera usado para auditoria e descoberta de
divergencias. Depois da revisao dos resultados, sera definido um segundo passo
para atualizar automaticamente somente campos aprovados e somente quando a
fonte e a data de atualizacao justificarem a alteracao.

## Proxima implementacao

A primeira parte a ser implementada sera o extrator PDPJ por OAB, com:

1. cliente HTTP;
2. sessao Bearer;
3. paginacao por `searchAfter`;
4. cache local de progresso;
5. exportacao de uma fotografia comparavel.

Somente depois dessa parte ser validada sera implementado o comparador contra
os dados atuais do MeuJudi, Mural e DataJud.

