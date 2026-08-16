/**
 * AST-aware source-code cryptography scanner (CRYPTOSCAN_AST).
 *
 * Unlike the regex CRYPTOSCAN, this engine parses TypeScript/JavaScript into a
 * syntax tree and detects cryptography from actual CALL EXPRESSIONS — resolving
 * the algorithm even when it is passed through a variable/const, and following
 * imported crypto APIs. This:
 *   - catches crypto behind variables/wrappers that regex misses
 *     (e.g. `const a='md5'; createHash(a)`), and
 *   - structurally ignores false positives: a business string like
 *     `const RSA = 'Regional Sales Analysis'` is a variable declaration, not a
 *     crypto call, so it is never flagged.
 *
 * Library coverage (JS/TS): Node `crypto` (builtin), WebCrypto / SubtleCrypto,
 * crypto-js, node-forge, bcrypt/bcryptjs, jose, tweetnacl and elliptic. Key
 * sizes (`modulusLength`) and named curves (`namedCurve`) are extracted where
 * present so RSA-2048 vs RSA-4096 and the EC curve are distinguished.
 *
 * Emits the same CryptoScanOutput shape as CRYPTOSCAN, so it reuses the existing
 * CryptoScan adapter and flows into correlation → remediation → verification
 * unchanged. TypeScript/JavaScript first; other languages are covered by the
 * existing scanners and future AST parsers.
 */
import * as fs from "fs";
import * as path from "path";
import ts from "typescript";
import { walkFiles } from "./git-clone";
import type { CryptoScanOutput, CryptoScanFinding } from "@/lib/sensors/adapters/cryptoscan.adapter";

const JS_TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const MAX_PER_FILE = 20;
const MAX_TOTAL = 500;

type Risk = "VULNERABLE" | "PARTIAL" | "SAFE" | "UNKNOWN";
interface AlgoInfo { algorithm: string; primitive: string; quantum_risk: Risk; purpose?: string; }

// ── Algorithm classification from a resolved algorithm string ──────────────────
function classifyKeyType(raw: string): AlgoInfo | null {
  const n = raw.toLowerCase();
  if (n === "rsa" || n.startsWith("rsa")) return { algorithm: "RSA-2048", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "RSA key generation" };
  if (n === "ec" || n === "ecdsa") return { algorithm: "ECDSA-P256", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "EC key generation" };
  if (n === "ed25519") return { algorithm: "Ed25519", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "EdDSA key generation" };
  if (n === "ed448") return { algorithm: "Ed448", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "EdDSA key generation" };
  if (n === "x25519") return { algorithm: "X25519", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "key agreement" };
  if (n === "x448") return { algorithm: "ECDH-X448", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "key agreement" };
  if (n === "dsa") return { algorithm: "DSA", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "DSA key generation" };
  if (n === "dh") return { algorithm: "DH", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "Diffie-Hellman" };
  return null;
}
function classifyHash(raw: string): AlgoInfo | null {
  const n = raw.toLowerCase().replace(/[-_]/g, "");
  if (n.includes("md5")) return { algorithm: "MD5", primitive: "HASH", quantum_risk: "VULNERABLE", purpose: "content hashing" };
  if (n.includes("md4")) return { algorithm: "MD4", primitive: "HASH", quantum_risk: "VULNERABLE", purpose: "content hashing" };
  if (n.includes("ripemd")) return { algorithm: "RIPEMD-160", primitive: "HASH", quantum_risk: "VULNERABLE", purpose: "content hashing" };
  if (n === "sha1" || n.includes("sha1")) return { algorithm: "SHA-1", primitive: "HASH", quantum_risk: "VULNERABLE", purpose: "content hashing" };
  if (n.includes("sha3512")) return { algorithm: "SHA3-512", primitive: "HASH", quantum_risk: "PARTIAL", purpose: "content hashing" };
  if (n.includes("sha3384")) return { algorithm: "SHA3-384", primitive: "HASH", quantum_risk: "PARTIAL", purpose: "content hashing" };
  if (n.includes("sha3256") || n.includes("sha3")) return { algorithm: "SHA3-256", primitive: "HASH", quantum_risk: "PARTIAL", purpose: "content hashing" };
  if (n.includes("sha224")) return { algorithm: "SHA-224", primitive: "HASH", quantum_risk: "PARTIAL", purpose: "content hashing" };
  if (n.includes("sha256")) return { algorithm: "SHA-256", primitive: "HASH", quantum_risk: "PARTIAL", purpose: "content hashing" };
  if (n.includes("sha384")) return { algorithm: "SHA-384", primitive: "HASH", quantum_risk: "PARTIAL" };
  if (n.includes("sha512")) return { algorithm: "SHA-512", primitive: "HASH", quantum_risk: "PARTIAL" };
  return null;
}
function classifySignAlg(raw: string): AlgoInfo | null {
  const n = raw.toLowerCase();
  if (n.includes("rsa")) return { algorithm: "RSA-SHA", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "digital signature" };
  if (n.includes("ecdsa") || n.includes("ec-")) return { algorithm: "ECDSA-P256", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "digital signature" };
  if (n.includes("ed25519")) return { algorithm: "Ed25519", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "digital signature" };
  return null;
}
function classifyCipher(raw: string): AlgoInfo | null {
  const n = raw.toLowerCase();
  if (n.includes("aes")) return { algorithm: "AES", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "PARTIAL", purpose: "symmetric encryption" };
  if (n.includes("3des") || n.includes("des-ede") || n.includes("tripledes")) return { algorithm: "3DES", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "VULNERABLE", purpose: "symmetric encryption" };
  if (n.includes("des")) return { algorithm: "DES", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "VULNERABLE", purpose: "symmetric encryption" };
  if (n.includes("rc4")) return { algorithm: "RC4", primitive: "STREAM_CIPHER", quantum_risk: "VULNERABLE", purpose: "stream cipher" };
  if (n.includes("rc2")) return { algorithm: "RC2", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "VULNERABLE", purpose: "symmetric encryption" };
  if (n.includes("blowfish") || n === "bf") return { algorithm: "Blowfish", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "VULNERABLE", purpose: "symmetric encryption" };
  if (n.includes("chacha")) return { algorithm: "ChaCha20", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "PARTIAL" };
  return null;
}
function classifyKdf(raw: string): AlgoInfo | null {
  const n = raw.toLowerCase();
  if (n.includes("bcrypt")) return { algorithm: "bcrypt", primitive: "KEY_DERIVATION", quantum_risk: "PARTIAL", purpose: "password hashing" };
  if (n.includes("scrypt")) return { algorithm: "scrypt", primitive: "KEY_DERIVATION", quantum_risk: "PARTIAL", purpose: "password hashing" };
  if (n.includes("argon")) return { algorithm: "Argon2", primitive: "KEY_DERIVATION", quantum_risk: "PARTIAL", purpose: "password hashing" };
  if (n.includes("pbkdf2")) return { algorithm: "PBKDF2", primitive: "KEY_DERIVATION", quantum_risk: "PARTIAL", purpose: "key derivation" };
  if (n.includes("hkdf")) return { algorithm: "HKDF", primitive: "KEY_DERIVATION", quantum_risk: "PARTIAL", purpose: "key derivation" };
  return null;
}
function classifyJwtAlg(raw: string): AlgoInfo | null {
  const n = raw.toUpperCase();
  if (/^RS(256|384|512)$/.test(n) || /^PS(256|384|512)$/.test(n)) return { algorithm: "RSA-SHA", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "JWT RSA signature" };
  if (/^ES(256|384|512)$/.test(n)) return { algorithm: "ECDSA-P256", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "JWT ECDSA signature" };
  if (n === "EDDSA") return { algorithm: "Ed25519", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "JWT EdDSA signature" };
  if (/^HS(256|384|512)$/.test(n)) return { algorithm: "HMAC-SHA256", primitive: "MAC", quantum_risk: "PARTIAL", purpose: "JWT HMAC signature" };
  // JOSE key-management algorithms
  if (n.startsWith("RSA-OAEP") || n === "RSA1_5") return { algorithm: "RSA-OAEP", primitive: "PUBLIC_KEY_ENCRYPTION", quantum_risk: "VULNERABLE", purpose: "JWE key wrap" };
  if (n.startsWith("ECDH-ES")) return { algorithm: "ECDH", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "JWE key agreement" };
  return null;
}
// JOSE content-encryption (`enc`) values, e.g. A256GCM, A128CBC-HS256.
function classifyJoseEnc(raw: string): AlgoInfo | null {
  const n = raw.toUpperCase();
  if (/^A(128|192|256)GCM$/.test(n) || /^A(128|192|256)CBC/.test(n)) return { algorithm: "AES", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "PARTIAL", purpose: "JWE content encryption" };
  return null;
}
// Named curve → concrete algorithm identity.
function classifyCurve(raw: string): AlgoInfo | null {
  const n = raw.toLowerCase().replace(/[-_]/g, "");
  if (n === "p256" || n === "prime256v1" || n === "secp256r1") return { algorithm: "ECDSA-P256", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "elliptic curve" };
  if (n === "p384" || n === "secp384r1") return { algorithm: "ECDSA-P384", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "elliptic curve" };
  if (n === "p521" || n === "secp521r1") return { algorithm: "ECDSA-P521", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "elliptic curve" };
  if (n === "secp256k1") return { algorithm: "ECDSA-K256", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "elliptic curve secp256k1" };
  if (n === "ed25519") return { algorithm: "Ed25519", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "elliptic curve" };
  if (n === "curve25519" || n === "x25519") return { algorithm: "X25519", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "elliptic curve" };
  return null;
}
// WebCrypto algorithm `name` → identity (SubtleCrypto).
function classifyWebCryptoName(raw: string): AlgoInfo | null {
  const n = raw.toUpperCase();
  if (n === "RSASSA-PKCS1-V1_5") return { algorithm: "RSA-SHA", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "WebCrypto RSA signature" };
  if (n === "RSA-PSS") return { algorithm: "RSA-PSS", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "WebCrypto RSA-PSS signature" };
  if (n === "RSA-OAEP") return { algorithm: "RSA-OAEP", primitive: "PUBLIC_KEY_ENCRYPTION", quantum_risk: "VULNERABLE", purpose: "WebCrypto RSA encryption" };
  if (n === "ECDSA") return { algorithm: "ECDSA-P256", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "WebCrypto ECDSA signature" };
  if (n === "ECDH") return { algorithm: "ECDH", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "WebCrypto ECDH" };
  if (n === "ED25519") return { algorithm: "Ed25519", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "WebCrypto EdDSA signature" };
  if (n === "X25519") return { algorithm: "X25519", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "WebCrypto X25519" };
  if (n.startsWith("AES")) return { algorithm: "AES", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "PARTIAL", purpose: "WebCrypto AES" };
  if (n === "HMAC") return { algorithm: "HMAC-SHA256", primitive: "MAC", quantum_risk: "PARTIAL", purpose: "WebCrypto HMAC" };
  if (n === "PBKDF2") return { algorithm: "PBKDF2", primitive: "KEY_DERIVATION", quantum_risk: "PARTIAL", purpose: "WebCrypto PBKDF2" };
  if (n === "HKDF") return { algorithm: "HKDF", primitive: "KEY_DERIVATION", quantum_risk: "PARTIAL", purpose: "WebCrypto HKDF" };
  return null;
}
// crypto-js top-level algorithm token, e.g. CryptoJS.MD5 / CryptoJS.AES.encrypt.
// Canonical MAC name for a hash, e.g. SHA-256 -> HMAC-SHA256. The downstream
// normalizer recognizes the undashed form; emitting `HMAC-SHA-256` would split
// correlation into duplicate cases for the same primitive.
function hmacName(h: AlgoInfo): AlgoInfo {
  return { ...h, algorithm: `HMAC-${h.algorithm.replace(/-/g, "")}`, primitive: "MAC", purpose: h.purpose ?? "HMAC" };
}
function classifyCryptoJs(token: string): AlgoInfo | null {
  const n = token.toLowerCase();
  if (n.startsWith("hmac")) { const h = classifyHash(n.slice(4)); return h ? hmacName(h) : null; }
  if (n === "aes") return { algorithm: "AES", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "PARTIAL", purpose: "symmetric encryption" };
  if (n === "des") return { algorithm: "DES", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "VULNERABLE", purpose: "symmetric encryption" };
  if (n === "tripledes") return { algorithm: "3DES", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "VULNERABLE", purpose: "symmetric encryption" };
  if (n === "rc4" || n === "rc4drop") return { algorithm: "RC4", primitive: "STREAM_CIPHER", quantum_risk: "VULNERABLE", purpose: "stream cipher" };
  if (n === "rabbit") return { algorithm: "Rabbit", primitive: "STREAM_CIPHER", quantum_risk: "UNKNOWN", purpose: "stream cipher" };
  if (n === "pbkdf2") return { algorithm: "PBKDF2", primitive: "KEY_DERIVATION", quantum_risk: "PARTIAL", purpose: "key derivation" };
  return classifyHash(n);
}

function analyzeFile(sourceText: string, relPath: string, out: CryptoScanFinding[]): void {
  const sf = ts.createSourceFile(relPath, sourceText, ts.ScriptTarget.Latest, true, relPath.endsWith(".tsx") || relPath.endsWith(".jsx") ? ts.ScriptKind.TSX : undefined);

  // Unwrap `x as T`, `<T>x`, and `(x)` so casts/parens don't hide the real node.
  const unwrap = (e: ts.Expression): ts.Expression => {
    let cur: ts.Expression = e;
    while (ts.isAsExpression(cur) || ts.isTypeAssertionExpression(cur) || ts.isParenthesizedExpression(cur)) cur = cur.expression;
    return cur;
  };

  // Read a string-valued property from an object literal (unwrapping casts).
  const strProp = (obj: ts.ObjectLiteralExpression, ...names: string[]): string | undefined => {
    for (const p of obj.properties) {
      if (ts.isPropertyAssignment(p) && p.name && ts.isIdentifier(p.name) && names.includes(p.name.text)) {
        const init = unwrap(p.initializer);
        if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) return init.text;
      }
    }
    return undefined;
  };
  // Read a numeric-valued property from an object literal.
  const numProp = (obj: ts.ObjectLiteralExpression, name: string): number | undefined => {
    for (const p of obj.properties) {
      if (ts.isPropertyAssignment(p) && p.name && ts.isIdentifier(p.name) && p.name.text === name) {
        const init = unwrap(p.initializer);
        if (ts.isNumericLiteral(init)) return Number(init.text);
      }
    }
    return undefined;
  };
  const algInObject = (obj: ts.ObjectLiteralExpression): string | undefined => strProp(obj, "algorithm", "alg", "name");

  // Pass 1: data-flow-lite. Track const string values, the algorithm string of
  // const option objects, AND the object-literal node so its params (modulusLength,
  // namedCurve, name) can be resolved when the object is passed by reference.
  const stringConsts = new Map<string, string>();
  const objectConstAlg = new Map<string, string>();
  const objectConsts = new Map<string, ts.ObjectLiteralExpression>();
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.initializer) {
      const init = unwrap(node.initializer);
      if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) stringConsts.set(node.name.text, init.text);
      else if (ts.isObjectLiteralExpression(init)) {
        objectConsts.set(node.name.text, init);
        const a = algInObject(init); if (a) objectConstAlg.set(node.name.text, a);
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(sf);

  const resolveString = (arg: ts.Expression | undefined): string | undefined => {
    if (!arg) return undefined;
    const a = unwrap(arg);
    if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) return a.text;
    if (ts.isIdentifier(a)) return stringConsts.get(a.text);
    return undefined;
  };
  // Resolve an argument to an object literal — inline or via a const reference.
  const resolveObject = (arg: ts.Expression | undefined): ts.ObjectLiteralExpression | undefined => {
    if (!arg) return undefined;
    const a = unwrap(arg);
    if (ts.isObjectLiteralExpression(a)) return a;
    if (ts.isIdentifier(a)) return objectConsts.get(a.text);
    return undefined;
  };

  const methodName = (expr: ts.Expression): string | null => {
    if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
    if (ts.isIdentifier(expr)) return expr.text;
    return null;
  };
  // Full dotted member path, e.g. crypto.subtle.digest → ["crypto","subtle","digest"].
  const memberPath = (expr: ts.Expression): string[] => {
    const parts: string[] = [];
    let cur: ts.Expression = expr;
    while (ts.isPropertyAccessExpression(cur)) { parts.unshift(cur.name.text); cur = cur.expression; }
    if (ts.isIdentifier(cur)) parts.unshift(cur.text);
    return parts;
  };

  // Find the algorithm from a call's options argument — inline object literal OR
  // an identifier referencing a const options object (data-flow-lite).
  const findAlgOption = (args: ts.NodeArray<ts.Expression>): string | undefined => {
    for (const raw of args) {
      const a = unwrap(raw);
      if (ts.isObjectLiteralExpression(a)) { const v = algInObject(a); if (v) return v; }
      else if (ts.isIdentifier(a)) { const v = objectConstAlg.get(a.text); if (v) return v; }
    }
    return undefined;
  };

  let fileCount = 0;
  const push = (info: AlgoInfo, node: ts.Node, contextArg?: string) => {
    if (fileCount >= MAX_PER_FILE || out.length >= MAX_TOTAL) return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    out.push({
      pattern_id: `SENQOR-AST-${info.algorithm.replace(/[^A-Z0-9]/g, "-")}`,
      category: info.primitive,
      algorithm: info.algorithm,
      primitive: info.primitive,
      quantum_risk: info.quantum_risk,
      purpose: info.purpose,
      file: relPath,
      line: line + 1,
      confidence: 92, // AST-structural: higher than regex
      context: (contextArg ? `${info.algorithm} via ${contextArg}` : info.algorithm).slice(0, 120),
    });
    fileCount++;
  };

  // Refine an RSA/EC AlgoInfo using an options object's modulusLength / namedCurve.
  const refineKey = (info: AlgoInfo, opts: ts.ObjectLiteralExpression | undefined): AlgoInfo => {
    if (!opts) return info;
    if (info.algorithm.startsWith("RSA")) {
      const bits = numProp(opts, "modulusLength");
      if (bits) return { ...info, algorithm: `RSA-${bits}` };
    }
    const curve = strProp(opts, "namedCurve");
    if (curve) { const c = classifyCurve(curve); if (c) return { ...c, purpose: info.purpose }; }
    return info;
  };

  // Try to detect a third-party library call from its full member path.
  // Returns true if it handled (and pushed) the node.
  const detectLibrary = (node: ts.CallExpression): boolean => {
    const p = memberPath(node.expression);
    if (p.length === 0) return false;
    const args = node.arguments;
    const last = p[p.length - 1];

    // WebCrypto / SubtleCrypto: crypto.subtle.<op>(...)
    if (p.includes("subtle")) {
      if (last === "digest") {
        const s = resolveString(args[0]); if (s) { const info = classifyHash(s); if (info) { push(info, node, s); return true; } }
        return true; // recognized surface even if algorithm not resolvable
      }
      if (["sign", "verify", "encrypt", "decrypt", "generateKey", "deriveKey", "deriveBits", "wrapKey", "unwrapKey", "importKey"].includes(last)) {
        // First arg is a string name or an { name, modulusLength?, namedCurve? } object.
        const s = resolveString(args[0]);
        const obj = resolveObject(args[0]);
        const name = s ?? (obj ? strProp(obj, "name") : undefined);
        if (name) { const info = classifyWebCryptoName(name); if (info) { push(refineKey(info, obj), node, name); return true; } }
        return true;
      }
    }

    // crypto-js: CryptoJS.MD5(...), CryptoJS.AES.encrypt(...), CryptoJS.HmacSHA256(...)
    if (p[0] === "CryptoJS" && p.length >= 2) {
      const info = classifyCryptoJs(p[1]); if (info) { push(info, node, `CryptoJS.${p[1]}`); return true; }
    }

    // node-forge: forge.md.<algo>.create(), forge.pki.rsa.generateKeyPair(), forge.cipher.createCipher('AES-CBC')
    if (p[0] === "forge" || p.includes("forge")) {
      const i = p.indexOf("forge");
      const seg = p.slice(i);
      if (seg[1] === "md" && seg[2]) { const info = classifyHash(seg[2]); if (info) { push(info, node, `forge.md.${seg[2]}`); return true; } }
      if (seg.includes("rsa")) { push({ algorithm: "RSA-2048", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "RSA key generation" }, node, "forge.pki.rsa"); return true; }
      if (last === "createCipher" || last === "createDecipher") { const s = resolveString(args[0]); if (s) { const info = classifyCipher(s); if (info) { push(info, node, s); return true; } } }
    }

    // bcrypt / bcryptjs: bcrypt.hash(...), bcrypt.hashSync(...)
    if ((p[0] === "bcrypt" || p[0] === "bcryptjs") && ["hash", "hashSync", "genSalt", "genSaltSync"].includes(last)) {
      const info = classifyKdf("bcrypt"); if (info) { push(info, node, "bcrypt"); return true; }
    }

    // tweetnacl: nacl.sign(...), nacl.box(...), nacl.secretbox(...)
    if (p[0] === "nacl") {
      if (p.includes("sign")) { push({ algorithm: "Ed25519", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "NaCl signature" }, node, "nacl.sign"); return true; }
      if (p.includes("box")) { push({ algorithm: "X25519", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "NaCl box key agreement" }, node, "nacl.box"); return true; }
      if (p.includes("secretbox")) { push({ algorithm: "XSalsa20-Poly1305", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "PARTIAL", purpose: "NaCl secretbox" }, node, "nacl.secretbox"); return true; }
    }

    // jose: builder.setProtectedHeader({ alg, enc })
    if (last === "setProtectedHeader") {
      const obj = resolveObject(args[0]);
      if (obj) {
        const alg = strProp(obj, "alg"); const enc = strProp(obj, "enc");
        let handled = false;
        if (alg) { const info = classifyJwtAlg(alg); if (info) { push(info, node, alg); handled = true; } }
        if (enc) { const info = classifyJoseEnc(enc); if (info) { push(info, node, enc); handled = true; } }
        if (handled) return true;
      }
    }

    return false;
  };

  const visit = (node: ts.Node): void => {
    // elliptic: new EC('secp256k1'), new EdDSA('ed25519')
    if (ts.isNewExpression(node) && node.expression && ts.isIdentifier(node.expression)) {
      const ctor = node.expression.text;
      if (ctor === "EC" || ctor === "ec") {
        const s = resolveString(node.arguments?.[0]);
        if (s) { const info = classifyCurve(s); if (info) push(info, node, s); }
      } else if (ctor === "EdDSA") {
        push({ algorithm: "Ed25519", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "EdDSA" }, node, "EdDSA");
      }
    }

    if (ts.isCallExpression(node)) {
      // Third-party library detection first (uses full member path).
      if (!detectLibrary(node)) {
        const m = methodName(node.expression);
        const args = node.arguments;
        const first = resolveString(args[0]);
        if (m) {
          switch (m) {
            case "createHash":
            case "createHmac": {
              if (first) { const info = classifyHash(first); if (info) push(m === "createHmac" ? hmacName(info) : info, node, first); }
              break;
            }
            case "createCipheriv":
            case "createDecipheriv":
            case "createCipher": {
              if (first) { const info = classifyCipher(first); if (info) push(info, node, first); }
              break;
            }
            case "createSign":
            case "createVerify": {
              if (first) { const info = classifySignAlg(first); if (info) push(info, node, first); }
              break;
            }
            case "generateKeyPair":
            case "generateKeyPairSync":
            case "createPrivateKey":
            case "createPublicKey": {
              if (first) { const info = classifyKeyType(first); if (info) push(refineKey(info, resolveObject(args[1])), node, first); }
              break;
            }
            case "pbkdf2":
            case "pbkdf2Sync":
            case "scrypt":
            case "scryptSync": {
              const info = classifyKdf(m); if (info) push(info, node, m);
              break;
            }
            case "sign":
            case "verify": {
              // JWT-style: jwt.sign(payload, key, { algorithm: 'RS256' })
              const alg = findAlgOption(args);
              if (alg) { const info = classifyJwtAlg(alg); if (info) push(info, node, alg); }
              break;
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** Scan a single source string (testable entry point). */
export function scanSourceText(sourceText: string, relPath: string): CryptoScanFinding[] {
  const findings: CryptoScanFinding[] = [];
  try { analyzeFile(sourceText, relPath, findings); } catch { /* skip */ }
  return findings;
}

/** True if the TypeScript compiler API is available for AST parsing. */
export async function isCryptoscanAstAvailable(): Promise<boolean> {
  try { return typeof ts.createSourceFile === "function"; } catch { return false; }
}

export async function runCryptoscanAst(repoDir: string, _repoUrl: string): Promise<CryptoScanOutput> {
  const findings: CryptoScanFinding[] = [];
  for (const filePath of walkFiles(repoDir, JS_TS_EXTENSIONS)) {
    if (findings.length >= MAX_TOTAL) break;
    let content: string;
    try { content = fs.readFileSync(filePath, "utf-8"); } catch { continue; }
    const relPath = path.relative(repoDir, filePath).replace(/\\/g, "/");
    try { analyzeFile(content, relPath, findings); } catch { /* skip unparseable file */ }
  }
  return { tool: { name: "senqor-cryptoscan-ast", version: "1.1.0" }, findings, scan_timestamp: new Date().toISOString() };
}
