// One-time script: create a wildcard scan scope for dev/demo use
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
import { readFileSync } from "fs";
const envFile = readFileSync(join(__dirname, "../.env"), "utf8");
const env = Object.fromEntries(
  envFile.split("\n").filter(l => l.includes("=")).map(l => {
    const idx = l.indexOf("=");
    return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^"|"$/g, "")];
  })
);

const rawUrl = env.DATABASE_URL.replace(/[?&]schema=[^&]*/g, "").replace(/[?&]$/, "");
const pool = new pg.Pool({ connectionString: rawUrl, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    // Get first tenant
    const { rows: tenants } = await client.query('SELECT id FROM senqor."Tenant" LIMIT 1');
    if (!tenants.length) { console.log("No tenant found"); return; }
    const tenantId = tenants[0].id;
    console.log("Tenant:", tenantId);

    // Get first user (for approvedBy)
    const { rows: users } = await client.query('SELECT id FROM senqor."User" WHERE "tenantId" = $1 LIMIT 1', [tenantId]);
    const userId = users[0]?.id ?? "system";

    // Check if a wildcard scope already exists
    const { rows: existing } = await client.query(
      'SELECT id FROM senqor."ScanScope" WHERE "tenantId" = $1 AND "isActive" = true LIMIT 1',
      [tenantId]
    );
    if (existing.length) {
      console.log("Scope already exists:", existing[0].id);

      // Update targets to include wildcard
      await client.query(
        'UPDATE senqor."ScanScope" SET targets = $1, "allowedSensors" = $2 WHERE id = $3',
        [
          ["*.badssl.com", "*.github.com", "github.com", "github.com:443", "github.com:22"],
          [],
          existing[0].id
        ]
      );
      console.log("Updated scope targets.");
      return;
    }

    // Create new scope
    const id = "scope-dev-" + Date.now();
    await client.query(
      `INSERT INTO senqor."ScanScope" (id, "tenantId", name, description, targets, "allowedSensors", "isActive", "approvedBy", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, NOW(), NOW())`,
      [
        id,
        tenantId,
        "Development Scope",
        "Wide scope for development and testing",
        JSON.stringify(["*.badssl.com", "*.github.com", "github.com", "github.com:443", "github.com:22"]),
        JSON.stringify([]),
        userId
      ]
    );
    console.log("Created scope:", id);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
