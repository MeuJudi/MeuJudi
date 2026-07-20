import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ADMIN_AUTH_COOKIE, SUPPORT_TENANT_COOKIE, type AuthScope } from "./auth-scope";

export async function createClient(scope?: AuthScope) {
  const cookieStore = await cookies();
  const effectiveScope = scope ?? (cookieStore.get(SUPPORT_TENANT_COOKIE)?.value ? "admin" : "tenant");

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: effectiveScope === "admin" ? { name: ADMIN_AUTH_COOKIE } : undefined,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot always write cookies. Server Actions can.
          }
        },
      },
    },
  );
}
