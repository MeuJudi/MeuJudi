# 10 — Stripe Billing (Assinatura SaaS)

> Dependências: Fases 01-09
> Duração estimada: 2-3 dias
> Prioridade: 🔴 Alta (receita!)

---

## 🎯 Objetivo

Implementar ciclo completo de cobrança SaaS:
- Planos (Starter, Pro, Business) configurados no Stripe
- Checkout hospedado
- Webhook de ativação/cancelamento/inadimplência
- Customer Portal pro advogado gerenciar próprio cartão
- Trial de 7 dias

---

## 🏗️ Arquitetura

```
[Cliente] ──Assina plano──> [Seu Web App]
                                 │
                                 ├── Checkout Session (Stripe)
                                 │   └── Redireciona pro Stripe
                                 │
[Stripe] ──Webhook──> [Edge Function: stripe-webhook]
                                 │
                                 ├── Cria/atualiza subscription
                                 ├── Marca tenant como ativo
                                 └── Atualiza plano

[Cliente] ──Cancela──> [Stripe Customer Portal]
                                 │
                                 └── Webhook atualiza status
```

---

## 💻 Código

### Setup Stripe (rodar 1x)

```typescript
// scripts/setup-stripe.ts
// Rodar manualmente com: npx tsx scripts/setup-stripe.ts

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function setupStripe() {
  // 1. Criar produto MeuJudi
  const product = await stripe.products.create({
    name: 'MeuJudi',
    description: 'Gestão de processos jurídicos',
  });

  // 2. Criar preços (4 planos)
  const planos = [
    { name: 'starter', price: 9900, adv: 2, proc: 200, oab: 1, ia: false, cert: false },
    { name: 'pro', price: 24900, adv: 5, proc: 1000, oab: 5, ia: true, cert: false },
    { name: 'business', price: 49900, adv: 15, proc: 5000, oab: 15, ia: true, cert: true },
    { name: 'enterprise', price: 0, adv: null, proc: null, oab: null, ia: true, cert: true },
  ];

  for (const plano of planos) {
    // 2a. Criar preço no Stripe
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plano.price,
      currency: 'brl',
      recurring: { interval: 'month' },
      metadata: { plan: plano.name },
    });

    // 2b. Atualizar plan no Supabase
    await supabase
      .from('plans')
      .update({ stripe_price_id: price.id, stripe_product_id: product.id })
      .eq('name', plano.name);

    console.log(`✓ Plano ${plano.name}: ${plano.price / 100} BRL/mês`);
  }

  console.log('✓ Stripe configurado com sucesso');
}

setupStripe();
```

---

### `src/app/api/billing/checkout/route.ts`

```typescript
// POST /api/billing/checkout
// Cria sessão de checkout pro cliente

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/requireUser';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  const user = await requireUser();
  const { priceId } = await request.json();

  const supabase = await createClient();

  // 1. Buscar tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', user.tenant_id)
    .single();

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 });
  }

  // 2. Buscar ou criar customer no Stripe
  let customerId = tenant.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { tenant_id: tenant.id },
    });
    customerId = customer.id;
    await supabase
      .from('tenants')
      .update({ stripe_customer_id: customerId })
      .eq('id', tenant.id);
  }

  // 3. Criar checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?canceled=true`,
    metadata: { tenant_id: tenant.id },
    subscription_data: {
      trial_period_days: 7,
      metadata: { tenant_id: tenant.id },
    },
  });

  return NextResponse.json({ url: session.url });
}
```

### `src/app/api/billing/portal/route.ts`

```typescript
// POST /api/billing/portal
// Cria sessão do Customer Portal

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/requireUser';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('stripe_customer_id')
    .eq('id', user.tenant_id)
    .single();

  if (!tenant?.stripe_customer_id) {
    return NextResponse.json({ error: 'Sem customer Stripe' }, { status: 400 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
  });

  return NextResponse.json({ url: session.url });
}
```

### `supabase/functions/stripe-webhook/index.ts`

```typescript
// Edge Function que recebe webhooks do Stripe
// Configurar URL no Stripe Dashboard: https://[SEU-PROJETO].supabase.co/functions/v1/stripe-webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13?target=denonext';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  if (!signature) {
    return new Response('No signature', { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
    );
  } catch (err) {
    console.error('[stripe-webhook] Erro ao verificar assinatura:', err.message);
    return new Response('Invalid signature', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  console.log(`[stripe-webhook] Evento: ${event.type}`);

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(supabase, subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(supabase, subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(supabase, invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(supabase, invoice);
        break;
      }

      default:
        console.log(`[stripe-webhook] Evento não tratado: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[stripe-webhook] Erro fatal:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

async function handleSubscriptionUpdate(supabase: any, subscription: any) {
  const tenantId = subscription.metadata.tenant_id;
  const priceId = subscription.items.data[0].price.id;

  // Buscar plan_id pelo stripe_price_id
  const { data: plan } = await supabase
    .from('plans')
    .select('id')
    .eq('stripe_price_id', priceId)
    .single();

  if (!plan) {
    console.error(`[stripe-webhook] Plano não encontrado pro price ${priceId}`);
    return;
  }

  await supabase.from('subscriptions').upsert({
    tenant_id: tenantId,
    plan_id: plan.id,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: subscription.customer,
    stripe_price_id: priceId,
    status: subscription.status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    trial_start: subscription.trial_start
      ? new Date(subscription.trial_start * 1000).toISOString()
      : null,
    trial_end: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
  });

  // Atualizar status do tenant
  const isActive = ['active', 'trialing'].includes(subscription.status);
  await supabase
    .from('tenants')
    .update({
      is_active: isActive,
      is_trial: subscription.status === 'trialing',
      trial_ends_at: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
    })
    .eq('id', tenantId);

  console.log(`[stripe-webhook] Subscription atualizada: ${tenantId} → ${plan.id}`);
}

async function handleSubscriptionDeleted(supabase: any, subscription: any) {
  const tenantId = subscription.metadata.tenant_id;

  await supabase
    .from('subscriptions')
    .update({ status: 'canceled', canceled_at: new Date().toISOString() })
    .eq('stripe_subscription_id', subscription.id);

  await supabase
    .from('tenants')
    .update({ is_active: false, suspended_at: new Date().toISOString() })
    .eq('id', tenantId);

  console.log(`[stripe-webhook] Tenant suspenso: ${tenantId}`);
}

async function handlePaymentSucceeded(supabase: any, invoice: any) {
  if (!invoice.subscription) return;

  await supabase.from('payments').insert({
    tenant_id: invoice.metadata?.tenant_id || invoice.subscription_details?.metadata?.tenant_id,
    subscription_id: invoice.subscription,
    stripe_payment_id: invoice.payment_intent,
    stripe_invoice_id: invoice.id,
    stripe_charge_id: invoice.charge,
    amount_cents: invoice.amount_paid,
    currency: invoice.currency,
    status: 'succeeded',
    payment_method: 'card',
    description: invoice.description,
    receipt_url: invoice.hosted_invoice_url,
  });
}

async function handlePaymentFailed(supabase: any, invoice: any) {
  if (!invoice.subscription) return;

  await supabase.from('payments').insert({
    tenant_id: invoice.metadata?.tenant_id,
    subscription_id: invoice.subscription,
    stripe_payment_id: invoice.payment_intent,
    amount_cents: invoice.amount_due,
    currency: invoice.currency,
    status: 'failed',
    payment_method: 'card',
  });

  // Notificar usuário sobre falha
  // (enviar email via Resend)
}
```

---

## 💳 Página de Billing no App

### `src/app/(platform)/billing/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const PLANOS = [
  { name: 'starter', display: 'Starter', price: 99, adv: 2, proc: 200, features: ['Polling DataJud'] },
  { name: 'pro', display: 'Pro', price: 249, adv: 5, proc: 1000, features: ['IA', 'Mural', 'Notificações'], popular: true },
  { name: 'business', display: 'Business', price: 499, adv: 15, proc: 5000, features: ['Cert. A1', 'IA avançada'] },
];

export default function BillingPage() {
  const [loading, setLoading] = useState<string | null>(null);

  const handleAssinar = async (planName: string) => {
    setLoading(planName);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: await getPriceId(planName) }),
      });
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      toast.error('Erro ao iniciar checkout');
    } finally {
      setLoading(null);
    }
  };

  const handlePortal = async () => {
    const res = await fetch('/api/billing/portal', { method: 'POST' });
    const { url } = await res.json();
    window.location.href = url;
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">Planos</h1>
      <p className="text-slate-600 mb-8">Escolha o plano ideal pro seu escritório</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANOS.map((plano) => (
          <Card key={plano.name} className={plano.popular ? 'border-blue-500 border-2' : ''}>
            <CardHeader>
              {plano.popular && <div className="text-xs text-blue-600 font-semibold mb-1">MAIS POPULAR</div>}
              <CardTitle>{plano.display}</CardTitle>
              <CardDescription>
                <div className="text-3xl font-bold mt-2">
                  R$ {plano.price}
                  <span className="text-sm font-normal text-slate-500">/mês</span>
                </div>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 mb-6">
                <li>✓ Até {plano.adv} advogados</li>
                <li>✓ Até {plano.proc} processos</li>
                {plano.features.map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              <Button
                onClick={() => handleAssinar(plano.name)}
                disabled={loading === plano.name}
                className="w-full"
                variant={plano.popular ? 'default' : 'outline'}
              >
                {loading === plano.name ? 'Carregando...' : 'Assinar'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-12 text-center">
        <p className="text-slate-600 mb-4">Já tem assinatura?</p>
        <Button variant="outline" onClick={handlePortal}>
          Gerenciar assinatura
        </Button>
      </div>
    </div>
  );
}

async function getPriceId(planName: string): Promise<string> {
  const res = await fetch(`/api/billing/plans?name=${planName}`);
  const data = await res.json();
  return data.priceId;
}
```

---

## 🔧 Configurar Webhook no Stripe

1. **Stripe Dashboard** → **Developers** → **Webhooks** → **Add endpoint**
2. URL: `https://[SEU-PROJETO].supabase.co/functions/v1/stripe-webhook`
3. Events to send:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copie o **Signing secret** → adicione como `STRIPE_WEBHOOK_SECRET` no Supabase

---

## ✅ Checklist

- [ ] Script `setup-stripe.ts` rodado, 4 preços criados
- [ ] Customer Portal ativado no Stripe
- [ ] Webhook configurado no Stripe Dashboard
- [ ] Variável `STRIPE_WEBHOOK_SECRET` configurada
- [ ] Edge function `stripe-webhook` deployada
- [ ] Página `/billing` no app funcionando
- [ ] Teste com cartão de teste: `4242 4242 4242 4242`
- [ ] Teste de inadimplência (cartão recusado)
- [ ] Teste de cancelamento via Customer Portal

---

## 📚 Próximo passo

Continue com [`11-super-admin.md`](11-super-admin.md).

---

> 📄 **Documento master:** [../../ESPECIFICACAO.md](../../ESPECIFICACAO.md) — todas as decisões em um único arquivo.
>
> 🏢 **MeuJudi é uma vertical** (meujudi) do monorepo multi-tenant. Estrutura: erticals → 	enants → users → dados específicos.
>
> 📂 **Estrutura de pastas** (multi-vertical): lib/verticals/meujudi/ (isolado), lib/verticals/game/ (futuro), migrations/meujudi/, migrations/shared/, migrations/game/.
