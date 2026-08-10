/**
 * Assessment Registry — maps user-facing assessment modules to their underlying scanners.
 * Scanners remain internal implementation details; users interact with assessments only.
 */
import { SCANNER_REGISTRY } from "@/lib/scanners/registry";

export type InputCategory = "NETWORK" | "CODE" | "CONTAINER" | "KUBERNETES" | "FILE";

export type AssessmentModule = {
  id: string;
  name: string;
  shortName: string;
  purpose: string;
  description: string;
  /** sensorType values from SCANNER_REGISTRY — execution order matters for SUPPLY_CHAIN */
  scannerTypes: string[];
  outputs: string[];
  inputCategories: InputCategory[];
  color: string;
  durationHint: string;
  isFlagship?: boolean;
};

export type AssessmentProfile = {
  id: "QUICK" | "STANDARD" | "ENTERPRISE" | "CONTINUOUS";
  name: string;
  description: string;
  moduleIds: string[];
  recommended?: boolean;
};

export const ASSESSMENT_MODULES: AssessmentModule[] = [
  {
    id: "ENTERPRISE_READINESS",
    name: "Enterprise Quantum Readiness",
    shortName: "Enterprise",
    purpose: "Complete cryptographic assessment of your entire enterprise estate.",
    description:
      "Orchestrates every assessment module in sequence. Produces a full cryptographic asset inventory, risk register, and executive readiness report.",
    scannerTypes: [
      // Network & Transport
      "NMAP", "ZGRAB2", "SSLYZE", "TESTSSL", "SSH_AUDIT", "OSQUERY",
      // Source Code
      "CRYPTOSCAN", "SEMGREP", "CBOMKIT",
      // Supply Chain (ordered)
      "SYFT", "CRYPTODEPS", "GRYPE", "TRIVY",
      // Infrastructure
      "CHECKOV", "KUBE_BENCH", "KUBE_HUNTER",
      // Secrets
      "GITLEAKS",
      // Host & Compliance
      "OPENSCAP",
    ],
    outputs: [
      "Full cryptographic asset inventory",
      "Quantum risk register",
      "SBOM & CBOM",
      "Supply chain risk",
      "Infrastructure posture",
      "Secret exposure",
      "Executive readiness report",
    ],
    inputCategories: ["NETWORK", "CODE", "CONTAINER", "KUBERNETES", "FILE"],
    color: "#f8781e",
    durationHint: "2—6 hours (full estate)",
    isFlagship: true,
  },
  {
    id: "NETWORK_TRANSPORT",
    name: "Network & Transport",
    shortName: "Network",
    purpose: "Discover and analyse all externally exposed cryptographic services.",
    description:
      "Scans your network perimeter and endpoints for TLS, SSH, and protocol-level cryptographic exposure.",
    scannerTypes: ["NMAP", "ZGRAB2", "SSLYZE", "TESTSSL", "SSH_AUDIT", "OSQUERY"],
    outputs: [
      "TLS inventory",
      "SSH inventory",
      "Certificates",
      "Cipher suites",
      "Key exchange algorithms",
      "TLS versions",
      "Quantum readiness observations",
    ],
    inputCategories: ["NETWORK"],
    color: "#3B82F6",
    durationHint: "15—60 min",
  },
  {
    id: "SOURCE_CODE",
    name: "Source Code",
    shortName: "Source Code",
    purpose: "Analyse application source code for cryptographic implementation.",
    description:
      "Scans repositories for crypto API usage, hardcoded keys, vulnerable algorithms, and produces a CBOM.",
    scannerTypes: ["CRYPTOSCAN", "SEMGREP", "CBOMKIT"],
    outputs: [
      "Cryptographic APIs",
      "Algorithm inventory",
      "Hardcoded keys",
      "CBOM",
      "Quantum-vulnerable code",
      "Crypto agility findings",
    ],
    inputCategories: ["CODE"],
    color: "#F59E0B",
    durationHint: "5—20 min per repo",
  },
  {
    id: "SUPPLY_CHAIN",
    name: "Software Supply Chain",
    shortName: "Supply Chain",
    purpose: "Analyse software dependencies and cryptographic libraries.",
    description:
      "Generates SBOM, maps cryptographic dependencies, identifies vulnerable packages and migration blockers.",
    scannerTypes: ["SYFT", "CRYPTODEPS", "GRYPE", "TRIVY"],
    outputs: [
      "SBOM",
      "Cryptographic dependency graph",
      "Cryptographic libraries",
      "Vulnerable crypto packages",
      "Supply chain risk",
      "Migration blockers",
    ],
    inputCategories: ["CODE", "CONTAINER"],
    color: "#8B5CF6",
    durationHint: "10—30 min",
  },
  {
    id: "INFRASTRUCTURE",
    name: "Infrastructure",
    shortName: "Infrastructure",
    purpose: "Assess infrastructure and platform cryptography.",
    description:
      "Scans IaC manifests, Kubernetes clusters for crypto policy violations and misconfigurations.",
    scannerTypes: ["CHECKOV", "KUBE_BENCH", "KUBE_HUNTER"],
    outputs: [
      "Infrastructure crypto posture",
      "Kubernetes crypto posture",
      "TLS configuration",
      "Crypto policy violations",
      "Infrastructure readiness",
    ],
    inputCategories: ["CODE", "KUBERNETES"],
    color: "#EF4444",
    durationHint: "5—15 min",
  },
  {
    id: "SECRETS",
    name: "Secrets & Key Exposure",
    shortName: "Secrets",
    purpose: "Locate exposed cryptographic material across repositories and history.",
    description:
      "Scans git history and filesystems for private keys, certificates, API secrets, and hardcoded credentials.",
    scannerTypes: ["GITLEAKS"],
    outputs: [
      "Private keys",
      "Certificates",
      "API secrets",
      "SSH keys",
      "Hardcoded credentials",
    ],
    inputCategories: ["CODE"],
    color: "#EC4899",
    durationHint: "2—10 min per repo",
  },
  {
    id: "HOST_COMPLIANCE",
    name: "Host & Compliance",
    shortName: "Compliance",
    purpose: "Assess operating system cryptographic configuration and hardening.",
    description:
      "Audits system-level crypto config, certificate stores, SSH hardening, and crypto policy compliance.",
    scannerTypes: ["OPENSCAP"],
    outputs: [
      "System crypto configuration",
      "Certificate stores",
      "SSH hardening",
      "Crypto policy compliance",
      "Operating system posture",
    ],
    inputCategories: ["FILE"],
    color: "#10B981",
    durationHint: "5—15 min",
  },
];

export const ASSESSMENT_PROFILES: AssessmentProfile[] = [
  {
    id: "QUICK",
    name: "Quick",
    description: "Fast targeted validation — network perimeter and source code only.",
    moduleIds: ["NETWORK_TRANSPORT", "SOURCE_CODE"],
  },
  {
    id: "STANDARD",
    name: "Standard",
    description: "Covers network, code, dependencies, and infrastructure.",
    moduleIds: ["NETWORK_TRANSPORT", "SOURCE_CODE", "SUPPLY_CHAIN", "INFRASTRUCTURE"],
  },
  {
    id: "ENTERPRISE",
    name: "Enterprise",
    description: "Every assessment module. Recommended for enterprise customers.",
    moduleIds: [
      "NETWORK_TRANSPORT", "SOURCE_CODE", "SUPPLY_CHAIN",
      "INFRASTRUCTURE", "SECRETS", "HOST_COMPLIANCE",
    ],
    recommended: true,
  },
  {
    id: "CONTINUOUS",
    name: "Continuous",
    description: "Scheduled execution of configured modules on a recurring cadence.",
    moduleIds: [],
  },
];

/** Resolve scanner definitions for a given assessment module */
export function getAssessmentScanners(moduleId: string) {
  const module = ASSESSMENT_MODULES.find(m => m.id === moduleId);
  if (!module) return [];
  return module.scannerTypes
    .map(st => SCANNER_REGISTRY.find(s => s.sensorType === st))
    .filter(Boolean);
}

/** Resolve all scanner types for a profile (union of all module scanners, ordered) */
export function getProfileScannerTypes(profileId: string): string[] {
  const profile = ASSESSMENT_PROFILES.find(p => p.id === profileId);
  if (!profile) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const moduleId of profile.moduleIds) {
    const mod = ASSESSMENT_MODULES.find(m => m.id === moduleId);
    if (!mod) continue;
    for (const st of mod.scannerTypes) {
      if (!seen.has(st)) { seen.add(st); result.push(st); }
    }
  }
  return result;
}
