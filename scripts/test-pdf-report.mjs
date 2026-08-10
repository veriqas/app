import { writeFileSync } from "fs";
import { config } from "dotenv";
config();

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

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║  SENQOR PDF Report Test                                      ║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");

const jar = await login();
console.log("✓ Authenticated\n");

console.log("▶ Generating PDF report...");
const start = Date.now();
const res = await fetch(`${BASE}/api/reports/quantum-pdf`, {
  headers: { Cookie: jarHeader(jar) },
});

const elapsed = Date.now() - start;

if (!res.ok) {
  const body = await res.text();
  console.error(`✗ Failed: ${res.status} — ${body}`);
  process.exit(1);
}

const contentType = res.headers.get("content-type");
const contentDisposition = res.headers.get("content-disposition");
const buffer = Buffer.from(await res.arrayBuffer());

console.log(`  Status:       ${res.status}`);
console.log(`  Content-Type: ${contentType}`);
console.log(`  Disposition:  ${contentDisposition}`);
console.log(`  Size:         ${(buffer.length / 1024).toFixed(1)} KB`);
console.log(`  Time:         ${elapsed}ms`);

// Verify it's actually a PDF
const isPdf = buffer.slice(0, 4).toString() === "%PDF";
console.log(`  Valid PDF:    ${isPdf ? "✅ yes" : "❌ no (check header)"}`);

// Save to disk
const outPath = "scripts/senqor-quantum-report-test.pdf";
writeFileSync(outPath, buffer);
console.log(`\n✅ Report saved to ${outPath}`);
console.log();
