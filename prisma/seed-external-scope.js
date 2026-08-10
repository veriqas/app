const { Pool } = require("pg");
const { randomBytes } = require("crypto");
require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: ".env.local" });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const cuid = () => "c" + randomBytes(11).toString("base64url").slice(0, 23);
const now = () => new Date().toISOString();
const TENANT = "cosQJN_Ve8kWzaYs";

(async () => {
  const client = await pool.connect();
  await client.query("SET search_path TO senqor");

  const { rows } = await client.query('SELECT id FROM "User" WHERE "tenantId" = $1 LIMIT 1', [TENANT]);
  const userId = rows[0]?.id ?? "system";

  await client.query(
    `INSERT INTO "ScanScope" (id, "tenantId", name, description, targets, "allowedSensors", "isActive", "approvedBy", "approvedAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7, $8, $9, $10, $11)`,
    [
      cuid(), TENANT,
      "External Public Endpoints",
      "Approved scope for scanning publicly accessible external endpoints and services",
      [
        "github.com:443", "github.com",
        "google.com:443", "cloudflare.com:443",
        "*.github.com:443",
      ],
      ["SSLYZE", "SSH_AUDIT", "TESTSSL", "ZGRAB2", "NMAP"],
      true, userId, now(), now(), now(),
    ]
  );

  console.log("✓ External scope created");
  client.release();
  await pool.end();
})().catch(e => { console.error("Failed:", e.message); process.exit(1); });
