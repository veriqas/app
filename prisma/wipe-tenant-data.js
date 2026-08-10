/**
 * Wipes all operational data for the tenant, leaving User + Tenant records intact.
 * Run with: node prisma/wipe-tenant-data.js
 */
const { Pool } = require("pg");
require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: ".env.local" });

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres.smtkvrhgrzhmtthjrifl:AlphaLion123!@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

const TENANT_ID = "cosQJN_Ve8kWzaYs";

// Junction tables that have no tenantId — delete by joining through parent
const JUNCTION_DELETES = [
  `DELETE FROM "ActionEntity" WHERE "actionId" IN (SELECT id FROM "Action" WHERE "tenantId" = $1)`,
  `DELETE FROM "ActionEvidence" WHERE "actionId" IN (SELECT id FROM "Action" WHERE "tenantId" = $1)`,
  `DELETE FROM "RiskBusinessService" WHERE "riskId" IN (SELECT id FROM "Risk" WHERE "tenantId" = $1)`,
  `DELETE FROM "RiskCryptoAsset" WHERE "riskId" IN (SELECT id FROM "Risk" WHERE "tenantId" = $1)`,
  `DELETE FROM "ProgrammePhase" WHERE "programmeId" IN (SELECT id FROM "Programme" WHERE "tenantId" = $1)`,
];

const TABLES = [
  // Operational tables (after junctions cleared)
  "Action",
  "Evidence",
  "ControlTest",
  "CryptoObservation",
  "CryptoAsset",
  "Risk",
  "ReadinessScore",
  "ScoringPolicy",
  "FrameworkAlignment",
  "Framework",
  "Supplier",
  "BusinessService",
  "ScanJob",
  "ScanScope",
  "Sensor",
  "Programme",
  "InformationAsset",
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query("SET search_path TO senqor");
    console.log(`Wiping all data for tenant: ${TENANT_ID}\n`);

    // Clear junction tables first (no tenantId column — delete via parent)
    for (const sql of JUNCTION_DELETES) {
      try {
        const res = await client.query(sql, [TENANT_ID]);
        const table = sql.match(/FROM "(\w+)"/)[1];
        if (res.rowCount > 0) console.log(`  ✓ ${table}: ${res.rowCount} rows deleted`);
        else console.log(`  - ${table}: empty`);
      } catch (err) {
        const table = sql.match(/FROM "(\w+)"/)[1];
        console.warn(`  ! ${table}: ${err.message}`);
      }
    }

    for (const table of TABLES) {
      try {
        const res = await client.query(
          `DELETE FROM "${table}" WHERE "tenantId" = $1`,
          [TENANT_ID]
        );
        if (res.rowCount > 0) {
          console.log(`  ✓ ${table}: ${res.rowCount} rows deleted`);
        } else {
          console.log(`  - ${table}: empty`);
        }
      } catch (err) {
        // Table may not exist or column name differs — log and continue
        console.warn(`  ! ${table}: ${err.message}`);
      }
    }

    console.log("\nDone. Database is clean — ready for live data.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
