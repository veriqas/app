/**
 * Native Node.js crypto dependency scanner.
 * Parses manifest files (package.json, requirements.txt, go.mod, pom.xml, Gemfile)
 * to identify cryptographic library dependencies and emits CryptoDepsOutput.
 */

import * as fs from "fs";
import * as path from "path";
import { walkFiles } from "./git-clone";
import type { CryptoDepsOutput, CryptoDepsFinding, CryptoDepsAlgorithmUsage } from "@/lib/sensors/adapters/cryptodeps.adapter";

interface KnownCryptoPackage {
  name: string | RegExp;
  ecosystem: string;
  crypto_implementations: CryptoDepsAlgorithmUsage[];
  direct?: boolean;
}

const KNOWN_CRYPTO_PACKAGES: KnownCryptoPackage[] = [
  // Node.js / npm
  { name: "jose",            ecosystem: "npm", direct: true, crypto_implementations: [
    { algorithm: "RSA-2048", quantum_risk: "VULNERABLE", primitive: "KEY_ESTABLISHMENT", usage_context: "JWT RSA signing", reachability: "CONFIRMED" },
    { algorithm: "ECDSA-P256", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "JWT ES256 signing", reachability: "CONFIRMED" },
    { algorithm: "HMAC-SHA256", quantum_risk: "PARTIAL", primitive: "MAC", usage_context: "JWT HS256 signing", reachability: "CONFIRMED" },
    { algorithm: "AES-256-GCM", quantum_risk: "PARTIAL", primitive: "SYMMETRIC_ENCRYPTION", usage_context: "JWE content encryption", reachability: "REACHABLE" },
  ]},
  { name: "jsonwebtoken",    ecosystem: "npm", direct: true, crypto_implementations: [
    { algorithm: "RSA-2048", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "JWT RS256", reachability: "CONFIRMED" },
    { algorithm: "ECDSA-P256", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "JWT ES256", reachability: "CONFIRMED" },
    { algorithm: "HMAC-SHA256", quantum_risk: "PARTIAL", primitive: "MAC", usage_context: "JWT HS256", reachability: "CONFIRMED" },
  ]},
  { name: "node-forge",      ecosystem: "npm", direct: true, crypto_implementations: [
    { algorithm: "RSA-2048", quantum_risk: "VULNERABLE", primitive: "KEY_ESTABLISHMENT", usage_context: "RSA key generation / encryption", reachability: "CONFIRMED" },
    { algorithm: "AES-256-CBC", quantum_risk: "PARTIAL", primitive: "SYMMETRIC_ENCRYPTION", usage_context: "AES encryption", reachability: "REACHABLE" },
    { algorithm: "SHA-256", quantum_risk: "PARTIAL", primitive: "HASH", usage_context: "Digest", reachability: "REACHABLE" },
  ]},
  { name: "bcrypt",          ecosystem: "npm", direct: true, crypto_implementations: [
    { algorithm: "BCRYPT", quantum_risk: "PARTIAL", primitive: "KEY_DERIVATION", usage_context: "Password hashing", reachability: "CONFIRMED" },
  ]},
  { name: "bcryptjs",        ecosystem: "npm", direct: true, crypto_implementations: [
    { algorithm: "BCRYPT", quantum_risk: "PARTIAL", primitive: "KEY_DERIVATION", usage_context: "Password hashing", reachability: "CONFIRMED" },
  ]},
  { name: "crypto-js",       ecosystem: "npm", direct: true, crypto_implementations: [
    { algorithm: "AES-256", quantum_risk: "PARTIAL", primitive: "SYMMETRIC_ENCRYPTION", usage_context: "AES encryption", reachability: "REACHABLE" },
    { algorithm: "SHA-256", quantum_risk: "PARTIAL", primitive: "HASH", usage_context: "Digest", reachability: "REACHABLE" },
    { algorithm: "MD5", quantum_risk: "VULNERABLE", primitive: "HASH", usage_context: "MD5 hash", reachability: "REACHABLE" },
    { algorithm: "3DES", quantum_risk: "VULNERABLE", primitive: "SYMMETRIC_ENCRYPTION", usage_context: "TripleDES encryption", reachability: "REACHABLE" },
    { algorithm: "RSA-2048", quantum_risk: "VULNERABLE", primitive: "KEY_ESTABLISHMENT", usage_context: "RSA encryption", reachability: "REACHABLE" },
  ]},
  { name: "elliptic",        ecosystem: "npm", direct: true, crypto_implementations: [
    { algorithm: "ECDSA-P256", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "EC signing / verification", reachability: "CONFIRMED" },
    { algorithm: "ECDH-P256",  quantum_risk: "VULNERABLE", primitive: "KEY_ESTABLISHMENT", usage_context: "ECDH key exchange", reachability: "REACHABLE" },
    { algorithm: "ECDSA-K256", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "secp256k1 signing (Bitcoin-style)", reachability: "REACHABLE" },
  ]},
  { name: "noble-curves",    ecosystem: "npm", direct: true, crypto_implementations: [
    { algorithm: "ECDSA-P256", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "EC signing", reachability: "CONFIRMED" },
    { algorithm: "ECDSA-K256", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "secp256k1 signing", reachability: "REACHABLE" },
    { algorithm: "Ed25519", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "EdDSA signing", reachability: "REACHABLE" },
  ]},
  { name: "@noble/curves",   ecosystem: "npm", direct: true, crypto_implementations: [
    { algorithm: "ECDSA-P256", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "EC signing", reachability: "CONFIRMED" },
    { algorithm: "Ed25519", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "EdDSA signing", reachability: "REACHABLE" },
  ]},
  { name: "@noble/hashes",   ecosystem: "npm", direct: true, crypto_implementations: [
    { algorithm: "SHA-256", quantum_risk: "PARTIAL", primitive: "HASH", usage_context: "Digest", reachability: "CONFIRMED" },
    { algorithm: "SHA-512", quantum_risk: "PARTIAL", primitive: "HASH", usage_context: "Digest", reachability: "REACHABLE" },
    { algorithm: "HMAC-SHA256", quantum_risk: "PARTIAL", primitive: "MAC", usage_context: "HMAC", reachability: "REACHABLE" },
  ]},
  { name: "tweetnacl",       ecosystem: "npm", direct: true, crypto_implementations: [
    { algorithm: "Ed25519", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "EdDSA signing", reachability: "CONFIRMED" },
    { algorithm: "X25519",  quantum_risk: "VULNERABLE", primitive: "KEY_ESTABLISHMENT", usage_context: "DH key exchange", reachability: "REACHABLE" },
    { algorithm: "XSalsa20-Poly1305", quantum_risk: "PARTIAL", primitive: "SYMMETRIC_ENCRYPTION", usage_context: "Secretbox encryption", reachability: "REACHABLE" },
  ]},
  { name: "libsodium-wrappers", ecosystem: "npm", direct: true, crypto_implementations: [
    { algorithm: "Ed25519", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "EdDSA signing", reachability: "CONFIRMED" },
    { algorithm: "X25519",  quantum_risk: "VULNERABLE", primitive: "KEY_ESTABLISHMENT", usage_context: "DH key exchange", reachability: "REACHABLE" },
    { algorithm: "ChaCha20-Poly1305", quantum_risk: "PARTIAL", primitive: "SYMMETRIC_ENCRYPTION", usage_context: "AEAD encryption", reachability: "REACHABLE" },
  ]},
  { name: "node-rsa",        ecosystem: "npm", direct: true, crypto_implementations: [
    { algorithm: "RSA-2048", quantum_risk: "VULNERABLE", primitive: "KEY_ESTABLISHMENT", usage_context: "RSA encryption / decryption", reachability: "CONFIRMED" },
  ]},
  { name: "ssh2",            ecosystem: "npm", direct: true, crypto_implementations: [
    { algorithm: "ECDSA-P256", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "SSH host key", reachability: "CONFIRMED" },
    { algorithm: "RSA-2048", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "SSH RSA key auth", reachability: "REACHABLE" },
    { algorithm: "DH-2048",  quantum_risk: "VULNERABLE", primitive: "KEY_ESTABLISHMENT", usage_context: "SSH key exchange", reachability: "CONFIRMED" },
    { algorithm: "AES-256-CTR", quantum_risk: "PARTIAL", primitive: "SYMMETRIC_ENCRYPTION", usage_context: "SSH transport encryption", reachability: "CONFIRMED" },
  ]},
  { name: "tls",             ecosystem: "npm", direct: true, crypto_implementations: [
    { algorithm: "RSA-2048", quantum_risk: "VULNERABLE", primitive: "KEY_ESTABLISHMENT", usage_context: "TLS handshake", reachability: "CONFIRMED" },
    { algorithm: "AES-256-GCM", quantum_risk: "PARTIAL", primitive: "SYMMETRIC_ENCRYPTION", usage_context: "TLS record encryption", reachability: "CONFIRMED" },
    { algorithm: "ECDH-P256", quantum_risk: "VULNERABLE", primitive: "KEY_ESTABLISHMENT", usage_context: "TLS ECDHE key exchange", reachability: "CONFIRMED" },
  ]},
  { name: "passport-jwt",    ecosystem: "npm", direct: true, crypto_implementations: [
    { algorithm: "RSA-2048", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "JWT verification", reachability: "REACHABLE" },
  ]},
  { name: /^openssl$/i,      ecosystem: "npm", direct: true, crypto_implementations: [
    { algorithm: "RSA-2048", quantum_risk: "VULNERABLE", primitive: "KEY_ESTABLISHMENT", usage_context: "OpenSSL bindings", reachability: "REACHABLE" },
  ]},

  // Python
  { name: "cryptography",    ecosystem: "pypi", direct: true, crypto_implementations: [
    { algorithm: "RSA-2048", quantum_risk: "VULNERABLE", primitive: "KEY_ESTABLISHMENT", usage_context: "RSA encryption", reachability: "REACHABLE" },
    { algorithm: "ECDSA-P256", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "EC signing", reachability: "REACHABLE" },
    { algorithm: "AES-256-GCM", quantum_risk: "PARTIAL", primitive: "SYMMETRIC_ENCRYPTION", usage_context: "Fernet / AES encryption", reachability: "REACHABLE" },
  ]},
  { name: "pycryptodome",    ecosystem: "pypi", direct: true, crypto_implementations: [
    { algorithm: "RSA-2048", quantum_risk: "VULNERABLE", primitive: "KEY_ESTABLISHMENT", usage_context: "RSA PKCS1", reachability: "CONFIRMED" },
    { algorithm: "AES-256", quantum_risk: "PARTIAL", primitive: "SYMMETRIC_ENCRYPTION", usage_context: "AES encryption", reachability: "CONFIRMED" },
    { algorithm: "3DES", quantum_risk: "VULNERABLE", primitive: "SYMMETRIC_ENCRYPTION", usage_context: "3DES encryption", reachability: "REACHABLE" },
  ]},
  { name: "pyjwt",           ecosystem: "pypi", direct: true, crypto_implementations: [
    { algorithm: "HMAC-SHA256", quantum_risk: "PARTIAL", primitive: "MAC", usage_context: "JWT HS256", reachability: "CONFIRMED" },
    { algorithm: "RSA-2048", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "JWT RS256", reachability: "REACHABLE" },
  ]},
  { name: "paramiko",        ecosystem: "pypi", direct: true, crypto_implementations: [
    { algorithm: "RSA-2048", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "SSH key auth", reachability: "CONFIRMED" },
    { algorithm: "ECDSA-P256", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "SSH ECDSA key", reachability: "REACHABLE" },
    { algorithm: "AES-256-CTR", quantum_risk: "PARTIAL", primitive: "SYMMETRIC_ENCRYPTION", usage_context: "SSH transport", reachability: "CONFIRMED" },
  ]},

  // Go
  { name: "golang.org/x/crypto", ecosystem: "go", direct: true, crypto_implementations: [
    { algorithm: "Ed25519", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "EdDSA", reachability: "REACHABLE" },
    { algorithm: "X25519", quantum_risk: "VULNERABLE", primitive: "KEY_ESTABLISHMENT", usage_context: "DH key exchange", reachability: "REACHABLE" },
    { algorithm: "ChaCha20-Poly1305", quantum_risk: "PARTIAL", primitive: "SYMMETRIC_ENCRYPTION", usage_context: "AEAD", reachability: "REACHABLE" },
    { algorithm: "BCRYPT", quantum_risk: "PARTIAL", primitive: "KEY_DERIVATION", usage_context: "Password hashing", reachability: "REACHABLE" },
  ]},
  { name: "github.com/lestrrat-go/jwx", ecosystem: "go", direct: true, crypto_implementations: [
    { algorithm: "RSA-2048", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "JWT RS256/RS512", reachability: "CONFIRMED" },
    { algorithm: "ECDSA-P256", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "JWT ES256", reachability: "CONFIRMED" },
    { algorithm: "AES-256-GCM", quantum_risk: "PARTIAL", primitive: "SYMMETRIC_ENCRYPTION", usage_context: "JWE A256GCM", reachability: "REACHABLE" },
  ]},
  { name: "github.com/dgrijalva/jwt-go", ecosystem: "go", direct: true, crypto_implementations: [
    { algorithm: "HMAC-SHA256", quantum_risk: "PARTIAL", primitive: "MAC", usage_context: "JWT HS256", reachability: "CONFIRMED" },
    { algorithm: "RSA-2048", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "JWT RS256", reachability: "REACHABLE" },
  ]},
  { name: "github.com/golang-jwt/jwt", ecosystem: "go", direct: true, crypto_implementations: [
    { algorithm: "HMAC-SHA256", quantum_risk: "PARTIAL", primitive: "MAC", usage_context: "JWT HS256", reachability: "CONFIRMED" },
    { algorithm: "RSA-2048", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "JWT RS256", reachability: "REACHABLE" },
    { algorithm: "ECDSA-P256", quantum_risk: "VULNERABLE", primitive: "DIGITAL_SIGNATURE", usage_context: "JWT ES256", reachability: "REACHABLE" },
  ]},
];

const MANIFEST_FILES = [
  "package.json",
  "requirements.txt",
  "go.mod",
  "pom.xml",
  "Gemfile",
  "Cargo.toml",
  "pyproject.toml",
];

function matchPackage(name: string): KnownCryptoPackage | undefined {
  const lower = name.toLowerCase();
  return KNOWN_CRYPTO_PACKAGES.find(p =>
    typeof p.name === "string" ? p.name.toLowerCase() === lower : p.name.test(name)
  );
}

function parsePackageJson(content: string): string[] {
  try {
    const pkg = JSON.parse(content);
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };
    return Object.keys(deps);
  } catch { return []; }
}

function parseRequirementsTxt(content: string): string[] {
  return content
    .split("\n")
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#") && !l.startsWith("-"))
    .map(l => l.split(/[>=<!;\[]/)[0].trim().toLowerCase());
}

function parseGoMod(content: string): string[] {
  const results: string[] = [];
  let inRequire = false;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "require (") { inRequire = true; continue; }
    if (trimmed === ")") { inRequire = false; continue; }
    if (trimmed.startsWith("require ") && !trimmed.includes("(")) {
      results.push(trimmed.replace("require ", "").split(" ")[0]);
      continue;
    }
    if (inRequire && trimmed) {
      results.push(trimmed.split(" ")[0]);
    }
  }
  return results;
}

function parsePomXml(content: string): string[] {
  const artifactIds: string[] = [];
  const matches = content.matchAll(/<artifactId>([^<]+)<\/artifactId>/g);
  for (const m of matches) artifactIds.push(m[1].trim());
  return artifactIds;
}

function parseGemfile(content: string): string[] {
  const results: string[] = [];
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*gem\s+['"]([^'"]+)['"]/);
    if (m) results.push(m[1]);
  }
  return results;
}

function parseCargoToml(content: string): string[] {
  const results: string[] = [];
  let inDeps = false;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[dependencies") || trimmed.startsWith("[dev-dependencies")) {
      inDeps = true; continue;
    }
    if (trimmed.startsWith("[") && inDeps) { inDeps = false; continue; }
    if (inDeps && trimmed && !trimmed.startsWith("#")) {
      const name = trimmed.split("=")[0].trim();
      if (name) results.push(name);
    }
  }
  return results;
}

function parsePyprojectToml(content: string): string[] {
  const results: string[] = [];
  let inDeps = false;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.includes("dependencies") && trimmed.includes("[")) { inDeps = true; continue; }
    if (trimmed.startsWith("[") && inDeps) { inDeps = false; continue; }
    if (inDeps && trimmed.startsWith('"')) {
      const name = trimmed.replace(/['"]/g, "").split(/[>=<!;\[]/)[0].trim();
      if (name) results.push(name);
    }
  }
  return results;
}

function parseManifest(filename: string, content: string): string[] {
  if (filename === "package.json")       return parsePackageJson(content);
  if (filename === "requirements.txt")   return parseRequirementsTxt(content);
  if (filename === "go.mod")             return parseGoMod(content);
  if (filename === "pom.xml")            return parsePomXml(content);
  if (filename === "Gemfile")            return parseGemfile(content);
  if (filename === "Cargo.toml")         return parseCargoToml(content);
  if (filename === "pyproject.toml")     return parsePyprojectToml(content);
  return [];
}

export async function runCryptodeps(repoDir: string): Promise<CryptoDepsOutput> {
  const findings: CryptoDepsFinding[] = [];
  const seen = new Set<string>();

  // Walk all files but only process manifest files
  for (const filePath of walkFiles(repoDir, [])) {
    const filename = path.basename(filePath);
    if (!MANIFEST_FILES.includes(filename)) continue;

    let content: string;
    try { content = fs.readFileSync(filePath, "utf-8"); } catch { continue; }

    const packages = parseManifest(filename, content);
    const relDir = path.relative(repoDir, path.dirname(filePath)).replace(/\\/g, "/") || ".";

    for (const pkgName of packages) {
      const match = matchPackage(pkgName);
      if (!match) continue;

      const key = `${pkgName}:${relDir}`;
      if (seen.has(key)) continue;
      seen.add(key);

      findings.push({
        package: pkgName,
        version: "detected",
        dependency_path: [relDir !== "." ? relDir : "root", pkgName],
        direct: match.direct ?? true,
        crypto_implementations: match.crypto_implementations,
      });
    }
  }

  return {
    tool: { name: "senqor-cryptodeps", version: "1.0.0" },
    scanned_at: new Date().toISOString(),
    findings,
  };
}
