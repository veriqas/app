/**
 * End-to-end API test: login → trigger CRYPTOSCAN → poll until complete.
 * Run: node scripts/test-scan-api.mjs
 */

const BASE = "http://localhost:4000";
const EMAIL = "admin@northstar.com";
const PASSWORD = "Senqor2025!";
const REPO = "https://github.com/panva/jose";

function extractCookies(headerValue) {
  if (!headerValue) return {};
  // set-cookie can be a single string or array; each cookie is "name=value; ..."
  const entries = Array.isArray(headerValue) ? headerValue : [headerValue];
  const jar = {};
  for (const entry of entries) {
    const [pair] = entry.split(";");
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    jar[name] = value;
  }
  return jar;
}

function jarToHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function login() {
  // Step 1: get CSRF token + initial cookies
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { redirect: "manual" });
  const { csrfToken } = await csrfRes.json();
  const jar = extractCookies(csrfRes.headers.getSetCookie?.() ?? csrfRes.headers.get("set-cookie") ?? []);

  // Step 2: POST credentials
  const body = new URLSearchParams({
    csrfToken,
    email: EMAIL,
    password: PASSWORD,
    callbackUrl: BASE,
    json: "true",
  });

  const signInRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": jarToHeader(jar),
    },
    body: body.toString(),
    redirect: "manual",
  });

  // Collect cookies from sign-in response
  const signInCookies = extractCookies(signInRes.headers.getSetCookie?.() ?? signInRes.headers.get("set-cookie") ?? []);
  Object.assign(jar, signInCookies);

  // Step 3: follow the redirect to get the session token
  const location = signInRes.headers.get("location");
  if (location) {
    const redirectUrl = location.startsWith("http") ? location : `${BASE}${location}`;
    const redirectRes = await fetch(redirectUrl, {
      redirect: "manual",
      headers: { "Cookie": jarToHeader(jar) },
    });
    const redirectCookies = extractCookies(redirectRes.headers.getSetCookie?.() ?? redirectRes.headers.get("set-cookie") ?? []);
    Object.assign(jar, redirectCookies);
  }

  return jar;
}

async function triggerScan(cookieHeader, sensorType, targets) {
  const res = await fetch(`${BASE}/api/scan-jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": cookieHeader,
    },
    body: JSON.stringify({ sensorType, targets }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Scan trigger failed ${res.status}: ${text}`);
  }

  return res.json();
}

async function pollJob(cookieHeader, jobId, maxWaitMs = 300_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await fetch(`${BASE}/api/scan-jobs/${jobId}`, {
      headers: { "Cookie": cookieHeader },
    });
    if (!res.ok) continue;
    const data = await res.json();
    const job = data.job ?? data;
    const status = job.status ?? job?.scanJob?.status;
    const count  = job.resultCount ?? job?.scanJob?.resultCount ?? 0;
    console.log(`  [${Math.round((Date.now()-start)/1000)}s] status=${status} observations=${count}`);
    if (status === "COMPLETED" || status === "FAILED") return job;
  }
  throw new Error("Timed out waiting for scan job");
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

console.log(`\n🔍 SENQOR API Scanner Test\n`);

console.log("1. Logging in as", EMAIL);
const jar = await login();
const hasSession = !!jar["authjs.session-token"];
console.log(`   Session cookie obtained: ${hasSession}`);
console.log(`   Cookies: ${Object.keys(jar).join(", ")}`);

if (!hasSession) {
  console.error("   Login failed — no session cookie. Is the server running? Did seed run?");
  process.exit(1);
}

const cookieHeader = jarToHeader(jar);

for (const sensorType of ["CRYPTOSCAN", "CRYPTODEPS"]) {
  console.log(`\n2. Triggering ${sensorType} scan on ${REPO}`);
  const { jobId, ref } = await triggerScan(cookieHeader, sensorType, [REPO]);
  console.log(`   Job created: ${jobId} (${ref})`);
  console.log(`   Polling for completion...`);
  const result = await pollJob(cookieHeader, jobId);
  const status = result.status ?? result?.scanJob?.status;
  const count  = result.resultCount ?? result?.scanJob?.resultCount ?? 0;
  const err    = result.errorMessage ?? result?.scanJob?.errorMessage;
  if (status === "COMPLETED") {
    console.log(`   ✅ ${sensorType} completed — ${count} observations written`);
  } else {
    console.log(`   ❌ ${sensorType} FAILED: ${err}`);
  }
}

console.log("\n✅ Done\n");
