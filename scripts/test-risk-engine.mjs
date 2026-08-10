/**
 * Test the Observations → Risks auto-generation pipeline.
 * Triggers a CRYPTOSCAN on panva/jose, waits for completion,
 * then checks that Risk records were created.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { config } from "dotenv";
config();

const BASE = "http://localhost:4000";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({
  adapter: new PrismaPg(pool, { schema: "senqor" }),
});

function extractCookies(headers) {
  const jar = {};
  for (const entry of headers.getSetCookie?.() ?? [headers.get("set-cookie") ?? ""]) {
    const [pair] = entry.split(";");
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return jar;
}
function jarHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function login() {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { redirect: "manual" });
  const { csrfToken } = await csrfRes.json();
  const jar = extractCookies(csrfRes.headers);
  const signInRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jarHeader(jar) },
    body: new URLSearchParams({ csrfToken, email: "admin@northstar.com", password: "Senqor2025!", callbackUrl: BASE, json: "true" }).toString(),
    redirect: "manual",
  });
  Object.assign(jar, extractCookies(signInRes.headers));
  const loc = signInRes.headers.get("location");
  if (loc) {
    const r = await fetch(loc.startsWith("http") ? loc : `${BASE}${loc}`, { redirect: "manual", headers: { Cookie: jarHeader(jar) } });
    Object.assign(jar, extractCookies(r.headers));
  }
  return jar;
}

async function triggerAndWait(jar, sensorType, targets, timeoutMs = 240_000) {
  const res = await fetch(`${BASE}/api/scan-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: jarHeader(jar) },
    body: JSON.stringify({ sensorType, targets }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const { jobId, ref } = await res.json();

  const deadline = Date.now() + timeoutMs;
  process.stdout.write(`  ${ref}`);
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const data = await (await fetch(`${BASE}/api/scan-jobs/${jobId}`, { headers: { Cookie: jarHeader(jar) } })).json();
    const job = data.job ?? data;
    process.stdout.write(".");
    if (job.status === "COMPLETED" || job.status === "FAILED") {
      process.stdout.write(` → ${job.status} | ${job.resultCount ?? 0} obs\n`);
      return job;
    }
  }
  throw new Error("Timed out waiting for scan");
}

// ── main ──────────────────────────────────────────────────────────────────────

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║  SENQOR Risk Engine Test                                     ║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");

const TENANT_ID = "cosQJN_Ve8kWzaYs";

// Snapshot risks before
const before = await db.risk.count({ where: { tenantId: TENANT_ID, riskType: "CRYPTOGRAPHIC" } });
console.log(`Risks before scan: ${before}\n`);

const jar = await login();
console.log("✓ Authenticated\n");

console.log("▶ CRYPTOSCAN — https://github.com/panva/jose");
const job = await triggerAndWait(jar, "CRYPTOSCAN", ["https://github.com/panva/jose"]);

// Query risks after
const after = await db.risk.count({ where: { tenantId: TENANT_ID, riskType: "CRYPTOGRAPHIC" } });
const newRisks = await db.risk.findMany({
  where: { tenantId: TENANT_ID, riskType: "CRYPTOGRAPHIC", isActive: true },
  orderBy: { inherentScore: "desc" },
  take: 10,
  select: { title: true, inherentRating: true, inherentScore: true, status: true },
});

console.log(`\n─────────────────────────────────────────────────────────────`);
console.log(`Observations: ${job.resultCount ?? 0}`);
console.log(`Risks before: ${before}  →  Risks after: ${after}  (Δ${after - before} new)\n`);

if (newRisks.length > 0) {
  console.log("Top risks generated:");
  for (const r of newRisks) {
    const badge = r.inherentRating === "CRITICAL" ? "🔴" : r.inherentRating === "HIGH" ? "🟠" : r.inherentRating === "MEDIUM" ? "🟡" : "🟢";
    console.log(`  ${badge} [${r.inherentRating}/${r.inherentScore}] ${r.title.slice(0, 80)}`);
  }
}

if (after > before) {
  console.log(`\n✅ Risk engine working — ${after - before} risk(s) auto-generated from scan`);
} else {
  console.log("\n⚠️  No new risks — check server console for [risk-engine] logs");
}

await db.$disconnect();
await pool.end();
console.log();
