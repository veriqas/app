/**
 * SSLyze adapter — https://github.com/nabla-c0d3/sslyze
 * TLS endpoint analysis. Prefer structured JSON output.
 * EvidenceSource: ACTIVE_HANDSHAKE
 */

import type { SensorAdapter } from "../types/sensor";
import type { SenqorObservation, ScanContext } from "../types/observation";
import { normalizeCrypto } from "../normalizer/crypto-normalizer";
import { inferFromCipherSuite, canonicalizeTlsVersion } from "../normalizer/crypto-normalizer";
import { computeConfidence } from "../normalizer/confidence-model";

// ── SSLyze JSON output shape (subset) ─────────────────────────────────────────

interface SslyzeServerLocation {
  hostname: string;
  port?: number;
  ip_address?: string;
}

interface SslyzeCipherSuiteResult {
  tls_version_used?: string;
  accepted_cipher_suites?: Array<{
    cipher_suite?: { name?: string; openssl_name?: string };
    ephemeral_key?: { type?: string; size?: number; curve_name?: string };
  }>;
  rejected_cipher_suites?: Array<{ cipher_suite?: { name?: string } }>;
}

interface SslyzeEllipticCurveResult {
  supported_elliptic_curves?: Array<{ name?: string; openssl_nid?: number }>;
}

interface SslyzeCertInfoResult {
  certificate_deployments?: Array<{
    verified_chain?: Array<{
      subject?: { rfc4514_string?: string };
      public_key?: {
        algorithm?: string;
        key_size?: number;
        curve_name?: string;
        ec_curve_name?: string;
      };
      signature_hash_algorithm?: { name?: string };
      not_valid_before?: string;
      not_valid_after?: string;
    }>;
  }>;
}

interface SslyzeScanResult {
  tls_1_0_cipher_suites?: { status?: string; result?: SslyzeCipherSuiteResult };
  tls_1_1_cipher_suites?: { status?: string; result?: SslyzeCipherSuiteResult };
  tls_1_2_cipher_suites?: { status?: string; result?: SslyzeCipherSuiteResult };
  tls_1_3_cipher_suites?: { status?: string; result?: SslyzeCipherSuiteResult };
  ssl_2_0_cipher_suites?: { status?: string; result?: SslyzeCipherSuiteResult };
  ssl_3_0_cipher_suites?: { status?: string; result?: SslyzeCipherSuiteResult };
  elliptic_curves?:       { status?: string; result?: SslyzeEllipticCurveResult };
  certificate_info?:      { status?: string; result?: SslyzeCertInfoResult };
}

export interface SslyzeServerScanResult {
  uuid?: string;
  server_location?: SslyzeServerLocation;
  connectivity_status?: string;
  scan_result?: SslyzeScanResult;
}

export interface SslyzeOutput {
  server_scan_results?: SslyzeServerScanResult[];
  date_scans_completed?: string;
}

// ── TLS version label lookup ───────────────────────────────────────────────────

const TLS_KEYS: Array<[keyof SslyzeScanResult, string]> = [
  ["ssl_2_0_cipher_suites", "SSL 2.0"],
  ["ssl_3_0_cipher_suites", "SSL 3.0"],
  ["tls_1_0_cipher_suites", "TLS 1.0"],
  ["tls_1_1_cipher_suites", "TLS 1.1"],
  ["tls_1_2_cipher_suites", "TLS 1.2"],
  ["tls_1_3_cipher_suites", "TLS 1.3"],
];

// ── Adapter ───────────────────────────────────────────────────────────────────

export const sslyzeAdapter: SensorAdapter<SslyzeOutput> = {
  sensorType: "SSLYZE",
  displayName: "SSLyze",
  evidenceSource: "ACTIVE_HANDSHAKE",

  validate(raw): raw is SslyzeOutput {
    return typeof raw === "object" && raw !== null && "server_scan_results" in raw;
  },

  normalize(raw, ctx: ScanContext): SenqorObservation[] {
    const obs: SenqorObservation[] = [];
    try {
      for (const server of raw.server_scan_results ?? []) {
        if (server.connectivity_status !== "COMPLETED") continue;
        const host = server.server_location?.hostname ?? "";
        const port = server.server_location?.port;
        const endpoint = port ? `${host}:${port}` : host;
        const scanResult = server.scan_result ?? {};

        // Cipher suites per TLS version
        for (const [key, tlsLabel] of TLS_KEYS) {
          const attempt = scanResult[key];
          if (!attempt || attempt.status !== "COMPLETED") continue;
          const result = attempt.result as SslyzeCipherSuiteResult | undefined;
          if (!result) continue;

          const tlsVersion = canonicalizeTlsVersion(
            result.tls_version_used ?? tlsLabel
          );

          for (const accepted of result.accepted_cipher_suites ?? []) {
            const suiteName = accepted.cipher_suite?.name ?? accepted.cipher_suite?.openssl_name ?? "";
            const parts = inferFromCipherSuite(suiteName);

            // Emit observation for the key exchange component
            if (parts.keyExchange) {
              const crypto = normalizeCrypto(parts.keyExchange);
              const ephKey = accepted.ephemeral_key;
              obs.push({
                sensorType: ctx.sensorType,
                evidenceSource: "ACTIVE_HANDSHAKE",
                observedAt: ctx.scannedAt,
                algorithm: crypto.algorithm,
                algorithmRaw: parts.keyExchange,
                primitiveType: "KEY_ESTABLISHMENT",
                quantumClass: crypto.quantumClass,
                keySize: ephKey?.size ?? crypto.keySize,
                curve: ephKey?.curve_name ?? crypto.curve,
                protocol: tlsVersion,
                endpoint,
                port,
                context: suiteName,
                confidence: computeConfidence("ACTIVE_HANDSHAKE", undefined, 0),
                rawPayload: { suite: suiteName, ephemeral_key: ephKey },
              });
            }

            // Emit observation for bulk encryption
            if (parts.encryption) {
              const crypto = normalizeCrypto(parts.encryption);
              obs.push({
                sensorType: ctx.sensorType,
                evidenceSource: "ACTIVE_HANDSHAKE",
                observedAt: ctx.scannedAt,
                algorithm: crypto.algorithm,
                algorithmRaw: parts.encryption,
                primitiveType: "SYMMETRIC_ENCRYPTION",
                quantumClass: crypto.quantumClass,
                keySize: crypto.keySize,
                protocol: tlsVersion,
                endpoint,
                port,
                context: suiteName,
                confidence: computeConfidence("ACTIVE_HANDSHAKE", undefined, 0),
                rawPayload: { suite: suiteName },
              });
            }
          }
        }

        // Elliptic curves
        const ecResult = scanResult.elliptic_curves?.result;
        for (const curve of ecResult?.supported_elliptic_curves ?? []) {
          if (!curve.name) continue;
          const crypto = normalizeCrypto(curve.name);
          obs.push({
            sensorType: ctx.sensorType,
            evidenceSource: "ACTIVE_HANDSHAKE",
            observedAt: ctx.scannedAt,
            algorithm: crypto.algorithm,
            algorithmRaw: curve.name,
            primitiveType: "KEY_ESTABLISHMENT",
            quantumClass: crypto.quantumClass,
            curve: curve.name,
            endpoint,
            port,
            context: "Supported elliptic curve",
            confidence: computeConfidence("ACTIVE_HANDSHAKE", undefined, 0),
            rawPayload: curve,
          });
        }

        // Certificate public keys
        const certResult = scanResult.certificate_info?.result as SslyzeCertInfoResult | undefined;
        for (const deployment of certResult?.certificate_deployments ?? []) {
          const leaf = deployment.verified_chain?.[0];
          if (!leaf?.public_key?.algorithm) continue;
          const pk = leaf.public_key;
          const crypto = normalizeCrypto(pk.algorithm!);
          obs.push({
            sensorType: ctx.sensorType,
            evidenceSource: "ACTIVE_HANDSHAKE",
            observedAt: ctx.scannedAt,
            algorithm: crypto.algorithm,
            algorithmRaw: pk.algorithm,
            primitiveType: "CERTIFICATE",
            quantumClass: crypto.quantumClass,
            keySize: pk.key_size ?? crypto.keySize,
            curve: pk.ec_curve_name ?? pk.curve_name ?? crypto.curve,
            endpoint,
            port,
            context: `Certificate public key — ${leaf.subject?.rfc4514_string ?? ""}`,
            confidence: computeConfidence("ACTIVE_HANDSHAKE", undefined, 0),
            rawPayload: leaf,
          });
        }
      }
    } catch (e) {
      console.error("[SSLyzeAdapter] normalize failed:", e);
    }
    return obs;
  },
};
