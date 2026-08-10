/**
 * Semgrep engine — runs the `semgrep` binary if available on PATH,
 * parses its JSON output, and returns SemgrepOutput compatible with
 * the existing semgrep adapter. Falls back to null if not installed.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import type { SemgrepOutput } from "@/lib/sensors/adapters/semgrep.adapter";
import { resolveBinary } from "./resolve-binary";

const execFileAsync = promisify(execFile);
const BIN = resolveBinary("semgrep");

const SEMGREP_RULES = [
  // Built-in registry packs most relevant for crypto
  "p/cryptography",
  "p/owasp-top-ten",
  "p/secrets",
];

export async function isSemgrepAvailable(): Promise<boolean> {
  try {
    await execFileAsync(BIN, ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function runSemgrep(repoDir: string): Promise<SemgrepOutput | null> {
  const available = await isSemgrepAvailable();
  if (!available) return null;

  const args = [
    "--json",
    "--quiet",
    "--no-git-ignore",
    "--timeout", "60",
    "--max-memory", "512",
    "--jobs", "2",
    ...SEMGREP_RULES.flatMap(r => ["--config", r]),
    repoDir,
  ];

  try {
    const { stdout } = await execFileAsync(BIN, args, {
      timeout: 120_000,
      maxBuffer: 50 * 1024 * 1024,
    });

    const raw = JSON.parse(stdout);

    // Semgrep JSON output has { results: [], errors: [], ... }
    // Map to the shape our adapter expects
    return {
      results: (raw.results ?? []).map((r: Record<string, unknown>) => ({
        check_id: r.check_id,
        path: r.path,
        start: (r.start as { line?: number } | undefined) ?? {},
        extra: {
          message: (r.extra as { message?: string } | undefined)?.message,
          metadata: (r.extra as { metadata?: Record<string, unknown> } | undefined)?.metadata ?? {},
        },
      })),
      errors: raw.errors ?? [],
    };
  } catch (err) {
    // Parse errors or timeout — return empty result rather than crashing
    console.warn("[SemgrepEngine] scan failed:", err instanceof Error ? err.message : err);
    return { results: [], errors: [] };
  }
}
