/**
 * Demo scan: auth0/node-auth0 — enterprise identity SDK
 * Triggers CRYPTOSCAN + CRYPTODEPS, streams progress, prints results summary.
 */

const BASE = "http://localhost:4000";
const EMAIL = "admin@northstar.com";
const PASSWORD = "Senqor2025!";
const REPO = "https://github.com/auth0/node-auth0";

function extractCookies(headers) {
  const jar = {};
  const raw = headers.getSetCookie?.() ?? [headers.get("set-cookie") ?? ""];
  for (const entry of raw) {
    const [pair] = entry.split(";");
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return jar;
}
function jarHeader(jar) { return Object.entries(jar).map(([k,v]) => `${k}=${v}`).join("; "); }

async function login() {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { redirect: "manual" });
  const { csrfToken } = await csrfRes.json();
  const jar = extractCookies(csrfRes.headers);

  const signInRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cookie": jarHeader(jar) },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: BASE, json: "true" }).toString(),
    redirect: "manual",
  });
  Object.assign(jar, extractCookies(signInRes.headers));

  const location = signInRes.headers.get("location");
  if (location) {
    const r = await fetch(location.startsWith("http") ? location : `${BASE}${location}`, {
      redirect: "manual", headers: { "Cookie": jarHeader(jar) },
    });
    Object.assign(jar, extractCookies(r.headers));
  }
  return jar;
}

async function triggerScan(jar, sensorType) {
  const res = await fetch(`${BASE}/api/scan-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": jarHeader(jar) },
    body: JSON.stringify({ sensorType, targets: [REPO] }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function pollJob(jar, jobId) {
  const start = Date.now();
  while (true) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await fetch(`${BASE}/api/scan-jobs/${jobId}`, { headers: { "Cookie": jarHeader(jar) } });
    if (!res.ok) continue;
    const data = await res.json();
    const job = data.job ?? data;
    const elapsed = Math.round((Date.now() - start) / 1000);
    const status = job.status;
    const count  = job.resultCount ?? 0;
    process.stdout.write(`\r  [${String(elapsed).padStart(3)}s] ${status.padEnd(12)} observations=${String(count).padStart(3)}`);
    if (status === "COMPLETED" || status === "FAILED") { process.stdout.write("\n"); return job; }
    if (Date.now() - start > 300_000) throw new Error("Timeout");
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║  SENQOR Quantum Readiness Scanner — Live Demo                ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`\nTarget: ${REPO}`);
console.log("Reason: Enterprise identity SDK — heavy JWT/RSA/JWKS usage\n");

const jar = await login();
console.log(`✓ Authenticated as ${EMAIL}\n`);

const scanners = [
  { type: "CRYPTOSCAN", label: "Source Code Crypto Scanner (CRYPTOSCAN)" },
  { type: "CRYPTODEPS", label: "Dependency Analyser          (CRYPTODEPS)" },
];

const results = {};

for (const { type, label } of scanners) {
  console.log(`▶ ${label}`);
  const { jobId, ref } = await triggerScan(jar, type);
  console.log(`  Job: ${ref} (${jobId})`);
  const job = await pollJob(jar, jobId);
  results[type] = job;
  if (job.status === "COMPLETED") {
    console.log(`  ✅ ${job.resultCount} observations written to database`);
  } else {
    console.log(`  ❌ FAILED: ${job.errorMessage}`);
  }
  console.log();
}

console.log("─────────────────────────────────────────────────────────────");
console.log("Results are now live in the SENQOR platform:");
console.log(`  → http://localhost:4000/discovery/scan-jobs`);
console.log(`  → http://localhost:4000/discovery/crypto-assets`);
console.log("─────────────────────────────────────────────────────────────\n");
