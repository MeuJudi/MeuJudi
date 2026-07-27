# Descobertas: Jus.br, PDPJ e painel privado do PJe/TRT9

**Data:** 27/07/2026  
**Status:** descoberta confirmada; implementação do novo caminho ainda pendente

## Resumo

O login via certificado A1 no portal `jus.br` está funcionando. O problema observado depois do login não é, neste momento, falha de autenticação: o CS está abrindo o **Consultor Público do CNJ**.

Esse consultor é uma ferramenta nacional de consulta pública. Ele permite pesquisa manual por número do processo e outros identificadores, mas não representa o painel privado do advogado nem é a origem correta para descobrir automaticamente os processos vinculados à OAB.

O caminho correto é:

```text
Certificado A1
  -> login no Jus.br/PDPJ
  -> menu Sistemas Processuais
  -> entrada do PJe do TRT9
  -> redirecionamento SSO para o PJe/TRT9
  -> painel privado do usuário externo
  -> captura de cookies, XSRF e userId
  -> API paineladvogado/{userId}/processos
```

## O que as imagens comprovam

### 1. O login no Jus.br foi concluído

O portal exibe o usuário autenticado **CAIO SILVA** no canto superior direito. Isso confirma que o certificado/SSO chegou ao portal nacional.

### 2. O menu correto existe

No menu lateral aparecem as opções:

- `Serviços Nacionais`
- `Sistemas Processuais`
- `Consultar processos`
- `Tribunais e conselhos`

A opção `Consultar processos` abre uma janela intitulada **Portal de Serviços do Poder Judiciário**. A tela mostra a mensagem de consulta informativa e campos como `Número do Processo`. Essa é a consulta pública do CNJ, não o painel privado do PJe.

### 3. A pesquisa manual não atende ao objetivo

O MeuJudi não deve pedir para o advogado pesquisar cada processo por CNJ, OAB ou CPF. O objetivo é usar o login apenas uma vez e, depois, consultar automaticamente os processos vinculados à identidade autenticada no tribunal.

## Situação atual no código

O CS ainda inicia o login em `https://www.jus.br`, conforme [constants.ts](/C:/Caio/MeuJudi/meujudi-cs/src/shared/constants.ts), e espera encontrar uma URL semelhante a `/painel/usuario-externo`, conforme `PJE_LOGGED_IN_PATTERN`.

Depois da captura da sessão, a API do CS já possui endpoints do painel privado, incluindo:

- `/pje-comum-api/api/paineladvogado/{id}/processos`
- `/pje-comum-api/api/paineladvogado/{id}/totalizadores`
- `/pje-comum-api/api/paineladvogado/{id}/orgaojulgadores`
- `/pje-comum-api/api/paineladvogado/{id}/classesjudiciais`
- `/pje-comum-api/api/paineladvogado/{id}/fasesprocessuais`

Portanto, a parte que está faltando é principalmente o **descobrimento e a navegação para a entrada correta do PJe/TRT9**, além de confirmar a captura do `userId` e dos cookies pertencentes ao domínio do TRT9.

## O que não devemos fazer

- Não automatizar o preenchimento do Consultor Público do CNJ como se fosse o painel do advogado.
- Não usar a pesquisa pública como substituta do acesso autenticado ao PJe.
- Não assumir que estar logado em `jus.br` significa que já existe uma sessão válida em `pje.trt9.jus.br`.
- Não capturar ou armazenar senha, código MFA ou certificado privado; o CS deve usar o certificado pelo fluxo nativo do Windows e guardar somente a sessão necessária, criptografada localmente.

## Próxima descoberta técnica

Na janela autenticada do `jus.br`, precisamos identificar o destino real do item `Sistemas Processuais` e do tribunal TRT9.

### Procedimento manual de descoberta

1. Fechar a janela do `Consultar processos`.
2. Abrir o menu lateral do `jus.br`.
3. Entrar em `Sistemas Processuais`.
4. Localizar `Tribunal Regional do Trabalho da 9ª Região`, `TRT9` ou `PJe`.
5. Clicar na entrada do TRT9.
6. No DevTools, aba **Network/Rede**, preservar o registro.
7. Anotar:
   - URL inicial clicada;
   - redirecionamentos 3xx;
   - URL final do PJe;
   - domínio dos cookies;
   - requisições que retornam `userId`, perfis ou painel;
   - eventual chamada de SSO/token.
8. Exportar o HAR sem dados sensíveis ou remover cookies, tokens e cabeçalhos de autorização antes de compartilhar.

## Implementação prevista depois da descoberta

1. Configurar uma URL de entrada específica do TRT9, em vez de depender somente da home do `jus.br`.
2. Manter listeners de `did-navigate`, `did-navigate-in-page` e polling de URL.
3. Considerar login concluído somente quando houver:
   - domínio esperado do PJe/TRT9;
   - rota do painel privado;
   - cookies de sessão/XSRF válidos;
   - `userId` extraído com sucesso.
4. Consultar o painel privado usando `getPainelProcessos` com paginação.
5. Enviar os processos ao Web pela sincronização já existente.
6. Registrar no diagnóstico cada etapa: entrada Jus.br, seleção do TRT9, redirecionamento, cookies, userId, consulta e envio.
7. Se o TRT9 exigir MFA ou uma escolha manual de tribunal, deixar apenas essa etapa interativa; todo o restante deve continuar automático.

## Resposta objetiva à dúvida

Sim, é possível fazer o fluxo automático depois do login, mas não a partir da tela pública que aparece nas imagens. O CS precisa navegar para o painel processual privado do TRT9. A pessoa deve participar apenas das etapas que o Jus.br/PDPJ exigir, como certificado, MFA ou escolha do tribunal. Depois disso, o MeuJudi pode consultar a API do painel, sem pedir pesquisa manual por processo.

## Nova evidência: Consultor Público por OAB

Em um teste realizado em 27/07/2026, o Consultor Público encontrou **988 processos** usando a busca:

```text
Pesquisar por: OAB
Número da OAB: PR67553
```

Isso demonstra que a ferramenta pública pode ser uma fonte relevante para descoberta de processos, mesmo sem a conta Jus.br possuir perfil de advogado. A tela de resultado exibiu, entre outros dados:

- número CNJ;
- classe processual;
- tribunal e unidade de origem;
- indicação de segredo ou sigilo;
- valor da causa;
- data de distribuição;
- abas de documentos e movimentos.

### O que isso significa

Podemos ter três camadas complementares:

1. **Consultor Público:** descoberta e enriquecimento de processos por OAB, com dados públicos.
2. **Mural via MeuJudi CS:** comunicações, intimações, prazos e audiências vinculados ao escritório.
3. **DataJud:** metadata e movimentações públicas por CNJ.

O Consultor Público pode resolver parte do problema de descobrir processos sem depender do painel privado. Porém, os 988 resultados não devem ser tratados automaticamente como uma lista completa e definitiva do advogado, porque a consulta pode incluir tribunais/ramas diferentes, processos públicos onde a OAB aparece de alguma forma e resultados sujeitos às regras de indexação do CNJ.

### Limitações que precisam ser testadas

- se a busca por OAB exige selecionar ramo da Justiça e tribunal para obter resultados completos;
- qual paginação máxima existe;
- se os 988 resultados são todos retornados ou apenas a primeira contagem do portal;
- quais campos aparecem no JSON/API e quais só aparecem na tela;
- se documentos e movimentos exigem nova autorização, CAPTCHA ou sessão;
- como o portal trata segredo de justiça e nomes ocultados;
- limites de frequência, bloqueios e regras de uso do serviço.

### Como investigar sem adivinhar a API

1. Abrir o Consultor Público e iniciar uma busca por OAB.
2. Abrir `F12 > Rede/Network` e ativar `Preservar registro`.
3. Filtrar por `Fetch/XHR`.
4. Executar a busca e trocar de página.
5. Abrir um resultado e carregar `Movimentos` ou `Documentos`.
6. Registrar URL, método, parâmetros, paginação, resposta e códigos HTTP.
7. Exportar um HAR sanitizado, removendo cookies, tokens e dados pessoais.

O objetivo é identificar o contrato público utilizado pelo próprio portal. Não devemos contornar CAPTCHA, bloqueios, autenticação ou limites de uso. Se a consulta depender de CAPTCHA, o fluxo precisa manter uma etapa manual ou obter autorização formal para integração.

### Decisão recomendada

Antes de investir no painel privado do PJe, vale validar tecnicamente o Consultor Público como um adaptador independente chamado `consultor_cnj_publico`. Ele pode pesquisar por OAB, distribuir os resultados por tribunal/tenant e encaminhar cada CNJ para DataJud e Mural. O painel privado continua sendo uma melhoria posterior para dados que não aparecem na consulta pública.

## Critério de sucesso

O fluxo estará correto quando, após o login:

- a janela chegar ao domínio do PJe/TRT9;
- o CS identificar o usuário externo;
- `getPainelProcessos` retornar dados sem preencher CNJ/OAB manualmente;
- os processos forem enviados ao Web;
- o diagnóstico mostrar todas as etapas e o motivo exato caso o redirecionamento falhe.
