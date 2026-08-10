/**
 * Canonical algorithm registry.
 * Maps raw scanner strings → canonical SENQOR algorithm names.
 * Never use raw scanner strings as the core data model.
 */

import type { PrimitiveType, QuantumClass } from "../types/observation";

export interface CanonicalAlgorithm {
  /** Canonical display name, e.g. "RSA-2048" */
  name: string;
  family: string;
  primitiveType: PrimitiveType;
  quantumClass: QuantumClass;
  keySize?: number;
  curve?: string;
  parameterSet?: string;
  /** NIST/IANA/RFC references */
  references?: string[];
  /** Deprecated in favour of a replacement */
  supersededBy?: string;
}

// ── Canonical algorithm database ──────────────────────────────────────────────

const ALGORITHMS: CanonicalAlgorithm[] = [
  // RSA
  { name: "RSA-1024", family: "RSA", primitiveType: "PUBLIC_KEY_ENCRYPTION", quantumClass: "QUANTUM_VULNERABLE", keySize: 1024, supersededBy: "RSA-2048" },
  { name: "RSA-2048", family: "RSA", primitiveType: "PUBLIC_KEY_ENCRYPTION", quantumClass: "QUANTUM_VULNERABLE", keySize: 2048 },
  { name: "RSA-3072", family: "RSA", primitiveType: "PUBLIC_KEY_ENCRYPTION", quantumClass: "QUANTUM_VULNERABLE", keySize: 3072 },
  { name: "RSA-4096", family: "RSA", primitiveType: "PUBLIC_KEY_ENCRYPTION", quantumClass: "QUANTUM_VULNERABLE", keySize: 4096 },
  { name: "RSA-8192", family: "RSA", primitiveType: "PUBLIC_KEY_ENCRYPTION", quantumClass: "QUANTUM_VULNERABLE", keySize: 8192 },

  // ECDSA
  { name: "ECDSA-P256", family: "ECDSA", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "QUANTUM_VULNERABLE", keySize: 256, curve: "P-256" },
  { name: "ECDSA-P384", family: "ECDSA", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "QUANTUM_VULNERABLE", keySize: 384, curve: "P-384" },
  { name: "ECDSA-P521", family: "ECDSA", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "QUANTUM_VULNERABLE", keySize: 521, curve: "P-521" },
  { name: "ECDSA-K256", family: "ECDSA", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "QUANTUM_VULNERABLE", keySize: 256, curve: "secp256k1" },

  // ECDH / ECDHE
  { name: "ECDH-P256",  family: "ECDH", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "QUANTUM_VULNERABLE", keySize: 256, curve: "P-256" },
  { name: "ECDH-P384",  family: "ECDH", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "QUANTUM_VULNERABLE", keySize: 384, curve: "P-384" },
  { name: "ECDH-P521",  family: "ECDH", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "QUANTUM_VULNERABLE", keySize: 521, curve: "P-521" },
  { name: "ECDH-X25519",family: "ECDH", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "QUANTUM_VULNERABLE", curve: "X25519" },
  { name: "ECDH-X448",  family: "ECDH", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "QUANTUM_VULNERABLE", curve: "X448" },

  // EdDSA
  { name: "Ed25519", family: "EdDSA", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "QUANTUM_VULNERABLE", curve: "Ed25519" },
  { name: "Ed448",   family: "EdDSA", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "QUANTUM_VULNERABLE", curve: "Ed448" },

  // Diffie-Hellman
  { name: "DH-1024", family: "DH", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "QUANTUM_VULNERABLE", keySize: 1024, supersededBy: "DH-2048" },
  { name: "DH-2048", family: "DH", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "QUANTUM_VULNERABLE", keySize: 2048 },
  { name: "DH-3072", family: "DH", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "QUANTUM_VULNERABLE", keySize: 3072 },
  { name: "DH-4096", family: "DH", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "QUANTUM_VULNERABLE", keySize: 4096 },
  { name: "FFDHE-2048", family: "FFDHE", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "QUANTUM_VULNERABLE", keySize: 2048 },
  { name: "FFDHE-3072", family: "FFDHE", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "QUANTUM_VULNERABLE", keySize: 3072 },
  { name: "FFDHE-4096", family: "FFDHE", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "QUANTUM_VULNERABLE", keySize: 4096 },

  // AES — symmetric: Grover halves effective key length
  { name: "AES-128", family: "AES", primitiveType: "SYMMETRIC_ENCRYPTION", quantumClass: "QUANTUM_REDUCED_SECURITY", keySize: 128 },
  { name: "AES-192", family: "AES", primitiveType: "SYMMETRIC_ENCRYPTION", quantumClass: "QUANTUM_RESILIENT",       keySize: 192 },
  { name: "AES-256", family: "AES", primitiveType: "SYMMETRIC_ENCRYPTION", quantumClass: "QUANTUM_RESILIENT",       keySize: 256 },

  // Legacy symmetric
  { name: "3DES",    family: "DES",  primitiveType: "SYMMETRIC_ENCRYPTION", quantumClass: "QUANTUM_VULNERABLE", keySize: 112, supersededBy: "AES-256" },
  { name: "DES",     family: "DES",  primitiveType: "SYMMETRIC_ENCRYPTION", quantumClass: "QUANTUM_VULNERABLE", keySize: 56,  supersededBy: "AES-256" },
  { name: "RC4",     family: "RC4",  primitiveType: "SYMMETRIC_ENCRYPTION", quantumClass: "QUANTUM_VULNERABLE", supersededBy: "AES-256" },
  { name: "RC2",     family: "RC2",  primitiveType: "SYMMETRIC_ENCRYPTION", quantumClass: "QUANTUM_VULNERABLE", supersededBy: "AES-256" },
  { name: "Blowfish",family: "Blowfish", primitiveType: "SYMMETRIC_ENCRYPTION", quantumClass: "QUANTUM_REDUCED_SECURITY" },
  { name: "ChaCha20",family: "ChaCha20", primitiveType: "SYMMETRIC_ENCRYPTION", quantumClass: "QUANTUM_RESILIENT", keySize: 256 },

  // Hash functions — Grover reduces collision search
  { name: "MD5",    family: "MD",  primitiveType: "HASH", quantumClass: "QUANTUM_VULNERABLE",       supersededBy: "SHA-256" },
  { name: "SHA-1",  family: "SHA", primitiveType: "HASH", quantumClass: "QUANTUM_VULNERABLE",       supersededBy: "SHA-256" },
  { name: "SHA-224",family: "SHA", primitiveType: "HASH", quantumClass: "QUANTUM_REDUCED_SECURITY"  },
  { name: "SHA-256",family: "SHA", primitiveType: "HASH", quantumClass: "QUANTUM_RESILIENT"          },
  { name: "SHA-384",family: "SHA", primitiveType: "HASH", quantumClass: "QUANTUM_RESILIENT"          },
  { name: "SHA-512",family: "SHA", primitiveType: "HASH", quantumClass: "QUANTUM_RESILIENT"          },
  { name: "SHA3-256",family:"SHA3", primitiveType: "HASH", quantumClass: "QUANTUM_RESILIENT"         },
  { name: "SHA3-384",family:"SHA3", primitiveType: "HASH", quantumClass: "QUANTUM_RESILIENT"         },
  { name: "SHA3-512",family:"SHA3", primitiveType: "HASH", quantumClass: "QUANTUM_RESILIENT"         },
  { name: "BLAKE2b", family:"BLAKE", primitiveType: "HASH", quantumClass: "QUANTUM_RESILIENT"        },
  { name: "BLAKE3",  family:"BLAKE", primitiveType: "HASH", quantumClass: "QUANTUM_RESILIENT"        },

  // MAC
  { name: "HMAC-MD5",   family: "HMAC", primitiveType: "MAC", quantumClass: "QUANTUM_VULNERABLE",       supersededBy: "HMAC-SHA256" },
  { name: "HMAC-SHA1",  family: "HMAC", primitiveType: "MAC", quantumClass: "QUANTUM_VULNERABLE",       supersededBy: "HMAC-SHA256" },
  { name: "HMAC-SHA256",family: "HMAC", primitiveType: "MAC", quantumClass: "QUANTUM_RESILIENT"          },
  { name: "HMAC-SHA384",family: "HMAC", primitiveType: "MAC", quantumClass: "QUANTUM_RESILIENT"          },
  { name: "HMAC-SHA512",family: "HMAC", primitiveType: "MAC", quantumClass: "QUANTUM_RESILIENT"          },
  { name: "Poly1305",   family: "Poly1305", primitiveType: "MAC", quantumClass: "QUANTUM_RESILIENT"      },
  { name: "AES-GCM",    family: "AES",  primitiveType: "MAC", quantumClass: "QUANTUM_RESILIENT", keySize: 256 },
  { name: "AES-CCM",    family: "AES",  primitiveType: "MAC", quantumClass: "QUANTUM_RESILIENT"          },

  // PQC — NIST FIPS 203/204/205
  { name: "ML-KEM-512",    family: "ML-KEM",    primitiveType: "KEY_ESTABLISHMENT", quantumClass: "POST_QUANTUM", parameterSet: "ML-KEM-512",    references: ["NIST FIPS 203"] },
  { name: "ML-KEM-768",    family: "ML-KEM",    primitiveType: "KEY_ESTABLISHMENT", quantumClass: "POST_QUANTUM", parameterSet: "ML-KEM-768",    references: ["NIST FIPS 203"] },
  { name: "ML-KEM-1024",   family: "ML-KEM",    primitiveType: "KEY_ESTABLISHMENT", quantumClass: "POST_QUANTUM", parameterSet: "ML-KEM-1024",   references: ["NIST FIPS 203"] },
  { name: "ML-DSA-44",     family: "ML-DSA",    primitiveType: "DIGITAL_SIGNATURE", quantumClass: "POST_QUANTUM", parameterSet: "ML-DSA-44",     references: ["NIST FIPS 204"] },
  { name: "ML-DSA-65",     family: "ML-DSA",    primitiveType: "DIGITAL_SIGNATURE", quantumClass: "POST_QUANTUM", parameterSet: "ML-DSA-65",     references: ["NIST FIPS 204"] },
  { name: "ML-DSA-87",     family: "ML-DSA",    primitiveType: "DIGITAL_SIGNATURE", quantumClass: "POST_QUANTUM", parameterSet: "ML-DSA-87",     references: ["NIST FIPS 204"] },
  { name: "SLH-DSA-128s",  family: "SLH-DSA",   primitiveType: "DIGITAL_SIGNATURE", quantumClass: "POST_QUANTUM", parameterSet: "SLH-DSA-128s",  references: ["NIST FIPS 205"] },
  { name: "SLH-DSA-128f",  family: "SLH-DSA",   primitiveType: "DIGITAL_SIGNATURE", quantumClass: "POST_QUANTUM", parameterSet: "SLH-DSA-128f",  references: ["NIST FIPS 205"] },
  { name: "SLH-DSA-192s",  family: "SLH-DSA",   primitiveType: "DIGITAL_SIGNATURE", quantumClass: "POST_QUANTUM", parameterSet: "SLH-DSA-192s",  references: ["NIST FIPS 205"] },
  { name: "SLH-DSA-256s",  family: "SLH-DSA",   primitiveType: "DIGITAL_SIGNATURE", quantumClass: "POST_QUANTUM", parameterSet: "SLH-DSA-256s",  references: ["NIST FIPS 205"] },

  // PQC — pre-standardisation names (still common in scanner output)
  { name: "CRYSTALS-Kyber-512",  family: "CRYSTALS-Kyber", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "POST_QUANTUM", parameterSet: "kyber512",  supersededBy: "ML-KEM-512" },
  { name: "CRYSTALS-Kyber-768",  family: "CRYSTALS-Kyber", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "POST_QUANTUM", parameterSet: "kyber768",  supersededBy: "ML-KEM-768" },
  { name: "CRYSTALS-Kyber-1024", family: "CRYSTALS-Kyber", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "POST_QUANTUM", parameterSet: "kyber1024", supersededBy: "ML-KEM-1024" },
  { name: "CRYSTALS-Dilithium2", family: "CRYSTALS-Dilithium", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "POST_QUANTUM", parameterSet: "dilithium2", supersededBy: "ML-DSA-44" },
  { name: "CRYSTALS-Dilithium3", family: "CRYSTALS-Dilithium", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "POST_QUANTUM", parameterSet: "dilithium3", supersededBy: "ML-DSA-65" },
  { name: "CRYSTALS-Dilithium5", family: "CRYSTALS-Dilithium", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "POST_QUANTUM", parameterSet: "dilithium5", supersededBy: "ML-DSA-87" },
  { name: "SPHINCS+", family: "SPHINCS+", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "POST_QUANTUM" },
  { name: "FALCON-512",  family: "FALCON", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "POST_QUANTUM", parameterSet: "falcon512" },
  { name: "FALCON-1024", family: "FALCON", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "POST_QUANTUM", parameterSet: "falcon1024" },

  // Hybrid KEM (PQC + classical)
  { name: "X25519-MLKEM768",   family: "Hybrid-KEM", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "HYBRID" },
  { name: "P256-MLKEM768",     family: "Hybrid-KEM", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "HYBRID" },

  // KDF
  { name: "HKDF",   family: "HKDF",   primitiveType: "KDF", quantumClass: "QUANTUM_RESILIENT" },
  { name: "PBKDF2", family: "PBKDF2", primitiveType: "KDF", quantumClass: "QUANTUM_RESILIENT" },
  { name: "scrypt", family: "scrypt", primitiveType: "PASSWORD_HASHING", quantumClass: "QUANTUM_RESILIENT" },
  { name: "bcrypt", family: "bcrypt", primitiveType: "PASSWORD_HASHING", quantumClass: "QUANTUM_RESILIENT" },
  { name: "Argon2", family: "Argon2", primitiveType: "PASSWORD_HASHING", quantumClass: "QUANTUM_RESILIENT" },
];

// ── Lookup tables ──────────────────────────────────────────────────────────────

const byCanonicalName = new Map<string, CanonicalAlgorithm>(
  ALGORITHMS.map(a => [a.name.toLowerCase(), a])
);

// Raw string → canonical name aliases (scanner-specific strings)
const RAW_ALIASES: Record<string, string> = {
  // RSA variants
  "rsa":             "RSA-2048",  // generic fallback when no key size given
  "rsa2048":         "RSA-2048",
  "rsa_2048":        "RSA-2048",
  "rsa 2048":        "RSA-2048",
  "rsa4096":         "RSA-4096",
  "rsa-pkcs1":       "RSA-2048",
  "rsa_oaep":        "RSA-2048",
  "rsassa-pkcs1-v1_5": "RSA-2048",
  "rsassa-pss":      "RSA-2048",

  // ECDSA
  "ecdsa":           "ECDSA-P256",
  "ecdsa-with-sha256": "ECDSA-P256",
  "ecdsa-with-sha384": "ECDSA-P384",
  "ecdsa-with-sha512": "ECDSA-P521",
  "es256":           "ECDSA-P256",
  "es384":           "ECDSA-P384",
  "es512":           "ECDSA-P521",

  // ECDH
  "ecdh":            "ECDH-P256",
  "ecdhe":           "ECDH-P256",
  "ecdh-p256":       "ECDH-P256",
  "ecdhe-rsa":       "ECDH-P256",
  "ecdhe-ecdsa":     "ECDH-P256",
  "x25519":          "ECDH-X25519",
  "ecdh-x25519":     "ECDH-X25519",
  "curve25519":      "ECDH-X25519",

  // EdDSA
  "ed25519":         "Ed25519",
  "eddsa":           "Ed25519",

  // DH
  "dh":              "DH-2048",
  "dhe":             "DH-2048",
  "dhe-rsa":         "DH-2048",

  // AES
  "aes":             "AES-256",
  "aes128":          "AES-128",
  "aes-128":         "AES-128",
  "aes-128-cbc":     "AES-128",
  "aes-128-gcm":     "AES-128",
  "aes256":          "AES-256",
  "aes-256":         "AES-256",
  "aes-256-cbc":     "AES-256",
  "aes-256-gcm":     "AES-256",
  "aes-256-ctr":     "AES-256",
  "aes_256_cbc":     "AES-256",
  "aes_256_gcm":     "AES-256",

  // Legacy
  "3des":            "3DES",
  "triple-des":      "3DES",
  "des-ede3-cbc":    "3DES",
  "des-ede3":        "3DES",
  "des":             "DES",
  "rc4":             "RC4",
  "rc4-128":         "RC4",
  "arcfour":         "RC4",
  "chacha20":        "ChaCha20",
  "chacha20-poly1305": "ChaCha20",

  // Hash
  "md5":             "MD5",
  "sha1":            "SHA-1",
  "sha-1":           "SHA-1",
  "sha256":          "SHA-256",
  "sha-256":         "SHA-256",
  "sha384":          "SHA-384",
  "sha-384":         "SHA-384",
  "sha512":          "SHA-512",
  "sha-512":         "SHA-512",
  "sha3-256":        "SHA3-256",
  "sha3-384":        "SHA3-384",
  "sha3-512":        "SHA3-512",
  "blake2b":         "BLAKE2b",
  "blake2b-256":     "BLAKE2b",
  "blake2b-512":     "BLAKE2b",
  "blake3":          "BLAKE3",

  // MAC
  "hmac-md5":        "HMAC-MD5",
  "hmac-sha1":       "HMAC-SHA1",
  "hmac-sha2-256":   "HMAC-SHA256",
  "hmac-sha256":     "HMAC-SHA256",
  "hmac-sha2-384":   "HMAC-SHA384",
  "hmac-sha384":     "HMAC-SHA384",
  "hmac-sha2-512":   "HMAC-SHA512",
  "hmac-sha512":     "HMAC-SHA512",
  "poly1305":        "Poly1305",

  // PQC (pre-standard names from scanners)
  "kyber":           "CRYSTALS-Kyber-768",
  "kyber512":        "CRYSTALS-Kyber-512",
  "kyber768":        "CRYSTALS-Kyber-768",
  "kyber1024":       "CRYSTALS-Kyber-1024",
  "crystals-kyber":  "CRYSTALS-Kyber-768",
  "dilithium":       "CRYSTALS-Dilithium3",
  "dilithium2":      "CRYSTALS-Dilithium2",
  "dilithium3":      "CRYSTALS-Dilithium3",
  "dilithium5":      "CRYSTALS-Dilithium5",
  "crystals-dilithium": "CRYSTALS-Dilithium3",
  "falcon":          "FALCON-512",
  "falcon512":       "FALCON-512",
  "falcon-512":      "FALCON-512",
  "falcon1024":      "FALCON-1024",
  "sphincs+":        "SPHINCS+",
  "sphincsplus":     "SPHINCS+",
  "sphincs-plus":    "SPHINCS+",
  "ml-kem":          "ML-KEM-768",
  "ml-kem-512":      "ML-KEM-512",
  "ml-kem-768":      "ML-KEM-768",
  "ml-kem-1024":     "ML-KEM-1024",
  "ml-dsa":          "ML-DSA-65",
  "ml-dsa-44":       "ML-DSA-44",
  "ml-dsa-65":       "ML-DSA-65",
  "ml-dsa-87":       "ML-DSA-87",

  // KDF
  "hkdf":            "HKDF",
  "pbkdf2":          "PBKDF2",
  "scrypt":          "scrypt",
  "bcrypt":          "bcrypt",
  "argon2":          "Argon2",
  "argon2id":        "Argon2",
  "argon2d":         "Argon2",
  "argon2i":         "Argon2",
};

export function lookupAlgorithm(raw: string): CanonicalAlgorithm | undefined {
  const key = raw.toLowerCase().trim();
  // Direct canonical lookup
  const direct = byCanonicalName.get(key);
  if (direct) return direct;
  // Alias lookup
  const alias = RAW_ALIASES[key];
  if (alias) return byCanonicalName.get(alias.toLowerCase());
  // Attempt partial key-size extraction: e.g. "RSA 4096-bit"
  const rsaMatch = key.match(/rsa[^0-9]*([0-9]{4})/);
  if (rsaMatch) return byCanonicalName.get(`rsa-${rsaMatch[1]}`);
  return undefined;
}

export function allAlgorithms(): CanonicalAlgorithm[] {
  return [...ALGORITHMS];
}
