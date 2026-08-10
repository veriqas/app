/**
 * Adds new asset inventory fields to senqor."CryptoAsset".
 * Run once: node prisma/migrate-crypto-asset-fields.js
 * Safe to re-run — all statements use IF NOT EXISTS / DO NOTHING patterns.
 */

const { Pool } = require("pg");

const rawUrl = process.env.DATABASE_URL ?? "";
const connStr = rawUrl.replace(/[?&]schema=[^&]*/g, "").replace(/[?&]$/, "");
const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query('SET search_path TO senqor');

    const statements = [
      // Asset classification
      `ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "assetType" TEXT`,
      `ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "host" TEXT`,
      `ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "repository" TEXT`,
      `ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "container" TEXT`,

      // Cryptographic details
      `ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "keySize" INTEGER`,
      `ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "curve" TEXT`,
      `ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "parameterSet" TEXT`,

      // Migration tracking
      `ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "migrationStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED'`,
      `ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "migrationNotes" TEXT`,
      `ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "criticality" TEXT NOT NULL DEFAULT 'MEDIUM'`,

      // Discovery metadata
      `ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "firstSeenAt" TIMESTAMPTZ`,
      `ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "sourceCount" INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE "CryptoAsset" ADD COLUMN IF NOT EXISTS "assetFingerprint" TEXT`,

      // Unique index for upsert dedup
      `CREATE UNIQUE INDEX IF NOT EXISTS "CryptoAsset_tenantId_assetFingerprint_key"
         ON "CryptoAsset"("tenantId", "assetFingerprint")
         WHERE "assetFingerprint" IS NOT NULL`,

      // Performance indexes
      `CREATE INDEX IF NOT EXISTS "CryptoAsset_assetType_idx" ON "CryptoAsset"("assetType")`,
      `CREATE INDEX IF NOT EXISTS "CryptoAsset_migrationStatus_idx" ON "CryptoAsset"("migrationStatus")`,
    ];

    for (const sql of statements) {
      console.log("  →", sql.slice(0, 70).replace(/\s+/g, " ") + "…");
      await client.query(sql);
    }

    await client.query("COMMIT");
    console.log("\n✓ Migration complete — CryptoAsset extended with asset inventory fields.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("✗ Migration failed, rolled back:", e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
