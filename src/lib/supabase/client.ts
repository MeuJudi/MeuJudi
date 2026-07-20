import { createBrowserClient } from "@supabase/ssr";
import { ADMIN_AUTH_COOKIE, type AuthScope } from "./auth-scope";

export function createClient(scope: AuthScope = "tenant") {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: scope === "admin" ? { name: ADMIN_AUTH_COOKIE } : undefined },
  );
}
