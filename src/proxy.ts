import { NextResponse, type NextRequest } from "next/server";

const protectedPrefixes = ["/dashboard", "/onboarding", "/cs", "/team", "/admin"];
const authPrefixes = ["/login", "/register"];

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const hasSessionCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));

  if (protectedPrefixes.some((prefix) => path.startsWith(prefix)) && !hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (authPrefixes.some((prefix) => path.startsWith(prefix)) && hasSessionCookie) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
