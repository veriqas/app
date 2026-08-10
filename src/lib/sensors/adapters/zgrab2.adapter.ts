/**
 * ZGrab2 adapter — https://github.com/zmap/zgrab2
 * Active protocol discovery. Must run within approved scan scopes only.
 * EvidenceSource: ACTIVE_HANDSHAKE
 *
 * IMPORTANT: ZGrab2 must never scan arbitrary public internet targets.
 * Every job must reference an approved ScanScope. The scan worker
 * enforces this before launching; this adapter only normalizes output.
 */

import type { SensorAdapter } from "../types/sensor";
import type { SenqorObservation, ScanContext } from "../types/observation";
import { normalizeCrypto, inferFromCipherSuite, canonicalizeTlsVersion } from "../normalizer/crypto-normalizer";
import { computeConfidence } from "../normalizer/confidence-model";

// ── ZGrab2 JSON output shape (TLS-focused) ─────────────────────────────────────

interface Zgrab2TlsCertificate {
  parsed?: {
    subject?: { common_name?: string[] };
    issuer?: { common_name?: string[] };
    subject_key_info?: {
      key_algorithm?: { name?: string };
      rsa_public_key?: { length?: number; exponent?: number };
      ecdsa_public_key?: { curve?: string; length?: number };
    };
    signature_algorithm?: { name?: string };
    validity?: { start?: string; end?: string };
  };
}

interface Zgrab2TlsHandshake {
  version?: { value?: number; name?: string };
  cipher_suite?: { value?: number; name?: string };
  server_key_exchange?: {
    ecdh_params?: { curve_id?: { name?: string }; server_public?: { value?: string } };
    dh_params?: { prime_value?: { value?: string }; prime_length?: number };
  };
  server_certificates?: {
    certificate?: Zgrab2TlsCertificate;
    chain?: Zgrab2TlsCertificate[];
  };
}

interface Zgrab2TlsResult {
  handshake_log?: Zgrab2TlsHandshake;
}

interface Zgrab2SshResult {
  server_id?: { raw?: string };
  kex_algorithm?: string;
  server_host_key_type?: string;
  host_key_fingerprint_sha256?: string;
  negotiated_crypto?: {
    client_to_server_cipher?: string;
    server_to_client_cipher?: string;
    client_to_server_mac?: string;
    server_to_client_mac?: string;
  };
}

interface Zgrab2Data {
  tls?: { status?: string; result?: Zgrab2TlsResult; protocol?: string; port?: number };
  ssh?: { status?: string; result?: Zgrab2SshResult; protocol?: string; port?: number };
}

export interface Zgrab2ScanEntry {
  ip?: string;
  domain?: string;
  data?: Zgrab2Data;
  timestamp?: string;
}

export type Zgrab2Output = Zgrab2ScanEntry[];

// ── Adapter ───────────────────────────────────────────────────────────────────

export const zgrab2Adapter: SensorAdapter<Zgrab2Output> = {
  sensorType: "ZGRAB2",
  displayName: "ZGrab2",
  evidenceSource: "ACTIVE_HANDSHAKE",

  validate(raw): raw is Zgrab2Output {
    return Array.isArray(raw) && (raw.length === 0 || ("data" in raw[0] || "ip" in raw[0]));
  },

  normalize(raw, ctx: ScanContext): SenqorObservation[] {
    const obs: SenqorObservation[] = [];
    try {
      for (const entry of raw) {
        const host = entry.domain ?? entry.ip ?? "";
        const ts = entry.timestamp ? new Date(entry.timestamp) : ctx.scannedAt;
        const conf = computeConfidence("ACTIVE_HANDSHAKE", undefined, 0);

        // TLS
        const tls = entry.data?.tls;
        if (tls?.status === "success" && tls.result?.handshake_log) {
          const hs = tls.result.handshake_log;
          const port = tls.port ?? 443;
          const endpoint = `${host}:${port}`;
          const tlsVersion = canonicalizeTlsVersion(
            hs.version?.name ?? String(hs.version?.value ?? "")
          );

          // Cipher suite
          if (hs.cipher_suite?.name) {
            const parts = inferFromCipherSuite(hs.cipher_suite.name);
            const kex = hs.server_key_exchange;

            if (parts.keyExchange) {
              const crypto = normalizeCrypto(parts.keyExchange);
              const curve = kex?.ecdh_params?.curve_id?.name;
              const dhSize = kex?.dh_params?.prime_length;
              obs.push({
                sensorType: ctx.sensorType,
                evidenceSource: "ACTIVE_HANDSHAKE",
                observedAt: ts,
                algorithm: crypto.algorithm,
                algorithmRaw: parts.keyExchange,
                primitiveType: "KEY_ESTABLISHMENT",
                quantumClass: crypto.quantumClass,
                keySize: dhSize ?? crypto.keySize,
                curve: curve ?? crypto.curve,
                protocol: tlsVersion,
                endpoint,
                port,
                context: hs.cipher_suite.name,
                confidence: conf,
                rawPayload: hs,
              });
            }
            if (parts.encryption) {
              const crypto = normalizeCrypto(parts.encryption);
              obs.push({
                sensorType: ctx.sensorType,
                evidenceSource: "ACTIVE_HANDSHAKE",
                observedAt: ts,
                algorithm: crypto.algorithm,
                algorithmRaw: parts.encryption,
                primitiveType: "SYMMETRIC_ENCRYPTION",
                quantumClass: crypto.quantumClass,
                keySize: crypto.keySize,
                protocol: tlsVersion,
                endpoint,
                port,
                context: hs.cipher_suite.name,
                confidence: conf,
                rawPayload: hs,
              });
            }
          }

          // Server certificate public key
          const certParsed = hs.server_certificates?.certificate?.parsed;
          const ski = certParsed?.subject_key_info;
          if (ski?.key_algorithm?.name) {
            const crypto = normalizeCrypto(ski.key_algorithm.name);
            const ks = ski.rsa_public_key?.length ?? ski.ecdsa_public_key?.length ?? crypto.keySize;
            const curve = ski.ecdsa_public_key?.curve ?? crypto.curve;
            obs.push({
              sensorType: ctx.sensorType,
              evidenceSource: "ACTIVE_HANDSHAKE",
              observedAt: ts,
              algorithm: crypto.algorithm,
              algorithmRaw: ski.key_algorithm.name,
              primitiveType: "CERTIFICATE",
              quantumClass: crypto.quantumClass,
              keySize: ks,
              curve,
              protocol: tlsVersion,
              endpoint,
              port,
              context: `Certificate public key`,
              confidence: conf,
              rawPayload: certParsed,
            });
          }
        }

        // SSH
        const ssh = entry.data?.ssh;
        if (ssh?.status === "success" && ssh.result) {
          const r = ssh.result;
          const port = ssh.port ?? 22;
          const endpoint = `${host}:${port}`;
          const protocol = r.server_id?.raw ?? "SSH-2.0";

          const algoFields: Array<[string | undefined, import("../types/observation").PrimitiveType, string]> = [
            [r.kex_algorithm,                    "KEY_ESTABLISHMENT",   "KEX"],
            [r.server_host_key_type,             "DIGITAL_SIGNATURE",   "Host key"],
            [r.negotiated_crypto?.client_to_server_cipher, "SYMMETRIC_ENCRYPTION", "Cipher c→s"],
            [r.negotiated_crypto?.server_to_client_cipher, "SYMMETRIC_ENCRYPTION", "Cipher s→c"],
            [r.negotiated_crypto?.client_to_server_mac,    "MAC",                  "MAC c→s"],
            [r.negotiated_crypto?.server_to_client_mac,    "MAC",                  "MAC s→c"],
          ];

          for (const [raw, primitiveType, label] of algoFields) {
            if (!raw) continue;
            const crypto = normalizeCrypto(raw);
            obs.push({
              sensorType: ctx.sensorType,
              evidenceSource: "ACTIVE_HANDSHAKE",
              observedAt: ts,
              algorithm: crypto.algorithm,
              algorithmRaw: raw,
              primitiveType: crypto.primitiveType ?? primitiveType,
              quantumClass: crypto.quantumClass,
              keySize: crypto.keySize,
              curve: crypto.curve,
              protocol,
              endpoint,
              port,
              context: `ZGrab2 SSH — ${label}`,
              confidence: conf,
              rawPayload: r,
            });
          }
        }
      }
    } catch (e) {
      console.error("[ZGrab2Adapter] normalize failed:", e);
    }
    return obs;
  },
};
