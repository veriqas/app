/**
 * Scanner health service — checks availability and version for every registered engine.
 * Used by the Environment Health page and assessment pre-validation.
 */

import { ENGINE_REGISTRY } from "./engine-registry";

export type HealthStatus = "available" | "missing" | "agent_required" | "error";

export interface ScannerHealth {
  sensorType:        string;
  displayName:       string;
  status:            HealthStatus;
  version:           string | null;
  requiresAgent:     boolean;
  requiresClone:     boolean;
  platformSupport:   string[];
  installInstructions: {
    linux?:   string;
    mac?:     string;
    windows?: string;
    pip?:     string;
    docker?:  string;
    url?:     string;
  };
  checkedAt: Date;
}

export interface EnvironmentHealth {
  scanners:      ScannerHealth[];
  totalCount:    number;
  availableCount: number;
  missingCount:  number;
  agentCount:    number;
  checkedAt:     Date;
}

export async function checkScannerHealth(): Promise<EnvironmentHealth> {
  const checkedAt = new Date();

  const results = await Promise.allSettled(
    Array.from(ENGINE_REGISTRY.entries()).map(async ([sensorType, engine]) => {
      let status: HealthStatus;
      let version: string | null = null;

      if (engine.requiresAgent) {
        status = "agent_required";
      } else {
        try {
          const available = await engine.isAvailable();
          if (available) {
            status = "available";
            version = await engine.getVersion().catch(() => null);
          } else {
            status = "missing";
          }
        } catch {
          status = "error";
        }
      }

      return {
        sensorType,
        displayName: engine.sensorType,
        status,
        version,
        requiresAgent:   engine.requiresAgent,
        requiresClone:   engine.requiresClone,
        platformSupport: engine.platformSupport,
        installInstructions: engine.installInstructions,
        checkedAt,
      } satisfies ScannerHealth;
    })
  );

  const scanners: ScannerHealth[] = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const sensorType = Array.from(ENGINE_REGISTRY.keys())[i];
    const engine = ENGINE_REGISTRY.get(sensorType)!;
    return {
      sensorType,
      displayName: sensorType,
      status: "error" as HealthStatus,
      version: null,
      requiresAgent:   engine.requiresAgent,
      requiresClone:   engine.requiresClone,
      platformSupport: engine.platformSupport,
      installInstructions: engine.installInstructions,
      checkedAt,
    };
  });

  return {
    scanners,
    totalCount:     scanners.length,
    availableCount: scanners.filter(s => s.status === "available").length,
    missingCount:   scanners.filter(s => s.status === "missing").length,
    agentCount:     scanners.filter(s => s.status === "agent_required").length,
    checkedAt,
  };
}

/**
 * Check which scanners in a given assessment module are available.
 * Used for pre-validation before launching an assessment.
 */
export async function checkAssessmentCoverage(sensorTypes: string[]): Promise<{
  available:    string[];
  missing:      string[];
  agentRequired: string[];
  coveragePercent: number;
}> {
  const checks = await Promise.all(
    sensorTypes.map(async st => {
      const engine = ENGINE_REGISTRY.get(st);
      if (!engine) return { sensorType: st, status: "missing" as HealthStatus };
      if (engine.requiresAgent) return { sensorType: st, status: "agent_required" as HealthStatus };
      const ok = await engine.isAvailable().catch(() => false);
      return { sensorType: st, status: ok ? ("available" as HealthStatus) : ("missing" as HealthStatus) };
    })
  );

  const available     = checks.filter(c => c.status === "available").map(c => c.sensorType);
  const missing       = checks.filter(c => c.status === "missing").map(c => c.sensorType);
  const agentRequired = checks.filter(c => c.status === "agent_required").map(c => c.sensorType);
  const coveragePercent = sensorTypes.length > 0
    ? Math.round((available.length / sensorTypes.length) * 100)
    : 0;

  return { available, missing, agentRequired, coveragePercent };
}
