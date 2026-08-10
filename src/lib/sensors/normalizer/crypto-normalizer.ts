/**
 * Crypto normalizer — converts raw scanner strings into canonical SENQOR fields.
 * Separates public-key quantum vulnerability from symmetric security considerations.
 */

import { lookupAlgorithm } from "./algorithm-registry";
import type { PrimitiveType, QuantumClass } from "../types/observation";

export interface NormalizedCrypto {
  algorithm: string;          // canonical name
  algorithmRaw: string;       // original scanner string
  primitiveType?: PrimitiveType;
  quantumClass: QuantumClass;
  keySize?: number;
  curve?: string;
  parameterSet?: string;
  isUnknown: boolean;         // true when normalization could not resolve
}

export function normalizeCrypto(raw: string, hintKeySize?: number): NormalizedCrypto {
  const entry = lookupAlgorithm(raw);

  if (entry) {
    return {
      algorithm: entry.name,
      algorithmRaw: raw,
      primitiveType: entry.primitiveType,
      quantumClass: entry.quantumClass,
      keySize: hintKeySize ?? entry.keySize,
      curve: entry.curve,
      parameterSet: entry.parameterSet,
      isUnknown: false,
    };
  }

  // Could not resolve — keep raw, mark unknown
  return {
    algorithm: raw,
    algorithmRaw: raw,
    quantumClass: "UNKNOWN",
    keySize: hintKeySize,
    isUnknown: true,
  };
}

/**
 * Infer primitive type from TLS cipher suite string.
 * e.g. "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384"
 */
export function inferFromCipherSuite(suite: string): {
  keyExchange?: string;
  authentication?: string;
  encryption?: string;
  mac?: string;
} {
  const s = suite.toUpperCase();
  const result: { keyExchange?: string; authentication?: string; encryption?: string; mac?: string } = {};

  // Key exchange
  if (s.includes("ECDHE")) result.keyExchange = "ECDHE";
  else if (s.includes("DHE")) result.keyExchange = "DHE";
  else if (s.includes("DH_")) result.keyExchange = "DH";
  else if (s.includes("RSA")) result.keyExchange = "RSA";

  // Authentication
  if (s.includes("_ECDSA_")) result.authentication = "ECDSA";
  else if (s.includes("_RSA_")) result.authentication = "RSA";
  else if (s.includes("_PSK_")) result.authentication = "PSK";

  // Encryption
  if (s.includes("AES_256_GCM")) result.encryption = "AES-256-GCM";
  else if (s.includes("AES_128_GCM")) result.encryption = "AES-128-GCM";
  else if (s.includes("AES_256_CBC")) result.encryption = "AES-256-CBC";
  else if (s.includes("AES_128_CBC")) result.encryption = "AES-128-CBC";
  else if (s.includes("CHACHA20_POLY1305")) result.encryption = "ChaCha20-Poly1305";
  else if (s.includes("3DES")) result.encryption = "3DES";
  else if (s.includes("RC4")) result.encryption = "RC4";

  // MAC
  if (s.includes("_SHA384")) result.mac = "HMAC-SHA384";
  else if (s.includes("_SHA256")) result.mac = "HMAC-SHA256";
  else if (s.includes("_SHA1") || s.endsWith("_SHA")) result.mac = "HMAC-SHA1";
  else if (s.includes("_MD5")) result.mac = "HMAC-MD5";

  return result;
}

/**
 * Parse a TLS version string from any scanner to a canonical form.
 */
export function canonicalizeTlsVersion(raw: string): string {
  const s = raw.toLowerCase().replace(/\s/g, "");
  if (s === "tls1.3" || s === "tlsv1.3" || s === "tls13" || s === "0x0304") return "TLS 1.3";
  if (s === "tls1.2" || s === "tlsv1.2" || s === "tls12" || s === "0x0303") return "TLS 1.2";
  if (s === "tls1.1" || s === "tlsv1.1" || s === "tls11" || s === "0x0302") return "TLS 1.1";
  if (s === "tls1.0" || s === "tlsv1.0" || s === "tls10" || s === "0x0301") return "TLS 1.0";
  if (s === "ssl3.0" || s === "sslv3"   || s === "ssl3"  || s === "0x0300") return "SSL 3.0";
  if (s === "ssl2.0" || s === "sslv2"   || s === "0x0002") return "SSL 2.0";
  return raw;
}
