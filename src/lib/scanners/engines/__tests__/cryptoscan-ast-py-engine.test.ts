import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyDetection } from "../cryptoscan-ast-py-engine";
import { scanSourceText } from "../cryptoscan-ast-engine";

type D = Parameters<typeof classifyDetection>[0];
const d = (kind: D["kind"], value: string, extra: Partial<D> = {}): D =>
  ({ file: "a.py", line: 1, kind, value, ...extra }) as D;

const algo = (x: D) => classifyDetection(x)?.algorithm;

// ── Classification of Python-side detections ──
test("python: hashlib hashes classify to canonical names", () => {
  assert.equal(algo(d("hash", "md5")), "MD5");
  assert.equal(algo(d("hash", "sha1")), "SHA-1");
  assert.equal(algo(d("hash", "sha256")), "SHA-256");
  assert.equal(algo(d("hash", "sha3_512")), "SHA3-512");
});

test("python: hmac uses the canonical undashed MAC name", () => {
  assert.equal(algo(d("hmac", "sha256")), "HMAC-SHA256");
});

test("python: key generation is refined by the declared key size", () => {
  assert.equal(algo(d("keygen", "rsa", { key_size: 4096 })), "RSA-4096");
  assert.equal(algo(d("keygen", "rsa", { key_size: 2048 })), "RSA-2048");
  assert.equal(algo(d("keygen", "rsa")), "RSA-2048"); // unstated size keeps the generic entry
});

test("python: pyca curve classes resolve to the right curve, not a default", () => {
  assert.equal(algo(d("curve", "SECP256R1")), "ECDSA-P256");
  assert.equal(algo(d("curve", "SECP384R1")), "ECDSA-P384");
  assert.equal(algo(d("curve", "SECP521R1")), "ECDSA-P521");
  assert.equal(algo(d("curve", "SECP256K1")), "ECDSA-K256");
});

test("python: pycryptodome cipher class names", () => {
  assert.equal(algo(d("cipher", "AES")), "AES");
  assert.equal(algo(d("cipher", "TripleDES")), "3DES");
  assert.equal(algo(d("cipher", "ARC4")), "RC4");
  assert.equal(algo(d("cipher", "DES")), "DES");
});

test("python: PyJWT algorithms", () => {
  assert.equal(algo(d("jwt", "RS256")), "RSA-SHA");
  assert.equal(algo(d("jwt", "ES256")), "ECDSA-P256");
  assert.equal(algo(d("jwt", "HS256")), "HMAC-SHA256");
});

test("python: KDFs", () => {
  assert.equal(algo(d("kdf", "bcrypt")), "bcrypt");
  assert.equal(algo(d("kdf", "pbkdf2")), "PBKDF2");
  assert.equal(algo(d("kdf", "scrypt")), "scrypt");
});

// ── PQC: migrated Python must not read as unknown ──
test("python: liboqs post-quantum algorithms are SAFE, not unknown", () => {
  const kem = classifyDetection(d("pqc", "Kyber768"));
  assert.equal(kem?.algorithm, "CRYSTALS-Kyber-768");
  assert.equal(kem?.quantum_risk, "SAFE");
  const sig = classifyDetection(d("pqc", "Dilithium3"));
  assert.equal(sig?.algorithm, "CRYSTALS-Dilithium3");
  assert.equal(sig?.quantum_risk, "SAFE");
  assert.equal(algo(d("pqc", "ml_kem768")), "ML-KEM-768");
  assert.equal(algo(d("pqc", "ml_dsa65")), "ML-DSA-65");
});

// ── Cross-language consistency ──
// The whole point of the shared classifier: one algorithm, one canonical name,
// whichever language it was found in. Divergence here would split correlation
// cases and break before/after fingerprint comparison.
test("cross-language: Python and JS/TS agree on canonical names", () => {
  const jsAlgo = (src: string) => scanSourceText(src, "a.ts")[0]?.algorithm;

  assert.equal(algo(d("hash", "md5")), jsAlgo(`crypto.createHash('md5')`));
  assert.equal(algo(d("hash", "sha1")), jsAlgo(`crypto.createHash('sha1')`));
  assert.equal(algo(d("hmac", "sha256")), jsAlgo(`crypto.createHmac('sha256', k)`));
  assert.equal(algo(d("jwt", "RS256")), jsAlgo(`jwt.sign(p, k, { algorithm: 'RS256' })`));
  assert.equal(algo(d("cipher", "AES")), jsAlgo(`crypto.createCipheriv('aes-256-cbc', k, iv)`));
  assert.equal(algo(d("kdf", "bcrypt")), jsAlgo(`bcrypt.hashSync(pw, 10)`));
  assert.equal(algo(d("curve", "SECP256K1")), jsAlgo(`const e = new EC('secp256k1')`));
  assert.equal(algo(d("pqc", "ml_kem768")), jsAlgo(`ml_kem768.keygen()`));
  assert.equal(
    algo(d("keygen", "rsa", { key_size: 4096 })),
    jsAlgo(`crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 4096 }, true, ['sign'])`),
  );
});

// ── Negative ──
test("python: unclassifiable detections are dropped rather than guessed", () => {
  assert.equal(classifyDetection(d("hash", "not-a-hash")), null);
  assert.equal(classifyDetection(d("cipher", "definitely-not-a-cipher")), null);
  assert.equal(classifyDetection(d("pqc", "totally-classical")), null);
});
