import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyJavaDetection } from "../cryptoscan-ast-java-engine";
import { classifyDetection } from "../cryptoscan-ast-py-engine";
import { scanSourceText } from "../cryptoscan-ast-engine";

type D = Parameters<typeof classifyJavaDetection>[0];
const d = (kind: D["kind"], value: string, extra: Partial<D> = {}): D =>
  ({ file: "A.java", line: 1, kind, value, ...extra }) as D;
const algo = (x: D) => classifyJavaDetection(x)?.algorithm;

// ── JCA/JCE classification ──
test("java: MessageDigest algorithms", () => {
  assert.equal(algo(d("hash", "MD5")), "MD5");
  assert.equal(algo(d("hash", "SHA-1")), "SHA-1");
  assert.equal(algo(d("hash", "SHA-256")), "SHA-256");
});

test("java: Cipher transformations keep their algorithm despite mode/padding", () => {
  assert.equal(algo(d("cipher", "AES/CBC/PKCS5Padding")), "AES");
  assert.equal(algo(d("cipher", "AES/GCM/NoPadding")), "AES");
  assert.equal(algo(d("cipher", "DES")), "DES");
  assert.equal(algo(d("cipher", "DESede")), "3DES");
  assert.equal(algo(d("cipher", "RC4")), "RC4");
});

test("java: Signature algorithms", () => {
  assert.equal(algo(d("sign", "SHA256withRSA")), "RSA-SHA");
  assert.equal(algo(d("sign", "SHA1withDSA")), "DSA-2048");
  assert.equal(algo(d("sign", "SHA256withECDSA")), "ECDSA-P256");
});

test("java: Mac uses the canonical undashed MAC name", () => {
  assert.equal(algo(d("hmac", "HmacSHA256")), "HMAC-SHA256");
  assert.equal(algo(d("hmac", "HmacSHA1")), "HMAC-SHA1");
});

test("java: key size from initialize() refines the key-pair identity", () => {
  assert.equal(algo(d("keygen", "RSA", { key_size: 4096 })), "RSA-4096");
  assert.equal(algo(d("keygen", "RSA", { key_size: 2048 })), "RSA-2048");
  assert.equal(algo(d("keygen", "RSA")), "RSA-2048");
});

test("java: ECGenParameterSpec curves resolve to the real curve", () => {
  assert.equal(algo(d("curve", "secp256r1")), "ECDSA-P256");
  assert.equal(algo(d("curve", "secp384r1")), "ECDSA-P384");
  assert.equal(algo(d("curve", "secp521r1")), "ECDSA-P521");
  assert.equal(algo(d("curve", "secp256k1")), "ECDSA-K256");
});

test("java: SecretKeyFactory KDFs", () => {
  assert.equal(algo(d("kdf", "PBKDF2WithHmacSHA256")), "PBKDF2");
  assert.equal(algo(d("kdf", "PBKDF2WithHmacSHA1")), "PBKDF2");
});

test("java: post-quantum providers are SAFE, not unknown", () => {
  const k = classifyJavaDetection(d("pqc", "MLKEM768"));
  assert.equal(k?.algorithm, "ML-KEM-768");
  assert.equal(k?.quantum_risk, "SAFE");
  assert.equal(algo(d("pqc", "Dilithium3")), "CRYSTALS-Dilithium3");
});

test("java: protocol strings are not reported as algorithms", () => {
  assert.equal(classifyJavaDetection(d("protocol", "TLSv1.2")), null);
  assert.equal(classifyJavaDetection(d("protocol", "PKCS12")), null);
});

// ── Cross-language consistency: one algorithm, one canonical name ──
test("cross-language: Java, Python and JS/TS agree on canonical names", () => {
  const js = (src: string) => scanSourceText(src, "a.ts")[0]?.algorithm;
  const py = (kind: string, value: string, extra: object = {}) =>
    classifyDetection({ file: "a.py", line: 1, kind, value, ...extra } as never)?.algorithm;

  assert.equal(algo(d("hash", "MD5")), py("hash", "md5"));
  assert.equal(algo(d("hash", "MD5")), js(`crypto.createHash('md5')`));

  assert.equal(algo(d("hmac", "HmacSHA256")), py("hmac", "sha256"));
  assert.equal(algo(d("hmac", "HmacSHA256")), js(`crypto.createHmac('sha256', k)`));

  assert.equal(algo(d("cipher", "AES/CBC/PKCS5Padding")), py("cipher", "AES"));
  assert.equal(algo(d("curve", "secp384r1")), py("curve", "SECP384R1"));

  assert.equal(
    algo(d("keygen", "RSA", { key_size: 4096 })),
    py("keygen", "rsa", { key_size: 4096 }),
  );
  assert.equal(
    algo(d("keygen", "RSA", { key_size: 4096 })),
    js(`crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 4096 }, true, ['sign'])`),
  );

  assert.equal(algo(d("pqc", "MLKEM768")), py("pqc", "ml_kem768"));
  assert.equal(algo(d("pqc", "MLKEM768")), js(`ml_kem768.keygen()`));
});

// ── Negative ──
test("java: unclassifiable values are dropped rather than guessed", () => {
  assert.equal(classifyJavaDetection(d("hash", "NotAHash")), null);
  assert.equal(classifyJavaDetection(d("cipher", "NotACipher")), null);
});
