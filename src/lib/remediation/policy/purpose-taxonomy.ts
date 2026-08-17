/**
 * Deterministic normalisation of the investigator's free-text purpose into a
 * stable category.
 *
 * This exists because the investigator's wording jitters between runs on
 * identical evidence — the same security-critical case was described as both
 * "session token integrity/authentication" and, on another run, plain "content
 * hashing". A policy keyed on raw text would flip with it.
 *
 * Two mechanisms give stability:
 *   1. Keywords are matched over purpose + dataProtected + operation combined,
 *      evaluated most-security-critical first, so a security signal anywhere in
 *      the evidence wins over an incidental "hashing" mention.
 *   2. Conservative escalation: cryptography with callers and systemic scope is
 *      never allowed to resolve to a non-security category, whatever the
 *      wording. When evidence is ambiguous the policy takes the more critical
 *      reading — being too strict costs a human review, being too lax ships a
 *      broken fix.
 */
import type { PolicyInput, PurposeCategory } from "./policy-types";

/** Ordered most-security-critical first; first match wins. */
const KEYWORDS: { category: PurposeCategory; terms: string[] }[] = [
  { category: "AUTHENTICATION", terms: [
    "authentication", "authenticat", "session token", "auth token", "access token",
    "bearer", "login", "credential", "mac", "hmac", "tamper", "forgery", "anti-forgery", "csrf",
  ] },
  { category: "SIGNATURE", terms: [
    "signature", "signing", "sign ", "digital sign", "certificate", "jwt", "attestation", "non-repudiation",
  ] },
  { category: "PASSWORD_STORAGE", terms: [
    "password", "passphrase", "credential storage", "user secret", "pbkdf", "bcrypt", "argon", "scrypt",
  ] },
  { category: "KEY_ESTABLISHMENT", terms: [
    "key exchange", "key agreement", "key establishment", "key encapsulation",
    "key transport", "shared secret", "handshake", "kem",
  ] },
  { category: "CONFIDENTIALITY", terms: [
    "encrypt", "decrypt", "confidential", "cipher", "at rest", "in transit", "secrecy",
  ] },
  { category: "INTEGRITY_SECURITY", terms: [
    "integrity", "verify", "validation", "anti-tamper", "message authentication",
  ] },
  { category: "RANDOMNESS", terms: ["random", "nonce", "iv generation", "entropy", "salt generation"] },
  { category: "INTEGRITY_NONSECURITY", terms: [
    "checksum", "content hash", "content hashing", "cache key", "dedup", "deduplication",
    "fingerprint", "etag", "change detection", "non-cryptographic", "non-adversarial",
  ] },
];

/** Primitives whose purpose can be escalated by structural evidence. */
const ESCALATABLE_PRIMITIVES = new Set(["HASH", "MAC"]);

export interface PurposeResolution {
  category: PurposeCategory;
  escalated: boolean;
  matchedOn: string | null;
}

export function resolvePurpose(input: PolicyInput): PurposeResolution {
  const haystack = [input.purposeRaw, input.dataProtected, input.operation]
    .filter(Boolean).join(" ").toLowerCase();

  let category: PurposeCategory = "UNKNOWN";
  let matchedOn: string | null = null;
  if (haystack.trim().length > 0) {
    outer: for (const { category: c, terms } of KEYWORDS) {
      for (const t of terms) {
        if (haystack.includes(t)) { category = c; matchedOn = t; break outer; }
      }
    }
  }

  // Conservative escalation. Cryptography that has callers and systemic reach is
  // load-bearing regardless of how the investigator happened to word it, so it
  // may not resolve below INTEGRITY_SECURITY.
  const structurallyCritical =
    input.scope === "SYSTEMIC" &&
    input.dependents.length > 0 &&
    ESCALATABLE_PRIMITIVES.has(String(input.primitiveType));

  if (structurallyCritical && (category === "INTEGRITY_NONSECURITY" || category === "UNKNOWN")) {
    return { category: "INTEGRITY_SECURITY", escalated: true, matchedOn };
  }
  return { category, escalated: false, matchedOn };
}
