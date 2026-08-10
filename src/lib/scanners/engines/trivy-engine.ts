/**
 * Trivy engine — https://github.com/aquasecurity/trivy
 * Runs trivy against a container image OR a filesystem directory.
 * Returns raw Trivy JSON for the trivy adapter to normalise.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { resolveBinary } from "./resolve-binary";

const execFileAsync = promisify(execFile);
const BIN = resolveBinary("trivy");

export async function isTrivyAvailable(): Promise<boolean> {
  try {
    await execFileAsync(BIN, ["--version"], { timeout: 8_000 });
    return true;
  } catch {
    return false;
  }
}

/** Scan a filesystem directory (e.g. a cloned git repo) */
export async function runTrivyFs(dir: string): Promise<unknown> {
  const { stdout } = await execFileAsync(
    BIN,
    [
      "fs",
      "--format", "json",
      "--scanners", "vuln,secret,license",
      "--quiet",
      dir,
    ],
    { timeout: 300_000, maxBuffer: 200 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}

/** Scan a container image by tag */
export async function runTrivyImage(imageTag: string): Promise<unknown> {
  const { stdout } = await execFileAsync(
    BIN,
    [
      "image",
      "--format", "json",
      "--scanners", "vuln,secret,license",
      "--quiet",
      imageTag,
    ],
    { timeout: 600_000, maxBuffer: 200 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}

/** Produce a CycloneDX SBOM from a filesystem directory */
export async function runTrivySbom(dir: string): Promise<unknown> {
  const { stdout } = await execFileAsync(
    BIN,
    [
      "fs",
      "--format", "cyclonedx",
      "--quiet",
      dir,
    ],
    { timeout: 300_000, maxBuffer: 200 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}
