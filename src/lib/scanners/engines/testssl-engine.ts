/**
 * testssl.sh engine — https://github.com/drwetter/testssl.sh
 * Comprehensive TLS/SSL testing. Deeper than SSLyze — tests cipher order,
 * vulnerability checks (BEAST, POODLE, DROWN, ROBOT, etc.), HSTS, HPKP,
 * certificate transparency, and session resumption.
 * Installed at /opt/testssl/testssl.sh in the Docker image.
 * Returns raw testssl JSON array for the testssl adapter to normalise.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execFileAsync = promisify(execFile);

const TESTSSL_BIN = process.env.TESTSSL_PATH ?? "/opt/testssl/testssl.sh";

export async function isTestsslAvailable(): Promise<boolean> {
  try {
    await execFileAsync("bash", [TESTSSL_BIN, "--version"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run testssl.sh against a single endpoint (host:port or https://host).
 * Writes JSON output to a temp file and returns the parsed array.
 */
export async function runTestssl(endpoint: string): Promise<unknown> {
  const tmpDir = await mkdtemp(join(tmpdir(), "testssl-"));
  const outFile = join(tmpDir, "result.json");

  try {
    await execFileAsync(
      "bash",
      [
        TESTSSL_BIN,
        "--jsonfile", outFile,
        "--quiet",
        "--color", "0",
        "--nodns", "min",
        "--warnings", "off",
        endpoint,
      ],
      { timeout: 300_000, maxBuffer: 50 * 1024 * 1024 }
    );

    const raw = await readFile(outFile, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    // testssl exits non-zero on partial failures (e.g. some checks timed out)
    // but still writes the JSON — try to read whatever it produced
    try {
      const raw = await readFile(outFile, "utf-8");
      if (raw.trim().length > 2) return JSON.parse(raw);
    } catch {
      // fall through to rethrow original
    }
    throw new Error(`testssl.sh failed for ${endpoint}: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
