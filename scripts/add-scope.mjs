/**
 * Adds github.com to the approved scan scope for the demo tenant.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { config } from "dotenv";
config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool, { schema: "senqor" }) });

const TENANT_ID = "cosQJN_Ve8kWzaYs";

// List existing scopes
const existing = await db.scanScope.findMany({ where: { tenantId: TENANT_ID } });
console.log("Existing scopes:", existing.map(s => `${s.scopeType}: ${s.target}`));

// Add github.com for TLS + SSH testing
const scopes = [
  { name: "GitHub — TLS & SSH", targets: ["github.com:443", "github.com:22", "github.com"], allowedSensors: ["SSLYZE", "SSH_AUDIT", "ZGRAB2"] },
];

for (const s of scopes) {
  const already = existing.find(e => e.name === s.name);
  if (already) { console.log(`  Already exists: ${s.name}`); continue; }
  await db.scanScope.create({
    data: {
      tenantId: TENANT_ID,
      name: s.name,
      targets: s.targets,
      allowedSensors: s.allowedSensors,
      approvedBy: "system",
      isActive: true,
    },
  });
  console.log(`  Added: ${s.name}`);
}

await db.$disconnect();
await pool.end();
console.log("Done.");
