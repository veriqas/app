/**
 * Integration test for SSLYZE and SSH_AUDIT engines against real public targets.
 */

const BASE = "http://localhost:4000";

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
function jarHeader(jar) { return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; "); }

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

async function triggerAndWait(jar, sensorType, targets, timeoutMs = 180_000) {
  const res = await fetch(`${BASE}/api/scan-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cookie": jarHeader(jar) },
    body: JSON.stringify({ sensorType, targets }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const { jobId, ref } = await res.json();

  const start = Date.now();
  process.stdout.write(`  ${ref}`);
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 4000));
    const j = await (await fetch(`${BASE}/api/scan-jobs/${jobId}`, { headers: { Cookie: jarHeader(jar) } })).json();
    const job = j.job ?? j;
    process.stdout.write(".");
    if (job.status === "COMPLETED" || job.status === "FAILED") {
      process.stdout.write(` → ${job.status} | ${job.resultCount ?? 0} obs | ${job.errorMessage ?? ""}\n`);
      return job;
    }
  }
  throw new Error("Timed out");
}

// ── main ──────────────────────────────────────────────────────────────────────

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║  SENQOR Network Scanner Test                                 ║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");

const jar = await login();
console.log("✓ Authenticated\n");

// SSLYZE — scan github.com TLS endpoint
console.log("▶ SSLYZE — github.com:443");
const tlsJob = await triggerAndWait(jar, "SSLYZE", ["github.com:443"]);

// SSH_AUDIT — scan github.com SSH endpoint
console.log("\n▶ SSH_AUDIT — github.com:22");
const sshJob = await triggerAndWait(jar, "SSH_AUDIT", ["github.com:22"]);

// Summary
console.log("\n─────────────────────────────────────────────────────────────");
console.log(`SSLYZE:    ${tlsJob.status} — ${tlsJob.resultCount ?? 0} crypto observations`);
console.log(`SSH_AUDIT: ${sshJob.status} — ${sshJob.resultCount ?? 0} crypto observations`);

const totalObs = (tlsJob.resultCount ?? 0) + (sshJob.resultCount ?? 0);
if (totalObs > 0) {
  console.log(`\n✅ ${totalObs} real observations from live network scans`);
} else {
  console.log("\n⚠️  No observations — check server logs for tool output");
}
console.log();
