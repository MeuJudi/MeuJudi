// Client de service role — bypassa RLS. Uso restrito a Edge Functions, cron
// jobs e scripts de background (nunca em código exposto ao navegador ou em
// rotas que respondem diretamente a um usuário sem checagem de tenant).
//
// Diferente de `server.ts` (que usa a sessão do usuário via cookies e respeita
// RLS), este client existe pra rodar fora de um request context do Next.js
// (ex: scripts de teste em `tests/`, futuras Edge Functions do motor
// Regex + IA — ver docs/roadmap/08-ia-regex.md).

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
