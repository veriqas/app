/**
 * Grype engine — https://github.com/anchore/grype
 * Vulnerability scanner for container images, filesystems, and SBOMs.
 * Identifies CVEs in cryptographic libraries (OpenSSL, GnuTLS, NSS, etc.)
 * Returns raw Grype JSON for the grype adapter to normalise.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { resolveBinary } from "./resolve-binary";

const execFileAsync = promisify(execFile);
const BIN = resolveBinary("grype");

export async function isGrypeAvailable(): Promise<boolean> {
  try {
    await execFileAsync(BIN, ["version"], { timeout: 8_000 });
    return true;
  } catch {
    return false;
  }
}

/** Scan a filesystem directory for vulnerabilities */
export async function runGrypeFs(dir: string): Promise<unknown> {
  const { stdout } = await execFileAsync(
    BIN,
    ["dir:" + dir, "--output", "json", "--quiet"],
    { timeout: 300_000, maxBuffer: 200 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}

/** Scan a container image for vulnerabilities */
export async function runGrypeImage(imageTag: string): Promise<unknown> {
  const { stdout } = await execFileAsync(
    BIN,
    [imageTag, "--output", "json", "--quiet"],
    { timeout: 600_000, maxBuffer: 200 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}

/** Scan from an existing SBOM file (CycloneDX or Syft format) */
export async function runGrypeSbom(sbomPath: string): Promise<unknown> {
  const { stdout } = await execFileAsync(
    BIN,
    ["sbom:" + sbomPath, "--output", "json", "--quiet"],
    { timeout: 120_000, maxBuffer: 200 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}
