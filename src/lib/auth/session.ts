import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

/** Get tenantId + userId for use in Server Components (no Response needed). */
export async function getServerSession(): Promise<AuthContext | null> {
  const session = await auth();
  if (!session?.user) return null;
  const tenantId = (session as Record<string, unknown> & typeof session).tenantId as string | undefined;
  if (!tenantId) return null;

  // Resolve the live User.id from DB — guards against stale JWTs after a reseed
  let userId = session.user.id ?? "system";
  if (userId !== "system" && session.user.email) {
    const liveUser = await db.user.findFirst({
      where: { email: session.user.email, tenantId, isActive: true },
      select: { id: true },
    });
    if (liveUser) userId = liveUser.id;
  }

  return { tenantId, userId };
}

export interface AuthContext {
  tenantId: string;
  userId: string;
}

/**
 * Extract tenantId and userId from the session.
 * Returns a 401 NextResponse if not authenticated.
 */
export async function requireAuth(): Promise<AuthContext | NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = (session as Record<string, unknown> & typeof session).tenantId as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated with this account" }, { status: 403 });
  }

  let userId = session.user.id ?? "system";
  if (userId !== "system" && session.user.email) {
    const liveUser = await db.user.findFirst({
      where: { email: session.user.email, tenantId, isActive: true },
      select: { id: true },
    });
    if (liveUser) userId = liveUser.id;
  }

  return { tenantId, userId };
}

export function isAuthError(v: AuthContext | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}
