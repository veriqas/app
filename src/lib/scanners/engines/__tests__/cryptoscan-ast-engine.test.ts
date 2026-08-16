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
