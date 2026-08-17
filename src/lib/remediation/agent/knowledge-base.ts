// Post-quantum cryptography knowledge base.
//
// Central, updatable mapping from a classical/weak algorithm to standards-based
// guidance. This is REFERENCE data supplied to the AI stages — it does not by
// itself decide a fix; the Investigator/Planner reason over it in context, and the
// scanners decide whether a change worked. NIST identifiers only; no invented PQC.

export interface CryptoKnowledgeEntry {
  algorithm: string;
  quantumThreat: "SHOR" | "GROVER" | "NONE" | "UNKNOWN";
  classification: "VULNERABLE" | "WEAKENED" | "RESILIENT" | "RELEVANT" | "UNKNOWN";
  pqcAlternatives: string[];   // NIST-standardised replacements
  hybridAlternatives: string[];// classical+PQC hybrids where appropriate
  standards: string[];
  note: string;
  /**
   * Spellings a scanner or a generated patch may use for this algorithm.
   * The strategy policy derives its prohibited-target matching from these, so a
   * banned primitive cannot slip through under an alternative name.
   */
  aliases?: string[];
}

export const KNOWLEDGE_BASE: Record<string, CryptoKnowledgeEntry> = {
  "RSA": {
    algorithm: "RSA", quantumThreat: "SHOR", classification: "VULNERABLE",
    pqcAlternatives: ["ML-KEM-768 (FIPS 203) for key establishment", "ML-DSA-65 (FIPS 204) for signatures"],
    hybridAlternatives: ["X25519+ML-KEM-768 hybrid KEM", "RSA/ECDSA + ML-DSA hybrid signatures during migration"],
    standards: ["FIPS 203", "FIPS 204"],
    note: "RSA is broken by Shor's algorithm. The correct replacement depends on purpose: signatures → ML-DSA; key transport/agreement → ML-KEM.",
    aliases: ["rsa", "rsassa", "rsa-oaep", "rsa-pss", "withrsa"],
  },
  "ECDSA": {
    algorithm: "ECDSA", quantumThreat: "SHOR", classification: "VULNERABLE",
    pqcAlternatives: ["ML-DSA-65 (FIPS 204)", "SLH-DSA (FIPS 205) for hash-based signatures"],
    hybridAlternatives: ["ECDSA + ML-DSA hybrid signatures"],
    standards: ["FIPS 204", "FIPS 205"],
    note: "Elliptic-curve signatures are broken by Shor's algorithm.",
    aliases: ["ecdsa", "withecdsa", "secp256r1", "secp384r1", "secp521r1", "secp256k1", "prime256v1"],
  },
  "ECDH": {
    algorithm: "ECDH", quantumThreat: "SHOR", classification: "VULNERABLE",
    pqcAlternatives: ["ML-KEM-768 (FIPS 203)"],
    hybridAlternatives: ["X25519+ML-KEM-768 hybrid"],
    standards: ["FIPS 203"],
    note: "Elliptic-curve key agreement is broken by Shor's algorithm.",
    aliases: ["ecdh", "ecdhe"],
  },
  "DH": {
    algorithm: "DH", quantumThreat: "SHOR", classification: "VULNERABLE",
    pqcAlternatives: ["ML-KEM-768 (FIPS 203)"],
    hybridAlternatives: ["classical DH + ML-KEM hybrid"],
    standards: ["FIPS 203"],
    note: "Finite-field Diffie-Hellman is broken by Shor's algorithm.",
    aliases: ["diffie-hellman", "dhe", "ffdhe"],
  },
  "MD5": {
    algorithm: "MD5", quantumThreat: "NONE", classification: "VULNERABLE",
    pqcAlternatives: ["SHA-256", "SHA-3-256"],
    hybridAlternatives: [],
    standards: ["FIPS 180-4", "FIPS 202"],
    note: "MD5 is classically broken (collisions). Use SHA-256 for integrity; bcrypt/Argon2 for passwords. Not a quantum issue.",
    aliases: ["md5", "md4"],
  },
  "SHA-1": {
    algorithm: "SHA-1", quantumThreat: "NONE", classification: "VULNERABLE",
    pqcAlternatives: ["SHA-256", "SHA-3-256"],
    hybridAlternatives: [],
    standards: ["FIPS 180-4"],
    note: "SHA-1 is classically broken for collision resistance.",
    aliases: ["sha-1", "sha1", "withsha1"],
  },
  "SHA-256": {
    algorithm: "SHA-256", quantumThreat: "GROVER", classification: "WEAKENED",
    pqcAlternatives: ["SHA-256 remains acceptable; SHA-3-256/SHAKE-256 for long-term margin"],
    hybridAlternatives: [],
    standards: ["FIPS 180-4", "FIPS 202"],
    note: "Grover only halves preimage strength; SHA-256 is acceptable today. Flag for planning, not urgent replacement.",
  },

  // ── Elliptic-curve primitives ────────────────────────────────────────────
  // These are the entries whose absence allowed an RSA case to be "remediated"
  // with Ed25519. They are classically strong but broken by Shor exactly as RSA
  // is, so they can never be the target of a quantum remediation.
  "ED25519": {
    algorithm: "Ed25519", quantumThreat: "SHOR", classification: "VULNERABLE",
    pqcAlternatives: ["ML-DSA-65 (FIPS 204)", "SLH-DSA (FIPS 205)"],
    hybridAlternatives: ["Ed25519 + ML-DSA hybrid signatures during migration"],
    standards: ["FIPS 204", "FIPS 205"],
    note: "Ed25519 is classically strong but broken by Shor's algorithm. Replacing RSA with Ed25519 does NOT reduce quantum exposure.",
    aliases: ["ed25519", "eddsa", "ed448", "signingkey", "nacl.sign"],
  },
  "ED448": {
    algorithm: "Ed448", quantumThreat: "SHOR", classification: "VULNERABLE",
    pqcAlternatives: ["ML-DSA-87 (FIPS 204)"], hybridAlternatives: [],
    standards: ["FIPS 204"],
    note: "Edwards-curve signature; broken by Shor's algorithm.",
    aliases: ["ed448"],
  },
  "X25519": {
    algorithm: "X25519", quantumThreat: "SHOR", classification: "VULNERABLE",
    pqcAlternatives: ["ML-KEM-768 (FIPS 203)"],
    hybridAlternatives: ["X25519+ML-KEM-768 hybrid KEM"],
    standards: ["FIPS 203"],
    note: "Curve25519 key agreement; broken by Shor's algorithm. Acceptable only as the classical half of an explicit hybrid.",
    aliases: ["x25519", "curve25519", "x448", "nacl.box"],
  },
  "DSA": {
    algorithm: "DSA", quantumThreat: "SHOR", classification: "VULNERABLE",
    pqcAlternatives: ["ML-DSA-65 (FIPS 204)"], hybridAlternatives: [],
    standards: ["FIPS 204"],
    note: "Finite-field DSA signatures; broken by Shor's algorithm.",
    aliases: ["dsa", "withdsa"],
  },

  // ── Post-quantum standards (targets, not problems) ───────────────────────
  "ML-KEM": {
    algorithm: "ML-KEM", quantumThreat: "NONE", classification: "RESILIENT",
    pqcAlternatives: [], hybridAlternatives: ["X25519+ML-KEM-768"],
    standards: ["FIPS 203"],
    note: "NIST-standardised key encapsulation. A valid remediation target.",
    aliases: ["ml-kem", "mlkem", "kyber", "crystals-kyber"],
  },
  "ML-DSA": {
    algorithm: "ML-DSA", quantumThreat: "NONE", classification: "RESILIENT",
    pqcAlternatives: [], hybridAlternatives: ["ECDSA+ML-DSA", "Ed25519+ML-DSA"],
    standards: ["FIPS 204"],
    note: "NIST-standardised lattice signature. A valid remediation target.",
    aliases: ["ml-dsa", "mldsa", "dilithium", "crystals-dilithium"],
  },
  "SLH-DSA": {
    algorithm: "SLH-DSA", quantumThreat: "NONE", classification: "RESILIENT",
    pqcAlternatives: [], hybridAlternatives: [],
    standards: ["FIPS 205"],
    note: "NIST-standardised hash-based signature. A valid remediation target.",
    aliases: ["slh-dsa", "slhdsa", "sphincs", "sphincs+"],
  },
  "FALCON": {
    algorithm: "FALCON", quantumThreat: "NONE", classification: "RESILIENT",
    pqcAlternatives: [], hybridAlternatives: [],
    standards: ["FIPS 206 (draft)"],
    note: "Compact lattice signature (FN-DSA). Valid where signature size matters.",
    aliases: ["falcon", "fn-dsa", "fndsa"],
  },

  // ── Symmetric / KDF reference ────────────────────────────────────────────
  "3DES": {
    algorithm: "3DES", quantumThreat: "GROVER", classification: "VULNERABLE",
    pqcAlternatives: ["AES-256"], hybridAlternatives: [],
    standards: ["SP 800-131A"],
    note: "Triple DES is deprecated (SWEET32, 64-bit block). Replace with AES-256.",
    aliases: ["3des", "desede", "tripledes"],
  },
  "RC4": {
    algorithm: "RC4", quantumThreat: "GROVER", classification: "VULNERABLE",
    pqcAlternatives: ["AES-256-GCM", "ChaCha20-Poly1305"], hybridAlternatives: [],
    standards: ["RFC 7465"],
    note: "RC4 is broken and prohibited in TLS.",
    aliases: ["rc4", "arc4", "arcfour"],
  },
  "PBKDF2": {
    algorithm: "PBKDF2", quantumThreat: "GROVER", classification: "RELEVANT",
    pqcAlternatives: ["Argon2id", "scrypt"], hybridAlternatives: [],
    standards: ["SP 800-132"],
    note: "Acceptable password KDF; memory-hard Argon2id preferred for new work.",
    aliases: ["pbkdf2"],
  },
  "BCRYPT": {
    algorithm: "bcrypt", quantumThreat: "GROVER", classification: "RELEVANT",
    pqcAlternatives: ["Argon2id"], hybridAlternatives: [],
    standards: [],
    note: "Acceptable password hash. Not a quantum concern.",
    aliases: ["bcrypt"],
  },
  "ARGON2": {
    algorithm: "Argon2", quantumThreat: "GROVER", classification: "RESILIENT",
    pqcAlternatives: [], hybridAlternatives: [],
    standards: ["RFC 9106"],
    note: "Memory-hard password hash; preferred for password storage.",
    aliases: ["argon2", "argon2id", "argon2i"],
  },
};

/** Every algorithm the knowledge base considers broken by Shor's algorithm. */
export function shorVulnerableAlgorithms(): CryptoKnowledgeEntry[] {
  return Object.values(KNOWLEDGE_BASE).filter(e => e.quantumThreat === "SHOR");
}

/** Every classically-broken hash — cannot be the target of a hash remediation. */
export function brokenHashAlgorithms(): CryptoKnowledgeEntry[] {
  return Object.values(KNOWLEDGE_BASE).filter(
    e => e.quantumThreat === "NONE" && e.classification === "VULNERABLE",
  );
}

/** Look up guidance by algorithm, tolerant of variants like RSA-2048, ECDSA-P256. */
export function lookupAlgorithm(algorithm: string | null | undefined): CryptoKnowledgeEntry | null {
  if (!algorithm) return null;
  const upper = algorithm.toUpperCase();
  if (KNOWLEDGE_BASE[upper]) return KNOWLEDGE_BASE[upper];

  // Keys and aliases are matched together, LONGEST TOKEN FIRST. Matching in
  // insertion order made "ML-DSA-65" resolve to the DSA entry — reporting a
  // post-quantum signature as quantum-vulnerable and handing the planner the
  // opposite guidance. Length ordering also makes "EDDSA" beat "DSA".
  const candidates: { token: string; entry: CryptoKnowledgeEntry }[] = [];
  for (const [key, entry] of Object.entries(KNOWLEDGE_BASE)) {
    candidates.push({ token: key, entry });
    for (const a of entry.aliases ?? []) candidates.push({ token: a.toUpperCase(), entry });
  }
  candidates.sort((a, b) => b.token.length - a.token.length);
  for (const { token, entry } of candidates) {
    if (token.length >= 3 && upper.includes(token)) return entry;
  }
  return null;
}
