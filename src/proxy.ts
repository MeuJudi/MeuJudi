import { NextResponse, type NextRequest } from "next/server";

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

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const hasSessionCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));

  if (publicPrefixes.some((prefix) => path.startsWith(prefix))) {
    if (hasSessionCookie && path === "/admin/login") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  if (protectedPrefixes.some((prefix) => path.startsWith(prefix)) && !hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
