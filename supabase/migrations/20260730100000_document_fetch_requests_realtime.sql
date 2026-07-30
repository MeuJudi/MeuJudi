-- Faltou o passo que liga o Realtime de verdade: criar a tabela e a RLS
-- não é suficiente — o Postgres só manda eventos de `postgres_changes` pra
-- tabelas explicitamente adicionadas na publicação `supabase_realtime`
-- (isso é opt-in por tabela, diferente de RLS). Sem isso, o CS assina o
-- canal com sucesso (fica "ativo" nos logs) mas nunca recebe nada — foi
-- exatamente o sintoma observado: pedidos ficavam presos em `pending` pra
-- sempre, `device_id` nunca preenchido.
alter publication supabase_realtime add table public.document_fetch_requests;
