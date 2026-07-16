# 12 — UI do App MeuJudi

> Dependências: Fases 01-11
> Duração estimada: 1-2 semanas
> Prioridade: 🟠 Alta (experiência do usuário)

---

## 🎯 Objetivo

Criar a interface principal do app MeuJudi para o advogado usuário final:
- Dashboard com resumo
- Lista de processos com filtros
- Detalhe do processo com movimentações
- Cadastro de clientes
- Agenda unificada
- Configurações de cert. A1 e OABs

---

## 📁 Estrutura de páginas

```
src/app/(platform)/
├── onboarding/
│   └── page.tsx                # Setup inicial
├── dashboard/
│   └── page.tsx                # Resumo
├── processos/
│   ├── page.tsx                # Lista
│   ├── novo/page.tsx           # Cadastrar CNJ
│   └── [cnj]/
│       └── page.tsx            # Detalhe
├── clientes/
│   ├── page.tsx                # Lista
│   ├── novo/page.tsx
│   └── [id]/page.tsx           # Detalhe
├── agenda/
│   └── page.tsx                # Prazos + audiências
├── equipe/
│   └── page.tsx                # Advogados
├── cert-a1/
│   └── page.tsx                # Configurar cert
└── settings/
    ├── page.tsx
    ├── oabs/page.tsx
    └── preferencias/page.tsx
```

---

## 🏠 Dashboard

### `src/app/(platform)/dashboard/page.tsx`

```typescript
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { formatCnj, formatDateBR } from '@/lib/format';

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Buscar tenant_id via user
  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user!.id)
    .single();

  const tenantId = profile!.tenant_id;

  // Métricas
  const [
    { count: totalProcessos },
    { count: processosNovos },
    { data: proximasAudiencias },
    { data: proximosPrazos },
  ] = await Promise.all([
    supabase
      .from('processos')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'ativo'),
    supabase
      .from('movimentacoes')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_novo', true),
    supabase
      .from('agenda_eventos')
      .select('*, processo:processos(cnj, classe_nome)')
      .eq('tenant_id', tenantId)
      .eq('tipo', 'audiencia')
      .eq('status', 'pendente')
      .gte('data_inicio', new Date().toISOString())
      .order('data_inicio')
      .limit(5),
    supabase
      .from('agenda_eventos')
      .select('*, processo:processos(cnj, classe_nome)')
      .eq('tenant_id', tenantId)
      .eq('tipo', 'prazo')
      .eq('status', 'pendente')
      .gte('data_inicio', new Date().toISOString())
      .order('data_inicio')
      .limit(5),
  ]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-slate-600">Bem-vindo de volta, {user!.email}</p>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Processos Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalProcessos || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Movimentações Novas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              {processosNovos || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Audiências Próximas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{proximasAudiencias?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Prazos Próximos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {proximosPrazos?.length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Audiências e Prazos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Próximas Audiências</CardTitle>
          </CardHeader>
          <CardContent>
            {proximasAudiencias?.length === 0 ? (
              <p className="text-slate-500 text-sm">Nenhuma audiência próxima</p>
            ) : (
              <ul className="space-y-3">
                {proximasAudiencias?.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                    <div>
                      <Link
                        href={`/processos/${(a.processo as any).cnj}`}
                        className="font-medium text-sm hover:underline"
                      >
                        {formatCnj((a.processo as any).cnj)}
                      </Link>
                      <div className="text-xs text-slate-600">
                        {new Date(a.data_inicio).toLocaleString('pt-BR')}
                      </div>
                      <div className="text-xs text-slate-500">
                        {(a.processo as any).classe_nome}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prazos Fatais</CardTitle>
          </CardHeader>
          <CardContent>
            {proximosPrazos?.length === 0 ? (
              <p className="text-slate-500 text-sm">Nenhum prazo próximo</p>
            ) : (
              <ul className="space-y-3">
                {proximosPrazos?.map((p) => (
                  <li key={p.id} className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-red-500 rounded-full mt-2" />
                    <div>
                      <Link
                        href={`/processos/${(p.processo as any).cnj}`}
                        className="font-medium text-sm hover:underline"
                      >
                        {formatCnj((p.processo as any).cnj)}
                      </Link>
                      <div className="text-xs text-slate-600">
                        {new Date(p.data_inicio).toLocaleDateString('pt-BR')}
                      </div>
                      <div className="text-xs text-slate-500">
                        {p.titulo}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

---

## 📋 Lista de processos

### `src/app/(platform)/processos/page.tsx`

```typescript
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCnj, formatDateBR, timeAgo } from '@/lib/format';
import { Plus, Search } from 'lucide-react';

export default async function ProcessosPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; tribunal?: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user!.id)
    .single();

  let query = supabase
    .from('processos')
    .select('*')
    .eq('tenant_id', profile!.tenant_id)
    .order('data_ultima_movimentacao', { ascending: false });

  if (searchParams.status) {
    query = query.eq('status', searchParams.status);
  } else {
    query = query.eq('status', 'ativo');
  }
  if (searchParams.tribunal) {
    query = query.eq('tribunal', searchParams.tribunal);
  }
  if (searchParams.q) {
    query = query.or(`cnj.ilike.%${searchParams.q.replace(/\D/g, '')}%,autor.ilike.%${searchParams.q}%,reu.ilike.%${searchParams.q}%`);
  }

  const { data: processos } = await query.limit(100);

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Processos</h1>
        <Button asChild>
          <Link href="/processos/novo">
            <Plus className="w-4 h-4 mr-2" />
            Novo processo
          </Link>
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <form className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="search"
                name="q"
                defaultValue={searchParams.q}
                placeholder="Buscar por CNJ, autor, réu..."
                className="w-full pl-10 pr-4 py-2 border rounded"
              />
            </div>
            <select
              name="status"
              defaultValue={searchParams.status || 'ativo'}
              className="px-3 py-2 border rounded"
            >
              <option value="ativo">Ativos</option>
              <option value="suspenso">Suspensos</option>
              <option value="arquivado">Arquivados</option>
              <option value="concluido">Concluídos</option>
            </select>
            <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded">
              Filtrar
            </button>
          </form>
        </CardContent>
      </Card>

      {/* Lista */}
      <div className="space-y-2">
        {processos?.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-slate-500">
              Nenhum processo encontrado
            </CardContent>
          </Card>
        ) : (
          processos?.map((p) => (
            <Link key={p.id} href={`/processos/${p.cnj}`}>
              <Card className="hover:bg-slate-50 cursor-pointer transition">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="font-mono text-sm font-semibold">
                          {formatCnj(p.cnj)}
                        </code>
                        {p.is_favorito && <Badge variant="outline">⭐</Badge>}
                      </div>
                      <div className="text-sm text-slate-600">
                        {p.classe_nome || '—'}
                      </div>
                      <div className="text-sm mt-1">
                        <span className="text-slate-500">Autor:</span> {p.autor || '—'}
                      </div>
                      {p.reu && (
                        <div className="text-sm">
                          <span className="text-slate-500">Réu:</span> {p.reu}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <div>
                        {p.data_ultima_movimentacao
                          ? timeAgo(p.data_ultima_movimentacao)
                          : '—'}
                      </div>
                      <div className="mt-1">
                        <Badge variant="outline">{p.tribunal.toUpperCase()}</Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
```

---

## 📄 Detalhe do processo

### `src/app/(platform)/processos/[cnj]/page.tsx`

```typescript
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TimelineMovimentacoes } from '@/components/platform/TimelineMovimentacoes';
import { formatCnj, formatDateBR, formatDateTimeBR, timeAgo } from '@/lib/format';
import { Star, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export default async function ProcessoPage({ params }: { params: { cnj: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user!.id)
    .single();

  const cnj = params.cnj.replace(/\D/g, '');

  // 1. Buscar processo + movimentações + comunicações
  const [
    { data: processo },
    { data: movimentacoes },
    { data: comunicacoes },
    { data: agenda },
  ] = await Promise.all([
    supabase
      .from('processos')
      .select('*')
      .eq('tenant_id', profile!.tenant_id)
      .eq('cnj', cnj)
      .single(),
    supabase
      .from('movimentacoes')
      .select('*')
      .eq('processo_id', (await supabase
        .from('processos')
        .select('id')
        .eq('tenant_id', profile!.tenant_id)
        .eq('cnj', cnj)
        .single()).data?.id || '00000000-0000-0000-0000-000000000000')
      .order('data_movimento', { ascending: false })
      .limit(50),
    supabase
      .from('comunicacoes_mural')
      .select('*')
      .eq('tenant_id', profile!.tenant_id)
      .order('data_disponibilizacao', { ascending: false })
      .limit(20),
    supabase
      .from('agenda_eventos')
      .select('*')
      .eq('tenant_id', profile!.tenant_id)
      .gte('data_inicio', new Date().toISOString())
      .order('data_inicio')
      .limit(5),
  ]);

  if (!processo) notFound();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <Link href="/processos" className="text-sm text-slate-500 hover:underline">
          ← Voltar
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono">
            {formatCnj(processo.cnj)}
          </h1>
          <p className="text-slate-600 mt-1">{processo.classe_nome}</p>
          <p className="text-sm text-slate-500">
            {processo.tribunal.toUpperCase()} · {processo.orgao_julgador}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon">
            <Star className={processo.is_favorito ? 'fill-yellow-400' : ''} />
          </Button>
          <Button variant="outline" onClick={() => sincronizarAgora(processo.cnj)}>
            ↻ Atualizar
          </Button>
        </div>
      </div>

      {/* Capa */}
      <Card>
        <CardHeader>
          <CardTitle>Capa Processual</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Classe</dt>
              <dd>{processo.classe_nome}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Sistema</dt>
              <dd>{processo.sistema}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Ajuizamento</dt>
              <dd>{processo.data_ajuizamento ? formatDateBR(processo.data_ajuizamento) : '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Autor</dt>
              <dd>{processo.autor || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Réu</dt>
              <dd>{processo.reu || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Valor da causa</dt>
              <dd>
                {processo.valor_causa
                  ? processo.valor_causa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                  : '—'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Próximos eventos */}
      {agenda && agenda.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Próximos eventos</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {agenda.map((e) => (
                <li key={e.id} className="flex items-center gap-3">
                  <Badge variant={e.tipo === 'audiencia' ? 'default' : 'destructive'}>
                    {e.tipo}
                  </Badge>
                  <div>
                    <div className="font-medium">{e.titulo}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(e.data_inicio).toLocaleString('pt-BR')}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Timeline de movimentações */}
      <Card>
        <CardHeader>
          <CardTitle>Movimentações ({movimentacoes?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <TimelineMovimentacoes movimentacoes={movimentacoes || []} />
        </CardContent>
      </Card>

      {/* Comunicações do Mural */}
      {comunicacoes && comunicacoes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Comunicações do Mural</CardTitle>
            <CardDescription>Últimas {comunicacoes.length} comunicações</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {comunicacoes.map((c) => (
                <li key={c.id} className="border-l-2 border-blue-500 pl-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline">{c.tipo_comunicacao}</Badge>
                    <span className="text-xs text-slate-500">
                      {formatDateBR(c.data_disponibilizacao)} · {c.sigla_tribunal}
                    </span>
                    {c.link_processo && (
                      <a
                        href={c.link_processo}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 text-xs flex items-center gap-1"
                      >
                        Ver no tribunal <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <p className="text-sm">{c.texto}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function sincronizarAgora(cnj: string) {
  'use server';
  // Chamar edge function manualmente
  await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/poll-datajud`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ manual: true }),
  });
}
```

### `src/components/platform/TimelineMovimentacoes.tsx`

```typescript
'use client';

import { Badge } from '@/components/ui/badge';
import { formatDateTimeBR } from '@/lib/format';
import { useState } from 'react';

export function TimelineMovimentacoes({ movimentacoes }: { movimentacoes: any[] }) {
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});

  if (movimentacoes.length === 0) {
    return <p className="text-slate-500 text-sm">Nenhuma movimentação registrada</p>;
  }

  return (
    <ol className="space-y-4">
      {movimentacoes.map((m, idx) => (
        <li
          key={m.id}
          className={`relative pl-6 pb-4 ${idx < movimentacoes.length - 1 ? 'border-l-2 border-slate-200 ml-3' : 'ml-3'}`}
        >
          <span
            className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full ${
              m.is_novo ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-slate-300'
            }`}
          />
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <time className="text-xs text-slate-500">
                  {formatDateTimeBR(m.data_movimento)}
                </time>
                {m.is_novo && (
                  <Badge className="bg-emerald-500 text-white">NOVO</Badge>
                )}
                <Badge variant="outline" className="font-mono">
                  #{m.codigo}
                </Badge>
              </div>
              <div className="text-sm font-medium">{m.nome}</div>
              {m.complementos && m.complementos.length > 0 && (
                <button
                  onClick={() => setExpandido({ ...expandido, [m.id]: !expandido[m.id] })}
                  className="text-xs text-blue-600 mt-1"
                >
                  {expandido[m.id] ? 'Ocultar' : 'Ver'} detalhes
                </button>
              )}
              {expandido[m.id] && m.complementos && (
                <ul className="mt-2 space-y-1 text-xs">
                  {m.complementos.map((c: any, i: number) => (
                    <li key={i} className="text-slate-600">
                      <span className="font-mono">{c.codigo}</span> {c.nome}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
```

---

## 👥 Cadastro de Clientes

### `src/app/(platform)/clientes/page.tsx`

```typescript
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

export default async function ClientesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user!.id)
    .single();

  const { data: clientes } = await supabase
    .from('clientes')
    .select('*, processos:processos(count)')
    .eq('tenant_id', profile!.tenant_id)
    .order('nome')
    .limit(100);

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Clientes</h1>
        <Button asChild>
          <Link href="/clientes/novo">
            <Plus className="w-4 h-4 mr-2" />
            Novo cliente
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">Nome</th>
                <th className="px-4 py-3 text-left">Documento</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-right">Processos</th>
              </tr>
            </thead>
            <tbody>
              {clientes?.map((c) => (
                <tr key={c.id} className="border-b hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                      {c.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{c.cpf_cnpj || '—'}</td>
                  <td className="px-4 py-3 text-sm">{c.tipo_pessoa}</td>
                  <td className="px-4 py-3 text-right text-sm">
                    {c.processos?.[0]?.count || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## 📅 Agenda

### `src/app/(platform)/agenda/page.tsx`

```typescript
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from 'lucide-react';
import Link from 'next/link';
import { formatCnj } from '@/lib/format';

export default async function AgendaPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user!.id)
    .single();

  const { data: eventos } = await supabase
    .from('agenda_eventos')
    .select('*, processo:processos(cnj, classe_nome)')
    .eq('tenant_id', profile!.tenant_id)
    .eq('status', 'pendente')
    .order('data_inicio');

  return (
    <div className="container mx-auto p-6 space-y-4">
      <h1 className="text-3xl font-bold">Agenda</h1>

      <div className="grid gap-3">
        {eventos?.map((e) => (
          <Card key={e.id}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="text-center min-w-[60px]">
                <div className="text-2xl font-bold">
                  {new Date(e.data_inicio).getDate()}
                </div>
                <div className="text-xs text-slate-500 uppercase">
                  {new Date(e.data_inicio).toLocaleDateString('pt-BR', { month: 'short' })}
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant={e.tipo === 'audiencia' ? 'default' : 'destructive'}>
                    {e.tipo}
                  </Badge>
                  <Link
                    href={`/processos/${(e.processo as any)?.cnj}`}
                    className="font-mono text-sm hover:underline"
                  >
                    {formatCnj((e.processo as any)?.cnj || '')}
                  </Link>
                </div>
                <div className="text-sm mt-1">{e.titulo}</div>
                {e.descricao && (
                  <div className="text-xs text-slate-500">{e.descricao}</div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {eventos?.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center text-slate-500">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum evento na agenda</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
```

---

## 🎨 Helpers de formatação

### `src/lib/format.ts`

```typescript
export function formatCnj(cnj: string): string {
  const c = cnj.replace(/\D/g, '').padStart(20, '0');
  return `${c.slice(0, 7)}-${c.slice(7, 9)}.${c.slice(9, 13)}.${c.slice(13, 14)}.${c.slice(14, 16)}.${c.slice(16, 20)}`;
}

export function formatDateBR(date: string | Date): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('pt-BR');
}

export function formatDateTimeBR(date: string | Date): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('pt-BR');
}

export function timeAgo(date: string | Date): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const agora = new Date();
  const diff = agora.getTime() - d.getTime();
  const minutos = Math.floor(diff / 60000);
  const horas = Math.floor(minutos / 60);
  const dias = Math.floor(horas / 24);

  if (minutos < 60) return `há ${minutos} min`;
  if (horas < 24) return `há ${horas}h`;
  if (dias < 30) return `há ${dias}d`;
  return d.toLocaleDateString('pt-BR');
}
```

---

## ✅ Checklist

- [ ] Dashboard com cards de resumo
- [ ] Lista de processos com filtros
- [ ] Detalhe do processo com timeline
- [ ] Cadastro de clientes
- [ ] Agenda unificada
- [ ] Configurações (OABs, cert. A1)
- [ ] Páginas responsivas
- [ ] Loading states
- [ ] Empty states
- [ ] Error boundaries

---

## 📚 Próximo passo

Sistema completo! Próximos passos:
- Deploy em produção
- Onboarding dos primeiros clientes
- Monitoramento de uso
- Iterações baseadas em feedback

---

> 📄 **Documento master:** [../../ESPECIFICACAO.md](../../ESPECIFICACAO.md) — todas as decisões em um único arquivo.
>
> 🏢 **MeuJudi é uma vertical** (meujudi) do monorepo multi-tenant. Estrutura: erticals → 	enants → users → dados específicos.
>
> 📂 **Estrutura de pastas** (multi-vertical): lib/verticals/meujudi/ (isolado), lib/verticals/game/ (futuro), migrations/meujudi/, migrations/shared/, migrations/game/.
