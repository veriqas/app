import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        let user;
        try {
          user = await db.user.findFirst({
            where: { email: credentials.email as string, isActive: true },
            include: { tenant: { select: { id: true, slug: true } } },
          });
        } catch (e) {
          console.error("[auth] DB error during authorize:", e);
          return null;
        }
        if (!user) { console.log("[auth] No user found for:", credentials.email); return null; }

        const passwordHash = user.passwordHash;
        if (!passwordHash) { console.log("[auth] No password hash for:", credentials.email); return null; }

        const valid = await bcrypt.compare(credentials.password as string, passwordHash);
        if (!valid) { console.log("[auth] Password mismatch for:", credentials.email); return null; }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image ?? null,
          tenantId: user.tenantId,
          tenantSlug: user.tenant.slug,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.tenantId = (user as Record<string, unknown>).tenantId as string;
        token.tenantSlug = (user as Record<string, unknown>).tenantSlug as string;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub as string;
      (session as Record<string, unknown> & typeof session).tenantId = token.tenantId;
      (session as Record<string, unknown> & typeof session).tenantSlug = token.tenantSlug;
      return session;
    },
  },
};
