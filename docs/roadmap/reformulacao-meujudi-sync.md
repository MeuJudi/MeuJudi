# Reformulação do MeuJudi CS → MeuJudi Sync

> **Status:** ⚠️ **SUPERSEDIDO** em 27/07/2026 — o plano oficial a seguir agora é
> [`23-meujudi-cs-v0.3.0-refatoracao.md`](23-meujudi-cs-v0.3.0-refatoracao.md),
> que cobre (e vai bem além d)o que este documento planejava (shell de
> navegação, rename, seção avançado/diagnóstico). Mantido aqui só como
> histórico/referência das decisões de UX que já tinham sido tomadas — várias
> delas continuam válidas dentro do escopo do doc 23 (ex.: permissão
> avançada por heartbeat, campo "Pareado por {nome}" sempre visível).
>
> **Data original:** 24/07/2026 (escopo revisado e reorganizado em fases em 27/07/2026)
> **Depende de:** `arquitetura-sincronizacao-mural.md` (heartbeat, `cs_devices`, task queue) — **já está pronto e em produção**, ver Raio-X abaixo.

---

## Raio-X (27/07/2026): o que já existe hoje

Conferido direto no código do `meujudi-cs/` nesta data, depois de várias
rodadas de trabalho no app (pareamento, sync do Mural, ConfirmADV, correção
do login PDPJ — ver [`cs-pdpj-login-fix.md`](cs-pdpj-login-fix.md) e
[`19-cs-sync-multitenant.md`](19-cs-sync-multitenant.md)).

| Peça | Status |
|---|---|
| Heartbeat (`arquitetura-sincronizacao-mural.md` Fase 1) | ✅ Pronto — `status-reporter.ts` envia a cada `INTERVALS.heartbeat`, integrado ao `Scheduler` |
| Pareamento por código (`cs_devices`) | ✅ Pronto — `src/main/pairing.ts` + tela `settings/pairing.tsx` |
| Sync real do Mural via CS | ✅ Pronto — `src/main/mural-sync.ts` (361 linhas), `scheduler.ts` com task queue de verdade (não é mais stub) |
| Validação de OAB via ConfirmADV | ✅ Pronto — `src/main/confirmadv.ts` (441 linhas), tela `settings/oab-validation.tsx` — feature que nem existia quando este doc foi escrito |
| Login PJe via PDPJ/Jus.br | 🚧 Em andamento — `pje-auth.ts` v4 aponta pro jus.br, SSO com cert. A1 já confirmado funcionando; falta achar a rota certa dentro do jus.br que leva ao painel do PJe (ver `cs-pdpj-login-fix.md`) |

A fundação técnica está pronta. Este documento trata da reformulação de
navegação, organização de telas, rename **e** migração visual pro design
system do Web — tudo organizado em fases sequenciais (seção abaixo), pra
poder ser implementado aos poucos sem depender de fazer tudo de uma vez.

---

## 1. Problema

O app hoje se chama **"MeuJudi CS"**, com subtítulo **"Cert Service"** —
nome herdado de quando ele só existia pra gerenciar o Certificado A1. Hoje
ele faz muito mais: autentica no PJe (via PDPJ/Jus.br), sincroniza o Mural,
reporta heartbeat, conduz a validação de OAB via ConfirmADV. O nome não
corresponde mais ao que o app é.

Três problemas concretos, achados revisando o código:

1. **Navegação inconsistente** — `pairing.tsx` usa `<a href="../../index.html">` (link cru, recarrega a página), `pje-connection.tsx` usa `next/link` (roteamento client-side). Cada tela tem seu próprio jeito de "voltar", sem componente compartilhado.
2. **Informação técnica/pessoal solta nas telas comuns** — a tela de Conexão PJe mistura status (que todo mundo precisa) com um bloco de diagnóstico completo (versão do Electron, hostname da máquina, CPF do certificado, latência do PJe, contagem de cookies) e um botão pra mostrar logs brutos. Isso fica visível pra qualquer pessoa que abra o CS numa máquina de escritório.
3. **Visual desconectado do resto do MeuJudi** — o CS usa Tailwind genérico (`btn-primary`, cinza padrão, ícones em emoji), sem nenhuma relação com o design system do Web (`DESIGN.md`: IBM Plex Sans, Fraunces, paleta `brass`/`paper`/`ink`, componentes Radix já padronizados).

---

## 2. Decisões tomadas

| Tópico | Decisão |
|---|---|
| Nome novo | **MeuJudi Sync** (era "MeuJudi CS" / "Cert Service") |
| Sistema visual | **Migrar pro mesmo design system do Web** (tokens de `DESIGN.md`, componentes de `src/components/ui/`) em vez do Tailwind genérico atual — ver Fase 7 |
| Layout de navegação | **Centralizado**, como é hoje (logo + card + lista de botões) — **não** vira menu lateral. A mudança é tornar esse padrão consistente entre todas as telas, não trocar o layout |
| Escopo da reformulação | Tudo: Home/Status, Conexão PJe, Pareamento, Validação de OAB, Diagnóstico/Logs, Sobre, menu da bandeja |
| Visibilidade por padrão | **Visível pra todo mundo:** Status, Conexão PJe, Pareamento, Validação de OAB, Sobre (simplificada) |
| Visibilidade restrita | **Só aparece se o Super Admin autorizar:** Logs, Diagnóstico (relatório completo), Detalhes técnicos (versão, Electron, Windows, hostname, CPF do certificado, latência do PJe, cookies) |
| Campo "Pareado por {nome}" | **Sempre visível** (nos dois casos — padrão e avançado) — é operacional (quem conectou este PC), não entra no bloco restrito |
| Mecanismo de permissão | **Opção B:** a permissão "pega carona" no heartbeat que o CS já envia — o servidor devolve o status de autorização em toda resposta, sem consulta extra. Funciona com o CS offline (usa o último valor salvo em cache local) |
| Granularidade da permissão | **As duas ao mesmo tempo** — o Super Admin pode liberar o **escritório inteiro** (todos os dispositivos daquele tenant) ou **um dispositivo específico**. Detalhado na Fase 1 |
| Ícone do app | Mantém o atual por enquanto — troca fica pra depois, decisão separada |
| Rename no Web | Sim — precisa propagar pra todo lugar no Web que hoje fala "MeuJudi CS" |

### Decisão registrada, não reabrir

- **Pasta `meujudi-cs/`**: o nome da pasta/repositório do app Electron não muda neste plano (é interno, não aparece pro usuário) — só strings visíveis, título da janela e nome do instalador.

---

## 3. Visão geral da nova estrutura de telas

```
MeuJudi Sync (Home)
├─ Status                     [sempre visível] — card central: pareado?, PJe
│                                conectado?, última sync do Mural, tudo num
│                                relance. Ponto de entrada único.
├─ Conexão PJe                [sempre visível] — conectar/desconectar (via
│                                PDPJ/Jus.br), sincronizar agora, tempo
│                                restante de sessão
├─ Pareamento                 [sempre visível] — código/QR, "Pareado por
│                                {nome}", importação histórica, desconectar
├─ Validação de OAB           [sempre visível] — verificar agora, estágio
│                                atual, status do ConfirmADV (já existe)
├─ Sobre                      [sempre visível] — nome, versão, link de
│                                suporte. NÃO mostra hostname/Electron/etc.
│
└─ Avançado                   [só se Super Admin autorizar o escritório]
   ├─ Diagnóstico             — o que já existe em DiagnosticViewer hoje
   ├─ Detalhes técnicos       — versão, Electron, Windows, hostname, CPF,
   │                             latência PJe, cookies (o que já existe,
   │                             só reagrupado)
   └─ Logs                    — o que já existe em LogsViewer hoje
```

O menu continua centralizado (card com lista de botões, como a `index.tsx`
de hoje) — a diferença é que **todas as telas passam a usar o mesmo
componente de shell/cabeçalho** (voltar consistente, mesmo padding, mesmo
estilo de card), e a seção **Avançado** só aparece na lista de botões
quando o CS souber (via heartbeat) que está autorizado.

---

## 4. Fases de implementação

Cada fase é independente o suficiente pra ser feita e testada isoladamente.
A ordem abaixo é a recomendada (algumas podem rodar em paralelo, indicado
na coluna "Depende de").

| Fase | Nome | Onde | Depende de |
|---|---|---|---|
| 1 | Permissão avançada (migration + heartbeat + UI Super Admin) | Web | Heartbeat já pronto ✅ |
| 2 | CS: cache local da permissão | CS | Fase 1 |
| 3 | CS: `AppShell` compartilhado | CS | — |
| 4 | CS: Home/Status reformulada + tela "Sobre" | CS | Fase 3 |
| 5 | CS: seção "Avançado" (Diagnóstico/Detalhes técnicos/Logs) | CS | Fases 2, 3 |
| 6 | Rename "MeuJudi CS" → "MeuJudi Sync" (CS + Web) | CS + Web | Pode rodar em paralelo com 3-5 |
| 7 | Sistema visual — migrar pro design system do Web | CS | Por último, depois de tudo estrutural (3-6) |

---

### Fase 1 — Permissão avançada (Web)

Duas camadas independentes, qualquer uma das duas libera: **escritório
inteiro** (todos os dispositivos daquele tenant) ou **um dispositivo
específico** (só aquele PC, mesmo que o resto do escritório não tenha
acesso).

**1.1 Migration: colunas de permissão**

`supabase/migrations/YYYYMMDD_cs_advanced_access.sql` (novo):

```sql
-- Escritório inteiro
alter table public.tenants
  add column if not exists cs_advanced_access boolean not null default false;

comment on column public.tenants.cs_advanced_access is
  'Libera Logs/Diagnóstico/Detalhes técnicos no MeuJudi Sync pra todos os dispositivos deste escritório. Controlado pelo Super Admin.';

-- Dispositivo específico (independente do flag acima)
alter table public.cs_devices
  add column if not exists advanced_access boolean not null default false;

comment on column public.cs_devices.advanced_access is
  'Libera Logs/Diagnóstico/Detalhes técnicos só neste dispositivo pareado, mesmo que o escritório (tenants.cs_advanced_access) não esteja liberado.';
```

**1.2 Heartbeat devolve a permissão efetiva**

`src/app/api/cs/heartbeat/route.ts` (já existe — só adicionar o campo na
resposta). Permissão efetiva = `tenants.cs_advanced_access OR
cs_devices.advanced_access`:

```ts
const { data: tenant } = await supabase
  .from("tenants")
  .select("cs_advanced_access")
  .eq("id", device.tenantId)
  .maybeSingle();

// device já vem de autenticarDevice — adicionar advanced_access ao select
// dessa função (src/lib/cs/device-auth.ts) se ainda não trouxer
const advancedAccess = Boolean(tenant?.cs_advanced_access) || Boolean(device.advancedAccess);

return NextResponse.json({
  ok: true,
  serverTime: new Date().toISOString(),
  advancedAccess,
});
```

**1.3 UI pro Super Admin autorizar**

Dentro de `src/app/(super-admin)/admin/` — reaproveitar a tela que já
lista tenants/`cs-releases`, ou criar `admin/cs-devices`, ou um card na
página de detalhe do tenant. Dois controles:
- Toggle do escritório → `update tenants set cs_advanced_access = ...`.
- Lista de dispositivos pareados, cada um com seu toggle → `update
  cs_devices set advanced_access = ...`.

Server Actions diretas, sem RPC, mesmo padrão de outras ações do Super
Admin já existentes.

---

### Fase 2 — CS: cache local da permissão

**2.1 `StatusReporter` guarda o valor recebido**

`meujudi-cs/src/main/status-reporter.ts` (já existe). A cada heartbeat
bem-sucedido, salva `advancedAccess` num `electron-store` (mesmo padrão já
usado por `Pairing`/`MuralSync`):

```ts
interface AccessStore { advancedAccess: boolean }
const accessStore = new Store<AccessStore>({ name: "cs-access", defaults: { advancedAccess: false } });

// Ao receber a resposta do heartbeat:
accessStore.set("advancedAccess", response.advancedAccess ?? false);
```

**Comportamento offline:** se o heartbeat falhar, mantém o último valor
salvo — nunca reseta pra `false` só por falha de rede.

**2.2 IPC novo pro renderer consultar**

`meujudi-cs/src/main/ipc-handlers.ts`:
```ts
ipcMain.handle('access:get-advanced', async () => accessStore.get('advancedAccess'));
```

`meujudi-cs/src/preload/index.ts`:
```ts
access: { getAdvanced: () => ipcRenderer.invoke('access:get-advanced') },
```

`meujudi-cs/src/shared/types.ts`:
```ts
access: { getAdvanced: () => Promise<boolean> };
```

**2.3 Hook no renderer**

`meujudi-cs/src/renderer/hooks/useAdvancedAccess.ts` (novo, mesmo molde de
`usePairing`/`usePJeStatus`):

```ts
export function useAdvancedAccess() {
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    const refresh = () => window.meujudi.access.getAdvanced().then(setAdvanced).catch(() => undefined);
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, []);
  return advanced;
}
```

---

### Fase 3 — CS: shell de navegação único

`meujudi-cs/src/renderer/components/AppShell.tsx` (novo). Substitui o
padrão atual de cada página desenhar seu próprio `<header>`/link de
voltar:

```tsx
export function AppShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen ...">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <Link href="/" className="...">← Voltar</Link>
          <h1 className="...">{title}</h1>
        </header>
        {children}
      </div>
    </main>
  );
}
```

Nesta fase o `AppShell` reaproveita o visual atual (classes já existentes,
tipo `card`) — a troca de estilo em si é a Fase 7. Todas as páginas
(`pje-connection.tsx`, `pairing.tsx`, `oab-validation.tsx`, as novas
`sobre.tsx` e `avancado/*.tsx`) passam a usar esse componente.

---

### Fase 4 — CS: Home/Status reformulada + tela "Sobre"

**4.1 Home** — `meujudi-cs/src/renderer/pages/index.tsx` (reescrever):
- Card de status único: pareado (sim/não) → PJe conectado (sim/não) →
  última sync do Mural (há quanto tempo) → validação de OAB.
- Lista de botões centralizados pras seções — **adiciona** um botão
  "Avançado" só quando `useAdvancedAccess()` retornar `true`.
- Remove a menção "Cert Service" — passa a dizer só "MeuJudi Sync".

**4.2 Tela "Sobre"** — `meujudi-cs/src/renderer/pages/sobre.tsx` (novo):
nome, versão (`window.meujudi.app.getVersion()`, já existe), link de
suporte/changelog. **Não** mostra nada técnico — isso migra pra Avançado.

---

### Fase 5 — CS: seção "Avançado"

`meujudi-cs/src/renderer/pages/avancado/index.tsx` (novo) + reaproveita
`DiagnosticViewer.tsx` e `LogsViewer.tsx` como estão hoje (conteúdo interno
não muda, só a organização/local de acesso).

- Guard no topo: se `useAdvancedAccess()` for `false`, redireciona pra Home
  (defesa em profundidade — o botão já não aparece na Home, mas a rota não
  deve funcionar mesmo se alguém tentar acessar direto).
- Lista centralizada de 3 botões: Diagnóstico, Detalhes técnicos, Logs.

---

### Fase 6 — Rename "MeuJudi CS" → "MeuJudi Sync"

**6.1 Dentro do CS (Electron)**

| Arquivo | O que mudar |
|---|---|
| `meujudi-cs/package.json` | `name`/`productName` (afeta o instalador e o nome do processo) |
| `meujudi-cs/installer.iss` | Nome do app no instalador Inno Setup, atalhos |
| `meujudi-cs/src/shared/constants.ts` | `APP_NAME`, `APP_FULL_NAME` |
| `meujudi-cs/src/main/tray.ts` | Tooltip/menu da bandeja |
| `meujudi-cs/src/renderer/pages/_document.tsx` | `<title>` |
| `meujudi-cs/src/renderer/pages/index.tsx` | Já coberto na Fase 4.1 |
| Ícone do app | Fora do escopo deste doc — decisão separada |

**6.2 No Web**

| Arquivo | O que mudar |
|---|---|
| `src/app/(platform)/(tenant)/configuracoes/meujudi-cs/page.tsx` | Copy da página (nome + textos) |
| `src/app/(platform)/(tenant)/configuracoes/meujudi-cs/cs-pairing-gate.tsx` | "Conecte o MeuJudi CS" → "Conecte o MeuJudi Sync" |
| `src/app/(platform)/(tenant)/configuracoes/meujudi-cs/cs-download-section.tsx` | Copy do botão de download |
| `src/app/(platform)/(tenant)/validacao-oab/cs-pairing-gate.tsx` | Mesma copy, outra tela |
| `src/app/(super-admin)/admin/cs-releases/*` | Nome exibido nas releases (nome técnico da tabela/rota pode continuar `cs-releases`) |
| Qualquer outro texto visível com "MeuJudi CS" | `grep -ri "meujudi cs"` no repo antes de considerar concluído |

**Não precisa mudar:** nomes de tabelas (`cs_devices`, `cs_mural_requests`,
`cs_pairing_codes`, `cs_releases`), rotas de API (`/api/cs/*`), nem a pasta
`meujudi-cs/`.

---

### Fase 7 — Sistema visual (migrar pro design system do Web)

Última fase, depois que a estrutura (nome, navegação, permissão) já
estiver pronta — evita misturar mudança estrutural com polimento visual no
mesmo PR.

- Trocar `tailwind.config.js` do CS pra importar/replicar os tokens de
  `DESIGN.md` (cores `brass`/`paper`/`ink`, fonte IBM Plex Sans/Fraunces,
  radius, etc.) em vez das classes genéricas atuais (`btn-primary`,
  `card`).
- Trocar os componentes ad hoc (`HelpModal` customizado,
  `ConnectedCard`/`DisconnectedCard` inline) pelos componentes já
  existentes em `src/components/ui/` do Web (`Dialog`, `Card`, `Button`,
  `Badge`) — como o CS é um app Next.js separado, isso significa copiar os
  componentes (mesmo padrão já usado pra `MuralClient`/tipos
  compartilhados) ou extrair pra um pacote compartilhado, dependendo do
  apetite por refactor nessa hora.
- Trocar ícones de emoji por um set consistente (o Web já usa
  `lucide-react` — reaproveitar).

Como o `AppShell` (Fase 3) já centraliza a estrutura de cada tela, essa
troca de visual fica concentrada em poucos arquivos (o `AppShell` em si +
os componentes reaproveitados), em vez de espalhada por cada página.

---

## 5. Riscos

| Risco | Mitigação |
|---|---|
| Super Admin revoga acesso avançado, mas CS demora até o próximo heartbeat pra refletir | Aceitável — não é um controle de segurança crítico, é organização de UI |
| CS fica muito tempo offline (sem heartbeat) e usuário achava que tinha acesso avançado | Mantém o último valor em cache — continua aparecendo até o próximo heartbeat dizer o contrário |
| Esquecer algum lugar no Web que ainda fala "MeuJudi CS" | `grep -ri "meujudi cs"` no repo inteiro antes de considerar a Fase 6 concluída |
| Migrar visual (Fase 7) introduzir regressão de layout | Fazer por último, isolado, com o app já funcionalmente pronto — mais fácil de revisar sozinho, e o `AppShell` da Fase 3 concentra o blast radius |

---

## 6. Perguntas em aberto

Nenhuma. Documento reorganizado em fases (seção 4) em 27/07/2026 — mesmo
conteúdo da versão original de 24/07, só estruturado pra permitir
implementação incremental, fase por fase. Pronto pra virar implementação
quando o Caio der o sinal.
