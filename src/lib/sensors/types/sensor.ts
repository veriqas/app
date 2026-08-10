/**
 * SensorAdapter — the interface every scanner adapter must implement.
 * Generic over TRawInput (the scanner's native output shape).
 * Adapters are pure functions: no DB access, no side effects.
 */

import type { SenqorObservation, ScanContext } from "./observation";

export interface SensorAdapter<TRawInput = unknown> {
  /** Stable identifier, matches Sensor.sensorType in the DB */
  readonly sensorType: string;

  /** Human-readable name */
  readonly displayName: string;

  /** EvidenceSource this adapter always produces */
  readonly evidenceSource: import("@prisma/client").EvidenceSource;

  /**
   * Normalize raw scanner output into SENQOR observations.
   * Must not throw — return an empty array and log on parse failure.
   */
  normalize(raw: TRawInput, ctx: ScanContext): SenqorObservation[];

  /**
   * Optional: validate that raw input looks like this scanner's output.
   * Used to guard against accidentally feeding the wrong format.
   */
  validate?(raw: unknown): raw is TRawInput;
}

/** Registry of all registered adapters, keyed by sensorType */
export type AdapterRegistry = Map<string, SensorAdapter<unknown>>;
