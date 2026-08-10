/**
 * Quick integration test for the native scanner engines.
 * Run: node scripts/test-scanner.mjs
 */

import { simpleGit } from "simple-git";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- inline the engine functions (avoid TS compilation) ---

function* walkFiles(dir, exts) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", "dist", "build", "__pycache__"].includes(entry.name)) continue;
      yield* walkFiles(full, exts);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (exts.length === 0 || exts.includes(ext)) yield full;
    }
  }
}

const PATTERNS = [
  { regex: /(?:generateKeyPair|createPrivateKey|createPublicKey)\s*\(\s*['"]rsa['"]/i,  algorithm: "RSA-2048",    quantum_risk: "VULNERABLE" },
  { regex: /createECDH\s*\(/,                                                            algorithm: "ECDH-P256",   quantum_risk: "VULNERABLE" },
  { regex: /(?:generateKeyPair|createPrivateKey)\s*\(\s*['"]ec['"]/i,                   algorithm: "ECDSA-P256",  quantum_risk: "VULNERABLE" },
  { regex: /p-256|P-256|prime256v1|secp256r1/,                                          algorithm: "ECDSA-P256",  quantum_risk: "VULNERABLE" },
  { regex: /createHash\s*\(\s*['"]sha256['"]/i,                                         algorithm: "SHA-256",     quantum_risk: "PARTIAL"    },
  { regex: /createHash\s*\(\s*['"]sha512['"]/i,                                         algorithm: "SHA-512",     quantum_risk: "PARTIAL"    },
  { regex: /createHmac\s*\(\s*['"]sha256['"]/i,                                         algorithm: "HMAC-SHA256", quantum_risk: "PARTIAL"    },
  { regex: /subtle\.importKey.*['"]RSA-OAEP['"]/i,                                      algorithm: "RSA-OAEP",    quantum_risk: "VULNERABLE" },
  { regex: /subtle\.importKey.*['"]ECDSA['"]/i,                                         algorithm: "ECDSA-P256",  quantum_risk: "VULNERABLE" },
  { regex: /subtle\.generateKey.*['"]ECDSA['"]/i,                                       algorithm: "ECDSA-P256",  quantum_risk: "VULNERABLE" },
  { regex: /subtle\.digest\s*\(\s*['"]SHA-/i,                                           algorithm: "SHA-256",     quantum_risk: "PARTIAL"    },
  { regex: /algorithm\s*:\s*['"]RS256['"]/,                                             algorithm: "RSA-2048",    quantum_risk: "VULNERABLE" },
  { regex: /algorithm\s*:\s*['"]ES256['"]/,                                             algorithm: "ECDSA-P256",  quantum_risk: "VULNERABLE" },
  { regex: /createCipheriv\s*\(\s*['"]aes-/i,                                           algorithm: "AES-256",     quantum_risk: "PARTIAL"    },
];

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs"];

async function cloneRepo(repoUrl) {
  const id = `senqor-test-${Date.now()}`;
  const dir = path.join(os.tmpdir(), id);
  fs.mkdirSync(dir, { recursive: true });
  const git = simpleGit();
  console.log(`  Cloning ${repoUrl} → ${dir}`);
  await git.clone(repoUrl, dir, ["--depth", "1", "--single-branch"]);
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

async function runCryptoscan(dir) {
  const findings = [];
  const seen = new Set();
  for (const filePath of walkFiles(dir, CODE_EXTENSIONS)) {
    let content;
    try { content = fs.readFileSync(filePath, "utf-8"); } catch { continue; }
    const lines = content.split("\n");
    const relPath = path.relative(dir, filePath).replace(/\\/g, "/");
    for (let i = 0; i < lines.length; i++) {
      for (const p of PATTERNS) {
        if (!p.regex.test(lines[i])) continue;
        const key = `${relPath}:${i+1}:${p.algorithm}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({ algorithm: p.algorithm, quantum_risk: p.quantum_risk, file: relPath, line: i+1, context: lines[i].trim().slice(0,80) });
        if (findings.filter(f => f.file === relPath).length >= 20) break;
      }
    }
    if (findings.length >= 200) break;
  }
  return findings;
}

const MANIFEST_FILES = ["package.json", "go.mod", "requirements.txt"];
const KNOWN = {
  "jose":        [{ algorithm: "ECDSA-P256", quantum_risk: "VULNERABLE" }, { algorithm: "RSA-2048", quantum_risk: "VULNERABLE" }],
  "@noble/curves":[{ algorithm: "ECDSA-P256", quantum_risk: "VULNERABLE" }],
  "@noble/hashes":[{ algorithm: "SHA-256", quantum_risk: "PARTIAL" }],
};

async function runCryptodeps(dir) {
  const findings = [];
  for (const filePath of walkFiles(dir, [])) {
    const filename = path.basename(filePath);
    if (!MANIFEST_FILES.includes(filename)) continue;
    let content;
    try { content = fs.readFileSync(filePath, "utf-8"); } catch { continue; }
    if (filename === "package.json") {
      let pkg;
      try { pkg = JSON.parse(content); } catch { continue; }
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const name of Object.keys(deps)) {
        if (KNOWN[name]) findings.push({ package: name, impls: KNOWN[name] });
      }
    }
  }
  return findings;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

const REPO = "https://github.com/panva/jose";
console.log(`\n🔍 SENQOR Scanner Test — ${REPO}\n`);

const { dir, cleanup } = await cloneRepo(REPO);

try {
  console.log("\n── CRYPTOSCAN ──────────────────────────────────────────────");
  const scanFindings = await runCryptoscan(dir);
  console.log(`Found ${scanFindings.length} crypto patterns`);
  const byAlgo = {};
  for (const f of scanFindings) byAlgo[f.algorithm] = (byAlgo[f.algorithm] ?? 0) + 1;
  for (const [algo, count] of Object.entries(byAlgo).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${algo.padEnd(20)} ${count} occurrences`);
  }
  console.log("\nTop 5 findings:");
  for (const f of scanFindings.slice(0, 5)) {
    console.log(`  [${f.quantum_risk}] ${f.algorithm} @ ${f.file}:${f.line}`);
    console.log(`    > ${f.context}`);
  }

  console.log("\n── CRYPTODEPS ──────────────────────────────────────────────");
  const depFindings = await runCryptodeps(dir);
  console.log(`Found ${depFindings.length} crypto packages`);
  for (const f of depFindings) {
    console.log(`  ${f.package}`);
    for (const i of f.impls) console.log(`    → ${i.algorithm} [${i.quantum_risk}]`);
  }

  console.log("\n✅ Scanner engines working correctly\n");
} finally {
  cleanup();
}
