/**
 * Nmap adapter — https://nmap.org
 * Normalises Nmap NSE script output (ssl-enum-ciphers, ssh2-enum-algos,
 * ssl-cert) into SENQOR observations.
 *
 * EvidenceSource: ACTIVE_HANDSHAKE
 */

import type { SensorAdapter } from "../types/sensor";
import type { SenqorObservation, ScanContext } from "../types/observation";
import type { NmapOutput } from "../../scanners/engines/nmap-engine";
import { normalizeCrypto, inferFromCipherSuite } from "../normalizer/crypto-normalizer";
import { computeConfidence } from "../normalizer/confidence-model";

// ── Cipher strength → quantumClass override ───────────────────────────────────
// Nmap grades cipher strength A/B/C/D/F — use as a confidence modifier

function strengthToConfidenceMod(strength: string): number {
  switch (strength.toUpperCase()) {
    case "A": return 0;
    case "B": return 0.1;
    case "C": return 0.2;
    case "D": return 0.3;
    case "F": return 0.4;
    default:  return 0.1;
  }
}

// ── SSL/TLS cipher output parser ──────────────────────────────────────────────
// ssl-enum-ciphers output format (text):
//   TLSv1.2:
//     ciphers:
//       TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 (secp256r1) - A
//     compressors:
//       NULL
//     cipher preference: server

function parseSslEnumCiphers(text: string, endpoint: string, port: number | undefined): SenqorObservation[] {
  const obs: SenqorObservation[] = [];
  let currentProtocol = "";

  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    // Protocol line: "TLSv1.2:" or "SSLv3:"
    const protocolMatch = trimmed.match(/^(TLS|SSL)v?([\d.]+):?$/i);
    if (protocolMatch) {
      currentProtocol = trimmed.replace(/:$/, "");
      continue;
    }

    // Cipher line: "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 (secp256r1) - A"
    const cipherMatch = trimmed.match(/^(TLS_\w+)(?:\s+\(([^)]+)\))?\s+-\s+([A-F])/);
    if (cipherMatch && currentProtocol) {
      const [, cipherName, curve, strength] = cipherMatch;
      const parts = inferFromCipherSuite(cipherName);
      const confidenceMod = strengthToConfidenceMod(strength);

      if (parts.keyExchange) {
        const crypto = normalizeCrypto(parts.keyExchange);
        obs.push({
          sensorType: "NMAP",
          evidenceSource: "ACTIVE_HANDSHAKE",
          observedAt: new Date(),
          algorithm: crypto.algorithm,
          algorithmRaw: parts.keyExchange,
          primitiveType: "KEY_ESTABLISHMENT",
          quantumClass: crypto.quantumClass,
          keySize: crypto.keySize,
          curve: curve ?? crypto.curve,
          protocol: currentProtocol,
          endpoint,
          port,
          context: `${cipherName} (strength: ${strength})`,
          confidence: computeConfidence("ACTIVE_HANDSHAKE", undefined, confidenceMod),
          rawPayload: { cipher: cipherName, curve, strength, protocol: currentProtocol },
        });
      }
    }
  }

  return obs;
}

// ── SSH algorithm output parser ───────────────────────────────────────────────
// ssh2-enum-algos output format (text):
//   kex_algorithms: (4)
//       curve25519-sha256
//       diffie-hellman-group14-sha256
//   server_host_key_algorithms: (3)
//       ecdsa-sha2-nistp256
//       ...

const SSH_SECTION_TO_PRIMITIVE: Record<string, string> = {
  kex_algorithms:                 "KEY_ESTABLISHMENT",
  server_host_key_algorithms:     "DIGITAL_SIGNATURE",
  encryption_algorithms_client_to_server: "SYMMETRIC_ENCRYPTION",
  encryption_algorithms_server_to_client: "SYMMETRIC_ENCRYPTION",
  mac_algorithms_client_to_server: "MAC",
  mac_algorithms_server_to_client: "MAC",
};

const SSH_ALGO_MAP: Record<string, string> = {
  "curve25519-sha256":                    "ECDH-X25519",
  "curve25519-sha256@libssh.org":         "ECDH-X25519",
  "diffie-hellman-group14-sha256":        "DH-2048",
  "diffie-hellman-group14-sha1":          "DH-2048",
  "diffie-hellman-group1-sha1":           "DH-1024",
  "diffie-hellman-group-exchange-sha256": "DH-2048",
  "diffie-hellman-group-exchange-sha1":   "DH-2048",
  "ecdh-sha2-nistp256":                   "ECDH-P256",
  "ecdh-sha2-nistp384":                   "ECDH-P384",
  "ecdh-sha2-nistp521":                   "ECDH-P521",
  "ssh-rsa":                              "RSA-2048",
  "rsa-sha2-256":                         "RSA-2048",
  "rsa-sha2-512":                         "RSA-4096",
  "ecdsa-sha2-nistp256":                  "ECDSA-P256",
  "ecdsa-sha2-nistp384":                  "ECDSA-P384",
  "ecdsa-sha2-nistp521":                  "ECDSA-P521",
  "ssh-ed25519":                          "Ed25519",
  "aes128-ctr":                           "AES-128",
  "aes192-ctr":                           "AES-128",  // AES-192 not in registry
  "aes256-ctr":                           "AES-256",
  "aes128-gcm@openssh.com":              "AES-128",
  "aes256-gcm@openssh.com":              "AES-256",
  "chacha20-poly1305@openssh.com":       "ChaCha20",
  "3des-cbc":                             "3DES",
  "hmac-sha1":                            "HMAC-SHA1",
  "hmac-sha2-256":                        "HMAC-SHA256",
  "hmac-sha2-512":                        "HMAC-SHA512",
  "hmac-md5":                             "HMAC-MD5",
};

function parseSsh2EnumAlgos(text: string, endpoint: string, port: number | undefined): SenqorObservation[] {
  const obs: SenqorObservation[] = [];
  let currentSection = "";

  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    // Section header: "kex_algorithms: (4)"
    const sectionMatch = trimmed.match(/^(\w+):\s*\(\d+\)/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }

    if (!currentSection || !trimmed || trimmed.startsWith("_")) continue;

    // Algorithm line
    const algoName = trimmed;
    const mappedAlgo = SSH_ALGO_MAP[algoName.toLowerCase()];
    if (!mappedAlgo) continue;

    const crypto = normalizeCrypto(mappedAlgo);
    const primitiveType = SSH_SECTION_TO_PRIMITIVE[currentSection] ?? "UNKNOWN";

    obs.push({
      sensorType: "NMAP",
      evidenceSource: "ACTIVE_HANDSHAKE",
      observedAt: new Date(),
      algorithm: crypto.algorithm,
      algorithmRaw: algoName,
      primitiveType: primitiveType as never,
      quantumClass: crypto.quantumClass,
      keySize: crypto.keySize,
      curve: crypto.curve,
      protocol: "SSH-2.0",
      endpoint,
      port,
      context: `SSH algorithm — ${currentSection}`,
      confidence: computeConfidence("ACTIVE_HANDSHAKE", undefined, 0),
      rawPayload: { algorithm: algoName, section: currentSection },
    });
  }

  return obs;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const nmapAdapter: SensorAdapter<NmapOutput> = {
  sensorType: "NMAP",
  displayName: "Nmap",
  evidenceSource: "ACTIVE_HANDSHAKE",

  validate(raw): raw is NmapOutput {
    return typeof raw === "object" && raw !== null && "hosts" in raw;
  },

  normalize(raw, ctx: ScanContext): SenqorObservation[] {
    const obs: SenqorObservation[] = [];

    try {
      for (const host of raw.hosts ?? []) {
        if (host.status !== "up") continue;
        const address = host.hostnames[0] ?? host.address;

        for (const port of host.ports) {
          if (port.state !== "open") continue;
          const endpoint = `${address}:${port.portId}`;

          // ssl-enum-ciphers script
          const sslScript = port.scripts["ssl-enum-ciphers"];
          if (sslScript) {
            obs.push(...parseSslEnumCiphers(sslScript, endpoint, port.portId));
          }

          // ssh2-enum-algos script
          const sshScript = port.scripts["ssh2-enum-algos"];
          if (sshScript) {
            obs.push(...parseSsh2EnumAlgos(sshScript, endpoint, port.portId));
          }

          // ssl-cert script — extract certificate algorithm
          const certScript = port.scripts["ssl-cert"];
          if (certScript) {
            const pkAlgoMatch = certScript.match(/Public Key Algorithm:\s*(\S+)/i);
            const keySizeMatch = certScript.match(/Public-Key:\s*\((\d+)/i);
            if (pkAlgoMatch) {
              const algoRaw = pkAlgoMatch[1];
              const keySize = keySizeMatch ? parseInt(keySizeMatch[1], 10) : undefined;
              const crypto = normalizeCrypto(`${algoRaw}-${keySize ?? ""}`);
              obs.push({
                sensorType: ctx.sensorType,
                evidenceSource: "ACTIVE_HANDSHAKE",
                observedAt: ctx.scannedAt,
                algorithm: crypto.algorithm ?? algoRaw,
                algorithmRaw: algoRaw,
                primitiveType: "CERTIFICATE",
                quantumClass: crypto.quantumClass,
                keySize: keySize ?? crypto.keySize,
                curve: crypto.curve,
                endpoint,
                port: port.portId,
                context: "TLS certificate public key",
                confidence: computeConfidence("ACTIVE_HANDSHAKE", undefined, 0),
                rawPayload: { script: certScript.slice(0, 500) },
              });
            }
          }
        }
      }
    } catch (e) {
      console.error("[NmapAdapter] normalize failed:", e);
    }

    return obs;
  },
};
