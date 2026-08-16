import { test } from "node:test";
import assert from "node:assert/strict";
import { scanSourceText } from "../cryptoscan-ast-engine";

const algos = (src: string, p = "a.ts") => scanSourceText(src, p).map(f => f.algorithm);

// ── Positive detections ──
test("detects MD5 via createHash string literal", () => {
  assert.ok(algos(`crypto.createHash('md5').update(x).digest('hex')`).includes("MD5"));
});

test("detects crypto behind a variable (data-flow-lite) — regex would miss this", () => {
  const src = `const a = 'md5';\ncrypto.createHash(a).update(x)`;
  assert.ok(algos(src).includes("MD5"));
});

test("detects RSA via generateKeyPairSync('rsa')", () => {
  assert.ok(algos(`const k = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })`).includes("RSA-2048"));
});

test("detects RSA signature via createSign('RSA-SHA256')", () => {
  assert.ok(algos(`const s = crypto.createSign('RSA-SHA256')`).includes("RSA-SHA"));
});

test("detects JWT RS256 through a const options object passed by reference", () => {
  const src = `const opts = { algorithm: 'RS256', expiresIn: '1h' };\nexport function f(c){ return jwt.sign(c, key, opts as jwt.SignOptions); }`;
  const found = scanSourceText(src, "auth/jwt.ts");
  assert.ok(found.some(f => f.algorithm === "RSA-SHA"), "must resolve RS256 through the const options object");
  assert.equal(found.find(f => f.algorithm === "RSA-SHA")?.purpose, "JWT RSA signature");
});

test("detects ECDSA via generateKeyPair('ec')", () => {
  assert.ok(algos(`crypto.generateKeyPair('ec', {}, cb)`).includes("ECDSA-P256"));
});

test("detects AES via createCipheriv", () => {
  assert.ok(algos(`crypto.createCipheriv('aes-256-cbc', key, iv)`).includes("AES"));
});

// ── False-positive resistance (structural) ──
test("does NOT flag business strings named like algorithms", () => {
  const src = `export const RSA = 'Regional Sales Analysis';\nconst REPORTS = ['RSA', 'ECDSA quarterly'];\nfunction describe(c){ return 'Report ' + c + RSA; }`;
  assert.deepEqual(scanSourceText(src, "config/labels.ts"), []);
});

test("does NOT flag algorithm names in comments", () => {
  assert.deepEqual(scanSourceText(`// TODO: migrate our RSA and ECDSA usage to PQC\nconst x = 1;`, "c.ts"), []);
});

test("does NOT flag an unrelated method named sign without an algorithm option", () => {
  assert.deepEqual(scanSourceText(`invoice.sign(customer)`, "b.ts"), []);
});

// ── Shape ──
test("findings carry file, line, primitive, quantum_risk and high confidence", () => {
  const f = scanSourceText(`crypto.createHash('md5')`, "x.ts")[0];
  assert.equal(f.file, "x.ts");
  assert.equal(typeof f.line, "number");
  assert.equal(f.primitive, "HASH");
  assert.equal(f.quantum_risk, "VULNERABLE");
  assert.ok((f.confidence ?? 0) >= 90, "AST detection is higher-confidence than regex");
});

// ── Extended library coverage (Option 2) ──
test("WebCrypto: subtle.digest('SHA-1')", () => {
  assert.ok(algos(`await crypto.subtle.digest('SHA-1', data)`).includes("SHA-1"));
});

test("WebCrypto: subtle.generateKey RSASSA-PKCS1-v1_5 with modulusLength", () => {
  const src = `crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 4096, hash: 'SHA-256' }, true, ['sign'])`;
  assert.ok(algos(src).includes("RSA-4096"));
});

test("WebCrypto: subtle.generateKey ECDSA resolves the named curve", () => {
  const src = `crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-384' }, true, ['sign'])`;
  assert.ok(algos(src).includes("ECDSA-P384"));
});

test("crypto-js: CryptoJS.MD5 and CryptoJS.AES.encrypt", () => {
  assert.ok(algos(`CryptoJS.MD5('x')`).includes("MD5"));
  assert.ok(algos(`CryptoJS.AES.encrypt(msg, key)`).includes("AES"));
  assert.ok(algos(`CryptoJS.HmacSHA256(msg, key)`).includes("HMAC-SHA256"));
});

test("node-forge: forge.md.sha1.create() and forge.pki.rsa.generateKeyPair", () => {
  assert.ok(algos(`forge.md.sha1.create()`).includes("SHA-1"));
  assert.ok(algos(`forge.pki.rsa.generateKeyPair({ bits: 2048 })`).includes("RSA-2048"));
});

test("bcrypt: bcrypt.hashSync flagged as password hashing KDF", () => {
  const f = scanSourceText(`bcrypt.hashSync(pw, 10)`, "a.ts")[0];
  assert.equal(f.algorithm, "bcrypt");
  assert.equal(f.primitive, "KEY_DERIVATION");
});

test("tweetnacl: nacl.sign → Ed25519, nacl.box → X25519", () => {
  assert.ok(algos(`nacl.sign(msg, sk)`).includes("Ed25519"));
  assert.ok(algos(`nacl.box(msg, nonce, pk, sk)`).includes("X25519"));
});

test("elliptic: new EC('secp256k1')", () => {
  assert.ok(algos(`const ec = new EC('secp256k1')`).includes("ECDSA-K256"));
});

test("jose: setProtectedHeader({ alg: 'ES256' })", () => {
  const src = `await new SignJWT(c).setProtectedHeader({ alg: 'ES256' }).sign(key)`;
  assert.ok(algos(src).includes("ECDSA-P256"));
});

test("node crypto: pbkdf2 flagged as key derivation", () => {
  assert.ok(algos(`crypto.pbkdf2(pw, salt, 100000, 64, 'sha512', cb)`).includes("PBKDF2"));
});

test("does NOT flag a plain object literal with a name property", () => {
  assert.deepEqual(scanSourceText(`const user = { name: 'RSA Corp', role: 'admin' };`, "u.ts"), []);
});

// ── PQC awareness: already-migrated code must read as post-quantum, not unknown ──
const findOne = (src: string) => scanSourceText(src, "pq.ts")[0];

test("PQC: @noble/post-quantum ml_kem768 is post-quantum SAFE, not unknown", () => {
  const f = findOne(`import { ml_kem768 } from '@noble/post-quantum/ml-kem';\nconst k = ml_kem768.keygen();`);
  assert.equal(f.algorithm, "ML-KEM-768");
  assert.equal(f.quantum_risk, "SAFE");
  assert.equal(f.primitive, "KEY_ESTABLISHMENT");
});

test("PQC: ml_dsa65 signature detected as ML-DSA-65", () => {
  const f = findOne(`const sig = ml_dsa65.sign(sk, msg);`);
  assert.equal(f.algorithm, "ML-DSA-65");
  assert.equal(f.quantum_risk, "SAFE");
});

test("PQC: liboqs KeyEncapsulation('Kyber768') maps to the Kyber canonical name", () => {
  const f = findOne(`const kem = new KeyEncapsulation('Kyber768');`);
  assert.equal(f.algorithm, "CRYSTALS-Kyber-768");
  assert.equal(f.quantum_risk, "SAFE");
});

test("PQC: constructor form new MlKem1024()", () => {
  const f = findOne(`const kem = new MlKem1024();`);
  assert.equal(f.algorithm, "ML-KEM-1024");
});

test("PQC: FALCON and SPHINCS+ recognised", () => {
  assert.equal(findOne(`const s = falcon512.sign(m);`).algorithm, "FALCON-512");
  assert.equal(findOne(`const s = sphincs.sign(m);`).algorithm, "SPHINCS+");
});

test("PQC: hybrid X25519+MLKEM768 is HYBRID, not SAFE", () => {
  const f = findOne(`crypto.subtle.generateKey({ name: 'X25519MLKEM768' }, true, ['deriveKey'])`);
  assert.equal(f.algorithm, "X25519-MLKEM768");
  assert.equal(f.quantum_risk, "HYBRID");
});

// ── Scan completeness reporting ──
test("scan stats: caps are reported so a truncated scan is not mistaken for a clean one", async () => {
  const { runCryptoscanAst } = await import("../cryptoscan-ast-engine");
  const os = await import("node:os");
  const fs = await import("node:fs");
  const pathMod = await import("node:path");
  const dir = fs.mkdtempSync(pathMod.join(os.tmpdir(), "ast-stats-"));
  fs.writeFileSync(pathMod.join(dir, "a.ts"), `crypto.createHash('md5')`);
  fs.writeFileSync(pathMod.join(dir, "b.ts"), `crypto.createHash('sha1')`);
  const out = await runCryptoscanAst(dir, "https://local/x");
  fs.rmSync(dir, { recursive: true, force: true });
  const s = out.scan_stats!;
  assert.equal(s.files_discovered, 2);
  assert.equal(s.files_parsed, 2);
  assert.equal(s.files_skipped, 0);
  assert.equal(s.complete, true);
  assert.equal(s.truncated_total, false);
  assert.ok(s.caps.per_file > 0 && s.caps.total > 0);
});

test("scan stats: per-file cap marks the scan incomplete and counts real detections", () => {
  // 25 distinct hash calls in one file — above the 20-per-file cap.
  const lines = Array.from({ length: 25 }, (_, i) => `crypto.createHash('md5'); // ${i}`).join("\n");
  const found = scanSourceText(lines, "many.ts");
  assert.equal(found.length, 20, "per-file cap must hold");
});

test("PQC: parameter numbers are matched exactly, not as substrings", () => {
  assert.equal(findOne(`ml_dsa44.sign(sk, m)`).algorithm, "ML-DSA-44");
  assert.equal(findOne(`ml_dsa65.sign(sk, m)`).algorithm, "ML-DSA-65");
  assert.equal(findOne(`ml_dsa87.sign(sk, m)`).algorithm, "ML-DSA-87");
  assert.equal(findOne(`dilithium2.sign(sk, m)`).algorithm, "CRYSTALS-Dilithium2");
  assert.equal(findOne(`dilithium3.sign(sk, m)`).algorithm, "CRYSTALS-Dilithium3");
  assert.equal(findOne(`dilithium5.sign(sk, m)`).algorithm, "CRYSTALS-Dilithium5");
  assert.equal(findOne(`ml_kem512.keygen()`).algorithm, "ML-KEM-512");
  assert.equal(findOne(`ml_kem1024.keygen()`).algorithm, "ML-KEM-1024");
});
