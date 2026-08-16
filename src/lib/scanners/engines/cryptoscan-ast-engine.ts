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
  if (n === "x25519") return { algorithm: "X25519", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "key agreement" };
  if (n === "dsa") return { algorithm: "DSA", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "DSA key generation" };
  if (n === "dh") return { algorithm: "DH", primitive: "KEY_ESTABLISHMENT", quantum_risk: "VULNERABLE", purpose: "Diffie-Hellman" };
  return null;
}
function classifyHash(raw: string): AlgoInfo | null {
  const n = raw.toLowerCase().replace(/[-_]/g, "");
  if (n.includes("md5")) return { algorithm: "MD5", primitive: "HASH", quantum_risk: "VULNERABLE", purpose: "content hashing" };
  if (n === "sha1" || n.includes("sha1")) return { algorithm: "SHA-1", primitive: "HASH", quantum_risk: "VULNERABLE", purpose: "content hashing" };
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
  if (n.includes("des")) return { algorithm: "3DES", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "VULNERABLE", purpose: "symmetric encryption" };
  if (n.includes("rc4")) return { algorithm: "RC4", primitive: "STREAM_CIPHER", quantum_risk: "VULNERABLE", purpose: "stream cipher" };
  if (n.includes("chacha")) return { algorithm: "ChaCha20", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "PARTIAL" };
  return null;
}
function classifyJwtAlg(raw: string): AlgoInfo | null {
  const n = raw.toUpperCase();
  if (/^RS(256|384|512)$/.test(n) || /^PS(256|384|512)$/.test(n)) return { algorithm: "RSA-SHA", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "JWT RSA signature" };
  if (/^ES(256|384|512)$/.test(n)) return { algorithm: "ECDSA-P256", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", purpose: "JWT ECDSA signature" };
  if (/^HS(256|384|512)$/.test(n)) return { algorithm: "HMAC-SHA256", primitive: "MAC", quantum_risk: "PARTIAL", purpose: "JWT HMAC signature" };
  return null;
}

function analyzeFile(sourceText: string, relPath: string, out: CryptoScanFinding[]): void {
  const sf = ts.createSourceFile(relPath, sourceText, ts.ScriptTarget.Latest, true, relPath.endsWith(".tsx") || relPath.endsWith(".jsx") ? ts.ScriptKind.TSX : undefined);

  // Unwrap `x as T`, `<T>x`, and `(x)` so casts/parens don't hide the real node.
  const unwrap = (e: ts.Expression): ts.Expression => {
    let cur: ts.Expression = e;
    while (ts.isAsExpression(cur) || ts.isTypeAssertionExpression(cur) || ts.isParenthesizedExpression(cur)) cur = cur.expression;
    return cur;
  };

  // Find a string-valued `algorithm`/`alg` property in an object literal.
  const algInObject = (obj: ts.ObjectLiteralExpression): string | undefined => {
    for (const p of obj.properties) {
      if (ts.isPropertyAssignment(p) && p.name && ts.isIdentifier(p.name) && (p.name.text === "algorithm" || p.name.text === "alg")) {
        const init = unwrap(p.initializer);
        if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) return init.text;
      }
    }
    return undefined;
  };

  // Pass 1: data-flow-lite. Track const string values AND the algorithm string of
  // const object literals, so an options object passed by reference is resolvable.
  const stringConsts = new Map<string, string>();
  const objectConstAlg = new Map<string, string>();
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.initializer) {
      const init = unwrap(node.initializer);
      if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) stringConsts.set(node.name.text, init.text);
      else if (ts.isObjectLiteralExpression(init)) { const a = algInObject(init); if (a) objectConstAlg.set(node.name.text, a); }
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

  const methodName = (expr: ts.Expression): string | null => {
    if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
    if (ts.isIdentifier(expr)) return expr.text;
    return null;
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

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const m = methodName(node.expression);
      const args = node.arguments;
      const first = resolveString(args[0]);
      if (m) {
        switch (m) {
          case "createHash":
          case "createHmac": {
            if (first) { const info = classifyHash(first); if (info) push(m === "createHmac" ? { ...info, algorithm: `HMAC-${info.algorithm}`, primitive: "MAC" } : info, node, first); }
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
            if (first) { const info = classifyKeyType(first); if (info) push(info, node, first); }
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
  return { tool: { name: "senqor-cryptoscan-ast", version: "1.0.0" }, findings, scan_timestamp: new Date().toISOString() };
}
