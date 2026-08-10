import { db } from "../src/lib/db/client.js";
import bcrypt from "bcryptjs";

const TENANT_ID = "cosQJN_Ve8kWzaYs";

async function main() {
  // Create tenant
  const tenant = await db.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      name: "Northstar Financial Group",
      displayName: "Northstar Financial Group",
      slug: "northstar",
    },
  });
  console.log("Tenant:", tenant.name);

  // Create admin user
  const hash = await bcrypt.hash("Senqor2025!", 12);
  const user = await db.user.upsert({
    where: { tenantId_email: { tenantId: TENANT_ID, email: "admin@northstar.com" } },
    update: {},
    create: {
      email: "admin@northstar.com",
      name: "Admin User",
      passwordHash: hash,
      tenantId: TENANT_ID,
      isActive: true,
    },
  });
  console.log("User:", user.email);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
