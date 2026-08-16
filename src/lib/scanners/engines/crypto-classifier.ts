/**
 * Shared cryptographic algorithm classification.
 *
 * Every AST language engine classifies through this module so that a given
 * algorithm gets the SAME canonical name regardless of which language it was
 * found in. That matters downstream: correlation groups findings by algorithm,
 * and verification compares before/after fingerprints — two spellings of one
 * algorithm would split cases and break fingerprint matching.
 *
 * Canonical names must match src/lib/sensors/normalizer/algorithm-registry.ts.
 */

export type Risk = "VULNERABLE" | "PARTIAL" | "HYBRID" | "SAFE" | "UNKNOWN";
export interface AlgoInfo { algorithm: string; primitive: string; quantum_risk: Risk; purpose?: string; }

// ── Post-quantum algorithm classification ─────────────────────────────────────
// Code that has ALREADY migrated must be reported as post-quantum, not
// "unknown" — otherwise a client mid-migration sees false alarms on the very
// code they just fixed. Canonical names match the algorithm registry.
export function classifyPqc(raw: string): AlgoInfo | null {
  const n = raw.toLowerCase().replace(/[-_\s]/g, "");

  // Hybrid key establishment (classical + PQ). Reported as HYBRID, not SAFE.
  if (n.includes("x25519") && (n.includes("mlkem768") || n.includes("kyber768")))
    return { algorithm: "X25519-MLKEM768", primitive: "KEY_ESTABLISHMENT", quantum_risk: "HYBRID", purpose: "hybrid key establishment" };
  if ((n.includes("p256") || n.includes("secp256r1")) && (n.includes("mlkem768") || n.includes("kyber768")))
    return { algorithm: "P256-MLKEM768", primitive: "KEY_ESTABLISHMENT", quantum_risk: "HYBRID", purpose: "hybrid key establishment" };

  // ML-KEM (FIPS 203) and its CRYSTALS-Kyber predecessor.
  if (n.includes("mlkem") || n.includes("kyber")) {
    const kyber = n.includes("kyber") && !n.includes("mlkem");
    if (n.includes("1024")) return { algorithm: kyber ? "CRYSTALS-Kyber-1024" : "ML-KEM-1024", primitive: "KEY_ESTABLISHMENT", quantum_risk: "SAFE", purpose: "post-quantum key encapsulation" };
    if (n.includes("512"))  return { algorithm: kyber ? "CRYSTALS-Kyber-512"  : "ML-KEM-512",  primitive: "KEY_ESTABLISHMENT", quantum_risk: "SAFE", purpose: "post-quantum key encapsulation" };
    return { algorithm: kyber ? "CRYSTALS-Kyber-768" : "ML-KEM-768", primitive: "KEY_ESTABLISHMENT", quantum_risk: "SAFE", purpose: "post-quantum key encapsulation" };
  }

  // ML-DSA (FIPS 204) and its CRYSTALS-Dilithium predecessor.
  if (n.includes("mldsa") || n.includes("dilithium")) {
    const sig = (algorithm: string): AlgoInfo => ({ algorithm, primitive: "DIGITAL_SIGNATURE", quantum_risk: "SAFE", purpose: "post-quantum signature" });
    // Dilithium is numbered 2/3/5; ML-DSA is numbered 44/65/87. Match the full
    // parameter number, never a substring of it (`mldsa65` must not match "5").
    if (n.includes("dilithium") && !n.includes("mldsa")) {
      if (/dilithium5/.test(n)) return sig("CRYSTALS-Dilithium5");
      if (/dilithium2/.test(n)) return sig("CRYSTALS-Dilithium2");
      return sig("CRYSTALS-Dilithium3");
    }
    if (n.includes("87")) return sig("ML-DSA-87");
    if (n.includes("44")) return sig("ML-DSA-44");
    return sig("ML-DSA-65");
  }

  // SLH-DSA (FIPS 205) / SPHINCS+.
  if (n.includes("slhdsa") || n.includes("sphincs")) {
    if (n.includes("slhdsa")) {
      if (n.includes("256")) return { algorithm: "SLH-DSA-256s", primitive: "DIGITAL_SIGNATURE", quantum_risk: "SAFE", purpose: "post-quantum signature" };
      if (n.includes("192")) return { algorithm: "SLH-DSA-192s", primitive: "DIGITAL_SIGNATURE", quantum_risk: "SAFE", purpose: "post-quantum signature" };
      if (n.includes("128f")) return { algorithm: "SLH-DSA-128f", primitive: "DIGITAL_SIGNATURE", quantum_risk: "SAFE", purpose: "post-quantum signature" };
      return { algorithm: "SLH-DSA-128s", primitive: "DIGITAL_SIGNATURE", quantum_risk: "SAFE", purpose: "post-quantum signature" };
    }
    return { algorithm: "SPHINCS+", primitive: "DIGITAL_SIGNATURE", quantum_risk: "SAFE", purpose: "post-quantum signature" };
  }

  // FALCON / FN-DSA.
  if (n.includes("falcon") || n.includes("fndsa")) {
    if (n.includes("1024")) return { algorithm: "FALCON-1024", primitive: "DIGITAL_SIGNATURE", quantum_risk: "SAFE", purpose: "post-quantum signature" };
    return { algorithm: "FALCON-512", primitive: "DIGITAL_SIGNATURE", quantum_risk: "SAFE", purpose: "post-quantum signature" };
  }
  return null;
}

// ── Algorithm classification from a resolved algorithm string ──────────────────
export function classifyKeyType(raw: string): AlgoInfo | null {
  const pq = classifyPqc(raw); if (pq) return pq;
  const n = raw.toLowerCase();
  if (n === "rsa" || n.startsWith("rsa")) return { algorithm: "RSA-2048", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "RSA key generation" };
  if (n === "ec" || n === "ecdsa") return { algorithm: "ECDSA-P256", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "EC key generation" };
  if (n === "ed25519") return { algorithm: "Ed25519", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "EdDSA key generation" };
  if (n === "ed448") return { algorithm: "Ed448", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "EdDSA key generation" };
  if (n === "x25519") return { algorithm: "X25519", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "key agreement" };
  if (n === "x448") return { algorithm: "ECDH-X448", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "key agreement" };
  if (n === "dsa") return { algorithm: "DSA", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "DSA key generation" };
  if (n === "dh") return { algorithm: "DH", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "Diffie-Hellman" };
  return null;
}
export function classifyHash(raw: string): AlgoInfo | null {
  const n = raw.toLowerCase().replace(/[-_]/g, "");
  if (n.includes("md5")) return { algorithm: "MD5", primitive: "HASH", quantum_risk: "VULNERABLE", purpose: "content hashing" };
  if (n.includes("md4")) return { algorithm: "MD4", primitive: "HASH", quantum_risk: "VULNERABLE", purpose: "content hashing" };
  if (n.includes("ripemd")) return { algorithm: "RIPEMD-160", primitive: "HASH", quantum_risk: "VULNERABLE", purpose: "content hashing" };
  if (n === "sha1" || n.includes("sha1")) return { algorithm: "SHA-1", primitive: "HASH", quantum_risk: "VULNERABLE", purpose: "content hashing" };
  if (n.includes("sha3512")) return { algorithm: "SHA3-512", primitive: "HASH", quantum_risk: "PARTIAL", purpose: "content hashing" };
  if (n.includes("sha3384")) return { algorithm: "SHA3-384", primitive: "HASH", quantum_risk: "PARTIAL", purpose: "content hashing" };
  if (n.includes("sha3256") || n.includes("sha3")) return { algorithm: "SHA3-256", primitive: "HASH", quantum_risk: "PARTIAL", purpose: "content hashing" };
  if (n.includes("sha224")) return { algorithm: "SHA-224", primitive: "HASH", quantum_risk: "PARTIAL", purpose: "content hashing" };
  if (n.includes("sha256")) return { algorithm: "SHA-256", primitive: "HASH", quantum_risk: "PARTIAL", purpose: "content hashing" };
  if (n.includes("sha384")) return { algorithm: "SHA-384", primitive: "HASH", quantum_risk: "PARTIAL" };
  if (n.includes("sha512")) return { algorithm: "SHA-512", primitive: "HASH", quantum_risk: "PARTIAL" };
  return null;
}
export function classifySignAlg(raw: string): AlgoInfo | null {
  const pq = classifyPqc(raw); if (pq) return pq;
  const n = raw.toLowerCase();
  if (n.includes("rsa")) return { algorithm: "RSA-SHA", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "digital signature" };
  if (n.includes("ecdsa") || n.includes("ec-")) return { algorithm: "ECDSA-P256", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "digital signature" };
  if (n.includes("ed25519")) return { algorithm: "Ed25519", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "digital signature" };
  return null;
}
export function classifyCipher(raw: string): AlgoInfo | null {
  const n = raw.toLowerCase();
  if (n.includes("aes")) return { algorithm: "AES", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "PARTIAL", purpose: "symmetric encryption" };
  if (n.includes("3des") || n.includes("des-ede") || n.includes("tripledes")) return { algorithm: "3DES", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "VULNERABLE", purpose: "symmetric encryption" };
  if (n.includes("des")) return { algorithm: "DES", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "VULNERABLE", purpose: "symmetric encryption" };
  if (n.includes("rc4")) return { algorithm: "RC4", primitive: "STREAM_CIPHER", quantum_risk: "VULNERABLE", purpose: "stream cipher" };
  if (n.includes("rc2")) return { algorithm: "RC2", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "VULNERABLE", purpose: "symmetric encryption" };
  if (n.includes("blowfish") || n === "bf") return { algorithm: "Blowfish", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "VULNERABLE", purpose: "symmetric encryption" };
  if (n.includes("chacha")) return { algorithm: "ChaCha20", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "PARTIAL" };
  return null;
}
export function classifyKdf(raw: string): AlgoInfo | null {
  const n = raw.toLowerCase();
  if (n.includes("bcrypt")) return { algorithm: "bcrypt", primitive: "KEY_DERIVATION", quantum_risk: "PARTIAL", purpose: "password hashing" };
  if (n.includes("scrypt")) return { algorithm: "scrypt", primitive: "KEY_DERIVATION", quantum_risk: "PARTIAL", purpose: "password hashing" };
  if (n.includes("argon")) return { algorithm: "Argon2", primitive: "KEY_DERIVATION", quantum_risk: "PARTIAL", purpose: "password hashing" };
  if (n.includes("pbkdf2")) return { algorithm: "PBKDF2", primitive: "KEY_DERIVATION", quantum_risk: "PARTIAL", purpose: "key derivation" };
  if (n.includes("hkdf")) return { algorithm: "HKDF", primitive: "KEY_DERIVATION", quantum_risk: "PARTIAL", purpose: "key derivation" };
  return null;
}
export function classifyJwtAlg(raw: string): AlgoInfo | null {
  const pq = classifyPqc(raw); if (pq) return pq;
  const n = raw.toUpperCase();
  if (/^RS(256|384|512)$/.test(n) || /^PS(256|384|512)$/.test(n)) return { algorithm: "RSA-SHA", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "JWT RSA signature" };
  if (/^ES(256|384|512)$/.test(n)) return { algorithm: "ECDSA-P256", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "JWT ECDSA signature" };
  if (n === "EDDSA") return { algorithm: "Ed25519", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "JWT EdDSA signature" };
  if (/^HS(256|384|512)$/.test(n)) return { algorithm: "HMAC-SHA256", primitive: "MAC", quantum_risk: "PARTIAL", purpose: "JWT HMAC signature" };
  // JOSE key-management algorithms
  if (n.startsWith("RSA-OAEP") || n === "RSA1_5") return { algorithm: "RSA-OAEP", primitive: "PUBLIC_KEY_ENCRYPTION", quantum_risk: "VULNERABLE", purpose: "JWE key wrap" };
  if (n.startsWith("ECDH-ES")) return { algorithm: "ECDH", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "JWE key agreement" };
  return null;
}
// JOSE content-encryption (`enc`) values, e.g. A256GCM, A128CBC-HS256.
export function classifyJoseEnc(raw: string): AlgoInfo | null {
  const n = raw.toUpperCase();
  if (/^A(128|192|256)GCM$/.test(n) || /^A(128|192|256)CBC/.test(n)) return { algorithm: "AES", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "PARTIAL", purpose: "JWE content encryption" };
  return null;
}
// Named curve → concrete algorithm identity.
export function classifyCurve(raw: string): AlgoInfo | null {
  const n = raw.toLowerCase().replace(/[-_]/g, "");
  if (n === "p256" || n === "prime256v1" || n === "secp256r1") return { algorithm: "ECDSA-P256", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "elliptic curve" };
  if (n === "p384" || n === "secp384r1") return { algorithm: "ECDSA-P384", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "elliptic curve" };
  if (n === "p521" || n === "secp521r1") return { algorithm: "ECDSA-P521", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "elliptic curve" };
  // pyca/cryptography spells the NIST curves SECP256R1/SECP384R1/SECP521R1 and
  // also exposes the Brainpool and legacy SECT binary curves.
  if (n === "brainpoolp256r1") return { algorithm: "ECDSA-P256", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "brainpool curve" };
  if (n === "brainpoolp384r1") return { algorithm: "ECDSA-P384", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "brainpool curve" };
  if (n === "brainpoolp512r1") return { algorithm: "ECDSA-P521", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "brainpool curve" };
  if (n === "secp256k1") return { algorithm: "ECDSA-K256", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "elliptic curve secp256k1" };
  if (n === "ed25519") return { algorithm: "Ed25519", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "elliptic curve" };
  if (n === "curve25519" || n === "x25519") return { algorithm: "X25519", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "elliptic curve" };
  return null;
}
// WebCrypto algorithm `name` → identity (SubtleCrypto).
export function classifyWebCryptoName(raw: string): AlgoInfo | null {
  const pq = classifyPqc(raw); if (pq) return pq;
  const n = raw.toUpperCase();
  if (n === "RSASSA-PKCS1-V1_5") return { algorithm: "RSA-SHA", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "WebCrypto RSA signature" };
  if (n === "RSA-PSS") return { algorithm: "RSA-PSS", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "WebCrypto RSA-PSS signature" };
  if (n === "RSA-OAEP") return { algorithm: "RSA-OAEP", primitive: "PUBLIC_KEY_ENCRYPTION", quantum_risk: "VULNERABLE", purpose: "WebCrypto RSA encryption" };
  if (n === "ECDSA") return { algorithm: "ECDSA-P256", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "WebCrypto ECDSA signature" };
  if (n === "ECDH") return { algorithm: "ECDH", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "WebCrypto ECDH" };
  if (n === "ED25519") return { algorithm: "Ed25519", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "WebCrypto EdDSA signature" };
  if (n === "X25519") return { algorithm: "X25519", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "WebCrypto X25519" };
  if (n.startsWith("AES")) return { algorithm: "AES", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "PARTIAL", purpose: "WebCrypto AES" };
  if (n === "HMAC") return { algorithm: "HMAC-SHA256", primitive: "MAC", quantum_risk: "PARTIAL", purpose: "WebCrypto HMAC" };
  if (n === "PBKDF2") return { algorithm: "PBKDF2", primitive: "KEY_DERIVATION", quantum_risk: "PARTIAL", purpose: "WebCrypto PBKDF2" };
  if (n === "HKDF") return { algorithm: "HKDF", primitive: "KEY_DERIVATION", quantum_risk: "PARTIAL", purpose: "WebCrypto HKDF" };
  return null;
}
// crypto-js top-level algorithm token, e.g. CryptoJS.MD5 / CryptoJS.AES.encrypt.
// Canonical MAC name for a hash, e.g. SHA-256 -> HMAC-SHA256. The downstream
// normalizer recognizes the undashed form; emitting `HMAC-SHA-256` would split
// correlation into duplicate cases for the same primitive.
export function hmacName(h: AlgoInfo): AlgoInfo {
  return { ...h, algorithm: `HMAC-${h.algorithm.replace(/-/g, "")}`, primitive: "MAC", purpose: h.purpose ?? "HMAC" };
}
export function classifyCryptoJs(token: string): AlgoInfo | null {
  const n = token.toLowerCase();
  if (n.startsWith("hmac")) { const h = classifyHash(n.slice(4)); return h ? hmacName(h) : null; }
  if (n === "aes") return { algorithm: "AES", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "PARTIAL", purpose: "symmetric encryption" };
  if (n === "des") return { algorithm: "DES", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "VULNERABLE", purpose: "symmetric encryption" };
  if (n === "tripledes") return { algorithm: "3DES", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "VULNERABLE", purpose: "symmetric encryption" };
  if (n === "rc4" || n === "rc4drop") return { algorithm: "RC4", primitive: "STREAM_CIPHER", quantum_risk: "VULNERABLE", purpose: "stream cipher" };
  if (n === "rabbit") return { algorithm: "Rabbit", primitive: "STREAM_CIPHER", quantum_risk: "UNKNOWN", purpose: "stream cipher" };
  if (n === "pbkdf2") return { algorithm: "PBKDF2", primitive: "KEY_DERIVATION", quantum_risk: "PARTIAL", purpose: "key derivation" };
  return classifyHash(n);
}

/** Per-file outcome, so the caller can report true scan coverage. */
interface FileOutcome { detections: number; truncated: boolean }

