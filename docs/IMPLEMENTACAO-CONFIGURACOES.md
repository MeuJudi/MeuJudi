# Implementação — Tela de Configurações

**Versão:** 1.0
**Data:** 17-07-2026
**Pré-requisitos:** Onboarding completo funcionando

---

## Visão Geral

Transformar a página `/configuracoes` (atualmente somente leitura) em uma página com abas para gerenciar perfil, escritório, OABs, equipe, segurança e notificações.

### Estrutura de Rotas

```
/configuracoes              → redirect para /configuracoes/perfil
/configuracoes/perfil       → Meu perfil (editável)
/configuracoes/escritorio   → Dados do escritório
/configuracoes/oabs         → OABs vinculadas
/configuracoes/equipe       → Membros e convites
/configuracoes/seguranca    → Senha e exclusão
/configuracoes/notificacoes → Preferências (placeholder)
```

---

## Componente Shell — Abas

### `configuracoes/layout.tsx`

Criar layout compartilhado com navegação por abas.

```tsx
// src/app/(platform)/(tenant)/configuracoes/layout.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/configuracoes/perfil", label: "Meu perfil" },
  { href: "/configuracoes/escritorio", label: "Escritório" },
  { href: "/configuracoes/oabs", label: "OABs" },
  { href: "/configuracoes/equipe", label: "Equipe" },
  { href: "/configuracoes/seguranca", label: "Segurança" },
  { href: "/configuracoes/notificacoes", label: "Notificações" },
];

export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="w-full space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Configurações</h1>
      </header>

      <nav className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              pathname === tab.href
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div>{children}</div>
    </div>
  );
}
```

### Responsivo (Mobile)

No mobile, as abas viram um select dropdown:

```tsx
// Componente: ConfiguracoesTabsMobile
<select
  value={pathname}
  onChange={(e) => router.push(e.target.value)}
  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm md:hidden"
>
  {tabs.map((tab) => (
    <option key={tab.href} value={tab.href}>{tab.label}</option>
  ))}
</select>
```

---

## Aba 1 — Meu Perfil

### Rota

`/configuracoes/perfil`

### Campos

| Campo | Name | Tipo | Editável | Validacao |
|-------|------|------|----------|-----------|
| Nome | `name` | text | ✅ | Obrigatório |
| Email | `email` | email | ❌ | — |
| Telefone | `phone` | tel | ✅ | Formato BR |
| OAB | `oab_number` | text | ✅ | Só números |
| UF da OAB | `oab_uf` | select | ✅ | 27 UFs |
| Avatar | `avatar_url` | file | ✅ | Image, max 2MB |
| Papel | `role` | badge | ❌ | — |
| Membro desde | `created_at` | date | ❌ | — |

### Layout

```
┌─────────────────────────────────────┐
│  Meu Perfil                         │
├─────────────────────────────────────┤
│                                     │
│  ┌────────┐  Nome                   │
│  │ Avatar │  ┌─────────────────┐    │
│  │  📷    │  │ João Silva      │    │
│  │ Upload │  └─────────────────┘    │
│  └────────┘                         │
│                                     │
│  Email                               │
│  ┌─────────────────────────────┐    │
│  │ joao@silva.com (somente leitura)│
│  └─────────────────────────────┘    │
│                                     │
│  Telefone                           │
│  ┌─────────────────────────────┐    │
│  │ (41) 99999-8888             │    │
│  └─────────────────────────────┘    │
│                                     │
│  OAB              UF da OAB         │
│  ┌──────────────┐ ┌──────────────┐  │
│  │ 67553        │ │ PR       ▼  │  │
│  └──────────────┘ └──────────────┘  │
│                                     │
│  Papel: Advogado(a) (badge)         │
│  Membro desde: 17/07/2026           │
│                                     │
│           [ Salvar ]                │
└─────────────────────────────────────┘
```

### Server Actions

```ts
// configuracoes/actions.ts

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Não autenticado");
  
  const { error } = await supabase
    .from("users")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim() || null,
      oab_number: String(formData.get("oab_number") ?? "").trim() || null,
      oab_uf: String(formData.get("oab_uf") ?? "").trim().toUpperCase() || null,
    })
    .eq("id", user.id);
  
  if (error) throw error;
  
  revalidatePath("/configuracoes/perfil");
  return { success: true };
}

export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Não autenticado");
  
  const file = formData.get("file") as File;
  const fileExt = file.name.split(".").pop();
  const fileName = `${user.id}/avatar.${fileExt}`;
  
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(fileName, file, { upsert: true });
  
  if (uploadError) throw uploadError;
  
  const { data: { publicUrl } } = supabase.storage
    .from("avatars")
    .getPublicUrl(fileName);
  
  const { error: updateError } = await supabase
    .from("users")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);
  
  if (updateError) throw updateError;
  
  revalidatePath("/configuracoes/perfil");
  return { url: publicUrl };
}
```

### Arquivos

| Arquivo | Ação |
|---------|------|
| `configuracoes/layout.tsx` | Criar (layout com abas) |
| `configuracoes/perfil/page.tsx` | Criar |
| `configuracoes/actions.ts` | Criar |

---

## Aba 2 — Escritório

### Rota

`/configuracoes/escritorio`

### Campos

| Campo | Name | Tipo | Editável | Validacao |
|-------|------|------|----------|-----------|
| Nome | `name` | text | ✅ | Obrigatório |
| Slug | `slug` | text | ✅ | Minúsculas, números, hífens |
| CNPJ | `cnpj` | text | ✅ | Formato CNPJ |
| Cidade | `city` | text | ✅ | — |
| UF | `state` | select | ✅ | 27 UFs |
| Telefone | `phone` | tel | ✅ | Formato BR |
| Email | `email` | email | ✅ | — |
| Logo | `logo_url` | file | ✅ | Image, max 2MB |
| Criado em | `created_at` | date | ❌ | — |

### Layout

```
┌─────────────────────────────────────┐
│  Dados do Escritório                │
├─────────────────────────────────────┤
│                                     │
│  ┌────────┐  Nome do escritório     │
│  │ Logo   │  ┌─────────────────┐    │
│  │  📷    │  │ Silva Advocacia │    │
│  │ Upload │  └─────────────────┘    │
│  └────────┘                         │
│                                     │
│  Slug (URL do escritório)           │
│  ┌─────────────────────────────┐    │
│  │ silva-advocacia             │    │
│  └─────────────────────────────┘    │
│  ⚠️ Alterar o slug pode quebrar links existentes │
│                                     │
│  CNPJ              Telefone         │
│  ┌──────────────┐ ┌──────────────┐  │
│  │ 00.000.000/  │ │ (41) 3333-   │  │
│  │ 0000-00      │ │ 4444         │  │
│  └──────────────┘ └──────────────┘  │
│                                     │
│  Cidade              UF             │
│  ┌──────────────┐ ┌──────────────┐  │
│  │ Curitiba     │ │ PR       ▼  │  │
│  └──────────────┘ └──────────────┘  │
│                                     │
│  Email do escritório                │
│  ┌─────────────────────────────┐    │
│  │ contato@silva.com.br       │    │
│  └─────────────────────────────┘    │
│                                     │
│  Criado em: 17/07/2026              │
│                                     │
│           [ Salvar ]                │
└─────────────────────────────────────┘
```

### Server Actions

```ts
export async function updateTenant(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Não autenticado");
  
  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();
  
  if (!profile || profile.role !== "owner") {
    throw new Error("Sem permissão");
  }
  
  const { error } = await supabase
    .from("tenants")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      slug: String(formData.get("slug") ?? "").trim().toLowerCase(),
      cnpj: String(formData.get("cnpj") ?? "").trim() || null,
      city: String(formData.get("city") ?? "").trim() || null,
      state: String(formData.get("state") ?? "").trim().toUpperCase() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
    })
    .eq("id", profile.tenant_id);
  
  if (error) throw error;
  
  revalidatePath("/configuracoes/escritorio");
  return { success: true };
}

export async function uploadLogo(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Não autenticado");
  
  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();
  
  if (!profile || profile.role !== "owner") {
    throw new Error("Sem permissão");
  }
  
  const file = formData.get("file") as File;
  const fileExt = file.name.split(".").pop();
  const fileName = `${profile.tenant_id}/logo.${fileExt}`;
  
  const { error: uploadError } = await supabase.storage
    .from("tenant-logos")
    .upload(fileName, file, { upsert: true });
  
  if (uploadError) throw uploadError;
  
  const { data: { publicUrl } } = supabase.storage
    .from("tenant-logos")
    .getPublicUrl(fileName);
  
  const { error: updateError } = await supabase
    .from("tenants")
    .update({ logo_url: publicUrl })
    .eq("id", profile.tenant_id);
  
  if (updateError) throw updateError;
  
  revalidatePath("/configuracoes/escritorio");
  return { url: publicUrl };
}
```

### Storage Bucket

Criar bucket `tenant-logos` no Supabase Dashboard:
- Nome: `tenant-logos`
- Público: true
- Tamanho máximo: 2MB
- Tipos permitidos: image/png, image/jpeg, image/webp, image/svg+xml

### Arquivos

| Arquivo | Ação |
|---------|------|
| `configuracoes/escritorio/page.tsx` | Criar |
| `configuracoes/actions.ts` | Adicionar `updateTenant`, `uploadLogo` |

---

## Aba 3 — OABs do Escritório

### Rota

`/configuracoes/oabs`

### Tabela

`escritorio_oabs`

| Campo | Tipo | Editável |
|-------|------|----------|
| Número OAB | text | ✅ |
| UF | select | ✅ |
| Principal | toggle | ✅ |
| Vinculada a | text (join users) | ❌ |

### Layout

```
┌─────────────────────────────────────┐
│  OABs do Escritório                 │
├─────────────────────────────────────┤
│                                     │
│  Adicionar nova OAB                 │
│  ┌──────────────┐ ┌──────────────┐  │
│  │ Número OAB   │ │ UF       ▼  │  │
│  └──────────────┘ └──────────────┘  │
│  [ + Adicionar ]                     │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ OAB    UF    Vinculada a    │    │
│  ├─────────────────────────────┤    │
│  │ 67553  PR    João Silva  ★  │    │
│  │ 88221  SP    Maria Santos   │    │
│  └─────────────────────────────┘    │
│                                     │
│  ★ = OAB principal                  │
└─────────────────────────────────────┘
```

### Server Actions

```ts
export async function addOab(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Não autenticado");
  
  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();
  
  if (!profile || profile.role !== "owner") {
    throw new Error("Sem permissão");
  }
  
  const oabNumber = String(formData.get("oab_number") ?? "").trim();
  const oabUf = String(formData.get("oab_uf") ?? "").trim().toUpperCase();
  
  if (!oabNumber || !oabUf) {
    throw new Error("Número e UF são obrigatórios");
  }
  
  // Verificar se já existe
  const { data: existing } = await supabase
    .from("escritorio_oabs")
    .select("id")
    .eq("tenant_id", profile.tenant_id)
    .eq("oab_number", oabNumber)
    .eq("oab_uf", oabUf)
    .maybeSingle();
  
  if (existing) {
    throw new Error("Esta OAB já está vinculada ao escritório");
  }
  
  const { error } = await supabase
    .from("escritorio_oabs")
    .insert({
      tenant_id: profile.tenant_id,
      user_id: user.id,
      oab_number: oabNumber,
      oab_uf: oabUf,
      is_primary: false,
    });
  
  if (error) throw error;
  
  revalidatePath("/configuracoes/oabs");
  return { success: true };
}

export async function removeOab(oabId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Não autenticado");
  
  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();
  
  if (!profile || profile.role !== "owner") {
    throw new Error("Sem permissão");
  }
  
  const { error } = await supabase
    .from("escritorio_oabs")
    .delete()
    .eq("id", oabId)
    .eq("tenant_id", profile.tenant_id);
  
  if (error) throw error;
  
  revalidatePath("/configuracoes/oabs");
  return { success: true };
}

export async function setPrimaryOab(oabId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Não autenticado");
  
  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();
  
  if (!profile || profile.role !== "owner") {
    throw new Error("Sem permissão");
  }
  
  // Resetar todas para não-principal
  await supabase
    .from("escritorio_oabs")
    .update({ is_primary: false })
    .eq("tenant_id", profile.tenant_id);
  
  // Definir a selecionada como principal
  const { error } = await supabase
    .from("escritorio_oabs")
    .update({ is_primary: true })
    .eq("id", oabId)
    .eq("tenant_id", profile.tenant_id);
  
  if (error) throw error;
  
  revalidatePath("/configuracoes/oabs");
  return { success: true };
}
```

### Arquivos

| Arquivo | Ação |
|---------|------|
| `configuracoes/oabs/page.tsx` | Criar |
| `configuracoes/actions.ts` | Adicionar `addOab`, `removeOab`, `setPrimaryOab` |

---

## Aba 4 — Equipe

### Rota

`/configuracoes/equipe`

### Seções

#### 4.1 Membros Ativos

| Campo | Fonte | Editável | Quem |
|-------|-------|----------|------|
| Avatar | `users.avatar_url` | ❌ | — |
| Nome | `users.name` | ❌ | — |
| Email | `users.email` | ❌ | — |
| Papel | `users.role` | ✅ | Owner |
| Status | `users.is_active` | ✅ | Owner |
| Último acesso | `users.last_login_at` | ❌ | — |

#### 4.2 Convidar Membro

| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| Email | email | ✅ |
| Papel | select | ✅ |

#### 4.3 Convites Pendentes

| Campo | Fonte |
|-------|-------|
| Email | `tenant_invites.email` |
| Papel | `tenant_invites.role` |
| Enviado por | `users.name` (join) |
| Status | `tenant_invites.status` |
| Expira em | `tenant_invites.expires_at` |

### Layout

```
┌─────────────────────────────────────┐
│  Equipe                             │
├─────────────────────────────────────┤
│                                     │
│  Membros ativos (3)                 │
│  ┌─────────────────────────────┐    │
│  │ 👤 João Silva   Owner    ● │    │
│  │    joao@silva.com           │    │
│  │                 [Alterar]   │    │
│  ├─────────────────────────────┤    │
│  │ 👤 Maria Santos Lawyer  ● │    │
│  │    maria@silva.com          │    │
│  │                 [Alterar]   │    │
│  ├─────────────────────────────┤    │
│  │ 👤 Pedro Costa   Staff   ● │    │
│  │    pedro@silva.com          │    │
│  │                 [Alterar]   │    │
│  └─────────────────────────────┘    │
│                                     │
│  Convidar membro                    │
│  ┌──────────────┐ ┌──────────────┐  │
│  │ Email        │ │ Papel     ▼  │  │
│  └──────────────┘ └──────────────┘  │
│  [ Enviar convite ]                  │
│                                     │
│  Convites pendentes (1)             │
│  ┌─────────────────────────────┐    │
│  │ ana@silva.com  Lawyer  Pend │    │
│  │ Expira: 24/07/2026          │    │
│  │              [Revogar]      │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### Server Actions

```ts
export async function updateMemberRole(userId: string, newRole: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Não autenticado");
  
  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();
  
  if (!profile || profile.role !== "owner") {
    throw new Error("Somente o owner pode alterar papéis");
  }
  
  if (userId === user.id) {
    throw new Error("Não é possível alterar seu próprio papel");
  }
  
  const validRoles = ["lawyer", "staff", "owner"];
  if (!validRoles.includes(newRole)) {
    throw new Error("Papel inválido");
  }
  
  const { error } = await supabase
    .from("users")
    .update({ role: newRole })
    .eq("id", userId)
    .eq("tenant_id", profile.tenant_id);
  
  if (error) throw error;
  
  revalidatePath("/configuracoes/equipe");
  return { success: true };
}

export async function deactivateMember(userId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Não autenticado");
  
  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();
  
  if (!profile || profile.role !== "owner") {
    throw new Error("Somente o owner pode desativar membros");
  }
  
  if (userId === user.id) {
    throw new Error("Não é possível desativar a si mesmo");
  }
  
  const { error } = await supabase
    .from("users")
    .update({ is_active: false })
    .eq("id", userId)
    .eq("tenant_id", profile.tenant_id);
  
  if (error) throw error;
  
  revalidatePath("/configuracoes/equipe");
  return { success: true };
}

export async function removeMember(userId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Não autenticado");
  
  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();
  
  if (!profile || profile.role !== "owner") {
    throw new Error("Somente o owner pode remover membros");
  }
  
  if (userId === user.id) {
    throw new Error("Não é possível remover a si mesmo");
  }
  
  const { error } = await supabase
    .from("users")
    .update({ tenant_id: null, is_active: false })
    .eq("id", userId)
    .eq("tenant_id", profile.tenant_id);
  
  if (error) throw error;
  
  revalidatePath("/configuracoes/equipe");
  return { success: true };
}

export async function revokeInvite(inviteId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Não autenticado");
  
  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();
  
  if (!profile || profile.role !== "owner") {
    throw new Error("Somente o owner pode revogar convites");
  }
  
  const { error } = await supabase
    .from("tenant_invites")
    .delete()
    .eq("id", inviteId)
    .eq("tenant_id", profile.tenant_id);
  
  if (error) throw error;
  
  revalidatePath("/configuracoes/equipe");
  return { success: true };
}
```

### Arquivos

| Arquivo | Ação |
|---------|------|
| `configuracoes/equipe/page.tsx` | Criar |
| `configuracoes/actions.ts` | Adicionar `updateMemberRole`, `deactivateMember`, `removeMember`, `revokeInvite` |

---

## Aba 5 — Segurança

### Rota

`/configuracoes/seguranca`

### Seções

#### 5.1 Alterar Senha

| Campo | Tipo |
|-------|------|
| Senha atual | password |
| Nova senha | password |
| Confirmar nova senha | password |

#### 5.2 Excluir Conta

**Aviso:** "Esta ação é irreversível."

**Ações:**
- Confirmar com AlertDialog
- Chamar edge function
- Redirect para `/login`

### Layout

```
┌─────────────────────────────────────┐
│  Segurança                          │
├─────────────────────────────────────┤
│                                     │
│  Alterar senha                      │
│  ┌─────────────────────────────┐    │
│  │ Senha atual                 │    │
│  │ ┌───────────────────────┐   │    │
│  │ │ ••••••••              │   │    │
│  │ └───────────────────────┘   │    │
│  │                             │    │
│  │ Nova senha                  │    │
│  │ ┌───────────────────────┐   │    │
│  │ │ ••••••••              │   │    │
│  │ └───────────────────────┘   │    │
│  │                             │    │
│  │ Confirmar nova senha        │    │
│  │ ┌───────────────────────┐   │    │
│  │ │ ••••••••              │   │    │
│  │ └───────────────────────┘   │    │
│  │                             │    │
│  │        [ Alterar senha ]    │    │
│  └─────────────────────────────┘    │
│                                     │
│  ───────────────────────────────    │
│                                     │
│  Zona de perigo                     │
│  ┌─────────────────────────────┐    │
│  │ ⚠️ Excluir conta            │    │
│  │ Esta ação é irreversível.   │    │
│  │ Todos os seus dados serão   │    │
│  │ removidos permanentemente.  │    │
│  │                             │    │
│  │ [ Excluir minha conta ]     │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### Server Actions

```ts
export async function changePassword(formData: FormData) {
  const supabase = await createClient();
  
  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  
  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new Error("Todos os campos são obrigatórios");
  }
  
  if (newPassword.length < 8) {
    throw new Error("A nova senha deve ter pelo menos 8 caracteres");
  }
  
  if (newPassword !== confirmPassword) {
    throw new Error("As senhas não coincidem");
  }
  
  // Verificar senha atual
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error("Usuário não encontrado");
  
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  
  if (signInError) {
    throw new Error("Senha atual incorreta");
  }
  
  // Atualizar senha
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  
  if (error) throw error;
  
  return { success: true };
}

export async function deleteAccount() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Não autenticado");
  
  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id, role, is_owner")
    .eq("id", user.id)
    .single();
  
  if (!profile) throw new Error("Perfil não encontrado");
  
  // Verificar se é o último owner
  if (profile.role === "owner") {
    const { count } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", profile.tenant_id)
      .eq("role", "owner")
      .eq("is_active", true);
    
    if (count && count <= 1) {
      throw new Error("Você é o último owner. Transfira a propriedade antes de excluir sua conta.");
    }
  }
  
  // Soft delete: desativar conta
  const { error } = await supabase
    .from("users")
    .update({
      is_active: false,
      name: "Conta excluída",
      email: `excluido-${user.id}@meujudi.com`,
      phone: null,
      oab_number: null,
      oab_uf: null,
      avatar_url: null,
    })
    .eq("id", user.id);
  
  if (error) throw error;
  
  // Fazer logout
  await supabase.auth.signOut();
  
  redirect("/login?success=account_deleted");
}
```

### Arquivos

| Arquivo | Ação |
|---------|------|
| `configuracoes/seguranca/page.tsx` | Criar |
| `configuracoes/actions.ts` | Adicionar `changePassword`, `deleteAccount` |

---

## Aba 6 — Notificações (Placeholder)

### Rota

`/configuracoes/notificacoes`

### Layout

```
┌─────────────────────────────────────┐
│  Notificações                       │
├─────────────────────────────────────┤
│                                     │
│  Em breve você poderá configurar    │
│  suas preferências de notificação.  │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ 🔔 Funcionalidade em        │    │
│  │    desenvolvimento          │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

### Arquivos

| Arquivo | Ação |
|---------|------|
| `configuracoes/notificacoes/page.tsx` | Criar (placeholder) |

---

## Resumo de Arquivos

### Criar

| Arquivo | Descrição |
|---------|-----------|
| `configuracoes/layout.tsx` | Layout com abas |
| `configuracoes/perfil/page.tsx` | Aba perfil |
| `configuracoes/escritorio/page.tsx` | Aba escritório |
| `configuracoes/oabs/page.tsx` | Aba OABs |
| `configuracoes/equipe/page.tsx` | Aba equipe |
| `configuracoes/seguranca/page.tsx` | Aba segurança |
| `configuracoes/notificacoes/page.tsx` | Aba notificações (placeholder) |
| `configuracoes/actions.ts` | Todas as server actions |

### Modificar

| Arquivo | Mudança |
|---------|---------|
| `configuracoes/page.tsx` | Redirect para `/configuracoes/perfil` |

### Criar (Supabase)

| Recurso | Descrição |
|---------|-----------|
| Bucket `tenant-logos` | Storage para logos |

### Manter

| Arquivo | Descrição |
|---------|-----------|
| `components/tenant/appearance-settings.tsx` | Continuar como componente |

---

## Ordem de Implementação

1. **Layout** — Criar `layout.tsx` com abas
2. **Perfil** — Criar `perfil/page.tsx`
3. **Escritório** — Criar `escritorio/page.tsx`
4. **OABs** — Criar `oabs/page.tsx`
5. **Equipe** — Criar `equipe/page.tsx`
6. **Segurança** — Criar `seguranca/page.tsx`
7. **Notificações** — Criar `notificacoes/page.tsx`
8. **Actions** — Criar `actions.ts` com todas as server actions
9. **Redirect** — Atualizar `page.tsx` para redirect
10. **Storage** — Criar bucket `tenant-logos`
11. **Testar** — Todas as abas

---

## Checklist

- [ ] `layout.tsx` criado com abas
- [ ] `perfil/page.tsx` criado
- [ ] `escritorio/page.tsx` criado
- [ ] `oabs/page.tsx` criado
- [ ] `equipe/page.tsx` criado
- [ ] `seguranca/page.tsx` criado
- [ ] `notificacoes/page.tsx` criado
- [ ] `actions.ts` criado
- [ ] `page.tsx` atualizado (redirect)
- [ ] Bucket `tenant-logos` criado
- [ ] TypeScript sem erros
- [ ] Teste todas as abas
