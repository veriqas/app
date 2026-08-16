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
