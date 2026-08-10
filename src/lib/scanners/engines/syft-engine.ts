/**
 * Syft engine — https://github.com/anchore/syft
 * Generates a Software Bill of Materials (SBOM) in CycloneDX JSON format.
 * Works on git repos, container images, and filesystem paths.
 * Returns raw CycloneDX JSON for the syft adapter to normalise.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { resolveBinary } from "./resolve-binary";

const execFileAsync = promisify(execFile);
const BIN = resolveBinary("syft");

export async function isSyftAvailable(): Promise<boolean> {
  try {
    await execFileAsync(BIN, ["version"], { timeout: 8_000 });
    return true;
  } catch {
    return false;
  }
}

/** Generate CycloneDX SBOM from a filesystem directory */
export async function runSyftFs(dir: string): Promise<unknown> {
  const { stdout } = await execFileAsync(
    BIN,
    ["scan", dir, "--output", "cyclonedx-json", "--quiet"],
    { timeout: 300_000, maxBuffer: 200 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}

/** Generate CycloneDX SBOM from a container image */
export async function runSyftImage(imageTag: string): Promise<unknown> {
  const { stdout } = await execFileAsync(
    BIN,
    ["scan", `docker:${imageTag}`, "--output", "cyclonedx-json", "--quiet"],
    { timeout: 600_000, maxBuffer: 200 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}
