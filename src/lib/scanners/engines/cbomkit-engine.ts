/**
 * CBOMkit engine — runs the `cbomkit` wrapper script (java -jar cbomkit.jar).
 * Bundled in the SENQOR Docker image; requires Java 17+ and cbomkit.jar on the host.
 * Returns the raw CycloneDX JSON object for the cbomkit adapter to normalize.
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function isCbomkitAvailable(): Promise<boolean> {
  try {
    await execFileAsync("cbomkit", ["--version"], { timeout: 8000 });
    return true;
  } catch {
    try {
      await execFileAsync("java", ["-jar", "/usr/local/bin/cbomkit.jar", "--version"], { timeout: 8000 });
      return true;
    } catch {
      return false;
    }
  }
}

export async function runCbomkit(repoDir: string): Promise<unknown> {
  try {
    const { stdout } = await execFileAsync("cbomkit", ["scan", "--format", "cyclonedx-json", repoDir], {
      timeout: 180_000,
      maxBuffer: 100 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // CBOMkit exits non-zero when no findings — return empty CBOM doc
    if (msg.includes("No cryptographic") || (err as NodeJS.ErrnoException).code === "1") {
      return { bomFormat: "CycloneDX", components: [] };
    }
    throw new Error(`CBOMkit scan failed: ${msg}`);
  }
}
