/**
 * Role-based access control.
 *
 * Permissions are the unit of authorisation; roles are named bundles of them.
 * Guards therefore ask for a capability ("may this session read every case?")
 * rather than a job title, so a new role can be introduced later without
 * revisiting a single call site.
 *
 * Two rules this module exists to enforce:
 *
 *  1. Authorisation is checked on the SERVER, on the page and on the API route.
 *     Hiding a navigation item is presentation, not access control — several
 *     administration pages are absent from the sidebar and remain reachable by
 *     typing their URL.
 *  2. It fails CLOSED. A session whose roles cannot be established gets the
 *     minimum bundle, never the maximum.
 */
// Relative import: unit tests exercise this module without the "@/" alias.
import { db } from "../db/client";

export const PERMISSIONS = [
  // Discovery
  "discovery:read", "discovery:run", "observations:read",
  // Remediation
  "cases:read:all", "cases:read:assigned", "cases:remediate",
  // Work management
  "actions:read:all", "actions:assign",
  // Reporting and governance
  "reporting:trends", "reporting:board", "governance:accept-risk",
  // Administration
  "admin:users", "admin:config", "admin:audit",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["REVIEWER", "ANALYST", "MANAGER", "ADMIN"] as const;
export type RoleName = (typeof ROLES)[number];

const REVIEWER: Permission[] = ["cases:read:assigned", "observations:read"];

const ANALYST: Permission[] = [
  ...REVIEWER,
  "discovery:read", "discovery:run",
  "cases:read:all", "cases:remediate",
  "actions:read:all", "actions:assign",
  "reporting:trends",
];

/**
 * A manager may see the board's view of exposure and formally accept risk.
 * Deliberately withheld from ANALYST: whoever remediates a finding should not
 * also be able to declare it acceptable, or shape what the board is shown.
 */
const MANAGER: Permission[] = [...ANALYST, "reporting:board", "governance:accept-risk"];

const ADMIN: Permission[] = [...MANAGER, "admin:users", "admin:config", "admin:audit"];

export const ROLE_BUNDLES: Record<RoleName, Permission[]> = { REVIEWER, ANALYST, MANAGER, ADMIN };

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  REVIEWER: "Sees only the cases assigned to them and the evidence needed to review them.",
  ANALYST:  "Runs scans, triages findings and drives remediation. No board reporting, no risk acceptance.",
  MANAGER:  "Everything an analyst can do, plus board reporting and formal risk acceptance.",
  ADMIN:    "Full access, including users, configuration and the audit log.",
};

/** The bundle applied when a session has no role. Minimum, never maximum. */
export const FALLBACK_ROLE: RoleName = "REVIEWER";

export interface SessionPermissions {
  permissions: Set<Permission>;
  roles: RoleName[];
  /** True when no role was found and the fallback bundle was applied. */
  isFallback: boolean;
}

/** Resolve the permissions granted to a user, from their assigned roles. */
export async function loadPermissions(userId: string, tenantId: string): Promise<SessionPermissions> {
  if (!userId || userId === "system" || !tenantId) {
    return { permissions: new Set(ROLE_BUNDLES[FALLBACK_ROLE]), roles: [], isFallback: true };
  }
  let names: string[] = [];
  let granted: Permission[] = [];
  try {
    const assignments = await db.userRole.findMany({
      where: { userId, role: { tenantId } },
      select: { role: { select: { name: true, permissions: true } } },
    });
    for (const a of assignments) {
      const name = a.role.name.toUpperCase();
      names.push(name);
      // A role's stored permissions win; the named bundle is the fallback for
      // roles created before a permission was introduced.
      const stored = (a.role.permissions as { permissions?: string[] } | null)?.permissions;
      if (Array.isArray(stored) && stored.length > 0) granted.push(...(stored as Permission[]));
      else if ((ROLES as readonly string[]).includes(name)) granted.push(...ROLE_BUNDLES[name as RoleName]);
    }
  } catch {
    // A lookup failure must not widen access.
    return { permissions: new Set(ROLE_BUNDLES[FALLBACK_ROLE]), roles: [], isFallback: true };
  }

  if (granted.length === 0) {
    return { permissions: new Set(ROLE_BUNDLES[FALLBACK_ROLE]), roles: [], isFallback: true };
  }
  return {
    permissions: new Set(granted),
    roles: names.filter((n): n is RoleName => (ROLES as readonly string[]).includes(n)),
    isFallback: false,
  };
}

export function can(sp: SessionPermissions | null | undefined, permission: Permission): boolean {
  return !!sp?.permissions.has(permission);
}

export function canAny(sp: SessionPermissions | null | undefined, ...permissions: Permission[]): boolean {
  return permissions.some(p => can(sp, p));
}

/** Highest role held, for display. */
export function primaryRole(sp: SessionPermissions | null | undefined): RoleName {
  for (const r of ["ADMIN", "MANAGER", "ANALYST", "REVIEWER"] as RoleName[]) {
    if (sp?.roles.includes(r)) return r;
  }
  return FALLBACK_ROLE;
}
