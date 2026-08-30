# MeuJudi — Planos de Implementação

## Índice

1. [Validação Manual de OAB (Super Admin)](#1-validação-manual-de-oab)
2. [Exclusão de Escritório + Usuários](#2-exclusão-de-escritório--usuários)
3. [Compartilhamento de Processos por OAB](#3-compartilhamento-de-processos-por-oab)
4. [Correções do ConfirmADV (já implementadas)](#4-correções-do-confirmadv)

---

## 1. Validação Manual de OAB

### Problema

O Super Admin não tem como validar a OAB de um membro da equipe manualmente. O fluxo atual só aceita via ConfirmADV (automático).

### Arquitetura Atual

- Validação requer Sync pareado + ConfirmaADV
- RPC `finalize_oab_validation()` atualiza `users.oab_validated_at` + `tenants.access_status`
- RPC só é acessível via `service_role`

### Solução

#### A. Nova Server Action (`admin/actions.ts`)

```typescript
export async function manuallyValidateOab(
  userId: string,
  tenantId: string,
  oabNumber: string,
  oabUf: string
)
```

**Lógica:**

1. Verificar se caller é `super_admin`
2. Verificar se `userId` pertence a `tenantId`
3. Chamar RPC `finalize_oab_validation()` via `service_role`
4. Inserir registro em `oab_validations` com `status = 'validada'` e `provider = 'manual'`
5. Registrar em `audit_logs`

#### B. UI na página do tenant (`admin/tenants/[id]/page.tsx`)

- Botão "Validar OAB manualmente"
- Modal com campos: selecionar membro, número OAB, UF
- Confirmação antes de executar

#### C. Validações

- OAB deve ter formato válido (números + UF 2 letras)
- Usuário deve estar ativo no tenant
- Tenant não pode estar suspenso

---

## 2. Exclusão de Escritório + Usuários

### Problema

Não existe mecanismo para o Super Admin excluir um escritório e seus dados.

### Arquitetura Atual

- `processos.tenant_id` tem `ON DELETE CASCADE`
- `users.tenant_id` tem `ON DELETE SET NULL` (usuários ficam órfãos)
- ~20 tabelas filhas com cascade

### Solução (sem compartilhamento de processos)

#### A. Nova Server Action (`admin/actions.ts`)

```typescript
export async function deleteTenantCompleto(tenantId: string)
```

**Lógica:**

1. Verificar se caller é `super_admin`
2. Buscar todos os `users` do tenant
3. Para cada user:
   - Deletar de `auth.users` (cascade deleta de `users`)
4. Deletar arquivos do Storage (logos, avatars)
5. Deletar o tenant (cascade automático em ~20 tabelas)
6. Registrar em `audit_logs` antes da exclusão

#### B. UI na página do tenant (`admin/tenants/[id]/page.tsx`)

- Botão vermelho "Excluir escritório"
- Modal de confirmação: digitar nome do escritório para confirmar
- Aviso: "Esta ação é irreversível"

#### C. Tabelas afetadas pelo cascade

| Tabela | Ação |
|--------|------|
| `processos` | DELETE CASCADE |
| `movimentacoes` | DELETE CASCADE (via processos) |
| `comunicacoes_mural` | DELETE CASCADE |
| `clientes` | DELETE CASCADE |
| `oab_validations` | DELETE CASCADE |
| `cs_devices` | DELETE CASCADE |
| `sync_tasks` | DELETE CASCADE |
| `escritorio_oabs` | DELETE CASCADE |
| `tenant_invites` | DELETE CASCADE |
| `audit_logs` | SET NULL (mantém registro) |
| `users` | SET NULL (depois DELETE individual) |

---

## 3. Compartilhamento de Processos por OAB

### Problema

Cada escritório tem sua própria cópia do mesmo processo. Se dois escritórios atuam no mesmo caso, cada um baixa dados independentes, duplicando trabalho e espaço.

### Objetivo

Um processo (CNJ) deve ser único no sistema. Quando um processo vem com várias OABs vinculadas, se qualquer uma dessas bater com outra conta, puxa direto o que já existe sem precisar baixar tudo do zero. Depois só vai atualizando.

### Arquitetura Atual

```
processos.tenant_id NOT NULL → 1 processo por tenant
unique (tenant_id, cnj) → mesmo CNJ pode existir N vezes
```

### Arquitetura Proposta

```
processos.tenant_id NULLABLE → processo é "público"
processo_participantes → junction table (processo ↔ tenant ↔ OAB)
unique (processo_id, oab_number, oab_uf) → 1 vinculação por OAB
```

### Fluxo de Compartilhamento

```
Escritório A baixa processo CNJ 0001234-56
  → Encontra OABs no processo: [132755/PR, 98765/SP, 11111/RJ]
  → Cria processo + vincula: OAB 132755/PR = Escritório A
  → Baixa movimentações, documentos, mural

Escritório B também tem OAB 98765/SP
  → PDPJ retorna CNJ 0001234-56 (já existe no banco)
  → Web verifica: OAB 98765/SP já está vinculada?
    ├── NÃO → Apenas vincula Escritório B ao processo existente
    └── SIM → Já tem acesso, só atualiza
  → NÃO baixa nada do zero, só herda o que já existe

Resultado: 1 processo, 2 escritórios vinculados, zero duplicação
```

### Regras de Vinculação

| Ação | O que acontece |
|------|---------------|
| **Sync encontra CNJ novo** | Cria processo + vincula OAB que descobriu |
| **Sync encontra CNJ existente** | Só adiciona OAB como participante (sem baixar de novo) |
| **Deletar escritório** | Remove suas OABs dos processos; processo permanece se outras OABs ainda estão lá |
| **Processo sem nenhuma OAB** | Órfão → pode ser limpo por cron de limpeza |

### Regra de Retenção

```
Processo fica no sistema ENQUANTO:
  Pelo menos 1 OAB de 1 escritório ativo estiver vinculada

Processo pode ser removido QUANDO:
  Nenhuma OAB vinculada a escritório ativo
  (cron de limpeza pode remover após X dias sem vinculação)
```

### Solução Técnica

#### A. Nova tabela `processo_participantes`

```sql
CREATE TABLE public.processo_participantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id UUID NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  oab_number TEXT NOT NULL,
  oab_uf TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'pdpj'
    CHECK (source IN ('pdpj', 'mural', 'manual')),
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (processo_id, oab_number, oab_uf)
);

-- Índices
CREATE INDEX idx_pp_processo ON public.processo_participantes(processo_id);
CREATE INDEX idx_pp_tenant ON public.processo_participantes(tenant_id);
CREATE INDEX idx_pp_oab ON public.processo_participantes(oab_number, oab_uf);
```

#### B. Alteração em `processos`

```sql
-- Tornar tenant_id nullable (processo pode ser compartilhado)
ALTER TABLE public.processos ALTER COLUMN tenant_id DROP NOT NULL;

-- Adicionar coluna "dono original" (quem criou primeiro)
ALTER TABLE public.processos ADD COLUMN created_by_tenant UUID
  REFERENCES public.tenants(id) ON DELETE SET NULL;

-- Atualizar constraint de unicidade
ALTER TABLE public.processos DROP CONSTRAINT processos_tenant_id_cnj_key;
ALTER TABLE public.processos ADD CONSTRAINT processos_cnj_unique
  UNIQUE (cnj);
```

#### C. RLS dinâmico

```sql
-- Nova função: verifica se tenant tem acesso ao processo
CREATE OR REPLACE FUNCTION public.tenant_has_process_access(p_processo_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.processo_participantes
    WHERE processo_id = p_processo_id
      AND tenant_id = public.current_user_tenant_id()
  ) OR public.is_super_admin()
$$;

-- Atualizar política de processos
DROP POLICY IF EXISTS processos_tenant_all ON public.processos;
CREATE POLICY processos_tenant_all ON public.processos
FOR ALL TO authenticated
USING (
  public.tenant_has_process_access(id)
  OR public.is_super_admin()
);
```

#### D. Mudanças no Sync

**PDPJ (`pdpj-tasks.ts`):**

```
Ao encontrar CNJ:
1. Buscar se processo já existe (SELECT WHERE cnj = $cnj)
2. SE não existe →
   a. Criar processo
   b. Inserir em processo_participantes com OAB que descobriu
   c. Baixar movimentações, documentos
3. SE existe →
   a. Verificar se tenant já é participante
   b. SE NÃO → Inserir em processo_participantes (sem baixar dados)
   c. SE SIM → Atualizar dados (movimentações, etc.)
```

**Mural (`processar-comunicacao.ts`):**

```
Mesma lógica: verificar existência antes de criar
Se processo já existe, apenas vincular OAB
```

#### E. Mudanças na UI

**`monitoramento/page.tsx`:**

```typescript
// ANTES:
.eq("tenant_id", tenantId)

// DEPOIS:
// Query via processo_participantes
const { data } = await supabase
  .from("processo_participantes")
  .select("processos(*)")
  .eq("tenant_id", tenantId)
```

**`search-actions.ts`:**

- Buscar por CNJ em processos + participantes

**Detalhe do processo:**

- Mostrar quais OABs estão vinculadas
- Mostrar qual escritório "criou" o processo

#### F. Migração de dados

```sql
-- 1. Para cada processo existente, criar participante
INSERT INTO processo_participantes (processo_id, tenant_id, oab_number, oab_uf)
SELECT
  p.id,
  p.tenant_id,
  eo.oab_number,
  eo.oab_uf
FROM processos p
JOIN escritorio_oabs eo ON eo.tenant_id = p.tenant_id
WHERE eo.is_active = true;

-- 2. Consolidar processos duplicados (mesmo CNJ)
-- Manter o mais antigo, criar participantes para os outros
-- Depois deletar as cópias
```

### Impacto na Exclusão de Escritório

**Antes (sem compartilhamento):**

```
Deletar escritório → CASCADE delete em processos, movimentações, tudo
```

**Depois (com compartilhamento):**

```
Deletar escritório:
  1. Remover users, cs_devices, escritorio_oabs, etc.
  2. Para cada processo vinculado ao escritório:
     ├── Tem OUTRA OAB de outro escritório ativo? → Só remove a participação
     └── SÓ tem OAB deste escritório? → Marca como "sem vínculo" (pode limpar depois)
```

#### Query de verificação antes de deletar

```sql
-- Para cada processo do escritório, verificar se outras OABs ainda usam
SELECT
  p.id,
  p.cnj,
  COUNT(pp.id) AS outras_vinculacoes
FROM processos p
JOIN processo_participantes pp ON pp.processo_id = p.id
WHERE p.id IN (
  SELECT processo_id
  FROM processo_participantes
  WHERE tenant_id = $tenant_being_deleted
)
GROUP BY p.id, p.cnj;
```

- `outras_vinculacoes > 0` → Remove só a participação do escritório sendo deletado
- `outras_vinculacoes = 0` → Processo fica órfão (pode ser limpo depois)

### Questões a Considerar

| Questão | Decisão |
|---------|---------|
| Quem pode editar movimentações? | Qualquer participante (dados são públicos) |
| Quem pode adicionar/remover participantes? | Owner do escritório que criou |
| Conflitos de dados? | Última atualização vence (ou merge por fonte) |
| Processos sensíveis? | Respeitar `nivel_sigilo` — se sigiloso, só OABs listadas nos autos |
| Deletar escritório remove processo? | NÃO — remove participante, processo permanece |

---

## 4. Correções do ConfirmADV (já implementadas)

### v0.3.33 — Fallback na finalização

- `route.ts`: quando RPC `finalize_oab_validation` falha, retorna 200 + fallback direto no DB
- `confirmadv.ts`: CS fecha janela mesmo com erro HTTP para eventos terminais

### v0.3.34 — Navegação client-side

- `confirmadv.ts`: adicionado handler `did-navigate-in-page` para detectar navegação SPA do ConfirmADV
- Logging detalhado no `reportarResultadoVerificacao`

---

## 5. Prioridade de Implementação

| Fase | Item | Complexidade | Esforço Estimado |
|------|------|-------------|-----------------|
| 1 | Validação manual de OAB | Baixa | ~2h |
| 2 | Exclusão de escritório (sem compartilhamento) | Baixa | ~1h |
| 3 | Compartilhamento de processos por OAB | Alta | ~2-3 dias |
| 4 | Exclusão de escritório (com compartilhamento) | Média | ~4h (após fase 3) |

### Ordem Recomendada

1. **Fase 1 + 2** — Implementar validação manual e exclusão simples primeiro (rápido, desbloqueia operação)
2. **Fase 3** — Implementar compartilhamento de processos (mudança grande, mas mais benefício)
3. **Fase 4** — Atualizar exclusão para respeitar compartilhamento (depende da fase 3)
