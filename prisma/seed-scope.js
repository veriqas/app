const { Pool } = require("pg");
const { randomBytes } = require("crypto");

const pool = new Pool({
  connectionString: "postgresql://postgres.smtkvrhgrzhmtthjrifl:AlphaLion123!@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres",
  ssl: { rejectUnauthorized: false },
});
const cuid = () => "c" + randomBytes(11).toString("base64url").slice(0, 23);
const now = () => new Date().toISOString();
const TENANT = "cosQJN_Ve8kWzaYs";

(async () => {
  const client = await pool.connect();
  await client.query('SET search_path TO senqor');

  const { rows } = await client.query('SELECT id FROM "User" WHERE "tenantId" = $1 LIMIT 1', [TENANT]);
  const userId = rows[0]?.id ?? "system";

  await client.query('DELETE FROM "ScanScope" WHERE "tenantId" = $1', [TENANT]);

  await client.query(
    `INSERT INTO "ScanScope" (id, "tenantId", name, description, targets, "allowedSensors", "isActive", "approvedBy", "approvedAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7, $8, $9, $10, $11)`,
    [
      cuid(), TENANT,
      "Northstar Production Perimeter",
      "Approved scope covering Northstar public-facing endpoints and internal network segments",
      ["payments.northstar.com", "api.northstar.com", "*.northstar.com", "10.0.0.0/24", "10.0.1.10:22", "10.0.1.10"],
      [],
      true, userId, now(), now(), now(),
    ]
  );

  console.log("✓ ScanScope seeded, approvedBy:", userId);
  client.release();
  await pool.end();
})().catch(e => { console.error("Failed:", e.message); process.exit(1); });
