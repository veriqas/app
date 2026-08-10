import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth", "/_next", "/favicon", "/senqor"];
const INTERNAL_SECRET = "veriqas-internal-2026";

// Use __Secure- prefix only when running on HTTPS (AUTH_URL starts with https://)
const useSecureCookies = process.env.AUTH_URL?.startsWith("https://") ?? false;
const SESSION_COOKIE = useSecureCookies
  ? "__Secure-authjs.session-token"
  : "authjs.session-token";

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return NextResponse.next();

  // Allow internal worker calls to remediation run endpoint
  if (/^\/api\/remediation\/[^/]+\/run$/.test(pathname) &&
      req.headers.get("x-internal-secret") === INTERNAL_SECRET) {
    return NextResponse.next();
  }

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
