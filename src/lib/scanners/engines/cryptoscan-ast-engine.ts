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
import type { CryptoScanOutput, CryptoScanFinding, CryptoScanStats } from "@/lib/sensors/adapters/cryptoscan.adapter";
import {
  type AlgoInfo,
  classifyPqc, classifyKeyType, classifyHash, classifySignAlg, classifyCipher,
  classifyKdf, classifyJwtAlg, classifyJoseEnc, classifyCurve,
  classifyWebCryptoName, hmacName, classifyCryptoJs,
} from "./crypto-classifier";

const JS_TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

/**
 * Caps exist only to bound memory on pathological inputs — they are not a
 * sampling strategy. Set too low they silently cap the inventory: a crypto
 * library file legitimately contains dozens of usages, and every one is a
 * distinct thing to remediate. Overridable per deployment.
 */
const MAX_PER_FILE = Number(process.env.CRYPTOSCAN_MAX_PER_FILE ?? 200);
const MAX_TOTAL = Number(process.env.CRYPTOSCAN_MAX_TOTAL ?? 10_000);

/** Per-file outcome, so the caller can report true scan coverage. */
interface FileOutcome { detections: number; truncated: boolean }

function analyzeFile(sourceText: string, relPath: string, out: CryptoScanFinding[], outcome?: FileOutcome): void {
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
    if (outcome) outcome.detections++;
    if (fileCount >= MAX_PER_FILE || out.length >= MAX_TOTAL) {
      if (outcome) outcome.truncated = true;
      return;
    }
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

    // Post-quantum libraries. @noble/post-quantum exposes algorithm-named
    // objects (ml_kem768.keygen(), ml_dsa65.sign()); liboqs uses a constructor
    // with the algorithm as a string argument.
    for (const seg of p) {
      const pq = classifyPqc(seg);
      if (pq) { push(pq, node, seg); return true; }
    }
    if (["KeyEncapsulation", "Signature"].includes(p[0] ?? "") || last === "KeyEncapsulation") {
      const s = resolveString(args[0]);
      if (s) { const pq = classifyPqc(s); if (pq) { push(pq, node, s); return true; } }
    }

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
      // PQC constructors: new MlKem768(), new KeyEncapsulation('Kyber768')
      const ctorPq = classifyPqc(ctor);
      const argPq = classifyPqc(resolveString(node.arguments?.[0]) ?? "");
      if (ctorPq) push(ctorPq, node, ctor);
      else if (argPq && ["KeyEncapsulation", "Signature"].includes(ctor)) push(argPq, node, ctor);
      else if (ctor === "EC" || ctor === "ec") {
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
  let discovered = 0, parsed = 0, skipped = 0, detections = 0, truncatedFiles = 0;
  let truncatedTotal = false;

  for (const filePath of walkFiles(repoDir, JS_TS_EXTENSIONS)) {
    discovered++;
    // Keep counting discovered files after the global cap so the report states
    // how much of the repository was never examined.
    if (findings.length >= MAX_TOTAL) { truncatedTotal = true; skipped++; continue; }

    let content: string;
    try { content = fs.readFileSync(filePath, "utf-8"); } catch { skipped++; continue; }
    const relPath = path.relative(repoDir, filePath).replace(/\\/g, "/");

    const outcome: FileOutcome = { detections: 0, truncated: false };
    try {
      analyzeFile(content, relPath, findings, outcome);
      parsed++;
      detections += outcome.detections;
      if (outcome.truncated) truncatedFiles++;
    } catch {
      skipped++; // unreadable or unparseable
    }
  }

  const stats: CryptoScanStats = {
    files_discovered: discovered,
    files_parsed: parsed,
    files_skipped: skipped,
    findings_before_caps: detections,
    truncated_files: truncatedFiles,
    truncated_total: truncatedTotal,
    complete: skipped === 0 && truncatedFiles === 0 && !truncatedTotal,
    caps: { per_file: MAX_PER_FILE, total: MAX_TOTAL },
  };

  if (!stats.complete) {
    // Surfaced in worker logs: an incomplete scan must never look like a clean one.
    console.warn(
      `[cryptoscan-ast] INCOMPLETE SCAN — ${parsed}/${discovered} files parsed, ` +
      `${skipped} skipped, ${truncatedFiles} file(s) hit the ${MAX_PER_FILE}-finding cap` +
      (truncatedTotal ? `, global cap of ${MAX_TOTAL} reached (${detections} detections found)` : "") +
      ". Reported inventory is a subset of what exists.",
    );
  }

  return {
    tool: { name: "senqor-cryptoscan-ast", version: "1.2.0" },
    findings,
    scan_timestamp: new Date().toISOString(),
    scan_stats: stats,
  };
}
