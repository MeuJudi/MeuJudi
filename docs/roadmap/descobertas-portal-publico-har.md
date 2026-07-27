# Descobertas do Consultor Público via HAR

**Data:** 27/07/2026  
**Status:** endpoints identificados para teste controlado

## Busca por OAB

```text
GET https://portaldeservicos.pdpj.jus.br/api/v2/processos?oabRepresentante=...
```

A resposta JSON observada possui:

```text
total
numberOfElements
maxElementsSize
searchAfter
content[]
```

Cada item observado contém `numeroProcesso`, `nivelSigilo`, `idCodexTribunal`, `siglaTribunal` e `tramitacoes`. O campo `searchAfter` indica paginação por cursor.

## Detalhes do processo

```text
GET https://portaldeservicos.pdpj.jus.br/api/v2/processos/{numeroCNJ}
```

O detalhe possui `tramitacaoAtual` com data de ajuizamento, instância, grau, valor da ação, classe, distribuição, movimentos, assuntos, partes, tribunal, documentos e processos relacionados.

Foram observados dados de classe, distribuição, movimentos, assuntos, partes, tribunal e documentos, incluindo links para o conteúdo dos documentos.

## SSO observado

```text
POST https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/token
GET  https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/userinfo
```

Os tokens, cookies e dados pessoais dos HARs não devem ser copiados para o MeuJudi, Git, Supabase ou documentação pública.

## Falha observada

Um processo consultado retornou `HTTP 500` no endpoint de detalhes. O futuro adaptador deve registrar o erro somente para aquele processo, manter os demais resultados e tentar novamente depois.

## Novos endpoints confirmados

### Busca por CNJ

```text
GET https://portaldeservicos.pdpj.jus.br/api/v2/processos?numeroProcesso=...
```

Retornou `200` com a mesma estrutura resumida da busca por OAB e um único resultado:

```text
total
numberOfElements
maxElementsSize
content[]
```

### Busca por CPF/CNPJ

```text
GET https://portaldeservicos.pdpj.jus.br/api/v2/processos?cpfCnpjParte=...
```

O endpoint foi identificado, mas o teste retornou `404` com a mensagem `Não foram encontrados registros`. Isso confirma a rota e o parâmetro, mas ainda não confirma um resultado positivo. É necessário testar com um CPF/CNPJ que possua processos públicos ou verificar se o portal exige máscara/formato específico.

## O que já é suficiente

Já temos informação suficiente para iniciar a primeira versão do cliente do CS para:

- busca por OAB;
- busca individual por CNJ;
- consulta de detalhes por CNJ;
- tratamento de erro por processo;
- estrutura de resposta resumida e detalhada.

Ainda falta capturar a ação de carregar a segunda página da busca por OAB. O primeiro HAR retornou 100 itens e o campo `searchAfter`, mas não registrou uma segunda requisição usando esse cursor. Essa captura é necessária antes de afirmar que a importação histórica consegue percorrer todos os resultados.

## Próxima implementação recomendada

1. Criar um adaptador separado chamado `consultor_cnj_publico`.
2. Buscar por OAB.
3. Consumir todos os lotes com `searchAfter`.
4. Salvar CNJ e tribunal.
5. Consultar detalhes com concorrência limitada.
6. Enviar os CNJs ao DataJud.
7. Usar Mural/CS para enriquecer prazos e comunicações.
8. Registrar erro individual sem abortar todo o lote.

Antes de produção, ainda é necessário confirmar se a busca por OAB cobre todos os tribunais ou se precisa ser repetida por ramo/tribunal, além dos limites de frequência do portal.
