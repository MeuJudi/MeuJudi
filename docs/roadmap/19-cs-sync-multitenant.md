# 19 — CS: autenticação por tenant + sincronização real (Mural e PJe)

> **Status:** 📋 Planejado — não iniciado
> **Motivação:** descoberta durante o Sprint 2 do Web (DataJud/Mural) em 21/07/2026
> **Dependências:** [`09-cert-a1.md`](09-cert-a1.md), [`16-implementacao-cert-a1.md`](16-implementacao-cert-a1.md), [`07-edge-mural.md`](07-edge-mural.md)
> **Duração estimada:** ~4-5 dias úteis

---

## 🎯 Contexto: por que este documento existe

Durante o Sprint 2 do Web (poller de Mural Eletrônico), a chamada da Vercel pra
`comunicaapi.pje.jus.br` começou a voltar **HTTP 403** — confirmado via log de
runtime que é a página padrão de erro do **AWS CloudFront/WAF**, não um
problema de header ou autenticação. Ou seja: o WAF do PJe bloqueia por
**reputação de IP de datacenter/nuvem** (a Vercel roda em AWS Lambda), e não
tem fix de código que resolva isso puramente do lado da Vercel.

A saída natural: fazer a chamada ao Mural sair de um **IP residencial/comercial
normal** — exatamente o que o **MeuJudi CS** já foi desenhado pra fazer (rodar
no PC de cada advogado). O CS já existe como projeto (`meujudi-cs/`, com
instalador gerado, tray icon, detecção de cert. A1, login OAuth-like pro PJe e
diagnóstico), mas investigando o código descobri uma lacuna que bloqueia
**qualquer** sincronização de dado real (não só Mural — também bloqueia o
próprio PJe, motivo original do CS existir):

- `src/main/scheduler.ts` é **um stub vazio** — comentário no topo diz "Sprint
  2 vai implementar polling real", e esse Sprint 2 nunca aconteceu.
- Não existe **nenhum conceito de tenant** dentro do CS hoje. `PJeSession`
  guarda o `userId` *dentro do PJe* (id do advogado no sistema do tribunal),
  não o `tenant_id` do MeuJudi.
- A única coisa que o CS já manda pro Supabase (`supabase-reporter.ts`) é
  relatório de diagnóstico anônimo, usando a chave `anon`/publishable — e o
  comentário no arquivo já é explícito: **"Do not ship service_role in
  desktop builds"**.

Ou seja: antes de sincronizar processo, movimentação ou comunicação de
verdade, o CS precisa resolver uma pergunta de segurança que ainda não foi
respondida — **como um `.exe` que qualquer advogado de qualquer escritório
baixa prova, com segurança, que ele pertence ao tenant X, sem embutir a chave
mestra do banco dentro do instalador?**

Este documento propõe a resposta pra essa pergunta e o desenho de como o
Mural (e depois o PJe) passam a sincronizar de verdade através dela.

---

## 🔒 O problema de segurança, em detalhe

| | Rotas `/api/cron/*` do Web (Sprint 2) | MeuJudi CS (desktop) |
|---|---|---|
| Onde roda | Servidor da própria Vercel, infraestrutura nossa | PC de qualquer advogado, de qualquer escritório |
| Quem tem acesso ao binário/código rodando | Só nós | Qualquer pessoa que instale o `.exe` (pode fazer engenharia reversa) |
| Client Supabase usado | `createServiceClient()` — **bypassa RLS**, acesso total ao banco | Só pode usar chave `anon` — **RLS obrigatório** |
| Por que isso é seguro | O ambiente é 100% controlado e confiável | Um único `.exe` vazado/decompilado com `service_role` embutido = acesso admin ao banco inteiro, de todos os tenants, pra sempre |

**Nunca** embutir `SUPABASE_SERVICE_ROLE_KEY` num build Electron distribuído —
isso já está certo no código atual e não pode mudar. A pergunta é: dado que o
CS só pode usar a chave `anon`, como ele grava dado real de processo (que tem
RLS por `tenant_id`) sem pedir login completo do Supabase Auth toda vez?

---

## 🏗️ Arquitetura proposta: CS como "relay de rede", não como escritor direto

**Decisão central:** o CS **não escreve direto no Supabase** pra dados de
processo. Ele busca o dado (usando seu IP "limpo", vantagem que só ele tem) e
manda pra uma rota autenticada do próprio Web, que faz a escrita de verdade
(reusando 100% da lógica já construída no Sprint 2 — `processarComunicacao`
de `poll-mural/route.ts`, sem duplicar nada). O CS vira "boca de rede", o Web
continua sendo a única fonte de verdade de regra de negócio.

```
┌─────────────────────────────┐
│  PC do advogado              │
│                               │
│  MeuJudi CS                  │
│   1. Sabe seu device_token   │
│      (pareado 1x, ver abaixo)│
│   2. Busca Mural direto      │
│      (IP residencial, sem    │
│      bloqueio de WAF)        │
│   3. POST do JSON bruto pra  │
│      /api/cs/sync/mural      │
│      com Authorization:      │
│      Bearer <device_token>   │
└──────────────┬────────────────┘
               │ HTTPS
               ▼
┌─────────────────────────────────────────┐
│  MeuJudi Web (Vercel)                     │
│                                            │
│  /api/cs/sync/mural                       │
│   1. Valida device_token (tabela          │
│      cs_devices, hash comparado)          │
│   2. Resolve tenant_id do device          │
│   3. Chama processarComunicacao() —       │
│      MESMA função do poll-mural, zero     │
│      lógica de negócio duplicada          │
│   4. Atualiza cs_devices.last_seen_at     │
│                                            │
│  createServiceClient() — seguro aqui,     │
│  código roda só na nossa infra            │
└─────────────────────────────────────────┘
```

Isso resolve o problema de IP (a busca sai do PC do advogado) **e** o
problema de segurança (o CS nunca vê nem precisa da `service_role`; o pior
que um `device_token` vazado consegue fazer é mandar dado de Mural pra
**aquele tenant específico**, e dá pra revogar token por device
individualmente).

---

## 🔑 Pareamento: como o CS descobre de qual tenant ele é

Dois caminhos possíveis — recomendo o **B**.

### Opção A — Login completo (Supabase Auth) dentro do CS
CS mostra uma tela de login (email/senha do MeuJudi), autentica via
`supabase-js` (`signInWithPassword`), guarda o JWT + refresh token
criptografado em disco (reusando `src/shared/crypto.ts`, já existe). Escreve
direto no Supabase com esse client autenticado — RLS aplica normal porque é
uma sessão real do usuário.

- ✅ Simples, zero infraestrutura nova no Web.
- ⚠️ Login/senha do MeuJudi passa a existir dentro de um app desktop
  distribuído — maior superfície de ataque que um token escopado.
- ⚠️ Revogar acesso de 1 PC específico exige trocar a senha da conta inteira
  (afeta todos os dispositivos do usuário).

### Opção B — Código de pareamento + device token escopado (recomendado)

```
1. Advogado abre MeuJudi Web → Configurações → "Conectar MeuJudi CS"
2. Web gera um código curto (ex: "7X4K-9QPL"), válido por 10 min,
   vinculado ao tenant_id + user_id de quem gerou
3. Advogado abre o CS, cola o código na tela "Conectar"
4. CS chama POST /api/cs/pair { codigo } (sem token, é o primeiro contato)
5. Web valida o código, cria uma linha em cs_devices (novo device_token
   gerado ali, aleatório, só o HASH fica salvo no banco)
6. Web devolve o device_token em texto puro (só essa vez!)
7. CS salva o device_token criptografado em disco (AES-256-GCM,
   mesmo padrão de src/shared/crypto.ts) — nunca mais precisa logar de novo
8. Toda sincronização futura usa Authorization: Bearer <device_token>
```

- ✅ Revogável por dispositivo (perdeu o notebook → revoga só aquele device
  em `cs_devices`, sem mexer na senha da conta).
- ✅ Token escopado — só serve pras rotas `/api/cs/*`, não é uma sessão
  Supabase Auth completa.
- ✅ Auditável por device (`last_seen_at`, `device_name`, quando foi criado).
- ⚠️ Mais peças novas: 1 tela no Web, 1 tela no CS, 2 tabelas, 1 rota de
  pareamento.

---

## 🗄️ Schema novo (migration)

```sql
-- supabase/migrations/YYYYMMDD_cs_devices.sql

create table public.cs_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  codigo text not null unique,              -- ex: "7X4K-9QPL", gerado curto/legível
  expires_at timestamptz not null,           -- created_at + 10 min
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.cs_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  device_name text,                          -- ex: hostname do PC, pra advogado reconhecer na lista
  token_hash text not null unique,           -- sha256(device_token) — nunca guarda o token puro
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create index cs_devices_tenant_idx on public.cs_devices(tenant_id) where revoked_at is null;

alter table public.cs_pairing_codes enable row level security;
alter table public.cs_devices enable row level security;

create policy "cs_pairing_codes_tenant_all" on public.cs_pairing_codes
  for all to authenticated
  using (tenant_id = public.current_user_tenant_id() or public.is_super_admin())
  with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create policy "cs_devices_tenant_all" on public.cs_devices
  for all to authenticated
  using (tenant_id = public.current_user_tenant_id() or public.is_super_admin())
  with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());
```

`cs_pairing_codes` e `cs_devices` seguem o mesmo padrão de RLS já usado no
resto do projeto (`tenant_id = current_user_tenant_id() or is_super_admin()`)
— nada novo aí. As rotas `/api/cs/*` usam `createServiceClient()` (como as
`/api/cron/*`) porque o CS não tem sessão de usuário autenticado — só o
`device_token`.

---

## 🌐 Rotas novas no Web

### `POST /api/cs/pair`
Sem auth de device (é o primeiro contato). Recebe `{ codigo }`.
1. Busca `cs_pairing_codes` por `codigo`, checa `expires_at > now()` e
   `used_at is null`.
2. Gera `device_token` aleatório (ex: `crypto.randomBytes(32).toString('hex')`,
   mesmo padrão já usado pro `CRON_SECRET`).
3. Insere em `cs_devices` só o hash (`sha256(device_token)`).
4. Marca o `cs_pairing_codes.used_at`.
5. Devolve `{ device_token, tenant_id, user_id }` — **única vez que o token
   aparece em texto puro**.

### `POST /api/cs/sync/mural`
Auth: `Authorization: Bearer <device_token>`.
1. Calcula hash do token recebido, busca em `cs_devices` (`revoked_at is
   null`).
2. Se não achar → 401.
3. Resolve `tenant_id` do device.
4. Recebe no corpo o JSON bruto que o CS já buscou do Mural (`MuralResponse`,
   mesmo shape de `src/lib/mural/client.ts`).
5. Pra cada item, chama a função `processarComunicacao` já existente em
   `src/app/api/cron/poll-mural/route.ts` (extrair pra um módulo compartilhado
   se ainda não estiver, tipo `src/lib/mural/processar-comunicacao.ts`) —
   **zero lógica de negócio nova aqui**, é o mesmo código que a Vercel já
   rodaria sozinha, só que a Vercel não fez a parte de buscar (isso o CS já
   fez).
6. Atualiza `cs_devices.last_seen_at`.

### `POST /api/cs/gerar-codigo` (chamado pelo Web, não pelo CS)
Autenticado como usuário normal (`requireWritableAppUser`). Gera um código em
`cs_pairing_codes` pro tenant/usuário logado, pra mostrar na tela
"Configurações → Conectar MeuJudi CS".

---

## 💻 O que muda no lado do CS

### Novo: `src/main/pairing.ts`
- `pair(codigo: string)`: chama `/api/cs/pair`, salva `device_token`
  criptografado em disco (reusa `src/shared/crypto.ts`, mesmo padrão de
  `cookie-store.ts` já usado pro PJe).
- `getDeviceToken()`: lê e descriptografa.
- `isPaired()`: bool.

### Novo: `src/main/mural-sync.ts`
- Busca Mural direto (mesmo `MuralClient` de `src/lib/mural/client.ts` do
  Web — dá pra copiar o arquivo quase sem alteração, já que não depende de
  nada específico do Next.js).
- Precisa saber a(s) OAB(s) do tenant — vem numa resposta de
  `/api/cs/sync/mural` (o Web já sabe quais OABs o tenant tem cadastradas em
  `escritorio_oabs`, não precisa o CS saber de antemão) **ou** o CS pergunta
  `GET /api/cs/oabs` antes de buscar.
- POST do resultado bruto pra `/api/cs/sync/mural`.

### `src/main/scheduler.ts` deixa de ser stub
```typescript
start() {
  cron.schedule('0 6 * * 1', () => this.muralSync.tick()); // semanal, igual ao Web
  // PJe fica pra depois, no mesmo scheduler
}
```

### Tela nova no renderer: "Conectar MeuJudi CS"
Campo de texto pro código de 9 caracteres, botão "Conectar". Depois de
pareado, mostra "Conectado como {tenant.name} — {user.name}" e um botão
"Desconectar este dispositivo" (chama uma rota que marca `revoked_at`).

---

## 🖥️ O que muda no lado do Web

- Tela em `Configurações` (novo card, ex: `configuracoes/meujudi-cs/`):
  botão "Gerar código de pareamento", mostra o código por 10 min, lista os
  `cs_devices` já pareados daquele tenant com botão "Revogar" por linha.
- As 3 rotas novas (`/api/cs/pair`, `/api/cs/sync/mural`, `/api/cs/gerar-codigo`).
- Extrair `processarComunicacao` de `poll-mural/route.ts` pra um módulo
  compartilhado (`src/lib/mural/processar-comunicacao.ts`), já que agora tem
  2 chamadores (o cron da Vercel E a rota `/api/cs/sync/mural`).

---

## 📋 Fases de implementação sugeridas

| Fase | O quê | Onde |
|---|---|---|
| 1 | Migration `cs_pairing_codes` + `cs_devices` | Web |
| 2 | Extrair `processarComunicacao` pra módulo compartilhado | Web |
| 3 | Rotas `/api/cs/pair`, `/api/cs/gerar-codigo`, `/api/cs/sync/mural` | Web |
| 4 | Tela "Conectar MeuJudi CS" em Configurações (gerar código + listar/revogar devices) | Web |
| 5 | `pairing.ts` + tela "Conectar" no CS | CS |
| 6 | `mural-sync.ts` (portar `MuralClient`) + scheduler real | CS |
| 7 | Teste ponta a ponta: gerar código no Web → parear no CS → sync manual → confirmar dado no Supabase | Web + CS |
| 8 (futuro) | Mesmo padrão pro PJe (`pje-sync.ts`, rota `/api/cs/sync/pje`) — reusa toda a fundação das fases 1-5 | CS |

A fase 8 (PJe) é o motivo original do CS existir e **reusa 100% da fundação
de pareamento** construída nas fases 1-6 — depois que o dispositivo já está
pareado e sabe seu `device_token`, adicionar um segundo tipo de sync
(`/api/cs/sync/pje`) é bem mais barato que a primeira vez.

---

## ❓ Decisões que faltam (pro Caio)

1. **Opção A vs B** (login completo vs pareamento por código) — recomendo B
   pelos motivos de segurança acima, mas é decisão sua.
2. **Formato do código de pareamento**: 8-9 caracteres alfanuméricos (tipo
   `7X4K-9QPL`) é fácil de digitar à mão — ou prefere QR code (advogado
   escaneia com celular a partir de uma tela do Web)? QR evita erro de
   digitação mas exige câmera/celular no fluxo.
3. **Quantos devices por usuário**: ilimitado, ou limitar (ex: 3 PCs por
   advogado)?
4. **O que fazer se o tenant tiver várias OABs cadastradas mas só 1 device
   pareado**: o device sincroniza todas as OABs do tenant, ou só a(s) do
   próprio usuário logado no CS? (Recomendo: todas do tenant — é o mesmo
   comportamento do poller da Vercel hoje, só muda de onde a chamada sai.)
5. **Retry se o CS estiver desligado no horário do cron**: como o CS só roda
   quando o PC está ligado, prazos podem atrasar se o advogado desligar o PC
   à noite. Vale ter um fallback: se nenhum device do tenant sincronizar em
   X dias, alertar (painel do Super Admin já tem o `motor_extracao_log`,
   dá pra reusar esse feed).

---

> 📄 **Documento master:** [../../ESPECIFICACAO.md](../../ESPECIFICACAO.md) — todas as decisões em um único arquivo.
>
> 🏢 **MeuJudi é uma vertical** (meujudi) do monorepo multi-tenant.
>
> **Criado em:** 21/07/2026, após descoberta do bloqueio de IP (403 CloudFront) no poller de Mural do Sprint 2.
