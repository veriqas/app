/**
 * SENQOR Sensor Adapter Framework
 * Public API — import from here, not from individual files.
 */

// Types
export type { SenqorObservation, ScanContext } from "./types/observation";
export type { SensorAdapter, AdapterRegistry } from "./types/sensor";
export type { CorrelationGroup } from "./normalizer/correlator";
export type { WriteResult } from "./ingest/observation-writer";
export type { ConfidenceConfig } from "./normalizer/confidence-model";
export type { NormalizedCrypto } from "./normalizer/crypto-normalizer";
export type { CanonicalAlgorithm } from "./normalizer/algorithm-registry";

// Adapters — original
export { cryptoScanAdapter } from "./adapters/cryptoscan.adapter";
export { cryptoDepsAdapter } from "./adapters/cryptodeps.adapter";
export { sslyzeAdapter }     from "./adapters/sslyze.adapter";
export { sshAuditAdapter }   from "./adapters/ssh-audit.adapter";
export { zeekAdapter }       from "./adapters/zeek.adapter";
export { zgrab2Adapter }     from "./adapters/zgrab2.adapter";
export { cbomkitAdapter }    from "./adapters/cbomkit.adapter";
export { semgrepAdapter }    from "./adapters/semgrep.adapter";

// Adapters — Priority 1 extensions
export { trivyAdapter }      from "./adapters/trivy.adapter";
export { syftAdapter }       from "./adapters/syft.adapter";
export { grypeAdapter }      from "./adapters/grype.adapter";
export { testsslAdapter }    from "./adapters/testssl.adapter";
export { nmapAdapter }       from "./adapters/nmap.adapter";

// Adapters — Priority 2 extensions
export { gitleaksAdapter }   from "./adapters/gitleaks.adapter";
export { checkovAdapter }    from "./adapters/checkov.adapter";
export { kubeBenchAdapter }  from "./adapters/kube-bench.adapter";
export { kubeHunterAdapter } from "./adapters/kube-hunter.adapter";
export { osqueryAdapter }    from "./adapters/osquery.adapter";
export { openscapAdapter }   from "./adapters/openscap.adapter";

// Normalizers
export { normalizeCrypto, inferFromCipherSuite, canonicalizeTlsVersion } from "./normalizer/crypto-normalizer";
export { lookupAlgorithm, allAlgorithms }                                 from "./normalizer/algorithm-registry";
export { computeConfidence, explainConfidence, DEFAULT_CONFIDENCE_CONFIG } from "./normalizer/confidence-model";
export { correlate, formatEvidenceSummary }                               from "./normalizer/correlator";

// Ingest
export { writeObservations } from "./ingest/observation-writer";

// Scope enforcement
export { checkScanScope } from "./scan-scope";

// ── Adapter registry ───────────────────────────────────────────────────────────

import type { AdapterRegistry, SensorAdapter } from "./types/sensor";
import { cryptoScanAdapter } from "./adapters/cryptoscan.adapter";
import { cryptoDepsAdapter } from "./adapters/cryptodeps.adapter";
import { sslyzeAdapter }     from "./adapters/sslyze.adapter";
import { sshAuditAdapter }   from "./adapters/ssh-audit.adapter";
import { zeekAdapter }       from "./adapters/zeek.adapter";
import { zgrab2Adapter }     from "./adapters/zgrab2.adapter";
import { cbomkitAdapter }    from "./adapters/cbomkit.adapter";
import { semgrepAdapter }    from "./adapters/semgrep.adapter";
import { trivyAdapter }      from "./adapters/trivy.adapter";
import { syftAdapter }       from "./adapters/syft.adapter";
import { grypeAdapter }      from "./adapters/grype.adapter";
import { testsslAdapter }    from "./adapters/testssl.adapter";
import { nmapAdapter }       from "./adapters/nmap.adapter";
import { gitleaksAdapter }   from "./adapters/gitleaks.adapter";
import { checkovAdapter }    from "./adapters/checkov.adapter";
import { kubeBenchAdapter }  from "./adapters/kube-bench.adapter";
import { kubeHunterAdapter } from "./adapters/kube-hunter.adapter";
import { osqueryAdapter }    from "./adapters/osquery.adapter";
import { openscapAdapter }   from "./adapters/openscap.adapter";

export const ADAPTER_REGISTRY: Map<string, SensorAdapter<unknown>> = new Map(
  [
    // Original adapters (unchanged)
    [cryptoScanAdapter.sensorType, cryptoScanAdapter as SensorAdapter<unknown>],
    // AST source scanner reuses the CryptoScan adapter (identical output shape).
    ["CRYPTOSCAN_AST", cryptoScanAdapter as SensorAdapter<unknown>],
    ["CRYPTOSCAN_AST_PY", cryptoScanAdapter as SensorAdapter<unknown>],
    ["CRYPTOSCAN_AST_JAVA", cryptoScanAdapter as SensorAdapter<unknown>],
    [cryptoDepsAdapter.sensorType, cryptoDepsAdapter as SensorAdapter<unknown>],
    [sslyzeAdapter.sensorType,     sslyzeAdapter     as SensorAdapter<unknown>],
    [sshAuditAdapter.sensorType,   sshAuditAdapter   as SensorAdapter<unknown>],
    [zeekAdapter.sensorType,       zeekAdapter       as SensorAdapter<unknown>],
    [zgrab2Adapter.sensorType,     zgrab2Adapter     as SensorAdapter<unknown>],
    [cbomkitAdapter.sensorType,    cbomkitAdapter    as SensorAdapter<unknown>],
    [semgrepAdapter.sensorType,    semgrepAdapter    as SensorAdapter<unknown>],
    // Priority 1 extensions
    [trivyAdapter.sensorType,      trivyAdapter      as SensorAdapter<unknown>],
    [syftAdapter.sensorType,       syftAdapter       as SensorAdapter<unknown>],
    [grypeAdapter.sensorType,      grypeAdapter      as SensorAdapter<unknown>],
    [testsslAdapter.sensorType,    testsslAdapter    as SensorAdapter<unknown>],
    [nmapAdapter.sensorType,       nmapAdapter       as SensorAdapter<unknown>],
    // Priority 2 extensions
    [gitleaksAdapter.sensorType,   gitleaksAdapter   as SensorAdapter<unknown>],
    [checkovAdapter.sensorType,    checkovAdapter    as SensorAdapter<unknown>],
    [kubeBenchAdapter.sensorType,  kubeBenchAdapter  as SensorAdapter<unknown>],
    [kubeHunterAdapter.sensorType, kubeHunterAdapter as SensorAdapter<unknown>],
    [osqueryAdapter.sensorType,    osqueryAdapter    as SensorAdapter<unknown>],
    [openscapAdapter.sensorType,   openscapAdapter   as SensorAdapter<unknown>],
  ]
);

/**
 * Process raw scanner output end-to-end:
 * validate → normalize → correlate → return observations.
 * Does NOT write to the DB — call writeObservations() separately.
 */
export function processScanOutput(
  sensorType: string,
  rawOutput: unknown,
  ctx: import("./types/observation").ScanContext
): import("./types/observation").SenqorObservation[] {
  const adapter = ADAPTER_REGISTRY.get(sensorType);
  if (!adapter) {
    console.warn(`[SensorFramework] No adapter registered for sensorType: ${sensorType}`);
    return [];
  }
  if (adapter.validate && !adapter.validate(rawOutput)) {
    console.warn(`[SensorFramework] Input validation failed for ${sensorType}`);
    return [];
  }
  return adapter.normalize(rawOutput as never, ctx);
}
