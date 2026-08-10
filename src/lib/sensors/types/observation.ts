/**
 * SenqorObservation — the normalized output every sensor adapter must produce.
 * Maps directly to the CryptoObservation Prisma model.
 * Adapters never write directly to the DB; they produce this DTO.
 */

import type { EvidenceSource, PrimitiveType, QuantumClass } from "@prisma/client";

export type { EvidenceSource, PrimitiveType, QuantumClass };

export interface SenqorObservation {
  // ── Provenance ──────────────────────────────────────────────────────────────
  sensorType: string;           // e.g. "CRYPTOSCAN", "ZEEK", "SSLYZE"
  evidenceSource: EvidenceSource;
  observedAt: Date;
  expiresAt?: Date;

  // ── Canonical algorithm identity ────────────────────────────────────────────
  algorithm?: string;           // canonical name, e.g. "RSA-2048"
  algorithmRaw?: string;        // original string from scanner before normalization
  primitiveType?: PrimitiveType;
  purpose?: string;             // human description of cryptographic purpose
  keySize?: number;
  curve?: string;               // e.g. "P-256", "X25519"
  parameterSet?: string;        // e.g. for Kyber: "kyber512", "kyber768"
  protocol?: string;            // e.g. "TLS 1.2", "SSH-2.0"
  provider?: string;            // library/implementation, e.g. "OpenSSL 3.0.2"
  context?: string;             // free-text usage context

  // ── Location (code/config findings) ────────────────────────────────────────
  filePath?: string;
  lineNumber?: number;

  // ── Location (network/endpoint findings) ───────────────────────────────────
  endpoint?: string;
  port?: number;

  // ── Location (dependency findings) ─────────────────────────────────────────
  packageName?: string;
  packageVersion?: string;
  dependencyPath?: string[];    // transitive chain, not persisted to obs but kept in rawPayload

  // ── Confidence & classification ─────────────────────────────────────────────
  confidence: number;           // 0–100, computed by confidence model
  quantumClass: QuantumClass;

  // ── Audit trail ─────────────────────────────────────────────────────────────
  rawPayload?: unknown;         // original scanner output for this finding
  notes?: string;
}

// What adapters receive as job context when normalizing
export interface ScanContext {
  tenantId: string;
  scanJobId?: string;
  sensorType: string;
  evidenceSource: EvidenceSource;
  scannedAt: Date;
}
