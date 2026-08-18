/**
 * Role provisioning.
 *
 * Roles are per-tenant rows so an administrator can adjust a bundle later
 * without a code change. This module creates the four standard roles for a
 * tenant and is safe to run repeatedly.
 */
import { db } from "@/lib/db/client";
import { ROLES, ROLE_BUNDLES, ROLE_DESCRIPTIONS, type RoleName } from "./permissions";

/** Create the standard roles for a tenant if they are missing. Idempotent. */
export async function ensureRoles(tenantId: string): Promise<Record<RoleName, string>> {
  const ids = {} as Record<RoleName, string>;
  for (const name of ROLES) {
    const existing = await db.role.findFirst({ where: { tenantId, name }, select: { id: true } });
    if (existing) {
      // Keep the stored bundle current with the code's definition.
      await db.role.update({
        where: { id: existing.id },
        data: { permissions: { permissions: ROLE_BUNDLES[name] }, description: ROLE_DESCRIPTIONS[name] },
      });
      ids[name] = existing.id;
      continue;
    }
    const created = await db.role.create({
      data: {
        tenantId, name,
        description: ROLE_DESCRIPTIONS[name],
        isSystem: true,
        permissions: { permissions: ROLE_BUNDLES[name] },
      },
      select: { id: true },
    });
    ids[name] = created.id;
  }
  return ids;
}

/** Grant a role to a user, replacing any roles they already hold. */
export async function assignRole(userId: string, tenantId: string, role: RoleName): Promise<void> {
  const ids = await ensureRoles(tenantId);
  await db.userRole.deleteMany({ where: { userId, role: { tenantId } } });
  await db.userRole.create({ data: { userId, roleId: ids[role] } });
}

/**
 * Provision a tenant that has never had roles.
 *
 * Existing users are granted ADMIN. The guards fail closed, so without this an
 * upgrade would lock every current user out of their own instance; a deliberate
 * downgrade afterwards is a safe, reversible administrative act, whereas being
 * locked out is not.
 */
export async function backfillTenantRoles(tenantId: string): Promise<{ roles: number; usersGranted: number }> {
  const ids = await ensureRoles(tenantId);
  const users = await db.user.findMany({ where: { tenantId }, select: { id: true } });
  let granted = 0;
  for (const u of users) {
    const has = await db.userRole.findFirst({ where: { userId: u.id, role: { tenantId } }, select: { id: true } });
    if (has) continue;
    await db.userRole.create({ data: { userId: u.id, roleId: ids.ADMIN } });
    granted++;
  }
  return { roles: Object.keys(ids).length, usersGranted: granted };
}
