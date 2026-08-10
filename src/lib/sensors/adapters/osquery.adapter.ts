import type { SensorAdapter } from "../types/sensor";
import type { SenqorObservation, ScanContext } from "../types/observation";
import type { OsqueryOutput, OsqueryRow } from "@/lib/scanners/engines/osquery-engine";
import { normalizeCrypto } from "../normalizer/crypto-normalizer";
import { computeConfidence } from "../normalizer/confidence-model";

function adaptCertificates(rows: OsqueryRow[], ctx: ScanContext): SenqorObservation[] {
  return rows.map(row => ({
    sensorType:     ctx.sensorType,
    evidenceSource: "RUNTIME_TELEMETRY" as const,
    observedAt:     ctx.scannedAt,
    algorithm:      "X509",
    algorithmRaw:   "certificate",
    quantumClass:   "UNKNOWN" as const,
    confidence:     computeConfidence("RUNTIME_TELEMETRY", 80, 0),
    context:        `Certificate: ${row.common_name ?? "?"}, issuer: ${row.issuer ?? "?"}`,
    rawPayload:     row,
    notes:          `Host certificate from osquery. SHA1: ${row.sha1 ?? "?"}. Expires: ${row.not_valid_after ?? "?"}`,
  }));
}

function adaptSshKeys(rows: OsqueryRow[], ctx: ScanContext): SenqorObservation[] {
  return rows.map(row => {
    const crypto = normalizeCrypto("SSH_KEY");
    return {
      sensorType:     ctx.sensorType,
      evidenceSource: "RUNTIME_TELEMETRY" as const,
      observedAt:     ctx.scannedAt,
      algorithm:      crypto.algorithm ?? "SSH_KEY",
      algorithmRaw:   "ssh-key",
      quantumClass:   crypto.quantumClass ?? ("CLASSICAL" as const),
      confidence:     computeConfidence("RUNTIME_TELEMETRY", 75, 0),
      filePath:       row.path || undefined,
      context:        `SSH key uid=${row.uid ?? "?"} encrypted=${row.encrypted ?? "?"}`,
      rawPayload:     row,
      notes:          row.encrypted === "0" ? "Unencrypted SSH private key detected" : "SSH key",
    };
  });
}

function adaptTlsConnections(rows: OsqueryRow[], ctx: ScanContext): SenqorObservation[] {
  return rows.map(row => ({
    sensorType:     ctx.sensorType,
    evidenceSource: "RUNTIME_TELEMETRY" as const,
    observedAt:     ctx.scannedAt,
    algorithm:      "TLS",
    algorithmRaw:   "tls-connection",
    quantumClass:   "UNKNOWN" as const,
    confidence:     computeConfidence("RUNTIME_TELEMETRY", 70, 0),
    endpoint:       row.remote_address ? `${row.remote_address}:${row.remote_port}` : undefined,
    port:           row.remote_port ? parseInt(row.remote_port, 10) : undefined,
    context:        `Active TLS connection pid=${row.pid ?? "?"}`,
    rawPayload:     row,
  }));
}

export const osqueryAdapter: SensorAdapter<OsqueryOutput> = {
  sensorType: "OSQUERY",
  displayName: "osquery",
  evidenceSource: "RUNTIME_TELEMETRY",

  validate(raw): raw is OsqueryOutput {
    return typeof raw === "object" && raw !== null && Array.isArray((raw as OsqueryOutput).results);
  },

  normalize(raw: OsqueryOutput, ctx: ScanContext): SenqorObservation[] {
    const obs: SenqorObservation[] = [];
    try {
      for (const qr of raw.results) {
        switch (qr.query) {
          case "certificates":
            obs.push(...adaptCertificates(qr.rows, ctx));
            break;
          case "ssh_keys":
            obs.push(...adaptSshKeys(qr.rows, ctx));
            break;
          case "tls_connections":
            obs.push(...adaptTlsConnections(qr.rows, ctx));
            break;
          // listening_ports: structural context, no direct crypto observation
        }
      }
    } catch (e) {
      console.error("[OsqueryAdapter] normalize failed:", e);
    }
    return obs;
  },
};
