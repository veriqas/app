/**
 * Engine Registry — the single source of truth for scanner execution.
 *
 * Adding a new scanner requires:
 *   1. Registering its EngineDefinition here
 *   2. Registering its adapter in src/lib/sensors/index.ts
 *
 * No worker changes needed.
 */

import { execFile } from "child_process";
import { promisify } from "util";

// Existing engines
import { runSslyze,   isSslyzeAvailable   } from "./engines/sslyze-engine";
import { runSshAudit, isSshAuditAvailable } from "./engines/ssh-audit-engine";
import { runZgrab2,   isZgrab2Available   } from "./engines/zgrab2-engine";
import { runTestssl,  isTestsslAvailable  } from "./engines/testssl-engine";
import { runNmap,     isNmapAvailable     } from "./engines/nmap-engine";
import { runCryptoscan                    } from "./engines/cryptoscan-engine";
import { runCryptoscanAst, isCryptoscanAstAvailable } from "./engines/cryptoscan-ast-engine";
import { runCryptodeps                    } from "./engines/cryptodeps-engine";
import { runSemgrep,  isSemgrepAvailable  } from "./engines/semgrep-engine";
import { runCbomkit,  isCbomkitAvailable  } from "./engines/cbomkit-engine";
import { runTrivyFs,  runTrivyImage,  isTrivyAvailable  } from "./engines/trivy-engine";
import { runSyftFs,   runSyftImage,   isSyftAvailable   } from "./engines/syft-engine";
import { runGrypeFs,  runGrypeImage,  isGrypeAvailable  } from "./engines/grype-engine";

// New engines
import { runGitleaks,   isGitleaksAvailable   } from "./engines/gitleaks-engine";
import { runCheckov,    isCheckovAvailable     } from "./engines/checkov-engine";
import { runKubeBench,  isKubeBenchAvailable   } from "./engines/kube-bench-engine";
import { runKubeHunter, isKubeHunterAvailable  } from "./engines/kube-hunter-engine";
import { runOsquery,    isOsqueryAvailable     } from "./engines/osquery-engine";
import { runOpenscap,   isOpenscapAvailable    } from "./engines/openscap-engine";

const execFileAsync = promisify(execFile);

// ── Types ─────────────────────────────────────────────────────────────────────

export type InstallInstructions = {
  linux?:   string;
  mac?:     string;
  windows?: string;
  pip?:     string;
  docker?:  string;
  url?:     string;
};

export type EngineRunOptions = {
  clonedDir?: string;   // populated by worker when requiresClone=true
  imageTag?:  string;   // populated by worker for container image targets
};

export type EngineDefinition = {
  sensorType:        string;
  requiredBinary:    string;
  requiredRuntime?:  "python3" | "java" | "go" | "node";
  platformSupport:   ("linux" | "mac" | "windows")[];
  dockerSupported:   boolean;
  dockerImage?:      string;
  installInstructions: InstallInstructions;
  /** Clone the git repo target before running; passes clonedDir via options */
  requiresClone:     boolean;
  /** Needs an on-premise agent — cannot run remotely from the VERIQAS server */
  requiresAgent:     boolean;
  isAvailable:       () => Promise<boolean>;
  getVersion:        () => Promise<string | null>;
  run:               (targets: string[], options?: EngineRunOptions) => Promise<unknown>;
};

// ── Version helper ────────────────────────────────────────────────────────────

async function getBinaryVersion(
  binary: string,
  args: string[] = ["--version"],
  parseStdout = true,
): Promise<string | null> {
  try {
    const result = await execFileAsync(binary, args, { timeout: 8_000 });
    const out = parseStdout ? result.stdout : result.stderr;
    const match = out.match(/(\d+\.\d+[\.\d]*)/);
    return match?.[1] ?? out.trim().split("\n")[0].substring(0, 40);
  } catch {
    return null;
  }
}

// ── Engine Registry ───────────────────────────────────────────────────────────

const definitions: EngineDefinition[] = [
  // ── TLS / Network ──────────────────────────────────────────────────────────
  {
    sensorType:    "SSLYZE",
    requiredBinary: "sslyze",
    requiredRuntime: "python3",
    platformSupport: ["linux", "mac", "windows"],
    dockerSupported: true,
    installInstructions: {
      pip:    "pip install sslyze",
      docker: "docker run veriqas/scanner-suite sslyze ...",
    },
    requiresClone:  false,
    requiresAgent:  false,
    isAvailable:    isSslyzeAvailable,
    getVersion:     () => getBinaryVersion("sslyze"),
    run: async (targets) => {
      const result = await runSslyze(targets);
      if (!result) throw new Error("sslyze returned no output — check targets are reachable.");
      return result;
    },
  },
  {
    sensorType:    "SSH_AUDIT",
    requiredBinary: "ssh-audit",
    requiredRuntime: "python3",
    platformSupport: ["linux", "mac", "windows"],
    dockerSupported: true,
    installInstructions: {
      pip:    "pip install ssh-audit",
      docker: "docker run veriqas/scanner-suite ssh-audit ...",
    },
    requiresClone:  false,
    requiresAgent:  false,
    isAvailable:    isSshAuditAvailable,
    getVersion:     () => getBinaryVersion("ssh-audit"),
    run: async (targets) => {
      const result = await runSshAudit(targets);
      if (!result) throw new Error("ssh-audit returned no output.");
      return result;
    },
  },
  {
    sensorType:    "ZGRAB2",
    requiredBinary: "zgrab2",
    platformSupport: ["linux", "mac"],
    dockerSupported: true,
    installInstructions: {
      linux:  "Download from: https://github.com/zmap/zgrab2/releases",
      docker: "docker run veriqas/scanner-suite zgrab2 ...",
    },
    requiresClone:  false,
    requiresAgent:  false,
    isAvailable:    isZgrab2Available,
    getVersion:     () => getBinaryVersion("zgrab2"),
    run: async (targets) => {
      const result = await runZgrab2(targets);
      if (!result) throw new Error("zgrab2 returned no output.");
      return result;
    },
  },
  {
    sensorType:    "TESTSSL",
    requiredBinary: "testssl.sh",
    platformSupport: ["linux", "mac"],
    dockerSupported: true,
    installInstructions: {
      linux:  "Install at /opt/testssl/testssl.sh or set TESTSSL_PATH env var\nSee: https://testssl.sh",
      docker: "docker run veriqas/scanner-suite testssl.sh ...",
    },
    requiresClone:  false,
    requiresAgent:  false,
    isAvailable:    isTestsslAvailable,
    getVersion:     () => getBinaryVersion(process.env.TESTSSL_PATH ?? "testssl.sh", ["--version"]),
    run: async (targets) => {
      const results = await Promise.all(targets.map(t => runTestssl(t)));
      return results.flat();
    },
  },
  {
    sensorType:    "NMAP",
    requiredBinary: "nmap",
    platformSupport: ["linux", "mac", "windows"],
    dockerSupported: true,
    installInstructions: {
      linux:   "apt-get install nmap  or  apk add nmap nmap-scripts",
      mac:     "brew install nmap",
      windows: "https://nmap.org/download.html",
      docker:  "docker run veriqas/scanner-suite nmap ...",
    },
    requiresClone:  false,
    requiresAgent:  false,
    isAvailable:    isNmapAvailable,
    getVersion:     () => getBinaryVersion("nmap", ["--version"], false),
    run: async (targets) => runNmap(targets),
  },
  // ── Code / Repo ────────────────────────────────────────────────────────────
  {
    sensorType:    "CRYPTOSCAN",
    requiredBinary: "cryptoscan",
    platformSupport: ["linux", "mac", "windows"],
    dockerSupported: true,
    installInstructions: {
      docker: "Bundled in the VERIQAS scanner suite — no separate install needed.",
    },
    requiresClone:  true,
    requiresAgent:  false,
    isAvailable:    async () => true, // built-in engine
    getVersion:     async () => "built-in",
    run: async (targets, opts) => {
      const repoUrl = targets.find(t => t.startsWith("http")) ?? targets[0];
      return runCryptoscan(opts?.clonedDir ?? "", repoUrl);
    },
  },
  {
    // AST-aware source-code crypto scanner (TS/JS). Emits the same CryptoScanOutput
    // shape, so it reuses the CryptoScan adapter and flows through the pipeline.
    sensorType:    "CRYPTOSCAN_AST",
    requiredBinary: "cryptoscan-ast",
    platformSupport: ["linux", "mac", "windows"],
    dockerSupported: true,
    installInstructions: {
      docker: "Bundled in the VERIQAS scanner suite — no separate install needed.",
    },
    requiresClone:  true,
    requiresAgent:  false,
    isAvailable:    isCryptoscanAstAvailable,
    getVersion:     async () => "1.1.0",
    run: async (targets, opts) => {
      const repoUrl = targets.find(t => t.startsWith("http")) ?? targets[0];
      return runCryptoscanAst(opts?.clonedDir ?? "", repoUrl);
    },
  },
  {
    sensorType:    "CRYPTODEPS",
    requiredBinary: "cryptodeps",
    platformSupport: ["linux", "mac", "windows"],
    dockerSupported: true,
    installInstructions: {
      docker: "Bundled in the VERIQAS scanner suite — no separate install needed.",
    },
    requiresClone:  true,
    requiresAgent:  false,
    isAvailable:    async () => true,
    getVersion:     async () => "built-in",
    run: async (_targets, opts) => runCryptodeps(opts?.clonedDir ?? ""),
  },
  {
    sensorType:    "SEMGREP",
    requiredBinary: "semgrep",
    requiredRuntime: "python3",
    platformSupport: ["linux", "mac", "windows"],
    dockerSupported: true,
    installInstructions: {
      pip:    "pip install semgrep",
      linux:  "pip install semgrep",
      mac:    "brew install semgrep",
      docker: "docker run veriqas/scanner-suite semgrep ...",
    },
    requiresClone:  true,
    requiresAgent:  false,
    isAvailable:    isSemgrepAvailable,
    getVersion:     () => getBinaryVersion("semgrep"),
    run: async (_targets, opts) => runSemgrep(opts?.clonedDir ?? ""),
  },
  {
    sensorType:    "CBOMKIT",
    requiredBinary: "cbomkit.jar",
    requiredRuntime: "java",
    platformSupport: ["linux", "mac", "windows"],
    dockerSupported: true,
    installInstructions: {
      url:    "https://github.com/IBM/cbomkit/releases",
      docker: "docker run veriqas/scanner-suite cbomkit ...",
      linux:  "Requires Java 17+. Download cbomkit.jar from GitHub releases.",
    },
    requiresClone:  true,
    requiresAgent:  false,
    isAvailable:    isCbomkitAvailable,
    getVersion:     () => getBinaryVersion("java", ["-version"]),
    run: async (_targets, opts) => runCbomkit(opts?.clonedDir ?? ""),
  },
  // ── Supply Chain ───────────────────────────────────────────────────────────
  {
    sensorType:    "TRIVY",
    requiredBinary: "trivy",
    platformSupport: ["linux", "mac", "windows"],
    dockerSupported: true,
    installInstructions: {
      linux:   "curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh",
      mac:     "brew install trivy",
      windows: "https://github.com/aquasecurity/trivy/releases",
      docker:  "docker run aquasec/trivy ...",
    },
    requiresClone:  true,
    requiresAgent:  false,
    isAvailable:    isTrivyAvailable,
    getVersion:     () => getBinaryVersion("trivy"),
    run: async (targets, opts) => {
      const imageTag = opts?.imageTag;
      if (imageTag) return runTrivyImage(imageTag);
      return runTrivyFs(opts?.clonedDir ?? "");
    },
  },
  {
    sensorType:    "SYFT",
    requiredBinary: "syft",
    platformSupport: ["linux", "mac", "windows"],
    dockerSupported: true,
    installInstructions: {
      linux:   "curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh",
      mac:     "brew install syft",
      windows: "https://github.com/anchore/syft/releases",
    },
    requiresClone:  true,
    requiresAgent:  false,
    isAvailable:    isSyftAvailable,
    getVersion:     () => getBinaryVersion("syft"),
    run: async (targets, opts) => {
      const imageTag = opts?.imageTag;
      if (imageTag) return runSyftImage(imageTag);
      return runSyftFs(opts?.clonedDir ?? "");
    },
  },
  {
    sensorType:    "GRYPE",
    requiredBinary: "grype",
    platformSupport: ["linux", "mac", "windows"],
    dockerSupported: true,
    installInstructions: {
      linux:   "curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh",
      mac:     "brew install grype",
      windows: "https://github.com/anchore/grype/releases",
    },
    requiresClone:  true,
    requiresAgent:  false,
    isAvailable:    isGrypeAvailable,
    getVersion:     () => getBinaryVersion("grype"),
    run: async (targets, opts) => {
      const imageTag = opts?.imageTag;
      if (imageTag) return runGrypeImage(imageTag);
      return runGrypeFs(opts?.clonedDir ?? "");
    },
  },
  // ── Secrets ────────────────────────────────────────────────────────────────
  {
    sensorType:    "GITLEAKS",
    requiredBinary: "gitleaks",
    platformSupport: ["linux", "mac", "windows"],
    dockerSupported: true,
    installInstructions: {
      linux:   "Download from: https://github.com/gitleaks/gitleaks/releases",
      mac:     "brew install gitleaks",
      windows: "https://github.com/gitleaks/gitleaks/releases",
      docker:  "docker run zricethezav/gitleaks ...",
    },
    requiresClone:  true,
    requiresAgent:  false,
    isAvailable:    isGitleaksAvailable,
    getVersion:     () => getBinaryVersion("gitleaks"),
    run: async (_targets, opts) => runGitleaks(opts?.clonedDir ?? ""),
  },
  // ── Infrastructure ─────────────────────────────────────────────────────────
  {
    sensorType:    "CHECKOV",
    requiredBinary: "checkov",
    requiredRuntime: "python3",
    platformSupport: ["linux", "mac", "windows"],
    dockerSupported: true,
    installInstructions: {
      pip:    "pip install checkov",
      mac:    "brew install checkov",
      docker: "docker run bridgecrew/checkov ...",
    },
    requiresClone:  true,
    requiresAgent:  false,
    isAvailable:    isCheckovAvailable,
    getVersion:     () => getBinaryVersion("checkov"),
    run: async (_targets, opts) => runCheckov(opts?.clonedDir ?? ""),
  },
  {
    sensorType:    "KUBE_BENCH",
    requiredBinary: "kube-bench",
    platformSupport: ["linux"],
    dockerSupported: true,
    installInstructions: {
      linux:  "Download from: https://github.com/aquasecurity/kube-bench/releases",
      docker: "docker run --pid=host -v /etc:/etc:ro aquasec/kube-bench ...",
      url:    "https://github.com/aquasecurity/kube-bench",
    },
    requiresClone:  false,
    requiresAgent:  false,
    isAvailable:    isKubeBenchAvailable,
    getVersion:     () => getBinaryVersion("kube-bench"),
    run: async (targets) => runKubeBench(targets),
  },
  {
    sensorType:    "KUBE_HUNTER",
    requiredBinary: "kube-hunter",
    requiredRuntime: "python3",
    platformSupport: ["linux", "mac"],
    dockerSupported: true,
    installInstructions: {
      pip:    "pip install kube-hunter",
      docker: "docker run aquasec/kube-hunter ...",
      url:    "https://github.com/aquasecurity/kube-hunter",
    },
    requiresClone:  false,
    requiresAgent:  false,
    isAvailable:    isKubeHunterAvailable,
    getVersion:     () => getBinaryVersion("kube-hunter"),
    run: async (targets) => runKubeHunter(targets),
  },
  // ── Agent-based ────────────────────────────────────────────────────────────
  {
    sensorType:    "OSQUERY",
    requiredBinary: "osqueryi",
    platformSupport: ["linux", "mac", "windows"],
    dockerSupported: true,
    installInstructions: {
      linux:   "https://osquery.io/downloads/official",
      mac:     "brew install osquery",
      windows: "https://osquery.io/downloads/official",
      docker:  "Deploy the VERIQAS osquery fleet agent.",
    },
    requiresClone:  false,
    requiresAgent:  true,
    isAvailable:    isOsqueryAvailable,
    getVersion:     () => getBinaryVersion("osqueryi", ["--version"]),
    run: async (targets) => runOsquery(targets),
  },
  {
    sensorType:    "OPENSCAP",
    requiredBinary: "oscap",
    platformSupport: ["linux"],
    dockerSupported: true,
    installInstructions: {
      linux:  "apt-get install openscap-scanner  or  yum install openscap-scanner",
      docker: "docker run veriqas/scanner-suite oscap ...",
      url:    "https://www.open-scap.org",
    },
    requiresClone:  false,
    requiresAgent:  false,
    isAvailable:    isOpenscapAvailable,
    getVersion:     () => getBinaryVersion("oscap", ["--version"]),
    run: async (targets) => runOpenscap(targets),
  },
  // ── Passive / Agent ────────────────────────────────────────────────────────
  {
    sensorType:    "ZEEK",
    requiredBinary: "zeek",
    platformSupport: ["linux"],
    dockerSupported: true,
    installInstructions: {
      linux:  "https://docs.zeek.org/en/master/install.html",
      docker: "Deploy the VERIQAS network sensor agent inside the client network.",
      url:    "https://zeek.org",
    },
    requiresClone:  false,
    requiresAgent:  true,
    isAvailable:    async () => false,
    getVersion:     async () => null,
    run: async () => {
      throw new Error("Zeek requires an on-premise sensor agent deployed inside the client network.");
    },
  },
];

export const ENGINE_REGISTRY = new Map<string, EngineDefinition>(
  definitions.map(d => [d.sensorType, d])
);

export function getEngine(sensorType: string): EngineDefinition | undefined {
  return ENGINE_REGISTRY.get(sensorType);
}
