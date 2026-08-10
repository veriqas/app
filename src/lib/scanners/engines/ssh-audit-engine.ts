/**
 * ssh-audit engine — shells out to the `ssh-audit` Python binary.
 * Produces output compatible with the existing ssh-audit adapter.
 * Falls back to null if ssh-audit is not installed.
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

async function sshAuditCmd(args: string[]): Promise<{ stdout: string }> {
  try {
    return await execFileAsync("ssh-audit", args, { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return execFileAsync("python", ["-m", "ssh_audit", ...args], {
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
      });
    }
    throw e;
  }
}

export async function isSshAuditAvailable(): Promise<boolean> {
  // ssh-audit has no --version flag; use -h which exits 0
  for (const cmd of [
    ["ssh-audit", ["-h"]],
    ["python", ["-m", "ssh_audit", "-h"]],
    ["python3", ["-m", "ssh_audit", "-h"]],
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

export async function runSshAudit(targets: string[]): Promise<unknown[] | null> {
  if (!(await isSshAuditAvailable())) return null;

  const results: unknown[] = [];

  for (const target of targets) {
    // Parse host and optional port
    const match = target.match(/^(.+?)(?::(\d+))?$/);
    const host = match?.[1] ?? target;
    const port = match?.[2] ?? "22";

    try {
      // ssh-audit --json outputs a JSON object per target
      const { stdout } = await sshAuditCmd(["--json", "-p", port, host]);
      const parsed = JSON.parse(stdout);
      // Normalise: ssh-audit output may be object or array
      if (Array.isArray(parsed)) {
        results.push(...parsed);
      } else {
        results.push({ target: host, port: parseInt(port), ...parsed });
      }
    } catch (err) {
      console.warn(`[SshAuditEngine] failed for ${target}:`, err instanceof Error ? err.message : err);
    }
  }

  return results.length > 0 ? results : null;
}
