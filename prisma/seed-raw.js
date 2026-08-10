/**
 * SENQOR — Northstar Financial Group demo seed (raw SQL via pg)
 * Uses SET search_path TO senqor so all unqualified table refs hit senqor schema.
 */
const { Pool } = require("pg");
const { randomBytes } = require("crypto");
const bcrypt = require("bcryptjs");

const RUNTIME_URL = "postgresql://postgres.smtkvrhgrzhmtthjrifl:AlphaLion123!@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";
const pool = new Pool({
  connectionString: RUNTIME_URL,
  ssl: { rejectUnauthorized: false },
});

// ── helpers ───────────────────────────────────────────────────────────────────
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const cuid = () => "c" + randomBytes(11).toString("base64url").slice(0, 23);
const now = () => new Date().toISOString();

// Stable IDs so re-seeding doesn't orphan rows
const TENANT_ID = "cosQJN_Ve8kWzaYs";

async function run(q, values) {
  return pool.query(q, values);
}

async function main() {
  const client = await pool.connect();
  await client.query("SET search_path TO senqor");

  const exec = (q, v) => client.query(q, v);

  console.log("🌱  Seeding SENQOR — Northstar Financial Group...\n");

  // ── Clear existing demo data (leaf → parent, all scoped to TENANT_ID) ────────
  const T = TENANT_ID;
  const tryDel = (q, v) => exec(q, v).catch(() => {});

  // Pure junction tables (no tenantId column)
  await tryDel(`DELETE FROM "AuditEvent"         WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "FrameworkAlignment"  WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "ReadinessScore"      WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "ScoringPolicy"       WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "ActionEntity"        WHERE "actionId"  IN (SELECT id FROM "Action"  WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "Action"              WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "EvidenceEntity"      WHERE "evidenceId" IN (SELECT id FROM "Evidence" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "Evidence"            WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "RiskControl"         WHERE "riskId" IN (SELECT id FROM "Risk" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "RiskCryptoAsset"     WHERE "riskId" IN (SELECT id FROM "Risk" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "RiskSupplier"        WHERE "riskId" IN (SELECT id FROM "Risk" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "RiskSystem"          WHERE "riskId" IN (SELECT id FROM "Risk" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "RiskInfoAsset"       WHERE "riskId" IN (SELECT id FROM "Risk" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "RiskBusinessService" WHERE "riskId" IN (SELECT id FROM "Risk" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "Risk"                WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "ControlMapping"      WHERE "controlId" IN (SELECT id FROM "Control" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "ControlTest"         WHERE "controlId" IN (SELECT id FROM "Control" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "Control"             WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "Requirement"         WHERE "frameworkId" IN (SELECT id FROM "Framework" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "Framework"           WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "SupplierFinding"     WHERE "supplierId" IN (SELECT id FROM "Supplier" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "IASupplier"          WHERE "supplierId" IN (SELECT id FROM "Supplier" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "BSSupplier"          WHERE "supplierId" IN (SELECT id FROM "Supplier" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "Supplier"            WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "CryptoObservation"   WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "ScanJob"             WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "ScanScope"           WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "Sensor"              WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "CryptoAssetSupplier" WHERE "cryptoAssetId" IN (SELECT id FROM "CryptoAsset" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "CryptoAssetIA"       WHERE "cryptoAssetId" IN (SELECT id FROM "CryptoAsset" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "CryptoAssetSystem"   WHERE "cryptoAssetId" IN (SELECT id FROM "CryptoAsset" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "CryptoAssetBS"       WHERE "cryptoAssetId" IN (SELECT id FROM "CryptoAsset" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "CryptoAsset"         WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "CryptoAlgorithm"     WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "BSInformationAsset"  WHERE "businessServiceId" IN (SELECT id FROM "BusinessService" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "IASystem"            WHERE "informationAssetId" IN (SELECT id FROM "InformationAsset" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "InformationAsset"    WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "BSSystem"            WHERE "businessServiceId" IN (SELECT id FROM "BusinessService" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "OrgSystem"           WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "BusinessService"     WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "UserRole"            WHERE "userId" IN (SELECT id FROM "User" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "Role"                WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "Session"             WHERE "userId" IN (SELECT id FROM "User" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "Account"             WHERE "userId" IN (SELECT id FROM "User" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "User"                WHERE "tenantId" = $1`, [T]);
  await tryDel(`DELETE FROM "BusinessUnit"        WHERE "organisationId" IN (SELECT id FROM "Organisation" WHERE "tenantId" = $1)`, [T]);
  await tryDel(`DELETE FROM "Organisation"        WHERE "tenantId" = $1`, [T]);
  // Tenant last — only delete if it exists, upsert below handles the rest
  await tryDel(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
  console.log("  ✓ Cleared existing demo data");

  // ── 1. Tenant ─────────────────────────────────────────────────────────────
  const tId = TENANT_ID;
  await exec(
    `INSERT INTO "Tenant" (id, slug, name, "displayName", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tId, "northstar", "northstar-financial-group", "Northstar Financial Group", now(), now()]
  );
  console.log("  ✓ Tenant");

  // ── 2. Organisation ───────────────────────────────────────────────────────
  const orgId = cuid();
  await exec(
    `INSERT INTO "Organisation" (id, "tenantId", name, description, industry, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [orgId, tId, "Northstar Financial Group", "Global financial services group headquartered in London", "Financial Services", now(), now()]
  );

  // ── 3. Business Units ─────────────────────────────────────────────────────
  const buNames = ["Retail Banking", "Corporate & Institutional", "Wealth Management", "Technology & Operations", "Risk & Compliance"];
  const buIds = [];
  for (const name of buNames) {
    const id = cuid();
    buIds.push(id);
    await exec(
      `INSERT INTO "BusinessUnit" (id, "organisationId", name, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5)`,
      [id, orgId, name, now(), now()]
    );
  }
  console.log("  ✓ Business Units (5)");

  // ── 4. Users ─────────────────────────────────────────────────────────────
  const userDefs = [
    { email: "admin@northstar.com",    name: "Alex Reay",       buIdx: 3 },
    { email: "cro@northstar.com",      name: "Sarah Chen",      buIdx: 4 },
    { email: "ciso@northstar.com",     name: "James Thornton",  buIdx: 4 },
    { email: "cio@northstar.com",      name: "Maria Okonkwo",   buIdx: 3 },
    { email: "analyst1@northstar.com", name: "David Park",      buIdx: 4 },
    { email: "analyst2@northstar.com", name: "Emma Williams",   buIdx: 4 },
  ];
  const userIds = [];
  const passwordHash = await bcrypt.hash("Senqor2025!", 12);
  for (const u of userDefs) {
    const id = cuid();
    userIds.push(id);
    await exec(
      `INSERT INTO "User" (id, "tenantId", email, name, "passwordHash", "businessUnitId", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8)`,
      [id, tId, u.email, u.name, passwordHash, buIds[u.buIdx], now(), now()]
    );
  }
  console.log("  ✓ Users (6) — password: Senqor2025!");

  // ── 5. Roles ─────────────────────────────────────────────────────────────
  const roleDefs = [
    { name: "Administrator", isSystem: true,  perms: { all: true } },
    { name: "Risk Officer",  isSystem: false, perms: { risks: "rw", controls: "r" } },
    { name: "Crypto Analyst",isSystem: false, perms: { crypto: "rw" } },
    { name: "Viewer",        isSystem: false, perms: { all: "r" } },
  ];
  const roleIds = [];
  for (const r of roleDefs) {
    const id = cuid();
    roleIds.push(id);
    await exec(
      `INSERT INTO "Role" (id, "tenantId", name, "isSystem", permissions, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, tId, r.name, r.isSystem, JSON.stringify(r.perms), now(), now()]
    );
  }
  // Admin user gets Admin role
  await exec(
    `INSERT INTO "UserRole" (id, "userId", "roleId", "grantedAt") VALUES ($1, $2, $3, $4)`,
    [cuid(), userIds[0], roleIds[0], now()]
  );
  console.log("  ✓ Roles (4)");

  // ── 6. Business Services ─────────────────────────────────────────────────
  const bsDefs = [
    { ref: "BS-000001", name: "Retail Payments",          buIdx: 0, crit: "CRITICAL", hndl: "HIGH" },
    { ref: "BS-000002", name: "Corporate Payments",       buIdx: 1, crit: "CRITICAL", hndl: "HIGH" },
    { ref: "BS-000003", name: "Customer Identity & Auth", buIdx: 0, crit: "CRITICAL", hndl: "HIGH" },
    { ref: "BS-000004", name: "Wealth Management Portal", buIdx: 2, crit: "HIGH",     hndl: "HIGH" },
    { ref: "BS-000005", name: "FX & Trading Platform",    buIdx: 1, crit: "CRITICAL", hndl: "HIGH" },
    { ref: "BS-000006", name: "Mortgage Origination",     buIdx: 0, crit: "HIGH",     hndl: "MEDIUM" },
    { ref: "BS-000007", name: "Document Management",      buIdx: 3, crit: "HIGH",     hndl: "HIGH" },
    { ref: "BS-000008", name: "Software Delivery",        buIdx: 3, crit: "HIGH",     hndl: "MEDIUM" },
    { ref: "BS-000009", name: "Core Banking",             buIdx: 3, crit: "CRITICAL", hndl: "HIGH" },
    { ref: "BS-000010", name: "Card Services",            buIdx: 0, crit: "CRITICAL", hndl: "HIGH" },
    { ref: "BS-000011", name: "AML & Fraud",              buIdx: 4, crit: "HIGH",     hndl: "MEDIUM" },
    { ref: "BS-000012", name: "Regulatory Reporting",     buIdx: 4, crit: "HIGH",     hndl: "MEDIUM" },
  ];
  const bsIds = [];
  for (const bs of bsDefs) {
    const id = cuid();
    bsIds.push(id);
    await exec(
      `INSERT INTO "BusinessService" (id, ref, "tenantId", "businessUnitId", "businessOwnerId", name, criticality, "hndlRisk", status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::\"Criticality\", $8::\"HndlRisk\", 'ACTIVE', $9, $10)`,
      [id, bs.ref, tId, buIds[bs.buIdx], userIds[0], bs.name, bs.crit, bs.hndl, now(), now()]
    );
  }
  console.log("  ✓ Business Services (12)");

  // ── 7. Information Assets ─────────────────────────────────────────────────
  const iaDefs = [
    { ref: "IA-000001", name: "Customer PII Database",        cat: "PERSONAL_DATA",         hndl: "CRITICAL", years: 30 },
    { ref: "IA-000002", name: "Payment Card Data (PCI)",      cat: "FINANCIAL",             hndl: "CRITICAL", years: 10 },
    { ref: "IA-000003", name: "Trade & Position Records",     cat: "FINANCIAL",             hndl: "HIGH",     years: 15 },
    { ref: "IA-000004", name: "Mortgage Contract Archive",    cat: "LEGAL",                 hndl: "HIGH",     years: 25 },
    { ref: "IA-000005", name: "KYC & AML Records",           cat: "REGULATORY",            hndl: "CRITICAL", years: 10 },
    { ref: "IA-000006", name: "Private Key Material (PKI)",   cat: "CRYPTOGRAPHIC",         hndl: "CRITICAL", years: 5  },
    { ref: "IA-000007", name: "Wealth Client Portfolios",     cat: "FINANCIAL",             hndl: "HIGH",     years: 20 },
    { ref: "IA-000008", name: "Source Code Repository",       cat: "INTELLECTUAL_PROPERTY", hndl: "HIGH",     years: 0  },
    { ref: "IA-000009", name: "Corporate Communications",     cat: "CONFIDENTIAL",          hndl: "MEDIUM",   years: 7  },
    { ref: "IA-000010", name: "Regulatory Submissions",       cat: "REGULATORY",            hndl: "HIGH",     years: 10 },
    { ref: "IA-000011", name: "Biometric Authentication Data",cat: "PERSONAL_DATA",         hndl: "CRITICAL", years: 5  },
    { ref: "IA-000012", name: "Cryptographic Keys — HSM",    cat: "CRYPTOGRAPHIC",         hndl: "CRITICAL", years: 3  },
    { ref: "IA-000013", name: "Audit & Transaction Logs",     cat: "OPERATIONAL",           hndl: "HIGH",     years: 7  },
    { ref: "IA-000014", name: "FX Algorithm Parameters",      cat: "INTELLECTUAL_PROPERTY", hndl: "HIGH",     years: 5  },
    { ref: "IA-000015", name: "Insurance Policy Data",        cat: "PERSONAL_DATA",         hndl: "HIGH",     years: 15 },
  ];
  for (const ia of iaDefs) {
    await exec(
      `INSERT INTO "InformationAsset" (id, ref, "tenantId", "ownerId", name, "dataCategory", "hndlRisk", "requiredConfidentialityYears", "retentionYears", jurisdictions, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::\"HndlRisk\", $8, $9, $10, $11, $12)`,
      [cuid(), ia.ref, tId, userIds[1], ia.name, ia.cat, ia.hndl, ia.years, ia.years, ["GB","EU"], now(), now()]
    );
  }
  console.log("  ✓ Information Assets (15)");

  // ── 8. Frameworks ─────────────────────────────────────────────────────────
  const fwDefs = [
    { shortName: "NCSC PQC 2028", name: "NCSC Post-Quantum Cryptography Migration Guidance",  version: "2024", authority: "NCSC",    milestone: "2028-01-01", mandatory: false },
    { shortName: "NIST PQC",      name: "NIST Post-Quantum Cryptography Migration",           version: "2024", authority: "NIST",    milestone: null,         mandatory: false },
    { shortName: "CNSA 2.0",      name: "Commercial National Security Algorithm Suite 2.0",   version: "2022", authority: "NSA",     milestone: "2030-01-01", mandatory: false },
    { shortName: "SQCF v1",       name: "SENQOR Quantum Control Framework",                   version: "1.0",  authority: "SENQOR", milestone: null,         mandatory: true  },
  ];
  const fwIds = {};
  for (const fw of fwDefs) {
    const id = cuid();
    fwIds[fw.shortName] = id;
    await exec(
      `INSERT INTO "Framework" (id, "tenantId", name, "shortName", version, "issuingAuthority", "milestoneDate", "isMandatory", "isApplicable", "industryScope", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, $11)`,
      [id, tId, fw.name, fw.shortName, fw.version, fw.authority, fw.milestone, fw.mandatory, ["Financial Services"], now(), now()]
    );
  }
  console.log("  ✓ Frameworks (4)");

  // ── 9. Controls ───────────────────────────────────────────────────────────
  const controlDefs = [
    { ref: "GV-01", domain: "GV", title: "Quantum Risk Governance Policy",           status: "PARTIALLY_IMPLEMENTED" },
    { ref: "GV-02", domain: "GV", title: "Board-Level PQC Oversight",                status: "NOT_IMPLEMENTED" },
    { ref: "GV-03", domain: "GV", title: "Quantum Risk Appetite Statement",           status: "PARTIALLY_IMPLEMENTED" },
    { ref: "ID-01", domain: "ID", title: "Cryptographic Asset Discovery",             status: "IN_PROGRESS" },
    { ref: "ID-02", domain: "ID", title: "Algorithm & Protocol Inventory",            status: "IN_PROGRESS" },
    { ref: "ID-03", domain: "ID", title: "Crypto Dependency Mapping",                 status: "PARTIALLY_IMPLEMENTED" },
    { ref: "DC-01", domain: "DC", title: "Continuous Cryptographic Monitoring",       status: "IN_PROGRESS" },
    { ref: "DC-02", domain: "DC", title: "Live Endpoint TLS Scanning",                status: "IMPLEMENTED" },
    { ref: "DC-03", domain: "DC", title: "CBOM Generation & Maintenance",             status: "PARTIALLY_IMPLEMENTED" },
    { ref: "RA-01", domain: "RA", title: "Harvest-Now-Decrypt-Later Assessment",      status: "PARTIALLY_IMPLEMENTED" },
    { ref: "RA-02", domain: "RA", title: "Data Longevity Risk Classification",        status: "NOT_IMPLEMENTED" },
    { ref: "RA-03", domain: "RA", title: "Third-Party Quantum Risk Assessment",       status: "NOT_IMPLEMENTED" },
    { ref: "CR-01", domain: "CR", title: "PQC Migration Roadmap",                    status: "NOT_IMPLEMENTED" },
    { ref: "CR-02", domain: "CR", title: "Hybrid Cryptography Deployment",            status: "NOT_IMPLEMENTED" },
    { ref: "CR-03", domain: "CR", title: "CRYSTALS-Kyber Key Exchange Migration",    status: "NOT_IMPLEMENTED" },
    { ref: "CR-04", domain: "CR", title: "CRYSTALS-Dilithium Signature Migration",   status: "NOT_IMPLEMENTED" },
    { ref: "CA-01", domain: "CA", title: "Crypto-Agile Architecture Design",          status: "PARTIALLY_IMPLEMENTED" },
    { ref: "CA-02", domain: "CA", title: "Algorithm Abstraction Layer",               status: "NOT_IMPLEMENTED" },
    { ref: "MG-01", domain: "MG", title: "PQC Migration Programme Management",        status: "NOT_IMPLEMENTED" },
    { ref: "MG-02", domain: "MG", title: "Supplier PQC Engagement Plan",             status: "NOT_IMPLEMENTED" },
    { ref: "SC-01", domain: "SC", title: "PKI Post-Quantum Transition Plan",          status: "NOT_IMPLEMENTED" },
    { ref: "SC-02", domain: "SC", title: "TLS 1.3 with PQC KEMs Deployment",         status: "NOT_IMPLEMENTED" },
    { ref: "SC-03", domain: "SC", title: "Quantum-Safe Code Signing",                 status: "NOT_IMPLEMENTED" },
    { ref: "EV-01", domain: "EV", title: "Evidence Collection for PQC Controls",     status: "PARTIALLY_IMPLEMENTED" },
    { ref: "EV-02", domain: "EV", title: "Automated Evidence from Scan Jobs",        status: "IN_PROGRESS" },
    { ref: "AU-01", domain: "AU", title: "Cryptographic Controls Audit Plan",         status: "PARTIALLY_IMPLEMENTED" },
    { ref: "AU-02", domain: "AU", title: "Third-Party PQC Readiness Audit",          status: "NOT_IMPLEMENTED" },
  ];
  const controlIds = [];
  for (const c of controlDefs) {
    const id = cuid();
    controlIds.push(id);
    await exec(
      `INSERT INTO "Control" (id, ref, "tenantId", "ownerId", domain, title, "implementationStatus", status, version, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', '1.0', $8, $9)`,
      [id, c.ref, tId, userIds[2], c.domain, c.title, c.status, now(), now()]
    );
  }
  console.log("  ✓ Controls (27 SQCF)");

  // ── 10. Crypto Algorithms ─────────────────────────────────────────────────
  const algoDefs = [
    { name: "RSA-2048",        family: "RSA",      type: "PUBLIC_KEY_ENCRYPTION", qc: "QUANTUM_VULNERABLE",       ks: 2048 },
    { name: "RSA-4096",        family: "RSA",      type: "PUBLIC_KEY_ENCRYPTION", qc: "QUANTUM_REDUCED_SECURITY", ks: 4096 },
    { name: "ECDSA-P256",      family: "ECDSA",    type: "DIGITAL_SIGNATURE",     qc: "QUANTUM_VULNERABLE",       ks: 256  },
    { name: "ECDSA-P384",      family: "ECDSA",    type: "DIGITAL_SIGNATURE",     qc: "QUANTUM_VULNERABLE",       ks: 384  },
    { name: "ECDH-P256",       family: "ECDH",     type: "KEY_ESTABLISHMENT",     qc: "QUANTUM_VULNERABLE",       ks: 256  },
    { name: "ECDH-P384",       family: "ECDH",     type: "KEY_ESTABLISHMENT",     qc: "QUANTUM_VULNERABLE",       ks: 384  },
    { name: "AES-128",         family: "AES",      type: "SYMMETRIC_ENCRYPTION",  qc: "QUANTUM_REDUCED_SECURITY", ks: 128  },
    { name: "AES-256",         family: "AES",      type: "SYMMETRIC_ENCRYPTION",  qc: "QUANTUM_RESILIENT",        ks: 256  },
    { name: "SHA-256",         family: "SHA",      type: "HASH",                  qc: "QUANTUM_REDUCED_SECURITY", ks: null },
    { name: "SHA-384",         family: "SHA",      type: "HASH",                  qc: "QUANTUM_RESILIENT",        ks: null },
    { name: "SHA-512",         family: "SHA",      type: "HASH",                  qc: "QUANTUM_RESILIENT",        ks: null },
    { name: "CRYSTALS-Kyber",  family: "CRYSTALS", type: "KEY_ESTABLISHMENT",     qc: "POST_QUANTUM",             ks: null },
    { name: "CRYSTALS-Dilithium", family: "CRYSTALS", type: "DIGITAL_SIGNATURE", qc: "POST_QUANTUM",             ks: null },
    { name: "SPHINCS+",        family: "SPHINCS",  type: "DIGITAL_SIGNATURE",     qc: "POST_QUANTUM",             ks: null },
    { name: "FALCON-512",      family: "FALCON",   type: "DIGITAL_SIGNATURE",     qc: "POST_QUANTUM",             ks: null },
    { name: "DH-2048",         family: "DH",       type: "KEY_ESTABLISHMENT",     qc: "QUANTUM_VULNERABLE",       ks: 2048 },
    { name: "3DES",            family: "DES",      type: "SYMMETRIC_ENCRYPTION",  qc: "QUANTUM_VULNERABLE",       ks: 112  },
    { name: "TLS-1.2",         family: "TLS",      type: "OTHER",                 qc: "QUANTUM_VULNERABLE",       ks: null },
    { name: "TLS-1.3",         family: "TLS",      type: "OTHER",                 qc: "QUANTUM_REDUCED_SECURITY", ks: null },
    { name: "HMAC-SHA256",     family: "HMAC",     type: "MAC",                   qc: "QUANTUM_REDUCED_SECURITY", ks: null },
  ];
  const algoMap = {};
  for (const a of algoDefs) {
    const id = cuid();
    algoMap[a.name] = { id, type: a.type };
    await exec(
      `INSERT INTO "CryptoAlgorithm" (id, "tenantId", name, family, "primitiveType", "quantumClass", "keySize", "isApproved", "isPqcCandidate", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, tId, a.name, a.family, a.type, a.qc, a.ks, a.qc === "POST_QUANTUM" || a.qc === "QUANTUM_RESILIENT", a.qc === "POST_QUANTUM", now(), now()]
    );
  }
  console.log("  ✓ Crypto Algorithms (20)");

  // ── 11. Crypto Assets (300) ───────────────────────────────────────────────
  const environments = ["PRODUCTION", "STAGING", "DR", "DEVELOPMENT"];
  const contexts = ["TLS Handshake", "JWT Signing", "Data Encryption at Rest", "Code Signing", "mTLS", "API Authentication", "Database Encryption", "Key Wrapping", "Backup Encryption", "Session Encryption"];
  const providers = ["OpenSSL", "BouncyCastle", "AWS KMS", "Azure Key Vault", "HashiCorp Vault", "Thales HSM", "nCipher HSM", "Java JSSE", "NSS", "SunPKCS11"];

  const algoNames = Object.keys(algoMap);
  const vulnAlgos  = ["RSA-2048","ECDSA-P256","ECDSA-P384","ECDH-P256","ECDH-P384","DH-2048","3DES","TLS-1.2"];
  const reducedAlgos = ["RSA-4096","AES-128","SHA-256","HMAC-SHA256","TLS-1.3"];
  const resilientAlgos = ["AES-256","SHA-384","SHA-512"];
  const pqAlgos = ["CRYSTALS-Kyber","CRYSTALS-Dilithium","SPHINCS+","FALCON-512"];

  const distribution = [
    ...Array(120).fill(null).map((_,i) => ({ algo: vulnAlgos[i % vulnAlgos.length],     qc: "QUANTUM_VULNERABLE",       risk: "HIGH" })),
    ...Array(60).fill(null).map((_,i)  => ({ algo: reducedAlgos[i % reducedAlgos.length], qc: "QUANTUM_REDUCED_SECURITY", risk: "MEDIUM" })),
    ...Array(60).fill(null).map((_,i)  => ({ algo: resilientAlgos[i % resilientAlgos.length], qc: "QUANTUM_RESILIENT",    risk: "LOW" })),
    ...Array(10).fill(null).map((_,i)  => ({ algo: pqAlgos[i % pqAlgos.length],          qc: "POST_QUANTUM",             risk: "LOW" })),
    ...Array(50).fill(null).map(()     => ({ algo: pick(algoNames),                       qc: "UNKNOWN",                  risk: "MEDIUM" })),
  ];

  for (let i = 0; i < distribution.length; i++) {
    const d = distribution[i];
    const num = String(i + 1).padStart(6, "0");
    const isLive = d.qc === "QUANTUM_VULNERABLE" && Math.random() < 0.17;
    const a = algoMap[d.algo];
    await exec(
      `INSERT INTO "CryptoAsset" (id, ref, "tenantId", "algorithmId", name, "primitiveType", purpose, provider, environment, "quantumClass", "riskLevel", "liveObserved", "lastObservedAt", "evidenceConfidence", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, $15, $16)`,
      [cuid(), `CA-${num}`, tId, a?.id ?? null, `${d.algo} — ${pick(contexts)}`, a?.type ?? "OTHER", pick(contexts), pick(providers), pick(environments), d.qc, d.risk, isLive, isLive ? new Date(Date.now() - rand(0, 86400000*7)) : null, rand(40,95), now(), now()]
    );
  }
  console.log("  ✓ Crypto Assets (300)");

  // ── 12. Suppliers ─────────────────────────────────────────────────────────
  const supplierDefs = [
    { ref:"SUP-000001", name:"Swift",                   svc:"Financial Messaging",      crit:"CRITICAL", qr:"PLANNED",      plan:"ROADMAP_PUBLISHED" },
    { ref:"SUP-000002", name:"Visa",                    svc:"Card Network",             crit:"CRITICAL", qr:"IN_PROGRESS",  plan:"PILOT_UNDERWAY" },
    { ref:"SUP-000003", name:"Mastercard",              svc:"Card Network",             crit:"CRITICAL", qr:"IN_PROGRESS",  plan:"PILOT_UNDERWAY" },
    { ref:"SUP-000004", name:"AWS",                     svc:"Cloud Infrastructure",     crit:"CRITICAL", qr:"IN_PROGRESS",  plan:"ROADMAP_PUBLISHED" },
    { ref:"SUP-000005", name:"Microsoft Azure",         svc:"Cloud Infrastructure",     crit:"CRITICAL", qr:"IN_PROGRESS",  plan:"ROADMAP_PUBLISHED" },
    { ref:"SUP-000006", name:"Temenos",                 svc:"Core Banking Platform",    crit:"CRITICAL", qr:"PLANNED",      plan:"ROADMAP_PUBLISHED" },
    { ref:"SUP-000007", name:"Finastra",                svc:"Treasury Platform",        crit:"HIGH",     qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000008", name:"Bloomberg",               svc:"Market Data & Analytics",  crit:"HIGH",     qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000009", name:"Refinitiv",               svc:"Market Data",              crit:"HIGH",     qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000010", name:"Broadridge",              svc:"Post-Trade Processing",    crit:"HIGH",     qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000011", name:"Thales",                  svc:"HSM & Key Management",     crit:"CRITICAL", qr:"IN_PROGRESS",  plan:"CERTIFIED_PQC_MODULE" },
    { ref:"SUP-000012", name:"Entrust",                 svc:"PKI & Certificate Mgmt",   crit:"CRITICAL", qr:"IN_PROGRESS",  plan:"PILOT_UNDERWAY" },
    { ref:"SUP-000013", name:"DigiCert",                svc:"TLS Certificates",         crit:"HIGH",     qr:"PLANNED",      plan:"ROADMAP_PUBLISHED" },
    { ref:"SUP-000014", name:"Oracle",                  svc:"Database Platform",        crit:"HIGH",     qr:"PLANNED",      plan:"ROADMAP_PUBLISHED" },
    { ref:"SUP-000015", name:"IBM",                     svc:"Mainframe & Middleware",   crit:"CRITICAL", qr:"IN_PROGRESS",  plan:"ROADMAP_PUBLISHED" },
    { ref:"SUP-000016", name:"Palo Alto Networks",      svc:"Network Security",         crit:"HIGH",     qr:"PLANNED",      plan:"ROADMAP_PUBLISHED" },
    { ref:"SUP-000017", name:"CrowdStrike",             svc:"Endpoint Security",        crit:"HIGH",     qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000018", name:"Cisco",                   svc:"Network Infrastructure",   crit:"CRITICAL", qr:"PLANNED",      plan:"ROADMAP_PUBLISHED" },
    { ref:"SUP-000019", name:"Citrix",                  svc:"Remote Access",            crit:"MEDIUM",   qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000020", name:"ServiceNow",              svc:"ITSM Platform",            crit:"MEDIUM",   qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000021", name:"Salesforce",              svc:"CRM Platform",             crit:"MEDIUM",   qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000022", name:"Workday",                 svc:"HR Platform",              crit:"LOW",      qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000023", name:"Equifax",                 svc:"Credit Reference",         crit:"HIGH",     qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000024", name:"Experian",                svc:"Credit Reference",         crit:"HIGH",     qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000025", name:"LexisNexis",              svc:"Identity Verification",    crit:"HIGH",     qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000026", name:"SWIFT gpi",               svc:"International Payments",   crit:"CRITICAL", qr:"PLANNED",      plan:"ROADMAP_PUBLISHED" },
    { ref:"SUP-000027", name:"Fiserv",                  svc:"Payment Processing",       crit:"HIGH",     qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000028", name:"FIS",                     svc:"Financial Technology",     crit:"HIGH",     qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000029", name:"Jack Henry",              svc:"Banking Technology",       crit:"MEDIUM",   qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000030", name:"Wolters Kluwer",          svc:"Regulatory Compliance",    crit:"MEDIUM",   qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000031", name:"Moody's Analytics",       svc:"Risk Analytics",           crit:"HIGH",     qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000032", name:"S&P Global",              svc:"Market Intelligence",      crit:"MEDIUM",   qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000033", name:"Symcor",                  svc:"Cheque Processing",        crit:"MEDIUM",   qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000034", name:"Computershare",           svc:"Share Registry",           crit:"MEDIUM",   qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000035", name:"BT Radianz",              svc:"Financial Network",        crit:"HIGH",     qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000036", name:"Flexcube (Oracle FS)",    svc:"Retail Banking System",    crit:"HIGH",     qr:"PLANNED",      plan:"ROADMAP_PUBLISHED" },
    { ref:"SUP-000037", name:"Murex",                   svc:"Capital Markets Platform", crit:"HIGH",     qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000038", name:"Calypso Technology",      svc:"Treasury Management",      crit:"HIGH",     qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000039", name:"Accenture (MSP)",         svc:"Managed IT Services",      crit:"HIGH",     qr:"NOT_ASSESSED", plan:null },
    { ref:"SUP-000040", name:"Infosys (MSP)",           svc:"Application Maintenance",  crit:"MEDIUM",   qr:"NOT_ASSESSED", plan:null },
  ];
  for (const s of supplierDefs) {
    await exec(
      `INSERT INTO "Supplier" (id, ref, "tenantId", "ownerId", name, "serviceProvided", criticality, "quantumReadinessRating", "migrationPlanStatus", "dataLongevityRelevant", status, jurisdictions, "dataAccess", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::\"Criticality\", $8, $9, $10, 'ACTIVE', $11, $12, $13, $14)`,
      [cuid(), s.ref, tId, userIds[4], s.name, s.svc, s.crit, s.qr, s.plan, s.crit === "CRITICAL", ["GB","EU"], s.crit === "CRITICAL" ? ["PERSONAL_DATA","FINANCIAL"] : ["OPERATIONAL"], now(), now()]
    );
  }
  console.log("  ✓ Suppliers (40)");

  // ── 13. Risks ─────────────────────────────────────────────────────────────
  const riskDefs = [
    { ref:"QR-000001", title:"Customer Data Exposure via Classical Key Establishment",      lr:"CRITICAL", rr:"CRITICAL", status:"IN_REMEDIATION" },
    { ref:"QR-000002", title:"Payment Gateway HNDL Vulnerability",                          lr:"CRITICAL", rr:"CRITICAL", status:"TREATMENT_PLANNED" },
    { ref:"QR-000003", title:"Code Signing Chain — Quantum-Vulnerable Signatures",           lr:"HIGH",     rr:"HIGH",     status:"OPEN" },
    { ref:"QR-000004", title:"Corporate PKI Migration Dependency",                           lr:"HIGH",     rr:"HIGH",     status:"TREATMENT_PLANNED" },
    { ref:"QR-000005", title:"11 Critical Suppliers Without PQC Plans",                      lr:"HIGH",     rr:"HIGH",     status:"OPEN" },
    { ref:"QR-000006", title:"Long-Life Contract Archive Unprotected",                       lr:"HIGH",     rr:"HIGH",     status:"OPEN" },
    { ref:"QR-000007", title:"TLS 1.2 Prevalence on Public Endpoints",                       lr:"HIGH",     rr:"HIGH",     status:"IN_REMEDIATION" },
    { ref:"QR-000008", title:"JWT RSA-2048 Signing Key Exposure",                            lr:"HIGH",     rr:"MEDIUM",   status:"TREATMENT_PLANNED" },
    { ref:"QR-000009", title:"FX Platform DH-2048 Key Exchange",                             lr:"CRITICAL", rr:"HIGH",     status:"OPEN" },
    { ref:"QR-000010", title:"Mortgage Archive — 25-Year Data Longevity Risk",               lr:"HIGH",     rr:"HIGH",     status:"OPEN" },
    { ref:"QR-000011", title:"SWIFT Messaging RSA Encryption Dependency",                    lr:"CRITICAL", rr:"CRITICAL", status:"OPEN" },
    { ref:"QR-000012", title:"HSM Firmware — No PQC Module Available",                       lr:"HIGH",     rr:"HIGH",     status:"OPEN" },
    { ref:"QR-000013", title:"Biometric Data Encrypted with ECDSA-P256",                     lr:"CRITICAL", rr:"HIGH",     status:"TREATMENT_PLANNED" },
    { ref:"QR-000014", title:"Core Banking ECDH Key Exchange",                               lr:"CRITICAL", rr:"CRITICAL", status:"OPEN" },
    { ref:"QR-000015", title:"Card Data RSA-2048 Encryption in Transit",                     lr:"CRITICAL", rr:"CRITICAL", status:"IN_REMEDIATION" },
    { ref:"QR-000016", title:"Wealth Portal — Client Portfolio Data HNDL",                   lr:"HIGH",     rr:"HIGH",     status:"OPEN" },
    { ref:"QR-000017", title:"AML Data Retention — Quantum Exposure",                        lr:"HIGH",     rr:"MEDIUM",   status:"OPEN" },
    { ref:"QR-000018", title:"Regulatory Submission Archive Vulnerability",                  lr:"HIGH",     rr:"MEDIUM",   status:"OPEN" },
    { ref:"QR-000019", title:"Remote Access VPN Classical Encryption",                       lr:"MEDIUM",   rr:"MEDIUM",   status:"OPEN" },
    { ref:"QR-000020", title:"Backup Encryption — AES-128 Insufficient Post-Quantum",        lr:"MEDIUM",   rr:"MEDIUM",   status:"OPEN" },
    { ref:"QR-000021", title:"Database Encryption Using 3DES Legacy",                        lr:"HIGH",     rr:"HIGH",     status:"OPEN" },
    { ref:"QR-000022", title:"Source Code Signing — RSA-2048 Keys",                          lr:"HIGH",     rr:"MEDIUM",   status:"TREATMENT_PLANNED" },
    { ref:"QR-000023", title:"Email Encryption S/MIME — RSA-2048",                           lr:"MEDIUM",   rr:"LOW",      status:"OPEN" },
    { ref:"QR-000024", title:"Internal API mTLS — ECDSA Certificates",                       lr:"HIGH",     rr:"HIGH",     status:"OPEN" },
    { ref:"QR-000025", title:"Disaster Recovery Site — Weaker Cryptographic Posture",        lr:"HIGH",     rr:"HIGH",     status:"OPEN" },
    { ref:"QR-000026", title:"Third-Party Data Feeds — Unassessed Cryptographic Risk",       lr:"MEDIUM",   rr:"MEDIUM",   status:"OPEN" },
    { ref:"QR-000027", title:"Open Source Dependency HNDL Risk",                             lr:"MEDIUM",   rr:"MEDIUM",   status:"OPEN" },
    { ref:"QR-000028", title:"Staff Awareness — Quantum Threat Understanding Low",            lr:"MEDIUM",   rr:"LOW",      status:"OPEN" },
    { ref:"QR-000029", title:"Legacy COBOL Mainframe Cryptographic APIs",                    lr:"HIGH",     rr:"HIGH",     status:"OPEN" },
    { ref:"QR-000030", title:"Regulatory Deadline Risk — NCSC 2028 Target",                  lr:"HIGH",     rr:"MEDIUM",   status:"OPEN" },
    { ref:"QR-000031", title:"Key Ceremony Process — No PQC Capability",                     lr:"HIGH",     rr:"HIGH",     status:"OPEN" },
    { ref:"QR-000032", title:"Cloud KMS Dependency — AWS PQC Timeline Uncertainty",          lr:"MEDIUM",   rr:"MEDIUM",   status:"OPEN" },
    { ref:"QR-000033", title:"Certificate Lifecycle Management — PQC Cert Size Impact",      lr:"MEDIUM",   rr:"MEDIUM",   status:"OPEN" },
    { ref:"QR-000034", title:"Mobile Banking App — Classical ECDH Session Keys",             lr:"HIGH",     rr:"HIGH",     status:"OPEN" },
    { ref:"QR-000035", title:"Trading Algorithm IP — Long-Term Confidentiality at Risk",     lr:"HIGH",     rr:"HIGH",     status:"OPEN" },
  ];
  const sev = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2 };
  for (const r of riskDefs) {
    const li = sev[r.lr] ?? 3;
    const ri = sev[r.rr] ?? 3;
    await exec(
      `INSERT INTO "Risk" (id, ref, "tenantId", "ownerId", title, "riskType", taxonomy, "likelihoodInherent", "impactInherent", "inherentScore", "inherentRating", "controlEffectiveness", "residualScore", "residualRating", status, priority, "targetDate", "reviewDate", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'QUANTUM_CRYPTOGRAPHIC', 'HNDL', $6, $7, $8, $9::\"Severity\", 20, $10, $11::\"Severity\", $12, $13, '2027-12-31', '2026-09-30', true, $14, $15)`,
      [cuid(), r.ref, tId, userIds[1], r.title, li, li, li*li, r.lr, ri*ri, r.rr, r.status, li, now(), now()]
    );
  }
  console.log("  ✓ Risks (35)");

  // ── 14. Actions ───────────────────────────────────────────────────────────
  const actionDefs = [
    { ref:"ACT-000001", title:"Complete endpoint TLS discovery — Production",         pri:"CRITICAL", due:"2026-07-31", status:"IN_PROGRESS" },
    { ref:"ACT-000002", title:"Assess 14 critical suppliers — PQC questionnaire",     pri:"CRITICAL", due:"2026-08-15", status:"OPEN" },
    { ref:"ACT-000003", title:"Classify 7 long-life information assets",              pri:"CRITICAL", due:"2026-07-25", status:"ASSIGNED" },
    { ref:"ACT-000004", title:"Approve PQC Migration Policy v1.0",                   pri:"HIGH",     due:"2026-08-01", status:"PENDING_EVIDENCE" },
    { ref:"ACT-000005", title:"Deploy CRYSTALS-Kyber on Payment Gateway TLS",        pri:"CRITICAL", due:"2026-09-30", status:"OPEN" },
    { ref:"ACT-000006", title:"Migrate JWT signing to CRYSTALS-Dilithium",           pri:"HIGH",     due:"2026-10-31", status:"OPEN" },
    { ref:"ACT-000007", title:"Issue PQC RFI to all Tier-1 suppliers",               pri:"HIGH",     due:"2026-08-31", status:"IN_PROGRESS" },
    { ref:"ACT-000008", title:"Complete PKI PQC transition plan",                    pri:"HIGH",     due:"2026-09-15", status:"OPEN" },
    { ref:"ACT-000009", title:"Retire all TLS 1.2 endpoints",                        pri:"HIGH",     due:"2026-12-31", status:"IN_PROGRESS" },
    { ref:"ACT-000010", title:"Initiate SWIFT quantum readiness dialogue",            pri:"HIGH",     due:"2026-08-01", status:"OPEN" },
    { ref:"ACT-000011", title:"Upgrade HSMs to PQC-capable firmware",                pri:"HIGH",     due:"2027-03-31", status:"OPEN" },
    { ref:"ACT-000012", title:"Board quantum risk briefing",                          pri:"MEDIUM",   due:"2026-09-30", status:"OPEN" },
    { ref:"ACT-000013", title:"PQC migration programme — Phase 1 kick-off",          pri:"HIGH",     due:"2026-10-01", status:"OPEN" },
    { ref:"ACT-000014", title:"Crypto inventory scan — Wealth portal",               pri:"HIGH",     due:"2026-08-31", status:"OPEN" },
    { ref:"ACT-000015", title:"Migrate code signing to quantum-safe algorithm",      pri:"HIGH",     due:"2026-11-30", status:"OPEN" },
    { ref:"ACT-000016", title:"Review 3DES usage in core banking",                   pri:"HIGH",     due:"2026-07-31", status:"IN_PROGRESS" },
    { ref:"ACT-000017", title:"Implement crypto-agile key management abstraction",   pri:"MEDIUM",   due:"2027-06-30", status:"OPEN" },
    { ref:"ACT-000018", title:"Develop PQC staff awareness training module",         pri:"MEDIUM",   due:"2026-10-31", status:"OPEN" },
    { ref:"ACT-000019", title:"Archive encryption review — mortgage contracts",      pri:"HIGH",     due:"2026-09-30", status:"OPEN" },
    { ref:"ACT-000020", title:"Deploy AES-256 for all backup encryption",            pri:"MEDIUM",   due:"2026-08-31", status:"OPEN" },
    { ref:"ACT-000021", title:"PQC pilot — Retail Payments TLS",                    pri:"HIGH",     due:"2026-12-31", status:"OPEN" },
    { ref:"ACT-000022", title:"Mainframe cryptographic API assessment",              pri:"HIGH",     due:"2026-10-31", status:"OPEN" },
    { ref:"ACT-000023", title:"Mobile app session key migration plan",               pri:"HIGH",     due:"2026-11-30", status:"OPEN" },
    { ref:"ACT-000024", title:"Open-source dependency HNDL scan",                   pri:"MEDIUM",   due:"2026-08-31", status:"IN_PROGRESS" },
    { ref:"ACT-000025", title:"FX platform ECDH migration assessment",              pri:"HIGH",     due:"2026-09-30", status:"OPEN" },
    { ref:"ACT-000026", title:"Disaster recovery crypto posture assessment",         pri:"MEDIUM",   due:"2026-10-31", status:"OPEN" },
    { ref:"ACT-000027", title:"Regulatory reporting — PQC readiness submission",    pri:"MEDIUM",   due:"2026-12-31", status:"OPEN" },
  ];
  for (const a of actionDefs) {
    await exec(
      `INSERT INTO "Action" (id, ref, "tenantId", "ownerId", "assigneeId", title, priority, status, "dueDate", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [cuid(), a.ref, tId, userIds[1], userIds[rand(3,5)], a.title, a.pri, a.status, new Date(a.due), now(), now()]
    );
  }
  console.log("  ✓ Actions (27)");

  // ── 15. Readiness Score ───────────────────────────────────────────────────
  // Insert ScoringPolicy first (required FK)
  const spId = cuid();
  const policyDimensions = { cryptoVisibility: { weight: 0.15 }, quantumExposure: { weight: 0.20 }, dataLongevity: { weight: 0.15 }, migrationPrep: { weight: 0.20 }, thirdParty: { weight: 0.10 }, governance: { weight: 0.10 }, cryptoAgility: { weight: 0.10 } };
  await exec(
    `INSERT INTO "ScoringPolicy" (id, "tenantId", version, "isActive", description, dimensions, "effectiveAt", "createdAt")
     VALUES ($1, $2, '1.0', true, 'Default SENQOR QRC scoring policy', $3, $4, $5)`,
    [spId, tId, JSON.stringify(policyDimensions), now(), now()]
  );

  const dimensions = {
    cryptoVisibility: 38, quantumExposure: 22, dataLongevity: 41,
    migrationPrep: 31, thirdParty: 18, governance: 55, cryptoAgility: 29
  };
  const factors = {
    quantumVulnerableCount: 120, liveVulnerableCount: 21, totalCryptoAssets: 300,
    unknownClassCount: 50, postQuantumCount: 10,
    openRiskCritical: 4, openRiskHigh: 9, openRiskMedium: 13, openRiskLow: 9,
    openActionCount: 27, criticalActionCount: 4, criticalSupplierUnassessed: 11
  };
  await exec(
    `INSERT INTO "ReadinessScore" (id, "tenantId", "scoringPolicyId", "overallScore", "previousScore", "scoreChange", confidence, dimensions, factors, "calculatedAt")
     VALUES ($1, $2, $3, 42, 36, 6, 'HIGH', $4, $5, $6)`,
    [cuid(), tId, spId, JSON.stringify(dimensions), JSON.stringify(factors), now()]
  );
  console.log("  ✓ Readiness Score (42/100)");

  // ── 16. Framework Alignments ──────────────────────────────────────────────
  const alignmentDefs = [
    { key: "NCSC PQC 2028", aligned: 57, partial: 25 },
    { key: "NIST PQC",      aligned: 63, partial: 22 },
    { key: "CNSA 2.0",      aligned: 28, partial: 18 },
    { key: "SQCF v1",       aligned: 41, partial: 30 },
  ];
  for (const a of alignmentDefs) {
    await exec(
      `INSERT INTO "FrameworkAlignment" (id, "frameworkId", "tenantId", "alignedPct", "partialPct", "notAlignedPct", status, "calculatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [cuid(), fwIds[a.key], tId, a.aligned, a.partial, 100-a.aligned-a.partial, a.aligned >= 60 ? "PARTIALLY_ALIGNED" : a.aligned < 35 ? "NOT_ALIGNED" : "PARTIALLY_ALIGNED", now()]
    );
  }
  console.log("  ✓ Framework Alignments (4)");

  // Seed a demo ScanScope so network scanners (SSLyze, SSH_AUDIT, ZGrab2) can run
  const scopeId = cuid();
  const approverUser = userIds[0]; // admin@northstar.com
  await exec(
    `INSERT INTO "ScanScope" (id, "tenantId", name, description, targets, "allowedSensors", "isActive", "approvedBy", "approvedAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7, $8, $9, $10, $11)`,
    [
      scopeId, tId,
      "Northstar Production Perimeter",
      "Approved scan scope covering Northstar public-facing endpoints and internal network segments",
      ["payments.northstar.com", "api.northstar.com", "*.northstar.com", "10.0.0.0/24", "10.0.1.10:22", "10.0.1.10"],
      [], // empty = all sensors allowed
      true,
      approverUser,
      now(), now(), now(),
    ]
  );
  console.log("  ✓ ScanScope (Northstar Production Perimeter)");

  client.release();
  console.log("\n✅  Seed complete — Northstar Financial Group is live in SENQOR.");
  console.log("   Login: admin@northstar.com");
}

main()
  .catch(e => { console.error("\n❌  Seed failed:", e.message || e); process.exit(1); })
  .finally(() => pool.end());
