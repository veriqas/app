/**
 * AST-aware Java source-code cryptography scanner (CRYPTOSCAN_AST_JAVA).
 *
 * Parsing is delegated to the JDK's own compiler front-end (see
 * java/CryptoAstScan.java, run via single-file source execution) — the
 * authoritative grammar for the language, so there is no third-party parser to
 * drift out of date and nothing to compile ahead of time.
 *
 * The Java side only EXTRACTS structured detections. Classification happens
 * here, through the SHARED classifier that the JS/TS and Python engines also
 * use, so the same algorithm gets the same canonical name whichever language it
 * was found in — which is what lets correlation group findings across languages
 * and lets verification compare before/after fingerprints reliably.
 *
 * Library coverage: the JCA/JCE providers (MessageDigest, Cipher, Signature,
 * Mac, KeyPairGenerator, KeyGenerator, SecretKeyFactory, KeyAgreement),
 * SecretKeySpec/ECGenParameterSpec, and post-quantum providers. Key sizes from
 * `initialize(bits)` and curves from `ECGenParameterSpec` are folded into the
 * originating key-pair finding rather than reported separately.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import {
  type AlgoInfo,
  classifyPqc, classifyHash, classifyCipher, classifyKdf, classifyJwtAlg,
  classifyKeyType, classifyCurve, classifySignAlg, hmacName,
} from "./crypto-classifier";
import type { CryptoScanOutput, CryptoScanFinding, CryptoScanStats } from "@/lib/sensors/adapters/cryptoscan.adapter";

const execFileAsync = promisify(execFile);

const MAX_PER_FILE = Number(process.env.CRYPTOSCAN_MAX_PER_FILE ?? 200);
const MAX_TOTAL = Number(process.env.CRYPTOSCAN_MAX_TOTAL ?? 10_000);
const SCAN_TIMEOUT_MS = Number(process.env.CRYPTOSCAN_TIMEOUT_MS ?? 300_000);

interface JavaDetection {
  file: string;
  line: number;
  kind: "hash" | "hmac" | "cipher" | "sign" | "keygen" | "jwt" | "kdf" | "curve" | "pqc" | "protocol";
  value: string;
  context?: string;
  key_size?: number;
}
interface JavaResult {
  detections: JavaDetection[];
  files_discovered: number;
  files_parsed: number;
  files_skipped: number;
  error?: string;
}

function scriptPath(): string {
  return path.join(__dirname, "java", "CryptoAstScan.java");
}

function javaCandidates(): string[] {
  const explicit = process.env.JAVA_BIN;
  return [...(explicit ? [explicit] : []), "java", "/usr/bin/java"];
}

/**
 * Resolve a `java` capable of single-file source execution. A JRE without the
 * compiler module cannot parse, so probe the actual capability rather than
 * trusting the presence of the binary.
 */
async function resolveJava(): Promise<string | null> {
  for (const bin of javaCandidates()) {
    try {
      const { stdout, stderr } = await execFileAsync(bin, ["-version"], { timeout: 10_000 });
      const v = `${stdout}${stderr}`;
      const major = /version "(\d+)/.exec(v)?.[1];
      if (major && Number(major) >= 11) return bin;   // single-file execution needs 11+
    } catch { /* try next */ }
  }
  return null;
}

/**
 * Map a Java-side detection to a canonical algorithm via the shared classifier.
 * Post-quantum is tried first so already-migrated code is never reported unknown.
 */
export function classifyJavaDetection(d: JavaDetection): AlgoInfo | null {
  const pq = classifyPqc(d.value);
  if (pq) return pq;

  switch (d.kind) {
    case "pqc":   return null;   // not a recognised PQ algorithm after all
    case "protocol": return null; // TLS/KeyStore protocol strings are not algorithms
    case "hash":  return classifyHash(d.value);
    case "hmac": {
      const h = classifyHash(d.value);
      return h ? hmacName(h) : null;
    }
    // Java spells transformations as "AES/CBC/PKCS5Padding"; the classifier
    // matches on the algorithm substring, so the mode/padding is harmless.
    case "cipher": return classifyCipher(d.value);
    case "kdf":    return classifyKdf(d.value);
    case "jwt":    return classifyJwtAlg(d.value);
    case "curve":  return classifyCurve(d.value) ?? classifyKeyType("ec");
    case "sign":   return classifySignAlg(d.value) ?? classifyKeyType(d.value);
    case "keygen": {
      const k = classifyKeyType(d.value);
      if (!k) return null;
      if (d.key_size && (k.algorithm.startsWith("RSA") || k.algorithm.startsWith("DSA"))) {
        return { ...k, algorithm: `${k.algorithm.split("-")[0]}-${d.key_size}` };
      }
      return k;
    }
    default: return null;
  }
}

export async function isCryptoscanAstJavaAvailable(): Promise<boolean> {
  if (!fs.existsSync(scriptPath())) return false;
  return (await resolveJava()) !== null;
}

export async function runCryptoscanAstJava(repoDir: string, _repoUrl: string): Promise<CryptoScanOutput> {
  const findings: CryptoScanFinding[] = [];
  const bin = await resolveJava();
  if (!bin) throw new Error("CRYPTOSCAN_AST_JAVA requires a Java 11+ runtime to parse Java sources.");

  const { stdout } = await execFileAsync(bin, [scriptPath(), repoDir], {
    timeout: SCAN_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
  const result = JSON.parse(stdout) as JavaResult;
  if (result.error) throw new Error(`CRYPTOSCAN_AST_JAVA: ${result.error}`);

  const perFile = new Map<string, number>();
  const seen = new Set<string>();
  let detections = 0;
  let truncatedTotal = false;
  const truncatedFiles = new Set<string>();

  for (const d of result.detections) {
    const info = classifyJavaDetection(d);
    if (!info) continue;
    const key = `${d.file}:${d.line}:${info.algorithm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    detections++;

    if (findings.length >= MAX_TOTAL) { truncatedTotal = true; continue; }
    const used = perFile.get(d.file) ?? 0;
    if (used >= MAX_PER_FILE) { truncatedFiles.add(d.file); continue; }
    perFile.set(d.file, used + 1);

    findings.push({
      pattern_id: `SENQOR-ASTJAVA-${info.algorithm.replace(/[^A-Z0-9]/g, "-")}`,
      category: info.primitive,
      algorithm: info.algorithm,
      primitive: info.primitive,
      quantum_risk: info.quantum_risk,
      purpose: info.purpose,
      file: d.file,
      line: d.line,
      confidence: 92, // AST-structural: higher than regex
      context: (d.context ? `${info.algorithm} via ${d.context}` : info.algorithm).slice(0, 120),
    });
  }

  const stats: CryptoScanStats = {
    files_discovered: result.files_discovered,
    files_parsed: result.files_parsed,
    files_skipped: result.files_skipped,
    findings_before_caps: detections,
    truncated_files: truncatedFiles.size,
    truncated_total: truncatedTotal,
    complete: result.files_skipped === 0 && truncatedFiles.size === 0 && !truncatedTotal,
    caps: { per_file: MAX_PER_FILE, total: MAX_TOTAL },
  };

  if (!stats.complete) {
    console.warn(
      `[cryptoscan-ast-java] INCOMPLETE SCAN — ${stats.files_parsed}/${stats.files_discovered} files parsed, ` +
      `${stats.files_skipped} skipped, ${stats.truncated_files} file(s) hit the ${MAX_PER_FILE}-finding cap` +
      (truncatedTotal ? `, global cap of ${MAX_TOTAL} reached (${detections} detections found)` : "") +
      ". Reported inventory is a subset of what exists.",
    );
  }

  return {
    tool: { name: "senqor-cryptoscan-ast-java", version: "1.0.0" },
    findings,
    scan_timestamp: new Date().toISOString(),
    scan_stats: stats,
  };
}
