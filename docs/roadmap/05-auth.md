# 05 — Autenticação

> Dependências: Fases 01-04 (setup + schemas + RLS)
> Duração estimada: 2-3 dias
> Prioridade: 🔴 Alta

---

## 🎯 Objetivo

Implementar sistema completo de autenticação:
- Cadastro com confirmação por email
- Login (email + senha)
- Recuperação de senha
- Magic link (login sem senha)
- Logout
- Middleware de proteção
- Hooks de sessão

---

## 📄 Páginas de autenticação

### Estrutura

```
src/app/(auth)/
├── login/page.tsx
├── register/page.tsx
├── forgot-password/page.tsx
├── reset-password/page.tsx
├── confirm-email/page.tsx
└── layout.tsx
```

### `src/app/(auth)/layout.tsx`

```typescript
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">MeuJudi</h1>
          <p className="text-slate-600 mt-2">Gestão de processos jurídicos</p>
        </div>
        {children}
      </div>
    </div>
  );
}
```

### `src/app/(auth)/login/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast.error('Erro ao entrar', { description: error.message });
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  };

  const handleMagicLink = async () => {
    if (!email) {
      toast.error('Digite seu email');
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      toast.error('Erro ao enviar link', { description: error.message });
      return;
    }

    toast.success('Link enviado!', { description: 'Verifique seu email' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>Acesse sua conta MeuJudi</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <div className="flex justify-between">
              <Label htmlFor="password">Senha</Label>
              <Link href="/forgot-password" className="text-sm text-blue-600">
                Esqueceu?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-slate-500">ou</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleMagicLink}
            className="w-full"
          >
            Entrar com link mágico
          </Button>

          <p className="text-center text-sm text-slate-600">
            Não tem conta?{' '}
            <Link href="/register" className="text-blue-600 font-medium">
              Cadastre-se
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
```

### `src/app/(auth)/register/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    escritorio: '',
    name: '',
    email: '',
    password: '',
    oab: '',
  });

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();

    // 1. Criar auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          name: formData.name,
          escritorio: formData.escritorio,
          oab: formData.oab,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
      },
    });

    if (authError) {
      toast.error('Erro ao cadastrar', { description: authError.message });
      setLoading(false);
      return;
    }

    setStep('verify');
    setLoading(false);
    toast.success('Email enviado!', {
      description: 'Verifique sua caixa de entrada para ativar a conta.',
    });
  };

  if (step === 'verify') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Confirme seu email</CardTitle>
          <CardDescription>
            Enviamos um link de confirmação para {formData.email}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            Clique no link no email para ativar sua conta. Após ativar, você será
            guiado pelo setup inicial do escritório.
          </p>
          <Link href="/login" className="text-blue-600 text-sm mt-4 block">
            Voltar pro login
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>7 dias grátis. Sem cartão.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <Label htmlFor="escritorio">Nome do escritório</Label>
            <Input
              id="escritorio"
              value={formData.escritorio}
              onChange={(e) => setFormData({ ...formData, escritorio: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="name">Seu nome</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="oab">OAB (opcional)</Label>
            <Input
              id="oab"
              placeholder="12345/PR"
              value={formData.oab}
              onChange={(e) => setFormData({ ...formData, oab: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="password">Senha (mínimo 8 caracteres)</Label>
            <Input
              id="password"
              type="password"
              minLength={8}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Criando...' : 'Criar conta grátis'}
          </Button>

          <p className="text-center text-sm text-slate-600">
            Já tem conta?{' '}
            <Link href="/login" className="text-blue-600 font-medium">
              Entrar
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
```

### `src/app/(auth)/forgot-password/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (error) {
      toast.error('Erro', { description: error.message });
    } else {
      setSent(true);
      toast.success('Email enviado!');
    }
    setLoading(false);
  };

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Verifique seu email</CardTitle>
          <CardDescription>Link de recuperação enviado</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            Enviamos um link de recuperação para <strong>{email}</strong>.
            Clique nele para criar uma nova senha.
          </p>
          <Link href="/login" className="text-blue-600 text-sm mt-4 block">
            Voltar pro login
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Esqueci minha senha</CardTitle>
        <CardDescription>Vamos te enviar um link de recuperação</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Enviando...' : 'Enviar link'}
          </Button>
          <Link href="/login" className="text-blue-600 text-sm block text-center">
            Voltar pro login
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
```

---

## 🔄 Callback handler

### `src/app/auth/callback/route.ts`

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
```

---

## 🔐 Hooks de sessão

### `src/lib/auth/useUser.ts`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Pega sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Escuta mudanças
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return { user, session, loading };
}
```

### `src/lib/auth/useProfile.ts`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface Profile {
  id: string;
  tenant_id: string;
  role: string;
  name: string;
  email: string;
  oab_number: string | null;
  oab_uf: string | null;
  tenant: {
    id: string;
    name: string;
    slug: string;
    vertical: string;
  };
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('users')
        .select('*, tenant:tenants(*)')
        .eq('id', user.id)
        .single();

      setProfile(data);
      setLoading(false);
    });
  }, []);

  return { profile, loading };
}
```

---

## 🚪 Middleware de proteção

Atualizar `src/lib/supabase/middleware.ts` (já feito no 01-setup.md).

Adicionar lógica de redirecionamento pós-login:

```typescript
// Em src/middleware.ts ou em server components
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('*, tenant:tenants(*)')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/onboarding');
  return profile;
}
```

---

## 🔓 Logout

```typescript
// src/lib/auth/signOut.ts
'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export function useSignOut() {
  const router = useRouter();

  return async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };
}
```

---

## 📧 Templates de email (Resend)

### `src/lib/email/templates.ts`

```typescript
export const emailTemplates = {
  confirmEmail: (name: string, link: string) => ({
    subject: 'Confirme seu email - MeuJudi',
    html: `
      <h1>Bem-vindo ao MeuJudi, ${name}!</h1>
      <p>Clique no link abaixo para confirmar seu email:</p>
      <a href="${link}">Confirmar email</a>
    `,
  }),

  resetPassword: (name: string, link: string) => ({
    subject: 'Recuperação de senha - MeuJudi',
    html: `
      <h1>Olá, ${name}</h1>
      <p>Clique abaixo para redefinir sua senha:</p>
      <a href="${link}">Redefinir senha</a>
      <p>Se não foi você, ignore este email.</p>
    `,
  }),

  newMovimentacao: (userName: string, processoCnj: string, movimentacao: string) => ({
    subject: `Nova movimentação - ${processoCnj}`,
    html: `
      <h1>Olá, ${userName}</h1>
      <p>Nova movimentação no processo ${processoCnj}:</p>
      <p><strong>${movimentacao}</strong></p>
      <a href="https://app.meujudi.com.br/processos/${processoCnj}">Ver processo</a>
    `,
  }),
};
```

### `src/lib/email/send.ts`

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(to: string, template: { subject: string; html: string }) {
  return await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to,
    subject: template.subject,
    html: template.html,
  });
}
```

---

## ⚙️ Configurar Auth no Supabase

No dashboard do Supabase:

1. **Authentication → URL Configuration**
   - Site URL: `https://app.meujudi.com.br`
   - Redirect URLs: `https://app.meujudi.com.br/auth/callback`

2. **Authentication → Email Templates**
   - Confirm signup: ativar
   - Reset password: ativar

3. **Authentication → Providers**
   - Email: ativado (padrão)
   - Google (opcional, futuro)
   - Microsoft (opcional, futuro)

4. **Authentication → Policies**
   - Minimum password length: 8
   - Password requirements: ativar

---

## ✅ Checklist

- [ ] Páginas de login, registro, esqueci senha, reset password
- [ ] Callback handler funcionando
- [ ] Hooks `useUser` e `useProfile` criados
- [ ] Middleware protegendo rotas
- [ ] Email templates configurados
- [ ] Testar fluxo completo: registro → confirmação → login → dashboard
- [ ] Testar logout
- [ ] Testar recuperação de senha
- [ ] RLS permitindo user ver seu próprio profile

---

## 📚 Próximo passo

Continue com [`06-edge-datajud.md`](06-edge-datajud.md).

---

> 📄 **Documento master:** [../../ESPECIFICACAO.md](../../ESPECIFICACAO.md) — todas as decisões em um único arquivo.
>
> 🏢 **MeuJudi é uma vertical** (meujudi) do monorepo multi-tenant. Estrutura: erticals → 	enants → users → dados específicos.
>
> 📂 **Estrutura de pastas** (multi-vertical): lib/verticals/meujudi/ (isolado), lib/verticals/game/ (futuro), migrations/meujudi/, migrations/shared/, migrations/game/.
