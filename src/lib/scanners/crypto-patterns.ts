// Cryptographic pattern detection — classifies findings as quantum-vulnerable,
// post-quantum, hybrid, or resilient.

export type QuantumClass =
  | "POST_QUANTUM"
  | "HYBRID"
  | "QUANTUM_RESILIENT"
  | "QUANTUM_VULNERABLE"
  | "QUANTUM_REDUCED_SECURITY"
  | "UNKNOWN";

export type PrimitiveType =
  | "DIGITAL_SIGNATURE"
  | "KEY_ESTABLISHMENT"
  | "PUBLIC_KEY_ENCRYPTION"
  | "SYMMETRIC_ENCRYPTION"
  | "HASH"
  | "KDF"
  | "MAC"
  | "OTHER";

export interface CryptoPattern {
  id: string;
  regex: RegExp;
  algorithm: string;
  family: string;
  primitiveType: PrimitiveType;
  quantumClass: QuantumClass;
  keySize?: number;
  notes?: string;
}

export const CRYPTO_PATTERNS: CryptoPattern[] = [
  // ── POST-QUANTUM ────────────────────────────────────────────────────────────

  // ML-KEM (CRYSTALS-Kyber) — NIST FIPS 203
  { id: "ml-kem-512",   regex: /\bML[-_]?KEM[-_]?512\b/i,   algorithm: "ML-KEM-512",   family: "ML-KEM",   primitiveType: "KEY_ESTABLISHMENT",    quantumClass: "POST_QUANTUM", notes: "NIST FIPS 203" },
  { id: "ml-kem-768",   regex: /\bML[-_]?KEM[-_]?768\b/i,   algorithm: "ML-KEM-768",   family: "ML-KEM",   primitiveType: "KEY_ESTABLISHMENT",    quantumClass: "POST_QUANTUM", notes: "NIST FIPS 203 — recommended" },
  { id: "ml-kem-1024",  regex: /\bML[-_]?KEM[-_]?1024\b/i,  algorithm: "ML-KEM-1024",  family: "ML-KEM",   primitiveType: "KEY_ESTABLISHMENT",    quantumClass: "POST_QUANTUM", notes: "NIST FIPS 203 — high security" },
  { id: "kyber512",     regex: /\bkyber[-_]?512\b/i,         algorithm: "Kyber-512",    family: "ML-KEM",   primitiveType: "KEY_ESTABLISHMENT",    quantumClass: "POST_QUANTUM", notes: "Pre-standardisation Kyber (→ ML-KEM)" },
  { id: "kyber768",     regex: /\bkyber[-_]?768\b/i,         algorithm: "Kyber-768",    family: "ML-KEM",   primitiveType: "KEY_ESTABLISHMENT",    quantumClass: "POST_QUANTUM", notes: "Pre-standardisation Kyber (→ ML-KEM)" },
  { id: "kyber1024",    regex: /\bkyber[-_]?1024\b/i,        algorithm: "Kyber-1024",   family: "ML-KEM",   primitiveType: "KEY_ESTABLISHMENT",    quantumClass: "POST_QUANTUM", notes: "Pre-standardisation Kyber (→ ML-KEM)" },
  { id: "kyber-generic",regex: /\bkyber\b/i,                 algorithm: "Kyber",        family: "ML-KEM",   primitiveType: "KEY_ESTABLISHMENT",    quantumClass: "POST_QUANTUM" },

  // ML-DSA (CRYSTALS-Dilithium) — NIST FIPS 204
  { id: "ml-dsa-44",    regex: /\bML[-_]?DSA[-_]?44\b/i,    algorithm: "ML-DSA-44",    family: "ML-DSA",   primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "POST_QUANTUM", notes: "NIST FIPS 204" },
  { id: "ml-dsa-65",    regex: /\bML[-_]?DSA[-_]?65\b/i,    algorithm: "ML-DSA-65",    family: "ML-DSA",   primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "POST_QUANTUM", notes: "NIST FIPS 204 — recommended" },
  { id: "ml-dsa-87",    regex: /\bML[-_]?DSA[-_]?87\b/i,    algorithm: "ML-DSA-87",    family: "ML-DSA",   primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "POST_QUANTUM", notes: "NIST FIPS 204 — high security" },
  { id: "dilithium2",   regex: /\bdilithium[-_]?2\b/i,       algorithm: "Dilithium2",   family: "ML-DSA",   primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "POST_QUANTUM", notes: "Pre-standardisation Dilithium (→ ML-DSA)" },
  { id: "dilithium3",   regex: /\bdilithium[-_]?3\b/i,       algorithm: "Dilithium3",   family: "ML-DSA",   primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "POST_QUANTUM", notes: "Pre-standardisation Dilithium (→ ML-DSA)" },
  { id: "dilithium5",   regex: /\bdilithium[-_]?5\b/i,       algorithm: "Dilithium5",   family: "ML-DSA",   primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "POST_QUANTUM", notes: "Pre-standardisation Dilithium (→ ML-DSA)" },
  { id: "dilithium",    regex: /\bdilithium\b/i,             algorithm: "Dilithium",    family: "ML-DSA",   primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "POST_QUANTUM" },

  // SLH-DSA (SPHINCS+) — NIST FIPS 205
  { id: "slh-dsa",      regex: /\bSLH[-_]?DSA\b/i,          algorithm: "SLH-DSA",      family: "SLH-DSA",  primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "POST_QUANTUM", notes: "NIST FIPS 205" },
  { id: "sphincs-plus", regex: /\bsphincs\+?[-_]?(sha2|shake|haraka)?/i, algorithm: "SPHINCS+", family: "SLH-DSA", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "POST_QUANTUM", notes: "Pre-standardisation (→ SLH-DSA)" },

  // FN-DSA (Falcon)
  { id: "fn-dsa-512",   regex: /\bFN[-_]?DSA[-_]?512\b/i,   algorithm: "FN-DSA-512",   family: "FN-DSA",   primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "POST_QUANTUM", notes: "Falcon-512 NIST candidate" },
  { id: "fn-dsa-1024",  regex: /\bFN[-_]?DSA[-_]?1024\b/i,  algorithm: "FN-DSA-1024",  family: "FN-DSA",   primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "POST_QUANTUM", notes: "Falcon-1024 NIST candidate" },
  { id: "falcon-512",   regex: /\bfalcon[-_]?512\b/i,        algorithm: "Falcon-512",   family: "FN-DSA",   primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "POST_QUANTUM" },
  { id: "falcon-1024",  regex: /\bfalcon[-_]?1024\b/i,       algorithm: "Falcon-1024",  family: "FN-DSA",   primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "POST_QUANTUM" },
  { id: "falcon",       regex: /\bfalcon\b/i,                algorithm: "Falcon",       family: "FN-DSA",   primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "POST_QUANTUM" },

  // Classic McEliece
  { id: "mceliece",     regex: /\b(classic[-_]?mceliece|mceliece)\b/i, algorithm: "Classic McEliece", family: "McEliece", primitiveType: "PUBLIC_KEY_ENCRYPTION", quantumClass: "POST_QUANTUM", notes: "Code-based KEM" },

  // HQC
  { id: "hqc",          regex: /\bHQC[-_]?\d*\b/i,          algorithm: "HQC",          family: "HQC",      primitiveType: "KEY_ESTABLISHMENT",    quantumClass: "POST_QUANTUM", notes: "Hamming Quasi-Cyclic — NIST alternate" },

  // BIKE
  { id: "bike",         regex: /\bBIKE[-_]?\d*\b/i,         algorithm: "BIKE",         family: "BIKE",     primitiveType: "KEY_ESTABLISHMENT",    quantumClass: "POST_QUANTUM", notes: "Bit Flipping KEM" },

  // liboqs / pqcrypto library imports
  { id: "liboqs",       regex: /\bliboqs\b/i,                algorithm: "liboqs",       family: "PQC-LIB",  primitiveType: "OTHER",                quantumClass: "POST_QUANTUM", notes: "Open Quantum Safe library" },
  { id: "pqcrypto",     regex: /\bpqcrypto\b/i,              algorithm: "pqcrypto",     family: "PQC-LIB",  primitiveType: "OTHER",                quantumClass: "POST_QUANTUM" },
  { id: "oqs",          regex: /\boqs[-_](kem|sig|rand)\b/i, algorithm: "OQS",          family: "PQC-LIB",  primitiveType: "OTHER",                quantumClass: "POST_QUANTUM" },
  { id: "botan-pqc",    regex: /Botan::(Kyber|Dilithium|SPHINCS_Plus|FrodoKEM)/i, algorithm: "Botan-PQC", family: "PQC-LIB", primitiveType: "OTHER", quantumClass: "POST_QUANTUM" },

  // ── HYBRID (classical + PQC combined) ────────────────────────────────────────
  { id: "x25519-mlkem", regex: /X25519\+ML[-_]?KEM/i,        algorithm: "X25519+ML-KEM-768", family: "Hybrid", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "HYBRID", notes: "Recommended hybrid TLS" },
  { id: "p256-kyber",   regex: /P[-_]?256\+[Kk]yber/i,       algorithm: "P256+Kyber",   family: "Hybrid",   primitiveType: "KEY_ESTABLISHMENT",    quantumClass: "HYBRID" },
  { id: "hybrid-tls",   regex: /tlsext_kyber|x25519kyber|SecP256r1Kyber768/i, algorithm: "Hybrid-TLS", family: "Hybrid", primitiveType: "KEY_ESTABLISHMENT", quantumClass: "HYBRID" },

  // ── QUANTUM-RESILIENT (symmetric — safe against Grover with 256-bit keys) ────
  { id: "aes-256",      regex: /\bAES[-_]256\b/i,            algorithm: "AES-256",      family: "AES",      primitiveType: "SYMMETRIC_ENCRYPTION", quantumClass: "QUANTUM_RESILIENT" },
  { id: "aes-256-gcm",  regex: /\bAES[-_]256[-_]GCM\b/i,    algorithm: "AES-256-GCM",  family: "AES",      primitiveType: "SYMMETRIC_ENCRYPTION", quantumClass: "QUANTUM_RESILIENT" },
  { id: "aes-256-cbc",  regex: /\bAES[-_]256[-_]CBC\b/i,    algorithm: "AES-256-CBC",  family: "AES",      primitiveType: "SYMMETRIC_ENCRYPTION", quantumClass: "QUANTUM_RESILIENT" },
  { id: "chacha20",     regex: /\bChaCha20[-_]Poly1305\b/i,  algorithm: "ChaCha20-Poly1305", family: "ChaCha", primitiveType: "SYMMETRIC_ENCRYPTION", quantumClass: "QUANTUM_RESILIENT" },
  { id: "sha384",       regex: /\bSHA[-_]?384\b/i,           algorithm: "SHA-384",      family: "SHA-2",    primitiveType: "HASH",                 quantumClass: "QUANTUM_RESILIENT" },
  { id: "sha512",       regex: /\bSHA[-_]?512\b/i,           algorithm: "SHA-512",      family: "SHA-2",    primitiveType: "HASH",                 quantumClass: "QUANTUM_RESILIENT" },
  { id: "sha3",         regex: /\bSHA[-_]?3[-_]?(224|256|384|512)\b/i, algorithm: "SHA-3", family: "SHA-3", primitiveType: "HASH",                quantumClass: "QUANTUM_RESILIENT" },

  // ── REDUCED SECURITY (symmetric with short keys — still broken, just slower) ─
  { id: "aes-128",      regex: /\bAES[-_]128\b/i,            algorithm: "AES-128",      family: "AES",      primitiveType: "SYMMETRIC_ENCRYPTION", quantumClass: "QUANTUM_REDUCED_SECURITY", notes: "Grover halves effective key length to 64-bit" },
  { id: "sha256",       regex: /\bSHA[-_]?256\b/i,           algorithm: "SHA-256",      family: "SHA-2",    primitiveType: "HASH",                 quantumClass: "QUANTUM_REDUCED_SECURITY", notes: "128-bit post-quantum security" },

  // ── QUANTUM-VULNERABLE ────────────────────────────────────────────────────────
  { id: "rsa-1024",     regex: /\bRSA[-_]?1024\b/i,          algorithm: "RSA-1024",     family: "RSA",      primitiveType: "PUBLIC_KEY_ENCRYPTION", quantumClass: "QUANTUM_VULNERABLE", keySize: 1024 },
  { id: "rsa-2048",     regex: /\bRSA[-_]?2048\b/i,          algorithm: "RSA-2048",     family: "RSA",      primitiveType: "PUBLIC_KEY_ENCRYPTION", quantumClass: "QUANTUM_VULNERABLE", keySize: 2048 },
  { id: "rsa-3072",     regex: /\bRSA[-_]?3072\b/i,          algorithm: "RSA-3072",     family: "RSA",      primitiveType: "PUBLIC_KEY_ENCRYPTION", quantumClass: "QUANTUM_VULNERABLE", keySize: 3072 },
  { id: "rsa-4096",     regex: /\bRSA[-_]?4096\b/i,          algorithm: "RSA-4096",     family: "RSA",      primitiveType: "PUBLIC_KEY_ENCRYPTION", quantumClass: "QUANTUM_VULNERABLE", keySize: 4096 },
  { id: "rsa-generic",  regex: /\bRSA\b(?![-_]?(KEM|OAEP[-_]SHA(?:256|384|512)))/i, algorithm: "RSA", family: "RSA", primitiveType: "PUBLIC_KEY_ENCRYPTION", quantumClass: "QUANTUM_VULNERABLE" },
  { id: "ecdsa-p256",   regex: /\bECDSA[-_]?P[-_]?256\b/i,  algorithm: "ECDSA-P256",   family: "ECDSA",    primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "QUANTUM_VULNERABLE" },
  { id: "ecdsa-p384",   regex: /\bECDSA[-_]?P[-_]?384\b/i,  algorithm: "ECDSA-P384",   family: "ECDSA",    primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "QUANTUM_VULNERABLE" },
  { id: "ecdsa-p521",   regex: /\bECDSA[-_]?P[-_]?521\b/i,  algorithm: "ECDSA-P521",   family: "ECDSA",    primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "QUANTUM_VULNERABLE" },
  { id: "ecdsa",        regex: /\bECDSA\b/i,                 algorithm: "ECDSA",        family: "ECDSA",    primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "QUANTUM_VULNERABLE" },
  { id: "ecdh-p256",    regex: /\bECDH[-_]?P[-_]?256\b/i,   algorithm: "ECDH-P256",    family: "ECDH",     primitiveType: "KEY_ESTABLISHMENT",    quantumClass: "QUANTUM_VULNERABLE" },
  { id: "ecdh",         regex: /\bECDH\b/i,                  algorithm: "ECDH",         family: "ECDH",     primitiveType: "KEY_ESTABLISHMENT",    quantumClass: "QUANTUM_VULNERABLE" },
  { id: "x25519",       regex: /\bX25519\b(?!\+)/i,          algorithm: "X25519",       family: "ECDH",     primitiveType: "KEY_ESTABLISHMENT",    quantumClass: "QUANTUM_VULNERABLE", notes: "Classical-only (not hybrid)" },
  { id: "ed25519",      regex: /\bEd25519\b/i,               algorithm: "Ed25519",      family: "EdDSA",    primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "QUANTUM_VULNERABLE" },
  { id: "ed448",        regex: /\bEd448\b/i,                 algorithm: "Ed448",        family: "EdDSA",    primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "QUANTUM_VULNERABLE" },
  { id: "dsa",          regex: /\bDSA\b(?![-_](44|65|87))/i, algorithm: "DSA",         family: "DSA",      primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "QUANTUM_VULNERABLE" },
  { id: "dh-generic",   regex: /\b(DHE?|DiffieHellman)\b/i,  algorithm: "DH",          family: "DH",       primitiveType: "KEY_ESTABLISHMENT",    quantumClass: "QUANTUM_VULNERABLE" },
  { id: "es256",        regex: /\bES256\b/,                   algorithm: "ES256 (JWT)",  family: "ECDSA",    primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "QUANTUM_VULNERABLE", notes: "JWT algorithm" },
  { id: "rs256",        regex: /\bRS256\b/,                   algorithm: "RS256 (JWT)",  family: "RSA",      primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "QUANTUM_VULNERABLE", notes: "JWT algorithm" },
  { id: "ps256",        regex: /\bPS256\b/,                   algorithm: "PS256 (JWT)",  family: "RSA",      primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "QUANTUM_VULNERABLE", notes: "JWT algorithm — RSA-PSS" },
  { id: "ssh-rsa",      regex: /\bssh[-_]rsa\b/i,            algorithm: "ssh-rsa",      family: "RSA",      primitiveType: "DIGITAL_SIGNATURE",    quantumClass: "QUANTUM_VULNERABLE", notes: "SSH host/user key" },
  { id: "ecdsa-sha2",   regex: /\becdsa-sha2-nistp(256|384|521)\b/i, algorithm: "ecdsa-sha2", family: "ECDSA", primitiveType: "DIGITAL_SIGNATURE", quantumClass: "QUANTUM_VULNERABLE", notes: "SSH key type" },
];

// File extensions to scan (skip binaries, media, etc.)
export const SCANNABLE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".java", ".kt", ".cs", ".cpp", ".c", ".h",
  ".rs", ".swift", ".php", ".scala", ".clj",
  ".yaml", ".yml", ".json", ".toml", ".env", ".ini", ".cfg", ".conf",
  ".sh", ".bash", ".zsh", ".ps1", ".dockerfile",
  ".tf", ".hcl",
  ".pem", ".crt", ".cer", ".key", ".p12", ".pfx",
  ".md", ".txt",
]);

// Directories to always skip
export const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out",
  ".turbo", ".cache", "coverage", "__pycache__", ".venv", "venv",
  "target", "vendor", "deps", ".yarn",
]);
