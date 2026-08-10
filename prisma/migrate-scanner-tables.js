/**
 * Creates the scanner-related tables in the senqor schema.
 * Safe to re-run — uses CREATE TABLE IF NOT EXISTS.
 */

const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  try {
    console.log("Creating scanner tables in senqor schema...");

    await client.query(`CREATE SCHEMA IF NOT EXISTS senqor`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS senqor."Sensor" (
        id           TEXT NOT NULL PRIMARY KEY,
        "tenantId"   TEXT NOT NULL REFERENCES senqor."Tenant"(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        "sensorType" TEXT NOT NULL,
        version      TEXT,
        description  TEXT,
        "isEnabled"  BOOLEAN NOT NULL DEFAULT true,
        config       JSONB,
        "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS "Sensor_tenantId_idx" ON senqor."Sensor"("tenantId")`);
    console.log("  ✓ Sensor");

    await client.query(`
      CREATE TABLE IF NOT EXISTS senqor."ScanScope" (
        id               TEXT NOT NULL PRIMARY KEY,
        "tenantId"       TEXT NOT NULL REFERENCES senqor."Tenant"(id) ON DELETE CASCADE,
        name             TEXT NOT NULL,
        description      TEXT,
        targets          TEXT[] NOT NULL DEFAULT '{}',
        "allowedSensors" TEXT[] NOT NULL DEFAULT '{}',
        "isActive"       BOOLEAN NOT NULL DEFAULT true,
        "approvedBy"     TEXT,
        "approvedAt"     TIMESTAMPTZ,
        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS "ScanScope_tenantId_idx" ON senqor."ScanScope"("tenantId")`);
    console.log("  ✓ ScanScope");

    await client.query(`
      CREATE TABLE IF NOT EXISTS senqor."ScanJob" (
        id              TEXT NOT NULL PRIMARY KEY,
        ref             TEXT NOT NULL UNIQUE,
        "tenantId"      TEXT NOT NULL REFERENCES senqor."Tenant"(id) ON DELETE CASCADE,
        "sensorId"      TEXT NOT NULL REFERENCES senqor."Sensor"(id) ON DELETE CASCADE,
        "scopeId"       TEXT REFERENCES senqor."ScanScope"(id) ON DELETE SET NULL,
        "requestedBy"   TEXT NOT NULL,
        targets         TEXT[] NOT NULL DEFAULT '{}',
        status          TEXT NOT NULL DEFAULT 'PENDING',
        "startedAt"     TIMESTAMPTZ,
        "completedAt"   TIMESTAMPTZ,
        "workerNode"    TEXT,
        "resultCount"   INTEGER,
        "errorMessage"  TEXT,
        "rawResultPath" TEXT,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS "ScanJob_tenantId_idx" ON senqor."ScanJob"("tenantId")`);
    console.log("  ✓ ScanJob");

    await client.query(`
      CREATE TABLE IF NOT EXISTS senqor."CryptoObservation" (
        id               TEXT NOT NULL PRIMARY KEY,
        ref              TEXT NOT NULL UNIQUE,
        "tenantId"       TEXT NOT NULL REFERENCES senqor."Tenant"(id) ON DELETE CASCADE,
        "scanJobId"      TEXT REFERENCES senqor."ScanJob"(id) ON DELETE SET NULL,
        "cryptoAssetId"  TEXT REFERENCES senqor."CryptoAsset"(id) ON DELETE SET NULL,
        "sensorType"     TEXT NOT NULL,
        "evidenceSource" TEXT NOT NULL,
        "observedAt"     TIMESTAMPTZ NOT NULL,
        "expiresAt"      TIMESTAMPTZ,
        algorithm        TEXT,
        "primitiveType"  TEXT,
        purpose          TEXT,
        "keySize"        INTEGER,
        curve            TEXT,
        "parameterSet"   TEXT,
        protocol         TEXT,
        endpoint         TEXT,
        port             INTEGER,
        "filePath"       TEXT,
        "lineNumber"     INTEGER,
        "packageName"    TEXT,
        "packageVersion" TEXT,
        provider         TEXT,
        context          TEXT,
        confidence       INTEGER NOT NULL DEFAULT 80,
        "quantumClass"   TEXT NOT NULL DEFAULT 'UNKNOWN',
        "rawPayload"     JSONB,
        notes            TEXT,
        "isActive"       BOOLEAN NOT NULL DEFAULT true,
        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS "CryptoObservation_tenantId_idx" ON senqor."CryptoObservation"("tenantId")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "CryptoObservation_cryptoAssetId_idx" ON senqor."CryptoObservation"("cryptoAssetId")`);
    console.log("  ✓ CryptoObservation");

    console.log("\n✅  All scanner tables ready.");
  } catch (err) {
    console.error("❌  Failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
