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
}

export const KNOWLEDGE_BASE: Record<string, CryptoKnowledgeEntry> = {
  "RSA": {
    algorithm: "RSA", quantumThreat: "SHOR", classification: "VULNERABLE",
    pqcAlternatives: ["ML-KEM-768 (FIPS 203) for key establishment", "ML-DSA-65 (FIPS 204) for signatures"],
    hybridAlternatives: ["X25519+ML-KEM-768 hybrid KEM", "RSA/ECDSA + ML-DSA hybrid signatures during migration"],
    standards: ["FIPS 203", "FIPS 204"],
    note: "RSA is broken by Shor's algorithm. The correct replacement depends on purpose: signatures → ML-DSA; key transport/agreement → ML-KEM.",
  },
  "ECDSA": {
    algorithm: "ECDSA", quantumThreat: "SHOR", classification: "VULNERABLE",
    pqcAlternatives: ["ML-DSA-65 (FIPS 204)", "SLH-DSA (FIPS 205) for hash-based signatures"],
    hybridAlternatives: ["ECDSA + ML-DSA hybrid signatures"],
    standards: ["FIPS 204", "FIPS 205"],
    note: "Elliptic-curve signatures are broken by Shor's algorithm.",
  },
  "ECDH": {
    algorithm: "ECDH", quantumThreat: "SHOR", classification: "VULNERABLE",
    pqcAlternatives: ["ML-KEM-768 (FIPS 203)"],
    hybridAlternatives: ["X25519+ML-KEM-768 hybrid"],
    standards: ["FIPS 203"],
    note: "Elliptic-curve key agreement is broken by Shor's algorithm.",
  },
  "DH": {
    algorithm: "DH", quantumThreat: "SHOR", classification: "VULNERABLE",
    pqcAlternatives: ["ML-KEM-768 (FIPS 203)"],
    hybridAlternatives: ["classical DH + ML-KEM hybrid"],
    standards: ["FIPS 203"],
    note: "Finite-field Diffie-Hellman is broken by Shor's algorithm.",
  },
  "MD5": {
    algorithm: "MD5", quantumThreat: "NONE", classification: "VULNERABLE",
    pqcAlternatives: ["SHA-256", "SHA-3-256"],
    hybridAlternatives: [],
    standards: ["FIPS 180-4", "FIPS 202"],
    note: "MD5 is classically broken (collisions). Use SHA-256 for integrity; bcrypt/Argon2 for passwords. Not a quantum issue.",
  },
  "SHA-1": {
    algorithm: "SHA-1", quantumThreat: "NONE", classification: "VULNERABLE",
    pqcAlternatives: ["SHA-256", "SHA-3-256"],
    hybridAlternatives: [],
    standards: ["FIPS 180-4"],
    note: "SHA-1 is classically broken for collision resistance.",
  },
  "SHA-256": {
    algorithm: "SHA-256", quantumThreat: "GROVER", classification: "WEAKENED",
    pqcAlternatives: ["SHA-256 remains acceptable; SHA-3-256/SHAKE-256 for long-term margin"],
    hybridAlternatives: [],
    standards: ["FIPS 180-4", "FIPS 202"],
    note: "Grover only halves preimage strength; SHA-256 is acceptable today. Flag for planning, not urgent replacement.",
  },
};

/** Look up guidance by algorithm, tolerant of variants like RSA-2048, ECDSA-P256. */
export function lookupAlgorithm(algorithm: string | null | undefined): CryptoKnowledgeEntry | null {
  if (!algorithm) return null;
  const upper = algorithm.toUpperCase();
  if (KNOWLEDGE_BASE[upper]) return KNOWLEDGE_BASE[upper];
  for (const key of Object.keys(KNOWLEDGE_BASE)) {
    if (upper.includes(key)) return KNOWLEDGE_BASE[key];
  }
  return null;
}
