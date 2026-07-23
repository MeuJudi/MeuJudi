# GitHub Releases do MeuJudi CS

O instalador nao fica no historico do Git. Ele e publicado como asset de uma
GitHub Release no repositorio `MeuJudi/MeuJudi`.

## Configuracao unica

1. No GitHub, abra **Settings > Developer settings > GitHub Apps > New GitHub App**.
2. Configure uma App para o MeuJudi.
3. Em **Repository permissions**, conceda `Contents: Read and write`.
4. Instale a App somente no repositorio `MeuJudi/MeuJudi`.
5. Copie o **App ID**.
6. Na instalacao da App, copie o numero da URL como **Installation ID**.
7. Gere uma chave privada e guarde o arquivo `.pem` com seguranca.

Cadastre na Vercel, em **Production** e **Preview**:

```env
GITHUB_APP_ID=...
GITHUB_APP_INSTALLATION_ID=...
GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----
GITHUB_RELEASE_OWNER=MeuJudi
GITHUB_RELEASE_REPO=MeuJudi
```

O MeuJudi usa a chave somente no servidor para gerar tokens temporarios. O
token temporario e enviado ao navegador apenas durante o upload e nao fica
salvo no banco.

## Publicacao

No Super Admin, informe a versao, selecione o instalador e publique. O sistema:

1. cria a tag `v<versao>`;
2. cria a release no GitHub;
3. envia o asset diretamente para o GitHub;
4. usa o nome `MeuJudi-CS-Setup-v<versao>.exe`;
5. salva no Supabase somente os metadados e a URL de download.

Todas as releases permanecem disponiveis no historico. A remocao pelo painel
remove a release correspondente no GitHub e o registro no Supabase.
