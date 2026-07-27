# Reformulação do MeuJudi CS → MeuJudi Sync

> **Status:** Planejamento — nada implementado ainda
> **Autor:** Caio + Claude
> **Data:** 24/07/2026
> **Depende de:** `arquitetura-sincronizacao-mural.md` (heartbeat, `cs_devices`, task queue) — este documento assume que a Fase 1 daquele doc (heartbeat) já está no ar, e reaproveita o mesmo mecanismo pra entregar a permissão de acesso avançado.

---

## 1. Problema

O app hoje se chama **"MeuJudi CS"**, com subtítulo **"Cert Service"** — nome herdado de quando ele só existia pra gerenciar o Certificado A1. Hoje ele faz muito mais: autentica no PJe, sincroniza o Mural (empurra novidades e atende pedidos do servidor), reporta heartbeat, conduz a validação de OAB via ConfirmADV. O nome não corresponde mais ao que o app é.

A interface tem três problemas concretos, achados revisando o código:

1. **Navegação inconsistente** — `pairing.tsx` usa `<a href="../../index.html">` (link cru, recarrega a página), `pje-connection.tsx` usa `next/link` (roteamento client-side). Cada tela tem seu próprio jeito de "voltar".
2. **Informação técnica/pessoal solta nas telas comuns** — a tela de Conexão PJe mistura status (que todo mundo precisa) com um bloco de diagnóstico completo (versão do Electron, hostname da máquina, CPF do certificado, latência do PJe, contagem de cookies) e um botão pra mostrar logs brutos. Isso fica visível pra qualquer pessoa que abra o CS, numa máquina de escritório que pode ser vista por qualquer um.
3. **Visual desconectado do resto do MeuJudi** — o CS usa Tailwind genérico (`btn-primary`, cinza padrão, ícones em emoji), sem nenhuma relação com o design system do Web (`DESIGN.md`: IBM Plex Sans, Fraunces, paleta `brass`/`paper`/`ink`, componentes Radix já padronizados).

---

## 2. Decisões tomadas

| Tópico | Decisão |
|---|---|
| Nome novo | **MeuJudi Sync** (era "MeuJudi CS" / "Cert Service") |
| Sistema visual | Migrar pro mesmo design system do Web (tokens de `DESIGN.md`, componentes de `src/components/ui/`) em vez do Tailwind genérico atual |
| Layout de navegação | **Centralizado**, como é hoje (logo + card + lista de botões) — **não** vira menu lateral. A mudança é tornar esse padrão consistente entre todas as telas, não trocar o layout |
| Escopo da reformulação | Tudo: Home/Status, Conexão PJe, Pareamento, Validação de OAB, Diagnóstico/Logs, Sobre, menu da bandeja |
| Visibilidade por padrão | **Visível pra todo mundo:** Status, Conexão PJe, Pareamento, Validação de OAB, Sobre (simplificada) |
| Visibilidade restrita | **Só aparece se o Super Admin autorizar:** Logs, Diagnóstico (relatório completo), Detalhes técnicos (versão, Electron, Windows, hostname, CPF do certificado, latência do PJe, cookies) |
| Campo "Pareado por {nome}" | **Sempre visível** (nos dois casos — padrão e avançado) — é operacional (quem conectou este PC), não entra no bloco restrito |
| Mecanismo de permissão | **Opção B:** a permissão "pega carona" no heartbeat que o CS já envia a cada 5 min (`arquitetura-sincronizacao-mural.md`) — o servidor devolve o status de autorização em toda resposta de heartbeat, sem precisar de uma consulta extra. Funciona com o CS offline (usa o último valor salvo em cache local) |
| Granularidade da permissão | **As duas ao mesmo tempo** — o Super Admin pode liberar o **escritório inteiro** (todos os dispositivos daquele tenant) ou **um dispositivo específico** sem abrir pro resto da equipe. Detalhado na seção 4 |
| Ícone do app | Mantém o atual por enquanto — troca fica pra depois, decisão separada |
| Rename no Web | Sim — precisa propagar pra todo lugar no Web que hoje fala "MeuJudi CS" |

### Decisão registrada, não reabrir

- **Pasta `meujudi-cs/`**: o nome da pasta/repositório do app Electron não muda neste plano (é interno, não aparece pro usuário) — só strings visíveis, título da janela e nome do instalador. Renomear a pasta é possível depois, mas mexe em scripts de build/empacotamento sem nenhum ganho visível; recomendo não fazer isso agora.

---

## 3. Visão geral da nova estrutura de telas

```
MeuJudi Sync (Home)
├─ Status                     [sempre visível] — card central: pareado?, PJe
│                                conectado?, última sync do Mural, tudo num
│                                relance. Ponto de entrada único.
├─ Conexão PJe                [sempre visível] — conectar/desconectar,
│                                sincronizar agora, tempo restante de sessão
├─ Pareamento                 [sempre visível] — código/QR, "Pareado por
│                                {nome}", importação histórica, desconectar
├─ Validação de OAB           [sempre visível] — verificar agora, estágio
│                                atual (as 4 etapas), status do ConfirmADV
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

O menu continua centralizado (card com lista de botões, como a `index.tsx` de hoje) — a diferença é que **todas as telas passam a usar o mesmo componente de shell/cabeçalho** (voltar consistente, mesmo padding, mesmo estilo de card), e a seção **Avançado** só aparece na lista de botões quando o CS souber (via heartbeat) que está autorizado.

---

## 4. Parte 1 — Permissão avançada (Web)

Duas camadas independentes, qualquer uma das duas libera: **escritório inteiro** (todos os dispositivos daquele tenant) ou **um dispositivo específico** (só aquele PC, mesmo que o resto do escritório não tenha acesso).

### 4.1 Migration: colunas de permissão

**Arquivo:** `supabase/migrations/20260726000001_cs_advanced_access.sql` (novo)

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

### 4.2 Heartbeat devolve a permissão efetiva

**Arquivo:** `src/app/api/cs/heartbeat/route.ts` (já existe, per `arquitetura-sincronizacao-mural.md` Fase 1 — só adicionar o campo na resposta)

Permissão efetiva = `tenants.cs_advanced_access OR cs_devices.advanced_access` (qualquer um dos dois libera):

```ts
// Depois de autenticar o device e atualizar last_heartbeat/status:
const { data: tenant } = await supabase
  .from("tenants")
  .select("cs_advanced_access")
  .eq("id", device.tenantId)
  .maybeSingle();

// device já veio de autenticarDevice — se ainda não trouxer advanced_access,
// adicionar ao select dessa função (src/lib/cs/device-auth.ts)
const advancedAccess = Boolean(tenant?.cs_advanced_access) || Boolean(device.advancedAccess);

return NextResponse.json({
  ok: true,
  serverTime: new Date().toISOString(),
  advancedAccess,
});
```

### 4.3 UI pro Super Admin autorizar

**Arquivo:** provavelmente dentro de `src/app/(super-admin)/admin/` — reaproveitar a tela que já lista tenants/`cs-releases`, ou criar uma seção nova (`admin/cs-devices`) ou um card dentro da página de detalhe do tenant.

Dois controles, um pra cada camada:
- **Toggle do escritório**: "Acesso avançado pra todo o escritório: Ligado/Desligado" → `update tenants set cs_advanced_access = ... where id = ...`.
- **Lista de dispositivos pareados daquele tenant**, cada um com seu próprio toggle: "Acesso avançado neste dispositivo" → `update cs_devices set advanced_access = ... where id = ...`. Útil pra liberar só o PC de quem precisa diagnosticar, sem abrir pro escritório inteiro.

Ambos Server Actions diretas, sem RPC, mesmo padrão de outras ações do Super Admin já existentes.

---

## 5. Parte 2 — CS: cache local da permissão

### 5.1 `StatusReporter` guarda o valor recebido

**Arquivo:** `meujudi-cs/src/main/status-reporter.ts` (já existe, per `arquitetura-sincronizacao-mural.md`)

A cada heartbeat bem-sucedido, salvar `advancedAccess` num `electron-store` (mesmo padrão já usado por `Pairing`/`MuralSync` pra persistir estado local):

```ts
interface AccessStore { advancedAccess: boolean }
const accessStore = new Store<AccessStore>({ name: "cs-access", defaults: { advancedAccess: false } });

// Dentro do método que envia o heartbeat, ao receber a resposta:
accessStore.set("advancedAccess", response.advancedAccess ?? false);
```

**Comportamento offline:** se o heartbeat falhar (sem internet, servidor fora), mantém o último valor salvo — nunca reseta pra `false` só por falha de rede. Só muda quando um heartbeat responde com sucesso.

### 5.2 IPC novo pro renderer consultar

**Arquivo:** `meujudi-cs/src/main/ipc-handlers.ts` (adicionar handler)

```ts
ipcMain.handle('access:get-advanced', async () => accessStore.get('advancedAccess'));
```

**Arquivo:** `meujudi-cs/src/preload/index.ts` (expor no bridge)

```ts
access: { getAdvanced: () => ipcRenderer.invoke('access:get-advanced') },
```

**Arquivo:** `meujudi-cs/src/shared/types.ts` (adicionar ao `ElectronAPI`)

```ts
access: { getAdvanced: () => Promise<boolean> };
```

### 5.3 Hook no renderer

**Arquivo:** `meujudi-cs/src/renderer/hooks/useAdvancedAccess.ts` (novo, mesmo molde de `usePairing`/`usePJeStatus`)

```ts
export function useAdvancedAccess() {
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    const refresh = () => window.meujudi.access.getAdvanced().then(setAdvanced).catch(() => undefined);
    refresh();
    const timer = setInterval(refresh, 30_000); // reflete mudança de heartbeat sem precisar reabrir o app
    return () => clearInterval(timer);
  }, []);
  return advanced;
}
```

---

## 6. Parte 3 — CS: shell de navegação único

### 6.1 Componente de layout compartilhado

**Arquivo:** `meujudi-cs/src/renderer/components/AppShell.tsx` (novo)

Substitui o padrão atual de cada página desenhar seu próprio `<header>`/link de voltar. Um único componente:
- Cabeçalho com botão "Voltar" consistente (usa `next/link`, nunca `<a href="../../index.html">` de novo)
- Título da página
- Slot pro conteúdo

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

Todas as páginas (`pje-connection.tsx`, `pairing.tsx`, `oab-validation.tsx`, as novas `sobre.tsx` e `avancado/*.tsx`) passam a usar esse componente.

### 6.2 Home/Status reformulada

**Arquivo:** `meujudi-cs/src/renderer/pages/index.tsx` (reescrever)

- Card de status único: pareado (sim/não) → PJe conectado (sim/não) → última sync do Mural (há quanto tempo).
- Lista de botões centralizados pras seções, na mesma estrutura de hoje — **adiciona** um botão "Avançado" só quando `useAdvancedAccess()` retornar `true`.
- Remove a menção "Cert Service" — passa a dizer só "MeuJudi Sync" com uma linha curta (ex.: "Sincronização do escritório com o MeuJudi").

### 6.3 Tela "Sobre" nova

**Arquivo:** `meujudi-cs/src/renderer/pages/sobre.tsx` (novo)

Nome, versão (`window.meujudi.app.getVersion()`, já existe), link de suporte/changelog. **Não** mostra hostname, versão do Electron/Windows nem nada técnico — isso migra pra dentro de Avançado → Detalhes técnicos.

### 6.4 Seção "Avançado"

**Arquivo:** `meujudi-cs/src/renderer/pages/avancado/index.tsx` (novo) + reaproveita `DiagnosticViewer.tsx` e `LogsViewer.tsx` como estão hoje (o conteúdo interno não muda, só a organização/local de acesso).

- Guard no topo da página: se `useAdvancedAccess()` for `false`, redireciona pra Home (defesa em profundidade — o botão já não aparece na Home, mas a rota não deve funcionar mesmo se alguém tentar acessar direto).
- Lista centralizada de 3 botões: Diagnóstico, Detalhes técnicos, Logs — cada um leva pra sua própria tela (ou vira `<details>` expansível numa página só, à sua escolha na hora da implementação).

---

## 7. Parte 4 — Rename "MeuJudi CS" → "MeuJudi Sync"

### 7.1 Dentro do CS (Electron)

| Arquivo | O que mudar |
|---|---|
| `meujudi-cs/package.json` | `name`/`productName` (afeta o instalador e o nome do processo) |
| `meujudi-cs/installer.iss` | Nome do app no instalador Inno Setup, atalhos |
| `meujudi-cs/src/shared/constants.ts` | `APP_NAME`, `APP_FULL_NAME` |
| `meujudi-cs/src/main/tray.ts` | Tooltip/menu da bandeja |
| `meujudi-cs/src/renderer/pages/_document.tsx` | `<title>` |
| `meujudi-cs/src/renderer/pages/index.tsx` | Remove "Cert Service", já coberto na seção 6.2 |
| Ícone do app | Se quiser trocar visualmente também — fora do escopo deste doc, decisão separada |

### 7.2 No Web

| Arquivo | O que mudar |
|---|---|
| `src/app/(platform)/(tenant)/configuracoes/meujudi-cs/page.tsx` | Copy da página (nome + textos) |
| `src/app/(platform)/(tenant)/configuracoes/meujudi-cs/cs-pairing-gate.tsx` | "Conecte o MeuJudi CS" → "Conecte o MeuJudi Sync" |
| `src/app/(platform)/(tenant)/configuracoes/meujudi-cs/cs-download-section.tsx` | Copy do botão de download |
| `src/app/(platform)/(tenant)/validacao-oab/cs-pairing-gate.tsx` | Mesma copy, outra tela |
| `src/app/(super-admin)/admin/cs-releases/*` | Nome exibido nas releases (o nome técnico da tabela/rota pode continuar `cs-releases`, é interno) |
| Qualquer outro texto visível com "MeuJudi CS" | Buscar `grep -ri "meujudi cs"` no repo antes de implementar, pra não esquecer nenhum |

**Não precisa mudar:** nomes de tabelas (`cs_devices`, `cs_mural_requests`, `cs_pairing_codes`, `cs_releases`), rotas de API (`/api/cs/*`), nem a pasta `meujudi-cs/` — tudo isso é interno/técnico, não aparece pro usuário.

---

## 8. Parte 5 — Sistema visual

Migrar o CS pro mesmo design system do Web:
- Trocar o `tailwind.config.js` do CS pra importar/replicar os tokens de `DESIGN.md` (cores, fonte IBM Plex Sans, radius, etc.) em vez das classes genéricas atuais (`btn-primary`, `card`).
- Trocar os componentes ad hoc (`HelpModal` customizado, `ConnectedCard`/`DisconnectedCard` inline) pelos componentes já existentes em `src/components/ui/` do Web (`Dialog`, `Card`, `Button`, `Badge`) — como o CS é um app Next.js separado, isso significa copiar os componentes (mesmo padrão já usado pra `MuralClient`/tipos compartilhados) ou extrair pra um pacote compartilhado, dependendo do apetite por refactor nessa hora.
- Trocar ícones de emoji por um set consistente (o Web já usa `lucide-react` — reaproveitar).

Esta parte é a mais "de gosto" — recomendo fazer por último, depois que a estrutura (nome, navegação, permissão) já estiver certa, pra não misturar mudança estrutural com polimento visual no mesmo PR.

---

## 9. Ordem de implementação sugerida

| Fase | O que | Depende de |
|---|---|---|
| **A** | Migration `cs_advanced_access` + heartbeat devolve a flag + UI Super Admin pro toggle | Heartbeat (Fase 1 de `arquitetura-sincronizacao-mural.md`) já aplicado |
| **B** | CS: cache local da permissão (`status-reporter.ts`, IPC, hook) | Fase A |
| **C** | CS: `AppShell` compartilhado + todas as páginas migradas pra ele | — |
| **D** | CS: Home/Status reformulada + tela Sobre nova | Fase C |
| **E** | CS: seção Avançado (Diagnóstico/Detalhes técnicos/Logs reagrupados, com guard) | Fases B, C |
| **F** | Rename completo (CS + Web) | Pode ser feito em paralelo com C-E |
| **G** | Sistema visual (tokens + componentes do Web) | Por último, depois de tudo estrutural |

---

## 10. Riscos

| Risco | Mitigação |
|---|---|
| Super Admin revoga acesso avançado, mas CS demora até 5 min pra refletir (só no próximo heartbeat) | Aceitável — não é um controle de segurança crítico, é organização de UI. Documentar esse atraso se alguém perguntar |
| CS fica muito tempo offline (sem heartbeat) e usuário achava que tinha acesso avançado | Mantém o último valor em cache — se já tinha sido autorizado antes, continua aparecendo até o próximo heartbeat dizer o contrário |
| Esquecer algum lugar no Web que ainda fala "MeuJudi CS" | `grep -ri "meujudi cs"` no repo inteiro antes de considerar a Fase F concluída |
| Migrar visual (Fase G) introduzir regressão de layout | Fazer por último, isolado, com o app já funcionalmente pronto — mais fácil de revisar sozinho |

---

## 11. Perguntas em aberto

Nenhuma. As 3 pendências desta rodada foram resolvidas e já estão refletidas
na seção 2 (Decisões tomadas) e na seção 4 (permissão de escritório + de
dispositivo). Documento pronto pra virar implementação quando o Caio der
o sinal.
