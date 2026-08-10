/**
 * Derives information asset suggestions from existing scan observations.
 *
 * Strategy:
 *  - File path patterns → database models, schemas, migrations, ORM entities
 *  - Package names     → ORM/database drivers
 *  - Network endpoints → database ports, storage APIs
 *  - Algorithm context → what data the crypto is protecting
 */

import { db } from "@/lib/db/client";

export interface AssetSuggestion {
  id: string;           // deterministic key for dedup
  name: string;
  description: string;
  dataCategory: string;
  regulatoryRelevance: string[];
  retentionYears: number | null;
  hndlRisk: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NOT_APPLICABLE" | "UNKNOWN";
  confidence: number;   // 0-100
  source: string;       // human-readable evidence
  sourceType: "FILE" | "PACKAGE" | "NETWORK" | "ALGORITHM";
  evidence: string[];   // raw paths/endpoints
}

// ── Pattern tables ─────────────────────────────────────────────────────────────

const FILE_PATTERNS: Array<{
  regex: RegExp;
  name: string;
  dataCategory: string;
  regulatory: string[];
  retention: number | null;
  hndl: AssetSuggestion["hndlRisk"];
}> = [
  { regex: /user|account|customer|member|profile|person/i,    name: "Customer / User Records",      dataCategory: "PERSONAL_DATA",   regulatory: ["GDPR","CCPA"],              retention: 7,  hndl: "HIGH" },
  { regex: /payment|card|transaction|invoice|billing|stripe/i, name: "Payment & Transaction Data",   dataCategory: "FINANCIAL",       regulatory: ["PCI-DSS","GDPR"],          retention: 7,  hndl: "CRITICAL" },
  { regex: /auth|session|token|credential|password|secret/i,   name: "Authentication Credentials",   dataCategory: "CREDENTIALS",     regulatory: ["ISO27001"],                retention: 3,  hndl: "CRITICAL" },
  { regex: /health|medical|patient|clinical|diagnosis/i,       name: "Health / Medical Records",     dataCategory: "HEALTH_DATA",     regulatory: ["HIPAA","GDPR"],            retention: 10, hndl: "CRITICAL" },
  { regex: /contract|agreement|legal|compliance|audit/i,       name: "Legal & Compliance Records",   dataCategory: "LEGAL",           regulatory: ["SOX","ISO27001"],          retention: 10, hndl: "HIGH" },
  { regex: /employee|hr|payroll|staff|salary/i,                name: "HR & Employee Records",        dataCategory: "PERSONAL_DATA",   regulatory: ["GDPR","CCPA"],             retention: 7,  hndl: "HIGH" },
  { regex: /message|email|communication|chat|notification/i,   name: "Communications Data",          dataCategory: "COMMUNICATIONS",  regulatory: ["GDPR"],                    retention: 3,  hndl: "MEDIUM" },
  { regex: /log|audit|event|telemetry|metric/i,                name: "Audit & Event Logs",           dataCategory: "OPERATIONAL",     regulatory: ["ISO27001","SOC2"],         retention: 3,  hndl: "LOW" },
  { regex: /key|cert|pki|crypto|vault/i,                       name: "Cryptographic Keys & Certs",   dataCategory: "CRYPTOGRAPHIC",   regulatory: ["ISO27001","NIST-PQC"],     retention: 5,  hndl: "CRITICAL" },
  { regex: /backup|archive|snapshot|dump/i,                    name: "Data Backups & Archives",      dataCategory: "OPERATIONAL",     regulatory: ["ISO27001"],                retention: 7,  hndl: "HIGH" },
  { regex: /config|setting|env|secret|\.env/i,                 name: "System Configuration & Secrets", dataCategory: "CREDENTIALS",  regulatory: ["ISO27001","SOC2"],         retention: 3,  hndl: "HIGH" },
];

const PACKAGE_PATTERNS: Array<{
  regex: RegExp;
  name: string;
  dataCategory: string;
  regulatory: string[];
  retention: number | null;
  hndl: AssetSuggestion["hndlRisk"];
}> = [
  { regex: /prisma|sequelize|typeorm|mongoose|pg|mysql|sqlite|knex|drizzle/i, name: "Application Database",         dataCategory: "APPLICATION_DATA", regulatory: ["ISO27001"], retention: 5,  hndl: "HIGH" },
  { regex: /redis|ioredis/i,                                                   name: "In-Memory Cache / Sessions",   dataCategory: "OPERATIONAL",      regulatory: ["GDPR"],    retention: null, hndl: "MEDIUM" },
  { regex: /s3|minio|blob|storage|gcs|azure-storage/i,                        name: "Object / File Storage",        dataCategory: "APPLICATION_DATA", regulatory: ["ISO27001"], retention: 7,  hndl: "HIGH" },
  { regex: /stripe|braintree|paypal|adyen/i,                                   name: "Payment Processor Integration", dataCategory: "FINANCIAL",       regulatory: ["PCI-DSS"], retention: 7,  hndl: "CRITICAL" },
  { regex: /sendgrid|mailgun|ses|nodemailer/i,                                  name: "Email Communication Data",     dataCategory: "COMMUNICATIONS",   regulatory: ["GDPR"],    retention: 3,  hndl: "MEDIUM" },
  { regex: /jose|jsonwebtoken|passport|oauth|openid/i,                          name: "Identity & Access Tokens",     dataCategory: "CREDENTIALS",      regulatory: ["ISO27001","GDPR"], retention: 3, hndl: "CRITICAL" },
];

const NETWORK_PORT_PATTERNS: Array<{
  ports: RegExp;
  name: string;
  dataCategory: string;
  hndl: AssetSuggestion["hndlRisk"];
}> = [
  { ports: /:5432|:3306|:1521|:1433|:27017|:6379/,  name: "Database Server",         dataCategory: "APPLICATION_DATA", hndl: "HIGH" },
  { ports: /:443|:8443/,                              name: "TLS-Encrypted Service",   dataCategory: "APPLICATION_DATA", hndl: "HIGH" },
  { ports: /:22/,                                     name: "Secure Shell Access",     dataCategory: "OPERATIONAL",      hndl: "MEDIUM" },
  { ports: /:9200|:9300/,                             name: "Search Index (Elastic)",  dataCategory: "APPLICATION_DATA", hndl: "MEDIUM" },
];

// ── Main function ─────────────────────────────────────────────────────────────

export async function generateSuggestions(tenantId: string): Promise<AssetSuggestion[]> {
  const observations = await db.cryptoObservation.findMany({
    where: { tenantId, isActive: true },
    select: { filePath: true, packageName: true, endpoint: true, algorithm: true, quantumClass: true, sensorType: true },
  });

  const existing = await db.informationAsset.findMany({
    where: { tenantId },
    select: { name: true },
  });
  const existingNames = new Set(existing.map(a => a.name.toLowerCase()));

  const suggestionMap = new Map<string, AssetSuggestion>();

  const addOrMerge = (key: string, s: AssetSuggestion) => {
    if (existingNames.has(s.name.toLowerCase())) return;
    const existing = suggestionMap.get(key);
    if (existing) {
      existing.evidence = [...new Set([...existing.evidence, ...s.evidence])].slice(0, 5);
      existing.confidence = Math.min(100, existing.confidence + 10);
    } else {
      suggestionMap.set(key, s);
    }
  };

  for (const obs of observations) {
    // File path analysis
    if (obs.filePath) {
      const fileLower = obs.filePath.toLowerCase();
      for (const p of FILE_PATTERNS) {
        if (p.regex.test(fileLower)) {
          addOrMerge(`file:${p.name}`, {
            id: `file:${p.name}`,
            name: p.name,
            description: `Inferred from file paths in scanned codebase.`,
            dataCategory: p.dataCategory,
            regulatoryRelevance: p.regulatory,
            retentionYears: p.retention,
            hndlRisk: p.hndl,
            confidence: 65,
            source: `File path: ${obs.filePath}`,
            sourceType: "FILE",
            evidence: [obs.filePath],
          });
        }
      }
    }

    // Package analysis
    if (obs.packageName) {
      for (const p of PACKAGE_PATTERNS) {
        if (p.regex.test(obs.packageName)) {
          addOrMerge(`pkg:${p.name}`, {
            id: `pkg:${p.name}`,
            name: p.name,
            description: `Inferred from package dependency: ${obs.packageName}`,
            dataCategory: p.dataCategory,
            regulatoryRelevance: p.regulatory,
            retentionYears: p.retention,
            hndlRisk: p.hndl,
            confidence: 80,
            source: `Package: ${obs.packageName}`,
            sourceType: "PACKAGE",
            evidence: [obs.packageName],
          });
        }
      }
    }

    // Network endpoint analysis
    if (obs.endpoint) {
      for (const p of NETWORK_PORT_PATTERNS) {
        if (p.ports.test(obs.endpoint)) {
          addOrMerge(`net:${obs.endpoint}`, {
            id: `net:${obs.endpoint}`,
            name: `${p.name} — ${obs.endpoint}`,
            description: `Discovered via network scan of ${obs.endpoint}.`,
            dataCategory: p.dataCategory,
            regulatoryRelevance: [],
            retentionYears: null,
            hndlRisk: p.hndl,
            confidence: 75,
            source: `Network scan: ${obs.endpoint}`,
            sourceType: "NETWORK",
            evidence: [obs.endpoint],
          });
        }
      }
    }
  }

  // Sort: highest confidence + most severe HNDL first
  const hndlOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4, NOT_APPLICABLE: 5 };
  return Array.from(suggestionMap.values()).sort((a, b) => {
    const hndlDiff = (hndlOrder[a.hndlRisk] ?? 4) - (hndlOrder[b.hndlRisk] ?? 4);
    if (hndlDiff !== 0) return hndlDiff;
    return b.confidence - a.confidence;
  });
}
