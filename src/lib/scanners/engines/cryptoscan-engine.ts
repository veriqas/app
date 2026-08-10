/**
 * Native Node.js crypto pattern scanner.
 * Scans source files for cryptographic API usage and emits CryptoScanOutput
 * compatible with the CryptoScan adapter.
 */

import * as fs from "fs";
import * as path from "path";
import { walkFiles } from "./git-clone";
import type { CryptoScanOutput, CryptoScanFinding } from "@/lib/sensors/adapters/cryptoscan.adapter";

interface Pattern {
  regex: RegExp;
  algorithm: string;
  primitive: string;
  quantum_risk: "VULNERABLE" | "PARTIAL" | "SAFE" | "UNKNOWN";
  purpose?: string;
  library?: string;
}

const PATTERNS: Pattern[] = [
  // RSA
  { regex: /(?:generateKeyPair|createPrivateKey|createPublicKey)\s*\(\s*['"]rsa['"]/i,          algorithm: "RSA-2048",    primitive: "KEY_ESTABLISHMENT",    quantum_risk: "VULNERABLE", library: "node:crypto" },
  { regex: /new\s+(?:NodeRSA|RSAKey|RSA)\s*\(/,                                                algorithm: "RSA-2048",    primitive: "KEY_ESTABLISHMENT",    quantum_risk: "VULNERABLE" },
  { regex: /forge\.pki\.rsa|forge\.rsa\./,                                                      algorithm: "RSA-2048",    primitive: "KEY_ESTABLISHMENT",    quantum_risk: "VULNERABLE", library: "node-forge" },
  { regex: /pkcs1|pkcs#1|rsaEncrypt|rsaDecrypt/i,                                              algorithm: "RSA-PKCS1",   primitive: "KEY_ESTABLISHMENT",    quantum_risk: "VULNERABLE" },
  { regex: /RSA_PKCS1_PADDING|RSA_OAEP_PADDING/,                                              algorithm: "RSA-OAEP",    primitive: "KEY_ESTABLISHMENT",    quantum_risk: "VULNERABLE" },
  { regex: /(?:KeyPairGenerator|KeyFactory)\.getInstance\s*\(\s*['"]RSA['"]/,                  algorithm: "RSA-2048",    primitive: "KEY_ESTABLISHMENT",    quantum_risk: "VULNERABLE", library: "java.security" },
  { regex: /from\s+cryptography\.hazmat\.primitives\.asymmetric(?:\.rsa)?\s+import/,           algorithm: "RSA-2048",    primitive: "KEY_ESTABLISHMENT",    quantum_risk: "VULNERABLE", library: "cryptography" },
  { regex: /Crypto\.PublicKey\.RSA|RSA\.generate\s*\(/,                                        algorithm: "RSA-2048",    primitive: "KEY_ESTABLISHMENT",    quantum_risk: "VULNERABLE", library: "pycryptodome" },
  { regex: /rsa\.GenerateKey|rsa\.SignPKCS1v15|rsa\.EncryptPKCS1v15/,                          algorithm: "RSA-2048",    primitive: "KEY_ESTABLISHMENT",    quantum_risk: "VULNERABLE", library: "crypto/rsa" },

  // ECDSA / ECDH
  { regex: /createECDH\s*\(/,                                                                   algorithm: "ECDH-P256",   primitive: "KEY_ESTABLISHMENT",    quantum_risk: "VULNERABLE", library: "node:crypto" },
  { regex: /(?:generateKeyPair|createPrivateKey)\s*\(\s*['"]ec['"]/i,                          algorithm: "ECDSA-P256",  primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE", library: "node:crypto" },
  { regex: /new\s+(?:elliptic\.)?(?:ec|EC)\s*\(\s*['"](?:p256|p384|p521|secp256k1)['"]/i,     algorithm: "ECDSA-P256",  primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE", library: "elliptic" },
  { regex: /p-256|P-256|prime256v1|secp256r1/,                                                 algorithm: "ECDSA-P256",  primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE" },
  { regex: /p-384|P-384|secp384r1/,                                                             algorithm: "ECDSA-P384",  primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE" },
  { regex: /p-521|P-521|secp521r1/,                                                             algorithm: "ECDSA-P521",  primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE" },
  { regex: /secp256k1/,                                                                          algorithm: "ECDSA-K256",  primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE" },
  { regex: /ec\.(?:sign|verify|genKeyPair)/,                                                    algorithm: "ECDSA-P256",  primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE", library: "elliptic" },
  { regex: /from\s+cryptography\.hazmat\.primitives\.asymmetric(?:\.ec)?\s+import\s+(?:EC|ECDSA|ECDH)/,   algorithm: "ECDSA-P256",  primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE", library: "cryptography" },
  { regex: /ecdsa\.(?:SigningKey|VerifyingKey)|ecdsa\.SECP256k1/,                               algorithm: "ECDSA-K256",  primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE", library: "ecdsa" },
  { regex: /elliptic\.GenerateKey|ecdsa\.Sign|ecdh\.GenerateKey/,                               algorithm: "ECDSA-P256",  primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE", library: "crypto/elliptic" },

  // Diffie-Hellman
  { regex: /createDiffieHellman\s*\(|getDiffieHellman\s*\(/,                                   algorithm: "DH-2048",     primitive: "KEY_ESTABLISHMENT",    quantum_risk: "VULNERABLE", library: "node:crypto" },
  { regex: /DHParameterSpec|KeyAgreement\.getInstance\s*\(\s*['"]DH['"]/,                       algorithm: "DH-2048",     primitive: "KEY_ESTABLISHMENT",    quantum_risk: "VULNERABLE", library: "java.security" },
  { regex: /dh\.GenerateParameters|dh\.ComputeKey/,                                             algorithm: "DH-2048",     primitive: "KEY_ESTABLISHMENT",    quantum_risk: "VULNERABLE", library: "crypto/dh" },

  // AES
  { regex: /createCipheriv\s*\(\s*['"]aes-/i,                                                  algorithm: "AES-256-CBC", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "PARTIAL",    library: "node:crypto" },
  { regex: /createDecipheriv\s*\(\s*['"]aes-/i,                                                algorithm: "AES-256-CBC", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "PARTIAL",    library: "node:crypto" },
  { regex: /AES\.new\s*\(|AES\.encrypt\s*\(|AES\.decrypt\s*\(/,                               algorithm: "AES-256",     primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "PARTIAL",    library: "pycryptodome" },
  { regex: /CryptoJS\.AES\./,                                                                   algorithm: "AES-256",     primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "PARTIAL",    library: "crypto-js" },
  { regex: /Cipher\.getInstance\s*\(\s*['"]AES/,                                                algorithm: "AES-256-CBC", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "PARTIAL",    library: "java.security" },
  { regex: /aes\.NewCipher|aes\.NewGCM/,                                                        algorithm: "AES-256-GCM", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "PARTIAL",    library: "crypto/aes" },
  { regex: /subtle\.encrypt\s*\(\s*\{[^}]*['"]AES/i,                                           algorithm: "AES-256-GCM", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "PARTIAL",    library: "WebCrypto" },

  // 3DES / DES
  { regex: /createCipheriv\s*\(\s*['"]des/i,                                                   algorithm: "3DES",        primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "VULNERABLE" },
  { regex: /DES\.new\s*\(|Triple_DES\.new\s*\(/,                                               algorithm: "3DES",        primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "VULNERABLE", library: "pycryptodome" },
  { regex: /DESede|des\.NewTripleDESCipher/,                                                    algorithm: "3DES",        primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "VULNERABLE" },

  // RC4
  { regex: /createCipheriv\s*\(\s*['"]rc4/i,                                                   algorithm: "RC4",         primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "VULNERABLE" },
  { regex: /RC4\.new\s*\(/,                                                                      algorithm: "RC4",         primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "VULNERABLE" },

  // SHA hashing
  { regex: /createHash\s*\(\s*['"]sha256['"]/i,                                                algorithm: "SHA-256",     primitive: "HASH",                 quantum_risk: "PARTIAL",    library: "node:crypto" },
  { regex: /createHash\s*\(\s*['"]sha384['"]/i,                                                algorithm: "SHA-384",     primitive: "HASH",                 quantum_risk: "PARTIAL",    library: "node:crypto" },
  { regex: /createHash\s*\(\s*['"]sha512['"]/i,                                                algorithm: "SHA-512",     primitive: "HASH",                 quantum_risk: "PARTIAL",    library: "node:crypto" },
  { regex: /createHash\s*\(\s*['"]sha1['"]/i,                                                  algorithm: "SHA-1",       primitive: "HASH",                 quantum_risk: "VULNERABLE" },
  { regex: /createHash\s*\(\s*['"]md5['"]/i,                                                   algorithm: "MD5",         primitive: "HASH",                 quantum_risk: "VULNERABLE" },
  { regex: /hashlib\.sha256\s*\(|hashlib\.sha384\s*\(|hashlib\.sha512\s*\(/,                   algorithm: "SHA-256",     primitive: "HASH",                 quantum_risk: "PARTIAL",    library: "hashlib" },
  { regex: /hashlib\.md5\s*\(|hashlib\.sha1\s*\(/,                                             algorithm: "MD5",         primitive: "HASH",                 quantum_risk: "VULNERABLE", library: "hashlib" },
  { regex: /MessageDigest\.getInstance\s*\(\s*['"]SHA-256['"]/,                                algorithm: "SHA-256",     primitive: "HASH",                 quantum_risk: "PARTIAL",    library: "java.security" },
  { regex: /sha256\.New\s*\(|sha512\.New\s*\(/,                                                algorithm: "SHA-256",     primitive: "HASH",                 quantum_risk: "PARTIAL",    library: "crypto/sha256" },
  { regex: /subtle\.digest\s*\(\s*['"]SHA-/i,                                                  algorithm: "SHA-256",     primitive: "HASH",                 quantum_risk: "PARTIAL",    library: "WebCrypto" },

  // HMAC
  { regex: /createHmac\s*\(\s*['"]sha256['"]/i,                                                algorithm: "HMAC-SHA256", primitive: "MAC",                  quantum_risk: "PARTIAL",    library: "node:crypto" },
  { regex: /createHmac\s*\(\s*['"]sha512['"]/i,                                                algorithm: "HMAC-SHA512", primitive: "MAC",                  quantum_risk: "PARTIAL",    library: "node:crypto" },
  { regex: /HMAC\.new\s*\(|hmac\.new\s*\(/,                                                    algorithm: "HMAC-SHA256", primitive: "MAC",                  quantum_risk: "PARTIAL",    library: "pycryptodome" },
  { regex: /hmac\.New\s*\(/,                                                                     algorithm: "HMAC-SHA256", primitive: "MAC",                  quantum_risk: "PARTIAL",    library: "crypto/hmac" },
  { regex: /subtle\.sign\s*\(\s*\{[^}]*['"]HMAC['"]/i,                                        algorithm: "HMAC-SHA256", primitive: "MAC",                  quantum_risk: "PARTIAL",    library: "WebCrypto" },

  // JWT (implies RSA/HMAC)
  { regex: /jwt\.sign\s*\(|jwt\.verify\s*\(/,                                                  algorithm: "HMAC-SHA256", primitive: "MAC",                  quantum_risk: "PARTIAL",    library: "jsonwebtoken", purpose: "JWT signing" },
  // JWT algorithm strings — match both `algorithm:` and bare `alg:` as used in jose/JOSE implementations
  { regex: /(?:algorithm|alg)\s*[=:]\s*['"]RS(256|384|512)['"]/,                              algorithm: "RSA-SHA",     primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE", purpose: "JWT RSA signature" },
  { regex: /(?:algorithm|alg)\s*[=:]\s*['"]ES(256|384|512)['"]/,                              algorithm: "ECDSA",       primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE", purpose: "JWT ECDSA signature" },
  { regex: /(?:algorithm|alg)\s*[=:]\s*['"]PS(256|384|512)['"]/,                              algorithm: "RSA-PSS",     primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE", purpose: "JWT RSA-PSS signature" },
  { regex: /(?:algorithm|alg)\s*[=:]\s*['"]RS256['"]/,                                        algorithm: "RSA-2048",    primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE", purpose: "JWT RS256" },
  { regex: /(?:algorithm|alg)\s*[=:]\s*['"]ES256['"]/,                                        algorithm: "ECDSA-P256",  primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE", purpose: "JWT ES256" },
  { regex: /(?:algorithm|alg)\s*[=:]\s*['"]PS256['"]/,                                        algorithm: "RSA-PSS",     primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE", purpose: "JWT PS256" },
  // RSA-OAEP, ECDH-ES as used in jose JWE
  { regex: /['"]RSA-OAEP(?:-256)?['"]/,                                                        algorithm: "RSA-OAEP",    primitive: "KEY_ESTABLISHMENT",    quantum_risk: "VULNERABLE", purpose: "JWE key wrapping" },
  { regex: /['"]ECDH-ES(?:\+A\d+KW)?['"]/,                                                    algorithm: "ECDH-ES",     primitive: "KEY_ESTABLISHMENT",    quantum_risk: "VULNERABLE", purpose: "JWE ECDH key agreement" },
  { regex: /['"]EdDSA['"]/,                                                                     algorithm: "Ed25519",     primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE", purpose: "JWT EdDSA (Ed25519/Ed448)" },

  // WebCrypto
  { regex: /subtle\.importKey.*['"]RSASSA-PKCS1-v1_5['"]/i,                                   algorithm: "RSA-PKCS1",   primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE", library: "WebCrypto" },
  { regex: /subtle\.importKey.*['"]RSA-OAEP['"]/i,                                             algorithm: "RSA-OAEP",    primitive: "KEY_ESTABLISHMENT",    quantum_risk: "VULNERABLE", library: "WebCrypto" },
  { regex: /subtle\.importKey.*['"]ECDSA['"]/i,                                                algorithm: "ECDSA-P256",  primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE", library: "WebCrypto" },
  { regex: /subtle\.importKey.*['"]ECDH['"]/i,                                                 algorithm: "ECDH-P256",   primitive: "KEY_ESTABLISHMENT",    quantum_risk: "VULNERABLE", library: "WebCrypto" },
  { regex: /subtle\.generateKey.*['"]RSA-OAEP['"]/i,                                           algorithm: "RSA-OAEP",    primitive: "KEY_ESTABLISHMENT",    quantum_risk: "VULNERABLE", library: "WebCrypto" },
  { regex: /subtle\.generateKey.*['"]ECDSA['"]/i,                                              algorithm: "ECDSA-P256",  primitive: "DIGITAL_SIGNATURE",    quantum_risk: "VULNERABLE", library: "WebCrypto" },

  // ── POST-QUANTUM (NIST standards + pre-standardisation) ────────────────────

  // ML-KEM (CRYSTALS-Kyber) — NIST FIPS 203
  { regex: /ML[-_]?KEM[-_]?(512|768|1024)/i,                                                  algorithm: "ML-KEM-768",  primitive: "KEY_ESTABLISHMENT",    quantum_risk: "SAFE",       purpose: "NIST FIPS 203 KEM" },
  { regex: /kyber[-_]?(512|768|1024)/i,                                                        algorithm: "Kyber-768",   primitive: "KEY_ESTABLISHMENT",    quantum_risk: "SAFE",       purpose: "Pre-standardisation ML-KEM" },
  { regex: /\bkyber\b/i,                                                                        algorithm: "Kyber",       primitive: "KEY_ESTABLISHMENT",    quantum_risk: "SAFE" },
  { regex: /import.*['"]@noble\/post-quantum['"]/,                                              algorithm: "ML-KEM-768",  primitive: "KEY_ESTABLISHMENT",    quantum_risk: "SAFE",       library: "@noble/post-quantum" },
  { regex: /from\s+liboqs\b|import\s+oqs\b/i,                                                  algorithm: "liboqs",      primitive: "KEY_ESTABLISHMENT",    quantum_risk: "SAFE",       library: "liboqs" },
  { regex: /oqs\.KeyEncapsulation\s*\(/,                                                        algorithm: "ML-KEM-768",  primitive: "KEY_ESTABLISHMENT",    quantum_risk: "SAFE",       library: "liboqs-python" },
  { regex: /KyberKeyGen|KyberEncaps|KyberDecaps/i,                                             algorithm: "Kyber",       primitive: "KEY_ESTABLISHMENT",    quantum_risk: "SAFE" },

  // ML-DSA (CRYSTALS-Dilithium) — NIST FIPS 204
  { regex: /ML[-_]?DSA[-_]?(44|65|87)/i,                                                      algorithm: "ML-DSA-65",   primitive: "DIGITAL_SIGNATURE",    quantum_risk: "SAFE",       purpose: "NIST FIPS 204 signature" },
  { regex: /dilithium[-_]?(2|3|5)/i,                                                           algorithm: "Dilithium3",  primitive: "DIGITAL_SIGNATURE",    quantum_risk: "SAFE",       purpose: "Pre-standardisation ML-DSA" },
  { regex: /\bdilithium\b/i,                                                                    algorithm: "Dilithium",   primitive: "DIGITAL_SIGNATURE",    quantum_risk: "SAFE" },
  { regex: /oqs\.Signature\s*\(\s*['"]Dilithium/i,                                             algorithm: "ML-DSA-65",   primitive: "DIGITAL_SIGNATURE",    quantum_risk: "SAFE",       library: "liboqs-python" },
  { regex: /DilithiumSign|DilithiumVerify/i,                                                   algorithm: "Dilithium",   primitive: "DIGITAL_SIGNATURE",    quantum_risk: "SAFE" },

  // SLH-DSA (SPHINCS+) — NIST FIPS 205
  { regex: /SLH[-_]?DSA/i,                                                                     algorithm: "SLH-DSA",     primitive: "DIGITAL_SIGNATURE",    quantum_risk: "SAFE",       purpose: "NIST FIPS 205 signature" },
  { regex: /sphincs\+?/i,                                                                       algorithm: "SPHINCS+",    primitive: "DIGITAL_SIGNATURE",    quantum_risk: "SAFE",       purpose: "Pre-standardisation SLH-DSA" },
  { regex: /oqs\.Signature\s*\(\s*['"]SPHINCS/i,                                               algorithm: "SPHINCS+",    primitive: "DIGITAL_SIGNATURE",    quantum_risk: "SAFE",       library: "liboqs-python" },

  // FN-DSA (Falcon)
  { regex: /FN[-_]?DSA[-_]?(512|1024)/i,                                                      algorithm: "FN-DSA-512",  primitive: "DIGITAL_SIGNATURE",    quantum_risk: "SAFE",       purpose: "Falcon NIST candidate" },
  { regex: /falcon[-_]?(512|1024)/i,                                                           algorithm: "Falcon-512",  primitive: "DIGITAL_SIGNATURE",    quantum_risk: "SAFE" },
  { regex: /oqs\.Signature\s*\(\s*['"]Falcon/i,                                                algorithm: "Falcon",      primitive: "DIGITAL_SIGNATURE",    quantum_risk: "SAFE",       library: "liboqs-python" },
  { regex: /FalconSign|FalconVerify/i,                                                          algorithm: "Falcon",      primitive: "DIGITAL_SIGNATURE",    quantum_risk: "SAFE" },

  // Classic McEliece
  { regex: /classic[-_]?mceliece|ClassicMcEliece/i,                                           algorithm: "Classic McEliece", primitive: "PUBLIC_KEY_ENCRYPTION", quantum_risk: "SAFE", purpose: "Code-based KEM" },
  { regex: /oqs\.KeyEncapsulation\s*\(\s*['"]ClassicMcEliece/i,                               algorithm: "Classic McEliece", primitive: "KEY_ESTABLISHMENT",    quantum_risk: "SAFE",  library: "liboqs-python" },

  // HQC
  { regex: /\bHQC[-_]?\d*/i,                                                                   algorithm: "HQC",         primitive: "KEY_ESTABLISHMENT",    quantum_risk: "SAFE",       purpose: "NIST alternate KEM" },
  { regex: /oqs\.KeyEncapsulation\s*\(\s*['"]HQC/i,                                           algorithm: "HQC",         primitive: "KEY_ESTABLISHMENT",    quantum_risk: "SAFE",       library: "liboqs-python" },

  // BIKE
  { regex: /\bBIKE[-_]?\d*/i,                                                                  algorithm: "BIKE",        primitive: "KEY_ESTABLISHMENT",    quantum_risk: "SAFE",       purpose: "Bit Flipping KEM" },

  // Hybrid TLS (classical + PQC)
  { regex: /X25519(?:Kyber|MLKEM|ML[-_]KEM)/i,                                                algorithm: "X25519+ML-KEM-768", primitive: "KEY_ESTABLISHMENT", quantum_risk: "SAFE",    purpose: "Hybrid TLS key exchange" },
  { regex: /SecP256r1Kyber768|p256_kyber768/i,                                                 algorithm: "P256+Kyber-768",   primitive: "KEY_ESTABLISHMENT", quantum_risk: "SAFE",    purpose: "Hybrid TLS key exchange" },
  { regex: /tlsext_kyber|BoringSSL.*kyber/i,                                                   algorithm: "Hybrid-TLS-KEM",  primitive: "KEY_ESTABLISHMENT", quantum_risk: "SAFE",    library: "BoringSSL" },

  // PQC library imports (catch-all)
  { regex: /require\s*\(\s*['"]pqcrypto['"]\)/,                                                algorithm: "pqcrypto",    primitive: "OTHER",                quantum_risk: "SAFE",       library: "pqcrypto" },
  { regex: /from\s+pqcrypto\b/,                                                                 algorithm: "pqcrypto",    primitive: "OTHER",                quantum_risk: "SAFE",       library: "pqcrypto" },
  { regex: /import\s+.*\bpqc\b/i,                                                              algorithm: "PQC-library", primitive: "OTHER",                quantum_risk: "SAFE" },
  { regex: /Botan::(Kyber|ML_KEM|Dilithium|ML_DSA|SPHINCS_Plus|Falcon)/,                      algorithm: "Botan-PQC",   primitive: "OTHER",                quantum_risk: "SAFE",       library: "Botan" },
  { regex: /aws[-_]lc.*kyber|aws[-_]lc.*dilithium/i,                                           algorithm: "AWS-LC-PQC",  primitive: "OTHER",                quantum_risk: "SAFE",       library: "aws-lc" },
];

const CODE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".java", ".go", ".cs", ".cpp", ".c", ".rb", ".rs", ".kt", ".swift",
];

export async function runCryptoscan(repoDir: string, repoUrl: string): Promise<CryptoScanOutput> {
  const findings: CryptoScanFinding[] = [];
  const seen = new Set<string>();

  for (const filePath of walkFiles(repoDir, CODE_EXTENSIONS)) {
    let content: string;
    try { content = fs.readFileSync(filePath, "utf-8"); } catch { continue; }

    const lines = content.split("\n");
    const relPath = path.relative(repoDir, filePath).replace(/\\/g, "/");

    let fileCount = 0;
    outer: for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const pattern of PATTERNS) {
        if (!pattern.regex.test(line)) continue;

        const dedupeKey = `${relPath}:${i + 1}:${pattern.algorithm}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        findings.push({
          pattern_id: `SENQOR-${pattern.algorithm.replace(/[^A-Z0-9]/g, "-")}`,
          category: pattern.primitive,
          algorithm: pattern.algorithm,
          primitive: pattern.primitive,
          quantum_risk: pattern.quantum_risk,
          library: pattern.library,
          purpose: pattern.purpose,
          file: relPath,
          line: i + 1,
          confidence: 78,
          context: line.trim().slice(0, 120),
        });

        fileCount++;
        if (fileCount >= 20) break outer;  // hard cap per file, exits both loops
        break; // only one pattern match per line
      }
    }

    // Cap total findings for perf
    if (findings.length >= 500) break;
  }

  return {
    tool: { name: "senqor-cryptoscan", version: "1.0.0" },
    findings,
    scan_timestamp: new Date().toISOString(),
  };
}
