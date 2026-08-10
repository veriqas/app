/**
 * Verifies scanner consistency by running two independent clones in parallel.
 */
import { simpleGit } from 'simple-git';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const PATTERNS = [
  { regex: /(?:generateKeyPair|createPrivateKey|createPublicKey)\s*\(\s*['"]rsa['"]/i, algorithm: "RSA-2048" },
  { regex: /createECDH\s*\(/, algorithm: "ECDH-P256" },
  { regex: /(?:generateKeyPair|createPrivateKey)\s*\(\s*['"]ec['"]/i, algorithm: "ECDSA-P256" },
  { regex: /p-256|P-256|prime256v1|secp256r1/, algorithm: "ECDSA-P256" },
  { regex: /p-384|P-384|secp384r1/, algorithm: "ECDSA-P384" },
  { regex: /p-521|P-521|secp521r1/, algorithm: "ECDSA-P521" },
  { regex: /createHash\s*\(\s*['"]sha256['"]/i, algorithm: "SHA-256" },
  { regex: /subtle\.importKey.*['"]RSA-OAEP['"]/i, algorithm: "RSA-OAEP" },
  { regex: /subtle\.importKey.*['"]ECDSA['"]/i, algorithm: "ECDSA-P256" },
  { regex: /subtle\.generateKey.*['"]ECDSA['"]/i, algorithm: "ECDSA-P256" },
  { regex: /algorithm\s*:\s*['"]RS256['"]/, algorithm: "RSA-2048" },
  { regex: /algorithm\s*:\s*['"]ES256['"]/, algorithm: "ECDSA-P256" },
  { regex: /createCipheriv\s*\(\s*['"]aes-/i, algorithm: "AES-256" },
];
const EXTS = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  // Sort for deterministic traversal order
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!['node_modules', '.git', 'dist', 'build'].includes(e.name)) yield* walk(full);
    } else if (EXTS.includes(path.extname(e.name).toLowerCase())) {
      yield full;
    }
  }
}

function scan(dir) {
  const findings = [];
  const seen = new Set();
  for (const fp of walk(dir)) {
    let content;
    try { content = fs.readFileSync(fp, 'utf-8'); } catch { continue; }
    const lines = content.split('\n');
    const rel = path.relative(dir, fp).replace(/\\/g, '/');
    let fileCount = 0;
    outer: for (let i = 0; i < lines.length; i++) {
      for (const p of PATTERNS) {
        if (!p.regex.test(lines[i])) continue;
        const key = `${rel}:${i + 1}:${p.algorithm}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push(key);
        fileCount++;
        if (fileCount >= 20) break outer;
        break;
      }
    }
    if (findings.length >= 500) break;
  }
  return findings;
}

async function runScan(label) {
  const dir = path.join(os.tmpdir(), `jose-verify-${label}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  await simpleGit().clone('https://github.com/panva/jose', dir, ['--depth', '1', '--single-branch']);
  const findings = scan(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  return findings;
}

console.log('Cloning panva/jose twice in parallel to check consistency...\n');
const [r1, r2] = await Promise.all([runScan('A'), runScan('B')]);

console.log(`Run A: ${r1.length} findings`);
console.log(`Run B: ${r2.length} findings`);

const set1 = new Set(r1);
const set2 = new Set(r2);
const onlyIn1 = r1.filter(f => !set2.has(f));
const onlyIn2 = r2.filter(f => !set1.has(f));

if (r1.length === r2.length && onlyIn1.length === 0) {
  console.log(`\n✅ Fully consistent — ${r1.length} identical findings both runs`);
} else {
  console.log(`\n❌ Inconsistent`);
  if (onlyIn1.length) { console.log(`  Only in A:`); onlyIn1.forEach(f => console.log(`    ${f}`)); }
  if (onlyIn2.length) { console.log(`  Only in B:`); onlyIn2.forEach(f => console.log(`    ${f}`)); }
}
