/**
 * Narrative Engine
 *
 * Generates plain-English, board-ready asset narratives from correlated
 * CryptoAsset records. No external AI API — produced deterministically
 * from the DB state so it's always current and costs nothing to run.
 *
 * Example output:
 * "The Payroll API exposes RSA-2048 key establishment via TLS 1.2 at
 *  api.payroll.northstar.com. Evidence from SSLyze, Nmap and Semgrep
 *  (98% confidence, 3 sources) confirms this algorithm is quantum-vulnerable.
 *  This application processes long-lived employee payroll data and should be
 *  prioritised for migration to post-quantum hybrid TLS."
 */

import { db } from "@/lib/db/client";

// ── Quantum class prose ────────────────────────────────────────────────────────

const QUANTUM_CLASS_PROSE: Record<string, string> = {
  QUANTUM_VULNERABLE:
    "is broken by Shor's algorithm on a cryptographically relevant quantum computer (CRQC) and is considered quantum-vulnerable",
  QUANTUM_REDUCED_SECURITY:
    "has reduced security margins against quantum attack (Grover's algorithm) and requires careful evaluation",
  QUANTUM_RESILIENT:
    "currently provides adequate quantum security margins but should be reviewed as standards evolve",
  HYBRID:
    "uses a hybrid classical/post-quantum construction, providing transitional quantum resistance",
  POST_QUANTUM:
    "is a NIST-standardised post-quantum algorithm and is considered quantum-safe",
  UNKNOWN:
    "has not been fully classified for quantum security — manual review recommended",
};

const QUANTUM_CLASS_ACTION: Record<string, string> = {
  QUANTUM_VULNERABLE:
    "This asset should be prioritised for migration to post-quantum or hybrid cryptography.",
  QUANTUM_REDUCED_SECURITY:
    "Review key sizes and consider upgrading to post-quantum algorithms as part of planned migration.",
  QUANTUM_RESILIENT:
    "Monitor for updated guidance and include in migration planning.",
  HYBRID:
    "Continue monitoring for full post-quantum migration when standards stabilise.",
  POST_QUANTUM:
    "No immediate action required. Continue monitoring for algorithm lifecycle updates.",
  UNKNOWN:
    "Classify this asset and confirm its quantum readiness posture.",
};

const PRIMITIVE_PROSE: Record<string, string> = {
  KEY_ESTABLISHMENT:    "key establishment",
  DIGITAL_SIGNATURE:    "digital signatures",
  PUBLIC_KEY_ENCRYPTION:"public-key encryption",
  SYMMETRIC_ENCRYPTION: "symmetric encryption",
  HASH:                 "cryptographic hashing",
  MAC:                  "message authentication",
  KDF:                  "key derivation",
  PASSWORD_HASHING:     "password hashing",
  RANDOMNESS:           "random number generation",
  CERTIFICATE:          "certificate management",
  OTHER:                "cryptographic operations",
};

// ── Main export ────────────────────────────────────────────────────────────────

export interface AssetNarrative {
  headline: string;
  body: string;
  evidenceSummary: string;
  actionRequired: string;
  confidence: number;
  sources: string[];
}

export async function generateAssetNarrative(
  assetId: string,
  tenantId: string
): Promise<AssetNarrative> {
  const asset = await db.cryptoAsset.findFirst({
    where: { id: assetId, tenantId },
    include: {
      observations: {
        where: { isActive: true },
        orderBy: { confidence: "desc" },
        take: 20,
      },
      businessServices: {
        include: { businessService: { select: { name: true, criticality: true } } },
      },
      risks: {
        include: { risk: { select: { title: true, residualRating: true } } },
        take: 3,
      },
    },
  });

  if (!asset) throw new Error(`Asset ${assetId} not found`);

  const obs = asset.observations;
  const sources = [...new Set(obs.map(o => o.sensorType))];
  const confidence = asset.evidenceConfidence;
  const primitive = PRIMITIVE_PROSE[asset.primitiveType] ?? "cryptographic operations";
  const qcProse = QUANTUM_CLASS_PROSE[asset.quantumClass] ?? QUANTUM_CLASS_PROSE.UNKNOWN;
  const action  = QUANTUM_CLASS_ACTION[asset.quantumClass] ?? QUANTUM_CLASS_ACTION.UNKNOWN;

  // Build location context
  let locationCtx = "";
  if (asset.assetType === "TLS_ENDPOINT" || asset.assetType === "SSH_ENDPOINT") {
    const endpoints = [...new Set(obs.map(o => o.endpoint).filter(Boolean))];
    locationCtx = endpoints.length > 0
      ? ` at ${endpoints.slice(0, 2).join(", ")}${endpoints.length > 2 ? ` and ${endpoints.length - 2} other endpoint${endpoints.length > 3 ? "s" : ""}` : ""}`
      : asset.host ? ` on ${asset.host}` : "";
  } else if (asset.assetType === "LIBRARY") {
    const packages = [...new Set(obs.map(o => o.packageName).filter(Boolean))];
    locationCtx = packages.length > 0 ? ` (${packages.slice(0, 2).join(", ")})` : "";
  } else if (asset.assetType === "CODE_USAGE") {
    locationCtx = asset.repository ? ` in ${asset.repository.replace("https://", "")}` : "";
  }

  // Business service context
  const bsNames = asset.businessServices.map(b => b.businessService.name);
  const bsCtx = bsNames.length > 0
    ? ` supporting ${bsNames.slice(0, 2).join(" and ")}${bsNames.length > 2 ? ` and ${bsNames.length - 2} other service${bsNames.length > 3 ? "s" : ""}` : ""}`
    : "";

  // Evidence summary
  const sourceList = sources.length > 1
    ? sources.slice(0, -1).join(", ") + " and " + sources[sources.length - 1]
    : sources[0] ?? "unknown scanner";

  const evidenceSummary = `${sources.length} scanner source${sources.length !== 1 ? "s" : ""} (${sourceList}) ` +
    `reported ${obs.length} observation${obs.length !== 1 ? "s" : ""} with ${confidence}% corroborated confidence.`;

  // Protocol context
  const protocols = [...new Set(obs.map(o => o.protocol).filter(Boolean))];
  const protocolCtx = protocols.length > 0 ? ` via ${protocols[0]}` : "";

  // Headline
  const topAlgo = obs[0]?.algorithm ?? asset.name.split(" ")[0];
  const headline = `${asset.name} — ${asset.quantumClass.replace(/_/g, " ")}`;

  // Body
  const body =
    `${asset.name}${locationCtx}${bsCtx} uses ${primitive}${protocolCtx}. ` +
    `The algorithm ${qcProse}. ` +
    `${evidenceSummary}` +
    (asset.risks.length > 0
      ? ` This asset is associated with ${asset.risks.length} open risk${asset.risks.length !== 1 ? "s" : ""}, ` +
        `including: ${asset.risks[0].risk.title.slice(0, 80)}${asset.risks[0].risk.title.length > 80 ? "…" : ""}.`
      : "");

  return {
    headline,
    body,
    evidenceSummary,
    actionRequired: action,
    confidence,
    sources,
  };
}

// ── Batch narratives for a list of assets ─────────────────────────────────────

export async function generateInventoryNarratives(
  tenantId: string,
  limit = 10
): Promise<Map<string, AssetNarrative>> {
  const assets = await db.cryptoAsset.findMany({
    where: {
      tenantId,
      isActive: true,
      quantumClass: { in: ["QUANTUM_VULNERABLE", "QUANTUM_REDUCED_SECURITY"] },
    },
    orderBy: [{ evidenceConfidence: "desc" }, { sourceCount: "desc" }],
    take: limit,
    select: { id: true },
  });

  const narratives = new Map<string, AssetNarrative>();
  for (const { id } of assets) {
    const narrative = await generateAssetNarrative(id, tenantId).catch(() => null);
    if (narrative) narratives.set(id, narrative);
  }
  return narratives;
}
