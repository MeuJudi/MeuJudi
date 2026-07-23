# 10 — `regex_metadata.campo` é nullable apesar de ser obrigatório na prática

> **Severidade:** 🟢 Menor (latente — não está causando problema hoje, mas pode causar silenciosamente no futuro)
> **Achado durante:** Auditoria completa do motor de Regex + IA, 23/07/2026

---

## O que está acontecendo

A coluna `campo` foi adicionada em `regex_metadata` numa migration posterior
à criação da tabela (`supabase/migrations/20260719000000_golden_dataset_e_log_sem_regex.sql`),
e o próprio comentário da migration já reconhece isso como um gap:
```sql
-- campo nullable: gap de schema encontrado ao implementar a Parte 6
alter table public.regex_metadata add column if not exists campo text
  check (campo in ('prazo','valor','audiencia','oab'));
```

Ela **não tem `NOT NULL`**. Isso importa porque `src/lib/regex/engine.ts`
filtra candidatos com `.eq("campo", campo)` — em SQL/PostgREST, uma
comparação `campo = 'prazo'` nunca é verdadeira quando `campo IS NULL`
(regra padrão de NULL em SQL). Ou seja, **qualquer linha de `regex_metadata`
com `campo` nulo é permanentemente invisível pra `executarRegex`** — nunca
é candidata, nunca roda, nunca gera erro nem aviso em lugar nenhum.

### Por que não é um problema agora

Conferi todos os pontos de `insert` em `regex_metadata` no código TypeScript
atual — o único é `aprenderRegex` (`src/lib/ia/aprender-regex.ts`), que
sempre define `campo: params.campo` explicitamente. Não há nenhum caminho
hoje que crie uma linha sem `campo`. O risco é só **latente**: qualquer
inserção manual futura (via SQL Editor, um script de seed, uma migration de
dados) que esqueça essa coluna cria uma regex "fantasma" sem avisar
ninguém.

---

## Qual a solução

Adicionar `NOT NULL` na coluna, transformando um erro silencioso possível em
um erro de constraint explícito na hora da inserção (falha alto e cedo, em
vez de falhar silenciosamente meses depois).

```sql
alter table public.regex_metadata alter column campo set not null;
```

Antes de rodar isso em produção, é preciso confirmar que **nenhuma linha
existente** já tem `campo IS NULL` (senão a migration falha). Rodar antes:
```sql
select count(*) from public.regex_metadata where campo is null;
```
Se o resultado for `0`, a migration acima roda sem problema. Se for `> 0`,
essas linhas precisam ser corrigidas manualmente (provavelmente os 3 seeds
originais da fundação, se algum deles não tiver sido migrado corretamente —
vale conferir) antes de aplicar o `NOT NULL`.

---

## Como implementar

**Migration nova:** `supabase/migrations/YYYYMMDD_regex_metadata_campo_not_null.sql`
```sql
-- Antes de aplicar, confirmar que não há linhas com campo nulo:
-- select count(*) from public.regex_metadata where campo is null;
-- Se houver, corrigir manualmente antes de rodar esta migration.

alter table public.regex_metadata alter column campo set not null;
```

**Não requer mudança de código TypeScript** — o `insert` já sempre define
`campo`, então isso só formaliza no schema uma invariante que o código já
respeita.

**Teste de verificação:**
1. Rodar a query de contagem acima, confirmar `0`.
2. Aplicar a migration.
3. Tentar (num ambiente de teste) inserir uma linha em `regex_metadata` sem
   `campo` — confirmar que agora dá erro de constraint na hora, em vez de
   inserir silenciosamente.
