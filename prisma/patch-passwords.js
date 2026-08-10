/**
 * Upsert the 6 Northstar users with bcrypt passwords.
 * Safe to re-run — updates existing rows, inserts missing ones.
 */
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const { randomBytes } = require("crypto");

const pool = new Pool({
  connectionString: "postgresql://postgres.smtkvrhgrzhmtthjrifl:AlphaLion123!@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres",
  ssl: { rejectUnauthorized: false },
});

const cuid = () => "c" + randomBytes(11).toString("base64url").slice(0, 23);
const now = () => new Date().toISOString();

const USERS = [
  { email: "admin@northstar.com",    name: "Alex Reay" },
  { email: "cro@northstar.com",      name: "Sarah Chen" },
  { email: "ciso@northstar.com",     name: "James Thornton" },
  { email: "cio@northstar.com",      name: "Maria Okonkwo" },
  { email: "analyst1@northstar.com", name: "David Park" },
  { email: "analyst2@northstar.com", name: "Emma Williams" },
];

(async () => {
  const client = await pool.connect();
  await client.query("SET search_path TO senqor");

  // Find the tenant
  const { rows: tenants } = await client.query(`SELECT id FROM "Tenant" LIMIT 1`);
  if (!tenants.length) { console.error("No tenant found — run the full seed first"); process.exit(1); }
  const tId = tenants[0].id;
  console.log("Tenant:", tId);

  const hash = await bcrypt.hash("Senqor2025!", 12);

  for (const u of USERS) {
    const { rows } = await client.query(`SELECT id FROM "User" WHERE email = $1`, [u.email]);
    if (rows.length) {
      await client.query(`UPDATE "User" SET "passwordHash" = $1 WHERE email = $2`, [hash, u.email]);
      console.log(`  ✓ Updated ${u.email}`);
    } else {
      await client.query(
        `INSERT INTO "User" (id, "tenantId", email, name, "passwordHash", "isActive", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, true, $6, $7)`,
        [cuid(), tId, u.email, u.name, hash, now(), now()]
      );
      console.log(`  + Created ${u.email}`);
    }
  }

  console.log("\n✓ All users have password: Senqor2025!");
  client.release();
  await pool.end();
})().catch(e => { console.error("Failed:", e.message); process.exit(1); });
