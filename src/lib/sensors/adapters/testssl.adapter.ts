/**
 * testssl.sh adapter — https://github.com/drwetter/testssl.sh
 * Normalises testssl.sh JSON output into SENQOR observations.
 *
 * testssl produces a flat array of findings, each with an `id` describing
 * what was tested and a `finding` describing the result.
 *
 * EvidenceSource: ACTIVE_HANDSHAKE
 */

import type { SensorAdapter } from "../types/sensor";
import type { SenqorObservation, ScanContext } from "../types/observation";
import { normalizeCrypto, inferFromCipherSuite, canonicalizeTlsVersion } from "../normalizer/crypto-normalizer";
import { computeConfidence } from "../normalizer/confidence-model";

// ── testssl.sh JSON shape ─────────────────────────────────────────────────────

export interface TestsslFinding {
  id?: string;
  ip?: string;
  port?: string;
  severity?: string;  // OK | INFO | LOW | MEDIUM | HIGH | CRITICAL | WARN | NOT OK | DEBUG
  finding?: string;
  cve?: string;
  cwe?: string;
}

// Two possible output structures from testssl:
// 1. Flat array:  TestsslFinding[]
// 2. Object:      { scanResult: [ { findings: TestsslFinding[] } ] }
export type TestsslOutput = TestsslFinding[] | { scanResult: Array<{ ip?: string; port?: string; findings?: TestsslFinding[] }> };

// ── ID → intent mapping ───────────────────────────────────────────────────────
// testssl finding IDs we care about for crypto observations

const TLS_VERSION_IDS: Record<string, string> = {
  "SSLv2":     "SSL 2.0",
  "SSLv3":     "SSL 3.0",
  "TLS1":      "TLS 1.0",
  "TLS1_1":    "TLS 1.1",
  "TLS1_2":    "TLS 1.2",
  "TLS1_3":    "TLS 1.3",
};

const CIPHER_ID_RE = /^cipher[_\-]?/i;
const CERT_ID_RE   = /^(cert_|certificate_)/i;
const KEX_ID_RE    = /^(key_size|dh_|ecdh_|kex_)/i;

// Severity codes that represent supported (not just "failed") TLS features
const POSITIVE_SEVERITY = new Set(["OK", "INFO", "NOT OK", "WARN"]);

// ── Adapter ───────────────────────────────────────────────────────────────────

export const testsslAdapter: SensorAdapter<TestsslOutput> = {
  sensorType: "TESTSSL",
  displayName: "testssl.sh",
  evidenceSource: "ACTIVE_HANDSHAKE",

  validate(raw): raw is TestsslOutput {
    return Array.isArray(raw) || (typeof raw === "object" && raw !== null && "scanResult" in raw);
  },

  normalize(raw, ctx: ScanContext): SenqorObservation[] {
    const findings = flattenFindings(raw);
    const obs: SenqorObservation[] = [];

    try {
      for (const f of findings) {
        const id = f.id ?? "";
        const finding = f.finding ?? "";
        const endpoint = f.ip ? `${f.ip}:${f.port ?? "443"}` : undefined;
        const port = f.port ? parseInt(f.port, 10) : undefined;

        // ── TLS version support ──────────────────────────────────────────
        const tlsVersion = TLS_VERSION_IDS[id];
        if (tlsVersion) {
          // Finding says "offered" or "not offered" / "disabled"
          const offered = /offered|yes|enabled/i.test(finding) &&
                         !/not offered|no |disabled/i.test(finding);
          if (!offered) continue;

          // Flag legacy TLS as quantum-vulnerable (not because of QC, but
          // because it cannot support PQC cipher suites)
          const isLegacy = ["SSL 2.0", "SSL 3.0", "TLS 1.0", "TLS 1.1"].includes(tlsVersion);
          obs.push({
            sensorType: ctx.sensorType,
            evidenceSource: "ACTIVE_HANDSHAKE",
            observedAt: ctx.scannedAt,
            algorithm: isLegacy ? "RSA-2048" : undefined,
            primitiveType: "KEY_ESTABLISHMENT",
            quantumClass: isLegacy ? "QUANTUM_VULNERABLE" : "UNKNOWN",
            protocol: canonicalizeTlsVersion(tlsVersion),
            endpoint,
            port,
            context: `Protocol ${tlsVersion} ${offered ? "offered" : "not offered"}`,
            confidence: computeConfidence("ACTIVE_HANDSHAKE", undefined, 0),
            rawPayload: f,
          });
          continue;
        }

        // ── Cipher suite ─────────────────────────────────────────────────
        if (CIPHER_ID_RE.test(id) && finding) {
          // finding may contain cipher suite name(s)
          const cipherMatches = finding.match(/TLS_[A-Z0-9_]+/g) ?? [];
          for (const cipher of cipherMatches) {
            const parts = inferFromCipherSuite(cipher);
            if (parts.keyExchange) {
              const crypto = normalizeCrypto(parts.keyExchange);
              obs.push({
                sensorType: ctx.sensorType,
                evidenceSource: "ACTIVE_HANDSHAKE",
                observedAt: ctx.scannedAt,
                algorithm: crypto.algorithm,
                algorithmRaw: parts.keyExchange,
                primitiveType: "KEY_ESTABLISHMENT",
                quantumClass: crypto.quantumClass,
                keySize: crypto.keySize,
                curve: crypto.curve,
                endpoint,
                port,
                context: cipher,
                confidence: computeConfidence("ACTIVE_HANDSHAKE", undefined, 0),
                rawPayload: f,
              });
            }
          }
          continue;
        }

        // ── Certificate public key ────────────────────────────────────────
        if (CERT_ID_RE.test(id) && finding) {
          // e.g. "RSA 2048 bits" or "EC 256 bits (prime256v1)"
          const rsaMatch  = finding.match(/RSA[\s_]?(\d+)/i);
          const ecMatch   = finding.match(/EC[\s_]?(\d+)/i);
          const curveMatch = finding.match(/\(([a-zA-Z0-9]+)\)/);

          let algoRaw: string | undefined;
          if (rsaMatch)    algoRaw = `RSA-${rsaMatch[1]}`;
          else if (ecMatch) algoRaw = `ECDSA-P${ecMatch[1]}`;

          if (algoRaw) {
            const crypto = normalizeCrypto(algoRaw);
            obs.push({
              sensorType: ctx.sensorType,
              evidenceSource: "ACTIVE_HANDSHAKE",
              observedAt: ctx.scannedAt,
              algorithm: crypto.algorithm,
              algorithmRaw: algoRaw,
              primitiveType: "CERTIFICATE",
              quantumClass: crypto.quantumClass,
              keySize: crypto.keySize,
              curve: curveMatch?.[1] ?? crypto.curve,
              endpoint,
              port,
              context: finding.slice(0, 120),
              confidence: computeConfidence("ACTIVE_HANDSHAKE", undefined, 0),
              rawPayload: f,
            });
          }
          continue;
        }

        // ── Key exchange parameters ───────────────────────────────────────
        if (KEX_ID_RE.test(id) && finding) {
          const dhMatch  = finding.match(/DH[\s_]?(\d+)/i);
          const ecdhMatch = finding.match(/ECDH[^\s]*\s+(\d+)/i);
          let algoRaw: string | undefined;
          if (dhMatch)    algoRaw = `DH-${dhMatch[1]}`;
          else if (ecdhMatch) algoRaw = `ECDH-P${ecdhMatch[1]}`;

          if (algoRaw) {
            const crypto = normalizeCrypto(algoRaw);
            obs.push({
              sensorType: ctx.sensorType,
              evidenceSource: "ACTIVE_HANDSHAKE",
              observedAt: ctx.scannedAt,
              algorithm: crypto.algorithm,
              algorithmRaw: algoRaw,
              primitiveType: "KEY_ESTABLISHMENT",
              quantumClass: crypto.quantumClass,
              keySize: crypto.keySize,
              endpoint,
              port,
              context: finding.slice(0, 120),
              confidence: computeConfidence("ACTIVE_HANDSHAKE", undefined, 0),
              rawPayload: f,
            });
          }
        }
      }
    } catch (e) {
      console.error("[TestsslAdapter] normalize failed:", e);
    }

    return obs;
  },
};

function flattenFindings(raw: TestsslOutput): TestsslFinding[] {
  if (Array.isArray(raw)) return raw;
  // Structured format
  const findings: TestsslFinding[] = [];
  for (const scan of raw.scanResult ?? []) {
    for (const f of scan.findings ?? []) {
      findings.push({ ...f, ip: f.ip ?? scan.ip, port: f.port ?? scan.port });
    }
  }
  return findings;
}
