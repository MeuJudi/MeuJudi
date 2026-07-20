import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ADMIN_AUTH_COOKIE, type AuthScope } from "./auth-scope";

export async function createClient(scope: AuthScope = "tenant") {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: scope === "admin" ? { name: ADMIN_AUTH_COOKIE } : undefined,
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
