# MeuJudi Web

Fundacao do app Web do MeuJudi, um SaaS multi-tenant para escritorios de advocacia.

## Estado atual

- App Web Next.js na raiz do projeto.
- Supabase preparado para o projeto `https://lsuhkzvbzgkbjyfuppeg.supabase.co`.
- `meujudi-cs/` e instaladores ficam fora do Git.
- MVP gratuito, inicialmente para um escritorio.
- Stripe, planos comerciais e multiplos PJEs ficam para etapas futuras.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui como padrao de componentes
- Supabase Auth + Postgres + RLS

## Como rodar

```powershell
npm.cmd install
npm.cmd run dev
```

Abra `http://localhost:3000`.

## Variaveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Nunca envie `.env.local` para o Git.

## Estrutura principal

```text
src/app/                 Rotas Web
src/components/ui/       Componentes base shadcn
src/lib/supabase/        Clientes Supabase SSR/browser
src/lib/regex/           Regex juridicos iniciais
supabase/migrations/     Schema e RLS do Supabase
docs/roadmap/            Planejamento e decisoes
public/                  Assets publicos do Web
```

## Regras importantes

- `meujudi-cs/` nao entra no Git.
- Chaves secretas, principalmente `SUPABASE_SERVICE_ROLE_KEY`, nunca entram no Git nem em variavel `NEXT_PUBLIC_`.
- Fontes publicas globais, como DataJud/Mural, serao buscadas uma vez e distribuidas por tenant apenas quando houver vinculo confirmado por CNJ/OAB.
- Itens publicos sem vinculo com nenhum tenant devem ser descartados.
- Dados vindos do CS/PJe autenticado ficam restritos ao tenant que conectou.
- O console operacional separado usa `users.role = 'super_admin'`, definido manualmente por Caio.
- Pendencias de SaaS e JudiCore Control ficam registradas em `docs/roadmap/17-gap-saas-super-admin.md`.

## Validacao

```powershell
npm.cmd run typecheck
npm.cmd run build
git status --short --ignored
```
