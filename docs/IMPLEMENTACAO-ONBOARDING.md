# Implementação — Onboarding Wizard Completo

**Versão:** 1.0
**Data:** 17-07-2026
**Pré-requisitos:** Onboarding básico já funcionando (2 steps, stepper, resend email)

---

## Visão Geral

Expandir o Onboarding Wizard de 2 para 3 steps, com novos campos e funcionalidade de convite de equipe.

### Fluxo Final

```
Step 1: Dados do Escritório (obrigatório)
Step 2: Seus Dados (obrigatório)
Step 3: Sua Equipe (opcional, pode pular)
Tela de Sucesso
```

---

## Pré-Requisitos

### Migration

```sql
-- Adicionar coluna timezone na tabela users (se necessário)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/Sao_Paulo';
```

### Função SQL existente

A função `complete_tenant_onboarding` precisa de novos parâmetros:
- `p_phone` → `tenants.phone`
- `p_cnpj` → `tenants.cnpj`

---

## Step 1 — Dados do Escritório

### Campos

| Campo | Name | Tipo | Obrigatório | Validação |
|-------|------|------|-------------|-----------|
| Nome do escritório | `tenant_name` | text | ✅ | Não vazio |
| CNPJ | `cnpj` | text | ❌ | Formato XX.XXX.XXX/XXXX-XX ou vazio |
| Cidade | `city` | text | ❌ | — |
| UF | `state` | select | ❌ | 27 UFs |
| Telefone | `phone` | tel | ❌ | Formato BR |

### Layout

```
┌─────────────────────────────────────┐
│  ● Escritório  ─  ○ Seus dados  ─  ○ Equipe  │
├─────────────────────────────────────┤
│                                     │
│  Nome do escritório *               │
│  ┌─────────────────────────────┐    │
│  │ Ex.: Silva Advocacia        │    │
│  └─────────────────────────────┘    │
│                                     │
│  CNPJ              Telefone         │
│  ┌──────────────┐ ┌──────────────┐  │
│  │ 00.000.000/  │ │ (00) 00000-  │  │
│  │ 0000-00      │ │ 0000         │  │
│  └──────────────┘ └──────────────┘  │
│                                     │
│  Cidade              UF             │
│  ┌──────────────┐ ┌──────────────┐  │
│  │ Curitiba     │ │ PR       ▼  │  │
│  └──────────────┘ └──────────────┘  │
│                                     │
│              [ Próximo → ]          │
└─────────────────────────────────────┘
```

### Validações

- `tenant_name`: obrigatório, mínimo 2 caracteres
- `cnpj`: se preenchido, deve ter 14 dígitos (máscara aplicada no input)
- `phone`: se preenchido, deve ter 10-11 dígitos

### Máscaras (-input patterns)

```ts
// CNPJ: 00.000.000/0000-00
function maskCnpj(value: string) {
  return value
    .replace(/\D/g, "")
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
    .slice(0, 18);
}

// Telefone: (00) 00000-0000 ou (00) 0000-0000
function maskPhone(value: string) {
  return value
    .replace(/\D/g, "")
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
    .slice(0, 15);
}
```

### Arquivos

- `src/app/(platform)/onboarding/onboarding-form.tsx` → adicionar campos no step 1
- `src/lib/masks.ts` → criar utilitários de máscara (novo)

---

## Step 2 — Seus Dados

### Campos

| Campo | Name | Tipo | Obrigatório | Validação |
|-------|------|------|-------------|-----------|
| Seu nome | `user_name` | text | ✅ | Não vazio |
| OAB principal | `oab_number` | text | ❌ | Só números |
| UF da OAB | `oab_uf` | select | ❌ | 27 UFs |
| Foto do perfil | `avatar` | file | ❌ | Image, max 2MB |

### Layout

```
┌─────────────────────────────────────┐
│  ● Escritório  ─  ● Seus dados  ─  ○ Equipe  │
├─────────────────────────────────────┤
│                                     │
│  Nome do escritório                 │
│  ┌─────────────────────────────┐    │
│  │ Silva Advocacia (read-only) │    │
│  └─────────────────────────────┘    │
│                                     │
│  Seu nome *                         │
│  ┌─────────────────────────────┐    │
│  │ João Silva                  │    │
│  └─────────────────────────────┘    │
│                                     │
│  OAB principal        UF da OAB     │
│  ┌──────────────┐ ┌──────────────┐  │
│  │ 67553        │ │ PR       ▼  │  │
│  └──────────────┘ └──────────────┘  │
│                                     │
│  Foto do perfil (opcional)          │
│  ┌──────────────┐                   │
│  │    📷        │  Arrastar ou      │
│  │   Upload     │  clicar           │
│  └──────────────┘                   │
│                                     │
│  [ ← Voltar ]    [ Próximo → ]     │
└─────────────────────────────────────┘
```

### Upload de Avatar

```ts
// Client-side
async function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  
  const response = await fetch("/onboarding/actions/uploadAvatar", {
    method: "POST",
    body: formData,
  });
  
  return response.json(); // { url: "..." }
}
```

### Server Action

```ts
// src/app/(platform)/onboarding/actions.ts
export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Não autenticado");
  
  const file = formData.get("file") as File;
  const fileExt = file.name.split(".").pop();
  const fileName = `${user.id}/avatar.${fileExt}`;
  
  const { error } = await supabase.storage
    .from("avatars")
    .upload(fileName, file, { upsert: true });
  
  if (error) throw error;
  
  const { data: { publicUrl } } = supabase.storage
    .from("avatars")
    .getPublicUrl(fileName);
  
  await supabase
    .from("users")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);
  
  return { url: publicUrl };
}
```

### Storage Bucket

Criar bucket `avatars` no Supabase Dashboard:
- Nome: `avatars`
- Público: true
- Tamanho máximo: 2MB
- Tipos permitidos: image/png, image/jpeg, image/webp

### Arquivos

- `src/app/(platform)/onboarding/onboarding-form.tsx` → adicionar campos no step 2
- `src/app/(platform)/onboarding/actions.ts` → adicionar `uploadAvatar`

---

## Step 3 — Sua Equipe (novo)

### Campos

| Campo | Name | Tipo | Obrigatório |
|-------|------|------|-------------|
| Email do convidado | `invite_email` | email | ✅ |
| Papel | `invite_role` | select | ✅ |

### Layout

```
┌─────────────────────────────────────┐
│  ● Escritório  ─  ● Seus dados  ─  ● Equipe  │
├─────────────────────────────────────┤
│                                     │
│  Convidar alguém para sua equipe?   │
│  Você pode pular esta etapa.        │
│                                     │
│  Email               Papel          │
│  ┌──────────────┐ ┌──────────────┐  │
│  │ email@...    │ │ Advogado  ▼ │  │
│  └──────────────┘ └──────────────┘  │
│  [ + Adicionar ]                     │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ Convites adicionados:       │    │
│  │                             │    │
│  │ maria@silva.com  Advogado   │    │
│  │ joao@silva.com   Equipe  ✕ │    │
│  └─────────────────────────────┘    │
│                                     │
│  [ ← Voltar ] [ Pular ] [ Concluir ]│
└─────────────────────────────────────┘
```

### Papéis (consistência com team/page.tsx)

```tsx
<select name="invite_role" defaultValue="lawyer">
  <option value="lawyer">Advogado(a)</option>
  <option value="staff">Equipe administrativa</option>
  <option value="owner">Sócio(a) / Responsável</option>
</select>
```

### Fluxo

1. Usuário preenche email + papel
2. Clica "Adicionar" → adiciona à lista local (state)
3. Pode adicionar vários
4. Pode remover da lista com ✕
5. Ao clicar "Concluir", envia todos os convites de uma vez

### Server Action

```ts
// src/app/(platform)/onboarding/actions.ts
export async function createInvites(invites: Array<{ email: string; role: string }>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Não autenticado");
  
  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  
  if (!profile?.tenant_id) throw new Error("Tenant não encontrado");
  
  const results = [];
  for (const invite of invites) {
    const { error } = await supabase
      .from("tenant_invites")
      .insert({
        tenant_id: profile.tenant_id,
        email: invite.email.toLowerCase(),
        role: invite.role,
        invited_by: user.id,
      });
    
    results.push({ email: invite.email, error: error?.message });
  }
  
  return results;
}
```

### Validações

- Email válido
- Não pode convidar a si mesmo
- Não pode convidar email já existente na equipe
- Papel válido (lawyer, staff, owner)
- Máximo 10 convites por onboarding

### Arquivos

- `src/app/(platform)/onboarding/onboarding-form.tsx` → criar step 3 (novo)
- `src/app/(platform)/onboarding/actions.ts` → adicionar `createInvites`

---

## Tela de Sucesso

### Layout

```
┌─────────────────────────────────────┐
│                                     │
│              ✅                      │
│                                     │
│    Seu escritório está pronto!      │
│                                     │
│    Silva Advocacia foi criado       │
│    com sucesso.                     │
│                                     │
│    2 convites foram enviados.       │
│                                     │
│    Redirecionando para o painel...  │
│                                     │
│    [ Ir para o painel agora ]       │
│                                     │
└─────────────────────────────────────┘
```

### Lógica

```tsx
if (step === "success") {
  return (
    <Card>
      <CardContent className="p-8 text-center">
        <CheckCircle2 className="h-14 w-14 text-green-600 mx-auto" />
        <h2>Seu escritório está pronto!</h2>
        <p>{form.tenant_name} foi criado com sucesso.</p>
        {inviteCount > 0 && (
          <p>{inviteCount} convite{inviteCount > 1 ? 's' : ''} {inviteCount > 1 ? 'foram enviados' : 'foi enviado'}.</p>
        )}
        <p>Redirecionando para o painel...</p>
        <Button asChild>
          <a href="/monitoramento">Ir para o painel agora</a>
        </Button>
      </CardContent>
    </Card>
  );
}
```

---

## Atualização da Server Action Principal

### `complete_tenant_onboarding` (SQL)

```sql
CREATE OR REPLACE FUNCTION public.complete_tenant_onboarding(
  p_tenant_name text,
  p_user_name text,
  p_city text default null,
  p_state text default null,
  p_oab_number text default null,
  p_oab_uf text default null,
  p_phone text default null,      -- NOVO
  p_cnpj text default null        -- NOVO
)
```

### `completeOnboarding` (Server Action)

```ts
export async function completeOnboarding(formData: FormData) {
  const supabase = await createClient();
  
  const { error } = await supabase.rpc("complete_tenant_onboarding", {
    p_tenant_name: String(formData.get("tenant_name") ?? "").trim(),
    p_user_name: String(formData.get("user_name") ?? "").trim(),
    p_city: String(formData.get("city") ?? ""),
    p_state: String(formData.get("state") ?? ""),
    p_oab_number: String(formData.get("oab_number") ?? ""),
    p_oab_uf: String(formData.get("oab_uf") ?? ""),
    p_phone: String(formData.get("phone") ?? ""),       // NOVO
    p_cnpj: String(formData.get("cnpj") ?? ""),         // NOVO
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
```

---

## Resumo de Arquivos

### Criar

| Arquivo | Descrição |
|---------|-----------|
| `src/lib/masks.ts` | Utilitários de máscara (CNPJ, telefone) |

### Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/app/(platform)/onboarding/onboarding-form.tsx` | Adicionar step 3, novos campos, upload avatar |
| `src/app/(platform)/onboarding/actions.ts` | Adicionar `uploadAvatar`, `createInvites` |
| `src/app/(platform)/onboarding/page.tsx` | Passar novos campos no initialData |
| `supabase/migrations/XXXXXX_add_onboarding_fields.sql` | Atualizar função SQL |

### Criar (Supabase)

| Recurso | Descrição |
|---------|-----------|
| Bucket `avatars` | Storage para fotos de perfil |
| Migration SQL | Novos parâmetros na função |

---

## Ordem de Implementação

1. **Migration SQL** — Adicionar parâmetros `p_phone` e `p_cnpj`
2. **Storage** — Criar bucket `avatars`
3. **Masks** — Criar `src/lib/masks.ts`
4. **Server Actions** — Adicionar `uploadAvatar` e `createInvites`
5. **Step 1** — Atualizar campos no onboarding-form
6. **Step 2** — Adicionar upload de avatar
7. **Step 3** — Criar step de convites
8. **Sucesso** — Criar tela de sucesso com resumo
9. **Testar** — Fluxo completo

---

## Checklist

- [ ] Migration SQL executada
- [ ] Bucket `avatars` criado
- [ ] `src/lib/masks.ts` criado
- [ ] `uploadAvatar` implementado
- [ ] `createInvites` implementado
- [ ] Step 1 com CNPJ, telefone
- [ ] Step 2 com upload avatar
- [ ] Step 3 com convites
- [ ] Tela de sucesso com resumo
- [ ] TypeScript sem erros
- [ ] Teste fluxo completo
