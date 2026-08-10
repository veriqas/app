/**
 * Scanner registry — defines every scanner SENQOR can orchestrate.
 * Each entry describes what the scanner does, what inputs it needs,
 * and which adapter normalises its output.
 */

export type ScannerInputType =
  | "ENDPOINT"         // hostname:port or https://... URL
  | "IP_RANGE"         // CIDR or IP list
  | "GIT_REPO"         // https:// git URL or connected repo slug
  | "FILE_UPLOAD"      // client uploads a file (CBOM, PCAP, manifest, SBOM)
  | "DOMAIN"           // bare domain — scanner resolves targets
  | "CONTAINER_IMAGE"  // docker image tag, e.g. nginx:1.25
  | "KUBERNETES"       // Kubernetes cluster API endpoint
  | "CLOUD_ACCOUNT"    // cloud provider account ID / credentials ref
  | "OSQUERY_FLEET";   // osquery fleet endpoint

export type ScannerCategory =
  | "TLS_ANALYSIS"
  | "SSH_ANALYSIS"
  | "CODE_ANALYSIS"
  | "DEPENDENCY_ANALYSIS"
  | "CBOM"
  | "NETWORK_PASSIVE"
  | "CONTAINER_ANALYSIS"
  | "VULNERABILITY_ANALYSIS"
  | "SBOM_ANALYSIS"
  | "NETWORK_DISCOVERY"
  | "COMPLIANCE_SCAN"
  | "SECRET_DETECTION"
  | "INFRASTRUCTURE_SCAN";

export interface ScannerDefinition {
  /** Matches SensorAdapter.sensorType */
  sensorType: string;
  displayName: string;
  description: string;
  category: ScannerCategory;
  inputTypes: ScannerInputType[];
  evidenceSource: import("@prisma/client").EvidenceSource;
  /** Tool name(s) used under the hood */
  tools: string[];
  /** Typical scan duration hint */
  durationHint: string;
  /** Whether this scanner touches the network (vs static analysis) */
  isActive: boolean;
  /** Whether scope approval is required before running */
  requiresApprovedScope: boolean;
  /** Optional docs link */
  docsUrl?: string;
  /** Icon colour for the UI */
  color: string;
}

export const SCANNER_REGISTRY: ScannerDefinition[] = [
  {
    sensorType: "SSLYZE",
    displayName: "TLS Endpoint Analyser",
    description: "Analyses TLS configuration, cipher suites, certificate chains, elliptic curves, and protocol versions on HTTPS and other TLS endpoints.",
    category: "TLS_ANALYSIS",
    inputTypes: ["ENDPOINT", "DOMAIN"],
    evidenceSource: "ACTIVE_HANDSHAKE",
    tools: ["sslyze"],
    durationHint: "10—60 s per endpoint",
    isActive: true,
    requiresApprovedScope: true,
    docsUrl: "https://github.com/nabla-c0d3/sslyze",
    color: "#f8781e",
  },
  {
    sensorType: "SSH_AUDIT",
    displayName: "SSH Configuration Auditor",
    description: "Audits SSH server algorithm configuration — key exchange, host key types, ciphers, MACs — and flags quantum-vulnerable or deprecated algorithms.",
    category: "SSH_ANALYSIS",
    inputTypes: ["ENDPOINT", "DOMAIN", "IP_RANGE"],
    evidenceSource: "ACTIVE_HANDSHAKE",
    tools: ["ssh-audit"],
    durationHint: "5—15 s per host",
    isActive: true,
    requiresApprovedScope: true,
    docsUrl: "https://github.com/jtesta/ssh-audit",
    color: "#8B5CF6",
  },
  {
    sensorType: "ZGRAB2",
    displayName: "Protocol Discovery Scanner",
    description: "Active protocol handshake collection across TLS, SSH, and other services. Maps cryptographic usage across IP ranges or domain lists.",
    category: "TLS_ANALYSIS",
    inputTypes: ["IP_RANGE", "DOMAIN", "ENDPOINT"],
    evidenceSource: "ACTIVE_HANDSHAKE",
    tools: ["zgrab2"],
    durationHint: "Varies by range size",
    isActive: true,
    requiresApprovedScope: true,
    docsUrl: "https://github.com/zmap/zgrab2",
    color: "#F97316",
  },
  {
    sensorType: "CRYPTOSCAN",
    displayName: "Source Code Crypto Scanner",
    description: "Scans source code and configuration files to identify cryptographic algorithm usage, hardcoded keys, and quantum-vulnerable primitives.",
    category: "CODE_ANALYSIS",
    inputTypes: ["GIT_REPO"],
    evidenceSource: "STATIC_DETECTION",
    tools: ["cryptoscan"],
    durationHint: "1—5 min per repo",
    isActive: false,
    requiresApprovedScope: false,
    docsUrl: "https://github.com/csnp/cryptoscan",
    color: "#10B981",
  },
  {
    sensorType: "CRYPTODEPS",
    displayName: "Crypto Dependency Analyser",
    description: "Analyses software supply chain for cryptographic library usage. Maps direct and transitive dependencies that implement quantum-vulnerable algorithms.",
    category: "DEPENDENCY_ANALYSIS",
    inputTypes: ["GIT_REPO", "FILE_UPLOAD"],
    evidenceSource: "DEPENDENCY_INFERENCE",
    tools: ["cryptodeps"],
    durationHint: "30 s—2 min per repo",
    isActive: false,
    requiresApprovedScope: false,
    docsUrl: "https://github.com/csnp/cryptodeps",
    color: "#F59E0B",
  },
  {
    sensorType: "SEMGREP",
    displayName: "Crypto Pattern Detector",
    description: "Uses VERIQAS-owned Semgrep rules to detect cryptographic API usage patterns in source code. Results are static detection — not proof of live use.",
    category: "CODE_ANALYSIS",
    inputTypes: ["GIT_REPO"],
    evidenceSource: "STATIC_DETECTION",
    tools: ["semgrep"],
    durationHint: "1—3 min per repo",
    isActive: false,
    requiresApprovedScope: false,
    docsUrl: "https://semgrep.dev",
    color: "#EC4899",
  },
  {
    sensorType: "CBOMKIT",
    displayName: "CBOM Generator",
    description: "Generates a Cryptographic Bill of Materials from source code or accepts an existing CycloneDX CBOM file. Uses CBOMkit for Java, Python, and Go.",
    category: "CBOM",
    inputTypes: ["GIT_REPO", "FILE_UPLOAD"],
    evidenceSource: "CBOM_IMPORT",
    tools: ["cbomkit"],
    durationHint: "2—10 min per repo",
    isActive: false,
    requiresApprovedScope: false,
    docsUrl: "https://github.com/PQCA/cbomkit",
    color: "#6366F1",
  },
  // â”€â”€ Priority 1 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  {
    sensorType: "TESTSSL",
    displayName: "Comprehensive TLS Analyser",
    description: "Runs testssl.sh for deep TLS configuration testing: cipher suites, protocol versions, certificate analysis, vulnerability checks (ROBOT, DROWN, BEAST, POODLE, etc.), and HSTS/HPKP headers.",
    category: "TLS_ANALYSIS",
    inputTypes: ["ENDPOINT", "DOMAIN"],
    evidenceSource: "ACTIVE_HANDSHAKE",
    tools: ["testssl.sh", "bash", "openssl"],
    durationHint: "30—120 s per endpoint",
    isActive: true,
    requiresApprovedScope: true,
    docsUrl: "https://github.com/drwetter/testssl.sh",
    color: "#0EA5E9",
  },
  {
    sensorType: "NMAP",
    displayName: "Network Crypto Discovery",
    description: "Uses Nmap NSE scripts (ssl-enum-ciphers, ssh2-enum-algos, ssl-cert, tls-alpn) to enumerate TLS cipher suites, SSH algorithms, and certificate details across IP ranges or domain lists.",
    category: "NETWORK_DISCOVERY",
    inputTypes: ["IP_RANGE", "DOMAIN", "ENDPOINT"],
    evidenceSource: "ACTIVE_HANDSHAKE",
    tools: ["nmap"],
    durationHint: "Varies by range size",
    isActive: true,
    requiresApprovedScope: true,
    docsUrl: "https://nmap.org",
    color: "#84CC16",
  },
  {
    sensorType: "TRIVY",
    displayName: "Container & Repo Scanner",
    description: "Scans container images and git repositories for cryptographic library packages, HIGH/CRITICAL CVEs in crypto dependencies, and secrets. Integrates with Syft for SBOM generation.",
    category: "CONTAINER_ANALYSIS",
    inputTypes: ["GIT_REPO", "CONTAINER_IMAGE", "FILE_UPLOAD"],
    evidenceSource: "DEPENDENCY_INFERENCE",
    tools: ["trivy"],
    durationHint: "1—5 min per target",
    isActive: false,
    requiresApprovedScope: false,
    docsUrl: "https://github.com/aquasecurity/trivy",
    color: "#0891B2",
  },
  {
    sensorType: "SYFT",
    displayName: "SBOM Generator",
    description: "Generates a Software Bill of Materials (SBOM) in CycloneDX JSON format from container images or filesystem directories. Identifies cryptographic library presence across all package ecosystems.",
    category: "SBOM_ANALYSIS",
    inputTypes: ["GIT_REPO", "CONTAINER_IMAGE"],
    evidenceSource: "DEPENDENCY_INFERENCE",
    tools: ["syft"],
    durationHint: "30 s—2 min per target",
    isActive: false,
    requiresApprovedScope: false,
    docsUrl: "https://github.com/anchore/syft",
    color: "#7C3AED",
  },
  {
    sensorType: "GRYPE",
    displayName: "Crypto Vulnerability Scanner",
    description: "Vulnerability database scan for cryptographic libraries. Identifies HIGH/CRITICAL CVEs in OpenSSL, GnuTLS, NSS, BouncyCastle, and other crypto dependencies. Accepts SBOMs from Syft or Trivy.",
    category: "VULNERABILITY_ANALYSIS",
    inputTypes: ["GIT_REPO", "CONTAINER_IMAGE", "FILE_UPLOAD"],
    evidenceSource: "DEPENDENCY_INFERENCE",
    tools: ["grype"],
    durationHint: "1—3 min per target",
    isActive: false,
    requiresApprovedScope: false,
    docsUrl: "https://github.com/anchore/grype",
    color: "#DC2626",
  },

  // â”€â”€ Priority 2 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  {
    sensorType: "OSQUERY",
    displayName: "Endpoint Crypto Observer",
    description: "Queries osquery fleet for installed cryptographic libraries, running TLS processes, certificate stores, and SSH configuration on endpoints. Requires osquery agent deployed on hosts.",
    category: "COMPLIANCE_SCAN",
    inputTypes: ["OSQUERY_FLEET"],
    evidenceSource: "OBSERVED_LIVE",
    tools: ["osquery"],
    durationHint: "Continuous / on-demand",
    isActive: true,
    requiresApprovedScope: false,
    docsUrl: "https://osquery.io",
    color: "#EA580C",
  },
  {
    sensorType: "OPENSCAP",
    displayName: "Compliance Baseline Scanner",
    description: "Evaluates hosts against SCAP security content and CIS benchmarks for cryptographic configuration compliance. Identifies non-compliant TLS, SSH, and cipher configurations at the OS level.",
    category: "COMPLIANCE_SCAN",
    inputTypes: ["FILE_UPLOAD"],
    evidenceSource: "STATIC_DETECTION",
    tools: ["oscap"],
    durationHint: "5—20 min per host",
    isActive: false,
    requiresApprovedScope: false,
    docsUrl: "https://www.open-scap.org",
    color: "#D97706",
  },

  // â”€â”€ Priority 3 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  {
    sensorType: "GITLEAKS",
    displayName: "Secret & Key Detector",
    description: "Detects hardcoded cryptographic keys, certificates, API tokens, and other secrets in git repository history and working trees. High-confidence evidence of key material exposure.",
    category: "SECRET_DETECTION",
    inputTypes: ["GIT_REPO"],
    evidenceSource: "STATIC_DETECTION",
    tools: ["gitleaks"],
    durationHint: "1—5 min per repo",
    isActive: false,
    requiresApprovedScope: false,
    docsUrl: "https://github.com/gitleaks/gitleaks",
    color: "#DB2777",
  },
  {
    sensorType: "CHECKOV",
    displayName: "IaC Crypto Policy Scanner",
    description: "Scans Terraform, CloudFormation, Kubernetes YAML, and other IaC for insecure cryptographic configurations — weak KMS key policies, unencrypted storage, deprecated TLS policies.",
    category: "INFRASTRUCTURE_SCAN",
    inputTypes: ["GIT_REPO"],
    evidenceSource: "STATIC_DETECTION",
    tools: ["checkov"],
    durationHint: "1—3 min per repo",
    isActive: false,
    requiresApprovedScope: false,
    docsUrl: "https://www.checkov.io",
    color: "#7C3AED",
  },
  {
    sensorType: "KUBE_BENCH",
    displayName: "Kubernetes CIS Benchmark",
    description: "Checks Kubernetes cluster configuration against CIS Kubernetes Benchmark. Identifies insecure API server TLS settings, etcd encryption, certificate rotation, and RBAC misconfigurations.",
    category: "INFRASTRUCTURE_SCAN",
    inputTypes: ["KUBERNETES"],
    evidenceSource: "ACTIVE_HANDSHAKE",
    tools: ["kube-bench"],
    durationHint: "2—5 min per cluster",
    isActive: true,
    requiresApprovedScope: true,
    docsUrl: "https://github.com/aquasecurity/kube-bench",
    color: "#0EA5E9",
  },
  {
    sensorType: "KUBE_HUNTER",
    displayName: "Kubernetes Crypto Attack Surface",
    description: "Hunts for security weaknesses in Kubernetes clusters including exposed API endpoints, insecure service account tokens, and weak TLS configurations.",
    category: "INFRASTRUCTURE_SCAN",
    inputTypes: ["KUBERNETES", "IP_RANGE"],
    evidenceSource: "ACTIVE_HANDSHAKE",
    tools: ["kube-hunter"],
    durationHint: "5—15 min per cluster",
    isActive: true,
    requiresApprovedScope: true,
    docsUrl: "https://github.com/aquasecurity/kube-hunter",
    color: "#DC2626",
  },

  // â”€â”€ Existing scanners (unchanged below) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  {
    sensorType: "ZEEK",
    displayName: "Network Traffic Observer",
    description: "Passive network observation via Zeek. Deployed as a lightweight probe inside the client's network. Provides live cryptographic usage evidence — the most authoritative signal.",
    category: "NETWORK_PASSIVE",
    inputTypes: ["FILE_UPLOAD"],   // PCAP upload or log shipping from probe
    evidenceSource: "OBSERVED_LIVE",
    tools: ["zeek"],
    durationHint: "Continuous",
    isActive: false,
    requiresApprovedScope: false,
    docsUrl: "https://zeek.org",
    color: "#EF4444",
  },
];

export function getScannerByType(sensorType: string): ScannerDefinition | undefined {
  return SCANNER_REGISTRY.find(s => s.sensorType === sensorType);
}

export function getScannersByCategory(category: ScannerCategory): ScannerDefinition[] {
  return SCANNER_REGISTRY.filter(s => s.category === category);
}
