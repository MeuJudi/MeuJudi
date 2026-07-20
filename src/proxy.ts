import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const protectedPrefixes = [
  "/dashboard",
  "/monitoramento",
  "/agenda",
  "/tarefas",
  "/clientes",
  "/relatorios",
  "/financeiro",
  "/configuracoes",
  "/onboarding",
  "/cs",
  "/team",
  "/admin",
];
const publicPrefixes = ["/admin/login", "/forgot-password", "/reset-password"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const hasSession = Boolean(user);

  function redirectWithSession(pathname: string) {
    const redirectResponse = NextResponse.redirect(new URL(pathname, request.url));
    response.cookies.getAll().forEach(({ name, value }) => redirectResponse.cookies.set(name, value));
    return redirectResponse;
  }

  if (publicPrefixes.some((prefix) => path.startsWith(prefix))) {
    // O Super Admin tem uma entrada propria. A sessao do MeuJudi nao deve
    // impedir que a tela de login administrativo seja exibida.
    return response;
  }

  if (protectedPrefixes.some((prefix) => path.startsWith(prefix)) && !hasSession) {
    return redirectWithSession("/login");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
