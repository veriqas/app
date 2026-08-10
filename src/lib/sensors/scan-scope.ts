/**
 * Scan scope enforcement for active scanners (ZGrab2, SSLyze, ssh-audit).
 * Never permit unrestricted scanning. Every active scan job must reference
 * an approved ScanScope. Scope violations are audit-logged and rejected.
 */

import { db } from "@/lib/db/client";

export interface ScopeCheckResult {
  allowed: boolean;
  reason: string;
  scopeId?: string;
}

/**
 * Verify that all targets are covered by an approved, active ScanScope
 * for the given sensor type. If any target is not in scope, the entire
 * job is rejected.
 */
export async function checkScanScope(
  tenantId: string,
  sensorType: string,
  targets: string[],
  requestedBy: string
): Promise<ScopeCheckResult> {
  // Find active scopes for this tenant that allow this sensor
  const scopes = await db.scanScope.findMany({
    where: {
      tenantId,
      isActive: true,
      approvedBy: { not: null },  // must be approved by a human
    },
  });

  if (scopes.length === 0) {
    await auditScopeViolation(tenantId, sensorType, targets, requestedBy, "No approved scopes exist");
    return { allowed: false, reason: "No approved scan scopes exist for this tenant." };
  }

  // Check sensor allowlist
  const sensorScopes = scopes.filter(
    s => s.allowedSensors.length === 0 || s.allowedSensors.includes(sensorType)
  );
  if (sensorScopes.length === 0) {
    await auditScopeViolation(tenantId, sensorType, targets, requestedBy,
      `Sensor ${sensorType} not in any approved scope`);
    return { allowed: false, reason: `Sensor "${sensorType}" is not permitted by any approved scope.` };
  }

  // Verify every target is covered
  const outOfScope = targets.filter(
    t => !sensorScopes.some(s => targetInScope(t, s.targets))
  );

  if (outOfScope.length > 0) {
    const msg = `${outOfScope.length} target(s) out of scope: ${outOfScope.slice(0, 3).join(", ")}`;
    await auditScopeViolation(tenantId, sensorType, outOfScope, requestedBy, msg);
    return { allowed: false, reason: msg };
  }

  // Use first matching scope
  const scope = sensorScopes[0];
  return { allowed: true, reason: "All targets within approved scope.", scopeId: scope.id };
}

function targetInScope(target: string, scopeTargets: string[]): boolean {
  // Strip port from target for hostname/wildcard comparisons
  const targetHost = target.replace(/:\d+$/, "");
  return scopeTargets.some(s => {
    // CIDR match, hostname match, or wildcard domain match
    if (s === target || s === targetHost) return true;
    if (s.startsWith("*.") && (target.endsWith(s.slice(1)) || targetHost.endsWith(s.slice(1)))) return true;
    // Simplified CIDR: same /24 prefix check (production would use a proper CIDR lib)
    if (s.endsWith("/24")) {
      const prefix = s.replace("/24", "").split(".").slice(0, 3).join(".");
      return target.startsWith(prefix + ".");
    }
    return false;
  });
}

async function auditScopeViolation(
  tenantId: string,
  sensorType: string,
  targets: string[],
  userId: string,
  reason: string
) {
  try {
    await db.auditEvent.create({
      data: {
        tenantId,
        userId,
        action: "SCAN_SCOPE_VIOLATION",
        entityType: "ScanJob",
        entityId: "SCOPE_CHECK",
        metadata: { sensorType, targets, reason } as object,
      },
    });
  } catch {
    // Audit log failure must not block the rejection
  }
}
