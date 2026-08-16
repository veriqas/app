/**
 * AST-aware Python source-code cryptography scanner (CRYPTOSCAN_AST_PY).
 *
 * Parsing is delegated to Python's own `ast` module (see python/crypto_ast_scan.py)
 * — the authoritative grammar for the language, so there is no third-party parser
 * to drift out of date, and no native build step.
 *
 * The Python side only EXTRACTS structured detections. Classification happens
 * here, through the SHARED classifier that the JS/TS engine also uses, so the
 * same algorithm gets the same canonical name regardless of the language it was
 * found in. That is what lets correlation group a finding across languages and
 * lets verification compare before/after fingerprints reliably.
 *
 * Library coverage: hashlib, hmac, `cryptography` (pyca), pycryptodome (Crypto.*),
 * PyJWT, bcrypt/passlib, PyNaCl, and post-quantum libraries (liboqs, pqcrypto).
 *
 * Emits the same CryptoScanOutput shape as CRYPTOSCAN, so it reuses the existing
 * CryptoScan adapter and flows into correlation → remediation → verification
 * unchanged.
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

const MAX_PER_FILE = 20;
const MAX_TOTAL = 500;
const SCAN_TIMEOUT_MS = 120_000;

/** One structured detection emitted by the Python extractor. */
interface PyDetection {
  file: string;
  line: number;
  kind: "hash" | "hmac" | "cipher" | "sign" | "keygen" | "jwt" | "kdf" | "curve" | "pqc";
  value: string;
  context?: string;
  key_size?: number;
}
interface PyResult {
  detections: PyDetection[];
  files_discovered: number;
  files_parsed: number;
  files_skipped: number;
}

function scriptPath(): string {
  return path.join(__dirname, "python", "crypto_ast_scan.py");
}

/** Resolve a usable python3 interpreter, preferring an explicit override. */
function pythonCandidates(): string[] {
  const explicit = process.env.PYTHON_BIN;
  return [
    ...(explicit ? [explicit] : []),
    "/opt/venv/bin/python3",
    "python3",
    "python",
  ];
}

async function resolvePython(): Promise<string | null> {
  for (const bin of pythonCandidates()) {
    try {
      await execFileAsync(bin, ["-c", "import ast,json,sys"], { timeout: 8_000 });
      return bin;
    } catch { /* try next */ }
  }
  return null;
}

/**
 * Map a Python-side detection to a canonical algorithm via the shared classifier.
 * Post-quantum is always tried first so already-migrated code is never reported
 * as unknown.
 */
export function classifyDetection(d: PyDetection): AlgoInfo | null {
  const pq = classifyPqc(d.value);
  if (pq) return pq;

  switch (d.kind) {
    case "pqc":   return null; // was not a recognised PQ algorithm after all
    case "hash":  return classifyHash(d.value);
    case "hmac": {
      const h = classifyHash(d.value);
      return h ? hmacName(h) : null;
    }
    case "cipher": {
      const c = classifyCipher(d.value);
      if (c) return c;
      // pycryptodome / pyca class names that are not plain algorithm strings
      const n = d.value.toLowerCase();
      if (n.includes("tripledes")) return classifyCipher("3des");
      if (n.includes("arc4") || n.includes("rc4")) return classifyCipher("rc4");
      if (n.includes("chacha")) return classifyCipher("chacha20");
      return null;
    }
    case "kdf":   return classifyKdf(d.value);
    case "jwt":   return classifyJwtAlg(d.value);
    case "curve": return classifyCurve(d.value) ?? classifyKeyType("ec");
    case "sign":  return classifySignAlg(d.value) ?? classifyKeyType(d.value);
    case "keygen": {
      const k = classifyKeyType(d.value);
      if (!k) return null;
      // Refine RSA/DSA identity with the declared key size where the code states it.
      if (d.key_size && (k.algorithm.startsWith("RSA") || k.algorithm.startsWith("DSA"))) {
        return { ...k, algorithm: `${k.algorithm.split("-")[0]}-${d.key_size}` };
      }
      return k;
    }
    default: return null;
  }
}

/** True when a Python interpreter capable of running the extractor is present. */
export async function isCryptoscanAstPyAvailable(): Promise<boolean> {
  if (!fs.existsSync(scriptPath())) return false;
  return (await resolvePython()) !== null;
}

export async function getCryptoscanAstPyVersion(): Promise<string | null> {
  const bin = await resolvePython();
  if (!bin) return null;
  return "1.0.0";
}

export async function runCryptoscanAstPy(repoDir: string, _repoUrl: string): Promise<CryptoScanOutput> {
  const findings: CryptoScanFinding[] = [];
  const bin = await resolvePython();
  if (!bin) throw new Error("CRYPTOSCAN_AST_PY requires python3 (>=3.8) to parse Python sources.");

  const { stdout } = await execFileAsync(bin, [scriptPath(), repoDir], {
    timeout: SCAN_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
  const result = JSON.parse(stdout) as PyResult;

  const perFile = new Map<string, number>();
  let detections = 0;
  let truncatedTotal = false;
  const truncatedFiles = new Set<string>();
  // Nested calls can yield the same algorithm twice on one line
  // (e.g. bcrypt.hashpw(pw, bcrypt.gensalt())); report it once.
  const seen = new Set<string>();

  for (const d of result.detections) {
    const info = classifyDetection(d);
    if (!info) continue;            // recognised call but not a classifiable algorithm
    const key = `${d.file}:${d.line}:${info.algorithm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    detections++;

    if (findings.length >= MAX_TOTAL) { truncatedTotal = true; continue; }
    const used = perFile.get(d.file) ?? 0;
    if (used >= MAX_PER_FILE) { truncatedFiles.add(d.file); continue; }
    perFile.set(d.file, used + 1);

    findings.push({
      pattern_id: `SENQOR-ASTPY-${info.algorithm.replace(/[^A-Z0-9]/g, "-")}`,
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
      `[cryptoscan-ast-py] INCOMPLETE SCAN — ${stats.files_parsed}/${stats.files_discovered} files parsed, ` +
      `${stats.files_skipped} skipped, ${stats.truncated_files} file(s) hit the ${MAX_PER_FILE}-finding cap` +
      (truncatedTotal ? `, global cap of ${MAX_TOTAL} reached (${detections} detections found)` : "") +
      ". Reported inventory is a subset of what exists.",
    );
  }

  return {
    tool: { name: "senqor-cryptoscan-ast-py", version: "1.0.0" },
    findings,
    scan_timestamp: new Date().toISOString(),
    scan_stats: stats,
  };
}
