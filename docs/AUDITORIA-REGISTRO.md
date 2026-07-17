# Auditoria — Fluxo de Cadastro e Onboarding

**Data:** 17-07-2026
**Escopo:** Register, Login, Onboarding, Team, Configurações

---

## Fluxo Atual

```
Landing (/)
  ├── [Criar conta] → Register (/register)
  │                     ├── signUp() → supabase.auth.signUp()
  │                     └── redireciona → /onboarding
  │                        └── (se email não confirmado) → tela "Confirme seu e-mail"
  │                        └── (se confirmado) → formulário completo → /monitoramento
  │
  └── [Entrar] → Login (/login)
                   ├── signIn() → supabase.auth.signInWithPassword()
                   └── redireciona → /monitoramento
                      └── (se sem perfil em users) → /onboarding
```

---

## Problemas Encontrados

### P0 — Críticos

| # | Problema | Arquivo | Linha |
|---|----------|---------|-------|
| 1 | **Sem "Esqueci a senha"** — não existe fluxo de reset. Se o usuário esquecer a senha, está travado para sempre. | `login/page.tsx` | — |
| 2 | **Sem confirmação de senha** — o registro aceita senha sem confirmação. Usuário pode errar e não conseguir entrar. | `register/page.tsx` | L52-55 |
| 3 | **Sign-up redireciona para onboarding sem esperar confirmação** — `signUp()` faz `redirect("/onboarding")` direto, mas o Supabase precisa de confirmação por email. O onboarding mostra "Confirme seu e-mail" sem opção de reenviar. | `(auth)/actions.ts` | L64 |

### P1 — Importantes

| # | Problema | Arquivo | Linha |
|---|----------|---------|-------|
| 4 | **Sem loading state** — botões de submit não desabilitam durante processamento. Permite double-click e envios duplicados. | `register/page.tsx`, `login/page.tsx` | L73, L46 |
| 5 | **Campos OAB e UF sem validação** — OAB aceita qualquer texto (deveria ser só números). UF aceita mais de 2 caracteres (deveria ser select com UFs). | `register/page.tsx` | L57-63 |
| 6 | **Termos de uso sem link** — checkbox fala "aceito os termos" mas não tem link para visualizar os termos. | `register/page.tsx` | L66-71 |
| 7 | **Onboarding sem validação de UF** — campo UF usa `<Input>` em vez de `<select>`, aceita valores inválidos. | `onboarding/page.tsx` | L28 |
| 8 | **Nomes de papéis inconsistentes** — "Advogado" / "Equipe" / "Sócio/owner" mistura português e inglês. | `team/page.tsx` | L72-76 |

### P2 — Médios

| # | Problema | Arquivo | Linha |
|---|----------|---------|-------|
| 9 | **Perfil somente leitura** — Configurações mostra nome/email mas não permite editar. | `configuracoes/page.tsx` | — |
| 10 | **Sem "Alterar senha"** — não tem como mudar senha depois de criada. | `configuracoes/page.tsx` | — |
| 11 | **Sem "Excluir conta"** — não tem como o usuário sair da plataforma. | `configuracoes/page.tsx` | — |
| 12 | **Notificações é placeholder** — seção existe mas não faz nada. | `configuracoes/page.tsx` | — |
| 13 | **Sem reenviar email de confirmação** — se o email não chegou, usuário fica travado no onboarding. | `onboarding/page.tsx` | L19 |
| 14 | **Onboarding é formulário único longo** — 6+ campos sem progresso visual, sem divisão lógica. | `onboarding/page.tsx` | L28 |

### P3 — Menores

| # | Problema | Arquivo | Linha |
|---|----------|---------|-------|
| 15 | **Cores hardcoded nos erros** — usa `red-50`, `red-300`, `red-700` em vez do padrão `destructive` do shadcn. | `register/page.tsx` L34, `login/page.tsx` L33 | — |
| 16 | **Sem stepper/progresso** — fluxo register → onboarding não mostra onde o usuário está. | Geral | — |
| 17 | **Team page sem confirmação** — envia convite direto sem pedir confirmação. | `team/page.tsx` | L78 |
| 18 | **Sem revogar convite** — não tem como cancelar um convite pendente. | `team/page.tsx` | — |
| 19 | **Sem remover membro** — não tem como tirar alguém da equipe. | `team/page.tsx` | — |

---

## Auditoria do Onboarding Wizard

### Estado Atual

O onboarding é uma **página única** com 3 estados:

1. **Sem usuário** → Mostra "Confirme seu e-mail" (L18-20)
2. **Usuário com tenant** → Mostra "Seu escritório já está pronto" (L22-25)
3. **Novo usuário** → Formulário completo (L27-29)

### Formulário — 6 Campos

| Campo | Tipo | Obrigatório | Pre-fill | Validação |
|-------|------|-------------|----------|-----------|
| Nome do escritório | text | ✅ | `metadata.office` | Server-side (não vazio) |
| Seu nome | text | ✅ | `metadata.name` | Server-side (não vazio) |
| Cidade | text | ❌ | — | Nenhuma |
| UF | text (maxLength=2) | ❌ | — | Nenhuma (aceita qualquer texto) |
| OAB principal | text | ❌ | `metadata.oab` | Nenhuma (aceita qualquer texto) |
| UF da OAB | text (maxLength=2) | ❌ | `metadata.uf` | Nenhuma (aceita qualquer texto) |

### SQL Function — `complete_tenant_onboarding`

A função RPC faz 2 coisas:
1. **Se tem convite pendente** → Vincula o usuário ao tenant existente (cargo do convite)
2. **Se não tem convite** → Cria um novo tenant + vincula usuário como owner

---

### Problemas do Onboarding — Detalhamento

#### UX / Interface

| # | Problema | Detalhamento | Impacto | Solução |
|---|----------|--------------|---------|---------|
| O1 | **Formulário único longo** | 6 campos numa tela só, sem progresso visual. Usuário não sabe quantos passos faltam. | Abandono, confusão | Dividir em 2 steps: (1) Escritório, (2) Dados pessoais |
| O2 | **Sem feedback de sucesso** | Após completar, redireciona direto para `/monitoramento`. Usuário não tem certeza se deu certo. | Confusão | Mostrar tela de sucesso com checkmark antes de redirecionar |
| O3 | **Sem opção de pular** | Campos opcionais (cidade, OAB) não têm botão "Pular etapa". Usuário é obrigado a ver campos que não precisa preencher. | Frustração | Adicionar botão "Pular" ou "Preencher depois" |
| O4 | **Sem voltar** | Não tem como voltar para o registro se errou algum dado (nome, email). Usuário precisa recomeçar o fluxo. | Frustração | Adicionar link "Voltar" ou permitir edição no registro |
| O5 | **Sem loading state** | Botão "Criar escritório e entrar no painel" não desabilita durante processamento. Permite double-click. | Envios duplicados | Adicionar `disabled={pending}` + texto de loading |
| O6 | **Sem validação em tempo real** | Só valida no submit. Usuário preenche tudo errado e só descobre depois. | Frustração | Validar campos obrigatórios antes de avançar (se em steps) |
| O7 | **Sem stepper/progresso** | Fluxo register → onboarding não mostra onde o usuário está (1/2, 2/2). | Confusão | Adicionar indicador de step |

#### Validação / Dados

| # | Problema | Detalhamento | Impacto | Solução |
|---|----------|--------------|---------|---------|
| O8 | **UF é `<Input>`** | Campo UF aceita qualquer texto (ex: "XX", "123", "abc"). Não valida se é uma UF real. | Dados inválidos no banco | Usar `<select>` com lista de 27 UFs |
| O9 | **UF da OAB é `<Input>`** | Mesmo problema. Aceita valores inválidos. | Dados inválidos | Usar `<select>` com lista de UFs |
| O10 | **OAB sem validação** | Campo OAB aceita letras, espaços, caracteres especiais. Deveria ser só números. | Dados inválidos | Adicionar `inputMode="numeric"` + `pattern="[0-9]*"` |
| O11 | **Cidade sem validação** | Aceita qualquer texto, sem autocomplete ou busca. | Dados inconsistentes | Adicionar autocomplete ou busca por cidade |

#### Email / Confirmação

| # | Problema | Detalhamento | Impacto | Solução |
|---|----------|--------------|---------|---------|
| O12 | **Sem reenviar email** | Tela "Confirme seu e-mail" não tem botão de reenviar. Se o email não chegou, usuário fica travado. | Usuário travado | Adicionar botão "Reenviar email de confirmação" |
| O13 | **Mensagem de erro genérica** | Se o RPC falhar, mostra "Não foi possível concluir a configuração: [error_message]". Erros do Supabase são em inglês e não ajuda o usuário. | Confusão | Traduzir erros comuns: `not_authenticated`, `super_admin_cannot_onboard_tenant` |

#### Acessibilidade

| # | Problema | Detalhamento | Impacto | Solução |
|---|----------|--------------|---------|---------|
| O14 | **Sem aria-describedby nos erros** | Quando mostra mensagem de erro, não vincula ao campo de formulário. Leitores de tela não sabem qual campo errou. | Acessibilidade | Adicionar `aria-describedby` e `aria-invalid` nos campos com erro |
| O15 | **Sem aria-live na mensagem de erro** | Mensagem de erro não é anunciada por leitores de tela. | Acessibilidade | Adicionar `aria-live="polite"` na div de erro |

#### Mobile / Responsividade

| # | Problema | Detalhamento | Impacto | Solução |
|---|----------|--------------|---------|---------|
| O16 | **Formulário longo no mobile** | 6 campos empilhados no mobile criam uma página muito longa. Usuário precisa de muito scroll. | Experiência ruim | Dividir em steps reduz a quantidade de campos visíveis |
| O17 | **Sem autofill** | Campos não usam `autoComplete` attributes. Navegadores não oferecem preenchimento automático. | Inconveniência | Adicionar `autoComplete="organization"` no nome do escritório, `autoComplete="name"` no nome pessoal |

#### Segurança / Fluxo

| # | Problema | Detalhamento | Impacto | Solução |
|---|----------|--------------|---------|---------|
| O18 | **Convite aceita qualquer papel** | Se o usuário tem um convite pendente, o onboarding usa o papel do convite (`v_invite.role`). Mas o formulário não mostra qual papel será atribuído. | Surpresa | Mostrar "Você será adicionado como [papel]" antes de finalizar |
| O19 | **Sem confirmação antes de criar** | Usuário clica "Criar escritório" e já cria direto. Sem tela de confirmação com os dados preenchidos. | Erros | Adicionar step de confirmação antes de chamar o RPC |
| O20 | **Slug gerado automaticamente** | O slug do tenant é gerado a partir do nome + random. Se o usuário errar o nome, o slug fica estranho. | Dados errados | Permitir edição do slug ou mostrar como será gerado |

---

### Mapa do Fluxo — Estados e Transições

```
Onboarding Page (/onboarding)
  │
  ├── [state: sem usuário]
  │   └── Mostra: "Confirme seu e-mail"
  │       ├── Botão: "Já confirmei, entrar" → /login
  │       └── ❌ SEM: botão reenviar email
  │
  ├── [state: usuário com tenant]
  │   └── Mostra: "Seu escritório já está pronto"
  │       └── Botão: "Ir para o painel" → /monitoramento
  │
  └── [state: novo usuário]
      └── Formulário (6 campos)
          ├── Nome do escritório (obrigatório)
          ├── Seu nome (obrigatório)
          ├── Cidade (opcional)
          ├── UF (opcional, input text)
          ├── OAB (opcional)
          ├── UF da OAB (opcional, input text)
          └── Botão: "Criar escritório e entrar no painel"
              └── completeOnboarding() → RPC
                  ├── [sucesso] → /monitoramento
                  └── [erro] → /onboarding?error=...
```

---

### Fluxo Sugerido — Onboarding em 2 Steps

```
Step 1: Dados do Escritório
  ├── Nome do escritório (obrigatório, pre-fill do registro)
  ├── Cidade (opcional)
  ├── UF (select com UFs)
  └── [Próximo] ou [Pular]

Step 2: Seus Dados
  ├── Seu nome (obrigatório, pre-fill do registro)
  ├── Número OAB (opcional, pre-fill do registro)
  ├── UF da OAB (select com UFs, pre-fill do registro)
  └── [Finalizar]

Confirmação:
  ├── Resumo dos dados preenchidos
  ├── [Voltar] para editar
  └── [Criar escritório]

Sucesso:
  ├── "Seu escritório está pronto!"
  ├── Checkmark animado
  └── [Ir para o painel]
```

---

## Como Corrigir

### 1. Esqueci a Senha (P0)

**Arquivo:** `src/app/(auth)/login/page.tsx`

Adicionar link "Esqueci a senha" abaixo do campo de senha:
```tsx
<Link href="/forgot-password" className="text-sm text-primary hover:underline">
  Esqueci minha senha
</Link>
```

**Arquivo:** `src/app/(auth)/forgot-password/page.tsx` (novo)

Criar página com campo de email que chama `supabase.auth.resetPasswordForEmail()`.

**Arquivo:** `src/app/(auth)/reset-password/page.tsx` (novo)

Criar página com campos de nova senha + confirmação que chama `supabase.auth.updateUser()`.

**Arquivo:** `src/proxy.ts`

Adicionar `/forgot-password` e `/reset-password` como rotas públicas.

---

### 2. Confirmação de Senha (P0)

**Arquivo:** `src/app/(auth)/register/page.tsx`

Adicionar campo de confirmação de senha:
```tsx
<div className="space-y-2 sm:col-span-2">
  <Label htmlFor="password_confirmation">Confirmar senha</Label>
  <PasswordInput id="password_confirmation" name="password_confirmation" minLength={8} />
</div>
```

**Arquivo:** `src/app/(auth)/actions.ts`

Validar se as senhas coincidem antes de chamar `signUp()`:
```ts
const passwordConfirmation = formData.get("password_confirmation");
if (password !== passwordConfirmation) {
  redirect("/register?error=password_mismatch");
}
```

---

### 3. Loading States (P1)

**Arquivo:** `src/app/(auth)/register/page.tsx`

Transformar em client component ou usar `useFormStatus`:
```tsx
import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button className="w-full" type="submit" disabled={pending}>
      {pending ? "Criando conta..." : "Continuar configuração"}
      <ArrowRight className="h-4 w-4" />
    </Button>
  );
}
```

Mesma lógica para `login/page.tsx`.

---

### 4. Validar OAB e UF (P1)

**Arquivo:** `src/app/(auth)/register/page.tsx`

OAB — adicionar `inputMode="numeric"` e `pattern`:
```tsx
<Input id="oab" name="oab" placeholder="67553" inputMode="numeric" pattern="[0-9]*" />
```

UF — trocar por `<select>`:
```tsx
<select id="uf" name="uf" className="...">
  <option value="">UF</option>
  {ufs.map(uf => <option key={uf} value={uf}>{uf}</option>)}
</select>
```

Criar array de UFs: `const ufs = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];`

---

### 5. Link dos Termos (P1)

**Arquivo:** `src/app/(auth)/register/page.tsx`

```tsx
<span>
  Aceito os{" "}
  <Link href="/termos" target="_blank" className="font-medium text-primary underline">
    termos de uso
  </Link>{" "}
  e a{" "}
  <Link href="/privacidade" target="_blank" className="font-medium text-primary underline">
    política de privacidade
  </Link>{" "}
  do MeuJudi.
</span>
```

---

### 6. Reenviar Email de Confirmação (P2)

**Arquivo:** `src/app/(platform)/onboarding/page.tsx`

Criar server action `resendConfirmation`:
```ts
export async function resendConfirmation() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email) {
    await supabase.auth.resend({ type: "signup", email: user.email });
  }
  redirect("/onboarding?success=email_resent");
}
```

Adicionar botão na tela de "Confirme seu e-mail":
```tsx
<form action={resendConfirmation}>
  <Button variant="outline" type="submit">Reenviar email de confirmação</Button>
</form>
```

---

### 7. Onboarding em 2 Steps (P2)

**Arquivo:** `src/app/(platform)/onboarding/page.tsx`

Usar estado local para controlar o step:
```tsx
const [step, setStep] = useState(1);

// Step 1: Dados do escritório
// Step 2: Dados pessoais
```

Ou usar URL params: `/onboarding?step=1` e `/onboarding?step=2`.

---

### 8. UF como Select no Onboarding (P1)

**Arquivo:** `src/app/(platform)/onboarding/page.tsx`

Trocar os campos de UF por `<select>`:
```tsx
<select id="state" name="state" className="...">
  <option value="">Selecione a UF</option>
  {ufs.map(uf => <option key={uf} value={uf}>{uf}</option>)}
</select>
```

---

### 9. Consistência de Papéis na Equipe (P2)

**Arquivo:** `src/app/(platform)/team/page.tsx`

```tsx
<option value="lawyer">Advogado(a)</option>
<option value="staff">Equipe administrativa</option>
<option value="owner">Sócio(a) / Responsável</option>
```

---

### 10. Perfil Editável + Alterar Senha (P2)

**Arquivo:** `src/app/(platform)/(tenant)/configuracoes/page.tsx`

Adicionar seção "Editar perfil" com formulário editável e seção "Alterar senha" com campos senha atual + nova senha.

---

### 11. Cores dos Erros (P3)

**Arquivos:** `register/page.tsx`, `login/page.tsx`

Trocar classes hardcoded:
```tsx
// De:
className="border-red-300 bg-red-50 text-red-700"

// Para:
className="border-destructive/30 bg-destructive/10 text-destructive"
```

---

## Resumo de Prioridades

| Prioridade | Ações | Esforço |
|------------|-------|---------|
| **P0** | Esqueci a senha, confirmação de senha, reenviar email | ~3h |
| **P1** | Loading states, validação OAB/UF, UF como select, link termos | ~2h |
| **P2** | Onboarding em 2 steps, perfil editável, alterar senha, papéis consistentes | ~4h |
| **P3** | Cores dos erros, stepper visual, confirmação de convite | ~1h |

**Total estimado:** ~10h de trabalho

---

## Checklist de Correções

### Auth (Register + Login)
- [ ] Criar página `forgot-password` com `resetPasswordForEmail()`
- [ ] Criar página `reset-password` com `updateUser()`
- [ ] Adicionar rotas públicas no proxy
- [ ] Adicionar link "Esqueci a senha" no login
- [ ] Adicionar campo confirmação de senha no register
- [ ] Validar senhas coincidem no server action
- [ ] Adicionar loading states (useFormStatus)
- [ ] Validar OAB (só números)
- [ ] Trocar UF por select
- [ ] Adicionar links para termos/privacidade
- [ ] Corrigir cores dos erros (destructive)

### Onboarding
- [ ] Dividir em 2 steps (escritório + dados pessoais)
- [ ] Adicionar stepper/progresso visual
- [ ] Trocar UF por select (2 campos)
- [ ] Validar OAB (só números)
- [ ] Adicionar pre-fill de todos os campos do registro
- [ ] Adicionar botão "Reenviar email" na tela de confirmação
- [ ] Adicionar tela de sucesso antes de redirecionar
- [ ] Adicionar loading state no botão final
- [ ] Traduzir erros do Supabase para português
- [ ] Adicionar aria-describedby nos erros

### Equipe
- [ ] Traduzir nomes de papéis para português consistente
- [ ] Adicionar confirmação antes de enviar convite
- [ ] Adicionar ability para revogar convite
- [ ] Adicionar ability para remover membro

### Configurações
- [ ] Tornar perfil editável
- [ ] Adicionar seção "Alterar senha"
- [ ] Adicionar seção "Excluir conta"
- [ ] Implementar notificações (ou remover placeholder)

---

## Próximos Passos Recomendados

1. **P0** — Criar páginas `forgot-password` e `reset-password`
2. **P0** — Adicionar confirmação de senha no register
3. **P0** — Criar server action de reenviar email
4. **P1** — Adicionar loading states nos formulários de auth
5. **P1** — Validar OAB (só números) e UF (select)
6. **P1** — Adicionar link para termos de uso
7. **P2** — Refazer onboarding em 2 steps
8. **P2** — Tornar perfil editável em configurações
