# 01 â€” Setup do Projeto

> DependÃªncias: Nenhuma
> DuraÃ§Ã£o estimada: 1-2 dias
> Prioridade: ðŸ”´ Alta

---

## ðŸŽ¯ Objetivo

Criar a fundaÃ§Ã£o tÃ©cnica do MeuJudi â€” Next.js, Supabase, Vercel, Stripe, Sentry, CI â€” pra que todas as fases seguintes tenham uma base sÃ³lida.

---

## ðŸ“‹ O que serÃ¡ feito

1. âœ… Criar projeto Next.js
2. âœ… Configurar Supabase Pro
3. âœ… Instalar dependÃªncias
4. âœ… Configurar shadcn/ui + Tailwind
5. âœ… Configurar Vercel
6. âœ… Configurar CI/CD (GitHub Actions)
7. âœ… Configurar Sentry
8. âœ… Configurar Husky + lint-staged
9. âœ… Configurar Stripe
10. âœ… Configurar Resend (email)
11. âœ… Criar estrutura de pastas
12. âœ… VariÃ¡veis de ambiente

---

## 1. Inicializar projeto Next.js

```bash
cd C:\Caio\MeuJudi
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

**DecisÃµes importantes:**
- **App Router** (nÃ£o Pages Router) â€” mais moderno, melhor performance
- **TypeScript** â€” obrigatÃ³rio
- **Tailwind CSS v4** â€” padrÃ£o SaaS moderno
- **ESLint** â€” qualidade de cÃ³digo
- **src/** â€” pasta de organizaÃ§Ã£o

---

## 2. Configurar Supabase

### 2.1. Criar projeto no Supabase Pro

1. Acesse https://supabase.com/dashboard
2. **New project** â†’ preencha:
   - Name: `meujudi-prod`
   - Database password: (senha forte, anote no gerenciador)
   - Region: `South America (SÃ£o Paulo)`
   - Plan: **Pro** ($25/mÃªs)
3. Aguarde provisionar (~2 min)

### 2.2. Instalar dependÃªncias Supabase

```bash
npm install @supabase/supabase-js @supabase/ssr
```

### 2.3. Criar arquivos de configuraÃ§Ã£o

#### `src/lib/supabase/client.ts` (browser)

```typescript
import { createBrowserClient } from '@supabase/ssr';

export const createClient = () => {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
};
```

#### `src/lib/supabase/server.ts` (server components + actions)

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const createClient = async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components nÃ£o podem setar cookies
          }
        },
      },
    },
  );
};
```

#### `src/lib/supabase/middleware.ts`

```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export const updateSession = async (request: NextRequest) => {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  // ProteÃ§Ã£o de rotas
  const isPlatformRoute = request.nextUrl.pathname.startsWith('/dashboard') ||
                          request.nextUrl.pathname.startsWith('/processos');
  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin');
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
                       request.nextUrl.pathname.startsWith('/register');

  if (isPlatformRoute && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
};
```

#### `src/middleware.ts`

```typescript
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

---

## 3. Configurar shadcn/ui

```bash
npx shadcn@latest init
```

Responda as perguntas:
- Style: **New York** (mais moderno)
- Base color: **Slate** (pode mudar depois)
- CSS variables: **Yes**

### Componentes essenciais (instalar todos)

```bash
npx shadcn@latest add button card dialog input select textarea table tabs toast dropdown-menu
npx shadcn@latest add form label switch checkbox radio separator avatar badge
npx shadcn@latest add sheet popover calendar date-picker alert
```

---

## 4. Estrutura de pastas completa

```
meujudi/
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ app/
â”‚   â”‚   â”œâ”€â”€ (auth)/
â”‚   â”‚   â”‚   â”œâ”€â”€ login/page.tsx
â”‚   â”‚   â”‚   â”œâ”€â”€ register/page.tsx
â”‚   â”‚   â”‚   â””â”€â”€ forgot-password/page.tsx
â”‚   â”‚   â”œâ”€â”€ (public)/
â”‚   â”‚   â”‚   â”œâ”€â”€ page.tsx                    # Landing
â”‚   â”‚   â”‚   â”œâ”€â”€ pricing/page.tsx
â”‚   â”‚   â”‚   â””â”€â”€ sobre/page.tsx
â”‚   â”‚   â”œâ”€â”€ (platform)/
â”‚   â”‚   â”‚   â”œâ”€â”€ onboarding/
â”‚   â”‚   â”‚   â”œâ”€â”€ dashboard/page.tsx
â”‚   â”‚   â”‚   â”œâ”€â”€ processos/
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ page.tsx
â”‚   â”‚   â”‚   â”‚   â””â”€â”€ [cnj]/page.tsx
â”‚   â”‚   â”‚   â”œâ”€â”€ clientes/
â”‚   â”‚   â”‚   â”œâ”€â”€ agenda/
â”‚   â”‚   â”‚   â”œâ”€â”€ equipe/
â”‚   â”‚   â”‚   â”œâ”€â”€ cert-a1/
â”‚   â”‚   â”‚   â”œâ”€â”€ billing/
â”‚   â”‚   â”‚   â””â”€â”€ settings/
â”‚   â”‚   â”œâ”€â”€ (super-admin)/
â”‚   â”‚   â”‚   â””â”€â”€ admin/
â”‚   â”‚   â”‚       â”œâ”€â”€ page.tsx
â”‚   â”‚   â”‚       â”œâ”€â”€ tenants/
â”‚   â”‚   â”‚       â”œâ”€â”€ billing/
â”‚   â”‚   â”‚       â”œâ”€â”€ support/
â”‚   â”‚   â”‚       â””â”€â”€ verticals/meujudi/
â”‚   â”‚   â”œâ”€â”€ api/
â”‚   â”‚   â”‚   â”œâ”€â”€ [vertical]/
â”‚   â”‚   â”‚   â”‚   â””â”€â”€ meujudi/
â”‚   â”‚   â”‚   â”‚       â”œâ”€â”€ processos/
â”‚   â”‚   â”‚   â”‚       â””â”€â”€ clientes/
â”‚   â”‚   â”‚   â””â”€â”€ webhooks/
â”‚   â”‚   â”‚       â””â”€â”€ stripe/
â”‚   â”‚   â”œâ”€â”€ layout.tsx
â”‚   â”‚   â””â”€â”€ globals.css
â”‚   â”œâ”€â”€ components/
â”‚   â”‚   â”œâ”€â”€ shared/         # BotÃµes, inputs, modais
â”‚   â”‚   â”œâ”€â”€ platform/       # Componentes do app
â”‚   â”‚   â””â”€â”€ super-admin/    # Componentes do admin
â”‚   â”œâ”€â”€ lib/
â”‚   â”‚   â”œâ”€â”€ supabase/       # Clientes Supabase
â”‚   â”‚   â”œâ”€â”€ stripe/         # Stripe config
â”‚   â”‚   â”œâ”€â”€ ia/             # Wrapper da Claude
â”‚   â”‚   â”œâ”€â”€ regex/          # Sistema de regex metadata
â”‚   â”‚   â”œâ”€â”€ feriados.ts     # Tabela de feriados
â”‚   â”‚   â”œâ”€â”€ utils.ts        # cn, brl, dates
â”‚   â”‚   â””â”€â”€ constants.ts
â”‚   â”œâ”€â”€ middleware.ts
â”‚   â””â”€â”€ types/
â”‚       â”œâ”€â”€ database.ts     # Gerado do Supabase
â”‚       â””â”€â”€ verticals/
â”‚           â””â”€â”€ meujudi.ts
â”œâ”€â”€ supabase/
â”‚   â””â”€â”€ migrations/
â”‚       â”œâ”€â”€ shared/         # tenants, users, billing
â”‚       â”œâ”€â”€ meujudi/        # processos, movimentacoes
â”‚       â””â”€â”€ game/           # (vazio, futuro)
â”œâ”€â”€ public/
â”œâ”€â”€ .env.local              # NÃƒO commitar
â”œâ”€â”€ .env.local.example
â”œâ”€â”€ .gitignore
â”œâ”€â”€ .github/
â”‚   â””â”€â”€ workflows/
â”‚       â””â”€â”€ ci.yml
â”œâ”€â”€ .husky/
â”‚   â””â”€â”€ pre-commit
â”œâ”€â”€ components.json         # shadcn config
â”œâ”€â”€ tailwind.config.ts
â”œâ”€â”€ next.config.ts
â”œâ”€â”€ package.json
â””â”€â”€ tsconfig.json
```

---

## 5. Configurar Vercel

### 5.1. Conectar repositÃ³rio

1. Acesse https://vercel.com
2. **New Project** â†’ Import Git Repository
3. Selecione o repositÃ³rio do MeuJudi
4. Configure:
   - Framework: Next.js
   - Build Command: `next build`
   - Output: `.next`
   - Install Command: `npm install`

### 5.2. VariÃ¡veis de ambiente (Vercel)

VÃ¡ em **Settings â†’ Environment Variables** e adicione (prÃ³ximo passo).

---

## 6. Configurar CI/CD (GitHub Actions)

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci

      - run: npm run lint

      - run: npx tsc --noEmit
```

---

## 7. Configurar Sentry

```bash
npx @sentry/wizard@latest -i nextjs
```

Responda:
- Crie conta em https://sentry.io (free tier: 5K erros/mÃªs)
- Selecione o projeto
- Wizard configura automaticamente

---

## 8. Configurar Husky + lint-staged

```bash
npm install -D husky lint-staged
npx husky init
```

### `.husky/pre-commit`

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"
npx lint-staged
```

### Adicionar em `package.json`

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"]
  }
}
```

---

## 9. Configurar Stripe

1. Crie conta em https://dashboard.stripe.com
2. Ative modo **Test** (pra desenvolvimento)
3. Copie as chaves:
   - **Publishable key** (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
   - **Secret key** (STRIPE_SECRET_KEY)
   - **Webhook secret** (serÃ¡ gerado no passo 10-stripe-billing.md)

```bash
npm install stripe @stripe/stripe-js @stripe/react-stripe-js
```

---

## 10. Configurar Resend (email)

1. Crie conta em https://resend.com
2. Copie API key
3. Free tier: 100 emails/dia, 3.000/mÃªs

```bash
npm install resend
```

---

## 11. VariÃ¡veis de ambiente (`.env.local.example`)

```env
# ============================================
# SUPABASE
# ============================================
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

# ============================================
# STRIPE
# ============================================
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# ============================================
# APIs EXTERNAS (grÃ¡tis, mas com rate limit)
# ============================================
DATAJUD_API_KEY=APIKey [DATAJUD_API_KEY]

# ============================================
# IA (Claude)
# ============================================
ANTHROPIC_API_KEY=sk-ant-xxx
ANTHROPIC_MODEL_HAIKU=claude-3-5-haiku-20241022
ANTHROPIC_MODEL_SONNET=claude-3-5-sonnet-20241022

# ============================================
# Resend (email)
# ============================================
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=noreply@meujudi.com.br

# ============================================
# Sentry
# ============================================
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_AUTH_TOKEN=sntrys_xxx

# ============================================
# App
# ============================================
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

**NUNCA commite o `.env.local`** â€” sÃ³ o `.env.local.example` vai pro Git.

---

## 12. Configurar `.gitignore`

```gitignore
# dependencies
node_modules/
.pnp
.pnp.js

# next.js
.next/
out/
build/

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# env
.env*.local

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts

# IDE
.vscode/
.idea/

# Sentry
.sentryclirc
```

---

## 13. Scripts Ãºteis em `package.json`

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write .",
    "supabase:start": "supabase start",
    "supabase:stop": "supabase stop",
    "supabase:status": "supabase status",
    "supabase:types": "supabase gen types typescript --local > src/types/database.ts",
    "db:reset": "supabase db reset",
    "db:diff": "supabase db diff"
  }
}
```

---

## âœ… Checklist de validaÃ§Ã£o

- [ ] `npm run dev` roda sem erros em `http://localhost:3000`
- [ ] `npm run lint` passa limpo
- [ ] `npx tsc --noEmit` sem erros TypeScript
- [ ] Supabase conectou (testar query simples em `/api/health`)
- [ ] Tailwind funcionando (cores aparecem)
- [ ] shadcn/ui instalou (Button, Card visÃ­veis)
- [ ] Middleware de auth funcionando (rota protegida redireciona)
- [ ] Deploy no Vercel funciona
- [ ] Sentry captura erro de teste
- [ ] Pre-commit hook roda lint
- [ ] GitHub Actions CI verde
- [ ] VariÃ¡veis de ambiente configuradas em dev e prod

---

## ðŸ“š PrÃ³ximo passo

Continue com [`02-schema-shared.md`](02-schema-shared.md).

---

> ðŸ“„ **Documento master:** [../../ESPECIFICACAO.md](../../ESPECIFICACAO.md) â€” todas as decisÃµes em um Ãºnico arquivo.
>
> ðŸ¢ **MeuJudi Ã© uma vertical** (meujudi) do monorepo multi-tenant. Estrutura: erticals â†’ 	enants â†’ users â†’ dados especÃ­ficos.
>
> ðŸ“‚ **Estrutura de pastas** (multi-vertical): lib/verticals/meujudi/ (isolado), lib/verticals/game/ (futuro), migrations/meujudi/, migrations/shared/, migrations/game/.

