# 11 — Super Admin (Painel Central)

> Dependências: Fases 01-10
> Duração estimada: 2-3 dias
> Prioridade: 🟠 Alta (gestão do SaaS)

---

## 🎯 Objetivo

Criar o painel **Super Admin** onde você (Caio) gerencia todos os escritórios clientes do SaaS: ver métricas, suspender tenants, responder tickets, ver audit logs.

---

## 📊 Visão geral

```
[Super Admin (VOCÊ)]
    │
    ├── Dashboard
    │   ├── MRR, ARR
    │   ├── Tenants ativos
    │   ├── Churn
    │   ├── IA custo mês
    │   └── Alertas
    │
    ├── Tenants
    │   ├── Lista (com filtros)
    │   ├── Detalhe
    │   │   ├── Usuários
    │   │   ├── Planos
    │   │   ├── Billing
    │   │   ├── Suporte
    │   │   └── Audit log
    │   └── Ações: suspender, ativar, mudar plano
    │
    ├── Billing
    │   ├── Receita
    │   ├── Inadimplência
    │   └── Refunds
    │
    ├── Suporte
    │   ├── Tickets abertos
    │   ├── Chat com cliente
    │   └── Histórico
    │
    ├── Features
    │   └── Feature flags
    │
    └── Audit
        └── Logs globais (LGPD)
```

---

## 💻 Código

### Layout

#### `src/app/(super-admin)/admin/layout.tsx`

```typescript
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminSidebar } from '@/components/super-admin/AdminSidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Verificar se é super admin
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'super_admin') {
    redirect('/dashboard');
  }

  return (
    <div className="flex h-screen bg-slate-100">
      <AdminSidebar />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
```

#### `src/components/super-admin/AdminSidebar.tsx`

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const links = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/tenants', label: 'Tenants' },
  { href: '/admin/billing', label: 'Billing' },
  { href: '/admin/support', label: 'Suporte' },
  { href: '/admin/features', label: 'Features' },
  { href: '/admin/audit', label: 'Audit' },
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-64 bg-slate-900 text-white p-4">
      <div className="text-xl font-bold mb-8">MeuJudi Admin</div>
      <nav className="space-y-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'block px-3 py-2 rounded text-sm',
              pathname === link.href ? 'bg-slate-700' : 'hover:bg-slate-800'
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

---

### Dashboard

#### `src/app/(super-admin)/admin/page.tsx`

```typescript
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

async function getMetrics() {
  const supabase = createClient();

  // MRR: soma de planos ativos
  const { data: activeSubs } = await supabase
    .from('subscriptions')
    .select(`
      plan:plans(price_cents)
    `)
    .eq('status', 'active');

  const mrrCents = activeSubs?.reduce((sum, s) => {
    return sum + (s.plan as any)?.price_cents || 0;
  }, 0) || 0;

  // Total de tenants ativos
  const { count: activeTenants } = await supabase
    .from('tenants')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  // Tickets abertos
  const { count: openTickets } = await supabase
    .from('support_tickets')
    .select('*', { count: 'exact', head: true })
    .in('status', ['open', 'in_progress']);

  // Inadimplência
  const { count: pastDue } = await supabase
    .from('subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'past_due');

  return {
    mrr: mrrCents / 100,
    activeTenants: activeTenants || 0,
    openTickets: openTickets || 0,
    pastDue: pastDue || 0,
  };
}

export default async function AdminDashboard() {
  const metrics = await getMetrics();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">MRR</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              R$ {metrics.mrr.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tenants Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.activeTenants}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tickets Abertos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{metrics.openTickets}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Inadimplência</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{metrics.pastDue}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Receita últimos 12 meses</CardTitle>
          </CardHeader>
          <CardContent>
            <ReceitaChart />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tenants por plano</CardTitle>
          </CardHeader>
          <CardContent>
            <TenantsPorPlanoChart />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

---

### Tenants (lista + ações)

#### `src/app/(super-admin)/admin/tenants/page.tsx`

```typescript
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

export default async function TenantsPage() {
  const supabase = createClient();

  const { data: tenants } = await supabase
    .from('tenants')
    .select(`
      *,
      subscription:subscriptions(plan:plans(name), status)
    `)
    .order('created_at', { ascending: false });

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Tenants</h1>

      <div className="bg-white rounded-lg border">
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold">Nome</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Plano</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Trial</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Criado em</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {tenants?.map((t) => (
              <tr key={t.id} className="border-b hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{t.name}</td>
                <td className="px-4 py-3">
                  {(t.subscription as any)?.[0]?.plan?.name || '—'}
                </td>
                <td className="px-4 py-3">
                  {t.is_active ? (
                    <Badge className="bg-green-500">Ativo</Badge>
                  ) : (
                    <Badge variant="destructive">Suspenso</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  {t.is_trial ? <Badge variant="outline">Trial</Badge> : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {new Date(t.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/tenants/${t.id}`} className="text-blue-600 text-sm">
                    Ver →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

#### `src/app/(super-admin)/admin/tenants/[id]/page.tsx`

```typescript
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TenantActions } from '@/components/super-admin/TenantActions';

export default async function TenantDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select(`
      *,
      users(*),
      subscription:subscriptions(plan:plans(*), status, current_period_end),
      audit_logs(*)
    `)
    .eq('id', params.id)
    .single();

  if (!tenant) notFound();

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold">{tenant.name}</h1>
          <p className="text-slate-600">{tenant.slug} · {tenant.email}</p>
        </div>
        <TenantActions tenant={tenant} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Plano atual</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Nome: {(tenant.subscription as any)?.[0]?.plan?.display_name}</p>
            <p>Status: {(tenant.subscription as any)?.[0]?.status}</p>
            <p>Renova em: {new Date((tenant.subscription as any)?.[0]?.current_period_end).toLocaleDateString('pt-BR')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usuários ({tenant.users?.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {tenant.users?.map((u) => (
                <li key={u.id} className="text-sm">
                  {u.name} ({u.email}) — {u.role}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Auditoria (últimos 20)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {tenant.audit_logs?.slice(0, 20).map((log) => (
                <li key={log.id} className="flex justify-between">
                  <span>{log.action} {log.entity}</span>
                  <span className="text-slate-500">
                    {new Date(log.created_at).toLocaleString('pt-BR')}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

#### `src/components/super-admin/TenantActions.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export function TenantActions({ tenant }: { tenant: any }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const toggleStatus = async () => {
    setLoading(true);
    const action = tenant.is_active ? 'suspender' : 'ativar';
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error('Falha');
      toast.success(`Tenant ${action === 'suspender' ? 'suspenso' : 'ativado'}`);
      router.refresh();
    } catch (err) {
      toast.error('Erro ao alterar status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={toggleStatus} disabled={loading}>
        {tenant.is_active ? 'Suspender' : 'Ativar'}
      </Button>
    </div>
  );
}
```

#### `src/app/api/admin/tenants/[id]/suspender/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSuperAdmin } from '@/lib/auth/isSuperAdmin';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!await isSuperAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = await createClient();

  // 1. Suspender no Stripe
  // 2. Suspender no Supabase
  await supabase
    .from('tenants')
    .update({
      is_active: false,
      suspended_at: new Date().toISOString(),
      suspension_reason: 'manual_admin',
    })
    .eq('id', params.id);

  // 3. Log
  await supabase.from('audit_logs').insert({
    action: 'tenant.suspended',
    entity: 'tenant',
    entity_id: params.id,
  });

  return NextResponse.json({ sucesso: true });
}
```

---

### Audit Logs

#### `src/app/(super-admin)/admin/audit/page.tsx`

```typescript
import { createClient } from '@/lib/supabase/server';

export default async function AuditPage({ searchParams }: { searchParams: { tenant_id?: string } }) {
  const supabase = createClient();

  let query = supabase
    .from('audit_logs')
    .select('*, tenant:tenants(name), user:users(name, email)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (searchParams.tenant_id) {
    query = query.eq('tenant_id', searchParams.tenant_id);
  }

  const { data: logs } = await query;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Audit Logs</h1>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left">Quando</th>
              <th className="px-4 py-3 text-left">Tenant</th>
              <th className="px-4 py-3 text-left">Usuário</th>
              <th className="px-4 py-3 text-left">Ação</th>
              <th className="px-4 py-3 text-left">Entidade</th>
              <th className="px-4 py-3 text-left">Categoria</th>
            </tr>
          </thead>
          <tbody>
            {logs?.map((log) => (
              <tr key={log.id} className="border-b">
                <td className="px-4 py-3 text-slate-600">
                  {new Date(log.created_at).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-3">{(log.tenant as any)?.name || '—'}</td>
                <td className="px-4 py-3">{(log.user as any)?.name || '—'}</td>
                <td className="px-4 py-3 font-mono text-xs">{log.action}</td>
                <td className="px-4 py-3">{log.entity}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 bg-slate-100 rounded text-xs">
                    {log.category}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

## ✅ Checklist

- [ ] Layout admin com sidebar
- [ ] Dashboard com métricas
- [ ] Lista de tenants com filtros
- [ ] Detalhe de tenant com usuários e audit
- [ ] Ações: suspender, ativar
- [ ] Audit logs view
- [ ] Suporte tickets view
- [ ] Feature flags view
- [ ] Teste: acessar `/admin` como super admin
- [ ] Teste: suspender um tenant
- [ ] Teste: ver logs

---

## 📚 Próximo passo

Continue com [`12-ui-app.md`](12-ui-app.md).

---

> 📄 **Documento master:** [../../ESPECIFICACAO.md](../../ESPECIFICACAO.md) — todas as decisões em um único arquivo.
>
> 🏢 **MeuJudi é uma vertical** (meujudi) do monorepo multi-tenant. Estrutura: erticals → 	enants → users → dados específicos.
>
> 📂 **Estrutura de pastas** (multi-vertical): lib/verticals/meujudi/ (isolado), lib/verticals/game/ (futuro), migrations/meujudi/, migrations/shared/, migrations/game/.
