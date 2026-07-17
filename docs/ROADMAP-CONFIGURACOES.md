# Roadmap — Tela de Configurações

**Data:** 17-07-2026
**Escopo:** Reestruturar `/configuracoes` como hub central do escritório e do perfil

---

## Objetivo

Transformar a tela de Configurações (atualmente somente leitura com placeholder) em uma página funcional com abas, onde o usuário gerencia seu perfil, dados do escritório, equipe, segurança e preferências.

---

## Estrutura Atual

```
/configuracoes
  ├── Meu perfil (read-only: nome, email, papel)
  ├── Notificações (placeholder, sem funcionalidade)
  ├── Aparência (selector de tema — já funciona)
  └── Integrações (não existe)
```

**Problemas:**
- Perfil somente leitura
- Sem editar dados do escritório
- Sem alterar senha
- Sem gerenciar equipe
- Sem excluir conta
- Notificações é placeholder

---

## Estrutura Proposta — 6 Abas

### Aba 1: Meu Perfil

**Campos:**

| Campo | Fonte | Tipo | Editável |
|-------|-------|------|----------|
| Nome | `users.name` | text | ✅ |
| Email | `users.email` | email | ❌ (somente leitura) |
| Telefone | `users.phone` | tel | ✅ |
| OAB | `users.oab_number` + `users.oab_uf` | text + select | ✅ |
| Papel | `users.role` | badge | ❌ |
| Membro desde | `users.created_at` | date | ❌ |
| Avatar | `users.avatar_url` | upload | ✅ |

**Ações:**
- Salvar alterações (`UPDATE users SET ...`)
- Upload de foto (Supabase Storage)
- Mostrar badge do papel com cor (owner=verde, lawyer=azul, staff=cinza)

**Validações:**
- Nome obrigatório
- Telefone formato BR
- OAB só números

---

### Aba 2: Escritório

**Campos:**

| Campo | Fonte | Tipo | Editável |
|-------|-------|------|----------|
| Nome | `tenants.name` | text | ✅ |
| Slug | `tenants.slug` | text | ✅ (com aviso) |
| CNPJ | `tenants.cnpj` | text | ✅ |
| Cidade | `tenants.city` | text | ✅ |
| UF | `tenants.state` | select | ✅ |
| Telefone | `tenants.phone` | tel | ✅ |
| Email | `tenants.email` | email | ✅ |
| Logo | `tenants.logo_url` | upload | ✅ |
| Data de criação | `tenants.created_at` | date | ❌ |

**Ações:**
- Salvar alterações (`UPDATE tenants SET ...`)
- Upload de logo (Supabase Storage)
- Editar slug (com aviso: "Isso pode quebrar links existentes")

**Validações:**
- Nome obrigatório
- Slug: só minúsculas, números, hífens
- CNPJ formato XX.XXX.XXX/XXXX-XX

---

### Aba 3: OABs do Escritório

**Tabela:** `escritorio_oabs`

| Campo | Fonte | Tipo | Editável |
|-------|-------|------|----------|
| Número OAB | `escritorio_oabs.oab_number` | text | ✅ |
| UF | `escritorio_oabs.oab_uf` | select | ✅ |
| Principal | `escritorio_oabs.is_primary` | toggle | ✅ |
| Vinculada a | `users.name` (join) | text | ❌ |

**Ações:**
- Adicionar nova OAB
- Remover OAB
- Definir como principal
- Máximo: 10 OABs por escritório

**Regras:**
- Só números no campo OAB
- UF obrigatória
- Não pode duplicar (unique constraint já existe)
- Pelo menos 1 OAB principal

---

### Aba 4: Equipe

**Seções:**

#### 4.1 Membros Ativos

| Campo | Fonte | Editável |
|-------|-------|----------|
| Nome | `users.name` | ❌ |
| Email | `users.email` | ❌ |
| Papel | `users.role` | ✅ (select, owner só) |
| Status | `users.is_active` | ✅ (toggle, owner só) |
| Último acesso | `users.last_login_at` | ❌ |

**Ações (owner apenas):**
- Alterar papel de membro
- Desativar membro (`is_active = false`)
- Remover membro (`tenant_id = null`)
- Reativar membro

#### 4.2 Convidar Membro

| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| Email | email | ✅ |
| Papel | select (advogado/equipe/sócio) | ✅ |

**Ações:**
- Criar convite (`createInvite()`)
- Mostrar feedback de sucesso/erro

#### 4.3 Convites Pendentes

| Campo | Fonte |
|-------|-------|
| Email | `tenant_invites.email` |
| Papel | `tenant_invites.role` |
| Enviado por | `users.name` (join) |
| Status | `tenant_invites.status` |
| Expira em | `tenant_invites.expires_at` |

**Ações (owner apenas):**
- Revogar convite (`DELETE FROM tenant_invites`)
- Reenviar convite (futuro)

**Regras:**
- Convites expiram em 7 dias
- Só owner pode gerenciar equipe
- Não pode remover a si mesmo

---

### Aba 5: Segurança

**Seções:**

#### 5.1 Alterar Senha

| Campo | Tipo |
|-------|------|
| Senha atual | password |
| Nova senha | password |
| Confirmar nova senha | password |

**Ações:**
- Chamar `supabase.auth.updateUser({ password })`
- Validação: senhas coincidem, mínimo 8 caracteres

#### 5.2 Sessões Ativas (futuro)

| Campo | Fonte |
|-------|-------|
| Dispositivo | user-agent |
| IP | request |
| Último acesso | timestamp |

**Ações:**
- Encerrar sessão
- Encerrar todas as outras sessões

#### 5.3 Excluir Conta

**Aviso:** "Esta ação é irreversível. Todos os seus dados serão removidos."

**Ações:**
- Confirmar com AlertDialog
- Chamar edge function para deletar user
- Redirect para `/login?success=account_deleted`

**Regras:**
- Só owner pode excluir a si mesmo
- Se for o último owner, não pode excluir
- Dados do escritório são mantidos (soft delete) ou removidos (hard delete) — definir

---

### Aba 6: Notificações

**Campos (futuro):**

| Campo | Tipo | Default |
|-------|------|---------|
| Email — Novo processo | toggle | true |
| Email — Prazo próximo | toggle | true |
| Email — Convite recebido | toggle | true |
| Email — Relatório semanal | toggle | false |
| Push — Novo processo | toggle | false |
| Push — Prazo próximo | toggle | true |

**Status atual:** Placeholder. Implementar quando houver sistema de notificações.

---

## Layout Proposto

```
┌─────────────────────────────────────────────────────┐
│  Configurações                              [Badge] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [Perfil] [Escritório] [OABs] [Equipe] [Segurança] [Notificações] │
│                                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  (conteúdo da aba selecionada)                      │
│                                                     │
│                                                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Responsivo:** Abas viram dropdown no mobile.

---

## Server Actions Necessárias

### `configuracoes/actions.ts`

```ts
// Perfil
updateProfile(formData)     // UPDATE users
uploadAvatar(file)          // Supabase Storage → users.avatar_url

// Escritório
updateTenant(formData)      // UPDATE tenants
uploadLogo(file)            // Supabase Storage → tenants.logo_url

// OABs
addOab(formData)            // INSERT escritorio_oabs
removeOab(id)               // DELETE escritorio_oabs
setPrimaryOab(id)           // UPDATE escritorio_oabs SET is_primary

// Equipe
updateMemberRole(userId, role)  // UPDATE users SET role
deactivateMember(userId)        // UPDATE users SET is_active = false
removeMember(userId)            // UPDATE users SET tenant_id = NULL
revokeInvite(inviteId)          // DELETE tenant_invites

// Segurança
changePassword(formData)    // supabase.auth.updateUser
deleteAccount()             // Edge function
```

---

## Guardrails de Segurança

| Ação | Quem pode | Guard |
|------|-----------|-------|
| Editar próprio perfil | Qualquer membro | `auth.uid() === user.id` |
| Editar escritório | Owner | `requireOwner()` |
| Gerenciar OABs | Owner | `requireOwner()` |
| Alterar papel de membro | Owner | `requireOwner()` |
| Remover membro | Owner | `requireOwner()` |
| Revogar convite | Owner | `requireOwner()` |
| Alterar senha | Qualquer membro | `auth.uid() === user.id` |
| Excluir conta | Owner (último) | `requireOwner()` + check último owner |

---

## Migration Necessária

Nenhuma migration nova. Todas as tabelas e colunas já existem:
- `users.name`, `users.phone`, `users.oab_number`, `users.oab_uf`, `users.avatar_url`
- `tenants.name`, `tenants.slug`, `tenants.cnpj`, `tenants.city`, `tenants.state`, `tenants.phone`, `tenants.email`, `tenants.logo_url`
- `escritorio_oabs.tenant_id`, `escritorio_oabs.oab_number`, `escritorio_oabs.oab_uf`, `escritorio_oabs.is_primary`
- `tenant_invites.*`

Único ajuste possível: adicionar coluna `users.timezone` se necessário.

---

## Prioridades de Implementação

| Fase | Itens | Esforço |
|------|-------|---------|
| **1 — Perfil** | Editar nome, telefone, OAB, upload avatar | ~3h |
| **2 — Escritório** | Editar dados do escritório, upload logo | ~3h |
| **3 — OABs** | CRUD de OABs do escritório | ~2h |
| **4 — Equipe** | Editar papéis, desativar, revogar convite | ~4h |
| **5 — Segurança** | Alterar senha, excluir conta | ~3h |
| **6 — Notificações** | Toggles (quando houver backend) | ~2h |

**Total estimado:** ~17h

---

## Arquivos a Criar/Modificar

### Novos
- `src/app/(platform)/(tenant)/configuracoes/perfil/page.tsx`
- `src/app/(platform)/(tenant)/configuracoes/escritorio/page.tsx`
- `src/app/(platform)/(tenant)/configuracoes/oabs/page.tsx`
- `src/app/(platform)/(tenant)/configuracoes/equipe/page.tsx`
- `src/app/(platform)/(tenant)/configuracoes/seguranca/page.tsx`
- `src/app/(platform)/(tenant)/configuracoes/notificacoes/page.tsx`
- `src/app/(platform)/(tenant)/configuracoes/actions.ts`

### Modificar
- `src/app/(platform)/(tenant)/configuracoes/page.tsx` → redirect para `/configuracoes/perfil`

### Manter
- `src/components/tenant/appearance-settings.tsx` → continuar como componente

---

## Decisões Pendentes

| Questão | Opções | Recomendação |
|---------|--------|--------------|
| Excluir conta — hard delete ou soft delete? | Hard = dados somem / Soft = dados ficam anonimizados | Soft delete (mantém dados jurídicos) |
| Último owner pode sair? | Sim / Não | Não — precisa transferir ownership primeiro |
| Upload de avatar — onde salvar? | Supabase Storage / Uploadcare / Cloudinary | Supabase Storage (já configurado) |
| Timezone — adicionar coluna? | Sim / Não | Sim — importante para agenda e prazos |
