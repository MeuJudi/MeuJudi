# Auditoria do login PDPJ no MeuJudi CS

## Resultado do log consultado

O relatório enviado pelo CS em `2026-07-27T20:12Z` foi o diagnóstico
`pje_login_failed` da máquina `DESKTOP-IS6I73M`. O nome antigo do evento é
legado; o fluxo observado foi o PDPJ.

Sequência registrada:

1. O CS iniciou a janela em `www.jus.br`.
2. O Jus.br redirecionou para `sso.cloud.pje.jus.br`.
3. O fluxo passou por `sso.acesso.gov.br`.
4. O navegador retornou para `www.jus.br` às `20:03:04Z`.
5. O CS não reconheceu esse retorno como sucesso porque ainda esperava a rota
   privada `/painel/usuario-externo` do PJe/TRT9.
6. Após 10 minutos, o CS encerrou como timeout e executou o diagnóstico antigo
   de certificado/PJe.

Não houve registro de chamada à API pública de processos nesse relatório. O
CS também não registrou um token de acesso; tokens, cookies, certificados e
chaves não devem ser enviados para o Supabase.

## Validade observada nos HARs do PDPJ

Os quatro HARs do Portal de Serviços registraram a resposta OIDC do endpoint
de token com:

- `expires_in`: aproximadamente `28800` segundos, ou **8 horas**;
- `refresh_expires_in`: entre aproximadamente `7h45` e `8h`, dependendo do
  momento da captura;
- `token_type`: `Bearer`;
- escopos: `openid profile email`.

Isso é a validade do token OIDC observado, não uma garantia de que toda sessão
do Jus.br ou toda sessão de um tribunal durará exatamente 8 horas. O sistema
deve considerar o token expirado quando receber `401`, pedir login novamente e
não tentar renovar silenciosamente uma etapa que possa exigir GOV, MFA ou
certificado.

## O que foi corrigido no CS

- O armazenamento local da sessão mudou de `pje-session` para `pdpj-session`;
- a captura ativa considera apenas domínios do PDPJ/Jus.br e do Portal de
  Serviços;
- não há mais exigência de `XSRF-TOKEN` do TRT9 para concluir o login;
- o diagnóstico de conectividade usa o Jus.br/PDPJ;
- a limpeza da sessão remove o armazenamento do navegador do PDPJ, e não
  somente cookies de `pje.trt9.jus.br`.

## Próxima etapa técnica: extração via API

O login e a extração precisam ficar separados:

1. O usuário conclui o login no navegador do CS.
2. O CS valida que voltou autenticado ao PDPJ.
3. O CS captura apenas o necessário para a sessão protegida, sempre cifrado
   localmente.
4. Um cliente separado consulta o Portal de Serviços:
   - `GET /api/v2/processos?oabRepresentante=...`;
   - `GET /api/v2/processos/{numeroCNJ}`;
   - `GET /api/v2/processos?numeroProcesso=...`;
   - consulta por CPF/CNPJ somente quando o portal responder esse filtro.
5. A resposta passa pelo normalizador do MeuJudi, é vinculada ao tenant e
   somente depois enviada ao Web.
6. Em `401` ou sessão expirada, a fila fica pausada em `login_required` e o
   CS mostra uma notificação para o usuário autenticar novamente.

Essa etapa ainda precisa de um cliente PDPJ dedicado e de uma estratégia de
captura/renovação do Bearer usada pelo Portal. O código não deve reutilizar o
`PJeAPI` privado do TRT9 nem inventar um `userId` de advogado.

