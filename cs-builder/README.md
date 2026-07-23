# MeuJudi CS Builder

Esta pasta guarda somente os arquivos versionados usados para empacotar o
instalador. O codigo-fonte do CS continua fora do repositorio principal,
conforme a decisao do projeto.

## O que fica fora do Git

- `meujudi-cs/` com o codigo local do Electron;
- `node_modules/`, `.env` e credenciais;
- `dist/`, `release/` e qualquer `.exe`/`.msi`.

## Fluxo local

1. Atualize a versao em `meujudi-cs/package.json`.
2. Execute `npm run dist:win` dentro de `meujudi-cs/`.
3. Publique o arquivo gerado como uma GitHub Release pelo painel Super Admin.

O painel renomeia o asset para `MeuJudi-CS-Setup-v<VERSAO>.exe` antes do
upload, mesmo que o arquivo local tenha outro nome.
