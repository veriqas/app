import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config — no Node.js-only imports (no bcrypt, no pg).
 * Used exclusively by middleware for session validation.
 * The full config with database + bcrypt lives in config.ts.
 */
export const edgeAuthConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [], // credentials are only authorized on the Node.js side
  callbacks: {
    async jwt({ token }) { return token; },
    async session({ session, token }) {
      session.user.id = token.sub as string;
      (session as Record<string, unknown> & typeof session).tenantId = token.tenantId;
      (session as Record<string, unknown> & typeof session).tenantSlug = token.tenantSlug;
      return session;
    },
  },
};
