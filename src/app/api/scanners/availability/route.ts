import { requirePermissionApi, isAuthError } from "@/lib/auth/session";
import { ENGINE_REGISTRY } from "@/lib/scanners/engine-registry";
import { NextResponse } from "next/server";

export async function GET() {
  const guard = await requirePermissionApi("discovery:read");
  if (isAuthError(guard)) return guard;
  const checks = await Promise.all(
    Array.from(ENGINE_REGISTRY.entries()).map(async ([sensorType, engine]) => {
      if (engine.requiresAgent) return { sensorType, available: false, reason: "agent" };
      try {
        const available = await engine.isAvailable();
        return { sensorType, available, reason: available ? null : "not_installed" };
      } catch {
        return { sensorType, available: false, reason: "error" };
      }
    })
  );

  const result: Record<string, { available: boolean; reason: string | null }> = {};
  for (const c of checks) result[c.sensorType] = { available: c.available, reason: c.reason };

  return NextResponse.json(result);
}
