/**
 * Zeek adapter — https://zeek.org/
 * Passive network observation — the most authoritative evidence source.
 * Consumes Zeek TSV log lines or JSON-streamed log objects.
 * EvidenceSource: OBSERVED_LIVE
 *
 * Supported log types: ssl.log, ssh.log, x509.log, conn.log
 */

import type { SensorAdapter } from "../types/sensor";
import type { SenqorObservation, ScanContext } from "../types/observation";
import { normalizeCrypto, inferFromCipherSuite } from "../normalizer/crypto-normalizer";
import { canonicalizeTlsVersion } from "../normalizer/crypto-normalizer";
import { computeConfidence } from "../normalizer/confidence-model";

// ── Zeek log shapes ────────────────────────────────────────────────────────────

export interface ZeekSslLogEntry {
  _log_type?: "ssl";
  ts?: number | string;
  uid?: string;
  id?: { orig_h?: string; orig_p?: number; resp_h?: string; resp_p?: number };
  version?: string;
  cipher?: string;
  curve?: string;
  server_name?: string;
  resumed?: boolean;
  established?: boolean;
  // policy extensions
  cert_chain_fps?: string[];
  validation_status?: string;
  subject?: string;
  issuer?: string;
  ja3?: string;
  ja3s?: string;
}

export interface ZeekSshLogEntry {
  _log_type?: "ssh";
  ts?: number | string;
  uid?: string;
  id?: { orig_h?: string; orig_p?: number; resp_h?: string; resp_p?: number };
  version?: number;
  auth_success?: boolean;
  client?: string;
  server?: string;
  cipher_alg?: string;
  mac_alg?: string;
  kex_alg?: string;
  host_key_alg?: string;
  host_key_fingerprint?: string;
}

export interface ZeekX509LogEntry {
  _log_type?: "x509";
  ts?: number | string;
  id?: string;
  certificate?: {
    subject?: string;
    issuer?: string;
    key_alg?: string;
    sig_alg?: string;
    key_type?: string;
    key_length?: number;
    exponent?: string;
    curve?: string;
    not_valid_before?: number;
    not_valid_after?: number;
  };
}

export type ZeekLogEntry =
  | ZeekSslLogEntry
  | ZeekSshLogEntry
  | ZeekX509LogEntry;

export interface ZeekBatch {
  /** Identifies which log type this batch came from */
  logType: "ssl" | "ssh" | "x509" | "conn";
  entries: ZeekLogEntry[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function entryTimestamp(entry: ZeekLogEntry, fallback: Date): Date {
  const ts = (entry as Record<string, unknown>).ts;
  if (!ts) return fallback;
  if (typeof ts === "number") return new Date(ts * 1000);
  const d = new Date(ts as string);
  return isNaN(d.getTime()) ? fallback : d;
}

function connId(entry: { id?: { resp_h?: string; resp_p?: number } }): { endpoint: string; port?: number } {
  const resp_h = entry.id?.resp_h ?? "";
  const resp_p = entry.id?.resp_p;
  return { endpoint: resp_p ? `${resp_h}:${resp_p}` : resp_h, port: resp_p };
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const zeekAdapter: SensorAdapter<ZeekBatch> = {
  sensorType: "ZEEK",
  displayName: "Zeek",
  evidenceSource: "OBSERVED_LIVE",

  validate(raw): raw is ZeekBatch {
    return typeof raw === "object" && raw !== null
      && "logType" in raw && "entries" in raw;
  },

  normalize(raw, ctx: ScanContext): SenqorObservation[] {
    const obs: SenqorObservation[] = [];
    try {
      for (const entry of raw.entries ?? []) {
        const ts = entryTimestamp(entry, ctx.scannedAt);

        switch (raw.logType) {
          case "ssl":
            obs.push(...normalizeSslEntry(entry as ZeekSslLogEntry, ts, ctx));
            break;
          case "ssh":
            obs.push(...normalizeSshEntry(entry as ZeekSshLogEntry, ts, ctx));
            break;
          case "x509":
            obs.push(...normalizeX509Entry(entry as ZeekX509LogEntry, ts, ctx));
            break;
        }
      }
    } catch (e) {
      console.error("[ZeekAdapter] normalize failed:", e);
    }
    return obs;
  },
};

function normalizeSslEntry(entry: ZeekSslLogEntry, ts: Date, ctx: ScanContext): SenqorObservation[] {
  if (!entry.established) return [];  // incomplete handshake — skip
  const obs: SenqorObservation[] = [];
  const { endpoint, port } = connId(entry);
  const tlsVersion = entry.version ? canonicalizeTlsVersion(entry.version) : undefined;
  const conf = computeConfidence("OBSERVED_LIVE", undefined, 0);

  // Cipher suite
  if (entry.cipher) {
    const { keyExchange, encryption } = inferFromCipherSuite(entry.cipher);

    if (keyExchange) {
      const crypto = normalizeCrypto(keyExchange);
      obs.push({
        sensorType: ctx.sensorType,
        evidenceSource: "OBSERVED_LIVE",
        observedAt: ts,
        algorithm: crypto.algorithm,
        algorithmRaw: keyExchange,
        primitiveType: "KEY_ESTABLISHMENT",
        quantumClass: crypto.quantumClass,
        keySize: crypto.keySize,
        curve: entry.curve ?? crypto.curve,
        protocol: tlsVersion,
        endpoint,
        port,
        context: `Zeek ssl.log — cipher: ${entry.cipher}`,
        confidence: conf,
        rawPayload: entry,
      });
    }
    if (encryption) {
      const crypto = normalizeCrypto(encryption);
      obs.push({
        sensorType: ctx.sensorType,
        evidenceSource: "OBSERVED_LIVE",
        observedAt: ts,
        algorithm: crypto.algorithm,
        algorithmRaw: encryption,
        primitiveType: "SYMMETRIC_ENCRYPTION",
        quantumClass: crypto.quantumClass,
        keySize: crypto.keySize,
        protocol: tlsVersion,
        endpoint,
        port,
        context: `Zeek ssl.log — cipher: ${entry.cipher}`,
        confidence: conf,
        rawPayload: entry,
      });
    }
  }

  // Elliptic curve (if present independently)
  if (entry.curve && !entry.cipher?.toLowerCase().includes(entry.curve.toLowerCase())) {
    const crypto = normalizeCrypto(entry.curve);
    obs.push({
      sensorType: ctx.sensorType,
      evidenceSource: "OBSERVED_LIVE",
      observedAt: ts,
      algorithm: crypto.algorithm,
      algorithmRaw: entry.curve,
      primitiveType: "KEY_ESTABLISHMENT",
      quantumClass: crypto.quantumClass,
      curve: entry.curve,
      protocol: tlsVersion,
      endpoint,
      port,
      context: `Zeek ssl.log — ECDHE curve`,
      confidence: conf,
      rawPayload: entry,
    });
  }

  return obs;
}

function normalizeSshEntry(entry: ZeekSshLogEntry, ts: Date, ctx: ScanContext): SenqorObservation[] {
  const obs: SenqorObservation[] = [];
  const { endpoint, port } = connId(entry);
  const protocol = `SSH-${entry.version ?? "2.0"}`;
  const provider = entry.server ?? entry.client ?? undefined;
  const conf = computeConfidence("OBSERVED_LIVE", undefined, 0);

  const algoFields: Array<[string | undefined, import("../types/observation").PrimitiveType, string]> = [
    [entry.kex_alg,      "KEY_ESTABLISHMENT", "KEX"],
    [entry.cipher_alg,   "SYMMETRIC_ENCRYPTION", "Cipher"],
    [entry.mac_alg,      "MAC", "MAC"],
    [entry.host_key_alg, "DIGITAL_SIGNATURE", "Host key"],
  ];

  for (const [raw, primitiveType, label] of algoFields) {
    if (!raw) continue;
    const crypto = normalizeCrypto(raw);
    obs.push({
      sensorType: ctx.sensorType,
      evidenceSource: "OBSERVED_LIVE",
      observedAt: ts,
      algorithm: crypto.algorithm,
      algorithmRaw: raw,
      primitiveType: crypto.primitiveType ?? primitiveType,
      quantumClass: crypto.quantumClass,
      keySize: crypto.keySize,
      curve: crypto.curve,
      protocol,
      provider,
      endpoint,
      port,
      context: `Zeek ssh.log — ${label}`,
      confidence: conf,
      rawPayload: entry,
    });
  }

  return obs;
}

function normalizeX509Entry(entry: ZeekX509LogEntry, ts: Date, ctx: ScanContext): SenqorObservation[] {
  const cert = entry.certificate;
  if (!cert?.key_alg && !cert?.key_type) return [];
  const conf = computeConfidence("OBSERVED_LIVE", undefined, 0);

  const algoRaw = cert.key_alg ?? cert.key_type ?? "UNKNOWN";
  const crypto = normalizeCrypto(algoRaw);

  return [{
    sensorType: ctx.sensorType,
    evidenceSource: "OBSERVED_LIVE",
    observedAt: ts,
    algorithm: crypto.algorithm,
    algorithmRaw: algoRaw,
    primitiveType: "CERTIFICATE",
    quantumClass: crypto.quantumClass,
    keySize: cert.key_length ?? crypto.keySize,
    curve: cert.curve ?? crypto.curve,
    context: `Zeek x509.log — subject: ${cert.subject ?? "?"}`,
    confidence: conf,
    rawPayload: entry,
  }];
}
