/**
 * Edge-safe NextAuth instance — used ONLY by middleware.
 * Must NOT import bcrypt, pg, Prisma, or any Node.js-only module.
 * The full auth instance (with database + bcrypt) lives in index.ts.
 */
import NextAuth from "next-auth";

export const { auth } = NextAuth({
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt: ({ token }) => token,
    session: ({ session, token }) => {
      session.user.id = token.sub as string;
      (session as Record<string, unknown> & typeof session).tenantId = token.tenantId;
      return session;
    },
  },
});
