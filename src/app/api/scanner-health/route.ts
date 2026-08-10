import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { checkScannerHealth } from "@/lib/scanners/health.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Health check is slow (spawns processes) — cache for 2 minutes
let cached: { data: unknown; expiresAt: number } | null = null;

export async function GET() {
  const ctx = await requireAuth();
  if (isAuthError(ctx)) return ctx;

  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.data);
  }

  const health = await checkScannerHealth();
  cached = { data: health, expiresAt: now + 2 * 60 * 1000 };
  return NextResponse.json(health);
}
