/**
 * SSLyze engine — shells out to the `sslyze` Python binary.
 * Produces output compatible with the existing sslyze adapter.
 * Falls back to null if sslyze is not installed.
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function isSslyzeAvailable(): Promise<boolean> {
  // sslyze has no --version flag; use -h which exits 0
  for (const cmd of [
    ["sslyze", ["-h"]],
    ["python", ["-m", "sslyze", "-h"]],
    ["python3", ["-m", "sslyze", "-h"]],
  ] as [string, string[]][]) {
    try {
      await execFileAsync(cmd[0], cmd[1], { timeout: 8000 });
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") continue;
    }
  }
  return false;
}

async function sslyzeCmd(args: string[]): Promise<{ stdout: string; stderr: string }> {
  // Try direct binary first, then python -m
  try {
    return await execFileAsync("sslyze", args, { timeout: 120_000, maxBuffer: 20 * 1024 * 1024 });
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return execFileAsync("python", ["-m", "sslyze", ...args], {
        timeout: 120_000,
        maxBuffer: 20 * 1024 * 1024,
      });
    }
    throw e;
  }
}

export async function runSslyze(targets: string[]): Promise<unknown | null> {
  if (!(await isSslyzeAvailable())) return null;

  // sslyze accepts host:port or just host (defaults port 443)
  const args = ["--json_out", "-", ...targets];

  try {
    const { stdout } = await sslyzeCmd(args);
    const raw = JSON.parse(stdout);

    // SSLyze JSON format: { server_scan_results: [...], ... }
    // Our adapter expects { server_scan_results: [...] }
    return raw;
  } catch (err) {
    console.warn("[SslyzeEngine] scan failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
