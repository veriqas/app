import { db } from "@/lib/db/client";
import { backfillTenantRoles, assignRole } from "@/lib/auth/role-seed";

async function main() {
  const tenants = await db.tenant.findMany({ select: { id: true, slug: true } });
  for (const t of tenants) {
    const r = await backfillTenantRoles(t.id);
    console.log(`${t.slug}: ${r.roles} roles ensured, ${r.usersGranted} user(s) granted ADMIN`);
  }
  // Demo shape: one admin, one analyst, one reviewer.
  const demo = process.env.E2E_TENANT!;
  const by = async (email: string) => (await db.user.findFirst({ where: { tenantId: demo, email }, select: { id: true } }))?.id;
  const admin = await by("ui@veriqas.test");
  const analyst = await by("marcus.webb@veriqas.test");
  const reviewer = await by("sarah.chen@veriqas.test");
  if (admin)    await assignRole(admin, demo, "ADMIN");
  if (analyst)  await assignRole(analyst, demo, "ANALYST");
  if (reviewer) await assignRole(reviewer, demo, "REVIEWER");
  const rows = await db.userRole.findMany({ where: { role: { tenantId: demo } }, select: { user: { select: { email: true } }, role: { select: { name: true } } } });
  console.log("\ndemo tenant roles:");
  for (const r of rows) console.log(`  ${r.user.email.padEnd(30)} ${r.role.name}`);
}
main().then(() => process.exit(0)).catch(e => { console.error("ERR", e.message); process.exit(1); });
