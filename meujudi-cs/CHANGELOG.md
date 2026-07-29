# Changelog — MeuJudi Sync

## 0.3.0 — 2026-07-29

Refatoração completa descrita em
`docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md` (Fases 0 a 11).

### Principais mudanças

- **Fila unificada de sincronização** (`sync_tasks` no Supabase): todo
  trabalho do app (Mural, PDPJ, pareamento) agora passa por um único
  `SyncWorker` observável, com progresso, retries e status reportados em
  tempo real ao Web.
- **Mural totalmente migrado** para a fila unificada — `mural_request`,
  `mural_push`, `mural_sweep` e `mural_historical` não dependem mais do
  scheduler local antigo.
- **Scheduler e fila local antigos removidos** (`scheduler.ts`,
  `task-queue.ts`) — tudo que rodava neles hoje roda via `SyncWorker` +
  `node-cron` (`startMuralScheduledTasks`).
- **Renomeação do produto**: "MeuJudi CS" agora é **"MeuJudi Sync"** em toda
  a interface, instalador, atalhos e textos visíveis. Identificadores
  internos (nome da pasta `meujudi-cs/`, `appId` do instalador, tabelas do
  Supabase, rotas `/api/cs/*`) foram mantidos de propósito — só o que o
  usuário vê mudou.
- **Documentos do processo persistidos** (`processo_documentos`) — antes só
  ficavam na sessão do PDPJ, agora sobrevivem no banco.
- DataJud confirmado como **Web-only por decisão do Caio** (29/07/2026) —
  não passa pela fila do Sync, e não deve passar futuramente sem decisão
  explícita em contrário.
- PDPJ (extração de sessão/login) não foi alterado nesta fase — o Caio vai
  testar e ajustar essa parte manualmente depois deste release.

### Compatibilidade de dados (upgrade 0.2.x → 0.3.0)

O Electron guarda pareamento, sessão do PDPJ, logs e diagnóstico numa pasta
derivada do nome do produto (`%APPDATA%/<productName>`). Como o nome mudou de
"MeuJudi CS" para "MeuJudi Sync", isso quebraria silenciosamente a
continuidade de dados de quem já tinha o app instalado. Foi adicionado um
fixador de compatibilidade (`src/main/env.ts`) que força o app a continuar
usando a pasta física antiga (`%APPDATA%/MeuJudi CS`) independente do nome
visível novo — então instalar 0.3.0 por cima de uma instalação 0.2.x
**preserva pareamento e sessão automaticamente**, sem exigir novo login.

### Verificação do instalador

Arquivo: `MeuJudi-Sync-Setup-v0.3.0.exe`

```
SHA256: a12822f0aef4f97bb9b282fa395d27eb66093a784e6464fde9ef4401392f9489
```

Para conferir no Windows:

```powershell
certutil -hashfile MeuJudi-Sync-Setup-v0.3.0.exe SHA256
```

**Status de assinatura de código: não assinado.** O build não tem
certificado de assinatura (`electron-builder` reporta "no signing info
identified, signing is skipped" em todo build). Isso significa que o Windows
SmartScreen pode alertar sobre "editor desconhecido" na primeira execução —
comportamento esperado, não é malware. Comprar um certificado de assinatura
de código (EV ou OV) é a forma de resolver isso definitivamente; até lá, o
hash acima é a forma de verificação disponível. Risco aceito conscientemente
por ora — reavaliar se isso começar a gerar fricção real na adoção pelos
escritórios.

### Canal de preview

Não existe hoje infraestrutura de distribuição em estágios (preview/beta
antes de produção) — todo build sai direto como release final. Construir
isso exigiria decisões de infraestrutura (onde hospedar builds de preview,
como escritórios optam por entrar nele) que não foram tomadas ainda. Fica
registrado aqui como gap conhecido da Fase 11, não implementado neste
release.

### Plano de rollback para 0.2.x

Se o 0.3.0 apresentar problema sério após instalado:

1. Desinstalar o MeuJudi Sync pelo Painel de Controle (ou
   `{app}\Uninstall MeuJudi Sync.exe`).
2. Reinstalar a versão 0.2.x anterior conhecida-boa.
3. Como a pasta de dados (`%APPDATA%/MeuJudi CS`) não muda entre 0.2.x e
   0.3.0 (ver seção de compatibilidade acima), pareamento e sessão do PDPJ
   são preservados no downgrade também — não é necessário reparear nem
   logar de novo.
4. Migrações de banco desta fase (`sync_tasks`, `processo_documentos`) são
   aditivas (tabelas novas, sem alteração destrutiva em tabelas existentes)
   — o 0.2.x antigo simplesmente não as usa, sem quebrar.

### Limpeza de artefatos

Instaladores obsoletos (`MeuJudi-CS-Setup-v0.2.19.exe`,
`MeuJudi-Sync-Setup-v0.2.19.exe`, e as versões antigas já removidas do
controle de versão) foram apagados de `release/`. Só
`MeuJudi-Sync-Setup-v0.3.0.exe` (a release atual) permanece.
