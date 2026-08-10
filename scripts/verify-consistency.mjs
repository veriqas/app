/**
 * Verifies the scanner produces consistent observation counts across two runs.
 * Uses kelektiv/node.bcrypt.js — not scanned before, so no dedup interference.
 */

const BASE = "http://localhost:4000";
const REPO = "https://github.com/kelektiv/node.bcrypt.js";

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
function jarHeader(jar) { return Object.entries(jar).map(([k,v]) => `${k}=${v}`).join("; "); }

async function login() {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { redirect: "manual" });
  const { csrfToken } = await csrfRes.json();
  const jar = extractCookies(csrfRes.headers);
  const signInRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cookie": jarHeader(jar) },
    body: new URLSearchParams({ csrfToken, email: "admin@northstar.com", password: "Senqor2025!", callbackUrl: BASE, json: "true" }).toString(),
    redirect: "manual",
  });
  Object.assign(jar, extractCookies(signInRes.headers));
  const loc = signInRes.headers.get("location");
  if (loc) Object.assign(jar, extractCookies((await fetch(loc.startsWith("http") ? loc : `${BASE}${loc}`, { redirect: "manual", headers: { Cookie: jarHeader(jar) } })).headers));
  return jar;
}

async function scan(jar, label) {
  const res = await fetch(`${BASE}/api/scan-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": jarHeader(jar) },
    body: JSON.stringify({ sensorType: "CRYPTOSCAN", targets: [REPO] }),
  });
  const { jobId, ref } = await res.json();
  process.stdout.write(`  ${label} ${ref} → polling`);
  const start = Date.now();
  while (true) {
    await new Promise(r => setTimeout(r, 3000));
    const j = await (await fetch(`${BASE}/api/scan-jobs/${jobId}`, { headers: { Cookie: jarHeader(jar) } })).json();
    const job = j.job ?? j;
    process.stdout.write(".");
    if (job.status === "COMPLETED" || job.status === "FAILED") {
      process.stdout.write(` ${job.resultCount} obs (${Math.round((Date.now()-start)/1000)}s)\n`);
      return job.resultCount;
    }
  }
}

console.log(`\nConsistency check — ${REPO}\n`);
const jar = await login();
const r1 = await scan(jar, "Run 1:");
const r2 = await scan(jar, "Run 2:");

if (r1 === r2) {
  console.log(`\n✅ Consistent — both runs: ${r1} observations`);
} else {
  console.log(`\n❌ Inconsistent — run 1: ${r1}, run 2: ${r2}`);
}
