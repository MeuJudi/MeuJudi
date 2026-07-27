# Auditoria e correção: login PJe/PDPJ no MeuJudi CS

Data: 27/07/2026

## Contexto

O Caio reportou que o login pelo PJe no MeuJudi CS estava dando erro (com
prints do painel de Logs e Diagnóstico do CS). Esta sessão auditou o fluxo
de conexão de ponta a ponta e corrigiu os problemas encontrados.

## O que foi encontrado

1. **Login PJe realmente falhando** — pelos prints (timestamps de
   `did-navigate`/`did-navigate-in-page`): o SSO via certificado A1
   completava normalmente, mas o PJe redirecionava pra
   `/pjekz/acesso-negado` logo em seguida (rejeição na camada de
   autorização do PJe, não problema de certificado/SSO). O PJe então
   tentava um fallback legado (`/primeirograu/login.seam`) que nunca
   chegava a resolver.
   - Causa raiz: desde abril/2025 o acesso de usuário externo ao PJe passou
     a ser exclusivo via PDPJ/Jus.br; desde nov/2025 (reforço em abr/2026) o
     MFA por e-mail é obrigatório. O CS ainda montava a URL do Keycloak
     direto (fluxo antigo), que não é mais aceito.

2. **Falso negativo na detecção de certificado A1** — o script de detecção
   só olhava `Cert:\CurrentUser\My`. Tem certificado válido que fica em
   `Cert:\LocalMachine\My`, e o Windows/Chromium checam os dois — só o
   diagnóstico do CS não checava.

3. **Logs de diagnóstico incompletos no Supabase** — existiam dois buffers
   de log paralelos: um interno do `logger.ts` (que alimenta o relatório
   enviado ao Supabase) e outro duplicado dentro de `ipc-handlers.ts` (só
   alimentava o painel "Mostrar logs" da UI). O nível padrão (`LOG_LEVEL`)
   do primeiro buffer era `info`, descartando os logs `debug` — exatamente
   onde ficava o rastro de navegação (`did-navigate`) que mostra o
   `acesso-negado`. Confirmado com uma consulta real ao Supabase: o
   relatório do print do Caio (`diagnostic_reports`, id
   `12299496-859b-4d37-b18e-168002df0dde`) tinha 91 logs e nenhum continha
   "navigate" ou "acesso-negado".
   - O envio automático pro Supabase **já existia** (`diagnostic.ts` chama
     `enviarRelatorioSupabase()` sempre que roda, manual ou automático em
     falha de login) — não foi preciso criar essa parte, só corrigir o que
     estava sendo enviado.

## Decisão do Caio

- Corrigir a detecção de certificado agora.
- Trazer a correção já pensando na migração futura pra PDPJ (o PJe direto
  vai ser desativado depois).
- Tirar o login direto do PJe agora e deixar o PDPJ/Jus.br como único ponto
  de entrada.
- Logs de diagnóstico devem chegar automaticamente no Supabase, sem
  depender de print.

## O que foi alterado (tudo dentro de `meujudi-cs/`, nada no app Web)

- `src/main/cert-detector.ts` — passa a checar `Cert:\CurrentUser\My` **e**
  `Cert:\LocalMachine\My` na detecção de certificado A1.
- `src/shared/constants.ts` — removida a construção manual da URL do
  Keycloak (`KEYCLOAK_BASE_URL`, `KEYCLOAK_CLIENT_IDS`, `PJE_LOGIN_URL`);
  adicionada `PDPJ_LOGIN_URL = 'https://www.jus.br'`.
- `src/main/pje-auth.ts` — login agora abre `https://www.jus.br` (deixa o
  próprio site tratar SSO + MFA) em vez de montar a URL do Keycloak na mão.
  Título da janela e comentários atualizados (v4).
- `src/main/logger.ts` — `LOG_LEVEL` padrão trocado de `info` pra `debug`,
  garantindo que o rastro de navegação chegue no relatório do Supabase.
- `src/main/ipc-handlers.ts` — removido o buffer de log duplicado
  (`addLog`/`wrapMethod`); painel de logs da UI passa a usar a mesma fonte
  única (`getRecentLogs()`), que já aplica redaction de segredos
  (XSRF-TOKEN, JSESSIONID, cookies do Keycloak, JWT).
- `src/renderer/pages/settings/pje-connection.tsx` — texto/botão
  atualizados pra refletir o fluxo PDPJ/Jus.br (incluindo aviso sobre o
  código de segurança do MFA).
- Removido `src/main/pdpj-auth.ts` (módulo experimental criado e descartado
  na mesma sessão, junto com a exposição em `preload/index.ts` e
  `shared/types.ts`) — a lógica foi absorvida direto no `pje-auth.ts`
  de produção.

Nenhum arquivo do app Next.js (`src/app`, `src/lib`, migrations) foi tocado
nesta rodada. Os únicos arquivos fora de `meujudi-cs/` criados nesta sessão
são documentação (`docs/roadmap/raspador-*.md`, sobre outro assunto — ver
esses arquivos pra detalhes da pesquisa de raspador de dados públicos).

## Verificação feita

- `npm run typecheck` (main + renderer) rodado múltiplas vezes — zero erros.
- Grep final por símbolos removidos (`PJE_LOGIN_URL`, `KEYCLOAK_*`,
  `PdpjAuth`, `pdpj-auth`) — limpo.
- Consulta real ao Supabase confirmando o comportamento do bug antes da
  correção (ver item 3 acima).

## O que NÃO foi verificado ainda

- O novo fluxo de login via `https://www.jus.br` **não foi testado com um
  certificado A1 real** (não há certificado disponível neste ambiente). É
  preciso o Caio testar na prática pra confirmar que o PJe volta a
  reconhecer a sessão depois do MFA.
- Nada foi commitado.

## Deploy — não é só "compilar"

O MeuJudi CS é um app Electron desktop, separado do deploy do Web
(Vercel). Pra essas mudanças valerem na máquina onde o CS já está
instalado, o fluxo é:

1. `npm run build` (roda `build:main` + `build:renderer`) — gera os
   artefatos compilados.
2. Empacotar um instalador novo: `npm run dist:win` (usa
   `electron-builder`; há também `installer.iss` do Inno Setup no
   projeto).
3. Instalar/atualizar essa versão na máquina onde o CS está rodando hoje
   (o app tem `electron-updater` como dependência, mas não foi confirmado
   nesta sessão se o auto-update está configurado/ativo — vale checar antes
   de assumir que basta subir uma release).

Ou seja: `typecheck` limpo garante que o código compila sem erro, mas não
é o mesmo que ter uma nova versão rodando na máquina do Caio — falta o
build completo + reinstalar/atualizar o pacote.
