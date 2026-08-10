import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth", "/_next", "/favicon", "/senqor"];

// Use __Secure- prefix only when running on HTTPS (AUTH_URL starts with https://)
const useSecureCookies = process.env.AUTH_URL?.startsWith("https://") ?? false;
const SESSION_COOKIE = useSecureCookies
  ? "__Secure-authjs.session-token"
  : "authjs.session-token";

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return NextResponse.next();

  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;

  if (!hasSession) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.svg|.*\\.ico).*)"],
};
