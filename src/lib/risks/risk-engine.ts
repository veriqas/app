/**
 * Quantum Risk Engine
 *
 * Converts CryptoObservations from a completed scan job into Risk records.
 * Groups observations by algorithm + primitive so one risk represents one
 * cryptographic exposure, not one per line of code.
 *
 * Risk scoring:
 *   QUANTUM_VULNERABLE          → inherent score 20 (5×4), CRITICAL
 *   QUANTUM_REDUCED_SECURITY    → inherent score 12 (4×3), HIGH
 *   QUANTUM_RESILIENT / HYBRID  → inherent score 6  (3×2), MEDIUM
 *   POST_QUANTUM / SAFE         → no risk created
 */

import { db } from "@/lib/db/client";
import type { QuantumClass, PrimitiveType } from "@prisma/client";

// ── Scoring tables ─────────────────────────────────────────────────────────────

const QUANTUM_LIKELIHOOD: Record<string, number> = {
  QUANTUM_VULNERABLE:       5,
  QUANTUM_REDUCED_SECURITY: 4,
  QUANTUM_RESILIENT:        3,
  HYBRID:                   3,
  POST_QUANTUM:             1,
  UNKNOWN:                  2,
};

const QUANTUM_IMPACT: Record<string, number> = {
  QUANTUM_VULNERABLE:       4,
  QUANTUM_REDUCED_SECURITY: 3,
  QUANTUM_RESILIENT:        2,
  HYBRID:                   2,
  POST_QUANTUM:             1,
  UNKNOWN:                  2,
};

const SEVERITY_FROM_SCORE: Array<[number, string]> = [
  [20, "CRITICAL"],
  [12, "HIGH"],
  [6,  "MEDIUM"],
  [3,  "LOW"],
  [0,  "INFORMATIONAL"],
];

function scoreSeverity(score: number): string {
  for (const [threshold, label] of SEVERITY_FROM_SCORE) {
    if (score >= threshold) return label;
  }
  return "INFORMATIONAL";
}

// ── Risk templates ────────────────────────────────────────────────────────────

interface RiskTemplate {
  title: (algo: string, count: number, locations: string[]) => string;
  statement: (algo: string, primitive: string, count: number) => string;
  cause: string;
  event: string;
  consequence: string;
  taxonomy: string;
  businessImpact: string;
  riskType: string;
}

function locationSummary(locations: string[]): string {
  const unique = [...new Set(locations)].slice(0, 3);
  const rest = locations.length - unique.length;
  return unique.join(", ") + (rest > 0 ? ` +${rest} more` : "");
}

function primitiveLabel(primitive: string): string {
  const map: Record<string, string> = {
    KEY_ESTABLISHMENT:    "key establishment",
    DIGITAL_SIGNATURE:    "digital signatures",
    PUBLIC_KEY_ENCRYPTION:"public-key encryption",
    SYMMETRIC_ENCRYPTION: "symmetric encryption",
    HASH:                 "hashing",
    MAC:                  "message authentication",
    KEY_DERIVATION:       "key derivation",
    KEY_ENCAPSULATION:    "key encapsulation",
    STREAM_CIPHER:        "stream cipher",
  };
  return map[primitive] ?? primitive.toLowerCase().replace(/_/g, " ");
}

const RISK_TEMPLATES: Record<string, RiskTemplate> = {
  KEY_ESTABLISHMENT: {
    riskType: "CRYPTOGRAPHIC",
    taxonomy: "Quantum Cryptographic Vulnerability",
    title: (algo, count) =>
      `Quantum-Vulnerable Key Establishment: ${algo} (${count} instance${count > 1 ? "s" : ""})`,
    statement: (algo, _prim, count) =>
      `${count} instance${count > 1 ? "s" : ""} of ${algo} key exchange detected. This algorithm is broken by Shor's algorithm on a sufficiently powerful quantum computer, exposing encrypted communications to harvest-now-decrypt-later attacks.`,
    cause: "Use of classical asymmetric key exchange algorithms not resistant to quantum computing attacks.",
    event: "A cryptographically relevant quantum computer (CRQC) decrypts historically captured ciphertext or performs real-time man-in-the-middle attacks on key exchange.",
    consequence: "Complete compromise of data confidentiality protected by the affected key exchange. Regulatory penalties under GDPR, PCI-DSS, and sector-specific frameworks for failure to adopt PQC standards.",
    businessImpact: "Data confidentiality breach, regulatory non-compliance, reputational damage, customer trust erosion.",
  },
  DIGITAL_SIGNATURE: {
    riskType: "CRYPTOGRAPHIC",
    taxonomy: "Quantum Cryptographic Vulnerability",
    title: (algo, count) =>
      `Quantum-Vulnerable Digital Signature: ${algo} (${count} instance${count > 1 ? "s" : ""})`,
    statement: (algo, _prim, count) =>
      `${count} instance${count > 1 ? "s" : ""} of ${algo} digital signatures detected. Shor's algorithm can forge signatures, enabling impersonation, code signing bypass, and certificate fraud.`,
    cause: "Use of elliptic-curve or RSA-based digital signature schemes vulnerable to quantum attack.",
    event: "A CRQC forges digital signatures, bypassing authentication, code integrity checks, or certificate validation.",
    consequence: "Authentication bypass, malicious code execution, supply-chain compromise, certificate authority trust failures.",
    businessImpact: "Identity fraud, unauthorised access, software supply-chain attack, loss of code integrity.",
  },
  PUBLIC_KEY_ENCRYPTION: {
    riskType: "CRYPTOGRAPHIC",
    taxonomy: "Quantum Cryptographic Vulnerability",
    title: (algo, count) =>
      `Quantum-Vulnerable Public-Key Encryption: ${algo} (${count} instance${count > 1 ? "s" : ""})`,
    statement: (algo, _prim, count) =>
      `${count} instance${count > 1 ? "s" : ""} of ${algo} public-key encryption detected. Shor's algorithm recovers the private key, decrypting all messages protected by this scheme.`,
    cause: "RSA or ECC public-key encryption used for data protection or key wrapping.",
    event: "Quantum decryption of RSA or ECC-protected data, including long-lived secrets, API keys, and encrypted backups.",
    consequence: "Full plaintext recovery of encrypted data. Potential for immediate exploitation once CRQCs become available.",
    businessImpact: "Breach of sensitive data at rest and in transit, regulatory violation, financial and reputational loss.",
  },
  SYMMETRIC_ENCRYPTION: {
    riskType: "CRYPTOGRAPHIC",
    taxonomy: "Quantum Reduced Security",
    title: (algo, count) =>
      `Quantum-Reduced Symmetric Encryption: ${algo} (${count} instance${count > 1 ? "s" : ""})`,
    statement: (algo, _prim, count) =>
      `${count} instance${count > 1 ? "s" : ""} of ${algo} symmetric encryption detected. Grover's algorithm halves effective key length — AES-128 becomes effectively 64-bit, AES-256 remains adequate but should be confirmed.`,
    cause: "Symmetric ciphers provide reduced security margins against quantum search attacks (Grover's algorithm).",
    event: "Quantum-accelerated brute-force reduces effective key strength, making shorter keys feasible to attack.",
    consequence: "Reduced encryption strength. AES-128 and below becomes inadequate for long-term data protection.",
    businessImpact: "Weakened data confidentiality for long-retention data. Migration effort to AES-256 where not already deployed.",
  },
  HASH: {
    riskType: "CRYPTOGRAPHIC",
    taxonomy: "Quantum Reduced Security",
    title: (algo, count) =>
      `Quantum-Reduced Hash Function: ${algo} (${count} instance${count > 1 ? "s" : ""})`,
    statement: (algo, _prim, count) =>
      `${count} instance${count > 1 ? "s" : ""} of ${algo} detected. Grover's algorithm reduces collision resistance — SHA-256 retains ~128-bit post-quantum security, SHA-1 and MD5 are critically weak.`,
    cause: "Hash functions with output shorter than 384 bits provide reduced quantum security margins.",
    event: "Quantum-assisted collision finding undermines integrity guarantees for digital signatures, certificate fingerprints, and data verification.",
    consequence: "Reduced integrity assurance. SHA-1 and MD5 should be considered broken for security purposes.",
    businessImpact: "Integrity failures in software distribution, certificate validation, and data verification pipelines.",
  },
  MAC: {
    riskType: "CRYPTOGRAPHIC",
    taxonomy: "Quantum Reduced Security",
    title: (algo, count) =>
      `Quantum-Reduced MAC: ${algo} (${count} instance${count > 1 ? "s" : ""})`,
    statement: (algo, _prim, count) =>
      `${count} instance${count > 1 ? "s" : ""} of ${algo} message authentication detected. Grover's algorithm reduces effective security to half the key/tag length.`,
    cause: "HMAC and MAC constructions based on SHA-1/SHA-256 provide reduced quantum security.",
    event: "Quantum-accelerated forgery of message authentication codes undermines data integrity and API authentication.",
    consequence: "Forged API requests, tampered data, authentication bypass in systems relying on HMAC for integrity.",
    businessImpact: "API security degradation, potential for data integrity attacks on inter-service communication.",
  },
};

function getTemplate(primitive: string): RiskTemplate {
  return RISK_TEMPLATES[primitive] ?? RISK_TEMPLATES["KEY_ESTABLISHMENT"];
}

// ── Risk counter ──────────────────────────────────────────────────────────────

let riskCounter = 0;
function nextRiskRef(tenantId: string): string {
  riskCounter = (riskCounter + 1) % 1_000_000;
  const ts = Date.now().toString(36).toUpperCase();
  return `QR-${ts}-${String(riskCounter).padStart(4, "0")}`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface RiskEngineResult {
  created: number;
  updated: number;
  skipped: number;
}

const REVIEW_DAYS: Record<string, number> = {
  CRITICAL: 90,
  HIGH:     90,
  MEDIUM:   180,
  LOW:      365,
};

function reviewDateFromSeverity(severity: string): Date {
  const days = REVIEW_DAYS[severity] ?? 180;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export async function generateRisksFromScanJob(
  scanJobId: string,
  tenantId: string
): Promise<RiskEngineResult> {
  // Try job-specific observations first; if all were deduped (0 found),
  // fall back to all active observations for the tenant so re-scans still
  // refresh risks.
  let observations = await db.cryptoObservation.findMany({
    where: { scanJobId, tenantId, isActive: true },
  });

  if (observations.length === 0) {
    observations = await db.cryptoObservation.findMany({
      where: { tenantId, isActive: true },
    });
  }

  if (observations.length === 0) return { created: 0, updated: 0, skipped: 0 };

  // Group: one risk per (algorithm + primitive) — collapse all locations
  const groups = new Map<string, {
    algorithm: string;
    primitive: string;
    quantumClass: string;
    count: number;
    locations: string[];
    sources: string[];
  }>();

  for (const obs of observations) {
    const algo = obs.algorithm ?? "UNKNOWN";
    const prim = obs.primitiveType ?? "KEY_ESTABLISHMENT";
    const qc   = obs.quantumClass ?? "UNKNOWN";
    const key  = `${algo}::${prim}`;

    if (!groups.has(key)) {
      groups.set(key, { algorithm: algo, primitive: prim, quantumClass: qc, count: 0, locations: [], sources: [] });
    }
    const g = groups.get(key)!;
    g.count++;

    const loc = obs.filePath ?? obs.endpoint ?? obs.packageName ?? obs.context ?? "";
    if (loc) g.locations.push(loc);
    if (obs.sensorType && !g.sources.includes(obs.sensorType)) g.sources.push(obs.sensorType);
  }

  // Find the tenant admin to auto-assign as risk owner (first-created active user)
  const adminUser = await db.user.findFirst({
    where: { tenantId, isActive: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  let created = 0, updated = 0, skipped = 0;

  for (const [, g] of groups) {
    // Don't create risks for things that are already post-quantum safe
    if (g.quantumClass === "POST_QUANTUM" || g.quantumClass === "QUANTUM_RESILIENT") {
      skipped++;
      continue;
    }

    const likelihood = QUANTUM_LIKELIHOOD[g.quantumClass] ?? 2;
    const impact     = QUANTUM_IMPACT[g.quantumClass] ?? 2;
    const score      = likelihood * impact;
    const severity   = scoreSeverity(score);
    const template   = getTemplate(g.primitive);

    // Check if a risk for this algorithm already exists (avoid duplicates across scans)
    const existingRisk = await db.risk.findFirst({
      where: {
        tenantId,
        riskType: "CRYPTOGRAPHIC",
        title: { contains: g.algorithm },
        isActive: true,
      },
    });

    if (existingRisk) {
      // Update the count/score if the new scan has more instances
      await db.risk.update({
        where: { id: existingRisk.id },
        data: {
          statement: template.statement(g.algorithm, g.primitive, g.count),
          likelihoodInherent: likelihood,
          impactInherent:     impact,
          inherentScore:      score,
          inherentRating:     severity as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFORMATIONAL",
          residualScore:      score,
          residualRating:     severity as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFORMATIONAL",
          updatedAt:          new Date(),
        },
      });
      // Link risk to any CryptoAssets for this algorithm (upsert join rows)
      await linkRiskToAssets(existingRisk.id, g.algorithm, tenantId);
      updated++;
      continue;
    }

    const locSummary = locationSummary(g.locations);
    const sourceNote = g.sources.length > 0 ? ` Detected by: ${g.sources.join(", ")}.` : "";

    const newRisk = await db.risk.create({
      data: {
        ref:            nextRiskRef(tenantId),
        tenantId,
        title:          template.title(g.algorithm, g.count, g.locations),
        statement:      template.statement(g.algorithm, g.primitive, g.count) +
                        (locSummary ? ` Locations include: ${locSummary}.` : "") + sourceNote,
        cause:          template.cause,
        event:          template.event,
        consequence:    template.consequence,
        riskType:       template.riskType,
        taxonomy:       template.taxonomy,
        businessImpact: template.businessImpact,
        likelihoodInherent: likelihood,
        impactInherent:     impact,
        inherentScore:      score,
        inherentRating:     severity as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFORMATIONAL",
        controlEffectiveness: 0,
        residualScore:      score,
        residualRating:     severity as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFORMATIONAL",
        status:       "OPEN",
        priority:     likelihood,
        isActive:     true,
        ownerId:      adminUser?.id ?? null,
        reviewDate:   reviewDateFromSeverity(severity),
      },
    });
    // Link new risk to its CryptoAssets
    await linkRiskToAssets(newRisk.id, g.algorithm, tenantId);
    created++;
  }

  return { created, updated, skipped };
}

// ── Link risk → CryptoAssets ──────────────────────────────────────────────────

async function linkRiskToAssets(
  riskId: string,
  algorithm: string,
  tenantId: string
): Promise<void> {
  // Find all assets for this algorithm
  const assets = await db.cryptoAsset.findMany({
    where: {
      tenantId,
      isActive: true,
      observations: {
        some: { algorithm, isActive: true },
      },
    },
    select: { id: true },
  });

  for (const asset of assets) {
    await db.riskCryptoAsset.upsert({
      where: { riskId_cryptoAssetId: { riskId, cryptoAssetId: asset.id } },
      create: { riskId, cryptoAssetId: asset.id },
      update: {},
    }).catch(() => {/* ignore duplicate key errors */});
  }
}
